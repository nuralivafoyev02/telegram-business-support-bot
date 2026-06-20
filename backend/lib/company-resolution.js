'use strict';

function telegramIdKey(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).trim();
}

function companyNameFromChatTitle(title = '') {
  const text = String(title || '').trim();
  if (!text) return '';
  const parts = text.split('|').map(part => part.trim()).filter(Boolean);
  return parts[0] || text;
}

function normalizeCompanyDirectoryName(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function companyDirectoryId(company = {}) {
  if (!company || typeof company !== 'object') return '';
  return String(company.id || company.company_id || '').trim();
}

function groupChatKeys(group = {}) {
  return [group.chat_id, group.telegram_chat_id, group.group_id]
    .map(value => telegramIdKey(value))
    .filter(Boolean);
}

function findCompanyInfoByGroupChatId(companyInfoCompanies = [], chatKey = '') {
  const normalizedChatKey = telegramIdKey(chatKey);
  if (!normalizedChatKey) return null;
  for (const company of companyInfoCompanies) {
    const groups = Array.isArray(company.groups) ? company.groups : [];
    if (groups.some(group => groupChatKeys(group).includes(normalizedChatKey))) return company;
  }
  return null;
}

function findCompanyInfoRow(companies = [], { companyId = '', companyName = '' } = {}, directoryCompanies = []) {
  const normalizedId = String(companyId || '').trim();
  const normalizedName = normalizeCompanyDirectoryName(companyName);
  if (normalizedId) {
    const byId = companies.find(company => companyDirectoryId(company) === normalizedId);
    if (byId) return byId;
    const localCompany = (Array.isArray(directoryCompanies) ? directoryCompanies : [])
      .find(company => companyDirectoryId(company) === normalizedId);
    const localName = normalizeCompanyDirectoryName(localCompany?.name || '');
    if (localName) {
      const byLocalName = companies.find(company => normalizeCompanyDirectoryName(company.name) === localName);
      if (byLocalName) return byLocalName;
    }
  }
  if (!normalizedName) return null;
  return companies.find(company => normalizeCompanyDirectoryName(company.name) === normalizedName) || null;
}

function buildCompanyInfoChatMap(companyInfoCompanies = []) {
  const map = new Map();
  companyInfoCompanies.forEach(company => {
    const companyId = companyDirectoryId(company) || String(company.company_id || '').trim();
    const companyName = String(company.name || company.company_name || '').trim();
    const groups = Array.isArray(company.groups) ? company.groups : [];
    groups.forEach(group => {
      const groupCompanyId = String(group.company_id || '').trim();
      const payload = {
        company_id: companyId || groupCompanyId,
        company_name: companyName || String(group.company_name || '').trim()
      };
      groupChatKeys(group).forEach(chatKey => {
        map.set(chatKey, payload);
      });
    });
  });
  return map;
}

function resolveCompanyInfoForTicket({
  companyId = '',
  chatId = '',
  chatTitle = '',
  companyNameHint = '',
  companyInfoCompanies = [],
  directoryCompanies = [],
  externalChatCompanyMap = null
} = {}) {
  const chatKey = telegramIdKey(chatId);
  const externalMap = externalChatCompanyMap || buildCompanyInfoChatMap(companyInfoCompanies);
  const external = chatKey ? (externalMap.get(chatKey) || {}) : {};
  const resolvedNameHint = String(
    companyNameHint || external.company_name || companyNameFromChatTitle(chatTitle) || ''
  ).trim();
  let resolvedCompanyId = String(companyId || external.company_id || '').trim();

  const companyInfo = findCompanyInfoByGroupChatId(companyInfoCompanies, chatKey)
    || findCompanyInfoRow(companyInfoCompanies, {
      companyId: resolvedCompanyId,
      companyName: resolvedNameHint
    }, directoryCompanies);

  if (!resolvedCompanyId && companyInfo) {
    resolvedCompanyId = companyDirectoryId(companyInfo);
  }

  return {
    companyId: resolvedCompanyId || null,
    companyInfo,
    companyName: String(companyInfo?.name || resolvedNameHint || external.company_name || '').trim(),
    external
  };
}

module.exports = {
  telegramIdKey,
  companyNameFromChatTitle,
  normalizeCompanyDirectoryName,
  companyDirectoryId,
  groupChatKeys,
  findCompanyInfoByGroupChatId,
  findCompanyInfoRow,
  buildCompanyInfoChatMap,
  resolveCompanyInfoForTicket
};
