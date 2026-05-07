'use strict';

const { requiredEnv } = require('./env');

let cachedConfig = null;

function getConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    url: requiredEnv('SUPABASE_URL').replace(/\/$/, ''),
    key: requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  };
  return cachedConfig;
}

function headers(extra = {}) {
  const { key } = getConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra
  };
}

function buildQuery(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null) usp.append(key, item);
      });
      return;
    }
    usp.append(key, value);
  });
  const query = usp.toString();
  return query ? `?${query}` : '';
}

async function request(path, { method = 'GET', body, query, prefer } = {}) {
  const { url } = getConfig();
  const endpoint = `${url}/rest/v1/${path}${buildQuery(query)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    console.error('[supabase:request:network-error]', { method, path, error: error.message });
    throw error;
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    console.error('[supabase:request:parse-error]', { method, path, status: response.status, error: error.message });
    throw error;
  }
  if (!response.ok) {
    const details = typeof payload === 'object' ? JSON.stringify(payload) : text;
    console.error('[supabase:request:error]', { method, path, status: response.status, details });
    throw new Error(`Supabase ${response.status}: ${details}`);
  }
  return payload;
}

async function select(table, query = {}) {
  return request(table, { method: 'GET', query });
}

async function insert(table, rows, { upsert = false, onConflict, prefer = 'return=representation' } = {}) {
  const query = onConflict ? { on_conflict: onConflict } : undefined;
  return request(table, {
    method: 'POST',
    body: rows,
    query,
    prefer: upsert ? `${prefer},resolution=merge-duplicates` : prefer
  });
}

async function patch(table, query, values, prefer = 'return=representation') {
  return request(table, { method: 'PATCH', query, body: values, prefer });
}

async function rpc(name, body = {}) {
  return request(`rpc/${name}`, { method: 'POST', body });
}

function eq(value) {
  return `eq.${String(value)}`;
}

function inList(values) {
  return `in.(${values.map(v => String(v)).join(',')})`;
}

function order(column, ascending = false) {
  return `${column}.${ascending ? 'asc' : 'desc'}`;
}

module.exports = { select, insert, patch, rpc, eq, inList, order };
