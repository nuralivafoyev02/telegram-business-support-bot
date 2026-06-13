'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { optionalEnv } = require('./env');

const DEFAULT_TENANT_ID = 1;

const TENANT_SCOPED_TABLES = new Set([
  'admins',
  'bot_settings',
  'tg_users',
  'companies',
  'tg_chats',
  'business_connections',
  'employees',
  'company_members',
  'messages',
  'support_requests',
  'request_events',
  'broadcasts',
  'broadcast_targets',
  'ticket_notifications',
  'clickup_tasks',
  'company_module_daily_reports',
  'company_module_sync_runs'
]);

const tenantStorage = new AsyncLocalStorage();

function normalizeTenantId(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  const fromEnv = Number(optionalEnv('DEFAULT_TENANT_ID', String(DEFAULT_TENANT_ID)));
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TENANT_ID;
}

function getCurrentTenantId() {
  const store = tenantStorage.getStore();
  if (store && store.tenantId) return normalizeTenantId(store.tenantId);
  return null;
}

function runWithTenant(tenantId, fn) {
  return tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, fn);
}

function resolveTenantFromQuery(query = {}) {
  const raw = query.tenant ?? query.tenant_id ?? query.tenantId ?? '';
  if (raw === '' || raw === undefined || raw === null) {
    return normalizeTenantId(optionalEnv('DEFAULT_TENANT_ID', String(DEFAULT_TENANT_ID)));
  }
  return normalizeTenantId(raw);
}

function shouldAttachTenantQuery(tenantId) {
  return normalizeTenantId(tenantId) !== DEFAULT_TENANT_ID;
}

function isTenantScopedTable(table) {
  return TENANT_SCOPED_TABLES.has(String(table || '').trim());
}

function tenantEq(tenantId) {
  return `eq.${String(tenantId)}`;
}

function scopeQuery(table, query = {}) {
  if (!isTenantScopedTable(table)) return query;
  const tenantId = getCurrentTenantId();
  if (!tenantId || query.tenant_id !== undefined) return query;
  return { ...query, tenant_id: tenantEq(tenantId) };
}

function scopeRows(table, rows = []) {
  if (!Array.isArray(rows) || !rows.length || !isTenantScopedTable(table)) return rows;
  const tenantId = getCurrentTenantId();
  if (!tenantId) return rows;
  return rows.map(row => (row && row.tenant_id !== undefined ? row : { ...row, tenant_id: tenantId }));
}

// PK/unique constraint tenant_id bilan o'zgarmagan jadvallar.
const GLOBAL_CONFLICT_TABLES = new Set(['tg_users']);

function tenantOnConflict(table, onConflict) {
  if (!isTenantScopedTable(table) || !onConflict) return onConflict;
  const conflict = String(onConflict);
  if (conflict.includes('tenant_id')) return conflict;
  if (GLOBAL_CONFLICT_TABLES.has(table)) return conflict;
  return `tenant_id,${conflict}`;
}

module.exports = {
  DEFAULT_TENANT_ID,
  TENANT_SCOPED_TABLES,
  normalizeTenantId,
  getCurrentTenantId,
  runWithTenant,
  resolveTenantFromQuery,
  shouldAttachTenantQuery,
  isTenantScopedTable,
  tenantEq,
  scopeQuery,
  scopeRows,
  tenantOnConflict
};
