'use strict';

const DEFAULT_DONE_TAG = '#done';

const GREETING_RE = /\b(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|assalomu|assalamu|asalomu|asalamu|salom|salomlar|alom|hello|hi|hey|привет|салом|здравствуйте|добрый\s+(день|вечер|утро)|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech))\b/i;
const GREETING_ONLY_RE = /^(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|salom|salomlar|hello|hi|hey|привет|салом|здравствуйте|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech)|добрый\s+(день|вечер|утро))[!.\s]*$/i;
const SMALL_TALK_RE = /^(rahmat|raxmat|tashakkur|ok|okay|xo'p|xop|hop|ha|yo'q|yoq|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|spasibo|спасибо|ок|хорошо|понятно|thanks|thank you)(\s+(rahmat|raxmat|tashakkur|ok|okay|xo'p|xop|hop|ha|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|spasibo|спасибо|ок|хорошо|понятно|thanks))*[!.\s]*$/i;
const SOCIAL_QUESTION_RE = /^(qalaysiz|qalesiz|qandaysiz|yaxshimisiz|ishlar\s+qalay|ahvollar\s+qalay|как\s+дела|как\s+вы|how\s+are\s+you)[?!. \s]*$/i;
const COMPLETION_RE = /\b(hal\s+bo'?ldi|hal\s+qilindi|bajarildi|tayyor|yechildi|echildi|yopildi|qilindi|решено|готово|сделано|закрыто|исправлено|done|fixed|resolved|completed)\b/i;
const COMPLETION_NEGATION_RE = /\b(hal\s+bo'?lmadi|tayyor\s+emas|yechilmadi|echilmadi|не\s+готово|не\s+решено|not\s+done|not\s+fixed|unresolved)\b/i;

const STRONG_REQUEST_PATTERNS = [
  /\b(yordam|ko'?mak|помощь|help|support)\b/i,
  /\b(muammo|muammom|xato|hatolik|nosoz|bug|error|ошибка|проблема|issue|problem|fail|failure)\b/i,
  /\b(ishlamayapti|ishlamadi|ishlamayabdi|ochilmayapti|kirmayapti|chiqmayapti|yubormayapti|kelmayapti|topilmayapti|bo'?lmayapti|qotib|to'?xtab|qilolmayapman|qila\s+olmayapman|o'?tolmayapman|kirolmayapman|tasdiqlanmayapti|aktivlashmayapti|bloklandi|blok|зависает|не\s+работает|не\s+открывается|не\s+получается|не\s+приходит|не\s+заходит|не\s+отправляет|not\s+working|cannot|can'?t|failed|not\s+found|forbidden)\b/i,
  /\b(tekshir|tekshirib|qarab|ko'?rib|tuzat|to'?g'?irla|hal\s+qil|yordam\s+ber|javob\s+ber|tasdiqla|ulan|ulab|ochib\s+ber|tiklab\s+ber|yuborib\s+ber|проверь|исправь|помогите|ответьте|подключите|проверьте|check|fix|resolve|connect|restore|send\s+me)\b/i,
  /\b(so'?rov|sorov|murojaat|ariza|zayavka|заявка|обращение|request|ticket)\b/i,
  /\b(parol|login|kod|sms|kabinet|akkaunt|account|password|otp|код|смс|логин|пароль|аккаунт)\b/i,
  /\b(to'?lov|tolov|pul|summa|hisob|balans|karta|chek|oplata|оплата|платеж|payment|invoice|balance|refund|qaytar)\b/i,
  /\b(ro'?yxat|registratsiya|aktivatsiya|obuna|tarif|dostavka|yetkazib|buyurtma|zakaz|доставка|заказ|регистрация|активация|тариф|услуга)\b/i,
  /помощь|ошибка|проблема|не\s+работает|не\s+открывается|не\s+получается|проверь|исправь|помогите|ответьте|заявка|обращение|логин|пароль|аккаунт|оплата|платеж/i
];

const SOFT_REQUEST_PATTERNS = [
  /\b(kerak|kerek|zarur|lozim|iltimos|mumkinmi|bo'?ladimi|qanday|qanaqa|qayerdan|qachon|nega|nima\s+uchun|qancha|narx|price|сколько|почему|как|можно|нужно|please|need)\b/i,
  /\b(bot|guruh|kanal|xabar|sms|telegram|webhook|admin|operator|support|menedjer|менеджер|админ|оператор|поддержка)\b/i,
  /\b(mahsulot|xizmat|status|holat|javob|ma'lumot|malumot|сервис|статус|ответ|информация)\b/i,
  /сколько|почему|можно|нужно|пожалуйста|менеджер|админ|оператор|поддержка|доставка|заказ|услуга|тариф/i
];

const NOISE_ONLY_RE = /^([.!?,\s]|\p{Extended_Pictographic})+$/u;
const URL_ONLY_RE = /^(https?:\/\/|www\.)\S+$/i;

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

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDoneTag(tag = DEFAULT_DONE_TAG) {
  const normalized = normalizeText(tag || DEFAULT_DONE_TAG);
  return normalized || DEFAULT_DONE_TAG;
}

function doneTagRegex(tag = DEFAULT_DONE_TAG) {
  return new RegExp(`(^|\\s)${escapeRegExp(normalizeDoneTag(tag))}(?=$|\\s|[.!?,:;])`, 'i');
}

function doneTagsFromOptions(options = {}) {
  const tags = new Set([DEFAULT_DONE_TAG]);
  if (options.doneTag) tags.add(options.doneTag);
  if (options.done_tag) tags.add(options.done_tag);
  return [...tags].map(normalizeDoneTag);
}

function isDoneMessage(text = '', options = {}) {
  const value = normalizeText(text);
  if (!value) return false;
  return doneTagsFromOptions(options).some(tag => doneTagRegex(tag).test(value));
}

function isCompletionIntent(text = '') {
  const value = normalizedLower(text);
  if (!value || COMPLETION_NEGATION_RE.test(value)) return false;
  return COMPLETION_RE.test(value);
}

function isCommand(text = '') {
  return text.trim().startsWith('/');
}

function hasPattern(patterns, value) {
  return patterns.some(pattern => pattern.test(value));
}

function meaningfulLength(value = '') {
  return normalizedLower(value).replace(/[^\p{L}\p{N}]+/gu, '').length;
}

function isNoiseOnly(text = '') {
  const value = normalizeText(text);
  return !value || NOISE_ONLY_RE.test(value) || URL_ONLY_RE.test(value);
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

function requestScore(value = '') {
  const normalized = normalizedLower(value);
  if (!normalized || isNoiseOnly(normalized)) return 0;

  let score = 0;
  const question = normalized.includes('?');
  const strongMatches = STRONG_REQUEST_PATTERNS.filter(pattern => pattern.test(normalized)).length;
  const softMatches = SOFT_REQUEST_PATTERNS.filter(pattern => pattern.test(normalized)).length;

  score += strongMatches * 2;
  score += softMatches;
  if (question && !isSmallTalk(normalized) && !isGreetingOnly(normalized)) score += 1;
  if (GREETING_RE.test(normalized) && (strongMatches || softMatches)) score += 1;
  if (/\b(menga|bizga|meni|bizni|iltimos|please|пожалуйста|нам|мне)\b/i.test(normalized) && (strongMatches || softMatches)) score += 1;
  if (/\d{3,}/.test(normalized) && (hasPattern(SOFT_REQUEST_PATTERNS, normalized) || hasPattern(STRONG_REQUEST_PATTERNS, normalized))) score += 1;
  if (/\b(bormi|kim\s+bor|aloqaga\s+chiqing|bog'laning|свяжитесь|есть\s+кто|anyone\s+there)\b/i.test(normalized)) score += 1;
  return score;
}

function normalizedDetectionMode(options = {}) {
  return String(options.requestDetectionMode || options.mode || 'keyword').trim() || 'keyword';
}

function minTextLength(options = {}) {
  const value = Number(options.minTextLength || options.min_text_length || 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function usesBroadPrivateDetection(options = {}) {
  const mode = normalizedDetectionMode(options);
  return options.aiMode === true || ['all_private_keyword_group', 'smart', 'ai'].includes(mode);
}

function isRequestIntent(text = '', options = {}) {
  const value = normalizedLower(text);
  if (!value || isNoiseOnly(value) || isCommand(value) || isDoneMessage(value, options)) return false;
  if (isGreetingOnly(value) || isSmallTalk(value)) return false;
  const threshold = options.strict ? 2 : 1;
  return requestScore(value) >= threshold;
}

function shouldOpenPrivateRequest(text = '', options = {}) {
  const value = normalizedLower(text);
  if (isRequestIntent(value, options)) return true;
  if (!usesBroadPrivateDetection(options)) return false;
  return meaningfulLength(value) >= minTextLength(options);
}

function classifyMessage({
  text,
  chatType,
  isKnownEmployee = false,
  isBusiness = false,
  doneTag,
  requestDetectionMode = 'keyword',
  minTextLength = 10,
  aiMode = false
}) {
  const cleaned = normalizeText(text);
  const options = { doneTag, requestDetectionMode, minTextLength, aiMode };
  if (!cleaned || isNoiseOnly(cleaned)) return 'ignore';
  if (isDoneMessage(cleaned, options)) return 'done';
  if (isCommand(cleaned)) return 'command';
  if (isKnownEmployee && isCompletionIntent(cleaned)) return 'done';
  if (isKnownEmployee) return 'employee_message';
  if (isGreetingOnly(cleaned) || isSmallTalk(cleaned)) return 'message';
  if ((isBusiness || chatType === 'private') && shouldOpenPrivateRequest(cleaned, options)) return 'request';
  if (['group', 'supergroup'].includes(chatType) && isRequestIntent(cleaned, { ...options, strict: true })) return 'request';
  return 'message';
}

module.exports = {
  DEFAULT_DONE_TAG,
  normalizeText,
  getMessageText,
  isDoneMessage,
  isCompletionIntent,
  isCommand,
  isGreetingOnly,
  isSmallTalk,
  isRequestIntent,
  requestScore,
  classifyMessage
};
