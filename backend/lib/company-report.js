'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');
const { getCurrentTenantId, normalizeTenantId, DEFAULT_TENANT_ID } = require('./tenant');

const DEFAULT_COMPANY_REPORT_URL = 'https://backend.app.uyqur.uz/dev/company/info-report-for-bot';
const COMPANY_REPORT_CACHE_KEY = 'uyqur_company_report_cache';
const COMPANY_REPORT_HISTORY_KEY = 'uyqur_company_report_history';
const COMPANY_REPORT_CACHE_SCHEMA_VERSION = 1;
const COMPANY_REPORT_HISTORY_SCHEMA_VERSION = 1;
const REPORT_HISTORY_MAX_DAYS = 365;
const MODULE_KEYS = Object.freeze(['taminot', 'kassa', 'omborxona', 'qurilish_jarayoni', 'monitoring']);
const ACTIVITY_KEY_MAP = Object.freeze({
  supply: 'taminot',
  cashier: 'kassa',
  warehouse: 'omborxona',
  construction: 'qurilish_jarayoni',
  monitoring: 'monitoring'
});

function resolveTenantId(tenantId) {
  return normalizeTenantId(tenantId ?? getCurrentTenantId() ?? DEFAULT_TENANT_ID);
}

function tenantEnvSuffix(tenantId) {
  const id = resolveTenantId(tenantId);
  return id === DEFAULT_TENANT_ID ? '' : `_TENANT_${id}`;
}

function companyReportUrl(tenantId) {
  const id = resolveTenantId(tenantId);
  const suffix = tenantEnvSuffix(id);
  const tenantUrl = suffix ? optionalEnv(`UYQUR_COMPANY_REPORT_URL${suffix}`, '') : '';
  if (tenantUrl) return tenantUrl;
  if (id === DEFAULT_TENANT_ID) {
    return optionalEnv('UYQUR_COMPANY_REPORT_URL', DEFAULT_COMPANY_REPORT_URL);
  }
  return DEFAULT_COMPANY_REPORT_URL;
}

function companyReportAuth(tenantId) {
  const id = resolveTenantId(tenantId);
  const suffix = tenantEnvSuffix(id);
  const tenantAuth = suffix ? optionalEnv(`UYQUR_COMPANY_INFO_AUTH${suffix}`, '') : '';
  if (tenantAuth) return tenantAuth;
  if (id === DEFAULT_TENANT_ID) return optionalEnv('UYQUR_COMPANY_INFO_AUTH', '');
  return '';
}

function assertTenantCompanyReportAuth(tenantId) {
  const auth = companyReportAuth(resolveTenantId(tenantId));
  if (auth) return auth;
  throw new Error('UYQUR_COMPANY_INFO_AUTH env sozlanmagan');
}

function tashkentDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(value));
}

function shiftDateKey(dateKey = '', days = 0) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return tashkentDateKey(Date.now() + days * 86_400_000);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractReportRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  const rows = asArray(payload.companies)
    .concat(asArray(payload.reports))
    .concat(asArray(objectValue(payload.data).companies))
    .concat(asArray(objectValue(payload.data).reports))
    .concat(asArray(objectValue(payload.result).data));
  if (rows.length) return rows;
  return [];
}

function normalizeActivityModule(activity = {}, sourceKey = '') {
  const source = objectValue(activity[sourceKey]);
  return {
    active: Boolean(source.active),
    last_date: source.last_date ? String(source.last_date) : null
  };
}

function normalizeReportCompany(row = {}, reportDate = tashkentDateKey()) {
  const source = objectValue(row);
  const activity = objectValue(objectValue(source.data).activity);
  const module_usage = {};
  const module_last_dates = {};
  Object.entries(ACTIVITY_KEY_MAP).forEach(([sourceKey, targetKey]) => {
    const module = normalizeActivityModule(activity, sourceKey);
    module_usage[targetKey] = module.active;
    module_last_dates[targetKey] = module.last_date;
  });
  const module_active_count = MODULE_KEYS.reduce((sum, key) => sum + (module_usage[key] ? 1 : 0), 0);
  const companyId = Number(source.id || source.company_id || 0);
  return {
    company_id: Number.isFinite(companyId) && companyId > 0 ? companyId : null,
    company_name: source.name || source.company_name || '',
    report_date: reportDate,
    module_usage,
    module_last_dates,
    module_active_count,
    raw: source
  };
}

function reportSnapshot(result = {}) {
  const fetchedAt = result.fetched_at || new Date().toISOString();
  return {
    tenant_id: resolveTenantId(result.tenant_id),
    cache_schema_version: COMPANY_REPORT_CACHE_SCHEMA_VERSION,
    report_date: result.report_date || tashkentDateKey(),
    companies: Array.isArray(result.companies) ? result.companies : [],
    summary: result.summary || buildReportSummary(result.companies || []),
    fetched_at: fetchedAt,
    cached_at: new Date().toISOString(),
    source: result.source || ''
  };
}

function buildReportSummary(companies = []) {
  return {
    total: companies.length,
    active_modules: companies.reduce((sum, row) => sum + Number(row.module_active_count || 0), 0),
    taminot: companies.filter(row => row.module_usage?.taminot).length,
    kassa: companies.filter(row => row.module_usage?.kassa).length,
    omborxona: companies.filter(row => row.module_usage?.omborxona).length,
    qurilish_jarayoni: companies.filter(row => row.module_usage?.qurilish_jarayoni).length,
    monitoring: companies.filter(row => row.module_usage?.monitoring).length
  };
}

function emptyReportHistory(tenantId) {
  return {
    tenant_id: resolveTenantId(tenantId),
    cache_schema_version: COMPANY_REPORT_HISTORY_SCHEMA_VERSION,
    days: {},
    dates: [],
    updated_at: null
  };
}

function pruneReportHistory(history = {}, maxDays = REPORT_HISTORY_MAX_DAYS) {
  const days = objectValue(history.days);
  const dates = [...new Set((Array.isArray(history.dates) ? history.dates : Object.keys(days)).filter(Boolean))]
    .sort((a, b) => String(b).localeCompare(String(a)));
  const keptDates = dates.slice(0, maxDays);
  const nextDays = Object.fromEntries(
    keptDates.map(date => [date, days[date]]).filter(([, value]) => value && typeof value === 'object')
  );
  return {
    ...history,
    days: nextDays,
    dates: keptDates.sort((a, b) => String(a).localeCompare(String(b)))
  };
}

async function getReportHistory(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const rows = await supabase.select('bot_settings', {
    select: 'key,value,updated_at',
    key: supabase.eq(COMPANY_REPORT_HISTORY_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row?.value || typeof row.value !== 'object') return emptyReportHistory(tenantId);
  const history = pruneReportHistory({
    ...row.value,
    tenant_id: resolveTenantId(row.value.tenant_id),
    updated_at: row.value.updated_at || row.updated_at || null
  });
  if (history.tenant_id !== tenantId && tenantId !== DEFAULT_TENANT_ID) return emptyReportHistory(tenantId);
  return history;
}

async function saveReportHistoryDay(result = {}) {
  const tenantId = resolveTenantId(result.tenant_id);
  const reportDate = result.report_date || tashkentDateKey();
  const history = pruneReportHistory(await getReportHistory({ tenantId }));
  history.days[reportDate] = {
    report_date: reportDate,
    fetched_at: result.fetched_at || new Date().toISOString(),
    source: result.source || '',
    companies: Array.isArray(result.companies) ? result.companies : [],
    summary: result.summary || buildReportSummary(result.companies || [])
  };
  history.dates = [...new Set([...(history.dates || []), reportDate])].sort((a, b) => String(a).localeCompare(String(b)));
  history.updated_at = new Date().toISOString();
  const snapshot = pruneReportHistory(history);
  await supabase.insert('bot_settings', [{
    key: COMPANY_REPORT_HISTORY_KEY,
    value: snapshot,
    updated_at: snapshot.updated_at
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return snapshot;
}

async function saveCompanyReportSnapshot(result = {}) {
  const snapshot = reportSnapshot(result);
  await supabase.insert('bot_settings', [{
    key: COMPANY_REPORT_CACHE_KEY,
    value: snapshot,
    updated_at: snapshot.cached_at
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return snapshot;
}

async function getCachedCompanyReport(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const rows = await supabase.select('bot_settings', {
    select: 'key,value,updated_at',
    key: supabase.eq(COMPANY_REPORT_CACHE_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  if (!row?.value || typeof row.value !== 'object') return null;
  if (resolveTenantId(row.value.tenant_id) !== tenantId && tenantId !== DEFAULT_TENANT_ID) return null;
  return {
    ...row.value,
    tenant_id: resolveTenantId(row.value.tenant_id),
    cached_at: row.value.cached_at || row.updated_at || null,
    from_cache: true
  };
}

function historyDatesForPeriod(period = 'all', history = {}) {
  const dates = [...(Array.isArray(history.dates) ? history.dates : Object.keys(objectValue(history.days)))].sort();
  if (!dates.length) return [];
  const latest = dates.at(-1);
  if (period === 'today') return [tashkentDateKey()];
  if (period === 'yesterday') return [shiftDateKey(tashkentDateKey(), -1)];
  if (period === 'week' || period === '7d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -6);
    return dates.filter(date => date >= start && date <= end);
  }
  if (period === 'month' || period === '30d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -29);
    return dates.filter(date => date >= start && date <= end);
  }
  return latest ? [latest] : [];
}

function companiesForHistoryDates(history = {}, dates = []) {
  const days = objectValue(history.days);
  const rows = [];
  dates.forEach(date => {
    const day = days[date];
    if (!day || !Array.isArray(day.companies)) return;
    day.companies.forEach(company => rows.push({
      ...company,
      report_date: company.report_date || date
    }));
  });
  return rows;
}

function cacheDateInPeriod(reportDate = '', period = 'all') {
  const cacheDate = String(reportDate || '').trim();
  if (!cacheDate) return false;
  if (!period || period === 'all') return true;
  if (period === 'today') return cacheDate === tashkentDateKey();
  if (period === 'yesterday') return cacheDate === shiftDateKey(tashkentDateKey(), -1);
  if (period === 'week' || period === '7d') {
    const end = tashkentDateKey();
    return cacheDate >= shiftDateKey(end, -6) && cacheDate <= end;
  }
  if (period === 'month' || period === '30d') {
    const end = tashkentDateKey();
    return cacheDate >= shiftDateKey(end, -29) && cacheDate <= end;
  }
  return true;
}

async function companiesFromCacheForPeriod(period = 'all', tenantId) {
  const cached = await getCachedCompanyReport({ tenantId });
  if (!cached?.companies?.length) return { companies: [], dates: [] };
  const reportDate = cached.report_date || tashkentDateKey();
  if (!cacheDateInPeriod(reportDate, period)) return { companies: [], dates: [] };
  return {
    companies: cached.companies.map(company => ({
      ...company,
      report_date: company.report_date || reportDate
    })),
    dates: [reportDate]
  };
}

async function requestCompanyReport(url, auth) {
  const response = await fetch(url, { headers: { 'X-Auth': auth } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message
      ? (typeof payload.message === 'string' ? payload.message : JSON.stringify(payload.message))
      : response.statusText || `HTTP ${response.status}`;
    const error = new Error(`Uyqur company report API: ${message}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function syncCompanyReport(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const reportDate = options.reportDate || tashkentDateKey();
  const url = companyReportUrl(tenantId);
  const auth = assertTenantCompanyReportAuth(tenantId);

  const payload = await requestCompanyReport(url, auth);
  const companies = extractReportRows(payload)
    .map(row => normalizeReportCompany(row, reportDate))
    .filter(row => row.company_id);
  const fetchedAt = new Date().toISOString();
  const result = {
    tenant_id: tenantId,
    report_date: reportDate,
    companies,
    summary: buildReportSummary(companies),
    fetched_at: fetchedAt,
    source: url
  };

  if (options.persist !== false) {
    const snapshot = await saveCompanyReportSnapshot(result);
    const history = await saveReportHistoryDay(result);
    return {
      ...result,
      persisted: true,
      cached_at: snapshot.cached_at,
      history_dates: history.dates || [],
      storage: 'bot_settings'
    };
  }

  return result;
}

function enrichCompaniesWithModuleReport(companies = [], reportCompanies = []) {
  const byId = new Map(
    reportCompanies
      .filter(row => row.company_id || row.id)
      .map(row => [String(row.company_id || row.id), row])
  );
  return companies.map(company => {
    const report = byId.get(String(company.id));
    if (!report) return company;
    return {
      ...company,
      module_usage: report.module_usage || company.module_usage || {},
      module_last_dates: report.module_last_dates || company.module_last_dates || {},
      module_active_count: report.module_active_count ?? company.module_active_count,
      report_date: report.report_date || company.report_date || null
    };
  });
}

function aggregateModuleUsage(rows = []) {
  const usage = Object.fromEntries(MODULE_KEYS.map(key => [key, false]));
  const lastDates = {};
  rows.forEach(row => {
    const moduleUsage = row.module_usage || {};
    const moduleLastDates = row.module_last_dates || {};
    MODULE_KEYS.forEach(key => {
      if (moduleUsage[key]) usage[key] = true;
      if (moduleLastDates[key]) lastDates[key] = moduleLastDates[key];
    });
  });
  return {
    module_usage: usage,
    module_last_dates: lastDates,
    module_active_count: MODULE_KEYS.reduce((sum, key) => sum + (usage[key] ? 1 : 0), 0)
  };
}

async function getCompanyModuleReports(query = {}) {
  const tenantId = resolveTenantId(query.tenantId);
  const period = String(query.period || query.periodKey || 'all').trim().toLowerCase();
  const reportDate = String(query.report_date || query.date || '').trim();
  const history = await getReportHistory({ tenantId });
  let dates = reportDate
    ? [reportDate]
    : historyDatesForPeriod(period, history);
  let list = companiesForHistoryDates(history, dates);
  if (!list.length) {
    const cached = await companiesFromCacheForPeriod(period, tenantId);
    if (cached.companies.length) {
      list = cached.companies;
      if (!dates.length) dates = cached.dates;
    }
  }

  if (['week', '7d', 'month', '30d'].includes(period)) {
    const grouped = new Map();
    list.forEach(row => {
      const key = String(row.company_id);
      if (!grouped.has(key)) {
        grouped.set(key, {
          company_id: row.company_id,
          company_name: row.company_name || '',
          rows: []
        });
      }
      grouped.get(key).rows.push(row);
    });
    const companies = [...grouped.values()].map(group => {
      const aggregated = aggregateModuleUsage(group.rows);
      const latest = group.rows.sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)))[0];
      return {
        company_id: group.company_id,
        company_name: group.company_name,
        report_date: latest?.report_date || null,
        ...aggregated
      };
    });
    return {
      tenant_id: tenantId,
      period,
      storage: 'bot_settings',
      companies,
      report_dates: dates
    };
  }

  const targetDate = dates.at(-1) || null;
  const companies = (targetDate ? list.filter(row => row.report_date === targetDate) : list)
    .map(row => ({
      company_id: row.company_id,
      company_name: row.company_name || '',
      report_date: row.report_date,
      module_usage: row.module_usage || {},
      module_last_dates: row.module_last_dates || {},
      module_active_count: Number(row.module_active_count || 0)
    }));

  return {
    tenant_id: tenantId,
    period,
    storage: 'bot_settings',
    companies,
    report_dates: dates
  };
}

module.exports = {
  COMPANY_REPORT_CACHE_KEY,
  COMPANY_REPORT_HISTORY_KEY,
  COMPANY_REPORT_CACHE_SCHEMA_VERSION,
  COMPANY_REPORT_HISTORY_SCHEMA_VERSION,
  REPORT_HISTORY_MAX_DAYS,
  MODULE_KEYS,
  ACTIVITY_KEY_MAP,
  companyReportUrl,
  normalizeReportCompany,
  extractReportRows,
  syncCompanyReport,
  getCachedCompanyReport,
  getReportHistory,
  enrichCompaniesWithModuleReport,
  getCompanyModuleReports,
  aggregateModuleUsage,
  tashkentDateKey
};
