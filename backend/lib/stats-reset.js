'use strict';

const supabase = require('./supabase');

const STATS_RESET_SETTINGS_KEY = 'stats_reset_at';

// "Statistikani boshidan boshlash" — bazadagi eski ticket yozuvlari
// o'chirilmaydi, faqat shu vaqtdan OLDINGI yozuvlar support statistikasi
// hisob-kitoblariga (Support faoliyati, Hodimlar reytingi, ticket ro'yxati,
// kunlik Telegram hisoboti) kirmay qo'yadi — bazaga hech narsa yo'qolmaydi.
async function getStatsResetAt() {
  const rows = await supabase.select('bot_settings', {
    select: 'value',
    key: supabase.eq(STATS_RESET_SETTINGS_KEY),
    limit: '1'
  }).catch(() => []);
  const value = rows[0] && rows[0].value;
  const resetAt = value && value.reset_at ? String(value.reset_at) : '';
  return resetAt && !Number.isNaN(new Date(resetAt).getTime()) ? resetAt : '';
}

async function setStatsResetAt() {
  const resetAt = new Date().toISOString();
  await supabase.insert('bot_settings', [{
    key: STATS_RESET_SETTINGS_KEY,
    value: { reset_at: resetAt },
    updated_at: resetAt
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return { reset_at: resetAt };
}

function clampWindowStart(window, resetAt) {
  if (!resetAt) return window;
  if (!window) return { start: resetAt, end: '' };
  if (!window.start || resetAt > window.start) return { ...window, start: resetAt };
  return window;
}

module.exports = { getStatsResetAt, setStatsResetAt, clampWindowStart };
