'use strict';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const SECRET_PLACEHOLDER_RE = /^(••••|\*\*\*\*|masked|__keep__|keep)$/i;

const DEFAULT_CLICKUP_INTEGRATION = Object.freeze({
  enabled: false,
  api_token: '',
  has_api_token: false,
  newbies_list_id: '',
  big_team_list_id: '',
  newbies_chat_id: '',
  big_team_chat_id: '',
  done_status: 'complete',
  last_check_status: '',
  last_checked_at: '',
  last_check_error: ''
});

function cleanString(value = '') {
  return String(value || '').trim();
}

function cleanChatId(value = '') {
  return cleanString(value).replace(/\s+/g, '');
}

function normalizeClickUpIntegration(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const token = cleanString(source.api_token || source.apiToken || source.token);
  return {
    enabled: source.enabled === true,
    api_token: token,
    has_api_token: Boolean(token || source.has_api_token || source.hasApiToken),
    newbies_list_id: cleanString(source.newbies_list_id || source.newbiesListId),
    big_team_list_id: cleanString(source.big_team_list_id || source.bigTeamListId),
    newbies_chat_id: cleanChatId(source.newbies_chat_id || source.newbiesChatId),
    big_team_chat_id: cleanChatId(source.big_team_chat_id || source.bigTeamChatId),
    done_status: cleanString(source.done_status || source.doneStatus || DEFAULT_CLICKUP_INTEGRATION.done_status) || DEFAULT_CLICKUP_INTEGRATION.done_status,
    last_check_status: cleanString(source.last_check_status || source.lastCheckStatus || source.connection_status || source.connectionStatus),
    last_checked_at: cleanString(source.last_checked_at || source.lastCheckedAt),
    last_check_error: cleanString(source.last_check_error || source.lastCheckError)
  };
}

function hasUsableApiToken(value = {}) {
  const token = cleanString(value.api_token || value.apiToken || value.token);
  return Boolean(token && !SECRET_PLACEHOLDER_RE.test(token));
}

function mergeClickUpIntegration(previous = {}, next = {}) {
  const oldConfig = normalizeClickUpIntegration(previous);
  const incoming = normalizeClickUpIntegration(next);
  if (next && (next.clear_token || next.clearToken || next.disconnect)) {
    incoming.api_token = '';
    incoming.has_api_token = false;
    return incoming;
  }
  if (!hasUsableApiToken(next)) incoming.api_token = oldConfig.api_token;
  incoming.has_api_token = Boolean(incoming.api_token);
  return incoming;
}

function sanitizeClickUpIntegration(value = {}) {
  const config = normalizeClickUpIntegration(value);
  return {
    ...config,
    api_token: '',
    has_api_token: Boolean(config.api_token || config.has_api_token)
  };
}

function isClickUpIntegrationConfigured(value = {}) {
  const config = normalizeClickUpIntegration(value);
  return Boolean(config.enabled && config.api_token && config.newbies_list_id && config.big_team_list_id);
}

function isClickUpIntegrationReady(value = {}) {
  const config = normalizeClickUpIntegration(value);
  return Boolean(isClickUpIntegrationConfigured(config) && config.last_check_status === 'ok');
}

function clickUpIntegrationSignature(value = {}) {
  const config = normalizeClickUpIntegration(value);
  return [
    config.enabled,
    config.newbies_list_id,
    config.big_team_list_id,
    config.newbies_chat_id,
    config.big_team_chat_id,
    config.done_status
  ].join('|');
}

function assertConfigured(config = {}) {
  if (!config.api_token) throw new Error('ClickUp API token kiritilmagan');
  if (!config.newbies_list_id) throw new Error('Newbies List ID kiritilmagan');
  if (!config.big_team_list_id) throw new Error('Big team List ID kiritilmagan');
}

function clickUpErrorMessage(payload = {}, status = 0) {
  return cleanString(payload.err || payload.error || payload.message)
    || (Array.isArray(payload.errors) ? cleanString(payload.errors.map(item => item.message || item).join(', ')) : '')
    || `ClickUp HTTP ${status}`;
}

async function clickUpRequest(config, path, { method = 'GET', body, query } = {}) {
  const token = normalizeClickUpIntegration(config).api_token;
  if (!token) throw new Error('ClickUp API token kiritilmagan');

  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const endpoint = `${CLICKUP_API_BASE}${path}${params.toString() ? `?${params.toString()}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clickUpErrorMessage(payload, response.status));
    return payload;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('ClickUp so‘rovi vaqti tugadi');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function testClickUpIntegration(value = {}) {
  const config = normalizeClickUpIntegration(value);
  if (!config.enabled) return { ok: false, status: 'disabled', message: 'ClickUp integratsiya o‘chiq' };
  assertConfigured(config);
  await Promise.all([
    clickUpRequest(config, `/list/${encodeURIComponent(config.newbies_list_id)}`),
    clickUpRequest(config, `/list/${encodeURIComponent(config.big_team_list_id)}`)
  ]);
  return { ok: true, status: 'ok' };
}

async function createClickUpTask(config, task = {}) {
  const normalized = normalizeClickUpIntegration(config);
  const listId = cleanString(task.list_id || task.listId);
  if (!listId) throw new Error('ClickUp List ID topilmadi');
  const assignees = Array.isArray(task.assignees)
    ? task.assignees.map(value => Number(value)).filter(Number.isFinite)
    : [];
  return clickUpRequest(normalized, `/list/${encodeURIComponent(listId)}/task`, {
    method: 'POST',
    body: {
      name: cleanString(task.name || task.title).slice(0, 240) || 'Telegram vazifasi',
      markdown_content: cleanString(task.markdown_content || task.description),
      assignees,
      notify_all: true
    }
  });
}

async function updateClickUpTaskStatus(config, taskId, status) {
  const cleanTaskId = cleanString(taskId);
  if (!cleanTaskId) throw new Error('ClickUp Task ID topilmadi');
  const cleanStatus = cleanString(status || normalizeClickUpIntegration(config).done_status);
  if (!cleanStatus) throw new Error('ClickUp status kiritilmagan');
  return clickUpRequest(config, `/task/${encodeURIComponent(cleanTaskId)}`, {
    method: 'PUT',
    body: { status: cleanStatus }
  });
}

async function getClickUpTask(config, taskId) {
  const cleanTaskId = cleanString(taskId);
  if (!cleanTaskId) throw new Error('ClickUp Task ID topilmadi');
  return clickUpRequest(config, `/task/${encodeURIComponent(cleanTaskId)}`, {
    query: { include_markdown_description: 'true' }
  });
}

async function attachClickUpTaskFile(config, taskId, file = {}) {
  const token = normalizeClickUpIntegration(config).api_token;
  const cleanTaskId = cleanString(taskId);
  if (!token) throw new Error('ClickUp API token kiritilmagan');
  if (!cleanTaskId) throw new Error('ClickUp Task ID topilmadi');
  if (!file.buffer) throw new Error('Attachment fayl ma’lumoti topilmadi');

  const form = new FormData();
  const filename = cleanString(file.filename || file.file_name || 'telegram-file');
  const mimeType = cleanString(file.mime_type || file.type || 'application/octet-stream');
  form.append('attachment', new Blob([file.buffer], { type: mimeType }), filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(cleanTaskId)}/attachment`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: token },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clickUpErrorMessage(payload, response.status));
    return payload;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('ClickUp attachment upload vaqti tugadi');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_CLICKUP_INTEGRATION,
  normalizeClickUpIntegration,
  mergeClickUpIntegration,
  sanitizeClickUpIntegration,
  isClickUpIntegrationConfigured,
  isClickUpIntegrationReady,
  clickUpIntegrationSignature,
  testClickUpIntegration,
  createClickUpTask,
  updateClickUpTaskStatus,
  getClickUpTask,
  attachClickUpTaskFile
};
