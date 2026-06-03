'use strict';

const supabase = require('./supabase');
const { getBotSettings } = require('./bot-settings');
const { getCachedCompanyInfo } = require('./company-info');
const metrics = require('./metrics');
const { sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery, escapeHtml } = require('./telegram');

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

const REQUEST_SELECT_MINIMAL = [
  'id',
  'chat_id',
  'company_id',
  'customer_name',
  'customer_username',
  'initial_message_id',
  'initial_text',
  'status',
  'created_at'
].join(',');

function isMissingSchemaColumnError(error) {
  const text = String(error?.message || '').toLowerCase();
  return text.includes('pgrst204') || text.includes('schema cache') || text.includes('could not find');
}

function normalizeTicketNotifications(value = {}) {
  return {
    enabled: value.enabled === true,
    target_chat_id: normalizeTargetChatId(value.target_chat_id || value.targetChatId || ''),
    notify_on_ai: value.notify_on_ai !== false && value.notifyOnAi !== false,
    notify_on_reaction: value.notify_on_reaction !== false && value.notifyOnReaction !== false
  };
}

function normalizeTargetChatId(value = '') {
  const text = String(value || '').trim().replace(/\s+/g, '');
  if (!text) return '';
  if (/^-?\d+$/.test(text)) return text;
  return text.startsWith('@') ? text : `@${text.replace(/^@/, '')}`;
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

async function resolveCompanyAndSupportEmployee({ companyId = null, chatId = null } = {}) {
  const chat = chatId ? await loadChatRow(chatId) : null;
  let resolvedCompanyId = companyId || chat?.company_id || null;
  const cached = await getCachedCompanyInfo().catch(() => null);
  const externalRows = Array.isArray(cached?.companies) ? cached.companies : [];

  if (!resolvedCompanyId && chatId) {
    const match = externalRows.find(company => {
      const groups = Array.isArray(company.groups) ? company.groups : [];
      return groups.some(group => String(group.chat_id) === String(chatId));
    });
    if (match) resolvedCompanyId = String(match.id || match.company_id || '').trim() || null;
  }

  const companyCtx = await loadCompanyContext(resolvedCompanyId);
  return {
    companyId: resolvedCompanyId,
    companyName: companyCtx.name,
    supportEmployee: companyCtx.supportEmployee
  };
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
  try {
    const rows = await supabase.select('support_requests', {
      select: REQUEST_SELECT,
      id: supabase.eq(requestId),
      limit: '1'
    });
    return rows[0] || null;
  } catch (error) {
    if (!isMissingSchemaColumnError(error)) throw error;
    const rows = await supabase.select('support_requests', {
      select: REQUEST_SELECT_MINIMAL,
      id: supabase.eq(requestId),
      limit: '1'
    }).catch(() => []);
    return rows[0] || null;
  }
}

function syntheticCallbackMessage(query = {}) {
  const msg = query.message || {};
  return {
    chat: msg.chat || { id: msg.chat?.id },
    from: query.from || {},
    message_id: msg.message_id,
    date: Math.floor(Date.now() / 1000),
    text: ''
  };
}

async function resolveCallbackEmployee(query = {}) {
  const user = query.from || {};
  if (!user.id) return null;
  await metrics.upsertTelegramUser(user, {}, { prefer: 'return=minimal' }).catch(() => null);
  return metrics.getKnownEmployeeByTelegramId(user.id);
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

async function loadNotificationCompany(request = {}, messageChat = {}) {
  const ctx = await resolveCompanyAndSupportEmployee({
    companyId: request.company_id,
    chatId: request.chat_id || messageChat?.id
  });
  return {
    name: ctx.companyName,
    supportEmployee: ctx.supportEmployee
  };
}

function enrichRequestForNotification(request = {}, { openSource = '', companyId = null } = {}) {
  return {
    ...request,
    open_source: request.open_source || openSource || '',
    company_id: request.company_id || companyId || null
  };
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
    `🏢 <b>Kompaniya:</b> ${escapeHtml(company.name || 'Biriktirilmagan')}`,
    `👤 <b>Kompaniya mas'uli:</b> ${escapeHtml(companySupport)}`,
    openedByEmployee ? `👁 <b>Belgilagan:</b> ${escapeHtml(markedBy)}` : null,
    assignedEmployee && assignedEmployee.id !== openedByEmployee?.id
      ? `✅ <b>Mas'ul (ishlayapti):</b> ${escapeHtml(assigned)}`
      : null,
    `📩 <b>Murojaat:</b> ${escapeHtml(truncateText(request.initial_text))}`,
    link ? `🔗 <a href="${escapeHtml(link)}">Xabarni Telegramda ochish</a>` : null,
    `📌 <b>Manba:</b> ${escapeHtml(openSourceLabel(request.open_source))}`,
    `👥 <b>Mijoz:</b> ${escapeHtml(request.customer_name || request.customer_username || '—')}`
  ].filter(Boolean);
  return lines.join('\n');
}

async function saveTicketNotification({ requestId, chatId, messageId }) {
  try {
    await supabase.insert('ticket_notifications', [{
      request_id: requestId,
      chat_id: chatId,
      message_id: messageId
    }], { upsert: true, onConflict: 'request_id', prefer: 'return=minimal' });
  } catch (error) {
    console.warn('[ticket-notifier:save-row]', { requestId, error: error.message });
  }
  try {
    await supabase.patch('support_requests', { id: supabase.eq(requestId) }, {
      notification_chat_id: chatId,
      notification_message_id: messageId
    });
  } catch (error) {
    if (!isMissingSchemaColumnError(error)) {
      console.warn('[ticket-notifier:save-request-meta]', { requestId, error: error.message });
    }
  }
}

async function refreshTicketNotificationMessage(request = {}) {
  const chatId = request.notification_chat_id;
  const messageId = request.notification_message_id;
  if (!chatId || !messageId) return;
  const chat = await loadChatRow(request.chat_id);
  const company = await loadNotificationCompany(request, chat || { id: request.chat_id });
  const openedByEmployee = await loadEmployeeById(request.opened_by_employee_id);
  const assignedEmployee = await loadEmployeeById(request.assigned_to_employee_id);
  const text = await buildNotificationText({ request, chat: chat || { id: request.chat_id }, company, openedByEmployee, assignedEmployee });
  const keyboard = request.status === 'open' ? buildTicketKeyboard(request, 'main') : { inline_keyboard: [] };
  await editMessageText(chatId, messageId, text, { reply_markup: keyboard, parse_mode: 'HTML' }).catch(error => {
    console.warn('[ticket-notifier:refresh]', { request_id: request.id, error: error.message });
  });
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
  if (!config) {
    return {
      sent: false,
      reason: 'disabled',
      detail: !settings.ticketNotifications?.enabled
        ? 'ticket_notifications_off'
        : !normalizeTargetChatId(settings.ticketNotifications?.target_chat_id)
          ? 'missing_target_chat_id'
          : openSource === 'reaction'
            ? 'reaction_notify_off'
            : 'ai_notify_off'
    };
  }

  const existing = await supabase.select('ticket_notifications', {
    select: 'id,message_id,chat_id',
    request_id: supabase.eq(request.id),
    limit: '1'
  }).catch(() => []);
  if (existing[0]) return { sent: false, reason: 'duplicate', notification: existing[0] };

  const chat = message?.chat || await loadChatRow(request.chat_id) || { id: request.chat_id };
  const company = await loadNotificationCompany(request, chat);
  const openedBy = openedByEmployee || await loadEmployeeById(request.opened_by_employee_id);
  const assigned = await loadEmployeeById(request.assigned_to_employee_id);
  const text = await buildNotificationText({ request, chat, company, openedByEmployee: openedBy, assignedEmployee: assigned });
  const keyboard = buildTicketKeyboard(request, 'main');
  const targetChatId = normalizeTargetChatId(config.target_chat_id);

  let result;
  try {
    result = await sendMessage(targetChatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: keyboard
    });
  } catch (error) {
    console.warn('[ticket-notifier:send]', {
      request_id: request.id,
      target_chat_id: targetChatId,
      open_source: openSource,
      error: error.message
    });
    return { sent: false, reason: 'telegram_error', error: error.message };
  }
  if (!result?.message_id) return { sent: false, reason: 'send_failed' };

  await saveTicketNotification({
    requestId: request.id,
    chatId: targetChatId,
    messageId: result.message_id
  });
  console.info('[ticket-notifier:sent]', {
    request_id: request.id,
    chat_id: targetChatId,
    message_id: result.message_id,
    open_source: openSource
  });
  return { sent: true, chat_id: targetChatId, message_id: result.message_id };
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

async function openSupportRequestAndNotify({
  message,
  sourceType,
  companyId = null,
  openSource = 'ai',
  openedByEmployee = null
} = {}) {
  const chatId = message?.chat?.id || null;
  const companyCtx = await resolveCompanyAndSupportEmployee({ companyId, chatId });
  const supportEmployee = companyCtx.supportEmployee;
  const assignedAt = supportEmployee?.id ? new Date().toISOString() : null;
  const request = await metrics.createSupportRequest({
    message,
    sourceType,
    companyId: companyCtx.companyId || companyId,
    openSource,
    openedByEmployeeId: openedByEmployee?.id || null,
    assignedToEmployeeId: supportEmployee?.id || null,
    assignedAt,
    skipMerge: openSource === 'reaction'
  });
  const fresh = request?.id ? await loadRequestById(request.id) : null;
  const notifyRequest = enrichRequestForNotification(fresh || request, {
    openSource,
    companyId: companyCtx.companyId || companyId
  });
  const notifyResult = await notifyTicketOpened({
    request: notifyRequest,
    message,
    openSource,
    openedByEmployee
  }).catch(error => {
    console.warn('[ticket-notifier:notify]', { request_id: request?.id, error: error.message });
    return { sent: false, reason: 'error', error: error.message };
  });
  if (!notifyResult?.sent) {
    console.warn('[ticket-notifier:notify:skipped]', {
      request_id: request?.id,
      open_source: openSource,
      ...notifyResult
    });
  }
  return request;
}

async function handleTicketCallback(query = {}, parsed = {}) {
  const employee = await resolveCallbackEmployee(query);
  if (!employee) {
    await answerCallbackQuery(query.id, 'Faqat faol xodimlar uchun.').catch(() => null);
    return { ok: false, reason: 'not_employee' };
  }

  let request = await loadRequestById(parsed.requestId);
  if (!request) {
    await answerCallbackQuery(query.id, 'Ticket topilmadi.').catch(() => null);
    return { ok: false, reason: 'not_found' };
  }

  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const action = parsed.action;

  if (action === TICKET_ACTIONS.REASSIGN) {
    const page = Number.parseInt(parsed.extra, 10) || 0;
    const keyboard = await buildReassignKeyboard(request, page);
    if (chatId && messageId) {
      await editMessageReplyMarkup(chatId, messageId, keyboard).catch(() => null);
    }
    await answerCallbackQuery(query.id).catch(() => null);
    return { ok: true, handled: 'reassign_menu' };
  }

  if (action === TICKET_ACTIONS.REASSIGN_BACK) {
    const keyboard = buildTicketKeyboard(request, 'main');
    if (chatId && messageId) {
      await editMessageReplyMarkup(chatId, messageId, keyboard).catch(() => null);
    }
    await answerCallbackQuery(query.id).catch(() => null);
    return { ok: true, handled: 'reassign_back' };
  }

  if (action === TICKET_ACTIONS.REASSIGN_SELECT) {
    const target = await metrics.getKnownEmployeeByTelegramId(parsed.extra)
      || (await loadActiveEmployees()).find(row => String(row.id) === String(parsed.extra));
    if (!target) {
      await answerCallbackQuery(query.id, 'Xodim topilmadi.').catch(() => null);
      return { ok: false, reason: 'employee_not_found' };
    }
    const previousId = request.assigned_to_employee_id || null;
    request = await assignRequestToEmployee({
      request,
      employee: target,
      eventType: 'reassigned',
      previousEmployeeId: previousId
    });
    if (chatId && messageId) {
      await editMessageReplyMarkup(chatId, messageId, buildTicketKeyboard(request, 'main')).catch(() => null);
    }
    await answerCallbackQuery(query.id, `${employeeLabel(target)} ga o‘tkazildi.`).catch(() => null);
    return { ok: true, handled: 'reassigned', employee_id: target.id };
  }

  if (action === TICKET_ACTIONS.ACCEPT) {
    if (request.status !== 'open') {
      await answerCallbackQuery(query.id, 'Ticket allaqachon yopilgan yoki bekor qilingan.').catch(() => null);
      return { ok: false, reason: 'not_open' };
    }
    request = await assignRequestToEmployee({ request, employee, eventType: 'accepted' });
    await answerCallbackQuery(query.id, 'Qabul qilindi.').catch(() => null);
    return { ok: true, handled: 'accepted' };
  }

  if (action === TICKET_ACTIONS.CLOSE) {
    if (request.status === 'closed') {
      await answerCallbackQuery(query.id, 'Allaqachon yopilgan.').catch(() => null);
      return { ok: true, handled: 'already_closed' };
    }
    if (request.status === 'cancelled') {
      await answerCallbackQuery(query.id, 'Ticket bekor qilingan.').catch(() => null);
      return { ok: false, reason: 'cancelled' };
    }
    const closeMessage = {
      ...syntheticCallbackMessage(query),
      text: '🔒 Yopish',
      chat: { id: request.chat_id }
    };
    await metrics.closeRequestRecord({ request, message: closeMessage, employee });
    request = await loadRequestById(request.id) || { ...request, status: 'closed' };
    await refreshTicketNotificationMessage(request);
    await answerCallbackQuery(query.id, 'Yopildi.').catch(() => null);
    return { ok: true, handled: 'closed' };
  }

  if (action === TICKET_ACTIONS.NOT_REQUEST) {
    if (request.status === 'cancelled') {
      await answerCallbackQuery(query.id, 'Allaqachon “so‘rov emas”.').catch(() => null);
      return { ok: true, handled: 'already_cancelled' };
    }
    const cancelMessage = {
      ...syntheticCallbackMessage(query),
      text: 'So‘rov emas',
      chat: { id: request.chat_id }
    };
    await metrics.cancelSupportRequest({ request, employee, message: cancelMessage });
    request = await loadRequestById(request.id) || { ...request, status: 'cancelled' };
    await refreshTicketNotificationMessage(request);
    await answerCallbackQuery(query.id, 'So‘rov emas deb belgilandi.').catch(() => null);
    return { ok: true, handled: 'cancelled' };
  }

  await answerCallbackQuery(query.id).catch(() => null);
  return { ok: true, handled: 'ignored' };
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
  buildNotificationText,
  openSupportRequestAndNotify,
  handleTicketCallback
};
