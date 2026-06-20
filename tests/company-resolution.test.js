'use strict';

const assert = require('node:assert/strict');
const {
  companyNameFromChatTitle,
  resolveCompanyInfoForTicket,
  resolvePersistableCompanyId,
  sanitizeUuidField
} = require('../backend/lib/company-resolution');

const LOCAL_LAND_HOUSE_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const LOCAL_OTHER_ID = 'b2c3d4e5-f6a7-4890-b123-456789abcd0e';

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

function testResolvePersistableCompanyIdFromChatLink() {
  const resolved = resolvePersistableCompanyId({
    externalCompanyId: '65',
    companyName: 'Land House',
    chatCompanyId: LOCAL_LAND_HOUSE_ID,
    directoryCompanies: []
  });
  assert.strictEqual(resolved, LOCAL_LAND_HOUSE_ID);
}

function testResolvePersistableCompanyIdFromDirectoryName() {
  const resolved = resolvePersistableCompanyId({
    externalCompanyId: '65',
    companyName: 'Land House',
    directoryCompanies: [{ id: LOCAL_LAND_HOUSE_ID, name: 'Land House', notes: null }]
  });
  assert.strictEqual(resolved, LOCAL_LAND_HOUSE_ID);
}

function testResolvePersistableCompanyIdFromUyqurMarker() {
  const resolved = resolvePersistableCompanyId({
    externalCompanyId: '65',
    companyName: 'Land House',
    directoryCompanies: [{
      id: LOCAL_OTHER_ID,
      name: 'Land House LLC',
      notes: 'Uyqur API ID: 65'
    }]
  });
  assert.strictEqual(resolved, LOCAL_OTHER_ID);
}

function testResolvePersistableCompanyIdRejectsExternalNumericId() {
  const resolved = resolvePersistableCompanyId({
    externalCompanyId: '65',
    companyName: 'Unknown Company',
    directoryCompanies: []
  });
  assert.strictEqual(resolved, null);
}

function testSanitizeUuidField() {
  assert.strictEqual(sanitizeUuidField('65'), null);
  assert.strictEqual(sanitizeUuidField(LOCAL_LAND_HOUSE_ID), LOCAL_LAND_HOUSE_ID);
}

function main() {
  testCompanyNameFromChatTitle();
  testResolveCompanyInfoForTicketByGroupChatId();
  testResolveCompanyInfoForTicketByChatTitle();
  testResolvePersistableCompanyIdFromChatLink();
  testResolvePersistableCompanyIdFromDirectoryName();
  testResolvePersistableCompanyIdFromUyqurMarker();
  testResolvePersistableCompanyIdRejectsExternalNumericId();
  testSanitizeUuidField();
  console.log('company-resolution tests passed');
}

main();
