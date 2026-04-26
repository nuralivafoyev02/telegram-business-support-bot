'use strict';

const { normalizeAiIntegration, isAiIntegrationReady } = require('./ai-config');

const ALLOWED_CLASSIFICATIONS = new Set(['request', 'message', 'ignore']);
const MAX_KNOWLEDGE_CHARS = 60000;

function chatCompletionsUrl(baseUrl = '') {
  const clean = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(clean)) return clean;
  return `${clean}/chat/completions`;
}

function stripJsonFence(value = '') {
  return String(value || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function safeJsonParse(value = '') {
  const clean = stripJsonFence(value);
  try {
    return JSON.parse(clean);
  } catch (_error) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw _error;
  }
}

function buildSystemPrompt(config) {
  const knowledge = String(config.knowledge_text || '').slice(-MAX_KNOWLEDGE_CHARS);
  return [
    config.system_prompt,
    knowledge ? ['Uyqur dasturi bo‘yicha ichki bilim bazasi:', knowledge].join('\n') : ''
  ].filter(Boolean).join('\n\n');
}

function shouldUseExternalAi(settings = {}) {
  return Boolean(settings.aiMode && settings.aiProvider && isAiIntegrationReady(settings.aiIntegration));
}

async function classifyWithAi({ text, chatType, sourceType, settings }) {
  if (!shouldUseExternalAi(settings)) return null;
  const config = normalizeAiIntegration(settings.aiIntegration);
  if (!config.api_key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(chatCompletionsUrl(config.base_url), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(config) },
          {
            role: 'user',
            content: JSON.stringify({
              text,
              chat_type: chatType,
              source_type: sourceType,
              required_output: {
                classification: 'request|message|ignore',
                confidence: '0..1',
                reason: 'short'
              }
            })
          }
        ]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error && payload.error.message ? payload.error.message : `AI HTTP ${response.status}`);
    }

    const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
    const parsed = safeJsonParse(content || '{}');
    const classification = String(parsed.classification || '').toLowerCase();
    if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

    const confidence = Number(parsed.confidence);
    return {
      classification,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      reason: String(parsed.reason || '').slice(0, 240)
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  shouldUseExternalAi,
  classifyWithAi
};
