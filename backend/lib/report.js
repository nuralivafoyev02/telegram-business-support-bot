'use strict';

const supabase = require('./supabase');
const { sendMessage, escapeHtml } = require('./telegram');
const { optionalEnv, requiredEnv } = require('./env');

function todayUz() {
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date());
}

async function buildMainStatsReport() {
  const [summaryRows, employees, chats] = await Promise.all([
    supabase.select('v_today_summary', { select: '*', limit: '1' }),
    supabase.select('v_employee_statistics', { select: '*', order: 'closed_requests.desc', limit: '20' }),
    supabase.select('v_chat_statistics', { select: '*', order: 'open_requests.desc', limit: '10' })
  ]);

  const summary = summaryRows[0] || {};
  const lines = [];
  lines.push('📊 <b>Xodimlar statistikasi</b>');
  lines.push(`🕒 ${escapeHtml(todayUz())}`);
  lines.push('');
  lines.push(`• Bugungi so‘rovlar: <b>${summary.total_requests || 0}</b>`);
  lines.push(`• Ochiq so‘rovlar: <b>${summary.open_requests || 0}</b>`);
  lines.push(`• Bugun yopilgan: <b>${summary.closed_requests || 0}</b>`);
  lines.push(`• Aktiv guruhlar: <b>${summary.groups_count || 0}</b>`);
  lines.push('');
  lines.push('👤 <b>Top xodimlar</b>');

  const activeEmployees = employees.filter(e => Number(e.closed_requests || 0) > 0).slice(0, 10);
  if (!activeEmployees.length) {
    lines.push('Hozircha #done statistikasi yo‘q.');
  } else {
    activeEmployees.forEach((e, index) => {
      lines.push(`${index + 1}. ${escapeHtml(e.full_name || 'Xodim')} — yopgan: <b>${e.closed_requests || 0}</b>, o‘rtacha: ${e.avg_close_minutes || 0} min`);
    });
  }

  const openChats = chats.filter(c => Number(c.open_requests || 0) > 0).slice(0, 5);
  if (openChats.length) {
    lines.push('');
    lines.push('⚠️ <b>Ochiq so‘rov ko‘p chatlar</b>');
    openChats.forEach(c => lines.push(`• ${escapeHtml(c.title || String(c.chat_id))}: <b>${c.open_requests}</b> ochiq`));
  }

  return lines.join('\n');
}

async function sendMainStatsReport(chatId = optionalEnv('MAIN_GROUP_ID', '')) {
  const target = chatId || requiredEnv('MAIN_GROUP_ID');
  const text = await buildMainStatsReport();
  const result = await sendMessage(target, text);
  return { chat_id: target, message_id: result.message_id, text };
}

module.exports = { buildMainStatsReport, sendMainStatsReport };
