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
const botHandler = require('../backend/api/bot');
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

async function callAdminRaw(action, { method = 'GET', query = {}, body = null } = {}) {
  const res = createRes();
  const token = createToken({ id: 'admin-1', username: 'admin', role: 'owner' });
  await handler(createAdminReq({ action, method, query, body, token }), res);
  return res;
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

async function testGroupsIncludeMessageStatsForChatPreview() {
  const originalSelect = supabase.select;
  const originalStats = stats.selectChatStatistics;
  const chatId = -1001001;

  stats.selectChatStatistics = async (query) => {
    assert.strictEqual(query.source_type, 'eq.group');
    return [{
      chat_id: chatId,
      title: 'Support guruhi',
      source_type: 'group',
      total_requests: 0,
      open_requests: 0,
      closed_requests: 0,
      last_message_at: null,
      is_active: true
    }];
  };
  supabase.select = async (table) => {
    if (table === 'messages') {
      return [
        { id: 'm2', chat_id: chatId, tg_message_id: 2, from_name: 'Ali', text: 'Oxirgi guruh xabari', created_at: '2026-05-02T08:10:00.000Z', raw: {} },
        { id: 'm1', chat_id: chatId, tg_message_id: 1, from_name: 'Mijoz', text: 'Eski xabar', created_at: '2026-05-02T08:00:00.000Z', raw: {} }
      ];
    }
    return [];
  };

  try {
    const result = await callAdmin('groups');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data[0].message_count, 2);
    assert.strictEqual(result.payload.data[0].total_messages, 2);
    assert.strictEqual(result.payload.data[0].last_message_text, 'Oxirgi guruh xabari');
    assert.strictEqual(result.payload.data[0].last_message_from, 'Ali');
    assert.strictEqual(result.payload.data[0].last_message_at, '2026-05-02T08:10:00.000Z');
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
    assert.strictEqual(result.payload.data.chat.total_messages, 2);
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

async function testChatDetailShowsTelegramMemberServiceMessages() {
  const originalSelect = supabase.select;
  const chatId = -100700;

  supabase.select = async (table) => {
    if (table === 'tg_chats') {
      return [{
        chat_id: chatId,
        title: 'Support guruhi',
        source_type: 'group',
        member_status: 'administrator',
        is_active: true,
        last_message_at: '2026-05-02T08:10:00.000Z'
      }];
    }
    if (table === 'messages') {
      return [{
        id: 'service-message-1',
        tg_message_id: 77,
        chat_id: chatId,
        from_tg_user_id: 501,
        from_name: 'Mijoz A',
        source_type: 'group',
        text: '',
        classification: 'message',
        employee_id: null,
        raw: {
          message_id: 77,
          left_chat_member: { id: 601, first_name: 'Vali', last_name: 'Karimov', username: 'vali' }
        },
        created_at: '2026-05-02T08:10:00.000Z'
      }];
    }
    if (table === 'support_requests' || table === 'request_events' || table === 'employees') return [];
    return [];
  };

  try {
    const result = await callAdmin('chatDetail', { query: { chat_id: chatId } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.chat.member_status, 'administrator');
    assert.strictEqual(result.payload.data.conversation.length, 1);
    assert.strictEqual(result.payload.data.conversation[0].direction, 'system');
    assert.match(result.payload.data.conversation[0].text, /Vali Karimov guruhdan chiqdi/);
  } finally {
    supabase.select = originalSelect;
  }
}

async function testCompanyGroupActivityReturnsLinkedGroupMessagesWithTickets() {
  const originalSelect = supabase.select;
  const chatId = -100700;
  const companyId = 'company-1';

  supabase.select = async (table) => {
    if (table === 'companies') return [{ id: companyId, name: 'China House', brand: 'CH', is_active: true }];
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 909, full_name: 'Ali', username: 'ali', role: 'support', is_active: true }];
    if (table === 'tg_chats') return [{
      chat_id: chatId,
      title: 'China House support',
      source_type: 'group',
      company_id: companyId,
      is_active: true,
      last_message_at: '2026-04-30T08:10:00.000Z'
    }];
    if (table === 'support_requests') return [{
      id: 'request-1',
      source_type: 'group',
      chat_id: chatId,
      company_id: null,
      customer_tg_id: 808,
      customer_name: 'Mijoz',
      customer_username: 'client',
      initial_message_id: 10,
      initial_text: 'Login xato beryapti',
      status: 'closed',
      closed_by_employee_id: 'emp-1',
      closed_by_tg_id: 909,
      closed_by_name: 'Ali',
      done_message_id: 12,
      created_at: '2026-04-30T08:00:00.000Z',
      closed_at: '2026-04-30T08:04:00.000Z'
    }];
    if (table === 'messages') return [
      {
        id: 'm1',
        tg_message_id: 10,
        chat_id: chatId,
        from_tg_user_id: 808,
        from_name: 'Mijoz',
        from_username: 'client',
        employee_id: null,
        source_type: 'group',
        classification: 'request',
        text: 'Login xato beryapti',
        raw: {},
        created_at: '2026-04-30T08:00:00.000Z'
      },
      {
        id: 'm2',
        tg_message_id: 11,
        chat_id: chatId,
        from_tg_user_id: 808,
        from_name: 'Mijoz',
        from_username: 'client',
        employee_id: null,
        source_type: 'group',
        classification: 'message',
        text: 'Oddiy izoh ham bor',
        raw: {},
        created_at: '2026-04-30T08:02:00.000Z'
      },
      {
        id: 'm3',
        tg_message_id: 12,
        chat_id: chatId,
        from_tg_user_id: 909,
        from_name: 'Ali',
        from_username: 'ali',
        employee_id: 'emp-1',
        source_type: 'group',
        classification: 'employee_message',
        text: 'Tuzatdim',
        raw: {},
        created_at: '2026-04-30T08:04:00.000Z'
      }
    ];
    if (table === 'request_events') return [{
      id: 'event-1',
      request_id: 'request-1',
      chat_id: chatId,
      tg_message_id: 12,
      event_type: 'closed',
      actor_tg_id: 909,
      actor_name: 'Ali',
      employee_id: 'emp-1',
      text: 'Tuzatdim',
      raw: {},
      created_at: '2026-04-30T08:04:20.000Z'
    }];
    return [];
  };

  try {
    const result = await callAdmin('companyGroupActivity', { query: { period: 'all', company_id: companyId } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.companies.length, 1);
    const company = result.payload.data.companies[0];
    assert.strictEqual(company.name, 'China House');
    assert.strictEqual(company.group_count, 1);
    assert.strictEqual(company.total_messages, 3);
    assert.strictEqual(company.total_requests, 1);
    assert.strictEqual(company.groups[0].requests[0].initial_text, 'Login xato beryapti');
    assert.strictEqual(company.groups[0].conversation.some(message => message.text === 'Oddiy izoh ham bor' && !message.request_id), true);
    assert.strictEqual(company.groups[0].conversation.some(message => message.text === 'Tuzatdim' && message.direction === 'outbound'), true);
  } finally {
    supabase.select = originalSelect;
  }
}

async function testCompanyGroupActivityLimitsLargeConversationPayload() {
  const originalSelect = supabase.select;
  const chatId = -100799;
  const companyId = 'company-heavy';
  const messages = Array.from({ length: 1760 }, (_, index) => ({
    id: `m${index + 1}`,
    tg_message_id: 2000 + index,
    chat_id: chatId,
    from_tg_user_id: 900 + (index % 3),
    from_name: `User ${index % 3}`,
    from_username: `user${index % 3}`,
    employee_id: index % 5 === 0 ? 'emp-1' : null,
    source_type: 'group',
    classification: index % 7 === 0 ? 'request' : 'message',
    text: `Message ${index + 1}`,
    raw: {},
    created_at: new Date(Date.parse('2026-04-30T08:00:00.000Z') + index * 1000).toISOString()
  }));

  supabase.select = async (table, query = {}) => {
    if (table === 'companies') return [{ id: companyId, name: 'Heavy Co', brand: 'HV', is_active: true }];
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 901, full_name: 'Ali', username: 'ali', role: 'support', is_active: true }];
    if (table === 'tg_chats') return [{
      chat_id: chatId,
      title: 'Heavy Co support',
      source_type: 'group',
      company_id: companyId,
      is_active: true,
      last_message_at: messages[messages.length - 1].created_at
    }];
    if (table === 'support_requests') return [];
    if (table === 'messages') {
      const orderedMessages = query.order === 'created_at.desc' ? messages.slice().reverse() : messages;
      const offset = Number.parseInt(query.offset || '0', 10);
      const limit = Number.parseInt(query.limit || String(orderedMessages.length), 10);
      return orderedMessages.slice(offset, offset + limit);
    }
    if (table === 'request_events') return [];
    return [];
  };

  try {
    const result = await callAdmin('companyGroupActivity', { query: { period: 'all', company_id: companyId } });
    assert.strictEqual(result.status, 200);
    const group = result.payload.data.companies[0].groups[0];
    assert.strictEqual(group.total_messages, 1760);
    assert.strictEqual(group.conversation.length, 1500);
    assert.strictEqual(group.conversation_truncated, true);
    assert.strictEqual(group.conversation[0].text, 'Message 261');
    assert.strictEqual(group.conversation[group.conversation.length - 1].text, 'Message 1760');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testDashboardCompanyTicketsUseRegisteredGroupCompany() {
  const originalSelect = supabase.select;
  const originalEmployeeStats = stats.selectEmployeeStatistics;
  const originalChatStats = stats.selectChatStatistics;
  const originalTodaySummary = stats.selectTodaySummary;
  const chatId = -100800;
  const companyId = 'company-2';
  const requests = [
    {
      id: 'request-10',
      source_type: 'group',
      chat_id: chatId,
      company_id: null,
      customer_tg_id: 707,
      customer_name: 'Mijoz',
      status: 'closed',
      closed_by_employee_id: 'emp-1',
      closed_by_tg_id: 909,
      closed_by_name: 'Ali',
      created_at: '2026-04-30T08:00:00.000Z',
      closed_at: '2026-04-30T08:07:00.000Z'
    },
    {
      id: 'request-11',
      source_type: 'group',
      chat_id: chatId,
      company_id: null,
      customer_tg_id: 808,
      customer_name: 'Mijoz 2',
      status: 'open',
      closed_by_employee_id: null,
      closed_by_tg_id: null,
      closed_by_name: null,
      created_at: '2026-04-30T09:00:00.000Z',
      closed_at: null
    }
  ];

  supabase.select = async (table, query = {}) => {
    if (table === 'support_requests') {
      return query.status === 'eq.open' ? requests.filter(row => row.status === 'open') : requests;
    }
    if (table === 'tg_chats') {
      return [{
        chat_id: chatId,
        title: 'Nuriddin Buildings support',
        source_type: 'group',
        company_id: companyId,
        is_active: true,
        last_message_at: '2026-04-30T09:00:00.000Z'
      }];
    }
    if (table === 'companies') return [{ id: companyId, name: 'Nuriddin Buildings', is_active: true }];
    if (table === 'employees') return [];
    if (table === 'messages') return [];
    return [];
  };
  stats.selectEmployeeStatistics = async () => [];
  stats.selectChatStatistics = async () => [{
    chat_id: chatId,
    title: 'Nuriddin Buildings support',
    source_type: 'group',
    company_id: companyId,
    is_active: true
  }];
  stats.selectTodaySummary = async () => [{ total_requests: 2, open_requests: 1, closed_requests: 1 }];

  try {
    const result = await callAdmin('dashboard', { query: { period: 'all' } });
    assert.strictEqual(result.status, 200);
    const rows = result.payload.data.analytics.companyTickets.all;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].company_id, companyId);
    assert.strictEqual(rows[0].name, 'Nuriddin Buildings');
    assert.strictEqual(rows[0].total_requests, 2);
    assert.strictEqual(rows[0].closed_requests, 1);
    assert.strictEqual(rows[0].open_requests, 1);
  } finally {
    supabase.select = originalSelect;
    stats.selectEmployeeStatistics = originalEmployeeStats;
    stats.selectChatStatistics = originalChatStats;
    stats.selectTodaySummary = originalTodaySummary;
  }
}

async function testDashboardCompanyTicketsIncludeLinkedGroupMessagesWithoutRequests() {
  const originalSelect = supabase.select;
  const originalEmployeeStats = stats.selectEmployeeStatistics;
  const originalChatStats = stats.selectChatStatistics;
  const originalTodaySummary = stats.selectTodaySummary;
  const chatId = -100810;
  const companyId = 'company-message-only';
  const linkedChat = {
    chat_id: chatId,
    title: 'Message Only group',
    source_type: 'group',
    type: 'supergroup',
    company_id: companyId,
    is_active: true,
    last_message_at: '2026-04-30T12:00:00.000Z'
  };

  supabase.select = async (table) => {
    if (table === 'support_requests') return [];
    if (table === 'tg_chats') return [linkedChat];
    if (table === 'companies') return [{ id: companyId, name: 'Message Only LLC', is_active: true }];
    if (table === 'employees') return [];
    if (table === 'messages') return [{
      id: 'm-message-only',
      tg_message_id: 501,
      chat_id: chatId,
      from_tg_user_id: 700,
      from_name: 'Mijoz',
      employee_id: null,
      source_type: 'group',
      classification: 'request',
      text: 'Guruhda ticketga o‘xshash xabar',
      created_at: '2026-04-30T12:00:00.000Z'
    }];
    return [];
  };
  stats.selectEmployeeStatistics = async () => [];
  stats.selectChatStatistics = async () => [linkedChat];
  stats.selectTodaySummary = async () => [{ total_requests: 0, open_requests: 0, closed_requests: 0 }];

  try {
    const result = await callAdmin('dashboard', { query: { period: 'all' } });
    assert.strictEqual(result.status, 200);
    const rows = result.payload.data.analytics.companyTickets.all;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].company_id, companyId);
    assert.strictEqual(rows[0].name, 'Message Only LLC');
    assert.strictEqual(rows[0].message_count, 1);
    assert.strictEqual(rows[0].ticket_like_messages, 1);
    assert.strictEqual(rows[0].total_requests, 1);
    assert.strictEqual(rows[0].open_requests, 1);
  } finally {
    supabase.select = originalSelect;
    stats.selectEmployeeStatistics = originalEmployeeStats;
    stats.selectChatStatistics = originalChatStats;
    stats.selectTodaySummary = originalTodaySummary;
  }
}

async function testDashboardCompanyTicketsUseLinkedGroupOrdinaryMessages() {
  const originalSelect = supabase.select;
  const originalEmployeeStats = stats.selectEmployeeStatistics;
  const originalChatStats = stats.selectChatStatistics;
  const originalTodaySummary = stats.selectTodaySummary;
  const chatId = -100811;
  const companyId = 'company-ordinary-message';
  const linkedChat = {
    chat_id: chatId,
    title: 'Ordinary Message group',
    source_type: 'group',
    type: 'supergroup',
    company_id: companyId,
    is_active: true,
    last_message_at: '2026-04-30T13:00:00.000Z'
  };

  supabase.select = async (table) => {
    if (table === 'support_requests') return [];
    if (table === 'tg_chats') return [linkedChat];
    if (table === 'companies') return [{ id: companyId, name: 'Ordinary Message LLC', is_active: true }];
    if (table === 'employees') return [];
    if (table === 'messages') return [{
      id: 'm-ordinary-message',
      tg_message_id: 502,
      chat_id: chatId,
      from_tg_user_id: 701,
      from_name: 'Mijoz',
      employee_id: null,
      source_type: 'group',
      classification: 'message',
      text: 'Guruhda oddiy xabar',
      created_at: '2026-04-30T13:00:00.000Z'
    }];
    return [];
  };
  stats.selectEmployeeStatistics = async () => [];
  stats.selectChatStatistics = async () => [linkedChat];
  stats.selectTodaySummary = async () => [{ total_requests: 0, open_requests: 0, closed_requests: 0 }];

  try {
    const result = await callAdmin('dashboard', { query: { period: 'all' } });
    assert.strictEqual(result.status, 200);
    const rows = result.payload.data.analytics.companyTickets.all;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].company_id, companyId);
    assert.strictEqual(rows[0].message_count, 1);
    assert.strictEqual(rows[0].ticket_like_messages, 0);
    assert.strictEqual(rows[0].total_requests, 1);
    assert.strictEqual(rows[0].open_requests, 1);
  } finally {
    supabase.select = originalSelect;
    stats.selectEmployeeStatistics = originalEmployeeStats;
    stats.selectChatStatistics = originalChatStats;
    stats.selectTodaySummary = originalTodaySummary;
  }
}

async function testDashboardEmployeePerformanceCountsOpenAndSlaPerEmployee() {
  const originalSelect = supabase.select;
  const originalEmployeeStats = stats.selectEmployeeStatistics;
  const originalChatStats = stats.selectChatStatistics;
  const originalTodaySummary = stats.selectTodaySummary;
  const chatId = -100901;
  const now = '2026-04-30T12:00:00.000Z';
  const closedAt = '2026-04-30T12:10:00.000Z';
  const employees = [{ id: 'emp-1', tg_user_id: 777, full_name: 'Ali Support', username: 'ali', role: 'support', is_active: true }];
  const requests = [
    {
      id: 'request-closed',
      source_type: 'group',
      chat_id: chatId,
      customer_tg_id: 501,
      customer_name: 'Mijoz A',
      status: 'closed',
      closed_by_employee_id: 'emp-1',
      closed_by_tg_id: 777,
      closed_by_name: 'Ali Support',
      created_at: now,
      closed_at: closedAt
    },
    {
      id: 'request-open',
      source_type: 'group',
      chat_id: chatId,
      customer_tg_id: 502,
      customer_name: 'Mijoz B',
      initial_message_id: 40,
      initial_text: 'Hisobot chiqmayapti',
      status: 'open',
      closed_by_employee_id: null,
      closed_by_tg_id: null,
      closed_by_name: null,
      created_at: now,
      closed_at: null
    }
  ];
  const messages = [
    { id: 'm40', tg_message_id: 40, chat_id: chatId, from_tg_user_id: 502, from_name: 'Mijoz B', employee_id: null, text: 'Hisobot chiqmayapti', created_at: now },
    { id: 'm41', tg_message_id: 41, chat_id: chatId, from_tg_user_id: 777, from_name: 'Ali Support', from_username: 'ali', employee_id: 'emp-1', text: 'Ko‘rib chiqyapman', created_at: '2026-04-30T12:02:00.000Z' }
  ];

  supabase.select = async (table, query = {}) => {
    if (table === 'support_requests') return query.status === 'eq.open' ? requests.filter(row => row.status === 'open') : requests;
    if (table === 'tg_chats') return [{ chat_id: chatId, title: 'Support guruhi', source_type: 'group', is_active: true }];
    if (table === 'employees') return employees;
    if (table === 'messages') return messages;
    if (table === 'companies') return [];
    if (table === 'request_events') return [];
    return [];
  };
  stats.selectEmployeeStatistics = async () => [];
  stats.selectChatStatistics = async () => [{ chat_id: chatId, title: 'Support guruhi', source_type: 'group', is_active: true }];
  stats.selectTodaySummary = async () => [{ total_requests: 2, open_requests: 1, closed_requests: 1 }];

  try {
    const result = await callAdmin('dashboard', { query: { period: 'all' } });
    assert.strictEqual(result.status, 200);
    const row = result.payload.data.analytics.employeePerformance.all.find(item => item.employee_id === 'emp-1');
    assert.ok(row);
    assert.strictEqual(row.closed_requests, 1);
    assert.strictEqual(row.open_requests, 1);
    assert.strictEqual(row.total_requests, 2);
    assert.strictEqual(row.sla, 50);
    assert.strictEqual(row.avg_close_minutes, 10);
  } finally {
    supabase.select = originalSelect;
    stats.selectEmployeeStatistics = originalEmployeeStats;
    stats.selectChatStatistics = originalChatStats;
    stats.selectTodaySummary = originalTodaySummary;
  }
}

async function testRequestsListEnrichesCompanyFromRegisteredGroup() {
  const originalSelect = supabase.select;
  const chatId = -100801;
  const companyId = 'company-3';

  supabase.select = async (table) => {
    if (table === 'support_requests') return [{
      id: 'request-20',
      source_type: 'group',
      chat_id: chatId,
      company_id: null,
      customer_tg_id: 515,
      customer_name: 'Mijoz',
      customer_username: 'client',
      initial_message_id: 20,
      initial_text: 'Hisobot ochilmayapti',
      status: 'closed',
      closed_by_employee_id: 'emp-1',
      closed_by_tg_id: 909,
      closed_by_name: 'Ali',
      done_message_id: 21,
      created_at: '2026-04-30T10:00:00.000Z',
      closed_at: '2026-04-30T10:12:00.000Z'
    }];
    if (table === 'tg_chats') return [{
      chat_id: chatId,
      title: 'Salom City support',
      source_type: 'group',
      company_id: companyId,
      last_message_at: '2026-04-30T10:12:00.000Z'
    }];
    if (table === 'companies') return [{ id: companyId, name: 'Salom City', brand: 'SC', is_active: true }];
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 909, full_name: 'Ali Support', username: 'ali', role: 'support' }];
    return [];
  };

  try {
    const result = await callAdmin('requests', { query: { period: 'all', limit: 100 } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.length, 1);
    assert.strictEqual(result.payload.data[0].company_id, companyId);
    assert.strictEqual(result.payload.data[0].company_name, 'Salom City');
    assert.strictEqual(result.payload.data[0].chat_title, 'Salom City support');
    assert.strictEqual(result.payload.data[0].support_name, 'Ali Support');
    assert.strictEqual(result.payload.data[0].response_minutes, 12);
  } finally {
    supabase.select = originalSelect;
  }
}

async function testRequestsListShowsResponsibleEmployeeFromTicketMessages() {
  const originalSelect = supabase.select;
  const chatId = -100802;
  const companyId = 'company-4';

  supabase.select = async (table) => {
    if (table === 'support_requests') return [{
      id: 'request-30',
      source_type: 'group',
      chat_id: chatId,
      company_id: companyId,
      customer_tg_id: 616,
      customer_name: 'Mijoz',
      customer_username: 'client',
      initial_message_id: 30,
      initial_text: 'Balans yangilanmayapti',
      status: 'open',
      closed_by_employee_id: null,
      closed_by_tg_id: null,
      closed_by_name: null,
      done_message_id: null,
      created_at: '2026-04-30T11:00:00.000Z',
      closed_at: null
    }];
    if (table === 'tg_chats') return [{
      chat_id: chatId,
      title: 'Besh Bola support',
      source_type: 'group',
      company_id: companyId,
      last_message_at: '2026-04-30T11:05:00.000Z'
    }];
    if (table === 'companies') return [{ id: companyId, name: 'Besh Bola Buildings', brand: 'BBB', is_active: true }];
    if (table === 'employees') return [
      { id: 'emp-1', tg_user_id: 901, full_name: 'Ali Support', username: 'ali', role: 'support' },
      { id: 'emp-2', tg_user_id: 902, full_name: 'Ozodbek Support', username: 'ozodbek', role: 'support' }
    ];
    if (table === 'messages') return [
      {
        id: 'm30',
        tg_message_id: 30,
        chat_id: chatId,
        from_tg_user_id: 616,
        from_name: 'Mijoz',
        from_username: 'client',
        employee_id: null,
        source_type: 'group',
        classification: 'request',
        text: 'Balans yangilanmayapti',
        created_at: '2026-04-30T11:00:00.000Z'
      },
      {
        id: 'm31',
        tg_message_id: 31,
        chat_id: chatId,
        from_tg_user_id: 902,
        from_name: 'Ozodbek Support',
        from_username: 'ozodbek',
        employee_id: 'emp-2',
        source_type: 'group',
        classification: 'employee_message',
        text: 'Tekshirib ko‘raman',
        created_at: '2026-04-30T11:03:00.000Z'
      },
      {
        id: 'm32',
        tg_message_id: 32,
        chat_id: chatId,
        from_tg_user_id: 901,
        from_name: 'Ali Support',
        from_username: 'ali',
        employee_id: 'emp-1',
        source_type: 'group',
        classification: 'employee_message',
        text: 'Keyingi xabar',
        created_at: '2026-04-30T11:05:00.000Z'
      }
    ];
    if (table === 'request_events') return [];
    return [];
  };

  try {
    const result = await callAdmin('requests', { query: { period: 'all', limit: 100 } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data[0].responsible_employee_id, 'emp-2');
    assert.strictEqual(result.payload.data[0].responsible_employee_name, 'Ozodbek Support');
    assert.strictEqual(result.payload.data[0].support_name, 'Ozodbek Support');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testWebhookInfoWarnsWhenMessageUpdatesMissing() {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(url, /getWebhookInfo$/);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          url: 'https://example.app/api/bot?secret=hidden',
          pending_update_count: 0,
          allowed_updates: ['callback_query']
        }
      })
    };
  };

  try {
    const result = await callAdmin('telegramWebhookInfo');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.diagnostics.receives_group_messages, false);
    assert.strictEqual(result.payload.data.diagnostics.missing_allowed_updates.includes('message'), true);
    assert.match(result.payload.data.diagnostics.notes.join(' '), /message yo‘q/);
    assert.match(result.payload.data.url, /secret=\*\*\*/);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testWebhookInfoWarnsWhenPointingToCompanyInfoUrl() {
  const originalFetch = global.fetch;
  const originalCompanyInfoUrl = process.env.UYQUR_COMPANY_INFO_URL;
  process.env.UYQUR_COMPANY_INFO_URL = 'https://backend.app.uyqur.uz/dev/company/info-for-bot';

  global.fetch = async (url) => {
    assert.match(url, /getWebhookInfo$/);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          url: 'https://backend.app.uyqur.uz/dev/company/info-for-bot',
          pending_update_count: 0,
          allowed_updates: ['message', 'business_message']
        }
      })
    };
  };

  try {
    const result = await callAdmin('telegramWebhookInfo');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.diagnostics.points_to_company_info_url, true);
    assert.strictEqual(result.payload.data.diagnostics.receives_group_messages, false);
    assert.match(result.payload.data.diagnostics.notes.join(' '), /company info URLga ulangan/);
  } finally {
    global.fetch = originalFetch;
    if (originalCompanyInfoUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalCompanyInfoUrl;
  }
}

async function testSetWebhookRejectsCompanyInfoUrl() {
  const originalFetch = global.fetch;
  const originalCompanyInfoUrl = process.env.UYQUR_COMPANY_INFO_URL;
  const originalWebappUrl = process.env.WEBAPP_URL;
  const originalAppUrl = process.env.APP_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalConsoleError = console.error;
  let setWebhookCalled = false;
  process.env.UYQUR_COMPANY_INFO_URL = 'https://backend.app.uyqur.uz/dev/company/info-for-bot';
  delete process.env.WEBAPP_URL;
  delete process.env.APP_URL;
  delete process.env.VERCEL_URL;
  console.error = () => {};

  global.fetch = async (url) => {
    if (/setWebhook$/.test(url)) setWebhookCalled = true;
    return {
      ok: true,
      text: async () => '[]',
      json: async () => ({ ok: true, result: true })
    };
  };

  try {
    const result = await callAdmin('setTelegramWebhook', {
      method: 'POST',
      body: { app_url: 'https://backend.app.uyqur.uz/dev/company/info-for-bot' }
    });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.payload.ok, false);
    assert.match(result.payload.error, /UYQUR_COMPANY_INFO_URL/);
    assert.strictEqual(setWebhookCalled, false);
  } finally {
    global.fetch = originalFetch;
    if (originalCompanyInfoUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalCompanyInfoUrl;
    if (originalWebappUrl === undefined) delete process.env.WEBAPP_URL;
    else process.env.WEBAPP_URL = originalWebappUrl;
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
    console.error = originalConsoleError;
  }
}

async function testSetWebhookPrefersExplicitAppUrl() {
  const originalFetch = global.fetch;
  const originalWebappUrl = process.env.WEBAPP_URL;
  const originalAppUrl = process.env.APP_URL;
  const calls = [];
  process.env.WEBAPP_URL = 'https://primary.example.app';
  delete process.env.APP_URL;

  global.fetch = async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body || '{}') });
    if (/setWebhook$/.test(url)) {
      return { ok: true, json: async () => ({ ok: true, result: true }) };
    }
    if (/getWebhookInfo$/.test(url)) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            url: 'https://preview-right.example.app/api/bot',
            pending_update_count: 0,
            allowed_updates: ['message', 'my_chat_member', 'chat_member', 'callback_query']
          }
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await callAdmin('setTelegramWebhook', {
      method: 'POST',
      body: { app_url: 'https://preview-right.example.app' }
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.connected, true);
    assert.strictEqual(calls[0].body.url, 'https://preview-right.example.app/api/bot');
  } finally {
    global.fetch = originalFetch;
    if (originalWebappUrl === undefined) delete process.env.WEBAPP_URL;
    else process.env.WEBAPP_URL = originalWebappUrl;
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  }
}

async function testTelegramFileUsesPlayableMimeTypeAndFilename() {
  const originalFetch = global.fetch;
  const filePayloads = {
    'voice-file': {
      path: 'voice/file_10.oga',
      body: 'voice-bytes',
      headers: { 'content-type': 'application/octet-stream', 'content-length': '11' }
    },
    'pdf-file': {
      path: 'documents/file_20',
      body: 'pdf-bytes',
      headers: { 'content-type': 'application/octet-stream', 'content-length': '9' }
    }
  };

  global.fetch = async (url, options = {}) => {
    if (/\/getFile$/.test(url)) {
      const body = JSON.parse(options.body || '{}');
      const payload = filePayloads[body.file_id];
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_id: body.file_id, file_path: payload.path } })
      };
    }
    const payload = Object.values(filePayloads).find(item => String(url).includes(item.path));
    return {
      ok: true,
      headers: { get: key => payload.headers[String(key).toLowerCase()] || null },
      arrayBuffer: async () => {
        const buffer = Buffer.from(payload.body);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
    };
  };

  try {
    const voice = await callAdminRaw('telegramFile', {
      query: { file_id: 'voice-file', mime_type: 'audio/ogg', file_name: 'support.oga' }
    });
    assert.strictEqual(voice.statusCode, 200);
    assert.strictEqual(voice.headers['content-type'], 'audio/ogg');
    assert.match(voice.headers['content-disposition'], /^inline;/);
    assert.match(voice.headers['content-disposition'], /support\.oga/);
    assert.strictEqual(voice.body, 'voice-bytes');

    const pdf = await callAdminRaw('telegramFile', {
      query: { file_id: 'pdf-file', file_name: 'hisobot.pdf' }
    });
    assert.strictEqual(pdf.statusCode, 200);
    assert.strictEqual(pdf.headers['content-type'], 'application/pdf');
    assert.match(pdf.headers['content-disposition'], /^inline;/);
    assert.match(pdf.headers['content-disposition'], /hisobot\.pdf/);
    assert.strictEqual(pdf.body, 'pdf-bytes');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testSyncTelegramUpdatesDeletesActiveWebhookThenProcessesUpdates() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const calls = [];
  const inserts = [];

  supabase.select = async () => [];
  supabase.insert = async (table, rows, options = {}) => {
    inserts.push({ table, rows, options });
    return rows;
  };
  global.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, body });
    if (/getUpdates$/.test(url) && calls.filter(call => /getUpdates$/.test(call.url)).length === 1) {
      return {
        ok: false,
        json: async () => ({ ok: false, error_code: 409, description: "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first" })
      };
    }
    if (/deleteWebhook$/.test(url)) {
      return { ok: true, json: async () => ({ ok: true, result: true }) };
    }
    if (/getUpdates$/.test(url)) {
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await callAdmin('syncTelegramUpdates', {
      method: 'POST',
      body: { limit: 10 }
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.webhook_deleted, true);
    assert.strictEqual(result.payload.data.fetched, 0);
    assert.strictEqual(calls.some(call => /deleteWebhook$/.test(call.url) && call.body.drop_pending_updates === false), true);
    assert.strictEqual(inserts.length, 0);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
  }
}

async function testSyncTelegramUpdatesIgnoresStaleOffsetAndAcknowledgesFetchedUpdates() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const originalHandleUpdate = botHandler.handleTelegramUpdate;
  const calls = [];
  const inserts = [];
  const handledUpdates = [];

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'telegram_update_offset', value: { offset: 999999 } }];
    return [];
  };
  supabase.insert = async (table, rows, options = {}) => {
    inserts.push({ table, rows, options });
    return rows;
  };
  botHandler.handleTelegramUpdate = async update => {
    handledUpdates.push(update);
    return { ok: true, handled: 'message' };
  };
  global.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url, body });
    if (/getUpdates$/.test(url) && body.offset === undefined) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: [{ update_id: 10, message: { message_id: 20, text: 'Salom' } }] })
      };
    }
    if (/getUpdates$/.test(url) && body.offset === 11) {
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    }
    throw new Error(`Unexpected URL/body: ${url} ${JSON.stringify(body)}`);
  };

  try {
    const result = await callAdmin('syncTelegramUpdates', {
      method: 'POST',
      body: { limit: 5, mode: 'manual' }
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.used_saved_offset, false);
    assert.strictEqual(result.payload.data.acknowledged, true);
    assert.strictEqual(result.payload.data.offset, 11);
    assert.strictEqual(handledUpdates.length, 1);
    assert.strictEqual(calls[0].body.offset, undefined);
    assert.strictEqual(calls[1].body.offset, 11);
    const offsetInsert = inserts.find(item => item.table === 'bot_settings');
    assert.ok(offsetInsert);
    assert.strictEqual(offsetInsert.rows[0].value.offset, 11);
    assert.strictEqual(offsetInsert.rows[0].value.mode, 'manual');
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    botHandler.handleTelegramUpdate = originalHandleUpdate;
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
  const closedAt = new Date(Date.parse(today) + 10 * 60000).toISOString();

  supabase.select = async (table) => {
    if (table === 'employees') return [{ id: 'emp-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true }];
    if (table === 'tg_users') return [{ tg_user_id: 777, raw: { is_premium: true } }];
    if (table === 'support_requests') {
      return [
        { id: 'r1', closed_by_employee_id: 'emp-1', status: 'closed', chat_id: -1001, customer_name: 'Mijoz A', initial_text: 'A', created_at: today, closed_at: closedAt },
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
    assert.strictEqual(employee.telegram_is_premium, true);
    assert.strictEqual(employee.avg_close_minutes, 10);
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

async function testDeleteEmployeeRemovesEmployeeRow() {
  const originalRemove = supabase.remove;
  const deleted = [];

  supabase.remove = async (table, query) => {
    deleted.push({ table, query });
    return [{ id: 'emp-1', full_name: 'Ali' }];
  };

  try {
    const result = await callAdmin('deleteEmployee', {
      method: 'POST',
      body: { id: 'emp-1' }
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.deleted, true);
    assert.strictEqual(deleted.length, 1);
    assert.strictEqual(deleted[0].table, 'employees');
    assert.strictEqual(deleted[0].query.id, 'eq.emp-1');
  } finally {
    supabase.remove = originalRemove;
  }
}

async function testEmployeeActivityReturnsGroupsAndCustomers() {
  const originalSelect = supabase.select;
  const today = new Date().toISOString();
  const closedAt = new Date(Date.parse(today) + 7 * 60000).toISOString();
  const employeeMessages = Array.from({ length: 35 }, (_, index) => ({
    id: `m${index + 1}`,
    tg_message_id: 21 + index,
    chat_id: -1001,
    from_tg_user_id: 777,
    from_name: 'Ali',
    from_username: 'ali',
    employee_id: 'emp-1',
    source_type: 'group',
    classification: 'employee_message',
    text: index === 0 ? 'Javob berdim' : `Javob ${index + 1}`,
    created_at: new Date(Date.parse(today) + index * 1000).toISOString()
  }));
  const customerMessage = {
    id: 'customer-message-1',
    tg_message_id: 90,
    chat_id: -1001,
    from_tg_user_id: 501,
    from_name: 'Mijoz A',
    from_username: 'mijoz_a',
    employee_id: null,
    source_type: 'group',
    classification: 'message',
    text: 'Oddiy chat xabari',
    raw: {},
    created_at: new Date(Date.parse(today) + 3500).toISOString()
  };
  const otherEmployeeMessage = {
    id: 'other-employee-message-1',
    tg_message_id: 91,
    chat_id: -1001,
    from_tg_user_id: 888,
    from_name: 'Vali',
    from_username: 'vali',
    employee_id: 'emp-2',
    source_type: 'group',
    classification: 'employee_message',
    text: 'Boshqa xodim javobi',
    raw: {},
    created_at: new Date(Date.parse(today) + 4500).toISOString()
  };
  const chatMessages = [...employeeMessages, customerMessage, otherEmployeeMessage];

  supabase.select = async (table, params = {}) => {
    if (table === 'employees') {
      return [
        { id: 'emp-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true },
        { id: 'emp-2', tg_user_id: 888, full_name: 'Vali', username: 'vali', is_active: true }
      ];
    }
    if (table === 'tg_users') return [{ tg_user_id: 777, raw: { is_premium: true } }];
    if (table === 'support_requests') {
      return [
        {
          id: 'r1',
          source_type: 'group',
          chat_id: -1001,
          customer_tg_id: 501,
          customer_name: 'Mijoz A',
          customer_username: 'mijoz_a',
          initial_message_id: 10,
          initial_text: 'Narx qancha?',
          status: 'closed',
          closed_by_employee_id: 'emp-1',
          closed_by_name: 'Ali',
          done_message_id: 21,
          created_at: today,
          closed_at: closedAt
        }
      ];
    }
    if (table === 'messages') {
      if (params.employee_id === 'eq.emp-1') return employeeMessages;
      if (params.from_tg_user_id === 'eq.777') return employeeMessages;
      return chatMessages;
    }
    if (table === 'tg_chats') return [{ chat_id: -1001, title: 'Support guruhi', source_type: 'group' }];
    if (table === 'request_events') {
      return [{
        id: 'event-1',
        request_id: 'r1',
        chat_id: -1001,
        tg_message_id: 11,
        event_type: 'note',
        actor_tg_id: 501,
        actor_name: 'Mijoz A',
        employee_id: null,
        text: 'Qo‘shimcha savol',
        raw: {},
        created_at: new Date(Date.parse(today) + 500).toISOString()
      }];
    }
    return [];
  };

  try {
    const result = await callAdmin('employeeActivity', { query: { employee_id: 'emp-1', period: 'all' } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.employee.telegram_is_premium, true);
    assert.strictEqual(result.payload.data.summary.handled_chats, 1);
    assert.strictEqual(result.payload.data.summary.closed_requests, 1);
    assert.strictEqual(result.payload.data.summary.avg_close_minutes, 7);
    assert.strictEqual(result.payload.data.groups[0].title, 'Support guruhi');
    assert.strictEqual(result.payload.data.groups[0].closed_requests[0].customer_name, 'Mijoz A');
    assert.strictEqual(result.payload.data.groups[0].messages.length, 35);
    assert.strictEqual(result.payload.data.groups[0].messages.some(message => message.text === 'Javob berdim'), true);
    assert.strictEqual(result.payload.data.groups[0].chat_messages.some(message => message.text === 'Oddiy chat xabari'), true);
    assert.strictEqual(result.payload.data.groups[0].chat_messages.some(message => message.text === 'Boshqa xodim javobi'), true);
    assert.strictEqual(result.payload.data.groups[0].closed_requests[0].events[0].text, 'Qo‘shimcha savol');
  } finally {
    supabase.select = originalSelect;
  }
}

async function testEmployeeActivityIsolatesSelectedEmployeeChats() {
  const originalSelect = supabase.select;
  const today = new Date('2026-04-30T08:00:00.000Z').toISOString();
  const employees = [
    { id: 'emp-1', tg_user_id: 777, full_name: 'Mirshod', username: 'mirshod', is_active: true },
    { id: 'emp-2', tg_user_id: 888, full_name: 'Ozodbek', username: 'ozodbek', is_active: true }
  ];
  const requests = [
    { id: 'r1', source_type: 'group', chat_id: -1001, customer_name: 'Mijoz A', initial_text: 'Emp1 ticket', status: 'closed', closed_by_employee_id: 'emp-1', created_at: today, closed_at: today },
    { id: 'r2', source_type: 'group', chat_id: -1001, customer_name: 'Mijoz B', initial_text: 'Emp2 ticket', status: 'closed', closed_by_employee_id: 'emp-2', created_at: today, closed_at: today },
    { id: 'r3', source_type: 'private', chat_id: 888, customer_name: 'Ozodbek', initial_text: 'Employee private', status: 'closed', closed_by_employee_id: 'emp-1', created_at: today, closed_at: today },
    { id: 'r4', source_type: 'group', chat_id: -1001, customer_name: 'Mijoz C', initial_text: 'Open for emp2', status: 'open', closed_by_employee_id: null, created_at: '2026-04-30T09:00:00.000Z', closed_at: null },
    { id: 'r5', source_type: 'group', chat_id: -1002, customer_name: 'Mijoz D', initial_text: 'Open for emp1', status: 'open', closed_by_employee_id: null, created_at: '2026-04-30T10:00:00.000Z', closed_at: null }
  ];
  const messages = [
    { id: 'm1', chat_id: -1001, from_tg_user_id: 777, from_name: 'Mirshod', from_username: 'mirshod', employee_id: 'emp-1', source_type: 'group', text: 'Emp1 answer', created_at: '2026-04-30T08:05:00.000Z' },
    { id: 'm2', chat_id: -1001, from_tg_user_id: 888, from_name: 'Ozodbek', from_username: 'ozodbek', employee_id: 'emp-2', source_type: 'group', text: 'Emp2 answer', created_at: '2026-04-30T08:06:00.000Z' },
    { id: 'm3', chat_id: 888, from_tg_user_id: 777, from_name: 'Mirshod', from_username: 'mirshod', employee_id: 'emp-1', source_type: 'private', text: 'Employee private answer', created_at: '2026-04-30T08:10:00.000Z' },
    { id: 'm4', chat_id: -1001, from_tg_user_id: 888, from_name: 'Ozodbek', from_username: 'ozodbek', employee_id: 'emp-2', source_type: 'group', text: 'Emp2 owns open', created_at: '2026-04-30T09:01:00.000Z' },
    { id: 'm5', chat_id: -1002, from_tg_user_id: 777, from_name: 'Mirshod', from_username: 'mirshod', employee_id: 'emp-1', source_type: 'group', text: 'Emp1 owns open', created_at: '2026-04-30T10:01:00.000Z' }
  ];

  supabase.select = async (table, params = {}) => {
    if (table === 'employees') return employees;
    if (table === 'tg_chats') {
      return [
        { chat_id: -1001, title: 'Umumiy guruh', source_type: 'group' },
        { chat_id: -1002, title: 'Emp1 guruhi', source_type: 'group' },
        { chat_id: 888, title: 'Ozodbek', source_type: 'private' }
      ];
    }
    if (table === 'support_requests') {
      if (params.status === 'eq.open') return requests.filter(row => row.status === 'open');
      if (params.closed_by_employee_id === 'eq.emp-1') return requests.filter(row => row.closed_by_employee_id === 'emp-1');
      if (params.closed_by_tg_id === 'eq.777') return [];
      return requests;
    }
    if (table === 'messages') {
      if (params.employee_id === 'eq.emp-1') return messages.filter(row => row.employee_id === 'emp-1');
      if (params.from_tg_user_id === 'eq.777') return messages.filter(row => row.from_tg_user_id === 777);
      return messages;
    }
    return [];
  };

  try {
    const result = await callAdmin('employeeActivity', { query: { employee_id: 'emp-1', period: 'all' } });
    assert.strictEqual(result.status, 200);
    const chatIds = result.payload.data.groups.map(group => String(group.chat_id));
    assert.strictEqual(chatIds.includes('888'), false);
    assert.strictEqual(result.payload.data.open_requests.some(request => request.id === 'r4'), false);
    assert.strictEqual(result.payload.data.open_requests.some(request => request.id === 'r5'), true);
    assert.strictEqual(result.payload.data.closed_requests.some(request => request.id === 'r2'), false);
    assert.strictEqual(result.payload.data.messages.some(message => message.text === 'Emp2 answer'), false);
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
          value: {
            enabled: true,
            levels: ['error', 'info'],
            target: 'main_group',
            sources: [{ chat_id: '-100900', label: 'Backend logs', source: 'backend', enabled: true }]
          }
        }]
      }
    });
    assert.strictEqual(saveResult.status, 200);
    assert.strictEqual(saveResult.payload.data[0].value.enabled, true);
    assert.deepStrictEqual(saveResult.payload.data[0].value.levels, ['error', 'info']);
    assert.strictEqual(saveResult.payload.data[0].value.sources[0].label, 'Backend logs');
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

async function testGroupMessageAuditSettingCanBeSaved() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  let settingsRows = [
    { key: 'main_group', value: { chat_id: '-100777' } },
    { key: 'group_message_audit', value: { enabled: true, target: 'main_group', channel_id: '' } }
  ];

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

  try {
    const result = await callAdmin('settings', {
      method: 'POST',
      body: {
        settings: [{
          key: 'group_message_audit',
          value: { enabled: true, target: 'channel', channel_id: '-100999' }
        }]
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data[0].key, 'group_message_audit');
    assert.strictEqual(result.payload.data[0].value.enabled, true);
    assert.strictEqual(result.payload.data[0].value.target, 'channel');
    assert.strictEqual(result.payload.data[0].value.channel_id, '-100999');
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    clearBotSettingsCache();
  }
}

async function testGroupMessageAuditChannelRequiresDestination() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalConsoleError = console.error;

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'group_message_audit', value: { enabled: true, target: 'main_group', channel_id: '' } }
    ];
    return [];
  };
  supabase.insert = async () => {
    throw new Error('insert should not be called');
  };
  console.error = () => {};

  try {
    const result = await callAdmin('settings', {
      method: 'POST',
      body: {
        settings: [{
          key: 'group_message_audit',
          value: { enabled: true, target: 'channel', channel_id: '' }
        }]
      }
    });

    assert.strictEqual(result.status, 400);
    assert.match(result.payload.error, /kanal ID/i);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    console.error = originalConsoleError;
    clearBotSettingsCache();
  }
}

async function testSendGroupAuditStatsSendsConfiguredChannelReport() {
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [
      { key: 'main_group', value: { chat_id: '-100777' } },
      { key: 'group_message_audit', value: { enabled: true, target: 'channel', channel_id: '-100999' } }
    ];
    if (table === 'tg_chats') return [
      { chat_id: -1001, title: 'Support A', source_type: 'group', member_status: 'administrator', is_active: true, last_message_at: '2026-05-07T04:00:00.000Z' },
      { chat_id: -1002, title: 'Support B', source_type: 'group', member_status: 'member', is_active: true, last_message_at: '2026-05-07T03:00:00.000Z' }
    ];
    if (table === 'messages') return [
      { id: 'm1', chat_id: -1001, source_type: 'group', raw: { source: 'customer_message' }, created_at: '2026-05-07T04:00:00.000Z' },
      { id: 'm2', chat_id: -1001, source_type: 'group', raw: { source: 'employee_message' }, created_at: '2026-05-07T04:01:00.000Z' },
      { id: 'm3', chat_id: -100999, source_type: 'group', raw: { source: 'bot_message_saved_notice' }, created_at: '2026-05-07T04:02:00.000Z' }
    ];
    if (table === 'support_requests') return [
      { id: 'r1', chat_id: -1001, source_type: 'group', status: 'open', created_at: '2026-05-07T04:03:00.000Z' },
      { id: 'r2', chat_id: -1001, source_type: 'group', status: 'closed', created_at: '2026-05-07T04:04:00.000Z' }
    ];
    return [];
  };
  global.fetch = async (url, options = {}) => {
    telegramCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 901 } })
    };
  };

  try {
    const result = await callAdmin('sendGroupAuditStats', { method: 'POST', body: {} });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.chat_id, '-100999');
    assert.strictEqual(result.payload.data.admin_groups_count, 1);
    assert.strictEqual(result.payload.data.saved_groups_count, 1);
    assert.strictEqual(result.payload.data.saved_messages_count, 2);
    assert.strictEqual(telegramCalls.length, 1);
    assert.strictEqual(telegramCalls[0].body.chat_id, '-100999');
    assert.match(telegramCalls[0].body.text, /Guruhlar auditi statistikasi/);
    assert.match(telegramCalls[0].body.text, /Support A/);
  } finally {
    supabase.select = originalSelect;
    global.fetch = originalFetch;
  }
}

async function testCompanyInfoProxyNormalizesExternalRows() {
  const originalFetch = global.fetch;
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalAuth = process.env.UYQUR_COMPANY_INFO_AUTH;
  const originalUrl = process.env.UYQUR_COMPANY_INFO_URL;
  process.env.UYQUR_COMPANY_INFO_AUTH = 'test-company-auth';
  process.env.UYQUR_COMPANY_INFO_URL = 'https://example.test/company-info';
  const calls = [];
  const insertedEmployees = [];

  supabase.select = async (table) => {
    if (table === 'employees') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    if (table === 'employees') {
      insertedEmployees.push(...rows);
      return rows.map((row, index) => ({ id: `employee-${index + 1}`, ...row }));
    }
    return rows;
  };

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
          secret_token: 'must-not-leak',
          status_histories: [{ id: 5, old_status: null, new_status: 'ACTIVE', company_id: 3, changed_at: 1776196774, internal_note: 'hidden' }]
        }]
      })
    };
  };

  try {
    const result = await callAdmin('companyInfo');
    assert.strictEqual(result.status, 200);
    const calledUrl = new URL(calls[0].url);
    assert.strictEqual(`${calledUrl.origin}${calledUrl.pathname}`, 'https://example.test/company-info');
    assert.strictEqual(calledUrl.searchParams.get('scope'), 'companies');
    assert.strictEqual(calledUrl.searchParams.get('include'), 'status_histories');
    const fields = calledUrl.searchParams.get('fields').split(',');
    assert.ok(fields.includes('id'));
    assert.ok(fields.includes('name'));
    assert.ok(fields.includes('status_histories'));
    assert.strictEqual(fields.includes('secret_token'), false);
    assert.strictEqual(calls[0].options.headers['X-Auth'], 'test-company-auth');
    assert.strictEqual(result.payload.data.summary.total, 1);
    assert.strictEqual(result.payload.data.summary.active, 1);
    assert.strictEqual(result.payload.data.summary.support_assigned, 1);
    assert.strictEqual(result.payload.data.persisted, true);
    assert.strictEqual(result.payload.data.support_employee_sync.created, 1);
    assert.strictEqual(insertedEmployees[0].username, 'uyqur_nurali');
    assert.strictEqual(insertedEmployees[0].role, 'support');
    assert.strictEqual(result.payload.data.companies[0].name, 'Gagarin Avenue');
    assert.strictEqual(result.payload.data.companies[0].created_at_iso, '2023-12-21T04:11:11.000Z');
    assert.strictEqual(result.payload.data.companies[0].latest_status_change.new_status, 'ACTIVE');
    assert.strictEqual(result.payload.data.companies[0].secret_token, undefined);
    assert.strictEqual(result.payload.data.companies[0].status_histories[0].internal_note, undefined);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.UYQUR_COMPANY_INFO_AUTH;
    else process.env.UYQUR_COMPANY_INFO_AUTH = originalAuth;
    if (originalUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalUrl;
  }
}

async function testCompanyInfoProxyReturnsCachedSnapshotAndNotifiesOnFetchError() {
  const originalFetch = global.fetch;
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalAuth = process.env.UYQUR_COMPANY_INFO_AUTH;
  const originalUrl = process.env.UYQUR_COMPANY_INFO_URL;
  process.env.UYQUR_COMPANY_INFO_AUTH = 'test-company-auth';
  process.env.UYQUR_COMPANY_INFO_URL = 'https://example.test/company-info';
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table, query = {}) => {
    if (table !== 'bot_settings') return [];
    if (String(query.key || '').includes('uyqur_company_info_cache')) {
      return [{
        key: 'uyqur_company_info_cache',
        updated_at: '2026-05-04T04:00:00.000Z',
        value: {
          summary: { total: 1, active: 1 },
          companies: [{ id: 3, name: 'Cached Company' }],
          fetched_at: '2026-05-04T03:59:00.000Z',
          cached_at: '2026-05-04T04:00:00.000Z',
          source: 'https://example.test/company-info'
        }
      }];
    }
    return [
      { key: 'log_notifications', value: { enabled: true, levels: ['error'], target: 'main_group' } },
      { key: 'main_group', value: { chat_id: '-100777' } }
    ];
  };
  supabase.insert = async (_table, rows) => rows;
  global.fetch = async (url, options = {}) => {
    if (/api\.telegram\.org/.test(url)) {
      telegramCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 711 } })
      };
    }
    return {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ message: 'Company API down' })
    };
  };

  try {
    const result = await callAdmin('companyInfo');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.data.from_cache, true);
    assert.strictEqual(result.payload.data.stale, true);
    assert.match(result.payload.data.last_error, /Company API down/);
    assert.strictEqual(result.payload.data.companies[0].name, 'Cached Company');
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /ERROR log/);
    assert.match(telegramCalls[0].body.text, /company-info:sync/);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.UYQUR_COMPANY_INFO_AUTH;
    else process.env.UYQUR_COMPANY_INFO_AUTH = originalAuth;
    if (originalUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalUrl;
    clearBotSettingsCache();
  }
}

async function testCompanyInfoProxyFallsBackWhenScopedQueryUnsupported() {
  const originalFetch = global.fetch;
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalAuth = process.env.UYQUR_COMPANY_INFO_AUTH;
  const originalUrl = process.env.UYQUR_COMPANY_INFO_URL;
  process.env.UYQUR_COMPANY_INFO_AUTH = 'test-company-auth';
  process.env.UYQUR_COMPANY_INFO_URL = 'https://example.test/company-info';
  const calls = [];

  supabase.select = async () => [];
  supabase.insert = async (_table, rows) => rows;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Unknown fields parameter' })
      };
    }
    return {
      ok: true,
      json: async () => ({ data: [] })
    };
  };

  try {
    const result = await callAdmin('companyInfo');
    assert.strictEqual(result.status, 200);
    assert.match(calls[0].url, /fields=/);
    assert.strictEqual(calls[1].url, 'https://example.test/company-info');
    assert.strictEqual(result.payload.data.source, 'https://example.test/company-info');
    assert.strictEqual(result.payload.data.summary.total, 0);
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.UYQUR_COMPANY_INFO_AUTH;
    else process.env.UYQUR_COMPANY_INFO_AUTH = originalAuth;
    if (originalUrl === undefined) delete process.env.UYQUR_COMPANY_INFO_URL;
    else process.env.UYQUR_COMPANY_INFO_URL = originalUrl;
  }
}

async function testAssignGroupToExternalCompanyCreatesLocalCompany() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalPatch = supabase.patch;
  const inserted = [];
  const patched = [];

  supabase.select = async (table) => {
    if (table === 'companies') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    if (table === 'companies') return rows.map(row => ({ id: 'company-local-1', ...row }));
    return rows;
  };
  supabase.patch = async (table, query, values) => {
    patched.push({ table, query, values });
    return [{ chat_id: -100900, ...values }];
  };

  try {
    const result = await callAdmin('assignChatCompany', {
      method: 'POST',
      body: {
        chat_id: -100900,
        company: {
          id: 33,
          name: 'Gagarin Avenue',
          brand: 'Gagarin',
          director: 'Gagarin Admin',
          phone: '+998900223355'
        }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(inserted[0].table, 'companies');
    assert.strictEqual(inserted[0].rows[0].name, 'Gagarin Avenue');
    assert.match(inserted[0].rows[0].notes, /Uyqur API ID: 33/);
    assert.strictEqual(patched[0].table, 'tg_chats');
    assert.strictEqual(patched[0].values.company_id, 'company-local-1');
    assert.strictEqual(result.payload.data.assigned_company.id, 'company-local-1');
  } finally {
    supabase.select = originalSelect;
    supabase.insert = originalInsert;
    supabase.patch = originalPatch;
  }
}

async function testAssignGroupCompanyCanBeCleared() {
  const originalPatch = supabase.patch;
  const patched = [];

  supabase.patch = async (table, query, values) => {
    patched.push({ table, query, values });
    return [{ chat_id: -100900, ...values }];
  };

  try {
    const result = await callAdmin('assignChatCompany', {
      method: 'POST',
      body: { chat_id: -100900, company_id: '', clear: true }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(patched.length, 1);
    assert.strictEqual(patched[0].table, 'tg_chats');
    assert.strictEqual(patched[0].values.company_id, null);
    assert.strictEqual(result.payload.data.company_id, null);
  } finally {
    supabase.patch = originalPatch;
  }
}

async function testClickUpIntegrationSaveMasksToken() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  let insertedRows = null;
  const clickUpCalls = [];

  supabase.select = async (table) => {
    assert.strictEqual(table, 'bot_settings');
    return [{ key: 'clickup_integration', value: { enabled: false } }];
  };
  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'bot_settings');
    insertedRows = rows;
    return rows;
  };
  global.fetch = async (url) => {
    clickUpCalls.push(url);
    assert.match(url, /api\.clickup\.com\/api\/v2\/list\//);
    return {
      ok: true,
      json: async () => ({ id: 'list-1', name: 'List' })
    };
  };

  try {
    const result = await callSettings({
      settings: [{
        key: 'clickup_integration',
        value: {
          enabled: true,
          api_token: 'pk_test_clickup',
          newbies_list_id: '111',
          big_team_list_id: '222',
          newbies_chat_id: '-100111',
          big_team_chat_id: '-100222',
          done_status: 'complete'
        }
      }]
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.ok, true);
    assert.strictEqual(clickUpCalls.length, 2);
    assert.strictEqual(insertedRows[0].value.api_token, 'pk_test_clickup');
    assert.strictEqual(insertedRows[0].value.last_check_status, 'ok');
    const saved = result.payload.data[0].value;
    assert.strictEqual(saved.api_token, '');
    assert.strictEqual(saved.has_api_token, true);
    assert.strictEqual(saved.last_check_status, 'ok');
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
  await testGroupsIncludeMessageStatsForChatPreview();
  await testChatDetailIncludesTicketSolutionAndTimeline();
  await testChatDetailShowsTelegramMemberServiceMessages();
  await testCompanyGroupActivityReturnsLinkedGroupMessagesWithTickets();
  await testCompanyGroupActivityLimitsLargeConversationPayload();
  await testDashboardCompanyTicketsUseRegisteredGroupCompany();
  await testDashboardCompanyTicketsIncludeLinkedGroupMessagesWithoutRequests();
  await testDashboardCompanyTicketsUseLinkedGroupOrdinaryMessages();
  await testDashboardEmployeePerformanceCountsOpenAndSlaPerEmployee();
  await testRequestsListEnrichesCompanyFromRegisteredGroup();
  await testRequestsListShowsResponsibleEmployeeFromTicketMessages();
  await testWebhookInfoWarnsWhenMessageUpdatesMissing();
  await testWebhookInfoWarnsWhenPointingToCompanyInfoUrl();
  await testSetWebhookRejectsCompanyInfoUrl();
  await testSetWebhookPrefersExplicitAppUrl();
  await testTelegramFileUsesPlayableMimeTypeAndFilename();
  await testSyncTelegramUpdatesDeletesActiveWebhookThenProcessesUpdates();
  await testSyncTelegramUpdatesIgnoresStaleOffsetAndAcknowledgesFetchedUpdates();
  await testSendToChatStoresOutgoingAdminMessage();
  await testReplyRequestSendsMessageAndClosesTicket();
  await testReplyRequestFallsBackWhenBusinessPeerInvalid();
  await testEmployeesIncludeDailyWorkStats();
  await testDeleteEmployeeRemovesEmployeeRow();
  await testEmployeeActivityReturnsGroupsAndCustomers();
  await testEmployeeActivityIsolatesSelectedEmployeeChats();
  await testLogNotificationsCanSendSelectedLevels();
  await testGroupMessageAuditSettingCanBeSaved();
  await testGroupMessageAuditChannelRequiresDestination();
  await testSendGroupAuditStatsSendsConfiguredChannelReport();
  await testCompanyInfoProxyNormalizesExternalRows();
  await testCompanyInfoProxyReturnsCachedSnapshotAndNotifiesOnFetchError();
  await testCompanyInfoProxyFallsBackWhenScopedQueryUnsupported();
  await testAssignGroupToExternalCompanyCreatesLocalCompany();
  await testAssignGroupCompanyCanBeCleared();
  await testClickUpIntegrationSaveMasksToken();
  console.log('Admin tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
