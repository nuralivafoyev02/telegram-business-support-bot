'use strict';

const assert = require('assert');
const { Readable } = require('stream');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'test-admin-secret';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = require('../backend/lib/supabase');
const stats = require('../backend/lib/stats');
const { createToken } = require('../backend/lib/auth');
const handler = require('../backend/api/admin');

function createReq(body, token) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = 'POST';
  req.url = '/api/admin?action=settings';
  req.headers = {
    host: 'localhost',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };
  return req;
}

function createAdminReq({ action = 'dashboard', method = 'GET', query = {}, body = null, token }) {
  const chunks = method === 'POST' ? [JSON.stringify(body || {})] : [];
  const req = Readable.from(chunks);
  const params = new URLSearchParams({ action, ...query });
  req.method = method;
  req.url = `/api/admin?${params.toString()}`;
  req.headers = {
    host: 'localhost',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(chunk = '') {
      this.body += String(chunk);
      this.finished = true;
    }
  };
}

async function callSettings(body) {
  const res = createRes();
  const token = createToken({ id: 'admin-1', username: 'admin', role: 'owner' });
  await handler(createReq(body, token), res);
  return { status: res.statusCode, payload: JSON.parse(res.body) };
}

async function callAdmin(action, { method = 'GET', query = {}, body = null } = {}) {
  const res = createRes();
  const token = createToken({ id: 'admin-1', username: 'admin', role: 'owner' });
  await handler(createAdminReq({ action, method, query, body, token }), res);
  return { status: res.statusCode, payload: JSON.parse(res.body) };
}

async function testAiModeEnableSendsMainGroupNotice() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let insertedRows = null;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    insertedRows = rows;
    return rows;
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 501 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: true, provider: null } },
        { key: 'main_group', value: { chat_id: '-100777' } },
        { key: 'done_tag', value: { tag: '#done', auto_reply: true } },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(insertedRows.some(row => row.key === 'ai_mode' && row.value.enabled === true), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100777');
    assert.match(telegramCalls[0].body.text, /⚡️ <b>AI mode faollashtirildi<\/b>/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testAiModeDisableSendsMainGroupNotice() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let insertedRows = null;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: true, provider: null } },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    insertedRows = rows;
    return rows;
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 502 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: false, provider: null } },
        { key: 'main_group', value: { chat_id: '-100777' } },
        { key: 'done_tag', value: { tag: '#done', auto_reply: true } },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(insertedRows.some(row => row.key === 'ai_mode' && row.value.enabled === false), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100777');
    assert.match(telegramCalls[0].body.text, /⚡️ <b>AI mode o‘chirildi<\/b>/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testAutoReplySettingSaved() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  let insertedRows = null;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    insertedRows = rows;
    return rows;
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: false, provider: null } },
        { key: 'auto_reply', value: { enabled: true } },
        { key: 'main_group', value: { chat_id: '-100777' } },
        { key: 'done_tag', value: { tag: '#done', auto_reply: true } },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(insertedRows.some(row => row.key === 'auto_reply' && row.value.enabled === true), true);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
  }
}

async function testAutoReplyNotificationSendsMainGroupMessage() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let insertedRows = null;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'auto_reply', value: { enabled: false } },
      { key: 'main_group', value: { chat_id: '-100777' } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    insertedRows = rows;
    return rows;
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 601 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'auto_reply', value: { enabled: true } },
        { key: 'main_group', value: { chat_id: '-100777' } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(insertedRows.some(row => row.key === 'auto_reply' && row.value.enabled === true), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100777');
    assert.match(telegramCalls[0].body.text, /Avto javob rejimi yoqildi/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testAiIntegrationSaveMasksTokenAndNotifiesMainGroup() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    return rows;
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 503 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [{
        key: 'ai_integration',
        value: {
          enabled: true,
          provider: 'openai_compatible',
          label: 'Uyqur AI',
          base_url: 'https://ai.example/v1',
          model: 'uyqur-model',
          api_key: 'secret-token',
          system_prompt: 'Classify support requests',
          knowledge_text: 'Uyqurda obyekt va smeta bor.'
        }
      }]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    const integration = result.payload.data.find(row => row.key === 'ai_integration').value;
    assert.strictEqual(integration.api_key, '');
    assert.strictEqual(integration.has_api_key, true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /⚡️ <b>AI model ulandi<\/b>/);
    assert.match(telegramCalls[0].body.text, /Uyqur AI/);
    assert.doesNotMatch(JSON.stringify(result.payload), /secret-token/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testPrivateChatsExcludeEmployees() {
  const originalSelect = supabase.select;
  const originalStats = stats.selectChatStatistics;

  stats.selectChatStatistics = async (query) => {
    assert.strictEqual(query.source_type, 'in.(private,business)');
    return [
      { chat_id: 101, title: 'Mijoz chat', source_type: 'private', total_requests: 1 },
      { chat_id: 202, title: 'Xodim chat', source_type: 'private', total_requests: 0 },
      { chat_id: 303, title: 'Business mijoz', source_type: 'business', total_requests: 2 }
    ];
  };
  supabase.select = async (table) => {
    assert.strictEqual(table, 'employees');
    return [{ id: 'emp-1', tg_user_id: 202, full_name: 'Support xodim' }];
  };

  try {
    const result = await callAdmin('privates');
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.payload.data.map(row => row.chat_id), [101, 303]);
  } finally {
    supabase.select = originalSelect;
    stats.selectChatStatistics = originalStats;
  }
}

async function testChatDetailIncludesTicketSolutionAndTimeline() {
  const originalSelect = supabase.select;
  const chatId = 101;
  const requestId = 'request-1';

  supabase.select = async (table) => {
    if (table === 'tg_chats') {
      return [{ chat_id: chatId, title: 'Mijoz chat', source_type: 'private', is_active: true, last_message_at: '2026-04-27T08:10:00.000Z' }];
    }
    if (table === 'support_requests') {
      return [{
        id: requestId,
        source_type: 'private',
        chat_id: chatId,
        customer_name: 'Mijoz',
        customer_username: 'client',
        initial_message_id: 11,
        initial_text: 'Lift ishlamayapti',
        status: 'closed',
        closed_at: '2026-04-27T08:05:00.000Z',
        closed_by_employee_id: 'emp-1',
        closed_by_name: 'Ali',
        done_message_id: 55,
        created_at: '2026-04-27T08:00:00.000Z'
      }];
    }
    if (table === 'messages') {
      return [
        {
          tg_message_id: 11,
          chat_id: chatId,
          from_tg_user_id: 808,
          from_name: 'Mijoz',
          from_username: 'client',
          source_type: 'private',
          text: 'Lift ishlamayapti',
          classification: 'request',
          employee_id: null,
          raw: {
            message_id: 11,
            photo: [
              { file_id: 'small-photo', width: 90, height: 90, file_size: 300 },
              { file_id: 'large-photo', width: 1280, height: 720, file_size: 8000 }
            ],
            caption: 'Lift ishlamayapti'
          },
          created_at: '2026-04-27T08:00:00.000Z'
        },
        {
          tg_message_id: 55,
          chat_id: chatId,
          from_tg_user_id: 909,
          from_name: 'Ali',
          from_username: 'ali',
          source_type: 'private',
          text: 'Lift qayta ishga tushirildi',
          classification: 'message',
          employee_id: 'emp-1',
          raw: {},
          created_at: '2026-04-27T08:04:00.000Z'
        }
      ];
    }
    if (table === 'employees') {
      return [{ id: 'emp-1', tg_user_id: 909, full_name: 'Ali', username: 'ali', role: 'support', is_active: true }];
    }
    if (table === 'request_events') {
      return [{
        id: 'event-1',
        request_id: requestId,
        chat_id: chatId,
        tg_message_id: 55,
        event_type: 'closed',
        actor_tg_id: 909,
        actor_name: 'Ali',
        employee_id: 'emp-1',
        text: 'Lift qayta ishga tushirildi',
        raw: {},
        created_at: '2026-04-27T08:05:00.000Z'
      }];
    }
    return [];
  };

  try {
    const result = await callAdmin('chatDetail', { query: { chat_id: chatId } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.chat.total_requests, 1);
    assert.strictEqual(result.payload.data.requests[0].solution_text, 'Lift qayta ishga tushirildi');
    assert.strictEqual(result.payload.data.requests[0].solution_by, 'Ali');
    assert.strictEqual(result.payload.data.timeline.some(item => item.type === 'solution' && item.request_text === 'Lift ishlamayapti'), true);
    assert.strictEqual(result.payload.data.timeline.some(item => item.type === 'employee_reply' && item.message_id === 55), false);
    assert.strictEqual(result.payload.data.conversation[0].direction, 'inbound');
    assert.strictEqual(result.payload.data.conversation[0].media.kind, 'photo');
    assert.strictEqual(result.payload.data.conversation[0].media.file_id, 'large-photo');
    assert.strictEqual(result.payload.data.conversation[1].direction, 'outbound');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testSendToChatStoresOutgoingAdminMessage() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const inserts = [];
  const telegramCalls = [];

  supabase.select = async (table) => {
    assert.strictEqual(table, 'tg_chats');
    return [{ chat_id: 101, title: 'Mijoz chat', source_type: 'private', business_connection_id: null }];
  };
  supabase.insert = async (table, rows, options = {}) => {
    inserts.push({ table, rows, options });
    if (table === 'broadcasts') return [{ id: 'broadcast-1', ...rows[0] }];
    return rows;
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 7001 } })
    };
  };

  try {
    const result = await callAdmin('sendMessage', {
      method: 'POST',
      body: { chat_id: 101, text: 'Muammo hal qilindi' }
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.sent, true);
    assert.strictEqual(telegramCalls[0].body.text, 'Muammo hal qilindi');

    const messageInsert = inserts.find(item => item.table === 'messages');
    assert.ok(messageInsert);
    assert.strictEqual(messageInsert.rows[0].tg_message_id, 7001);
    assert.strictEqual(messageInsert.rows[0].classification, 'admin_reply');
    assert.strictEqual(messageInsert.rows[0].raw.source, 'admin_send');

    const targetInsert = inserts.find(item => item.table === 'broadcast_targets');
    assert.ok(targetInsert);
    assert.strictEqual(targetInsert.rows[0].telegram_message_id, 7001);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function run() {
  await testAiModeEnableSendsMainGroupNotice();
  await testAiModeDisableSendsMainGroupNotice();
  await testAutoReplyNotificationSendsMainGroupMessage();
  await testAiIntegrationSaveMasksTokenAndNotifiesMainGroup();
  await testPrivateChatsExcludeEmployees();
  await testChatDetailIncludesTicketSolutionAndTimeline();
  await testSendToChatStoresOutgoingAdminMessage();
  console.log('Admin tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
