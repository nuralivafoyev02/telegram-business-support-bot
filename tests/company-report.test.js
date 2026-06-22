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
  moduleLastDateWithinActiveWindow,
  resolveModuleUsageForDailyRow,
  resolveModuleUsageForTargetDate,
  buildChartDailyCompanies,
  reconcileCompanyModuleRow,
  extractCompanyEmployeeActivity,
  aggregateEmployeeActivityForPeriod
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
assert.strictEqual(normalized.module_active_count, 4);
assert.strictEqual(normalized.module_usage.taminot, true);
assert.strictEqual(normalized.module_usage.kassa, true);
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
assert.strictEqual(chinaJune20.module_active_count, 4);
assert.strictEqual(chinaJune20.module_usage.kassa, true);
assert.strictEqual(chinaJune20.module_usage.taminot, true);
assert.strictEqual(chinaJune20.module_usage.omborxona, true);
assert.strictEqual(chinaJune20.module_usage.monitoring, true);
assert.strictEqual(chinaJune20.module_usage.qurilish_jarayoni, false);

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
assert.strictEqual(aggregated.module_active_count, 3);
assert.strictEqual(aggregated.module_usage.taminot, true);
assert.strictEqual(aggregated.module_usage.kassa, true);
assert.strictEqual(aggregated.module_usage.omborxona, true);

const scoped = moduleUsageForReportDate(chinaJune20.module_last_dates, '2026-06-20');
assert.strictEqual(scoped.module_active_count, 4);
assert.strictEqual(scoped.module_usage.kassa, true);

const chinaFromRaw = reconcileCompanyModuleRow({
  company_id: 999,
  company_name: 'China House',
  report_date: '2026-06-20',
  module_last_dates: {},
  raw: chinaHouse
});
assert.strictEqual(chinaFromRaw.module_active_count, 4);
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
assert.strictEqual(yesterdayMismatch.module_active_count, 0);
assert.strictEqual(yesterdayMismatch.module_usage.taminot, false);

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
assert.strictEqual(chinaDbJune20.module_active_count, 4);
assert.strictEqual(chinaDbJune20.module_usage.kassa, true);
assert.strictEqual(chinaDbJune20.module_usage.taminot, true);

assert.strictEqual(parseModuleLastDateKey('20 Июн', '2026-06-20'), '2026-06-20');
assert.strictEqual(parseModuleLastDateKey('20Июн', '2026-06-20'), '2026-06-20');

assert.strictEqual(moduleLastDateWithinActiveWindow('22 Июн', '2026-06-22'), true);
assert.strictEqual(moduleLastDateWithinActiveWindow('22 Июн', '2026-06-23'), true);
assert.strictEqual(moduleLastDateWithinActiveWindow('22 Июн', '2026-06-24'), true);
assert.strictEqual(moduleLastDateWithinActiveWindow('22 Июн', '2026-06-25'), false);
assert.strictEqual(moduleLastDateWithinActiveWindow('20 Июн', '2026-06-22'), true);
assert.strictEqual(moduleLastDateWithinActiveWindow('20 Июн', '2026-06-23'), false);

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
], '2026-06-19', '2026-06-20');
assert.strictEqual(weekAggregate.module_active_count, 3);
assert.strictEqual(weekAggregate.module_usage.taminot, true);
assert.strictEqual(weekAggregate.module_usage.kassa, true);
assert.strictEqual(weekAggregate.module_usage.omborxona, true);
assert.strictEqual(weekAggregate.module_usage.monitoring, false);

const chinaWeek = aggregateModuleUsage([
  {
    report_date: '2026-06-22',
    module_usage: {
      taminot: false,
      kassa: false,
      omborxona: false,
      qurilish_jarayoni: false,
      monitoring: false
    },
    module_last_dates: {
      taminot: '19 Июн',
      kassa: '20 Июн',
      omborxona: '19 Июн',
      monitoring: '18 Июн',
      qurilish_jarayoni: '05 Июн'
    }
  }
], '2026-06-16', '2026-06-22');
assert.strictEqual(chinaWeek.module_usage.kassa, true);
assert.strictEqual(chinaWeek.module_usage.taminot, true);
assert.strictEqual(chinaWeek.module_usage.omborxona, true);
assert.strictEqual(chinaWeek.module_usage.monitoring, true);
assert.strictEqual(chinaWeek.module_usage.qurilish_jarayoni, false);

const chinaStrictSingle = resolveModuleUsageForTargetDate({
  report_date: '2026-06-22',
  module_last_dates: {
    taminot: '19 Июн',
    kassa: '20 Июн',
    omborxona: '19 Июн',
    monitoring: '18 Июн',
    qurilish_jarayoni: '05 Июн'
  }
}, '2026-06-20');
assert.strictEqual(chinaStrictSingle.module_active_count, 0);
assert.strictEqual(chinaStrictSingle.module_usage.kassa, false);

const chinaExactSingle = resolveModuleUsageForTargetDate({
  report_date: '2026-06-20',
  module_last_dates: {
    taminot: '19 Июн',
    kassa: '20 Июн',
    omborxona: '19 Июн',
    monitoring: '18 Июн',
    qurilish_jarayoni: '05 Июн'
  }
}, '2026-06-20');
assert.strictEqual(chinaExactSingle.module_usage.kassa, true);
assert.strictEqual(chinaExactSingle.module_usage.taminot, true);
assert.strictEqual(chinaExactSingle.module_usage.monitoring, true);
assert.strictEqual(chinaExactSingle.module_active_count, 4);

const chinaCustomRange = aggregateModuleUsage([
  { report_date: '2026-06-19', module_last_dates: { taminot: '19 Июн', omborxona: '19 Июн' } },
  { report_date: '2026-06-20', module_last_dates: { kassa: '20 Июн' } }
], '2026-06-18', '2026-06-20');
assert.strictEqual(chinaCustomRange.module_usage.kassa, true);
assert.strictEqual(chinaCustomRange.module_usage.taminot, true);
assert.strictEqual(chinaCustomRange.module_usage.qurilish_jarayoni, false);

const chartDaily = buildChartDailyCompanies([
  {
    company_id: 999,
    company_name: 'China House',
    report_date: '2026-06-22',
    module_last_dates: {
      taminot: '19 Июн',
      kassa: '20 Июн',
      omborxona: '19 Июн',
      monitoring: '18 Июн',
      qurilish_jarayoni: '05 Июн'
    }
  }
], '2026-06-20', '2026-06-23');
const chinaChartJune20 = chartDaily.find(row => row.company_id === 999 && row.report_date === '2026-06-20');
assert.ok(chinaChartJune20);
assert.strictEqual(chinaChartJune20.module_usage.kassa, true);
assert.strictEqual(chinaChartJune20.module_usage.taminot, true);
const chinaChartJune23 = chartDaily.find(row => row.company_id === 999 && row.report_date === '2026-06-23');
assert.ok(chinaChartJune23);
assert.strictEqual(chinaChartJune23.module_usage.kassa, false);

const landHouseEmployeeRaw = {
  id: 65,
  name: 'Land House',
  data: {
    total_actions: 31,
    activity_period: '29 kun',
    active_employees: [
      { id: 776, name: 'Aslonov', action_count: 18, important_count: 0 },
      { id: 783, name: 'Gulomov', action_count: 7, important_count: 11 },
      { id: 772, name: 'Abalbaev', action_count: 6, important_count: 4 },
      { id: 771, name: 'Xamrakulov', action_count: 0, important_count: 10 }
    ],
    inactive_employees: [
      { id: 780, name: 'Mukimov', last_activity_date: '21 Iyun', important_count: 0 }
    ],
    support: { username: '@uyqur_mirshod', phone: '+998914143181' }
  }
};
const landHouseEmployee = extractCompanyEmployeeActivity({ raw: landHouseEmployeeRaw });
assert.strictEqual(landHouseEmployee.total_actions, 31);
assert.strictEqual(landHouseEmployee.active_employee_count, 3);
assert.strictEqual(landHouseEmployee.inactive_employee_count, 1);
assert.strictEqual(landHouseEmployee.active_employees.length, 4);

const landHousePublic = reconcileCompanyModuleRow({
  company_id: 65,
  company_name: 'Land House',
  report_date: '2026-06-22',
  module_last_dates: { taminot: '22 Iyun' },
  raw: landHouseEmployeeRaw
});
assert.strictEqual(landHousePublic.employee_activity.total_actions, 31);
assert.strictEqual(landHousePublic.employee_activity.support.username, '@uyqur_mirshod');

const employeeDayOne = {
  report_date: '2026-06-21',
  raw: {
    data: {
      total_actions: 10,
      active_employees: [{ id: 1, name: 'Ali', action_count: 10, important_count: 0 }],
      inactive_employees: [{ id: 2, name: 'Vali', last_activity_date: '20 Iyun', important_count: 0 }]
    }
  }
};
const employeeDayTwo = {
  report_date: '2026-06-22',
  raw: {
    data: {
      total_actions: 5,
      active_employees: [{ id: 1, name: 'Ali', action_count: 5, important_count: 2 }],
      inactive_employees: [{ id: 2, name: 'Vali', last_activity_date: '21 Iyun', important_count: 0 }]
    }
  }
};
const aggregatedEmployees = aggregateEmployeeActivityForPeriod(
  [employeeDayOne, employeeDayTwo],
  '2026-06-21',
  '2026-06-22'
);
assert.strictEqual(aggregatedEmployees.total_actions, 15);
assert.strictEqual(aggregatedEmployees.active_employee_count, 1);
assert.strictEqual(aggregatedEmployees.active_employees[0].action_count, 15);
assert.strictEqual(aggregatedEmployees.inactive_employee_count, 1);
assert.strictEqual(aggregatedEmployees.aggregated, true);

const singleDayEmployees = aggregateEmployeeActivityForPeriod(
  [employeeDayTwo],
  '2026-06-22',
  '2026-06-22'
);
assert.strictEqual(singleDayEmployees.total_actions, 5);
assert.strictEqual(singleDayEmployees.aggregated, false);

console.log('company-report.test.js: ok');
