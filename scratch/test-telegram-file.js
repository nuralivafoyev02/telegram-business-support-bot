'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const token = (env.match(/^BOT_TOKEN=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const fileId = process.argv[2] || 'AwACAgIAAxkBAAIC72oHCZWN9lra5XJn_fmE1ZtVEfn1AAISlgAC0V05SDlTSE4_8douOwQ';

if (!token) {
  console.error('BOT_TOKEN topilmadi (.env)');
  process.exit(1);
}

async function main() {
  const base = `https://api.telegram.org/bot${token}`;
  console.log('file_id:', fileId);

  const getQuery = await fetch(`${base}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const getQueryJson = await getQuery.json();
  console.log('GET getFile:', getQueryJson.ok ? 'OK' : 'FAIL', getQueryJson.description || '');

  const getPost = await fetch(`${base}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId })
  });
  const getPostJson = await getPost.json();
  console.log('POST getFile:', getPostJson.ok ? 'OK' : 'FAIL', getPostJson.description || '');
  if (!getPostJson.ok) {
    console.log(JSON.stringify(getPostJson, null, 2));
    return;
  }

  const { file_path: filePath, file_size: fileSize } = getPostJson.result;
  console.log('file_path:', filePath);
  console.log('file_size:', fileSize, `(${(Number(fileSize) / (1024 * 1024)).toFixed(2)} MB)`);

  const download = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  console.log('download status:', download.status);
  console.log('download type:', download.headers.get('content-type'));
  const bytes = Buffer.from(await download.arrayBuffer());
  console.log('downloaded_bytes:', bytes.length);
  console.log('vercel_panel_limit_4mb:', bytes.length <= 4 * 1024 * 1024 ? 'OK' : 'TOO_LARGE');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
