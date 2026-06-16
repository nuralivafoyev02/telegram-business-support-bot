'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

const {
  migrateBotSettingsHistoryToDaily,
  COMPANY_REPORT_HISTORY_KEY
} = require('../backend/lib/company-report');
const supabase = require('../backend/lib/supabase');

const dates = process.argv.slice(2).filter(Boolean);

async function main() {
  const probe = await supabase.select('bot_settings', {
    select: 'key',
    limit: '1'
  }).then(() => true).catch((error) => {
    console.error('Supabase ulanmadi:', error.message);
    console.error('Tekshiring: .env ichidagi SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY prod bilan bir xilmi?');
    return false;
  });
  if (!probe) process.exit(1);

  const historyRows = await supabase.select('bot_settings', {
    select: 'key,updated_at',
    key: supabase.eq(COMPANY_REPORT_HISTORY_KEY),
    limit: '1'
  }).catch(() => []);
  if (!historyRows.length) {
    console.error('bot_settings ichida uyqur_company_report_history topilmadi.');
    console.error('Yechim: Supabase SQL Editor da supabase/014_migrate_bot_settings_daily.sql ni ishga tushiring.');
    process.exit(1);
  }

  const result = await migrateBotSettingsHistoryToDaily({ dates: dates.length ? dates : undefined });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
