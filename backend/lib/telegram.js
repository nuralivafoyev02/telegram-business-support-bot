'use strict';

const { requiredEnv } = require('./env');

function apiUrl(method) {
  return `https://api.telegram.org/bot${requiredEnv('BOT_TOKEN')}/${method}`;
}

async function telegram(method, payload = {}) {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method}: ${data.description || response.statusText}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: true,
    ...options
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

module.exports = { telegram, sendMessage, sendBusinessMessage, answerCallbackQuery, tgUserName, escapeHtml };
