'use strict';

const DONE_RE = /(^|\s)#done(\b|\s|$)/i;
const GREETING_RE = /\b(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|assalomu|assalamu|asalomu|asalamu|salom|salomlar|alom|hello|hi|hey|привет|салом|здравствуйте|добрый\s+(день|вечер|утро)|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech))\b/i;
const GREETING_ONLY_RE = /^(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|salom|salomlar|hello|hi|hey|привет|салом|здравствуйте|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech)|добрый\s+(день|вечер|утро))[!.\s]*$/i;
const SMALL_TALK_RE = /^(rahmat|raxmat|tashakkur|ok|okay|xo'p|xop|hop|ha|yo'q|yoq|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|spasibo|спасибо|ок|хорошо|понятно|thanks|thank you)(\s+(rahmat|raxmat|tashakkur|ok|okay|xo'p|xop|hop|ha|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|spasibo|спасибо|ок|хорошо|понятно|thanks))*[!.\s]*$/i;
const SOCIAL_QUESTION_RE = /^(qalaysiz|qalesiz|qandaysiz|yaxshimisiz|ishlar\s+qalay|ahvollar\s+qalay|как\s+дела|как\s+вы|how\s+are\s+you)[?!. \s]*$/i;

const STRONG_REQUEST_PATTERNS = [
  /\b(yordam|ko'?mak|помощь|help)\b/i,
  /\b(muammo|muammom|xato|hatolik|nosoz|bug|error|ошибка|проблема|issue|problem)\b/i,
  /\b(ishlamayapti|ishlamadi|ishlamayabdi|ochilmayapti|kirmayapti|chiqmayapti|yubormayapti|kelmayapti|topilmayapti|bo'?lmayapti|qotib|to'?xtab|qilolmayapman|qila\s+olmayapman|не\s+работает|не\s+открывается|не\s+получается|not\s+working|cannot|can'?t|failed|not\s+found|forbidden)\b/i,
  /\b(tekshir|tekshirib|qarab|ko'?rib|tuzat|to'?g'?irla|hal\s+qil|yordam\s+ber|javob\s+ber|tasdiqla|ulan|ulab|проверь|исправь|помогите|ответьте|check|fix|resolve|connect)\b/i,
  /\b(so'?rov|sorov|murojaat|ariza|zayavka|заявка|обращение|request|ticket)\b/i,
  /\b(parol|login|kabinet|akkaunt|account|password|логин|пароль|аккаунт)\b/i,
  /\b(to'?lov|tolov|pul|summa|hisob|balans|karta|chek|oplata|оплата|платеж|payment|invoice|balance)\b/i,
  /помощь|ошибка|проблема|не\s+работает|не\s+открывается|не\s+получается|проверь|исправь|помогите|ответьте|заявка|обращение|логин|пароль|аккаунт|оплата|платеж/i
];

const SOFT_REQUEST_PATTERNS = [
  /\b(kerak|kerek|zarur|lozim|iltimos|mumkinmi|bo'?ladimi|qanday|qanaqa|qayerdan|qachon|nega|nima\s+uchun|qancha|narx|price|сколько|почему|как|можно|нужно|please|need)\b/i,
  /\b(bot|guruh|kanal|xabar|sms|telegram|webhook|admin|operator|support|menedjer|менеджер|админ|оператор|поддержка)\b/i,
  /\b(buyurtma|zakaz|order|mahsulot|xizmat|tarif|obuna|abonent|доставка|заказ|услуга|тариф)\b/i,
  /сколько|почему|можно|нужно|пожалуйста|менеджер|админ|оператор|поддержка|доставка|заказ|услуга|тариф/i
];

function normalizeText(text = '') {
  return String(text || '')
    .replace(/[‘’ʼʻ`]/g, "'")
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedLower(text = '') {
  return normalizeText(text).toLowerCase();
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

function hasPattern(patterns, value) {
  return patterns.some(pattern => pattern.test(value));
}

function isGreetingOnly(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  const withoutGreeting = value
    .replace(GREETING_RE, '')
    .replace(/\b(alaykum|aleykum|aka|uka|opa|admin|ustoz|do'stlar|barchaga|hammaga|azizlar)\b/gi, '')
    .replace(/[!?.\s,]+/g, '');
  return GREETING_ONLY_RE.test(value) || (GREETING_RE.test(value) && withoutGreeting.length === 0);
}

function isSmallTalk(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  return SMALL_TALK_RE.test(value) || SOCIAL_QUESTION_RE.test(value);
}

function requestScore(value) {
  let score = 0;
  const question = value.includes('?');
  const strongMatches = STRONG_REQUEST_PATTERNS.filter(pattern => pattern.test(value)).length;
  const softMatches = SOFT_REQUEST_PATTERNS.filter(pattern => pattern.test(value)).length;

  score += strongMatches * 2;
  score += softMatches;
  if (question && !isSmallTalk(value) && !isGreetingOnly(value)) score += 1;
  if (GREETING_RE.test(value) && (strongMatches || softMatches)) score += 1;
  if (/\b(menga|bizga|meni|bizni|iltimos|please)\b/i.test(value) && (strongMatches || softMatches)) score += 1;
  if (/\d{3,}/.test(value) && hasPattern(SOFT_REQUEST_PATTERNS, value)) score += 1;
  return score;
}

function isRequestIntent(text = '', options = {}) {
  const value = normalizedLower(text);
  if (!value || isCommand(value) || isDoneMessage(value)) return false;
  if (isGreetingOnly(value) || isSmallTalk(value)) return false;
  const threshold = options.strict ? 2 : 1;
  return requestScore(value) >= threshold;
}

function classifyMessage({ text, chatType, isKnownEmployee = false, isBusiness = false }) {
  const cleaned = normalizeText(text);
  if (!cleaned) return 'ignore';
  if (isDoneMessage(cleaned)) return 'done';
  if (isCommand(cleaned)) return 'command';
  if (isKnownEmployee) return 'employee_message';
  if (isGreetingOnly(cleaned) || isSmallTalk(cleaned)) return 'message';
  if (isBusiness && chatType === 'private' && isRequestIntent(cleaned)) return 'request';
  if (chatType === 'private' && isRequestIntent(cleaned)) return 'request';
  if (['group', 'supergroup'].includes(chatType) && isRequestIntent(cleaned, { strict: true })) return 'request';
  return 'message';
}

module.exports = {
  normalizeText,
  getMessageText,
  isDoneMessage,
  isCommand,
  isGreetingOnly,
  isSmallTalk,
  isRequestIntent,
  classifyMessage
};
