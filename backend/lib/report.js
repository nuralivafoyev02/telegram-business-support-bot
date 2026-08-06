'use strict';

const supabase = require('./supabase');
const stats = require('./stats');
const { sendMessage, escapeHtml } = require('./telegram');
const { optionalEnv } = require('./env');
const { getCachedCompanyInfo, resolveCachedCompanyInfoCompanies } = require('./company-info');
const { groupChatKeys, telegramIdKey } = require('./company-resolution');

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

// Kunlik hisobot uchun — "bugungi" sonlar tungi 00:00'dan emas, ish kuni
// boshlanishi (ertalab soat 9:00, Toshkent) dan boshlab sanaladi. Boshqa
// joylarda (masalan guruh ichida savolga javob berishda) ishlatiladigan
// oddiy isToday()'ga tegilmaydi — bu faqat kunlik hisobotga xos.
function isTodayFromNine(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const nineAmToday = new Date(`${todayKey()}T09:00:00+05:00`).getTime();
  return time >= nineAmToday;
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

function buildTodayEmployeeRows(requests, employees, { fromNine = false } = {}) {
  const employeeMap = new Map(employees.map(employee => [employee.id || employee.employee_id, employee]));
  const matchesToday = fromNine ? isTodayFromNine : isToday;
  // "Bugun yopilgan ticketlar" umumiy soni (buildMainStatsReport'da) HECH
  // QANDAY attribution talab qilmaydi — shuning uchun bu yerda ham xuddi
  // shu to'plam (barcha bugun yopilgan) olinadi, aks holda "Bugun yopilgan: 1"
  // lekin "hech kim yopmagan" degan qarama-qarshilik chiqadi. closed_by_employee_id
  // yoki closed_by_name topilmasa — "Aniqlanmagan" nomi bilan alohida
  // ko'rsatiladi, sonlar hech qachon "yo'qolib qolmasin" uchun.
  const todayClosed = requests.filter(request => request.status === 'closed' && matchesToday(request.closed_at));
  const grouped = new Map();

  todayClosed.forEach(request => {
    const key = request.closed_by_employee_id || (request.closed_by_name ? `name:${request.closed_by_name}` : 'unattributed');
    const employee = request.closed_by_employee_id ? (employeeMap.get(request.closed_by_employee_id) || {}) : {};
    const row = grouped.get(key) || {
      employee_id: request.closed_by_employee_id || '',
      full_name: employee.full_name || request.closed_by_name || 'Aniqlanmagan',
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
  const [summaryRows, employees, chats, requests, companyInfoCache] = await Promise.all([
    stats.selectTodaySummary({ select: '*', limit: '1' }),
    supabase.select('employees', { select: 'id,full_name,username,role,is_active', is_active: 'eq.true', limit: '1000' }).catch(() => []),
    stats.selectChatStatistics({ select: '*', order: 'open_requests.desc', limit: '50' }).catch(() => []),
    supabase.select('support_requests', {
      select: 'id,source_type,chat_id,status,closed_by_employee_id,closed_by_name,created_at,closed_at',
      order: 'created_at.desc',
      limit: '10000'
    }).catch(() => []),
    getCachedCompanyInfo().catch(() => null)
  ]);

  return { summaryRows, employees, chats, requests, companyInfoCache };
}

// Kompaniyaga tayinlangan support (company.uyqur_support_username) qaysi
// xodimga tegishli ekanini aniqlash — "Hodimlar reytingi"dagi bilan bir xil
// (username yoki to'liq ism bo'yicha) moslashtirish mantig'i, faqat shu
// yerga xos ixcham nusxasi.
function supportIdentityKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function supportIdentitiesMatch(left = '', right = '') {
  const a = supportIdentityKey(left);
  const b = supportIdentityKey(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function findEmployeeForCompanySupport(company = {}, supportEmployees = []) {
  const target = supportIdentityKey(company.uyqur_support_username || '');
  if (!target) return null;
  return supportEmployees.find(employee => {
    const keys = [supportIdentityKey(employee.username), supportIdentityKey(employee.full_name)].filter(Boolean);
    return keys.some(key => supportIdentitiesMatch(key, target));
  }) || null;
}

// Har bir xodim qaysi kompaniya(lar)ning guruh chatlariga mas'ul ekanini
// chat_id -> employee xaritasiga yig'ib beradi — "tushgan"/"qolgan" sonlarini
// shu chatlar bo'yicha hisoblash uchun.
function buildChatToEmployeeMap(companyInfoCache, employees) {
  const companyInfoCompanies = resolveCachedCompanyInfoCompanies(companyInfoCache);
  const supportEmployees = employees.filter(employee => String(employee.role || '').trim().toLowerCase() === 'support');
  const map = new Map();
  companyInfoCompanies.forEach(company => {
    const employee = findEmployeeForCompanySupport(company, supportEmployees);
    if (!employee) return;
    (Array.isArray(company.groups) ? company.groups : []).forEach(group => {
      groupChatKeys(group).forEach(chatId => map.set(chatId, employee));
    });
  });
  return map;
}

// Har bir support xodimi bo'yicha: bugun (soat 9:00'dan) nechta so'rov
// tushgani, nechtasi yopilgani va hozir nechtasi ochiq qolgani.
// "Tushgan"/"qolgan" — chat qaysi xodimning kompaniyasiga tegishli ekaniga
// qarab (chatToEmployeeMap). "Yopgan" — birinchi navbatda TO'G'RIDAN-TO'G'RI
// closed_by_employee_id (kim aniq yopgani ma'lum bo'lsa, eng ishonchli manba),
// faqat u bo'sh bo'lsa chat egasiga yoziladi — shu bilan kompaniya-support
// moslashuvi sozlanmagan bo'lsa ham "yopgan" son yo'qolib qolmaydi.
function buildTodaySupportRows(requests, employees, chatToEmployeeMap) {
  const employeeById = new Map(employees.map(employee => [employee.id || employee.employee_id, employee]));
  const grouped = new Map();
  const ensureRow = (key, fallbackEmployee = {}) => {
    if (!grouped.has(key)) {
      const employee = employeeById.get(key) || fallbackEmployee;
      grouped.set(key, {
        employee_id: key,
        full_name: employee.full_name || 'Xodim',
        username: employee.username || '',
        incoming: 0,
        closed: 0,
        open: 0
      });
    }
    return grouped.get(key);
  };

  requests.forEach(request => {
    const chatEmployee = chatToEmployeeMap.get(telegramIdKey(request.chat_id));
    const chatEmployeeKey = chatEmployee ? (chatEmployee.id || chatEmployee.employee_id) : '';
    if (chatEmployee && isTodayFromNine(request.created_at)) {
      ensureRow(chatEmployeeKey, chatEmployee).incoming += 1;
      if (request.status === 'open') ensureRow(chatEmployeeKey, chatEmployee).open += 1;
    }
    if (request.status === 'closed' && isTodayFromNine(request.closed_at)) {
      if (request.closed_by_employee_id) {
        ensureRow(request.closed_by_employee_id, { full_name: request.closed_by_name }).closed += 1;
      } else if (chatEmployee) {
        ensureRow(chatEmployeeKey, chatEmployee).closed += 1;
      } else if (request.closed_by_name) {
        ensureRow(`name:${request.closed_by_name}`, { full_name: request.closed_by_name }).closed += 1;
      } else {
        ensureRow('unattributed', { full_name: 'Aniqlanmagan' }).closed += 1;
      }
    }
  });

  return [...grouped.values()]
    .filter(row => row.incoming || row.closed || row.open)
    .sort((a, b) => b.closed - a.closed || b.incoming - a.incoming || a.full_name.localeCompare(b.full_name));
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

function isMainStatsQuestion(text = '') {
  return !!mainStatsQuestionIntents(text);
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
      lines.push(`Yopilgan ticketlar: <b>${formatNumber(top.closed_requests)}</b> ta, jami: <b>${formatNumber(top.handled_chats)}</b> ta chatdan.`);
    } else {
      lines.push(`Eng ko‘p ticket yopgan xodim: <b>${escapeHtml(employeeLabel(top))}</b>`);
      lines.push(`Bugun yopilgan ticketlar: <b>${formatNumber(top.closed_requests)}</b> ta.`);
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
  const { employees, requests, companyInfoCache } = await loadMainStatsData();

  // Kunlik hisobot ataylab MINIMAL — faqat sana/vaqt va har bir support
  // bo'yicha bugun (soat 9:00'dan) nechtasiga javob bergani/nechtasi
  // qolgani. Boshqa hech narsa (umumiy holat, guruhlar ro'yxati) kerak
  // emas deb ayting so'ralgan.
  const chatToEmployeeMap = buildChatToEmployeeMap(companyInfoCache, employees);
  const supportRows = buildTodaySupportRows(requests, employees, chatToEmployeeMap);
  const divider = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
  const lines = [];
  lines.push('📊 <b>Bugungi xodimlar statistikasi</b>');
  lines.push(`🗓 ${escapeHtml(todayUz())} (soat 09:00 dan)`);
  lines.push(divider);
  lines.push('');

  if (!supportRows.length) {
    lines.push('Bugun hech bir xodimga ticket biriktirilmagan.');
  } else {
    supportRows.slice(0, 20).forEach((row, index) => {
      lines.push(`<b>${index + 1}. ${escapeHtml(employeeLabel(row))}</b> — ✅ ${formatNumber(row.closed)} javob berdi · 🔴 ${formatNumber(row.open)} qoldi`);
    });
  }

  lines.push('');
  lines.push(divider);
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

// Kunlik "Bugungi xodimlar statistikasi" hisoboti uchun — ataylab "Asosiy
// guruh"dan ALOHIDA sozlama, chunki Asosiy guruh log/audit bildirishnomalari
// uchun ham ishlatiladi va ularni aralashtirmaslik so'ralgan edi.
async function getDailyReportGroupFromSettings() {
  const rows = await supabase.select('bot_settings', {
    select: 'value',
    key: 'eq.daily_report_group',
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

  const dailyReportGroup = await getDailyReportGroupFromSettings();
  if (dailyReportGroup) return dailyReportGroup;

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

module.exports = { buildMainStatsReport, buildMainStatsQuestionReply, isMainStatsQuestion, resolveMainStatsChatId, sendMainStatsReport };
