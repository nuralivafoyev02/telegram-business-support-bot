'use strict';

function bestPhotoSize(photos = []) {
  return [...photos].filter(photo => photo && photo.file_id).sort((a, b) => {
    const areaA = Number(a.width || 0) * Number(a.height || 0);
    const areaB = Number(b.width || 0) * Number(b.height || 0);
    return (Number(a.file_size || areaA) || 0) - (Number(b.file_size || areaB) || 0);
  }).at(-1) || null;
}

function buildMediaPayload(kind, source = {}, extra = {}) {
  if (!source || !source.file_id) return null;
  const mimeType = source.mime_type || null;
  let fileName = source.file_name || null;
  if (!fileName && kind === 'voice') {
    fileName = mimeType && mimeType.includes('mpeg') ? 'voice.mp3'
      : mimeType && mimeType.includes('m4a') ? 'voice.m4a'
      : mimeType && mimeType.includes('wav') ? 'voice.wav'
      : 'voice.ogg';
  } else if (!fileName && kind === 'audio') {
    fileName = mimeType && mimeType.includes('mpeg') ? 'audio.mp3'
      : mimeType && mimeType.includes('m4a') ? 'audio.m4a'
      : mimeType && mimeType.includes('wav') ? 'audio.wav'
      : 'audio.ogg';
  } else if (!fileName && kind === 'photo') {
    fileName = mimeType && mimeType.includes('png') ? 'photo.png'
      : mimeType && mimeType.includes('webp') ? 'photo.webp'
      : 'photo.jpg';
  }
  return {
    kind,
    file_id: source.file_id,
    file_unique_id: source.file_unique_id || null,
    file_name: fileName,
    mime_type: mimeType,
    file_size: source.file_size || null,
    width: source.width || null,
    height: source.height || null,
    duration: source.duration || null,
    ...extra
  };
}

function normalizeTelegramRaw(raw = {}) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return normalizeTelegramRaw(parsed);
    } catch (_error) {
      return {};
    }
  }
  if (typeof raw !== 'object') return {};
  if (raw.message && typeof raw.message === 'object') return normalizeTelegramRaw(raw.message);
  return raw;
}

function extractMessageMedia(raw = {}) {
  const normalized = normalizeTelegramRaw(raw);
  if (!normalized || Object.keys(normalized).length === 0 || normalized.source === 'admin_send') return null;

  const photo = bestPhotoSize(normalized.photo || []);
  if (photo) return buildMediaPayload('photo', photo);

  if (normalized.sticker) {
    return buildMediaPayload('sticker', normalized.sticker, {
      emoji: normalized.sticker.emoji || null,
      set_name: normalized.sticker.set_name || null,
      sticker_type: normalized.sticker.type || null,
      custom_emoji_id: normalized.sticker.custom_emoji_id || null,
      thumbnail_file_id: normalized.sticker.thumbnail && normalized.sticker.thumbnail.file_id || null
    });
  }

  if (normalized.video) {
    return buildMediaPayload('video', normalized.video, {
      thumbnail_file_id: normalized.video.thumbnail && normalized.video.thumbnail.file_id || null
    });
  }

  if (normalized.voice) return buildMediaPayload('voice', normalized.voice);
  if (normalized.audio) return buildMediaPayload('audio', normalized.audio);

  if (normalized.video_note) {
    return buildMediaPayload('video_note', normalized.video_note, {
      thumbnail_file_id: normalized.video_note.thumbnail && normalized.video_note.thumbnail.file_id || null
    });
  }

  if (normalized.animation) {
    return buildMediaPayload('animation', normalized.animation, {
      thumbnail_file_id: normalized.animation.thumbnail && normalized.animation.thumbnail.file_id || null
    });
  }

  if (normalized.document) {
    const docMime = String(normalized.document.mime_type || '').toLowerCase();
    if (docMime.startsWith('image/')) {
      return buildMediaPayload('photo', normalized.document, {
        file_name: normalized.document.file_name || 'photo.jpg'
      });
    }
    return buildMediaPayload('document', normalized.document, {
      thumbnail_file_id: normalized.document.thumbnail && normalized.document.thumbnail.file_id || null
    });
  }

  return null;
}

module.exports = {
  bestPhotoSize,
  buildMediaPayload,
  normalizeTelegramRaw,
  extractMessageMedia
};
