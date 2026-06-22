'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');
const { getCurrentTenantId, normalizeTenantId, DEFAULT_TENANT_ID } = require('./tenant');

const DEFAULT_COMPANY_REPORT_URL = 'https://backend.app.uyqur.uz/dev/company/info-report-for-bot';
const COMPANY_REPORT_CACHE_KEY = 'uyqur_company_report_cache';
const COMPANY_REPORT_HISTORY_KEY = 'uyqur_company_report_history';
const COMPANY_REPORT_CACHE_SCHEMA_VERSION = 1;
const COMPANY_REPORT_HISTORY_SCHEMA_VERSION = 1;
const REPORT_HISTORY_MAX_DAYS = 0;
const COMPANY_MODULE_DAILY_TABLE = 'company_module_daily_reports';
const COMPANY_MODULE_SYNC_RUNS_TABLE = 'company_module_sync_runs';
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

const MODULE_LAST_DATE_MONTHS = Object.freeze({
  yan: 1, yanvar: 1, jan: 1, 'янв': 1,
  fev: 2, february: 2, 'фев': 2,
  mar: 3, mart: 3, 'мар': 3,
  apr: 4, aprel: 4, 'апр': 4,
  may: 5, mai: 5, 'май': 5,
  iyun: 6, iun: 6, jun: 6, 'июн': 6,
  iyul: 7, jul: 7, 'июл': 7,
  avg: 8, aug: 8, avgust: 8, 'авг': 8,
  sen: 9, sep: 9, sent: 9, 'сен': 9,
  okt: 10, oct: 10, 'окт': 10,
  noy: 11, nov: 11, 'ноя': 11,
  dek: 12, dec: 12, 'дек': 12
});

function normalizeModuleLastDateToken(value = '') {
  return String(value || '').trim().toLowerCase()
    .replace(/[.’'`]/g, '')
    .replace(/\s+/g, '');
}

function parseModuleLastDateKey(lastDate = '', referenceDate = '') {
  const text = String(lastDate || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return normalizeReportDateKey(text);

  const ref = normalizeReportDateKey(referenceDate) || tashkentDateKey();
  const refYear = Number(ref.slice(0, 4));

  const dotted = text.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    let year = dotted[3] ? Number(dotted[3]) : refYear;
    if (year < 100) year += 2000;
    if (!day || !month) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const named = text.match(/^(\d{1,2})\s+(.+)$/);
  if (named) {
    const day = Number(named[1]);
    const monthToken = normalizeModuleLastDateToken(named[2]);
    let month = 0;
    for (const [key, value] of Object.entries(MODULE_LAST_DATE_MONTHS)) {
      if (monthToken.startsWith(key) || key.startsWith(monthToken.slice(0, Math.min(3, monthToken.length)))) {
        month = value;
        break;
      }
    }
    if (!day || !month) return '';
    return `${refYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

function moduleLastDateMatchesReportDate(lastDate = '', reportDate = '') {
  const target = normalizeReportDateKey(reportDate);
  const parsed = parseModuleLastDateKey(lastDate, target);
  return Boolean(target && parsed && parsed === target);
}

function moduleUsageForReportDate(moduleLastDates = {}, reportDate = '') {
  const usage = Object.fromEntries(MODULE_KEYS.map(key => [key, false]));
  const target = normalizeReportDateKey(reportDate);
  if (target) {
    MODULE_KEYS.forEach(key => {
      usage[key] = moduleLastDateMatchesReportDate(moduleLastDates[key], target);
    });
  }
  return {
    module_usage: usage,
    module_active_count: MODULE_KEYS.reduce((sum, key) => sum + (usage[key] ? 1 : 0), 0)
  };
}

function reconcileCompanyModuleRow(row = {}) {
  const reportDate = normalizeReportDateKey(row.report_date);
  if (!reportDate) return row;
  const scoped = moduleUsageForReportDate(row.module_last_dates || {}, reportDate);
  return {
    ...row,
    module_usage: scoped.module_usage,
    module_active_count: scoped.module_active_count
  };
}

function normalizeReportCompany(row = {}, reportDate = tashkentDateKey()) {
  const source = objectValue(row);
  const activity = objectValue(objectValue(source.data).activity);
  const module_last_dates = {};
  Object.entries(ACTIVITY_KEY_MAP).forEach(([sourceKey, targetKey]) => {
    const module = normalizeActivityModule(activity, sourceKey);
    module_last_dates[targetKey] = module.last_date;
  });
  const scoped = moduleUsageForReportDate(module_last_dates, reportDate);
  const companyId = Number(source.id || source.company_id || 0);
  return {
    company_id: Number.isFinite(companyId) && companyId > 0 ? companyId : null,
    company_name: source.name || source.company_name || '',
    report_date: reportDate,
    module_usage: scoped.module_usage,
    module_last_dates,
    module_active_count: scoped.module_active_count,
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

function serializeDailyCompanies(rows = []) {
  return rows.map(row => ({
    company_id: row.company_id,
    company_name: row.company_name || '',
    report_date: row.report_date,
    module_usage: row.module_usage || {},
    module_active_count: Number(row.module_active_count || 0)
  }));
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
  const limit = Number(maxDays || 0);
  const keptDates = limit > 0 ? dates.slice(0, limit) : dates;
  const nextDays = Object.fromEntries(
    keptDates.map(date => [date, days[date]]).filter(([, value]) => value && typeof value === 'object')
  );
  return {
    ...history,
    days: nextDays,
    dates: keptDates.sort((a, b) => String(a).localeCompare(String(b)))
  };
}

async function loadAllDailyReportRows(tenantId) {
  const id = resolveTenantId(tenantId);
  const rows = [];
  const pageSize = 5000;
  let offset = 0;
  while (true) {
    const batch = await supabase.select(COMPANY_MODULE_DAILY_TABLE, {
      select: 'report_date,company_id,company_name,module_usage,module_last_dates,module_active_count,fetched_at',
      tenant_id: supabase.eq(id),
      order: ['report_date.desc', 'company_id.asc'],
      limit: String(pageSize),
      offset: String(offset)
    }).catch(() => []);
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function normalizeReportDateKey(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizeDailyReportRow(row = {}) {
  return {
    company_id: Number(row.company_id || 0) || null,
    company_name: String(row.company_name || '').trim(),
    report_date: normalizeReportDateKey(row.report_date),
    module_usage: objectValue(row.module_usage),
    module_last_dates: objectValue(row.module_last_dates),
    module_active_count: Number(row.module_active_count || 0),
    fetched_at: row.fetched_at || null
  };
}

function dailyRowsToCompanyList(rows = []) {
  return rows.map(row => ({
    company_id: row.company_id,
    company_name: row.company_name || '',
    report_date: row.report_date,
    module_usage: row.module_usage || {},
    module_last_dates: row.module_last_dates || {},
    module_active_count: Number(row.module_active_count || 0),
    fetched_at: row.fetched_at || null
  }));
}

function datesFromDailyRows(rows = []) {
  return [...new Set(rows.map(row => row.report_date).filter(Boolean))].sort();
}

async function loadDailyReportRowsForDateRange(tenantId, startDate = '', endDate = '') {
  const rangeStart = normalizeReportDateKey(startDate);
  const rangeEnd = normalizeReportDateKey(endDate);
  if (!rangeStart || !rangeEnd) return [];
  const start = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const end = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  const id = resolveTenantId(tenantId);
  const rows = [];
  const pageSize = 5000;
  let offset = 0;
  while (true) {
    const batch = await supabase.select(COMPANY_MODULE_DAILY_TABLE, {
      select: 'report_date,company_id,company_name,module_usage,module_last_dates,module_active_count,fetched_at',
      tenant_id: supabase.eq(id),
      report_date: [`gte.${start}`, `lte.${end}`],
      order: ['report_date.desc', 'company_id.asc'],
      limit: String(pageSize),
      offset: String(offset)
    }).catch(() => []);
    if (!batch.length) break;
    rows.push(...batch.map(normalizeDailyReportRow).filter(row => row.company_id && row.report_date));
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function saveCompanyReportDailyRows(result = {}) {
  const tenantId = resolveTenantId(result.tenant_id);
  const reportDate = result.report_date || tashkentDateKey();
  const fetchedAt = result.fetched_at || new Date().toISOString();
  const rows = (Array.isArray(result.companies) ? result.companies : [])
    .filter(row => row && row.company_id)
    .map(row => ({
      tenant_id: tenantId,
      report_date: reportDate,
      company_id: row.company_id,
      company_name: row.company_name || '',
      module_usage: row.module_usage || {},
      module_last_dates: row.module_last_dates || {},
      module_active_count: Number(row.module_active_count || 0),
      raw: row.raw || null,
      source_url: result.source || '',
      fetched_at: fetchedAt
    }));
  if (!rows.length) return 0;
  await supabase.insert(COMPANY_MODULE_DAILY_TABLE, rows, {
    upsert: true,
    onConflict: 'tenant_id,report_date,company_id',
    prefer: 'return=minimal'
  });
  return rows.length;
}

async function saveCompanyReportSyncRun({
  tenantId,
  reportDate,
  status = 'success',
  companiesCount = 0,
  sourceUrl = '',
  errorMessage = '',
  startedAt = null
} = {}) {
  const finishedAt = new Date().toISOString();
  await supabase.insert(COMPANY_MODULE_SYNC_RUNS_TABLE, [{
    tenant_id: resolveTenantId(tenantId),
    report_date: reportDate || tashkentDateKey(),
    status: status === 'failed' ? 'failed' : 'success',
    companies_count: Number(companiesCount || 0),
    source_url: sourceUrl || '',
    error_message: errorMessage ? String(errorMessage).slice(0, 4000) : null,
    started_at: startedAt || finishedAt,
    finished_at: finishedAt
  }], { prefer: 'return=minimal' }).catch(() => null);
}

async function getReportHistoryFromDaily(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const rows = await loadAllDailyReportRows(tenantId);
  if (!rows.length) return null;

  const allowedDates = new Set();
  for (const row of rows) {
    const date = String(row.report_date || '').trim();
    if (!date) continue;
    allowedDates.add(date);
  }
  const days = {};
  rows.forEach(row => {
    const normalized = normalizeDailyReportRow(row);
    if (!normalized.report_date || !allowedDates.has(normalized.report_date)) return;
    if (!days[normalized.report_date]) {
      days[normalized.report_date] = {
        report_date: normalized.report_date,
        fetched_at: normalized.fetched_at,
        source: '',
        companies: [],
        summary: {}
      };
    } else if (
      normalized.fetched_at
      && String(normalized.fetched_at).localeCompare(String(days[normalized.report_date].fetched_at || '')) > 0
    ) {
      days[normalized.report_date].fetched_at = normalized.fetched_at;
    }
    days[normalized.report_date].companies.push({
      company_id: normalized.company_id,
      company_name: normalized.company_name,
      report_date: normalized.report_date,
      module_usage: normalized.module_usage,
      module_last_dates: normalized.module_last_dates,
      module_active_count: normalized.module_active_count
    });
  });
  Object.values(days).forEach(day => {
    day.summary = buildReportSummary(day.companies);
  });
  return pruneReportHistory({
    tenant_id: tenantId,
    cache_schema_version: COMPANY_REPORT_HISTORY_SCHEMA_VERSION,
    days,
    dates: Object.keys(days).sort((a, b) => String(a).localeCompare(String(b))),
    updated_at: new Date().toISOString()
  });
}

async function getReportHistoryFromSettings(options = {}) {
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
  const history = pruneReportHistory(await getReportHistoryFromSettings({ tenantId }));
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

async function getCachedCompanyReportFromDaily(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const latestRows = await supabase.select(COMPANY_MODULE_DAILY_TABLE, {
    select: 'report_date,fetched_at',
    tenant_id: supabase.eq(tenantId),
    order: ['report_date.desc', 'fetched_at.desc'],
    limit: '1'
  }).catch(() => []);
  const latest = latestRows[0];
  if (!latest?.report_date) return null;

  const date = String(latest.report_date);
  const rows = await supabase.select(COMPANY_MODULE_DAILY_TABLE, {
    select: 'company_id,company_name,report_date,module_usage,module_last_dates,module_active_count,fetched_at',
    tenant_id: supabase.eq(tenantId),
    report_date: supabase.eq(date),
    order: supabase.order('company_id', true),
    limit: '10000'
  }).catch(() => []);
  if (!rows.length) return null;

  const companies = rows.map(normalizeDailyReportRow).map(row => ({
    company_id: row.company_id,
    company_name: row.company_name,
    report_date: row.report_date,
    module_usage: row.module_usage,
    module_last_dates: row.module_last_dates,
    module_active_count: row.module_active_count
  }));
  const fetchedAt = rows.map(row => row.fetched_at).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] || null;
  return {
    tenant_id: tenantId,
    cache_schema_version: COMPANY_REPORT_CACHE_SCHEMA_VERSION,
    report_date: date,
    companies,
    summary: buildReportSummary(companies),
    fetched_at: fetchedAt,
    cached_at: fetchedAt,
    source: '',
    from_cache: true
  };
}

async function getReportHistory(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const [daily, settings] = await Promise.all([
    getReportHistoryFromDaily({ tenantId }),
    getReportHistoryFromSettings({ tenantId })
  ]);
  const dailyDates = daily?.dates || [];
  const settingsDates = settings?.dates || [];
  if (!dailyDates.length && !settingsDates.length) {
    return emptyReportHistory(tenantId);
  }
  if (!settingsDates.length) return daily;
  if (!dailyDates.length) return settings;

  const mergedDays = {
    ...objectValue(settings.days),
    ...objectValue(daily.days)
  };
  return pruneReportHistory({
    tenant_id: tenantId,
    cache_schema_version: COMPANY_REPORT_HISTORY_SCHEMA_VERSION,
    days: mergedDays,
    dates: Object.keys(mergedDays).sort((a, b) => String(a).localeCompare(String(b))),
    updated_at: daily?.updated_at || settings?.updated_at || new Date().toISOString()
  });
}

async function getCachedCompanyReport(options = {}) {
  const daily = await getCachedCompanyReportFromDaily(options);
  if (daily?.companies?.length) return daily;
  return getCachedCompanyReportFromSettings(options);
}

async function getCachedCompanyReportFromSettings(options = {}) {
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

function periodDateRange(period = '') {
  const key = String(period || '').trim().toLowerCase();
  if (key === 'today') {
    const date = tashkentDateKey();
    return { start: date, end: date, dates: [date] };
  }
  if (key === 'yesterday') {
    const date = shiftDateKey(tashkentDateKey(), -1);
    return { start: date, end: date, dates: [date] };
  }
  if (key === 'day_before_yesterday') {
    const date = shiftDateKey(tashkentDateKey(), -2);
    return { start: date, end: date, dates: [date] };
  }
  return null;
}

async function loadCompanyModuleListForDateRange(tenantId, startDate = '', endDate = '', history = null) {
  const rows = await loadDailyReportRowsForDateRange(tenantId, startDate, endDate);
  let list = dailyRowsToCompanyList(rows);
  let dates = datesFromDailyRows(rows);
  if (!list.length && history) {
    dates = historyDatesForRange(history, startDate, endDate);
    list = companiesForHistoryDates(history, dates);
  }
  return { list, dates };
}

function historyDatesForRange(history = {}, startDate = '', endDate = '') {
  const dates = [...(Array.isArray(history.dates) ? history.dates : Object.keys(objectValue(history.days)))]
    .map(normalizeReportDateKey)
    .filter(Boolean)
    .sort();
  const start = normalizeReportDateKey(startDate);
  const end = normalizeReportDateKey(endDate);
  if (!start || !end) return [];
  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;
  return dates.filter(date => date >= rangeStart && date <= rangeEnd);
}

function historyDatesForPeriod(period = 'all', history = {}) {
  const dates = [...(Array.isArray(history.dates) ? history.dates : Object.keys(objectValue(history.days)))].sort();
  if (!dates.length) return [];
  const latest = dates.at(-1);
  if (period === 'today') return [tashkentDateKey()];
  if (period === 'yesterday') return [shiftDateKey(tashkentDateKey(), -1)];
  if (period === 'day_before_yesterday') return [shiftDateKey(tashkentDateKey(), -2)];
  if (period === 'week' || period === '7d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -6);
    return dates.filter(date => date >= start && date <= end);
  }
  if (period === 'prev_week' || period === 'prev_7d') {
    const end = shiftDateKey(tashkentDateKey(), -7);
    const start = shiftDateKey(tashkentDateKey(), -13);
    return dates.filter(date => date >= start && date <= end);
  }
  if (period === 'month' || period === '30d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -29);
    return dates.filter(date => date >= start && date <= end);
  }
  if (period === 'prev_month' || period === 'prev_30d') {
    const end = shiftDateKey(tashkentDateKey(), -30);
    const start = shiftDateKey(tashkentDateKey(), -59);
    return dates.filter(date => date >= start && date <= end);
  }
  if (period === 'all') return dates;
  if (period === 'prev_all') {
    const cutoff = shiftDateKey(tashkentDateKey(), -29);
    return dates.filter(date => date < cutoff);
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
  if (period === 'day_before_yesterday') return cacheDate === shiftDateKey(tashkentDateKey(), -2);
  if (period === 'week' || period === '7d') {
    const end = tashkentDateKey();
    return cacheDate >= shiftDateKey(end, -6) && cacheDate <= end;
  }
  if (period === 'prev_week' || period === 'prev_7d') {
    const end = shiftDateKey(tashkentDateKey(), -7);
    const start = shiftDateKey(tashkentDateKey(), -13);
    return cacheDate >= start && cacheDate <= end;
  }
  if (period === 'month' || period === '30d') {
    const end = tashkentDateKey();
    return cacheDate >= shiftDateKey(end, -29) && cacheDate <= end;
  }
  if (period === 'prev_month' || period === 'prev_30d') {
    const end = shiftDateKey(tashkentDateKey(), -30);
    const start = shiftDateKey(tashkentDateKey(), -59);
    return cacheDate >= start && cacheDate <= end;
  }
  if (period === 'prev_all') {
    return cacheDate < shiftDateKey(tashkentDateKey(), -29);
  }
  return true;
}

function latestFetchedAtForDates(history = {}, dates = []) {
  const days = objectValue(history.days);
  return [...dates]
    .map(date => days[date]?.fetched_at)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || null;
}

async function companiesFromCacheForPeriod(period = 'all', tenantId, range = {}) {
  const cached = await getCachedCompanyReport({ tenantId });
  if (!cached?.companies?.length) return { companies: [], dates: [] };
  const reportDate = cached.report_date || tashkentDateKey();
  const rangeStart = String(range.start || '').trim();
  const rangeEnd = String(range.end || '').trim();
  if (rangeStart && rangeEnd) {
    const start = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const end = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    if (reportDate < start || reportDate > end) return { companies: [], dates: [] };
  } else if (!cacheDateInPeriod(reportDate, period)) {
    return { companies: [], dates: [] };
  }
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
  const startedAt = new Date().toISOString();

  try {
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
      const dailyCount = await saveCompanyReportDailyRows(result);
      await saveCompanyReportSyncRun({
        tenantId,
        reportDate,
        status: 'success',
        companiesCount: dailyCount,
        sourceUrl: url,
        startedAt
      });
      const history = await getReportHistoryFromDaily({ tenantId });
      return {
        ...result,
        persisted: true,
        cached_at: fetchedAt,
        history_dates: history?.dates || [reportDate],
        storage: COMPANY_MODULE_DAILY_TABLE
      };
    }

    return result;
  } catch (error) {
    await saveCompanyReportSyncRun({
      tenantId,
      reportDate,
      status: 'failed',
      companiesCount: 0,
      sourceUrl: url,
      errorMessage: error.message,
      startedAt
    });
    throw error;
  }
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
    const reportDate = normalizeReportDateKey(row.report_date);
    const scoped = moduleUsageForReportDate(row.module_last_dates || {}, reportDate);
    MODULE_KEYS.forEach(key => {
      if (scoped.module_usage[key]) usage[key] = true;
      if (row.module_last_dates?.[key]) lastDates[key] = row.module_last_dates[key];
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
  const period = String(query.period || query.periodKey || 'today').trim().toLowerCase();
  const reportDate = normalizeReportDateKey(query.report_date || query.date || '');
  const startDate = normalizeReportDateKey(query.start_date || query.startDate || '');
  const endDate = normalizeReportDateKey(query.end_date || query.endDate || '');
  const history = await getReportHistory({ tenantId });
  const customRange = startDate && endDate
    ? { start: startDate <= endDate ? startDate : endDate, end: startDate <= endDate ? endDate : startDate }
    : null;
  const fixedDayRange = !reportDate && !customRange ? periodDateRange(period) : null;

  let dates = [];
  let list = [];

  if (reportDate) {
    ({ list, dates } = await loadCompanyModuleListForDateRange(tenantId, reportDate, reportDate, history));
    if (!dates.length) dates = [reportDate];
  } else if (customRange) {
    ({ list, dates } = await loadCompanyModuleListForDateRange(tenantId, customRange.start, customRange.end, history));
    if (!dates.length) {
      dates = historyDatesForRange(history, customRange.start, customRange.end);
    }
  } else if (fixedDayRange) {
    ({ list, dates } = await loadCompanyModuleListForDateRange(
      tenantId,
      fixedDayRange.start,
      fixedDayRange.end,
      history
    ));
    if (!dates.length) dates = fixedDayRange.dates;
  } else {
    dates = historyDatesForPeriod(period, history);
    list = companiesForHistoryDates(history, dates);
  }

  if (!list.length) {
    const cached = await companiesFromCacheForPeriod(period, tenantId, customRange || {});
    if (cached.companies.length) {
      list = cached.companies;
      if (!dates.length) dates = cached.dates;
    }
  }

  let fetched_at = list.length
    ? [...list].map(row => row.fetched_at).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] || null
    : null;
  if (!fetched_at) {
    fetched_at = latestFetchedAtForDates(history, dates);
  }
  if (!fetched_at) {
    const cached = await getCachedCompanyReport({ tenantId });
    fetched_at = cached?.fetched_at || null;
  }

  const customSingleDay = Boolean(
    (customRange && customRange.start === customRange.end)
    || fixedDayRange
  );
  const aggregatePeriods = ['all', 'custom', 'week', '7d', 'month', '30d', 'prev_week', 'prev_7d', 'prev_month', 'prev_30d', 'prev_all'];
  const shouldAggregate =
    (customRange && dates.length > 1)
    || (aggregatePeriods.includes(period) && !(period === 'custom' && (customSingleDay || dates.length <= 1)));

  if (shouldAggregate) {
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
      storage: COMPANY_MODULE_DAILY_TABLE,
      companies,
      daily_companies: serializeDailyCompanies(list),
      report_dates: dates,
      fetched_at
    };
  }

  const targetDate = dates.at(-1) || null;
  const companies = (targetDate ? list.filter(row => row.report_date === targetDate) : list)
    .map(row => reconcileCompanyModuleRow({
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
    storage: COMPANY_MODULE_DAILY_TABLE,
    companies,
    daily_companies: serializeDailyCompanies(list),
    report_dates: dates,
    fetched_at
  };
}

async function migrateBotSettingsHistoryToDaily(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const history = await getReportHistoryFromSettings({ tenantId });
  const days = objectValue(history.days);
  const allDates = [...new Set([...(history.dates || []), ...Object.keys(days)])].filter(Boolean).sort();
  const filterDates = Array.isArray(options.dates) ? options.dates.map(String).filter(Boolean) : [];
  const wantedDates = filterDates.length
    ? allDates.filter(date => filterDates.includes(date))
    : allDates;

  if (!wantedDates.length) {
    return {
      ok: false,
      tenant_id: tenantId,
      reason: allDates.length ? 'dates_not_found' : 'history_not_found',
      available_dates: allDates,
      migrated_dates: [],
      companies_written: 0,
      per_day: {}
    };
  }

  const perDay = {};
  let companiesWritten = 0;
  for (const date of wantedDates) {
    const day = days[date];
    const companies = Array.isArray(day?.companies) ? day.companies : [];
    if (!companies.length) {
      perDay[date] = 0;
      continue;
    }
    const count = await saveCompanyReportDailyRows({
      tenant_id: tenantId,
      report_date: date,
      companies,
      fetched_at: day.fetched_at || history.updated_at || new Date().toISOString(),
      source: day.source ? `${day.source} (migrated)` : 'migrated:bot_settings'
    });
    perDay[date] = count;
    companiesWritten += count;
  }

  return {
    ok: companiesWritten > 0,
    tenant_id: tenantId,
    available_dates: allDates,
    migrated_dates: wantedDates.filter(date => (perDay[date] || 0) > 0),
    companies_written: companiesWritten,
    per_day: perDay,
    storage: COMPANY_MODULE_DAILY_TABLE
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
  normalizeReportDateKey,
  parseModuleLastDateKey,
  moduleUsageForReportDate,
  periodDateRange,
  migrateBotSettingsHistoryToDaily,
  tashkentDateKey
};
