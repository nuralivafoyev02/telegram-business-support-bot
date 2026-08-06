'use strict';

const crypto = require('crypto');
const supabase = require('./supabase');
const { optionalEnv, requiredEnv } = require('./env');
const { DEFAULT_TENANT_ID, normalizeTenantId } = require('./tenant');

// v1: 'support' va 'management' (Boshqaruv paneli) xodimlarga webapp login
// beriladi. Kengaytirish uchun shu ro'yxatga qo'shish kifoya.
const EMPLOYEE_LOGIN_ROLES = new Set(['support', 'management']);

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

// scrypt — ataylab sekin/xotira talab qiladigan algoritm (brute-force'ga
// qarshi), oldingi HMAC-SHA256 (tez, shuning uchun zaif) o'rniga.
const SCRYPT_KEY_LEN = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LEN).toString('hex');
  return `scrypt:${salt}:${digest}`;
}

const MIN_PASSWORD_LENGTH = 8;

// Yangi/o'zgartirilgan parolga eng kam uzunlik talabi — avval bu tekshiruv
// umuman yo'q edi, hattoki 3 belgili parol ham qabul qilinardi.
function assertPasswordPolicy(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(`Parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo‘lishi kerak.`);
    error.status = 400;
    throw error;
  }
}

function timingSafeBufferEqual(bufA, bufB) {
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function timingSafeHexEqual(a, b) {
  return timingSafeBufferEqual(Buffer.from(String(a || ''), 'hex'), Buffer.from(String(b || ''), 'hex'));
}

function timingSafeStringEqual(a, b) {
  return timingSafeBufferEqual(Buffer.from(String(a || ''), 'utf8'), Buffer.from(String(b || ''), 'utf8'));
}

// Eski (HMAC-SHA256) formatdagi hash'larni ham tekshira olish uchun — bu
// orqali mavjud foydalanuvchilarning parolini majburiy o'zgartirishga hojat
// qolmaydi, ular keyingi muvaffaqiyatli kirishda avtomatik scrypt'ga
// ko'chiriladi (pastga qarang: login()/loginEmployee() ichidagi patch).
function verifyLegacySha256Password(password, salt, digest) {
  const next = crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
  return timingSafeHexEqual(next, digest);
}

function isLegacyPasswordHash(storedHash) {
  return typeof storedHash === 'string' && storedHash.startsWith('sha256:');
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const [scheme, salt, digest] = storedHash.split(':');
  if (!salt || !digest) return false;
  if (scheme === 'scrypt') {
    const next = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LEN).toString('hex');
    return timingSafeHexEqual(next, digest);
  }
  if (scheme === 'sha256') {
    return verifyLegacySha256Password(password, salt, digest);
  }
  return false;
}

function createToken(admin) {
  const secret = requiredEnv('ADMIN_JWT_SECRET');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(admin.id || 'env-admin'),
    username: admin.username,
    role: admin.role || 'owner',
    tenant_id: normalizeTenantId(admin.tenant_id),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body, secret)}`;
}

function createEmployeeToken(employee) {
  const secret = requiredEnv('ADMIN_JWT_SECRET');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(employee.id),
    type: 'employee',
    employee_id: String(employee.id),
    username: employee.username || '',
    role: employee.role || 'support',
    tenant_id: normalizeTenantId(employee.tenant_id),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body, secret)}`;
}

function isEmployeeSession(session) {
  return Boolean(session && session.type === 'employee');
}

function verifyToken(token) {
  const secret = requiredEnv('ADMIN_JWT_SECRET');
  if (!token || !token.includes('.')) throw new Error('Token required');
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Invalid token');
  const body = `${header}.${payload}`;
  const expected = sign(body, secret);
  if (!timingSafeStringEqual(signature, expected)) {
    throw new Error('Invalid token');
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_error) {
    throw new Error('Invalid token');
  }
  if (!decoded || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  if (!decoded.tenant_id) throw new Error('Token expired');
  decoded.tenant_id = normalizeTenantId(decoded.tenant_id);
  return decoded;
}

// --- Login brute-force himoyasi ---
// Bir xil login nomi bilan qisqa vaqt ichida ko'p marta noto'g'ri parol
// kiritilsa, vaqtincha bloklanadi. Holat bot_settings jadvalida (boshqa
// sozlamalar kabi) saqlanadi — serverless funksiya har chaqiriqda yangi
// nusxa bo'lishi mumkinligi uchun xotirada emas, bazada ushlanadi.
const LOGIN_RATE_LIMIT_KEY = 'uyqur_login_rate_limit';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function loginThrottleKey(username) {
  return String(username || '').trim().toLowerCase();
}

async function getLoginAttemptsRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(LOGIN_RATE_LIMIT_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  return row && row.value && typeof row.value === 'object' ? row.value : {};
}

async function saveLoginAttemptsRecord(record) {
  await supabase.insert('bot_settings', [{
    key: LOGIN_RATE_LIMIT_KEY,
    value: record,
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' }).catch(() => null);
}

async function assertLoginNotThrottled(username) {
  const key = loginThrottleKey(username);
  if (!key) return;
  const record = await getLoginAttemptsRecord();
  const entry = record[key];
  if (entry && entry.lockedUntil && entry.lockedUntil > Date.now()) {
    const waitMinutes = Math.max(1, Math.ceil((entry.lockedUntil - Date.now()) / 60000));
    const error = new Error(`Juda ko‘p noto‘g‘ri urinish. ${waitMinutes} daqiqadan keyin qayta urinib ko‘ring.`);
    error.status = 429;
    throw error;
  }
}

async function recordLoginFailure(username) {
  const key = loginThrottleKey(username);
  if (!key) return;
  const record = await getLoginAttemptsRecord();
  const now = Date.now();
  const existing = record[key];
  const withinWindow = existing && existing.firstFailAt && (now - existing.firstFailAt) < LOGIN_WINDOW_MS;
  const failCount = withinWindow ? (existing.failCount || 0) + 1 : 1;
  const firstFailAt = withinWindow ? existing.firstFailAt : now;
  record[key] = {
    failCount,
    firstFailAt,
    lockedUntil: failCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : null
  };
  await saveLoginAttemptsRecord(record);
}

async function recordLoginSuccess(username) {
  const key = loginThrottleKey(username);
  if (!key) return;
  const record = await getLoginAttemptsRecord();
  if (record[key]) {
    delete record[key];
    await saveLoginAttemptsRecord(record);
  }
}

async function loginEmployee(username, password) {
  const rows = await supabase.select('employees', {
    select: 'id,tg_user_id,full_name,username,role,is_active,password_hash,tenant_id,avatar_path,avatar_updated_at',
    username: supabase.eq(username),
    limit: '1'
  }).catch(() => []);

  const employee = rows && rows[0];
  if (!employee || !employee.is_active || !employee.password_hash) return null;
  if (!EMPLOYEE_LOGIN_ROLES.has(String(employee.role || ''))) return null;
  if (!verifyPassword(password, employee.password_hash)) return null;

  const patch = { last_login_at: new Date().toISOString() };
  // Eski (zaifroq) hash formatidan foydalanuvchi sezmagan holda scrypt'ga
  // o'tkaziladi — parolni majburiy o'zgartirishga hojat qolmaydi.
  if (isLegacyPasswordHash(employee.password_hash)) patch.password_hash = hashPassword(password);
  await supabase.patch('employees', { id: supabase.eq(employee.id) }, patch).catch(() => null);
  return employee;
}

async function login(username, password) {
  await assertLoginNotThrottled(username);

  const admins = await supabase.select('admins', {
    select: 'id,username,password_hash,full_name,role,is_active,tenant_id',
    username: supabase.eq(username),
    limit: '1'
  }).catch(() => []);

  const admin = admins && admins[0];
  if (admin && admin.is_active && verifyPassword(password, admin.password_hash)) {
    await recordLoginSuccess(username);
    const patch = { last_login_at: new Date().toISOString() };
    if (isLegacyPasswordHash(admin.password_hash)) patch.password_hash = hashPassword(password);
    await supabase.patch('admins', { id: supabase.eq(admin.id) }, patch).catch(() => null);
    return { token: createToken(admin), admin: sanitizeAdmin(admin) };
  }

  const employee = await loginEmployee(username, password);
  if (employee) {
    await recordLoginSuccess(username);
    return { token: createEmployeeToken(employee), admin: sanitizeEmployeeAccount(employee) };
  }

  const fallbackUser = optionalEnv('ADMIN_USERNAME', 'admin');
  const fallbackPass = optionalEnv('ADMIN_PASSWORD', 'Admin@12345');
  if (username === fallbackUser && password === fallbackPass) {
    await recordLoginSuccess(username);
    const envAdmin = {
      id: 'env-admin',
      username: fallbackUser,
      full_name: 'System Admin',
      role: 'owner',
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID
    };
    return { token: createToken(envAdmin), admin: sanitizeAdmin(envAdmin), fallback: true };
  }

  await recordLoginFailure(username);
  throw new Error('Login yoki parol noto‘g‘ri');
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    full_name: admin.full_name || 'Admin',
    role: admin.role || 'owner',
    tenant_id: normalizeTenantId(admin.tenant_id),
    type: 'admin'
  };
}

function sanitizeEmployeeAccount(employee) {
  return {
    id: employee.id,
    employee_id: employee.id,
    username: employee.username || '',
    full_name: employee.full_name || 'Support',
    role: employee.role || 'support',
    tenant_id: normalizeTenantId(employee.tenant_id),
    type: 'employee',
    has_avatar: !!employee.avatar_path,
    avatar_updated_at: employee.avatar_updated_at || null
  };
}

function getBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function requireAdmin(req) {
  return verifyToken(getBearer(req));
}

module.exports = {
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
  createToken,
  createEmployeeToken,
  isEmployeeSession,
  verifyToken,
  login,
  requireAdmin,
  sanitizeAdmin,
  sanitizeEmployeeAccount
};
