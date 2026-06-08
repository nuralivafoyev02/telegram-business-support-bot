'use strict';

const supabase = require('./supabase');
const { getCachedCompanyInfo } = require('./company-info');

function telegramIdKey(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).trim();
}

function isPrivateLikeSourceType(sourceType = '') {
  return ['private', 'business'].includes(String(sourceType || '').trim().toLowerCase());
}

function isGroupSourceType(sourceType = '') {
  return String(sourceType || '').trim().toLowerCase() === 'group';
}

function normalizeBusinessConnectionId(value = '') {
  return String(value || '').trim();
}

async function loadBuilderGroupChatIds() {
  const ids = new Set();
  const chats = await supabase.select('tg_chats', {
    select: 'chat_id',
    source_type: 'eq.group',
    is_active: 'eq.true',
    limit: '5000'
  }).catch(() => []);
  chats.forEach(chat => {
    const key = telegramIdKey(chat.chat_id);
    if (key) ids.add(key);
  });

  const cached = await getCachedCompanyInfo().catch(() => null);
  (cached?.companies || []).forEach(company => {
    (company.groups || []).forEach(group => {
      const key = telegramIdKey(group.chat_id);
      if (key) ids.add(key);
    });
  });
  return ids;
}

async function loadUserBuilderGroupChatIds(tgUserId) {
  const userId = telegramIdKey(tgUserId);
  if (!userId) return new Set();
  const builderGroups = await loadBuilderGroupChatIds();
  if (!builderGroups.size) return new Set();

  const rows = await supabase.select('messages', {
    select: 'chat_id',
    from_tg_user_id: supabase.eq(userId),
    source_type: 'eq.group',
    limit: '10000'
  }).catch(() => []);

  const matched = new Set();
  rows.forEach(row => {
    const chatId = telegramIdKey(row.chat_id);
    if (chatId && builderGroups.has(chatId)) matched.add(chatId);
  });
  return matched;
}

async function usersShareBuilderGroup(userIdA, userIdB) {
  const a = telegramIdKey(userIdA);
  const b = telegramIdKey(userIdB);
  if (!a || !b || a === b) return false;

  const [groupsA, groupsB] = await Promise.all([
    loadUserBuilderGroupChatIds(a),
    loadUserBuilderGroupChatIds(b)
  ]);
  for (const chatId of groupsA) {
    if (groupsB.has(chatId)) return true;
  }
  return false;
}

async function loadCompanyByGroupChatIdMap() {
  const map = new Map();
  const register = (chatId, companyId, companyName = '') => {
    const key = telegramIdKey(chatId);
    const id = String(companyId || '').trim();
    if (!key || !id || map.has(key)) return;
    map.set(key, {
      companyId: id,
      companyName: String(companyName || '').trim()
    });
  };

  const cached = await getCachedCompanyInfo().catch(() => null);
  (cached?.companies || []).forEach(company => {
    const companyId = String(company.id || company.company_id || '').trim();
    const companyName = String(company.name || company.company_name || '').trim();
    (company.groups || []).forEach(group => register(group.chat_id, companyId, companyName));
  });

  const chats = await supabase.select('tg_chats', {
    select: 'chat_id,company_id,title',
    source_type: 'eq.group',
    is_active: 'eq.true',
    limit: '5000'
  }).catch(() => []);
  chats.forEach(chat => {
    if (!chat.company_id) return;
    register(chat.chat_id, chat.company_id, chat.title || '');
  });

  return map;
}

async function resolvePrivateTicketCompanyContext(message = {}, knownEmployee = null) {
  const participants = await resolvePrivateChatParticipants(message, knownEmployee);
  if (!participants?.customerTgId || !participants.counterpartTgId) return null;
  if (!await usersShareBuilderGroup(participants.customerTgId, participants.counterpartTgId)) return null;

  const [customerGroups, companyByChatId] = await Promise.all([
    loadUserBuilderGroupChatIds(participants.customerTgId),
    loadCompanyByGroupChatIdMap()
  ]);

  for (const chatId of customerGroups) {
    const company = companyByChatId.get(chatId);
    if (company?.companyId) return company;
  }
  return null;
}

async function resolveBusinessCounterpartTgId(businessConnectionId) {
  const connectionId = normalizeBusinessConnectionId(businessConnectionId);
  if (!connectionId) return null;
  const rows = await supabase.select('business_connections', {
    select: 'tg_user_id,user_chat_id',
    connection_id: supabase.eq(connectionId),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  return telegramIdKey(row?.tg_user_id || row?.user_chat_id || '');
}

async function resolvePrivateChatParticipants(message = {}, knownEmployee = null) {
  const chat = message.chat || {};
  const from = message.from || {};
  const fromId = telegramIdKey(from.id);
  const chatId = telegramIdKey(chat.id);
  if (!fromId || !chatId) return null;

  const employeeTgId = telegramIdKey(knownEmployee?.tg_user_id || '');
  const fromIsEmployee = Boolean(knownEmployee && employeeTgId && fromId === employeeTgId);

  if (fromIsEmployee) {
    return { customerTgId: chatId, counterpartTgId: fromId };
  }

  let counterpartTgId = '';
  if (message.business_connection_id) {
    counterpartTgId = await resolveBusinessCounterpartTgId(message.business_connection_id);
  } else if (knownEmployee?.tg_user_id) {
    counterpartTgId = telegramIdKey(knownEmployee.tg_user_id);
  }
  return { customerTgId: fromId, counterpartTgId };
}

async function canCreateTicketFromPrivateMessage({ sourceType } = {}) {
  if (isGroupSourceType(sourceType)) return true;
  if (isPrivateLikeSourceType(sourceType)) return false;
  return true;
}

module.exports = {
  isPrivateLikeSourceType,
  isGroupSourceType,
  usersShareBuilderGroup,
  resolvePrivateChatParticipants,
  resolvePrivateTicketCompanyContext,
  canCreateTicketFromPrivateMessage
};
