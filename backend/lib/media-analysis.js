'use strict';

const { getFile, downloadFile } = require('./telegram');
const { normalizeText } = require('./parser');
const { shouldUseExternalAi } = require('./ai');
const { normalizeAiIntegration } = require('./ai-config');

const MAX_VOICE_BYTES = 20 * 1024 * 1024;

function audioTranscriptionsUrl(baseUrl = '') {
  const clean = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/audio\/transcriptions$/i.test(clean)) return clean;
  return `${clean}/audio/transcriptions`;
}

function detectIncomingMediaKind(message = {}) {
  if (message.voice) return 'voice';
  if (message.audio) return 'audio';
  if (Array.isArray(message.photo) && message.photo.length) return 'photo';
  return null;
}

function voiceFileId(message = {}) {
  return (message.voice && message.voice.file_id) || (message.audio && message.audio.file_id) || null;
}

function voiceMimeType(message = {}) {
  return (message.voice && message.voice.mime_type)
    || (message.audio && message.audio.mime_type)
    || 'audio/ogg';
}

function voiceFilename(message = {}) {
  const mime = voiceMimeType(message);
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'voice.mp3';
  if (mime.includes('m4a')) return 'voice.m4a';
  if (mime.includes('wav')) return 'voice.wav';
  return 'voice.ogg';
}

async function downloadTelegramFileBuffer(fileId) {
  const file = await getFile(fileId);
  if (!file || !file.file_path) return null;
  if (file.file_size && Number(file.file_size) > MAX_VOICE_BYTES) return null;
  const response = await downloadFile(file.file_path);
  return Buffer.from(await response.arrayBuffer());
}

async function transcribeVoiceBuffer(buffer, message = {}, settings = {}) {
  if (!buffer || !shouldUseExternalAi(settings)) return null;
  const config = normalizeAiIntegration(settings.aiIntegration);
  if (!config.api_key || !config.base_url) return null;

  const form = new FormData();
  const blob = new Blob([buffer], { type: voiceMimeType(message) });
  form.append('file', blob, voiceFilename(message));
  form.append('model', config.transcription_model || 'whisper-1');
  form.append('language', 'uz');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(audioTranscriptionsUrl(config.base_url), {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.api_key}` },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.error && payload.error.message ? payload.error.message : `Transcription HTTP ${response.status}`;
      throw new Error(detail);
    }
    const text = normalizeText(payload.text || '');
    return text || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeVoiceMessage(message = {}, settings = {}) {
  const fileId = voiceFileId(message);
  if (!fileId) return null;
  try {
    const buffer = await downloadTelegramFileBuffer(fileId);
    if (!buffer) return null;
    return await transcribeVoiceBuffer(buffer, message, settings);
  } catch (_error) {
    return null;
  }
}

async function resolveIncomingMessageText(message = {}, settings = {}) {
  const caption = normalizeText(message.text || message.caption || '');
  const mediaKind = detectIncomingMediaKind(message);

  if (mediaKind === 'voice' || mediaKind === 'audio') {
    const transcript = await transcribeVoiceMessage(message, settings);
    if (transcript) {
      return {
        text: transcript,
        analysisText: transcript,
        mediaKind,
        source: 'voice_transcript'
      };
    }
    return {
      text: caption || 'Ovozli xabar',
      mediaKind,
      source: 'voice_placeholder'
    };
  }

  if (mediaKind === 'photo') {
    return {
      text: caption || 'Rasmli xabar',
      mediaKind,
      source: caption ? 'photo_caption' : 'photo_placeholder'
    };
  }

  return {
    text: caption,
    mediaKind,
    source: caption ? 'text' : 'empty'
  };
}

module.exports = {
  detectIncomingMediaKind,
  resolveIncomingMessageText,
  transcribeVoiceMessage
};
