'use strict';

const assert = require('node:assert/strict');
const {
  normalizeReportCompany,
  extractReportRows,
  aggregateModuleUsage,
  normalizeReportDateKey,
  periodDateRange,
  resolveQueryDateRange,
  parseModuleLastDateKey,
  moduleUsageForReportDate,
  resolveModuleUsageForDailyRow,
  reconcileCompanyModuleRow
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

const chinaFromRaw = reconcileCompanyModuleRow({
  company_id: 999,
  company_name: 'China House',
  report_date: '2026-06-20',
  module_last_dates: {},
  raw: chinaHouse
});
assert.strictEqual(chinaFromRaw.module_active_count, 1);
assert.strictEqual(chinaFromRaw.module_usage.kassa, true);
assert.strictEqual(chinaFromRaw.module_last_dates.kassa, '20 Июн');

const landHouse = reconcileCompanyModuleRow({
  company_id: 65,
  company_name: 'Land House',
  report_date: '2026-06-22',
  module_usage: {
    taminot: true,
    kassa: false,
    omborxona: true,
    qurilish_jarayoni: false,
    monitoring: true
  },
  module_last_dates: {
    taminot: '22 Июн',
    kassa: '-',
    omborxona: '22 Июн',
    qurilish_jarayoni: '-',
    monitoring: '22 Июн'
  }
});
assert.strictEqual(landHouse.module_active_count, 3);
assert.strictEqual(landHouse.module_usage.taminot, true);
assert.strictEqual(landHouse.module_usage.kassa, false);

const yesterdayMismatch = resolveModuleUsageForDailyRow({
  report_date: '2026-06-21',
  module_usage: {
    taminot: true,
    kassa: true,
    omborxona: true,
    qurilish_jarayoni: true,
    monitoring: true
  },
  module_active_count: 5,
  module_last_dates: {
    taminot: '22 Июн',
    kassa: '22 Июн',
    omborxona: '22 Июн',
    qurilish_jarayoni: '22 Июн',
    monitoring: '22 Июн'
  }
});
assert.strictEqual(yesterdayMismatch.module_active_count, 5);
assert.strictEqual(yesterdayMismatch.module_usage.taminot, true);

const dashOnly = resolveModuleUsageForDailyRow({
  report_date: '2026-06-22',
  module_usage: {
    taminot: true,
    kassa: false,
    omborxona: true,
    qurilish_jarayoni: false,
    monitoring: true
  },
  module_active_count: 3,
  module_last_dates: {
    taminot: '22 Июн',
    kassa: '-',
    omborxona: '22 Июн',
    qurilish_jarayoni: '-',
    monitoring: '22 Июн'
  }
});
assert.strictEqual(dashOnly.module_active_count, 3);
assert.strictEqual(dashOnly.module_usage.taminot, true);
assert.strictEqual(dashOnly.module_usage.kassa, false);

const chinaDbJune20 = resolveModuleUsageForDailyRow({
  report_date: '2026-06-20',
  module_usage: {
    taminot: false,
    kassa: true,
    omborxona: false,
    qurilish_jarayoni: false,
    monitoring: false
  },
  module_active_count: 1,
  module_last_dates: {
    taminot: '19 Июн',
    kassa: '20 Июн',
    omborxona: '19 Июн',
    monitoring: '18 Июн',
    qurilish_jarayoni: '05 Июн'
  }
});
assert.strictEqual(chinaDbJune20.module_active_count, 1);
assert.strictEqual(chinaDbJune20.module_usage.kassa, true);
assert.strictEqual(chinaDbJune20.module_usage.taminot, false);

assert.strictEqual(parseModuleLastDateKey('20 Июн', '2026-06-20'), '2026-06-20');
assert.strictEqual(parseModuleLastDateKey('20Июн', '2026-06-20'), '2026-06-20');

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

const weekRange = periodDateRange('week');
assert.ok(weekRange);
assert.strictEqual(weekRange.dates.length, 7);
assert.strictEqual(weekRange.end, todayRange.start);

const weekQuery = resolveQueryDateRange({ period: 'week' });
assert.strictEqual(weekQuery.mode, 'range');
assert.strictEqual(weekQuery.start, weekRange.start);
assert.strictEqual(weekQuery.end, weekRange.end);

const yesterdayQuery = resolveQueryDateRange({ period: 'yesterday' });
assert.strictEqual(yesterdayQuery.mode, 'single');
assert.strictEqual(yesterdayQuery.start, yesterdayRange.start);
assert.strictEqual(yesterdayQuery.end, yesterdayRange.start);

const customSingle = resolveQueryDateRange({ start_date: '2026-06-20', end_date: '2026-06-20' });
assert.strictEqual(customSingle.mode, 'single');
assert.strictEqual(customSingle.start, '2026-06-20');

const customRange = resolveQueryDateRange({ start_date: '2026-06-18', end_date: '2026-06-20' });
assert.strictEqual(customRange.mode, 'range');
assert.strictEqual(customRange.start, '2026-06-18');
assert.strictEqual(customRange.end, '2026-06-20');
assert.strictEqual(weekRange.dates[0], weekRange.start);
assert.strictEqual(weekRange.dates.at(-1), weekRange.end);

const weekAggregate = aggregateModuleUsage([
  { report_date: '2026-06-19', module_last_dates: { taminot: '19 Июн', omborxona: '19 Июн' } },
  { report_date: '2026-06-20', module_last_dates: { kassa: '20 Июн' } }
]);
assert.strictEqual(weekAggregate.module_active_count, 3);
assert.strictEqual(weekAggregate.module_usage.taminot, true);
assert.strictEqual(weekAggregate.module_usage.kassa, true);
assert.strictEqual(weekAggregate.module_usage.omborxona, true);
assert.strictEqual(weekAggregate.module_usage.monitoring, false);

console.log('company-report.test.js: ok');
