import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../../api/company-report-sync.js');

export default handler;
