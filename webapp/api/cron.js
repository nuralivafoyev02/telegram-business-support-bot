import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sendJson, getQuery } = require('../../backend/lib/http');
const { optionalEnv } = require('../../backend/lib/env');
const { sendMainStatsReport } = require('../../backend/lib/report');
const { syncCompanyInfo } = require('../../backend/lib/company-info');
const { syncCompanyReport } = require('../../backend/lib/company-report');
const { syncClickUpCompletedTasks } = require('../../backend/lib/clickup-sync');
const { syncClickUpCompanyLinks } = require('../../backend/lib/clickup-company-links');
const { notifyOperationalError } = require('../../backend/lib/log-notifier');
const { runWithTenant, resolveTenantFromQuery } = require('../../backend/lib/tenant');

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

function wantsReportSync(query = {}) {
  return ['1', 'true', 'yes'].includes(String(query.syncReport || query.sync_report || query.report || '').trim().toLowerCase());
}

export default async function handler(req, res) {
  if (!verify(req)) return sendJson(res, 401, { ok: false, error: 'Invalid cron secret' });
  try {
    const query = getQuery(req);
    const action = String(query.action || query.job || '').trim();
    const tenantId = resolveTenantFromQuery(query);

    if (COMPANY_REPORT_ACTIONS.includes(action) || wantsReportSync(query)) {
      const result = await runWithTenant(tenantId, () => syncCompanyReport());
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (['companyInfo', 'company-info', 'uyqurCompanyInfo', 'uyqur-company-info'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncCompanyInfo());
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (['clickupSync', 'clickup-sync', 'clickup'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncClickUpCompletedTasks({ limit: Number(query.limit || 50) }));
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (['clickupCompanyLinks', 'clickup-company-links'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncClickUpCompanyLinks());
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (action) {
      return sendJson(res, 400, { ok: false, error: `Noma'lum cron action: ${action}` });
    }
    const result = await runWithTenant(tenantId, () => sendMainStatsReport(query.chat_id || undefined));
    return sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    console.error('[cron:error]', error);
    notifyOperationalError('cron:error', error).catch(logError => console.error('[cron:notify-log:error]', logError));
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}
