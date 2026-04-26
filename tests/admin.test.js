'use strict';

const assert = require('assert');
const { Readable } = require('stream');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'test-admin-secret';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = require('../backend/lib/supabase');
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

async function run() {
  await testAiModeEnableSendsMainGroupNotice();
  await testAiModeDisableSendsMainGroupNotice();
  console.log('Admin tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
