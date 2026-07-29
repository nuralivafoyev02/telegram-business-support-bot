'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');

const DEFAULT_PERMISSION_VIEW_HOST = 'https://backend.app.uyqur.uz';
const DEFAULT_PERMISSION_VIEW_PATH = 'dev/company/permission-view-for-bot';
const PERMISSION_VIEW_SETTINGS_KEY = 'uyqur_permission_view_selection';
const PERMISSION_VIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const PERMISSION_NOTIFICATIONS_KEY = 'uyqur_permission_notifications';
const MAX_NOTIFICATION_EVENTS = 200;
const MANAGER_CONFIRMERS_KEY = 'uyqur_manager_confirmers';

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
    progress: value.progress && typeof value.progress === 'object' ? value.progress : {}
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

async function removePermissionToggleEvents(removedKeys = []) {
  if (!removedKeys.length) return;
  const removedSet = new Set(removedKeys.map(String));
  const record = await getNotificationRecord();
  const removedEventIds = record.events
    .filter(event => removedSet.has(String(event.submodule_key)))
    .map(event => event.id);
  if (!removedEventIds.length) return;
  const remainingEvents = record.events.filter(event => !removedSet.has(String(event.submodule_key)));
  const nextProgress = { ...record.progress };
  removedEventIds.forEach(eventId => { delete nextProgress[eventId]; });
  await saveNotificationRecord({ events: remainingEvents, progress: nextProgress });
}

async function resetPermissionNotifications() {
  await saveNotificationRecord({ events: [], progress: {} });
  return { ok: true };
}

async function savePermissionSelection(selected = []) {
  const normalized = Array.from(new Set((Array.isArray(selected) ? selected : []).map(String).filter(Boolean)));
  const current = await getPermissionViewRecord();
  const previousSelected = Array.isArray(current.selected) ? current.selected.map(String) : [];
  const addedKeys = normalized.filter(key => !previousSelected.includes(key));
  const removedKeys = previousSelected.filter(key => !normalized.includes(key));
  const next = await savePermissionViewRecord({ selected: normalized });
  if (addedKeys.length) await recordPermissionToggleEvents(addedKeys, Array.isArray(current.modules) ? current.modules : []);
  if (removedKeys.length) await removePermissionToggleEvents(removedKeys);
  return { selected: next.selected };
}

async function getSupportEmployees() {
  return supabase.select('employees', {
    select: 'id,username,full_name,role,is_active',
    role: supabase.eq('support'),
    is_active: supabase.eq(true),
    limit: '200'
  }).catch(() => []);
}

async function getManagerEmployees() {
  return supabase.select('employees', {
    select: 'id,username,full_name,role,is_active',
    role: supabase.eq('manager'),
    is_active: supabase.eq(true),
    limit: '200'
  }).catch(() => []);
}

function progressFor(record, eventId, employeeId) {
  const eventProgress = record.progress[eventId];
  return (eventProgress && eventProgress[employeeId]) || {};
}

async function getSupportOverview() {
  const [employees, record] = await Promise.all([getSupportEmployees(), getNotificationRecord()]);
  const total = record.events.length;
  return employees.map(employee => {
    const confirmedCount = record.events.filter(event => progressFor(record, event.id, employee.id).confirmed_at).length;
    const pending = total - confirmedCount;
    const percent = total ? Math.round((confirmedCount / total) * 100) : 0;
    return {
      id: employee.id,
      full_name: employee.full_name || employee.username || 'Support',
      username: employee.username || '',
      unread: pending,
      confirmed: confirmedCount,
      percent
    };
  });
}

async function listNotificationEvents() {
  const record = await getNotificationRecord();
  return record.events.slice().reverse();
}

async function getEventLearningStatus(eventId) {
  const [employees, record] = await Promise.all([getSupportEmployees(), getNotificationRecord()]);
  const events = record.events.slice().reverse();
  const targetEvent = eventId ? events.find(event => String(event.id) === String(eventId)) : events[0];
  if (!targetEvent) return { event: null, rows: [] };
  const rows = employees.map(employee => {
    const progress = progressFor(record, targetEvent.id, employee.id);
    return {
      employee_id: employee.id,
      full_name: employee.full_name || employee.username || 'Support',
      username: employee.username || '',
      learned: Boolean(progress.learned_at),
      learned_at: progress.learned_at || null,
      confirmed: Boolean(progress.confirmed_at)
    };
  });
  return { event: targetEvent, rows };
}

async function setEventLearned(eventId, employeeId, learned = true) {
  if (!eventId || !employeeId) throw new Error('event_id va employee_id majburiy');
  const record = await getNotificationRecord();
  if (!record.progress[eventId]) record.progress[eventId] = {};
  const current = record.progress[eventId][employeeId] || {};
  record.progress[eventId][employeeId] = {
    ...current,
    learned_at: learned ? new Date().toISOString() : null,
    confirmed_at: learned ? current.confirmed_at || null : null,
    confirmed_by: learned ? current.confirmed_by || null : null
  };
  await saveNotificationRecord(record);
  return record.progress[eventId][employeeId];
}

async function getSupportEventHistory(employeeId) {
  if (!employeeId) return [];
  const record = await getNotificationRecord();
  return record.events.slice().reverse().map(event => {
    const progress = progressFor(record, event.id, employeeId);
    return {
      event_id: event.id,
      module_name: event.module_name,
      submodule_name: event.submodule_name,
      submodule_key: event.submodule_key,
      created_at: event.created_at,
      learned: Boolean(progress.learned_at),
      learned_at: progress.learned_at || null,
      confirmed: Boolean(progress.confirmed_at),
      confirmed_at: progress.confirmed_at || null
    };
  });
}

async function getManagerReviewQueue() {
  const [supports, record] = await Promise.all([getSupportEmployees(), getNotificationRecord()]);
  const supportById = new Map(supports.map(employee => [String(employee.id), employee]));
  const rows = [];
  record.events.forEach(event => {
    const eventProgress = record.progress[event.id] || {};
    Object.entries(eventProgress).forEach(([employeeId, progress]) => {
      if (!progress.learned_at) return;
      const employee = supportById.get(String(employeeId));
      if (!employee) return;
      rows.push({
        event_id: event.id,
        submodule_name: event.submodule_name,
        module_name: event.module_name,
        employee_id: employeeId,
        full_name: employee.full_name || employee.username || 'Support',
        username: employee.username || '',
        learned_at: progress.learned_at,
        confirmed: Boolean(progress.confirmed_at),
        confirmed_at: progress.confirmed_at || null
      });
    });
  });
  return rows.sort((a, b) => String(b.learned_at).localeCompare(String(a.learned_at)));
}

async function getManagerConfirmerRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(MANAGER_CONFIRMERS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  return { usernames: Array.isArray(value.usernames) ? value.usernames.map(String) : [] };
}

async function getManagerConfirmers() {
  return getManagerConfirmerRecord();
}

async function saveManagerConfirmers(usernames = []) {
  const normalized = Array.from(new Set((Array.isArray(usernames) ? usernames : []).map(String).filter(Boolean)));
  await supabase.insert('bot_settings', [{
    key: MANAGER_CONFIRMERS_KEY,
    value: { usernames: normalized },
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return { usernames: normalized };
}

async function setManagerConfirmation(eventId, employeeId, confirmed = true, managerName = '') {
  if (!eventId || !employeeId) throw new Error('event_id va employee_id majburiy');
  // "Menejerlar" bo'limi parol bilan himoyalangani uchun, tasdiqlashni kim
  // bosgani bo'yicha qo'shimcha cheklov qo'llanmaydi — cheklovsiz.
  const record = await getNotificationRecord();
  if (!record.progress[eventId]) record.progress[eventId] = {};
  const current = record.progress[eventId][employeeId] || {};
  record.progress[eventId][employeeId] = {
    ...current,
    confirmed_at: confirmed ? new Date().toISOString() : null,
    confirmed_by: confirmed ? (managerName || null) : null
  };
  await saveNotificationRecord(record);
  return record.progress[eventId][employeeId];
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
  getSupportOverview,
  getSupportEventHistory,
  listNotificationEvents,
  getEventLearningStatus,
  setEventLearned,
  getManagerReviewQueue,
  setManagerConfirmation,
  getManagerConfirmers,
  saveManagerConfirmers,
  getManagerEmployees,
  resetPermissionNotifications
};
