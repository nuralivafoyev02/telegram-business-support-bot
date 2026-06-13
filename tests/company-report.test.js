'use strict';

const assert = require('node:assert/strict');
const { normalizeReportCompany, extractReportRows, aggregateModuleUsage } = require('../backend/lib/company-report');

const sample = {
  id: 60,
  name: 'Milliard House',
  data: {
    activity: {
      supply: { active: true, last_date: '11 Июн' },
      cashier: { active: true, last_date: '11 Июн' },
      warehouse: { active: true, last_date: '12 Июн' },
      monitoring: { active: false, last_date: '09 Июн' },
      construction: { active: true, last_date: '12 Июн' }
    }
  }
};

const normalized = normalizeReportCompany(sample, '2026-06-13');
assert.strictEqual(normalized.company_id, 60);
assert.strictEqual(normalized.company_name, 'Milliard House');
assert.strictEqual(normalized.module_active_count, 4);
assert.strictEqual(normalized.module_usage.taminot, true);
assert.strictEqual(normalized.module_usage.kassa, true);
assert.strictEqual(normalized.module_usage.omborxona, true);
assert.strictEqual(normalized.module_usage.qurilish_jarayoni, true);
assert.strictEqual(normalized.module_usage.monitoring, false);
assert.strictEqual(normalized.module_last_dates.monitoring, '09 Июн');
assert.strictEqual(normalized.module_last_dates.taminot, '11 Июн');

const rows = extractReportRows({ data: [sample] });
assert.strictEqual(rows.length, 1);

const aggregated = aggregateModuleUsage([
  { module_usage: { taminot: true, kassa: false, omborxona: false, qurilish_jarayoni: false } },
  { module_usage: { taminot: false, kassa: true, omborxona: false, qurilish_jarayoni: false } }
]);
assert.strictEqual(aggregated.module_active_count, 2);
assert.strictEqual(aggregated.module_usage.taminot, true);
assert.strictEqual(aggregated.module_usage.kassa, true);

console.log('company-report.test.js: ok');
