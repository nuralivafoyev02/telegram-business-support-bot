'use strict';

const assert = require('assert');
const { classifyMessage, isDoneMessage, isRequestIntent } = require('../backend/lib/parser');

assert.strictEqual(isDoneMessage('#done'), true);
assert.strictEqual(isDoneMessage('hal bo‘ldi #done rahmat'), true);
assert.strictEqual(isRequestIntent('Assalamu aleykum taminot bo‘limida yordam kerak qarab yuboringlar'), true);
assert.strictEqual(classifyMessage({ text: '#done', chatType: 'supergroup' }), 'done');
assert.strictEqual(classifyMessage({ text: '/start', chatType: 'private' }), 'command');
assert.strictEqual(classifyMessage({ text: 'Assalomu aleykum yordam kerak', chatType: 'supergroup' }), 'request');
assert.strictEqual(classifyMessage({ text: 'Rahmat', chatType: 'supergroup', isKnownEmployee: true }), 'employee_message');
assert.strictEqual(classifyMessage({ text: 'Salom', chatType: 'private', isBusiness: true }), 'request');

console.log('Parser tests passed');
