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
  extractCompanyEmployeeActivity,
  COMPANY_MODULE_DAILY_TABLE
} = require('../backend/lib/company-report');
const supabase = require('../backend/lib/supabase');

const PAGE_SIZE = 500;

async function loadRowsNeedingBackfill(offset = 0) {
  return supabase.select(COMPANY_MODULE_DAILY_TABLE, {
    select: 'id,tenant_id,report_date,company_id,company_name,raw,employee_activity',
    employee_activity: 'is.null',
    raw: 'not.is.null',
    order: ['report_date.desc', 'company_id.asc'],
    limit: String(PAGE_SIZE),
    offset: String(offset)
  });
}

async function main() {
  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const batch = await loadRowsNeedingBackfill(offset);
    if (!batch.length) break;

    for (const row of batch) {
      scanned += 1;
      const employee_activity = extractCompanyEmployeeActivity(row);
      if (!employee_activity) {
        skipped += 1;
        continue;
      }
      await supabase.patch(COMPANY_MODULE_DAILY_TABLE, {
        id: supabase.eq(row.id)
      }, { employee_activity }, 'return=minimal');
      updated += 1;
    }

    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const result = { ok: true, scanned, updated, skipped };
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
