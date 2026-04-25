'use strict';

const supabase = require('../lib/supabase');
const { allowCors, sendJson, readBody, getQuery } = require('../lib/http');
const { login, requireAdmin, hashPassword } = require('../lib/auth');
const { sendMessage, sendBusinessMessage, getWebhookInfo, setWebhook } = require('../lib/telegram');
const { optionalEnv } = require('../lib/env');
const { sendMainStatsReport } = require('../lib/report');
const stats = require('../lib/stats');

const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'business_message',
  'edited_business_message',
  'business_connection',
  'my_chat_member',
  'chat_member'
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

function normalizeTelegramId(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) throw new Error('Telegram ID faqat raqam bo‘lishi kerak');
  return Number(text);
}

async function getDashboard() {
  const [employeeStats, chatStats, openRequests, today] = await Promise.all([
    stats.selectEmployeeStatistics({ select: '*', order: 'closed_requests.desc', limit: '100' }),
    stats.selectChatStatistics({ select: '*', order: 'total_requests.desc', limit: '100' }),
    supabase.select('support_requests', { select: 'id,source_type,chat_id,customer_name,initial_text,status,created_at,company_id', status: 'eq.open', order: supabase.order('created_at', false), limit: '50' }),
    stats.selectTodaySummary({ select: '*' })
  ]);
  return {
    summary: today[0] || stats.DEFAULT_SUMMARY,
    employeeStats,
    chatStats,
    openRequests
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
  return stats.selectChatStatistics({
    select: '*',
    source_type: 'in.(private,business)',
    order: supabase.order(query.orderBy || 'last_message_at', false),
    limit: limitQuery(query)
  });
}

async function listRequests(query) {
  const params = {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,customer_username,initial_message_id,initial_text,status,closed_at,closed_by_name,created_at',
    order: supabase.order(query.orderBy || 'created_at', false),
    limit: limitQuery(query)
  };
  if (query.chat_id) params.chat_id = supabase.eq(query.chat_id);
  if (query.company_id) params.company_id = supabase.eq(query.company_id);
  if (query.status) params.status = `eq.${encodeURIComponent(query.status)}`;
  return supabase.select('support_requests', params);
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
  return { settings, admins };
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
  const chats = await supabase.select('tg_chats', { select: 'chat_id,title,business_connection_id', chat_id: supabase.eq(body.chat_id), limit: '1' });
  const chat = chats[0];
  let result;
  if (body.business_connection_id || (chat && chat.business_connection_id)) {
    result = await sendBusinessMessage(body.business_connection_id || chat.business_connection_id, body.chat_id, body.text);
  } else {
    result = await sendMessage(body.chat_id, body.text);
  }
  await supabase.insert('broadcasts', [{
    title: body.title || 'Manual message',
    text: body.text,
    target_type: 'single_chat',
    total_targets: 1,
    sent_count: 1,
    failed_count: 0,
    created_by: body.created_by || 'admin',
    status: 'sent'
  }], { prefer: 'return=minimal' }).catch(() => null);
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

async function assignChatCompany(body) {
  if (!body.chat_id || !body.company_id) throw new Error('chat_id va company_id majburiy');
  const rows = await supabase.patch('tg_chats', { chat_id: supabase.eq(body.chat_id) }, { company_id: body.company_id });
  return rows[0];
}

async function updateSettings(body) {
  const items = Array.isArray(body.settings) ? body.settings : [];
  if (!items.length) return [];
  const rows = items.map(item => ({ key: item.key, value: item.value, updated_at: new Date().toISOString() }));
  return supabase.insert('bot_settings', rows, { upsert: true, onConflict: 'key' });
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
    case 'assignChatCompany': return assignChatCompany(body);
    case 'settings': return updateSettings(body);
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
