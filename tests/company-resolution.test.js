'use strict';

const assert = require('node:assert/strict');
const {
  companyNameFromChatTitle,
  resolveCompanyInfoForTicket
} = require('../backend/lib/company-resolution');

function testCompanyNameFromChatTitle() {
  assert.strictEqual(companyNameFromChatTitle('Aziz Build | Sklad'), 'Aziz Build');
  assert.strictEqual(companyNameFromChatTitle('  Demo Company  '), 'Demo Company');
}

function testResolveCompanyInfoForTicketByGroupChatId() {
  const companies = [{
    id: 'cmp-1',
    name: 'Aziz Build',
    uyqur_support_username: 'nurali',
    groups: [{ chat_id: '-100123', telegram_chat_id: '-100123' }]
  }];
  const resolved = resolveCompanyInfoForTicket({
    chatId: '-100123',
    companyInfoCompanies: companies
  });
  assert.strictEqual(resolved.companyId, 'cmp-1');
  assert.strictEqual(resolved.companyName, 'Aziz Build');
  assert.ok(resolved.companyInfo);
}

function testResolveCompanyInfoForTicketByChatTitle() {
  const companies = [{
    id: 'cmp-2',
    name: 'Sokin Makon',
    uyqur_support_username: 'mirshod',
    groups: []
  }];
  const resolved = resolveCompanyInfoForTicket({
    chatId: '-100999',
    chatTitle: 'Sokin Makon | Support',
    companyInfoCompanies: companies
  });
  assert.strictEqual(resolved.companyId, 'cmp-2');
  assert.strictEqual(resolved.companyName, 'Sokin Makon');
}

function main() {
  testCompanyNameFromChatTitle();
  testResolveCompanyInfoForTicketByGroupChatId();
  testResolveCompanyInfoForTicketByChatTitle();
  console.log('company-resolution tests passed');
}

main();
