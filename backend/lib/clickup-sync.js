'use strict';

const supabase = require('./supabase');
const { getBotSettings } = require('./bot-settings');
const { normalizeClickUpIntegration, isClickUpIntegrationReady, getClickUpTask } = require('./clickup');

function nowIso() {
  return new Date().toISOString();
}

function clickUpStatusText(task = {}) {
  const status = task.status;
  if (!status) return '';
  if (typeof status === 'string') return status;
  return String(status.status || status.type || status.orderindex || '').trim();
}

function isDoneStatus(status = '', doneStatus = 'complete') {
  const text = String(status || '').trim().toLowerCase();
  const configured = String(doneStatus || '').trim().toLowerCase();
  return Boolean(text && (
    text === configured
    || ['done', 'closed', 'complete', 'completed', 'bajarildi', 'yopildi'].includes(text)
    || /done|closed|complete|bajarildi|yopildi/i.test(text)
  ));
}

async function closeSupportRequestFromClickUp(row = {}, clickUpStatus = '') {
  if (!row.support_request_id) return { closed: false, reason: 'support_request_missing' };
  const requests = await supabase.select('support_requests', {
    select: 'id,chat_id,status,initial_message_id,initial_text',
    id: supabase.eq(row.support_request_id),
    limit: '1'
  }).catch(() => []);
  const request = requests[0];
  if (!request) return { closed: false, reason: 'support_request_not_found' };
  if (request.status !== 'open') return { closed: false, reason: 'support_request_not_open' };

  const closedAt = nowIso();
  const rows = await supabase.patch('support_requests', { id: supabase.eq(request.id) }, {
    status: 'closed',
    closed_at: closedAt,
    closed_by_employee_id: null,
    closed_by_tg_id: null,
    closed_by_name: 'ClickUp',
    done_message_id: row.tg_message_id || request.initial_message_id || null
  });
  await supabase.insert('request_events', [{
    request_id: request.id,
    chat_id: request.chat_id,
    tg_message_id: row.tg_message_id || request.initial_message_id || null,
    event_type: 'closed',
    actor_tg_id: null,
    actor_name: 'ClickUp',
    employee_id: null,
    text: `ClickUp task bajarildi: ${clickUpStatus || 'complete'}`,
    raw: { clickup_task_id: row.clickup_task_id, clickup_status: clickUpStatus },
    created_at: closedAt
  }], { prefer: 'return=minimal' }).catch(() => null);
  return { closed: true, request: rows[0] || request };
}

async function syncClickUpCompletedTasks({ limit = 50 } = {}) {
  const settings = await getBotSettings({ force: true });
  const config = normalizeClickUpIntegration(settings.clickUpIntegration);
  if (!isClickUpIntegrationReady(config)) {
    return { checked: 0, closed: 0, updated: 0, skipped: true, reason: 'clickup_not_ready' };
  }

  const rows = await supabase.select('clickup_tasks', {
    select: 'id,chat_id,tg_message_id,support_request_id,clickup_task_id,status,raw',
    status: 'eq.created',
    clickup_task_id: 'not.is.null',
    order: supabase.order('created_at', false),
    limit: String(Math.min(Math.max(Number(limit) || 50, 1), 200))
  }).catch(() => []);

  let closed = 0;
  let updated = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const task = await getClickUpTask(config, row.clickup_task_id);
      const status = clickUpStatusText(task);
      if (!isDoneStatus(status, config.done_status)) {
        await supabase.patch('clickup_tasks', { id: supabase.eq(row.id) }, {
          raw: { ...(row.raw || {}), clickup_status: status, synced_at: nowIso() },
          updated_at: nowIso()
        }).catch(() => null);
        updated += 1;
        continue;
      }
      const result = await closeSupportRequestFromClickUp(row, status);
      if (result.closed) closed += 1;
      await supabase.patch('clickup_tasks', { id: supabase.eq(row.id) }, {
        status: 'closed',
        raw: { ...(row.raw || {}), clickup_status: status, synced_at: nowIso(), closed_from_clickup: true },
        updated_at: nowIso()
      });
      updated += 1;
    } catch (error) {
      errors.push({ id: row.id, clickup_task_id: row.clickup_task_id, error: error.message });
      await supabase.patch('clickup_tasks', { id: supabase.eq(row.id) }, {
        error: error.message,
        updated_at: nowIso()
      }).catch(() => null);
    }
  }

  return { checked: rows.length, closed, updated, errors };
}

module.exports = { syncClickUpCompletedTasks, isDoneStatus };
