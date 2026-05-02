'use strict';

const { sendJson, readBody, getQuery } = require('../lib/http');
const { optionalEnv, boolEnv } = require('../lib/env');
const supabase = require('../lib/supabase');
const { sendMessage, deleteMessage, reactToMessage, answerCallbackQuery, editMessageReplyMarkup, escapeHtml, tgUserName, getWebhookInfo, getMe, getChatMember } = require('../lib/telegram');
const { getMessageText, classifyMessage, isGreetingOnly, isSmallTalk, isCompletionIntent } = require('../lib/parser');
const { getBotSettings } = require('../lib/bot-settings');
const { resolveMainStatsChatId, sendMainStatsReport, buildMainStatsQuestionReply } = require('../lib/report');
const { shouldUseExternalAi, classifyWithAi, generateSupportReply, generateLocalSupportReply } = require('../lib/ai');
const { notifyIncomingLog, notifyOperationalError } = require('../lib/log-notifier');
const metrics = require('../lib/metrics');

const START_RE = /^\/start(?:@\w+)?(?:\s|$)/i;
const HELP_RE = /^\/help(?:@\w+)?(?:\s|$)/i;
const REGISTER_RE = /^\/(?:register|id|chatid)(?:@\w+)?(?:\s|$)/i;
const MAIN_STATS_TRIGGER_RE = /\b(?:xodimlar|hodimlar)\s+statisti[ck]asi\b/i;
const GROUP_BROADCAST_TRIGGER_RES = [
  /\b(?:barcha|hamma|jami)\s+(?:guruh(?:lar)?|gruppa(?:lar)?|group(?:s)?|chat(?:lar)?)(?:ga)?\b.*\b(?:yubor(?:ing)?|jo'?nat(?:ing)?|tarqat(?:ing)?|send)\b/i,
  /\b(?:yubor(?:ing)?|jo'?nat(?:ing)?|tarqat(?:ing)?|send)\b.*\b(?:barcha|hamma|jami)\s+(?:guruh(?:lar)?|gruppa(?:lar)?|group(?:s)?|chat(?:lar)?)(?:ga)?\b/i
];
const BROADCAST_CONFIRM_PREFIX = 'broadcast_confirm:';
const BROADCAST_CANCEL_PREFIX = 'broadcast_cancel:';
const BROADCAST_DELETE_CONFIRM_PREFIX = 'broadcast_delete_confirm:';
const BROADCAST_DELETE_CANCEL_PREFIX = 'broadcast_delete_cancel:';
const TELEGRAM_TEXT_LIMIT = 4096;
const RESULT_CHUNK_LIMIT = 3600;
const BROADCAST_CONCURRENCY = clampInt(optionalEnv('BROADCAST_CONCURRENCY', '8'), 8, 1, 20);
const PRIVATE_GREETING_REPLY = "Va alaykum assalom! So'rovingiz bo'lsa guruhga yoki @uyqur_nurali ga yozishingiz mumkin.";
const PRIVATE_UNKNOWN_REPLY = "So'rovingizni guruhga yoki @uyqur_nurali ga berishingiz mumkin";
const PRIVATE_REQUEST_REPLY = "So'rovingiz qabul qilindi. Guruhga yoki @uyqur_nurali ga yozishingiz mumkin.";
const MAIN_GROUP_AUTO_REPLY_MISS = "Bu savol bo'yicha bilim bazasida aniq javob topilmadi. Mas'ul xodim javob beradi.";
const AUTO_REPLY_MISS = "Savolingiz qabul qilindi. Bilim bazasida aniq javob topilmadi, mas'ul xodim javob beradi.";
const QUESTION_LIKE_RE = /[?؟]|\b(qanday|qanaqa|qayerda|qayerdan|qachon|nega|nimaga|nima\s+uchun|qancha|savol|tushuntir|ko'?rsat|o'?rgat|как|где|почему|зачем|сколько|what|how|where|why|when)\b/i;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

function verifyWebhook(req) {
  const secret = optionalEnv('TELEGRAM_WEBHOOK_SECRET', '');
  if (!secret) return true;
  const query = getQuery(req);
  const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
  return query.secret === secret || headerSecret === secret;
}

function pickMessage(update) {
  if (update.message) return { kind: 'message', message: update.message };
  if (update.edited_message) return { kind: 'edited_message', message: update.edited_message };
  if (update.channel_post) return { kind: 'channel_post', message: update.channel_post };
  if (update.edited_channel_post) return { kind: 'edited_channel_post', message: update.edited_channel_post };
  if (update.business_message) return { kind: 'business_message', message: update.business_message };
  if (update.edited_business_message) return { kind: 'edited_business_message', message: update.edited_business_message };
  return null;
}

function baseHealth() {
  return {
    ok: true,
    service: 'telegram-business-support-bot',
    endpoint: 'bot',
    env: {
      botToken: !!optionalEnv('BOT_TOKEN', ''),
      webhookSecret: !!optionalEnv('TELEGRAM_WEBHOOK_SECRET', ''),
      supabaseUrl: !!optionalEnv('SUPABASE_URL', ''),
      supabaseServiceRoleKey: !!optionalEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    }
  };
}

function maskWebhookUrl(url = '') {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('secret')) parsed.searchParams.set('secret', '***');
    return parsed.toString();
  } catch (_error) {
    return String(url).replace(/secret=[^&]+/g, 'secret=***');
  }
}

async function getHealth({ diagnostics = false } = {}) {
  const health = baseHealth();
  if (!diagnostics) return health;

  const [db, telegram] = await Promise.all([
    supabase.select('tg_chats', { select: 'chat_id', limit: '1' })
      .then(() => ({ ok: true }))
      .catch(error => ({ ok: false, error: error.message })),
    getWebhookInfo()
      .then(info => ({
        ok: true,
        url: maskWebhookUrl(info && info.url || ''),
        allowed_updates: Array.isArray(info && info.allowed_updates) ? info.allowed_updates : [],
        pending_update_count: info && info.pending_update_count || 0,
        last_error_message: info && info.last_error_message || ''
      }))
      .catch(error => ({ ok: false, error: compactError(error) }))
  ]);

  return {
    ...health,
    diagnostics: {
      supabase: db,
      telegram
    }
  };
}

function telegramDescription(error = {}) {
  return String(error.telegram && error.telegram.description || error.message || '');
}

function isDeleteAlreadyHandled(error = {}) {
  return /message to delete not found|message can't be deleted|message identifier is not specified|not found/i.test(telegramDescription(error));
}

function isDeletePermissionError(error = {}) {
  return /not enough rights|message can't be deleted|can't remove|need administrator rights|have no rights|forbidden/i.test(telegramDescription(error));
}

function compactError(error = {}) {
  const description = telegramDescription(error);
  return description.replace(/^Telegram\s+\w+:\s*/i, '').trim() || String(error || 'unknown error');
}

function deletePermissionDiagnostic(member = null) {
  if (!member) return '';
  const status = String(member.status || '').toLowerCase();
  if (!['administrator', 'creator'].includes(status)) {
    return `Bot statusi: ${status || 'unknown'}. Botni guruhda admin qiling.`;
  }
  if (status === 'administrator' && member.can_delete_messages !== true) {
    return 'Bot admin, lekin `can_delete_messages` permission yo‘q.';
  }
  return 'Botda delete permission bor, lekin Telegram deleteMessage rad etdi.';
}

async function inspectBotDeletePermission(chatId) {
  try {
    const bot = await getMe();
    if (!bot || !bot.id) return '';
    const member = await getChatMember(chatId, bot.id);
    return deletePermissionDiagnostic(member);
  } catch (error) {
    return `Delete permission tekshirilmadi: ${compactError(error)}`;
  }
}

async function deleteCommandMessage(chatId, messageId) {
  try {
    await deleteMessage(chatId, messageId);
    return { deleted: true };
  } catch (error) {
    if (isDeleteAlreadyHandled(error) && !isDeletePermissionError(error)) {
      return { deleted: true, alreadyHandled: true };
    }
    const permissionDiagnostic = isDeletePermissionError(error)
      ? await inspectBotDeletePermission(chatId)
      : '';
    logBackgroundError('delete-group-command', error);
    return {
      deleted: false,
      error,
      reason: compactError(error),
      permissionDiagnostic
    };
  }
}

function summarizeUpdate(update = {}) {
  const picked = pickMessage(update);
  if (picked && picked.message) {
    const message = picked.message;
    const text = getMessageText(message);
    return {
      update_id: update.update_id,
      type: picked.kind,
      chat_id: message.chat && message.chat.id,
      chat_type: message.chat && message.chat.type,
      command: text.startsWith('/') ? text.split(/\s+/)[0] : undefined
    };
  }
  if (update.my_chat_member || update.chat_member) {
    const memberUpdate = update.my_chat_member || update.chat_member;
    return {
      update_id: update.update_id,
      type: update.my_chat_member ? 'my_chat_member' : 'chat_member',
      chat_id: memberUpdate.chat && memberUpdate.chat.id,
      chat_type: memberUpdate.chat && memberUpdate.chat.type,
      status: memberUpdate.new_chat_member && memberUpdate.new_chat_member.status
    };
  }
  if (update.business_connection) {
    return { update_id: update.update_id, type: 'business_connection' };
  }
  if (update.callback_query) {
    const query = update.callback_query;
    return {
      update_id: update.update_id,
      type: 'callback_query',
      data: query.data,
      chat_id: query.message && query.message.chat && query.message.chat.id
    };
  }
  return { update_id: update.update_id, type: 'ignored' };
}

async function handleStart(message) {
  const text = [
    '<b>Assalomu alaykum!</b>',
    '',
    'Men Uyqur yordam botiman. Uyqur dasturi bo‘yicha savol, muammo yoki taklifingiz bo‘lsa, shu yerga yozishingiz mumkin.',
    '',
    'Qanday yordam bera olaman?'
  ].join('\n');
  await sendTrackedBotReply({ message, text, updateKind: 'bot_start', rawSource: 'bot_start' });
}

function isGroupChat(chat = {}) {
  return ['group', 'supergroup'].includes(chat.type);
}

function isChannelLogPost(updateKind = '', chat = {}) {
  return chat.type === 'channel' || String(updateKind || '').includes('channel_post');
}

function sameChatId(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function configuredMainGroupId(settings = null) {
  return String(settings && settings.mainGroupId || optionalEnv('MAIN_GROUP_ID', '')).trim();
}

function isConfiguredMainGroup(chat = {}, settings = null) {
  const configured = configuredMainGroupId(settings);
  return Boolean(configured && sameChatId(configured, chat.id));
}

function configuredLogSourceFor(chat = {}, settings = {}) {
  const sources = settings.logNotifications && Array.isArray(settings.logNotifications.sources)
    ? settings.logNotifications.sources
    : [];
  return sources.find(source => source.enabled !== false && sameChatId(source.chat_id, chat.id)) || null;
}

function getIncomingLogText(message = {}) {
  return String(message.text || message.caption || '').trim();
}

function groupDisplayName(message = {}, chatRow = null) {
  return (chatRow && chatRow.title)
    || (message.chat && (message.chat.title || message.chat.username))
    || String(message.chat && message.chat.id || 'Guruh');
}

function auditValue(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function auditCode(value) {
  return `<code>${escapeHtml(auditValue(value))}</code>`;
}

function inferMessageRawSource({ message = {}, employee = null, savedMessage = null, classification = '' } = {}) {
  const rawSource = savedMessage && savedMessage.raw && savedMessage.raw.source;
  if (rawSource) return rawSource;
  if (message.from && message.from.is_bot) return 'bot_message';
  if (employee || classification === 'employee_message') return 'employee_message';
  return 'customer_message';
}

function auditActorName(message = {}, employee = null) {
  const from = message.from || {};
  const username = from.username ? ` @${from.username}` : '';
  const name = (employee && employee.full_name) || tgUserName(from);
  return `${name}${username}`;
}

function buildGroupSaveAudit({ status, message, chatRow, classification, employee, savedMessage = null, error = null, target = 'public.messages', stage = '' }) {
  const chat = message.chat || {};
  const from = message.from || {};
  const groupName = groupDisplayName(message, chatRow);
  const rawSource = inferMessageRawSource({ message, employee, savedMessage, classification });
  const savedRowId = savedMessage && savedMessage.id || '';
  const savedTgMessageId = savedMessage && (savedMessage.tg_message_id || savedMessage.message_id) || message.message_id || '';
  const title = status === 'saved' ? 'Guruh xabari saqlandi' : 'Guruh xabari saqlanmadi';
  const statusIcon = status === 'saved' ? '✅' : '❌';
  const plainLines = [
    `${statusIcon} ${title}`,
    `Manba guruh: ${groupName}`,
    `Manba chat_id: ${auditValue(chat.id)}`,
    `Manba message_id: ${auditValue(message.message_id)}`,
    `Yuboruvchi: ${auditActorName(message, employee)} (${auditValue(from.id)})`,
    `Kelgan manba: ${rawSource}`,
    `Classification: ${auditValue(classification)}`,
    status === 'saved'
      ? `Saqlangan joy: ${target}`
      : `Saqlashga uringan joy: ${target}`,
    `DB chat_id: ${auditValue(chat.id)}`,
    `DB tg_message_id: ${auditValue(savedTgMessageId)}`,
    savedRowId ? `DB row_id: ${savedRowId}` : '',
    stage ? `Bosqich: ${stage}` : '',
    error ? `Saqlanmagan sababi: ${compactError(error)}` : ''
  ].filter(Boolean);
  const htmlLines = [
    `${statusIcon} <b>${escapeHtml(title)}</b>`,
    `Manba guruh: <b>${escapeHtml(groupName)}</b>`,
    `Manba chat_id: ${auditCode(chat.id)}`,
    `Manba message_id: ${auditCode(message.message_id)}`,
    `Yuboruvchi: <b>${escapeHtml(auditActorName(message, employee))}</b> (${auditCode(from.id)})`,
    `Kelgan manba: ${auditCode(rawSource)}`,
    `Classification: ${auditCode(classification)}`,
    status === 'saved'
      ? `Saqlangan joy: ${auditCode(target)}`
      : `Saqlashga uringan joy: ${auditCode(target)}`,
    `DB chat_id: ${auditCode(chat.id)}`,
    `DB tg_message_id: ${auditCode(savedTgMessageId)}`,
    savedRowId ? `DB row_id: ${auditCode(savedRowId)}` : '',
    stage ? `Bosqich: ${auditCode(stage)}` : '',
    error ? `Saqlanmagan sababi: ${auditCode(compactError(error))}` : ''
  ].filter(Boolean);
  return {
    groupName,
    rawSource,
    text: plainLines.join('\n'),
    telegramText: htmlLines.join('\n')
  };
}

async function resolveMainNotificationChat(settings = null) {
  const configured = configuredMainGroupId(settings);
  if (configured) return configured;
  return resolveMainStatsChatId().catch(() => '');
}

async function loadChatForBotRecord(chatId) {
  const rows = await supabase.select('tg_chats', {
    select: 'chat_id,title,username,type,source_type,business_connection_id',
    chat_id: supabase.eq(chatId),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || {};
  return {
    id: chatId,
    type: row.type || 'supergroup',
    title: row.title || String(chatId),
    username: row.username || undefined,
    business_connection_id: row.business_connection_id || null,
    source_type: row.source_type || 'group'
  };
}

async function maybeNotifyMainGroupMessageSaveAudit({ status, updateKind, message, settings, chatRow, classification, employee = null, savedMessage = null, error = null, target = 'public.messages', stage = '' }) {
  const chat = message.chat || {};
  if (!isGroupChat(chat)) return;
  if (isConfiguredMainGroup(chat, settings)) return;
  if (String(updateKind || '').includes('edited')) return;

  let mainGroupId = '';
  try {
    mainGroupId = await resolveMainNotificationChat(settings);
  } catch (resolveError) {
    logBackgroundError(`notify-main-message-${status}-resolve`, resolveError);
    return;
  }
  if (!mainGroupId || sameChatId(mainGroupId, chat.id)) return;

  const audit = buildGroupSaveAudit({ status, message, chatRow, classification, employee, savedMessage, error, target, stage });
  let telegramResult = null;
  try {
    telegramResult = await sendMessage(mainGroupId, audit.telegramText);
  } catch (sendError) {
    logBackgroundError(`notify-main-message-${status}`, sendError);
    return;
  }

  const mainChat = await loadChatForBotRecord(mainGroupId);
  await saveBotMessageRecord({
    telegramResult,
    chat: mainChat,
    sourceType: 'group',
    text: audit.text,
    classification: 'bot_notification',
    updateKind: status === 'saved' ? 'bot_message_saved_notice' : 'bot_message_save_failed_notice',
    businessConnectionId: mainChat.business_connection_id || null,
    raw: {
      source: status === 'saved' ? 'bot_message_saved_notice' : 'bot_message_save_failed_notice',
      audit_status: status,
      target_table: target,
      stage: stage || null,
      source_chat_id: chat.id || null,
      source_chat_title: audit.groupName,
      source_message_id: message.message_id || null,
      source_classification: classification || '',
      source_raw: audit.rawSource,
      saved_message_id: savedMessage && savedMessage.id || null,
      error: error ? compactError(error) : ''
    }
  });
}

async function maybeNotifyMainGroupMessageSaved(params) {
  return maybeNotifyMainGroupMessageSaveAudit({ ...params, status: 'saved' });
}

async function maybeNotifyMainGroupMessageSaveFailed(params) {
  return maybeNotifyMainGroupMessageSaveAudit({ ...params, status: 'failed' });
}

async function maybeRelayIncomingLog(updateKind, message, settings) {
  const chat = message.chat || {};
  if (!isChannelLogPost(updateKind, chat)) return false;
  const source = configuredLogSourceFor(chat, settings);
  if (!source) return true;
  const text = getIncomingLogText(message);
  if (!text.trim()) return true;
  await notifyIncomingLog({ source, text, message, settings });
  return true;
}

function isMainStatsTrigger(text = '') {
  return MAIN_STATS_TRIGGER_RE.test(text);
}

async function isMainStatsGroup(chat = {}, settings = null, options = {}) {
  const configured = configuredMainGroupId(settings);
  if (configured) return sameChatId(configured, chat.id);
  if (options.resolveFallback === false) return false;

  const target = await resolveMainStatsChatId().catch(error => {
    logBackgroundError('resolve-main-stats-group', error);
    return '';
  });
  return target && sameChatId(target, chat.id);
}

async function maybeSendMainStatsFromGroup(message, text, settings = null) {
  const chat = message.chat || {};
  if (!isGroupChat(chat) || !isMainStatsTrigger(text)) return false;
  if (!await isMainStatsGroup(chat, settings)) return false;

  try {
    await sendMainStatsReport(chat.id);
  } catch (error) {
    logBackgroundError('send-main-stats-trigger', error);
    await sendMessage(chat.id, `⚠️ Statistika yuborilmadi: ${escapeHtml(error.message)}`)
      .catch(replyError => logBackgroundError('reply-main-stats-error', replyError));
  }
  return true;
}

async function saveBotMessageRecord({ telegramResult, chat, sourceType, text, classification = 'bot_reply', updateKind = 'bot_reply', businessConnectionId = null, raw = {} }) {
  if (!telegramResult || !telegramResult.message_id || !chat || chat.id === undefined || chat.id === null) return;
  const resolvedSourceType = sourceType || metrics.sourceTypeFrom(updateKind, chat.type);
  await metrics.upsertChat(chat, resolvedSourceType, {
    business_connection_id: businessConnectionId || null
  }, { prefer: 'return=minimal' }).catch(error => logBackgroundError('save-bot-reply-chat', error));
  await supabase.insert('messages', [{
    tg_message_id: telegramResult.message_id,
    chat_id: chat.id,
    from_tg_user_id: null,
    from_name: 'Uyqur Bot',
    from_username: null,
    source_type: resolvedSourceType,
    update_kind: updateKind,
    text,
    classification,
    employee_id: null,
    business_connection_id: businessConnectionId || null,
    raw: {
      source: raw.source || 'bot_reply',
      telegram: telegramResult,
      ...raw
    },
    created_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: 'return=minimal' })
    .catch(error => logBackgroundError('save-bot-reply', error));
}

async function saveOutgoingBotMessage({ telegramResult, sourceMessage, sourceType, text, classification = 'bot_reply', updateKind = 'bot_reply', raw = {} }) {
  if (!sourceMessage || !sourceMessage.chat) return;
  await saveBotMessageRecord({
    telegramResult,
    chat: sourceMessage.chat,
    sourceType,
    text,
    classification,
    updateKind,
    businessConnectionId: sourceMessage.business_connection_id || null,
    raw: {
      reply_to_message_id: sourceMessage.message_id || null,
      ...raw
    }
  });
}

async function sendTrackedBotReply({ message, sourceType, text, options = {}, classification = 'bot_reply', updateKind = 'bot_reply', rawSource = 'bot_reply' }) {
  const sendOptions = { ...options };
  if (message.business_connection_id && !sendOptions.business_connection_id) {
    sendOptions.business_connection_id = message.business_connection_id;
  }
  const result = await sendMessage(message.chat.id, text, sendOptions);
  await saveOutgoingBotMessage({
    telegramResult: result,
    sourceMessage: message,
    sourceType: sourceType || metrics.sourceTypeFrom(updateKind, (message.chat || {}).type),
    text,
    classification,
    updateKind,
    raw: { source: rawSource }
  });
  return result;
}

function isGroupBroadcastTrigger(text = '') {
  return GROUP_BROADCAST_TRIGGER_RES.some(pattern => pattern.test(text));
}

function isGroupBroadcastDeleteTrigger(text = '') {
  const value = String(text || '').toLowerCase();
  const hasDelete = /\b(?:o'?chir|ochir|delete|udal|удал)\w*\b/i.test(value);
  const hasLatest = /\b(?:oxirgi|so'?nggi|songgi|last|последн)\b/i.test(value);
  const hasBroadcastContext = /\b(?:yangilanish|broadcast|e'?lon|elon|xabar|update)\w*\b/i.test(value);
  const hasSentGroupContext = /\b(?:barcha|hamma|jami)\b.*\b(?:guruh|gruppa|group|chat)\w*\b.*\b(?:yuborgan|jo'?natgan|tarqatgan|send)\w*\b/i.test(value);
  return hasDelete && ((hasLatest && hasBroadcastContext) || hasSentGroupContext);
}

function clipText(text = '', limit = 1600) {
  const value = String(text || '');
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 20).trimEnd()}\n...`;
}

function getRawMessageText(message = {}) {
  return String(message.text || message.caption || '');
}

function broadcastTitle(text = '') {
  const firstLine = String(text || '').split('\n').map(line => line.trim()).find(Boolean) || 'Main group broadcast';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function actorName(user = {}) {
  if (user.username) return `@${user.username}`;
  return tgUserName(user);
}

async function listActiveGroupBroadcastTargets() {
  const rows = await supabase.select('tg_chats', {
    select: 'chat_id,title,business_connection_id,source_type',
    source_type: 'eq.group',
    is_active: 'eq.true',
    order: supabase.order('title', true),
    limit: '1000'
  });
  return rows;
}

async function loadGroupBroadcastWithTargets(id = null) {
  const query = {
    select: 'id,title,text,target_type,total_targets,sent_count,failed_count,status,created_at,completed_at',
    target_type: 'eq.groups',
    status: 'in.(sent,completed_with_errors)',
    order: supabase.order('completed_at', false),
    limit: '1'
  };
  if (id) query.id = supabase.eq(id);
  if (!id) query.sent_count = 'gt.0';

  const broadcasts = await supabase.select('broadcasts', query).catch(() => []);
  const broadcast = broadcasts[0] || null;
  if (!broadcast) return { broadcast: null, targets: [] };

  const targetRows = await supabase.select('broadcast_targets', {
    select: 'id,broadcast_id,chat_id,status,telegram_message_id,error',
    broadcast_id: supabase.eq(broadcast.id),
    status: 'eq.sent',
    telegram_message_id: 'not.is.null',
    limit: '1000'
  }).catch(() => []);

  const chatIds = [...new Set(targetRows.map(row => row.chat_id).filter(idValue => idValue !== undefined && idValue !== null))];
  const chats = chatIds.length
    ? await supabase.select('tg_chats', {
      select: 'chat_id,title',
      chat_id: supabase.inList(chatIds),
      limit: '1000'
    }).catch(() => [])
    : [];
  const chatMap = new Map(chats.map(chat => [String(chat.chat_id), chat]));
  const targets = targetRows.map(row => {
    const chat = chatMap.get(String(row.chat_id)) || {};
    return { ...row, title: chat.title || String(row.chat_id) };
  });

  return { broadcast, targets };
}

function broadcastPreviewText({ text, targets, createdBy }) {
  return [
    '📣 <b>Ommaviy xabar preview</b>',
    '',
    `<b>Yuboriladigan guruhlar:</b> ${targets.length} ta`,
    `<b>Tasdiqlovchi:</b> ${escapeHtml(createdBy)}`,
    '',
    '<b>Xabar:</b>',
    escapeHtml(clipText(text))
  ].join('\n');
}

function broadcastResultMessages({ total, sent, failed, details }) {
  const header = [
    '📣 <b>Ommaviy xabar yakunlandi</b>',
    '',
    `<b>Jami:</b> ${total} ta | <b>Yuborildi:</b> ${sent} ta | <b>Xato:</b> ${failed} ta`
  ];
  const lines = details.length
    ? details.map((item, index) => `${index + 1}. ${escapeHtml(item.title || String(item.chat_id))} ${item.ok ? '✅' : '🔴'}`)
    : ['Faol guruh topilmadi.'];

  const chunks = [];
  let current = `${header.join('\n')}\n\n`;
  for (const line of lines) {
    if (current.length + line.length + 1 > RESULT_CHUNK_LIMIT) {
      chunks.push(current.trimEnd());
      current = '📣 <b>Ommaviy xabar yakunlandi (davomi)</b>\n\n';
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current.trimEnd());
  return chunks;
}

function broadcastDeletePreviewText({ broadcast, targets }) {
  return [
    '🧹 <b>Oxirgi ommaviy xabarni o‘chirish</b>',
    '',
    `<b>Guruhlar:</b> ${targets.length} ta`,
    `<b>Sarlavha:</b> ${escapeHtml(broadcast.title || 'Yangilik')}`,
    '',
    '<b>Xabar:</b>',
    escapeHtml(clipText(broadcast.text || '', 900)),
    '',
    'Shu xabarni barcha guruhlardan o‘chirishimni tasdiqlaysizmi?'
  ].join('\n');
}

function broadcastDeleteResultMessages({ total, deleted, failed, details }) {
  const header = [
    '🧹 <b>Ommaviy xabar o‘chirish yakunlandi</b>',
    '',
    `<b>Jami:</b> ${total} ta | <b>O‘chirildi:</b> ${deleted} ta | <b>Xato:</b> ${failed} ta`
  ];
  const lines = details.length
    ? details.map((item, index) => `${index + 1}. ${escapeHtml(item.title || String(item.chat_id))} ${item.ok ? '✅' : '🔴'}`)
    : ['O‘chirish uchun xabar topilmadi.'];

  const chunks = [];
  let current = `${header.join('\n')}\n\n`;
  for (const line of lines) {
    if (current.length + line.length + 1 > RESULT_CHUNK_LIMIT) {
      chunks.push(current.trimEnd());
      current = '🧹 <b>Ommaviy xabar o‘chirish yakunlandi (davomi)</b>\n\n';
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current.trimEnd());
  return chunks;
}

async function maybeStartGroupBroadcastPreview(message, text, settings = null) {
  const chat = message.chat || {};
  if (!isGroupChat(chat) || !isGroupBroadcastTrigger(text)) return false;
  if (!await isMainStatsGroup(chat, settings)) return false;

  const source = message.reply_to_message || {};
  const sourceText = getRawMessageText(source);
  if (!sourceText) {
    await sendMessage(chat.id, '⚠️ Qaysi yangilik yuborilishini bilishim uchun yangilik xabariga reply qilib yozing.', {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('broadcast-preview-no-source', error));
    return true;
  }

  if (sourceText.length > TELEGRAM_TEXT_LIMIT) {
    await sendMessage(chat.id, `⚠️ Xabar juda uzun. Telegram limiti: ${TELEGRAM_TEXT_LIMIT} belgi.`, {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('broadcast-preview-too-long', error));
    return true;
  }

  const targets = await listActiveGroupBroadcastTargets();
  if (!targets.length) {
    await sendMessage(chat.id, '⚠️ Yuborish uchun faol guruh topilmadi.', {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('broadcast-preview-no-targets', error));
    return true;
  }

  const createdBy = actorName(message.from || {});
  const [broadcast] = await supabase.insert('broadcasts', [{
    title: broadcastTitle(sourceText),
    text: sourceText,
    target_type: 'groups',
    total_targets: targets.length,
    sent_count: 0,
    failed_count: 0,
    created_by: createdBy,
    status: 'created'
  }]);

  await sendMessage(chat.id, broadcastPreviewText({ text: sourceText, targets, createdBy }), {
    reply_to_message_id: message.message_id,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Tasdiqlash', callback_data: `${BROADCAST_CONFIRM_PREFIX}${broadcast.id}` },
        { text: '❌ Bekor qilish', callback_data: `${BROADCAST_CANCEL_PREFIX}${broadcast.id}` }
      ]]
    }
  });
  return true;
}

async function maybeStartGroupBroadcastDeletePreview(message, text, settings = null) {
  const chat = message.chat || {};
  if (!isGroupChat(chat) || !isGroupBroadcastDeleteTrigger(text)) return false;
  if (!await isMainStatsGroup(chat, settings)) return false;

  const { broadcast, targets } = await loadGroupBroadcastWithTargets();
  if (!broadcast || !targets.length) {
    await sendMessage(chat.id, '⚠️ O‘chirish uchun oxirgi yuborilgan ommaviy xabar topilmadi.', {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('broadcast-delete-no-targets', error));
    return true;
  }

  await sendMessage(chat.id, broadcastDeletePreviewText({ broadcast, targets }), {
    reply_to_message_id: message.message_id,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Ha, tasdiqlayman', callback_data: `${BROADCAST_DELETE_CONFIRM_PREFIX}${broadcast.id}` },
        { text: '❌ Yo‘q, bekor qilinsin', callback_data: `${BROADCAST_DELETE_CANCEL_PREFIX}${broadcast.id}` }
      ]]
    }
  });
  return true;
}

async function handleGroupRegistrationCommand(message, tracking) {
  const chat = message.chat || {};
  const deleteCommandPromise = deleteCommandMessage(chat.id, message.message_id);
  let registered = true;
  await tracking.catch(error => {
    registered = false;
    logBackgroundError('register-group', error);
  });
  const diagnostics = [];
  try {
    const info = await getWebhookInfo();
    const allowedUpdates = Array.isArray(info && info.allowed_updates) ? info.allowed_updates : [];
    if (allowedUpdates.length && !allowedUpdates.includes('message')) {
      diagnostics.push('Webhook `allowed_updates` ichida `message` yo‘q.');
    }
    if (allowedUpdates.length && !allowedUpdates.includes('my_chat_member')) {
      diagnostics.push('Webhook `allowed_updates` ichida `my_chat_member` yo‘q.');
    }
  } catch (error) {
    logBackgroundError('register-group-webhook-diagnostics', error);
  }
  const deleteResult = await deleteCommandPromise;
  if (!deleteResult.deleted) {
    diagnostics.push([
      `Command o‘chirilmadi: ${deleteResult.reason || 'Telegram deleteMessage rad etdi.'}`,
      deleteResult.permissionDiagnostic || 'Bot guruhda admin va delete permissionga ega ekanini tekshiring.'
    ].filter(Boolean).join(' '));
  }
  const registrationText = registered
    ? [
      '✅ Guruh ro‘yxatga olindi.',
      deleteResult.deleted ? '🧹 Command xabari o‘chirildi.' : '',
      'Agar oddiy guruh xabarlari baribir ko‘rinmasa:',
      '1) BotFather -> `/setprivacy` -> `Disable` qiling.',
      '2) Webhookda `allowed_updates` ichida `message` bo‘lishini tekshiring.',
      diagnostics.length ? `⚠️ Aniqlangan muammo: ${diagnostics.join(' ')}` : ''
    ].filter(Boolean).join('\n')
    : '⚠️ Guruhni ro‘yxatga olishda xatolik bo‘ldi. Iltimos, keyinroq qayta urinib ko‘ring.';
  await sendTrackedBotReply({
    message,
    text: registrationText,
    options: deleteResult.deleted ? {} : { reply_to_message_id: message.message_id },
    updateKind: 'bot_register_group',
    rawSource: 'bot_register_group'
  }).catch(error => logBackgroundError('register-group-reply', error));
}

async function handleHelp(message) {
  await sendTrackedBotReply({ message, text: [
    '📌 <b>Qisqa qo‘llanma</b>',
    '',
    '1) Mijoz Uyqur dasturidagi savol yoki muammoni guruh/business chatga yozadi.',
    '2) Bot uni <b>open request</b> sifatida saqlaydi.',
    '3) Xodim tushuntirib yoki muammoni hal qilib javob yozganda ticket yopiladi. <b>#done</b> va reply ham ishlaydi.',
    '4) Statistika webappda yangilanadi.',
    '5) Guruh webappda ko‘rinmasa guruh ichida <b>/register</b> yuboring.',
    '',
    'Masalan: <code>#done hal qilindi</code>'
  ].join('\n'), updateKind: 'bot_help', rawSource: 'bot_help' });
}

function logBackgroundError(label, error) {
  console.error(`[bot:${label}:error]`, error);
  notifyOperationalError(`bot:${label}`, error).catch(logError => console.error('[bot:notify-log:error]', logError));
}

async function maybeReplyDone(message, result) {
  if (result.closed) {
    await reactToMessage(message.chat.id, message.message_id, '⚡')
      .catch(error => logBackgroundError('ticket-close-reaction', error));
  } else {
    if (isGroupChat(message.chat || {})) return;
    const silent = boolEnv('SILENT_DONE_REPLY', false);
    if (silent) return;
    await sendTrackedBotReply({ message, text: '⚠️ #done qabul qilindi, lekin bu chatda ochiq so‘rov topilmadi.', options: {
      reply_to_message_id: message.message_id
    }, updateKind: 'bot_done_miss', rawSource: 'bot_done_miss' }).catch(error => logBackgroundError('reply-done', error));
  }
}

function parseBroadcastCallbackData(data = '') {
  const value = String(data || '');
  if (value.startsWith(BROADCAST_DELETE_CONFIRM_PREFIX)) {
    return { action: 'delete_confirm', id: value.slice(BROADCAST_DELETE_CONFIRM_PREFIX.length) };
  }
  if (value.startsWith(BROADCAST_DELETE_CANCEL_PREFIX)) {
    return { action: 'delete_cancel', id: value.slice(BROADCAST_DELETE_CANCEL_PREFIX.length) };
  }
  if (value.startsWith(BROADCAST_CONFIRM_PREFIX)) {
    return { action: 'confirm', id: value.slice(BROADCAST_CONFIRM_PREFIX.length) };
  }
  if (value.startsWith(BROADCAST_CANCEL_PREFIX)) {
    return { action: 'cancel', id: value.slice(BROADCAST_CANCEL_PREFIX.length) };
  }
  return null;
}

async function markBroadcastProcessing(id) {
  const rows = await supabase.patch('broadcasts', { id: supabase.eq(id), status: 'eq.created' }, {
    status: 'processing'
  });
  return rows[0] || null;
}

async function cancelBroadcastPreview(id) {
  const rows = await supabase.patch('broadcasts', { id: supabase.eq(id), status: 'eq.created' }, {
    status: 'failed',
    completed_at: new Date().toISOString()
  }).catch(() => []);
  return rows[0] || null;
}

async function sendPendingGroupBroadcast({ broadcast }) {
  const targets = await listActiveGroupBroadcastTargets();

  const results = await mapWithConcurrency(targets, BROADCAST_CONCURRENCY, async target => {
    try {
      const telegramResult = await sendMessage(target.chat_id, broadcast.text, { parse_mode: null });
      return { target, ok: true, telegramResult, message_id: telegramResult.message_id };
    } catch (error) {
      return { target, ok: false, error: error.message };
    }
  });

  const sent = results.filter(result => result.ok).length;
  const failed = results.length - sent;
  const details = results.map(result => ({
    chat_id: result.target.chat_id,
    title: result.target.title,
    ok: result.ok,
    message_id: result.message_id,
    error: result.error
  }));
  const targetRows = results.map(result => ({
    broadcast_id: broadcast.id,
    chat_id: result.target.chat_id,
    status: result.ok ? 'sent' : 'failed',
    sent_at: result.ok ? new Date().toISOString() : undefined,
    telegram_message_id: result.ok ? result.message_id : undefined,
    error: result.ok ? undefined : result.error
  }));

  if (targetRows.length) {
    await supabase.insert('broadcast_targets', targetRows, { prefer: 'return=minimal' }).catch(() => null);
  }
  const messageRows = results
    .filter(result => result.ok && result.message_id)
    .map(result => ({
      tg_message_id: result.message_id,
      chat_id: result.target.chat_id,
      from_tg_user_id: null,
      from_name: 'Uyqur Bot',
      from_username: null,
      source_type: result.target.source_type || 'group',
      update_kind: 'bot_group_broadcast',
      text: broadcast.text,
      classification: 'bot_broadcast',
      employee_id: null,
      business_connection_id: result.target.business_connection_id || null,
      raw: {
        source: 'bot_group_broadcast',
        broadcast_id: broadcast.id,
        telegram: result.telegramResult
      },
      created_at: new Date().toISOString()
    }));
  if (messageRows.length) {
    await supabase.insert('messages', messageRows, { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: 'return=minimal' })
      .catch(error => logBackgroundError('save-broadcast-messages', error));
  }

  await supabase.patch('broadcasts', { id: supabase.eq(broadcast.id) }, {
    total_targets: targets.length,
    sent_count: sent,
    failed_count: failed,
    status: failed ? 'completed_with_errors' : 'sent',
    completed_at: new Date().toISOString()
  }).catch(() => null);

  return { total: targets.length, sent, failed, details };
}

async function deleteSentGroupBroadcast({ broadcast }) {
  const { targets } = await loadGroupBroadcastWithTargets(broadcast.id);
  const results = await mapWithConcurrency(targets, BROADCAST_CONCURRENCY, async target => {
    try {
      await deleteMessage(target.chat_id, target.telegram_message_id);
      return { target, ok: true };
    } catch (error) {
      return { target, ok: false, error: error.message };
    }
  });

  const deleted = results.filter(result => result.ok).length;
  const failed = results.length - deleted;
  const details = results.map(result => ({
    chat_id: result.target.chat_id,
    title: result.target.title,
    ok: result.ok,
    error: result.error
  }));

  return { total: targets.length, deleted, failed, details };
}

async function handleBroadcastDeleteCallback(query, parsed) {
  const callbackMessage = query.message || {};
  const chat = callbackMessage.chat || {};
  if (!isGroupChat(chat) || !await isMainStatsGroup(chat)) {
    await answerCallbackQuery(query.id, 'Bu tugma faqat main guruhda ishlaydi.').catch(error => logBackgroundError('broadcast-delete-callback-answer', error));
    return true;
  }

  if (parsed.action === 'delete_cancel') {
    await answerCallbackQuery(query.id, 'Bekor qilindi.').catch(error => logBackgroundError('broadcast-delete-cancel-answer', error));
    if (callbackMessage.message_id) {
      await editMessageReplyMarkup(chat.id, callbackMessage.message_id, { inline_keyboard: [] })
        .catch(error => logBackgroundError('broadcast-delete-cancel-markup', error));
    }
    await sendMessage(chat.id, '❌ Ommaviy xabarni o‘chirish bekor qilindi.', {
      reply_to_message_id: callbackMessage.message_id
    }).catch(error => logBackgroundError('broadcast-delete-cancel-message', error));
    return true;
  }

  const { broadcast, targets } = await loadGroupBroadcastWithTargets(parsed.id);
  if (!broadcast || !targets.length) {
    await answerCallbackQuery(query.id, 'O‘chirish uchun xabar topilmadi.').catch(error => logBackgroundError('broadcast-delete-stale-answer', error));
    return true;
  }

  await answerCallbackQuery(query.id, 'O‘chirish boshlandi.').catch(error => logBackgroundError('broadcast-delete-confirm-answer', error));
  if (callbackMessage.message_id) {
    await editMessageReplyMarkup(chat.id, callbackMessage.message_id, { inline_keyboard: [] })
      .catch(error => logBackgroundError('broadcast-delete-confirm-markup', error));
  }

  const result = await deleteSentGroupBroadcast({ broadcast });
  const messages = broadcastDeleteResultMessages(result);
  for (let index = 0; index < messages.length; index += 1) {
    await sendMessage(chat.id, messages[index], index === 0 ? { reply_to_message_id: callbackMessage.message_id } : {})
      .catch(error => logBackgroundError('broadcast-delete-result-message', error));
  }
  return true;
}

async function handleBroadcastCallback(query, parsed) {
  const callbackMessage = query.message || {};
  const chat = callbackMessage.chat || {};
  if (!isGroupChat(chat) || !await isMainStatsGroup(chat)) {
    await answerCallbackQuery(query.id, 'Bu tugma faqat main guruhda ishlaydi.').catch(error => logBackgroundError('broadcast-callback-answer', error));
    return true;
  }

  if (parsed.action === 'cancel') {
    const cancelled = await cancelBroadcastPreview(parsed.id);
    await answerCallbackQuery(query.id, cancelled ? 'Bekor qilindi.' : 'Bu preview allaqachon ishlatilgan.').catch(error => logBackgroundError('broadcast-cancel-answer', error));
    if (callbackMessage.message_id) {
      await editMessageReplyMarkup(chat.id, callbackMessage.message_id, { inline_keyboard: [] })
        .catch(error => logBackgroundError('broadcast-cancel-markup', error));
    }
    if (cancelled) {
      await sendMessage(chat.id, '❌ Ommaviy xabar bekor qilindi.', {
        reply_to_message_id: callbackMessage.message_id
      }).catch(error => logBackgroundError('broadcast-cancel-message', error));
    }
    return true;
  }

  const broadcast = await markBroadcastProcessing(parsed.id);
  if (!broadcast) {
    await answerCallbackQuery(query.id, 'Bu preview allaqachon ishlatilgan.').catch(error => logBackgroundError('broadcast-stale-answer', error));
    return true;
  }

  await answerCallbackQuery(query.id, 'Yuborish boshlandi.').catch(error => logBackgroundError('broadcast-confirm-answer', error));
  if (callbackMessage.message_id) {
    await editMessageReplyMarkup(chat.id, callbackMessage.message_id, { inline_keyboard: [] })
      .catch(error => logBackgroundError('broadcast-confirm-markup', error));
  }

  const result = await sendPendingGroupBroadcast({ broadcast });
  const messages = broadcastResultMessages(result);
  for (let index = 0; index < messages.length; index += 1) {
    await sendMessage(chat.id, messages[index], index === 0 ? { reply_to_message_id: callbackMessage.message_id } : {})
      .catch(error => logBackgroundError('broadcast-result-message', error));
  }
  return true;
}

async function handleCallbackQuery(query = {}) {
  const parsed = parseBroadcastCallbackData(query.data);
  if (parsed && parsed.action.startsWith('delete_')) return handleBroadcastDeleteCallback(query, parsed);
  if (parsed) return handleBroadcastCallback(query, parsed);
  await answerCallbackQuery(query.id).catch(error => logBackgroundError('callback-answer', error));
}

async function recordIncomingMessage(updateKind, message, sourceType, classification, employee = null) {
  const chat = message.chat || {};
  const from = message.from || {};

  const [, chatRow] = await Promise.all([
    metrics.upsertTelegramUser(from, {}, { prefer: 'return=minimal' }),
    metrics.upsertChat(chat, sourceType, {
      business_connection_id: message.business_connection_id || null
    })
  ]);
  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee }, { prefer: 'return=minimal' });
  return chatRow;
}

async function classifyIncomingMessage({ text, chat, sourceType, updateKind, message, employee, settings }) {
  if (message && message.from && message.from.is_bot) return 'bot_message';
  const useExternalAi = shouldUseExternalAi(settings);
  const localSettings = useExternalAi ? { ...settings, aiMode: false } : settings;
  let classification = classifyMessage({
    text,
    chatType: chat.type,
    isKnownEmployee: !!employee,
    isBusiness: updateKind.includes('business'),
    ...localSettings
  });

  if (!employee && useExternalAi && !['done', 'command'].includes(classification)) {
    try {
      const ai = await classifyWithAi({ text, chatType: chat.type, sourceType, settings });
      if (shouldUseAiClassification(classification, ai)) classification = ai.classification;
    } catch (error) {
      logBackgroundError('ai-classify', error);
    }
  }

  return classification;
}

async function maybeCloseRequestFromReply(message, classification, employee) {
  if (!message.reply_to_message || classification === 'done' || classification === 'command') return false;
  if (message.from && message.from.is_bot) return false;

  const result = await metrics.closeRequestByReply({ message, employee });
  if (!result.closed) return false;
  await maybeReplyDone(message, result);
  return true;
}

function hasCustomerFacingPayload(message = {}, text = '') {
  return !!(
    String(text || message.text || message.caption || '').trim()
    || (Array.isArray(message.photo) && message.photo.length)
    || message.video
    || message.voice
    || message.audio
    || message.video_note
    || message.animation
    || message.document
    || message.sticker
  );
}

function meaningfulTextLength(text = '') {
  return String(text || '').replace(/[^\p{L}\p{N}]+/gu, '').length;
}

function looksLikeEmployeeResolution(text = '') {
  return /\b(tekshir|ko'?ring|qildim|berdim|yangiladim|tuzatdim|hal|ishladi|ochdim|yoqib|ulab|yubordim|готов|готово|исправ|проверь|сделал|done|fixed|resolved)\b/i
    .test(String(text || ''));
}

function isLikelyEmployeeSupportAnswer(message = {}, text = '') {
  const value = String(text || message.text || message.caption || '').trim();
  if (isCompletionIntent(value)) return true;
  if (!value) return hasCustomerFacingPayload(message, value);
  if (isGreetingOnly(value) || isSmallTalk(value)) return false;
  if (isQuestionLike(value) && !looksLikeEmployeeResolution(value)) return false;
  return meaningfulTextLength(value) >= 8 || looksLikeEmployeeResolution(value);
}

async function maybeCloseRequestFromEmployeeAnswer(message, classification, employee, text) {
  if (!employee || !employee.id) return false;
  if (message.from && message.from.is_bot) return false;
  if (message.reply_to_message) return false;
  if (['done', 'command'].includes(classification)) return false;
  if (!hasCustomerFacingPayload(message, text)) return false;
  if (!isLikelyEmployeeSupportAnswer(message, text)) return false;

  const result = await metrics.closeLatestRequest({ message, employee, recordMissing: false });
  if (result.closed) {
    await reactToMessage(message.chat.id, message.message_id, '⚡')
      .catch(error => logBackgroundError('ticket-close-reaction', error));
  }
  return !!result.closed;
}

function isDirectBotPrivateChat(updateKind = '', chat = {}) {
  return chat.type === 'private' && !String(updateKind).includes('business');
}

async function maybeReplyPrivateGreeting(updateKind, message, text) {
  const chat = message.chat || {};
  if (!isDirectBotPrivateChat(updateKind, chat)) return false;
  if (message.from && message.from.is_bot) return false;
  if (!isGreetingOnly(text)) return false;
  await sendTrackedBotReply({
    message,
    sourceType: metrics.sourceTypeFrom(updateKind, chat.type),
    text: PRIVATE_GREETING_REPLY,
    options: { reply_to_message_id: message.message_id },
    updateKind: 'bot_private_greeting',
    rawSource: 'bot_private_greeting'
  })
    .catch(error => logBackgroundError('private-greeting-reply', error));
  return true;
}

async function maybeReplyPrivateFallback(updateKind, message, classification) {
  const chat = message.chat || {};
  if (!isDirectBotPrivateChat(updateKind, chat)) return false;
  if (message.from && message.from.is_bot) return false;
  if (['done', 'command'].includes(classification)) return false;
  await sendTrackedBotReply({
    message,
    sourceType: metrics.sourceTypeFrom(updateKind, chat.type),
    text: isSupportRequestClassification(classification) ? PRIVATE_REQUEST_REPLY : PRIVATE_UNKNOWN_REPLY,
    options: { reply_to_message_id: message.message_id },
    updateKind: 'bot_private_fallback',
    rawSource: 'bot_private_fallback'
  }).catch(error => logBackgroundError('private-fallback-reply', error));
  return true;
}

async function saveAiReplyMessage({ telegramResult, sourceMessage, sourceType, text, settings }) {
  if (!telegramResult || !telegramResult.message_id) return;
  const chat = sourceMessage.chat || {};
  await supabase.insert('messages', [{
    tg_message_id: telegramResult.message_id,
    chat_id: chat.id,
    from_tg_user_id: null,
    from_name: settings.aiModelLabel || settings.aiModel || 'Uyqur AI',
    from_username: null,
    source_type: sourceType,
    update_kind: 'ai_auto_reply',
    text,
    classification: 'ai_reply',
    employee_id: null,
    business_connection_id: sourceMessage.business_connection_id || null,
    raw: {
      source: 'ai_auto_reply',
      reply_to_message_id: sourceMessage.message_id,
      telegram: telegramResult
    },
    created_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'chat_id,tg_message_id', prefer: 'return=minimal' }).catch(error => logBackgroundError('save-ai-reply', error));
}

function shouldAutoReply(settings = {}) {
  return Boolean(settings.autoReply);
}

function isQuestionLike(text = '') {
  return QUESTION_LIKE_RE.test(String(text || ''));
}

function isSupportRequestClassification(classification = '') {
  return ['ticket', 'request'].includes(String(classification || '').toLowerCase());
}

function shouldUseAiClassification(localClassification = '', ai = null) {
  if (!ai || !ai.classification) return false;
  const confidence = Number(ai.confidence);
  if (Number.isFinite(confidence) && confidence < 0.55) return false;
  if (isSupportRequestClassification(localClassification) && ['message', 'ignore'].includes(ai.classification)) {
    return Number.isFinite(confidence) && confidence >= 0.8;
  }
  return true;
}

function classifyAsCustomerRequest({ updateKind, message, text, settings }) {
  const chat = message.chat || {};
  return isSupportRequestClassification(classifyMessage({
    text,
    chatType: chat.type,
    isKnownEmployee: false,
    isBusiness: String(updateKind).includes('business'),
    ...settings
  }));
}

function hasConfiguredAutoReplySource(settings = {}) {
  const knowledge = String(settings.aiIntegration && settings.aiIntegration.knowledge_text || '').trim();
  return shouldUseExternalAi(settings) || Boolean(knowledge);
}

function autoReplyFallbackText({ updateKind, chat, settings }) {
  if (isGroupChat(chat) && isConfiguredMainGroup(chat, settings)) return MAIN_GROUP_AUTO_REPLY_MISS;
  if (!hasConfiguredAutoReplySource(settings)) return '';
  if (isDirectBotPrivateChat(updateKind, chat)) return '';
  return AUTO_REPLY_MISS;
}

async function maybeSendAiAutoReply({ updateKind, message, sourceType, text, settings, fallbackText = '' }) {
  if (!shouldAutoReply(settings)) return false;
  if (message.from && message.from.is_bot) return false;
  if (!hasCustomerFacingPayload(message, text)) return false;

  try {
    let reply = null;
    if (shouldUseExternalAi(settings)) {
      try {
        reply = await generateSupportReply({
          text,
          chatType: (message.chat || {}).type,
          sourceType,
          settings
        });
      } catch (error) {
        logBackgroundError('ai-auto-reply-external', error);
      }
    }
    if (!reply) {
      reply = await generateLocalSupportReply({
        text,
        chatType: (message.chat || {}).type,
        sourceType,
        settings
      });
    }
    if (!reply && fallbackText) reply = fallbackText;
    if (!reply) return false;

    const options = { reply_to_message_id: message.message_id, parse_mode: null };
    if (String(updateKind).includes('business') && message.business_connection_id) {
      options.business_connection_id = message.business_connection_id;
    }
    const telegramResult = await sendMessage(message.chat.id, reply, options);
    await saveAiReplyMessage({ telegramResult, sourceMessage: message, sourceType, text: reply, settings });
    return true;
  } catch (error) {
    logBackgroundError('ai-auto-reply', error);
    return false;
  }
}

async function maybeSendMainStatsQuestionReply({ message, sourceType, text, settings }) {
  if (!shouldAutoReply(settings)) return false;
  if (message.from && message.from.is_bot) return false;

  let reply = '';
  try {
    reply = await buildMainStatsQuestionReply(text);
  } catch (error) {
    logBackgroundError('main-stats-question', error);
    return false;
  }
  if (!reply) return false;

  try {
    const telegramResult = await sendMessage(message.chat.id, reply, { reply_to_message_id: message.message_id });
    await saveAiReplyMessage({ telegramResult, sourceMessage: message, sourceType, text: reply, settings });
    return true;
  } catch (error) {
    logBackgroundError('main-stats-question-reply', error);
    return false;
  }
}

async function maybeAnswerMainGroupQuestion({ updateKind, message, sourceType, text, settings }) {
  const chat = message.chat || {};
  if (!isGroupChat(chat)) return false;
  if (message.reply_to_message) return false;
  if (!await isMainStatsGroup(chat, settings, { resolveFallback: false })) return false;
  if (await maybeSendMainStatsQuestionReply({ message, sourceType, text, settings })) return true;
  if (!isQuestionLike(text)) return false;
  if (!classifyAsCustomerRequest({ updateKind, message, text, settings })) return false;

  return maybeSendAiAutoReply({
    updateKind,
    message,
    sourceType,
    text,
    settings,
    fallbackText: MAIN_GROUP_AUTO_REPLY_MISS
  });
}

async function handleCommand(updateKind, message, sourceType, text, classification) {
  const tracking = recordIncomingMessage(updateKind, message, sourceType, classification);
  const chat = message.chat || {};

  if (isGroupChat(chat) && (START_RE.test(text) || REGISTER_RE.test(text))) {
    await handleGroupRegistrationCommand(message, tracking);
    return;
  }

  const safeTracking = tracking.catch(error => logBackgroundError('record-command', error));

  let reply = Promise.resolve();
  if (START_RE.test(text)) reply = handleStart(message);
  if (HELP_RE.test(text)) reply = handleHelp(message);
  if (REGISTER_RE.test(text)) {
    reply = sendTrackedBotReply({
      message,
      sourceType,
      text: `Chat ID: <code>${escapeHtml(message.chat.id)}</code>`,
      updateKind: 'bot_register',
      rawSource: 'bot_register'
    });
  }

  await Promise.all([safeTracking, reply]);
}

async function processMessage(updateKind, message) {
  const chat = message.chat || {};
  const from = message.from || {};
  const text = getMessageText(message);

  if (isChannelLogPost(updateKind, chat)) {
    const settings = await getBotSettings();
    await maybeRelayIncomingLog(updateKind, message, settings);
    return;
  }

  const sourceType = metrics.sourceTypeFrom(updateKind, chat.type);

  const commandClassification = classifyMessage({
    text,
    chatType: chat.type,
    isBusiness: updateKind.includes('business')
  });

  if (commandClassification === 'command') {
    await handleCommand(updateKind, message, sourceType, text, commandClassification);
    return;
  }

  const settings = await getBotSettings();
  let chatRow = null;
  let employee = null;
  try {
    const [, resolvedChatRow, resolvedEmployee] = await Promise.all([
      metrics.upsertTelegramUser(from, {}, { prefer: 'return=minimal' }),
      metrics.upsertChat(chat, sourceType, {
        business_connection_id: message.business_connection_id || null
      }),
      metrics.getKnownEmployeeByTelegramId(from.id)
    ]);
    chatRow = resolvedChatRow;
    employee = resolvedEmployee;
  } catch (error) {
    await maybeNotifyMainGroupMessageSaveFailed({
      updateKind,
      message,
      settings,
      chatRow,
      classification: 'prepare',
      employee,
      error,
      target: 'public.tg_users / public.tg_chats / public.messages',
      stage: 'prepare_message_context'
    });
    throw error;
  }

  const possibleMainGroupAutomation = isGroupChat(chat)
    && (isMainStatsTrigger(text) || isGroupBroadcastDeleteTrigger(text) || isGroupBroadcastTrigger(text))
    && await isMainStatsGroup(chat, settings);

  if (possibleMainGroupAutomation) {
    await metrics.saveMessage({ message, updateKind, sourceType, classification: 'message', employee }, { prefer: 'return=minimal' });
    if (await maybeSendMainStatsFromGroup(message, text, settings)) return;
    if (await maybeStartGroupBroadcastDeletePreview(message, text, settings)) return;
    if (await maybeStartGroupBroadcastPreview(message, text, settings)) return;
  }

  const classification = await classifyIncomingMessage({
    text,
    chat,
    sourceType,
    updateKind,
    message,
    employee,
    settings
  });

  let savedMessage = null;
  try {
    savedMessage = await metrics.saveMessage({ message, updateKind, sourceType, classification, employee });
  } catch (error) {
    await maybeNotifyMainGroupMessageSaveFailed({
      updateKind,
      message,
      settings,
      chatRow,
      classification,
      employee,
      error,
      target: 'public.messages',
      stage: 'messages_insert'
    });
    throw error;
  }
  await maybeNotifyMainGroupMessageSaved({ updateKind, message, settings, chatRow, classification, employee, savedMessage, target: 'public.messages' });

  if (await maybeSendMainStatsFromGroup(message, text, settings)) return;
  if (await maybeStartGroupBroadcastDeletePreview(message, text, settings)) return;
  if (await maybeStartGroupBroadcastPreview(message, text, settings)) return;

  if (isGroupChat(chat) && isConfiguredMainGroup(chat, settings)) {
    await maybeAnswerMainGroupQuestion({ updateKind, message, sourceType, text, settings });
    return;
  }

  if (classification === 'done') {
    const closer = employee || await metrics.ensureEmployee(from);
    const result = await metrics.closeLatestRequest({ message, employee: closer });
    await maybeReplyDone(message, result);
    return;
  }

  if (await maybeReplyPrivateGreeting(updateKind, message, text)) return;

  if (await maybeCloseRequestFromReply(message, classification, employee)) return;

  if (await maybeAnswerMainGroupQuestion({ updateKind, message, sourceType, text, settings })) return;

  if (await maybeCloseRequestFromEmployeeAnswer(message, classification, employee, text)) return;

  if (isSupportRequestClassification(classification)) {
    await metrics.createSupportRequest({
      message,
      sourceType,
      companyId: chatRow ? chatRow.company_id : null
    });
    const fallbackText = autoReplyFallbackText({ updateKind, chat, settings });
    if (await maybeSendAiAutoReply({ updateKind, message, sourceType, text, settings, fallbackText })) return;
    await maybeReplyPrivateFallback(updateKind, message, classification);
    return;
  }

  if (await maybeReplyPrivateFallback(updateKind, message, classification)) return;
}

async function handleTelegramUpdate(update = {}) {
  console.info('[bot:update]', summarizeUpdate(update));

  if (update.business_connection) {
    await metrics.saveBusinessConnection(update.business_connection);
    return { ok: true, handled: 'business_connection' };
  }

  if (update.my_chat_member || update.chat_member) {
    await metrics.registerChatMemberUpdate(update);
    return { ok: true, handled: 'chat_member' };
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return { ok: true, handled: 'callback_query' };
  }

  const picked = pickMessage(update);
  if (picked && picked.message) {
    await processMessage(picked.kind, picked.message);
    return { ok: true, handled: picked.kind };
  }

  return { ok: true, handled: 'ignored' };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    const query = getQuery(req);
    const diagnostics = ['1', 'true', 'yes'].includes(String(query.diagnostics || query.check || '').toLowerCase());
    if (diagnostics && !verifyWebhook(req)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
    }
    return sendJson(res, 200, await getHealth({ diagnostics }));
  }

  if (!verifyWebhook(req)) {
    console.warn('[bot:webhook] invalid webhook secret');
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }

  try {
    const update = await readBody(req);
    return sendJson(res, 200, await handleTelegramUpdate(update));
  } catch (error) {
    console.error('[bot:error]', error);
    notifyOperationalError('bot:error', error).catch(logError => console.error('[bot:notify-log:error]', logError));
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

handler.handleTelegramUpdate = handleTelegramUpdate;

module.exports = handler;
