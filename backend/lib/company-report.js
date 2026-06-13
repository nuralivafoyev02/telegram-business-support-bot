'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');
const { getCurrentTenantId, normalizeTenantId, DEFAULT_TENANT_ID } = require('./tenant');

const DEFAULT_COMPANY_REPORT_URL = 'https://backend.app.uyqur.uz/dev/company/info-report-for-bot';
const COMPANY_REPORT_CACHE_KEY = 'uyqur_company_report_cache';
const COMPANY_REPORT_CACHE_SCHEMA_VERSION = 1;
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

function normalizeActivityModule(activity = {}, sourceKey = '', targetKey = '') {
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
    const module = normalizeActivityModule(activity, sourceKey, targetKey);
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

async function saveDailyReportRows(companies = [], meta = {}) {
  if (!companies.length) return { saved: 0 };
  const rows = companies
    .filter(company => company.company_id)
    .map(company => ({
      report_date: company.report_date || meta.report_date || tashkentDateKey(),
      company_id: company.company_id,
      company_name: company.company_name || '',
      module_usage: company.module_usage || {},
      module_last_dates: company.module_last_dates || {},
      module_active_count: Number(company.module_active_count || 0),
      raw: company.raw || null,
      source_url: meta.source || '',
      fetched_at: meta.fetched_at || new Date().toISOString()
    }));
  if (!rows.length) return { saved: 0 };
  await supabase.insert('company_module_daily_reports', rows, {
    upsert: true,
    onConflict: 'tenant_id,report_date,company_id',
    prefer: 'return=minimal'
  });
  return { saved: rows.length };
}

async function saveSyncRun(payload = {}) {
  try {
    await supabase.insert('company_module_sync_runs', [{
      report_date: payload.report_date || tashkentDateKey(),
      status: payload.status || 'failed',
      companies_count: Number(payload.companies_count || 0),
      source_url: payload.source || '',
      error_message: payload.error_message || null,
      started_at: payload.started_at || new Date().toISOString(),
      finished_at: payload.finished_at || new Date().toISOString()
    }], { prefer: 'return=minimal' });
  } catch (error) {
    console.warn('[company-report:sync-run]', error.message);
  }
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
  const startedAt = new Date().toISOString();
  const reportDate = options.reportDate || tashkentDateKey();
  const url = companyReportUrl(tenantId);
  const auth = assertTenantCompanyReportAuth(tenantId);

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
      await saveDailyReportRows(companies, { report_date: reportDate, source: url, fetched_at: fetchedAt });
      const snapshot = await saveCompanyReportSnapshot(result);
      await saveSyncRun({
        report_date: reportDate,
        status: 'success',
        companies_count: companies.length,
        source: url,
        started_at: startedAt,
        finished_at: fetchedAt
      });
      return { ...result, persisted: true, cached_at: snapshot.cached_at };
    }

    return result;
  } catch (error) {
    await saveSyncRun({
      report_date: reportDate,
      status: 'failed',
      companies_count: 0,
      source: url,
      error_message: error.message,
      started_at: startedAt,
      finished_at: new Date().toISOString()
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
  rows.forEach(row => {
    const moduleUsage = row.module_usage || {};
    MODULE_KEYS.forEach(key => {
      if (moduleUsage[key]) usage[key] = true;
    });
  });
  return {
    module_usage: usage,
    module_active_count: MODULE_KEYS.reduce((sum, key) => sum + (usage[key] ? 1 : 0), 0)
  };
}

async function getCompanyModuleReports(query = {}) {
  const tenantId = resolveTenantId(query.tenantId);
  const period = String(query.period || query.periodKey || 'all').trim().toLowerCase();
  const reportDate = String(query.report_date || query.date || '').trim();
  const select = 'report_date,company_id,company_name,module_usage,module_last_dates,module_active_count,fetched_at';
  let rows = [];

  if (reportDate) {
    rows = await supabase.select('company_module_daily_reports', {
      select,
      report_date: supabase.eq(reportDate),
      order: supabase.order('company_name', true),
      limit: '5000'
    }).catch(() => []);
  } else if (period === 'today') {
    rows = await supabase.select('company_module_daily_reports', {
      select,
      report_date: supabase.eq(tashkentDateKey()),
      order: supabase.order('company_name', true),
      limit: '5000'
    }).catch(() => []);
  } else if (['week', '7d', 'month', '30d'].includes(period)) {
    const end = tashkentDateKey();
    const days = period === 'month' || period === '30d' ? 29 : 6;
    const start = tashkentDateKey(Date.now() - days * 86_400_000);
    rows = await supabase.select('company_module_daily_reports', {
      select,
      report_date: [`gte.${start}`, `lte.${end}`],
      order: supabase.order('report_date', false),
      limit: '20000'
    }).catch(() => []);
  } else {
    const latestRows = await supabase.select('company_module_daily_reports', {
      select: 'report_date',
      order: supabase.order('report_date', false),
      limit: '1'
    }).catch(() => []);
    const latestDate = latestRows[0]?.report_date;
    rows = latestDate
      ? await supabase.select('company_module_daily_reports', {
        select,
        report_date: supabase.eq(latestDate),
        order: supabase.order('company_name', true),
        limit: '5000'
      }).catch(() => [])
      : [];
  }

  const list = Array.isArray(rows) ? rows : [];

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
        module_last_dates: latest?.module_last_dates || {},
        ...aggregated
      };
    });
    return {
      tenant_id: tenantId,
      period,
      companies,
      report_dates: [...new Set(list.map(row => row.report_date).filter(Boolean))].sort()
    };
  }

  return {
    tenant_id: tenantId,
    period,
    companies: list.map(row => ({
      company_id: row.company_id,
      company_name: row.company_name || '',
      report_date: row.report_date,
      module_usage: row.module_usage || {},
      module_last_dates: row.module_last_dates || {},
      module_active_count: Number(row.module_active_count || 0)
    })),
    report_dates: [...new Set(list.map(row => row.report_date).filter(Boolean))].sort()
  };
}

module.exports = {
  COMPANY_REPORT_CACHE_KEY,
  COMPANY_REPORT_CACHE_SCHEMA_VERSION,
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
