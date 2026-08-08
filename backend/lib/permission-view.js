'use strict';

const { optionalEnv } = require('./env');
const supabase = require('./supabase');

const DEFAULT_PERMISSION_VIEW_HOST = 'https://backend.app.uyqur.uz';
const DEFAULT_PERMISSION_VIEW_PATH = 'dev/company/permission-view-for-bot';
const PERMISSION_VIEW_SETTINGS_KEY = 'uyqur_permission_view_selection';
const PERMISSION_VIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const PERMISSION_NOTIFICATIONS_KEY = 'uyqur_permission_notifications';
const MAX_NOTIFICATION_EVENTS = 200;
const MANAGER_CONFIRMERS_KEY = 'uyqur_manager_confirmers';
const PERMISSION_ACTION_SENT_KEY = 'uyqur_permission_action_sent';
const PERMISSION_ACTION_LEARNED_KEY = 'uyqur_permission_action_learned';

// "Kontragent balansi" alohida modul sifatida ko'rsatilmaydi — uning
// funksiyalari/hodisalari "Kontragent" ostiga birlashtiriladi (nomi bilan
// bog'liq bo'lgan har qanday yozuvda, tashqi manba qanday nom bersa ham).
function normalizeModuleNameKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z]/gi, '');
}

function canonicalModuleName(name = '') {
  return normalizeModuleNameKey(name) === 'kontragentbalansi' ? 'Kontragent' : name;
}

function permissionViewUrl() {
  const configured = optionalEnv('FUNCSIYALAR', DEFAULT_PERMISSION_VIEW_PATH).trim();
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${DEFAULT_PERMISSION_VIEW_HOST}/${configured.replace(/^\/+/, '')}`;
}

function permissionViewAuth() {
  return optionalEnv('UYQUR_COMPANY_INFO_AUTH', '');
}

function localizedName(value = {}) {
  if (typeof value === 'string') return value;
  const source = value && typeof value === 'object' ? value : {};
  return source.uz || source.ru || source.en || source.kr || '';
}

function normalizeAction(row = {}) {
  return {
    id: row.id,
    key: row.key || '',
    name: localizedName(row.name),
    path: row.path || ''
  };
}

function normalizeSubmodule(row = {}) {
  return {
    id: row.id,
    key: row.key || String(row.id ?? ''),
    name: localizedName(row.name),
    actions: Array.isArray(row.actions) ? row.actions.map(normalizeAction) : []
  };
}

function normalizeModule(row = {}) {
  return {
    id: row.id,
    key: row.key || String(row.id ?? ''),
    name: localizedName(row.name),
    submodules: Array.isArray(row.submodules) ? row.submodules.map(normalizeSubmodule) : []
  };
}

async function fetchPermissionView() {
  const auth = permissionViewAuth();
  if (!auth) throw new Error('UYQUR_COMPANY_INFO_AUTH env sozlanmagan');
  const response = await fetch(permissionViewUrl(), { headers: { 'X-Auth': auth } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.message ? JSON.stringify(payload.message) : response.statusText || `HTTP ${response.status}`;
    throw new Error(`Uyqur permission-view API: ${message}`);
  }
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return rows.map(normalizeModule);
}

async function getPermissionViewRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_VIEW_SETTINGS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  return row && row.value && typeof row.value === 'object' ? row.value : {};
}

async function savePermissionViewRecord(patch = {}) {
  const current = await getPermissionViewRecord();
  const next = { ...current, ...patch };
  await supabase.insert('bot_settings', [{
    key: PERMISSION_VIEW_SETTINGS_KEY,
    value: next,
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return next;
}

function findSubmoduleMeta(modules = [], key = '') {
  for (const module of modules) {
    const submodule = (module.submodules || []).find(sub => String(sub.key) === String(key));
    if (submodule) return { module_name: module.name, submodule_name: submodule.name };
  }
  return null;
}

function earlierTimestamp(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function mergeEmployeeProgress(a = {}, b = {}) {
  const confirmed_at = earlierTimestamp(a.confirmed_at, b.confirmed_at);
  const learned_at = earlierTimestamp(a.learned_at, b.learned_at) || confirmed_at || null;
  return {
    learned_at: learned_at || null,
    confirmed_at: confirmed_at || null,
    confirmed_by: confirmed_at ? (a.confirmed_by || b.confirmed_by || null) : null
  };
}

// Bir xil submodule_key uchun bir necha marta parallel ravishda
// avtomatik ro'yxatga olish hodisasi yaratilib qolishi mumkin edi (bir xil
// vaqtda bir nechta sahifa yuklanganda) — shu sabab har o'qishda hodisalar
// submodule_key bo'yicha birlashtiriladi, eng erta sanasi va eng "yaxshi"
// (tasdiqlangan > o'rganilgan > hech narsa) holati saqlanadi.
function dedupeNotificationRecord(record) {
  const canonicalByKey = new Map();
  const idRemap = new Map();
  const orderedEvents = [];
  record.events.forEach(event => {
    const key = String(event.submodule_key);
    const existing = canonicalByKey.get(key);
    if (!existing) {
      canonicalByKey.set(key, event);
      orderedEvents.push(event);
      return;
    }
    if (event.created_at && (!existing.created_at || new Date(event.created_at) < new Date(existing.created_at))) {
      existing.created_at = event.created_at;
    }
    idRemap.set(event.id, existing.id);
  });
  if (!idRemap.size) return { record, changed: false };
  const nextProgress = {};
  Object.entries(record.progress || {}).forEach(([eventId, perEmployee]) => {
    const canonicalId = idRemap.get(eventId) || eventId;
    const merged = nextProgress[canonicalId] || {};
    Object.entries(perEmployee || {}).forEach(([employeeId, progress]) => {
      merged[employeeId] = mergeEmployeeProgress(merged[employeeId], progress);
    });
    nextProgress[canonicalId] = merged;
  });
  return { record: { events: orderedEvents, progress: nextProgress }, changed: true };
}

async function getNotificationRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_NOTIFICATIONS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  const rawRecord = {
    events: Array.isArray(value.events) ? value.events : [],
    progress: value.progress && typeof value.progress === 'object' ? value.progress : {}
  };
  const { record, changed } = dedupeNotificationRecord(rawRecord);
  if (changed) await saveNotificationRecord(record).catch(() => null);
  return record;
}

async function saveNotificationRecord(record) {
  await supabase.insert('bot_settings', [{
    key: PERMISSION_NOTIFICATIONS_KEY,
    value: record,
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return record;
}

async function recordPermissionToggleEvents(addedKeys = [], modules = []) {
  if (!addedKeys.length) return;
  const record = await getNotificationRecord();
  // Bir nechta so'rov bir vaqtda avtomatik ro'yxatga olishga urinishi mumkin
  // (masalan bir nechta xodim sahifasi keshi bir vaqtda eskirganda) — shu
  // sabab bu yerda ham submodule_key allaqachon mavjudligi qayta tekshiriladi.
  const existingKeys = new Set(record.events.map(event => String(event.submodule_key)));
  const now = new Date().toISOString();
  const newEvents = addedKeys
    .filter(key => !existingKeys.has(String(key)))
    .map(key => {
      const meta = findSubmoduleMeta(modules, key);
      return {
        id: `${Date.now()}-${key}`,
        submodule_key: key,
        submodule_name: meta ? meta.submodule_name : key,
        module_name: meta ? meta.module_name : '',
        created_at: now
      };
    });
  if (!newEvents.length) return;
  record.events = [...record.events, ...newEvents].slice(-MAX_NOTIFICATION_EVENTS);
  await saveNotificationRecord(record);
}

async function removePermissionToggleEvents(removedKeys = []) {
  if (!removedKeys.length) return;
  const removedSet = new Set(removedKeys.map(String));
  const record = await getNotificationRecord();
  const removedEventIds = record.events
    .filter(event => removedSet.has(String(event.submodule_key)))
    .map(event => event.id);
  if (!removedEventIds.length) return;
  const remainingEvents = record.events.filter(event => !removedSet.has(String(event.submodule_key)));
  const nextProgress = { ...record.progress };
  removedEventIds.forEach(eventId => { delete nextProgress[eventId]; });
  await saveNotificationRecord({ events: remainingEvents, progress: nextProgress });
}

async function resetPermissionNotifications() {
  await saveNotificationRecord({ events: [], progress: {} });
  // Boshqaruv/admin paneldan qo'lda "yuborilgan" deb belgilangan action'lar
  // holati ham shu bilan birga tozalanadi — aks holda ular yashil (yuborilgan)
  // bo'lib qolaverardi, submodule darajasidagi progress nolga tushsa ham.
  await supabase.insert('bot_settings', [{
    key: PERMISSION_ACTION_SENT_KEY,
    value: { keys: [] },
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return { ok: true };
}

async function savePermissionSelection(selected = []) {
  const normalized = Array.from(new Set((Array.isArray(selected) ? selected : []).map(String).filter(Boolean)));
  const current = await getPermissionViewRecord();
  const previousSelected = Array.isArray(current.selected) ? current.selected.map(String) : [];
  const addedKeys = normalized.filter(key => !previousSelected.includes(key));
  const removedKeys = previousSelected.filter(key => !normalized.includes(key));
  const next = await savePermissionViewRecord({ selected: normalized });
  if (addedKeys.length) await recordPermissionToggleEvents(addedKeys, Array.isArray(current.modules) ? current.modules : []);
  if (removedKeys.length) await removePermissionToggleEvents(removedKeys);
  return { selected: next.selected };
}

// Boshqaruv/admin panelida har bir "action" (submodule ichidagi kichik
// funksiya) oldida belgilab, "Yuborish" bosilganda TANLANGAN action'lar
// "yuborilgan" deb belgilanadi — bu submodule darajasidagi bilim-daraja
// hisob-kitobiga (getKnowledgeDashboard) mutlaqo ta'sir qilmasligi uchun
// alohida, mustaqil bot_settings yozuvida saqlanadi.
async function getSentActionKeys() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_ACTION_SENT_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  return Array.isArray(value.keys) ? value.keys.map(String) : [];
}

function actionCompositeKey(submoduleKey, actionKey) {
  return `${submoduleKey}::${actionKey}`;
}

// Support xodimi submodule ichidagi HAR BIR action'ni alohida "o'rgandim"
// deb belgilashi mumkin — bu submodule darajasidagi (getNotificationRecord)
// hisob-kitobdan mustaqil, alohida bot_settings yozuvida saqlanadi, chunki
// action'lar submodule bilan bir xil event_id'ga ega emas.
async function getActionLearnedRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(PERMISSION_ACTION_LEARNED_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  return value.progress && typeof value.progress === 'object' ? value.progress : {};
}

async function saveActionLearnedRecord(progress) {
  await supabase.insert('bot_settings', [{
    key: PERMISSION_ACTION_LEARNED_KEY,
    value: { progress },
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
}

// MUHIM: submodule (event) darajasidagi holat va ichidagi action'larning
// holati ILGARI ikkita MUSTAQIL tizimda saqlanardi va bir-biriga hech qanday
// ta'sir qilmasdi — shuning uchun action'lar tasdiqlansa ham, submodule'ning
// o'zi ("Papkalar" kabi) hamon tasdiqlanmagan bo'lib qolardi, va "Xodimlar
// reytingi"dagi hisob-kitob (bu FAQAT submodule darajasidan olinadi) bilan
// "Bildirishnomalar tarixi"dagi ko'rinish bir-biriga zid chiqardi. Endi har
// safar action tasdiqlansa/qaytarilsa, submodule'ning holati SHU action'lar
// yig'indisidan avtomatik qayta hisoblanadi (barchasi tasdiqlansa — submodule
// ham tasdiqlanadi; birortasi qaytarilsa — submodule ham "jarayonda"ga qaytadi).
async function syncEventStatusWithActions(submoduleKey, employeeId) {
  const normalizedSubmoduleKey = String(submoduleKey || '');
  if (!normalizedSubmoduleKey || !employeeId) return;

  const [record, viewRecord, actionProgress] = await Promise.all([
    getNotificationRecord(),
    getPermissionViewRecord(),
    getActionLearnedRecord()
  ]);

  const event = record.events.find(item => String(item.submodule_key) === normalizedSubmoduleKey);
  if (!event) return;

  let actions = [];
  (Array.isArray(viewRecord.modules) ? viewRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      if (String(submodule.key) === normalizedSubmoduleKey) actions = submodule.actions || [];
    });
  });
  if (!actions.length) return;

  // Ko'pgina funksiyalarda support xodimi FAQAT butun submodule'ni (alohida
  // action'larsiz) "o'rgandim" deb belgilaydi — bunday hollarda action'larning
  // HECH biriga hech qachon tegilmagan bo'ladi. Agar shunday bo'lsa, bu yerda
  // "hech narsa o'rganilmagan" deb xato xulosa chiqarib, submodule'ning o'z
  // (to'g'ridan-to'g'ri belgilangan) holatini buzib qo'ymaslik kerak — sinxronlash
  // faqat kamida bitta action ALOHIDA qo'lda belgilangan submodule'larga tegishli.
  //
  // Qoida (uch bosqichli holat: Kutilmoqda -> Jarayonda -> O'rgangan):
  // kamida BITTA action o'rganilgan/tasdiqlangan bo'lsa — submodule ham
  // "Jarayonda" (o'rganildi) bo'ladi (support biror narsa yubordi); BARCHA
  // action'lar tasdiqlangandagina submodule "O'rgangan" (tasdiqlandi) bo'ladi.
  let anyActionTouched = false;
  let anyLearned = false;
  let allConfirmed = true;
  actions.forEach(action => {
    const key = actionCompositeKey(normalizedSubmoduleKey, String(action.key || action.id));
    const entry = (actionProgress[key] && actionProgress[key][employeeId]) || null;
    if (entry) anyActionTouched = true;
    const learnedAt = entry && entry.learned_at;
    const confirmedAt = entry && entry.confirmed_at;
    if (learnedAt || confirmedAt) anyLearned = true;
    if (!confirmedAt) allConfirmed = false;
  });
  if (!anyActionTouched) return;

  const current = (record.progress[event.id] && record.progress[event.id][employeeId]) || {};
  const nextLearned = anyLearned || allConfirmed;
  const nextConfirmed = allConfirmed;
  if (Boolean(current.learned_at) === nextLearned && Boolean(current.confirmed_at) === nextConfirmed) return;

  if (!record.progress[event.id]) record.progress[event.id] = {};
  record.progress[event.id][employeeId] = {
    ...current,
    learned_at: nextLearned ? (current.learned_at || new Date().toISOString()) : null,
    confirmed_at: nextConfirmed ? new Date().toISOString() : null,
    confirmed_by: nextConfirmed ? (current.confirmed_by || null) : null
  };
  await saveNotificationRecord(record);
}

// syncEventStatusWithActions faqat YANGI action yozuvlari kelganda ishlaydi —
// bu esa syncEventStatusWithActions yaratilishidan OLDIN yozib qo'yilgan
// (eski, noto'g'ri "bittasi o'rgansa hammasi o'rgangan" mantig'i bilan
// saqlangan) submodule holatlarini tuzatmaydi. Shu sabab "Bildirishnomalar
// tarixi" ba'zi eski yozuvlarda hamon submodule (masalan "Partiyalar") va
// uning action'lari orasida zid holat ko'rsatib turardi. Bu funksiya HAR
// safar tarix/umumiy ko'rinish o'qilganda BARCHA submodule/xodim juftlarini
// action'lar yig'indisiga moslab qayta tekshiradi va kerak bo'lsa
// saqlangan yozuvni ham to'g'irlaydi — shunda eski xato yozuvlar ham
// birinchi o'qishdayoq avtomatik tuzalib qoladi (alohida migratsiya
// skripti yozishga hojat qolmaydi).
function repairEventStatusFromActionProgress(record, viewRecord, actionProgress) {
  const actionsBySubmoduleKey = new Map();
  (Array.isArray(viewRecord.modules) ? viewRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      actionsBySubmoduleKey.set(String(submodule.key), submodule.actions || []);
    });
  });
  const eventBySubmoduleKey = new Map();
  record.events.forEach(event => eventBySubmoduleKey.set(String(event.submodule_key), event));

  const touchedPairs = new Set();
  Object.keys(actionProgress).forEach(compositeKey => {
    const submoduleKey = compositeKey.split('::')[0];
    Object.keys(actionProgress[compositeKey] || {}).forEach(employeeId => {
      touchedPairs.add(`${submoduleKey}::${employeeId}`);
    });
  });

  let changed = false;
  touchedPairs.forEach(pairKey => {
    const separatorIndex = pairKey.indexOf('::');
    const submoduleKey = pairKey.slice(0, separatorIndex);
    const employeeId = pairKey.slice(separatorIndex + 2);
    const event = eventBySubmoduleKey.get(submoduleKey);
    const actions = actionsBySubmoduleKey.get(submoduleKey) || [];
    if (!event || !actions.length) return;

    let anyLearned = false;
    let allConfirmed = true;
    actions.forEach(action => {
      const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
      const entry = (actionProgress[key] && actionProgress[key][employeeId]) || null;
      const learnedAt = entry && entry.learned_at;
      const confirmedAt = entry && entry.confirmed_at;
      if (learnedAt || confirmedAt) anyLearned = true;
      if (!confirmedAt) allConfirmed = false;
    });

    const current = (record.progress[event.id] && record.progress[event.id][employeeId]) || {};
    const nextLearned = anyLearned || allConfirmed;
    const nextConfirmed = allConfirmed;
    if (Boolean(current.learned_at) === nextLearned && Boolean(current.confirmed_at) === nextConfirmed) return;

    if (!record.progress[event.id]) record.progress[event.id] = {};
    record.progress[event.id][employeeId] = {
      ...current,
      learned_at: nextLearned ? (current.learned_at || new Date().toISOString()) : null,
      confirmed_at: nextConfirmed ? new Date().toISOString() : null,
      confirmed_by: nextConfirmed ? (current.confirmed_by || null) : null
    };
    changed = true;
  });
  return changed;
}

async function setActionLearned(submoduleKey, actionKey, employeeId, learned = true) {
  const normalizedSubmoduleKey = String(submoduleKey || '');
  const normalizedActionKey = String(actionKey || '');
  if (!normalizedSubmoduleKey || !normalizedActionKey || !employeeId) {
    throw new Error('submodule_key, action_key va employee_id majburiy');
  }
  const progress = await getActionLearnedRecord();
  const key = actionCompositeKey(normalizedSubmoduleKey, normalizedActionKey);
  if (!progress[key]) progress[key] = {};
  const current = progress[key][employeeId] || {};
  progress[key][employeeId] = {
    learned_at: learned ? new Date().toISOString() : null,
    confirmed_at: learned ? current.confirmed_at || null : null,
    confirmed_by: learned ? current.confirmed_by || null : null
  };
  await saveActionLearnedRecord(progress);
  await syncEventStatusWithActions(normalizedSubmoduleKey, employeeId).catch(() => null);
  return progress[key][employeeId];
}

// setEventsLearnedBatch bilan bir xil sabab — o'nlab action bir vaqtda
// belgilanganda, har biri uchun alohida o'qish+yozish o'rniga BITTA o'qish
// va BITTA yozish bilan hammasi birga saqlanadi.
async function setActionsLearnedBatch(items = [], employeeId) {
  if (!employeeId || !Array.isArray(items) || !items.length) return [];
  const progress = await getActionLearnedRecord();
  const touchedSubmodules = new Set();
  const results = [];
  items.forEach(({ submodule_key: submoduleKey, action_key: actionKey, learned = true }) => {
    const normalizedSubmoduleKey = String(submoduleKey || '');
    const normalizedActionKey = String(actionKey || '');
    if (!normalizedSubmoduleKey || !normalizedActionKey) return;
    const key = actionCompositeKey(normalizedSubmoduleKey, normalizedActionKey);
    if (!progress[key]) progress[key] = {};
    const current = progress[key][employeeId] || {};
    progress[key][employeeId] = {
      learned_at: learned ? new Date().toISOString() : null,
      confirmed_at: learned ? current.confirmed_at || null : null,
      confirmed_by: learned ? current.confirmed_by || null : null
    };
    touchedSubmodules.add(normalizedSubmoduleKey);
    results.push({ submodule_key: normalizedSubmoduleKey, action_key: normalizedActionKey, ...progress[key][employeeId] });
  });
  await saveActionLearnedRecord(progress);
  for (const submoduleKey of touchedSubmodules) {
    await syncEventStatusWithActions(submoduleKey, employeeId).catch(() => null);
  }
  return results;
}

// Boshqaruv/admin panelida support yuborgan (o'rgandim deb belgilagan)
// action'ni ko'rib chiqib "Tasdiqlash"/"Qaytarish" qilish uchun — submodule
// darajasidagi setManagerConfirmation bilan bir xil mantiq, faqat alohida
// action-progress yozuvida saqlanadi.
async function setActionConfirmed(submoduleKey, actionKey, employeeId, confirmed = true, managerName = '', reason = '') {
  const normalizedSubmoduleKey = String(submoduleKey || '');
  const normalizedActionKey = String(actionKey || '');
  if (!normalizedSubmoduleKey || !normalizedActionKey || !employeeId) {
    throw new Error('submodule_key, action_key va employee_id majburiy');
  }
  const progress = await getActionLearnedRecord();
  const key = actionCompositeKey(normalizedSubmoduleKey, normalizedActionKey);
  if (!progress[key]) progress[key] = {};
  const current = progress[key][employeeId] || {};
  progress[key][employeeId] = {
    ...current,
    // Tasdiqlash uchun action avvaldan "o'rganilgan" bo'lishi shart — agar bu
    // action hali ALOHIDA "o'rgandim" deb belgilanmagan bo'lsa (faqat butun
    // submodule orqali meros qilingan bo'lsa), shu yerda ham backfill
    // qilinadi. Aks holda, tasdiq qaytarilganda ("Qaytarish") learned_at
    // bo'sh qolib, action "Jarayonda" o'rniga to'g'ridan-to'g'ri
    // "Kutilmoqda"ga tushib ketardi.
    learned_at: current.learned_at || new Date().toISOString(),
    confirmed_at: confirmed ? new Date().toISOString() : null,
    confirmed_by: confirmed ? (managerName || null) : null,
    // "Qaytarish" sababi — support panelda ko'rsatish uchun; qayta
    // tasdiqlansa eskirgan sabab tozalanadi.
    revert_reason: confirmed ? null : (String(reason || '').trim() || current.revert_reason || null)
  };
  await saveActionLearnedRecord(progress);
  await syncEventStatusWithActions(normalizedSubmoduleKey, employeeId).catch(() => null);
  return progress[key][employeeId];
}

// setActionsLearnedBatch/setEventsLearnedBatch bilan bir xil sabab —
// "Bildirishnomalar tarixi"da bir nechta funksiyani birga tasdiqlash/
// qaytarishda, HAR biri uchun alohida o'qish+yozish o'rniga BITTA o'qish
// va BITTA yozish bilan hammasi birga saqlanadi.
async function setActionsConfirmedBatch(items = [], managerName = '') {
  if (!Array.isArray(items) || !items.length) return [];
  const progress = await getActionLearnedRecord();
  const touchedPairs = new Set();
  const results = [];
  items.forEach(({ submodule_key: submoduleKey, action_key: actionKey, employee_id: employeeId, confirmed = true, reason = '' }) => {
    const normalizedSubmoduleKey = String(submoduleKey || '');
    const normalizedActionKey = String(actionKey || '');
    if (!normalizedSubmoduleKey || !normalizedActionKey || !employeeId) return;
    const key = actionCompositeKey(normalizedSubmoduleKey, normalizedActionKey);
    if (!progress[key]) progress[key] = {};
    const current = progress[key][employeeId] || {};
    progress[key][employeeId] = {
      ...current,
      learned_at: current.learned_at || new Date().toISOString(),
      confirmed_at: confirmed ? new Date().toISOString() : null,
      confirmed_by: confirmed ? (managerName || null) : null,
      revert_reason: confirmed ? null : (String(reason || '').trim() || current.revert_reason || null)
    };
    touchedPairs.add(`${normalizedSubmoduleKey}::${employeeId}`);
    results.push({ submodule_key: normalizedSubmoduleKey, action_key: normalizedActionKey, employee_id: employeeId, ...progress[key][employeeId] });
  });
  await saveActionLearnedRecord(progress);
  for (const pairKey of touchedPairs) {
    const separatorIndex = pairKey.indexOf('::');
    const submoduleKey = pairKey.slice(0, separatorIndex);
    const employeeId = pairKey.slice(separatorIndex + 2);
    await syncEventStatusWithActions(submoduleKey, employeeId).catch(() => null);
  }
  return results;
}

async function sendPermissionActions(items = []) {
  const normalized = (Array.isArray(items) ? items : [])
    .map(item => ({
      module_name: (item && item.module_name) || '',
      submodule_key: String((item && item.submodule_key) || ''),
      submodule_name: (item && item.submodule_name) || '',
      action_key: String((item && item.action_key) || ''),
      action_name: (item && item.action_name) || ''
    }))
    .filter(item => item.submodule_key && item.action_key);

  const existingKeys = new Set(await getSentActionKeys());
  if (normalized.length) {
    normalized.forEach(item => {
      existingKeys.add(actionCompositeKey(item.submodule_key, item.action_key));
    });
    await supabase.insert('bot_settings', [{
      key: PERMISSION_ACTION_SENT_KEY,
      value: { keys: Array.from(existingKeys) },
      updated_at: new Date().toISOString()
    }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  }
  return { sent: Array.from(existingKeys) };
}

async function getSupportEmployees() {
  return supabase.select('employees', {
    select: 'id,username,full_name,role,is_active,created_at,tg_user_id,avatar_path,avatar_updated_at',
    role: supabase.eq('support'),
    is_active: supabase.eq(true),
    limit: '200'
  }).catch(() => []);
}

async function getManagerEmployees() {
  return supabase.select('employees', {
    select: 'id,username,full_name,role,is_active',
    role: supabase.eq('manager'),
    is_active: supabase.eq(true),
    limit: '200'
  }).catch(() => []);
}

function progressFor(record, eventId, employeeId) {
  const eventProgress = record.progress[eventId];
  return (eventProgress && eventProgress[employeeId]) || {};
}

async function getSupportOverview() {
  const [employees, record, viewRecord, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getPermissionViewRecord(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, viewRecord, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const total = record.events.length;
  return employees.map(employee => {
    let confirmedCount = 0;
    // "unread" — support belgilab "Yuborish"ni bosgan (o'rgandim deb yuborgan),
    // lekin admin hali tasdiqlamagan fichalar soni — hali umuman tegilmagan
    // (yuborilmagan) fichalar bu yerga kirmaydi.
    let pendingReviewCount = 0;
    record.events.forEach(event => {
      const progress = progressFor(record, event.id, employee.id);
      if (progress.confirmed_at) confirmedCount += 1;
      else if (progress.learned_at) pendingReviewCount += 1;
    });
    const percent = total ? Math.round((confirmedCount / total) * 100) : 0;
    return {
      id: employee.id,
      full_name: employee.full_name || employee.username || 'Support',
      username: employee.username || '',
      tg_user_id: employee.tg_user_id || null,
      has_avatar: !!employee.avatar_path,
      avatar_updated_at: employee.avatar_updated_at || null,
      unread: pendingReviewCount,
      confirmed: confirmedCount,
      percent
    };
  });
}

async function listNotificationEvents() {
  const record = await getNotificationRecord();
  return record.events.slice().reverse();
}

async function getEventLearningStatus(eventId) {
  const [employees, record] = await Promise.all([getSupportEmployees(), getNotificationRecord()]);
  const events = record.events.slice().reverse();
  const targetEvent = eventId ? events.find(event => String(event.id) === String(eventId)) : events[0];
  if (!targetEvent) return { event: null, rows: [] };
  const rows = employees.map(employee => {
    const progress = progressFor(record, targetEvent.id, employee.id);
    return {
      employee_id: employee.id,
      full_name: employee.full_name || employee.username || 'Support',
      username: employee.username || '',
      learned: Boolean(progress.learned_at),
      learned_at: progress.learned_at || null,
      confirmed: Boolean(progress.confirmed_at)
    };
  });
  return { event: targetEvent, rows };
}

async function setEventLearned(eventId, employeeId, learned = true) {
  if (!eventId || !employeeId) throw new Error('event_id va employee_id majburiy');
  const record = await getNotificationRecord();
  if (!record.progress[eventId]) record.progress[eventId] = {};
  const current = record.progress[eventId][employeeId] || {};
  record.progress[eventId][employeeId] = {
    ...current,
    learned_at: learned ? new Date().toISOString() : null,
    confirmed_at: learned ? current.confirmed_at || null : null,
    confirmed_by: learned ? current.confirmed_by || null : null
  };
  await saveNotificationRecord(record);
  return record.progress[eventId][employeeId];
}

// "Uyqur Funksiyalari" sahifasida support bir vaqtda o'nlab funksiyani
// belgilab "Yuborish"ni bosganda, avvalgi (bittalab, ketma-ket so'rov
// yuboruvchi) yo'l HAR BIR funksiya uchun umumiy bot_settings yozuvini
// alohida o'qib-yozar edi — bu funksiyalar/xodimlar soni ortgani sari
// tobora sekinlashib borardi. Endi BARCHASI bitta so'rovda, bitta
// o'qish+yozish bilan amalga oshiriladi.
async function setEventsLearnedBatch(items = [], employeeId) {
  if (!employeeId || !Array.isArray(items) || !items.length) return [];
  const record = await getNotificationRecord();
  const results = [];
  items.forEach(({ event_id: eventId, learned = true }) => {
    if (!eventId) return;
    if (!record.progress[eventId]) record.progress[eventId] = {};
    const current = record.progress[eventId][employeeId] || {};
    record.progress[eventId][employeeId] = {
      ...current,
      learned_at: learned ? new Date().toISOString() : null,
      confirmed_at: learned ? current.confirmed_at || null : null,
      confirmed_by: learned ? current.confirmed_by || null : null
    };
    results.push({ event_id: eventId, ...record.progress[eventId][employeeId] });
  });
  await saveNotificationRecord(record);
  return results;
}

async function getSupportEventHistory(employeeId) {
  if (!employeeId) return [];
  const [record, viewRecord, actionProgress] = await Promise.all([
    getNotificationRecord(),
    getPermissionViewRecord(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, viewRecord, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const actionsBySubmoduleKey = new Map();
  const submoduleMetaByKey = new Map();
  (Array.isArray(viewRecord.modules) ? viewRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      const key = String(submodule.key);
      actionsBySubmoduleKey.set(key, submodule.actions || []);
      submoduleMetaByKey.set(key, { submodule_name: submodule.name || key, module_name: module.name || module.key || '' });
    });
  });

  function buildRow(event) {
    const progress = progressFor(record, event.id, employeeId);
    const rawActions = actionsBySubmoduleKey.get(String(event.submodule_key)) || [];
    const submoduleKey = String(event.submodule_key);
    // Submodule'ning o'z holatini FAQAT saqlangan `progress`dan emas, balki
    // action'lar yig'indisidan (syncEventStatusWithActions bilan bir xil
    // qoida) hisoblaymiz — chunki hodisasi umuman yaratilmagan ("action-only")
    // submodule'lar uchun `progress` doim bo'sh bo'ladi, lekin action'lari
    // haqiqiy tasdiqlangan bo'lishi mumkin.
    let anyActionTouched = false;
    let anyLearned = false;
    let allConfirmed = true;
    rawActions.forEach(action => {
      const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
      const entry = (actionProgress[key] && actionProgress[key][employeeId]) || null;
      if (entry) anyActionTouched = true;
      const learnedAt = entry && entry.learned_at;
      const confirmedAt = entry && entry.confirmed_at;
      if (learnedAt || confirmedAt) anyLearned = true;
      if (!confirmedAt) allConfirmed = false;
    });
    const eventLearned = anyActionTouched ? (anyLearned || allConfirmed) : Boolean(progress.learned_at);
    const eventConfirmed = anyActionTouched ? allConfirmed : Boolean(progress.confirmed_at);
    // Ko'pgina fichalar FAQAT butun submodule darajasida ("Papkalar" kabi)
    // belgilanadi — action'larning hech biriga alohida tegilmagan bo'ladi.
    // Bunday holda action'lar submodule'ning o'z holatini meros oladi,
    // aks holda submodule "O'rganildi" bo'lsa-yu, ichidagi action'lar hamon
    // "Kutilmoqda" bo'lib zid ko'rinardi (support hech qachon ularni ALOHIDA
    // belgilamagani uchun ular haqiqatda ham tegilmagan — lekin ko'rinishda
    // submodule bilan bir xil holatda bo'lishi kerak).
    const actions = rawActions.map(action => {
      const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
      const actionEntry = (actionProgress[key] && actionProgress[key][employeeId]) || {};
      const learned = anyActionTouched ? Boolean(actionEntry.learned_at) : eventLearned;
      const confirmed = anyActionTouched ? Boolean(actionEntry.confirmed_at) : eventConfirmed;
      return {
        id: action.id,
        key: action.key,
        name: action.name || action.key,
        learned,
        learned_at: anyActionTouched ? (actionEntry.learned_at || null) : (eventLearned ? progress.learned_at : null),
        confirmed,
        confirmed_at: anyActionTouched ? (actionEntry.confirmed_at || null) : (eventConfirmed ? progress.confirmed_at : null),
        // "Qaytarish" bosilganda yozilgan sabab — support panelda shu
        // funksiya nega qaytarilganini ko'rsatish uchun.
        revert_reason: anyActionTouched ? (actionEntry.revert_reason || null) : (progress.revert_reason || null)
      };
    });
    return {
      event_id: event.id,
      module_name: event.module_name,
      submodule_name: event.submodule_name,
      submodule_key: event.submodule_key,
      created_at: event.created_at,
      learned: eventLearned,
      learned_at: eventLearned ? (progress.learned_at || null) : null,
      confirmed: eventConfirmed,
      confirmed_at: eventConfirmed ? (progress.confirmed_at || null) : null,
      revert_reason: progress.revert_reason || null,
      actions
    };
  }

  const rows = record.events.slice().reverse().map(buildRow);

  // Ba'zi funksiyalar hech qachon BUTUN submodule sifatida "yuborilmagan"
  // (uchun hodisa/event yaratilmagan), lekin support ularning ICHIDAGI
  // action'larini alohida belgilab, menejer ham tasdiqlagan bo'lishi mumkin
  // — bunday holda oldin bu progress "Bildirishnomalar tarixi"da UMUMAN
  // ko'rinmay, mavjud ish yo'qolgandek bo'lib qolardi. Endi shunday
  // submodule'lar uchun ham (faqat kamida bitta action tegilgan bo'lsa)
  // sun'iy qator qo'shiladi.
  const eventSubmoduleKeys = new Set(record.events.map(event => String(event.submodule_key)));
  actionsBySubmoduleKey.forEach((actions, submoduleKey) => {
    if (eventSubmoduleKeys.has(submoduleKey)) return;
    const anyTouched = actions.some(action => {
      const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
      return Boolean(actionProgress[key] && actionProgress[key][employeeId]);
    });
    if (!anyTouched) return;
    const meta = submoduleMetaByKey.get(submoduleKey) || {};
    rows.unshift(buildRow({
      id: `action-only:${submoduleKey}`,
      submodule_key: submoduleKey,
      submodule_name: meta.submodule_name || submoduleKey,
      module_name: meta.module_name || '',
      created_at: null
    }));
  });

  return rows;
}

async function getManagerReviewQueue() {
  const [supports, record] = await Promise.all([getSupportEmployees(), getNotificationRecord()]);
  const supportById = new Map(supports.map(employee => [String(employee.id), employee]));
  const rows = [];
  record.events.forEach(event => {
    const eventProgress = record.progress[event.id] || {};
    Object.entries(eventProgress).forEach(([employeeId, progress]) => {
      if (!progress.learned_at) return;
      const employee = supportById.get(String(employeeId));
      if (!employee) return;
      rows.push({
        event_id: event.id,
        submodule_name: event.submodule_name,
        module_name: event.module_name,
        employee_id: employeeId,
        full_name: employee.full_name || employee.username || 'Support',
        username: employee.username || '',
        learned_at: progress.learned_at,
        confirmed: Boolean(progress.confirmed_at),
        confirmed_at: progress.confirmed_at || null
      });
    });
  });
  return rows.sort((a, b) => String(b.learned_at).localeCompare(String(a.learned_at)));
}

async function getManagerConfirmerRecord() {
  const rows = await supabase.select('bot_settings', {
    select: 'key,value',
    key: supabase.eq(MANAGER_CONFIRMERS_KEY),
    limit: '1'
  }).catch(() => []);
  const row = rows[0] || null;
  const value = row && row.value && typeof row.value === 'object' ? row.value : {};
  return { usernames: Array.isArray(value.usernames) ? value.usernames.map(String) : [] };
}

async function getManagerConfirmers() {
  return getManagerConfirmerRecord();
}

async function saveManagerConfirmers(usernames = []) {
  const normalized = Array.from(new Set((Array.isArray(usernames) ? usernames : []).map(String).filter(Boolean)));
  await supabase.insert('bot_settings', [{
    key: MANAGER_CONFIRMERS_KEY,
    value: { usernames: normalized },
    updated_at: new Date().toISOString()
  }], { upsert: true, onConflict: 'key', prefer: 'return=minimal' });
  return { usernames: normalized };
}

async function setManagerConfirmation(eventId, employeeId, confirmed = true, managerName = '', reason = '') {
  if (!eventId || !employeeId) throw new Error('event_id va employee_id majburiy');
  // "Menejerlar" bo'limi parol bilan himoyalangani uchun, tasdiqlashni kim
  // bosgani bo'yicha qo'shimcha cheklov qo'llanmaydi — cheklovsiz.
  const record = await getNotificationRecord();
  if (!record.progress[eventId]) record.progress[eventId] = {};
  const current = record.progress[eventId][employeeId] || {};
  record.progress[eventId][employeeId] = {
    ...current,
    // Tasdiq qaytarilsa ("Qaytarish"), "Jarayonda" (O'rganildi) holatiga
    // qaytadi — support "o'rgandim" deb belgilagani (learned_at) saqlanib
    // qoladi (yoki hali bo'lmasa shu yerda backfill qilinadi), faqat
    // menejer tasdig'i (confirmed_at) bekor qilinadi.
    learned_at: current.learned_at || new Date().toISOString(),
    confirmed_at: confirmed ? new Date().toISOString() : null,
    confirmed_by: confirmed ? (managerName || null) : null,
    // "Qaytarish" sababi — support panelda ko'rsatish uchun; qayta
    // tasdiqlansa eskirgan sabab tozalanadi.
    revert_reason: confirmed ? null : (String(reason || '').trim() || current.revert_reason || null)
  };
  await saveNotificationRecord(record);
  return record.progress[eventId][employeeId];
}

// setActionsConfirmedBatch bilan bir xil sabab — submodule darajasidagi
// (butun funksiya) tasdiqlash/qaytarish ham bir nechtasi birga
// bajarilganda BITTA o'qish+yozish bilan amalga oshiriladi.
async function setManagerConfirmationBatch(items = [], managerName = '') {
  if (!Array.isArray(items) || !items.length) return [];
  const record = await getNotificationRecord();
  const results = [];
  items.forEach(({ event_id: eventId, employee_id: employeeId, confirmed = true, reason = '' }) => {
    if (!eventId || !employeeId) return;
    if (!record.progress[eventId]) record.progress[eventId] = {};
    const current = record.progress[eventId][employeeId] || {};
    record.progress[eventId][employeeId] = {
      ...current,
      learned_at: current.learned_at || new Date().toISOString(),
      confirmed_at: confirmed ? new Date().toISOString() : null,
      confirmed_by: confirmed ? (managerName || null) : null,
      revert_reason: confirmed ? null : (String(reason || '').trim() || current.revert_reason || null)
    };
    results.push({ event_id: eventId, employee_id: employeeId, ...record.progress[eventId][employeeId] });
  });
  await saveNotificationRecord(record);
  return results;
}

// Tashqi daraxt yangilanganda (kesh muddati o'tib, qayta so'ralganda) topilgan
// YANGI funksiyalar qo'lda "Saqlash" bosilishini kutmasdan, avtomatik ravishda
// "yuborilgan" deb belgilanadi va supportlar uchun bildirishnoma hodisasi
// yaratiladi — checkbox/Saqlash tugmasi endi umuman kerak emas.
async function autoRegisterNewSubmodules(modules = [], previousSelected = []) {
  const allKeys = modules.flatMap(module => (module.submodules || []).map(submodule => String(submodule.key)));
  const previousSet = new Set(previousSelected.map(String));
  const addedKeys = allKeys.filter(key => !previousSet.has(key));
  if (!addedKeys.length) return previousSelected.map(String);
  const nextSelected = Array.from(new Set([...previousSelected.map(String), ...addedKeys]));
  await savePermissionViewRecord({ selected: nextSelected });
  await recordPermissionToggleEvents(addedKeys, modules);
  return nextSelected;
}

// Modul daraxti keshini "toza" saqlash uchun (o'zi 10 daqiqa keshlanadi),
// har bir submodule'ga xodimlarning o'rgangan/o'rganmagan holati va chiqqan
// sanasi bu yerda — HAR SO'ROVDA yangi (kesh ICHIGA yozib qo'yilmaydi) —
// biriktiriladi. "Uyqur Funksiyalari" boardida har bir ficha (submodule)
// oldida ko'rsatish uchun ishlatiladi.
async function attachSubmoduleProgress(modules = []) {
  const [employees, record, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, { modules }, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const eventBySubmoduleKey = new Map(record.events.map(event => [String(event.submodule_key), event]));
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return modules.map(module => ({
    ...module,
    submodules: (module.submodules || []).map(submodule => {
      const event = eventBySubmoduleKey.get(String(submodule.key)) || null;
      const submoduleKey = String(submodule.key);
      const submoduleActions = submodule.actions || [];
      const learned_employees = [];
      const not_learned_employees = [];
      employees.forEach(employee => {
        const progress = event ? progressFor(record, event.id, employee.id) : {};
        const row = {
          id: employee.id,
          full_name: employee.full_name || employee.username || 'Xodim',
          tg_user_id: employee.tg_user_id || null,
          has_avatar: !!employee.avatar_path,
          avatar_updated_at: employee.avatar_updated_at || null,
          learned_at: progress.learned_at || null
        };
        if (progress.learned_at) learned_employees.push(row);
        else not_learned_employees.push(row);
      });
      const createdAt = event ? event.created_at : null;
      // Xodim shu submodule ichidagi action'larning BIRORTASINI ham alohida
      // belgilamagan bo'lsa (faqat butun submodule darajasida belgilagan
      // bo'lsa), action'lar ro'yxatida ham submodule'ning o'z holatini
      // meros oladi — aks holda bu yerda ham submodule "o'rganilgan" deb
      // ko'rinib, action'lar "o'rganilmagan" bo'lib zid ko'rinardi.
      const touchedEmployeeIds = new Set();
      submoduleActions.forEach(action => {
        const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
        Object.keys(actionProgress[key] || {}).forEach(employeeId => touchedEmployeeIds.add(employeeId));
      });
      const actions = submoduleActions.map(action => {
        const actionKey = actionCompositeKey(submoduleKey, String(action.key || action.id));
        const actionEmployeeProgress = actionProgress[actionKey] || {};
        const action_learned_employees = [];
        const action_not_learned_employees = [];
        employees.forEach(employee => {
          const anyActionTouched = touchedEmployeeIds.has(String(employee.id));
          const eventProgress = event ? progressFor(record, event.id, employee.id) : {};
          const learnedAt = anyActionTouched
            ? (actionEmployeeProgress[employee.id] && actionEmployeeProgress[employee.id].learned_at)
            : eventProgress.learned_at;
          const row = {
            id: employee.id,
            full_name: employee.full_name || employee.username || 'Xodim',
            tg_user_id: employee.tg_user_id || null,
            has_avatar: !!employee.avatar_path,
            avatar_updated_at: employee.avatar_updated_at || null,
            learned_at: learnedAt || null
          };
          if (learnedAt) action_learned_employees.push(row);
          else action_not_learned_employees.push(row);
        });
        return {
          ...action,
          learned_employees: action_learned_employees,
          not_learned_employees: action_not_learned_employees
        };
      });
      return {
        ...submodule,
        actions,
        created_at: createdAt,
        days_since_launch: createdAt ? Math.floor((now - new Date(createdAt).getTime()) / dayMs) : null,
        learned_employees,
        not_learned_employees
      };
    })
  }));
}

async function getPermissionView({ withProgress = false } = {}) {
  const record = await getPermissionViewRecord();
  const selected = Array.isArray(record.selected) ? record.selected.map(String) : [];
  const sentActionKeys = await getSentActionKeys();
  const cachedAt = record.modules_cached_at ? new Date(record.modules_cached_at).getTime() : 0;
  const cacheFresh = Array.isArray(record.modules) && record.modules.length
    && cachedAt && (Date.now() - cachedAt <= PERMISSION_VIEW_CACHE_TTL_MS);

  async function finalize(modules, extra = {}) {
    const finalModules = withProgress ? await attachSubmoduleProgress(modules) : modules;
    return { modules: finalModules, selected, sentActionKeys, ...extra };
  }

  if (cacheFresh) return finalize(record.modules, { from_cache: true });

  try {
    const modules = await fetchPermissionView();
    await savePermissionViewRecord({ modules, modules_cached_at: new Date().toISOString() });
    const nextSelected = await autoRegisterNewSubmodules(modules, selected);
    return finalize(modules, { selected: nextSelected, from_cache: false });
  } catch (error) {
    if (Array.isArray(record.modules) && record.modules.length) {
      return finalize(record.modules, { from_cache: true, stale: true, error: error.message });
    }
    throw error;
  }
}

const KNOWLEDGE_DASHBOARD_PERIOD_DAYS = new Set([7, 14, 30]);
const NEW_EMPLOYEE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DYNAMICS_DAYS = 60;

// "Bilim darajasi %" = shu doiradagi hodisalardan qanchasi "O'rganildi" deb
// belgilanganligi (learned_at bor-yo'qligi) — menejer tasdiqlashi (confirmed_at)
// bu hisobga kirmaydi, chunki bu xodimning o'z bilimini aks ettiradi.
async function getKnowledgeDashboard({ days = 7 } = {}) {
  const isAllTime = String(days) === 'all';
  const periodDays = !isAllTime && KNOWLEDGE_DASHBOARD_PERIOD_DAYS.has(Number(days)) ? Number(days) : 7;
  // getPermissionView() (raw getPermissionViewRecord() emas) ishlatiladi —
  // shu orqali "Uyqur Funksiyalari" sahifasidagi kabi kesh eskirgan bo'lsa
  // avtomatik yangilanadi, aks holda bu yerdagi jami son ("allSubmodules")
  // o'sha sahifadagi haqiqiy daraxtdan orqada qolib ketishi mumkin edi.
  const [employees, record, permissionRecord, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getPermissionView(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, { modules: permissionRecord.modules }, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const events = record.events;
  const now = Date.now();
  // "Hammasi" tanlansa, davr boshlanishi hodisalar tarixining eng boshigacha
  // cho'ziladi (0), ya'ni hech qanday vaqt bo'yicha filtrlash qo'llanmaydi.
  const periodStartMs = isAllTime ? 0 : now - periodDays * DAY_MS;

  // Har bir submodule kalitiga mos ICHKI "actions" soni — endi barcha
  // foiz/son hisob-kitoblari SUBMODULE emas, balki shu submodule ichidagi
  // actions soniga qarab OG'IRLASHTIRILADI (masalan 16 ta action'i bor
  // submodule umumiy hisobga 16 birlik qo'shadi, 1 tasi bo'lgani — 1 birlik).
  // Actions ma'lumoti yo'q submodule xavfsizlik uchun kamida 1 deb hisoblanadi
  // (butunlay hisobdan tushib qolmasin).
  const submoduleActionsCountByKey = new Map();
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      const count = Array.isArray(submodule.actions) && submodule.actions.length ? submodule.actions.length : 1;
      submoduleActionsCountByKey.set(String(submodule.key), count);
    });
  });
  function actionsCountFor(key) {
    return submoduleActionsCountByKey.get(String(key)) || 1;
  }

  // Faqat TASDIQLANGAN (confirmed_at) funksiyalar "Daraja"/foizga qo'shiladi —
  // "Qaytarish" bosilganda (confirmed_at olib tashlanadi-yu, learned_at
  // qoladi, ya'ni "jarayonda"ga qaytadi) foiz ham darhol pasayishi kerak,
  // aks holda hali tasdiqlanmagan/qaytarilgan funksiya foizga qo'shilib
  // qolaverardi.
  function percentAsOf(employeeId, cutoffMs) {
    const relevant = events.filter(event => new Date(event.created_at).getTime() <= cutoffMs);
    if (!relevant.length) return 0;
    let totalWeight = 0;
    let confirmedWeight = 0;
    relevant.forEach(event => {
      const weight = actionsCountFor(event.submodule_key);
      totalWeight += weight;
      const progress = progressFor(record, event.id, employeeId);
      if (progress.confirmed_at && new Date(progress.confirmed_at).getTime() <= cutoffMs) confirmedWeight += weight;
    });
    return totalWeight ? Math.round((confirmedWeight / totalWeight) * 100) : 0;
  }

  // "Barcha funksiyalar"dagi BUTUN daraxt (tanlangan + tanlanmagan) — xodimlar
  // reytingidagi va umumiy KPI'dagi o'rgangan/jarayonda/boshlanmagan sonlari
  // shu ro'yxatga nisbatan hisoblanadi.
  const allSubmodules = [];
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      allSubmodules.push(String(submodule.key));
    });
  });
  const selectedKeys = new Set((Array.isArray(permissionRecord.selected) ? permissionRecord.selected : []).map(String));
  const eventBySubmoduleKey = new Map(events.map(event => [String(event.submodule_key), event]));

  function employeeFunctionCounts(employeeId) {
    let learned = 0;
    let inProgress = 0;
    let notStarted = 0;
    allSubmodules.forEach(key => {
      const weight = actionsCountFor(key);
      const event = selectedKeys.has(key) ? eventBySubmoduleKey.get(key) : null;
      if (!event) {
        notStarted += weight;
        return;
      }
      const progress = progressFor(record, event.id, employeeId);
      if (progress.confirmed_at) learned += weight;
      else if (progress.learned_at) inProgress += weight;
      else notStarted += weight;
    });
    return { learned, inProgress, notStarted };
  }

  const employeeRanking = employees.map(employee => {
    const percent = percentAsOf(employee.id, now);
    const previousPercent = percentAsOf(employee.id, periodStartMs);
    const counts = employeeFunctionCounts(employee.id);
    return {
      employee_id: employee.id,
      full_name: employee.full_name || employee.username || 'Xodim',
      username: employee.username || '',
      tg_user_id: employee.tg_user_id || null,
      has_avatar: !!employee.avatar_path,
      avatar_updated_at: employee.avatar_updated_at || null,
      percent,
      change_pct: percent - previousPercent,
      learned_count: counts.learned,
      in_progress_count: counts.inProgress,
      not_started_count: counts.notStarted
    };
  }).sort((a, b) => b.percent - a.percent);

  const avgKnowledgePct = employeeRanking.length
    ? Math.round(employeeRanking.reduce((sum, row) => sum + row.percent, 0) / employeeRanking.length)
    : 0;
  const avgKnowledgeChangePct = employeeRanking.length
    ? Math.round(employeeRanking.reduce((sum, row) => sum + row.change_pct, 0) / employeeRanking.length)
    : 0;

  const newEmployeesCount = employees.filter(employee => {
    if (!employee.created_at) return false;
    return now - new Date(employee.created_at).getTime() <= NEW_EMPLOYEE_WINDOW_MS;
  }).length;

  const periodEvents = events.filter(event => new Date(event.created_at).getTime() >= periodStartMs);
  // "O'rganilgan" = shu davrda chiqqan funksiyani BARCHA faol support'lar o'rgangan.
  const periodFullyLearnedCount = periodEvents.filter(event => employees.length > 0
    && employees.every(employee => Boolean(progressFor(record, event.id, employee.id).learned_at))).length;

  // "O'rganilgan/Jarayonda/Boshlanmagan funksiyalar" — endi har bir funksiya
  // (submodule) o'zining ICHKI ACTIONS soniga teng OG'IRLIKDA hisoblanadi
  // (submodule x 1 emas):
  //  - tanlanmagan yoki hali hodisasi yo'q — "boshlanmagan";
  //  - hodisasi bor-у hech kim tegmagan — "boshlanmagan";
  //  - kamida bitta xodim o'rgangan/tasdiqlagan, lekin BIRORTASI hali
  //    tasdiqlamagan (hattoki bittasi qolgan bo'lsa ham) — "jarayonda";
  //  - BARCHA faol support'lar tasdiqlagan — "o'rganilgan".
  let learnedFunctionsCount = 0;
  let inProgressFunctionsCount = 0;
  let notStartedFunctionsCount = 0;
  let totalFunctionsCount = 0;
  allSubmodules.forEach(key => {
    const weight = actionsCountFor(key);
    totalFunctionsCount += weight;
    const event = selectedKeys.has(key) ? eventBySubmoduleKey.get(key) : null;
    if (!event) {
      notStartedFunctionsCount += weight;
      return;
    }
    const learnedByAny = employees.some(employee => {
      const progress = progressFor(record, event.id, employee.id);
      return Boolean(progress.learned_at || progress.confirmed_at);
    });
    const confirmedByAll = employees.length > 0
      && employees.every(employee => Boolean(progressFor(record, event.id, employee.id).confirmed_at));
    if (confirmedByAll) learnedFunctionsCount += weight;
    else if (learnedByAny) inProgressFunctionsCount += weight;
    else notStartedFunctionsCount += weight;
  });
  const donut = {
    learned_pct: totalFunctionsCount ? Math.round((learnedFunctionsCount / totalFunctionsCount) * 100) : 0,
    in_progress_pct: totalFunctionsCount ? Math.round((inProgressFunctionsCount / totalFunctionsCount) * 100) : 0,
    not_learned_pct: totalFunctionsCount ? Math.round((notStartedFunctionsCount / totalFunctionsCount) * 100) : 0,
    learned_count: learnedFunctionsCount,
    in_progress_count: inProgressFunctionsCount,
    not_learned_count: notStartedFunctionsCount,
    total_count: totalFunctionsCount
  };

  // "Barcha funksiyalar"dagi BUTUN modul daraxti asos qilib olinadi — hali
  // yuborilmagan funksiya ham maxrajga kiradi (0% qo'shib turadi). Foiz
  // faqat xodim "O'rgandim" deb belgilab, MENEJER buni tasdiqlagandan
  // (confirmed_at) keyin oshadi — shunchaki "o'rgandim" belgisi yetarli emas.
  const submodulesByCanonicalModule = new Map();
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    const canonicalName = canonicalModuleName(module.name || module.key);
    if (!canonicalName) return;
    const list = submodulesByCanonicalModule.get(canonicalName) || [];
    list.push(...(module.submodules || []));
    submodulesByCanonicalModule.set(canonicalName, list);
  });
  const eventModuleNames = events.map(event => canonicalModuleName(event.module_name)).filter(Boolean);
  const moduleNames = [...new Set([...submodulesByCanonicalModule.keys(), ...eventModuleNames])];
  const moduleBars = moduleNames.map(moduleName => {
    // Daraxtda topilmasa (masalan olib tashlangan eski modul) — shu nomdagi
    // hodisalarni submodule sifatida ishlatamiz, hech narsa yo'qolib qolmasin.
    const submodules = submodulesByCanonicalModule.get(moduleName)?.length
      ? submodulesByCanonicalModule.get(moduleName)
      : events
        .filter(event => canonicalModuleName(event.module_name) === moduleName)
        .map(event => ({ key: event.submodule_key }));

    // "O'rganilgan funksiyalar" KPI kartasi va donut bilan bir xil qoidaga
    // amal qilinadi: submodule faqat BARCHA faol support'lar tasdiqlagandan
    // keyin hisobga kiradi — bitta xodim tasdiqlashi yoki hali "jarayonda"
    // (tasdiqlanmagan) bo'lishi modul foizini oshirmasligi kerak.
    let confirmedWeight = 0;
    let totalWeight = 0;
    submodules.forEach(submodule => {
      const weight = actionsCountFor(submodule.key);
      totalWeight += weight;
      const event = eventBySubmoduleKey.get(String(submodule.key));
      const confirmedByAll = Boolean(event) && employees.length > 0
        && employees.every(employee => Boolean(progressFor(record, event.id, employee.id).confirmed_at));
      if (confirmedByAll) confirmedWeight += weight;
    });
    return {
      module_name: moduleName,
      percent: totalWeight ? Math.round((confirmedWeight / totalWeight) * 100) : 0
    };
  }).sort((a, b) => b.percent - a.percent);

  let dynamicsDayCount = periodDays;
  if (isAllTime) {
    const earliestMs = events.length
      ? Math.min(...events.map(event => new Date(event.created_at).getTime()))
      : now;
    dynamicsDayCount = Math.min(MAX_DYNAMICS_DAYS, Math.max(1, Math.ceil((now - earliestMs) / DAY_MS) + 1));
  }
  const days_ = [];
  for (let i = dynamicsDayCount - 1; i >= 0; i -= 1) {
    days_.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10));
  }
  const topEmployees = employeeRanking.slice(0, 4);
  const dailyDynamics = {
    days: days_,
    series: topEmployees.map(row => ({
      employee_id: row.employee_id,
      full_name: row.full_name,
      points: days_.map(dayKey => percentAsOf(row.employee_id, new Date(`${dayKey}T23:59:59.999Z`).getTime()))
    }))
  };

  // "Yangi funksiyalar" — faqat tanlangan davr ichida chiqqan (periodEvents),
  // butun tarixdagi hodisalar emas.
  const quadrantPoints = periodEvents.map(event => {
    const learnedCount = employees.filter(employee => Boolean(progressFor(record, event.id, employee.id).learned_at)).length;
    return {
      event_id: event.id,
      submodule_name: event.submodule_name,
      module_name: event.module_name,
      created_at: event.created_at,
      percent: employees.length ? Math.round((learnedCount / employees.length) * 100) : 0
    };
  });

  const functionStatus = periodEvents.map(event => {
    const notLearnedCount = employees.filter(employee => !progressFor(record, event.id, employee.id).learned_at).length;
    return {
      event_id: event.id,
      submodule_name: event.submodule_name,
      module_name: event.module_name,
      created_at: event.created_at,
      not_learned_count: notLearnedCount,
      days_since_launch: Math.floor((now - new Date(event.created_at).getTime()) / DAY_MS)
    };
  }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return {
    kpis: {
      avg_knowledge_pct: avgKnowledgePct,
      avg_knowledge_change_pct: avgKnowledgeChangePct,
      employees_total: employees.length,
      employees_new: newEmployeesCount,
      new_functions_period: periodEvents.length,
      new_functions_learned_period: periodFullyLearnedCount,
      donut
    },
    module_bars: moduleBars,
    employee_ranking: employeeRanking,
    daily_dynamics: dailyDynamics,
    quadrant_points: quadrantPoints,
    function_status: functionStatus,
    period_days: isAllTime ? 'all' : periodDays
  };
}

async function getModuleFunctionsDetail(moduleName) {
  if (!moduleName) throw new Error('module_name majburiy');
  const [employees, record, permissionRecord, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getPermissionView(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, { modules: permissionRecord.modules }, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const now = Date.now();
  const targetModuleName = canonicalModuleName(moduleName);

  // Ro'yxat endi checkbox/hodisa bilan cheklanmaydi — shu modulga tegishli
  // BARCHA funksiyalar daraxtdan olinadi ("Kontragent balansi" ham
  // "Kontragent"ga birlashadi). Hodisasi (yuborilgan sanasi) bo'lmagan
  // funksiya ham ro'yxatda ko'rinadi, faqat sanasi/o'rganish holati bo'sh
  // chiqadi.
  const treeSubmodules = (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : [])
    .filter(module => canonicalModuleName(module.name || module.key) === targetModuleName)
    .flatMap(module => module.submodules || []);

  const moduleEvents = record.events.filter(event => canonicalModuleName(event.module_name) === targetModuleName);
  const eventBySubmoduleKey = new Map(moduleEvents.map(event => [String(event.submodule_key), event]));
  // Daraxtda endi yo'q-u, avval hodisasi yaratilgan (masalan olib tashlangan)
  // funksiyalar ham ro'yxatdan tushib qolmasin.
  const extraEvents = moduleEvents.filter(event => !treeSubmodules.some(sub => String(sub.key) === String(event.submodule_key)));

  // "O'rganilgan/Jarayonda/Boshlanmagan fichalar" — donut hisoblagichi bilan
  // bir xil qoida (getKnowledgeDashboard'dagi kabi): barcha faol support
  // tasdiqlagan — o'rganilgan; kamida bittasi o'rgangan-u hammasi
  // tasdiqlamagan — jarayonda; hodisasi yo'q yoki hech kim tegmagan —
  // boshlanmagan.
  let learnedTotal = 0;
  let inProgressTotal = 0;
  let notStartedTotal = 0;

  // Ichki "actions" soniga qarab og'irlashtirish (getKnowledgeDashboard'dagi
  // bilan bir xil qoida) — actions ma'lumoti yo'q bo'lsa kamida 1.
  function submoduleWeight(sub = {}) {
    return Array.isArray(sub.actions) && sub.actions.length ? sub.actions.length : 1;
  }

  function buildFunctionRow(submoduleKey, submoduleName, fallbackCreatedAt, weight = 1) {
    const event = eventBySubmoduleKey.get(String(submoduleKey)) || null;
    const learnedEmployees = [];
    const notLearnedEmployees = [];
    employees.forEach(employee => {
      const progress = event ? progressFor(record, event.id, employee.id) : {};
      const row = {
        id: employee.id,
        full_name: employee.full_name || employee.username || 'Xodim',
        tg_user_id: employee.tg_user_id || null,
        has_avatar: !!employee.avatar_path,
        learned_at: progress.learned_at || null
      };
      if (progress.learned_at) learnedEmployees.push(row);
      else notLearnedEmployees.push(row);
    });

    const confirmedByAll = Boolean(event) && employees.length > 0
      && employees.every(employee => Boolean(progressFor(record, event.id, employee.id).confirmed_at));
    if (confirmedByAll) learnedTotal += weight;
    else if (learnedEmployees.length > 0) inProgressTotal += weight;
    else notStartedTotal += weight;

    const createdAt = event ? event.created_at : (fallbackCreatedAt || null);
    return {
      event_id: event ? event.id : `pending-${submoduleKey}`,
      submodule_name: submoduleName,
      created_at: createdAt,
      days_since_launch: createdAt ? Math.floor((now - new Date(createdAt).getTime()) / DAY_MS) : null,
      learned_employees: learnedEmployees,
      not_learned_employees: notLearnedEmployees
    };
  }

  const functions = [
    ...treeSubmodules.map(sub => ({
      ...buildFunctionRow(sub.key, sub.name || sub.key, null, submoduleWeight(sub)),
      actions: Array.isArray(sub.actions) ? sub.actions : []
    })),
    ...extraEvents.map(event => buildFunctionRow(event.submodule_key, event.submodule_name, event.created_at, 1))
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const learnDurations = [];
  moduleEvents.forEach(event => {
    employees.forEach(employee => {
      const progress = progressFor(record, event.id, employee.id);
      if (!progress.learned_at) return;
      const durationDays = (new Date(progress.learned_at).getTime() - new Date(event.created_at).getTime()) / DAY_MS;
      if (Number.isFinite(durationDays) && durationDays >= 0) learnDurations.push(durationDays);
    });
  });
  const avgDaysToLearn = learnDurations.length
    ? Math.round((learnDurations.reduce((sum, value) => sum + value, 0) / learnDurations.length) * 10) / 10
    : 0;

  return {
    module_name: moduleName,
    total_functions: learnedTotal + inProgressTotal + notStartedTotal,
    learned_total: learnedTotal,
    in_progress_total: inProgressTotal,
    not_started_total: notStartedTotal,
    avg_days_to_learn: avgDaysToLearn,
    functions
  };
}

const FUNCTION_STATUS_LABELS = {
  learned: 'O‘rganilgan funksiyalar',
  in_progress: 'Jarayondagi funksiyalar',
  not_started: 'Boshlanmagan funksiyalar'
};

// Bosh sahifadagi "O'rganilgan/Jarayondagi/Boshlanmagan funksiyalar"
// kartochkalari bosilganda — aynan shu holatga tushgan funksiyalarning
// to'liq ro'yxati (barcha modullar bo'ylab). Sinf getKnowledgeDashboard'dagi
// donut hisoblagichi bilan bir xil qoida asosida aniqlanadi.
async function getFunctionsByLearningStatus(status) {
  if (!FUNCTION_STATUS_LABELS[status]) throw new Error('Noto‘g‘ri holat: ' + status);
  const [employees, record, permissionRecord, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getPermissionView(),
    getActionLearnedRecord()
  ]);
  if (repairEventStatusFromActionProgress(record, { modules: permissionRecord.modules }, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const now = Date.now();
  const eventBySubmoduleKey = new Map(record.events.map(event => [String(event.submodule_key), event]));

  const rows = [];
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    const moduleName = canonicalModuleName(module.name || module.key);
    (module.submodules || []).forEach(submodule => {
      const event = eventBySubmoduleKey.get(String(submodule.key)) || null;
      const learnedEmployees = [];
      const notLearnedEmployees = [];
      employees.forEach(employee => {
        const progress = event ? progressFor(record, event.id, employee.id) : {};
        const row = {
          id: employee.id,
          full_name: employee.full_name || employee.username || 'Xodim',
          tg_user_id: employee.tg_user_id || null,
          has_avatar: !!employee.avatar_path,
          learned_at: progress.learned_at || null
        };
        if (progress.learned_at) learnedEmployees.push(row);
        else notLearnedEmployees.push(row);
      });

      const confirmedByAll = Boolean(event) && employees.length > 0
        && employees.every(employee => Boolean(progressFor(record, event.id, employee.id).confirmed_at));
      const rowStatus = confirmedByAll ? 'learned' : (learnedEmployees.length > 0 ? 'in_progress' : 'not_started');
      if (rowStatus !== status) return;

      const createdAt = event ? event.created_at : null;
      rows.push({
        event_id: event ? event.id : `pending-${submodule.key}`,
        module_name: moduleName,
        submodule_name: submodule.name || submodule.key,
        created_at: createdAt,
        days_since_launch: createdAt ? Math.floor((now - new Date(createdAt).getTime()) / DAY_MS) : null,
        learned_employees: learnedEmployees,
        not_learned_employees: notLearnedEmployees,
        actions: Array.isArray(submodule.actions) ? submodule.actions : []
      });
    });
  });

  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  // Umumiy son ham ichki "actions" soniga qarab og'irlashtiriladi — bosh
  // sahifadagi KPI kartochkasidagi son bilan bir xil bo'lishi uchun (u ham
  // shu qoida bilan hisoblanadi).
  const weightedTotal = rows.reduce((sum, row) => sum + (row.actions.length || 1), 0);

  return {
    status,
    title: FUNCTION_STATUS_LABELS[status],
    total: weightedTotal,
    functions: rows
  };
}

async function getEmployeeKnowledgeProfile(employeeId) {
  if (!employeeId) throw new Error('employee_id majburiy');
  const [employees, record, permissionRecord, actionProgress] = await Promise.all([
    getSupportEmployees(),
    getNotificationRecord(),
    getPermissionView(),
    getActionLearnedRecord()
  ]);
  const employee = employees.find(row => String(row.id) === String(employeeId));
  if (!employee) throw new Error('Xodim topilmadi');
  if (repairEventStatusFromActionProgress(record, { modules: permissionRecord.modules }, actionProgress)) {
    await saveNotificationRecord(record);
  }
  const events = record.events;

  // getKnowledgeDashboard'dagi bilan bir xil — ichki "actions" soniga qarab
  // og'irlashtirish, dashboarddagi foizlar bilan mos kelishi uchun.
  const submoduleActionsCountByKey = new Map();
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      const count = Array.isArray(submodule.actions) && submodule.actions.length ? submodule.actions.length : 1;
      submoduleActionsCountByKey.set(String(submodule.key), count);
    });
  });
  function actionsCountFor(key) {
    return submoduleActionsCountByKey.get(String(key)) || 1;
  }

  // "O'rganilgan/Jarayondagi/Boshlanmagan funksiyalar" KPI kartochkalari —
  // getKnowledgeDashboard'dagi jamoaviy donut bilan BIR XIL qoida: butun
  // modul daraxti asos qilinadi (hali hodisasi yo'q submodule ham
  // "boshlanmagan"ga kiradi), tasdiqlangan — o'rganilgan, o'rganilgan-u
  // tasdiqlanmagan — jarayonda. Quyidagi HAMMA hisob-kitob (modul foizlari,
  // "O'rganilgan"/"O'rganilmagan" ro'yxatlari) ham shu BIR XIL to'liq
  // to'plamdan foydalanadi — avval ular faqat "events" (bildirishnoma
  // yuborilgan, torroq) to'plamidan hisoblanib, sonlar (masalan 461 o'rniga
  // 80) mos kelmasdi.
  const allSubmoduleKeys = [];
  const submoduleInfoByKey = new Map();
  const actionsBySubmoduleKey = new Map();
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    (module.submodules || []).forEach(submodule => {
      const key = String(submodule.key);
      allSubmoduleKeys.push(key);
      submoduleInfoByKey.set(key, {
        submodule_name: submodule.name || submodule.key,
        module_name: module.name || module.key
      });
      actionsBySubmoduleKey.set(key, submodule.actions || []);
    });
  });
  const eventBySubmoduleKey = new Map(events.map(event => [String(event.submodule_key), event]));

  // Har bir submodule ichidagi action'larning ("Loyiha yaratish" va h.k.)
  // xodim uchun alohida o'rganilgan/tasdiqlangan holatini olish — "O'rganilgan
  // funksiyalar"/"O'rganilmagan funksiyalar" jadvalidagi qatorlarni ochib,
  // ichidagi action'larni ko'rsatish uchun (getSupportEventHistory bilan
  // bir xil naqsh).
  // getSupportEventHistory'dagi bilan bir xil qoida: agar submodule ichidagi
  // action'larning hech biriga alohida tegilmagan bo'lsa (faqat butun
  // submodule darajasida belgilangan bo'lsa), action'lar submodule'ning
  // o'z (progress) holatini meros oladi — aks holda bu yerda ham submodule
  // "O'rganilgan" ro'yxatiga tushib, ichidagi action'lar "o'rganilmagan"
  // bo'lib zid ko'rinardi.
  function actionsForSubmodule(submoduleKey) {
    const rawActions = actionsBySubmoduleKey.get(submoduleKey) || [];
    const event = eventBySubmoduleKey.get(submoduleKey);
    const eventProgress = event ? progressFor(record, event.id, employeeId) : {};
    const eventLearned = Boolean(eventProgress.learned_at);
    const eventConfirmed = Boolean(eventProgress.confirmed_at);
    const anyActionTouched = rawActions.some(action => {
      const key = actionCompositeKey(submoduleKey, String(action.key || action.id));
      return Boolean(actionProgress[key] && actionProgress[key][employeeId]);
    });
    return rawActions.map(action => {
      const compositeKey = actionCompositeKey(submoduleKey, String(action.key || action.id));
      const actionEntry = (actionProgress[compositeKey] && actionProgress[compositeKey][employeeId]) || {};
      const learned = anyActionTouched ? Boolean(actionEntry.learned_at) : eventLearned;
      const confirmed = anyActionTouched ? Boolean(actionEntry.confirmed_at) : eventConfirmed;
      return {
        id: action.id,
        key: action.key,
        name: action.name || action.key,
        learned,
        learned_at: anyActionTouched ? (actionEntry.learned_at || null) : (eventLearned ? eventProgress.learned_at : null),
        confirmed,
        confirmed_at: anyActionTouched ? (actionEntry.confirmed_at || null) : (eventConfirmed ? eventProgress.confirmed_at : null)
      };
    });
  }

  const moduleSubmoduleKeys = new Map();
  (Array.isArray(permissionRecord.modules) ? permissionRecord.modules : []).forEach(module => {
    const moduleName = canonicalModuleName(module.name || module.key);
    if (!moduleName) return;
    const list = moduleSubmoduleKeys.get(moduleName) || [];
    (module.submodules || []).forEach(submodule => list.push(String(submodule.key)));
    moduleSubmoduleKeys.set(moduleName, list);
  });
  const modulePercents = [...moduleSubmoduleKeys.entries()].map(([moduleName, keys]) => {
    let totalWeight = 0;
    let confirmedWeight = 0;
    let eventCount = 0;
    keys.forEach(key => {
      const weight = actionsCountFor(key);
      totalWeight += weight;
      const event = eventBySubmoduleKey.get(key);
      if (!event) return;
      eventCount += 1;
      if (progressFor(record, event.id, employee.id).confirmed_at) confirmedWeight += weight;
    });
    return {
      module_name: moduleName,
      percent: totalWeight ? Math.round((confirmedWeight / totalWeight) * 100) : 0,
      event_count: eventCount
    };
  });

  let donutLearned = 0;
  let donutInProgress = 0;
  let donutNotStarted = 0;
  let donutTotal = 0;
  allSubmoduleKeys.forEach(key => {
    const weight = actionsCountFor(key);
    donutTotal += weight;
    const event = eventBySubmoduleKey.get(key);
    if (!event) {
      donutNotStarted += weight;
      return;
    }
    const progress = progressFor(record, event.id, employee.id);
    if (progress.confirmed_at) donutLearned += weight;
    else if (progress.learned_at) donutInProgress += weight;
    else donutNotStarted += weight;
  });
  const donut = {
    learned_count: donutLearned,
    in_progress_count: donutInProgress,
    not_learned_count: donutNotStarted,
    total_count: donutTotal
  };
  // "Bilim progresi" ham donut bilan BIR XIL (butun modul daraxti, actions
  // og'irligi bilan) asosda hisoblanadi — dashboarddagi "O'rtacha umumiy
  // bilim darajasi" bilan mos kelishi uchun (avval faqat "events" asosida,
  // torroq to'plamdan hisoblanardi va sonlar mos kelmasdi).
  const overallPercent = donutTotal ? Math.round((donutLearned / donutTotal) * 100) : 0;

  // "Jamoa" uchun alohida ustun yo'q — xodim eng ko'p ishlagan (eng ko'p
  // hodisaga ega) moduli asosida chiqariladi.
  const team = modulePercents.slice().sort((a, b) => b.event_count - a.event_count)[0]?.module_name || '';

  // Xodimning umumiy bilim % ko'rsatkichi kunlar kesimida qanday o'zgarib
  // borganini ko'rsatadigan chiziqli grafik uchun — eng birinchi hodisadan
  // bugungacha (ko'pi bilan MAX_DYNAMICS_DAYS kun), har kun uchun "shu kunga
  // qadar chiqqan funksiyalardan qanchasini o'rgangan" foizi hisoblanadi.
  const nowMs = Date.now();
  const earliestEventMs = events.length
    ? Math.min(...events.map(event => new Date(event.created_at).getTime()))
    : nowMs;
  const progressDayCount = Math.min(MAX_DYNAMICS_DAYS, Math.max(1, Math.ceil((nowMs - earliestEventMs) / DAY_MS) + 1));
  const progressDays = [];
  for (let i = progressDayCount - 1; i >= 0; i -= 1) {
    progressDays.push(new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10));
  }
  const dailyProgress = progressDays.map(dayKey => {
    const cutoffMs = new Date(`${dayKey}T23:59:59.999Z`).getTime();
    const relevant = events.filter(event => new Date(event.created_at).getTime() <= cutoffMs);
    let totalWeight = 0;
    let learnedWeight = 0;
    relevant.forEach(event => {
      const weight = actionsCountFor(event.submodule_key);
      totalWeight += weight;
      const progress = progressFor(record, event.id, employee.id);
      if (progress.learned_at && new Date(progress.learned_at).getTime() <= cutoffMs) learnedWeight += weight;
    });
    return { date: dayKey, percent: totalWeight ? Math.round((learnedWeight / totalWeight) * 100) : 0 };
  });

  // "Biladigan"/"Bilmaydigan" ro'yxatlari — BUTUN modul daraxti bo'yicha,
  // donut bilan bir xil "tasdiqlangan" mezoni bilan: faqat confirmed_at
  // bo'lgan submodule "O'rganilgan"ga kiradi, qolgani ("jarayonda" va hali
  // umuman tegilmagan) — "O'rganilmagan"ga.
  const learnedFunctions = [];
  const notLearnedFunctions = [];
  allSubmoduleKeys.forEach(key => {
    const info = submoduleInfoByKey.get(key) || { submodule_name: key, module_name: '' };
    const event = eventBySubmoduleKey.get(key);
    const progress = event ? progressFor(record, event.id, employee.id) : {};
    if (progress.confirmed_at) {
      const daysToLearn = event ? (new Date(progress.confirmed_at).getTime() - new Date(event.created_at).getTime()) / DAY_MS : null;
      learnedFunctions.push({
        submodule_name: info.submodule_name,
        module_name: info.module_name,
        created_at: event ? event.created_at : null,
        learned_at: progress.confirmed_at,
        days_to_learn: Number.isFinite(daysToLearn) ? Math.round(daysToLearn * 10) / 10 : null,
        actions: actionsForSubmodule(key)
      });
    } else {
      notLearnedFunctions.push({
        submodule_name: info.submodule_name,
        module_name: info.module_name,
        created_at: event ? event.created_at : null,
        days_since_launch: event ? Math.floor((Date.now() - new Date(event.created_at).getTime()) / DAY_MS) : null,
        actions: actionsForSubmodule(key)
      });
    }
  });

  return {
    employee: {
      id: employee.id,
      full_name: employee.full_name || employee.username || 'Xodim',
      username: employee.username || '',
      role: employee.role || 'support',
      created_at: employee.created_at || null,
      team
    },
    overall_percent: overallPercent,
    donut,
    module_percents: modulePercents,
    daily_progress: dailyProgress,
    learned_functions: learnedFunctions.sort((a, b) => String(b.learned_at || '').localeCompare(String(a.learned_at || ''))),
    not_learned_functions: notLearnedFunctions.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  };
}

module.exports = {
  fetchPermissionView,
  getPermissionView,
  savePermissionSelection,
  getSupportOverview,
  getSupportEventHistory,
  listNotificationEvents,
  getEventLearningStatus,
  setEventLearned,
  setEventsLearnedBatch,
  getManagerReviewQueue,
  setManagerConfirmation,
  setManagerConfirmationBatch,
  getManagerConfirmers,
  saveManagerConfirmers,
  getManagerEmployees,
  resetPermissionNotifications,
  getKnowledgeDashboard,
  getModuleFunctionsDetail,
  getFunctionsByLearningStatus,
  getEmployeeKnowledgeProfile,
  sendPermissionActions,
  setActionLearned,
  setActionsLearnedBatch,
  setActionConfirmed,
  setActionsConfirmedBatch
};
