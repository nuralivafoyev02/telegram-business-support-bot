<template>
  <main v-if="!token" class="login-screen">
    <section class="card login-card">
      <div class="logo">UQ</div>
      <h1>Uyqur Support</h1>
      <p>Texnik yordam paneli</p>
      <form class="form" @submit.prevent="submitLogin">
        <label class="label">Login
          <input v-model.trim="loginForm.username" class="input" autocomplete="username" placeholder="admin"
            :disabled="loadingAction === 'login'" @input="clearLoginFeedback" />
        </label>
        <label class="label">Parol
          <span class="password-field">
            <input v-model="loginForm.password" class="input" :type="showLoginPassword ? 'text' : 'password'"
              autocomplete="current-password" placeholder="••••••••" :disabled="loadingAction === 'login'"
              @input="clearLoginFeedback" />
            <button class="password-toggle" type="button" :disabled="loadingAction === 'login'"
              @click="showLoginPassword = !showLoginPassword">
              {{ showLoginPassword ? 'Yashirish' : 'Ko‘rsatish' }}
            </button>
          </span>
        </label>
        <Transition name="fade">
          <div v-if="loginFeedback" class="login-status"
            :class="{ error: !!loginError, success: loginStatusType === 'success' }" role="status" aria-live="polite">
            {{ loginFeedback }}
          </div>
        </Transition>
        <button class="btn primary" :disabled="loadingAction === 'login'">{{ loginButtonText }}</button>
      </form>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">UQ</div>
        <div>
          <div class="brand-title">Uyqur Support</div>
          <div class="brand-subtitle">Texnik yordam paneli</div>
        </div>
      </div>

      <nav class="nav">
        <button v-for="item in primaryTabs" :key="item.key" :class="{ active: activeTab === item.key }"
          @click="setTab(item.key)">
          <span>{{ item.icon }}</span>
          <b>{{ item.label }}</b>
        </button>
      </nav>

      <nav class="nav nav-bottom">
        <button :class="{ active: activeTab === settingsTab.key }" @click="setTab(settingsTab.key)">
          <span>{{ settingsTab.icon }}</span>
          <b>{{ settingsTab.label }}</b>
        </button>
      </nav>
    </aside>

    <section class="main">
      <header class="topbar">
        <div class="page-title">
          <h1>{{ currentTitle }}</h1>
        </div>
        <TransitionGroup name="action-pop" tag="div" class="actions">
          <button key="refresh" class="btn" :disabled="loadingAction === 'refresh'" @click="refresh">{{ loadingAction
            === 'refresh' ? 'Yangilanmoqda...' : 'Yangilash' }}</button>
          <button v-if="activeTab === 'stats'" key="mainStats" class="btn" :disabled="loadingAction === 'mainStats'"
            @click="sendMainStats">{{ loadingAction === 'mainStats' ? 'Yuborilmoqda...' : 'Statistika yuborish'
            }}</button>
          <button key="broadcast" class="btn primary" @click="openBroadcast">Umumiy xabar</button>
          <button key="logout" class="btn danger" @click="logout">Chiqish</button>
        </TransitionGroup>
      </header>

      <Transition name="page-shift" mode="out-in">
        <div class="page-body" :key="activeTab">
          <template v-if="activeTab === 'stats'">
            <div class="stats-controls">
              <div class="segmented" role="group" aria-label="Statistika davri">
                <button v-for="period in periodOptions" :key="period.key"
                  :class="{ active: selectedStatsPeriod === period.key }" type="button"
                  @click="selectedStatsPeriod = period.key">
                  {{ period.label }}
                </button>
              </div>
            </div>

            <div class="grid cards">
              <article class="card metric">
                <div class="metric-label">{{ selectedPeriodLabel }} so‘rovlari</div>
                <div class="metric-value">{{ fmtNumber(selectedPeriodStats.total_requests) }}</div>
                <div class="metric-mini">Jami ticketlar</div>
              </article>
              <article class="card metric">
                <div class="metric-label">Yopilgan</div>
                <div class="metric-value">{{ fmtNumber(selectedPeriodStats.closed_requests) }}</div>
                <div class="metric-mini">Xodimlar yopgan ticketlar</div>
              </article>
              <article class="card metric">
                <div class="metric-label">Yopilish foizi</div>
                <div class="metric-value">{{ fmtPercent(selectedPeriodStats.close_rate) }}</div>
                <div class="metric-mini">Yopilgan / jami</div>
              </article>
              <article class="card metric">
                <div class="metric-label">Guruhlardan</div>
                <div class="metric-value">{{ fmtNumber(selectedPeriodStats.group_requests) }}</div>
                <div class="metric-mini">Mijozlardan tushgan so‘rovlar</div>
              </article>
              <article class="card metric">
                <div class="metric-label">O‘rtacha yopish</div>
                <div class="metric-value">{{ fmtNumber(selectedPeriodStats.avg_close_minutes) }}</div>
                <div class="metric-mini">Daqiqa</div>
              </article>
            </div>

            <div class="spacer"></div>

            <div class="grid two stats-main-grid">
              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Eng ko‘p ticket yopgan xodimlar</div>
                    <div class="card-note">{{ selectedPeriodLabel }} kesimi</div>
                  </div>
                </div>
                <DataTable :columns="topEmployeeColumns" :rows="topEmployeeRows" empty="Bu davrda yopilgan ticket yo‘q">
                  <template #employeeShare="{ row }">
                    <MetricBar :value="row.close_share_pct" />
                  </template>
                </DataTable>
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Davrlar kesimi</div>
                    <div class="card-note">Bugun, hafta, oy va jami holat</div>
                  </div>
                </div>
                <DataTable :columns="periodColumns" :rows="periodRows" empty="Statistika yo‘q">
                  <template #periodClose="{ row }">
                    <MetricBar :value="row.close_rate" />
                  </template>
                </DataTable>
              </section>
            </div>

            <div class="spacer"></div>

            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Guruhlar bo‘yicha mijoz so‘rovlari</div>
                  <div class="card-note">Jami so‘rov, ochiq ticket va yopilish foizi</div>
                </div>
              </div>
              <DataTable :columns="groupPerformanceColumns" :rows="groupPerformanceRows"
                empty="Bu davrda guruhlardan so‘rov tushmagan">
                <template #groupClose="{ row }">
                  <MetricBar :value="row.close_rate" />
                </template>
              </DataTable>
            </section>

            <div class="spacer"></div>

            <div class="grid two">
              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Xodimlar umumiy statistikasi</div>
                  </div>
                </div>
                <DataTable :columns="employeeStatColumns" :rows="filteredEmployeeStats"
                  empty="Hozircha xodim statistikasi yo‘q" />
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Ochiq so‘rovlar</div>
                  </div>
                </div>
                <DataTable :columns="openRequestColumns" :rows="dashboard.openRequests || []"
                  empty="Ochiq so‘rov yo‘q" />
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'groups'">
            <Toolbar v-model="search" placeholder="Guruh nomi yoki chat ID bo‘yicha qidirish">
              <TransitionGroup name="action-pop" tag="div" class="toolbar-actions">
                <button key="send" class="btn primary" :disabled="!selectedGroups.length"
                  @click="openSelectedMessage('groups')">
                  Belgilanganlarga xabar ({{ selectedGroups.length }})
                </button>
                <button v-if="selectedGroups.length" key="clear" class="btn" @click="clearSelection('groups')">Tanlovni
                  tozalash</button>
              </TransitionGroup>
            </Toolbar>
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Guruhlar ro‘yxati</div>
                </div>
              </div>
              <DataTable :columns="groupColumns" :rows="filteredGroups" empty="Guruh topilmadi">
                <template #select="{ row }">
                  <input class="row-check" type="checkbox" :checked="isGroupSelected(row)"
                    @change="toggleGroup(row, $event.target.checked)" />
                </template>
                <template #actions="{ row }">
                  <button class="btn small" @click="openSend(row)">Xabar</button>
                  <button class="btn small" @click="loadRequests(row)">So‘rovlar</button>
                  <button class="btn small danger" :disabled="deletingGroupId === String(row.chat_id)"
                    @click="deleteGroup(row)">{{ deletingGroupId === String(row.chat_id) ? 'O‘chirilmoqda...' :
                    'O‘chirish' }}</button>
                </template>
              </DataTable>
            </section>
          </template>

          <template v-if="activeTab === 'privates'">
            <Toolbar v-model="search" placeholder="Shaxsiy chat nomi yoki chat ID bo‘yicha qidirish" />
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Chatlar</div>
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

          <template v-if="activeTab === 'employees'">
            <div class="toolbar">
              <input v-model="search" class="search"
                placeholder="Xodim ismi, username yoki Telegram ID bo‘yicha qidirish" />
              <TransitionGroup name="action-pop" tag="div" class="toolbar-actions">
                <button key="send" class="btn primary" :disabled="!selectedEmployees.length"
                  @click="openSelectedMessage('employees')">
                  Belgilanganlarga xabar ({{ selectedEmployees.length }})
                </button>
                <button v-if="selectedEmployees.length" key="clear" class="btn"
                  @click="clearSelection('employees')">Tanlovni tozalash</button>
                <button key="new" class="btn primary" @click="openEmployee()">+ Xodim</button>
              </TransitionGroup>
            </div>
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Xodimlar</div>
                </div>
              </div>
              <DataTable :columns="employeeColumns" :rows="filteredEmployees" empty="Xodim topilmadi">
                <template #select="{ row }">
                  <input class="row-check" type="checkbox" :checked="isEmployeeSelected(row)"
                    @change="toggleEmployee(row, $event.target.checked)" />
                </template>
                <template #actions="{ row }">
                  <button class="btn small" @click="openEmployee(row)">Tahrirlash</button>
                  <button class="btn small" @click="openEmployeeMessage(row)">Yozish</button>
                </template>
              </DataTable>
            </section>
          </template>

          <template v-if="activeTab === 'settings'">
            <div class="settings-stack">
              <section class="card pad settings-card">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Admin profili</div>
                  </div>
                </div>
                <form class="form settings-form" @submit.prevent="saveAdmin">
                  <label class="label">Login
                    <input v-model.trim="adminForm.username" class="input" placeholder="admin" />
                  </label>
                  <label class="label">Ism
                    <input v-model.trim="adminForm.full_name" class="input" placeholder="System Admin" />
                  </label>
                  <label class="label">Yangi parol
                    <input v-model="adminForm.new_password" class="input" type="password"
                      placeholder="Bo‘sh qoldirilsa o‘zgarmaydi" />
                  </label>
                  <button class="btn primary" :disabled="loadingAction === 'saveAdmin'">{{ loadingAction === 'saveAdmin'
                    ? 'Saqlamoqda...' : 'Saqlash' }}</button>
                </form>
              </section>

              <section class="card pad settings-card">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Bot sozlamalari</div>
                  </div>
                </div>
                <form class="form settings-form" @submit.prevent="saveSettings">
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
                  <button class="btn primary" :disabled="loadingAction === 'saveSettings'">{{ loadingAction ===
                    'saveSettings' ? 'Saqlamoqda...' : 'Sozlamani saqlash' }}</button>
                </form>
                <div class="webhook-panel">
                  <div>
                    <div class="card-title">Telegram webhook</div>
                  </div>
                  <div class="actions webhook-actions">
                    <button class="btn" :disabled="loadingAction === 'webhookInfo'" @click="checkTelegramWebhook">{{
                      loadingAction === 'webhookInfo' ? 'Tekshirilmoqda...' : 'Holatni ko‘rish' }}</button>
                    <button class="btn primary" :disabled="loadingAction === 'webhookConnect'"
                      @click="reconnectTelegramWebhook">{{ loadingAction === 'webhookConnect' ? 'Ulanmoqda...' :
                      'Webhookni ulash' }}</button>
                  </div>
                </div>
                <Transition name="fade">
                  <pre v-if="webhookStatusText" class="webhook-status">{{ webhookStatusText }}</pre>
                </Transition>
              </section>
            </div>
          </template>
        </div>
      </Transition>
    </section>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'send'" title="Xabar yuborish" @close="closeModal">
        <form class="form" @submit.prevent="sendSingleMessage">
          <label class="label">Chat
            <input class="input"
              :value="selectedTarget?.title || selectedTarget?.name || selectedTarget?.chat_id || 'Tanlanmagan'"
              disabled />
          </label>
          <label class="label">Xabar matni
            <textarea v-model="messageForm.text" class="textarea" placeholder="Xabar matnini kiriting..."></textarea>
          </label>
          <button class="btn primary" :disabled="loadingAction === 'sendSingle'">{{ loadingAction === 'sendSingle' ?
            'Yuborilmoqda...' : 'Yuborish' }}</button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'broadcast'" title="Ommaviy xabar" @close="closeModal">
        <form class="form" @submit.prevent="sendBroadcast">
          <label class="label">Qabul qiluvchi
            <select v-model="broadcastForm.target_type" class="select">
              <option value="groups">Barcha guruhlar</option>
              <option value="privates">Shaxsiy chatlar</option>
              <option value="all">Hammasi</option>
            </select>
          </label>
          <label class="label">Sarlavha
            <input v-model.trim="broadcastForm.title" class="input" placeholder="Yangilik" />
          </label>
          <label class="label">Xabar
            <textarea v-model="broadcastForm.text" class="textarea" placeholder="Yuboriladigan xabar..."></textarea>
          </label>
          <button class="btn primary" :disabled="loadingAction === 'broadcast'">{{ loadingAction === 'broadcast' ?
            'Yuborilmoqda...' : 'Yuborish' }}</button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employee'" title="Xodim" @close="closeModal">
        <form class="form two" @submit.prevent="saveEmployee">
          <label class="label">Ism
            <input v-model.trim="employeeForm.full_name" class="input" placeholder="Xodim ismi" />
          </label>
          <label class="label">Telegram ID
            <input v-model.trim="employeeForm.tg_user_id" class="input" placeholder="123456789" />
          </label>
          <label class="label">Username
            <input v-model.trim="employeeForm.username" class="input" placeholder="username" />
          </label>
          <label class="label">Telefon
            <input v-model.trim="employeeForm.phone" class="input" placeholder="+998..." />
          </label>
          <label class="label">Rol
            <select v-model="employeeForm.role" class="select">
              <option value="support">Texnik yordam</option>
              <option value="manager">Menejer</option>
              <option value="owner">Ega</option>
            </select>
          </label>
          <label class="label">Status
            <select v-model="employeeForm.is_active" class="select">
              <option :value="true">Aktiv</option>
              <option :value="false">O‘chiq</option>
            </select>
          </label>
          <button class="btn primary" style="grid-column: 1 / -1" :disabled="loadingAction === 'saveEmployee'">{{
            loadingAction === 'saveEmployee' ? 'Saqlamoqda...' : 'Saqlash' }}</button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employeeSend'" title="Xodimga yozish" @close="closeModal">
        <form class="form" @submit.prevent="sendEmployeeMessage">
          <label class="label">Xodim
            <input class="input"
              :value="selectedTarget?.full_name || selectedTarget?.username || selectedTarget?.tg_user_id || 'Tanlanmagan'"
              disabled />
          </label>
          <label class="label">Xabar matni
            <textarea v-model="messageForm.text" class="textarea"
              placeholder="Xodimga yuboriladigan xabar..."></textarea>
          </label>
          <button class="btn primary" :disabled="loadingAction === 'employeeSend'">{{ loadingAction === 'employeeSend' ?
            'Yuborilmoqda...' : 'Yuborish' }}</button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'selectedSend'" :title="selectedSendTitle" wide @close="closeModal">
        <form class="form" @submit.prevent="sendSelectedMessage">
          <section class="recipient-panel">
            <div class="recipient-head">
              <div>
                <div class="card-title">Qabul qiluvchilar</div>
                <div class="card-note">{{ selectedRecipients.length }} ta tanlangan</div>
              </div>
            </div>
            <TransitionGroup v-if="selectedRecipients.length" name="list-pop" tag="div" class="recipient-list">
              <div v-for="recipient in selectedRecipients" :key="recipientKey(recipient)" class="recipient-row">
                <div>
                  <b>{{ recipientLabel(recipient) }}</b>
                  <span>{{ recipientMeta(recipient) }}</span>
                </div>
                <button class="btn small danger" type="button"
                  @click="removeSelectedRecipient(recipient)">O‘chirish</button>
              </div>
            </TransitionGroup>
            <div v-else class="empty compact">Qabul qiluvchi tanlanmagan</div>
          </section>
          <label class="label">Xabar matni
            <textarea v-model="messageForm.text" class="textarea"
              placeholder="Tanlanganlarga yuboriladigan xabar..."></textarea>
          </label>
          <button class="btn primary" :disabled="loadingAction === 'selectedSend' || !selectedRecipients.length">
            {{ loadingAction === 'selectedSend' ? 'Yuborilmoqda...' : 'Tanlanganlarga yuborish' }}
          </button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'requests'" title="So‘rovlar tarixi" wide @close="closeModal">
        <DataTable :columns="requestColumns" :rows="requestRows" empty="Bu chatda so‘rovlar yo‘q" />
      </Modal>
    </Transition>

    <Transition name="fade">
      <div v-if="loading" class="app-loader" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span>{{ loadingText }}</span>
      </div>
    </Transition>

    <Transition name="toast-pop">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';
import { api, getToken, setToken } from './api';

const token = ref(getToken());
const activeTab = ref('stats');
const loading = ref(false);
const loadingAction = ref('');
const toast = ref('');
const search = ref('');
const modal = ref('');
const selectedTarget = ref(null);
const deletingGroupId = ref('');
const selectedSendType = ref('groups');
const selectedStatsPeriod = ref('week');
const selectedGroups = ref([]);
const selectedEmployees = ref([]);
const dashboard = reactive({ summary: {}, employeeStats: [], chatStats: [], openRequests: [], analytics: {} });
const groups = ref([]);
const privates = ref([]);
const employees = ref([]);
const requestRows = ref([]);
const settingsRaw = ref({ settings: [], admins: [] });
const webhookStatus = ref(null);
const showLoginPassword = ref(false);
const loginStatus = ref('');
const loginStatusType = ref('');
const loginError = ref('');

const tabs = [
  { key: 'stats', label: 'Statistika', icon: '📊' },
  { key: 'groups', label: 'Guruhlar', icon: '👥' },
  { key: 'privates', label: 'Chatlar', icon: '💬' },
  { key: 'employees', label: 'Xodimlar', icon: '🧑‍💼' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️' }
];
const primaryTabs = computed(() => tabs.filter(tab => tab.key !== 'settings'));
const settingsTab = tabs.find(tab => tab.key === 'settings');

const loginForm = reactive({ username: 'admin', password: '' });
const messageForm = reactive({ text: '' });
const broadcastForm = reactive({ target_type: 'groups', title: 'Yangilik', text: '' });
const employeeForm = reactive({ id: '', tg_user_id: '', full_name: '', username: '', phone: '', role: 'support', is_active: true });
const adminForm = reactive({ username: 'admin', full_name: 'System Admin', new_password: '' });
const settingsForm = reactive({ ai_mode: 'false', done_tag: '#done', main_group_id: '', request_detection: 'keyword' });

const current = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0]);
const currentTitle = computed(() => current.value.label);
const loginFeedback = computed(() => loginError.value || loginStatus.value);
const loginButtonText = computed(() => loadingAction.value === 'login' ? 'Tekshirilmoqda...' : 'Kirish');
const periodOptions = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: 'Hafta' },
  { key: 'month', label: 'Oy' },
  { key: 'all', label: 'Jami' }
];
const emptyPeriodStats = {
  total_requests: 0,
  open_requests: 0,
  closed_requests: 0,
  close_rate: 0,
  avg_close_minutes: 0,
  group_requests: 0,
  private_requests: 0,
  business_requests: 0,
  unique_customers: 0
};
const analytics = computed(() => dashboard.analytics || {});
const selectedPeriodLabel = computed(() => periodOptions.find(period => period.key === selectedStatsPeriod.value)?.label || 'Hafta');
const selectedPeriodStats = computed(() => analytics.value.periods?.[selectedStatsPeriod.value] || emptyPeriodStats);
const topEmployeeRows = computed(() => analytics.value.employeePerformance?.[selectedStatsPeriod.value] || []);
const groupPerformanceRows = computed(() => analytics.value.groupPerformance?.[selectedStatsPeriod.value] || []);
const periodRows = computed(() => periodOptions.map(period => ({
  ...(analytics.value.periods?.[period.key] || emptyPeriodStats),
  period_label: period.label
})));
const loadingText = computed(() => ({
  login: 'Kirilmoqda...',
  refresh: 'Yangilanmoqda...',
  tab: 'Yuklanmoqda...',
  sendSingle: 'Yuborilmoqda...',
  broadcast: 'Yuborilmoqda...',
  saveEmployee: 'Saqlamoqda...',
  deleteGroup: 'O‘chirilmoqda...',
  employeeSend: 'Yuborilmoqda...',
  selectedSend: 'Yuborilmoqda...',
  saveAdmin: 'Saqlamoqda...',
  mainStats: 'Yuborilmoqda...',
  webhookInfo: 'Tekshirilmoqda...',
  webhookConnect: 'Ulanmoqda...',
  saveSettings: 'Saqlamoqda...'
}[loadingAction.value] || 'Yuklanmoqda...'));

function startLoading(action) {
  loading.value = true;
  loadingAction.value = action;
}

function stopLoading(action) {
  if (!action || loadingAction.value === action) {
    loading.value = false;
    loadingAction.value = '';
  }
}

function showToast(text) {
  toast.value = text;
  setTimeout(() => { toast.value = ''; }, 5200);
}

function clearLoginFeedback() {
  loginError.value = '';
  if (loginStatusType.value !== 'success') loginStatus.value = '';
  loginStatusType.value = '';
}

function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function fmtNumber(value) {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function fmtPercent(value) {
  return `${fmtNumber(value)}%`;
}

function fmtMinutes(value) {
  return `${fmtNumber(value)} min`;
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

const filteredEmployeeStats = computed(() => (dashboard.employeeStats || []).filter(includesSearch));
const filteredEmployees = computed(() => employees.value.filter(includesSearch));
const filteredGroups = computed(() => groups.value.filter(includesSearch));
const filteredPrivates = computed(() => privates.value.filter(includesSearch));
const selectedRecipients = computed(() => selectedSendType.value === 'employees' ? selectedEmployees.value : selectedGroups.value);
const selectedSendTitle = computed(() => selectedSendType.value === 'employees' ? 'Xodimlarga xabar yuborish' : 'Guruhlarga xabar yuborish');

const employeeStatColumns = [
  { key: 'full_name', label: 'Xodim' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—' },
  { key: 'received_requests', label: 'Qabul' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'avg_close_minutes', label: 'O‘rt. daqiqa', format: fmtMinutes },
  { key: 'last_closed_at', label: 'Oxirgi #done', format: fmtDate }
];

const topEmployeeColumns = [
  { key: 'full_name', label: 'Xodim' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—' },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'close_share_pct', label: 'Yopish ulushi', slot: 'employeeShare' },
  { key: 'handled_chats', label: 'Chatlar' },
  { key: 'avg_close_minutes', label: 'O‘rt. vaqt', format: fmtMinutes },
  { key: 'last_closed_at', label: 'Oxirgi yopish', format: fmtDate }
];

const periodColumns = [
  { key: 'period_label', label: 'Davr' },
  { key: 'total_requests', label: 'Jami', format: fmtNumber },
  { key: 'group_requests', label: 'Guruh', format: fmtNumber },
  { key: 'private_requests', label: 'Private', format: fmtNumber },
  { key: 'business_requests', label: 'Business', format: fmtNumber },
  { key: 'closed_requests', label: 'Yopilgan', format: fmtNumber },
  { key: 'close_rate', label: 'Yopilish', slot: 'periodClose' },
  { key: 'avg_close_minutes', label: 'O‘rt. vaqt', format: fmtMinutes }
];

const groupPerformanceColumns = [
  { key: 'title', label: 'Guruh' },
  { key: 'total_requests', label: 'Jami so‘rov', format: fmtNumber },
  { key: 'open_requests', label: 'Ochiq', format: fmtNumber },
  { key: 'closed_requests', label: 'Yopilgan', format: fmtNumber },
  { key: 'close_rate', label: 'Yopilish', slot: 'groupClose' },
  { key: 'unique_customers', label: 'Mijozlar', format: fmtNumber },
  { key: 'last_request_at', label: 'Oxirgi so‘rov', format: fmtDate }
];

const employeeColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'full_name', label: 'Xodim' },
  { key: 'tg_user_id', label: 'Telegram ID', format: v => v || '—' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—' },
  { key: 'role', label: 'Rol', badge: true },
  { key: 'closed_requests', label: 'Yopilgan' },
  { key: 'can_message', label: 'Yozish', format: v => v ? 'Mumkin' : 'Start kerak' },
  { key: 'is_active', label: 'Status', format: v => v ? 'Aktiv' : 'O‘chiq', badge: true },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const openRequestColumns = [
  { key: 'customer_name', label: 'Mijoz' },
  { key: 'source_type', label: 'Manba', badge: true },
  { key: 'initial_text', label: 'Matn', truncate: true },
  { key: 'created_at', label: 'Vaqt', format: fmtDate }
];

const groupColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'title', label: 'Guruh' },
  { key: 'chat_id', label: 'Chat ID' },
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

const requestColumns = [
  { key: 'customer_name', label: 'Mijoz' },
  { key: 'initial_text', label: 'Matn', truncate: true },
  { key: 'status', label: 'Status', badge: true },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate },
  { key: 'closed_at', label: 'Yopilgan', format: fmtDate }
];

async function refresh() {
  startLoading('refresh');
  try {
    if (activeTab.value === 'stats') await loadDashboard();
    if (activeTab.value === 'groups') groups.value = await api.groups();
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'settings') await loadSettings();
  } catch (error) {
    showToast(error.message);
    if (/token/i.test(error.message)) logout();
  } finally {
    stopLoading('refresh');
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
  startLoading('tab');
  try {
    if (activeTab.value === 'stats') await loadDashboard();
    if (activeTab.value === 'groups') groups.value = await api.groups();
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'settings') await loadSettings();
  } catch (error) {
    showToast(error.message);
    if (/token/i.test(error.message)) logout();
  } finally {
    stopLoading('tab');
  }
}

async function submitLogin() {
  loginError.value = '';
  loginStatus.value = '';
  loginStatusType.value = '';
  if (!loginForm.username || !loginForm.password) {
    loginError.value = 'Login va parolni kiriting.';
    return;
  }

  startLoading('login');
  loginStatus.value = 'Login va parol tekshirilmoqda...';
  try {
    const data = await api.login(loginForm.username, loginForm.password);
    loginStatus.value = 'Muvaffaqiyatli. Dashboard yuklanmoqda...';
    loginStatusType.value = 'success';
    token.value = data.token;
    showToast(data.fallback ? 'Kirdingiz. DB admin yarating yoki parolni o‘zgartiring.' : 'Xush kelibsiz!');
    await loadDashboard();
  } catch (error) {
    loginError.value = /login|parol/i.test(error.message)
      ? 'Login yoki parol noto‘g‘ri.'
      : error.message;
  } finally {
    stopLoading('login');
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
  broadcastForm.target_type = 'groups';
  broadcastForm.title = 'Yangilik';
  broadcastForm.text = '';
  modal.value = 'broadcast';
}

function groupKey(row) {
  return String(row?.chat_id || '');
}

function employeeKey(row) {
  return String(row?.id || row?.employee_id || row?.tg_user_id || '');
}

function recipientKey(row) {
  return selectedSendType.value === 'employees' ? employeeKey(row) : groupKey(row);
}

function setSelected(listRef, row, keyFn, checked) {
  const key = keyFn(row);
  if (!key) return;
  if (checked) {
    if (!listRef.value.some(item => keyFn(item) === key)) listRef.value = [...listRef.value, row];
    return;
  }
  listRef.value = listRef.value.filter(item => keyFn(item) !== key);
}

function isGroupSelected(row) {
  return selectedGroups.value.some(item => groupKey(item) === groupKey(row));
}

function isEmployeeSelected(row) {
  return selectedEmployees.value.some(item => employeeKey(item) === employeeKey(row));
}

function toggleGroup(row, checked) {
  setSelected(selectedGroups, row, groupKey, checked);
}

function toggleEmployee(row, checked) {
  setSelected(selectedEmployees, row, employeeKey, checked);
}

function clearSelection(type) {
  if (type === 'employees') selectedEmployees.value = [];
  else selectedGroups.value = [];
}

function openSelectedMessage(type) {
  selectedSendType.value = type;
  if (!selectedRecipients.value.length) return showToast('Kamida bitta qabul qiluvchi tanlang');
  messageForm.text = '';
  modal.value = 'selectedSend';
}

function removeSelectedRecipient(row) {
  if (selectedSendType.value === 'employees') setSelected(selectedEmployees, row, employeeKey, false);
  else setSelected(selectedGroups, row, groupKey, false);
}

function recipientLabel(row) {
  if (selectedSendType.value === 'employees') return row.full_name || row.username || row.tg_user_id || 'Xodim';
  return row.title || row.chat_id || 'Guruh';
}

function recipientMeta(row) {
  if (selectedSendType.value === 'employees') {
    const username = row.username ? `@${row.username}` : '';
    const tgId = row.tg_user_id ? `Telegram ID: ${row.tg_user_id}` : 'Telegram ID ulanmagan';
    return [username, tgId].filter(Boolean).join(' · ');
  }
  return `Chat ID: ${row.chat_id}`;
}

function openEmployee(row = null) {
  Object.assign(employeeForm, {
    id: row?.id || row?.employee_id || '',
    tg_user_id: row?.tg_user_id || '',
    full_name: row?.full_name || '',
    username: row?.username || '',
    phone: row?.phone || '',
    role: row?.role || 'support',
    is_active: row?.is_active ?? true
  });
  modal.value = 'employee';
}

function closeModal() {
  modal.value = '';
  selectedTarget.value = null;
}

async function sendSingleMessage() {
  if (!selectedTarget.value?.chat_id) return showToast('Chat tanlanmagan');
  startLoading('sendSingle');
  try {
    await api.sendMessage({ chat_id: selectedTarget.value.chat_id, text: messageForm.text });
    showToast('Xabar yuborildi');
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('sendSingle');
  }
}

async function sendBroadcast() {
  startLoading('broadcast');
  try {
    const result = await api.broadcast({ ...broadcastForm });
    showToast(`Yuborildi: ${result.sent}/${result.total}`);
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('broadcast');
  }
}

async function saveEmployee() {
  startLoading('saveEmployee');
  try {
    await api.saveEmployee({ ...employeeForm });
    showToast('Xodim saqlandi');
    closeModal();
    employees.value = await api.employees();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('saveEmployee');
  }
}

async function deleteGroup(row) {
  if (!row?.chat_id) return showToast('Guruh tanlanmagan');
  const ok = window.confirm(`${row.title || row.chat_id} guruhini webapp ro‘yxatidan o‘chirasizmi?`);
  if (!ok) return;
  deletingGroupId.value = String(row.chat_id);
  startLoading('deleteGroup');
  try {
    await api.deleteGroup({ chat_id: row.chat_id });
    groups.value = groups.value.filter(group => String(group.chat_id) !== String(row.chat_id));
    selectedGroups.value = selectedGroups.value.filter(group => String(group.chat_id) !== String(row.chat_id));
    showToast('Guruh ro‘yxatdan olib tashlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    deletingGroupId.value = '';
    stopLoading('deleteGroup');
  }
}

function openEmployeeMessage(row) {
  selectedTarget.value = row;
  messageForm.text = '';
  modal.value = 'employeeSend';
}

async function sendEmployeeMessage() {
  if (!selectedTarget.value?.id && !selectedTarget.value?.tg_user_id) return showToast('Xodim tanlanmagan');
  startLoading('employeeSend');
  try {
    const result = await api.sendEmployeeMessage({
      employee_id: selectedTarget.value.id || selectedTarget.value.employee_id,
      tg_user_id: selectedTarget.value.tg_user_id,
      text: messageForm.text
    });
    showToast(`Xabar yuborildi: ${result.via}`);
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('employeeSend');
  }
}

async function sendSelectedMessage() {
  if (!selectedRecipients.value.length) return showToast('Kamida bitta qabul qiluvchi tanlang');
  if (!messageForm.text.trim()) return showToast('Xabar matnini kiriting');
  startLoading('selectedSend');
  try {
    if (selectedSendType.value === 'employees') {
      const result = await api.sendEmployeesMessage({
        employees: selectedEmployees.value.map(employee => ({
          employee_id: employee.id || employee.employee_id,
          tg_user_id: employee.tg_user_id,
          full_name: employee.full_name,
          username: employee.username
        })),
        text: messageForm.text
      });
      showToast(`Yuborildi: ${result.sent}/${result.total}`);
    } else {
      const result = await api.broadcast({
        target_type: 'groups',
        title: 'Tanlangan guruhlarga xabar',
        text: messageForm.text,
        chat_ids: selectedGroups.value.map(group => group.chat_id)
      });
      showToast(`Yuborildi: ${result.sent}/${result.total}`);
    }
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('selectedSend');
  }
}

async function loadRequests(row) {
  selectedTarget.value = row;
  requestRows.value = await api.requests({ chat_id: row.chat_id });
  modal.value = 'requests';
}

async function saveAdmin() {
  startLoading('saveAdmin');
  try {
    await api.saveAdminProfile({ ...adminForm });
    adminForm.new_password = '';
    showToast('Admin profili saqlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('saveAdmin');
  }
}

async function sendMainStats() {
  startLoading('mainStats');
  try {
    const result = await api.sendMainStats({});
    showToast(`Statistika yuborildi: ${result.chat_id}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('mainStats');
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
  if (show) startLoading('webhookInfo');
  try {
    webhookStatus.value = await api.telegramWebhookInfo();
    if (show) showToast('Webhook holati yangilandi');
  } catch (error) {
    if (show) showToast(error.message);
  } finally {
    if (show) stopLoading('webhookInfo');
  }
}

async function reconnectTelegramWebhook() {
  startLoading('webhookConnect');
  try {
    webhookStatus.value = await api.setTelegramWebhook({ app_url: window.location.origin });
    showToast('Webhook qayta ulandi. Endi Telegramda /register yuboring.');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('webhookConnect');
  }
}

async function saveSettings() {
  startLoading('saveSettings');
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
    stopLoading('saveSettings');
  }
}

onMounted(async () => {
  if (token.value) await refresh();
});

const Toolbar = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('div', { class: 'toolbar' }, [
      h('input', {
        class: 'search',
        value: props.modelValue,
        placeholder: props.placeholder,
        onInput: e => emit('update:modelValue', e.target.value)
      }),
      slots.default ? slots.default() : null
    ]);
  }
});

const Modal = defineComponent({
  props: { title: String, wide: Boolean },
  emits: ['close'],
  setup(props, { slots, emit }) {
    return () => h('div', { class: 'modal-backdrop', onClick: () => emit('close') }, [
      h('section', { class: ['modal', props.wide ? 'modal-wide' : ''], onClick: e => e.stopPropagation() }, [
        h('div', { class: 'card-header' }, [
          h('div', { class: 'card-title' }, props.title),
          h('button', { class: 'btn small', onClick: () => emit('close') }, '✕')
        ]),
        h('div', { class: 'modal-body' }, slots.default?.())
      ])
    ]);
  }
});

const MetricBar = defineComponent({
  props: { value: [Number, String] },
  setup(props) {
    return () => {
      const raw = Number(props.value || 0);
      const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
      return h('div', { class: 'metric-bar' }, [
        h('span', { class: 'metric-bar-text' }, fmtPercent(raw)),
        h('span', { class: 'metric-bar-track', 'aria-hidden': 'true' }, [
          h('span', { class: 'metric-bar-fill', style: { width: `${value}%` } })
        ])
      ]);
    };
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
          h('thead', h('tr', props.columns.map(col => h('th', { class: col.key === 'select' ? 'select-cell' : '' }, col.label)))),
          h('tbody', props.rows.map(row => h('tr', props.columns.map(col => h('td', { class: col.key === 'select' ? 'select-cell' : '' }, renderValue(col, row))))))
        ])
        : h('div', { class: 'empty' }, props.empty || 'Ma’lumot yo‘q')
    ]);
  }
});
</script>
