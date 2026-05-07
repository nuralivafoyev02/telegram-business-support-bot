const TOKEN_KEY = 'bsb_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function safeQuery(query = {}) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function logApiError(action, error, meta = {}) {
  console.error('[webapp:api:error]', {
    action,
    ...meta,
    error: error && error.message ? error.message : String(error || 'Unknown error')
  });
}

async function request(action, { method = 'GET', body, query = {} } = {}) {
  const params = new URLSearchParams({ action, ...query });
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api/admin?${params.toString()}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    logApiError(action, error, { method, query: safeQuery(query), stage: 'network' });
    throw error;
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    logApiError(action, error, { method, query: safeQuery(query), status: response.status, stage: 'parse' });
    throw new Error('Server javobi noto‘g‘ri formatda');
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'Server xatosi');
    logApiError(action, error, { method, query: safeQuery(query), status: response.status, stage: 'response' });
    throw error;
  }
  return data;
}

async function requestBlob(action, { query = {} } = {}) {
  const params = new URLSearchParams({ action, ...query });
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api/admin?${params.toString()}`, { headers });
  } catch (error) {
    logApiError(action, error, { method: 'GET', query: safeQuery(query), stage: 'network' });
    throw error;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Fayl yuklanmadi');
    logApiError(action, error, { method: 'GET', query: safeQuery(query), status: response.status, stage: 'response' });
    throw error;
  }
  return response.blob();
}

function telegramFileQuery(mediaOrFileId) {
  if (typeof mediaOrFileId === 'string') return { file_id: mediaOrFileId };
  const media = mediaOrFileId || {};
  return safeQuery({
    file_id: media.file_id,
    mime_type: media.mime_type,
    file_name: media.file_name
  });
}

export const api = {
  async login(username, password) {
    const data = await request('login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    return data;
  },
  dashboard: (query = {}) => request('dashboard', { query }).then(r => r.data),
  groups: () => request('groups', { query: { limit: 500 } }).then(r => r.data),
  privates: () => request('privates', { query: { limit: 500 } }).then(r => r.data),
  companies: () => request('companies', { query: { limit: 500 } }).then(r => r.data),
  companyInfo: (query = {}) => request('companyInfo', { query }).then(r => r.data),
  employees: () => request('employees').then(r => r.data),
  employeeActivity: query => request('employeeActivity', { query }).then(r => r.data),
  requests: query => request('requests', { query }).then(r => r.data),
  chatDetail: query => request('chatDetail', { query }).then(r => r.data),
  companyGroupActivity: query => request('companyGroupActivity', { query }).then(r => r.data),
  telegramFile: mediaOrFileId => requestBlob('telegramFile', { query: telegramFileQuery(mediaOrFileId) }),
  telegramProfilePhoto: tgUserId => requestBlob('telegramProfilePhoto', { query: { tg_user_id: tgUserId } }),
  settings: () => request('settings').then(r => r.data),
  sendMessage: payload => request('sendMessage', { method: 'POST', body: payload }).then(r => r.data),
  replyRequest: payload => request('replyRequest', { method: 'POST', body: payload }).then(r => r.data),
  broadcast: payload => request('broadcast', { method: 'POST', body: payload }).then(r => r.data),
  saveEmployee: payload => request('employee', { method: 'POST', body: payload }).then(r => r.data),
  deleteGroup: payload => request('deleteGroup', { method: 'POST', body: payload }).then(r => r.data),
  sendEmployeeMessage: payload => request('sendEmployeeMessage', { method: 'POST', body: payload }).then(r => r.data),
  sendEmployeesMessage: payload => request('sendEmployeesMessage', { method: 'POST', body: payload }).then(r => r.data),
  assignChatCompany: payload => request('assignChatCompany', { method: 'POST', body: payload }).then(r => r.data),
  saveSettings: payload => request('settings', { method: 'POST', body: payload }).then(r => r.data),
  extractAiKnowledge: payload => request('aiKnowledgeExtract', { method: 'POST', body: payload }).then(r => r.data),
  saveAdminProfile: payload => request('adminProfile', { method: 'POST', body: payload }).then(r => r.data),
  sendMainStats: payload => request('sendMainStats', { method: 'POST', body: payload || {} }).then(r => r.data),
  testLogNotification: payload => request('testLogNotification', { method: 'POST', body: payload || {} }).then(r => r.data),
  telegramWebhookInfo: () => request('telegramWebhookInfo').then(r => r.data),
  setTelegramWebhook: payload => request('setTelegramWebhook', { method: 'POST', body: payload || {} }).then(r => r.data),
  syncTelegramUpdates: payload => request('syncTelegramUpdates', { method: 'POST', body: payload || {} }).then(r => r.data)
};
