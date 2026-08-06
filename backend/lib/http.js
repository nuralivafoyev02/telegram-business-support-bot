'use strict';

let vercelWaitUntil = null;
try {
  vercelWaitUntil = require('@vercel/functions').waitUntil;
} catch (_error) {}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  let body = '';
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    console.error('[http:send-json]', error);
    res.statusCode = 500;
    body = JSON.stringify({ ok: false, error: 'Response serialize failed' });
  }
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5_500_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getQuery(req) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `https://${host}`);
  return Object.fromEntries(url.searchParams.entries());
}

// ALLOWED_ORIGINS sozlanmasa (bo'sh), avvalgidek so'ragan har qanday
// manbaga ruxsat beriladi — bu ataylab shunday, chunki domen nomini bilmay
// turib qattiq cheklab qo'ysak, joriy ishlab turgan webapp login qila
// olmay qolishi mumkin. ALLOWED_ORIGINS="https://siz-domeningiz.uz,https://boshqa.uz"
// kabi sozlansa, faqat shu ro'yxatdagi (va *.vercel.app preview'lar)
// manbalarga ruxsat beriladi.
function isOriginAllowed(origin, allowList) {
  if (!allowList.length) return true;
  if (!origin) return false;
  if (allowList.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host.endsWith('.vercel.app')) return true;
  } catch (_error) {
    return false;
  }
  return false;
}

// API javob (JSON va fayl oqimi) hech qachon sahifa sifatida render qilinishi
// kerak emas — shuning uchun eng qattiq CSP/frame himoyasi qo'yiladi. Bu
// vercel.json'dagi statik headerlardan mustaqil, funksiyaning o'zida
// kafolatlanadi.
function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
}

function allowCors(req, res) {
  applySecurityHeaders(res);
  const origin = req.headers.origin || '';
  const allowList = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (origin && isOriginAllowed(origin, allowList)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!allowList.length) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function scheduleBackgroundWork(workPromise, res) {
  const task = Promise.resolve(workPromise).catch(error => {
    console.error('[http:background-work]', error);
    return null;
  });
  if (typeof vercelWaitUntil === 'function') {
    vercelWaitUntil(task);
    return true;
  }
  if (res && typeof res.waitUntil === 'function') {
    res.waitUntil(task);
    return true;
  }
  return false;
}

module.exports = { sendJson, readBody, getQuery, allowCors, scheduleBackgroundWork };
