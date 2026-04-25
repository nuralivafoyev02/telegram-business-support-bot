const TOKEN_KEY = 'bsb_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(action, { method = 'GET', body, query = {} } = {}) {
  const params = new URLSearchParams({ action, ...query });
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api/admin?${params.toString()}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Server xatosi');
  return data;
}

export const api = {
  async login(username, password) {
    const data = await request('login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    return data;
  },
  dashboard: () => request('dashboard').then(r => r.data),
  groups: () => request('groups').then(r => r.data),
  privates: () => request('privates').then(r => r.data),
  employees: () => request('employees').then(r => r.data),
  requests: query => request('requests', { query }).then(r => r.data),
  settings: () => request('settings').then(r => r.data),
  sendMessage: payload => request('sendMessage', { method: 'POST', body: payload }).then(r => r.data),
  broadcast: payload => request('broadcast', { method: 'POST', body: payload }).then(r => r.data),
  saveEmployee: payload => request('employee', { method: 'POST', body: payload }).then(r => r.data),
  deleteGroup: payload => request('deleteGroup', { method: 'POST', body: payload }).then(r => r.data),
  sendEmployeeMessage: payload => request('sendEmployeeMessage', { method: 'POST', body: payload }).then(r => r.data),
  sendEmployeesMessage: payload => request('sendEmployeesMessage', { method: 'POST', body: payload }).then(r => r.data),
  saveSettings: payload => request('settings', { method: 'POST', body: payload }).then(r => r.data),
  saveAdminProfile: payload => request('adminProfile', { method: 'POST', body: payload }).then(r => r.data),
  sendMainStats: payload => request('sendMainStats', { method: 'POST', body: payload || {} }).then(r => r.data),
  telegramWebhookInfo: () => request('telegramWebhookInfo').then(r => r.data),
  setTelegramWebhook: payload => request('setTelegramWebhook', { method: 'POST', body: payload || {} }).then(r => r.data)
};
