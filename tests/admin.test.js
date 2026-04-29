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
const { clearBotSettingsCache } = require('../backend/lib/bot-settings');
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

async function testAutoReplyDisableNotificationSendsMainGroupMessage() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let insertedRows = null;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'auto_reply', value: { enabled: true } },
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
      json: async () => ({ ok: true, result: { message_id: 602 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'auto_reply', value: { enabled: false } },
        { key: 'main_group', value: { chat_id: '-100777' } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(insertedRows.some(row => row.key === 'auto_reply' && row.value.enabled === false), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100777');
    assert.match(telegramCalls[0].body.text, /Avto javob rejimi o‘chirildi/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testFirstAutoReplyEnableStillNotifiesMainGroup() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'main_group', value: { chat_id: '-100777' } }
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
      json: async () => ({ ok: true, result: { message_id: 603 } })
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
    assert.strictEqual(telegramCalls.length, 1);
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
  const aiCalls = [];

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
    if (/ai\.example/.test(url)) {
      const body = JSON.parse(options.body);
      aiCalls.push({ url, body, headers: options.headers });
      assert.strictEqual(url, 'https://ai.example/v1/chat/completions');
      assert.strictEqual(options.headers.Authorization, 'Bearer secret-token');
      assert.strictEqual(body.model, 'uyqur-model');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      };
    }
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
    assert.strictEqual(integration.last_check_status, 'ok');
    assert.ok(integration.last_checked_at);
    assert.strictEqual(aiCalls.length, 1);
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

async function testAiIntegrationRejectsInvalidConnection() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  let insertCalled = false;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async () => {
    insertCalled = true;
    return [];
  };
  console.error = () => {};
  global.fetch = async (url) => {
    assert.match(url, /ai\.example\/v1\/chat\/completions$/);
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid api key' } })
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
          api_key: 'bad-token',
          system_prompt: 'Classify support requests',
          knowledge_text: 'Uyqurda obyekt va smeta bor.'
        }
      }]
    });

    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.payload.ok, false);
    assert.match(result.payload.error, /AI ulanish tekshiruvidan o‘tmadi/);
    assert.match(result.payload.error, /token noto‘g‘ri/);
    assert.strictEqual(insertCalled, false);
    assert.doesNotMatch(JSON.stringify(result.payload), /bad-token/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

async function testAiIntegrationAcceptsEmptyCompatibleChoice() {
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
    if (/ai\.example/.test(url)) {
      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, 'uyqur-model');
      return {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-test',
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '' } }]
        })
      };
    }
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 504 } })
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
    assert.strictEqual(insertedRows.some(row => row.key === 'ai_integration' && row.value.last_check_status === 'ok'), true);
    assert.strictEqual(telegramCalls.length, 1);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testAiIntegrationAcceptsArrayContentChoice() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    return rows;
  };
  global.fetch = async (url) => {
    if (/ai\.example/.test(url)) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] } }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 505 } })
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
          api_key: 'secret-token'
        }
      }]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    const integration = result.payload.data.find(row => row.key === 'ai_integration').value;
    assert.strictEqual(integration.last_check_status, 'ok');
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testAiModeModelRequiresVerifiedIntegration() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalConsoleError = console.error;
  let insertCalled = false;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      {
        key: 'ai_integration',
        value: {
          enabled: true,
          provider: 'openai_compatible',
          label: 'Uyqur AI',
          base_url: 'https://ai.example/v1',
          model: 'uyqur-model',
          api_key: 'secret-token',
          last_check_status: 'failed'
        }
      },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async () => {
    insertCalled = true;
    return [];
  };
  console.error = () => {};

  try {
    const result = await callSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: true, provider: 'openai_compatible', model: 'uyqur-model', model_label: 'Uyqur AI' } }
      ]
    });

    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.payload.ok, false);
    assert.match(result.payload.error, /AI model ishlashi tekshirilmagan/);
    assert.strictEqual(insertCalled, false);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    console.error = originalConsoleError;
  }
}

async function testAiModeModelRejectsStaleHasApiKeyWithoutSecret() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalConsoleError = console.error;
  let insertCalled = false;

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      {
        key: 'ai_integration',
        value: {
          enabled: true,
          provider: 'openai_compatible',
          label: 'Uyqur AI',
          base_url: 'https://ai.example/v1',
          model: 'uyqur-model',
          api_key: '',
          has_api_key: true,
          last_check_status: 'ok'
        }
      },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'done_tag', value: { tag: '#done' } },
      { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
    ];
  };
  supabase.insert = async () => {
    insertCalled = true;
    return [];
  };
  console.error = () => {};

  try {
    const result = await callSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: true, provider: 'openai_compatible', model: 'uyqur-model', model_label: 'Uyqur AI' } }
      ]
    });

    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.payload.ok, false);
    assert.match(result.payload.error, /AI model ishlashi tekshirilmagan/);
    assert.strictEqual(insertCalled, false);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    console.error = originalConsoleError;
  }
}

async function testUnrelatedSettingsDoNotNotifyStaleAiIntegration() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [
      { key: 'ai_mode', value: { enabled: false, provider: null } },
      {
        key: 'ai_integration',
        value: {
          enabled: true,
          provider: 'openai_compatible',
          label: 'Uyqur AI',
          base_url: 'https://ai.example/v1',
          model: 'uyqur-model',
          api_key: '',
          has_api_key: true,
          last_check_status: 'ok'
        }
      },
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'auto_reply', value: { enabled: false } },
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
      json: async () => ({ ok: true, result: { message_id: 506 } })
    };
  };

  try {
    const result = await callSettings({
      settings: [
        { key: 'auto_reply', value: { enabled: true } }
      ]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /Avto javob rejimi yoqildi/);
    assert.doesNotMatch(telegramCalls[0].body.text, /AI model ulandi/);
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

async function testReplyRequestSendsMessageAndClosesTicket() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const inserts = [];
  const patches = [];
  const telegramCalls = [];

  supabase.select = async (table) => {
    if (table === 'support_requests') {
      return [{
        id: 'request-1',
        source_type: 'group',
        chat_id: -1001,
        customer_name: 'Mijoz',
        initial_message_id: 55,
        initial_text: 'Lift ishlamayapti',
        status: 'open',
        business_connection_id: null
      }];
    }
    if (table === 'tg_chats') return [{ chat_id: -1001, title: 'Mijoz guruhi', source_type: 'group', business_connection_id: null }];
    return [];
  };
  supabase.insert = async (table, rows, options = {}) => {
    inserts.push({ table, rows, options });
    return rows;
  };
  supabase.patch = async (table, query, values) => {
    patches.push({ table, query, values });
    return [{ id: 'request-1', ...values }];
  };
  global.fetch = async (url, options) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 7002 } })
    };
  };

  try {
    const result = await callAdmin('replyRequest', {
      method: 'POST',
      body: { request_id: 'request-1', text: 'Lift qayta ishga tushirildi' }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.sent, true);
    assert.strictEqual(telegramCalls[0].body.chat_id, -1001);
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 55);
    assert.strictEqual(telegramCalls[0].body.text, 'Lift qayta ishga tushirildi');

    const requestPatch = patches.find(item => item.table === 'support_requests');
    assert.ok(requestPatch);
    assert.strictEqual(requestPatch.values.status, 'closed');
    assert.strictEqual(requestPatch.values.done_message_id, 7002);

    assert.strictEqual(inserts.some(item => item.table === 'messages' && item.rows[0].raw.source === 'admin_request_reply'), true);
    assert.strictEqual(inserts.some(item => item.table === 'request_events' && item.rows[0].event_type === 'closed'), true);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
  }
}

async function testReplyRequestFallsBackWhenBusinessPeerInvalid() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.select = async (table) => {
    if (table === 'support_requests') {
      return [{
        id: 'request-business',
        source_type: 'business',
        chat_id: 303,
        customer_name: 'Business mijoz',
        initial_message_id: 77,
        initial_text: 'Hisobot ochilmayapti',
        status: 'open',
        business_connection_id: 'bc-old'
      }];
    }
    if (table === 'tg_chats') return [{ chat_id: 303, title: 'Business mijoz', source_type: 'business', business_connection_id: 'bc-old' }];
    return [];
  };
  supabase.insert = async (_table, rows) => rows;
  supabase.patch = async (_table, _query, values) => [{ id: 'request-business', ...values }];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    telegramCalls.push(body);
    if (body.business_connection_id) {
      return {
        ok: false,
        json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: BUSINESS_PEER_INVALID' })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 7003 } })
    };
  };

  try {
    const result = await callAdmin('replyRequest', {
      method: 'POST',
      body: { request_id: 'request-business', text: 'Hisobot qayta yuklandi' }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.sent, true);
    assert.strictEqual(result.payload.data.fallback_from_business, true);
    assert.strictEqual(telegramCalls.length, 2);
    assert.strictEqual(telegramCalls[0].business_connection_id, 'bc-old');
    assert.strictEqual(telegramCalls[1].business_connection_id, undefined);
    assert.strictEqual(telegramCalls[1].text, 'Hisobot qayta yuklandi');
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
  }
}

async function testEmployeesIncludeDailyWorkStats() {
  const originalSelect = supabase.select;
  const today = new Date().toISOString();

  supabase.select = async (table) => {
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true }];
    if (table === 'support_requests') {
      return [
        { id: 'r1', closed_by_employee_id: 'emp-1', status: 'closed', chat_id: -1001, customer_name: 'Mijoz A', initial_text: 'A', created_at: today, closed_at: today },
        { id: 'r2', closed_by_employee_id: null, status: 'open', chat_id: -1001, customer_name: 'Mijoz B', initial_text: 'B', created_at: today, closed_at: null }
      ];
    }
    if (table === 'tg_chats') return [{ chat_id: -1001, title: 'Support guruhi', source_type: 'group', is_active: true }];
    if (table === 'messages') return [{ chat_id: -1001, from_tg_user_id: 777, employee_id: 'emp-1', source_type: 'group', text: 'Javob', created_at: today }];
    return [];
  };

  try {
    const result = await callAdmin('employees');
    assert.strictEqual(result.status, 200);
    const employee = result.payload.data[0];
    assert.strictEqual(employee.today_received_requests, 2);
    assert.strictEqual(employee.today_answered_requests, 1);
    assert.strictEqual(employee.today_open_requests, 1);
    assert.deepStrictEqual(employee.today_written_groups, ['Support guruhi']);
    assert.deepStrictEqual(employee.today_open_customers, ['Mijoz B']);
    assert.strictEqual(employee.today_group_activity[0].title, 'Support guruhi');
    assert.strictEqual(employee.today_group_activity[0].messages[0].text, 'Javob');
    assert.strictEqual(employee.today_group_activity[0].closed_requests[0].initial_text, 'A');
    assert.strictEqual(employee.today_open_requests_detail[0].initial_text, 'B');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testEmployeeActivityReturnsGroupsAndCustomers() {
  const originalSelect = supabase.select;
  const today = new Date().toISOString();

  supabase.select = async (table) => {
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true }];
    if (table === 'support_requests') {
      return [
        {
          id: 'r1',
          source_type: 'group',
          chat_id: -1001,
          customer_tg_id: 501,
          customer_name: 'Mijoz A',
          customer_username: 'mijoz_a',
          initial_text: 'Narx qancha?',
          status: 'closed',
          closed_by_employee_id: 'emp-1',
          closed_by_name: 'Ali',
          created_at: today,
          closed_at: today
        }
      ];
    }
    if (table === 'messages') {
      return [{
        id: 'm1',
        tg_message_id: 21,
        chat_id: -1001,
        from_tg_user_id: 777,
        from_name: 'Ali',
        from_username: 'ali',
        employee_id: 'emp-1',
        source_type: 'group',
        classification: 'employee_message',
        text: 'Javob berdim',
        created_at: today
      }];
    }
    if (table === 'tg_chats') return [{ chat_id: -1001, title: 'Support guruhi', source_type: 'group' }];
    return [];
  };

  try {
    const result = await callAdmin('employeeActivity', { query: { employee_id: 'emp-1', period: 'all' } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.summary.handled_chats, 1);
    assert.strictEqual(result.payload.data.summary.closed_requests, 1);
    assert.strictEqual(result.payload.data.groups[0].title, 'Support guruhi');
    assert.strictEqual(result.payload.data.groups[0].closed_requests[0].customer_name, 'Mijoz A');
    assert.strictEqual(result.payload.data.groups[0].messages[0].text, 'Javob berdim');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testLogNotificationsCanSendSelectedLevels() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  let settingsRows = [
    { key: 'main_group', value: { chat_id: '-100777' } },
    { key: 'log_notifications', value: { enabled: false, levels: ['error'], target: 'main_group' } }
  ];
  const telegramCalls = [];

  supabase.select = async (table) => {
    if (table === 'bot_settings') return settingsRows;
    return [];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    rows.forEach(row => {
      const index = settingsRows.findIndex(item => item.key === row.key);
      if (index >= 0) settingsRows[index] = row;
      else settingsRows.push(row);
    });
    return rows;
  };
  global.fetch = async (url, options = {}) => {
    telegramCalls.push({ url, body: JSON.parse(options.body || '{}') });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: telegramCalls.length } })
    };
  };

  try {
    const saveResult = await callAdmin('settings', {
      method: 'POST',
      body: {
        settings: [{
          key: 'log_notifications',
          value: { enabled: true, levels: ['error', 'info'], target: 'main_group' }
        }]
      }
    });
    assert.strictEqual(saveResult.status, 200);
    assert.strictEqual(saveResult.payload.data[0].value.enabled, true);
    assert.deepStrictEqual(saveResult.payload.data[0].value.levels, ['error', 'info']);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100777');
    assert.match(telegramCalls[0].body.text, /INFO log/);

    const testResult = await callAdmin('testLogNotification', {
      method: 'POST',
      body: { level: 'error', message: 'Sinov xatosi' }
    });
    assert.strictEqual(testResult.status, 200);
    assert.strictEqual(testResult.payload.data.sent, true);
    assert.strictEqual(telegramCalls[1].body.chat_id, '-100777');
    assert.match(telegramCalls[1].body.text, /ERROR log/);
    assert.match(telegramCalls[1].body.text, /Sinov xatosi/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testCompanyInfoProxyNormalizesExternalRows() {
  const originalFetch = global.fetch;
  const originalAuth = process.env.UYQUR_COMPANY_INFO_AUTH;
  const originalUrl = process.env.UYQUR_COMPANY_INFO_URL;
  process.env.UYQUR_COMPANY_INFO_AUTH = 'test-company-auth';
  process.env.UYQUR_COMPANY_INFO_URL = 'https://example.test/company-info';
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        data: [{
          id: 3,
          name: 'Gagarin Avenue',
          status: 'active',
          created_at: 1703131871,
          updated_at: 1776400702,
          phone: '+998900223355',
          brand: 'Gagarin Avenue',
          director: 'Gagarin Admin',
          icon: 'https://example.test/icon.webp',
          currency_id: 1,
          auto_refresh_currencies: 0,
          expired: '30.04.2026',
          uyqur_support_username: '@uyqur_nurali',
          uyqur_support_phone: '+998908065775',
          subscription_start_date: '21.12.2023',
          business_status: 'ACTIVE',
          is_real: 1,
          status_histories: [{ id: 5, old_status: null, new_status: 'ACTIVE', company_id: 3, changed_at: 1776196774 }]
        }]
      })
    };
  };

  try {
    const result = await callAdmin('companyInfo');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(calls[0].url, 'https://example.test/company-info');
    assert.strictEqual(calls[0].options.headers['X-Auth'], 'test-company-auth');
    assert.strictEqual(result.payload.data.summary.total, 1);
    assert.strictEqual(result.payload.data.summary.active, 1);
    assert.strictEqual(result.payload.data.summary.support_assigned, 1);
    assert.strictEqual(result.payload.data.companies[0].name, 'Gagarin Avenue');
    assert.strictEqual(result.payload.data.companies[0].created_at_iso, '2023-12-21T04:11:11.000Z');
    assert.strictEqual(result.payload.data.companies[0].latest_status_change.new_status, 'ACTIVE');
  } finally {
    global.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.UYQUR_COMPANY_INFO_AUTH;
    else process.env.UYQUR_COMPANY_INFO_AUTH = originalAuth;
    if (originalUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalUrl;
  }
}

async function run() {
  await testAiModeEnableSendsMainGroupNotice();
  await testAiModeDisableSendsMainGroupNotice();
  await testAutoReplyNotificationSendsMainGroupMessage();
  await testAutoReplyDisableNotificationSendsMainGroupMessage();
  await testFirstAutoReplyEnableStillNotifiesMainGroup();
  await testAiIntegrationSaveMasksTokenAndNotifiesMainGroup();
  await testAiIntegrationRejectsInvalidConnection();
  await testAiIntegrationAcceptsEmptyCompatibleChoice();
  await testAiIntegrationAcceptsArrayContentChoice();
  await testAiModeModelRequiresVerifiedIntegration();
  await testAiModeModelRejectsStaleHasApiKeyWithoutSecret();
  await testUnrelatedSettingsDoNotNotifyStaleAiIntegration();
  await testPrivateChatsExcludeEmployees();
  await testChatDetailIncludesTicketSolutionAndTimeline();
  await testSendToChatStoresOutgoingAdminMessage();
  await testReplyRequestSendsMessageAndClosesTicket();
  await testReplyRequestFallsBackWhenBusinessPeerInvalid();
  await testEmployeesIncludeDailyWorkStats();
  await testEmployeeActivityReturnsGroupsAndCustomers();
  await testLogNotificationsCanSendSelectedLevels();
  await testCompanyInfoProxyNormalizesExternalRows();
  console.log('Admin tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
