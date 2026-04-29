'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');

const DEFAULT_COMPANY_INFO_URL = 'https://backend.app.uyqur.uz/dev/company/info-for-bot';
const EXPIRING_SOON_DAYS = 30;

function companyInfoUrl() {
  return optionalEnv('UYQUR_COMPANY_INFO_URL', DEFAULT_COMPANY_INFO_URL);
}

function companyInfoAuth() {
  return optionalEnv('UYQUR_COMPANY_INFO_AUTH', '');
}

function parseUnixDate(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';
  return new Date(number * 1000).toISOString();
}

function parseDottedDate(value = '') {
  const match = String(value || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59));
}

function daysUntil(date) {
  if (!date) return null;
  const diff = date.getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.ceil(diff / 86_400_000);
}

function expiryState(days) {
  if (days === null || days === undefined) return 'none';
  if (days < 0) return 'expired';
  if (days <= EXPIRING_SOON_DAYS) return 'soon';
  return 'ok';
}

function normalizeSupportUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCompany(row = {}) {
  const expiresAt = parseDottedDate(row.expired);
  const days = daysUntil(expiresAt);
  const statusHistories = Array.isArray(row.status_histories) ? row.status_histories : [];
  const latestStatus = statusHistories
    .slice()
    .sort((a, b) => Number(b.changed_at || 0) - Number(a.changed_at || 0))[0] || null;

  return {
    id: row.id,
    name: row.name || '',
    status: row.status || '',
    created_at: row.created_at || null,
    created_at_iso: parseUnixDate(row.created_at),
    updated_at: row.updated_at || null,
    updated_at_iso: parseUnixDate(row.updated_at),
    phone: row.phone || '',
    brand: row.brand || '',
    director: row.director || '',
    icon: row.icon || '',
    last_activity: row.last_activity || null,
    currency_id: row.currency_id || null,
    auto_refresh_currencies: Number(row.auto_refresh_currencies || 0),
    expired: row.expired || '',
    days_until_expiry: days,
    expiry_state: expiryState(days),
    uyqur_support_username: row.uyqur_support_username || '',
    uyqur_support_phone: row.uyqur_support_phone || '',
    subscription_start_date: row.subscription_start_date || '',
    business_status: row.business_status || '',
    is_real: Number(row.is_real || 0),
    status_histories: statusHistories,
    latest_status_change: latestStatus,
    latest_status_change_at_iso: latestStatus ? parseUnixDate(latestStatus.changed_at) : ''
  };
}

function buildSummary(companies = []) {
  return {
    total: companies.length,
    active: companies.filter(company => company.status === 'active').length,
    passive: companies.filter(company => company.status === 'passive').length,
    real: companies.filter(company => company.is_real === 1).length,
    business_active: companies.filter(company => company.business_status === 'ACTIVE').length,
    business_new: companies.filter(company => company.business_status === 'NEW').length,
    business_paused: companies.filter(company => company.business_status === 'PAUSED').length,
    support_assigned: companies.filter(company => company.uyqur_support_username || company.uyqur_support_phone).length,
    auto_currency_refresh: companies.filter(company => company.auto_refresh_currencies === 1).length,
    expired: companies.filter(company => company.expiry_state === 'expired').length,
    expiring_soon: companies.filter(company => company.expiry_state === 'soon').length
  };
}

function supportContactsFromCompanies(companies = []) {
  const contacts = new Map();
  companies.forEach(company => {
    const username = normalizeSupportUsername(company.uyqur_support_username);
    const phoneDigits = normalizePhone(company.uyqur_support_phone);
    if (!username && !phoneDigits) return;
    const key = username ? `u:${username}` : `p:${phoneDigits}`;
    if (!contacts.has(key)) {
      contacts.set(key, {
        username: username || null,
        phone: company.uyqur_support_phone || null,
        phone_digits: phoneDigits || '',
        full_name: username ? `@${username}` : (company.uyqur_support_phone || 'Support xodim')
      });
    }
  });
  return [...contacts.values()];
}

function employeeMatchesSupport(employee = {}, contact = {}) {
  const employeeUsername = normalizeSupportUsername(employee.username);
  const employeePhone = normalizePhone(employee.phone);
  return Boolean(
    (contact.username && employeeUsername && contact.username === employeeUsername)
    || (contact.phone_digits && employeePhone && contact.phone_digits === employeePhone)
  );
}

async function syncSupportEmployees(companies = []) {
  const contacts = supportContactsFromCompanies(companies);
  if (!contacts.length) return { created: 0, skipped: 0 };

  try {
    const employees = await supabase.select('employees', {
      select: 'id,username,phone,tg_user_id,full_name,is_active',
      limit: '5000'
    });
    const existing = Array.isArray(employees) ? employees : [];
    const missing = contacts.filter(contact => !existing.some(employee => employeeMatchesSupport(employee, contact)));
    if (!missing.length) return { created: 0, skipped: contacts.length };

    const now = new Date().toISOString();
    const rows = missing.map(contact => ({
      full_name: contact.full_name,
      username: contact.username,
      phone: contact.phone,
      role: 'support',
      is_active: true,
      last_activity_at: now
    }));
    await supabase.insert('employees', rows, { prefer: 'return=minimal' });
    return { created: rows.length, skipped: contacts.length - rows.length };
  } catch (error) {
    console.warn('[company-info:sync-support-employees:error]', error.message);
    return { created: 0, skipped: contacts.length, error: error.message };
  }
}

function extractCompanyRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

async function fetchCompanyInfo() {
  const url = companyInfoUrl();
  const auth = companyInfoAuth();
  if (!auth) throw new Error('UYQUR_COMPANY_INFO_AUTH env sozlanmagan');

  const response = await fetch(url, {
    headers: { 'X-Auth': auth }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.message
      ? JSON.stringify(payload.message)
      : response.statusText || `HTTP ${response.status}`;
    throw new Error(`Uyqur company API: ${message}`);
  }

  const companies = extractCompanyRows(payload).map(normalizeCompany);
  const supportEmployeeSync = await syncSupportEmployees(companies);
  return {
    summary: buildSummary(companies),
    companies,
    support_employee_sync: supportEmployeeSync,
    fetched_at: new Date().toISOString(),
    source: url,
    message: payload.message || null
  };
}

module.exports = { fetchCompanyInfo, normalizeCompany, buildSummary, syncSupportEmployees };
