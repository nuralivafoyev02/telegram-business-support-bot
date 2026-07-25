'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');

const DEFAULT_PERMISSION_VIEW_HOST = 'https://backend.app.uyqur.uz';
const DEFAULT_PERMISSION_VIEW_PATH = 'dev/company/permission-view-for-bot';
const PERMISSION_VIEW_SETTINGS_KEY = 'uyqur_permission_view_selection';
const PERMISSION_VIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const PERMISSION_NOTIFICATIONS_KEY = 'uyqur_permission_notifications';
const MAX_NOTIFICATION_EVENTS = 200;

function permissionViewUrl() {
  const configured = optionalEnv('FUNCSIYALAR', DEFAULT_PERMISSION_VIEW_PATH).trim();
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${DEFAULT_PERMISSION_VIEW_HOST}/${configured.replace(/^\/+/, '')}`;
}

function permissionViewAuth() {
  return optionalEnv('UYQUR_COMPANY_INFO_AUTH', '');
}

function localizedName(value = {}) {
  if (typeof value === 'string') return value;
  const source = value && typeof value === 'object' ? value : {};
  return source.uz || source.ru || source.en || source.kr || '';
}

function normalizeAction(row = {}) {
  return {
    id: row.id,
    key: row.key || '',
    name: localizedName(row.name),
    path: row.path || ''
  };
}

function normalizeSubmodule(row = {}) {
  return {
    id: row.id,
    key: row.key || String(row.id ?? ''),
    name: localizedName(row.name),
    actions: Array.isArray(row.actions) ? row.actions.map(normalizeAction) : []
  };
}

function normalizeModule(row = {}) {
  return {
    id: row.id,
    key: row.key || String(row.id ?? ''),
    name: localizedName(row.name),
    submodules: Array.isArray(row.submodules) ? row.submodules.map(normalizeSubmodule) : []
  };
}

async function fetchPermissionView() {
  const auth = permissionViewAuth();
  if (!auth) throw new Error('UYQUR_COMPANY_INFO_AUTH env sozlanmagan');
  const response = await fetch(permissionViewUrl(), { headers: { 'X-Auth': auth } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.message ? JSON.stringify(payload.message) : response.statusText || `HTTP ${response.status}`;
    throw new Error(`Uyqur permission-view API: ${message}`);
  }
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows.map(normalizeModule);
}

async function getPermissionViewRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_VIEW_SETTINGS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  return row && row.value && typeof row.value === 'object' ? row.value : {};
}

async function savePermissionViewRecord(patch = {}) {
  const current = await getPermissionViewRecord();
  const next = { ...current, ...patch };
  await supabase.insert('bot_settings', [{
    key: PERMISSION_VIEW_SETTINGS_KEY,
    value: next,
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return next;
}

function findSubmoduleMeta(modules = [], key = '') {
  for (const module of modules) {
    const submodule = (module.submodules || []).find(sub => String(sub.key) === String(key));
    if (submodule) return { module_name: module.name, submodule_name: submodule.name };
  }
  return null;
}

async function getNotificationRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_NOTIFICATIONS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  return {
    events: Array.isArray(value.events) ? value.events : [],
    reads: value.reads && typeof value.reads === 'object' ? value.reads : {}
  };
}

async function saveNotificationRecord(record) {
  await supabase.insert('bot_settings', [{
    key: PERMISSION_NOTIFICATIONS_KEY,
    value: record,
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return record;
}

async function recordPermissionToggleEvents(addedKeys = [], modules = []) {
  if (!addedKeys.length) return;
  const record = await getNotificationRecord();
  const now = new Date().toISOString();
  const newEvents = addedKeys.map(key => {
    const meta = findSubmoduleMeta(modules, key);
    return {
      id: `${Date.now()}-${key}`,
      submodule_key: key,
      submodule_name: meta ? meta.submodule_name : key,
      module_name: meta ? meta.module_name : '',
      created_at: now
    };
  });
  record.events = [...record.events, ...newEvents].slice(-MAX_NOTIFICATION_EVENTS);
  await saveNotificationRecord(record);
}

async function savePermissionSelection(selected = []) {
  const normalized = Array.from(new Set((Array.isArray(selected) ? selected : []).map(String).filter(Boolean)));
  const current = await getPermissionViewRecord();
  const previousSelected = Array.isArray(current.selected) ? current.selected.map(String) : [];
  const addedKeys = normalized.filter(key => !previousSelected.includes(key));
  const next = await savePermissionViewRecord({ selected: normalized });
  if (addedKeys.length) await recordPermissionToggleEvents(addedKeys, Array.isArray(current.modules) ? current.modules : []);
  return { selected: next.selected };
}

async function getSupportNotifications() {
  const [employees, record] = await Promise.all([
    supabase.select('employees', {
      select: 'id,username,full_name,role,is_active',
      role: supabase.eq('support'),
      is_active: supabase.eq(true),
      limit: '200'
    }).catch(() => []),
    getNotificationRecord()
  ]);
  const totalEvents = record.events.length;
  return employees.map(employee => {
    const lastRead = record.reads[String(employee.id)] || null;
    const unread = lastRead ? record.events.filter(event => event.created_at > lastRead).length : totalEvents;
    const read = totalEvents - unread;
    const percent = totalEvents ? Math.round((read / totalEvents) * 100) : 0;
    return {
      id: employee.id,
      full_name: employee.full_name || employee.username || 'Support',
      username: employee.username || '',
      unread,
      percent
    };
  });
}

async function markSupportNotificationsRead(employeeId) {
  const record = await getNotificationRecord();
  record.reads[String(employeeId)] = new Date().toISOString();
  await saveNotificationRecord(record);
  return { ok: true };
}

async function getPermissionView() {
  const record = await getPermissionViewRecord();
  const selected = Array.isArray(record.selected) ? record.selected.map(String) : [];
  const cachedAt = record.modules_cached_at ? new Date(record.modules_cached_at).getTime() : 0;
  const cacheFresh = Array.isArray(record.modules) && record.modules.length
    && cachedAt && (Date.now() - cachedAt <= PERMISSION_VIEW_CACHE_TTL_MS);
  if (cacheFresh) return { modules: record.modules, selected, from_cache: true };

  try {
    const modules = await fetchPermissionView();
    await savePermissionViewRecord({ modules, modules_cached_at: new Date().toISOString() });
    return { modules, selected, from_cache: false };
  } catch (error) {
    if (Array.isArray(record.modules) && record.modules.length) {
      return { modules: record.modules, selected, from_cache: true, stale: true, error: error.message };
    }
    throw error;
  }
}

module.exports = {
  fetchPermissionView,
  getPermissionView,
  savePermissionSelection,
  getSupportNotifications,
  markSupportNotificationsRead
};
