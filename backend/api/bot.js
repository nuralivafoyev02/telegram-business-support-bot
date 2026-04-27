'use strict';

const { sendJson, readBody, getQuery } = require('../lib/http');
const { optionalEnv, boolEnv } = require('../lib/env');
const supabase = require('../lib/supabase');
const { sendMessage, deleteMessage, reactToMessage, answerCallbackQuery, editMessageReplyMarkup, escapeHtml, tgUserName } = require('../lib/telegram');
const { getMessageText, classifyMessage, isGreetingOnly } = require('../lib/parser');
const { getBotSettings } = require('../lib/bot-settings');
const { resolveMainStatsChatId, sendMainStatsReport, buildMainStatsQuestionReply } = require('../lib/report');
const { shouldUseExternalAi, classifyWithAi, generateSupportReply, generateLocalSupportReply } = require('../lib/ai');
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
  if (update.business_message) return { kind: 'business_message', message: update.business_message };
  if (update.edited_business_message) return { kind: 'edited_business_message', message: update.edited_business_message };
  return null;
}

function getHealth() {
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
  await sendMessage(message.chat.id, text);
}

function isGroupChat(chat = {}) {
  return ['group', 'supergroup'].includes(chat.type);
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

function isMainStatsTrigger(text = '') {
  return MAIN_STATS_TRIGGER_RE.test(text);
}

async function isMainStatsGroup(chat = {}, settings = null) {
  const configured = configuredMainGroupId(settings);
  if (configured) return sameChatId(configured, chat.id);

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
  await tracking.catch(error => logBackgroundError('register-group', error));
  await deleteMessage(chat.id, message.message_id)
    .catch(error => logBackgroundError('delete-group-command', error));
}

async function handleHelp(message) {
  await sendMessage(message.chat.id, [
    '📌 <b>Qisqa qo‘llanma</b>',
    '',
    '1) Mijoz Uyqur dasturidagi savol yoki muammoni guruh/business chatga yozadi.',
    '2) Bot uni <b>open request</b> sifatida saqlaydi.',
    '3) Xodim tushuntirib yoki muammoni hal qilib javob yozganda ticket yopiladi. <b>#done</b> va reply ham ishlaydi.',
    '4) Statistika webappda yangilanadi.',
    '5) Guruh webappda ko‘rinmasa guruh ichida <b>/register</b> yuboring.',
    '',
    'Masalan: <code>#done hal qilindi</code>'
  ].join('\n'));
}

function logBackgroundError(label, error) {
  console.error(`[bot:${label}:error]`, error);
}

async function maybeReplyDone(message, result) {
  if (result.closed) {
    await reactToMessage(message.chat.id, message.message_id, '⚡')
      .catch(error => logBackgroundError('ticket-close-reaction', error));
  } else {
    if (isGroupChat(message.chat || {})) return;
    const silent = boolEnv('SILENT_DONE_REPLY', false);
    if (silent) return;
    await sendMessage(message.chat.id, '⚠️ #done qabul qilindi, lekin bu chatda ochiq so‘rov topilmadi.', {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('reply-done', error));
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
      return { target, ok: true, message_id: telegramResult.message_id };
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

async function classifyIncomingMessage({ text, chat, sourceType, updateKind, employee, settings }) {
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
      if (ai && ai.classification) classification = ai.classification;
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

async function maybeCloseRequestFromEmployeeAnswer(message, classification, employee, text) {
  if (!employee || !employee.id) return false;
  if (message.from && message.from.is_bot) return false;
  if (message.reply_to_message) return false;
  if (['done', 'command'].includes(classification)) return false;
  if (!hasCustomerFacingPayload(message, text)) return false;

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
  await sendMessage(chat.id, PRIVATE_GREETING_REPLY, { reply_to_message_id: message.message_id })
    .catch(error => logBackgroundError('private-greeting-reply', error));
  return true;
}

async function maybeReplyPrivateFallback(updateKind, message, classification) {
  const chat = message.chat || {};
  if (!isDirectBotPrivateChat(updateKind, chat)) return false;
  if (message.from && message.from.is_bot) return false;
  if (['done', 'command'].includes(classification)) return false;
  await sendMessage(chat.id, classification === 'request' ? PRIVATE_REQUEST_REPLY : PRIVATE_UNKNOWN_REPLY, {
    reply_to_message_id: message.message_id
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

function classifyAsCustomerRequest({ updateKind, message, text, settings }) {
  const chat = message.chat || {};
  return classifyMessage({
    text,
    chatType: chat.type,
    isKnownEmployee: false,
    isBusiness: String(updateKind).includes('business'),
    ...settings
  }) === 'request';
}

async function maybeSendAiAutoReply({ updateKind, message, sourceType, text, settings, fallbackText = '' }) {
  if (!shouldAutoReply(settings)) return false;
  if (message.from && message.from.is_bot) return false;
  if (!hasCustomerFacingPayload(message, text)) return false;

  try {
    let reply = null;
    if (shouldUseExternalAi(settings)) {
      reply = await generateSupportReply({
        text,
        chatType: (message.chat || {}).type,
        sourceType,
        settings
      });
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
  if (!await isMainStatsGroup(chat, settings)) return false;
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
    reply = sendMessage(message.chat.id, `Chat ID: <code>${escapeHtml(message.chat.id)}</code>`);
  }

  await Promise.all([safeTracking, reply]);
}

async function processMessage(updateKind, message) {
  const chat = message.chat || {};
  const from = message.from || {};
  const text = getMessageText(message);
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

  const [settings, , chatRow, employee] = await Promise.all([
    getBotSettings(),
    metrics.upsertTelegramUser(from, {}, { prefer: 'return=minimal' }),
    metrics.upsertChat(chat, sourceType, {
      business_connection_id: message.business_connection_id || null
    }),
    metrics.getKnownEmployeeByTelegramId(from.id)
  ]);

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
    employee,
    settings
  });

  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee }, { prefer: 'return=minimal' });

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

  if (classification === 'request') {
    await metrics.createSupportRequest({
      message,
      sourceType,
      companyId: chatRow ? chatRow.company_id : null
    });
    const mainGroupFallback = isGroupChat(chat) && isConfiguredMainGroup(chat, settings)
      ? MAIN_GROUP_AUTO_REPLY_MISS
      : '';
    if (await maybeSendAiAutoReply({ updateKind, message, sourceType, text, settings, fallbackText: mainGroupFallback })) return;
    await maybeReplyPrivateFallback(updateKind, message, classification);
    return;
  }

  if (await maybeReplyPrivateFallback(updateKind, message, classification)) return;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 200, getHealth());
  }

  if (!verifyWebhook(req)) {
    console.warn('[bot:webhook] invalid webhook secret');
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }

  try {
    const update = await readBody(req);
    console.info('[bot:update]', summarizeUpdate(update));

    if (update.business_connection) {
      await metrics.saveBusinessConnection(update.business_connection);
      return sendJson(res, 200, { ok: true, handled: 'business_connection' });
    }

    if (update.my_chat_member || update.chat_member) {
      await metrics.registerChatMemberUpdate(update);
      return sendJson(res, 200, { ok: true, handled: 'chat_member' });
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return sendJson(res, 200, { ok: true, handled: 'callback_query' });
    }

    const picked = pickMessage(update);
    if (picked && picked.message) {
      await processMessage(picked.kind, picked.message);
      return sendJson(res, 200, { ok: true, handled: picked.kind });
    }

    return sendJson(res, 200, { ok: true, handled: 'ignored' });
  } catch (error) {
    console.error('[bot:error]', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

module.exports = handler;
