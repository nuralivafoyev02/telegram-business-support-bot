'use strict';

const DEFAULT_DONE_TAG = '#done';

const GREETING_RE = /\b(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|assalomu|assalamu|asalomu|asalamu|salom|salomlar|alom|hello|hi|hey|привет|салом|здравствуйте|добрый\s+(день|вечер|утро)|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech))\b/i;
const GREETING_ONLY_RE = /^(assalomu\s+alaykum|assalamu\s+alaykum|assalomu\s+aleykum|assalamu\s+aleykum|asalomu\s+alaykum|asalamu\s+alaykum|salom|salomlar|hello|hi|hey|привет|салом|здравствуйте|hayrli\s+(tong|kun|kech)|xayrli\s+(tong|kun|kech)|добрый\s+(день|вечер|утро))[!.\s]*$/i;
const FAREWELL_RE = /\b(xayr|hayr|hayir|hayrli\s+kun|xayrli\s+kun|ko'?rishguncha|ko'rishguncha|sog'\s+bo'?ling|sog\s+boling|yaxshi\s+qoling|yaxshi\s+dam\s+oling|до\s+свидания|пока|goodbye|bye)\b/i;
const FAREWELL_ONLY_RE = /^(xayr|hayr|hayir|hayrli\s+kun|xayrli\s+kun|ko'?rishguncha|ko'rishguncha|sog'\s+bo'?ling|sog\s+boling|yaxshi\s+qoling|yaxshi\s+dam\s+oling|до\s+свидания|пока|goodbye|bye)[!.\s]*$/i;
const SMALL_TALK_RE = /^(rahmat|raxmat|tashakkur|minnatdorman|minnatdor|ok|okay|xo'p|xop|hop|ha|yo'q|yoq|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|barakalla|barakalloh|alhamdulillah|alhamdulilah|spasibo|спасибо|ок|хорошо|понятно|thanks|thank you)(\s+(rahmat|raxmat|tashakkur|ok|okay|xo'p|xop|hop|ha|mayli|tushunarli|yaxshi|zor|zo'r|ajoyib|spasibo|спасибо|ок|хорошо|понятно|thanks|uziz|aziz|aka|uka|opa))*[!.\s]*$/i;
const SOCIAL_QUESTION_RE = /^(qalaysiz|qalesiz|qandaysiz|yaxshimisiz|yaxshimisz|ishlar\s+qalay|ahvollar\s+qalay|ahvolingiz\s+qanday|как\s+дела|как\s+вы|how\s+are\s+you)[?!. \s]*$/i;
const CONVERSATIONAL_TOKEN_RE = /\b(alhamdulillah|alhamdulilah|bismillah|barakallahu?fik|barakalla|rahmat|raxmat|tashakkur|minnatdorman|salom|salomlar|assalomu|assalamu|alaykum|aleykum|yaxshi|yaxshimisiz|yaxshimisz|qalaysiz|qalesiz|qandaysiz|uziz|aziz|aka|uka|opa|ustoz|do'stim|xayr|hayr|hayir|ko'?rishguncha|sog'|boling|oling|hammaga|barchaga|admin|adminlar|operator|operatorlar|support|manager|menejer|menedjer|админ|оператор|поддержка|менеджер|спасибо|привет|пока|здравствуйте)\b/gi;
const STAFF_PING_TOKEN_RE = /\b(admin|adminlar|operator|operatorlar|support|manager|managerlar|menejer|menejerlar|menedjer|menedjerlar|админ|оператор|поддержка|менеджер)\b/gi;
const MEDIA_PLACEHOLDER_RE = /^(stikerli xabar|videoli xabar|audio xabar|video xabar|animatsiyali xabar|faylli xabar|fayl xabar|media xabar)$/i;
const VOICE_PLACEHOLDER_RE = /^ovozli xabar$/i;
const COMPLETION_RE = /\b(hal\s+bo'?ldi|hal\s+qilindi|bajarildi|tayyor|yechildi|echildi|yopildi|qilindi|решено|готово|сделано|закрыто|исправлено|done|fixed|resolved|completed)\b/i;
const COMPLETION_NEGATION_RE = /\b(hal\s+bo'?lmadi|tayyor\s+emas|yechilmadi|echilmadi|не\s+готово|не\s+решено|not\s+done|not\s+fixed|unresolved)\b/i;

const STRONG_REQUEST_PATTERNS = [
  /\b(yordam|ko'?mak|помощь|help|support)\b/i,
  /\b(savol|savolim|savollar|maslahat|konsultatsiya|tushunmadim|tushunmayapman|вопрос|консультац\w*|не\s+понял|не\s+понимаю|question|consult)\b/i,
  /\b(muammo|muammom|xato|hatolik|nosoz|bug|error|ошибка|проблема|issue|problem|fail|failure)\b/i,
  /\b(ishlamayapti|ishlamadi|ishlamayabdi|ochilmayapti|kirmayapti|chiqmayapti|yubormayapti|kelmayapti|topilmayapti|ko'?rinmayapti|saqlanmayapti|yuklanmayapti|sinxronlashmayapti|bo'?lmayapti|qotib|to'?xtab|qilolmayapman|qila\s+olmayapman|chiqara\s+olmayapman|kiritolmayapman|kirita\s+olmayapman|topolmayapman|topa\s+olmayapman|o'?tolmayapman|kirolmayapman|tasdiqlanmayapti|aktivlashmayapti|bloklandi|blok|yo'?qolib\s+qoldi|o'?chib\s+qoldi|зависает|не\s+работает|не\s+открывается|не\s+получается|не\s+приходит|не\s+заходит|не\s+отправляет|не\s+сохраняется|не\s+видно|не\s+выходит|not\s+working|cannot|can'?t|failed|not\s+found|forbidden)\b/i,
  /\b(tekshir|tekshirib|qarab|ko'?rib|tuzat|to'?g'?irla|hal\s+qil|yordam\s+ber|javob\s+ber|tasdiqla|ulan|ulab|ochib\s+ber|tiklab\s+ber|yuborib\s+ber|проверь|исправь|помогите|ответьте|подключите|проверьте|check|fix|resolve|connect|restore|send\s+me)\b/i,
  /\b(so'?rov|sorov|murojaat|ariza|zayavka|заявка|обращение|request|ticket)\b/i,
  /\b(parol\w*|login\w*|kod\w*|sms|kabinet|akkaunt|account|password|otp|код|смс|логин|парол\w*|аккаунт)\b/i,
  /\b(to'?lov|tolov|pul|summa|hisob|balans|karta|chek|oplata|оплата|платеж|payment|invoice|balance|refund|qaytar)\b/i,
  /\b(ro'?yxat|registratsiya|aktivatsiya|obuna|tarif|dostavka|yetkazib|buyurtma|zakaz|доставка|заказ|регистрация|активация|тариф|услуга|admin|operator|administrator|support|manager)\b/i,
  /помощь|ошибка|проблема|не\s+работает|не\s+открывается|не\s+получается|проверь|исправь|помогите|ответьте|заявка|обращение|логин|пароль|аккаунт|оплата|платеж/i
];

const SOFT_REQUEST_PATTERNS = [
  /\b(kerak|kerek|zarur|lozim|iltimos|mumkinmi|bo'?ladimi|qanday|qanaqa|qayerdan|qachon|nega|nima|nima\s+uchun|qaysi|kim|qancha|narx|price|сколько|почему|как|можно|нужно|please|need|что|как|где|когда|почему|кто|чей|какой|какая|какое)\b/i,
  /\b(bot|guruh|kanal|xabar|sms|telegram|webhook|admin|operator|support|menedjer|менеджер|админ|оператор|поддержка)\b/i,
  /\b(status|holat|javob|ma'lumot|malumot|yo'?riqnoma|qo'?llanma|instruksiya|telefon|kontakt|aloqa|servis|xizmat|statistika|hisob|hisobot|period|kunlik|oylik|haftalik|сервис|статус|ответ|информация|инструкция|pochka|m2|metr|kg|tonna|litr|dona|miqdor)\b/i,
  /сколько|почему|можно|нужно|пожалуйста|менеджер|админ|оператор|поддержка/i
];

const DOMAIN_CONTEXT_PATTERNS = [
  /\b(uyqur|uygur|uyghur)\b/i,
  /\b(dastur|programma|ilova|platforma|tizim|sistema|modul|funksiya|funktsiya|panel|kabinet|avtomatlashtirish|avtomatlashtiradi)\b/i,
  /\b(qurilish|obyekt|ob'?ekt|obekt|loyiha|smeta|hisobot|akt|naryad|ombor|sklad|material|qoldiq|kirim|chiqim|xarajat|brigada|ishchi|usta|ustalar|bosqich|etap|grafik|jadval|reja|kalkulyatsiya|ta'minot|bo'lim|vazifa|topshiriq|ijro|mas'ul|masul|muddat|kechikish|o'tkazma|mablag'|fond|kassa|tasdiq|tasdiqlash|qabul|topshirish|prorab|ustaboshi)\b/i,
  /\b(уйгур|программа|приложение|платформа|система|модуль|функция|кабинет|стройка|строительство|объект|проект|смета|отчет|отчёт|акт|наряд|склад|материал|остаток|приход|расход|затрат\w*|бригада|рабоч\w*|мастер|этап|график|таблица)\b/i,
  /\b(construction|project|estimate|report|warehouse|material|crew|schedule|automation|software|app|platform|module)\b/i
];

const NON_SUPPORT_SALES_PATTERNS = [
  /\b(katalog\w*|catalog|prays|price\s*list|rekvizit\w*|chegirma|скидк\w*|каталог|прайс|реквизит\w*)\b/i,
  /\b(oferta|оферта|shartnoma|договор)\b/i
];

const NON_SUPPORT_SALES_SEND_PATTERNS = [
  /\b(katalog\w*|catalog|prays|price\s*list|rekvizit\w*|каталог|прайс|реквизит\w*)\b.*\b(yubor|yuboring|jo'?nat|jo'?nating|tashlab\s+ber|tashlab\s+bering|bering|send|give|отправь|отправьте|пришлите|дайте)\b/i,
  /\b(yubor|yuboring|jo'?nat|jo'?nating|tashlab\s+ber|tashlab\s+bering|bering|send|give|отправь|отправьте|пришлите|дайте)\b.*\b(katalog\w*|catalog|prays|price\s*list|rekvizit\w*|каталог|прайс|реквизит\w*)\b/i
];

const ACTION_REQUEST_PATTERNS = [
  /\b(yubor|yuboring|yuborib|yuborvoring|jo'?nat|jo'?nating|tashlab\s+ber|tashlab\s+bering|bering|berib\s+yubor|ayting|ko'?rsating|ko'?rsatib|tushuntir|tushuntirib|o'?rgat|o'?rgating|o'?rgatib|hisoblab|chiqarib|ochib\s+ber|tiklab\s+ber|ulab\s+ber|qo'?shib\s+ber|bog'laning|aloqaga\s+chiqing|qayta\s+qo'?ng'iroq|javob\s+ber)\b/i,
  /\b(qanday\s+(qil|ishlat|qo'?sh|och|yop|kirit|chiqar|top|sozla|to'?g'?irla)|qayerdan\s+(top|ol|kir|ko'?r)|qayerda\s+(turibdi|bor|ko'?rinadi))\b/i,
  /\b(send|tell|give|show|explain|calculate|connect|restore|call\s+back|contact\s+me|reply)\b/i,
  /\b(отправьте|отправь|пришлите|дайте|скажите|покажите|объясните|посчитайте|подключите|свяжитесь|ответьте|позвоните|обучите|научите)\b/i,
  /\b(как\s+(добав|польз|откры|закры|созда|ввести|найти|исправ)|где\s+(найти|посмотреть|видно))\b/i
];

const AVAILABILITY_PATTERNS = [
  /\b(admin|operator|menedjer|support|xodim|hodim)\s+(bormi|bormi\?|kerak|chiqadimi)\b/i,
  /\b(bugun|hozir|endi)\s+(ishlaysizlarmi|ishlaysizmi|ochiqmi|javob\s+berasizmi)\b/i,
  /\b(есть\s+админ|есть\s+оператор|кто\s+нибудь|вы\s+работаете|работаете\s+сегодня)\b/i,
  /\b(anyone\s+there|are\s+you\s+open|do\s+you\s+work\s+today)\b/i
];

const CUSTOMER_CONTEXT_PATTERNS = [
  /\b(menga|bizga|meni|bizni|mening|bizning|iltimos|please|пожалуйста|мне|нам|мой|наш)\b/i,
  /\b(kelmayapti|tasdiqlanmadi|kutayapman|kutvoman|javob\s+yo'?q|hali|qoldi|kechikdi|bloklandi|to'?xtadi|o'?chib\s+qoldi|не\s+пришел|не\s+приходит|не\s+ответили|жду|задержка|blocked|waiting)\b/i
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
  const analyzed = normalizeText(message.analysis_text || '');
  if (analyzed) return analyzed;
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

function isInformalEmployeeStatusUpdate(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  if (/\bmuammo\b/.test(value) && /\b(yopildi|hal\s+bo'?ldi|tugadi|yechildi|echildi)\b/.test(value)) return true;
  if (/\b(qo'?ydim|qildim|sozladim|o'?zgartirdim|chiqmaydigan|chiqmayapti|o'?chirib)\b/.test(value)
    && /\b(yopildi|hal|tayyor)\b/.test(value)) {
    return true;
  }
  return false;
}

function isEmployeeDoneIntent(text = '', options = {}) {
  if (isDoneMessage(text, options)) return true;
  if (!isCompletionIntent(text)) return false;
  const value = normalizedLower(text);
  if (isInformalEmployeeStatusUpdate(value)) return false;
  if (meaningfulLength(value) > 48) return false;
  return true;
}

function isCommand(text = '') {
  return text.trim().startsWith('/');
}

function hasPattern(patterns, value) {
  return patterns.some(pattern => pattern.test(value));
}

function isNonSupportSalesIntent(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  if (hasPattern(NON_SUPPORT_SALES_SEND_PATTERNS, value)) return true;
  return hasPattern(NON_SUPPORT_SALES_PATTERNS, value) && !hasPattern(DOMAIN_CONTEXT_PATTERNS, value);
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
    .replace(/\b(alaykum|aleykum|aka|uka|opa|admin|adminlar|operator|operatorlar|support|manager|menejer|menedjer|ustoz|do'stlar|barchaga|hammaga|azizlar)\b/gi, '')
    .replace(/[!?.\s,]+/g, '');
  return GREETING_ONLY_RE.test(value) || (GREETING_RE.test(value) && withoutGreeting.length === 0);
}

function isSmallTalk(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  return SMALL_TALK_RE.test(value) || SOCIAL_QUESTION_RE.test(value);
}

function isMediaPlaceholder(text = '') {
  const value = normalizedLower(text);
  return Boolean(value) && MEDIA_PLACEHOLDER_RE.test(value);
}

function isFarewellOnly(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  if (FAREWELL_ONLY_RE.test(value)) return true;
  const withoutFarewell = value
    .replace(FAREWELL_RE, '')
    .replace(/\b(rahmat|raxmat|aka|uka|opa|uziz|aziz)\b/gi, '')
    .replace(/[!?.\s,]+/g, '');
  return FAREWELL_RE.test(value) && withoutFarewell.length === 0;
}

function isStaffPingOnly(text = '') {
  const value = normalizedLower(text);
  if (!value) return false;
  const withoutPing = value
    .replace(GREETING_RE, '')
    .replace(STAFF_PING_TOKEN_RE, '')
    .replace(/\b(iltimos|please|plz|aka|uka|opa|ustoz|azizlar|hammaga|barchaga|hurmatli)\b/gi, '')
    .replace(/[!?.\s,]+/g, '');
  return STAFF_PING_TOKEN_RE.test(value) && withoutPing.length === 0;
}

function stripConversationalTokens(text = '') {
  return normalizedLower(text)
    .replace(CONVERSATIONAL_TOKEN_RE, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function isConversationalOnly(text = '') {
  const value = normalizedLower(text);
  if (!value) return true;
  if (isMediaPlaceholder(value)) return true;
  if (isGreetingOnly(value) || isSmallTalk(value) || isFarewellOnly(value) || isStaffPingOnly(value)) return true;

  const stripped = stripConversationalTokens(value);
  if (!stripped.length) return true;

  if (stripped.length <= 4 && !hasPattern(STRONG_REQUEST_PATTERNS, value)) return true;

  const letters = value.replace(/[^\p{L}\p{N}]+/gu, '');
  if (letters.length >= 8 && stripped.length / letters.length <= 0.2 && !hasPattern(STRONG_REQUEST_PATTERNS, value)) {
    return true;
  }

  return false;
}

function requestScore(value = '') {
  const normalized = normalizedLower(value);
  if (!normalized || isNoiseOnly(normalized)) return 0;
  if (isNonSupportSalesIntent(normalized)) return 0;
  if (isConversationalOnly(normalized)) return 0;

  let score = 0;
  const question = normalized.includes('?') || /\b\w+mi(\s|[?!.]|$)/i.test(normalized);
  const strongMatches = STRONG_REQUEST_PATTERNS.filter(pattern => pattern.test(normalized)).length;
  const softMatches = SOFT_REQUEST_PATTERNS.filter(pattern => pattern.test(normalized)).length;
  const actionMatches = ACTION_REQUEST_PATTERNS.filter(pattern => pattern.test(normalized)).length;
  const domainMatches = DOMAIN_CONTEXT_PATTERNS.filter(pattern => pattern.test(normalized)).length;
  const hasAvailability = hasPattern(AVAILABILITY_PATTERNS, normalized);
  const hasCustomerContext = hasPattern(CUSTOMER_CONTEXT_PATTERNS, normalized);

  score += strongMatches * 2;
  score += softMatches;
  score += actionMatches * 1.5;
  if (domainMatches && (strongMatches || softMatches || actionMatches || question)) score += 1.5;
  if (domainMatches > 1 && actionMatches) score += 0.5;
  if (question && domainMatches) score += 1; // Domain context + question mark is a strong signal
  if (question && !isSmallTalk(normalized) && !isGreetingOnly(normalized)) score += 1;
  if (GREETING_RE.test(normalized) && (strongMatches || softMatches)) score += 1;
  if (hasCustomerContext && (strongMatches || softMatches || actionMatches || domainMatches)) score += 1;
  if (/\d{3,}/.test(normalized) && (hasPattern(SOFT_REQUEST_PATTERNS, normalized) || hasPattern(STRONG_REQUEST_PATTERNS, normalized))) score += 1;
  if (/\b(bormi|kim\s+bor|aloqaga\s+chiqing|bog'laning|свяжитесь|есть\s+кто|anyone\s+there)\b/i.test(normalized)) score += 1;
  if (hasAvailability) score += 2;
  if (actionMatches && (softMatches || domainMatches)) score += 1;
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
  if (isNonSupportSalesIntent(value)) return false;
  if (isConversationalOnly(value)) return false;
  const threshold = options.strict ? 2 : 1;
  return requestScore(value) >= threshold;
}

function shouldOpenPrivateRequest(text = '', options = {}) {
  const value = normalizedLower(text);
  if (isNonSupportSalesIntent(value)) return false;
  if (isRequestIntent(value, options)) return true;
  if (!usesBroadPrivateDetection(options)) return false;
  return meaningfulLength(value) >= minTextLength(options);
}

function isCustomerPhotoRequest({ mediaKind = '', isKnownEmployee = false } = {}) {
  return !isKnownEmployee && mediaKind === 'photo';
}

function isCustomerVoiceWithoutTranscript({ text = '', mediaKind = '', isKnownEmployee = false } = {}) {
  const normalized = normalizedLower(text);
  return !isKnownEmployee
    && (mediaKind === 'voice' || mediaKind === 'audio')
    && (!normalized || VOICE_PLACEHOLDER_RE.test(normalized));
}

function classifyMessage({
  text,
  chatType,
  isKnownEmployee = false,
  isBusiness = false,
  doneTag,
  requestDetectionMode = 'keyword',
  minTextLength = 10,
  aiMode = false,
  mediaKind = ''
}) {
  const cleaned = normalizeText(text);
  const options = { doneTag, requestDetectionMode, minTextLength, aiMode };
  if (isCustomerPhotoRequest({ mediaKind, isKnownEmployee })) return 'request';
  if (isCustomerVoiceWithoutTranscript({ text: cleaned, mediaKind, isKnownEmployee })) return 'request';
  if (!cleaned || isNoiseOnly(cleaned)) return 'ignore';
  if (isDoneMessage(cleaned, options)) return 'done';
  if (isCommand(cleaned)) return 'command';
  if (isKnownEmployee && isEmployeeDoneIntent(cleaned, options)) return 'done';
  if (isKnownEmployee) return 'employee_message';
  if (isConversationalOnly(cleaned)) return 'message';
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
  isEmployeeDoneIntent,
  isCommand,
  isGreetingOnly,
  isSmallTalk,
  isFarewellOnly,
  isConversationalOnly,
  isMediaPlaceholder,
  isRequestIntent,
  requestScore,
  classifyMessage
};
