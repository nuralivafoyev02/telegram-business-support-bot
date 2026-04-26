'use strict';

const zlib = require('zlib');

const MAX_UPLOAD_BYTES = 2_800_000;

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textFromXml(xml = '') {
  return decodeXmlEntities(String(xml)
    .replace(/<w:tab\s*\/>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeUpload(upload = {}) {
  const raw = String(upload.data || upload.base64 || '');
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('Fayl bo‘sh yoki noto‘g‘ri yuborilgan');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('Fayl hajmi 2.8MB dan oshmasin');
  return buffer;
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('ZIP fayl strukturasi topilmadi');
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data = Buffer.alloc(0);
    if (method === 0) data = compressed;
    if (method === 8) data = zlib.inflateRawSync(compressed);
    entries.set(name, data);

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function extractDocx(buffer) {
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()].filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name));
  return names.map(name => textFromXml(entries.get(name).toString('utf8'))).filter(Boolean).join('\n\n');
}

function extractXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()].filter(name => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(name));
  return names.map(name => textFromXml(entries.get(name).toString('utf8'))).filter(Boolean).join('\n\n');
}

function decodePdfLiteral(value = '') {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\[0-7]{1,3}/g, match => String.fromCharCode(Number.parseInt(match.slice(1), 8)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stringsFromPdfChunk(text = '') {
  const chunks = [];
  const literalRe = /\((?:\\.|[^\\)]){2,}\)/g;
  let match;
  while ((match = literalRe.exec(text))) {
    const value = decodePdfLiteral(match[0].slice(1, -1));
    if (/[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ0-9]/.test(value)) chunks.push(value);
  }
  return chunks;
}

function extractPdf(buffer) {
  const chunks = [];
  const raw = buffer.toString('latin1');
  chunks.push(...stringsFromPdfChunk(raw));

  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(raw))) {
    const stream = Buffer.from(match[1], 'latin1');
    try {
      chunks.push(...stringsFromPdfChunk(zlib.inflateSync(stream).toString('latin1')));
    } catch (_error) {
      try {
        chunks.push(...stringsFromPdfChunk(zlib.inflateRawSync(stream).toString('latin1')));
      } catch (__error) {
        // PDF streams can be encoded in many formats; unsupported streams are skipped.
      }
    }
  }

  return [...new Set(chunks)].join('\n');
}

function inferExtension(upload = {}) {
  const name = String(upload.name || '').toLowerCase();
  const type = String(upload.type || '').toLowerCase();
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.xlsx') || type.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.pdf') || type.includes('pdf')) return 'pdf';
  if (name.endsWith('.csv') || type.includes('csv')) return 'csv';
  return 'text';
}

function extractTextFromUpload(upload = {}) {
  const buffer = decodeUpload(upload);
  const extension = inferExtension(upload);
  let text = '';
  if (extension === 'docx') text = extractDocx(buffer);
  else if (extension === 'xlsx') text = extractXlsx(buffer);
  else if (extension === 'pdf') text = extractPdf(buffer);
  else text = buffer.toString('utf8');

  const clean = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) throw new Error('Fayldan matn ajratib bo‘lmadi');
  return {
    name: upload.name || 'document',
    type: extension,
    text: clean,
    chars: clean.length
  };
}

module.exports = { extractTextFromUpload };
