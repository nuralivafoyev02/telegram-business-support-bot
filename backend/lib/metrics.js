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
  const analyzed = String(message.analysis_text || '').trim();
  if (analyzed) return analyzed;
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

function normalizeEmployeeUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function normalizeEmployeeName(value = '') {
  return String(value || '').trim().toLowerCase();
}

async function loadActiveEmployeesForLookup() {
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,clickup_user_id,is_active',
    is_active: 'eq.true',
    limit: '5000'
  }).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function employeeDisplayNameParts(value = '') {
  return String(value || '')
    .split('|')
    .map(part => normalizeEmployeeName(part))
    .filter(Boolean);
}

function usernamesLooselyMatch(left = '', right = '') {
  const a = normalizeEmployeeUsername(left);
  const b = normalizeEmployeeUsername(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`_${b}`) || b.endsWith(`_${a}`)) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function employeeNamesLooselyMatch(employeeName = '', displayName = '') {
  const emp = normalizeEmployeeName(employeeName);
  const display = normalizeEmployeeName(displayName);
  if (!emp || !display) return false;
  if (emp === display || display.includes(emp) || emp.includes(display)) return true;
  const displayParts = employeeDisplayNameParts(displayName);
  return displayParts.some(part => part === emp || part.includes(emp) || emp.includes(part));
}

function matchEmployeeByTelegramProfile(employees = [], user = {}) {
  const username = normalizeEmployeeUsername(user.username);
  const displayName = normalizeEmployeeName(tgUserName(user));

  if (username) {
    const byUsername = employees.find(employee => usernamesLooselyMatch(employee.username, username));
    if (byUsername) return byUsername;
    const byNameAsUsername = employees.find(employee => normalizeEmployeeUsername(employee.full_name) === username);
    if (byNameAsUsername) return byNameAsUsername;
  }

  if (displayName) {
    const byName = employees.find(employee => employeeNamesLooselyMatch(employee.full_name, tgUserName(user)));
    if (byName) return byName;
  }

  return null;
}

async function bindEmployeeTelegramId(employee = {}, tgUserId) {
  if (!employee?.id || tgUserId === undefined || tgUserId === null || tgUserId === '') return employee;
  const boundId = Number(tgUserId);
  if (!Number.isFinite(boundId)) return employee;
  const currentRaw = employee.tg_user_id;
  const hasCurrent = currentRaw !== undefined && currentRaw !== null && currentRaw !== '';
  const currentId = hasCurrent ? Number(currentRaw) : null;
  if (hasCurrent && Number.isFinite(currentId) && currentId === boundId) return employee;
  await supabase.patch('employees', { id: supabase.eq(employee.id) }, {
    tg_user_id: boundId,
    last_activity_at: nowIso()
  }).catch(() => null);
  return { ...employee, tg_user_id: boundId };
}

async function getKnownEmployeeByTelegramId(tgUserId) {
  if (!tgUserId) return null;
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,clickup_user_id,is_active',
    tg_user_id: supabase.eq(tgUserId),
    is_active: 'eq.true',
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function getKnownEmployeeByTelegramUser(user = {}) {
  if (!user || !user.id || user.is_bot) return null;
  const byId = await getKnownEmployeeByTelegramId(user.id);
  if (byId) {
    const username = normalizeEmployeeUsername(user.username);
    const storedUsername = normalizeEmployeeUsername(byId.username);
    if (!username || !storedUsername || usernamesLooselyMatch(byId.username, user.username)) {
      return byId;
    }
  }

  const employees = await loadActiveEmployeesForLookup();
  const matched = matchEmployeeByTelegramProfile(employees, user);
  if (!matched) return byId || null;
  return bindEmployeeTelegramId(matched, user.id);
}

async function ensureEmployee(user = {}) {
  // Avtomatik xodim qo'shish o'chirilgan — xodimlar faqat admin panelidan
  // qo'lda qo'shiladi. Bu funksiya mavjud xodimni Telegram profili bo'yicha
  // (ID, username yoki ism) qaytaradi yoki null.
  if (!user || !user.id) return null;
  return await getKnownEmployeeByTelegramUser(user);
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
      message_id: message.message_id,
      chat: message.chat,
      from: message.from,
      date: message.date,
      text: message.text,
      caption: message.caption,
      photo: message.photo,
      voice: message.voice,
      audio: message.audio,
      video: message.video,
      video_note: message.video_note,
      animation: message.animation,
      document: message.document,
      sticker: message.sticker,
      business_connection_id: message.business_connection_id || null,
      analysis_text: message.analysis_text || null,
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

const SUPPORT_REQUEST_OPTIONAL_COLUMNS = Object.freeze([
  'open_source',
  'opened_by_employee_id',
  'assigned_to_employee_id',
  'assigned_at',
  'notification_chat_id',
  'notification_message_id'
]);

function isMissingSchemaColumnError(error) {
  const text = String(error?.message || '').toLowerCase();
  return text.includes('pgrst204') || text.includes('schema cache') || text.includes('could not find');
}

function buildSupportRequestOptionalFields(options = {}) {
  const optional = {};
  const openSource = String(options.openSource || options.open_source || '').trim();
  if (openSource) optional.open_source = openSource;
  if (options.openedByEmployeeId || options.opened_by_employee_id) {
    optional.opened_by_employee_id = options.openedByEmployeeId || options.opened_by_employee_id;
  }
  if (options.assignedToEmployeeId || options.assigned_to_employee_id) {
    optional.assigned_to_employee_id = options.assignedToEmployeeId || options.assigned_to_employee_id;
  }
  if (options.assignedAt || options.assigned_at) {
    optional.assigned_at = options.assignedAt || options.assigned_at;
  }
  if (options.notificationChatId || options.notification_chat_id) {
    optional.notification_chat_id = options.notificationChatId || options.notification_chat_id;
  }
  if (options.notificationMessageId || options.notification_message_id) {
    optional.notification_message_id = options.notificationMessageId || options.notification_message_id;
  }
  return optional;
}

async function insertSupportRequestRow(coreRow, optionalRow = {}) {
  const optionalKeys = Object.keys(optionalRow);
  if (!optionalKeys.length) {
    return supabase.insert('support_requests', [coreRow], {
      upsert: true,
      onConflict: 'chat_id,initial_message_id'
    });
  }
  try {
    return await supabase.insert('support_requests', [{ ...coreRow, ...optionalRow }], {
      upsert: true,
      onConflict: 'chat_id,initial_message_id'
    });
  } catch (error) {
    if (!isMissingSchemaColumnError(error)) throw error;
    const rows = await supabase.insert('support_requests', [coreRow], {
      upsert: true,
      onConflict: 'chat_id,initial_message_id'
    });
    const request = rows[0];
    if (request?.id) {
      await patchSupportRequestMetadata(request.id, optionalRow).catch(patchError => {
        console.warn('[metrics:support-request:metadata-patch]', patchError.message);
      });
    }
    return rows;
  }
}

async function patchSupportRequestMetadata(requestId, fields = {}) {
  if (!requestId) return null;
  const patch = {};
  SUPPORT_REQUEST_OPTIONAL_COLUMNS.forEach(key => {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== '') {
      patch[key] = fields[key];
    }
  });
  if (!Object.keys(patch).length) return null;
  try {
    const rows = await supabase.patch('support_requests', { id: supabase.eq(requestId) }, patch);
    return rows[0] || null;
  } catch (error) {
    if (isMissingSchemaColumnError(error)) return null;
    throw error;
  }
}

function isOpenRequestStatus(status = '') {
  return String(status || '').trim().toLowerCase() === 'open';
}

function isClosedLikeRequestStatus(status = '') {
  return ['closed', 'cancelled'].includes(String(status || '').trim().toLowerCase());
}

async function findRequestByInitialMessage(chatId, messageId) {
  if (!chatId || !messageId) return null;
  const rows = await supabase.select('support_requests', {
    select: 'id,source_type,chat_id,company_id,customer_tg_id,customer_name,initial_message_id,initial_text,status,created_at,closed_at,closed_by_employee_id,open_source,opened_by_employee_id,assigned_to_employee_id',
    chat_id: supabase.eq(chatId),
    initial_message_id: supabase.eq(messageId),
    order: supabase.order('created_at', false),
    limit: '1'
  }).catch(() => []);
  return rows[0] || null;
}

async function findOpenRequestByInitialMessage(chatId, messageId) {
  const request = await findRequestByInitialMessage(chatId, messageId);
  return request && isOpenRequestStatus(request.status) ? request : null;
}

async function createSupportRequest({ message, sourceType, companyId = null, skipMerge = false, ...ticketMeta } = {}) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = messageDisplayText(message);
  const createdAt = messageDateIso(message);
  const openSource = String(ticketMeta.openSource || ticketMeta.open_source || '').trim();
  const reactionOpen = openSource === 'reaction' || skipMerge === true;

  if (chat.id && message.message_id) {
    const existingByMessage = await findRequestByInitialMessage(chat.id, message.message_id);
    if (existingByMessage) {
      const optionalRow = buildSupportRequestOptionalFields(ticketMeta);
      if (existingByMessage.id && Object.keys(optionalRow).length) {
        await patchSupportRequestMetadata(existingByMessage.id, optionalRow).catch(patchError => {
          console.warn('[metrics:support-request:metadata-patch]', patchError.message);
        });
      }
      if (reactionOpen || isClosedLikeRequestStatus(existingByMessage.status)) {
        return existingByMessage;
      }
      if (isOpenRequestStatus(existingByMessage.status)) {
        return addRequestNote({ request: existingByMessage, message });
      }
      return existingByMessage;
    }
  }

  if (!reactionOpen) {
    const existing = await findMergeableOpenRequest({ message, sourceType });
    if (existing) return addRequestNote({ request: existing, message });
  }

  const coreRow = {
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
  };
  const optionalRow = buildSupportRequestOptionalFields(ticketMeta);
  const rows = await insertSupportRequestRow(coreRow, optionalRow);
  const request = rows[0];
  if (request?.id && Object.keys(optionalRow).length) {
    const hasOptionalOnRow = SUPPORT_REQUEST_OPTIONAL_COLUMNS.some(key => request[key] !== undefined && request[key] !== null);
    if (!hasOptionalOnRow) {
      await patchSupportRequestMetadata(request.id, optionalRow).catch(patchError => {
        console.warn('[metrics:support-request:metadata-patch]', patchError.message);
      });
    }
  }
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

async function cancelSupportRequest({ request, employee = null, message = {} }) {
  const chat = message.chat || { id: request.chat_id };
  const from = message.from || {};
  const cancelledAt = messageDateIso(message);

  const patchPromise = supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
    status: 'cancelled',
    closed_at: cancelledAt,
    closed_by_employee_id: employee ? employee.id : null,
    closed_by_tg_id: from.id || null,
    closed_by_name: employee ? tgUserName(employee) : tgUserName(from)
  });

  const eventPromise = supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: chat.id || request.chat_id,
    tg_message_id: message.message_id || null,
    event_type: 'cancelled',
    actor_tg_id: from.id || employee?.tg_user_id || null,
    actor_name: employee ? tgUserName(employee) : tgUserName(from),
    employee_id: employee ? employee.id : null,
    text: messageDisplayText(message) || 'So‘rov emas',
    raw: message,
    created_at: cancelledAt
  }], { prefer: 'return=minimal' }).catch(() => null);

  const [rows] = await Promise.all([patchPromise, eventPromise]);
  return { cancelled: true, request: rows[0] || request };
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

async function findOpenRequestByLinkedMessage({ chatId, messageId }) {
  if (!chatId || !messageId) return null;
  const events = await supabase.select('request_events', {
    select: 'request_id,event_type,created_at',
    chat_id: supabase.eq(chatId),
    tg_message_id: supabase.eq(messageId),
    event_type: 'in.(opened,note)',
    order: supabase.order('created_at', false),
    limit: '5'
  }).catch(() => []);
  for (const event of events) {
    const request = await findOpenRequestById(event.request_id);
    if (request) return request;
  }
  return null;
}

async function closeRequestByMessage({ message, targetMessageId, employee }) {
  const chat = message.chat || {};
  const messageId = targetMessageId || message.message_id;
  const request = await findOpenRequestByMessage({ chatId: chat.id, messageId })
    || await findOpenRequestByLinkedMessage({ chatId: chat.id, messageId });
  if (!request) {
    const existing = await findRequestByInitialMessage(chat.id, messageId);
    if (existing && isClosedLikeRequestStatus(existing.status)) {
      return { closed: true, request: existing, already_closed: true };
    }
    return { closed: false, request: null };
  }
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
  getKnownEmployeeByTelegramUser,
  ensureEmployee,
  upsertChat,
  saveBusinessConnection,
  saveMessage,
  createSupportRequest,
  findRequestByInitialMessage,
  findOpenRequestByInitialMessage,
  patchSupportRequestMetadata,
  closeRequestRecord,
  cancelSupportRequest,
  closeLatestRequest,
  closeRequestByReply,
  closeRequestByMessage,
  registerChatMemberUpdate
};
