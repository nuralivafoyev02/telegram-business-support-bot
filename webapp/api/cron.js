import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../../backend/api/cron');

export default handler;
