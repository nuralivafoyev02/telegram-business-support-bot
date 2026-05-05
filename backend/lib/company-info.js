'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');

const DEFAULT_COMPANY_INFO_URL = 'https://backend.app.uyqur.uz/dev/company/info-for-bot';
const EXPIRING_SOON_DAYS = 30;
const COMPANY_INFO_CACHE_KEY = 'uyqur_company_info_cache';
const COMPANY_INFO_FIELDS = Object.freeze([
  'id',
  'name',
  'status',
  'created_at',
  'updated_at',
  'phone',
  'brand',
  'director',
  'icon',
  'last_activity',
  'currency_id',
  'auto_refresh_currencies',
  'expired',
  'uyqur_support_username',
  'uyqur_support_phone',
  'subscription_start_date',
  'business_status',
  'is_real',
  'status_histories'
]);
const STATUS_HISTORY_FIELDS = Object.freeze(['id', 'old_status', 'new_status', 'company_id', 'changed_at']);
const COMPANY_INFO_INCLUDE = Object.freeze([
  'status_histories'
]);
const COMPANY_INFO_DEFAULT_SCOPE = 'companies';
const COMPANY_GROUP_ACTIVITY_CONVERSATION_LIMIT = 500;
const COMPANY_GROUP_ACTIVITY_REQUEST_LIMIT = 300;
const MEDIA_FIELDS = Object.freeze([
  'kind',
  'file_id',
  'file_unique_id',
  'file_name',
  'mime_type',
  'file_size',
  'width',
  'height',
  'duration',
  'emoji',
  'set_name',
  'sticker_type',
  'custom_emoji_id',
  'thumbnail_file_id'
]);

function companyInfoUrl() {
  return optionalEnv('UYQUR_COMPANY_INFO_URL', DEFAULT_COMPANY_INFO_URL);
}

function companyInfoAuth() {
  return optionalEnv('UYQUR_COMPANY_INFO_AUTH', '');
}

function parseUnixDate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';
  return new Date(number * 1000).toISOString();
}

function parseDottedDate(value = '') {
  const match = String(value || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59));
}

function daysUntil(date) {
  if (!date) return null;
  const diff = date.getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.ceil(diff / 86_400_000);
}

function expiryState(days) {
  if (days === null || days === undefined) return 'none';
  if (days < 0) return 'expired';
  if (days <= EXPIRING_SOON_DAYS) return 'soon';
  return 'ok';
}

function normalizeSupportUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function pickFields(source = {}, fields = []) {
  return Object.fromEntries(fields
    .filter(field => Object.prototype.hasOwnProperty.call(source, field))
    .map(field => [field, source[field]]));
}

function compactString(value = '') {
  return String(value ?? '').trim();
}

function firstValue(source = {}, keys = []) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return '';
}

function normalizeKey(value = '') {
  return compactString(value).toLowerCase().replace(/\s+/g, ' ');
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readPath(source = {}, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[key];
  }, source);
}

function arraysFromPaths(source = {}, paths = []) {
  return paths.flatMap(path => asArray(readPath(source, path)));
}

function uniqueBy(rows = [], keyFn) {
  const seen = new Set();
  return rows.filter(row => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    const millis = number > 10_000_000_000 ? number : number * 1000;
    return new Date(millis).toISOString();
  }
  const dotted = parseDottedDate(value);
  if (dotted) return dotted.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sourceLabel(origin = '') {
  return ({
    admin: 'Admin',
    ai: 'AI',
    bot: 'Bot',
    employee: 'Xodim',
    customer: 'Mijoz',
    system: 'Telegram'
  }[origin] || 'Mijoz');
}

function inferOrigin(row = {}) {
  const text = [
    row.origin_type,
    row.actor_type,
    row.sender_type,
    row.from_type,
    row.source,
    row.source_type,
    row.classification,
    row.role
  ].map(value => compactString(value).toLowerCase()).join(' ');
  const rawFrom = objectValue(objectValue(row.raw).from);
  if (rawFrom.is_bot || /\b(bot|support_bot)\b/.test(text)) return 'bot';
  if (/\b(ai|assistant|auto_reply|ai_reply)\b/.test(text)) return 'ai';
  if (/\b(admin)\b/.test(text)) return 'admin';
  if (/\b(employee|support|xodim|operator|manager|staff)\b/.test(text)) return 'employee';
  if (row.is_outgoing === true || row.outgoing === true || row.from_me === true) return 'employee';
  return 'customer';
}

function inferDirection(row = {}, origin = inferOrigin(row)) {
  const direction = compactString(row.direction).toLowerCase();
  if (['outbound', 'out', 'sent', 'right'].includes(direction)) return 'outbound';
  if (['inbound', 'in', 'received', 'left'].includes(direction)) return 'inbound';
  if (origin === 'system') return 'system';
  return ['admin', 'ai', 'bot', 'employee'].includes(origin) ? 'outbound' : 'inbound';
}

function normalizeMedia(media = {}) {
  const source = objectValue(media);
  const kind = compactString(source.kind || source.type || source.media_type);
  if (!kind && !source.file_id) return null;
  return {
    ...pickFields(source, MEDIA_FIELDS),
    kind: kind || 'document',
    file_id: source.file_id || source.id || null,
    file_unique_id: source.file_unique_id || null
  };
}

function bestExternalPhoto(photos = []) {
  return asArray(photos)
    .filter(photo => photo && photo.file_id)
    .sort((a, b) => {
      const areaA = Number(a.width || 0) * Number(a.height || 0);
      const areaB = Number(b.width || 0) * Number(b.height || 0);
      return (Number(a.file_size || areaA) || 0) - (Number(b.file_size || areaB) || 0);
    })
    .at(-1) || null;
}

function normalizeMediaFromMessage(row = {}) {
  const direct = normalizeMedia(row.media || row.attachment || row.file);
  if (direct) return direct;
  const raw = objectValue(row.raw || row.telegram || row.payload);
  const sticker = objectValue(row.sticker || raw.sticker);
  if (sticker.file_id) return normalizeMedia({ ...sticker, kind: 'sticker', sticker_type: sticker.type });
  const photo = bestExternalPhoto(row.photo || raw.photo);
  if (photo) return normalizeMedia({ ...photo, kind: 'photo' });
  for (const kind of ['video', 'voice', 'audio', 'video_note', 'animation', 'document']) {
    const source = objectValue(row[kind] || raw[kind]);
    if (source.file_id) return normalizeMedia({ ...source, kind });
  }
  return null;
}

function sanitizeStatusHistory(row = {}) {
  return pickFields(row && typeof row === 'object' ? row : {}, STATUS_HISTORY_FIELDS);
}

function sanitizeCompanyRow(row = {}) {
  const source = row && typeof row === 'object' ? row : {};
  const picked = pickFields(source, COMPANY_INFO_FIELDS);
  if (Array.isArray(source.status_histories)) {
    picked.status_histories = source.status_histories.map(sanitizeStatusHistory);
  }
  return picked;
}

function normalizeCompany(row = {}) {
  const expiresAt = parseDottedDate(row.expired);
  const days = daysUntil(expiresAt);
  const statusHistories = Array.isArray(row.status_histories) ? row.status_histories : [];
  const latestStatus = statusHistories
    .slice()
    .sort((a, b) => Number(b.changed_at || 0) - Number(a.changed_at || 0))[0] || null;

  return {
    id: row.id,
    name: row.name || '',
    status: row.status || '',
    created_at: row.created_at || null,
    created_at_iso: parseUnixDate(row.created_at),
    updated_at: row.updated_at || null,
    updated_at_iso: parseUnixDate(row.updated_at),
    phone: row.phone || '',
    brand: row.brand || '',
    director: row.director || '',
    icon: row.icon || '',
    last_activity: row.last_activity || null,
    currency_id: row.currency_id || null,
    auto_refresh_currencies: Number(row.auto_refresh_currencies || 0),
    expired: row.expired || '',
    days_until_expiry: days,
    expiry_state: expiryState(days),
    uyqur_support_username: row.uyqur_support_username || '',
    uyqur_support_phone: row.uyqur_support_phone || '',
    subscription_start_date: row.subscription_start_date || '',
    business_status: row.business_status || '',
    is_real: Number(row.is_real || 0),
    status_histories: statusHistories,
    latest_status_change: latestStatus,
    latest_status_change_at_iso: latestStatus ? parseUnixDate(latestStatus.changed_at) : ''
  };
}

function buildSummary(companies = []) {
  const groups = companies.flatMap(company => Array.isArray(company.groups) ? company.groups : []);
  return {
    total: companies.length,
    active: companies.filter(company => company.status === 'active').length,
    passive: companies.filter(company => company.status === 'passive').length,
    real: companies.filter(company => company.is_real === 1).length,
    business_active: companies.filter(company => company.business_status === 'ACTIVE').length,
    business_new: companies.filter(company => company.business_status === 'NEW').length,
    business_paused: companies.filter(company => company.business_status === 'PAUSED').length,
    support_assigned: companies.filter(company => company.uyqur_support_username || company.uyqur_support_phone).length,
    auto_currency_refresh: companies.filter(company => company.auto_refresh_currencies === 1).length,
    expired: companies.filter(company => company.expiry_state === 'expired').length,
    expiring_soon: companies.filter(company => company.expiry_state === 'soon').length,
    groups: groups.length,
    group_messages: groups.reduce((sum, group) => sum + Number(group.total_messages || 0), 0),
    group_requests: groups.reduce((sum, group) => sum + Number(group.total_requests || 0), 0)
  };
}

function supportContactsFromCompanies(companies = []) {
  const contacts = new Map();
  companies.forEach(company => {
    const username = normalizeSupportUsername(company.uyqur_support_username);
    const phoneDigits = normalizePhone(company.uyqur_support_phone);
    if (!username && !phoneDigits) return;
    const key = username ? `u:${username}` : `p:${phoneDigits}`;
    if (!contacts.has(key)) {
      contacts.set(key, {
        username: username || null,
        phone: company.uyqur_support_phone || null,
        phone_digits: phoneDigits || '',
        full_name: username ? `@${username}` : (company.uyqur_support_phone || 'Support xodim')
      });
    }
  });
  return [...contacts.values()];
}

function employeeMatchesSupport(employee = {}, contact = {}) {
  const employeeUsername = normalizeSupportUsername(employee.username);
  const employeeNameUsername = normalizeSupportUsername(employee.full_name);
  const employeePhone = normalizePhone(employee.phone);
  return Boolean(
    (contact.username && (
      (employeeUsername && contact.username === employeeUsername)
      || (employeeNameUsername && contact.username === employeeNameUsername)
    ))
    || (contact.phone_digits && employeePhone && contact.phone_digits === employeePhone)
  );
}

async function syncSupportEmployees(companies = []) {
  const contacts = supportContactsFromCompanies(companies);
  if (!contacts.length) return { created: 0, skipped: 0 };

  try {
    const employees = await supabase.select('employees', {
      select: 'id,username,phone,tg_user_id,full_name,is_active',
      limit: '5000'
    });
    const existing = Array.isArray(employees) ? employees : [];
    const missing = contacts.filter(contact => !existing.some(employee => employeeMatchesSupport(employee, contact)));
    if (!missing.length) return { created: 0, skipped: contacts.length };

    const now = new Date().toISOString();
    const rows = missing.map(contact => ({
      full_name: contact.full_name,
      username: contact.username,
      phone: contact.phone,
      role: 'support',
      is_active: true,
      last_activity_at: now
    }));
    await supabase.insert('employees', rows, { prefer: 'return=minimal' });
    return { created: rows.length, skipped: contacts.length - rows.length };
  } catch (error) {
    console.warn('[company-info:sync-support-employees:error]', error.message);
    return { created: 0, skipped: contacts.length, error: error.message };
  }
}

function companyInfoSnapshot(result = {}) {
  const fetchedAt = result.fetched_at || new Date().toISOString();
  return {
    summary: result.summary || buildSummary(result.companies || []),
    companies: Array.isArray(result.companies) ? result.companies : [],
    groups: Array.isArray(result.groups) ? result.groups : [],
    support_employee_sync: result.support_employee_sync || null,
    fetched_at: fetchedAt,
    cached_at: new Date().toISOString(),
    source: result.source || '',
    message: result.message || null
  };
}

async function saveCompanyInfoSnapshot(result = {}) {
  const snapshot = companyInfoSnapshot(result);
  await supabase.insert('bot_settings', [{
    key: COMPANY_INFO_CACHE_KEY,
    value: snapshot,
    updated_at: snapshot.cached_at
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return snapshot;
}

async function getCachedCompanyInfo() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value,updated_at',
    key: supabase.eq(COMPANY_INFO_CACHE_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row || !row.value || typeof row.value !== 'object') return null;
  return {
    ...row.value,
    cached_at: row.value.cached_at || row.updated_at || null,
    from_cache: true
  };
}

function extractCompanyRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  const rows = arraysFromPaths(payload, [
    ['companies'],
    ['data', 'companies'],
    ['result', 'companies'],
    ['payload', 'companies']
  ]);
  if (rows.length) return rows;
  return [];
}

function groupRowsFromContainer(container = {}) {
  return arraysFromPaths(container, [
    ['groups'],
    ['group_chats'],
    ['telegram_groups'],
    ['tg_chats'],
    ['chats'],
    ['dialogs']
  ]).filter(row => {
    const type = compactString(row.source_type || row.type || row.chat_type).toLowerCase();
    return !type || ['group', 'supergroup', 'telegram_group'].includes(type);
  });
}

function rootGroupRows(payload = {}) {
  return arraysFromPaths(payload, [
    ['groups'],
    ['group_chats'],
    ['telegram_groups'],
    ['tg_chats'],
    ['chats'],
    ['data', 'groups'],
    ['data', 'group_chats'],
    ['data', 'telegram_groups'],
    ['data', 'tg_chats'],
    ['data', 'chats'],
    ['result', 'groups'],
    ['result', 'chats']
  ]).filter(row => {
    const type = compactString(row.source_type || row.type || row.chat_type).toLowerCase();
    return !type || ['group', 'supergroup', 'telegram_group'].includes(type);
  });
}

function messageRowsFromContainer(container = {}) {
  return arraysFromPaths(container, [
    ['conversation'],
    ['messages'],
    ['chat_messages'],
    ['group_messages'],
    ['telegram_messages'],
    ['history']
  ]);
}

function rootMessageRows(payload = {}) {
  return arraysFromPaths(payload, [
    ['messages'],
    ['group_messages'],
    ['chat_messages'],
    ['telegram_messages'],
    ['data', 'messages'],
    ['data', 'group_messages'],
    ['data', 'chat_messages'],
    ['result', 'messages'],
    ['result', 'group_messages']
  ]);
}

function requestRowsFromContainer(container = {}) {
  return arraysFromPaths(container, [
    ['requests'],
    ['tickets'],
    ['support_requests'],
    ['ticketlar']
  ]);
}

function normalizeChatId(value) {
  const text = compactString(value);
  if (!text) return '';
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : text;
}

function normalizeExternalMessage(row = {}, group = {}) {
  const source = objectValue(row);
  const raw = objectValue(source.raw || source.telegram || source.payload);
  const from = objectValue(source.from || source.sender || source.user || raw.from);
  const origin = inferOrigin({ ...source, raw });
  const direction = inferDirection(source, origin);
  const firstName = compactString(from.first_name || source.first_name);
  const lastName = compactString(from.last_name || source.last_name);
  const actorName = compactString(firstValue(source, [
    'actor_name',
    'from_name',
    'sender_name',
    'user_name',
    'author_name',
    'name',
    'created_by'
  ]) || [firstName, lastName].filter(Boolean).join(' '));
  const text = compactString(firstValue(source, ['text', 'message', 'body', 'caption', 'content', 'html', 'message_text']));
  const media = normalizeMediaFromMessage({ ...source, raw });
  return {
    id: firstValue(source, ['id', 'uuid']) || null,
    message_id: firstValue(source, ['message_id', 'tg_message_id', 'telegram_message_id', 'mid']) || null,
    chat_id: normalizeChatId(firstValue(source, ['chat_id', 'group_id', 'telegram_chat_id']) || group.chat_id),
    direction,
    actor_type: origin,
    origin_type: origin,
    source_label: source.source_label || sourceLabel(origin),
    actor_name: actorName || sourceLabel(origin),
    actor_username: compactString(firstValue(source, ['actor_username', 'from_username', 'sender_username', 'username']) || from.username),
    actor_tg_user_id: firstValue(source, ['actor_tg_user_id', 'from_tg_user_id', 'from_id', 'sender_id', 'user_id']) || from.id || null,
    employee_id: firstValue(source, ['employee_id', 'support_employee_id']) || null,
    text: text || (media && media.kind === 'sticker' ? 'Stikerli xabar' : ''),
    media,
    request_id: firstValue(source, ['request_id', 'ticket_id', 'support_request_id']) || null,
    request_text: firstValue(source, ['request_text', 'initial_text', 'ticket_text']) || '',
    status: firstValue(source, ['status', 'ticket_status']) || null,
    classification: firstValue(source, ['classification', 'message_type']) || '',
    created_at: normalizeTimestamp(firstValue(source, ['created_at', 'date', 'time', 'timestamp', 'message_date']) || raw.date)
  };
}

function normalizeExternalRequest(row = {}, group = {}) {
  const source = objectValue(row);
  return {
    id: firstValue(source, ['id', 'request_id', 'ticket_id']) || null,
    source_type: 'group',
    chat_id: normalizeChatId(firstValue(source, ['chat_id', 'group_id', 'telegram_chat_id']) || group.chat_id),
    chat_title: group.title || '',
    company_id: firstValue(source, ['company_id']) || group.company_id || null,
    customer_tg_id: firstValue(source, ['customer_tg_id', 'from_tg_user_id', 'user_id']) || null,
    customer_name: firstValue(source, ['customer_name', 'from_name', 'actor_name']) || 'Mijoz',
    customer_username: firstValue(source, ['customer_username', 'from_username', 'username']) || '',
    initial_message_id: firstValue(source, ['initial_message_id', 'message_id', 'tg_message_id']) || null,
    initial_text: firstValue(source, ['initial_text', 'text', 'message', 'body']) || '',
    status: compactString(source.status || '').toLowerCase() === 'closed' ? 'closed' : (source.status || 'open'),
    closed_by_employee_id: firstValue(source, ['closed_by_employee_id']) || null,
    closed_by_tg_id: firstValue(source, ['closed_by_tg_id']) || null,
    closed_by_name: firstValue(source, ['closed_by_name', 'closed_by']) || '',
    done_message_id: firstValue(source, ['done_message_id']) || null,
    solution_text: firstValue(source, ['solution_text', 'answer', 'closed_text']) || '',
    solution_by: firstValue(source, ['solution_by', 'closed_by_name']) || '',
    solution_at: normalizeTimestamp(firstValue(source, ['solution_at', 'closed_at'])),
    created_at: normalizeTimestamp(firstValue(source, ['created_at', 'date', 'timestamp'])),
    closed_at: normalizeTimestamp(firstValue(source, ['closed_at']))
  };
}

function companyContext(row = {}, normalized = {}) {
  return {
    id: compactString(normalized.id || row.id || row.company_id),
    name: normalized.name || row.name || row.company_name || ''
  };
}

function normalizeExternalGroup(row = {}, context = {}) {
  const source = objectValue(row);
  const chatId = normalizeChatId(firstValue(source, ['chat_id', 'group_id', 'telegram_chat_id', 'id']));
  if (!chatId) return null;
  const companyId = compactString(firstValue(source, ['company_id', 'companyId']) || context.id);
  const title = compactString(firstValue(source, ['title', 'chat_title', 'group_title', 'name']) || source.username || chatId);
  const conversationRows = messageRowsFromContainer(source)
    .map(message => normalizeExternalMessage(message, { chat_id: chatId, title, company_id: companyId }))
    .filter(message => message.text || message.media || message.created_at);
  const requestRows = requestRowsFromContainer(source)
    .map(request => normalizeExternalRequest(request, { chat_id: chatId, title, company_id: companyId }))
    .filter(request => request.id || request.initial_text || request.created_at);
  const lastMessageAt = normalizeTimestamp(firstValue(source, ['last_message_at', 'updated_at', 'last_activity']))
    || conversationRows.map(message => message.created_at).filter(Boolean).sort().at(-1)
    || null;
  const conversationPreview = conversationRows
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .slice(-COMPANY_GROUP_ACTIVITY_CONVERSATION_LIMIT);
  const requestPreview = requestRows
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, COMPANY_GROUP_ACTIVITY_REQUEST_LIMIT);
  const closedRequests = requestRows.filter(request => request.status === 'closed').length;
  const openRequests = requestRows.filter(request => request.status !== 'closed').length;
  return {
    chat_id: chatId,
    title,
    username: compactString(source.username),
    source_type: 'group',
    company_id: companyId || null,
    company_name: context.name || source.company_name || '',
    last_message_at: lastMessageAt,
    total_messages: Number(source.total_messages ?? source.message_count ?? conversationRows.length),
    total_requests: Number(source.total_requests ?? source.request_count ?? requestRows.length),
    closed_requests: Number(source.closed_requests ?? source.closed_count ?? closedRequests),
    open_requests: Number(source.open_requests ?? source.open_count ?? openRequests),
    unique_customers: Number(source.unique_customers ?? source.customer_count ?? 0),
    requests: requestPreview,
    conversation: conversationPreview,
    requests_truncated: requestRows.length > requestPreview.length,
    conversation_truncated: conversationRows.length > conversationPreview.length
  };
}

function mergeExternalGroup(base = {}, next = {}) {
  const conversation = uniqueBy([
    ...(base.conversation || []),
    ...(next.conversation || [])
  ].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))), message => {
    return `${message.chat_id || ''}:${message.message_id || message.id || ''}:${message.created_at || ''}:${message.text || ''}`;
  });
  const requests = uniqueBy([...(base.requests || []), ...(next.requests || [])], request => {
    return `${request.id || ''}:${request.initial_message_id || ''}:${request.created_at || ''}:${request.initial_text || ''}`;
  }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const conversationPreview = conversation.slice(-COMPANY_GROUP_ACTIVITY_CONVERSATION_LIMIT);
  const requestPreview = requests.slice(0, COMPANY_GROUP_ACTIVITY_REQUEST_LIMIT);
  return {
    ...base,
    ...next,
    title: next.title || base.title,
    company_id: next.company_id || base.company_id || null,
    company_name: next.company_name || base.company_name || '',
    last_message_at: [base.last_message_at, next.last_message_at, conversation.at(-1)?.created_at].filter(Boolean).sort().at(-1) || null,
    total_messages: Math.max(Number(base.total_messages || 0), Number(next.total_messages || 0), conversation.length),
    total_requests: Math.max(Number(base.total_requests || 0), Number(next.total_requests || 0), requests.length),
    closed_requests: Math.max(Number(base.closed_requests || 0), Number(next.closed_requests || 0), requests.filter(request => request.status === 'closed').length),
    open_requests: Math.max(Number(base.open_requests || 0), Number(next.open_requests || 0), requests.filter(request => request.status !== 'closed').length),
    requests: requestPreview,
    conversation: conversationPreview,
    requests_truncated: requests.length > requestPreview.length,
    conversation_truncated: conversation.length > conversationPreview.length
  };
}

function extractExternalGroups(payload = {}, companyRows = [], companies = []) {
  const rows = [];
  companyRows.forEach((row, index) => {
    const context = companyContext(row, companies[index] || {});
    groupRowsFromContainer(row).forEach(group => {
      const normalized = normalizeExternalGroup(group, context);
      if (normalized) rows.push(normalized);
    });
  });
  rootGroupRows(payload).forEach(group => {
    const normalized = normalizeExternalGroup(group, {
      id: firstValue(group, ['company_id', 'companyId']),
      name: firstValue(group, ['company_name'])
    });
    if (normalized) rows.push(normalized);
  });

  const groupByChat = new Map();
  rows.forEach(group => {
    const key = compactString(group.chat_id);
    groupByChat.set(key, groupByChat.has(key) ? mergeExternalGroup(groupByChat.get(key), group) : group);
  });

  rootMessageRows(payload).forEach(messageRow => {
    const chatId = normalizeChatId(firstValue(messageRow, ['chat_id', 'group_id', 'telegram_chat_id']));
    if (!chatId) return;
    const key = compactString(chatId);
    const existing = groupByChat.get(key) || {
      chat_id: chatId,
      title: firstValue(messageRow, ['chat_title', 'group_title']) || String(chatId),
      source_type: 'group',
      company_id: firstValue(messageRow, ['company_id']) || null,
      company_name: firstValue(messageRow, ['company_name']) || '',
      total_messages: 0,
      total_requests: 0,
      closed_requests: 0,
      open_requests: 0,
      requests: [],
      conversation: []
    };
    const normalizedMessage = normalizeExternalMessage(messageRow, existing);
    groupByChat.set(key, mergeExternalGroup(existing, {
      ...existing,
      conversation: [normalizedMessage].filter(message => message.text || message.media || message.created_at),
      total_messages: Number(existing.total_messages || 0) + 1,
      last_message_at: normalizedMessage.created_at || existing.last_message_at || null
    }));
  });

  return [...groupByChat.values()].sort((a, b) => String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')));
}

function attachExternalGroups(companies = [], groups = []) {
  const byCompanyId = new Map();
  const byCompanyName = new Map();
  companies.forEach(company => {
    const id = compactString(company.id);
    const name = normalizeKey(company.name);
    if (id) byCompanyId.set(id, company);
    if (name) byCompanyName.set(name, company);
  });
  const grouped = new Map(companies.map(company => [compactString(company.id || company.name), []]).filter(([key]) => key));
  groups.forEach(group => {
    const company = byCompanyId.get(compactString(group.company_id)) || byCompanyName.get(normalizeKey(group.company_name));
    const key = compactString(company?.id || group.company_id || group.company_name || group.title);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      ...group,
      company_id: group.company_id || company?.id || null,
      company_name: group.company_name || company?.name || ''
    });
  });
  return companies.map(company => {
    const key = compactString(company.id || company.name);
    const companyGroups = grouped.get(key) || [];
    return {
      ...company,
      groups: companyGroups,
      group_count: companyGroups.length,
      total_group_messages: companyGroups.reduce((sum, group) => sum + Number(group.total_messages || 0), 0),
      total_group_requests: companyGroups.reduce((sum, group) => sum + Number(group.total_requests || 0), 0)
    };
  });
}

function scopedCompanyInfoUrl(rawUrl = companyInfoUrl()) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    throw new Error('UYQUR_COMPANY_INFO_URL noto‘g‘ri formatda');
  }
  if (!parsed.searchParams.has('fields')) {
    parsed.searchParams.set('fields', COMPANY_INFO_FIELDS.join(','));
  }
  if (!parsed.searchParams.has('include')) {
    parsed.searchParams.set('include', COMPANY_INFO_INCLUDE.join(','));
  }
  if (!parsed.searchParams.has('scope')) {
    parsed.searchParams.set('scope', optionalEnv('UYQUR_COMPANY_INFO_SCOPE', COMPANY_INFO_DEFAULT_SCOPE));
  }
  return parsed.toString();
}

function safePayloadMessage(payload = {}) {
  return typeof payload.message === 'string' ? payload.message.slice(0, 500) : null;
}

async function requestCompanyInfo(url, auth) {
  const response = await fetch(url, {
    headers: { 'X-Auth': auth }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.message
      ? JSON.stringify(payload.message)
      : response.statusText || `HTTP ${response.status}`;
    const error = new Error(`Uyqur company API: ${message}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function shouldRetryUnscoped(error = {}) {
  return [400, 404, 405, 422].includes(Number(error.status || 0));
}

async function fetchCompanyInfo(options = {}) {
  const baseUrl = companyInfoUrl();
  const url = scopedCompanyInfoUrl(baseUrl);
  const auth = companyInfoAuth();
  if (!auth) throw new Error('UYQUR_COMPANY_INFO_AUTH env sozlanmagan');

  let payload;
  let source = url;
  try {
    payload = await requestCompanyInfo(url, auth);
  } catch (error) {
    if (url === baseUrl || !shouldRetryUnscoped(error)) throw error;
    payload = await requestCompanyInfo(baseUrl, auth);
    source = baseUrl;
  }

  const companyRows = extractCompanyRows(payload);
  const normalizedCompanies = companyRows.map(sanitizeCompanyRow).map(normalizeCompany);
  const groups = extractExternalGroups(payload, companyRows, normalizedCompanies);
  const companies = attachExternalGroups(normalizedCompanies, groups);
  const supportEmployeeSync = await syncSupportEmployees(companies);
  const result = {
    summary: buildSummary(companies),
    companies,
    groups,
    support_employee_sync: supportEmployeeSync,
    fetched_at: new Date().toISOString(),
    source,
    message: safePayloadMessage(payload)
  };

  if (options.persist !== false) {
    const snapshot = await saveCompanyInfoSnapshot(result);
    return { ...result, persisted: true, cached_at: snapshot.cached_at };
  }

  return result;
}

async function syncCompanyInfo(options = {}) {
  return fetchCompanyInfo({ ...options, persist: true });
}

module.exports = {
  COMPANY_INFO_CACHE_KEY,
  fetchCompanyInfo,
  syncCompanyInfo,
  getCachedCompanyInfo,
  saveCompanyInfoSnapshot,
  normalizeCompany,
  buildSummary,
  syncSupportEmployees,
  scopedCompanyInfoUrl
};
