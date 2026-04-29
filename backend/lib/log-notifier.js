'use strict';

const { getBotSettings } = require('./bot-settings');
const { resolveMainStatsChatId } = require('./report');
const { sendMessage, escapeHtml } = require('./telegram');

const LEVEL_LABELS = {
  error: 'ERROR',
  info: 'INFO'
};

function normalizeLevel(level = '') {
  const key = String(level || '').trim().toLowerCase();
  return key === 'info' ? 'info' : 'error';
}

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(value);
}

function truncate(value = '', limit = 900) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function formatMeta(meta = {}) {
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => `• ${escapeHtml(key)}: <code>${escapeHtml(truncate(JSON.stringify(value), 220))}</code>`);
}

async function resolveLogTarget(settings = {}) {
  if (settings.logNotifications?.target !== 'main_group') return '';
  return settings.mainGroupId || await resolveMainStatsChatId().catch(() => '');
}

async function notifyOperationalLog(level, label, message, meta = {}) {
  const normalizedLevel = normalizeLevel(level);
  const settings = await getBotSettings();
  const config = settings.logNotifications || {};
  if (!config.enabled || !Array.isArray(config.levels) || !config.levels.includes(normalizedLevel)) {
    return { sent: false, reason: 'disabled' };
  }

  const chatId = await resolveLogTarget(settings);
  if (!chatId) return { sent: false, reason: 'main_group_not_configured' };

  const icon = normalizedLevel === 'error' ? '🚨' : 'ℹ️';
  const lines = [
    `${icon} <b>${LEVEL_LABELS[normalizedLevel]} log</b>`,
    `Manba: <code>${escapeHtml(label || 'system')}</code>`,
    `Vaqt: <code>${escapeHtml(formatDate())}</code>`,
    '',
    `<pre>${escapeHtml(truncate(message || 'Log xabari yo‘q'))}</pre>`,
    ...formatMeta(meta)
  ];

  await sendMessage(chatId, lines.join('\n'));
  return { sent: true, chat_id: chatId, level: normalizedLevel };
}

function notifyOperationalError(label, error, meta = {}) {
  const payload = {
    ...meta,
    code: error && error.code || '',
    name: error && error.name || ''
  };
  return notifyOperationalLog('error', label, error && error.message || String(error || 'Xatolik'), payload);
}

module.exports = {
  notifyOperationalLog,
  notifyOperationalError
};
