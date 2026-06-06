'use strict';

const supabase = require('./supabase');
const { boolEnv } = require('./env');
const { DEFAULT_DONE_TAG } = require('./parser');
const { normalizeAiIntegration, isAiIntegrationReady } = require('./ai-config');
const { normalizeClickUpIntegration } = require('./clickup');

const DEFAULT_SETTINGS = Object.freeze({
  aiMode: boolEnv('AI_MODE_DEFAULT', false),
  aiProvider: '',
  aiModel: '',
  aiModelLabel: '',
  aiIntegration: normalizeAiIntegration({}),
  logNotifications: Object.freeze({ enabled: false, levels: ['error'], target: 'main_group' }),
  groupMessageAudit: Object.freeze({ enabled: true, target: 'main_group', channelId: '' }),
  messageReactions: Object.freeze({ enabled: false, ticketClose: true, emoji: '\u26a1' }),
  ticketNotifications: Object.freeze({
    enabled: false,
    target_chat_id: '',
    notify_on_ai: true,
    notify_on_reaction: true
  }),
  clickUpIntegration: normalizeClickUpIntegration({}),
  autoReply: true,
  doneTag: DEFAULT_DONE_TAG,
  requestDetectionMode: 'keyword',
  minTextLength: 10,
  mainGroupId: ''
});

const settingsCache = new Map();
const CACHE_MS = 15_000;

function cacheKey(tenantId) {
  return String(tenantId || 1);
}

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

function normalizeLogNotifications(value = {}) {
  const rawLevels = Array.isArray(value.levels) ? value.levels : [value.level || 'error'];
  const levels = [...new Set(rawLevels
    .map(level => String(level || '').trim().toLowerCase())
    .filter(level => ['error', 'info'].includes(level)))];
  const rawSources = Array.isArray(value.sources) ? value.sources : [];
  const sources = rawSources
    .map((source, index) => {
      const chatId = String(source && source.chat_id || '').trim();
      if (!chatId) return null;
      const type = ['mobile', 'web', 'backend', 'other'].includes(String(source.source || '').trim())
        ? String(source.source).trim()
        : 'other';
      return {
        id: String(source.id || `${type}-${chatId}-${index}`),
        chat_id: chatId,
        label: String(source.label || source.title || chatId).trim(),
        source: type,
        enabled: normalizeBoolean(source.enabled, true)
      };
    })
    .filter(Boolean);
  return {
    enabled: normalizeBoolean(value.enabled, DEFAULT_SETTINGS.logNotifications.enabled),
    levels: levels.length ? levels : ['error'],
    target: value.target === 'main_group' ? 'main_group' : 'main_group',
    sources
  };
}

function normalizeGroupMessageAudit(value = {}) {
  const target = value.target === 'channel' ? 'channel' : 'main_group';
  return {
    enabled: normalizeBoolean(value.enabled, DEFAULT_SETTINGS.groupMessageAudit.enabled),
    target,
    channelId: String(value.channel_id || value.channelId || DEFAULT_SETTINGS.groupMessageAudit.channelId).trim()
  };
}

function normalizeMessageReactions(value = {}) {
  return {
    enabled: normalizeBoolean(value.enabled, DEFAULT_SETTINGS.messageReactions.enabled),
    ticketClose: normalizeBoolean(value.ticket_close ?? value.ticketClose, DEFAULT_SETTINGS.messageReactions.ticketClose),
    emoji: String(value.emoji || DEFAULT_SETTINGS.messageReactions.emoji).trim() || DEFAULT_SETTINGS.messageReactions.emoji
  };
}

function normalizeTargetChatId(value = '') {
  const text = String(value || '').trim().replace(/\s+/g, '');
  if (!text) return '';
  if (/^-?\d+$/.test(text)) return text;
  return text.startsWith('@') ? text : `@${text.replace(/^@/, '')}`;
}

function normalizeTicketNotifications(value = {}) {
  return {
    enabled: value.enabled === true,
    target_chat_id: normalizeTargetChatId(value.target_chat_id || value.targetChatId || ''),
    notify_on_ai: value.notify_on_ai !== false && value.notifyOnAi !== false,
    notify_on_reaction: value.notify_on_reaction !== false && value.notifyOnReaction !== false
  };
}

function normalizeSettings(rows = []) {
  const ai = settingValue(rows, 'ai_mode');
  const integration = normalizeAiIntegration(settingValue(rows, 'ai_integration'));
  const logNotifications = normalizeLogNotifications(settingValue(rows, 'log_notifications'));
  const groupMessageAudit = normalizeGroupMessageAudit(settingValue(rows, 'group_message_audit'));
  const messageReactions = normalizeMessageReactions(settingValue(rows, 'message_reactions'));
  const ticketNotifications = normalizeTicketNotifications(settingValue(rows, 'ticket_notifications'));
  const clickUpIntegration = normalizeClickUpIntegration(settingValue(rows, 'clickup_integration'));
  const autoReply = settingValue(rows, 'auto_reply');
  const done = settingValue(rows, 'done_tag');
  const detection = settingValue(rows, 'request_detection');
  const mainGroup = settingValue(rows, 'main_group');
  const aiMode = normalizeBoolean(ai.enabled, DEFAULT_SETTINGS.aiMode);
  const inferredAiProvider = isAiIntegrationReady(integration) ? integration.provider : '';
  const aiProvider = aiMode ? String(ai.provider || inferredAiProvider || '').trim() : '';

  return {
    aiMode,
    aiProvider,
    aiModel: aiProvider ? String(ai.model || integration.model || '').trim() : '',
    aiModelLabel: aiProvider ? String(ai.model_label || ai.modelLabel || integration.label || integration.model || '').trim() : '',
    aiIntegration: integration,
    logNotifications,
    groupMessageAudit,
    messageReactions,
    ticketNotifications,
    clickUpIntegration,
    autoReply: normalizeBoolean(autoReply.enabled, DEFAULT_SETTINGS.autoReply),
    doneTag: String(done.tag || DEFAULT_SETTINGS.doneTag).trim() || DEFAULT_SETTINGS.doneTag,
    requestDetectionMode: String(detection.mode || DEFAULT_SETTINGS.requestDetectionMode).trim() || DEFAULT_SETTINGS.requestDetectionMode,
    minTextLength: normalizeNumber(detection.min_text_length, DEFAULT_SETTINGS.minTextLength),
    mainGroupId: String(mainGroup.chat_id || DEFAULT_SETTINGS.mainGroupId).trim()
  };
}

async function getBotSettings({ force = false, tenantId } = {}) {
  const { getCurrentTenantId, normalizeTenantId } = require('./tenant');
  const resolvedTenantId = normalizeTenantId(tenantId ?? getCurrentTenantId());
  const key = cacheKey(resolvedTenantId);
  const now = Date.now();
  const cached = settingsCache.get(key);
  if (!force && cached && now - cached.cachedAt < CACHE_MS) return cached.settings;

  try {
    const rows = await supabase.select('bot_settings', {
      select: 'key,value',
      key: 'in.(ai_mode,ai_integration,log_notifications,group_message_audit,message_reactions,ticket_notifications,clickup_integration,auto_reply,done_tag,request_detection,main_group)'
    });
    let settings;
    try {
      settings = normalizeSettings(rows || []);
    } catch (normalizeError) {
      console.error('[bot:settings:normalize:error]', normalizeError);
      settings = {
        ...DEFAULT_SETTINGS,
        groupMessageAudit: normalizeGroupMessageAudit(settingValue(rows, 'group_message_audit')),
        logNotifications: normalizeLogNotifications(settingValue(rows, 'log_notifications')),
        messageReactions: normalizeMessageReactions(settingValue(rows, 'message_reactions')),
        ticketNotifications: normalizeTicketNotifications(settingValue(rows, 'ticket_notifications')),
        mainGroupId: String(settingValue(rows, 'main_group').chat_id || DEFAULT_SETTINGS.mainGroupId).trim()
      };
    }
    settingsCache.set(key, { settings, cachedAt: now });
    return settings;
  } catch (error) {
    console.error('[bot:settings:error]', error);
    const settings = { ...DEFAULT_SETTINGS };
    settingsCache.set(key, { settings, cachedAt: now });
    return settings;
  }
}

function clearBotSettingsCache(tenantId) {
  if (tenantId === undefined || tenantId === null || tenantId === '') {
    settingsCache.clear();
    return;
  }
  settingsCache.delete(cacheKey(tenantId));
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeLogNotifications,
  normalizeGroupMessageAudit,
  normalizeMessageReactions,
  normalizeSettings,
  getBotSettings,
  clearBotSettingsCache
};
