'use strict';

const { sendJson, readBody, getQuery } = require('../lib/http');
const { optionalEnv, boolEnv } = require('../lib/env');
const { sendMessage, escapeHtml } = require('../lib/telegram');
const { getMessageText, classifyMessage } = require('../lib/parser');
const metrics = require('../lib/metrics');

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

async function handleStart(message) {
  const webapp = optionalEnv('WEBAPP_URL', '');
  const text = [
    '✅ <b>Business Support Bot ishga tushdi</b>',
    '',
    'Bu bot guruh va Telegram Business chatlardagi mijoz so‘rovlarini statistikaga qo‘shadi.',
    'So‘rov yopilganda xodim <b>#done</b> tegini yuboradi.',
    webapp ? `Admin panel: ${escapeHtml(webapp)}` : ''
  ].filter(Boolean).join('\n');
  await sendMessage(message.chat.id, text).catch(() => null);
}

async function handleHelp(message) {
  await sendMessage(message.chat.id, [
    '📌 <b>Qisqa qo‘llanma</b>',
    '',
    '1) Mijoz guruh yoki business chatga murojaat yozadi.',
    '2) Bot murojaatni <b>open request</b> sifatida saqlaydi.',
    '3) Xodim ishni tugatgach <b>#done</b> yozadi.',
    '4) Statistika webappda yangilanadi.',
    '',
    'Masalan: <code>#done hal qilindi</code>'
  ].join('\n')).catch(() => null);
}

async function maybeReplyDone(message, result) {
  const silent = boolEnv('SILENT_DONE_REPLY', false);
  if (silent) return;
  if (result.closed) {
    await sendMessage(message.chat.id, `✅ So‘rov yopildi. Yopgan xodim: <b>${escapeHtml(result.request.closed_by_name || 'Xodim')}</b>`, {
      reply_to_message_id: message.message_id
    }).catch(() => null);
  } else {
    await sendMessage(message.chat.id, '⚠️ #done qabul qilindi, lekin bu chatda ochiq so‘rov topilmadi.', {
      reply_to_message_id: message.message_id
    }).catch(() => null);
  }
}

async function processMessage(updateKind, message) {
  const chat = message.chat || {};
  const from = message.from || {};
  const text = getMessageText(message);
  const sourceType = metrics.sourceTypeFrom(updateKind, chat.type);

  await metrics.upsertTelegramUser(from);
  const chatRow = await metrics.upsertChat(chat, sourceType, {
    business_connection_id: message.business_connection_id || null
  });

  const employee = await metrics.getKnownEmployeeByTelegramId(from.id);
  const classification = classifyMessage({
    text,
    chatType: chat.type,
    isKnownEmployee: !!employee,
    isBusiness: updateKind.includes('business')
  });

  await metrics.saveMessage({ message, updateKind, sourceType, classification, employee });

  if (classification === 'command') {
    if (text.startsWith('/start')) return handleStart(message);
    if (text.startsWith('/help')) return handleHelp(message);
    return;
  }

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
    return sendJson(res, 200, { ok: true, service: 'telegram-business-support-bot', endpoint: 'bot' });
  }

  if (!verifyWebhook(req)) {
    return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
  }

  try {
    const update = await readBody(req);

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
