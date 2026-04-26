'use strict';

const { sendJson, readBody, getQuery } = require('../lib/http');
const { optionalEnv, boolEnv } = require('../lib/env');
const { sendMessage, deleteMessage, escapeHtml } = require('../lib/telegram');
const { getMessageText, classifyMessage } = require('../lib/parser');
const { getBotSettings } = require('../lib/bot-settings');
const metrics = require('../lib/metrics');

const START_RE = /^\/start(?:@\w+)?(?:\s|$)/i;
const HELP_RE = /^\/help(?:@\w+)?(?:\s|$)/i;
const REGISTER_RE = /^\/(?:register|id|chatid)(?:@\w+)?(?:\s|$)/i;

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
  return { update_id: update.update_id, type: 'ignored' };
}

async function handleStart(message) {
  const webapp = optionalEnv('WEBAPP_URL', '');
  const text = [
    '✅ <b>Business Support Bot ishga tushdi</b>',
    '',
    'Bu bot guruh va Telegram Business chatlardagi mijoz so‘rovlarini statistikaga qo‘shadi.',
    'So‘rov yopilganda xodim <b>#done</b> tegini yuboradi.',
    webapp ? `Admin panel: ${escapeHtml(webapp)}` : ''
  ].filter(Boolean).join('\n');
  await sendMessage(message.chat.id, text);
}

function isGroupChat(chat = {}) {
  return ['group', 'supergroup'].includes(chat.type);
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
    '1) Mijoz guruh yoki business chatga murojaat yozadi.',
    '2) Bot murojaatni <b>open request</b> sifatida saqlaydi.',
    '3) Xodim ishni tugatgach <b>#done</b> yozadi.',
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
  const classification = classifyMessage({
    text,
    chatType: chat.type,
    isKnownEmployee: !!employee,
    isBusiness: updateKind.includes('business'),
    ...settings
  });

  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee });

  if (classification === 'done') {
    const closer = employee || await metrics.ensureEmployee(from);
    const result = await metrics.closeLatestRequest({ message, employee: closer });
    await maybeReplyDone(message, result);
    return;
  }

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
