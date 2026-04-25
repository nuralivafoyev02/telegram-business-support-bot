<template>
  <main v-if="!token" class="login-screen">
    <section class="card login-card">
      <div class="logo">BS</div>
      <h1>Business Support Bot</h1>
      <p>Admin panelga kirish uchun login va parolni kiriting.</p>
      <form class="form" @submit.prevent="submitLogin">
        <label class="label">Login
          <input v-model.trim="loginForm.username" class="input" autocomplete="username" placeholder="admin" />
        </label>
        <label class="label">Parol
          <input v-model="loginForm.password" class="input" type="password" autocomplete="current-password" placeholder="••••••••" />
        </label>
        <button class="btn primary" :disabled="loading">Kirish</button>
      </form>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">BS</div>
        <div>
          <div class="brand-title">Support Center</div>
          <div class="brand-subtitle">Telegram Business bot</div>
        </div>
      </div>

      <nav class="nav">
        <button v-for="item in tabs" :key="item.key" :class="{ active: activeTab === item.key }" @click="setTab(item.key)">
          <span>{{ item.icon }}</span>
          <b>{{ item.label }}</b>
        </button>
      </nav>

      <div class="sidebar-footer">
        <b>#done</b> yozilgan xabar so‘rovni yopadi. Guruh va Business chatlar avtomatik webappga tushadi.
      </div>
    </aside>

    <section class="main">
      <header class="topbar">
        <div class="page-title">
          <h1>{{ currentTitle }}</h1>
          <p>{{ currentSubtitle }}</p>
        </div>
        <div class="actions">
          <button class="btn" @click="refresh">Yangilash</button>
          <button v-if="activeTab === 'stats'" class="btn" @click="sendMainStats">Main guruhga statistika</button>
          <button class="btn primary" @click="openBroadcast">Xabar yuborish</button>
          <button class="btn danger" @click="logout">Chiqish</button>
        </div>
      </header>

      <template v-if="activeTab === 'stats'">
        <div class="grid cards">
          <article class="card metric">
            <div class="metric-label">Bugungi so‘rovlar</div>
            <div class="metric-value">{{ summary.total_requests || 0 }}</div>
            <div class="metric-mini">Yangi murojaatlar</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Ochiq so‘rovlar</div>
            <div class="metric-value">{{ summary.open_requests || 0 }}</div>
            <div class="metric-mini">Hali yopilmagan</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Yopilgan</div>
            <div class="metric-value">{{ summary.closed_requests || 0 }}</div>
            <div class="metric-mini">Bugun #done</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Guruhlar</div>
            <div class="metric-value">{{ summary.groups_count || 0 }}</div>
            <div class="metric-mini">Bot qo‘shilgan</div>
          </article>
          <article class="card metric">
            <div class="metric-label">Kompaniyalar</div>
            <div class="metric-value">{{ summary.companies_count || 0 }}</div>
            <div class="metric-mini">Aktiv mijozlar</div>
          </article>
        </div>

        <div class="spacer"></div>

        <div class="grid two">
          <section class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Xodimlar statistikasi</div>
                <div class="card-note">Kim nechta so‘rovni yopgani va o‘rtacha yopish vaqti</div>
              </div>
            </div>
            <DataTable :columns="employeeColumns" :rows="filteredEmployees" empty="Hozircha xodim statistikasi yo‘q" />
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Ochiq so‘rovlar</div>
                <div class="card-note">Eng oxirgi 50 ta aktiv murojaat</div>
              </div>
            </div>
            <DataTable :columns="openRequestColumns" :rows="dashboard.openRequests || []" empty="Ochiq so‘rov yo‘q" />
          </section>
        </div>
      </template>

      <template v-if="activeTab === 'groups'">
        <Toolbar v-model="search" placeholder="Guruh nomi, kompaniya yoki chat ID bo‘yicha qidirish" />
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Guruhlar ro‘yxati</div>
              <div class="card-note">Bot qaysi guruhga qo‘shilsa avtomatik shu yerda ko‘rinadi</div>
            </div>
          </div>
          <DataTable :columns="groupColumns" :rows="filteredGroups" empty="Guruh topilmadi. Bot qo‘shilgan har bir guruhda /register yuboring.">
            <template #actions="{ row }">
              <button class="btn small" @click="openSend(row)">Xabar</button>
              <button class="btn small" @click="loadRequests(row)">So‘rovlar</button>
            </template>
          </DataTable>
        </section>
      </template>

      <template v-if="activeTab === 'privates'">
        <Toolbar v-model="search" placeholder="Shaxsiy chat nomi yoki chat ID bo‘yicha qidirish" />
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Shaxsiy va Business chatlar</div>
              <div class="card-note">Telegram Business orqali kelgan mijoz yozishmalari</div>
            </div>
          </div>
          <DataTable :columns="privateColumns" :rows="filteredPrivates" empty="Shaxsiy chat topilmadi">
            <template #actions="{ row }">
              <button class="btn small" @click="openSend(row)">Yozish</button>
              <button class="btn small" @click="loadRequests(row)">Tarix</button>
            </template>
          </DataTable>
        </section>
      </template>

      <template v-if="activeTab === 'companies'">
        <div class="toolbar">
          <input v-model="search" class="search" placeholder="Kompaniya nomi bo‘yicha qidirish" />
          <button class="btn primary" @click="openCompany()">+ Kompaniya</button>
        </div>
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Kompaniyalar</div>
              <div class="card-note">So‘rov, taklif, user, xodim va guruhlar kesimida</div>
            </div>
          </div>
          <DataTable :columns="companyColumns" :rows="filteredCompanies" empty="Kompaniya topilmadi">
            <template #actions="{ row }">
              <button class="btn small" @click="openCompany(row)">Tahrirlash</button>
              <button class="btn small" @click="openBroadcast(row)">Xabar</button>
            </template>
          </DataTable>
        </section>
      </template>

      <template v-if="activeTab === 'settings'">
        <div class="grid two">
          <section class="card pad">
            <div class="card-title">Admin profili</div>
            <div class="card-note">Login/parol va ismni o‘zgartirish</div>
            <div class="spacer"></div>
            <form class="form" @submit.prevent="saveAdmin">
              <label class="label">Login
                <input v-model.trim="adminForm.username" class="input" placeholder="admin" />
              </label>
              <label class="label">Ism
                <input v-model.trim="adminForm.full_name" class="input" placeholder="System Admin" />
              </label>
              <label class="label">Yangi parol
                <input v-model="adminForm.new_password" class="input" type="password" placeholder="Bo‘sh qoldirilsa o‘zgarmaydi" />
              </label>
              <button class="btn primary">Saqlash</button>
            </form>
          </section>

          <section class="card pad">
            <div class="card-title">Bot sozlamalari</div>
            <div class="card-note">AI mode, #done va aniqlash rejimi</div>
            <div class="spacer"></div>
            <form class="form" @submit.prevent="saveSettings">
              <label class="label">AI mode
                <select v-model="settingsForm.ai_mode" class="select">
                  <option value="false">O‘chiq</option>
                  <option value="true">Yoqilgan</option>
                </select>
              </label>
              <label class="label">Yopish tegi
                <input v-model.trim="settingsForm.done_tag" class="input" placeholder="#done" />
              </label>
              <label class="label">Main guruh chat ID
                <input v-model.trim="settingsForm.main_group_id" class="input" placeholder="-1001234567890" />
              </label>
              <label class="label">So‘rov aniqlash rejimi
                <select v-model="settingsForm.request_detection" class="select">
                  <option value="keyword">Keyword</option>
                  <option value="all_private_keyword_group">Private hammasi, group keyword</option>
                </select>
              </label>
              <button class="btn primary">Sozlamani saqlash</button>
            </form>
            <div class="spacer"></div>
            <div class="card-note">Telegram webhook</div>
            <div class="actions" style="justify-content:flex-start; margin-top: 12px;">
              <button class="btn" :disabled="loading" @click="checkTelegramWebhook">Holatni ko‘rish</button>
              <button class="btn primary" :disabled="loading" @click="reconnectTelegramWebhook">Webhookni ulash</button>
            </div>
            <pre v-if="webhookStatusText" class="webhook-status">{{ webhookStatusText }}</pre>
          </section>
        </div>
      </template>
    </section>

    <Modal v-if="modal === 'send'" title="Xabar yuborish" @close="closeModal">
      <form class="form" @submit.prevent="sendSingleMessage">
        <label class="label">Chat
          <input class="input" :value="selectedTarget?.title || selectedTarget?.name || selectedTarget?.chat_id || 'Tanlanmagan'" disabled />
        </label>
        <label class="label">Xabar matni
          <textarea v-model="messageForm.text" class="textarea" placeholder="Xabar matnini kiriting..."></textarea>
        </label>
        <button class="btn primary" :disabled="loading">Yuborish</button>
      </form>
    </Modal>

    <Modal v-if="modal === 'broadcast'" title="Guruhlarga xabar yuborish" @close="closeModal">
      <form class="form" @submit.prevent="sendBroadcast">
        <label class="label">Target
          <select v-model="broadcastForm.target_type" class="select">
            <option value="groups">Barcha guruhlar</option>
            <option value="privates">Shaxsiy chatlar</option>
            <option value="all">Hammasi</option>
            <option v-if="broadcastForm.company_id" value="company">Tanlangan kompaniya</option>
          </select>
        </label>
        <label class="label">Sarlavha
          <input v-model.trim="broadcastForm.title" class="input" placeholder="Yangilik" />
        </label>
        <label class="label">Xabar
          <textarea v-model="broadcastForm.text" class="textarea" placeholder="Yuboriladigan xabar..."></textarea>
        </label>
        <button class="btn primary" :disabled="loading">Yuborish</button>
      </form>
    </Modal>

    <Modal v-if="modal === 'company'" title="Kompaniya" @close="closeModal">
      <form class="form two" @submit.prevent="saveCompany">
        <label class="label">Nomi
          <input v-model.trim="companyForm.name" class="input" placeholder="Kompaniya nomi" />
        </label>
        <label class="label">Yuridik nomi
          <input v-model.trim="companyForm.legal_name" class="input" placeholder="MChJ / AJ" />
        </label>
        <label class="label">Telefon
          <input v-model.trim="companyForm.phone" class="input" placeholder="+998..." />
        </label>
        <label class="label">Status
          <select v-model="companyForm.is_active" class="select">
            <option :value="true">Aktiv</option>
            <option :value="false">O‘chiq</option>
          </select>
        </label>
        <label class="label" style="grid-column: 1 / -1">Izoh
          <textarea v-model="companyForm.notes" class="textarea" placeholder="Kompaniya haqida qisqa izoh"></textarea>
        </label>
        <button class="btn primary" style="grid-column: 1 / -1" :disabled="loading">Saqlash</button>
      </form>
    </Modal>

    <Modal v-if="modal === 'requests'" title="So‘rovlar tarixi" @close="closeModal">
      <DataTable :columns="requestColumns" :rows="requestRows" empty="Bu chatda so‘rovlar yo‘q" />
    </Modal>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';
import { api, getToken, setToken } from './api';

const token = ref(getToken());
const activeTab = ref('stats');
const loading = ref(false);
const toast = ref('');
const search = ref('');
const modal = ref('');
const selectedTarget = ref(null);
const dashboard = reactive({ summary: {}, employeeStats: [], chatStats: [], companyStats: [], openRequests: [] });
const groups = ref([]);
const privates = ref([]);
const companies = ref([]);
const requestRows = ref([]);
const settingsRaw = ref({ settings: [], admins: [] });
const webhookStatus = ref(null);

const tabs = [
  { key: 'stats', label: 'Statistica', icon: '📊', subtitle: 'Xodimlar va so‘rovlar kesimida umumiy nazorat' },
  { key: 'groups', label: 'Guruhlar', icon: '👥', subtitle: 'Bot qo‘shilgan guruhlar va ulardagi murojaatlar' },
  { key: 'privates', label: 'Shaxsiy chatlar', icon: '💬', subtitle: 'Telegram Business orqali kelgan shaxsiy chatlar' },
  { key: 'companies', label: 'Kompaniyalar', icon: '🏢', subtitle: 'Kompaniya kesimida user, xodim va so‘rov statistikasi' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️', subtitle: 'Admin profili, bot sozlamalari va AI mode' }
];

const loginForm = reactive({ username: 'admin', password: '' });
const messageForm = reactive({ text: '' });
const broadcastForm = reactive({ target_type: 'groups', title: 'Yangilik', text: '', company_id: '' });
const companyForm = reactive({ id: '', name: '', legal_name: '', phone: '', notes: '', is_active: true });
const adminForm = reactive({ username: 'admin', full_name: 'System Admin', new_password: '' });
const settingsForm = reactive({ ai_mode: 'false', done_tag: '#done', main_group_id: '', request_detection: 'keyword' });

const current = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0]);
const currentTitle = computed(() => current.value.label);
const currentSubtitle = computed(() => current.value.subtitle);
const summary = computed(() => dashboard.summary || {});

function showToast(text) {
  toast.value = text;
  setTimeout(() => { toast.value = ''; }, 5200);
}

function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function pct(row) {
  const total = Number(row.total_requests || row.received_requests || 0);
  const closed = Number(row.closed_requests || 0);
  return total ? `${Math.round((closed / total) * 100)}%` : '0%';
}

function includesSearch(row) {
  const q = search.value.toLowerCase().trim();
  if (!q) return true;
  return JSON.stringify(row).toLowerCase().includes(q);
}

const filteredEmployees = computed(() => (dashboard.employeeStats || []).filter(includesSearch));
const filteredGroups = computed(() => groups.value.filter(includesSearch));
const filteredPrivates = computed(() => privates.value.filter(includesSearch));
const filteredCompanies = computed(() => companies.value.filter(includesSearch));

const employeeColumns = [
  { key: 'full_name', label: 'Xodim' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—' },
  { key: 'received_requests', label: 'Qabul' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'avg_close_minutes', label: 'O‘rt. daqiqa', format: v => `${v || 0} min` },
  { key: 'last_closed_at', label: 'Oxirgi #done', format: fmtDate }
];

const openRequestColumns = [
  { key: 'customer_name', label: 'Mijoz' },
  { key: 'source_type', label: 'Manba', badge: true },
  { key: 'initial_text', label: 'Matn', truncate: true },
  { key: 'created_at', label: 'Vaqt', format: fmtDate }
];

const groupColumns = [
  { key: 'title', label: 'Guruh' },
  { key: 'chat_id', label: 'Chat ID' },
  { key: 'company_name', label: 'Kompaniya', format: v => v || '—' },
  { key: 'total_requests', label: 'So‘rov' },
  { key: 'open_requests', label: 'Ochiq' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'progress', label: 'Yopilish', format: (_, row) => pct(row) },
  { key: 'last_message_at', label: 'Aktivlik', format: fmtDate },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const privateColumns = [
  { key: 'title', label: 'Chat' },
  { key: 'source_type', label: 'Tur', badge: true },
  { key: 'total_requests', label: 'So‘rov' },
  { key: 'open_requests', label: 'Ochiq' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'last_message_at', label: 'Oxirgi xabar', format: fmtDate },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const companyColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'chats_count', label: 'Guruh' },
  { key: 'users_count', label: 'User' },
  { key: 'employees_count', label: 'Xodim' },
  { key: 'total_requests', label: 'So‘rov' },
  { key: 'offers_count', label: 'Taklif' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'last_request_at', label: 'Oxirgi', format: fmtDate },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const requestColumns = [
  { key: 'customer_name', label: 'Mijoz' },
  { key: 'initial_text', label: 'Matn', truncate: true },
  { key: 'status', label: 'Status', badge: true },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate },
  { key: 'closed_at', label: 'Yopilgan', format: fmtDate }
];

async function refresh() {
  loading.value = true;
  try {
    if (activeTab.value === 'stats') await loadDashboard();
    if (activeTab.value === 'groups') groups.value = await api.groups();
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'companies') companies.value = await api.companies();
    if (activeTab.value === 'settings') await loadSettings();
  } catch (error) {
    showToast(error.message);
    if (/token/i.test(error.message)) logout();
  } finally {
    loading.value = false;
  }
}

async function loadDashboard() {
  const data = await api.dashboard();
  Object.assign(dashboard, data);
}

async function loadSettings() {
  const data = await api.settings();
  settingsRaw.value = data;
  const admin = data.admins?.[0];
  if (admin) {
    adminForm.username = admin.username || 'admin';
    adminForm.full_name = admin.full_name || 'System Admin';
  }
  const ai = data.settings?.find(s => s.key === 'ai_mode')?.value;
  const done = data.settings?.find(s => s.key === 'done_tag')?.value;
  const mainGroup = data.settings?.find(s => s.key === 'main_group')?.value;
  const detect = data.settings?.find(s => s.key === 'request_detection')?.value;
  settingsForm.ai_mode = String(!!ai?.enabled);
  settingsForm.done_tag = done?.tag || '#done';
  settingsForm.main_group_id = mainGroup?.chat_id || '';
  settingsForm.request_detection = detect?.mode || 'keyword';
  await checkTelegramWebhook(false);
}

async function setTab(key) {
  activeTab.value = key;
  search.value = '';
  await refresh();
}

async function submitLogin() {
  loading.value = true;
  try {
    const data = await api.login(loginForm.username, loginForm.password);
    token.value = data.token;
    showToast(data.fallback ? 'Kirdingiz. DB admin yarating yoki parolni o‘zgartiring.' : 'Xush kelibsiz!');
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

function logout() {
  setToken('');
  token.value = '';
}

function openSend(row) {
  selectedTarget.value = row;
  messageForm.text = '';
  modal.value = 'send';
}

function openBroadcast(row = null) {
  selectedTarget.value = row;
  broadcastForm.target_type = row?.company_id ? 'company' : 'groups';
  broadcastForm.company_id = row?.company_id || '';
  broadcastForm.title = row?.name ? `${row.name} uchun xabar` : 'Yangilik';
  broadcastForm.text = '';
  modal.value = 'broadcast';
}

function openCompany(row = null) {
  Object.assign(companyForm, {
    id: row?.company_id || row?.id || '',
    name: row?.name || '',
    legal_name: row?.legal_name || '',
    phone: row?.phone || '',
    notes: row?.notes || '',
    is_active: row?.is_active ?? true
  });
  modal.value = 'company';
}

function closeModal() {
  modal.value = '';
  selectedTarget.value = null;
}

async function sendSingleMessage() {
  if (!selectedTarget.value?.chat_id) return showToast('Chat tanlanmagan');
  loading.value = true;
  try {
    await api.sendMessage({ chat_id: selectedTarget.value.chat_id, text: messageForm.text });
    showToast('Xabar yuborildi');
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

async function sendBroadcast() {
  loading.value = true;
  try {
    const result = await api.broadcast({ ...broadcastForm });
    showToast(`Yuborildi: ${result.sent}/${result.total}`);
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

async function saveCompany() {
  loading.value = true;
  try {
    await api.saveCompany({ ...companyForm });
    showToast('Kompaniya saqlandi');
    closeModal();
    companies.value = await api.companies();
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadRequests(row) {
  selectedTarget.value = row;
  requestRows.value = await api.requests({ chat_id: row.chat_id });
  modal.value = 'requests';
}

async function saveAdmin() {
  loading.value = true;
  try {
    await api.saveAdminProfile({ ...adminForm });
    adminForm.new_password = '';
    showToast('Admin profili saqlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

async function sendMainStats() {
  loading.value = true;
  try {
    const result = await api.sendMainStats({});
    showToast(`Statistika yuborildi: ${result.chat_id}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

const webhookStatusText = computed(() => {
  if (!webhookStatus.value) return '';
  const info = webhookStatus.value.webhook || webhookStatus.value;
  return [
    `url: ${info.url || '—'}`,
    `pending_update_count: ${info.pending_update_count ?? 0}`,
    `allowed_updates: ${(info.allowed_updates || []).join(', ') || '—'}`,
    `last_error: ${info.last_error_message || '—'}`
  ].join('\n');
});

async function checkTelegramWebhook(show = true) {
  try {
    webhookStatus.value = await api.telegramWebhookInfo();
    if (show) showToast('Webhook holati yangilandi');
  } catch (error) {
    if (show) showToast(error.message);
  }
}

async function reconnectTelegramWebhook() {
  loading.value = true;
  try {
    webhookStatus.value = await api.setTelegramWebhook({ app_url: window.location.origin });
    showToast('Webhook qayta ulandi. Endi Telegramda /register yuboring.');
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  loading.value = true;
  try {
    await api.saveSettings({
      settings: [
        { key: 'ai_mode', value: { enabled: settingsForm.ai_mode === 'true', provider: null } },
        { key: 'done_tag', value: { tag: settingsForm.done_tag, auto_reply: true } },
        { key: 'main_group', value: { chat_id: settingsForm.main_group_id } },
        { key: 'request_detection', value: { mode: settingsForm.request_detection, min_text_length: 10 } }
      ]
    });
    showToast('Sozlamalar saqlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (token.value) await refresh();
});

const Toolbar = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { class: 'toolbar' }, [
      h('input', {
        class: 'search',
        value: props.modelValue,
        placeholder: props.placeholder,
        onInput: e => emit('update:modelValue', e.target.value)
      })
    ]);
  }
});

const Modal = defineComponent({
  props: { title: String },
  emits: ['close'],
  setup(props, { slots, emit }) {
    return () => h('div', { class: 'modal-backdrop', onClick: () => emit('close') }, [
      h('section', { class: 'modal', onClick: e => e.stopPropagation() }, [
        h('div', { class: 'card-header' }, [
          h('div', { class: 'card-title' }, props.title),
          h('button', { class: 'btn small', onClick: () => emit('close') }, '✕')
        ]),
        h('div', { class: 'card pad' }, slots.default?.())
      ])
    ]);
  }
});

const DataTable = defineComponent({
  props: { columns: Array, rows: Array, empty: String },
  setup(props, { slots }) {
    const renderValue = (column, row) => {
      if (column.slot && slots[column.slot]) return slots[column.slot]({ row });
      const value = row[column.key];
      const text = column.format ? column.format(value, row) : (value ?? '—');
      if (column.badge) {
        const klass = String(value).includes('closed') ? 'green' : String(value).includes('open') ? 'orange' : 'blue';
        return h('span', { class: `badge ${klass}` }, text);
      }
      return h('span', { class: column.truncate ? 'truncate' : '' }, text);
    };

    return () => h('div', { class: 'table-wrap' }, [
      props.rows && props.rows.length
        ? h('table', [
            h('thead', h('tr', props.columns.map(col => h('th', col.label)))),
            h('tbody', props.rows.map(row => h('tr', props.columns.map(col => h('td', renderValue(col, row))))))
          ])
        : h('div', { class: 'empty' }, props.empty || 'Ma’lumot yo‘q')
    ]);
  }
});
</script>
