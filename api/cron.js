'use strict';

const { sendJson, getQuery } = require('../backend/lib/http');
const { optionalEnv } = require('../backend/lib/env');
const { syncCompanyReport } = require('../backend/lib/company-report');
const { runWithTenant, resolveTenantFromQuery } = require('../backend/lib/tenant');
const backendCron = require('../backend/api/cron');

const COMPANY_REPORT_ACTIONS = Object.freeze([
  'companyReport',
  'company-report',
  'uyqurCompanyReport',
  'uyqur-company-report'
]);

function verify(req) {
  const secret = optionalEnv('CRON_SECRET', optionalEnv('TELEGRAM_WEBHOOK_SECRET', ''));
  if (!secret) return true;
  const query = getQuery(req);
  return query.secret === secret || req.headers.authorization === `Bearer ${secret}`;
}

module.exports = async function handler(req, res) {
  if (!verify(req)) return sendJson(res, 401, { ok: false, error: 'Invalid cron secret' });
  const query = getQuery(req);
  const action = String(query.action || query.job || '').trim();
  if (COMPANY_REPORT_ACTIONS.includes(action)) {
    try {
      const tenantId = resolveTenantFromQuery(query);
      const result = await runWithTenant(tenantId, () => syncCompanyReport());
      return sendJson(res, 200, { ok: true, data: result });
    } catch (error) {
      console.error('[cron:companyReport:error]', error);
      return sendJson(res, 500, { ok: false, error: error.message });
    }
  }
  return backendCron(req, res);
};
