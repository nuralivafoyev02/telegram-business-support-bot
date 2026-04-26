'use strict';

const assert = require('assert');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';

const supabase = require('../backend/lib/supabase');
const { buildMainStatsReport, resolveMainStatsChatId, sendMainStatsReport } = require('../backend/lib/report');

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

async function testBuildMainStatsReportUsesTodayEmployeeClosures() {
  const originalSelect = supabase.select;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString();

  supabase.select = async table => {
    if (table === 'v_today_summary') {
      return [{ total_requests: 2, open_requests: 1, closed_requests: 1, groups_count: 1 }];
    }
    if (table === 'employees') {
      return [{ id: 'employee-1', full_name: 'Ali Valiyev', username: 'ali' }];
    }
    if (table === 'v_chat_statistics') {
      return [{ chat_id: -1001, title: 'Main support', open_requests: 1 }];
    }
    if (table === 'support_requests') {
      return [
        {
          id: 'request-1',
          source_type: 'group',
          chat_id: -1001,
          status: 'closed',
          closed_by_employee_id: 'employee-1',
          closed_by_name: 'Ali Valiyev',
          created_at: today,
          closed_at: today
        },
        {
          id: 'request-2',
          source_type: 'group',
          chat_id: -1001,
          status: 'open',
          created_at: today,
          closed_at: null
        },
        {
          id: 'request-old',
          source_type: 'group',
          chat_id: -1001,
          status: 'closed',
          closed_by_employee_id: 'employee-1',
          closed_by_name: 'Ali Valiyev',
          created_at: yesterday,
          closed_at: yesterday
        }
      ];
    }
    return [];
  };

  try {
    const text = await buildMainStatsReport();
    assert.match(text, /Bugungi xodimlar statistikasi/);
    assert.match(text, /Bugun tushgan so‘rovlar: <b>2<\/b>/);
    assert.match(text, /Ali Valiyev @ali/);
    assert.match(text, /1 ta yopildi/);
    assert.match(text, /Main support/);
  } finally {
    supabase.select = originalSelect;
  }
}

(async () => {
  await testResolveFromSettings();
  await testResolveFromSingleActiveGroup();
  await testChatNotFoundMessage();
  await testBuildMainStatsReportUsesTodayEmployeeClosures();
  console.log('Report tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
