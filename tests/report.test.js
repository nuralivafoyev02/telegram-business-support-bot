'use strict';

const assert = require('assert');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';

const supabase = require('../backend/lib/supabase');
const { resolveMainStatsChatId, sendMainStatsReport } = require('../backend/lib/report');

async function testResolveFromSettings() {
  const originalSelect = supabase.select;
  const originalEnv = process.env.MAIN_GROUP_ID;

  delete process.env.MAIN_GROUP_ID;
  supabase.select = async table => {
    if (table === 'bot_settings') return [{ value: { chat_id: '-100111' } }];
    return [];
  };

  try {
    const chatId = await resolveMainStatsChatId();
    assert.strictEqual(chatId, '-100111');
  } finally {
    supabase.select = originalSelect;
    if (originalEnv === undefined) delete process.env.MAIN_GROUP_ID;
    else process.env.MAIN_GROUP_ID = originalEnv;
  }
}

async function testResolveFromSingleActiveGroup() {
  const originalSelect = supabase.select;
  const originalEnv = process.env.MAIN_GROUP_ID;

  delete process.env.MAIN_GROUP_ID;
  supabase.select = async table => {
    if (table === 'bot_settings') return [];
    if (table === 'tg_chats') return [{ chat_id: -100222, title: 'Main' }];
    return [];
  };

  try {
    const chatId = await resolveMainStatsChatId();
    assert.strictEqual(chatId, '-100222');
  } finally {
    supabase.select = originalSelect;
    if (originalEnv === undefined) delete process.env.MAIN_GROUP_ID;
    else process.env.MAIN_GROUP_ID = originalEnv;
  }
}

async function testChatNotFoundMessage() {
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;

  supabase.select = async table => {
    if (table === 'v_today_summary') return [{}];
    if (table === 'v_employee_statistics') return [];
    if (table === 'v_chat_statistics') return [];
    return [];
  };
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: chat not found' })
  });

  try {
    await assert.rejects(
      () => sendMainStatsReport('-100404'),
      /Main guruh topilmadi \(-100404\)/
    );
  } finally {
    supabase.select = originalSelect;
    global.fetch = originalFetch;
  }
}

(async () => {
  await testResolveFromSettings();
  await testResolveFromSingleActiveGroup();
  await testChatNotFoundMessage();
  console.log('Report tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
