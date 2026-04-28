'use strict';

const DEFAULT_AI_SYSTEM_PROMPT = [
  'Siz Uyqur nomli qurilishni avtomatlashtiruvchi dastur uchun texnik yordam botining niyat aniqlovchi AI qatlamisiz.',
  'Vazifa: Telegram xabarini request, message yoki ignore sifatida tasniflash.',
  'request: mijoz Uyqur dasturi, obyekt, smeta, material, ombor, hisobot, brigada, login yoki o‘rgatish bo‘yicha savol/muammo yozsa.',
  'message: salom, rahmat, fikr, umumiy suhbat yoki ticket ochmaydigan gaplar.',
  'ignore: bo‘sh, faqat link/emoji yoki tushunarsiz shovqin.',
  'Katalog, rekvizit, price list yuborish kabi savdo so‘rovlarini request qilma.',
  'Faqat JSON qaytar: {"classification":"request|message|ignore","confidence":0.0,"reason":"qisqa sabab"}.'
].join('\n');

const DEFAULT_AI_INTEGRATION = Object.freeze({
  enabled: true,
  provider: 'openai_compatible',
  label: '',
  base_url: 'https://api.openai.com/v1',
  model: '',
  api_key: '',
  has_api_key: false,
  system_prompt: DEFAULT_AI_SYSTEM_PROMPT,
  knowledge_text: '',
  last_check_status: '',
  last_checked_at: '',
  last_check_error: ''
});

const SECRET_PLACEHOLDER_RE = /^(••••|\\*\\*\\*\\*|masked|__keep__|keep)$/i;

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeBaseUrl(value = '') {
  return cleanString(value || DEFAULT_AI_INTEGRATION.base_url).replace(/\/+$/, '');
}

function normalizeAiIntegration(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const apiKey = cleanString(source.api_key || source.apiKey);
  const model = cleanString(source.model);
  const label = cleanString(source.label || source.model_label || source.modelLabel || model);
  return {
    enabled: source.enabled !== false,
    provider: cleanString(source.provider || DEFAULT_AI_INTEGRATION.provider),
    label,
    base_url: normalizeBaseUrl(source.base_url || source.baseUrl),
    model,
    api_key: apiKey,
    has_api_key: Boolean(apiKey || source.has_api_key || source.hasApiKey),
    system_prompt: cleanString(source.system_prompt || source.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT),
    knowledge_text: cleanString(source.knowledge_text || source.knowledgeText),
    last_check_status: cleanString(source.last_check_status || source.lastCheckStatus || source.connection_status || source.connectionStatus),
    last_checked_at: cleanString(source.last_checked_at || source.lastCheckedAt),
    last_check_error: cleanString(source.last_check_error || source.lastCheckError)
  };
}

function isAiIntegrationConfigured(value = {}) {
  const config = normalizeAiIntegration(value);
  return Boolean(config.enabled && config.provider && config.base_url && config.model && config.api_key);
}

function isAiIntegrationReady(value = {}) {
  const config = normalizeAiIntegration(value);
  return Boolean(isAiIntegrationConfigured(config) && config.last_check_status === 'ok');
}

function hasUsableApiKey(value = {}) {
  const key = cleanString(value.api_key || value.apiKey);
  return Boolean(key && !SECRET_PLACEHOLDER_RE.test(key));
}

function mergeAiIntegration(previous = {}, next = {}) {
  const oldConfig = normalizeAiIntegration(previous);
  const incoming = normalizeAiIntegration(next);
  if (!hasUsableApiKey(next)) incoming.api_key = oldConfig.api_key;
  incoming.has_api_key = Boolean(incoming.api_key);
  return incoming;
}

function sanitizeAiIntegration(value = {}) {
  const config = normalizeAiIntegration(value);
  return {
    ...config,
    api_key: '',
    has_api_key: Boolean(config.api_key || config.has_api_key)
  };
}

function aiIntegrationSignature(value = {}) {
  const config = normalizeAiIntegration(value);
  return [config.enabled, config.provider, config.label, config.base_url, config.model].join('|');
}

module.exports = {
  DEFAULT_AI_SYSTEM_PROMPT,
  DEFAULT_AI_INTEGRATION,
  normalizeAiIntegration,
  isAiIntegrationConfigured,
  isAiIntegrationReady,
  mergeAiIntegration,
  sanitizeAiIntegration,
  aiIntegrationSignature
};
