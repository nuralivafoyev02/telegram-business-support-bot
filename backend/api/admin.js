'use strict';

const supabase = require('../lib/supabase');
const { allowCors, sendJson, readBody, getQuery } = require('../lib/http');
const { login, requireAdmin, hashPassword } = require('../lib/auth');
const { sendMessage, sendBusinessMessage, getWebhookInfo, setWebhook } = require('../lib/telegram');
const { optionalEnv } = require('../lib/env');
const { normalizeSettings, clearBotSettingsCache } = require('../lib/bot-settings');
const { normalizeAiIntegration, mergeAiIntegration, sanitizeAiIntegration, isAiIntegrationReady, aiIntegrationSignature } = require('../lib/ai-config');
const { extractTextFromUpload } = require('../lib/document-text');
const { resolveMainStatsChatId, sendMainStatsReport } = require('../lib/report');
const stats = require('../lib/stats');

const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'business_message',
  'edited_business_message',
  'business_connection',
  'my_chat_member',
  'chat_member',
  'callback_query'
];

function parseIntSafe(value, fallback = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function limitQuery(query, fallback = 100) {
  const limit = Math.min(parseIntSafe(query.limit, fallback), 500);
  return String(limit);
}

function nowIso() {
  return new Date().toISOString();
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percent(part, total) {
  return total ? round((Number(part || 0) / Number(total || 0)) * 100, 1) : 0;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff / 60000 : null;
}

function average(values) {
  const clean = values.filter(value => Number.isFinite(value));
  if (!clean.length) return 0;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length, 1);
}

function tashkentDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function tashkentDateKey(value = new Date()) {
  const parts = tashkentDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentPeriodKeys(now = new Date()) {
  const today = tashkentDateKey(now);
  const { year, month, day } = tashkentDateParts(now);
  const localMidday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  const weekday = localMidday.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  localMidday.setUTCDate(localMidday.getUTCDate() - daysSinceMonday);
  const weekStart = tashkentDateKey(localMidday);

  return {
    today,
    weekStart,
    month: `${year}-${month}`
  };
}

function inCurrentPeriod(value, periodKey, keys) {
  if (periodKey === 'all') return true;
  if (!value) return false;
  const dateKey = tashkentDateKey(value);
  if (periodKey === 'today') return dateKey === keys.today;
  if (periodKey === 'week') return dateKey >= keys.weekStart && dateKey <= keys.today;
  if (periodKey === 'month') return dateKey.startsWith(keys.month);
  return false;
}

function emptyPeriod(periodKey, label) {
  return {
    period: periodKey,
    label,
    total_requests: 0,
    open_requests: 0,
    closed_requests: 0,
    close_rate: 0,
    avg_close_minutes: 0,
    group_requests: 0,
    private_requests: 0,
    business_requests: 0,
    unique_customers: 0
  };
}

function buildPeriodSummary(requests, periodKey, label, keys) {
  const created = requests.filter(request => inCurrentPeriod(request.created_at, periodKey, keys));
  const closed = created.filter(request => request.status === 'closed');
  const closeMinutes = closed.map(request => minutesBetween(request.created_at, request.closed_at)).filter(value => value !== null);
  return {
    ...emptyPeriod(periodKey, label),
    total_requests: created.length,
    open_requests: created.filter(request => request.status === 'open').length,
    closed_requests: closed.length,
    close_rate: percent(closed.length, created.length),
    avg_close_minutes: average(closeMinutes),
    group_requests: created.filter(request => request.source_type === 'group').length,
    private_requests: created.filter(request => request.source_type === 'private').length,
    business_requests: created.filter(request => request.source_type === 'business').length,
    unique_customers: new Set(created.map(request => request.customer_tg_id).filter(Boolean)).size
  };
}

function buildEmployeePerformance({ requests, employees, periodKey, keys }) {
  const employeeMap = new Map(employees.map(employee => [employee.id, employee]));
  const closed = requests.filter(request => request.status === 'closed' && request.closed_by_employee_id && inCurrentPeriod(request.closed_at, periodKey, keys));
  const totals = new Map();

  closed.forEach(request => {
    const current = totals.get(request.closed_by_employee_id) || {
      employee_id: request.closed_by_employee_id,
      full_name: request.closed_by_name || 'Xodim',
      username: '',
      role: '',
      closed_requests: 0,
      handled_chats: new Set(),
      close_minutes: [],
      last_closed_at: null
    };
    const employee = employeeMap.get(request.closed_by_employee_id);
    if (employee) {
      current.full_name = employee.full_name || current.full_name;
      current.username = employee.username || '';
      current.role = employee.role || '';
      current.tg_user_id = employee.tg_user_id || null;
    }
    current.closed_requests += 1;
    if (request.chat_id) current.handled_chats.add(String(request.chat_id));
    const closeMinute = minutesBetween(request.created_at, request.closed_at);
    if (closeMinute !== null) current.close_minutes.push(closeMinute);
    if (!current.last_closed_at || String(request.closed_at || '') > String(current.last_closed_at || '')) current.last_closed_at = request.closed_at || null;
    totals.set(request.closed_by_employee_id, current);
  });

  return [...totals.values()]
    .map(row => ({
      employee_id: row.employee_id,
      tg_user_id: row.tg_user_id || null,
      full_name: row.full_name,
      username: row.username,
      role: row.role,
      closed_requests: row.closed_requests,
      handled_chats: row.handled_chats.size,
      close_share_pct: percent(row.closed_requests, closed.length),
      avg_close_minutes: average(row.close_minutes),
      last_closed_at: row.last_closed_at
    }))
    .sort((a, b) => b.closed_requests - a.closed_requests || a.full_name.localeCompare(b.full_name))
    .slice(0, 20);
}

function buildGroupPerformance({ requests, chats, periodKey, keys }) {
  const chatMap = new Map(chats.map(chat => [String(chat.chat_id), chat]));
  const groupRequests = requests.filter(request => request.source_type === 'group' && inCurrentPeriod(request.created_at, periodKey, keys));
  const totals = new Map();

  groupRequests.forEach(request => {
    const key = String(request.chat_id);
    const chat = chatMap.get(key) || {};
    const current = totals.get(key) || {
      chat_id: request.chat_id,
      title: chat.title || key,
      company_name: chat.company_name || null,
      total_requests: 0,
      open_requests: 0,
      closed_requests: 0,
      customers: new Set(),
      last_request_at: null
    };
    current.total_requests += 1;
    if (request.status === 'open') current.open_requests += 1;
    if (request.status === 'closed') current.closed_requests += 1;
    if (request.customer_tg_id) current.customers.add(String(request.customer_tg_id));
    if (!current.last_request_at || String(request.created_at || '') > String(current.last_request_at || '')) current.last_request_at = request.created_at || null;
    totals.set(key, current);
  });

  return [...totals.values()]
    .map(row => ({
      chat_id: row.chat_id,
      title: row.title,
      company_name: row.company_name,
      total_requests: row.total_requests,
      open_requests: row.open_requests,
      closed_requests: row.closed_requests,
      close_rate: percent(row.closed_requests, row.total_requests),
      unique_customers: row.customers.size,
      last_request_at: row.last_request_at
    }))
    .sort((a, b) => b.total_requests - a.total_requests || b.close_rate - a.close_rate)
    .slice(0, 30);
}

function buildDashboardAnalytics({ requests, chats, employees }) {
  const keys = currentPeriodKeys();
  const periods = [
    ['today', 'Bugun'],
    ['week', 'Hafta'],
    ['month', 'Oy'],
    ['all', 'Jami']
  ];

  return {
    periods: Object.fromEntries(periods.map(([key, label]) => [key, buildPeriodSummary(requests, key, label, keys)])),
    employeePerformance: Object.fromEntries(periods.map(([key]) => [key, buildEmployeePerformance({ requests, employees, periodKey: key, keys })])),
    groupPerformance: Object.fromEntries(periods.map(([key]) => [key, buildGroupPerformance({ requests, chats, periodKey: key, keys })])),
    generated_at: new Date().toISOString()
  };
}

async function getDashboardAnalytics() {
  const [requests, chats, employees] = await Promise.all([
    supabase.select('support_requests', {
      select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,status,closed_by_employee_id,closed_by_name,created_at,closed_at',
      order: supabase.order('created_at', false),
      limit: '10000'
    }).catch(() => []),
    stats.selectChatStatistics({ select: '*', source_type: 'eq.group', is_active: 'eq.true', limit: '1000' }).catch(() => []),
    supabase.select('employees', { select: 'id,tg_user_id,full_name,username,role,is_active', limit: '1000' }).catch(() => [])
  ]);

  return buildDashboardAnalytics({ requests, chats, employees });
}

function normalizeTelegramId(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) throw new Error('Telegram ID faqat raqam bo‘lishi kerak');
  return Number(text);
}

function telegramIdKey(value) {
  return value === undefined || value === null || value === '' ? '' : String(value);
}

function isPrivateLikeChat(row = {}) {
  return ['private', 'business'].includes(row.source_type);
}

function latestBy(rows, field) {
  return rows
    .map(row => row && row[field])
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

async function getEmployeeLookup() {
  const employees = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,is_active',
    limit: '5000'
  }).catch(() => []);
  return {
    employees,
    byId: new Map(employees.map(employee => [employee.id, employee]).filter(([id]) => id)),
    byTgId: new Map(employees.map(employee => [telegramIdKey(employee.tg_user_id), employee]).filter(([id]) => id)),
    tgIds: new Set(employees.map(employee => telegramIdKey(employee.tg_user_id)).filter(Boolean))
  };
}

function excludeEmployeeChats(rows = [], employeeTgIds = new Set()) {
  if (!employeeTgIds.size) return rows;
  return rows.filter(row => !(isPrivateLikeChat(row) && employeeTgIds.has(telegramIdKey(row.chat_id))));
}

function displayChatTitle(chat = {}) {
  return chat.title || chat.username || telegramIdKey(chat.chat_id) || 'Chat';
}

function eventRank(type) {
  if (type === 'opened') return 1;
  if (type === 'note') return 2;
  if (type === 'closed') return 3;
  return 4;
}

function buildChatDetail({ chat, requests, events, messages, employeesById, employeesByTgId }) {
  const requestEvents = new Map();
  events.forEach(event => {
    if (!event.request_id) return;
    const list = requestEvents.get(event.request_id) || [];
    list.push(event);
    requestEvents.set(event.request_id, list);
  });

  const messageById = new Map(messages.map(message => [telegramIdKey(message.tg_message_id), message]).filter(([id]) => id));
  const requestById = new Map(requests.map(request => [request.id, request]));
  const enrichedRequests = requests.map(request => {
    const relatedEvents = [...(requestEvents.get(request.id) || [])].sort((a, b) => {
      const timeDiff = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return timeDiff || eventRank(a.event_type) - eventRank(b.event_type);
    });
    const closeEvent = relatedEvents.filter(event => event.event_type === 'closed').at(-1) || null;
    const doneMessage = request.done_message_id ? messageById.get(telegramIdKey(request.done_message_id)) : null;
    const closer = closeEvent && closeEvent.employee_id ? employeesById.get(closeEvent.employee_id) : null;
    return {
      ...request,
      events: relatedEvents,
      solution_text: (closeEvent && closeEvent.text) || (doneMessage && doneMessage.text) || '',
      solution_by: (closer && closer.full_name) || (closeEvent && closeEvent.actor_name) || request.closed_by_name || '',
      solution_at: (closeEvent && closeEvent.created_at) || request.closed_at || null
    };
  });

  const closeMessageIds = new Set(enrichedRequests.map(request => telegramIdKey(request.done_message_id)).filter(Boolean));
  const eventMessageIds = new Set(events.map(event => telegramIdKey(event.tg_message_id)).filter(Boolean));
  const requestTimeline = enrichedRequests.map(request => ({
    type: 'ticket',
    request_id: request.id,
    actor_name: request.customer_name || 'Mijoz',
    actor_username: request.customer_username || '',
    text: request.initial_text || '',
    request_text: request.initial_text || '',
    status: request.status,
    created_at: request.created_at
  }));

  const eventTimeline = events
    .filter(event => ['note', 'closed', 'done_without_request'].includes(event.event_type))
    .map(event => {
      const request = event.request_id ? requestById.get(event.request_id) : null;
      const employee = event.employee_id ? employeesById.get(event.employee_id) : null;
      return {
        type: event.event_type === 'closed' ? 'solution' : event.event_type,
        request_id: event.request_id || null,
        message_id: event.tg_message_id || null,
        actor_name: (employee && employee.full_name) || event.actor_name || 'Xodim',
        actor_username: employee && employee.username || '',
        employee_id: event.employee_id || (employee && employee.id) || null,
        text: event.text || '',
        request_text: request ? request.initial_text || '' : '',
        created_at: event.created_at
      };
    });

  const replyTimeline = messages
    .filter(message => {
      const employee = message.employee_id ? employeesById.get(message.employee_id) : employeesByTgId.get(telegramIdKey(message.from_tg_user_id));
      const rawSource = message.raw && message.raw.source;
      const alreadyRepresentedByEvent = eventMessageIds.has(telegramIdKey(message.tg_message_id));
      if (alreadyRepresentedByEvent && rawSource !== 'admin_send') return false;
      return rawSource === 'admin_send'
        || !!employee
        || ['employee_message', 'admin_reply'].includes(message.classification)
        || closeMessageIds.has(telegramIdKey(message.tg_message_id));
    })
    .map(message => {
      const employee = message.employee_id ? employeesById.get(message.employee_id) : employeesByTgId.get(telegramIdKey(message.from_tg_user_id));
      const rawSource = message.raw && message.raw.source;
      const request = enrichedRequests.find(item => telegramIdKey(item.done_message_id) === telegramIdKey(message.tg_message_id));
      return {
        type: rawSource === 'admin_send' ? 'admin_reply' : 'employee_reply',
        request_id: request ? request.id : null,
        message_id: message.tg_message_id || null,
        actor_name: (employee && employee.full_name) || message.from_name || (rawSource === 'admin_send' ? 'Admin' : 'Xodim'),
        actor_username: (employee && employee.username) || message.from_username || '',
        employee_id: (employee && employee.id) || message.employee_id || null,
        text: message.text || '',
        request_text: request ? request.initial_text || '' : '',
        created_at: message.created_at
      };
    });

  const timeline = [...requestTimeline, ...eventTimeline, ...replyTimeline]
    .filter(item => item.created_at || item.text)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return {
    chat: {
      ...chat,
      title: displayChatTitle(chat),
      total_requests: enrichedRequests.length,
      open_requests: enrichedRequests.filter(request => request.status === 'open').length,
      closed_requests: enrichedRequests.filter(request => request.status === 'closed').length,
      last_request_at: latestBy(enrichedRequests, 'created_at'),
      last_closed_at: latestBy(enrichedRequests, 'closed_at')
    },
    requests: enrichedRequests,
    events,
    messages,
    timeline
  };
}

async function getDashboard() {
  const [employeeStats, chatStats, openRequests, today, analytics] = await Promise.all([
    stats.selectEmployeeStatistics({ select: '*', order: 'closed_requests.desc', limit: '100' }),
    stats.selectChatStatistics({ select: '*', order: 'total_requests.desc', limit: '100' }),
    supabase.select('support_requests', { select: 'id,source_type,chat_id,customer_name,initial_text,status,created_at,company_id', status: 'eq.open', order: supabase.order('created_at', false), limit: '50' }),
    stats.selectTodaySummary({ select: '*' }),
    getDashboardAnalytics()
  ]);
  return {
    summary: today[0] || stats.DEFAULT_SUMMARY,
    employeeStats,
    chatStats,
    openRequests,
    analytics
  };
}

async function listGroups(query) {
  return stats.selectChatStatistics({
    select: '*',
    source_type: 'eq.group',
    is_active: 'eq.true',
    order: supabase.order(query.orderBy || 'last_message_at', false),
    limit: limitQuery(query)
  });
}

async function listPrivateChats(query) {
  const [rows, employeeLookup] = await Promise.all([
    stats.selectChatStatistics({
      select: '*',
      source_type: 'in.(private,business)',
      order: supabase.order(query.orderBy || 'last_message_at', false),
      limit: limitQuery(query)
    }),
    getEmployeeLookup()
  ]);
  return excludeEmployeeChats(rows, employeeLookup.tgIds);
}

async function listRequests(query) {
  const params = {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,closed_at,closed_by_employee_id,closed_by_tg_id,closed_by_name,done_message_id,created_at',
    order: supabase.order(query.orderBy || 'created_at', false),
    limit: limitQuery(query)
  };
  if (query.chat_id) params.chat_id = supabase.eq(query.chat_id);
  if (query.company_id) params.company_id = supabase.eq(query.company_id);
  if (query.status) params.status = `eq.${encodeURIComponent(query.status)}`;
  return supabase.select('support_requests', params);
}

async function getChatDetail(query) {
  const chatId = normalizeTelegramId(query.chat_id);
  if (!chatId) throw new Error('chat_id majburiy');

  const [chatRows, requests, messages, employeeLookup] = await Promise.all([
    supabase.select('tg_chats', {
      select: 'chat_id,title,username,type,source_type,company_id,business_connection_id,is_active,last_message_at,first_seen_at',
      chat_id: supabase.eq(chatId),
      limit: '1'
    }).catch(() => []),
    supabase.select('support_requests', {
      select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,closed_at,closed_by_employee_id,closed_by_tg_id,closed_by_name,done_message_id,created_at',
      chat_id: supabase.eq(chatId),
      order: supabase.order('created_at', false),
      limit: '300'
    }).catch(() => []),
    supabase.select('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,source_type,update_kind,text,classification,employee_id,business_connection_id,raw,created_at',
      chat_id: supabase.eq(chatId),
      order: supabase.order('created_at', false),
      limit: '300'
    }).catch(() => []),
    getEmployeeLookup()
  ]);

  const requestIds = requests.map(request => request.id).filter(Boolean);
  const events = requestIds.length
    ? await supabase.select('request_events', {
      select: 'id,request_id,chat_id,tg_message_id,event_type,actor_tg_id,actor_name,employee_id,text,raw,created_at',
      request_id: supabase.inList(requestIds),
      order: supabase.order('created_at', false),
      limit: '1000'
    }).catch(() => [])
    : [];

  const chat = chatRows[0] || { chat_id: chatId, title: String(chatId), source_type: 'private' };
  const employee = employeeLookup.byTgId.get(telegramIdKey(chatId));
  return buildChatDetail({
    chat: {
      ...chat,
      is_employee_chat: !!employee,
      employee_name: employee ? employee.full_name : null,
      employee_username: employee ? employee.username : null
    },
    requests,
    events,
    messages,
    employeesById: employeeLookup.byId,
    employeesByTgId: employeeLookup.byTgId
  });
}

async function listCompanies(query) {
  return stats.selectCompanyStatistics({
    select: '*',
    order: supabase.order(query.orderBy || 'total_requests', false),
    limit: limitQuery(query)
  });
}

async function listEmployees(query) {
  const [employees, requests, chats, messages] = await Promise.all([
    supabase.select('employees', {
      select: 'id,tg_user_id,full_name,username,phone,role,is_active,last_activity_at,created_at',
      order: supabase.order(query.orderBy || 'created_at', false),
      limit: limitQuery(query)
    }),
    supabase.select('support_requests', {
      select: 'id,closed_by_employee_id,status,chat_id,closed_at,created_at',
      limit: '5000'
    }).catch(() => []),
    supabase.select('tg_chats', {
      select: 'chat_id,title,source_type,business_connection_id,is_active,last_message_at',
      source_type: 'in.(private,business)',
      is_active: 'eq.true',
      limit: '5000'
    }).catch(() => []),
    supabase.select('messages', {
      select: 'chat_id,from_tg_user_id,business_connection_id,source_type,created_at',
      source_type: 'in.(private,business)',
      order: supabase.order('created_at', false),
      limit: '5000'
    }).catch(() => [])
  ]);

  return employees.map(employee => {
    const related = requests.filter(request => request.closed_by_employee_id === employee.id);
    const closed = related.filter(request => request.status === 'closed');
    const directChat = chats.find(chat => String(chat.chat_id) === String(employee.tg_user_id));
    const latestMessage = messages.find(message => String(message.from_tg_user_id) === String(employee.tg_user_id));
    const businessConnectionId = (directChat && directChat.business_connection_id) || (latestMessage && latestMessage.business_connection_id) || '';
    return {
      ...employee,
      received_requests: related.length,
      closed_requests: closed.length,
      handled_chats: new Set(related.map(request => request.chat_id).filter(Boolean)).size,
      last_closed_at: closed.map(request => request.closed_at).filter(Boolean).sort().at(-1) || null,
      contact_chat_id: directChat ? directChat.chat_id : (latestMessage && latestMessage.chat_id) || employee.tg_user_id || null,
      business_connection_id: businessConnectionId || null,
      can_message: !!(employee.tg_user_id && (directChat || latestMessage || businessConnectionId))
    };
  });
}

async function listSettings() {
  const [settings, admins] = await Promise.all([
    supabase.select('bot_settings', { select: 'key,value,updated_at', order: 'key.asc' }),
    supabase.select('admins', { select: 'id,username,full_name,role,is_active,last_login_at,created_at', order: 'created_at.asc', limit: '20' }).catch(() => [])
  ]);
  return {
    settings: settings.map(row => row.key === 'ai_integration'
      ? { ...row, value: sanitizeAiIntegration(row.value) }
      : row),
    admins
  };
}

function maskWebhookUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('secret')) parsed.searchParams.set('secret', '***');
    return parsed.toString();
  } catch (_error) {
    return String(url).replace(/secret=[^&]+/g, 'secret=***');
  }
}

function sanitizeWebhookInfo(info = {}) {
  return {
    ...info,
    url: maskWebhookUrl(info.url || ''),
    has_custom_certificate: !!info.has_custom_certificate,
    allowed_updates: info.allowed_updates || []
  };
}

function getAppUrl(body = {}) {
  const url = body.app_url || optionalEnv('WEBAPP_URL', '');
  return String(url || '').trim().replace(/\/$/, '');
}

async function getTelegramWebhookStatus() {
  return sanitizeWebhookInfo(await getWebhookInfo());
}

async function connectTelegramWebhook(body = {}) {
  const appUrl = getAppUrl(body);
  if (!appUrl) throw new Error('WEBAPP_URL env yoki app_url kerak');

  const secret = optionalEnv('TELEGRAM_WEBHOOK_SECRET', '');
  const webhookUrl = `${appUrl}/api/bot${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
  const payload = {
    url: webhookUrl,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
    drop_pending_updates: body.drop_pending_updates === true
  };
  if (secret) payload.secret_token = secret;

  await setWebhook(payload);
  const info = await getTelegramWebhookStatus();
  return {
    connected: true,
    url: maskWebhookUrl(webhookUrl),
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
    webhook: info
  };
}

async function sendToChat(body) {
  if (!body.chat_id || !body.text) throw new Error('chat_id va text majburiy');
  const chats = await supabase.select('tg_chats', {
    select: 'chat_id,title,source_type,business_connection_id',
    chat_id: supabase.eq(body.chat_id),
    limit: '1'
  });
  const chat = chats[0];
  const businessConnectionId = body.business_connection_id || (chat && chat.business_connection_id) || null;
  let result;
  if (businessConnectionId) {
    result = await sendBusinessMessage(businessConnectionId, body.chat_id, body.text);
  } else {
    result = await sendMessage(body.chat_id, body.text);
  }

  const sourceType = (chat && chat.source_type) || 'private';
  const broadcastRows = await supabase.insert('broadcasts', [{
    title: body.title || 'Manual message',
    text: body.text,
    target_type: 'single_chat',
    total_targets: 1,
    sent_count: 1,
    failed_count: 0,
    created_by: body.created_by || 'admin',
    status: 'sent'
  }]).catch(() => null);

  await Promise.all([
    result && result.message_id ? supabase.insert('messages', [{
      tg_message_id: result.message_id,
      chat_id: body.chat_id,
      from_tg_user_id: null,
      from_name: body.created_by || 'admin',
      from_username: body.created_by || null,
      source_type: sourceType,
      update_kind: 'admin_send',
      text: body.text,
      classification: 'admin_reply',
      employee_id: null,
      business_connection_id: businessConnectionId,
      raw: { source: 'admin_send', created_by: body.created_by || 'admin', telegram: result },
      created_at: nowIso()
    }], { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: 'return=minimal' }).catch(() => null) : Promise.resolve(null),
    broadcastRows && broadcastRows[0] && result && result.message_id
      ? supabase.insert('broadcast_targets', [{
        broadcast_id: broadcastRows[0].id,
        chat_id: body.chat_id,
        status: 'sent',
        telegram_message_id: result.message_id,
        sent_at: nowIso()
      }], { prefer: 'return=minimal' }).catch(() => null)
      : Promise.resolve(null)
  ]);
  return { sent: true, telegram: result };
}

async function deactivateGroup(body) {
  const chatId = normalizeTelegramId(body.chat_id);
  if (!chatId) throw new Error('chat_id majburiy');
  const rows = await supabase.patch('tg_chats', { chat_id: supabase.eq(chatId) }, {
    is_active: false,
    member_status: 'hidden',
    last_member_update_at: nowIso()
  });
  return rows[0] || { chat_id: chatId, is_active: false };
}

async function broadcast(body) {
  if (!body.text) throw new Error('text majburiy');
  const targetType = body.target_type || 'groups';
  const explicitChatIds = Array.isArray(body.chat_ids) ? body.chat_ids : [];

  let targets = [];
  if (explicitChatIds.length) {
    targets = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id,source_type', chat_id: supabase.inList(explicitChatIds), limit: '200' });
  } else if (targetType === 'groups') {
    targets = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id,source_type', source_type: 'eq.group', is_active: 'eq.true', limit: '200' });
  } else if (targetType === 'privates') {
    targets = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id,source_type', source_type: 'in.(private,business)', is_active: 'eq.true', limit: '200' });
  } else if (targetType === 'all') {
    targets = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id,source_type', is_active: 'eq.true', limit: '300' });
  } else if (targetType === 'company') {
    if (!body.company_id) throw new Error('company_id majburiy');
    targets = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id,source_type', company_id: supabase.eq(body.company_id), is_active: 'eq.true', limit: '200' });
  }
  if (['privates', 'all'].includes(targetType) || explicitChatIds.length) {
    const employeeLookup = await getEmployeeLookup();
    targets = excludeEmployeeChats(targets, employeeLookup.tgIds);
  }

  const [broadcastRow] = await supabase.insert('broadcasts', [{
    title: body.title || 'Broadcast',
    text: body.text,
    target_type: targetType,
    total_targets: targets.length,
    sent_count: 0,
    failed_count: 0,
    created_by: body.created_by || 'admin',
    status: 'processing'
  }]);

  let sent = 0;
  let failed = 0;
  const details = [];
  for (const target of targets) {
    try {
      let telegramResult;
      if (target.business_connection_id) {
        telegramResult = await sendBusinessMessage(target.business_connection_id, target.chat_id, body.text);
      } else {
        telegramResult = await sendMessage(target.chat_id, body.text);
      }
      sent += 1;
      details.push({ chat_id: target.chat_id, ok: true, message_id: telegramResult.message_id });
      await supabase.insert('broadcast_targets', [{ broadcast_id: broadcastRow.id, chat_id: target.chat_id, status: 'sent', sent_at: new Date().toISOString(), telegram_message_id: telegramResult.message_id }], { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      failed += 1;
      details.push({ chat_id: target.chat_id, ok: false, error: error.message });
      await supabase.insert('broadcast_targets', [{ broadcast_id: broadcastRow.id, chat_id: target.chat_id, status: 'failed', error: error.message }], { prefer: 'return=minimal' }).catch(() => null);
    }
  }

  await supabase.patch('broadcasts', { id: supabase.eq(broadcastRow.id) }, {
    sent_count: sent,
    failed_count: failed,
    status: failed ? 'completed_with_errors' : 'sent',
    completed_at: new Date().toISOString()
  }).catch(() => null);

  return { broadcast_id: broadcastRow.id, total: targets.length, sent, failed, details };
}

async function upsertCompany(body) {
  const values = {
    name: body.name,
    legal_name: body.legal_name || null,
    phone: body.phone || null,
    notes: body.notes || null,
    is_active: body.is_active !== false
  };
  if (!values.name) throw new Error('Kompaniya nomi majburiy');
  if (body.id) {
    const rows = await supabase.patch('companies', { id: supabase.eq(body.id) }, values);
    return rows[0];
  }
  const rows = await supabase.insert('companies', [values]);
  return rows[0];
}

async function upsertEmployee(body) {
  const tgUserId = normalizeTelegramId(body.tg_user_id);
  const values = {
    full_name: body.full_name,
    username: body.username ? String(body.username).replace(/^@/, '') : null,
    phone: body.phone || null,
    role: body.role || 'support',
    is_active: body.is_active !== false,
    last_activity_at: nowIso()
  };
  if (!values.full_name) throw new Error('Xodim ismi majburiy');
  if (tgUserId) values.tg_user_id = tgUserId;

  if (tgUserId) {
    await supabase.insert('tg_users', [{
      tg_user_id: tgUserId,
      username: values.username,
      first_name: values.full_name,
      last_seen_at: nowIso(),
      raw: { source: 'admin_employee_bind' }
    }], { upsert: true, onConflict: 'tg_user_id' });
  }

  if (body.id) {
    const rows = await supabase.patch('employees', { id: supabase.eq(body.id) }, values);
    return rows[0];
  }

  const options = tgUserId ? { upsert: true, onConflict: 'tg_user_id' } : {};
  const rows = await supabase.insert('employees', [values], options);
  return rows[0];
}

async function getEmployeeByBody(body) {
  if (body.employee_id) {
    const rows = await supabase.select('employees', {
      select: 'id,tg_user_id,full_name,username,phone,role,is_active',
      id: supabase.eq(body.employee_id),
      limit: '1'
    });
    return rows[0];
  }
  const tgUserId = normalizeTelegramId(body.tg_user_id);
  if (!tgUserId) throw new Error('employee_id yoki tg_user_id majburiy');
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,phone,role,is_active',
    tg_user_id: supabase.eq(tgUserId),
    limit: '1'
  });
  return rows[0] || { tg_user_id: tgUserId, full_name: 'Xodim' };
}

async function resolveEmployeeTarget(employee) {
  if (!employee || !employee.tg_user_id) {
    throw new Error('Xodim Telegram ID bilan botga biriktirilmagan');
  }

  const directChats = await supabase.select('tg_chats', {
    select: 'chat_id,title,source_type,business_connection_id,is_active',
    chat_id: supabase.eq(employee.tg_user_id),
    is_active: 'eq.true',
    limit: '1'
  }).catch(() => []);
  const directChat = directChats[0];
  if (directChat && directChat.business_connection_id) {
    return { chat_id: directChat.chat_id, business_connection_id: directChat.business_connection_id, via: 'business' };
  }
  if (directChat) return { chat_id: directChat.chat_id, via: 'private' };

  const messages = await supabase.select('messages', {
    select: 'chat_id,business_connection_id,source_type,created_at',
    from_tg_user_id: supabase.eq(employee.tg_user_id),
    source_type: 'in.(private,business)',
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);
  const latestMessage = messages[0];
  if (latestMessage && latestMessage.business_connection_id) {
    return { chat_id: latestMessage.chat_id, business_connection_id: latestMessage.business_connection_id, via: 'business' };
  }
  if (latestMessage) return { chat_id: latestMessage.chat_id, via: 'private' };

  throw new Error('Xodimga yozish uchun u botga /start yuborgan bo‘lishi yoki Business chat orqali ko‘ringan bo‘lishi kerak');
}

async function sendToEmployee(body) {
  if (!body.text) throw new Error('text majburiy');
  const employee = await getEmployeeByBody(body);
  if (!employee) throw new Error('Xodim topilmadi');
  const target = await resolveEmployeeTarget(employee);
  const telegramResult = target.business_connection_id
    ? await sendBusinessMessage(target.business_connection_id, target.chat_id, body.text)
    : await sendMessage(target.chat_id, body.text);
  return { sent: true, employee_id: employee.id || null, chat_id: target.chat_id, via: target.via, telegram: telegramResult };
}

function getEmployeeMessageTargets(body) {
  const explicitTargets = Array.isArray(body.employees) ? body.employees : [];
  const idTargets = Array.isArray(body.employee_ids) ? body.employee_ids.map(employee_id => ({ employee_id })) : [];
  const tgTargets = Array.isArray(body.tg_user_ids) ? body.tg_user_ids.map(tg_user_id => ({ tg_user_id })) : [];
  const seen = new Set();
  return [...explicitTargets, ...idTargets, ...tgTargets].map(target => ({
    employee_id: target.employee_id || target.id || null,
    tg_user_id: target.tg_user_id || null,
    label: target.full_name || target.username || target.tg_user_id || target.employee_id || target.id || 'Xodim'
  })).filter(target => {
    const key = target.employee_id ? `id:${target.employee_id}` : `tg:${target.tg_user_id}`;
    if ((!target.employee_id && !target.tg_user_id) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sendToEmployees(body) {
  if (!body.text) throw new Error('text majburiy');
  const targets = getEmployeeMessageTargets(body);
  if (!targets.length) throw new Error('Kamida bitta xodim tanlang');

  let sent = 0;
  let failed = 0;
  const details = [];
  for (const target of targets) {
    try {
      const result = await sendToEmployee({ employee_id: target.employee_id, tg_user_id: target.tg_user_id, text: body.text });
      sent += 1;
      details.push({ label: target.label, ok: true, employee_id: result.employee_id, chat_id: result.chat_id, via: result.via });
    } catch (error) {
      failed += 1;
      details.push({ label: target.label, ok: false, employee_id: target.employee_id, tg_user_id: target.tg_user_id, error: error.message });
    }
  }

  return { total: targets.length, sent, failed, details };
}

async function assignChatCompany(body) {
  if (!body.chat_id || !body.company_id) throw new Error('chat_id va company_id majburiy');
  const rows = await supabase.patch('tg_chats', { chat_id: supabase.eq(body.chat_id) }, { company_id: body.company_id });
  return rows[0];
}

async function notifyAiModeChange(settings = {}, enabled) {
  const chatId = settings.mainGroupId || await resolveMainStatsChatId().catch(() => '');
  if (!chatId) return;

  const lines = enabled
    ? [
      '⚡️ <b>AI mode faollashtirildi</b>',
      '',
      'Bot endi Uyqur texnik yordam so‘rovlarini yanada aqlliroq tahlil qiladi.',
      'Savol, muammo va o‘rgatish niyatlari aniqroq ajratiladi.'
    ]
    : [
      '⚡️ <b>AI mode o‘chirildi</b>',
      '',
      'Bot endi standart aqlli aniqlash rejimida ishlaydi.',
      'Uyqur texnik yordam so‘rovlari keyword va kontekst orqali ajratiladi.'
    ];

  await sendMessage(chatId, lines.join('\n'));
}

async function notifyAiIntegrationConnected(settings = {}) {
  const chatId = settings.mainGroupId || await resolveMainStatsChatId().catch(() => '');
  if (!chatId) return;
  const label = settings.aiIntegration && (settings.aiIntegration.label || settings.aiIntegration.model) || 'AI model';

  await sendMessage(chatId, [
    '⚡️ <b>AI model ulandi</b>',
    '',
    `<b>${String(label).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</b> integratsiyasi tayyor.`,
    'AI mode selectida shu model tanlansa, bot xabarlarni AI orqali tahlil qiladi.'
  ].join('\n'));
}

function settingValue(rows = [], key) {
  const row = rows.find(item => item && item.key === key);
  return row && row.value && typeof row.value === 'object' ? row.value : {};
}

async function updateSettings(body) {
  const items = Array.isArray(body.settings) ? body.settings : [];
  if (!items.length) return [];
  const previousRows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: 'in.(ai_mode,ai_integration,done_tag,request_detection,main_group)'
  }).catch(() => []);
  const previousSettings = normalizeSettings(previousRows || []);
  const previousIntegration = normalizeAiIntegration(settingValue(previousRows, 'ai_integration'));
  const previousIntegrationReady = isAiIntegrationReady(previousIntegration);
  const previousIntegrationSignature = aiIntegrationSignature(previousIntegration);
  const rows = items.map(item => {
    const value = item.key === 'ai_integration'
      ? mergeAiIntegration(previousIntegration, item.value)
      : item.value;
    return { key: item.key, value, updated_at: new Date().toISOString() };
  });
  const savedRows = await supabase.insert('bot_settings', rows, { upsert: true, onConflict: 'key' });
  clearBotSettingsCache();

  const mergedRows = new Map((previousRows || []).map(row => [row.key, row]));
  rows.forEach(row => mergedRows.set(row.key, row));
  const nextSettings = normalizeSettings([...mergedRows.values()]);
  if (!previousSettings.aiMode && nextSettings.aiMode) {
    await notifyAiModeChange(nextSettings, true).catch(error => console.error('[admin:ai-mode-notice:error]', error));
  }
  if (previousSettings.aiMode && !nextSettings.aiMode) {
    await notifyAiModeChange(nextSettings, false).catch(error => console.error('[admin:ai-mode-notice:error]', error));
  }
  const nextIntegrationReady = isAiIntegrationReady(nextSettings.aiIntegration);
  const integrationChanged = previousIntegrationSignature !== aiIntegrationSignature(nextSettings.aiIntegration);
  if (nextIntegrationReady && (!previousIntegrationReady || integrationChanged)) {
    await notifyAiIntegrationConnected(nextSettings).catch(error => console.error('[admin:ai-integration-notice:error]', error));
  }

  return savedRows.map(row => row.key === 'ai_integration'
    ? { ...row, value: sanitizeAiIntegration(row.value) }
    : row);
}

async function extractAiKnowledge(body = {}) {
  return extractTextFromUpload(body.file || body);
}

async function updateAdmin(body, currentAdmin) {
  const admins = await supabase.select('admins', { select: 'id,username,full_name,role,is_active', username: supabase.eq(currentAdmin.username), limit: '1' }).catch(() => []);
  const admin = admins[0];
  if (!admin) {
    const values = {
      username: body.username || currentAdmin.username || optionalEnv('ADMIN_USERNAME', 'admin'),
      full_name: body.full_name || 'Admin',
      role: 'owner',
      is_active: true,
      password_hash: hashPassword(body.new_password || optionalEnv('ADMIN_PASSWORD', 'Admin@12345'))
    };
    const rows = await supabase.insert('admins', [values]);
    return rows[0];
  }
  const values = {};
  if (body.username) values.username = body.username;
  if (body.full_name) values.full_name = body.full_name;
  if (body.new_password) values.password_hash = hashPassword(body.new_password);
  const rows = await supabase.patch('admins', { id: supabase.eq(admin.id) }, values);
  return rows[0];
}

async function handleGet(action, query) {
  switch (action) {
    case 'health': return { ok: true, service: 'admin-api' };
    case 'dashboard': return getDashboard();
    case 'stats': return getDashboard();
    case 'groups': return listGroups(query);
    case 'privates': return listPrivateChats(query);
    case 'requests': return listRequests(query);
    case 'chatDetail': return getChatDetail(query);
    case 'companies': return listCompanies(query);
    case 'employees': return listEmployees(query);
    case 'settings': return listSettings();
    case 'telegramWebhookInfo': return getTelegramWebhookStatus();
    default: throw new Error(`Unknown GET action: ${action}`);
  }
}

async function handlePost(action, body, currentAdmin) {
  switch (action) {
    case 'sendMessage': return sendToChat({ ...body, created_by: currentAdmin.username });
    case 'broadcast': return broadcast({ ...body, created_by: currentAdmin.username });
    case 'company': return upsertCompany(body);
    case 'employee': return upsertEmployee(body);
    case 'deleteGroup': return deactivateGroup(body);
    case 'sendEmployeeMessage': return sendToEmployee(body);
    case 'sendEmployeesMessage': return sendToEmployees(body);
    case 'assignChatCompany': return assignChatCompany(body);
    case 'settings': return updateSettings(body);
    case 'aiKnowledgeExtract': return extractAiKnowledge(body);
    case 'adminProfile': return updateAdmin(body, currentAdmin);
    case 'sendMainStats': return sendMainStatsReport(body.chat_id || body.main_group_id);
    case 'setTelegramWebhook': return connectTelegramWebhook(body);
    default: throw new Error(`Unknown POST action: ${action}`);
  }
}

async function handler(req, res) {
  if (allowCors(req, res)) return;

  try {
    const query = getQuery(req);
    const action = query.action || 'dashboard';

    if (req.method === 'POST' && action === 'login') {
      const body = await readBody(req);
      const result = await login(body.username, body.password);
      return sendJson(res, 200, { ok: true, ...result });
    }

    const currentAdmin = requireAdmin(req);

    if (req.method === 'GET') {
      const data = await handleGet(action, query);
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = await handlePost(action, body, currentAdmin);
      return sendJson(res, 200, { ok: true, data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[admin:error]', error);
    const status = /token|login|parol|authorization/i.test(error.message) ? 401 : 400;
    return sendJson(res, status, { ok: false, error: error.message });
  }
}

module.exports = handler;
