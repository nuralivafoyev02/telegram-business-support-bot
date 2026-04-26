'use strict';

const supabase = require('./supabase');
const { boolEnv } = require('./env');
const { DEFAULT_DONE_TAG } = require('./parser');

const DEFAULT_SETTINGS = Object.freeze({
  aiMode: boolEnv('AI_MODE_DEFAULT', false),
  doneTag: DEFAULT_DONE_TAG,
  requestDetectionMode: 'keyword',
  minTextLength: 10,
  mainGroupId: ''
});

let cachedSettings = null;
let cachedAt = 0;
const CACHE_MS = 15_000;

function settingValue(rows, key) {
  const row = rows.find(item => item && item.key === key);
  return row && row.value && typeof row.value === 'object' ? row.value : {};
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'yoqilgan'].includes(String(value).toLowerCase());
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeSettings(rows = []) {
  const ai = settingValue(rows, 'ai_mode');
  const done = settingValue(rows, 'done_tag');
  const detection = settingValue(rows, 'request_detection');
  const mainGroup = settingValue(rows, 'main_group');

  return {
    aiMode: normalizeBoolean(ai.enabled, DEFAULT_SETTINGS.aiMode),
    doneTag: String(done.tag || DEFAULT_SETTINGS.doneTag).trim() || DEFAULT_SETTINGS.doneTag,
    requestDetectionMode: String(detection.mode || DEFAULT_SETTINGS.requestDetectionMode).trim() || DEFAULT_SETTINGS.requestDetectionMode,
    minTextLength: normalizeNumber(detection.min_text_length, DEFAULT_SETTINGS.minTextLength),
    mainGroupId: String(mainGroup.chat_id || DEFAULT_SETTINGS.mainGroupId).trim()
  };
}

async function getBotSettings({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_MS) return cachedSettings;

  try {
    const rows = await supabase.select('bot_settings', {
      select: 'key,value',
      key: 'in.(ai_mode,done_tag,request_detection,main_group)'
    });
    cachedSettings = normalizeSettings(rows || []);
    cachedAt = now;
    return cachedSettings;
  } catch (error) {
    console.error('[bot:settings:error]', error);
    cachedSettings = { ...DEFAULT_SETTINGS };
    cachedAt = now;
    return cachedSettings;
  }
}

function clearBotSettingsCache() {
  cachedSettings = null;
  cachedAt = 0;
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  getBotSettings,
  clearBotSettingsCache
};
