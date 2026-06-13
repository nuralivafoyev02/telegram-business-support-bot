'use strict';

const { sendJson, getQuery } = require('../lib/http');
const { optionalEnv } = require('../lib/env');
const { sendMainStatsReport } = require('../lib/report');
const { syncCompanyInfo } = require('../lib/company-info');
const { syncCompanyReport } = require('../lib/company-report');
const { syncClickUpCompletedTasks } = require('../lib/clickup-sync');
const { notifyOperationalError } = require('../lib/log-notifier');
const { runWithTenant, resolveTenantFromQuery } = require('../lib/tenant');

function verify(req) {
  const secret = optionalEnv('CRON_SECRET', optionalEnv('TELEGRAM_WEBHOOK_SECRET', ''));
  if (!secret) return true;
  const query = getQuery(req);
  return query.secret === secret || req.headers.authorization === `Bearer ${secret}`;
}

async function handler(req, res) {
  if (!verify(req)) return sendJson(res, 401, { ok: false, error: 'Invalid cron secret' });
  try {
    const query = getQuery(req);
    const action = String(query.action || query.job || '').trim();
    const tenantId = resolveTenantFromQuery(query);
    if (['companyInfo', 'company-info', 'uyqurCompanyInfo', 'uyqur-company-info'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncCompanyInfo());
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (['companyReport', 'company-report', 'uyqurCompanyReport', 'uyqur-company-report'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncCompanyReport());
      return sendJson(res, 200, { ok: true, data: result });
    }
    if (['clickupSync', 'clickup-sync', 'clickup'].includes(action)) {
      const result = await runWithTenant(tenantId, () => syncClickUpCompletedTasks({ limit: Number(query.limit || 50) }));
      return sendJson(res, 200, { ok: true, data: result });
    }
    const result = await runWithTenant(tenantId, () => sendMainStatsReport(query.chat_id || undefined));
    return sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    console.error('[cron:error]', error);
    notifyOperationalError('cron:error', error).catch(logError => console.error('[cron:notify-log:error]', logError));
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

module.exports = handler;
