'use strict';

const { Readable } = require('stream');
const supabase = require('../lib/supabase');
const { allowCors, sendJson, readBody, getQuery } = require('../lib/http');
const { login, requireAdmin, hashPassword } = require('../lib/auth');
const { sendMessage, sendBusinessMessage, getWebhookInfo, setWebhook, getFile, getUserProfilePhotos, downloadFile } = require('../lib/telegram');
const { optionalEnv } = require('../lib/env');
const { normalizeSettings, clearBotSettingsCache } = require('../lib/bot-settings');
const { normalizeAiIntegration, mergeAiIntegration, sanitizeAiIntegration, isAiIntegrationReady, isAiIntegrationConfigured, aiIntegrationSignature } = require('../lib/ai-config');
const { testAiIntegration } = require('../lib/ai');
const { extractTextFromUpload } = require('../lib/document-text');
const { resolveMainStatsChatId, sendMainStatsReport } = require('../lib/report');
const { fetchCompanyInfo } = require('../lib/company-info');
const { notifyOperationalLog, notifyOperationalError } = require('../lib/log-notifier');
const stats = require('../lib/stats');

const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'channel_post',
  'edited_channel_post',
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

async function selectPaged(table, query = {}, options = {}) {
  const pageSize = Math.min(Number(options.pageSize || 1000), 1000);
  const maxRows = Number(options.maxRows || 20000);
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const page = await supabase.select(table, {
      ...query,
      limit: String(Math.min(pageSize, maxRows - rows.length)),
      offset: String(offset)
    }).catch(() => []);
    const pageRows = Array.isArray(page) ? page : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function selectPagedByChunks(table, baseQuery = {}, field, values = [], options = {}) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const chunkSize = Number(options.chunkSize || 350);
  const rows = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    const chunk = uniqueValues.slice(index, index + chunkSize);
    rows.push(...await selectPaged(table, {
      ...baseQuery,
      [field]: supabase.inList(chunk)
    }, options));
  }
  return rows;
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

function minutesSince(start, now = new Date()) {
  return minutesBetween(start, now) || 0;
}

function average(values) {
  const clean = values.filter(value => Number.isFinite(value));
  if (!clean.length) return 0;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length, 1);
}

function tashkentHourKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const hour = parts.find(part => part.type === 'hour')?.value || '00';
  return `${hour.padStart(2, '0')}:00`;
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

function dateFromTashkentKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(value => Number.parseInt(value, 10));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDaysToDateKey(dateKey, days) {
  const date = dateFromTashkentKey(dateKey);
  if (!date) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return tashkentDateKey(date);
}

function dateKeyRange(startKey, endKey, maxDays = 45) {
  const keys = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor && cursor <= endKey && guard < maxDays) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
}

function shortDateLabel(dateKey) {
  const [, month, day] = String(dateKey || '').split('-');
  return day && month ? `${day}.${month}.${String(dateKey).slice(0, 4)}` : dateKey || '';
}

function weekdayLabel(dateKey) {
  const date = dateFromTashkentKey(dateKey);
  if (!date) return '—';
  return ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'][date.getUTCDay()] || '—';
}

function currentPeriodKeys(now = new Date()) {
  const today = tashkentDateKey(now);
  const { year, month, day } = tashkentDateParts(now);

  return {
    today,
    weekStart: addDaysToDateKey(today, -6),
    month: `${year}-${month}`
  };
}

function normalizeDateKey(value = '') {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return dateFromTashkentKey(text) ? text : '';
}

function normalizeCustomPeriod(query = {}) {
  const start = normalizeDateKey(query.start_date || query.date_start || query.from || query.period_start);
  const end = normalizeDateKey(query.end_date || query.date_end || query.to || query.period_end);
  if (!start || !end) return null;
  return start <= end
    ? { start, end, label: `${shortDateLabel(start)} - ${shortDateLabel(end)}` }
    : { start: end, end: start, label: `${shortDateLabel(end)} - ${shortDateLabel(start)}` };
}

function inCurrentPeriod(value, periodKey, keys) {
  if (periodKey === 'all') return true;
  if (!value) return false;
  const dateKey = tashkentDateKey(value);
  if (periodKey === 'today') return dateKey === keys.today;
  if (periodKey === 'week') return dateKey >= keys.weekStart && dateKey <= keys.today;
  if (periodKey === 'month') return dateKey.startsWith(keys.month);
  if (periodKey === 'custom') return keys.customStart && keys.customEnd && dateKey >= keys.customStart && dateKey <= keys.customEnd;
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
  const employeeMap = new Map(employees.map(employee => [employee.id, employee]).filter(([id]) => id));
  const employeeByTgId = new Map(employees.map(employee => [telegramIdKey(employee.tg_user_id), employee]).filter(([id]) => id));
  const closed = requests.filter(request => {
    if (request.status !== 'closed' || !inCurrentPeriod(request.closed_at, periodKey, keys)) return false;
    return Boolean(request.closed_by_employee_id || request.closed_by_tg_id || request.closed_by_name);
  });
  const totals = new Map(employees.map(employee => [employee.id, {
    employee_id: employee.id,
    tg_user_id: employee.tg_user_id || null,
    full_name: employee.full_name || 'Xodim',
    username: employee.username || '',
    role: employee.role || '',
    closed_requests: 0,
    handled_chats: new Set(),
    close_minutes: [],
    last_closed_at: null
  }]).filter(([id]) => id));

  closed.forEach(request => {
    const employee = employeeMap.get(request.closed_by_employee_id) || employeeByTgId.get(telegramIdKey(request.closed_by_tg_id));
    const key = employee?.id || request.closed_by_employee_id || (request.closed_by_tg_id ? `tg:${request.closed_by_tg_id}` : `name:${request.closed_by_name}`);
    const current = totals.get(key) || {
      employee_id: employee?.id || request.closed_by_employee_id || '',
      tg_user_id: employee?.tg_user_id || request.closed_by_tg_id || null,
      full_name: request.closed_by_name || employee?.full_name || 'Xodim',
      username: '',
      role: '',
      closed_requests: 0,
      handled_chats: new Set(),
      close_minutes: [],
      last_closed_at: null
    };
    if (employee) {
      current.full_name = employee.full_name || current.full_name;
      current.username = employee.username || '';
      current.role = employee.role || '';
      current.tg_user_id = employee.tg_user_id || null;
      current.employee_id = employee.id || current.employee_id;
    }
    current.closed_requests += 1;
    if (request.chat_id) current.handled_chats.add(String(request.chat_id));
    const closeMinute = minutesBetween(request.created_at, request.closed_at);
    if (closeMinute !== null) current.close_minutes.push(closeMinute);
    if (!current.last_closed_at || String(request.closed_at || '') > String(current.last_closed_at || '')) current.last_closed_at = request.closed_at || null;
    totals.set(key, current);
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

function buildChatPerformance({ requests, chats, periodKey, keys, sourceType = '' }) {
  const chatMap = new Map(chats.map(chat => [String(chat.chat_id), chat]));
  const periodRequests = requests.filter(request => {
    if (sourceType && request.source_type !== sourceType) return false;
    return inCurrentPeriod(request.created_at, periodKey, keys);
  });
  const totals = new Map();

  periodRequests.forEach(request => {
    const key = String(request.chat_id);
    const chat = chatMap.get(key) || {};
    const current = totals.get(key) || {
      chat_id: request.chat_id,
      title: chat.title || key,
      company_name: chat.company_name || null,
      source_type: chat.source_type || request.source_type || '',
      total_requests: 0,
      open_requests: 0,
      closed_requests: 0,
      close_minutes: [],
      customers: new Set(),
      last_request_at: null
    };
    current.total_requests += 1;
    if (request.status === 'open') current.open_requests += 1;
    if (request.status === 'closed') {
      current.closed_requests += 1;
      const closeMinute = minutesBetween(request.created_at, request.closed_at);
      if (closeMinute !== null) current.close_minutes.push(closeMinute);
    }
    if (request.customer_tg_id) current.customers.add(String(request.customer_tg_id));
    if (!current.last_request_at || String(request.created_at || '') > String(current.last_request_at || '')) current.last_request_at = request.created_at || null;
    totals.set(key, current);
  });

  return [...totals.values()]
    .map(row => ({
      chat_id: row.chat_id,
      title: row.title,
      company_name: row.company_name,
      source_type: row.source_type,
      total_requests: row.total_requests,
      open_requests: row.open_requests,
      closed_requests: row.closed_requests,
      close_rate: percent(row.closed_requests, row.total_requests),
      avg_close_minutes: average(row.close_minutes),
      unique_customers: row.customers.size,
      last_request_at: row.last_request_at
    }))
    .sort((a, b) => b.total_requests - a.total_requests || b.close_rate - a.close_rate)
    .slice(0, 30);
}

function buildGroupPerformance(args) {
  return buildChatPerformance({ ...args, sourceType: 'group' });
}

function buildResponseTimeTrend(requests, periodKey, keys) {
  const buckets = new Map();
  requests
    .filter(request => request.status === 'closed' && inCurrentPeriod(request.created_at, periodKey, keys))
    .forEach(request => {
      const closeMinute = minutesBetween(request.created_at, request.closed_at);
      if (closeMinute === null) return;
      const hourLabel = tashkentHourKey(request.created_at);
      const current = buckets.get(hourLabel) || {
        hour_label: hourLabel,
        response_minutes: [],
        closed_requests: 0
      };
      current.response_minutes.push(closeMinute);
      current.closed_requests += 1;
      buckets.set(hourLabel, current);
    });

  return [...buckets.values()]
    .sort((a, b) => a.hour_label.localeCompare(b.hour_label))
    .map(row => ({
      hour_label: row.hour_label,
      avg_close_minutes: average(row.response_minutes),
      closed_requests: row.closed_requests
    }));
}

function periodTrendDateKeys(requests, periodKey, keys) {
  if (periodKey === 'today') return [keys.today];
  if (periodKey === 'week') return dateKeyRange(keys.weekStart, keys.today, 7);
  if (periodKey === 'month') return dateKeyRange(`${keys.month}-01`, keys.today, 31);
  if (periodKey === 'custom' && keys.customStart && keys.customEnd) return dateKeyRange(keys.customStart, keys.customEnd, 62);

  const dateKeys = [...new Set(requests.filter(request => request.created_at).map(request => tashkentDateKey(request.created_at)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  return dateKeys.slice(-14);
}

function buildTicketAnswerTrend(requests, periodKey, keys) {
  const buckets = new Map(periodTrendDateKeys(requests, periodKey, keys).map(dateKey => [dateKey, {
    date_key: dateKey,
    date_label: shortDateLabel(dateKey),
    weekday_label: weekdayLabel(dateKey),
    total_requests: 0,
    closed_requests: 0,
    open_requests: 0
  }]));

  requests
    .filter(request => request.created_at && inCurrentPeriod(request.created_at, periodKey, keys))
    .forEach(request => {
      const dateKey = tashkentDateKey(request.created_at);
      const current = buckets.get(dateKey) || {
        date_key: dateKey,
        date_label: shortDateLabel(dateKey),
        weekday_label: weekdayLabel(dateKey),
        total_requests: 0,
        closed_requests: 0,
        open_requests: 0
      };
      current.total_requests += 1;
      if (request.status === 'closed') current.closed_requests += 1;
      if (request.status === 'open') current.open_requests += 1;
      buckets.set(dateKey, current);
    });

  return [...buckets.values()]
    .sort((a, b) => a.date_key.localeCompare(b.date_key))
    .map(row => ({
      ...row,
      sla: percent(row.closed_requests, row.total_requests)
    }));
}

function buildCompanyTicketPerformance({ requests, chats = [], companies, periodKey, keys }) {
  const companyMap = new Map(companies.map(company => [company.id, company]).filter(([id]) => id));
  const chatCompanyMap = new Map(chats
    .map(chat => [telegramIdKey(chat.chat_id), chat.company_id])
    .filter(([, companyId]) => companyId));
  const totals = new Map();

  requests
    .filter(request => request.created_at && inCurrentPeriod(request.created_at, periodKey, keys))
    .forEach(request => {
      const companyId = request.company_id || chatCompanyMap.get(telegramIdKey(request.chat_id));
      if (!companyId) return;
      const company = companyMap.get(companyId) || null;
      const key = company?.id || companyId;
      const current = totals.get(key) || {
        company_id: company?.id || companyId,
        name: company?.name || 'Kompaniya',
        total_requests: 0,
        closed_requests: 0,
        open_requests: 0
      };
      current.total_requests += 1;
      if (request.status === 'closed') current.closed_requests += 1;
      if (request.status === 'open') current.open_requests += 1;
      totals.set(key, current);
    });

  return [...totals.values()]
    .map(row => ({
      ...row,
      close_rate: percent(row.closed_requests, row.total_requests)
    }))
    .sort((a, b) => b.total_requests - a.total_requests || b.closed_requests - a.closed_requests || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function buildDashboardAnalytics({ requests, chats, employees, companies, customPeriod = null }) {
  const keys = {
    ...currentPeriodKeys(),
    customStart: customPeriod?.start || '',
    customEnd: customPeriod?.end || ''
  };
  const periods = [
    ['today', 'Bugun'],
    ['week', 'Hafta'],
    ['month', 'Oy'],
    ['all', 'Jami']
  ];
  if (customPeriod) periods.push(['custom', customPeriod.label || 'Ixtiyoriy']);

  return {
    periods: Object.fromEntries(periods.map(([key, label]) => [key, buildPeriodSummary(requests, key, label, keys)])),
    employeePerformance: Object.fromEntries(periods.map(([key]) => [key, buildEmployeePerformance({ requests, employees, periodKey: key, keys })])),
    chatPerformance: Object.fromEntries(periods.map(([key]) => [key, buildChatPerformance({ requests, chats, periodKey: key, keys })])),
    groupPerformance: Object.fromEntries(periods.map(([key]) => [key, buildGroupPerformance({ requests, chats, periodKey: key, keys })])),
    responseTimeTrend: Object.fromEntries(periods.map(([key]) => [key, buildResponseTimeTrend(requests, key, keys)])),
    ticketAnswerTrend: Object.fromEntries(periods.map(([key]) => [key, buildTicketAnswerTrend(requests, key, keys)])),
    companyTickets: Object.fromEntries(periods.map(([key]) => [key, buildCompanyTicketPerformance({ requests, chats, companies, periodKey: key, keys })])),
    custom_period: customPeriod,
    generated_at: new Date().toISOString()
  };
}

async function getDashboardAnalytics(query = {}) {
  const customPeriod = normalizeCustomPeriod(query);
  const [requests, chats, employees, companies] = await Promise.all([
    supabase.select('support_requests', {
      select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,status,closed_by_employee_id,closed_by_tg_id,closed_by_name,created_at,closed_at',
      order: supabase.order('created_at', false),
      limit: '10000'
    }).catch(() => []),
    stats.selectChatStatistics({ select: '*', is_active: 'eq.true', limit: '1000' }).catch(() => []),
    supabase.select('employees', { select: 'id,tg_user_id,full_name,username,role,is_active', limit: '1000' }).catch(() => []),
    supabase.select('companies', { select: 'id,name,is_active', limit: '1000' }).catch(() => [])
  ]);

  return buildDashboardAnalytics({ requests, chats, employees, companies, customPeriod });
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

function buildEmployeeMaps(employees = []) {
  return {
    byId: new Map(employees.map(employee => [employee.id, employee]).filter(([id]) => id)),
    byTgId: new Map(employees.map(employee => [telegramIdKey(employee.tg_user_id), employee]).filter(([id]) => id)),
    tgIds: new Set(employees.map(employee => telegramIdKey(employee.tg_user_id)).filter(Boolean))
  };
}

function employeeSummary(employee = null) {
  if (!employee) return null;
  return {
    employee_id: employee.id || employee.employee_id || null,
    tg_user_id: employee.tg_user_id || null,
    full_name: employee.full_name || employee.closed_by_name || 'Xodim',
    username: employee.username || ''
  };
}

function resolveRequestResponsibleEmployee(request, messages = [], employeeMaps = buildEmployeeMaps([])) {
  const requestTime = new Date(request.created_at || 0).getTime();
  const employeeMessages = messages
    .filter(message => message && (message.employee_id || employeeMaps.byTgId.has(telegramIdKey(message.from_tg_user_id))))
    .map(message => {
      const employee = employeeMaps.byId.get(message.employee_id) || employeeMaps.byTgId.get(telegramIdKey(message.from_tg_user_id));
      return { message, employee, time: new Date(message.created_at || 0).getTime() };
    })
    .filter(item => item.employee && Number.isFinite(item.time));

  const afterRequest = employeeMessages
    .filter(item => !Number.isFinite(requestTime) || item.time >= requestTime)
    .sort((a, b) => a.time - b.time)[0];
  if (afterRequest) return employeeSummary(afterRequest.employee);

  const latestBefore = employeeMessages.sort((a, b) => b.time - a.time)[0];
  return latestBefore ? employeeSummary(latestBefore.employee) : null;
}

function resolveEventEmployee(event = {}, employeeMaps = buildEmployeeMaps([])) {
  const employee = employeeMaps.byId.get(event.employee_id) || employeeMaps.byTgId.get(telegramIdKey(event.actor_tg_id));
  return employee ? employeeSummary(employee) : null;
}

function resolveRequestResponsibleEmployeeFromEvents(request = {}, events = [], employeeMaps = buildEmployeeMaps([])) {
  const employeeEvents = events
    .filter(event => event && (event.employee_id || employeeMaps.byTgId.has(telegramIdKey(event.actor_tg_id))))
    .map(event => ({ event, employee: resolveEventEmployee(event, employeeMaps) }))
    .filter(item => item.employee);

  const closedEvent = employeeEvents
    .filter(item => item.event.event_type === 'closed')
    .sort((a, b) => String(b.event.created_at || '').localeCompare(String(a.event.created_at || '')))[0];
  if (closedEvent) return closedEvent.employee;

  const requestTime = new Date(request.created_at || 0).getTime();
  const afterRequest = employeeEvents
    .map(item => ({ ...item, time: new Date(item.event.created_at || 0).getTime() }))
    .filter(item => Number.isFinite(item.time) && (!Number.isFinite(requestTime) || item.time >= requestTime))
    .sort((a, b) => a.time - b.time)[0];
  return afterRequest ? afterRequest.employee : null;
}

function enrichOpenRequests({ requests = [], chats = [], messages = [], employees = [] }) {
  const now = new Date();
  const chatMap = new Map(chats.map(chat => [telegramIdKey(chat.chat_id), chat]));
  const messagesByChat = new Map();
  messages.forEach(message => {
    const key = telegramIdKey(message.chat_id);
    if (!messagesByChat.has(key)) messagesByChat.set(key, []);
    messagesByChat.get(key).push(message);
  });
  const employeeMaps = buildEmployeeMaps(employees);

  return requests.map(request => {
    const chat = chatMap.get(telegramIdKey(request.chat_id)) || {};
    const responsible = resolveRequestResponsibleEmployee(request, messagesByChat.get(telegramIdKey(request.chat_id)) || [], employeeMaps);
    return {
      ...request,
      chat_title: displayChatTitle(chat),
      chat_source_type: chat.source_type || request.source_type || '',
      responsible_employee_id: responsible?.employee_id || null,
      responsible_employee_name: responsible?.full_name || '',
      responsible_employee_username: responsible?.username || '',
      open_minutes: round(minutesSince(request.created_at, now), 1)
    };
  });
}

async function getOpenRequestInsights() {
  const requests = await supabase.select('support_requests', {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,created_at',
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '500'
  }).catch(() => []);

  const chatIds = [...new Set(requests.map(request => request.chat_id).filter(value => value !== undefined && value !== null))];
  const [chats, messages, employees] = await Promise.all([
    chatIds.length ? supabase.select('tg_chats', {
      select: 'chat_id,title,username,source_type,business_connection_id,last_message_at',
      chat_id: supabase.inList(chatIds),
      limit: '1000'
    }).catch(() => []) : Promise.resolve([]),
    chatIds.length ? supabase.select('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,created_at',
      chat_id: supabase.inList(chatIds),
      order: supabase.order('created_at', false),
      limit: '5000'
    }).catch(() => []) : Promise.resolve([]),
    supabase.select('employees', { select: 'id,tg_user_id,full_name,username,role,is_active', limit: '1000' }).catch(() => [])
  ]);

  const enriched = enrichOpenRequests({ requests, chats, messages, employees });
  const groupOpen = enriched.filter(request => request.source_type === 'group').length;
  const chatOpen = enriched.filter(request => request.source_type !== 'group').length;
  return {
    openRequests: enriched,
    manager: {
      open_requests: enriched.length,
      group_open_requests: groupOpen,
      chat_open_requests: chatOpen,
      oldest_open_minutes: enriched.reduce((max, request) => Math.max(max, Number(request.open_minutes || 0)), 0),
      assigned_open_requests: enriched.filter(request => request.responsible_employee_name).length
    }
  };
}

function eventRank(type) {
  if (type === 'opened') return 1;
  if (type === 'note') return 2;
  if (type === 'closed') return 3;
  return 4;
}

function bestPhotoSize(photos = []) {
  return [...photos].filter(photo => photo && photo.file_id).sort((a, b) => {
    const areaA = Number(a.width || 0) * Number(a.height || 0);
    const areaB = Number(b.width || 0) * Number(b.height || 0);
    return (Number(a.file_size || areaA) || 0) - (Number(b.file_size || areaB) || 0);
  }).at(-1) || null;
}

function buildMediaPayload(kind, source = {}, extra = {}) {
  if (!source || !source.file_id) return null;
  return {
    kind,
    file_id: source.file_id,
    file_unique_id: source.file_unique_id || null,
    file_name: source.file_name || null,
    mime_type: source.mime_type || null,
    file_size: source.file_size || null,
    width: source.width || null,
    height: source.height || null,
    duration: source.duration || null,
    ...extra
  };
}

function extractMessageMedia(raw = {}) {
  if (!raw || typeof raw !== 'object' || raw.source === 'admin_send') return null;
  const photo = bestPhotoSize(raw.photo || []);
  if (photo) return buildMediaPayload('photo', photo);
  if (raw.video) {
    return buildMediaPayload('video', raw.video, {
      thumbnail_file_id: raw.video.thumbnail && raw.video.thumbnail.file_id || null
    });
  }
  if (raw.voice) return buildMediaPayload('voice', raw.voice);
  if (raw.audio) return buildMediaPayload('audio', raw.audio);
  if (raw.video_note) {
    return buildMediaPayload('video_note', raw.video_note, {
      thumbnail_file_id: raw.video_note.thumbnail && raw.video_note.thumbnail.file_id || null
    });
  }
  if (raw.animation) {
    return buildMediaPayload('animation', raw.animation, {
      thumbnail_file_id: raw.animation.thumbnail && raw.animation.thumbnail.file_id || null
    });
  }
  if (raw.document) {
    return buildMediaPayload('document', raw.document, {
      thumbnail_file_id: raw.document.thumbnail && raw.document.thumbnail.file_id || null
    });
  }
  return null;
}

function messageDirection({ message, employee }) {
  const rawSource = message.raw && message.raw.source;
  if (rawSource === 'admin_send') return 'outbound';
  if (employee) return 'outbound';
  if (['admin_reply', 'employee_message', 'ai_reply'].includes(message.classification)) return 'outbound';
  return 'inbound';
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
  const requestByInitialMessageId = new Map(enrichedRequests.map(request => [telegramIdKey(request.initial_message_id), request]).filter(([id]) => id));
  const requestByDoneMessageId = new Map(enrichedRequests.map(request => [telegramIdKey(request.done_message_id), request]).filter(([id]) => id));
  const eventRequestByMessageId = new Map(events.map(event => {
    const request = event.request_id ? requestById.get(event.request_id) : null;
    return [telegramIdKey(event.tg_message_id), request];
  }).filter(([id, request]) => id && request));
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
        actor_tg_user_id: message.from_tg_user_id || null,
        employee_id: (employee && employee.id) || message.employee_id || null,
        text: message.text || '',
        request_text: request ? request.initial_text || '' : '',
        created_at: message.created_at
      };
    });

  const timeline = [...requestTimeline, ...eventTimeline, ...replyTimeline]
    .filter(item => item.created_at || item.text)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const conversation = messages
    .map(message => {
      const employee = message.employee_id ? employeesById.get(message.employee_id) : employeesByTgId.get(telegramIdKey(message.from_tg_user_id));
      const rawSource = message.raw && message.raw.source;
      const relatedRequest = requestByInitialMessageId.get(telegramIdKey(message.tg_message_id))
        || requestByDoneMessageId.get(telegramIdKey(message.tg_message_id))
        || eventRequestByMessageId.get(telegramIdKey(message.tg_message_id))
        || null;
      const direction = messageDirection({ message, employee });
      return {
        id: message.id || null,
        message_id: message.tg_message_id || null,
        direction,
        actor_type: direction === 'outbound' ? 'employee' : 'customer',
        actor_name: (employee && employee.full_name) || message.from_name || (rawSource === 'admin_send' ? 'Admin' : 'Mijoz'),
        actor_username: (employee && employee.username) || message.from_username || '',
        actor_tg_user_id: message.from_tg_user_id || null,
        employee_id: (employee && employee.id) || message.employee_id || null,
        text: message.text || '',
        media: extractMessageMedia(message.raw),
        request_id: relatedRequest ? relatedRequest.id : null,
        request_text: relatedRequest ? relatedRequest.initial_text || '' : '',
        status: relatedRequest ? relatedRequest.status : null,
        classification: message.classification || '',
        created_at: message.created_at
      };
    })
    .filter(message => message.text || message.media || message.created_at)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

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
    conversation,
    timeline
  };
}

async function getDashboard(query = {}) {
  const [employeeStats, chatStats, openInsights, today, analytics] = await Promise.all([
    stats.selectEmployeeStatistics({ select: '*', order: 'closed_requests.desc', limit: '100' }),
    stats.selectChatStatistics({ select: '*', order: 'total_requests.desc', limit: '100' }),
    getOpenRequestInsights(),
    stats.selectTodaySummary({ select: '*' }),
    getDashboardAnalytics(query)
  ]);
  const allPeriod = analytics.periods?.all || {};
  return {
    summary: today[0] || stats.DEFAULT_SUMMARY,
    employeeStats,
    chatStats,
    openRequests: openInsights.openRequests,
    manager: {
      ...openInsights.manager,
      total_requests: allPeriod.total_requests || 0,
      closed_requests: allPeriod.closed_requests || 0,
      group_requests: allPeriod.group_requests || 0,
      private_requests: allPeriod.private_requests || 0,
      business_requests: allPeriod.business_requests || 0
    },
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
    order: supabase.order(query.orderBy || 'created_at', false)
  };
  if (query.chat_id) params.chat_id = supabase.eq(query.chat_id);
  if (query.company_id) params.company_id = supabase.eq(query.company_id);
  if (query.status) params.status = `eq.${encodeURIComponent(query.status)}`;

  const maxRows = Math.min(parseIntSafe(query.limit, 1000), 5000);
  const periodContext = query.period ? queryPeriodContext(query) : null;
  const requests = (await selectPaged('support_requests', params, { maxRows }))
    .filter(request => !periodContext || inCurrentPeriod(request.created_at, periodContext.period, periodContext.keys));

  const chatIds = [...new Set(requests.map(request => request.chat_id).filter(value => value !== undefined && value !== null))];
  const requestIds = [...new Set(requests.map(request => request.id).filter(Boolean))];
  const companyIds = [...new Set(requests.map(request => request.company_id).filter(Boolean))];

  const [chats, requestCompanies, employees, messages, events] = await Promise.all([
    chatIds.length ? selectPagedByChunks('tg_chats', {
      select: 'chat_id,title,username,source_type,company_id,last_message_at'
    }, 'chat_id', chatIds, { maxRows: 10000 }) : Promise.resolve([]),
    companyIds.length ? selectPagedByChunks('companies', {
      select: 'id,name,brand,is_active'
    }, 'id', companyIds, { maxRows: 10000 }) : Promise.resolve([]),
    selectPaged('employees', {
      select: 'id,tg_user_id,full_name,username,role,is_active'
    }, { maxRows: 10000 }),
    chatIds.length ? selectPagedByChunks('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,created_at',
      order: supabase.order('created_at', false)
    }, 'chat_id', chatIds, { maxRows: 40000 }) : Promise.resolve([]),
    requestIds.length ? selectPagedByChunks('request_events', {
      select: 'id,request_id,chat_id,tg_message_id,event_type,actor_tg_id,actor_name,employee_id,text,created_at',
      order: supabase.order('created_at', false)
    }, 'request_id', requestIds, { maxRows: 40000 }) : Promise.resolve([])
  ]);

  const chatMap = new Map(chats.map(chat => [telegramIdKey(chat.chat_id), chat]));
  const employeeMaps = buildEmployeeMaps(employees);
  const messagesByChat = new Map();
  messages.forEach(message => {
    const key = telegramIdKey(message.chat_id);
    if (!messagesByChat.has(key)) messagesByChat.set(key, []);
    messagesByChat.get(key).push(message);
  });
  const eventsByRequestId = new Map();
  events.forEach(event => {
    if (!event.request_id) return;
    const list = eventsByRequestId.get(event.request_id) || [];
    list.push(event);
    eventsByRequestId.set(event.request_id, list);
  });
  const chatCompanyIds = [...new Set(chats.map(chat => chat.company_id).filter(Boolean))];
  const missingCompanyIds = chatCompanyIds.filter(id => !companyIds.includes(id));
  const chatCompanies = missingCompanyIds.length
    ? await selectPagedByChunks('companies', {
      select: 'id,name,brand,is_active'
    }, 'id', missingCompanyIds, { maxRows: 10000 })
    : [];
  const companyMap = new Map([...requestCompanies, ...chatCompanies].map(company => [company.id, company]).filter(([id]) => id));

  return requests.map(request => {
    const chat = chatMap.get(telegramIdKey(request.chat_id)) || {};
    const companyId = request.company_id || chat.company_id || null;
    const company = companyId ? companyMap.get(companyId) : null;
    const closer = employeeMaps.byId.get(request.closed_by_employee_id) || employeeMaps.byTgId.get(telegramIdKey(request.closed_by_tg_id)) || null;
    const responsible = resolveRequestResponsibleEmployeeFromEvents(request, eventsByRequestId.get(request.id) || [], employeeMaps)
      || resolveRequestResponsibleEmployee(request, messagesByChat.get(telegramIdKey(request.chat_id)) || [], employeeMaps)
      || employeeSummary(closer);
    const responsibleName = responsible?.full_name || request.closed_by_name || '';
    return {
      ...request,
      company_id: companyId,
      company_name: company?.name || '',
      company_brand: company?.brand || '',
      chat_title: displayChatTitle(chat || { chat_id: request.chat_id }),
      responsible_employee_id: responsible?.employee_id || null,
      responsible_employee_name: responsibleName,
      responsible_employee_username: responsible?.username || '',
      support_name: responsibleName,
      support_username: responsible?.username || '',
      response_minutes: minutesBetween(request.created_at, request.closed_at)
    };
  });
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
    selectPaged('support_requests', {
      select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,closed_at,closed_by_employee_id,closed_by_tg_id,closed_by_name,done_message_id,created_at',
      chat_id: supabase.eq(chatId),
      order: supabase.order('created_at', false)
    }, { maxRows: 20000 }),
    selectPaged('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,source_type,update_kind,text,classification,employee_id,business_connection_id,raw,created_at',
      chat_id: supabase.eq(chatId),
      order: supabase.order('created_at', false)
    }, { maxRows: 20000 }),
    getEmployeeLookup()
  ]);

  const requestIds = requests.map(request => request.id).filter(Boolean);
  const events = requestIds.length
    ? await selectPagedByChunks('request_events', {
      select: 'id,request_id,chat_id,tg_message_id,event_type,actor_tg_id,actor_name,employee_id,text,raw,created_at',
      order: supabase.order('created_at', false)
    }, 'request_id', requestIds, { maxRows: 30000 })
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

function queryPeriodContext(query = {}) {
  const customPeriod = normalizeCustomPeriod(query);
  const period = customPeriod ? 'custom' : normalizePeriodKey(query.period);
  return {
    period,
    label: customPeriod?.label || period,
    keys: {
      ...currentPeriodKeys(),
      customStart: customPeriod?.start || '',
      customEnd: customPeriod?.end || ''
    }
  };
}

async function getCompanyGroupActivity(query = {}) {
  const { period, label, keys } = queryPeriodContext(query);
  const companyIdFilter = String(query.company_id || query.id || '').trim();
  const companyNameFilter = String(query.company_name || query.name || '').trim().toLowerCase();

  const [companies, chats, employeeLookup] = await Promise.all([
    selectPaged('companies', {
      select: 'id,name,brand,is_active,notes'
    }, { maxRows: 10000 }),
    selectPaged('tg_chats', {
      select: 'chat_id,title,username,type,source_type,company_id,business_connection_id,is_active,last_message_at,first_seen_at',
      source_type: 'eq.group',
      is_active: 'eq.true',
      order: supabase.order('last_message_at', false)
    }, { maxRows: 20000 }),
    getEmployeeLookup()
  ]);

  const companyMap = new Map(companies.map(company => [String(company.id || ''), company]).filter(([id]) => id));
  const linkedChats = chats.filter(chat => chat.company_id);
  const chatIds = linkedChats.map(chat => chat.chat_id).filter(value => value !== undefined && value !== null);

  const [requests, messages] = chatIds.length
    ? await Promise.all([
      selectPagedByChunks('support_requests', {
        select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,closed_at,closed_by_employee_id,closed_by_tg_id,closed_by_name,done_message_id,created_at',
        source_type: 'eq.group',
        order: supabase.order('created_at', false)
      }, 'chat_id', chatIds, { maxRows: 50000 }),
      selectPagedByChunks('messages', {
        select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,raw,created_at',
        order: supabase.order('created_at', false)
      }, 'chat_id', chatIds, { maxRows: 80000 })
    ])
    : [[], []];

  const periodMessages = messages.filter(message => inCurrentPeriod(message.created_at, period, keys));
  const requestIds = requests.map(request => request.id).filter(Boolean);
  const events = requestIds.length
    ? await selectPagedByChunks('request_events', {
      select: 'id,request_id,chat_id,tg_message_id,event_type,actor_tg_id,actor_name,employee_id,text,raw,created_at',
      order: supabase.order('created_at', true)
    }, 'request_id', requestIds, { maxRows: 50000 })
    : [];

  const eventsByRequestId = new Map();
  events.forEach(event => {
    if (!event.request_id) return;
    const list = eventsByRequestId.get(event.request_id) || [];
    list.push(event);
    eventsByRequestId.set(event.request_id, list);
  });
  const periodRequestIds = new Set(requests
    .filter(request => inCurrentPeriod(request.created_at, period, keys) || inCurrentPeriod(request.closed_at, period, keys))
    .map(request => request.id)
    .filter(Boolean));
  events
    .filter(event => inCurrentPeriod(event.created_at, period, keys))
    .forEach(event => {
      if (event.request_id) periodRequestIds.add(event.request_id);
    });
  const periodRequests = requests.filter(request => periodRequestIds.has(request.id));

  const chatMap = new Map(linkedChats.map(chat => [telegramIdKey(chat.chat_id), chat]));
  const requestsByChat = new Map();
  periodRequests.forEach(request => {
    const key = telegramIdKey(request.chat_id);
    if (!requestsByChat.has(key)) requestsByChat.set(key, []);
    requestsByChat.get(key).push(request);
  });
  const messagesByChat = new Map();
  periodMessages.forEach(message => {
    const key = telegramIdKey(message.chat_id);
    if (!messagesByChat.has(key)) messagesByChat.set(key, []);
    messagesByChat.get(key).push(message);
  });

  const requestByInitialMessageId = new Map(requests.map(request => [telegramIdKey(request.initial_message_id), request]).filter(([id]) => id));
  const requestByDoneMessageId = new Map(requests.map(request => [telegramIdKey(request.done_message_id), request]).filter(([id]) => id));
  const requestById = new Map(requests.map(request => [request.id, request]).filter(([id]) => id));
  const eventRequestByMessageId = new Map(events.map(event => {
    const request = event.request_id ? requestById.get(event.request_id) : null;
    return [telegramIdKey(event.tg_message_id), request];
  }).filter(([id, request]) => id && request));
  const employeesById = employeeLookup.byId;
  const employeesByTgId = employeeLookup.byTgId;

  const requestSummary = request => {
    const relatedEvents = [...(eventsByRequestId.get(request.id) || [])].sort((a, b) => {
      const timeDiff = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return timeDiff || eventRank(a.event_type) - eventRank(b.event_type);
    });
    const closeEvent = relatedEvents.filter(event => event.event_type === 'closed').at(-1) || null;
    const closer = closeEvent && closeEvent.employee_id ? employeesById.get(closeEvent.employee_id) : null;
    return {
      id: request.id,
      source_type: request.source_type || 'group',
      chat_id: request.chat_id,
      chat_title: displayChatTitle(chatMap.get(telegramIdKey(request.chat_id)) || { chat_id: request.chat_id }),
      company_id: request.company_id || chatMap.get(telegramIdKey(request.chat_id))?.company_id || null,
      customer_tg_id: request.customer_tg_id || null,
      customer_name: request.customer_name || telegramIdKey(request.customer_tg_id) || 'Mijoz',
      customer_username: request.customer_username || '',
      initial_message_id: request.initial_message_id || null,
      initial_text: request.initial_text || '',
      status: request.status || 'open',
      closed_by_employee_id: request.closed_by_employee_id || null,
      closed_by_tg_id: request.closed_by_tg_id || null,
      closed_by_name: request.closed_by_name || '',
      done_message_id: request.done_message_id || null,
      solution_text: closeEvent?.text || '',
      solution_by: closer?.full_name || closeEvent?.actor_name || request.closed_by_name || '',
      solution_at: closeEvent?.created_at || request.closed_at || null,
      created_at: request.created_at || null,
      closed_at: request.closed_at || null,
      events: relatedEvents.map(event => ({
        id: event.id || null,
        request_id: event.request_id || null,
        message_id: event.tg_message_id || null,
        event_type: event.event_type || '',
        actor_tg_id: event.actor_tg_id || null,
        actor_name: event.actor_name || '',
        employee_id: event.employee_id || null,
        text: event.text || '',
        media: extractMessageMedia(event.raw),
        created_at: event.created_at || null
      }))
    };
  };

  const messageSummary = message => {
    const employee = message.employee_id ? employeesById.get(message.employee_id) : employeesByTgId.get(telegramIdKey(message.from_tg_user_id));
    const relatedRequest = requestByInitialMessageId.get(telegramIdKey(message.tg_message_id))
      || requestByDoneMessageId.get(telegramIdKey(message.tg_message_id))
      || eventRequestByMessageId.get(telegramIdKey(message.tg_message_id))
      || null;
    const direction = messageDirection({ message, employee });
    return {
      id: message.id || null,
      message_id: message.tg_message_id || null,
      chat_id: message.chat_id,
      direction,
      actor_type: direction === 'outbound' ? 'employee' : 'customer',
      actor_name: employee?.full_name || message.from_name || (direction === 'outbound' ? 'Xodim' : 'Mijoz'),
      actor_username: employee?.username || message.from_username || '',
      actor_tg_user_id: message.from_tg_user_id || null,
      employee_id: employee?.id || message.employee_id || null,
      text: message.text || '',
      media: extractMessageMedia(message.raw),
      request_id: relatedRequest?.id || null,
      request_text: relatedRequest?.initial_text || '',
      status: relatedRequest?.status || null,
      classification: message.classification || '',
      created_at: message.created_at || null
    };
  };

  const groupedCompanies = new Map();
  const ensureCompany = (companyId, chat = {}) => {
    const key = String(companyId || '').trim();
    if (!key) return null;
    const company = companyMap.get(key) || { id: key, name: 'Kompaniya' };
    const current = groupedCompanies.get(key) || {
      company_id: key,
      name: company.name || 'Kompaniya',
      brand: company.brand || '',
      is_active: company.is_active !== false,
      groups: [],
      group_count: 0,
      total_messages: 0,
      total_requests: 0,
      closed_requests: 0,
      open_requests: 0,
      unique_customers: new Set(),
      last_message_at: null
    };
    if (chat.last_message_at && (!current.last_message_at || String(chat.last_message_at) > String(current.last_message_at))) {
      current.last_message_at = chat.last_message_at;
    }
    groupedCompanies.set(key, current);
    return current;
  };

  linkedChats.forEach(chat => {
    const companyId = String(chat.company_id || '').trim();
    const company = ensureCompany(companyId, chat);
    if (!company) return;

    const chatKey = telegramIdKey(chat.chat_id);
    const chatRequests = (requestsByChat.get(chatKey) || [])
      .filter(request => String(request.company_id || chat.company_id || '') === companyId)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const chatMessages = (messagesByChat.get(chatKey) || [])
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    if (!chatRequests.length && !chatMessages.length) return;

    const requestRows = chatRequests.map(requestSummary);
    const conversation = chatMessages.map(messageSummary);
    const group = {
      chat_id: chat.chat_id,
      title: displayChatTitle(chat),
      username: chat.username || '',
      source_type: 'group',
      company_id: companyId,
      last_message_at: chat.last_message_at || latestBy(chatMessages, 'created_at'),
      total_messages: conversation.length,
      total_requests: requestRows.length,
      closed_requests: requestRows.filter(request => request.status === 'closed').length,
      open_requests: requestRows.filter(request => request.status === 'open').length,
      unique_customers: new Set(requestRows.map(request => request.customer_tg_id || request.customer_name).filter(Boolean)).size,
      requests: requestRows,
      conversation
    };

    company.groups.push(group);
    company.group_count += 1;
    company.total_messages += group.total_messages;
    company.total_requests += group.total_requests;
    company.closed_requests += group.closed_requests;
    company.open_requests += group.open_requests;
    requestRows.forEach(request => {
      if (request.customer_tg_id || request.customer_name) company.unique_customers.add(request.customer_tg_id || request.customer_name);
    });
    const latestMessageAt = group.last_message_at || latestBy(chatMessages, 'created_at');
    if (latestMessageAt && (!company.last_message_at || String(latestMessageAt) > String(company.last_message_at))) {
      company.last_message_at = latestMessageAt;
    }
  });

  let rows = [...groupedCompanies.values()]
    .map(company => ({
      ...company,
      unique_customers: company.unique_customers.size,
      close_rate: percent(company.closed_requests, company.total_requests),
      groups: company.groups.sort((a, b) => String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')))
    }))
    .filter(company => company.groups.length)
    .sort((a, b) => b.total_requests - a.total_requests || b.total_messages - a.total_messages || a.name.localeCompare(b.name));

  if (companyIdFilter || companyNameFilter) {
    rows = rows.filter(company => {
      const idMatches = companyIdFilter && String(company.company_id) === companyIdFilter;
      const nameMatches = companyNameFilter && String(company.name || '').toLowerCase() === companyNameFilter;
      return idMatches || nameMatches;
    });
  }

  const summary = {
    period,
    label,
    companies: rows.length,
    groups: rows.reduce((sum, company) => sum + company.group_count, 0),
    total_messages: rows.reduce((sum, company) => sum + company.total_messages, 0),
    total_requests: rows.reduce((sum, company) => sum + company.total_requests, 0),
    closed_requests: rows.reduce((sum, company) => sum + company.closed_requests, 0),
    open_requests: rows.reduce((sum, company) => sum + company.open_requests, 0)
  };

  return { period, label, summary, companies: rows };
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
      select: 'id,closed_by_employee_id,status,chat_id,customer_name,customer_tg_id,initial_text,closed_at,created_at',
      limit: '5000'
    }).catch(() => []),
    supabase.select('tg_chats', {
      select: 'chat_id,title,source_type,business_connection_id,is_active,last_message_at',
      is_active: 'eq.true',
      limit: '5000'
    }).catch(() => []),
    supabase.select('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,business_connection_id,source_type,classification,text,created_at',
      order: supabase.order('created_at', false),
      limit: '5000'
    }).catch(() => [])
  ]);

  const today = tashkentDateKey();
  const chatMap = new Map(chats.map(chat => [telegramIdKey(chat.chat_id), chat]));
  const isToday = value => value && tashkentDateKey(value) === today;
  const chatTitle = chatId => {
    const chat = chatMap.get(telegramIdKey(chatId));
    return chat ? displayChatTitle(chat) : telegramIdKey(chatId);
  };
  const requestSummary = request => ({
    id: request.id,
    chat_id: request.chat_id,
    chat_title: chatTitle(request.chat_id),
    status: request.status,
    customer_name: request.customer_name || telegramIdKey(request.customer_tg_id) || 'Mijoz',
    customer_tg_id: request.customer_tg_id || null,
    initial_text: request.initial_text || '',
    created_at: request.created_at || null,
    closed_at: request.closed_at || null
  });
  const messageSummary = message => ({
    id: message.id || null,
    message_id: message.tg_message_id || null,
    chat_id: message.chat_id,
    chat_title: chatTitle(message.chat_id),
    text: message.text || '',
    created_at: message.created_at || null,
    classification: message.classification || ''
  });

  return employees.map(employee => {
    const related = requests.filter(request => request.closed_by_employee_id === employee.id);
    const closed = related.filter(request => request.status === 'closed');
    const directChat = chats.find(chat => isPrivateLikeChat(chat) && String(chat.chat_id) === String(employee.tg_user_id));
    const latestMessage = messages.find(message => isPrivateLikeChat(message) && String(message.from_tg_user_id) === String(employee.tg_user_id));
    const businessConnectionId = (directChat && directChat.business_connection_id) || (latestMessage && latestMessage.business_connection_id) || '';
    const employeeMessagesToday = messages.filter(message => {
      const sameEmployee = message.employee_id === employee.id || telegramIdKey(message.from_tg_user_id) === telegramIdKey(employee.tg_user_id);
      return sameEmployee && isToday(message.created_at);
    });
    const writtenGroupIds = new Set(employeeMessagesToday
      .filter(message => {
        const chat = chatMap.get(telegramIdKey(message.chat_id));
        return message.source_type === 'group' || (chat && chat.source_type === 'group');
      })
      .map(message => telegramIdKey(message.chat_id))
      .filter(Boolean));
    const todayClosed = closed.filter(request => isToday(request.closed_at));
    const relatedChatIds = new Set([
      ...writtenGroupIds,
      ...todayClosed.map(request => telegramIdKey(request.chat_id)).filter(Boolean)
    ]);
    const todayRelatedRequests = requests.filter(request => {
      const requestChatId = telegramIdKey(request.chat_id);
      const closedByEmployee = request.closed_by_employee_id === employee.id;
      return isToday(request.created_at) && (closedByEmployee || relatedChatIds.has(requestChatId));
    });
    const todayOpenRequests = todayRelatedRequests.filter(request => request.status === 'open');
    const openCustomerNames = [...new Set(todayOpenRequests.map(request => request.customer_name || request.initial_text || telegramIdKey(request.customer_tg_id)).filter(Boolean))].slice(0, 6);
    const writtenGroupNames = [...new Set([...writtenGroupIds].map(chatTitle).filter(Boolean))].slice(0, 6);
    const groupActivityIds = new Set([
      ...writtenGroupIds,
      ...todayClosed.map(request => telegramIdKey(request.chat_id)).filter(Boolean),
      ...todayOpenRequests.map(request => telegramIdKey(request.chat_id)).filter(Boolean)
    ]);
    const todayGroupActivity = [...groupActivityIds]
      .map(chatId => {
        const groupMessages = employeeMessagesToday
          .filter(message => telegramIdKey(message.chat_id) === chatId)
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          .slice(0, 20)
          .map(messageSummary);
        const groupClosed = todayClosed
          .filter(request => telegramIdKey(request.chat_id) === chatId)
          .sort((a, b) => String(b.closed_at || '').localeCompare(String(a.closed_at || '')))
          .map(requestSummary);
        const groupOpen = todayOpenRequests
          .filter(request => telegramIdKey(request.chat_id) === chatId)
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          .map(requestSummary);
        return {
          chat_id: chatId,
          title: chatTitle(chatId),
          message_count: groupMessages.length,
          closed_count: groupClosed.length,
          open_count: groupOpen.length,
          messages: groupMessages,
          closed_requests: groupClosed,
          open_requests: groupOpen
        };
      })
      .filter(group => group.message_count || group.closed_count || group.open_count)
      .sort((a, b) => (b.message_count + b.closed_count + b.open_count) - (a.message_count + a.closed_count + a.open_count));
    return {
      ...employee,
      received_requests: related.length,
      closed_requests: closed.length,
      handled_chats: new Set(related.map(request => request.chat_id).filter(Boolean)).size,
      last_closed_at: closed.map(request => request.closed_at).filter(Boolean).sort().at(-1) || null,
      today_received_requests: todayRelatedRequests.length,
      today_answered_requests: todayClosed.length,
      today_open_requests: todayOpenRequests.length,
      today_message_count: employeeMessagesToday.length,
      today_written_groups_count: writtenGroupIds.size,
      today_written_groups: writtenGroupNames,
      today_open_customers: openCustomerNames,
      today_group_activity: todayGroupActivity,
      today_open_requests_detail: todayOpenRequests
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .map(requestSummary),
      contact_chat_id: directChat ? directChat.chat_id : (latestMessage && latestMessage.chat_id) || employee.tg_user_id || null,
      business_connection_id: businessConnectionId || null,
      can_message: !!(employee.tg_user_id && (directChat || latestMessage || businessConnectionId))
    };
  });
}

function uniqueRowsBy(rows = [], keyFn) {
  const seen = new Set();
  return rows.filter(row => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePeriodKey(value = '') {
  const key = String(value || 'today').trim();
  return ['today', 'week', 'month', 'all'].includes(key) ? key : 'today';
}

async function getEmployeeActivity(query = {}) {
  const periodKey = normalizePeriodKey(query.period);
  const employeeId = String(query.employee_id || query.id || '').trim();
  const tgUserId = query.tg_user_id ? normalizeTelegramId(query.tg_user_id) : null;

  let employeeRows = [];
  if (employeeId) {
    employeeRows = await supabase.select('employees', {
      select: 'id,tg_user_id,full_name,username,phone,role,is_active',
      id: supabase.eq(employeeId),
      limit: '1'
    }).catch(() => []);
  } else if (tgUserId) {
    employeeRows = await supabase.select('employees', {
      select: 'id,tg_user_id,full_name,username,phone,role,is_active',
      tg_user_id: supabase.eq(tgUserId),
      limit: '1'
    }).catch(() => []);
  }

  const employee = employeeRows[0] || null;
  if (!employee) throw new Error('Xodim topilmadi');

  const keys = currentPeriodKeys();
  const requestSelect = 'id,source_type,chat_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,closed_at,closed_by_employee_id,closed_by_tg_id,closed_by_name,done_message_id,created_at';
  const [requestsByEmployeeId, requestsByTgId, employeeMessagesById, employeeMessagesByTg, openRequestCandidates] = await Promise.all([
    selectPaged('support_requests', {
      select: requestSelect,
      closed_by_employee_id: supabase.eq(employee.id),
      order: supabase.order('closed_at', false)
    }, { maxRows: 20000 }),
    employee.tg_user_id ? selectPaged('support_requests', {
      select: requestSelect,
      closed_by_tg_id: supabase.eq(employee.tg_user_id),
      order: supabase.order('closed_at', false)
    }, { maxRows: 20000 }) : Promise.resolve([]),
    selectPaged('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,raw,created_at',
      employee_id: supabase.eq(employee.id),
      order: supabase.order('created_at', false)
    }, { maxRows: 20000 }),
    employee.tg_user_id ? selectPaged('messages', {
      select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,raw,created_at',
      from_tg_user_id: supabase.eq(employee.tg_user_id),
      order: supabase.order('created_at', false)
    }, { maxRows: 20000 }) : Promise.resolve([]),
    selectPaged('support_requests', {
      select: requestSelect,
      status: supabase.eq('open'),
      order: supabase.order('created_at', false)
    }, { maxRows: 20000 })
  ]);

  const requests = uniqueRowsBy([...requestsByEmployeeId, ...requestsByTgId], row => row.id || `${row.chat_id}:${row.initial_message_id || row.closed_at}`);
  const closedRequests = requests
    .filter(request => request.status === 'closed')
    .filter(request => inCurrentPeriod(request.closed_at || request.created_at, periodKey, keys));
  const messages = uniqueRowsBy([...employeeMessagesById, ...employeeMessagesByTg], row => `${row.chat_id}:${row.tg_message_id || row.id}`)
    .filter(message => inCurrentPeriod(message.created_at, periodKey, keys));
  const chatIds = [...new Set([
    ...closedRequests.map(request => request.chat_id),
    ...messages.map(message => message.chat_id),
    ...openRequestCandidates
      .filter(request => request.status === 'open' && inCurrentPeriod(request.created_at, periodKey, keys))
      .map(request => request.chat_id)
  ].filter(value => value !== undefined && value !== null))];
  const [chats, allChatMessages, allEmployees] = chatIds.length
    ? await Promise.all([
      selectPagedByChunks('tg_chats', {
        select: 'chat_id,title,username,source_type,last_message_at',
      }, 'chat_id', chatIds, { maxRows: 10000 }),
      selectPagedByChunks('messages', {
        select: 'id,tg_message_id,chat_id,from_tg_user_id,from_name,from_username,employee_id,source_type,classification,text,raw,created_at',
        order: supabase.order('created_at', false)
      }, 'chat_id', chatIds, { maxRows: 40000 }),
      selectPaged('employees', {
        select: 'id,tg_user_id,full_name,username,role,is_active',
      }, { maxRows: 10000 })
    ])
    : [[], [], []];
  const chatMap = new Map(chats.map(chat => [telegramIdKey(chat.chat_id), chat]));
  const messagesByChat = new Map();
  allChatMessages.forEach(message => {
    const key = telegramIdKey(message.chat_id);
    if (!messagesByChat.has(key)) messagesByChat.set(key, []);
    messagesByChat.get(key).push(message);
  });
  const employeeMaps = buildEmployeeMaps(allEmployees.length ? allEmployees : [employee]);
  const selectedEmployeeId = String(employee.id || '').trim();
  const selectedTgUserId = telegramIdKey(employee.tg_user_id);
  const isEmployeePrivateChatId = chatId => {
    const key = telegramIdKey(chatId);
    const chat = chatMap.get(key) || {};
    return employeeMaps.tgIds.has(key) && isPrivateLikeChat({ source_type: chat.source_type || 'private' });
  };
  function requestResponsibleMatchesEmployee(request = {}) {
    const responsible = resolveRequestResponsibleEmployee(request, messagesByChat.get(telegramIdKey(request.chat_id)) || [], employeeMaps);
    if (!responsible) return false;
    if (selectedEmployeeId && String(responsible.employee_id || '') === selectedEmployeeId) return true;
    return Boolean(selectedTgUserId && telegramIdKey(responsible.tg_user_id) === selectedTgUserId);
  }
  function isSelectedEmployeeMessage(message = {}) {
    if (selectedEmployeeId && String(message.employee_id || '') === selectedEmployeeId) return true;
    return Boolean(selectedTgUserId && telegramIdKey(message.from_tg_user_id) === selectedTgUserId);
  }
  function isOtherEmployeeMessage(message = {}) {
    const messageEmployee = employeeMaps.byId.get(message.employee_id) || employeeMaps.byTgId.get(telegramIdKey(message.from_tg_user_id));
    return Boolean(messageEmployee && !isSelectedEmployeeMessage(message));
  }
  const periodOpenRequests = openRequestCandidates
    .filter(request => request.status === 'open' && inCurrentPeriod(request.created_at, periodKey, keys))
    .filter(requestResponsibleMatchesEmployee);
  const visibleClosedRequests = closedRequests.filter(request => !isEmployeePrivateChatId(request.chat_id));
  const visibleMessages = messages.filter(message => !isEmployeePrivateChatId(message.chat_id));
  const visibleOpenRequests = periodOpenRequests.filter(request => !isEmployeePrivateChatId(request.chat_id));
  const visibleChatIdKeys = new Set([
    ...visibleClosedRequests,
    ...visibleOpenRequests,
    ...visibleMessages
  ].map(item => telegramIdKey(item.chat_id)).filter(Boolean));
  const visibleChatMessages = uniqueRowsBy(allChatMessages, message => `${message.chat_id}:${message.tg_message_id || message.id}`)
    .filter(message => visibleChatIdKeys.has(telegramIdKey(message.chat_id)))
    .filter(message => inCurrentPeriod(message.created_at, periodKey, keys))
    .filter(message => !isEmployeePrivateChatId(message.chat_id))
    .filter(message => !isOtherEmployeeMessage(message));
  const visibleRequestIds = [...new Set([
    ...visibleClosedRequests,
    ...visibleOpenRequests
  ].map(request => request.id).filter(Boolean))];
  const visibleRequestEvents = visibleRequestIds.length
    ? await selectPagedByChunks('request_events', {
      select: 'id,request_id,chat_id,tg_message_id,event_type,actor_tg_id,actor_name,employee_id,text,raw,created_at',
      order: supabase.order('created_at', true)
    }, 'request_id', visibleRequestIds, { maxRows: 40000 })
    : [];
  const eventsByRequestId = new Map();
  visibleRequestEvents.forEach(event => {
    if (!event.request_id) return;
    const list = eventsByRequestId.get(event.request_id) || [];
    list.push(event);
    eventsByRequestId.set(event.request_id, list);
  });
  const chatTitle = chatId => displayChatTitle(chatMap.get(telegramIdKey(chatId)) || { chat_id: chatId });
  const eventSummary = event => ({
    id: event.id || null,
    request_id: event.request_id || null,
    message_id: event.tg_message_id || null,
    chat_id: event.chat_id,
    chat_title: chatTitle(event.chat_id),
    event_type: event.event_type || '',
    actor_tg_id: event.actor_tg_id || null,
    actor_name: event.actor_name || '',
    employee_id: event.employee_id || null,
    text: event.text || '',
    media: extractMessageMedia(event.raw),
    created_at: event.created_at || null
  });
  const requestSummary = request => ({
    id: request.id,
    source_type: request.source_type || chatMap.get(telegramIdKey(request.chat_id))?.source_type || '',
    chat_id: request.chat_id,
    chat_title: chatTitle(request.chat_id),
    customer_name: request.customer_name || telegramIdKey(request.customer_tg_id) || 'Mijoz',
    customer_username: request.customer_username || '',
    customer_tg_id: request.customer_tg_id || null,
    initial_message_id: request.initial_message_id || null,
    initial_text: request.initial_text || '',
    status: request.status,
    closed_by_employee_id: request.closed_by_employee_id || null,
    closed_by_tg_id: request.closed_by_tg_id || null,
    closed_by_name: request.closed_by_name || '',
    done_message_id: request.done_message_id || null,
    created_at: request.created_at || null,
    closed_at: request.closed_at || null,
    events: (eventsByRequestId.get(request.id) || []).map(eventSummary)
  });
  const messageSummary = message => ({
    id: message.id || null,
    message_id: message.tg_message_id || null,
    chat_id: message.chat_id,
    chat_title: chatTitle(message.chat_id),
    from_tg_user_id: message.from_tg_user_id || null,
    from_name: message.from_name || '',
    from_username: message.from_username || '',
    employee_id: message.employee_id || null,
    text: message.text || '',
    media: extractMessageMedia(message.raw),
    classification: message.classification || '',
    created_at: message.created_at || null
  });

  const grouped = new Map();
  const ensureGroup = chatId => {
    const key = telegramIdKey(chatId);
    const chat = chatMap.get(key) || {};
    const current = grouped.get(key) || {
      chat_id: chatId,
      title: chatTitle(chatId),
      source_type: chat.source_type || 'private',
      username: chat.username || '',
      last_message_at: chat.last_message_at || null,
      message_count: 0,
      closed_count: 0,
      open_count: 0,
      customers: new Set(),
      messages: [],
      chat_messages: [],
      closed_requests: [],
      open_requests: []
    };
    grouped.set(key, current);
    return current;
  };

  visibleClosedRequests.forEach(request => {
    const group = ensureGroup(request.chat_id);
    group.closed_count += 1;
    if (request.customer_name || request.customer_tg_id) group.customers.add(request.customer_name || telegramIdKey(request.customer_tg_id));
    group.closed_requests.push(requestSummary(request));
  });
  visibleMessages.forEach(message => {
    const group = ensureGroup(message.chat_id);
    group.message_count += 1;
    group.messages.push(messageSummary(message));
  });
  visibleChatMessages.forEach(message => {
    const group = ensureGroup(message.chat_id);
    group.chat_messages.push(messageSummary(message));
  });
  visibleOpenRequests.forEach(request => {
    const group = ensureGroup(request.chat_id);
    group.open_count += 1;
    if (request.customer_name || request.customer_tg_id) group.customers.add(request.customer_name || telegramIdKey(request.customer_tg_id));
    group.open_requests.push(requestSummary(request));
  });

  const groups = [...grouped.values()]
    .map(group => ({
      ...group,
      customers: [...group.customers],
      customer_count: group.customers.size,
      messages: group.messages.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      chat_messages: group.chat_messages.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      closed_requests: group.closed_requests.sort((a, b) => String(b.closed_at || '').localeCompare(String(a.closed_at || ''))),
      open_requests: group.open_requests.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    }))
    .sort((a, b) => (b.closed_count + b.open_count + b.message_count) - (a.closed_count + a.open_count + a.message_count));

  return {
    employee,
    period: periodKey,
    summary: {
      handled_chats: groups.length,
      message_count: visibleMessages.length,
      closed_requests: visibleClosedRequests.length,
      open_requests: visibleOpenRequests.length,
      customer_count: new Set([...visibleClosedRequests, ...visibleOpenRequests].map(request => request.customer_tg_id || request.customer_name).filter(Boolean)).size
    },
    groups,
    closed_requests: visibleClosedRequests.map(requestSummary),
    open_requests: visibleOpenRequests.map(requestSummary),
    messages: visibleMessages.map(messageSummary),
    chat_messages: visibleChatMessages.map(messageSummary)
  };
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

function telegramDescription(error = {}) {
  return String(error.telegram?.description || error.message || '');
}

function isBusinessPeerInvalid(error = {}) {
  return /BUSINESS_PEER_INVALID/i.test(telegramDescription(error));
}

function isReplyTargetInvalid(error = {}) {
  return /reply message not found|message to be replied not found|replied message not found/i.test(telegramDescription(error));
}

function friendlyTelegramSendError(error = {}) {
  if (isBusinessPeerInvalid(error)) {
    return new Error('Telegram bu biznes chatga eski ulanish orqali javob yuborishga ruxsat bermadi. Mijoz bot bilan qayta yozishishi yoki biznes ulanishi yangilanishi kerak.');
  }
  return error;
}

async function sendRegularMessageWithFallback(chatId, text, options = {}) {
  try {
    return await sendMessage(chatId, text, options);
  } catch (error) {
    if (options.reply_to_message_id && isReplyTargetInvalid(error)) {
      const fallbackOptions = { ...options };
      delete fallbackOptions.reply_to_message_id;
      return sendMessage(chatId, text, fallbackOptions);
    }
    throw error;
  }
}

async function deliverTelegramText({ businessConnectionId, chatId, text, options = {} }) {
  if (!businessConnectionId) {
    return {
      result: await sendRegularMessageWithFallback(chatId, text, options),
      businessConnectionId: null
    };
  }

  try {
    return {
      result: await sendBusinessMessage(businessConnectionId, chatId, text, options),
      businessConnectionId
    };
  } catch (error) {
    let sendError = error;
    if (options.reply_to_message_id && isReplyTargetInvalid(error)) {
      const fallbackOptions = { ...options };
      delete fallbackOptions.reply_to_message_id;
      try {
        return {
          result: await sendBusinessMessage(businessConnectionId, chatId, text, fallbackOptions),
          businessConnectionId
        };
      } catch (replyFallbackError) {
        sendError = replyFallbackError;
        if (!isBusinessPeerInvalid(sendError)) throw friendlyTelegramSendError(sendError);
      }
    }
    if (!isBusinessPeerInvalid(sendError)) throw friendlyTelegramSendError(sendError);
    try {
      return {
        result: await sendRegularMessageWithFallback(chatId, text, options),
        businessConnectionId: null,
        fallback_from_business: true
      };
    } catch (_fallbackError) {
      throw friendlyTelegramSendError(error);
    }
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

function contentTypeFromPath(filePath = '') {
  const lower = String(filePath).toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

async function sendTelegramFile(query, res) {
  const fileId = String(query.file_id || '').trim();
  if (!fileId) throw new Error('file_id majburiy');
  const file = await getFile(fileId);
  if (!file || !file.file_path) throw new Error('Telegram fayl topilmadi');

  const response = await downloadFile(file.file_path);
  res.statusCode = 200;
  res.setHeader('Content-Type', response.headers.get('content-type') || contentTypeFromPath(file.file_path));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  const contentLength = response.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  if (response.body && Readable.fromWeb) {
    await new Promise((resolve, reject) => {
      Readable.fromWeb(response.body)
        .on('error', reject)
        .pipe(res)
        .on('error', reject)
        .on('finish', resolve);
    });
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}

async function sendTelegramProfilePhoto(query, res) {
  const tgUserId = normalizeTelegramId(query.tg_user_id || query.user_id);
  if (!tgUserId) throw new Error('tg_user_id majburiy');
  const profile = await getUserProfilePhotos(tgUserId, { limit: 1 });
  const photo = bestPhotoSize(profile?.photos?.[0] || []);
  if (!photo?.file_id) throw new Error('Telegram profil rasmi topilmadi');
  await sendTelegramFile({ file_id: photo.file_id }, res);
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
  const delivery = await deliverTelegramText({
    businessConnectionId,
    chatId: body.chat_id,
    text: body.text
  });
  const result = delivery.result;
  const usedBusinessConnectionId = delivery.businessConnectionId;

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
      business_connection_id: usedBusinessConnectionId,
      raw: { source: 'admin_send', created_by: body.created_by || 'admin', telegram: result, fallback_from_business: !!delivery.fallback_from_business },
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
  return { sent: true, telegram: result, fallback_from_business: !!delivery.fallback_from_business };
}

async function replyToRequest(body, currentAdmin = {}) {
  const requestId = body.request_id || body.id;
  const text = String(body.text || '').trim();
  if (!requestId || !text) throw new Error('request_id va text majburiy');

  const requests = await supabase.select('support_requests', {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,business_connection_id,created_at',
    id: supabase.eq(requestId),
    limit: '1'
  });
  const request = requests[0];
  if (!request) throw new Error('So‘rov topilmadi');
  if (request.status !== 'open') throw new Error('Bu so‘rov allaqachon yopilgan');

  const chats = await supabase.select('tg_chats', {
    select: 'chat_id,title,source_type,business_connection_id',
    chat_id: supabase.eq(request.chat_id),
    limit: '1'
  }).catch(() => []);
  const chat = chats[0] || {};
  const businessConnectionId = body.business_connection_id || request.business_connection_id || chat.business_connection_id || null;
  const sendOptions = request.initial_message_id ? { reply_to_message_id: request.initial_message_id } : {};
  const delivery = await deliverTelegramText({
    businessConnectionId,
    chatId: request.chat_id,
    text,
    options: sendOptions
  });
  const telegramResult = delivery.result;
  const usedBusinessConnectionId = delivery.businessConnectionId;

  const actorName = currentAdmin.full_name || currentAdmin.username || 'admin';
  const closedAt = nowIso();
  const [closedRows] = await Promise.all([
    supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
      status: 'closed',
      closed_at: closedAt,
      closed_by_employee_id: null,
      closed_by_tg_id: null,
      closed_by_name: actorName,
      done_message_id: telegramResult && telegramResult.message_id || null
    }),
    telegramResult && telegramResult.message_id ? supabase.insert('messages', [{
      tg_message_id: telegramResult.message_id,
      chat_id: request.chat_id,
      from_tg_user_id: null,
      from_name: actorName,
      from_username: currentAdmin.username || null,
      source_type: request.source_type || chat.source_type || 'private',
      update_kind: 'admin_request_reply',
      text,
      classification: 'admin_reply',
      employee_id: null,
      business_connection_id: usedBusinessConnectionId,
      raw: { source: 'admin_request_reply', request_id: request.id, created_by: currentAdmin.username || 'admin', telegram: telegramResult, fallback_from_business: !!delivery.fallback_from_business },
      created_at: closedAt
    }], { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: 'return=minimal' }).catch(() => null) : Promise.resolve(null),
    supabase.insert('request_events', [{
      request_id: request.id,
      chat_id: request.chat_id,
      tg_message_id: telegramResult && telegramResult.message_id || null,
      event_type: 'closed',
      actor_tg_id: null,
      actor_name: actorName,
      employee_id: null,
      text,
      raw: { source: 'admin_request_reply', request_id: request.id, created_by: currentAdmin.username || 'admin', telegram: telegramResult, fallback_from_business: !!delivery.fallback_from_business },
      created_at: closedAt
    }], { prefer: 'return=minimal' }).catch(() => null)
  ]);

  return {
    sent: true,
    request_id: request.id,
    chat_id: request.chat_id,
    telegram: telegramResult,
    fallback_from_business: !!delivery.fallback_from_business,
    request: closedRows[0] || { ...request, status: 'closed', closed_at: closedAt, closed_by_name: actorName }
  };
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

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function externalCompanyMarker(company = {}) {
  const externalId = company.external_id || company.externalCompanyId || company.uyqur_company_id || company.id;
  return externalId !== undefined && externalId !== null && externalId !== ''
    ? `Uyqur API ID: ${externalId}`
    : '';
}

async function ensureAssignableCompany(body = {}) {
  const companyId = String(body.company_id || '').trim();
  if (isUuid(companyId)) return { id: companyId };

  const source = body.company && typeof body.company === 'object' ? body.company : body;
  const name = String(source.name || source.company_name || '').trim();
  if (!name) throw new Error('Kompaniya nomi majburiy');

  const existing = await supabase.select('companies', {
    select: 'id,name,phone,notes,is_active',
    name: supabase.eq(name),
    limit: '20'
  }).catch(() => []);
  const marker = externalCompanyMarker(source);
  const existingCompany = marker
    ? existing.find(company => String(company.notes || '').includes(marker)) || existing[0]
    : existing[0];
  const notes = [marker, source.brand ? `Brand: ${source.brand}` : '', source.director ? `Direktor: ${source.director}` : '']
    .filter(Boolean)
    .join('\n') || null;
  const values = {
    name,
    legal_name: source.legal_name || source.brand || null,
    phone: source.phone || null,
    notes,
    is_active: source.is_active !== false
  };

  if (existingCompany) {
    const rows = await supabase.patch('companies', { id: supabase.eq(existingCompany.id) }, values).catch(() => [existingCompany]);
    return rows[0] || existingCompany;
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
  if (!body.chat_id) throw new Error('chat_id majburiy');
  const chatId = normalizeTelegramId(body.chat_id);
  if (body.company_id === null || body.company_id === '' || body.clear === true) {
    const rows = await supabase.patch('tg_chats', { chat_id: supabase.eq(chatId) }, { company_id: null });
    return rows[0] || { chat_id: chatId, company_id: null };
  }

  const company = await ensureAssignableCompany(body);
  if (!company || !company.id) throw new Error('Kompaniya biriktirish uchun tayyorlanmadi');
  const rows = await supabase.patch('tg_chats', { chat_id: supabase.eq(chatId) }, { company_id: company.id });
  return { ...(rows[0] || { chat_id: chatId }), assigned_company: company, company_id: company.id };
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

async function notifyAutoReplyChange(settings = {}, enabled) {
  const chatId = settings.mainGroupId || await resolveMainStatsChatId().catch(() => '');
  if (!chatId) return;

  const lines = enabled
    ? [
      '⚡️ <b>Avto javob rejimi yoqildi</b>',
      '',
      'Bot endi avtomatik ravishda AI yoki ichki bilim bazasi asosida javob qaytaradi.',
      'Guruh va chat so‘rovlari main guruhga xabar yuborildi.'
    ]
    : [
      '⚡️ <b>Avto javob rejimi o‘chirildi</b>',
      '',
      'Bot endi avtomatik javob bermaydi.',
      'So‘rovlar standart yordam oqimiga qaytadi.'
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

function hasSetting(rows = [], key) {
  return rows.some(item => item && item.key === key);
}

async function prepareAiIntegrationForSave(previousIntegration = {}, nextValue = {}) {
  const config = mergeAiIntegration(previousIntegration, nextValue);

  if (!config.enabled) {
    return {
      ...config,
      last_check_status: 'disabled',
      last_checked_at: '',
      last_check_error: ''
    };
  }

  if (!isAiIntegrationConfigured(config)) {
    return {
      ...config,
      last_check_status: 'incomplete',
      last_checked_at: '',
      last_check_error: config.model || config.has_api_key ? 'AI base URL, model va API token to‘liq kiritilishi kerak' : ''
    };
  }

  try {
    await testAiIntegration(config);
    return {
      ...config,
      last_check_status: 'ok',
      last_checked_at: nowIso(),
      last_check_error: ''
    };
  } catch (error) {
    const message = `AI ulanish tekshiruvidan o‘tmadi: ${error.message}`;
    const validationError = new Error(message);
    validationError.code = 'AI_CONNECTION_FAILED';
    throw validationError;
  }
}

async function updateSettings(body) {
  const items = Array.isArray(body.settings) ? body.settings : [];
  if (!items.length) return [];
  const previousRows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: 'in.(ai_mode,ai_integration,log_notifications,auto_reply,done_tag,request_detection,main_group)'
  }).catch(() => []);
  const previousSettings = normalizeSettings(previousRows || []);
  const previousAutoReplyExists = hasSetting(previousRows, 'auto_reply');
  const autoReplySubmitted = items.some(item => item && item.key === 'auto_reply');
  const aiIntegrationSubmitted = items.some(item => item && item.key === 'ai_integration');
  const logNotificationsSubmitted = items.some(item => item && item.key === 'log_notifications');
  const previousIntegration = normalizeAiIntegration(settingValue(previousRows, 'ai_integration'));
  const previousIntegrationReady = isAiIntegrationReady(previousIntegration);
  const previousIntegrationSignature = aiIntegrationSignature(previousIntegration);
  const timestamp = nowIso();
  const rows = [];
  for (const item of items) {
    const value = item.key === 'ai_integration'
      ? await prepareAiIntegrationForSave(previousIntegration, item.value)
      : item.value;
    rows.push({ key: item.key, value, updated_at: timestamp });
  }
  const mergedRows = new Map((previousRows || []).map(row => [row.key, row]));
  rows.forEach(row => mergedRows.set(row.key, row));
  const nextSettings = normalizeSettings([...mergedRows.values()]);
  if (nextSettings.aiProvider && !isAiIntegrationReady(nextSettings.aiIntegration)) {
    const error = new Error('AI model ishlashi tekshirilmagan. Avval AI integratsiyani to‘g‘ri token, base URL va model bilan saqlang.');
    error.code = 'AI_CONNECTION_FAILED';
    throw error;
  }

  const savedRows = await supabase.insert('bot_settings', rows, { upsert: true, onConflict: 'key' });
  clearBotSettingsCache();

  if (!previousSettings.aiMode && nextSettings.aiMode) {
    await notifyAiModeChange(nextSettings, true).catch(error => console.error('[admin:ai-mode-notice:error]', error));
  }
  if (previousSettings.aiMode && !nextSettings.aiMode) {
    await notifyAiModeChange(nextSettings, false).catch(error => console.error('[admin:ai-mode-notice:error]', error));
  }
  if (autoReplySubmitted && (!previousAutoReplyExists || previousSettings.autoReply !== nextSettings.autoReply)) {
    await notifyAutoReplyChange(nextSettings, nextSettings.autoReply).catch(error => console.error('[admin:auto-reply-notice:error]', error));
  }
  const nextIntegrationReady = isAiIntegrationReady(nextSettings.aiIntegration);
  const integrationChanged = previousIntegrationSignature !== aiIntegrationSignature(nextSettings.aiIntegration);
  if (aiIntegrationSubmitted && nextIntegrationReady && (!previousIntegrationReady || integrationChanged)) {
    await notifyAiIntegrationConnected(nextSettings).catch(error => console.error('[admin:ai-integration-notice:error]', error));
  }
  if (logNotificationsSubmitted) {
    await notifyOperationalLog('info', 'admin:log-notifications', 'Log yuborish sozlamalari yangilandi', {
      enabled: nextSettings.logNotifications.enabled,
      levels: nextSettings.logNotifications.levels,
      target: nextSettings.logNotifications.target
    }).catch(error => console.error('[admin:log-notifications-notice:error]', error));
  }
  if (aiIntegrationSubmitted) {
    await notifyOperationalLog('info', 'admin:ai-integration', 'Integratsiya sozlamalari saqlandi', {
      provider: nextSettings.aiIntegration.provider,
      model: nextSettings.aiIntegration.model,
      status: nextSettings.aiIntegration.last_check_status
    }).catch(error => console.error('[admin:ai-integration-log:error]', error));
  }

  return savedRows.map(row => row.key === 'ai_integration'
    ? { ...row, value: sanitizeAiIntegration(row.value) }
    : row);
}

async function extractAiKnowledge(body = {}) {
  return extractTextFromUpload(body.file || body);
}

async function sendTestLogNotification(body = {}, currentAdmin = {}) {
  const level = body.level === 'error' ? 'error' : 'info';
  return notifyOperationalLog(level, 'admin:test-log', body.message || 'Test log xabari', {
    admin: currentAdmin.username || currentAdmin.full_name || 'admin',
    source: 'webapp'
  });
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
    case 'dashboard': return getDashboard(query);
    case 'stats': return getDashboard(query);
    case 'groups': return listGroups(query);
    case 'privates': return listPrivateChats(query);
    case 'requests': return listRequests(query);
    case 'chatDetail': return getChatDetail(query);
    case 'companyGroupActivity': return getCompanyGroupActivity(query);
    case 'companies': return listCompanies(query);
    case 'companyInfo': return fetchCompanyInfo();
    case 'employees': return listEmployees(query);
    case 'employeeActivity': return getEmployeeActivity(query);
    case 'settings': return listSettings();
    case 'telegramWebhookInfo': return getTelegramWebhookStatus();
    default: throw new Error(`Unknown GET action: ${action}`);
  }
}

async function handlePost(action, body, currentAdmin) {
  switch (action) {
    case 'sendMessage': return sendToChat({ ...body, created_by: currentAdmin.username });
    case 'replyRequest': return replyToRequest(body, currentAdmin);
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
    case 'testLogNotification': return sendTestLogNotification(body, currentAdmin);
    case 'setTelegramWebhook': return connectTelegramWebhook(body);
    default: throw new Error(`Unknown POST action: ${action}`);
  }
}

async function handler(req, res) {
  if (allowCors(req, res)) return;
  let action = 'unknown';

  try {
    const query = getQuery(req);
    action = query.action || 'dashboard';

    if (req.method === 'POST' && action === 'login') {
      const body = await readBody(req);
      const result = await login(body.username, body.password);
      return sendJson(res, 200, { ok: true, ...result });
    }

    const currentAdmin = requireAdmin(req);

    if (req.method === 'GET') {
      if (action === 'telegramFile') {
        await sendTelegramFile(query, res);
        return;
      }
      if (action === 'telegramProfilePhoto') {
        await sendTelegramProfilePhoto(query, res);
        return;
      }
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
    notifyOperationalError('admin:error', error, { action, method: req.method }).catch(logError => console.error('[admin:notify-log:error]', logError));
    const status = error.code === 'AI_CONNECTION_FAILED'
      ? 400
      : (/token|login|parol|authorization/i.test(error.message) ? 401 : 400);
    return sendJson(res, status, { ok: false, error: error.message });
  }
}

module.exports = handler;
