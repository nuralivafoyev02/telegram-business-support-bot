'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function main() {
  console.log('env_file:', fs.existsSync(envPath));
  console.log('has_url:', Boolean(url), url ? new URL(url).host : '');
  console.log('has_key:', Boolean(key), key ? `len=${key.length}` : '');

  if (!url || !key) {
    process.exit(2);
  }

  try {
    const response = await fetch(`${url}/rest/v1/bot_settings?select=key&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    const text = await response.text();
    console.log('status:', response.status);
    console.log('body_preview:', text.slice(0, 300));
  } catch (error) {
    console.error('fetch_error:', error.message);
    process.exit(1);
  }
}

main();
