'use strict';

const assert = require('assert');
const { Readable } = require('stream');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = require('../backend/lib/supabase');
const handler = require('../backend/api/bot');
const { clearBotSettingsCache } = require('../backend/lib/bot-settings');

function createReq(body, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = 'POST';
  req.url = '/api/bot';
  req.headers = {
    host: 'localhost',
    'x-telegram-bot-api-secret-token': 'test-secret',
    ...headers
  };
  return req;
}

function createRes() {
  const res = {
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
  return res;
}

async function callHandler(body) {
  const res = createRes();
  const originalInfo = console.info;
  console.info = () => {};
  try {
    await handler(createReq(body), res);
  } finally {
    console.info = originalInfo;
  }
  return { status: res.statusCode, payload: JSON.parse(res.body) };
}

async function testStartRepliesWhenDbTrackingFails() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const telegramCalls = [];

  supabase.insert = async () => { throw new Error('db down'); };
  supabase.select = async () => { throw new Error('db down'); };
  supabase.patch = async () => { throw new Error('db down'); };
  console.error = () => {};
  global.fetch = async (_url, options) => {
    telegramCalls.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 100 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 1,
      message: {
        message_id: 10,
        date: 1777100000,
        text: '/start',
        chat: { id: 777, type: 'private', first_name: 'Ali' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(telegramCalls.length, 1);
    assert.strictEqual(telegramCalls[0].chat_id, 777);
    assert.match(telegramCalls[0].text, /Assalomu alaykum/);
    assert.match(telegramCalls[0].text, /Qanday yordam bera olaman/);
    assert.doesNotMatch(telegramCalls[0].text, /Admin panel/i);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

async function testChatMemberUpdateRegistersGroup() {
  const originalInsert = supabase.insert;
  let row = null;

  supabase.insert = async (table, rows) => {
    assert.strictEqual(table, 'tg_chats');
    row = rows[0];
    return rows;
  };

  try {
    const result = await callHandler({
      update_id: 2,
      my_chat_member: {
        chat: { id: -100123, type: 'supergroup', title: 'Support group' },
        new_chat_member: { status: 'administrator' }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'chat_member');
    assert.strictEqual(row.chat_id, -100123);
    assert.strictEqual(row.source_type, 'group');
    assert.strictEqual(row.member_status, 'administrator');
    assert.strictEqual(row.is_active, true);
  } finally {
    supabase.insert = originalInsert;
  }
}

async function testGroupStartAndRegisterDeleteCommandWithoutReply() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  const chatRows = [];

  supabase.insert = async (table, rows) => {
    if (table === 'tg_chats') chatRows.push(rows[0]);
    return rows;
  };
  supabase.select = async () => [];
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 101 } })
    };
  };

  try {
    const commands = ['/start', '/register'];
    for (let index = 0; index < commands.length; index += 1) {
      const result = await callHandler({
        update_id: 4 + index,
        message: {
          message_id: 12 + index,
          date: 1777100000,
          text: commands[index],
          chat: { id: -100777, type: 'supergroup', title: 'Support group' },
          from: { id: 777, first_name: 'Ali', is_bot: false }
        }
      });

      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.payload.handled, 'message');
    }

    assert.strictEqual(chatRows.length, 2);
    assert.strictEqual(chatRows.every(row => row.chat_id === -100777 && row.source_type === 'group'), true);
    assert.strictEqual(telegramCalls.length, 2);
    telegramCalls.forEach((call, index) => {
      assert.match(call.url, /deleteMessage$/);
      assert.strictEqual(String(call.body.chat_id), '-100777');
      assert.strictEqual(call.body.message_id, 12 + index);
      assert.strictEqual(call.body.text, undefined);
    });
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
  }
}

async function testGroupRegisterDbFailureStillDeletesCommand() {
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const telegramCalls = [];

  supabase.insert = async () => { throw new Error('tg_chats write failed'); };
  console.error = () => {};
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 102 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 5,
      message: {
        message_id: 13,
        date: 1777100000,
        text: '/register',
        chat: { id: -100888, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(telegramCalls.length, 2);
    assert.match(telegramCalls[0].url, /deleteMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, -100888);
    assert.strictEqual(telegramCalls[0].body.message_id, 13);
    assert.strictEqual(telegramCalls[0].body.text, undefined);
    assert.match(telegramCalls[1].url, /sendMessage$/);
    assert.strictEqual(telegramCalls[1].body.chat_id, -100888);
    assert.ok(telegramCalls[1].body.text.includes('xatolik yuz berdi'));
  } finally {
    supabase.insert = originalInsert;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

async function testGroupDoneDoesNotReplyToGroup() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const telegramCalls = [];

  supabase.insert = async (table, rows) => {
    if (table === 'employees') return rows.map(row => ({ id: 'employee-1', ...row }));
    return rows;
  };
  supabase.select = async () => [];
  supabase.patch = async () => [];
  global.fetch = async (_url, options) => {
    telegramCalls.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 103 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 6,
      message: {
        message_id: 14,
        date: 1777100000,
        text: '#done hal bo‘ldi',
        chat: { id: -100999, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(telegramCalls.length, 0);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
  }
}

async function testRequestMessageAppendsToExistingOpenRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'support_requests') {
      return [{
        id: 'request-1',
        chat_id: 777,
        source_type: 'private',
        customer_tg_id: 777,
        initial_text: 'Login qilolmayapman, yordam bering',
        status: 'open',
        created_at: new Date().toISOString()
      }];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 601 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 7,
      message: {
        message_id: 15,
        date: 1777100000,
        text: 'Login qilolmayapman, tekshirib bering',
        chat: { id: 777, type: 'private', first_name: 'Ali' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(insertedTables.includes('support_requests'), false);
    assert.strictEqual(insertedTables.includes('request_events'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /So'rovingiz qabul qilindi/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testPrivateGreetingRepliesWithGreeting() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async () => [];
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 605 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 70,
      message: {
        message_id: 150,
        date: 1777100000,
        text: 'Assalomu alaykum',
        chat: { id: 801, type: 'private', first_name: 'Ali' },
        from: { id: 801, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(insertedTables.includes('support_requests'), false);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /Va alaykum assalom/);
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 150);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testPrivateUnknownTextRepliesWithRedirect() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async () => [];
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 606 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 71,
      message: {
        message_id: 151,
        date: 1777100000,
        text: 'asdfgh',
        chat: { id: 802, type: 'private', first_name: 'Vali' },
        from: { id: 802, first_name: 'Vali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(insertedTables.includes('support_requests'), false);
    assert.strictEqual(telegramCalls.length, 1);
    assert.strictEqual(telegramCalls[0].body.text, "So'rovingizni guruhga yoki @uyqur_nurali ga berishingiz mumkin");
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 151);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testAiModeSettingOpensPrivateBroadRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'ai_mode', value: { enabled: true, provider: null } },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 602 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 8,
      message: {
        message_id: 16,
        date: 1777100000,
        text: 'Uyqur obyekt sozlamalari haqida gaplashamiz',
        chat: { id: 778, type: 'private', first_name: 'Vali' },
        from: { id: 778, first_name: 'Vali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(insertedTables.includes('support_requests'), true);
    assert.strictEqual(insertedTables.includes('request_events'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /So'rovingiz qabul qilindi/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testLocalSmartIntentOpensPrivateRequestWithoutAiMode() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async () => [];
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 603 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 10,
      message: {
        message_id: 18,
        date: 1777100000,
        text: 'Smeta hisobotini chiqara olmayapman, ko‘rsatib bering',
        chat: { id: 779, type: 'private', first_name: 'Nodir' },
        from: { id: 779, first_name: 'Nodir', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(insertedTables.includes('support_requests'), true);
    assert.strictEqual(insertedTables.includes('request_events'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /So'rovingiz qabul qilindi/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testSelectedAiModelClassifiesRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const insertedTables = [];
  const telegramCalls = [];
  const aiCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'ai_mode', value: { enabled: true, provider: 'openai_compatible', model: 'test-model', model_label: 'Test AI' } },
        {
          key: 'ai_integration',
          value: {
            enabled: true,
            provider: 'openai_compatible',
            label: 'Test AI',
            base_url: 'https://ai.example/v1',
            model: 'test-model',
            api_key: 'secret-token',
            system_prompt: 'Return JSON classification',
            knowledge_text: 'Uyqur technical support', last_check_status: 'ok'
          }
        },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    if (table === 'support_requests') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (url, options) => {
    if (/api\.telegram\.org/.test(url)) {
      telegramCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 604 } })
      };
    }
    assert.strictEqual(url, 'https://ai.example/v1/chat/completions');
    const body = JSON.parse(options.body);
    aiCalls.push(body);
    assert.strictEqual(body.model, 'test-model');
    assert.strictEqual(options.headers.Authorization, 'Bearer secret-token');
    if (!body.response_format) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Bu masalani texnik yordam ko‘rib chiqadi. Iltimos, qaysi bo‘limda muammo chiqayotganini yozing.'
            }
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ classification: 'request', confidence: 0.93, reason: 'Uyqur support intent' })
          }
        }]
      })
    };
  };

  try {
    const result = await callHandler({
      update_id: 11,
      message: {
        message_id: 19,
        date: 1777100000,
        text: 'Buni texnik yordam ko‘rib chiqsin',
        chat: { id: 780, type: 'private', first_name: 'Sardor' },
        from: { id: 780, first_name: 'Sardor', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(aiCalls.length, 2);
    assert.strictEqual(insertedTables.includes('support_requests'), true);
    assert.strictEqual(insertedTables.includes('request_events'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /texnik yordam ko‘rib chiqadi/);
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 19);
    assert.strictEqual(telegramCalls[0].body.parse_mode, undefined);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testClassifierJsonIsNotSentAsAutoReply() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const inserted = [];
  const telegramCalls = [];
  const aiCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'ai_mode', value: { enabled: true, provider: 'openai_compatible', model: 'test-model', model_label: 'Test AI' } },
        {
          key: 'ai_integration',
          value: {
            enabled: true,
            provider: 'openai_compatible',
            label: 'Test AI',
            base_url: 'https://ai.example/v1',
            model: 'test-model',
            api_key: 'secret-token',
            system_prompt: 'Return JSON classification',
            knowledge_text: '', last_check_status: 'ok'
          }
        },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    if (table === 'employees') return [];
    if (table === 'support_requests') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (url, options) => {
    if (/api\.telegram\.org/.test(url)) {
      telegramCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 704 } })
      };
    }

    const body = JSON.parse(options.body);
    aiCalls.push(body);
    if (body.response_format) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ classification: 'request', confidence: 0.94, reason: 'support intent' })
            }
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ classification: 'request', confidence: 0.9, reason: 'wrong response shape' })
          }
        }]
      })
    };
  };

  try {
    const result = await callHandler({
      update_id: 73,
      message: {
        message_id: 153,
        date: 1777100000,
        text: 'Login qilolmayapman, yordam bering',
        chat: { id: 781, type: 'private', first_name: 'Sardor' },
        from: { id: 781, first_name: 'Sardor', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(aiCalls.length, 2);
    assert.strictEqual(inserted.some(item => item.table === 'support_requests'), true);
    assert.strictEqual(inserted.some(item => item.table === 'messages' && item.rows[0].classification === 'ai_reply'), false);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].body.text, /So'rovingiz qabul qilindi/);
    assert.doesNotMatch(telegramCalls[0].body.text, /classification/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testAiModeAutoRepliesToGroupRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const inserted = [];
  const telegramCalls = [];
  const aiCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'ai_mode', value: { enabled: true, provider: 'openai_compatible', model: 'test-model', model_label: 'Test AI' } },
        {
          key: 'ai_integration',
          value: {
            enabled: true,
            provider: 'openai_compatible',
            label: 'Test AI',
            base_url: 'https://ai.example/v1',
            model: 'test-model',
            api_key: 'secret-token',
            system_prompt: 'Return JSON classification',
            knowledge_text: 'Uyqur technical support', last_check_status: 'ok'
          }
        },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    if (table === 'employees') return [];
    if (table === 'support_requests') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (url, options) => {
    if (/api\.telegram\.org/.test(url)) {
      telegramCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 702 } })
      };
    }

    const body = JSON.parse(options.body);
    aiCalls.push(body);
    assert.strictEqual(url, 'https://ai.example/v1/chat/completions');
    assert.strictEqual(options.headers.Authorization, 'Bearer secret-token');
    if (body.response_format) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ classification: 'request', confidence: 0.95, reason: 'Group support intent' })
            }
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'Login muammosi uchun parolni tiklash oynasini tekshiring. Agar SMS kelmasa, telefon raqamingizni yuboring.'
          }
        }]
      })
    };
  };

  try {
    const result = await callHandler({
      update_id: 72,
      message: {
        message_id: 152,
        date: 1777100000,
        text: 'Login qilolmayapman, xato chiqyapti',
        chat: { id: -100300, type: 'supergroup', title: 'Support group' },
        from: { id: 1001, first_name: 'Customer', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(aiCalls.length, 2);
    assert.strictEqual(inserted.some(item => item.table === 'support_requests'), true);
    assert.strictEqual(inserted.some(item => item.table === 'request_events' && item.rows[0].event_type === 'opened'), true);
    assert.strictEqual(inserted.some(item => item.table === 'messages' && item.rows[0].classification === 'ai_reply'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.strictEqual(telegramCalls[0].body.chat_id, -100300);
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 152);
    assert.match(telegramCalls[0].body.text, /parolni tiklash/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testAutoReplyFallbackUsesLocalKnowledge() {
  const originalSelect = supabase.select;
  const originalInsert = supabase.insert;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  const inserted = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'ai_mode', value: { enabled: false, provider: null } },
        { key: 'auto_reply', value: { enabled: true } },
        { key: "ai_integration", value: { enabled: true, provider: "openai_compatible", knowledge_text: "Savol: Printer ishlamaydi? Javob: Printerni ochib qayta yoqib koring." , last_check_status: 'ok'} },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    if (table === 'employees') return [];
    if (table === 'support_requests') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (url, options) => {
    if (/api\.telegram\.org/.test(url)) {
      telegramCalls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 802 } })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, result: {} })
    };
  };

  try {
    const result = await callHandler({
      update_id: 82,
      message: {
        message_id: 182,
        date: 1777100000,
        text: 'Printerim ishlamayapti',
        chat: { id: 900, type: 'private', first_name: 'Mijoz' },
        from: { id: 900, first_name: 'Mijoz', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(telegramCalls.length, 1);
    assert.strictEqual(telegramCalls[0].body.chat_id, 900);
    assert.strictEqual(telegramCalls[0].body.reply_to_message_id, 182);
    assert.match(telegramCalls[0].body.text, /ochib qayta yoqib/);
    assert.doesNotMatch(telegramCalls[0].body.text, /Savol:/);
    assert.doesNotMatch(telegramCalls[0].body.text, /Javob:/);
    assert.strictEqual(inserted.some(item => item.table === 'support_requests'), true);
    assert.strictEqual(inserted.some(item => item.table === 'messages' && item.rows[0].classification === 'ai_reply'), true);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testGroupMessageAuditSendsToConfiguredChannel() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const inserted = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') {
      return [
        { key: 'main_group', value: { chat_id: '-100777' } },
        { key: 'group_message_audit', value: { enabled: true, target: 'channel', channel_id: '-100999' } },
        { key: 'request_detection', value: { mode: 'keyword', min_text_length: 10 } }
      ];
    }
    if (table === 'employees') return [];
    if (table === 'support_requests') return [];
    if (table === 'tg_chats') return [];
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 901 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 90,
      message: {
        message_id: 190,
        date: 1777100000,
        text: 'Oddiy suhbat xabari',
        chat: { id: -100300, type: 'supergroup', title: 'Support group' },
        from: { id: 1001, first_name: 'Customer', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(inserted.some(item => item.table === 'messages'), true);
    assert.strictEqual(inserted.some(item => item.table === 'support_requests'), false);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(String(telegramCalls[0].body.chat_id), '-100999');
    assert.match(telegramCalls[0].body.text, /Guruh xabari saqlandi/);
    assert.doesNotMatch(String(telegramCalls[0].body.chat_id), /-100777/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMainGroupStatsTriggerSendsReport() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const telegramCalls = [];
  const insertedTables = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'main_group', value: { chat_id: '-100777' } }];
    if (table === 'v_today_summary') return [{ total_requests: 1, open_requests: 0, closed_requests: 1, groups_count: 1 }];
    if (table === 'employees') return [{ id: 'employee-1', full_name: 'Ali Valiyev', username: 'ali' }];
    if (table === 'v_chat_statistics') return [{ chat_id: -100777, title: 'Main group', open_requests: 0 }];
    if (table === 'support_requests') {
      return [{
        id: 'request-1',
        source_type: 'group',
        chat_id: -100777,
        status: 'closed',
        closed_by_employee_id: 'employee-1',
        closed_by_name: 'Ali Valiyev',
        created_at: new Date().toISOString(),
        closed_at: new Date().toISOString()
      }];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    insertedTables.push(table);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  console.error = () => {};
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 104 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 9,
      message: {
        message_id: 17,
        date: 1777100000,
        text: 'xodimlar statisticasi',
        chat: { id: -100777, type: 'supergroup', title: 'Main group' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /sendMessage$/);
    assert.strictEqual(String(telegramCalls[0].body.chat_id), '-100777');
    assert.match(telegramCalls[0].body.text, /Bugungi xodimlar statistikasi/);
    assert.match(telegramCalls[0].body.text, /Ali Valiyev/);
    assert.strictEqual(insertedTables.includes('support_requests'), false);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    clearBotSettingsCache();
  }
}

async function testReplyToCustomerTicketClosesRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const inserted = [];
  const patched = [];
  clearBotSettingsCache();

  supabase.select = async (table, query = {}) => {
    if (table === 'bot_settings') return [];
    if (table === 'employees') return [];
    if (table === 'support_requests' && query.initial_message_id) {
      return [{
        id: 'request-1',
        chat_id: -100200,
        status: 'open',
        customer_tg_id: 1001,
        customer_name: 'Customer',
        initial_message_id: 40,
        initial_text: 'Login qilolmayapman',
        created_at: new Date().toISOString()
      }];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    if (table === 'employees') return rows.map(row => ({ id: 'employee-1', ...row }));
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  supabase.patch = async (table, query, values) => {
    patched.push({ table, query, values });
    return [{ id: 'request-1', ...values }];
  };

  try {
    const result = await callHandler({
      update_id: 12,
      message: {
        message_id: 41,
        date: 1777100000,
        text: 'Hal qildim, tekshirib ko‘ring',
        chat: { id: -100200, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', is_bot: false },
        reply_to_message: {
          message_id: 40,
          date: 1777099900,
          text: 'Login qilolmayapman',
          chat: { id: -100200, type: 'supergroup', title: 'Support group' },
          from: { id: 1001, first_name: 'Customer', is_bot: false }
        }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    const closePatch = patched.find(item => item.table === 'support_requests');
    assert.ok(closePatch);
    assert.strictEqual(closePatch.values.status, 'closed');
    assert.strictEqual(closePatch.values.closed_by_tg_id, 777);
    assert.strictEqual(closePatch.values.done_message_id, 41);
    assert.strictEqual(inserted.some(item => item.table === 'employees'), true);
    assert.strictEqual(inserted.some(item => item.table === 'support_requests'), false);
    assert.strictEqual(inserted.some(item => item.table === 'request_events' && item.rows[0].event_type === 'closed'), true);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    clearBotSettingsCache();
  }
}

async function testEmployeePlainAnswerClosesLatestOpenRequest() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const inserted = [];
  const patched = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table, query = {}) => {
    if (table === 'bot_settings') return [];
    if (table === 'employees') return [{ id: 'employee-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true }];
    if (table === 'support_requests' && query.status === 'eq.open') {
      return [{
        id: 'request-1',
        chat_id: -100200,
        status: 'open',
        customer_tg_id: 1001,
        customer_name: 'Customer',
        initial_message_id: 40,
        initial_text: 'Login qilolmayapman',
        created_at: new Date().toISOString()
      }];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  supabase.patch = async (table, query, values) => {
    patched.push({ table, query, values });
    return [{ id: 'request-1', ...values }];
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 701 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 13,
      message: {
        message_id: 42,
        date: 1777100000,
        text: 'Parolni yangilab berdim, endi kirib ko‘ring',
        chat: { id: -100200, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', username: 'ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    const closePatch = patched.find(item => item.table === 'support_requests');
    assert.ok(closePatch);
    assert.strictEqual(closePatch.values.status, 'closed');
    assert.strictEqual(closePatch.values.closed_by_employee_id, 'employee-1');
    assert.strictEqual(closePatch.values.closed_by_tg_id, 777);
    assert.strictEqual(closePatch.values.done_message_id, 42);
    assert.strictEqual(inserted.some(item => item.table === 'request_events' && item.rows[0].event_type === 'closed'), true);
    assert.strictEqual(inserted.some(item => item.table === 'request_events' && item.rows[0].event_type === 'done_without_request'), false);
    assert.strictEqual(telegramCalls.length, 0);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMessageReactionSettingEnablesTicketCloseReaction() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const inserted = [];
  const patched = [];
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table, query = {}) => {
    if (table === 'bot_settings') {
      return [
        { key: 'message_reactions', value: { enabled: true, ticket_close: true, emoji: '\u26a1' } }
      ];
    }
    if (table === 'employees') return [{ id: 'employee-1', tg_user_id: 777, full_name: 'Ali', username: 'ali', is_active: true }];
    if (table === 'support_requests' && query.status === 'eq.open') {
      return [{
        id: 'request-1',
        chat_id: -100200,
        status: 'open',
        customer_tg_id: 1001,
        customer_name: 'Customer',
        initial_message_id: 40,
        initial_text: 'Login qilolmayapman',
        created_at: new Date().toISOString()
      }];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    inserted.push({ table, rows });
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  supabase.patch = async (table, query, values) => {
    patched.push({ table, query, values });
    return [{ id: 'request-1', ...values }];
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: true })
    };
  };

  try {
    const result = await callHandler({
      update_id: 14,
      message: {
        message_id: 43,
        date: 1777100000,
        text: 'Parolni yangilab berdim, endi kirib ko‘ring',
        chat: { id: -100200, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', username: 'ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(patched.some(item => item.table === 'support_requests' && item.values.status === 'closed'), true);
    assert.strictEqual(inserted.some(item => item.table === 'request_events' && item.rows[0].event_type === 'closed'), true);
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /setMessageReaction$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, -100200);
    assert.strictEqual(telegramCalls[0].body.message_id, 43);
    assert.deepStrictEqual(telegramCalls[0].body.reaction, [{ type: 'emoji', emoji: '⚡' }]);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMainGroupBroadcastPreview() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let broadcastRow = null;
  const announcementText = [
    'Yangi modul ishga tushdi',
    '',
    '1. Smeta eksporti',
    '2. Ombor qoldig‘i',
    '3. Xodimlar hisoboti'
  ].join('\n');
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'main_group', value: { chat_id: '-100777' } }];
    if (table === 'employees') return [];
    if (table === 'tg_chats') {
      return [
        { chat_id: -1001, title: 'New Era', source_type: 'group' },
        { chat_id: -100777, title: 'Main group', source_type: 'group' }
      ];
    }
    return [];
  };
  supabase.insert = async (table, rows) => {
    if (table === 'broadcasts') {
      broadcastRow = { id: 'broadcast-1', ...rows[0] };
      return [broadcastRow];
    }
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 105 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 13,
      message: {
        message_id: 50,
        date: 1777100000,
        text: '@uyqurbot shu yangilikni barcha guruhlarga yubor',
        chat: { id: -100777, type: 'supergroup', title: 'Main group' },
        from: { id: 777, first_name: 'Ali', username: 'ali_pm', is_bot: false },
        reply_to_message: {
          message_id: 49,
          date: 1777099900,
          text: announcementText,
          chat: { id: -100777, type: 'supergroup', title: 'Main group' },
          from: { id: 777, first_name: 'Ali', username: 'ali_pm', is_bot: false }
        }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(broadcastRow.status, 'created');
    assert.strictEqual(broadcastRow.total_targets, 2);
    assert.strictEqual(broadcastRow.text, announcementText);
    const preview = telegramCalls.find(call => /sendMessage$/.test(call.url));
    assert.ok(preview);
    assert.match(preview.body.text, /Ommaviy xabar preview/);
    assert.match(preview.body.text, /Yuboriladigan guruhlar:<\/b> 2 ta/);
    assert.match(preview.body.text, /1\. Smeta eksporti\n2\. Ombor qoldig‘i\n3\. Xodimlar hisoboti/);
    assert.strictEqual(preview.body.reply_markup.inline_keyboard[0][0].callback_data, 'broadcast_confirm:broadcast-1');
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMainGroupBroadcastConfirmSendsAndReports() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalPatch = supabase.patch;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  const patches = [];
  const targetRows = [];
  const announcementText = [
    'Yangi modul ishga tushdi',
    '',
    '1. Smeta eksporti',
    '2. Ombor qoldig‘i',
    '3. Xodimlar hisoboti'
  ].join('\n');
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'main_group', value: { chat_id: '-100777' } }];
    if (table === 'tg_chats') {
      return [
        { chat_id: -1001, title: 'New Era', source_type: 'group' },
        { chat_id: -1002, title: 'Fayus', source_type: 'group' },
        { chat_id: -100777, title: 'Main group', source_type: 'group' }
      ];
    }
    return [];
  };
  supabase.patch = async (table, query, values) => {
    patches.push({ table, query, values });
    if (table === 'broadcasts' && values.status === 'processing') {
      return [{ id: 'broadcast-1', text: announcementText, status: 'processing' }];
    }
    return [{ id: 'broadcast-1', ...values }];
  };
  supabase.insert = async (table, rows) => {
    if (table === 'broadcast_targets') targetRows.push(...rows);
    return rows.map(row => ({ id: `${table}-row`, ...row }));
  };
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    telegramCalls.push({ url: _url, body });
    if (/sendMessage$/.test(_url) && Number(body.chat_id) === -1002) {
      return {
        ok: true,
        json: async () => ({ ok: false, error_code: 403, description: 'Forbidden: bot was kicked' })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 106 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 14,
      callback_query: {
        id: 'callback-1',
        data: 'broadcast_confirm:broadcast-1',
        from: { id: 777, first_name: 'Ali', username: 'ali_pm', is_bot: false },
        message: {
          message_id: 55,
          date: 1777100000,
          text: 'preview',
          chat: { id: -100777, type: 'supergroup', title: 'Main group' }
        }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'callback_query');
    const targetSends = telegramCalls.filter(call => /sendMessage$/.test(call.url) && [-1001, -1002, -100777].includes(Number(call.body.chat_id)) && call.body.text === announcementText);
    assert.strictEqual(targetSends.length, 3);
    assert.strictEqual(targetSends[0].body.parse_mode, undefined);
    assert.strictEqual(targetSends[0].body.text, announcementText);
    const resultMessage = telegramCalls.find(call => /sendMessage$/.test(call.url) && Number(call.body.chat_id) === -100777 && /Ommaviy xabar yakunlandi/.test(call.body.text));
    assert.ok(resultMessage);
    assert.match(resultMessage.body.text, /New Era ✅/);
    assert.match(resultMessage.body.text, /Fayus 🔴/);
    assert.match(resultMessage.body.text, /Main group ✅/);
    assert.strictEqual(targetRows.some(row => row.chat_id === -1001 && row.status === 'sent'), true);
    assert.strictEqual(targetRows.some(row => row.chat_id === -1002 && row.status === 'failed'), true);
    assert.strictEqual(targetRows.some(row => row.chat_id === -100777 && row.status === 'sent'), true);
    assert.strictEqual(patches.some(item => item.table === 'broadcasts' && item.values.status === 'completed_with_errors'), true);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    supabase.patch = originalPatch;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMainGroupBroadcastDeletePreview() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'main_group', value: { chat_id: '-100777' } }];
    if (table === 'employees') return [];
    if (table === 'broadcasts') {
      return [{
        id: 'broadcast-1',
        title: 'Yangi modul',
        text: 'Yangi modul ishga tushdi',
        target_type: 'groups',
        sent_count: 2,
        failed_count: 0,
        status: 'sent',
        completed_at: new Date().toISOString()
      }];
    }
    if (table === 'broadcast_targets') {
      return [
        { id: 'target-1', broadcast_id: 'broadcast-1', chat_id: -1001, status: 'sent', telegram_message_id: 101 },
        { id: 'target-2', broadcast_id: 'broadcast-1', chat_id: -1002, status: 'sent', telegram_message_id: 102 }
      ];
    }
    if (table === 'tg_chats') {
      return [
        { chat_id: -1001, title: 'New Era' },
        { chat_id: -1002, title: 'Fayus' }
      ];
    }
    return [];
  };
  supabase.insert = async (table, rows) => rows.map(row => ({ id: `${table}-row`, ...row }));
  global.fetch = async (_url, options) => {
    telegramCalls.push({ url: _url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 107 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 15,
      message: {
        message_id: 60,
        date: 1777100000,
        text: 'oxirgi yangilanishdagi barcha guruhlarga yuborgan xabarlaringni o‘chir',
        chat: { id: -100777, type: 'supergroup', title: 'Main group' },
        from: { id: 777, first_name: 'Ali', username: 'ali_pm', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    const preview = telegramCalls.find(call => /sendMessage$/.test(call.url));
    assert.ok(preview);
    assert.match(preview.body.text, /Oxirgi ommaviy xabarni o‘chirish/);
    assert.match(preview.body.text, /Guruhlar:<\/b> 2 ta/);
    assert.match(preview.body.text, /Shu xabarni barcha guruhlardan o‘chirishimni tasdiqlaysizmi/);
    assert.strictEqual(preview.body.reply_markup.inline_keyboard[0][0].callback_data, 'broadcast_delete_confirm:broadcast-1');
    assert.strictEqual(preview.body.reply_markup.inline_keyboard[0][1].callback_data, 'broadcast_delete_cancel:broadcast-1');
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testMainGroupBroadcastDeleteConfirmDeletesAndReports() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  clearBotSettingsCache();

  supabase.select = async (table) => {
    if (table === 'bot_settings') return [{ key: 'main_group', value: { chat_id: '-100777' } }];
    if (table === 'broadcasts') {
      return [{
        id: 'broadcast-1',
        title: 'Yangi modul',
        text: 'Yangi modul ishga tushdi',
        target_type: 'groups',
        sent_count: 2,
        failed_count: 0,
        status: 'sent',
        completed_at: new Date().toISOString()
      }];
    }
    if (table === 'broadcast_targets') {
      return [
        { id: 'target-1', broadcast_id: 'broadcast-1', chat_id: -1001, status: 'sent', telegram_message_id: 101 },
        { id: 'target-2', broadcast_id: 'broadcast-1', chat_id: -1002, status: 'sent', telegram_message_id: 102 }
      ];
    }
    if (table === 'tg_chats') {
      return [
        { chat_id: -1001, title: 'New Era' },
        { chat_id: -1002, title: 'Fayus' }
      ];
    }
    return [];
  };
  supabase.insert = async (table, rows) => rows.map(row => ({ id: `${table}-row`, ...row }));
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    telegramCalls.push({ url: _url, body });
    if (/deleteMessage$/.test(_url) && Number(body.chat_id) === -1002) {
      return {
        ok: true,
        json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: message to delete not found' })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 108 } })
    };
  };

  try {
    const result = await callHandler({
      update_id: 16,
      callback_query: {
        id: 'callback-2',
        data: 'broadcast_delete_confirm:broadcast-1',
        from: { id: 777, first_name: 'Ali', username: 'ali_pm', is_bot: false },
        message: {
          message_id: 61,
          date: 1777100000,
          text: 'delete preview',
          chat: { id: -100777, type: 'supergroup', title: 'Main group' }
        }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'callback_query');
    const deleteCalls = telegramCalls.filter(call => /deleteMessage$/.test(call.url));
    assert.strictEqual(deleteCalls.length, 2);
    assert.strictEqual(deleteCalls[0].body.chat_id, -1001);
    assert.strictEqual(deleteCalls[0].body.message_id, 101);
    assert.strictEqual(deleteCalls[1].body.chat_id, -1002);
    assert.strictEqual(deleteCalls[1].body.message_id, 102);
    const resultMessage = telegramCalls.find(call => /sendMessage$/.test(call.url) && Number(call.body.chat_id) === -100777 && /Ommaviy xabar o‘chirish yakunlandi/.test(call.body.text));
    assert.ok(resultMessage);
    assert.match(resultMessage.body.text, /New Era ✅/);
    assert.match(resultMessage.body.text, /Fayus 🔴/);
  } finally {
    supabase.insert = originalInsert;
    supabase.select = originalSelect;
    global.fetch = originalFetch;
    clearBotSettingsCache();
  }
}

async function testBotRemovalMarksGroupInactive() {
  const originalInsert = supabase.insert;
  let row = null;

  supabase.insert = async (_table, rows) => {
    row = rows[0];
    return rows;
  };

  try {
    await callHandler({
      update_id: 3,
      my_chat_member: {
        chat: { id: -100123, type: 'supergroup', title: 'Support group' },
        new_chat_member: { status: 'left' }
      }
    });

    assert.strictEqual(row.is_active, false);
  } finally {
    supabase.insert = originalInsert;
  }
}

(async () => {
  await testStartRepliesWhenDbTrackingFails();
  await testChatMemberUpdateRegistersGroup();
  await testGroupStartAndRegisterDeleteCommandWithoutReply();
  await testGroupRegisterDbFailureStillDeletesCommand();
  await testGroupDoneDoesNotReplyToGroup();
  await testRequestMessageAppendsToExistingOpenRequest();
  await testPrivateGreetingRepliesWithGreeting();
  await testPrivateUnknownTextRepliesWithRedirect();
  await testAiModeSettingOpensPrivateBroadRequest();
  await testLocalSmartIntentOpensPrivateRequestWithoutAiMode();
  await testSelectedAiModelClassifiesRequest();
  await testClassifierJsonIsNotSentAsAutoReply();
  await testAiModeAutoRepliesToGroupRequest();
  await testAutoReplyFallbackUsesLocalKnowledge();
  await testGroupMessageAuditSendsToConfiguredChannel();
  await testMainGroupStatsTriggerSendsReport();
  await testReplyToCustomerTicketClosesRequest();
  await testEmployeePlainAnswerClosesLatestOpenRequest();
  await testMessageReactionSettingEnablesTicketCloseReaction();
  await testMainGroupBroadcastPreview();
  await testMainGroupBroadcastConfirmSendsAndReports();
  await testMainGroupBroadcastDeletePreview();
  await testMainGroupBroadcastDeleteConfirmDeletesAndReports();
  await testBotRemovalMarksGroupInactive();
  console.log('Bot tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
