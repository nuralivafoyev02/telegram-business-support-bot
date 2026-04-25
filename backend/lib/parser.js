'use strict';

const DONE_RE = /(^|\s)#done(\b|\s|$)/i;
const REQUEST_KEYWORDS = [
  'yordam', 'qarab', 'tekshir', 'muammo', 'xato', 'ishlamayapti', 'ishlamayapti', 'kerak', 'iltimos',
  'savol', 'so‘rov', 'sorov', 'murojaat', 'muammom', 'javob', 'taminot', 'ta\'minot', 'hisob', 'tasdiq',
  'assalamu', 'салом', 'помощь', 'проверь', 'ошибка', 'не работает', 'нужна помощь', 'заявка', 'вопрос'
];

function normalizeText(text = '') {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function getMessageText(message = {}) {
  return normalizeText(message.text || message.caption || '');
}

function isDoneMessage(text = '') {
  return DONE_RE.test(text);
}

function isCommand(text = '') {
  return text.trim().startsWith('/');
}

function isRequestIntent(text = '') {
  const value = normalizeText(text).toLowerCase();
  if (!value || isCommand(value) || isDoneMessage(value)) return false;
  if (value.includes('?')) return true;
  if (value.length >= 10 && REQUEST_KEYWORDS.some(keyword => value.includes(keyword))) return true;
  return false;
}

function classifyMessage({ text, chatType, isKnownEmployee = false, isBusiness = false }) {
  const cleaned = normalizeText(text);
  if (!cleaned) return 'ignore';
  if (isDoneMessage(cleaned)) return 'done';
  if (isCommand(cleaned)) return 'command';
  if (isKnownEmployee) return 'employee_message';
  if (isBusiness && chatType === 'private') return 'request';
  if (chatType === 'private' && cleaned.length >= 2) return 'request';
  if (['group', 'supergroup'].includes(chatType) && isRequestIntent(cleaned)) return 'request';
  return 'message';
}

module.exports = { normalizeText, getMessageText, isDoneMessage, isCommand, isRequestIntent, classifyMessage };
