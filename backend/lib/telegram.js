'use strict';

const { requiredEnv } = require('./env');

function apiUrl(method) {
  return `https://api.telegram.org/bot${requiredEnv('BOT_TOKEN')}/${method}`;
}

function fileApiUrl(filePath) {
  return `https://api.telegram.org/file/bot${requiredEnv('BOT_TOKEN')}/${filePath}`;
}

async function telegram(method, payload = {}) {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(`Telegram ${method}: ${data.description || response.statusText}`);
    error.telegram = {
      method,
      status: response.status,
      code: data.error_code || response.status,
      description: data.description || response.statusText
    };
    throw error;
  }
  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  if (options.parse_mode === null) delete payload.parse_mode;
  return telegram('sendMessage', payload);
}

async function deleteMessage(chatId, messageId) {
  return telegram('deleteMessage', {
    chat_id: chatId,
    message_id: messageId
  });
}

async function reactToMessage(chatId, messageId, emoji = '⚡') {
  return telegram('setMessageReaction', {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: 'emoji', emoji }]
  });
}

async function sendBusinessMessage(businessConnectionId, chatId, text, options = {}) {
  return telegram('sendMessage', {
    business_connection_id: businessConnectionId,
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: true,
    ...options
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  return telegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup = null) {
  return telegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup
  });
}

async function getWebhookInfo() {
  return telegram('getWebhookInfo');
}

async function setWebhook(payload) {
  return telegram('setWebhook', payload);
}

async function deleteWebhook(payload = {}) {
  return telegram('deleteWebhook', payload);
}

async function getUpdates(payload = {}) {
  return telegram('getUpdates', payload);
}

async function getFile(fileId) {
  return telegram('getFile', { file_id: fileId });
}

async function getUserProfilePhotos(userId, options = {}) {
  return telegram('getUserProfilePhotos', {
    user_id: userId,
    offset: options.offset || 0,
    limit: options.limit || 1
  });
}

async function downloadFile(filePath) {
  const response = await fetch(fileApiUrl(filePath));
  if (!response.ok) {
    throw new Error(`Telegram file download: ${response.statusText || response.status}`);
  }
  return response;
}

function tgUserName(user = {}) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || String(user.id || 'Unknown');
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

module.exports = { telegram, sendMessage, deleteMessage, reactToMessage, sendBusinessMessage, answerCallbackQuery, editMessageReplyMarkup, getWebhookInfo, setWebhook, deleteWebhook, getUpdates, getFile, getUserProfilePhotos, downloadFile, tgUserName, escapeHtml };
