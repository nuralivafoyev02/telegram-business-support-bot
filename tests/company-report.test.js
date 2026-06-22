'use strict';

const assert = require('node:assert/strict');
const {
  normalizeReportCompany,
  extractReportRows,
  aggregateModuleUsage,
  normalizeReportDateKey,
  periodDateRange,
  moduleUsageForReportDate
} = require('../backend/lib/company-report');

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
assert.strictEqual(normalized.module_active_count, 0);
assert.strictEqual(normalized.module_usage.taminot, false);
assert.strictEqual(normalized.module_usage.kassa, false);
assert.strictEqual(normalized.module_usage.monitoring, false);
assert.strictEqual(normalized.module_last_dates.monitoring, '09 Июн');
assert.strictEqual(normalized.module_last_dates.taminot, '11 Июн');

const chinaHouse = {
  id: 999,
  name: 'China House',
  data: {
    activity: {
      supply: { active: true, last_date: '19 Июн' },
      cashier: { active: true, last_date: '20 Июн' },
      warehouse: { active: true, last_date: '19 Июн' },
      monitoring: { active: false, last_date: '18 Июн' },
      construction: { active: false, last_date: '05 Июн' }
    }
  }
};
const chinaJune20 = normalizeReportCompany(chinaHouse, '2026-06-20');
assert.strictEqual(chinaJune20.module_active_count, 1);
assert.strictEqual(chinaJune20.module_usage.kassa, true);
assert.strictEqual(chinaJune20.module_usage.taminot, false);
assert.strictEqual(chinaJune20.module_usage.omborxona, false);

const rows = extractReportRows({ data: [sample] });
assert.strictEqual(rows.length, 1);

const aggregated = aggregateModuleUsage([
  {
    report_date: '2026-06-01',
    module_last_dates: { taminot: '1 Июн', kassa: '31 Май' }
  },
  {
    report_date: '2026-06-02',
    module_last_dates: { kassa: '2 Июн', omborxona: '1 Июн' }
  }
]);
assert.strictEqual(aggregated.module_active_count, 2);
assert.strictEqual(aggregated.module_usage.taminot, true);
assert.strictEqual(aggregated.module_usage.kassa, true);
assert.strictEqual(aggregated.module_usage.omborxona, false);

const scoped = moduleUsageForReportDate(chinaJune20.module_last_dates, '2026-06-20');
assert.strictEqual(scoped.module_active_count, 1);
assert.strictEqual(scoped.module_usage.kassa, true);

assert.strictEqual(normalizeReportDateKey('2026-06-15'), '2026-06-15');
assert.strictEqual(normalizeReportDateKey('2026-06-15T00:00:00.000Z'), '2026-06-15');
assert.strictEqual(normalizeReportDateKey(''), '');

const todayRange = periodDateRange('today');
assert.ok(todayRange);
assert.strictEqual(todayRange.start, todayRange.end);
assert.strictEqual(todayRange.dates.length, 1);

const yesterdayRange = periodDateRange('yesterday');
assert.ok(yesterdayRange);
assert.notStrictEqual(yesterdayRange.start, todayRange.start);

console.log('company-report.test.js: ok');
