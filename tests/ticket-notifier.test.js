'use strict';

const assert = require('node:assert/strict');
const {
  parseTicketCallbackData,
  buildTicketKeyboard,
  normalizeTicketNotifications,
  shouldExcludeFromReassignPicker,
  isSupportRoleEmployee,
  TICKET_ACTIONS
} = require('../backend/lib/ticket-notifier');

function testParseTicketCallback() {
  const parsed = parseTicketCallbackData('tk:a:550e8400-e29b-41d4-a716-446655440000');
  assert.ok(parsed);
  assert.strictEqual(parsed.action, TICKET_ACTIONS.ACCEPT);
  assert.strictEqual(parsed.requestId, '550e8400-e29b-41d4-a716-446655440000');
}

function testKeyboardHasFourActions() {
  const keyboard = buildTicketKeyboard({ id: 'req-1' }, 'main');
  const labels = keyboard.inline_keyboard.flat().map(btn => btn.text);
  assert.ok(labels.some(text => /Qabul/i.test(text)));
  assert.ok(labels.some(text => /Yopish/i.test(text)));
  assert.ok(labels.some(text => /Boshqa hodim/i.test(text)));
  assert.ok(labels.some(text => /So‘rov emas|Sorov emas/i.test(text)));
}

function testReassignPickerOnlySupportAndNotCompanySupport() {
  const request = { assigned_to_employee_id: 'emp-current' };
  const companySupport = { id: 'emp-support', tg_user_id: 9001, username: 'uyqur_nurali' };
  assert.strictEqual(isSupportRoleEmployee({ role: 'support' }), true);
  assert.strictEqual(isSupportRoleEmployee({ role: 'manager' }), false);
  assert.strictEqual(shouldExcludeFromReassignPicker({ id: 'emp-manager', role: 'manager' }, request, companySupport), true);
  assert.strictEqual(shouldExcludeFromReassignPicker(companySupport, request, companySupport), true);
  assert.strictEqual(shouldExcludeFromReassignPicker({
    id: 'emp-other',
    role: 'support',
    username: 'ali_support'
  }, request, companySupport), false);
}

function testNormalizeTicketNotifications() {
  const config = normalizeTicketNotifications({
    enabled: true,
    target_chat_id: ' -1003349113901 ',
    notify_on_ai: true,
    notify_on_reaction: true
  });
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.target_chat_id, '-1003349113901');
}

async function main() {
  testParseTicketCallback();
  testKeyboardHasFourActions();
  testReassignPickerOnlySupportAndNotCompanySupport();
  testNormalizeTicketNotifications();
  console.log('ticket-notifier tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
