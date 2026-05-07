'use strict';

const supabase = require('./supabase');
const { tgUserName } = require('./telegram');
const { scoreTextMatch } = require('./ai');

const MEDIA_TEXT = Object.freeze({
  sticker: 'Stikerli xabar',
  photo: 'Rasmli xabar',
  video: 'Videoli xabar',
  voice: 'Ovozli xabar',
  audio: 'Audio xabar',
  video_note: 'Video xabar',
  animation: 'Animatsiyali xabar',
  document: 'Faylli xabar'
});

function nowIso() {
  return new Date().toISOString();
}

function messageDateIso(message = {}) {
  return message.date ? new Date(message.date * 1000).toISOString() : nowIso();
}

function messageDisplayText(message = {}) {
  const text = String(message.text || message.caption || '').trim();
  if (text) return text;
  if (message.sticker) return MEDIA_TEXT.sticker;
  if (Array.isArray(message.photo) && message.photo.length) return MEDIA_TEXT.photo;
  if (message.video) return MEDIA_TEXT.video;
  if (message.voice) return MEDIA_TEXT.voice;
  if (message.audio) return MEDIA_TEXT.audio;
  if (message.video_note) return MEDIA_TEXT.video_note;
  if (message.animation) return MEDIA_TEXT.animation;
  if (message.document) return MEDIA_TEXT.document;
  return '';
}

function chatTitle(chat = {}, fallback = '') {
  return chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || fallback || String(chat.id || 'Unknown chat');
}

function sourceTypeFrom(updateKind, chatType) {
  if (updateKind && updateKind.includes('business')) return 'business';
  if (['group', 'supergroup'].includes(chatType)) return 'group';
  return 'private';
}

function isActiveMemberStatus(status) {
  if (!status) return true;
  return !['left', 'kicked'].includes(status);
}

async function upsertTelegramUser(user = {}, extra = {}, options = {}) {
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
  }], { upsert: true, onConflict: 'tg_user_id', prefer: options.prefer || 'return=representation' });
  return Array.isArray(rows) ? rows[0] : null;
}

async function getKnownEmployeeByTelegramId(tgUserId) {
  if (!tgUserId) return null;
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,clickup_user_id,is_active',
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
    clickup_user_id: null,
    role: 'support',
    is_active: true,
    last_activity_at: nowIso()
  }], { upsert: true, onConflict: 'tg_user_id' });
  return rows[0];
}

async function upsertChat(chat = {}, sourceType = 'group', extra = {}, options = {}) {
  if (!chat || chat.id === undefined || chat.id === null) return null;
  let existingRows = [];
  try {
    existingRows = await supabase.select('tg_chats', {
      select: 'chat_id,title,username,type,company_id,business_connection_id',
      chat_id: supabase.eq(chat.id),
      limit: '1'
    });
  } catch (error) {
    if (typeof options.onReadError === 'function') {
      try {
        await options.onReadError(error);
      } catch (_notifyError) {
        // Notification is best-effort; saving the incoming message can still continue.
      }
    }
  }
  const existing = existingRows[0] || {};
  const title = chatTitle(chat, existing.title || '');
  const row = {
    chat_id: chat.id,
    type: chat.type || existing.type || sourceType,
    source_type: sourceType,
    title,
    username: chat.username || existing.username || null,
    is_active: true,
    last_message_at: nowIso(),
    raw: chat,
    ...extra
  };
  if (!Object.prototype.hasOwnProperty.call(row, 'company_id') && existing.company_id) {
    row.company_id = existing.company_id;
  }
  if (!Object.prototype.hasOwnProperty.call(row, 'business_connection_id') && existing.business_connection_id) {
    row.business_connection_id = existing.business_connection_id;
  }
  const rows = await supabase.insert('tg_chats', [{
    ...row
  }], { upsert: true, onConflict: 'chat_id', prefer: options.prefer || 'return=representation' });
  return Array.isArray(rows) && rows[0] ? rows[0] : { ...existing, ...row };
}

async function saveBusinessConnection(connection = {}) {
  if (!connection || !connection.id) return null;
  const user = connection.user || {};
  await upsertTelegramUser(user, {}, { prefer: 'return=minimal' });
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

async function saveMessage({ message, updateKind, sourceType, classification, employee }, options = {}) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = messageDisplayText(message);
  const messageSource = from.is_bot
    ? 'bot_message'
    : employee
      ? 'employee_message'
      : 'customer_message';
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
    raw: {
      ...message,
      source: message.source || messageSource,
      source_type: sourceType,
      update_kind: updateKind,
      classification
    },
    created_at: message.date ? new Date(message.date * 1000).toISOString() : nowIso()
  }], { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: options.prefer || 'return=representation' });
  return Array.isArray(rows) ? rows[0] : null;
}

async function findMergeableOpenRequest({ message, sourceType }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = (message.text || message.caption || '').trim().toLowerCase();
  if (!chat.id || !from.id || !text) return null;

  const rows = await supabase.select('support_requests', {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,initial_message_id,initial_text,status,created_at',
    chat_id: supabase.eq(chat.id),
    customer_tg_id: supabase.eq(from.id),
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);

  const existing = rows[0];
  if (!existing) return null;

  // Rule: Merge if the text is highly similar (semantic match)
  const existingText = (existing.initial_text || '').trim();
  const similarity = scoreTextMatch(existingText, text);
  if (similarity >= 0.7) return existing;

  return null;
}

async function addRequestNote({ request, message }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = messageDisplayText(message);
  const createdAt = messageDateIso(message);
  await supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: chat.id,
    tg_message_id: message.message_id,
    event_type: 'note',
    actor_tg_id: from.id || null,
    actor_name: tgUserName(from),
    text,
    raw: message,
    created_at: createdAt
  }], { prefer: 'return=minimal' }).catch(() => null);
  return { ...request, appended: true };
}

async function createSupportRequest({ message, sourceType, companyId = null }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = messageDisplayText(message);
  const createdAt = messageDateIso(message);

  const existing = await findMergeableOpenRequest({ message, sourceType });
  if (existing) return addRequestNote({ request: existing, message });

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
    created_at: createdAt
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
    raw: message,
    created_at: createdAt
  }], { prefer: 'return=minimal' }).catch(() => null);
  return request;
}

async function findOpenRequestById(requestId) {
  if (!requestId) return null;
  const rows = await supabase.select('support_requests', {
    select: 'id,chat_id,status,created_at,initial_text,customer_tg_id,customer_name,initial_message_id',
    id: supabase.eq(requestId),
    status: 'eq.open',
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function findOpenRequestFromReply({ message }) {
  const chat = message.chat || {};
  const from = message.from || {};
  const reply = message.reply_to_message || null;
  const repliedFrom = reply && reply.from || {};
  if (!chat.id || !reply || !reply.message_id || !from.id) return null;
  if (repliedFrom.id && String(repliedFrom.id) === String(from.id)) return null;

  const directPromise = supabase.select('support_requests', {
    select: 'id,chat_id,status,created_at,initial_text,customer_tg_id,customer_name,initial_message_id',
    chat_id: supabase.eq(chat.id),
    initial_message_id: supabase.eq(reply.message_id),
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);
  const eventPromise = supabase.select('request_events', {
    select: 'request_id,event_type,actor_tg_id,created_at',
    chat_id: supabase.eq(chat.id),
    tg_message_id: supabase.eq(reply.message_id),
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);
  const [directRows, eventRows] = await Promise.all([directPromise, eventPromise]);
  if (directRows[0]) return directRows[0];

  const event = eventRows.find(row => row && row.request_id && ['opened', 'note'].includes(row.event_type));
  if (!event) return null;

  const request = await findOpenRequestById(event.request_id);
  if (!request) return null;
  if (request.customer_tg_id && repliedFrom.id && String(request.customer_tg_id) !== String(repliedFrom.id)) return null;
  if (request.customer_tg_id && event.actor_tg_id && String(request.customer_tg_id) !== String(event.actor_tg_id)) return null;
  return request;
}

async function closeRequestRecord({ request, message, employee }) {
  const chat = message.chat || {};
  const from = message.from || {};
  const closedAt = messageDateIso(message);

  const patchPromise = supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
    status: 'closed',
    closed_at: closedAt,
    closed_by_employee_id: employee ? employee.id : null,
    closed_by_tg_id: from.id || null,
    closed_by_name: tgUserName(from),
    done_message_id: message.message_id
  });

  const eventPromise = supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: chat.id,
    tg_message_id: message.message_id,
    event_type: 'closed',
    actor_tg_id: from.id || null,
    actor_name: tgUserName(from),
    employee_id: employee ? employee.id : null,
    text: messageDisplayText(message),
    raw: message,
    created_at: closedAt
  }], { prefer: 'return=minimal' }).catch(() => null);

  const [closedRows] = await Promise.all([patchPromise, eventPromise]);
  return { closed: true, request: closedRows[0] || request };
}

async function closeLatestRequest({ message, employee, recordMissing = true }) {
  const chat = message.chat || {};
  const from = message.from || {};
  const open = await supabase.select('support_requests', {
    select: 'id,chat_id,status,created_at,initial_text,customer_name,customer_tg_id,initial_message_id',
    chat_id: supabase.eq(chat.id),
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '1'
  });
  const request = open[0];
  if (!request) {
    if (!recordMissing) return { closed: false, request: null };
    await supabase.insert('request_events', [{
      request_id: null,
      chat_id: chat.id,
      tg_message_id: message.message_id,
      event_type: 'done_without_request',
      actor_tg_id: from.id || null,
      actor_name: tgUserName(from),
      employee_id: employee ? employee.id : null,
      text: messageDisplayText(message),
      raw: message,
      created_at: messageDateIso(message)
    }], { prefer: 'return=minimal' }).catch(() => null);
    return { closed: false, request: null };
  }

  return closeRequestRecord({ request, message, employee });
}

async function closeRequestByReply({ message, employee }) {
  const request = await findOpenRequestFromReply({ message });
  if (!request) return { closed: false, request: null };
  const closer = employee || await ensureEmployee(message.from || {});
  return closeRequestRecord({ request, message, employee: closer });
}

async function findOpenRequestByMessage({ chatId, messageId }) {
  if (!chatId || !messageId) return null;
  const rows = await supabase.select('support_requests', {
    select: 'id,chat_id,status,created_at,initial_text,customer_tg_id,customer_name,initial_message_id',
    chat_id: supabase.eq(chatId),
    initial_message_id: supabase.eq(messageId),
    status: 'eq.open',
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function closeRequestByMessage({ message, targetMessageId, employee }) {
  const chat = message.chat || {};
  const request = await findOpenRequestByMessage({ chatId: chat.id, messageId: targetMessageId || message.message_id });
  if (!request) return { closed: false, request: null };
  const closer = employee || await ensureEmployee(message.from || {});
  return closeRequestRecord({ request, message, employee: closer });
}

async function registerChatMemberUpdate(update = {}) {
  const memberUpdate = update.my_chat_member || update.chat_member;
  if (!memberUpdate || !memberUpdate.chat) return null;
  const sourceType = ['group', 'supergroup'].includes(memberUpdate.chat.type) ? 'group' : 'private';
  const memberStatus = memberUpdate.new_chat_member && memberUpdate.new_chat_member.status;
  return upsertChat(memberUpdate.chat, sourceType, {
    member_status: memberStatus || null,
    is_active: isActiveMemberStatus(memberStatus),
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
  closeRequestByReply,
  closeRequestByMessage,
  registerChatMemberUpdate
};
