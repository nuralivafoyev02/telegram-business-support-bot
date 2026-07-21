'use strict';

const supabase = require('./supabase');
const { optionalEnv } = require('./env');
const { getBotSettings } = require('./bot-settings');
const { normalizeClickUpIntegration, hasUsableApiToken, clickUpRequest } = require('./clickup');

const KOMPANIYALAR_LIST_ID = optionalEnv('CLICKUP_KOMPANIYALAR_LIST_ID', '901802819769');
const LINK_DETAIL_CONCURRENCY = 5;

function companyKeyFromName(name = '') {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

async function resolveClickUpConfig() {
  const settings = await getBotSettings({ force: true });
  const config = normalizeClickUpIntegration(settings.clickUpIntegration);
  if (hasUsableApiToken(config)) return config;
  const envToken = optionalEnv('CLICKUP_API_TOKEN', '');
  if (!envToken) return config;
  return { ...config, api_token: envToken };
}

function otherLinkedTaskId(entry = {}, currentTaskId = '') {
  if (String(entry.task_id) === String(currentTaskId)) return entry.link_id;
  return entry.task_id;
}

async function fetchLinkedTaskDetails(config, taskIds = []) {
  const details = new Map();
  const queue = [...taskIds];
  async function worker() {
    while (queue.length) {
      const taskId = queue.shift();
      if (!taskId || details.has(taskId)) continue;
      try {
        const task = await clickUpRequest(config, `/task/${encodeURIComponent(taskId)}`);
        details.set(taskId, {
          id: task.id,
          name: task.name || '',
          status: task.status?.status || '',
          list_name: task.list?.name || '',
          url: task.url || ''
        });
      } catch (error) {
        details.set(taskId, { id: taskId, name: '', status: '', list_name: '', url: '', error: error.message });
      }
    }
  }
  const workers = Array.from({ length: Math.min(LINK_DETAIL_CONCURRENCY, taskIds.length || 1) }, worker);
  await Promise.all(workers);
  return details;
}

async function syncClickUpCompanyLinks() {
  const config = await resolveClickUpConfig();
  if (!hasUsableApiToken(config)) {
    return { synced: 0, skipped: true, reason: 'no_api_token' };
  }

  const listPayload = await clickUpRequest(config, `/list/${encodeURIComponent(KOMPANIYALAR_LIST_ID)}/task`, {
    query: { include_closed: 'true' }
  });
  const tasks = Array.isArray(listPayload.tasks) ? listPayload.tasks : [];

  const uniqueLinkedIds = new Set();
  tasks.forEach(task => {
    (task.linked_tasks || []).forEach(entry => {
      const otherId = otherLinkedTaskId(entry, task.id);
      if (otherId) uniqueLinkedIds.add(otherId);
    });
  });

  const linkedDetails = await fetchLinkedTaskDetails(config, [...uniqueLinkedIds]);

  const rows = tasks.map(task => {
    const linkedTasks = (task.linked_tasks || [])
      .map(entry => otherLinkedTaskId(entry, task.id))
      .filter(Boolean)
      .map(id => linkedDetails.get(id))
      .filter(Boolean);
    return {
      company_key: companyKeyFromName(task.name),
      company_name: task.name || '',
      clickup_task_id: task.id,
      clickup_task_url: task.url || '',
      clickup_status: task.status?.status || '',
      linked_tasks: linkedTasks,
      linked_task_count: linkedTasks.length,
      synced_at: new Date().toISOString()
    };
  });

  if (rows.length) {
    await supabase.insert('clickup_company_links', rows, { upsert: true, onConflict: 'clickup_task_id' });
  }

  return { synced: rows.length, skipped: false };
}

async function getStoredClickUpCompanyLinks() {
  return supabase.select('clickup_company_links', {
    select: 'company_key,company_name,clickup_task_id,clickup_task_url,clickup_status,linked_tasks,linked_task_count,synced_at'
  });
}

module.exports = {
  KOMPANIYALAR_LIST_ID,
  companyKeyFromName,
  syncClickUpCompanyLinks,
  getStoredClickUpCompanyLinks
};
