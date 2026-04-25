'use strict';

const crypto = require('crypto');
const supabase = require('./supabase');
const { optionalEnv, requiredEnv } = require('./env');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
  return `sha256:${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('sha256:')) return false;
  const [, salt, digest] = storedHash.split(':');
  const next = hashPassword(password, salt).split(':')[2];
  return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(digest, 'hex'));
}

function createToken(admin) {
  const secret = requiredEnv('ADMIN_JWT_SECRET');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(admin.id || 'env-admin'),
    username: admin.username,
    role: admin.role || 'owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body, secret)}`;
}

function verifyToken(token) {
  const secret = requiredEnv('ADMIN_JWT_SECRET');
  if (!token || !token.includes('.')) throw new Error('Token required');
  const [header, payload, signature] = token.split('.');
  const body = `${header}.${payload}`;
  const expected = sign(body, secret);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid token');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return decoded;
}

async function login(username, password) {
  const admins = await supabase.select('admins', {
    select: 'id,username,password_hash,full_name,role,is_active',
    username: supabase.eq(username),
    limit: '1'
  }).catch(() => []);

  const admin = admins && admins[0];
  if (admin && admin.is_active && verifyPassword(password, admin.password_hash)) {
    await supabase.patch('admins', { id: supabase.eq(admin.id) }, { last_login_at: new Date().toISOString() }).catch(() => null);
    return { token: createToken(admin), admin: sanitizeAdmin(admin) };
  }

  const fallbackUser = optionalEnv('ADMIN_USERNAME', 'admin');
  const fallbackPass = optionalEnv('ADMIN_PASSWORD', 'Admin@12345');
  if (username === fallbackUser && password === fallbackPass) {
    const envAdmin = { id: 'env-admin', username: fallbackUser, full_name: 'System Admin', role: 'owner', is_active: true };
    return { token: createToken(envAdmin), admin: sanitizeAdmin(envAdmin), fallback: true };
  }

  throw new Error('Login yoki parol noto‘g‘ri');
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    full_name: admin.full_name || 'Admin',
    role: admin.role || 'owner'
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

module.exports = { hashPassword, verifyPassword, createToken, verifyToken, login, requireAdmin, sanitizeAdmin };
