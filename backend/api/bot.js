'use strict';

const { sendJson, readBody, getQuery } = require('../lib/http');
const { optionalEnv, boolEnv } = require('../lib/env');
const supabase = require('../lib/supabase');
const { sendMessage, deleteMessage, answerCallbackQuery, editMessageReplyMarkup, escapeHtml, tgUserName } = require('../lib/telegram');
const { getMessageText, classifyMessage } = require('../lib/parser');
const { getBotSettings } = require('../lib/bot-settings');
const { resolveMainStatsChatId, sendMainStatsReport } = require('../lib/report');
const { shouldUseExternalAi, classifyWithAi } = require('../lib/ai');
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
const TELEGRAM_TEXT_LIMIT = 4096;
const RESULT_CHUNK_LIMIT = 3600;

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
  const webapp = optionalEnv('WEBAPP_URL', '');
  const text = [
    '✅ <b>Uyqur texnik yordam boti ishga tushdi</b>',
    '',
    'Bu bot Uyqur dasturi bo‘yicha mijozlardan tushgan savol, muammo va o‘rgatish so‘rovlarini statistikaga qo‘shadi.',
    'Xodim masalani yakunlaganda <b>#done</b> tegini yuboradi yoki mijoz xabariga reply qiladi.',
    webapp ? `Admin panel: ${escapeHtml(webapp)}` : ''
  ].filter(Boolean).join('\n');
  await sendMessage(message.chat.id, text);
}

function isGroupChat(chat = {}) {
  return ['group', 'supergroup'].includes(chat.type);
}

function sameChatId(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function isMainStatsTrigger(text = '') {
  return MAIN_STATS_TRIGGER_RE.test(text);
}

async function isMainStatsGroup(chat = {}) {
  const target = await resolveMainStatsChatId().catch(error => {
    logBackgroundError('resolve-main-stats-group', error);
    return '';
  });
  return target && sameChatId(target, chat.id);
}

async function maybeSendMainStatsFromGroup(message, text) {
  const chat = message.chat || {};
  if (!isGroupChat(chat) || !isMainStatsTrigger(text)) return false;
  if (!await isMainStatsGroup(chat)) return false;

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

async function listActiveGroupBroadcastTargets(excludeChatId) {
  const rows = await supabase.select('tg_chats', {
    select: 'chat_id,title,business_connection_id,source_type',
    source_type: 'eq.group',
    is_active: 'eq.true',
    order: supabase.order('title', true),
    limit: '1000'
  });
  return rows.filter(row => !sameChatId(row.chat_id, excludeChatId));
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

async function maybeStartGroupBroadcastPreview(message, text) {
  const chat = message.chat || {};
  if (!isGroupChat(chat) || !isGroupBroadcastTrigger(text)) return false;
  if (!await isMainStatsGroup(chat)) return false;

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

  const targets = await listActiveGroupBroadcastTargets(chat.id);
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
    '3) Xodim tushuntirib yoki muammoni hal qilib bo‘lgach <b>#done</b> yozadi yoki mijoz xabariga reply qiladi.',
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
  if (isGroupChat(message.chat || {})) return;
  const silent = boolEnv('SILENT_DONE_REPLY', false);
  if (silent) return;
  if (result.closed) {
    await sendMessage(message.chat.id, `✅ So‘rov yopildi. Yopgan xodim: <b>${escapeHtml(result.request.closed_by_name || 'Xodim')}</b>`, {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('reply-done', error));
  } else {
    await sendMessage(message.chat.id, '⚠️ #done qabul qilindi, lekin bu chatda ochiq so‘rov topilmadi.', {
      reply_to_message_id: message.message_id
    }).catch(error => logBackgroundError('reply-done', error));
  }
}

function parseBroadcastCallbackData(data = '') {
  const value = String(data || '');
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

async function sendPendingGroupBroadcast({ broadcast, sourceChatId }) {
  const targets = await listActiveGroupBroadcastTargets(sourceChatId);
  let sent = 0;
  let failed = 0;
  const details = [];

  for (const target of targets) {
    try {
      const telegramResult = await sendMessage(target.chat_id, broadcast.text, { parse_mode: null });
      sent += 1;
      details.push({ chat_id: target.chat_id, title: target.title, ok: true, message_id: telegramResult.message_id });
      await supabase.insert('broadcast_targets', [{
        broadcast_id: broadcast.id,
        chat_id: target.chat_id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        telegram_message_id: telegramResult.message_id
      }], { prefer: 'return=minimal' }).catch(() => null);
    } catch (error) {
      failed += 1;
      details.push({ chat_id: target.chat_id, title: target.title, ok: false, error: error.message });
      await supabase.insert('broadcast_targets', [{
        broadcast_id: broadcast.id,
        chat_id: target.chat_id,
        status: 'failed',
        error: error.message
      }], { prefer: 'return=minimal' }).catch(() => null);
    }
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

  const result = await sendPendingGroupBroadcast({ broadcast, sourceChatId: chat.id });
  const messages = broadcastResultMessages(result);
  for (let index = 0; index < messages.length; index += 1) {
    await sendMessage(chat.id, messages[index], index === 0 ? { reply_to_message_id: callbackMessage.message_id } : {})
      .catch(error => logBackgroundError('broadcast-result-message', error));
  }
  return true;
}

async function handleCallbackQuery(query = {}) {
  const parsed = parseBroadcastCallbackData(query.data);
  if (parsed) return handleBroadcastCallback(query, parsed);
  await answerCallbackQuery(query.id).catch(error => logBackgroundError('callback-answer', error));
}

async function recordIncomingMessage(updateKind, message, sourceType, classification, employee = null) {
  const chat = message.chat || {};
  const from = message.from || {};

  await metrics.upsertTelegramUser(from);
  const chatRow = await metrics.upsertChat(chat, sourceType, {
    business_connection_id: message.business_connection_id || null
  });
  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee });
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

  const settings = await getBotSettings();

  await metrics.upsertTelegramUser(from);
  const chatRow = await metrics.upsertChat(chat, sourceType, {
    business_connection_id: message.business_connection_id || null
  });

  const employee = await metrics.getKnownEmployeeByTelegramId(from.id);
  const classification = await classifyIncomingMessage({
    text,
    chat,
    sourceType,
    updateKind,
    employee,
    settings
  });

  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee });

  if (await maybeSendMainStatsFromGroup(message, text)) return;
  if (await maybeStartGroupBroadcastPreview(message, text)) return;

  if (classification === 'done') {
    const closer = employee || await metrics.ensureEmployee(from);
    const result = await metrics.closeLatestRequest({ message, employee: closer });
    await maybeReplyDone(message, result);
    return;
  }

  if (await maybeCloseRequestFromReply(message, classification, employee)) return;

  if (classification === 'request') {
    await metrics.createSupportRequest({
      message,
      sourceType,
      companyId: chatRow ? chatRow.company_id : null
    });
  }
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
