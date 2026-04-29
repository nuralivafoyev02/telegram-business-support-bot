'use strict';

const { sendJson, getQuery } = require('../lib/http');
const { optionalEnv } = require('../lib/env');
const { sendMainStatsReport } = require('../lib/report');
const { notifyOperationalError } = require('../lib/log-notifier');

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
    const result = await sendMainStatsReport(query.chat_id || undefined);
    return sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    console.error('[cron:error]', error);
    notifyOperationalError('cron:error', error).catch(logError => console.error('[cron:notify-log:error]', logError));
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

module.exports = handler;
