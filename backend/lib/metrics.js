'use strict';

const supabase = require('./supabase');
const { tgUserName } = require('./telegram');

function nowIso() {
  return new Date().toISOString();
}

function chatTitle(chat = {}) {
  return chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || String(chat.id || 'Unknown chat');
}

function sourceTypeFrom(updateKind, chatType) {
  if (updateKind && updateKind.includes('business')) return 'business';
  if (['group', 'supergroup'].includes(chatType)) return 'group';
  return 'private';
}

async function upsertTelegramUser(user = {}, extra = {}) {
  if (!user || !user.id) return null;
  const rows = await supabase.insert('tg_users', [{
    tg_user_id: user.id,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    username: user.username || null,
    language_code: user.language_code || null,
    is_bot: !!user.is_bot,
    last_seen_at: nowIso(),
    raw: user,
    ...extra
  }], { upsert: true, onConflict: 'tg_user_id' });
  return rows[0];
}

async function getKnownEmployeeByTelegramId(tgUserId) {
  if (!tgUserId) return null;
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,is_active',
    tg_user_id: supabase.eq(tgUserId),
    is_active: 'eq.true',
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function ensureEmployee(user = {}) {
  if (!user || !user.id) return null;
  const fullName = tgUserName(user);
  const rows = await supabase.insert('employees', [{
    tg_user_id: user.id,
    full_name: fullName,
    username: user.username || null,
    role: 'support',
    is_active: true,
    last_activity_at: nowIso()
  }], { upsert: true, onConflict: 'tg_user_id' });
  return rows[0];
}

async function upsertChat(chat = {}, sourceType = 'group', extra = {}) {
  if (!chat || chat.id === undefined || chat.id === null) return null;
  const title = chatTitle(chat);
  const rows = await supabase.insert('tg_chats', [{
    chat_id: chat.id,
    type: chat.type || sourceType,
    source_type: sourceType,
    title,
    username: chat.username || null,
    is_active: true,
    last_message_at: nowIso(),
    raw: chat,
    ...extra
  }], { upsert: true, onConflict: 'chat_id' });
  return rows[0];
}

async function saveBusinessConnection(connection = {}) {
  if (!connection || !connection.id) return null;
  const user = connection.user || {};
  await upsertTelegramUser(user);
  const rows = await supabase.insert('business_connections', [{
    connection_id: connection.id,
    user_chat_id: connection.user_chat_id || null,
    tg_user_id: user.id || null,
    can_reply: connection.can_reply ?? null,
    is_enabled: connection.is_enabled ?? null,
    rights: connection.rights || null,
    raw: connection,
    updated_at: nowIso()
  }], { upsert: true, onConflict: 'connection_id' });
  return rows[0];
}

async function saveMessage({ message, updateKind, sourceType, classification, employee }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = message.text || message.caption || '';
  const rows = await supabase.insert('messages', [{
    tg_message_id: message.message_id,
    chat_id: chat.id,
    from_tg_user_id: from.id || null,
    from_name: tgUserName(from),
    from_username: from.username || null,
    source_type: sourceType,
    update_kind: updateKind,
    text,
    classification,
    employee_id: employee ? employee.id : null,
    business_connection_id: message.business_connection_id || null,
    raw: message,
    created_at: message.date ? new Date(message.date * 1000).toISOString() : nowIso()
  }], { upsert: true, onConflict: 'chat_id,tg_message_id' });
  return rows[0];
}

async function createSupportRequest({ message, sourceType, companyId = null }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = message.text || message.caption || '';
  const rows = await supabase.insert('support_requests', [{
    source_type: sourceType,
    chat_id: chat.id,
    company_id: companyId,
    customer_tg_id: from.id || null,
    customer_name: tgUserName(from),
    customer_username: from.username || null,
    initial_message_id: message.message_id,
    initial_text: text,
    status: 'open',
    business_connection_id: message.business_connection_id || null,
    raw: message,
    created_at: message.date ? new Date(message.date * 1000).toISOString() : nowIso()
  }], { upsert: true, onConflict: 'chat_id,initial_message_id' });
  const request = rows[0];
  await supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: chat.id,
    tg_message_id: message.message_id,
    event_type: 'opened',
    actor_tg_id: from.id || null,
    actor_name: tgUserName(from),
    text,
    raw: message
  }], { prefer: 'return=minimal' }).catch(() => null);
  return request;
}

async function closeLatestRequest({ message, employee }) {
  const chat = message.chat || {};
  const from = message.from || {};
  const open = await supabase.select('support_requests', {
    select: 'id,chat_id,status,created_at,initial_text,customer_name',
    chat_id: supabase.eq(chat.id),
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '1'
  });
  const request = open[0];
  if (!request) {
    await supabase.insert('request_events', [{
      request_id: null,
      chat_id: chat.id,
      tg_message_id: message.message_id,
      event_type: 'done_without_request',
      actor_tg_id: from.id || null,
      actor_name: tgUserName(from),
      employee_id: employee ? employee.id : null,
      text: message.text || message.caption || '',
      raw: message
    }], { prefer: 'return=minimal' }).catch(() => null);
    return { closed: false, request: null };
  }

  const closedRows = await supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
    status: 'closed',
    closed_at: nowIso(),
    closed_by_employee_id: employee ? employee.id : null,
    closed_by_tg_id: from.id || null,
    closed_by_name: tgUserName(from),
    done_message_id: message.message_id
  });

  await supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: chat.id,
    tg_message_id: message.message_id,
    event_type: 'closed',
    actor_tg_id: from.id || null,
    actor_name: tgUserName(from),
    employee_id: employee ? employee.id : null,
    text: message.text || message.caption || '',
    raw: message
  }], { prefer: 'return=minimal' }).catch(() => null);

  return { closed: true, request: closedRows[0] || request };
}

async function registerChatMemberUpdate(update = {}) {
  const memberUpdate = update.my_chat_member || update.chat_member;
  if (!memberUpdate || !memberUpdate.chat) return null;
  const sourceType = ['group', 'supergroup'].includes(memberUpdate.chat.type) ? 'group' : 'private';
  return upsertChat(memberUpdate.chat, sourceType, {
    member_status: memberUpdate.new_chat_member && memberUpdate.new_chat_member.status,
    last_member_update_at: nowIso()
  });
}

module.exports = {
  nowIso,
  chatTitle,
  sourceTypeFrom,
  upsertTelegramUser,
  getKnownEmployeeByTelegramId,
  ensureEmployee,
  upsertChat,
  saveBusinessConnection,
  saveMessage,
  createSupportRequest,
  closeLatestRequest,
  registerChatMemberUpdate
};
