'use strict';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optionalEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

module.exports = { requiredEnv, optionalEnv, boolEnv };
