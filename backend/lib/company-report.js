'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');
const { getCurrentTenantId, normalizeTenantId, DEFAULT_TENANT_ID } = require('./tenant');

const DEFAULT_COMPANY_REPORT_URL = 'https://backend.app.uyqur.uz/dev/company/info-report-for-bot';
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
    return optionalEnv('UYQUR_COMPANY_REPORT_URL', optionalEnv('UYQUR_COMPANY_INFO_URL', DEFAULT_COMPANY_REPORT_URL));
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

function mapDbRowToCompany(row = {}) {
  return {
    company_id: row.company_id,
    company_name: row.company_name || '',
    report_date: row.report_date,
    module_usage: row.module_usage || {},
    module_last_dates: row.module_last_dates || {},
    module_active_count: Number(row.module_active_count || 0),
    raw: row.raw || null
  };
}

async function selectDailyReports(filters = {}) {
  const query = {
    select: 'company_id,company_name,report_date,module_usage,module_last_dates,module_active_count,raw,source_url,fetched_at',
    order: supabase.order('company_name', true),
    limit: '5000',
    ...filters
  };
  return supabase.select('company_module_daily_reports', query).catch(() => []);
}

async function getLatestReportDate() {
  const rows = await supabase.select('company_module_daily_reports', {
    select: 'report_date',
    order: supabase.order('report_date', false),
    limit: '1'
  }).catch(() => []);
  return rows[0]?.report_date || null;
}

async function getAvailableReportDates({ start, end } = {}) {
  const query = {
    select: 'report_date',
    order: supabase.order('report_date', true),
    limit: '5000'
  };
  if (start && end) query.report_date = [`gte.${start}`, `lte.${end}`];
  const rows = await supabase.select('company_module_daily_reports', query).catch(() => []);
  return [...new Set(rows.map(row => row.report_date).filter(Boolean))].sort();
}

async function saveDailyReports(result = {}) {
  const reportDate = result.report_date || tashkentDateKey();
  const companies = Array.isArray(result.companies) ? result.companies : [];
  const fetchedAt = result.fetched_at || new Date().toISOString();
  const sourceUrl = result.source || '';
  const rows = companies.map(company => ({
    report_date: reportDate,
    company_id: company.company_id,
    company_name: company.company_name || '',
    module_usage: company.module_usage || {},
    module_last_dates: company.module_last_dates || {},
    module_active_count: Number(company.module_active_count || 0),
    raw: company.raw || null,
    source_url: sourceUrl,
    fetched_at: fetchedAt
  }));

  if (rows.length) {
    await supabase.insert('company_module_daily_reports', rows, {
      upsert: true,
      onConflict: 'report_date,company_id',
      prefer: 'return=minimal'
    });
  }

  return { report_date: reportDate, companies_count: rows.length };
}

async function saveSyncRun({
  reportDate,
  status,
  companiesCount = 0,
  sourceUrl = '',
  errorMessage = null,
  startedAt,
  finishedAt
}) {
  await supabase.insert('company_module_sync_runs', [{
    report_date: reportDate,
    status,
    companies_count: companiesCount,
    source_url: sourceUrl || null,
    error_message: errorMessage,
    started_at: startedAt || new Date().toISOString(),
    finished_at: finishedAt || new Date().toISOString()
  }], { prefer: 'return=minimal' });
}

async function getCachedCompanyReport(options = {}) {
  const tenantId = resolveTenantId(options.tenantId);
  const reportDate = options.reportDate || await getLatestReportDate();
  if (!reportDate) return null;

  const rows = await selectDailyReports({ report_date: reportDate });
  if (!rows.length) return null;

  const companies = rows.map(mapDbRowToCompany);
  const fetchedAt = rows.reduce((latest, row) => {
    const value = row.fetched_at || '';
    return value > latest ? value : latest;
  }, rows[0].fetched_at || new Date().toISOString());

  return {
    tenant_id: tenantId,
    report_date: reportDate,
    companies,
    summary: buildReportSummary(companies),
    fetched_at: fetchedAt,
    cached_at: fetchedAt,
    source: rows[0]?.source_url || '',
    from_cache: true
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
      const saved = await saveDailyReports(result);
      await saveSyncRun({
        reportDate,
        status: 'success',
        companiesCount: saved.companies_count,
        sourceUrl: url,
        startedAt,
        finishedAt: fetchedAt
      });
      return {
        ...result,
        persisted: true,
        storage: 'supabase',
        companies_count: saved.companies_count
      };
    }

    return result;
  } catch (error) {
    if (options.persist !== false) {
      await saveSyncRun({
        reportDate,
        status: 'failed',
        companiesCount: 0,
        sourceUrl: url,
        errorMessage: error.message,
        startedAt,
        finishedAt: new Date().toISOString()
      }).catch(() => null);
    }
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
  let dates = [];
  let list = [];

  if (reportDate) {
    dates = [reportDate];
    list = await selectDailyReports({ report_date: reportDate });
  } else if (period === 'today') {
    dates = [tashkentDateKey()];
    list = await selectDailyReports({ report_date: dates[0] });
  } else if (period === 'yesterday') {
    dates = [shiftDateKey(tashkentDateKey(), -1)];
    list = await selectDailyReports({ report_date: dates[0] });
  } else if (period === 'week' || period === '7d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -6);
    dates = await getAvailableReportDates({ start, end });
    list = await selectDailyReports({ report_date: [`gte.${start}`, `lte.${end}`] });
  } else if (period === 'month' || period === '30d') {
    const end = tashkentDateKey();
    const start = shiftDateKey(end, -29);
    dates = await getAvailableReportDates({ start, end });
    list = await selectDailyReports({ report_date: [`gte.${start}`, `lte.${end}`] });
  } else {
    const latest = await getLatestReportDate();
    if (latest) {
      dates = [latest];
      list = await selectDailyReports({ report_date: latest });
    }
  }

  list = list.map(mapDbRowToCompany);

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
      storage: 'supabase',
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
    storage: 'supabase',
    companies,
    report_dates: dates
  };
}

module.exports = {
  MODULE_KEYS,
  ACTIVITY_KEY_MAP,
  companyReportUrl,
  normalizeReportCompany,
  extractReportRows,
  syncCompanyReport,
  getCachedCompanyReport,
  enrichCompaniesWithModuleReport,
  getCompanyModuleReports,
  aggregateModuleUsage,
  tashkentDateKey
};
