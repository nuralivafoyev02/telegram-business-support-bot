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

async function buildMainStatsReport() {
  const [summaryRows, employees, chats] = await Promise.all([
    stats.selectTodaySummary({ select: '*', limit: '1' }),
    stats.selectEmployeeStatistics({ select: '*', order: 'closed_requests.desc', limit: '20' }),
    stats.selectChatStatistics({ select: '*', order: 'open_requests.desc', limit: '10' })
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

module.exports = { buildMainStatsReport, resolveMainStatsChatId, sendMainStatsReport };
