'use strict';

const supabase = require('./supabase');
const stats = require('./stats');
const { sendMessage, escapeHtml } = require('./telegram');
const { optionalEnv } = require('./env');

function todayUz() {
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date());
}

function todayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isToday(value) {
  return value ? todayKey(value) === todayKey() : false;
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percent(part, total) {
  return total ? round((Number(part || 0) / Number(total || 0)) * 100, 1) : 0;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff / 60000 : null;
}

function average(values) {
  const clean = values.filter(value => Number.isFinite(value));
  if (!clean.length) return 0;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length, 1);
}

function formatNumber(value) {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function normalizeStatsText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[‘’ʼʻ`']/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function employeeLabel(employee = {}) {
  const username = employee.username ? ` @${employee.username}` : '';
  return `${employee.full_name || employee.closed_by_name || 'Xodim'}${username}`;
}

function buildTodayEmployeeRows(requests, employees) {
  const employeeMap = new Map(employees.map(employee => [employee.id || employee.employee_id, employee]));
  const todayClosed = requests.filter(request => request.status === 'closed' && isToday(request.closed_at) && request.closed_by_employee_id);
  const grouped = new Map();

  todayClosed.forEach(request => {
    const key = request.closed_by_employee_id;
    const employee = employeeMap.get(key) || {};
    const row = grouped.get(key) || {
      employee_id: key,
      full_name: employee.full_name || request.closed_by_name || 'Xodim',
      username: employee.username || '',
      closed_requests: 0,
      chats: new Set(),
      close_minutes: []
    };
    row.closed_requests += 1;
    if (request.chat_id) row.chats.add(String(request.chat_id));
    const closeMinutes = minutesBetween(request.created_at, request.closed_at);
    if (closeMinutes !== null) row.close_minutes.push(closeMinutes);
    grouped.set(key, row);
  });

  return [...grouped.values()]
    .map(row => ({
      ...row,
      handled_chats: row.chats.size,
      avg_close_minutes: average(row.close_minutes),
      close_share_pct: percent(row.closed_requests, todayClosed.length)
    }))
    .sort((a, b) => b.closed_requests - a.closed_requests || a.full_name.localeCompare(b.full_name));
}

function buildOpenGroupRows(requests, chats) {
  const chatMap = new Map(chats.map(chat => [String(chat.chat_id), chat]));
  const grouped = new Map();

  requests
    .filter(request => request.source_type === 'group' && request.status === 'open')
    .forEach(request => {
      const key = String(request.chat_id);
      const chat = chatMap.get(key) || {};
      const row = grouped.get(key) || {
        chat_id: request.chat_id,
        title: chat.title || key,
        open_requests: 0
      };
      row.open_requests += 1;
      grouped.set(key, row);
    });

  return [...grouped.values()]
    .sort((a, b) => b.open_requests - a.open_requests)
    .slice(0, 5);
}

async function loadMainStatsData() {
  const [summaryRows, employees, chats, requests] = await Promise.all([
    stats.selectTodaySummary({ select: '*', limit: '1' }),
    supabase.select('employees', { select: 'id,full_name,username,is_active', is_active: 'eq.true', limit: '1000' }).catch(() => []),
    stats.selectChatStatistics({ select: '*', order: 'open_requests.desc', limit: '50' }).catch(() => []),
    supabase.select('support_requests', {
      select: 'id,source_type,chat_id,status,closed_by_employee_id,closed_by_name,created_at,closed_at',
      order: 'created_at.desc',
      limit: '10000'
    }).catch(() => [])
  ]);

  return { summaryRows, employees, chats, requests };
}

function mainStatsQuestionIntents(text = '') {
  const value = normalizeStatsText(text);
  const hasEmployee = /\b(?:xodim|hodim|employee|сотрудник)\w*\b/i.test(value);
  const hasTicket = /\b(?:ticket|tiket|so'?rov|sorov|murojaat|request|zayavka|заявк)\w*\b/i.test(value);
  const hasToday = /\b(?:bugun|bugungi|today|сегодня)\b/i.test(value);
  const wantsTopCloser = hasEmployee && (
    /\beng\s+(?:kop|ko'p|ko‘p)\b.*\b(?:yop|closed|закр)\w*/i.test(value)
    || hasTicket && /\b(?:kim|qaysi|qaysi\s+biri)\b.*\b(?:yop|closed|закр)\w*/i.test(value)
    || hasTicket && /\b(?:yopgan|yopdi|yopilgan)\b.*\b(?:xodim|hodim|employee)\w*/i.test(value)
  );
  const wantsActiveEmployee = hasEmployee && /\beng\s+faol\b|\bfaol\s+(?:xodim|hodim|employee)\w*/i.test(value);
  const wantsOpenToday = hasTicket && (
    /\b(?:nechta|qancha|necha|сколько|how many)\b.*\b(?:ochiq|qoldi|qolgan|open)\w*/i.test(value)
    || /\b(?:ochiq|open)\w*\b.*\b(?:qoldi|qolgan|turibdi|bor)\b/i.test(value)
  );
  const wantsAllClosed = hasTicket && (
    /\b(?:barcha|hamma|jami|hammasi|all|все)\b.*\b(?:yopildimi|yopilganmi|yopildi|closed|закрыт)\w*/i.test(value)
    || /\b(?:yopildimi|yopilganmi)\b.*\b(?:barcha|hamma|jami|hammasi)\b/i.test(value)
  );

  if (!(hasEmployee || hasTicket || hasToday)) return null;
  if (!(wantsTopCloser || wantsActiveEmployee || wantsOpenToday || wantsAllClosed)) return null;
  return { wantsTopCloser, wantsActiveEmployee, wantsOpenToday, wantsAllClosed };
}

function buildMainStatsQuestionText({ text, summaryRows, employees, requests }) {
  const intents = mainStatsQuestionIntents(text);
  if (!intents) return '';

  const summary = summaryRows[0] || {};
  const todayCreated = requests.filter(request => isToday(request.created_at));
  const todayClosed = requests.filter(request => request.status === 'closed' && isToday(request.closed_at));
  const todayCreatedOpen = todayCreated.filter(request => request.status === 'open');
  const openRequests = requests.filter(request => request.status === 'open');
  const employeeRows = buildTodayEmployeeRows(requests, employees);
  const lines = ['📌 <b>Bugungi holat</b>\n'];

  if (intents.wantsActiveEmployee || intents.wantsTopCloser) {
    const top = employeeRows[0];
    if (!top) {
      lines.push('Bugun hali hech kim ticket yopmagan.');
    } else if (intents.wantsActiveEmployee && !intents.wantsTopCloser) {
      lines.push(`Eng faol xodim: <b>${escapeHtml(employeeLabel(top))}</b>`);
      lines.push(`Yopgan ticket: <b>${formatNumber(top.closed_requests)}</b> ta, ishlagan chat: <b>${formatNumber(top.handled_chats)}</b> ta.`);
    } else {
      lines.push(`Eng ko‘p ticket yopgan xodim: <b>${escapeHtml(employeeLabel(top))}</b>`);
      lines.push(`Bugun yopgan ticket: <b>${formatNumber(top.closed_requests)}</b> ta.`);
    }
  }

  if (intents.wantsOpenToday) {
    lines.push(`Bugun ochiq qolgan ticket: <b>${formatNumber(todayCreatedOpen.length)}</b> ta.`);
    lines.push(`Hozir jami ochiq ticket: <b>${formatNumber(openRequests.length || summary.open_requests || 0)}</b> ta.`);
  }

  if (intents.wantsAllClosed) {
    if (!todayCreated.length) {
      lines.push('Bugun hali so‘rov tushmagan.');
    } else if (!todayCreatedOpen.length) {
      lines.push(`Ha, bugun tushgan <b>${formatNumber(todayCreated.length)}</b> ta so‘rovning barchasi yopilgan.`);
    } else {
      lines.push(`Yo‘q, bugun tushgan <b>${formatNumber(todayCreated.length)}</b> ta so‘rovdan <b>${formatNumber(todayCreatedOpen.length)}</b> tasi ochiq qolgan.`);
    }
  }

  if (lines.length === 1) return '';
  return lines.join('\n');
}

async function buildMainStatsQuestionReply(text = '') {
  const data = await loadMainStatsData();
  return buildMainStatsQuestionText({ text, ...data });
}

async function buildMainStatsReport() {
  const { summaryRows, employees, chats, requests } = await loadMainStatsData();

  const summary = summaryRows[0] || {};
  const todayCreated = requests.filter(request => isToday(request.created_at));
  const todayClosed = requests.filter(request => request.status === 'closed' && isToday(request.closed_at));
  const todayCreatedClosed = todayCreated.filter(request => request.status === 'closed');
  const openRequests = requests.filter(request => request.status === 'open');
  const groupToday = todayCreated.filter(request => request.source_type === 'group');
  const privateToday = todayCreated.filter(request => ['private', 'business'].includes(request.source_type));
  const employeeRows = buildTodayEmployeeRows(requests, employees);
  const openGroupRows = buildOpenGroupRows(requests, chats);
  const lines = [];
  lines.push('📊 <b>Bugungi xodimlar statistikasi</b>');
  lines.push(`🗓 ${escapeHtml(todayUz())}`);
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('📌 <b>Umumiy holat</b>');
  lines.push(`• Bugun tushgan so‘rovlar: <b>${formatNumber(todayCreated.length || summary.total_requests || 0)}</b>`);
  lines.push(`• Bugun yopilgan ticketlar: <b>${formatNumber(todayClosed.length || summary.closed_requests || 0)}</b>`);
  lines.push(`• Hozir ochiq ticketlar: <b>${formatNumber(openRequests.length || summary.open_requests || 0)}</b>`);
  lines.push(`• Bugungi yopilish foizi: <b>${formatNumber(percent(todayCreatedClosed.length, todayCreated.length))}%</b>`);
  lines.push(`• Guruhlardan tushgan: <b>${formatNumber(groupToday.length)}</b>`);
  lines.push(`• Shaxsiy chatlardan: <b>${formatNumber(privateToday.length)}</b>`);
  lines.push('');
  lines.push('👥 <b>Xodimlar kesimi</b>');

  if (!employeeRows.length) {
    lines.push('Bugun hali hech kim ticket yopmagan.');
  } else {
    employeeRows.slice(0, 10).forEach((employee, index) => {
      lines.push(`${index + 1}. <b>${escapeHtml(employeeLabel(employee))}</b>`);
      lines.push(`   ✅ ${formatNumber(employee.closed_requests)} ta yopildi · ulush ${formatNumber(employee.close_share_pct)}% · o‘rtacha ${formatNumber(employee.avg_close_minutes)} min`);
    });
  }

  lines.push('');
  lines.push('🧾 <b>Ochiq qolgan guruhlar</b>');
  if (!openGroupRows.length) {
    lines.push('Guruhlarda ochiq ticket yo‘q.');
  } else {
    openGroupRows.forEach(row => {
      lines.push(`• ${escapeHtml(row.title || String(row.chat_id))}: <b>${formatNumber(row.open_requests)}</b> ochiq`);
    });
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

function normalizeChatId(value) {
  const text = String(value || '').trim();
  return text || '';
}

async function getMainGroupFromSettings() {
  const rows = await supabase.select('bot_settings', {
    select: 'value',
    key: 'eq.main_group',
    limit: '1'
  }).catch(() => []);
  const value = rows[0] && rows[0].value;
  return normalizeChatId(value && (value.chat_id || value.chatId));
}

async function getSingleActiveGroup() {
  const groups = await supabase.select('tg_chats', {
    select: 'chat_id,title',
    source_type: 'eq.group',
    is_active: 'eq.true',
    limit: '2'
  }).catch(() => []);
  if (groups.length === 1) return normalizeChatId(groups[0].chat_id);
  return '';
}

async function resolveMainStatsChatId(chatId) {
  const explicit = normalizeChatId(chatId);
  if (explicit) return explicit;

  const settingsGroup = await getMainGroupFromSettings();
  if (settingsGroup) return settingsGroup;

  const envGroup = normalizeChatId(optionalEnv('MAIN_GROUP_ID', ''));
  if (envGroup) return envGroup;

  const singleGroup = await getSingleActiveGroup();
  if (singleGroup) return singleGroup;

  throw new Error('Main guruh tanlanmagan. Botni guruhga qo‘shing, /start yoki guruhga xabar yuboring, keyin Sozlamalar bo‘limida Main guruh chat ID ni saqlang.');
}

function explainTelegramSendError(error, target) {
  const description = String(error && error.telegram && error.telegram.description || error.message || '');
  if (/chat not found/i.test(description)) {
    return new Error(`Main guruh topilmadi (${target}). Chat ID noto‘g‘ri yoki bot bu guruhda yo‘q. Botni guruhga admin qilib qo‘shing va guruh chat_id sini -100... formatida saqlang.`);
  }
  if (/bot was kicked|bot is not a member|not enough rights/i.test(description)) {
    return new Error(`Bot main guruhga xabar yubora olmayapti (${target}). Botni guruhga qayta qo‘shing va xabar yuborish huquqini bering.`);
  }
  if (/forbidden/i.test(description)) {
    return new Error(`Telegram ruxsat bermadi (${target}). Bot guruhda borligi va yozish huquqi borligini tekshiring.`);
  }
  return error;
}

async function sendMainStatsReport(chatId) {
  const target = await resolveMainStatsChatId(chatId);
  const text = await buildMainStatsReport();
  let result;
  try {
    result = await sendMessage(target, text);
  } catch (error) {
    throw explainTelegramSendError(error, target);
  }
  return { chat_id: target, message_id: result.message_id, text };
}

module.exports = { buildMainStatsReport, buildMainStatsQuestionReply, resolveMainStatsChatId, sendMainStatsReport };
