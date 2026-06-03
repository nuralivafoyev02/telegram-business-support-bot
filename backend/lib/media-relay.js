'use strict';

const { optionalEnv } = require('./env');
const { getFileWithToken, downloadFileWithToken } = require('./telegram');
const { bestPhotoSize } = require('./message-media');
const {
  buildStoragePath,
  contentTypeForKind,
  uploadStorageObject,
  getBucketName
} = require('./storage');

const SOURCE_BOT_TOKENS = Object.freeze({
  bot_a: 'BOT_A_TOKEN',
  bot: 'BOT_TOKEN',
  main: 'BOT_TOKEN'
});

const DEFAULT_TOKEN_ENV = 'BOT_TOKEN';

const SINGLE_MEDIA_KINDS = Object.freeze([
  'voice',
  'audio',
  'video',
  'video_note',
  'animation',
  'document',
  'sticker'
]);

const MAX_RELAY_BYTES = 20 * 1024 * 1024;

function resolveSourceBotToken(sourceBot = '') {
  const normalized = String(sourceBot || '').trim().toLowerCase();
  if (normalized) {
    const envName = SOURCE_BOT_TOKENS[normalized];
    if (envName) {
      const token = optionalEnv(envName, '');
      if (token) return token;
    }
  }
  return optionalEnv(DEFAULT_TOKEN_ENV, '');
}

function collectRelayTokens(sourceBot = '') {
  const seen = new Set();
  const tokens = [];
  const primary = resolveSourceBotToken(sourceBot);
  if (primary) {
    tokens.push(primary);
    seen.add(primary);
  }
  for (const envName of ['BOT_TOKEN', 'BOT_A_TOKEN']) {
    const token = optionalEnv(envName, '').trim();
    if (token && !seen.has(token)) {
      tokens.push(token);
      seen.add(token);
    }
  }
  return tokens;
}

function isSkippableRelayError(error) {
  const desc = String(error?.telegram?.description || error?.message || '').toLowerCase();
  return /wrong file_id|file is temporarily unavailable|file_id|bucket not found/i.test(desc)
    || Boolean(error?.tooLarge);
}

async function resolveTelegramFile(tokens = [], fileId = '') {
  let lastError = null;
  for (const token of tokens) {
    try {
      const file = await getFileWithToken(token, fileId);
      if (file && file.file_path) return { file, token };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error('telegram getFile returned no file_path');
}

function isRelayDisabled() {
  const flag = String(optionalEnv('TELEGRAM_MEDIA_RELAY', '') || '').trim().toLowerCase();
  return ['0', 'off', 'false', 'disabled', 'no'].includes(flag);
}

function shouldRelaySize(file = {}, source = {}) {
  const declared = Number(file.file_size || source.file_size || 0);
  if (declared && declared > MAX_RELAY_BYTES) return false;
  return true;
}

async function relayOne({ kind, source, tokens = [], bucket, chatId, tgMessageId }) {
  if (!source || !source.file_id) return null;
  if (source.storage_path) return source;

  const { file, token } = await resolveTelegramFile(tokens, source.file_id);
  if (!file || !file.file_path) {
    throw new Error('telegram getFile returned no file_path');
  }
  if (!shouldRelaySize(file, source)) {
    const size = Number(file.file_size || source.file_size || 0);
    const error = new Error(`media too large (${size} bytes > ${MAX_RELAY_BYTES})`);
    error.tooLarge = true;
    throw error;
  }

  const response = await downloadFileWithToken(token, file.file_path);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_RELAY_BYTES) {
    const error = new Error(`downloaded media too large (${buffer.length} bytes > ${MAX_RELAY_BYTES})`);
    error.tooLarge = true;
    throw error;
  }

  const path = buildStoragePath({
    kind,
    chatId,
    tgMessageId,
    source: { ...source, file_path: file.file_path }
  });
  const contentType = contentTypeForKind(kind, source.mime_type);
  const uploaded = await uploadStorageObject(bucket, path, buffer, contentType);

  source.storage_path = uploaded.path;
  source.storage_bucket = uploaded.bucket;
  if (!source.mime_type) source.mime_type = contentType;
  if (!source.file_size) source.file_size = buffer.length;
  return source;
}

async function enrichMessageMediaWithStorage(message, sourceBot, { onError } = {}) {
  if (!message || typeof message !== 'object') return { relayed: 0, skipped: 0, errors: [] };
  if (isRelayDisabled()) return { relayed: 0, skipped: 0, errors: [] };
  const tokens = collectRelayTokens(sourceBot);
  if (!tokens.length) return { relayed: 0, skipped: 0, errors: [] };

  const chatId = message.chat && message.chat.id;
  const tgMessageId = message.message_id;
  const bucket = getBucketName();
  const summary = { relayed: 0, skipped: 0, errors: [] };

  const tasks = [];

  for (const kind of SINGLE_MEDIA_KINDS) {
    const source = message[kind];
    if (source && typeof source === 'object' && source.file_id) {
      tasks.push({ kind, source });
    }
  }

  if (Array.isArray(message.photo) && message.photo.length) {
    const best = bestPhotoSize(message.photo) || message.photo[message.photo.length - 1];
    if (best && best.file_id) tasks.push({ kind: 'photo', source: best });
  }

  for (const task of tasks) {
    try {
      const result = await relayOne({
        kind: task.kind,
        source: task.source,
        tokens,
        bucket,
        chatId,
        tgMessageId
      });
      if (result) summary.relayed += 1;
      else summary.skipped += 1;
    } catch (error) {
      if (isSkippableRelayError(error)) {
        summary.skipped += 1;
        continue;
      }
      summary.errors.push({ kind: task.kind, message: error.message });
      if (typeof onError === 'function') {
        try { onError(error, task.kind); } catch (_notifyError) { /* best-effort */ }
      } else {
        console.error('[media-relay:error]', {
          kind: task.kind,
          file_id: task.source && task.source.file_id,
          error: error.message
        });
      }
    }
  }

  return summary;
}

module.exports = {
  MAX_RELAY_BYTES,
  resolveSourceBotToken,
  enrichMessageMediaWithStorage
};
