'use strict';

const supabase = require('./supabase');
const { getBotSettings } = require('./bot-settings');
const { getCachedCompanyInfo } = require('./company-info');
const { sendMessage, editMessageText, escapeHtml } = require('./telegram');

const TICKET_PREFIX = 'tk:';
const TICKET_ACTIONS = Object.freeze({
  ACCEPT: 'a',
  CLOSE: 'c',
  REASSIGN: 'r',
  REASSIGN_SELECT: 'rs',
  REASSIGN_BACK: 'rb',
  NOT_REQUEST: 'x'
});

const REQUEST_SELECT = [
  'id',
  'chat_id',
  'company_id',
  'customer_name',
  'customer_username',
  'initial_message_id',
  'initial_text',
  'status',
  'open_source',
  'opened_by_employee_id',
  'assigned_to_employee_id',
  'assigned_at',
  'notification_chat_id',
  'notification_message_id',
  'created_at'
].join(',');

function normalizeTicketNotifications(value = {}) {
  return {
    enabled: value.enabled === true,
    target_chat_id: String(value.target_chat_id || value.targetChatId || '').trim(),
    notify_on_ai: value.notify_on_ai !== false && value.notifyOnAi !== false,
    notify_on_reaction: value.notify_on_reaction !== false && value.notifyOnReaction !== false
  };
}

function telegramMessageLink(chat = {}, messageId) {
  if (!messageId) return '';
  if (chat.username) return `https://t.me/${String(chat.username).replace(/^@/, '')}/${messageId}`;
  const raw = String(chat.id || '');
  const key = raw.startsWith('-100') ? raw.slice(4) : raw.replace(/^-/, '');
  if (key) return `https://t.me/c/${key}/${messageId}`;
  return '';
}

function truncateText(value = '', max = 320) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function employeeLabel(employee = null, fallback = '—') {
  if (!employee) return fallback;
  return String(employee.full_name || employee.username || fallback).trim() || fallback;
}

function normalizeUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

async function loadEmployeeById(employeeId) {
  if (!employeeId) return null;
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,is_active',
    id: supabase.eq(employeeId),
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function loadEmployeeByUsername(username = '') {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,is_active',
    username: supabase.ilike(normalized),
    is_active: 'eq.true',
    limit: '5'
  }).catch(() => []);
  return rows.find(row => normalizeUsername(row.username) === normalized) || rows[0] || null;
}

async function loadChatRow(chatId) {
  if (!chatId) return null;
  const rows = await supabase.select('tg_chats', {
    select: 'chat_id,type,title,username,company_id',
    chat_id: supabase.eq(chatId),
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function loadCompanyContext(companyId) {
  if (!companyId) return { name: 'Biriktirilmagan', supportEmployee: null };
  const rows = await supabase.select('companies', {
    select: 'id,name',
    id: supabase.eq(companyId),
    limit: '1'
  }).catch(() => []);
  const company = rows[0] || null;
  let supportEmployee = null;
  let externalName = '';

  const cached = await getCachedCompanyInfo().catch(() => null);
  const externalRows = cached && Array.isArray(cached.companies) ? cached.companies : [];
  const external = externalRows.find(row => String(row.id || '') === String(companyId))
    || externalRows.find(row => String(row.name || '').trim() === String(company?.name || '').trim());
  if (external) {
    externalName = String(external.name || '').trim();
    supportEmployee = await loadEmployeeByUsername(external.uyqur_support_username);
  }

  return {
    name: company?.name || externalName || 'Biriktirilmagan',
    supportEmployee
  };
}

async function loadRequestById(requestId) {
  if (!requestId) return null;
  const rows = await supabase.select('support_requests', {
    select: REQUEST_SELECT,
    id: supabase.eq(requestId),
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

function openSourceLabel(source = '') {
  if (source === 'reaction') return '👀 Xodim belgiladi';
  if (source === 'ai') return '🤖 AI avtomatik';
  return 'Qo‘lda';
}

function ticketCallbackData(action, requestId, extra = '') {
  const base = `${TICKET_PREFIX}${action}:${requestId}`;
  return extra ? `${base}:${extra}` : base;
}

function parseTicketCallbackData(data = '') {
  const raw = String(data || '').trim();
  if (!raw.startsWith(TICKET_PREFIX)) return null;
  const body = raw.slice(TICKET_PREFIX.length);
  const parts = body.split(':');
  const action = parts[0] || '';
  const requestId = parts[1] || '';
  if (!requestId) return null;
  return { action, requestId, extra: parts.slice(2).join(':') || '' };
}

function buildTicketKeyboard(request = {}, mode = 'main') {
  const id = request.id;
  if (mode === 'reassign') {
    return { inline_keyboard: [[{ text: '◀️ Orqaga', callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN_BACK, id) }]] };
  }
  return {
    inline_keyboard: [
      [
        { text: '✅ Qabul qilish', callback_data: ticketCallbackData(TICKET_ACTIONS.ACCEPT, id) },
        { text: '🔒 Yopish', callback_data: ticketCallbackData(TICKET_ACTIONS.CLOSE, id) }
      ],
      [
        { text: '👤 Boshqa hodimga', callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN, id) },
        { text: '❌ So‘rov emas', callback_data: ticketCallbackData(TICKET_ACTIONS.NOT_REQUEST, id) }
      ]
    ]
  };
}

async function buildReassignKeyboard(request = {}, page = 0) {
  const pageSize = 6;
  const employees = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,is_active',
    is_active: 'eq.true',
    order: supabase.order('full_name', true),
    limit: '500'
  }).catch(() => []);
  const filtered = employees.filter(row => row.id !== request.assigned_to_employee_id);
  const start = page * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const rows = slice.map(employee => [{
    text: employeeLabel(employee, employee.username || 'Xodim'),
    callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN_SELECT, request.id, String(employee.tg_user_id || employee.id))
  }]);
  const nav = [];
  if (start > 0) {
    nav.push({ text: '◀️', callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN, request.id, String(page - 1)) });
  }
  if (start + pageSize < filtered.length) {
    nav.push({ text: '▶️', callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN, request.id, String(page + 1)) });
  }
  if (nav.length) rows.push(nav);
  rows.push([{ text: '◀️ Orqaga', callback_data: ticketCallbackData(TICKET_ACTIONS.REASSIGN_BACK, request.id) }]);
  return { inline_keyboard: rows };
}

async function buildNotificationText({ request, chat, company, openedByEmployee, assignedEmployee }) {
  const companySupport = employeeLabel(company.supportEmployee, '—');
  const markedBy = employeeLabel(openedByEmployee, '—');
  const assigned = employeeLabel(assignedEmployee, '—');
  const link = telegramMessageLink(chat, request.initial_message_id);
  const statusLabel = request.status === 'closed'
    ? '🔒 Yopilgan'
    : request.status === 'cancelled'
      ? '❌ So‘rov emas'
      : '🚨 Yangi Ticket';
  const lines = [
    `<b>${statusLabel}</b>`,
    '',
    `🏢 <b>Kompaniya:</b> ${escapeHtml(company.name)}`,
    `👤 <b>Kompaniya mas'uli:</b> ${escapeHtml(companySupport)}`,
    openedByEmployee ? `👁 <b>Belgilagan:</b> ${escapeHtml(markedBy)}` : null,
    assignedEmployee ? `✅ <b>Mas'ul (ishlayapti):</b> ${escapeHtml(assigned)}` : null,
    `📩 <b>Murojaat:</b> ${escapeHtml(truncateText(request.initial_text))}`,
    link ? `🔗 <a href="${escapeHtml(link)}">Xabarni Telegramda ochish</a>` : null,
    `📌 <b>Manba:</b> ${escapeHtml(openSourceLabel(request.open_source))}`,
    `👥 <b>Mijoz:</b> ${escapeHtml(request.customer_name || request.customer_username || '—')}`
  ].filter(Boolean);
  return lines.join('\n');
}

async function saveTicketNotification({ requestId, chatId, messageId }) {
  await supabase.insert('ticket_notifications', [{
    request_id: requestId,
    chat_id: chatId,
    message_id: messageId
  }], { upsert: true, onConflict: 'request_id', prefer: 'return=minimal' }).catch(() => null);
  await supabase.patch('support_requests', { id: supabase.eq(requestId) }, {
    notification_chat_id: chatId,
    notification_message_id: messageId
  }).catch(() => null);
}

async function refreshTicketNotificationMessage(request = {}) {
  const chatId = request.notification_chat_id;
  const messageId = request.notification_message_id;
  if (!chatId || !messageId) return;
  const chat = await loadChatRow(request.chat_id);
  const company = await loadCompanyContext(request.company_id);
  const openedByEmployee = await loadEmployeeById(request.opened_by_employee_id);
  const assignedEmployee = await loadEmployeeById(request.assigned_to_employee_id);
  const text = await buildNotificationText({ request, chat: chat || { id: request.chat_id }, company, openedByEmployee, assignedEmployee });
  const keyboard = request.status === 'open' ? buildTicketKeyboard(request, 'main') : { inline_keyboard: [] };
  await editMessageText(chatId, messageId, text, { reply_markup: keyboard, parse_mode: 'HTML' }).catch(() => null);
}

async function shouldNotifyTicket({ settings, openSource }) {
  const config = normalizeTicketNotifications(settings.ticketNotifications || {});
  if (!config.enabled || !config.target_chat_id) return null;
  if (openSource === 'reaction' && !config.notify_on_reaction) return null;
  if (openSource === 'ai' && !config.notify_on_ai) return null;
  return config;
}

async function notifyTicketOpened({ request, message, openSource = 'ai', openedByEmployee = null }) {
  if (!request || !request.id) return { sent: false, reason: 'no_request' };
  const settings = await getBotSettings();
  const config = await shouldNotifyTicket({ settings, openSource });
  if (!config) return { sent: false, reason: 'disabled' };

  const existing = await supabase.select('ticket_notifications', {
    select: 'id,message_id,chat_id',
    request_id: supabase.eq(request.id),
    limit: '1'
  }).catch(() => []);
  if (existing[0]) return { sent: false, reason: 'duplicate', notification: existing[0] };

  const chat = message?.chat || await loadChatRow(request.chat_id) || { id: request.chat_id };
  const company = await loadCompanyContext(request.company_id);
  const openedBy = openedByEmployee || await loadEmployeeById(request.opened_by_employee_id);
  const assigned = await loadEmployeeById(request.assigned_to_employee_id);
  const text = await buildNotificationText({ request, chat, company, openedByEmployee: openedBy, assignedEmployee: assigned });
  const keyboard = buildTicketKeyboard(request, 'main');

  const result = await sendMessage(config.target_chat_id, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: keyboard
  });
  if (!result?.message_id) return { sent: false, reason: 'send_failed' };

  await saveTicketNotification({
    requestId: request.id,
    chatId: config.target_chat_id,
    messageId: result.message_id
  });
  return { sent: true, chat_id: config.target_chat_id, message_id: result.message_id };
}

async function assignRequestToEmployee({ request, employee, eventType = 'accepted', previousEmployeeId = null }) {
  const now = new Date().toISOString();
  await supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
    assigned_to_employee_id: employee.id,
    assigned_at: now
  });
  await supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: request.chat_id,
    event_type: eventType,
    employee_id: employee.id,
    actor_tg_id: employee.tg_user_id || null,
    actor_name: employeeLabel(employee),
    text: previousEmployeeId ? `reassigned:${previousEmployeeId}->${employee.id}` : employeeLabel(employee),
    created_at: now
  }], { prefer: 'return=minimal' }).catch(() => null);
  const updated = await loadRequestById(request.id);
  await refreshTicketNotificationMessage(updated || request);
  return updated;
}

async function loadActiveEmployees() {
  return supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,is_active',
    is_active: 'eq.true',
    order: supabase.order('full_name', true),
    limit: '500'
  }).catch(() => []);
}

module.exports = {
  TICKET_PREFIX,
  TICKET_ACTIONS,
  normalizeTicketNotifications,
  parseTicketCallbackData,
  ticketCallbackData,
  notifyTicketOpened,
  refreshTicketNotificationMessage,
  loadRequestById,
  loadEmployeeById,
  loadEmployeeByUsername,
  assignRequestToEmployee,
  buildReassignKeyboard,
  buildTicketKeyboard,
  buildNotificationText
};
