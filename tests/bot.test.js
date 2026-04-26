'use strict';

const assert = require('assert');
const { Readable } = require('stream');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:test-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const supabase = require('../backend/lib/supabase');
const handler = require('../backend/api/bot');

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
    assert.match(telegramCalls[0].text, /Business Support Bot/);
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

async function testGroupStartRegistersGroupAndDeletesCommand() {
  const originalInsert = supabase.insert;
  const originalSelect = supabase.select;
  const originalFetch = global.fetch;
  const telegramCalls = [];
  let chatRow = null;

  supabase.insert = async (table, rows) => {
    if (table === 'tg_chats') chatRow = rows[0];
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
    const result = await callHandler({
      update_id: 4,
      message: {
        message_id: 12,
        date: 1777100000,
        text: '/start',
        chat: { id: -100777, type: 'supergroup', title: 'Support group' },
        from: { id: 777, first_name: 'Ali', is_bot: false }
      }
    });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.payload.handled, 'message');
    assert.strictEqual(chatRow.chat_id, -100777);
    assert.strictEqual(chatRow.source_type, 'group');
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /deleteMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, -100777);
    assert.strictEqual(telegramCalls[0].body.message_id, 12);
    assert.strictEqual(telegramCalls[0].body.text, undefined);
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
    assert.strictEqual(telegramCalls.length, 1);
    assert.match(telegramCalls[0].url, /deleteMessage$/);
    assert.strictEqual(telegramCalls[0].body.chat_id, -100888);
    assert.strictEqual(telegramCalls[0].body.message_id, 13);
    assert.strictEqual(telegramCalls[0].body.text, undefined);
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
  await testGroupStartRegistersGroupAndDeletesCommand();
  await testGroupRegisterDbFailureStillDeletesCommand();
  await testGroupDoneDoesNotReplyToGroup();
  await testBotRemovalMarksGroupInactive();
  console.log('Bot tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
