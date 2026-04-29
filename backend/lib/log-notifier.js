'use strict';

const { getBotSettings } = require('./bot-settings');
const { resolveMainStatsChatId } = require('./report');
const { sendMessage, escapeHtml } = require('./telegram');

const LEVEL_LABELS = {
  error: 'ERROR',
  info: 'INFO'
};
const SOURCE_LABELS = {
  mobile: 'Mobile',
  web: 'Web',
  backend: 'Backend',
  other: 'Boshqa'
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

function parseJsonLog(text = '') {
  const value = String(text || '')
    .trim()
    .replace(/^```(?:json|log)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonStart = value.search(/[\[{]/);
  if (jsonStart < 0) return null;
  const candidate = value.slice(jsonStart);
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed.find(item => item && typeof item === 'object' && !Array.isArray(item)) || null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      const parsed = JSON.parse(objectMatch[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_nestedError) {
      return null;
    }
  }
}

function findPayloadValue(payload = null, keys = [], depth = 0) {
  if (!payload || typeof payload !== 'object' || depth > 4) return '';
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') return String(payload[key]);
  }
  for (const value of Object.values(payload)) {
    if (!value || typeof value !== 'object') continue;
    const found = findPayloadValue(value, keys, depth + 1);
    if (found) return found;
  }
  return '';
}

function detectIncomingLogLevel(text = '', payload = null) {
  const rawLevel = findPayloadValue(payload, ['level', 'severity', 'log_level', 'level_name', 'status', 'type']);
  const level = String(rawLevel || '').toLowerCase();
  const numericStatus = Number.parseInt(level, 10);
  if (Number.isFinite(numericStatus) && numericStatus >= 400) return 'error';
  if (/(error|fatal|panic|exception|critical|crit|failed|failure)/i.test(level)) return 'error';
  const value = String(text || '');
  if (/(^|\b|[🚨🔴❌])(?:error|fatal|exception|stacktrace|stack trace|traceback|unhandled|panic|failed|failure|crash|xato|hatolik|ошибка|исключение|критич|аварийн)(\b|:)/i.test(value)
    || /\b(?:status|statusCode|status_code|code)[=: ]+(?:4\d{2}|5\d{2})\b/i.test(value)
    || /\b(?:500|502|503|504)\b/.test(value)) {
    return 'error';
  }
  return 'info';
}

function firstCleanLine(text = '') {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) || '';
}

function valueFromPayload(payload = null, keys = []) {
  return findPayloadValue(payload, keys);
}

function extractRoute(text = '', payload = null) {
  const direct = valueFromPayload(payload, ['route', 'path', 'url', 'endpoint']);
  if (direct) return direct;
  const match = String(text || '').match(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+([^\s]+)/i)
    || String(text || '').match(/\b(?:path|route|url|endpoint)=([^\s]+)/i)
    || String(text || '').match(/\b(\/[a-z0-9_./:-]+)\b/i);
  return match ? match[1] : '';
}

function extractStatus(text = '', payload = null) {
  const direct = valueFromPayload(payload, ['statusCode', 'status_code', 'status']);
  if (/^\d{3}$/.test(direct)) return direct;
  const match = String(text || '').match(/\b(?:status|statusCode|code)[=: ]+(\d{3})\b/i)
    || String(text || '').match(/\b(5\d{2}|4\d{2})\b/);
  return match ? match[1] : '';
}

function summarizeIncomingLog(text = '', payload = null) {
  const message = valueFromPayload(payload, ['message', 'msg', 'error', 'errorMessage', 'detail'])
    || firstCleanLine(text)
    || 'Log xabari';
  const service = valueFromPayload(payload, ['service', 'app', 'module', 'component']);
  const environment = valueFromPayload(payload, ['env', 'environment', 'stage']);
  const route = extractRoute(text, payload);
  const status = extractStatus(text, payload);
  return {
    message: truncate(message, 300),
    service,
    environment,
    route,
    status,
    raw: truncate(text, 1200)
  };
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

async function notifyIncomingLog({ source = {}, text = '', message = {}, settings = null }) {
  const activeSettings = settings || await getBotSettings();
  const config = activeSettings.logNotifications || {};
  const payload = parseJsonLog(text);
  const level = detectIncomingLogLevel(text, payload);
  if (!config.enabled || !Array.isArray(config.levels) || !config.levels.includes(level)) {
    return { sent: false, reason: 'disabled', level };
  }

  const chatId = await resolveLogTarget(activeSettings);
  if (!chatId) return { sent: false, reason: 'main_group_not_configured', level };

  const summary = summarizeIncomingLog(text, payload);
  const icon = level === 'error' ? '🚨' : 'ℹ️';
  const sourceName = SOURCE_LABELS[source.source] || SOURCE_LABELS.other;
  const channelTitle = source.label || message.chat?.title || source.chat_id || 'Log kanali';
  const problemLabel = level === 'error' ? 'Muammo' : 'Holat';
  const lines = [
    `${icon} <b>Uyqur ${escapeHtml(sourceName)} log</b>`,
    `Kanal: <b>${escapeHtml(channelTitle)}</b>`,
    `Turi: <b>${LEVEL_LABELS[level]}</b>`,
    summary.service ? `Servis: <code>${escapeHtml(summary.service)}</code>` : '',
    summary.environment ? `Muhit: <code>${escapeHtml(summary.environment)}</code>` : '',
    summary.route ? `Joy: <code>${escapeHtml(summary.route)}</code>` : '',
    summary.status ? `Status: <code>${escapeHtml(summary.status)}</code>` : '',
    '',
    `<b>${problemLabel}:</b> ${escapeHtml(summary.message)}`,
    '',
    `<pre>${escapeHtml(summary.raw)}</pre>`
  ].filter(Boolean);

  await sendMessage(chatId, lines.join('\n'));
  return { sent: true, chat_id: chatId, level, source: source.source || 'other' };
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
  notifyIncomingLog,
  notifyOperationalError
};
