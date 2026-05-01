'use strict';

const supabase = require('./supabase');

const DEFAULT_SUMMARY = {
  total_requests: 0,
  open_requests: 0,
  closed_requests: 0,
  groups_count: 0,
  private_chats_count: 0,
  employees_count: 0,
  companies_count: 0
};

function isSchemaCacheMiss(error) {
  const message = String(error && error.message || '');
  return message.includes('PGRST205') || /schema cache/i.test(message);
}

async function selectOrFallback(table, query, fallback) {
  try {
    return await supabase.select(table, query);
  } catch (error) {
    if (!isSchemaCacheMiss(error)) throw error;
    console.warn(`[stats:fallback] ${table} view not available; using base tables`);
    return fallback(query);
  }
}

function parseLimit(value, fallback = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
}

function parseOrder(order, fallbackColumn) {
  if (!order || typeof order !== 'string') return { column: fallbackColumn, direction: 'desc' };
  const [column, direction = 'asc'] = order.split('.');
  return { column: column || fallbackColumn, direction: direction === 'desc' ? 'desc' : 'asc' };
}

function compareValues(a, b, direction) {
  const emptyA = a === undefined || a === null || a === '';
  const emptyB = b === undefined || b === null || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  const numA = Number(a);
  const numB = Number(b);
  let result;
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    result = numA - numB;
  } else {
    result = String(a).localeCompare(String(b));
  }
  return direction === 'desc' ? -result : result;
}

function orderAndLimit(rows, query, fallbackColumn) {
  const { column, direction } = parseOrder(query.order, fallbackColumn);
  return [...rows]
    .sort((a, b) => compareValues(a[column], b[column], direction))
    .slice(0, parseLimit(query.limit));
}

function matchesFilter(value, filter) {
  if (!filter) return true;
  const actual = String(value || '');
  if (filter.startsWith('eq.')) return actual === filter.slice(3);
  if (filter.startsWith('in.(') && filter.endsWith(')')) {
    return filter.slice(4, -1).split(',').includes(actual);
  }
  return true;
}

async function listBaseData() {
  const [chats, requests, companies, employees, companyMembers] = await Promise.all([
    supabase.select('tg_chats', { select: 'chat_id,title,username,type,source_type,company_id,business_connection_id,is_active,last_message_at', limit: '500' }),
    supabase.select('support_requests', { select: 'id,source_type,chat_id,company_id,status,closed_by_employee_id,created_at,closed_at,initial_text', limit: '5000' }),
    supabase.select('companies', { select: 'id,name,legal_name,phone,notes,is_active', limit: '500' }),
    supabase.select('employees', { select: 'id,tg_user_id,full_name,username,role,is_active', limit: '500' }),
    supabase.select('company_members', { select: 'company_id,tg_user_id,employee_id,member_type,is_active', limit: '5000' }).catch(() => [])
  ]);

  return { chats, requests, companies, employees, companyMembers };
}

function getCompanyMap(companies) {
  return new Map(companies.map(company => [company.id, company]));
}

function buildChatStats({ chats, requests, companies }) {
  const companyMap = getCompanyMap(companies);
  return chats.map(chat => {
    const related = requests.filter(request => String(request.chat_id) === String(chat.chat_id));
    return {
      ...chat,
      company_name: chat.company_id && companyMap.get(chat.company_id) ? companyMap.get(chat.company_id).name : null,
      total_requests: related.length,
      open_requests: related.filter(request => request.status === 'open').length,
      closed_requests: related.filter(request => request.status === 'closed').length,
      employees_handled: new Set(related.map(request => request.closed_by_employee_id).filter(Boolean)).size,
      last_request_at: related.map(request => request.created_at).filter(Boolean).sort().at(-1) || null,
      last_closed_at: related.map(request => request.closed_at).filter(Boolean).sort().at(-1) || null
    };
  });
}

async function fallbackChatStatistics(query = {}) {
  const data = await listBaseData();
  const rows = buildChatStats(data)
    .filter(row => matchesFilter(row.source_type, query.source_type))
    .filter(row => matchesFilter(row.is_active, query.is_active));
  return orderAndLimit(rows, query, 'total_requests');
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff / 60000 : null;
}

function buildEmployeeStats({ employees, requests }) {
  return employees.map(employee => {
    const related = requests.filter(request => request.closed_by_employee_id === employee.id);
    const closed = related.filter(request => request.status === 'closed');
    const closeMinutes = closed.map(request => minutesBetween(request.created_at, request.closed_at)).filter(value => value !== null);
    const avg = closeMinutes.length ? Math.round((closeMinutes.reduce((sum, value) => sum + value, 0) / closeMinutes.length) * 10) / 10 : 0;
    return {
      employee_id: employee.id,
      tg_user_id: employee.tg_user_id,
      full_name: employee.full_name,
      username: employee.username,
      role: employee.role,
      is_active: employee.is_active,
      received_requests: related.length,
      closed_requests: closed.length,
      open_requests: related.filter(request => request.status === 'open').length,
      handled_chats: new Set(related.map(request => request.chat_id).filter(Boolean)).size,
      last_closed_at: closed.map(request => request.closed_at).filter(Boolean).sort().at(-1) || null,
      avg_close_minutes: avg
    };
  });
}

async function fallbackEmployeeStatistics(query = {}) {
  const data = await listBaseData();
  return orderAndLimit(buildEmployeeStats(data), query, 'closed_requests');
}

function buildCompanyStats({ chats, requests, companies, companyMembers }) {
  return companies.map(company => {
    const companyChats = chats.filter(chat => chat.company_id === company.id);
    const related = requests.filter(request => {
      if (request.company_id === company.id) return true;
      return companyChats.some(chat => String(chat.chat_id) === String(request.chat_id));
    });
    const members = companyMembers.filter(member => member.company_id === company.id && member.is_active !== false);
    return {
      company_id: company.id,
      name: company.name,
      legal_name: company.legal_name,
      phone: company.phone,
      notes: company.notes,
      is_active: company.is_active,
      chats_count: new Set(companyChats.map(chat => chat.chat_id)).size,
      users_count: new Set(members.filter(member => member.member_type === 'customer').map(member => member.tg_user_id).filter(Boolean)).size,
      employees_count: new Set(members.filter(member => ['employee', 'manager', 'owner'].includes(member.member_type)).map(member => member.employee_id).filter(Boolean)).size,
      total_requests: related.length,
      open_requests: related.filter(request => request.status === 'open').length,
      closed_requests: related.filter(request => request.status === 'closed').length,
      offers_count: related.filter(request => String(request.initial_text || '').toLowerCase().includes('taklif')).length,
      last_request_at: related.map(request => request.created_at).filter(Boolean).sort().at(-1) || null
    };
  });
}

async function fallbackCompanyStatistics(query = {}) {
  const data = await listBaseData();
  return orderAndLimit(buildCompanyStats(data), query, 'total_requests');
}

function isTodayTashkent(value) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', dateStyle: 'short' });
  return formatter.format(new Date(value)) === formatter.format(new Date());
}

async function fallbackTodaySummary() {
  const { chats, requests, companies } = await listBaseData();
  return [{
    total_requests: requests.filter(request => isTodayTashkent(request.created_at)).length,
    open_requests: requests.filter(request => request.status === 'open').length,
    closed_requests: requests.filter(request => request.status === 'closed' && isTodayTashkent(request.closed_at)).length,
    groups_count: chats.filter(chat => chat.source_type === 'group' && chat.is_active !== false).length,
    private_chats_count: chats.filter(chat => ['private', 'business'].includes(chat.source_type) && chat.is_active !== false).length,
    employees_count: employees.filter(employee => employee.is_active !== false).length,
    companies_count: companies.filter(company => company.is_active !== false).length
  }];
}

function selectEmployeeStatistics(query = {}) {
  return selectOrFallback('v_employee_statistics', query, fallbackEmployeeStatistics);
}

function selectChatStatistics(query = {}) {
  return selectOrFallback('v_chat_statistics', query, fallbackChatStatistics);
}

function selectCompanyStatistics(query = {}) {
  return selectOrFallback('v_company_statistics', query, fallbackCompanyStatistics);
}

function selectTodaySummary(query = {}) {
  return selectOrFallback('v_today_summary', query, fallbackTodaySummary);
}

module.exports = {
  DEFAULT_SUMMARY,
  isSchemaCacheMiss,
  selectEmployeeStatistics,
  selectChatStatistics,
  selectCompanyStatistics,
  selectTodaySummary
};
