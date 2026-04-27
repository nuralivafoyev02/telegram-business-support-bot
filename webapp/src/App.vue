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

            <div class="stats-charts">
              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Davrlar bo‘yicha ticketlar</div>
                    <div class="card-note">Bugun, hafta, oy va jami kesimi</div>
                  </div>
                </div>
                <div class="chart-bars">
                  <div v-for="row in periodChartRows" :key="row.period_label" class="chart-row">
                    <div class="chart-label">{{ row.period_label }}</div>
                    <div class="chart-track">
                      <span class="chart-fill blue" :style="{ width: barWidth(row.total_requests, periodChartMax) }"></span>
                    </div>
                    <div class="chart-value">{{ fmtNumber(row.total_requests) }}</div>
                  </div>
                </div>
              </section>

              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Manbalar</div>
                    <div class="card-note">{{ selectedPeriodLabel }} bo‘yicha taqsimot</div>
                  </div>
                </div>
                <div class="source-chart">
                  <div class="donut" :style="sourceDonutStyle">
                    <span>{{ fmtNumber(sourceTotal) }}</span>
                  </div>
                  <div class="source-bars">
                    <div v-for="row in sourceChartRows" :key="row.key" class="chart-row compact">
                      <div class="chart-label">
                        <span class="legend-dot" :style="{ background: row.color }"></span>
                        {{ row.label }}
                      </div>
                      <div class="chart-track">
                        <span class="chart-fill" :style="{ width: barWidth(row.value, sourceChartMax), background: row.color }"></span>
                      </div>
                      <div class="chart-value">{{ fmtNumber(row.value) }}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Top xodimlar</div>
                    <div class="card-note">Yopilgan ticketlar bo‘yicha</div>
                  </div>
                </div>
                <div class="chart-bars">
                  <div v-for="row in topEmployeeChartRows" :key="row.employee_id || row.full_name" class="chart-row">
                    <div class="chart-label">{{ row.full_name || 'Xodim' }}</div>
                    <div class="chart-track">
                      <span class="chart-fill green" :style="{ width: barWidth(row.closed_requests, topEmployeeChartMax) }"></span>
                    </div>
                    <div class="chart-value">{{ fmtNumber(row.closed_requests) }}</div>
                  </div>
                  <div v-if="!topEmployeeChartRows.length" class="empty compact">Ma’lumot yo‘q</div>
                </div>
              </section>

              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Faol guruhlar</div>
                    <div class="card-note">Jami so‘rovlar bo‘yicha</div>
                  </div>
                </div>
                <div class="chart-bars">
                  <div v-for="row in groupChartRows" :key="row.chat_id || row.title" class="chart-row">
                    <div class="chart-label">{{ row.title || row.chat_id }}</div>
                    <div class="chart-track">
                      <span class="chart-fill orange" :style="{ width: barWidth(row.total_requests, groupChartMax) }"></span>
                    </div>
                    <div class="chart-value">{{ fmtNumber(row.total_requests) }}</div>
                  </div>
                  <div v-if="!groupChartRows.length" class="empty compact">Ma’lumot yo‘q</div>
                </div>
              </section>
            </div>

            <div class="spacer"></div>

            <div class="stats-table-stack">
              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Eng ko‘p ticket yopgan xodimlar</div>
                    <div class="card-note">{{ selectedPeriodLabel }} kesimi</div>
                  </div>

                </div>
                <DataTable :columns="topEmployeeColumns" :rows="topEmployeeRows" empty="Bu davrda yopilgan ticket yo‘q"
                  :on-cell-action="handleTableCellAction">
                  <template #employeeShare="{ row }">
                    <MetricBar :value="row.close_share_pct" />
                  </template>
                </DataTable>
              </section>
              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Ochiq so‘rovlar</div>
                  </div>
                </div>
                <DataTable :columns="openRequestColumns" :rows="dashboard.openRequests || []"
                  empty="Ochiq so‘rov yo‘q" :on-cell-action="handleTableCellAction" />
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Guruhlar bo‘yicha mijoz so‘rovlari</div>
                    <div class="card-note">Jami so‘rov, ochiq ticket va yopilish foizi</div>
                  </div>
                </div>
                <DataTable :columns="groupPerformanceColumns" :rows="groupPerformanceRows"
                  empty="Bu davrda guruhlardan so‘rov tushmagan" :on-cell-action="handleTableCellAction">
                  <template #groupClose="{ row }">
                    <MetricBar :value="row.close_rate" />
                  </template>
                </DataTable>
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Xodimlar umumiy statistikasi</div>
                  </div>
                </div>
                <DataTable :columns="employeeStatColumns" :rows="filteredEmployeeStats"
                  empty="Hozircha xodim statistikasi yo‘q" :on-cell-action="handleTableCellAction" />
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
              <DataTable :columns="groupColumns" :rows="filteredGroups" empty="Guruh topilmadi"
                :on-cell-action="handleTableCellAction">
                <template #select="{ row }">
                  <input class="row-check" type="checkbox" :checked="isGroupSelected(row)"
                    @change="toggleGroup(row, $event.target.checked)" />
                </template>
                <template #actions="{ row }">
                  <button class="btn small" @click="openTelegramChat(row)">Telegram</button>
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
              <DataTable :columns="privateColumns" :rows="filteredPrivates" empty="Shaxsiy chat topilmadi"
                :on-cell-action="handleTableCellAction">
                <template #actions="{ row }">
                  <button class="btn small" @click="openTelegramChat(row)">Telegram</button>
                  <button class="btn small" @click="openSend(row)">Yozish</button>
                  <button class="btn small" @click="loadChatDetail(row)">Tafsilot</button>
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
              <DataTable :columns="employeeColumns" :rows="filteredEmployees" empty="Xodim topilmadi"
                :on-cell-action="handleTableCellAction">
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
                      <option value="true">Local smart</option>
                      <option value="model" :disabled="!aiIntegrationReady">{{ aiModelOptionLabel }}</option>
                    </select>
                  </label>
                  <label class="label">Avto javob
                    <select v-model="settingsForm.auto_reply" class="select">
                      <option value="false">O‘chiq</option>
                      <option value="true">AI yoki bot</option>
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

          <template v-if="activeTab === 'integrations'">
            <div class="settings-stack integration-stack">
              <section class="card pad settings-card">
                <div class="settings-head">
                  <div>
                    <div class="card-title">AI integratsiya</div>
                  </div>
                  <span class="status-pill" :class="{ ready: aiIntegrationReady }">{{ aiIntegrationStatus }}</span>
                </div>
                <form class="form settings-form integration-form" @submit.prevent="saveIntegration">
                  <label class="label">Provider
                    <select v-model="integrationForm.provider" class="select">
                      <option value="openai_compatible">OpenAI-compatible</option>
                    </select>
                  </label>
                  <label class="label">Model label
                    <input v-model.trim="integrationForm.label" class="input" placeholder="Uyqur AI" />
                  </label>
                  <label class="label">Base URL
                    <input v-model.trim="integrationForm.base_url" class="input"
                      placeholder="https://api.openai.com/v1" />
                  </label>
                  <label class="label">Model
                    <input v-model.trim="integrationForm.model" class="input" placeholder="gpt-4o-mini" />
                  </label>
                  <label class="label">API token
                    <input v-model="integrationForm.api_key" class="input" type="password"
                      :placeholder="integrationForm.has_api_key ? 'Saqlangan tokenni almashtirish' : 'sk-...'" />
                  </label>
                  <label class="label">Holat
                    <select v-model="integrationForm.enabled" class="select">
                      <option :value="true">Aktiv</option>
                      <option :value="false">O‘chiq</option>
                    </select>
                  </label>
                  <label class="label wide">System prompt
                    <textarea v-model="integrationForm.system_prompt" class="textarea tall"></textarea>
                  </label>
                  <label class="label wide">Bilim bazasi
                    <textarea v-model="integrationForm.knowledge_text" class="textarea tall"
                      placeholder="Uyqur dasturi bo‘yicha ichki qo‘llanma va tushuntirishlar..."></textarea>
                  </label>
                  <label class="label wide">PDF, Word, Excel yoki matn fayl
                    <input class="input" type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
                      :disabled="loadingAction === 'extractKnowledge'" @change="importKnowledgeFiles" />
                  </label>
                  <button class="btn primary"
                    :disabled="loadingAction === 'saveIntegration' || loadingAction === 'extractKnowledge'">
                    {{ loadingAction === 'saveIntegration' ? 'Saqlamoqda...' : 'Integratsiyani saqlash' }}
                  </button>
                </form>
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
        <DataTable :columns="requestColumns" :rows="requestRows" empty="Bu chatda so‘rovlar yo‘q"
          :on-cell-action="handleTableCellAction" />
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'chatDetail'" :title="chatDetailTitle" wide @close="closeModal">
        <div class="detail-stack">
          <section class="detail-summary">
            <div>
              <span>Ticketlar</span>
              <b>{{ fmtNumber(chatDetail.chat?.total_requests) }}</b>
            </div>
            <div>
              <span>Ochiq</span>
              <b>{{ fmtNumber(chatDetail.chat?.open_requests) }}</b>
            </div>
            <div>
              <span>Yopilgan</span>
              <b>{{ fmtNumber(chatDetail.chat?.closed_requests) }}</b>
            </div>
            <div>
              <span>Oxirgi aktivlik</span>
              <b>{{ fmtDate(chatDetail.chat?.last_message_at || chatDetail.chat?.last_request_at) }}</b>
            </div>
          </section>

          <section class="detail-section">
            <div class="detail-section-head">
              <div class="card-title">Ticketlar va yechimlar</div>
              <div class="card-note">{{ fmtNumber(chatDetail.requests?.length) }} ta yozuv</div>
            </div>
            <DataTable :columns="chatRequestColumns" :rows="chatDetail.requests || []" empty="Bu chatda ticket yo‘q"
              :on-cell-action="handleTableCellAction" />
          </section>

          <section class="detail-section">
            <div class="detail-section-head">
              <div class="card-title">Dialog</div>
              <div class="card-note">{{ fmtNumber(chatConversation.length) }} ta xabar</div>
            </div>
            <div v-if="chatConversation.length" class="telegram-thread">
              <article v-for="message in chatConversation" :key="chatBubbleKey(message)" class="chat-bubble-row"
                :class="{ outbound: message.direction === 'outbound' }">
                <div class="chat-bubble">
                  <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ? 'Xodim' :
                    'Mijoz') }}</div>
                  <div v-if="message.media" class="chat-media">
                    <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)" class="chat-media-image"
                      :src="mediaUrl(message.media)" alt="" />
                    <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)" class="chat-media-video"
                      :src="mediaUrl(message.media)" controls playsinline></video>
                    <audio v-else-if="isAudioMedia(message.media) && mediaUrl(message.media)" class="chat-media-audio"
                      :src="mediaUrl(message.media)" controls></audio>
                    <div v-else class="chat-media-placeholder">
                      {{ mediaPlaceholder(message.media) }}
                    </div>
                  </div>
                  <p v-if="message.text">{{ message.text }}</p>
                  <div class="chat-bubble-footer">
                    <span v-if="message.request_text" class="chat-ticket">Ticket</span>
                    <time>{{ fmtChatTime(message.created_at) }}</time>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="empty compact">Dialog tarixi yo‘q</div>
          </section>

          <!-- <section v-if="chatDetail.timeline?.length" class="detail-section compact-section">
            <div class="detail-section-head">
              <div class="card-title">Yopilish hodisalari</div>
              <div class="card-note">{{ fmtNumber(chatDetail.timeline?.length) }} ta hodisa</div>
            </div>
            <div class="timeline-list compact">
              <article v-for="(item, index) in chatDetail.timeline" :key="timelineKey(item, index)"
                class="timeline-row compact">
                <div class="timeline-meta">
                  <span class="badge" :class="timelineBadgeClass(item)">{{ timelineTypeLabel(item.type) }}</span>
                  <b>{{ item.actor_name || '—' }}</b>
                  <span>{{ fmtDate(item.created_at) }}</span>
                </div>
                <p>{{ item.text || 'Matn yo‘q' }}</p>
                <small v-if="item.request_text && item.type !== 'ticket'">Ticket: {{ item.request_text }}</small>
              </article>
            </div>
          </section> -->
        </div>
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

const ACTIVE_TAB_STORAGE_KEY = 'uyqur_support_active_tab';
const tabs = [
  { key: 'stats', label: 'Statistika', icon: '📊' },
  { key: 'groups', label: 'Guruhlar', icon: '👥' },
  { key: 'privates', label: 'Chatlar', icon: '💬' },
  { key: 'employees', label: 'Xodimlar', icon: '🧑‍💼' },
  { key: 'integrations', label: 'Integratsiya', icon: '⚡️' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️' }
];

function isValidTab(key) {
  return tabs.some(tab => tab.key === key);
}

function getStoredActiveTab() {
  if (typeof window === 'undefined') return 'stats';
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return isValidTab(stored) ? stored : 'stats';
}

function storeActiveTab(key) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, key);
}

const token = ref(getToken());
const activeTab = ref(getStoredActiveTab());
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
const chatDetail = ref({ chat: null, requests: [], timeline: [] });
const mediaUrls = ref({});
const mediaLoading = ref({});
const mediaErrors = ref({});
let mediaLoadToken = 0;
const settingsRaw = ref({ settings: [], admins: [] });
const webhookStatus = ref(null);
const showLoginPassword = ref(false);
const loginStatus = ref('');
const loginStatusType = ref('');
const loginError = ref('');

const primaryTabs = computed(() => tabs.filter(tab => tab.key !== 'settings'));
const settingsTab = tabs.find(tab => tab.key === 'settings');

const loginForm = reactive({ username: 'admin', password: '' });
const messageForm = reactive({ text: '' });
const broadcastForm = reactive({ target_type: 'groups', title: 'Yangilik', text: '' });
const employeeForm = reactive({ id: '', tg_user_id: '', full_name: '', username: '', phone: '', role: 'support', is_active: true });
const adminForm = reactive({ username: 'admin', full_name: 'System Admin', new_password: '' });
const settingsForm = reactive({ ai_mode: 'false', auto_reply: 'true', done_tag: '#done', main_group_id: '', request_detection: 'keyword' });
const integrationForm = reactive({
  enabled: true,
  provider: 'openai_compatible',
  label: 'Uyqur AI',
  base_url: 'https://api.openai.com/v1',
  model: '',
  api_key: '',
  has_api_key: false,
  system_prompt: '',
  knowledge_text: ''
});

const current = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0]);
const currentTitle = computed(() => current.value.label);
const loginFeedback = computed(() => loginError.value || loginStatus.value);
const loginButtonText = computed(() => loadingAction.value === 'login' ? 'Tekshirilmoqda...' : 'Kirish');
const aiIntegrationReady = computed(() => !!(integrationForm.enabled && integrationForm.model && (integrationForm.api_key || integrationForm.has_api_key)));
const aiModelOptionLabel = computed(() => aiIntegrationReady.value
  ? `${integrationForm.label || integrationForm.model} modeli`
  : 'AI model ulanmagan');
const aiIntegrationStatus = computed(() => aiIntegrationReady.value ? 'Ulangan' : 'Token yoki model kerak');
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
const periodChartRows = computed(() => periodRows.value);
const periodChartMax = computed(() => Math.max(1, ...periodChartRows.value.map(row => Number(row.total_requests || 0))));
const sourceChartRows = computed(() => [
  { key: 'group', label: 'Guruh', value: Number(selectedPeriodStats.value.group_requests || 0), color: '#8ec7ff' },
  { key: 'private', label: 'Shaxsiy', value: Number(selectedPeriodStats.value.private_requests || 0), color: '#95ffc8' },
  { key: 'business', label: 'Business', value: Number(selectedPeriodStats.value.business_requests || 0), color: '#ffd166' }
]);
const sourceTotal = computed(() => sourceChartRows.value.reduce((sum, row) => sum + row.value, 0));
const sourceChartMax = computed(() => Math.max(1, ...sourceChartRows.value.map(row => row.value)));
const sourceDonutStyle = computed(() => {
  if (!sourceTotal.value) return { background: 'conic-gradient(rgba(255,255,255,.12) 0deg 360deg)' };
  let start = 0;
  const slices = sourceChartRows.value.map(row => {
    const end = start + (row.value / sourceTotal.value) * 360;
    const slice = `${row.color} ${start}deg ${end}deg`;
    start = end;
    return slice;
  });
  return { background: `conic-gradient(${slices.join(', ')}, rgba(255,255,255,.08) ${start}deg 360deg)` };
});
const topEmployeeChartRows = computed(() => topEmployeeRows.value.slice(0, 6));
const topEmployeeChartMax = computed(() => Math.max(1, ...topEmployeeChartRows.value.map(row => Number(row.closed_requests || 0))));
const groupChartRows = computed(() => groupPerformanceRows.value.slice(0, 6));
const groupChartMax = computed(() => Math.max(1, ...groupChartRows.value.map(row => Number(row.total_requests || 0))));
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
  chatDetail: 'Chat tafsiloti yuklanmoqda...',
  saveAdmin: 'Saqlamoqda...',
  mainStats: 'Yuborilmoqda...',
  webhookInfo: 'Tekshirilmoqda...',
  webhookConnect: 'Ulanmoqda...',
  saveSettings: 'Saqlamoqda...',
  saveIntegration: 'Saqlamoqda...',
  extractKnowledge: 'Fayl o‘qilmoqda...'
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

function barWidth(value, max) {
  const numeric = Number(value || 0);
  const maximum = Number(max || 0);
  if (!numeric || !maximum) return '0%';
  return `${Math.min(100, Math.max(5, (numeric / maximum) * 100))}%`;
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
const chatDetailTitle = computed(() => {
  const chat = chatDetail.value.chat;
  return chat ? `Chat: ${chat.title || chat.chat_id}` : 'Chat tafsiloti';
});
const chatConversation = computed(() => chatDetail.value.conversation || []);

const employeeStatColumns = [
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'received_requests', label: 'Qabul', action: 'employeeInfo' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'employeeInfo' },
  { key: 'avg_close_minutes', label: 'O‘rt. daqiqa', format: fmtMinutes, action: 'employeeInfo' },
  { key: 'last_closed_at', label: 'Oxirgi #done', format: fmtDate, action: 'employeeInfo' }
];

const topEmployeeColumns = [
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'employeeInfo' },
  { key: 'close_share_pct', label: 'Yopish ulushi', slot: 'employeeShare', action: 'employeeInfo' },
  { key: 'handled_chats', label: 'Chatlar', action: 'employeeInfo' },
  { key: 'avg_close_minutes', label: 'O‘rt. vaqt', format: fmtMinutes, action: 'employeeInfo' },
  { key: 'last_closed_at', label: 'Oxirgi yopish', format: fmtDate, action: 'employeeInfo' }
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
  { key: 'title', label: 'Guruh', action: 'telegram' },
  { key: 'total_requests', label: 'Jami so‘rov', format: fmtNumber, action: 'requests' },
  { key: 'open_requests', label: 'Ochiq', format: fmtNumber, action: 'requests' },
  { key: 'closed_requests', label: 'Yopilgan', format: fmtNumber, action: 'requests' },
  { key: 'close_rate', label: 'Yopilish', slot: 'groupClose', action: 'requests' },
  { key: 'unique_customers', label: 'Mijozlar', format: fmtNumber, action: 'chatDetail' },
  { key: 'last_request_at', label: 'Oxirgi so‘rov', format: fmtDate, action: 'chatDetail' }
];

const employeeColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'tg_user_id', label: 'Telegram ID', format: v => v || '—', action: 'employeeInfo' },
  { key: 'username', label: 'Username', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'role', label: 'Rol', badge: true, action: 'employeeInfo' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'employeeInfo' },
  { key: 'can_message', label: 'Yozish', format: v => v ? 'Mumkin' : 'Start kerak', action: 'employeeMessage' },
  { key: 'is_active', label: 'Status', format: v => v ? 'Aktiv' : 'O‘chiq', badge: true, action: 'employeeInfo' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const openRequestColumns = [
  { key: 'customer_name', label: 'Mijoz', action: 'chatDetail' },
  { key: 'source_type', label: 'Manba', badge: true, action: 'chatDetail' },
  { key: 'initial_text', label: 'Matn', truncate: true, action: 'chatDetail' },
  { key: 'created_at', label: 'Vaqt', format: fmtDate, action: 'chatDetail' }
];

const groupColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'title', label: 'Guruh', action: 'telegram' },
  { key: 'chat_id', label: 'Chat ID', action: 'telegram' },
  { key: 'total_requests', label: 'So‘rov', action: 'requests' },
  { key: 'open_requests', label: 'Ochiq', action: 'requests' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'requests' },
  { key: 'progress', label: 'Yopilish', format: (_, row) => pct(row), action: 'requests' },
  { key: 'last_message_at', label: 'Aktivlik', format: fmtDate, action: 'chatDetail' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const privateColumns = [
  { key: 'title', label: 'Chat', action: 'telegram' },
  { key: 'source_type', label: 'Tur', badge: true, action: 'chatDetail' },
  { key: 'total_requests', label: 'So‘rov', action: 'chatDetail' },
  { key: 'open_requests', label: 'Ochiq', action: 'chatDetail' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'chatDetail' },
  { key: 'last_message_at', label: 'Oxirgi xabar', format: fmtDate, action: 'chatDetail' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const requestColumns = [
  { key: 'customer_name', label: 'Mijoz', action: 'chatDetail' },
  { key: 'initial_text', label: 'Matn', truncate: true, action: 'chatDetail' },
  { key: 'status', label: 'Status', badge: true, action: 'chatDetail' },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—', action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate, action: 'chatDetail' },
  { key: 'closed_at', label: 'Yopilgan', format: fmtDate, action: 'chatDetail' }
];

const chatRequestColumns = [
  { key: 'customer_name', label: 'Mijoz', format: v => v || '—', action: 'chatDetail' },
  { key: 'initial_text', label: 'Kelgan ticket', truncate: true, action: 'chatDetail' },
  { key: 'status', label: 'Status', badge: true, action: 'chatDetail' },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—', action: 'chatDetail' },
  { key: 'solution_text', label: 'Yechim/Javob', truncate: true, format: v => v || '—', action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate },
  { key: 'solution_at', label: 'Javob vaqti', format: fmtDate }
];

function timelineTypeLabel(type) {
  return ({
    ticket: 'Ticket',
    note: 'Izoh',
    solution: 'Yechim',
    closed: 'Yopildi',
    employee_reply: 'Javob',
    admin_reply: 'Admin javobi',
    done_without_request: 'Ticketsiz #done'
  }[type] || 'Hodisa');
}

function timelineBadgeClass(item) {
  if (['solution', 'closed'].includes(item.type)) return 'green';
  if (item.type === 'ticket') return 'orange';
  return 'blue';
}

function timelineKey(item, index) {
  return `${item.type || 'event'}:${item.request_id || item.message_id || index}:${item.created_at || index}`;
}

function fmtChatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('uz-UZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function chatBubbleKey(message) {
  return `${message.message_id || message.id || 'msg'}:${message.created_at || ''}`;
}

function mediaUrl(media) {
  return media && media.file_id ? mediaUrls.value[media.file_id] || '' : '';
}

function isVideoMedia(media) {
  return ['video', 'video_note', 'animation'].includes(media?.kind);
}

function isAudioMedia(media) {
  return ['voice', 'audio'].includes(media?.kind);
}

function mediaPlaceholder(media) {
  if (!media) return 'Media';
  if (mediaErrors.value[media.file_id]) return 'Media yuklanmadi';
  if (mediaLoading.value[media.file_id]) return 'Media yuklanmoqda...';
  return ({
    photo: 'Rasm',
    video: 'Video',
    video_note: 'Video xabar',
    animation: 'Animatsiya',
    voice: 'Voice message',
    audio: 'Audio',
    document: media.file_name || 'Fayl'
  }[media.kind] || 'Media');
}

function clearMediaUrls() {
  mediaLoadToken += 1;
  if (typeof URL !== 'undefined') {
    Object.values(mediaUrls.value).forEach(url => {
      try { URL.revokeObjectURL(url); } catch (_error) { }
    });
  }
  mediaUrls.value = {};
  mediaLoading.value = {};
  mediaErrors.value = {};
}

async function loadConversationMedia(messages = []) {
  const loadToken = mediaLoadToken;
  const mediaItems = messages
    .map(message => message.media)
    .filter(media => media && media.file_id && !mediaUrls.value[media.file_id]);
  const uniqueMedia = [...new Map(mediaItems.map(media => [media.file_id, media])).values()];
  if (!uniqueMedia.length) return;

  await Promise.all(uniqueMedia.map(async media => {
    mediaLoading.value = { ...mediaLoading.value, [media.file_id]: true };
    try {
      const blob = await api.telegramFile(media.file_id);
      const url = URL.createObjectURL(blob);
      if (loadToken !== mediaLoadToken) {
        URL.revokeObjectURL(url);
        return;
      }
      mediaUrls.value = { ...mediaUrls.value, [media.file_id]: url };
    } catch (error) {
      if (loadToken !== mediaLoadToken) return;
      mediaErrors.value = { ...mediaErrors.value, [media.file_id]: error.message };
    } finally {
      if (loadToken !== mediaLoadToken) return;
      mediaLoading.value = { ...mediaLoading.value, [media.file_id]: false };
    }
  }));
}

async function refresh() {
  startLoading('refresh');
  try {
    if (activeTab.value === 'stats') await loadDashboard();
    if (activeTab.value === 'groups') groups.value = await api.groups();
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'integrations') await loadSettings();
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
  const integration = data.settings?.find(s => s.key === 'ai_integration')?.value;
  const done = data.settings?.find(s => s.key === 'done_tag')?.value;
  const mainGroup = data.settings?.find(s => s.key === 'main_group')?.value;
  const detect = data.settings?.find(s => s.key === 'request_detection')?.value;
  Object.assign(integrationForm, {
    enabled: integration?.enabled !== false,
    provider: integration?.provider || 'openai_compatible',
    label: integration?.label || integration?.model || 'Uyqur AI',
    base_url: integration?.base_url || 'https://api.openai.com/v1',
    model: integration?.model || '',
    api_key: '',
    has_api_key: !!integration?.has_api_key,
    system_prompt: integration?.system_prompt || '',
    knowledge_text: integration?.knowledge_text || ''
  });
  settingsForm.ai_mode = ai?.enabled && ai?.provider ? 'model' : String(!!ai?.enabled);
  const autoReplySetting = data.settings?.find(s => s.key === 'auto_reply')?.value;
  settingsForm.auto_reply = autoReplySetting !== undefined
    ? String(!!autoReplySetting.enabled)
    : 'true';
  settingsForm.done_tag = done?.tag || '#done';
  settingsForm.main_group_id = mainGroup?.chat_id || '';
  settingsForm.request_detection = detect?.mode || 'keyword';
  await checkTelegramWebhook(false);
}

async function setTab(key) {
  activeTab.value = isValidTab(key) ? key : 'stats';
  storeActiveTab(activeTab.value);
  search.value = '';
  startLoading('tab');
  try {
    if (activeTab.value === 'stats') await loadDashboard();
    if (activeTab.value === 'groups') groups.value = await api.groups();
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'integrations') await loadSettings();
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

function tableActionChatRow(row = {}) {
  const chatId = row.chat_id || selectedTarget.value?.chat_id || row.contact_chat_id;
  if (!chatId) return null;
  return {
    ...selectedTarget.value,
    ...row,
    chat_id: chatId,
    title: row.title || row.customer_name || selectedTarget.value?.title || String(chatId)
  };
}

function telegramUrlFor(row = {}) {
  const username = String(row.username || row.customer_username || '').replace(/^@/, '').trim();
  if (username) return `https://t.me/${encodeURIComponent(username)}`;

  const chatId = row.chat_id || row.contact_chat_id || row.customer_tg_id || row.tg_user_id;
  if (!chatId) return '';

  const normalized = String(chatId).trim();
  const isGroup = normalized.startsWith('-') || row.source_type === 'group' || String(row.type || '').includes('group');
  const key = isGroup ? 'chat_id' : 'user_id';
  return `tg://openmessage?${key}=${encodeURIComponent(normalized)}`;
}

function openTelegramChat(row = {}) {
  const target = tableActionChatRow(row) || row;
  const url = telegramUrlFor(target);
  if (!url) return showToast('Telegramda ochish uchun chat ID yoki username topilmadi');
  window.open(url, '_blank', 'noopener,noreferrer');
}

function tableActionEmployeeRow(row = {}) {
  const employee = {
    ...row,
    id: row.id || row.employee_id || '',
    full_name: row.full_name || row.closed_by_name || row.solution_by || 'Xodim'
  };
  if (!employee.id && employee.tg_user_id) {
    const found = employees.value.find(item => String(item.tg_user_id || '') === String(employee.tg_user_id));
    return found || employee;
  }
  return employee;
}

function handleTableCellAction({ action, row }) {
  if (!action) return;
  if (action === 'telegram') {
    openTelegramChat(row);
    return;
  }
  if (action === 'chatDetail') {
    const chatRow = tableActionChatRow(row);
    if (!chatRow) return showToast('Chat tafsiloti uchun chat ID topilmadi');
    loadChatDetail(chatRow);
    return;
  }
  if (action === 'requests') {
    const chatRow = tableActionChatRow(row);
    if (!chatRow) return showToast('So‘rovlar uchun chat ID topilmadi');
    loadRequests(chatRow);
    return;
  }
  if (action === 'employeeInfo') {
    openEmployee(tableActionEmployeeRow(row));
    return;
  }
  if (action === 'employeeMessage') {
    const employee = tableActionEmployeeRow(row);
    if (!employee.id && !employee.employee_id && !employee.tg_user_id) return showToast('Xodim Telegram ID topilmadi');
    openEmployeeMessage(employee);
    return;
  }
  if (action === 'send') {
    const chatRow = tableActionChatRow(row);
    if (!chatRow) return showToast('Xabar yuborish uchun chat ID topilmadi');
    openSend(chatRow);
  }
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
  if (modal.value === 'chatDetail') clearMediaUrls();
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

async function loadChatDetail(row) {
  if (!row?.chat_id) return showToast('Chat tanlanmagan');
  selectedTarget.value = row;
  clearMediaUrls();
  startLoading('chatDetail');
  try {
    chatDetail.value = await api.chatDetail({ chat_id: row.chat_id });
    modal.value = 'chatDetail';
    loadConversationMedia(chatDetail.value.conversation || []).catch(error => showToast(error.message));
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('chatDetail');
  }
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = () => reject(reader.error || new Error('Fayl o‘qilmadi'));
    reader.readAsDataURL(file);
  });
}

async function importKnowledgeFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  startLoading('extractKnowledge');
  try {
    const extracted = [];
    for (const file of files) {
      const data = await fileToBase64(file);
      const result = await api.extractAiKnowledge({ file: { name: file.name, type: file.type, data } });
      extracted.push(`### ${result.name}\n${result.text}`);
    }
    integrationForm.knowledge_text = [integrationForm.knowledge_text, ...extracted].filter(Boolean).join('\n\n').trim();
    showToast(`${files.length} ta fayldan ma’lumot qo‘shildi`);
  } catch (error) {
    showToast(error.message);
  } finally {
    event.target.value = '';
    stopLoading('extractKnowledge');
  }
}

async function saveSettings() {
  startLoading('saveSettings');
  try {
    const useModel = settingsForm.ai_mode === 'model' && aiIntegrationReady.value;
    await api.saveSettings({
      settings: [
        {
          key: 'ai_mode',
          value: {
            enabled: settingsForm.ai_mode !== 'false',
            provider: useModel ? integrationForm.provider : null,
            model: useModel ? integrationForm.model : null,
            model_label: useModel ? (integrationForm.label || integrationForm.model) : null
          }
        },
        { key: 'auto_reply', value: { enabled: settingsForm.auto_reply === 'true' } },
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

async function saveIntegration() {
  startLoading('saveIntegration');
  try {
    await api.saveSettings({
      settings: [
        {
          key: 'ai_integration',
          value: {
            enabled: integrationForm.enabled,
            provider: integrationForm.provider,
            label: integrationForm.label,
            base_url: integrationForm.base_url,
            model: integrationForm.model,
            api_key: integrationForm.api_key,
            has_api_key: integrationForm.has_api_key,
            system_prompt: integrationForm.system_prompt,
            knowledge_text: integrationForm.knowledge_text
          }
        }
      ]
    });
    integrationForm.has_api_key = Boolean(integrationForm.api_key || integrationForm.has_api_key);
    integrationForm.api_key = '';
    showToast('AI integratsiya saqlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('saveIntegration');
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
  props: { columns: Array, rows: Array, empty: String, onCellAction: Function },
  setup(props, { slots }) {
    const resolveAction = (column, row) => typeof column.action === 'function' ? column.action(row, column) : column.action;
    const triggerAction = (event, column, row) => {
      const action = resolveAction(column, row);
      if (!action || typeof props.onCellAction !== 'function') return;
      event.preventDefault();
      props.onCellAction({ action, row, column, event });
    };
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
          h('tbody', props.rows.map(row => h('tr', props.columns.map(col => {
            const action = resolveAction(col, row);
            const cellProps = {
              class: [
                col.key === 'select' ? 'select-cell' : '',
                action ? 'cell-action' : ''
              ].filter(Boolean).join(' ')
            };
            if (action) {
              cellProps.role = 'button';
              cellProps.tabindex = 0;
              cellProps.title = 'Ochish';
              cellProps.onClick = event => triggerAction(event, col, row);
              cellProps.onKeydown = event => {
                if (event.key === 'Enter' || event.key === ' ') triggerAction(event, col, row);
              };
            }
            return h('td', cellProps, renderValue(col, row));
          }))))
        ])
        : h('div', { class: 'empty' }, props.empty || 'Ma’lumot yo‘q')
    ]);
  }
});
</script>
