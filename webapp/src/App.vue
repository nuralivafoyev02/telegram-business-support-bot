<template>
  <main v-if="!token" class="login-screen">
    <section class="card login-card">
      <div class="logo">UQ</div>
      <h1>Uyqur Yordam</h1>
      <p>Texnik yordam paneli</p>
      <form class="form" @submit.prevent="submitLogin">
        <label class="label">Kirish nomi
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
          <div class="brand-title">Uyqur Yordam</div>
          <div class="brand-subtitle">Texnik yordam paneli</div>
        </div>
      </div>

      <nav class="nav">
        <button v-for="item in mainTabs" :key="item.key" :class="{ active: activeTab === item.key }"
          @click="setTab(item.key)">
          <span>{{ item.icon }}</span>
          <b>{{ item.label }}</b>
        </button>
        <div class="nav-group" :class="{ open: otherMenuOpen }">
          <button class="nav-disclosure" :class="{ active: isOtherTabActive }" type="button"
            :aria-expanded="otherMenuOpen ? 'true' : 'false'" @click="otherMenuOpen = !otherMenuOpen">
            <span>⋯</span>
            <b>Boshqa menyular</b>
            <em>{{ otherMenuOpen ? '−' : '+' }}</em>
          </button>
          <Transition name="fade">
            <div v-if="otherMenuOpen" class="nav-submenu">
              <button v-for="item in otherTabs" :key="item.key" :class="{ active: activeTab === item.key }"
                @click="setTab(item.key)">
                <span>{{ item.icon }}</span>
                <b>{{ item.label }}</b>
              </button>
            </div>
          </Transition>
        </div>
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
          <p>{{ currentSubtitle }}</p>
        </div>
        <div class="top-actions-menu" ref="actionMenuRef">
          <button class="profile-action" type="button" :aria-expanded="actionMenuOpen"
            @click="actionMenuOpen = !actionMenuOpen">
            <span class="profile-avatar">{{ userInitials }}</span>
            <span>Amallar</span>
            <b>⌄</b>
          </button>
          <Transition name="fade">
            <div v-if="actionMenuOpen" class="actions-dropdown">
              <button type="button" :disabled="loadingAction === 'refresh'" @click="runHeaderAction(refresh)">
                {{ loadingAction === 'refresh' ? 'Yangilanmoqda...' : 'Yangilash' }}
              </button>
              <button v-if="activeTab === 'stats'" type="button" :disabled="loadingAction === 'mainStats'"
                @click="runHeaderAction(sendMainStats)">
                {{ loadingAction === 'mainStats' ? 'Yuborilmoqda...' : 'Statistika yuborish' }}
              </button>
              <button type="button" @click="runHeaderAction(openBroadcast)">Umumiy xabar</button>
              <label v-if="activeTab === 'stats'" class="theme-menu-row">
                <span>Davr</span>
                <select v-model="selectedStatsPeriod" class="select mini-select" @change="handleStatsPeriodChange">
                  <option v-for="period in periodOptions" :key="period.key" :value="period.key">
                    {{ period.label }}
                  </option>
                </select>
              </label>
              <label class="theme-menu-row">
                <span>Mavzu</span>
                <select v-model="themeMode" class="select mini-select" @change="setThemeMode(themeMode)">
                  <option value="system">Tizim</option>
                  <option value="light">Yorug‘</option>
                  <option value="dark">Qorong‘i</option>
                </select>
              </label>
              <button class="danger-menu-item" type="button" @click="runHeaderAction(logout)">Chiqish</button>
            </div>
          </Transition>
        </div>
      </header>

      <Transition name="page-shift" mode="out-in">
        <div class="page-body" :key="activeTab">
          <template v-if="activeTab === 'stats'">
            <div class="support-summary-grid">
              <article v-for="card in supportSummaryCards" :key="card.key" class="card support-summary-card"
                :class="{ alert: card.tone === 'danger' }" role="button" tabindex="0" :title="card.title"
                @click="openSupportSummaryCard(card.action)"
                @keydown.enter.prevent="openSupportSummaryCard(card.action)"
                @keydown.space.prevent="openSupportSummaryCard(card.action)">
                <div class="support-summary-content">
                  <div class="support-summary-title">{{ card.title }}</div>
                  <div class="support-summary-value-row">
                    <div class="support-summary-value" :class="{ danger: card.tone === 'danger' }">{{ card.value }}</div>
                    <Transition name="fade">
                      <div v-if="comparisonEnabled && card.comparison" class="trend-label" :class="card.comparison.tone">
                        {{ card.comparison.text }}
                      </div>
                    </Transition>
                  </div>
                  <div class="support-summary-note">{{ card.note }}</div>
                </div>
                <span class="support-summary-icon" aria-hidden="true">{{ card.icon }}</span>
              </article>
            </div>

            <template v-if="isManagerMode">
              <div class="spacer"></div>
              <div class="manager-metrics">
                <article class="card manager-metric">
                  <span>Guruhlardan tushgan so‘rovlar</span>
                  <b>{{ fmtNumber(managerStats.group_requests) }}</b>
                  <small>{{ fmtNumber(managerStats.group_open_requests) }} tasi ochiq</small>
                </article>
                <article class="card manager-metric">
                  <span>Yopilgan so‘rovlar</span>
                  <b>{{ fmtNumber(managerStats.closed_requests) }}</b>
                  <small>Jami: {{ fmtNumber(managerStats.total_requests) }}</small>
                </article>
                <article class="card manager-metric">
                  <span>Chatlardagi ochiq so‘rovlar</span>
                  <b>{{ fmtNumber(managerStats.chat_open_requests) }}</b>
                  <small>Shaxsiy va biznes chatlar</small>
                </article>
                <article class="card manager-metric">
                  <span>Eng uzoq ochiq turgan</span>
                  <b>{{ openDurationLabel(managerOpenRequests[0]?.created_at) }}</b>
                  <small>{{ fmtNumber(managerStats.assigned_open_requests) }} ta so‘rovga xodim biriktirilgan</small>
                </article>
              </div>

              <div class="spacer"></div>
              <section class="card manager-open-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Rahbar nazorati: ochiq so‘rovlar</div>
                    <div class="card-note">Qaysi chatdan kelgani, qancha vaqtdan beri ochiq turgani va mas’ul xodim
                    </div>
                  </div>
                </div>
                <DataTable :columns="managerOpenRequestColumns" :rows="managerOpenRequests"
                  empty="Ochiq so‘rov qolmagan" :on-cell-action="handleTableCellAction" :page-size="10">
                  <template #requestReply="{ row }">
                    <button class="btn small" type="button" @click.stop="openRequestReply(row)">Javob</button>
                  </template>
                </DataTable>
              </section>
            </template>

            <div class="spacer"></div>

            <section class="card top-support-card">
              <div class="card-header performance-head">
                <div>
                  <div class="card-title">Hodimlar reytingi</div>
                  <div class="card-note">Ticketlarni yopish, ochiq qoldiqlar va SLA bo‘yicha support natijasi</div>
                </div>
                <div class="card-header-actions" ref="rankingMenuRef">
                  <button class="btn-icon mini-icon" @click="rankingMenuOpen = !rankingMenuOpen" title="Sozlamalar">
                    <span>⋯</span>
                  </button>
                  <Transition name="fade">
                    <div v-if="rankingMenuOpen" class="actions-dropdown mini-dropdown right-align">
                      <label class="theme-menu-row">
                        <span>Taqqoslash</span>
                        <label class="switch mini-switch">
                          <input type="checkbox" v-model="comparisonEnabled">
                          <span class="slider"></span>
                        </label>
                      </label>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- Ranking Controls and Top Performer -->
              <div class="ranking-header-area">
                <div v-if="topPerformer" class="top-performer-summary">
                  <div class="top-perf-avatar">🏆</div>
                  <div class="top-perf-info">
                    <span>Top hodim</span>
                    <b>{{ topPerformer.full_name || topPerformer.name }}</b>
                  </div>
                  <div class="top-perf-metrics">
                    <div class="top-perf-metric">
                      <span>Yopilgan</span>
                      <b>{{ fmtNumber(topPerformer.closed_requests) }}</b>
                      <div v-if="comparisonEnabled && topPerformer.closed_comparison" class="trend-label"
                        :class="topPerformer.closed_comparison.tone">
                        {{ topPerformer.closed_comparison.text }}
                      </div>
                    </div>
                    <div class="top-perf-metric">
                      <span>SLA</span>
                      <b>{{ fmtPercent(topPerformer.close_rate) }}</b>
                      <div v-if="comparisonEnabled && topPerformer.sla_comparison" class="trend-label"
                        :class="topPerformer.sla_comparison.tone">
                        {{ topPerformer.sla_comparison.text }}
                      </div>
                    </div>
                    <div class="top-perf-metric">
                      <span>Guruh/Chat</span>
                      <b>{{ fmtNumber(topPerformer.handled_chats) }}</b>
                    </div>
                  </div>
                </div>
              </div>

              <DataTable :columns="supportPerformanceColumns" :rows="topSupportCards"
                empty="Hozircha natija ma’lumoti yo‘q" :on-cell-action="handleTableCellAction" :page-size="12">
                <template #rank="{ row }">
                  <span class="rank-number">{{ row.rank }}</span>
                </template>
                <template #employeeIdentity="{ row }">
                  <span class="employee-cell">
                    <img v-if="employeeAvatarUrl(row)" class="employee-avatar" :src="employeeAvatarUrl(row)" alt="" />
                    <span v-else class="employee-avatar fallback">{{ employeeInitials(row) }}</span>
                    <b>{{ row.full_name || 'Xodim' }}</b>
                  </span>
                </template>
                <template #closedRequests="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong">{{ fmtNumber(row.closed_requests) }}</b>
                    <span v-if="comparisonEnabled && row.closed_comparison" class="trend-label" :class="row.closed_comparison.tone">
                      {{ row.closed_comparison.text }}
                    </span>
                  </div>
                </template>
                <template #openRequests="{ row }">
                  <span class="open-count"
                    :class="{ warn: Number(row.open_requests || 0) >= 5, danger: Number(row.open_requests || 0) >= 8 }">
                    {{ fmtNumber(row.open_requests) }}
                  </span>
                </template>
                <template #closeRate="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong">{{ fmtPercent(row.close_rate) }}</b>
                    <span v-if="comparisonEnabled && row.sla_comparison" class="trend-label" :class="row.sla_comparison.tone">
                      {{ row.sla_comparison.text }}
                    </span>
                  </div>
                </template>
                <template #avgTime="{ row }">
                  <div class="trend-cell">
                    <span>{{ fmtMinutes(row.avg_close_minutes) }}</span>
                    <span v-if="comparisonEnabled && row.avg_comparison" class="trend-label" :class="row.avg_comparison.tone">
                      {{ row.avg_comparison.text }}
                    </span>
                  </div>
                </template>
                <template #sla="{ row }">
                  <span class="sla-badge sla-tooltip" :class="slaToneClass(row.sla)"
                    :data-tooltip="employeeSlaTooltip(row)" tabindex="0">{{ fmtPercent(row.sla) }}</span>
                </template>
              </DataTable>
            </section>

            <div class="spacer"></div>

            <div class="stats-charts support-analytics-grid">
              <section class="card chart-card ticket-trend-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">Ticket va javoblar trendi</div>
                    <div class="card-note">{{ selectedPeriodLabel }} bo‘yicha kunlik solishtirish</div>
                  </div>
                </div>
                <div v-if="ticketTrendRows.length" class="ticket-trend-chart">
                  <article v-for="row in ticketTrendRows" :key="row.date_key" class="ticket-trend-day">
                    <div class="ticket-trend-bars" :aria-label="ticketTrendTooltip(row)">
                      <span class="ticket-bar total" :data-tooltip="ticketTrendMetricTooltip(row, 'total')" tabindex="0"
                        :style="{ height: chartBarHeight(row.total_requests, ticketTrendMax) }"></span>
                      <span class="ticket-bar closed" :data-tooltip="ticketTrendMetricTooltip(row, 'closed')"
                        tabindex="0" :style="{ height: chartBarHeight(row.closed_requests, ticketTrendMax) }"></span>
                      <span class="ticket-bar open" :data-tooltip="ticketTrendMetricTooltip(row, 'open')" tabindex="0"
                        :style="{ height: chartBarHeight(row.open_requests, ticketTrendMax) }"></span>
                    </div>
                    <b>{{ row.weekday_label }}</b>
                    <span>{{ row.date_label }}</span>
                    <em class="sla-chip" :class="slaToneClass(row.sla)">SLA {{ fmtPercent(row.sla) }}</em>
                  </article>
                </div>
                <div v-else class="empty compact">Bu davr uchun trend ma’lumoti yo‘q</div>
              </section>

              <section class="card chart-card company-ticket-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">Kompaniyalar bo‘yicha ticketlar</div>
                    <div class="card-note">Guruhga biriktirilgan kompaniyalar kesimida ticket va xabarlar</div>
                  </div>
                </div>
                <div v-if="companyTicketRows.length" class="company-ticket-bars">
                  <article v-for="row in companyTicketRows" :key="row.company_id || row.name"
                    class="company-ticket-row clickable-company-ticket" role="button" tabindex="0"
                    title="Kompaniya guruhlaridagi barcha xabar va ticketlarni ko‘rish"
                    @click="openCompanyGroupActivity(row)" @keydown.enter.prevent="openCompanyGroupActivity(row)"
                    @keydown.space.prevent="openCompanyGroupActivity(row)">
                    <b>{{ row.name }}</b>
                    <div class="company-ticket-track">
                      <span class="company-ticket-fill closed"
                        :style="{ width: companyTicketWidth(row.closed_requests) }"></span>
                      <span class="company-ticket-fill open"
                        :style="{ left: companyTicketWidth(row.closed_requests), width: companyTicketWidth(row.open_requests) }"></span>
                    </div>
                    <strong>
                      <span class="closed-text">{{ fmtNumber(row.closed_requests) }}</span>
                      <span>/</span>
                      <span class="open-text">{{ fmtNumber(row.open_requests) }}</span>
                      <small>({{ fmtNumber(row.total_requests) }})</small>
                    </strong>
                  </article>
                </div>
                <div v-else class="empty compact">Bu davr uchun kompaniya statistikasi yo‘q</div>
                <div class="company-ticket-legend">
                  <span><i class="legend-square closed"></i>Yopilgan ticket</span>
                  <span><i class="legend-square open"></i>Ochiq ticket</span>
                  <span>Bar uzunligi = jami ticket soni</span>
                </div>
              </section>
            </div>

          </template>

          <template v-if="activeTab === 'productAnalytics'">
            <Toolbar v-model="search" placeholder="Kompaniya, brand yoki support bo‘yicha qidirish" />

            <div class="spacer"></div>

            <div class="metric-strip">
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Kuzatuvdagi kompaniyalarni ko‘rish" @click="openProductMetricDetail('total')"
                @keydown.enter.prevent="openProductMetricDetail('total')"
                @keydown.space.prevent="openProductMetricDetail('total')">
                <div class="metric-head">
                  <div class="metric-label">Kuzatuvdagi kompaniya</div>
                  <span class="metric-icon">🏢</span>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.total) }}</div>
                <div class="metric-mini">Texnik yordam biriktirilgan kompaniyalar</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Aktiv kompaniyalarni ko‘rish" @click="openProductMetricDetail('active')"
                @keydown.enter.prevent="openProductMetricDetail('active')"
                @keydown.space.prevent="openProductMetricDetail('active')">
                <div class="metric-head">
                  <div class="metric-label">Aktiv foydalanish</div>
                  <span class="metric-icon good">✅</span>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.active) }}</div>
                <div class="metric-mini">{{ fmtPercent(productUsageSummary.active_rate) }} biznes aktiv</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Yuqori foydalanishdagi kompaniyalarni ko‘rish" @click="openProductMetricDetail('highUsage')"
                @keydown.enter.prevent="openProductMetricDetail('highUsage')"
                @keydown.space.prevent="openProductMetricDetail('highUsage')">
                <div class="metric-head">
                  <div class="metric-label">O‘rtacha foydalanish</div>
                  <span class="metric-icon">📊</span>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.average_score) }}%</div>
                <div class="metric-mini">{{ fmtNumber(productUsageSummary.high_usage) }} ta yuqori foydalanmoqda</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Riskdagi kompaniyalarni ko‘rish" @click="openProductMetricDetail('risk')"
                @keydown.enter.prevent="openProductMetricDetail('risk')"
                @keydown.space.prevent="openProductMetricDetail('risk')">
                <div class="metric-head">
                  <div class="metric-label">Risk va churn</div>
                  <span class="metric-icon warn">⚠️</span>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.risk) }}</div>
                <div class="metric-mini">{{ fmtNumber(productUsageSummary.expiring_soon) }} ta obuna yaqin</div>
              </article>
            </div>

            <div class="spacer"></div>

            <div class="stats-charts">
              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Kompaniyalar foydalanish indeksi</div>
                    <div class="card-note">Biznes holati, obuna holati va mas’ul biriktirilishiga qarab</div>
                  </div>
                </div>
                <div class="chart-bars">
                  <div v-for="row in productUsageChartRows" :key="row.id || row.name" class="chart-row">
                    <div class="chart-label">{{ row.name || 'Kompaniya' }}</div>
                    <div class="chart-track">
                      <span class="chart-fill blue" :style="{ width: `${row.usage_score}%` }"></span>
                    </div>
                    <div class="chart-value">{{ fmtNumber(row.usage_score) }}%</div>
                  </div>
                  <div v-if="!productUsageChartRows.length" class="empty compact">Kompaniya ma’lumoti yo‘q</div>
                </div>
              </section>

              <section class="card chart-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Foydalanish darajalari</div>
                    <div class="card-note">Yuqori, o‘rta va past foydalanishdagi kompaniyalar</div>
                  </div>
                </div>
                <div class="chart-bars">
                  <div v-for="row in usageLevelRows" :key="row.label" class="chart-row">
                    <div class="chart-label">{{ row.label }}</div>
                    <div class="chart-track">
                      <span class="chart-fill" :class="row.color"
                        :style="{ width: barWidth(row.count, usageLevelChartMax) }"></span>
                    </div>
                    <div class="chart-value">{{ fmtNumber(row.count) }}</div>
                  </div>
                </div>
              </section>
            </div>

            <div class="spacer"></div>

            <div class="stats-table-stack">
              <section class="card subscription-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Kompaniyalar obuna timeline diagrammasi</div>
                    <div class="card-note">Boshlanish, obuna muddati va qancha vaqtdan beri ishlatayotgani</div>
                  </div>
                </div>
                <div v-if="subscriptionTimelineRows.length" class="subscription-diagram">
                  <div class="subscription-leaders">
                    <article v-for="(row, index) in longestUsageRows" :key="row.id || row.name || index"
                      class="leader-item">
                      <span>{{ index + 1 }}</span>
                      <div>
                        <b>{{ row.name || 'Kompaniya' }}</b>
                        <small>{{ row.usage_duration_label }} · {{ row.subscription_label }}</small>
                      </div>
                    </article>
                  </div>
                  <div class="subscription-timeline">
                    <article v-for="row in subscriptionTimelineRows" :key="row.id || row.name"
                      class="timeline-company-row" role="button" tabindex="0" title="Kompaniya tafsilotini ko‘rish"
                      @click="openCompanyTimelineDetail(row)" @keydown.enter.prevent="openCompanyTimelineDetail(row)"
                      @keydown.space.prevent="openCompanyTimelineDetail(row)">
                      <div class="timeline-company-meta">
                        <b>{{ row.name || 'Kompaniya' }}</b>
                        <span>{{ row.brand || companySupportLabel(row) }}</span>
                      </div>
                      <div class="timeline-visual">
                        <div class="timeline-track" :title="row.timeline_title">
                          <span class="timeline-total" :style="{ width: row.subscription_width }"></span>
                          <span class="timeline-used" :class="timelineFillClass(row)"
                            :style="{ width: row.used_width }"></span>
                        </div>
                        <div class="timeline-labels">
                          <span>Boshlanish: {{ row.start_label }}</span>
                          <span>{{ row.subscription_label }}</span>
                          <span>{{ row.usage_duration_label }}</span>
                        </div>
                      </div>
                      <div class="timeline-status">
                        <span class="status-pill mini" :class="expiryStatusClass(row)">{{ expiryStatusLabel(row)
                          }}</span>
                        <small>{{ businessStatusLabel(row.business_status) }}</small>
                      </div>
                    </article>
                  </div>
                </div>
                <div v-else class="empty compact">Kompaniya obuna ma’lumoti yo‘q</div>
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'companyActivity'">
            <Toolbar v-model="search" placeholder="Kompaniya, direktor, support yoki telefon bo‘yicha qidirish" />

            <div class="metric-strip company-metrics">
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Kompaniyalar ro‘yxatini ko‘rish" @click="openCompanyMetricDetail('total')"
                @keydown.enter.prevent="openCompanyMetricDetail('total')"
                @keydown.space.prevent="openCompanyMetricDetail('total')">
                <div class="metric-head">
                  <div class="metric-label">Kompaniyalar</div>
                  <span class="metric-icon">🏢</span>
                </div>
                <div class="metric-value">{{ fmtNumber(companyActivitySummary.total) }}</div>
                <div class="metric-mini">{{ fmtNumber(companyActivitySummary.real) }} tasi real kompaniya</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Biznes aktiv kompaniyalarni ko‘rish" @click="openCompanyMetricDetail('active')"
                @keydown.enter.prevent="openCompanyMetricDetail('active')"
                @keydown.space.prevent="openCompanyMetricDetail('active')">
                <div class="metric-head">
                  <div class="metric-label">Biznes aktiv</div>
                  <span class="metric-icon good">✅</span>
                </div>
                <div class="metric-value">{{ fmtNumber(companyActivitySummary.business_active) }}</div>
                <div class="metric-mini">{{ fmtNumber(companyActivitySummary.business_new) }} ta yangi kompaniya</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Churn yoki pauzadagi kompaniyalarni ko‘rish" @click="openCompanyMetricDetail('paused')"
                @keydown.enter.prevent="openCompanyMetricDetail('paused')"
                @keydown.space.prevent="openCompanyMetricDetail('paused')">
                <div class="metric-head">
                  <div class="metric-label">Churn/Pauza</div>
                  <span class="metric-icon warn">⚠️</span>
                </div>
                <div class="metric-value">{{ fmtNumber(companyActivitySummary.business_paused) }}</div>
                <div class="metric-mini">Biznes holati pauzada</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Obunasi yaqin yoki tugagan kompaniyalarni ko‘rish" @click="openCompanyMetricDetail('expiry')"
                @keydown.enter.prevent="openCompanyMetricDetail('expiry')"
                @keydown.space.prevent="openCompanyMetricDetail('expiry')">
                <div class="metric-head">
                  <div class="metric-label">Obuna yaqin</div>
                  <span class="metric-icon">📅</span>
                </div>
                <div class="metric-value">{{ fmtNumber(companyActivitySummary.expiring_soon) }}</div>
                <div class="metric-mini">{{ fmtNumber(companyActivitySummary.expired) }} ta obuna tugagan</div>
              </article>
            </div>

            <div class="spacer"></div>

            <div class="company-activity-stack">
              <section class="card chart-card active-company-chart">
                <div class="card-header">
                  <div>
                    <div class="card-title">Eng faol kompaniyalar</div>
                    <div class="card-note">Sessiya soni bo‘yicha</div>
                  </div>
                </div>
                <div class="vertical-bar-chart">
                  <svg viewBox="0 0 760 260" role="img" aria-label="Eng faol kompaniyalar">
                    <g class="trend-grid">
                      <line v-for="tick in activeCompanyYTicks" :key="`company-y-${tick.value}`" x1="50" x2="720"
                        :y1="tick.y" :y2="tick.y" />
                      <line v-for="bar in activeCompanyChartBars" :key="`company-x-${bar.label}`" :x1="bar.x"
                        :x2="bar.x" y1="36" y2="198" />
                    </g>
                    <g class="trend-axis">
                      <text v-for="tick in activeCompanyYTicks" :key="`company-yt-${tick.value}`" x="40" :y="tick.y + 5"
                        text-anchor="end">{{ fmtNumber(tick.value) }}</text>
                      <text v-for="bar in activeCompanyChartBars" :key="`company-label-${bar.label}`" :x="bar.x" y="235"
                        text-anchor="middle">{{ bar.short_label }}</text>
                    </g>
                    <g>
                      <rect v-for="bar in activeCompanyChartBars" :key="`company-bar-${bar.label}`" class="company-bar"
                        :x="bar.x - bar.width / 2" :y="bar.y" :width="bar.width" :height="bar.height" rx="8">
                        <title>{{ bar.label }}: {{ fmtNumber(bar.session_count) }} ta sessiya</title>
                      </rect>
                    </g>
                  </svg>
                  <div v-if="!activeCompanyChartBars.length" class="empty compact">Faollik ma’lumoti yo‘q</div>
                </div>
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Kompaniya aktivligi</div>
                    <div class="card-note">API’dan olingan holat, mas’ul va obuna ma’lumotlari</div>
                  </div>
                </div>
                <DataTable :columns="companyActivityColumns" :rows="filteredCompanyInfoRows"
                  empty="Kompaniya ma’lumoti topilmadi" :page-size="12" :on-cell-action="handleTableCellAction">
                  <template #companyIdentity="{ row }">
                    <span class="company-identity">
                      <img v-if="row.icon" :src="row.icon" alt="" />
                      <span>
                        <b>{{ row.name || 'Kompaniya' }}</b>
                        <small>{{ row.brand || 'Brend kiritilmagan' }}</small>
                      </span>
                    </span>
                  </template>
                  <template #businessStatus="{ row }">
                    <span class="status-pill mini" :class="businessStatusClass(row.business_status)">{{
                      businessStatusLabel(row.business_status) }}</span>
                  </template>
                  <template #supportOwner="{ row }">
                    <span class="support-owner">{{ companySupportLabel(row) }}</span>
                  </template>
                  <template #expiryStatus="{ row }">
                    <span class="status-pill mini" :class="expiryStatusClass(row)">{{ expiryStatusLabel(row) }}</span>
                  </template>
                </DataTable>
              </section>

              <section class="card alert-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Obuna nazorati</div>
                    <div class="card-note">Tugagan yoki yaqin tugaydigan kompaniyalar</div>
                  </div>
                </div>
                <div class="alert-list">
                  <article v-for="row in companyAlerts" :key="row.id" class="alert-item">
                    <div class="alert-item-head">
                      <b>{{ row.name }}</b>
                      <span>{{ expiryAlertBadge(row) }}</span>
                    </div>
                    <p>{{ row.expired || 'Muddatsiz' }}</p>
                    <small>Mas’ul: {{ companySupportLabel(row) }}</small>
                  </article>
                  <div v-if="!companyAlerts.length" class="empty compact">Obuna bo‘yicha xavfli holat yo‘q</div>
                </div>
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'groups'">
            <Toolbar v-model="search" placeholder="Guruh nomi yoki chat raqami bo‘yicha qidirish">
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
                  <button class="btn small" @click="openAssignCompany(row)">Kompaniya</button>
                  <button class="btn small" @click="openSend(row)">Xabar</button>
                  <button class="btn small" @click="loadRequests(row)">So‘rovlar</button>
                  <button class="btn small danger" :disabled="deletingGroupId === String(row.chat_id)"
                    @click="deleteGroup(row)">{{ deletingGroupId === String(row.chat_id) ? 'O‘chirilmoqda...' :
                      'O‘chirish' }}</button>
                </template>
              </DataTable>
            </section>
          </template>

          <template v-if="activeTab === 'companies'">
            <Toolbar v-model="search" placeholder="Kompaniya nomi, telefon yoki izoh bo‘yicha qidirish" />
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Kompaniyalar</div>
                  <div class="card-note">Uyqur API’dan kelgan mas’ul biriktirilgan kompaniyalar</div>
                </div>
              </div>
              <DataTable :columns="companyColumns" :rows="filteredCompanies" empty="Kompaniya topilmadi" />
            </section>
          </template>

          <template v-if="activeTab === 'privates'">
            <Toolbar v-model="search" placeholder="Mijoz nomi, chat raqami yoki foydalanuvchi nomi bo‘yicha qidirish" />
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Mijozlar</div>
                </div>
              </div>
              <DataTable :columns="privateColumns" :rows="filteredPrivates" empty="Mijoz chati topilmadi"
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
                placeholder="Xodim ismi, foydalanuvchi nomi yoki Telegram raqami bo‘yicha qidirish" />
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
                  <label class="label">Kirish nomi
                    <input v-model.trim="adminForm.username" class="input" placeholder="admin" />
                  </label>
                  <label class="label">Ism
                    <input v-model.trim="adminForm.full_name" class="input" placeholder="Tizim admini" />
                  </label>
                  <label class="label">Yangi parol
                    <input v-model="adminForm.new_password" class="input" type="password"
                      autocomplete="new-password"
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
                  <label class="label">AI rejimi
                    <select v-model="settingsForm.ai_mode" class="select">
                      <option value="false">O‘chirilgan</option>
                      <option value="true">Local smart</option>
                      <option value="model" :disabled="!aiIntegrationReady">{{ aiModelOptionLabel }}</option>
                    </select>
                  </label>
                  <label class="label">Avtomatik javob
                    <select v-model="settingsForm.auto_reply" class="select">
                      <option value="false">O‘chirilgan</option>
                      <option value="true">AI yoki bot</option>
                    </select>
                  </label>
                  <label class="label">Yopish tegi
                    <input v-model.trim="settingsForm.done_tag" class="input" placeholder="#done" />
                  </label>
                  <label class="label">Asosiy guruh raqami
                    <input v-model.trim="settingsForm.main_group_id" class="input" placeholder="-1001234567890" />
                  </label>
                  <label class="label">Guruh xabari saqlansa
                    <select v-model="settingsForm.group_message_audit" class="select">
                      <option value="true">Main guruhga xabar berish</option>
                      <option value="false">Xabar bermaslik</option>
                    </select>
                  </label>
                  <label class="label">So‘rov aniqlash rejimi
                    <select v-model="settingsForm.request_detection" class="select">
                      <option value="keyword">Kalit so‘z</option>
                      <option value="all_private_keyword_group">Shaxsiy chatlar hammasi, guruhlar kalit so‘z bilan
                      </option>
                    </select>
                  </label>
                  <button class="btn primary" :disabled="loadingAction === 'saveSettings'">{{ loadingAction ===
                    'saveSettings' ? 'Saqlamoqda...' : 'Sozlamani saqlash' }}</button>
                </form>
                <div class="webhook-panel">
                  <div>
                    <div class="card-title">Telegram ulanishi</div>
                  </div>
                  <div class="actions webhook-actions">
                    <button class="btn" :disabled="loadingAction === 'webhookInfo'" @click="checkTelegramWebhook">{{
                      loadingAction === 'webhookInfo' ? 'Tekshirilmoqda...' : 'Holatni ko‘rish' }}</button>
                    <button class="btn primary" :disabled="loadingAction === 'webhookConnect'"
                      @click="reconnectTelegramWebhook">{{ loadingAction === 'webhookConnect' ? 'Ulanmoqda...' :
                        'Telegram ulanishini yangilash' }}</button>
                    <button class="btn" :disabled="loadingAction === 'webhookSync'" @click="syncTelegramUpdates">{{
                      loadingAction === 'webhookSync' ? 'Olinmoqda...' : 'Webhooksiz sinxronlash' }}</button>
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
                    <div class="card-title">Integratsiya</div>
                    <div class="card-note">Model ulanishi va asosiy guruhga yuboriladigan log oqimlari</div>
                  </div>
                  <span class="status-pill" :class="{ ready: aiIntegrationReady, error: aiIntegrationHasError }">{{
                    aiIntegrationStatus }}</span>
                </div>
                <form class="form settings-form integration-form" @submit.prevent="saveIntegration">
                  <label class="label">Xizmat turi
                    <select v-model="integrationForm.provider" class="select">
                      <option value="openai_compatible">OpenAI formatiga mos</option>
                    </select>
                  </label>
                  <label class="label">Model nomi
                    <input v-model.trim="integrationForm.label" class="input" placeholder="Uyqur AI" />
                  </label>
                  <label class="label">Asosiy manzil
                    <input v-model.trim="integrationForm.base_url" class="input"
                      placeholder="https://api.openai.com/v1" />
                  </label>
                  <label class="label">Model
                    <input v-model.trim="integrationForm.model" class="input" placeholder="gpt-4o-mini" />
                  </label>
                  <label class="label">API kalit
                    <input v-model="integrationForm.api_key" class="input" type="password"
                      autocomplete="new-password"
                      :placeholder="integrationForm.has_api_key ? 'Saqlangan kalitni almashtirish' : 'sk-...'" />
                  </label>
                  <label class="label">Holat
                    <select v-model="integrationForm.enabled" class="select">
                      <option :value="true">Faol</option>
                      <option :value="false">O‘chirilgan</option>
                    </select>
                  </label>
                  <label class="label wide">Tizim ko‘rsatmasi
                    <textarea v-model="integrationForm.system_prompt" class="textarea tall"></textarea>
                  </label>
                  <button class="btn primary"
                    :disabled="loadingAction === 'saveIntegration' || loadingAction === 'extractKnowledge'">
                    {{ loadingAction === 'saveIntegration' ? 'Saqlamoqda...' : 'Integratsiyani saqlash' }}
                  </button>
                </form>
                <div class="integration-note log-settings-panel">
                  <div class="settings-head compact">
                    <div>
                      <div class="card-title">Asosiy guruh loglari</div>
                      <div class="card-note">Xato va oddiy loglar tanlangan bo‘lsa asosiy guruhga yuboriladi</div>
                    </div>
                    <span class="status-pill" :class="{ ready: logForm.enabled, 'muted-status': !logForm.enabled }">
                      {{ logForm.enabled ? 'Yoqilgan' : 'O‘chiq' }}
                    </span>
                  </div>
                  <div class="log-settings-grid">
                    <label class="switch-row">
                      <input v-model="logForm.enabled" type="checkbox" />
                      <span>Log yuborishni yoqish</span>
                    </label>
                    <label class="label">Qayerga yuboriladi
                      <select v-model="logForm.target" class="select">
                        <option value="main_group">Asosiy guruh</option>
                      </select>
                    </label>
                    <div class="log-levels">
                      <span>Yuboriladigan loglar</span>
                      <label><input v-model="logForm.levels" type="checkbox" value="error" /> Error log</label>
                      <label><input v-model="logForm.levels" type="checkbox" value="info" /> Oddiy log</label>
                    </div>
                    <label class="label">Test turi
                      <select v-model="logForm.test_level" class="select">
                        <option value="info">Oddiy log</option>
                        <option value="error">Error log</option>
                      </select>
                    </label>
                  </div>
                  <div class="log-channel-panel">
                    <div class="drilldown-label">Log kanallari</div>
                    <div v-if="logForm.sources.length" class="log-channel-list">
                      <article v-for="(source, index) in logForm.sources"
                        :key="source.id || `${source.chat_id}-${index}`" class="log-channel-item">
                        <label class="label">Kanal nomi
                          <input v-model.trim="source.label" class="input" placeholder="Server loglari" />
                        </label>
                        <label class="label">Kanal raqami
                          <input v-model.trim="source.chat_id" class="input" placeholder="-100..." />
                        </label>
                        <label class="label">Manba
                          <select v-model="source.source" class="select">
                            <option value="backend">Backend</option>
                            <option value="web">Veb</option>
                            <option value="mobile">Mobil</option>
                            <option value="other">Boshqa</option>
                          </select>
                        </label>
                        <label class="switch-row compact">
                          <input v-model="source.enabled" type="checkbox" />
                          <span>Faol</span>
                        </label>
                        <button class="btn small danger" type="button" @click="removeLogSource(index)">Olib
                          tashlash</button>
                      </article>
                    </div>
                    <div v-else class="empty compact">Hali log kanali qo‘shilmagan</div>

                    <div class="log-channel-add">
                      <input v-model.trim="logSourceDraft.label" class="input" placeholder="Kanal nomi" />
                      <input v-model.trim="logSourceDraft.chat_id" class="input" placeholder="Kanal raqami: -100..." />
                      <select v-model="logSourceDraft.source" class="select">
                        <option value="backend">Backend</option>
                        <option value="web">Veb</option>
                        <option value="mobile">Mobil</option>
                        <option value="other">Boshqa</option>
                      </select>
                      <button class="btn" type="button" @click="addLogSource">Kanal qo‘shish</button>
                    </div>
                  </div>
                  <div class="actions">
                    <button class="btn primary" type="button" :disabled="loadingAction === 'saveLogSettings'"
                      @click="saveLogSettings">{{ loadingAction === 'saveLogSettings' ? 'Saqlanmoqda...' :
                        'Log sozlamasini saqlash' }}</button>
                    <button class="btn" type="button" :disabled="loadingAction === 'testLog'" @click="sendTestLog">{{
                      loadingAction === 'testLog' ? 'Yuborilmoqda...' : 'Test log yuborish' }}</button>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'knowledgeBase'">
            <div class="settings-stack integration-stack">
              <section class="card pad settings-card">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Bilim bazasi</div>
                    <div class="card-note">AI o‘qitish matni va import qilinadigan hujjatlar</div>
                  </div>
                  <span class="status-pill" :class="{ ready: aiIntegrationReady, error: aiIntegrationHasError }">{{
                    aiIntegrationStatus }}</span>
                </div>
                <form class="form settings-form" @submit.prevent="saveIntegration">
                  <label class="label">Bilim bazasi
                    <textarea v-model="integrationForm.knowledge_text" class="textarea tall knowledge-area"
                      placeholder="Uyqur dasturi bo‘yicha ichki qo‘llanma, savol-javoblar va tushuntirishlar..."></textarea>
                  </label>
                  <label class="label">PDF, Word, Excel yoki matn fayl
                    <input class="input" type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
                      :disabled="loadingAction === 'extractKnowledge'" @change="importKnowledgeFiles" />
                  </label>
                  <button class="btn primary"
                    :disabled="loadingAction === 'saveIntegration' || loadingAction === 'extractKnowledge'">
                    {{ loadingAction === 'saveIntegration' ? 'Saqlamoqda...' : 'Bilim bazasini saqlash' }}
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
      <Modal v-if="modal === 'customPeriod'" title="Ixtiyoriy davr" @close="cancelCustomPeriod">
        <form class="form two custom-period-form" @submit.prevent="applyCustomPeriod">
          <label class="label">Boshlanish sanasi
            <input v-model="customPeriodForm.start" class="input" type="date" required />
          </label>
          <label class="label">Tugash sanasi
            <input v-model="customPeriodForm.end" class="input" type="date" required />
          </label>
          <p v-if="customPeriodError" class="form-error">{{ customPeriodError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="cancelCustomPeriod">Bekor qilish</button>
            <button class="btn primary" type="submit" :disabled="loadingAction === 'customPeriod'">
              {{ loadingAction === 'customPeriod' ? 'Yuklanmoqda...' : 'Qo‘llash' }}
            </button>
          </div>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employee'" title="Xodim" @close="closeModal">
        <form class="form two" @submit.prevent="saveEmployee">
          <label class="label">Ism
            <input v-model.trim="employeeForm.full_name" class="input" placeholder="Xodim ismi" />
          </label>
          <label class="label">Telegram raqami
            <input v-model.trim="employeeForm.tg_user_id" class="input" placeholder="123456789" />
          </label>
          <label class="label">Foydalanuvchi nomi
            <input v-model.trim="employeeForm.username" class="input" placeholder="foydalanuvchi nomi" />
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
          <label class="label">Holat
            <select v-model="employeeForm.is_active" class="select">
              <option :value="true">Faol</option>
              <option :value="false">O‘chirilgan</option>
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
          :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
          <template #requestReply="{ row }">
            <button class="btn small" type="button" :disabled="row.status !== 'open'"
              @click.stop="openRequestReply(row)">Javob</button>
          </template>
        </DataTable>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'assignCompany'" title="Guruhni kompaniyaga biriktirish" @close="closeModal">
        <form class="form" @submit.prevent="saveGroupCompanyAssignment(false)">
          <label class="label">Guruh
            <input class="input" :value="selectedTarget?.title || selectedTarget?.chat_id || '—'" disabled />
          </label>
          <label class="label">Kompaniya qidirish
            <input v-model.trim="companyAssignForm.search" class="input"
              placeholder="Kompaniya, brand, direktor yoki telefon..." />
          </label>
          <label class="label">Kompaniya
            <select v-model="companyAssignForm.companyKey" class="select">
              <option value="">Biriktirilmagan</option>
              <option v-for="company in assignCompanyOptions" :key="company.assign_key" :value="company.assign_key">
                {{ companyAssignLabel(company) }}
              </option>
            </select>
          </label>
          <div class="assignment-preview">
            <span>Hozirgi biriktirish</span>
            <b>{{ selectedTarget?.company_name || 'Biriktirilmagan' }}</b>
          </div>
          <div class="actions">
            <button class="btn primary" :disabled="loadingAction === 'assignCompany'">
              {{ loadingAction === 'assignCompany' ? 'Biriktirilmoqda...' : 'Biriktirishni saqlash' }}
            </button>
            <button v-if="selectedTarget?.company_name || selectedTarget?.company_id" class="btn danger" type="button"
              :disabled="loadingAction === 'assignCompany'" @click="saveGroupCompanyAssignment(true)">
              Kompaniyadan ajratish
            </button>
          </div>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'ticketList'" :title="ticketList.title" wide @close="closeModal">
        <div class="ticket-list-modal">
          <p class="modal-subtitle">Tanlangan davr bo‘yicha jami, ochiq va yopilgan ticketlar</p>
          <div class="ticket-filter-tabs">
            <button type="button" :class="{ active: ticketList.active === 'all' }" @click="ticketList.active = 'all'">
              Jami ticketlar <span>{{ fmtNumber(ticketListCounts.all) }}</span>
            </button>
            <button type="button" :class="{ active: ticketList.active === 'open' }" @click="ticketList.active = 'open'">
              Ochiq ticketlar <span class="danger">{{ fmtNumber(ticketListCounts.open) }}</span>
            </button>
            <button type="button" :class="{ active: ticketList.active === 'closed' }"
              @click="ticketList.active = 'closed'">
              Yopilgan ticketlar <span class="success">{{ fmtNumber(ticketListCounts.closed) }}</span>
            </button>
          </div>
          <div class="ticket-list-toolbar">
            <input v-model.trim="ticketListSearch" class="input"
              placeholder="Ticket ID, so‘rov matni, kompaniya bo‘yicha qidirish" />
            <select v-model="ticketListSupport" class="select">
              <option v-for="option in ticketListSupportOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <!-- <div class="ticket-list-meta">
            <span>Ko‘rsatilmoqda: {{ fmtNumber(filteredTicketListRows.length) }} ta ticket</span>
            <div>
              <b>Jami: {{ fmtNumber(ticketListCounts.all) }}</b>
              <b class="danger">Ochiq: {{ fmtNumber(ticketListCounts.open) }}</b>
              <b class="success">Yopilgan: {{ fmtNumber(ticketListCounts.closed) }}</b>
            </div>
          </div> -->
          <DataTable :columns="ticketListColumns" :rows="filteredTicketListRows" empty="Ticket topilmadi"
            :page-size="10" :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
            <template #requestReply="{ row }">
              <button v-if="row.status === 'open'" class="btn small primary" type="button"
                @click.stop="openRequestReply(row)">Javob berish</button>
              <button v-else class="btn small" type="button" @click.stop="loadChatDetail(row)">Ko‘rish</button>
            </template>
          </DataTable>
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'openRequests'" :title="openRequestsTitle" wide @close="closeModal">
        <DataTable :columns="openRequestColumns" :rows="dashboard.openRequests || []" empty="Ochiq so‘rov qolmagan"
          :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
          <template #requestReply="{ row }">
            <button class="btn small" type="button" @click.stop="openRequestReply(row)">Javob</button>
          </template>
        </DataTable>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'metricDetail'" :title="metricDetail.title" wide @close="closeModal">
        <div v-if="metricDetail.chatPane" class="metric-chat-workspace">
          <section class="metric-table-panel">
            <div v-if="metricDetail.summary?.length" class="detail-summary metric-detail-summary metric-chat-summary">
              <div v-for="item in metricDetail.summary" :key="item.label">
                <span>{{ item.label }}</span>
                <b>{{ item.value }}</b>
              </div>
            </div>
            <DataTable :columns="metricDetail.columns" :rows="metricDetail.rows" :empty="metricDetail.empty"
              :page-size="metricDetail.pageSize || 12" :on-cell-action="handleMetricDetailCellAction"
              :row-class="metricDetailRowClass" />
          </section>

          <section class="detail-section metric-chat-panel">
            <Transition name="fade-slide-up" mode="out-in">
              <div v-if="metricChatDetail.chat" :key="metricChatDetail.chat.chat_id" class="chat-pane-shell">
                <div class="metric-chat-header">
                  <div>
                    <div class="card-title">{{ metricChatTitle }}</div>
                    <div class="card-note">
                      {{ metricChatDetail.chat ? fmtNumber(metricChatConversation.length) + ' ta xabar' : 'Chat tanlang' }}
                    </div>
                  </div>
                  <span v-if="metricChatDetail.chat?.source_type" class="badge blue">
                    {{ sourceTypeLabel(metricChatDetail.chat.source_type) }}
                  </span>
                </div>

                <div v-if="metricChatLoading" class="metric-chat-state">
                  <span class="spinner" aria-hidden="true"></span>
                  <span>Chat yuklanmoqda...</span>
                </div>
                <div v-else-if="metricChatError" class="metric-chat-state error">
                  {{ metricChatError }}
                </div>
                <div v-else class="metric-chat-content">
                  <div class="metric-chat-stats">
                    <div>
                      <span>So‘rov</span>
                      <b>{{ fmtNumber(metricChatDetail.chat.total_requests) }}</b>
                    </div>
                    <div>
                      <span>Ochiq</span>
                      <b>{{ fmtNumber(metricChatDetail.chat.open_requests) }}</b>
                    </div>
                    <div>
                      <span>Yopilgan</span>
                      <b>{{ fmtNumber(metricChatDetail.chat.closed_requests) }}</b>
                    </div>
                  </div>

                  <section class="metric-request-strip">
                    <div class="metric-strip-head">
                      <b>So‘rovlar</b>
                      <div class="strip-head-actions">
                        <span>{{ fmtNumber(metricChatDetail.requests?.length) }}</span>
                        <button class="btn small" type="button" :disabled="!metricChatDetail.requests?.length"
                          @click="metricChatTicketsOpen = !metricChatTicketsOpen">
                          {{ ticketToggleLabel(metricChatTicketsOpen, metricChatDetail.requests?.length) }}
                        </button>
                      </div>
                    </div>
                    <div v-if="metricChatTicketsOpen && metricChatDetail.requests?.length" class="metric-request-list">
                      <article v-for="request in metricChatDetail.requests" :key="request.id" class="metric-request-card"
                        :class="{ open: request.status === 'open' }">
                        <div class="metric-request-head">
                          <span class="badge" :class="request.status === 'closed' ? 'green' : 'orange'">
                            {{ statusLabel(request.status) }}
                          </span>
                          <time>{{ fmtDate(request.created_at) }}</time>
                        </div>
                        <p>{{ request.initial_text || 'So‘rov matni yo‘q' }}</p>
                        <small v-if="request.solution_text">Javob: {{ request.solution_text }}</small>
                        <template v-if="request.status === 'open'">
                          <form v-if="isInlineReplyOpen(request)" class="inline-reply-form"
                            @submit.prevent="sendInlineRequestReply(request)">
                            <textarea v-model.trim="inlineReplyForm.text" class="textarea"
                              placeholder="Javob yozing..."></textarea>
                            <div>
                              <button class="btn small" type="button" @click="cancelInlineReply">Bekor</button>
                              <button class="btn small primary" type="submit" :disabled="loadingAction === 'replyRequest'">
                                Yuborish
                              </button>
                            </div>
                          </form>
                          <button v-else class="btn small primary" type="button" @click.stop="openInlineReply(request)">
                            Javob
                          </button>
                        </template>
                      </article>
                    </div>
                    <div v-else class="empty compact">{{ metricChatDetail.requests?.length ? 'Ticketlar yashirilgan' :
                      'Bu chatda so‘rov yo‘q' }}</div>
                  </section>

                  <div v-if="metricChatConversation.length" ref="metricChatThreadRef"
                    class="telegram-thread metric-chat-thread">
                    <TransitionGroup name="chat-msg">
                      <article v-for="message in metricChatConversation" :key="chatBubbleKey(message)" class="chat-bubble-row"
                        :class="{ outbound: message.direction === 'outbound' }">
                        <div class="chat-bubble" :class="{ 'ticket-message': !!message.request_text }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ? 'Xodim'
                            : 'Mijoz') }}</div>
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
                            <span v-if="message.request_text" class="chat-ticket">So‘rov</span>
                            <span class="chat-source">{{ messageSourceLabel(message) }}</span>
                            <time>{{ fmtChatTime(message.created_at) }}</time>
                          </div>
                        </div>
                      </article>
                    </TransitionGroup>
                  </div>
                  <div v-else class="empty compact">Dialog tarixi yo‘q</div>
                </div>
              </div>
              <div v-else :key="'empty'" class="metric-chat-state">Chapdagi ro‘yxatdan chat tanlang</div>
            </Transition>
          </section>
        </div>

        <div v-else class="detail-stack">
          <div v-if="metricDetail.summary?.length" class="detail-summary metric-detail-summary">
            <div v-for="item in metricDetail.summary" :key="item.label">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
            </div>
          </div>
          <DataTable :columns="metricDetail.columns" :rows="metricDetail.rows" :empty="metricDetail.empty"
            :page-size="metricDetail.pageSize || 12" :on-cell-action="handleTableCellAction" />
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'companyGroupActivity'" :title="companyGroupTitle" wide @close="closeModal">
        <div class="detail-stack company-group-modal">
          <section class="detail-summary">
            <div>
              <span>Guruhlar</span>
              <b>{{ fmtNumber(companyGroupDetail.company?.group_count || companyGroupRows.length) }}</b>
            </div>
            <div>
              <span>Xabarlar</span>
              <b>{{ fmtNumber(companyGroupDetail.company?.total_messages || companyGroupDetail.summary?.total_messages)
                }}</b>
            </div>
            <div>
              <span>Ticketlar</span>
              <b>{{ fmtNumber(companyGroupDetail.company?.total_requests || companyGroupDetail.summary?.total_requests)
                }}</b>
            </div>
            <div>
              <span>Ochiq</span>
              <b>{{ fmtNumber(companyGroupDetail.company?.open_requests || companyGroupDetail.summary?.open_requests)
                }}</b>
            </div>
          </section>

          <div class="employee-chat-layout company-group-layout">
            <aside class="employee-chat-list-panel">
              <div class="employee-chat-list-head">
                <b>Ulangan guruhlar</b>
                <span>{{ selectedPeriodLabel }} bo‘yicha kompaniya chatlari</span>
              </div>
              <div v-if="companyGroupRows.length" class="employee-chat-list">
                <button v-for="group in companyGroupRows" :key="companyGroupChatKey(group)" type="button"
                  :class="{ active: companyGroupChatKey(group) === companyGroupSelectedChatKey, 'has-open': chatHasOpenTickets(group) }"
                  @click="selectCompanyGroup(group)">
                  <span class="employee-chat-mini-avatar">
                    <img v-if="chatAvatarUrl(group)" :src="chatAvatarUrl(group)" alt="" />
                    <span v-else>{{ chatInitials(group) }}</span>
                  </span>
                  <span>
                    <b>{{ group.title || group.chat_id }}</b>
                    <small>{{ group.conversation?.[0]?.text || group.requests?.[0]?.initial_text || 'Yozishma tarixi'
                      }}</small>
                    <em>{{ fmtNumber(group.total_messages) }} xabar · {{ fmtNumber(group.total_requests) }} ticket · {{
                      fmtNumber(group.open_requests) }} ochiq</em>
                  </span>
                  <strong v-if="group.open_requests">{{ fmtNumber(group.open_requests) }}</strong>
                </button>
              </div>
              <div v-else class="empty compact">Ulangan guruhda yozishma topilmadi</div>
            </aside>

            <section class="employee-chat-pane">
              <Transition name="fade-slide-up" mode="out-in">
                <div v-if="selectedCompanyGroup" :key="companyGroupSelectedChatKey" class="chat-pane-shell">
                  <div class="employee-chat-pane-head">
                    <div>
                      <b>{{ selectedCompanyGroup.title || selectedCompanyGroup.chat_id }}</b>
                      <span>{{ fmtNumber(selectedCompanyGroup.total_messages) }} xabar · {{
                        fmtNumber(selectedCompanyGroup.total_requests) }} ticket · {{
                          fmtNumber(selectedCompanyGroup.closed_requests) }} yopilgan</span>
                    </div>
                    <button class="btn small" type="button" @click="loadChatDetail(selectedCompanyGroup)">
                      Chat tafsiloti
                    </button>
                  </div>

                  <section class="metric-request-strip company-request-strip">
                    <div class="metric-strip-head">
                      <b>Ticketlar</b>
                      <div class="strip-head-actions">
                        <span>{{ fmtNumber(companyGroupRequests.length) }}</span>
                        <button class="btn small" type="button" :disabled="!companyGroupRequests.length"
                          @click="companyGroupTicketsOpen = !companyGroupTicketsOpen">
                          {{ ticketToggleLabel(companyGroupTicketsOpen, companyGroupRequests.length) }}
                        </button>
                      </div>
                    </div>
                    <div v-if="companyGroupTicketsOpen && companyGroupRequests.length" class="metric-request-list">
                      <article v-for="request in companyGroupRequests" :key="request.id" class="metric-request-card"
                        :class="{ open: request.status === 'open' }">
                        <div class="metric-request-head">
                          <span class="badge" :class="request.status === 'closed' ? 'green' : 'orange'">
                            {{ statusLabel(request.status) }}
                          </span>
                          <time>{{ fmtDate(request.created_at) }}</time>
                        </div>
                        <p>{{ request.initial_text || 'So‘rov matni yo‘q' }}</p>
                        <small v-if="request.solution_text">Javob: {{ request.solution_text }}</small>
                        <template v-if="request.status === 'open'">
                          <form v-if="isInlineReplyOpen(request)" class="inline-reply-form"
                            @submit.prevent="sendInlineRequestReply(request)">
                            <textarea v-model.trim="inlineReplyForm.text" class="textarea"
                              placeholder="Javob yozing..."></textarea>
                            <div>
                              <button class="btn small" type="button" @click="cancelInlineReply">Bekor</button>
                              <button class="btn small primary" type="submit"
                                :disabled="loadingAction === 'replyRequest'">
                                Yuborish
                              </button>
                            </div>
                          </form>
                          <button v-else class="btn small primary" type="button" @click.stop="openInlineReply(request)">
                            Javob
                          </button>
                        </template>
                      </article>
                    </div>
                    <div v-else class="empty compact">{{ companyGroupRequests.length ? 'Ticketlar yashirilgan' :
                      'Bu guruhda ticket yo‘q' }}</div>
                  </section>

                  <div v-if="companyGroupConversation.length" ref="companyGroupThreadRef"
                    class="telegram-thread employee-profile-thread">
                    <TransitionGroup name="chat-msg">
                      <article v-for="message in companyGroupConversation" :key="chatBubbleKey(message)"
                        class="chat-bubble-row" :class="{ outbound: message.direction === 'outbound' }">
                        <div class="chat-bubble" :class="{ 'ticket-message': !!message.request_text }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ?
                            'Xodim' : 'Mijoz') }}</div>
                          <div v-if="message.media" class="chat-media">
                            <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)" class="chat-media-image"
                              :src="mediaUrl(message.media)" alt="" />
                            <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-video" :src="mediaUrl(message.media)" controls playsinline></video>
                            <audio v-else-if="isAudioMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-audio" :src="mediaUrl(message.media)" controls></audio>
                            <div v-else class="chat-media-placeholder">
                              {{ mediaPlaceholder(message.media) }}
                            </div>
                          </div>
                          <p v-if="message.text">{{ message.text }}</p>
                          <div class="chat-bubble-footer">
                            <span v-if="message.request_text" class="chat-ticket">Ticket</span>
                            <span class="chat-source">{{ messageSourceLabel(message) }}</span>
                            <time>{{ fmtChatTime(message.created_at) }}</time>
                          </div>
                        </div>
                      </article>
                    </TransitionGroup>
                  </div>
                  <div v-else class="empty compact">Bu guruhda xabar yo‘q</div>
                </div>
                <div v-else :key="'empty'" class="metric-chat-state">Chapdagi ro‘yxatdan guruh tanlang</div>
              </Transition>
            </section>
          </div>
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employeeGroups'" :title="employeeDrilldownTitle" wide @close="closeModal">
        <div v-if="employeeGroupActivity.length" class="drilldown-stack">
          <section v-for="group in employeeGroupActivity" :key="group.chat_id" class="drilldown-group">
            <div class="drilldown-head">
              <div>
                <div class="card-title">{{ group.title || group.chat_id }}</div>
                <div class="card-note">
                  {{ fmtNumber(group.message_count) }} xabar · {{ fmtNumber(group.closed_count) }} yopilgan · {{
                    fmtNumber(group.open_count) }} ochiq
                </div>
              </div>
              <div class="drilldown-actions">
                <button class="btn small" type="button" :disabled="!group.closed_requests?.length"
                  @click="toggleEmployeeGroupTickets(group)">
                  {{ ticketToggleLabel(isEmployeeGroupTicketsOpen(group), group.closed_requests?.length) }}
                </button>
                <button class="btn small" type="button" @click="loadChatDetail(group)">Chat tafsiloti</button>
              </div>
            </div>

            <div class="drilldown-columns">
              <div class="drilldown-panel">
                <div class="drilldown-label">Yozgan xabarlari</div>
                <div v-if="group.messages?.length" class="mini-list">
                  <article v-for="message in group.messages"
                    :key="message.id || message.message_id || message.created_at" class="mini-item">
                    <p>{{ message.text || 'Matn yo‘q' }}</p>
                    <time>{{ fmtDate(message.created_at) }}</time>
                  </article>
                </div>
                <div v-else class="empty compact">Xabar yo‘q</div>
              </div>

              <div class="drilldown-panel">
                <div class="drilldown-label">Yopilgan so‘rovlar</div>
                <div v-if="isEmployeeGroupTicketsOpen(group) && group.closed_requests?.length" class="mini-list">
                  <article v-for="request in group.closed_requests" :key="request.id" class="mini-item">
                    <b>{{ request.customer_name || 'Mijoz' }}</b>
                    <p>{{ request.initial_text || 'So‘rov matni yo‘q' }}</p>
                    <time>{{ fmtDate(request.closed_at) }}</time>
                  </article>
                </div>
                <div v-else class="empty compact">{{ group.closed_requests?.length ? 'Ticketlar yashirilgan' :
                  'Yopilgan so‘rov yo‘q' }}</div>
              </div>
            </div>
          </section>
        </div>
        <div v-else class="empty">Bugun yozgan guruhlar topilmadi</div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employeeCompanies'" :title="employeeSupportTitle" wide @close="closeModal">
        <div class="employee-support-modal">
          <header class="employee-support-head">
            <span class="employee-profile-avatar-wrap">
              <img v-if="employeeAvatarUrl(employeeProfile.employee)" class="employee-profile-avatar"
                :src="employeeAvatarUrl(employeeProfile.employee)" alt="" />
              <span v-else class="employee-profile-avatar fallback">{{ employeeInitials(employeeProfile.employee)
                }}</span>
            </span>
            <div class="employee-profile-title">
              <h2>{{ employeeProfile.employee?.full_name || employeeProfile.employee?.username || 'Xodim' }}</h2>
              <p>Support yozishmalari</p>
              <span>Davr: {{ selectedPeriodLabel }}</span>
              <div class="employee-profile-mini-stats">
                <span>
                  <small>Yopilgan</small>
                  <b>{{ fmtNumber(employeeProfile.summary?.closed_requests) }}</b>
                </span>
                <span>
                  <small>Ochiq</small>
                  <b>{{ fmtNumber(employeeProfile.summary?.open_requests) }}</b>
                </span>
                <span>
                  <small>Kompaniya</small>
                  <b>{{ fmtNumber(employeeProfile.summary?.company_total) }}</b>
                </span>
                <span>
                  <small>O‘rtacha</small>
                  <b>{{ fmtMinutes(employeeProfile.summary?.avg_close_minutes) }}</b>
                </span>
              </div>
            </div>
            <div class="employee-profile-pills">
              <span class="profile-pill">🛡️ SLA <b>{{ fmtPercent(employeeProfile.summary?.sla) }}</b></span>
              <span class="profile-pill">✅ Yopish foizi <b>{{ fmtPercent(employeeProfile.summary?.close_rate)
                  }}</b></span>
              <span class="profile-pill">⭐ Reyting <b>#{{ employeeProfile.rank || '—' }}</b></span>
            </div>
          </header>

          <div class="employee-chat-tabs">
            <button type="button" :class="{ active: employeeProfileTab === 'private' }"
              @click="setEmployeeProfileTab('private')">
              Lichka <span>{{ fmtNumber(employeeProfilePrivateChats.length) }}</span>
            </button>
            <button type="button" :class="{ active: employeeProfileTab === 'group' }"
              @click="setEmployeeProfileTab('group')">
              Guruhlar <span>{{ fmtNumber(employeeProfileGroupChats.length) }}</span>
            </button>
          </div>

          <div class="employee-chat-layout">
            <aside class="employee-chat-list-panel">
              <div class="employee-chat-list-head">
                <b>{{ employeeProfileTab === 'group' ? 'Guruh yozishmalari' : 'Shaxsiy yozishmalar' }}</b>
                <span>{{ selectedPeriodLabel }}dagi xodimga tegishli ticketlar</span>
              </div>
              <div v-if="employeeProfileVisibleChats.length" class="employee-chat-list">
                <button v-for="chat in employeeProfileVisibleChats" :key="employeeProfileChatKey(chat)" type="button"
                  :class="{ active: employeeProfileChatKey(chat) === employeeProfileSelectedChatKey, 'has-open': chatHasOpenTickets(chat) }"
                  @click="selectEmployeeProfileChat(chat)">
                  <span class="employee-chat-mini-avatar">
                    <img v-if="chatAvatarUrl(chat)" :src="chatAvatarUrl(chat)" alt="" />
                    <span v-else>{{ chatInitials(chat) }}</span>
                  </span>
                  <span>
                    <b>{{ chat.title || chat.chat_id }}</b>
                    <small>{{ chatPreview(chat) }}</small>
                    <em>{{ fmtNumber(chat.total_requests) }} ta ticket · {{ fmtNumber(chat.closed_count) }} yopilgan ·
                      {{
                        fmtNumber(chat.open_count) }} ochiq</em>
                  </span>
                  <strong v-if="chat.open_count">{{ fmtNumber(chat.open_count) }}</strong>
                </button>
              </div>
              <div v-else class="empty compact">Bu davrda yozishma topilmadi</div>
            </aside>

            <section class="employee-chat-pane">
              <Transition name="fade-slide-up" mode="out-in">
                <div v-if="selectedEmployeeProfileChat" :key="employeeProfileSelectedChatKey" class="chat-pane-shell">
                  <div class="employee-chat-pane-head">
                    <div>
                      <b>{{ selectedEmployeeProfileChat.title || selectedEmployeeProfileChat.chat_id }}</b>
                      <span>{{ fmtNumber(selectedEmployeeProfileChat.total_requests) }} ticket · {{
                        fmtNumber(selectedEmployeeProfileChat.open_count) }} ochiq · {{
                          fmtNumber(selectedEmployeeProfileChat.closed_count) }} yopilgan</span>
                    </div>
                    <button class="btn small" type="button" :disabled="!employeeProfileChatRequests.length"
                      @click="employeeProfileTicketsOpen = !employeeProfileTicketsOpen">
                      {{ ticketToggleLabel(employeeProfileTicketsOpen, employeeProfileChatRequests.length) }}
                    </button>
                  </div>

                  <div v-if="employeeProfileTicketsOpen && employeeProfileChatRequests.length"
                    class="employee-ticket-strip">
                    <article v-for="request in employeeProfileChatRequests" :key="request.id"
                      :class="{ open: request.status === 'open' }">
                      <div>
                        <b>Ticket #{{ shortId(request.id) }}</b>
                        <span>{{ statusLabel(request.status) }}</span>
                      </div>
                      <p>{{ request.initial_text || 'So‘rov matni yo‘q' }}</p>
                      <template v-if="request.status === 'open'">
                        <form v-if="isInlineReplyOpen(request)" class="inline-reply-form"
                          @submit.prevent="sendInlineRequestReply(request)">
                          <textarea v-model.trim="inlineReplyForm.text" class="textarea"
                            placeholder="Javob yozing..."></textarea>
                          <div>
                            <button class="btn small" type="button" @click="cancelInlineReply">Bekor</button>
                            <button class="btn small primary" type="submit"
                              :disabled="loadingAction === 'replyRequest'">
                              Yuborish
                            </button>
                          </div>
                        </form>
                        <button v-else class="btn small primary" type="button" @click.stop="openInlineReply(request)">
                          Javob
                        </button>
                      </template>
                    </article>
                  </div>

                  <div v-if="employeeProfileChatLoading" class="metric-chat-state">Chat yuklanmoqda...</div>
                  <div v-else-if="employeeProfileChatError" class="metric-chat-state error">{{ employeeProfileChatError
                    }}
                  </div>
                  <div v-else-if="employeeProfileConversation.length" ref="employeeProfileThreadRef"
                    class="telegram-thread employee-profile-thread">
                    <TransitionGroup name="chat-msg">
                      <article v-for="message in employeeProfileConversation" :key="chatBubbleKey(message)"
                        class="chat-bubble-row" :class="{ outbound: message.direction === 'outbound' }">
                        <div class="chat-bubble" :class="{ 'ticket-message': !!message.request_text }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ?
                            employeeProfile.employee?.full_name || 'Xodim' : 'Mijoz') }}</div>
                          <div v-if="message.media" class="chat-media">
                            <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)" class="chat-media-image"
                              :src="mediaUrl(message.media)" alt="" />
                            <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-video" :src="mediaUrl(message.media)" controls playsinline></video>
                            <audio v-else-if="isAudioMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-audio" :src="mediaUrl(message.media)" controls></audio>
                            <div v-else class="chat-media-placeholder">
                              {{ mediaPlaceholder(message.media) }}
                            </div>
                          </div>
                          <p v-if="message.text">{{ message.text }}</p>
                          <div class="chat-bubble-footer">
                            <span v-if="message.request_text" class="chat-ticket">So‘rov</span>
                            <span class="chat-source">{{ messageSourceLabel(message) }}</span>
                            <time>{{ fmtChatTime(message.created_at) }}</time>
                          </div>
                        </div>
                      </article>
                    </TransitionGroup>
                  </div>
                  <div v-else class="empty compact">Bu chatda xodimga tegishli dialog topilmadi</div>
                </div>
                <div v-else :key="'empty'" class="metric-chat-state">Chapdagi ro‘yxatdan chat tanlang</div>
              </Transition>
            </section>
          </div>
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employeeActivity'" :title="employeeDrilldownTitle" wide @close="closeModal">
        <div class="detail-stack">
          <div class="detail-summary">
            <div><span>Guruhlar</span><b>{{ fmtNumber(employeeActivity.summary?.handled_chats) }}</b></div>
            <div><span>Xabarlar</span><b>{{ fmtNumber(employeeActivity.summary?.message_count) }}</b></div>
            <div><span>Yopilgan so‘rov</span><b>{{ fmtNumber(employeeActivity.summary?.closed_requests) }}</b></div>
            <div><span>Mijozlar</span><b>{{ fmtNumber(employeeActivity.summary?.customer_count) }}</b></div>
          </div>

          <div v-if="employeeActivity.groups?.length" class="drilldown-stack">
            <section v-for="group in employeeActivity.groups" :key="group.chat_id" class="drilldown-group">
              <div class="drilldown-head">
                <div>
                  <div class="card-title">{{ group.title || group.chat_id }}</div>
                  <div class="card-note">
                    {{ fmtNumber(group.message_count) }} xabar · {{ fmtNumber(group.closed_count) }} yopilgan ·
                    {{ fmtNumber(group.customer_count) }} mijoz
                  </div>
                </div>
                <button class="btn small" type="button" @click="loadChatDetail(group)">Chat tafsiloti</button>
              </div>

              <div class="drilldown-columns">
                <div class="drilldown-panel">
                  <div class="drilldown-label">Javob bergan mijozlar</div>
                  <div v-if="group.closed_requests?.length" class="mini-list">
                    <article v-for="request in group.closed_requests" :key="request.id" class="mini-item">
                      <b>{{ request.customer_name || request.customer_username || 'Mijoz' }}</b>
                      <p>{{ request.initial_text || 'So‘rov matni yo‘q' }}</p>
                      <time>{{ fmtDate(request.closed_at) }}</time>
                    </article>
                  </div>
                  <div v-else class="empty compact">Yopilgan so‘rov yo‘q</div>
                </div>

                <div class="drilldown-panel">
                  <div class="drilldown-label">Yozgan xabarlari</div>
                  <div v-if="group.messages?.length" class="mini-list">
                    <article v-for="message in group.messages"
                      :key="message.id || message.message_id || message.created_at" class="mini-item">
                      <p>{{ message.text || 'Matn yo‘q' }}</p>
                      <time>{{ fmtDate(message.created_at) }}</time>
                    </article>
                  </div>
                  <div v-else class="empty compact">Xabar yo‘q</div>
                </div>
              </div>
            </section>
          </div>
          <div v-else class="empty">Bu davrda xodim javoblari topilmadi</div>
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'employeeOpenRequests'" :title="employeeDrilldownTitle" wide @close="closeModal">
        <DataTable :columns="employeeOpenRequestColumns" :rows="employeeOpenRequests" empty="Ochiq qolgan so‘rov yo‘q"
          :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
          <template #requestReply="{ row }">
            <button class="btn small" type="button" @click.stop="openRequestReply(row)">Javob</button>
          </template>
        </DataTable>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'requestReply'" title="Ochiq so‘rovga javob" @close="closeModal">
        <form class="form" @submit.prevent="sendRequestReply">
          <label class="label">Mijoz
            <input class="input" :value="requestReplyForm.customer_name || requestReplyForm.chat_id || '—'" disabled />
          </label>
          <label class="label">So‘rov matni
            <textarea class="textarea" :value="requestReplyForm.initial_text || '—'" disabled></textarea>
          </label>
          <label class="label">Javob
            <textarea v-model.trim="requestReplyForm.text" class="textarea"
              placeholder="Mijozga yuboriladigan javob..."></textarea>
          </label>
          <button class="btn primary" :disabled="loadingAction === 'replyRequest'">
            {{ loadingAction === 'replyRequest' ? 'Yuborilmoqda...' : 'Javob berib yopish' }}
          </button>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'chatDetail'" :title="chatDetailTitle" wide @close="closeModal">
        <div class="detail-stack">
          <section class="detail-summary">
            <div>
              <span>So‘rovlar</span>
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

          <div class="chat-detail-layout">
            <section class="detail-section ticket-panel">
              <div class="detail-section-head">
                <div>
                  <div class="card-title">So‘rovlar va yechimlar</div>
                  <div class="card-note">{{ fmtNumber(chatDetail.requests?.length) }} ta yozuv</div>
                </div>
                <button class="btn small" type="button" :disabled="!chatDetail.requests?.length"
                  @click="chatTicketsOpen = !chatTicketsOpen">
                  {{ ticketToggleLabel(chatTicketsOpen, chatDetail.requests?.length) }}
                </button>
              </div>
              <DataTable v-if="chatTicketsOpen" :columns="chatRequestColumns" :rows="chatDetail.requests || []"
                empty="Bu chatda so‘rov yo‘q" :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
                <template #requestReply="{ row }">
                  <button class="btn small" type="button" :disabled="row.status !== 'open'"
                    @click.stop="openRequestReply(row)">Javob</button>
                </template>
              </DataTable>
              <div v-else class="empty compact">Ticketlar yashirilgan</div>
            </section>

            <section class="detail-section dialog-panel">
              <div class="detail-section-head">
                <div class="card-title">Dialog</div>
                <div class="card-note">{{ fmtNumber(chatConversation.length) }} ta xabar</div>
              </div>
              <div v-if="chatConversation.length" ref="chatDetailThreadRef" class="telegram-thread">
                <article v-for="message in chatConversation" :key="chatBubbleKey(message)" class="chat-bubble-row"
                  :class="{ outbound: message.direction === 'outbound' }">
                  <div class="chat-bubble" :class="{ 'ticket-message': !!message.request_text }">
                    <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ? 'Xodim'
                      :
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
                      <span v-if="message.request_text" class="chat-ticket">So‘rov</span>
                      <span class="chat-source">{{ messageSourceLabel(message) }}</span>
                      <time>{{ fmtChatTime(message.created_at) }}</time>
                    </div>
                  </div>
                </article>
              </div>
              <div v-else class="empty compact">Dialog tarixi yo‘q</div>
            </section>
          </div>

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
                <small v-if="item.request_text && item.type !== 'ticket'">So‘rov: {{ item.request_text }}</small>
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
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { api, getToken, setToken } from './api';

const ACTIVE_TAB_STORAGE_KEY = 'uyqur_support_active_tab';
const THEME_STORAGE_KEY = 'uyqur_support_theme';
const COMPARISON_STORAGE_KEY = 'uyqur_support_comparison_enabled';
const TELEGRAM_AUTO_SYNC_INTERVAL_MS = 25_000;
const tabs = [
  { key: 'stats', label: 'Support performance', icon: '📊' },
  { key: 'productAnalytics', label: 'Product analytics', icon: '📈' },
  { key: 'companyActivity', label: 'Company activity', icon: '🏢' },
  { key: 'groups', label: 'Bot ulangan guruhlar', icon: '👥' },
  { key: 'employees', label: 'Xodimlar', icon: '🧑‍💼' },
  { key: 'companies', label: 'Kompaniyalar', icon: '🏬' },
  { key: 'integrations', label: 'Integratsiya', icon: '🔌' },
  { key: 'privates', label: 'Mijozlar', icon: '💬' },
  { key: 'knowledgeBase', label: 'Bilim bazasi', icon: '📚' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️' }
];
const mainTabKeys = ['stats', 'productAnalytics', 'companyActivity'];
const otherTabKeys = ['groups', 'employees', 'companies', 'integrations', 'privates', 'knowledgeBase'];

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

function getStoredThemeMode() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return ['system', 'light', 'dark'].includes(stored) ? stored : 'light';
}

function getStoredComparisonEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(COMPARISON_STORAGE_KEY) !== 'false';
}

function applyThemeMode(mode) {
  if (typeof document === 'undefined') return;
  if (mode === 'light' || mode === 'dark') {
    document.documentElement.dataset.theme = mode;
  } else {
    delete document.documentElement.dataset.theme;
  }
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
const previousStatsPeriod = ref('week');
const actionMenuOpen = ref(false);
const actionMenuRef = ref(null);
const rankingMenuOpen = ref(false);
const rankingMenuRef = ref(null);
const comparisonEnabled = ref(getStoredComparisonEnabled());
const themeMode = ref(getStoredThemeMode());
applyThemeMode(themeMode.value);
const selectedGroups = ref([]);
const selectedEmployees = ref([]);
const otherMenuOpen = ref(otherTabKeys.includes(activeTab.value));
const dashboard = reactive({ summary: {}, employeeStats: [], chatStats: [], openRequests: [], analytics: {} });
const groups = ref([]);
const privates = ref([]);
const employees = ref([]);
const companyInfo = ref({ summary: {}, companies: [], fetched_at: '', source: '' });
const requestRows = ref([]);
const ticketList = ref({ rows: [], active: 'all', mode: 'all', title: 'Ticketlar ro‘yxati' });
const ticketListSearch = ref('');
const ticketListSupport = ref('all');
const chatDetail = ref({ chat: null, requests: [], timeline: [] });
const chatTicketsOpen = ref(true);
const metricChatDetail = ref({ chat: null, requests: [], conversation: [] });
const metricChatLoading = ref(false);
const metricChatError = ref('');
const metricChatSelectedId = ref('');
const metricChatTicketsOpen = ref(true);
const metricChatThreadRef = ref(null);
const chatDetailThreadRef = ref(null);
const employeeProfileThreadRef = ref(null);
const companyGroupThreadRef = ref(null);
const employeeDrilldown = ref(null);
const employeeActivity = ref({ employee: null, summary: {}, groups: [], closed_requests: [], messages: [] });
const employeeCompanyDetail = ref({ employee: null, summary: {}, companies: [] });
const employeeProfile = ref({ employee: null, rank: null, summary: {}, groups: [], companies: [] });
const employeeProfileTab = ref('private');
const employeeProfileSelectedChatKey = ref('');
const employeeProfileChatDetail = ref({ chat: null, requests: [], conversation: [] });
const employeeProfileChatLoading = ref(false);
const employeeProfileChatError = ref('');
const employeeProfileTicketsOpen = ref(false);
const metricDetail = ref({ title: '', columns: [], rows: [], empty: 'Ma’lumot yo‘q', pageSize: 12, summary: [] });
const employeeGroupActivity = ref([]);
const employeeGroupTicketVisibility = ref({});
const employeeOpenRequests = ref([]);
const companyGroupDetail = ref({ company: null, summary: {}, groups: [] });
const companyGroupSelectedChatKey = ref('');
const companyGroupTicketsOpen = ref(true);
const employeeAvatarUrls = ref({});
const employeeAvatarLoading = ref({});
const chatAvatarUrls = ref({});
const chatAvatarLoading = ref({});
const mediaUrls = ref({});
const mediaLoading = ref({});
const mediaErrors = ref({});
let mediaLoadToken = 0;
let employeeProfileLoadToken = 0;
let employeeProfileChatToken = 0;
const settingsRaw = ref({ settings: [], admins: [] });
const webhookStatus = ref(null);
const telegramAutoSync = ref({ enabled: false, running: false, last_synced_at: '', fetched: 0, processed: 0, errors: 0, error: '' });
const showLoginPassword = ref(false);
const loginStatus = ref('');
const loginStatusType = ref('');
const loginError = ref('');
const nowTick = ref(Date.now());
let durationTimer = null;
let telegramAutoSyncTimer = null;
let telegramAutoSyncBusy = false;
let modalScrollY = 0;

const settingsForm = reactive({ ai_mode: 'false', auto_reply: 'true', done_tag: '#done', main_group_id: '', group_message_audit: 'true', request_detection: 'keyword' });
const isManagerMode = computed(() => false);
const mainTabs = computed(() => tabs.filter(tab => mainTabKeys.includes(tab.key)));
const otherTabs = computed(() => tabs.filter(tab => otherTabKeys.includes(tab.key)));
const isOtherTabActive = computed(() => otherTabKeys.includes(activeTab.value));
const settingsTab = tabs.find(tab => tab.key === 'settings');
watch(activeTab, key => {
  actionMenuOpen.value = false;
  rankingMenuOpen.value = false;
  if (otherTabKeys.includes(key)) otherMenuOpen.value = true;
});

watch(comparisonEnabled, value => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COMPARISON_STORAGE_KEY, value ? 'true' : 'false');
});

function setModalScrollLock(locked) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const body = document.body;
  if (locked) {
    if (body.classList.contains('modal-open')) return;
    modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    body.style.top = `-${modalScrollY}px`;
    body.classList.add('modal-open');
    return;
  }
  if (!body.classList.contains('modal-open')) return;
  body.classList.remove('modal-open');
  body.style.top = '';
  window.scrollTo(0, modalScrollY);
}

watch(modal, value => {
  setModalScrollLock(Boolean(value));
});

const loginForm = reactive({ username: 'admin', password: '' });
const messageForm = reactive({ text: '' });
const requestReplyForm = reactive({ request_id: '', chat_id: '', customer_name: '', initial_text: '', text: '' });
const inlineReplyForm = reactive({ request_id: '', text: '' });
const broadcastForm = reactive({ target_type: 'groups', title: 'Yangilik', text: '' });
const customPeriodForm = reactive({ start: '', end: '', appliedStart: '', appliedEnd: '' });
const customPeriodError = ref('');
const companyAssignForm = reactive({ companyKey: '', search: '' });
const employeeForm = reactive({ id: '', tg_user_id: '', full_name: '', username: '', phone: '', role: 'support', is_active: true });
const adminForm = reactive({ username: 'admin', full_name: 'Tizim admini', new_password: '' });
const integrationForm = reactive({
  enabled: true,
  provider: 'openai_compatible',
  label: 'Uyqur AI',
  base_url: 'https://api.openai.com/v1',
  model: '',
  api_key: '',
  has_api_key: false,
  system_prompt: '',
  knowledge_text: '',
  last_check_status: '',
  last_checked_at: '',
  last_check_error: ''
});
const logForm = reactive({ enabled: false, levels: ['error'], target: 'main_group', sources: [], test_level: 'info' });
const logSourceDraft = reactive({ chat_id: '', label: '', source: 'backend' });
const savedIntegrationSignature = ref('');

const current = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0]);
const currentTitle = computed(() => current.value.label);
const userInitials = computed(() => {
  const source = adminForm.full_name || adminForm.username || 'Uyqur';
  return String(source).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'UQ';
});
const currentSubtitle = computed(() => ({
  stats: 'Xodimlar faolligi, javob tezligi va ochiq so‘rovlar nazorati',
  productAnalytics: 'Uyqur dasturidan foydalanish, biznes status va obuna risklari',
  companyActivity: 'Kompaniyalar holati, support biriktirilishi va obuna nazorati',
  groups: 'Bot ulangan guruhlar, so‘rov oqimi va mijoz murojaatlari',
  employees: 'Xodimlar aktivligi, javoblar va ochiq vazifalar',
  companies: 'Uyqur API’dan kelgan kompaniyalar, mas’ul va obuna ma’lumotlari',
  integrations: 'Tashqi ulanishlar va keyingi log oqimlari uchun boshqaruv',
  privates: 'Mijozlar bilan shaxsiy va biznes chatlar',
  knowledgeBase: 'AI o‘qitish matnlari, fayllar va modelga beriladigan bilim',
  settings: 'Bot, admin va Telegram ulanishi sozlamalari'
}[activeTab.value] || 'Texnik yordam paneli'));
const loginFeedback = computed(() => loginError.value || loginStatus.value);
const loginButtonText = computed(() => loadingAction.value === 'login' ? 'Tekshirilmoqda...' : 'Kirish');
function aiConnectionSignature(source = {}) {
  return [
    source.enabled !== false,
    source.provider || 'openai_compatible',
    source.base_url || '',
    source.model || '',
    Boolean(source.has_api_key)
  ].join('|');
}

const aiIntegrationDirty = computed(() => Boolean(
  integrationForm.api_key
  || (savedIntegrationSignature.value && aiConnectionSignature(integrationForm) !== savedIntegrationSignature.value)
));
const aiIntegrationReady = computed(() => !!(
  integrationForm.enabled
  && integrationForm.model
  && (integrationForm.api_key || integrationForm.has_api_key)
  && integrationForm.last_check_status === 'ok'
  && !aiIntegrationDirty.value
));
const aiIntegrationHasError = computed(() => ['error', 'failed'].includes(integrationForm.last_check_status));
const aiModelOptionLabel = computed(() => aiIntegrationReady.value
  ? `${integrationForm.label || integrationForm.model} modeli`
  : 'AI modeli tekshirilmagan');
const aiIntegrationStatus = computed(() => {
  if (!integrationForm.enabled) return 'O‘chiq';
  if (aiIntegrationReady.value) return 'Ulangan va tekshirildi';
  if (aiIntegrationHasError.value) return 'Ulanmadi';
  if (aiIntegrationDirty.value) return 'Qayta tekshirish kerak';
  if (integrationForm.last_check_status === 'incomplete') return 'Token yoki model kerak';
  return 'Tekshirilmagan';
});
const periodOptions = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: '7 kun' },
  { key: 'month', label: '1 oy' },
  { key: 'custom', label: 'Ixtiyoriy' }
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
const selectedPeriodLabel = computed(() => {
  if (selectedStatsPeriod.value === 'custom' && customPeriodForm.appliedStart && customPeriodForm.appliedEnd) {
    return `${dateInputLabel(customPeriodForm.appliedStart)} - ${dateInputLabel(customPeriodForm.appliedEnd)}`;
  }
  return periodOptions.find(period => period.key === selectedStatsPeriod.value)?.label || '7 kun';
});
const selectedPeriodStats = computed(() => analytics.value.periods?.[selectedStatsPeriod.value] || emptyPeriodStats);
const topEmployeeRows = computed(() => analytics.value.employeePerformance?.[selectedStatsPeriod.value] || []);
const chatPerformanceRows = computed(() => analytics.value.chatPerformance?.[selectedStatsPeriod.value] || []);
const groupPerformanceRows = computed(() => analytics.value.groupPerformance?.[selectedStatsPeriod.value] || []);
const periodRows = computed(() => periodOptions.map(period => ({
  ...(analytics.value.periods?.[period.key] || emptyPeriodStats),
  period_label: period.label
})));
const periodChartRows = computed(() => periodRows.value);
const periodChartMax = computed(() => Math.max(1, ...periodChartRows.value.map(row => Number(row.total_requests || 0))));
const responseTrendRows = computed(() => {
  const rows = analytics.value.responseTimeTrend?.[selectedStatsPeriod.value] || [];
  const normalized = rows
    .map(row => ({
      label: row.hour_label || row.label || row.period_label || '—',
      value: Number(row.avg_close_minutes ?? row.value ?? 0),
      closed_requests: Number(row.closed_requests || row.total_requests || 0)
    }))
    .filter(row => row.label && Number.isFinite(row.value));
  if (normalized.length >= 2) return normalized;
  return periodRows.value.map(row => ({
    label: row.period_label,
    value: Number(row.avg_close_minutes || 0),
    closed_requests: Number(row.closed_requests || 0)
  }));
});
const responseTrendMax = computed(() => niceChartMax(Math.max(1, ...responseTrendRows.value.map(row => Number(row.value || 0)))));
const responseTrendPoints = computed(() => lineChartPoints(responseTrendRows.value, responseTrendMax.value, {
  left: 50,
  right: 720,
  top: 24,
  bottom: 176
}));
const responseTrendPolyline = computed(() => responseTrendPoints.value.map(point => `${point.x},${point.y}`).join(' '));
const responseTrendYTicks = computed(() => chartYTicks(responseTrendMax.value, {
  left: 50,
  right: 720,
  top: 24,
  bottom: 176
}));
const ticketTrendRows = computed(() => (analytics.value.ticketAnswerTrend?.[selectedStatsPeriod.value] || [])
  .map(row => ({
    date_key: row.date_key || row.date || row.label,
    date_label: row.date_label || row.date || '—',
    weekday_label: row.weekday_label || row.weekday || '—',
    total_requests: Number(row.total_requests || 0),
    closed_requests: Number(row.closed_requests || 0),
    open_requests: Number(row.open_requests || 0),
    sla: Number(row.sla || row.close_rate || 0)
  }))
  .filter(row => row.date_key || row.total_requests || row.closed_requests || row.open_requests));
const ticketTrendMax = computed(() => Math.max(1, ...ticketTrendRows.value.map(row => Math.max(
  Number(row.total_requests || 0),
  Number(row.closed_requests || 0),
  Number(row.open_requests || 0)
))));
const companyTicketRows = computed(() => {
  const rows = mergeCompanyTicketRows([
    ...(analytics.value.companyTickets?.[selectedStatsPeriod.value] || []),
    ...companyApiTicketRows()
  ]);
  return rows
    .filter(row => Number(row.total_requests || 0) > 0
      || Number(row.message_count || 0) > 0
      || Number(row.ticket_like_messages || 0) > 0
      || !!row.company_id)
    .sort((a, b) => b.total_requests - a.total_requests || b.closed_requests - a.closed_requests || a.name.localeCompare(b.name))
    .slice(0, 30);
});
const companyTicketMax = computed(() => Math.max(1, ...companyTicketRows.value.map(row => Number(row.total_requests || 0))));
const supportSummaryCards = computed(() => {
  const stats = selectedPeriodStats.value;
  const cards = [
    {
      key: 'requests',
      title: selectedStatsPeriod.value === 'today' ? 'Bugungi so‘rovlar' : `${selectedPeriodLabel.value} so‘rovlar`,
      value: fmtNumber(stats.total_requests),
      note: `${fmtNumber(stats.unique_customers)} ta mijozdan kelgan`,
      icon: '🎫',
      action: 'requests',
      comparison: comparisonEnabled.value ? compareValue(stats.total_requests, stats.prev_total_requests) : null
    },
    {
      key: 'closed',
      title: 'Javob berilgan',
      value: fmtNumber(stats.closed_requests),
      note: `${fmtPercent(stats.close_rate)} so‘rov yopilgan`,
      icon: '✅',
      action: 'closed',
      comparison: comparisonEnabled.value ? compareValue(stats.closed_requests, stats.prev_closed_requests) : null
    },
    {
      key: 'open',
      title: 'Javobsiz',
      value: fmtNumber(stats.open_requests),
      note: `${fmtNumber(overdueOpenRequestsTotal.value)} tasi 30 daqiqadan oshgan`,
      icon: '⚠️',
      tone: 'danger',
      action: 'open'
    },
    {
      key: 'avg',
      title: 'O‘rtacha javob',
      value: fmtMinutes(stats.avg_close_minutes),
      note: `SLA: ${fmtPercent(stats.close_rate)}`,
      icon: '⏱️',
      action: 'avg',
      comparison: comparisonEnabled.value ? compareValue(stats.prev_avg_close_minutes, stats.avg_close_minutes) : null // Lower is better for time
    }
  ];

  return cards;
});
const topEmployeeChartRows = computed(() => topEmployeeRows.value.slice(0, 6));
const topEmployeeChartMax = computed(() => Math.max(1, ...topEmployeeChartRows.value.map(row => Number(row.closed_requests || 0))));
const groupChartRows = computed(() => groupPerformanceRows.value.slice(0, 6));
const groupChartMax = computed(() => Math.max(1, ...groupChartRows.value.map(row => Number(row.total_requests || 0))));
const managerStats = computed(() => dashboard.manager || {});
const managerOpenRequests = computed(() => (dashboard.openRequests || [])
  .slice()
  .sort((a, b) => openMinutes(b.created_at) - openMinutes(a.created_at)));
const employeeStatsMap = computed(() => new Map((dashboard.employeeStats || []).map(row => [String(row.id || row.employee_id || row.tg_user_id || row.full_name || ''), row])));
function employeeLookupKey(row = {}) {
  return String(row.employee_id || row.id || row.tg_user_id || row.full_name || '');
}
function performanceGrade(sla = 0, avgMinutes = 0) {
  const value = Number(sla || 0);
  const minutes = Number(avgMinutes || 0);
  if (value >= 92 && minutes <= 10) return 'A+';
  if (value >= 85) return 'A';
  if (value >= 75) return 'B';
  if (value >= 62) return 'C';
  return 'D';
}
function performanceGradeClass(grade = '') {
  if (grade === 'A+' || grade === 'A') return 'top';
  if (grade === 'B') return 'mid';
  return 'low';
}
function supportRowKey(row = {}) {
  const username = normalizeSupportUsername(row.username || row.uyqur_support_username);
  if (username) return `u:${username}`;
  const phone = normalizePhone(row.phone || row.uyqur_support_phone);
  if (phone) return `p:${phone}`;
  const tgUserId = String(row.tg_user_id || '').trim();
  if (tgUserId) return `tg:${tgUserId}`;
  const id = String(row.id || row.employee_id || '').trim();
  if (id) return `id:${id}`;
  return String(row.full_name || row.closed_by_name || '').trim().toLowerCase();
}

function mergeMetricOnce(current = {}, source = '', row = {}, field = 'closed_requests') {
  const sourceKey = `${source}:${row.id || row.employee_id || row.tg_user_id || row.full_name || row.username || Math.random()}`;
  const seenKey = `_${field}_seen`;
  const seen = current[seenKey] || new Set();
  if (seen.has(sourceKey)) return 0;
  seen.add(sourceKey);
  current[seenKey] = seen;
  return Number(row[field] || 0);
}

function mergeWeightedAverage(current = {}, source = '', row = {}) {
  const count = Number(row.closed_requests || row.today_answered_requests || 0);
  const avg = Number(row.avg_close_minutes || 0);
  if (!count || !avg) return;
  const sourceKey = `${source}:${row.id || row.employee_id || row.tg_user_id || row.full_name || row.username || Math.random()}:avg`;
  const seen = current._avg_seen || new Set();
  if (seen.has(sourceKey)) return;
  seen.add(sourceKey);
  current._avg_seen = seen;
  current._avg_weight = Number(current._avg_weight || 0) + count;
  current._avg_total = Number(current._avg_total || 0) + (avg * count);
}

function isAdminLikeEmployee(row = {}) {
  const role = String(row.role || '').trim().toLowerCase();
  if (['admin', 'owner', 'superadmin', 'system_admin'].includes(role)) return true;

  const username = normalizeSupportUsername(row.username || row.closed_by_username || '');
  const adminUsername = normalizeSupportUsername(adminForm.username || 'admin');
  if (username && adminUsername && username === adminUsername) return true;

  const name = String(row.full_name || row.closed_by_name || row.solution_by || '').trim().toLowerCase();
  const adminName = String(adminForm.full_name || '').trim().toLowerCase();
  if (adminName && name && name === adminName) return true;
  return ['admin', 'system admin', 'tizim admini'].includes(name);
}

function mergeSupportCandidate(map, row = {}, source = 'identity') {
  if (isAdminLikeEmployee(row)) return;
  const key = supportRowKey(row);
  if (!key) return;
  const current = map.get(key) || {};
  const username = normalizeSupportUsername(row.username || row.uyqur_support_username);
  const phone = row.phone || row.uyqur_support_phone || '';
  const periodClosed = source === 'period' ? mergeMetricOnce(current, source, row, 'closed_requests') : 0;
  const statsClosed = source === 'stats' ? mergeMetricOnce(current, source, row, 'closed_requests') : 0;
  const periodOpen = source === 'period' ? mergeMetricOnce(current, source, row, 'open_requests') : 0;
  const statsOpen = source === 'stats' ? mergeMetricOnce(current, source, row, 'open_requests') : 0;
  const statsTodayOpen = source === 'stats' ? mergeMetricOnce(current, source, row, 'today_open_requests') : 0;
  const periodHandled = source === 'period' ? mergeMetricOnce(current, source, row, 'handled_chats') : 0;
  const statsHandled = source === 'stats' ? mergeMetricOnce(current, source, row, 'handled_chats') : 0;
  mergeWeightedAverage(current, source, row);
  const avgCloseMinutes = Number(row.avg_close_minutes || current.avg_close_minutes || 0);
  map.set(key, {
    ...current,
    ...row,
    id: current.id || row.id || row.employee_id || '',
    employee_id: current.employee_id || row.employee_id || row.id || '',
    tg_user_id: current.tg_user_id || row.tg_user_id || '',
    username: current.username || username || '',
    phone: current.phone || phone || '',
    role: current.role || row.role || 'support',
    full_name: current.full_name || row.full_name || row.closed_by_name || (username ? `@${username}` : '') || phone || 'Xodim',
    period_closed_requests: Number(current.period_closed_requests || 0) + periodClosed,
    stats_closed_requests: Number(current.stats_closed_requests || 0) + statsClosed,
    period_open_requests: Number(current.period_open_requests || 0) + periodOpen,
    stats_open_requests: Number(current.stats_open_requests || 0) + statsOpen,
    stats_today_open_requests: Number(current.stats_today_open_requests || 0) + statsTodayOpen,
    period_handled_chats: Number(current.period_handled_chats || 0) + periodHandled,
    stats_handled_chats: Number(current.stats_handled_chats || 0) + statsHandled,
    avg_close_minutes: avgCloseMinutes
  });
}

const supportPerformanceRows = computed(() => {
  const merged = new Map();
  const openRequestMap = employeeOpenRequestSummaryMap();
  employees.value.filter(row => !isAdminLikeEmployee(row)).forEach(row => mergeSupportCandidate(merged, row, 'employee'));
  (dashboard.employeeStats || []).forEach(row => mergeSupportCandidate(merged, row, 'stats'));
  topEmployeeRows.value.forEach(row => mergeSupportCandidate(merged, row, 'period'));
  visibleCompanyInfoRows.value.forEach(company => {
    if (!hasCompanySupport(company)) return;
    mergeSupportCandidate(merged, {
      full_name: company.uyqur_support_username || company.uyqur_support_phone || 'Texnik yordam xodimi',
      username: company.uyqur_support_username,
      phone: company.uyqur_support_phone,
      role: 'support'
    }, 'company');
  });

  return [...merged.values()].filter(row => !isAdminLikeEmployee(row)).map((row, index) => {
    const stat = employeeStatsMap.value.get(employeeLookupKey(row)) || row;
    const candidate = { ...row, ...stat };
    const openSummary = openRequestMap.get(employeeSummaryKey(candidate)) || openRequestMap.get(employeeSummaryKey(row)) || null;
    const assignedCompanyCount = visibleCompanyInfoRows.value.filter(company => companyMatchesEmployee(company, candidate)).length;
    const closed = Number(row.period_closed_requests || row.stats_closed_requests || row.closed_requests || stat.closed_requests || stat.today_answered_requests || 0);
    const open = Math.max(
      Number(row.period_open_requests || 0),
      Number(openSummary?.open_requests || 0),
      Number(row.stats_open_requests || 0),
      Number(row.stats_today_open_requests || 0),
      Number(stat.open_requests || 0),
      Number(stat.today_open_requests || 0)
    );
    const total = closed + open;
    const sla = total ? Math.round((closed / total) * 1000) / 10 : Number(row.sla || stat.sla || row.close_rate || stat.close_rate || 0);
    const avg = Number(row._avg_weight ? Math.round((row._avg_total / row._avg_weight) * 10) / 10 : (row.avg_close_minutes || stat.avg_close_minutes || 0));
    const grade = performanceGrade(sla, avg);
    return {
      key: supportRowKey(row) || `${row.full_name || 'employee'}-${index}`,
      id: row.id || row.employee_id || stat.id || stat.employee_id || '',
      employee_id: row.employee_id || row.id || stat.employee_id || stat.id || '',
      tg_user_id: row.tg_user_id || stat.tg_user_id || '',
      username: row.username || stat.username || '',
      phone: row.phone || stat.phone || '',
      role: row.role || stat.role || '',
      full_name: row.full_name || stat.full_name || 'Xodim',
      handled_chats: Math.max(
        Number(row.period_handled_chats || row.stats_handled_chats || row.handled_chats || stat.handled_chats || stat.today_written_groups_count || 0),
        Number(openSummary?.chat_keys?.size || 0)
      ),
      closed_requests: closed,
      open_requests: open,
      assigned_company_count: assignedCompanyCount,
      avg_close_minutes: avg,
      close_rate: sla,
      sla,
      grade
    };
  }).sort((a, b) => b.closed_requests - a.closed_requests
    || b.assigned_company_count - a.assigned_company_count
    || a.full_name.localeCompare(b.full_name));
});
const topPerformer = computed(() => supportPerformanceRows.value[0] || null);
const topPerformerName = computed(() => topPerformer.value?.full_name || '');
const currentPeriodDates = computed(() => analytics.value.periodDates?.[selectedStatsPeriod.value] || { current: '', prev: '' });
const openRequestsTitle = computed(() => `Ochiq so‘rovlar (${fmtNumber((dashboard.openRequests || []).length)})`);
const unansweredAlerts = computed(() => {
  const grouped = new Map();
  (dashboard.openRequests || []).forEach((request, index) => {
    const key = String(request.chat_id || request.id || index);
    const current = grouped.get(key) || {
      key,
      chat_id: request.chat_id || '',
      title: request.chat_title || request.title || request.customer_name || `So‘rov ${index + 1}`,
      open_requests: 0,
      oldest_created_at: request.created_at || null,
      owner: request.responsible_employee_name || 'Xodim biriktirilmagan'
    };
    current.open_requests += 1;
    if (request.created_at && (!current.oldest_created_at || String(request.created_at) < String(current.oldest_created_at))) {
      current.oldest_created_at = request.created_at;
    }
    if (!current.owner || current.owner === 'Xodim biriktirilmagan') {
      current.owner = request.responsible_employee_name || current.owner;
    }
    grouped.set(key, current);
  });
  return [...grouped.values()]
    .map(row => ({
      ...row,
      oldest_label: row.oldest_created_at ? openDurationLabel(row.oldest_created_at) : 'Ochiq so‘rov mavjud'
    }))
    .sort((a, b) => openMinutes(b.oldest_created_at) - openMinutes(a.oldest_created_at) || b.open_requests - a.open_requests)
    .slice(0, 5);
});
const unansweredAlertTotal = computed(() => unansweredAlerts.value.reduce((sum, row) => sum + Number(row.open_requests || 0), 0));
const overdueOpenRequestsTotal = computed(() => (dashboard.openRequests || [])
  .filter(request => openMinutes(request.created_at) > 30).length);
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
  assignCompany: 'Kompaniya biriktirilmoqda...',
  chatDetail: 'Chat tafsiloti yuklanmoqda...',
  replyRequest: 'Javob yuborilmoqda...',
  saveAdmin: 'Saqlamoqda...',
  mainStats: 'Yuborilmoqda...',
  webhookInfo: 'Tekshirilmoqda...',
  webhookConnect: 'Ulanmoqda...',
  webhookSync: 'Telegram yangilanishlari olinmoqda...',
  employeeActivity: 'Xodim faoliyati yuklanmoqda...',
  saveSettings: 'Saqlamoqda...',
  saveIntegration: 'Saqlamoqda...',
  saveLogSettings: 'Log sozlamasi saqlanmoqda...',
  testLog: 'Test log yuborilmoqda...',
  extractKnowledge: 'Fayl o‘qilmoqda...',
  ticketList: 'Ticketlar yuklanmoqda...',
  companyGroupActivity: 'Kompaniya guruhlari yuklanmoqda...'
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

function handleDocumentPointerDown(event) {
  if (actionMenuOpen.value) {
    const root = actionMenuRef.value;
    if (!root || !root.contains(event.target)) actionMenuOpen.value = false;
  }
  if (rankingMenuOpen.value) {
    const root = rankingMenuRef.value;
    if (!root || !root.contains(event.target)) rankingMenuOpen.value = false;
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    actionMenuOpen.value = false;
    rankingMenuOpen.value = false;
    if (modal.value) closeModal();
  }
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

function dateInputLabel(value = '') {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}.${month}.${year}` : value || '—';
}

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function fmtNumber(value) {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function fmtPercent(value) {
  return `${fmtNumber(value)}%`;
}

function initialsFromText(value = '') {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U';
}

function employeeAvatarKey(row = {}) {
  row = row || {};
  return String(row.tg_user_id || row.employee_id || row.id || normalizeSupportUsername(row.username) || row.full_name || '').trim();
}

function employeeAvatarUrl(row = {}) {
  row = row || {};
  const key = employeeAvatarKey(row);
  return key ? employeeAvatarUrls.value[key] || '' : '';
}

function employeeInitials(row = {}) {
  row = row || {};
  return initialsFromText(row.full_name || row.username || row.phone || 'Xodim');
}

async function loadEmployeeAvatar(row = {}) {
  row = row || {};
  const key = employeeAvatarKey(row);
  const tgUserId = row.tg_user_id;
  if (!key || !tgUserId || employeeAvatarUrls.value[key] || employeeAvatarLoading.value[key]) return;
  employeeAvatarLoading.value = { ...employeeAvatarLoading.value, [key]: true };
  try {
    const blob = await api.telegramProfilePhoto(tgUserId);
    const url = URL.createObjectURL(blob);
    employeeAvatarUrls.value = { ...employeeAvatarUrls.value, [key]: url };
  } catch (_) {
    employeeAvatarUrls.value = { ...employeeAvatarUrls.value, [key]: '' };
  } finally {
    employeeAvatarLoading.value = { ...employeeAvatarLoading.value, [key]: false };
  }
}

function customerTelegramIdFromChat(row = {}) {
  row = row || {};
  const direct = row.customer_tg_id || row.tg_user_id || row.from_tg_user_id || row.actor_tg_user_id || '';
  if (direct) return String(direct).trim();
  const sourceType = String(row.source_type || '').toLowerCase();
  const chatId = String(row.chat_id || '').trim();
  if (chatId && !chatId.startsWith('-') && ['private', 'business'].includes(sourceType)) return chatId;

  const requestLists = [row.open_requests, row.requests, row.closed_requests];
  for (const list of requestLists) {
    if (!Array.isArray(list)) continue;
    const request = list.find(item => item && item.customer_tg_id);
    if (request) return String(request.customer_tg_id).trim();
  }

  const messageLists = [row.chat_messages, row.messages, row.conversation];
  for (const list of messageLists) {
    if (!Array.isArray(list)) continue;
    const message = list.find(item => item && item.actor_type !== 'employee' && item.origin_type !== 'employee' && item.direction !== 'outbound' && (item.actor_tg_user_id || item.from_tg_user_id));
    if (message) return String(message.actor_tg_user_id || message.from_tg_user_id).trim();
  }

  return '';
}

function chatAvatarKey(row = {}) {
  const tgUserId = customerTelegramIdFromChat(row);
  if (tgUserId) return `tg:${tgUserId}`;
  return String(row.chat_id || row.key || row.title || '').trim();
}

function chatAvatarUrl(row = {}) {
  const key = chatAvatarKey(row);
  return key ? chatAvatarUrls.value[key] || '' : '';
}

async function loadChatAvatar(row = {}) {
  const tgUserId = customerTelegramIdFromChat(row);
  const key = chatAvatarKey(row);
  if (!key || !tgUserId || chatAvatarUrls.value[key] || chatAvatarLoading.value[key]) return;
  chatAvatarLoading.value = { ...chatAvatarLoading.value, [key]: true };
  try {
    const blob = await api.telegramProfilePhoto(tgUserId);
    const url = URL.createObjectURL(blob);
    chatAvatarUrls.value = { ...chatAvatarUrls.value, [key]: url };
  } catch (_) {
    chatAvatarUrls.value = { ...chatAvatarUrls.value, [key]: '' };
  } finally {
    chatAvatarLoading.value = { ...chatAvatarLoading.value, [key]: false };
  }
}

function chartBarHeight(value, max) {
  const numeric = Number(value || 0);
  const maximum = Math.max(1, Number(max || 1));
  if (!numeric) return '0px';
  return `${Math.max(20, Math.round((numeric / maximum) * 316))}px`;
}

function companyTicketWidth(value) {
  return barWidth(value, companyTicketMax.value);
}

function slaToneClass(value = 0) {
  const numeric = Number(value || 0);
  if (numeric >= 85) return 'good';
  if (numeric >= 75) return 'warn';
  return 'bad';
}

function employeeSlaTooltip(row = {}) {
  const closed = Number(row.closed_requests || 0);
  const open = Number(row.open_requests || 0);
  const total = closed + open;
  const sla = total ? (closed / total) * 100 : Number(row.sla || 0);
  return total
    ? `SLA = yopilgan ticketlar / jami biriktirilgan ticketlar. ${fmtNumber(closed)} yopilgan, ${fmtNumber(open)} ochiq = ${fmtPercent(sla)}.`
    : 'SLA xodimga biriktirilgan ticketlar bo‘yicha hisoblanadi. Bu davrda ticket yo‘q.';
}

function ticketTrendTooltip(row = {}) {
  return `${row.date_label}: ${fmtNumber(row.total_requests)} ticket, ${fmtNumber(row.closed_requests)} javob, ${fmtNumber(row.open_requests)} ochiq`;
}

function ticketTrendMetricTooltip(row = {}, metric = 'total') {
  const labels = {
    total: 'So‘rovlar',
    closed: 'Javob berilgan',
    open: 'Ochiq qolgan'
  };
  const values = {
    total: row.total_requests,
    closed: row.closed_requests,
    open: row.open_requests
  };
  return `${row.date_label}: ${labels[metric] || labels.total}: ${fmtNumber(values[metric])}`;
}

function barWidth(value, max) {
  const numeric = Number(value || 0);
  const maximum = Number(max || 0);
  if (!numeric || !maximum) return '0%';
  return `${Math.min(100, Math.max(5, (numeric / maximum) * 100))}%`;
}

function niceChartMax(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(numeric)) - 1);
  return Math.ceil(numeric / magnitude) * magnitude;
}

function chartYTicks(max, dims, count = 5) {
  const maximum = niceChartMax(max);
  const height = dims.bottom - dims.top;
  return Array.from({ length: count }, (_, index) => {
    const value = Math.round((maximum - (maximum / (count - 1)) * index) * 10) / 10;
    const y = dims.top + (height / (count - 1)) * index;
    return { value, y: Math.round(y * 10) / 10 };
  });
}

function shortChartLabel(value = '') {
  const text = String(value || '—').trim();
  return text.length > 14 ? `${text.slice(0, 13)}…` : text;
}

function lineChartPoints(rows = [], max = 1, dims) {
  const width = dims.right - dims.left;
  const height = dims.bottom - dims.top;
  const maximum = Math.max(1, Number(max || 1));
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  return rows.map((row, index) => {
    const x = rows.length > 1 ? dims.left + step * index : dims.left + width / 2;
    const y = dims.bottom - (Math.max(0, Number(row.value || 0)) / maximum) * height;
    return {
      ...row,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  });
}

function barChartColumns(rows = [], max = 1, dims) {
  const width = dims.right - dims.left;
  const height = dims.bottom - dims.top;
  const maximum = Math.max(1, Number(max || 1));
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  const barWidthValue = Math.max(44, Math.min(118, width / Math.max(rows.length, 1) * 0.55));
  return rows.map((row, index) => {
    const x = rows.length > 1 ? dims.left + step * index : dims.left + width / 2;
    const barHeight = Math.max(4, (Math.max(0, Number(row.session_count || 0)) / maximum) * height);
    return {
      ...row,
      label: row.name || 'Kompaniya',
      short_label: shortChartLabel(row.name || 'Kompaniya'),
      x: Math.round(x * 10) / 10,
      y: Math.round((dims.bottom - barHeight) * 10) / 10,
      width: Math.round(barWidthValue * 10) / 10,
      height: Math.round(barHeight * 10) / 10
    };
  });
}

function fmtMinutes(value) {
  return `${fmtNumber(value)} min`;
}

function responseTrendTooltip(point = {}) {
  return `${point.label}: ${fmtMinutes(point.value)} · ${fmtNumber(point.closed_requests)} ta javob berilgan`;
}

function openMinutes(value) {
  nowTick.value;
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Number.isFinite(diff) && diff > 0 ? Math.floor(diff / 60000) : 0;
}

function openDurationLabel(value) {
  if (!value) return '—';
  const minutes = openMinutes(value);
  if (minutes < 1) return 'hozirgina ochilgan';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days} kun`);
  if (hours) parts.push(`${hours} soat`);
  if (mins || !parts.length) parts.push(`${mins} daqiqa`);
  return `${parts.slice(0, 2).join(' ')} ochiq`;
}

function listPreview(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!list.length) return '—';
  return list.join(', ');
}

function pct(row) {
  const total = Number(row.total_requests || row.received_requests || 0);
  const closed = Number(row.closed_requests || 0);
  return total ? `${Math.round((closed / total) * 100)}%` : '0%';
}

function compareValue(current, previous, invert = false) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  if (curr === prev) return null;
  
  const diff = curr - prev;
  const arrow = diff > 0 ? '↑' : '↓';
  const diffAbs = Math.abs(diff);
  const diffText = diff > 0 ? `+${fmtNumber(diffAbs)}` : `-${fmtNumber(diffAbs)}`;

  let tone = diff > 0 ? 'good' : 'bad';
  if (invert) tone = diff > 0 ? 'bad' : 'good';

  if (prev === 0) {
    return {
      text: `${arrow} ${diffText}`,
      diff: diffText,
      tone
    };
  }

  const percent = Math.round((diffAbs / prev) * 100);
  const sign = diff > 0 ? '+' : '-';
  return {
    text: `${arrow} ${sign}${percent}% (${diffText})`,
    diff: diffText,
    tone
  };
}

function sourceTypeLabel(value) {
  return ({
    group: 'Guruh',
    private: 'Shaxsiy',
    business: 'Biznes',
    personal: 'Shaxsiy'
  }[String(value || '').toLowerCase()] || value || '—');
}

function statusLabel(value) {
  return ({
    open: 'Ochiq',
    closed: 'Yopilgan',
    pending: 'Kutilmoqda'
  }[String(value || '').toLowerCase()] || value || '—');
}

function companyStatusLabel(value) {
  return ({
    active: 'Faol',
    passive: 'Passiv'
  }[String(value || '').toLowerCase()] || value || '—');
}

function businessStatusLabel(value) {
  return ({
    ACTIVE: 'Aktiv',
    NEW: 'Yangi',
    PAUSED: 'Pauza'
  }[String(value || '').toUpperCase()] || value || '—');
}

function companyStatusClass(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'active') return 'ready';
  if (key === 'passive') return 'muted-status';
  return '';
}

function businessStatusClass(value) {
  const key = String(value || '').toUpperCase();
  if (key === 'ACTIVE') return 'ready';
  if (key === 'NEW') return 'new';
  if (key === 'PAUSED') return 'error';
  return 'muted-status';
}

function expiryStatusLabel(row = {}) {
  if (!row.expired) return 'Muddatsiz';
  return `${row.expired} · ${expiryRemainingLabel(row)}`;
}

function expiryRemainingLabel(row = {}) {
  const days = Number(row.days_until_expiry);
  if (!Number.isFinite(days)) return 'Kun belgilanmagan';
  if (days < 0) return `${Math.abs(days)} kun oldin tugagan`;
  if (days === 0) return 'Bugun tugaydi';
  return `${days} kun qoldi`;
}

function expiryAlertBadge(row = {}) {
  const days = Number(row.days_until_expiry);
  if (!Number.isFinite(days)) return '—';
  if (days < 0) return 'Tugagan';
  return `${days} kun`;
}

function expiryStatusClass(row = {}) {
  if (row.expiry_state === 'expired') return 'error';
  if (row.expiry_state === 'soon') return 'new';
  return 'ready';
}

function companySupportLabel(row = {}) {
  return [row.uyqur_support_username, row.uyqur_support_phone].filter(Boolean).join(' · ') || 'Biriktirilmagan';
}

function normalizeLogSources(sources = []) {
  return (Array.isArray(sources) ? sources : [])
    .map((source, index) => ({
      id: source.id || `log-source-${Date.now()}-${index}`,
      chat_id: String(source.chat_id || '').trim(),
      label: String(source.label || '').trim(),
      source: ['mobile', 'web', 'backend', 'other'].includes(source.source) ? source.source : 'other',
      enabled: source.enabled !== false
    }))
    .filter(source => source.chat_id);
}

function hasCompanySupport(row = {}) {
  return Boolean(String(row.uyqur_support_username || '').trim() || String(row.uyqur_support_phone || '').trim());
}

function normalizeSupportUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function resolveEmployeeForCompany(row = {}) {
  const username = normalizeSupportUsername(row.username);
  const id = String(row.id || row.employee_id || '').trim();
  const tgUserId = String(row.tg_user_id || '').trim();
  const found = employees.value.find(employee => {
    if (id && String(employee.id || '') === id) return true;
    if (tgUserId && String(employee.tg_user_id || '') === tgUserId) return true;
    return username && normalizeSupportUsername(employee.username) === username;
  });
  return { ...row, ...(found || {}) };
}

function companyMatchesEmployee(company = {}, employee = {}) {
  const employeeUsername = normalizeSupportUsername(employee.username);
  const companyUsername = normalizeSupportUsername(company.uyqur_support_username);
  if (employeeUsername && companyUsername && employeeUsername === companyUsername) return true;
  const employeePhone = normalizePhone(employee.phone);
  const companyPhone = normalizePhone(company.uyqur_support_phone);
  return Boolean(employeePhone && companyPhone && employeePhone === companyPhone);
}

function isCompanyChurn(row = {}) {
  return String(row.business_status || '').toUpperCase() === 'PAUSED';
}

function isCompanyExpiringSoon(row = {}) {
  return row.expiry_state === 'soon';
}

function companyUsageScore(row = {}) {
  const businessStatus = String(row.business_status || '').toUpperCase();
  const days = Number(row.days_until_expiry);
  let score = 0;
  if (businessStatus === 'ACTIVE') score += 45;
  else if (businessStatus === 'NEW') score += 26;
  else if (businessStatus === 'PAUSED') score += 8;

  if (Number.isFinite(days)) {
    if (days > 30) score += 22;
    else if (days >= 0) score += 12;
  }
  if (hasCompanySupport(row)) score += 12;
  if (Number(row.auto_refresh_currencies || 0) === 1) score += 6;
  if (row.last_activity) score += 15;
  else if (businessStatus === 'ACTIVE') score += 8;
  return Math.max(0, Math.min(100, score));
}

function normalizedCompanyName(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function directCompanyActivityValue(row = {}) {
  const keys = ['session_count', 'sessions', 'activity_count', 'actions_count', 'employee_actions_count', 'requests_count'];
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function relatedCompanyChatStats(row = {}) {
  const companyId = String(row.id || row.company_id || '').trim();
  const companyName = normalizedCompanyName(row.name);
  return (dashboard.chatStats || []).filter(chat => {
    if (companyId && String(chat.company_id || '').trim() === companyId) return true;
    return companyName && normalizedCompanyName(chat.company_name) === companyName;
  });
}

function firstNumericValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function hasCompanyTicketMetric(row = {}) {
  const keys = [
    'total_requests', 'requests_count', 'ticket_count', 'tickets_count', 'support_ticket_count',
    'closed_requests', 'closed_ticket_count', 'closed_tickets',
    'open_requests', 'open_ticket_count', 'open_tickets'
  ];
  return keys.some(key => row[key] !== undefined && row[key] !== null && row[key] !== '');
}

function periodScopedRows(source) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== 'object') return [];
  const scoped = source[selectedStatsPeriod.value] || source.rows || source.data || source.items;
  return Array.isArray(scoped) ? scoped : [];
}

function companyApiTicketRows() {
  const explicitSources = [
    companyInfo.value.companyTickets,
    companyInfo.value.company_tickets,
    companyInfo.value.ticket_stats,
    companyInfo.value.tickets
  ];
  for (const source of explicitSources) {
    const rows = periodScopedRows(source);
    if (rows.length) return rows;
  }
  return companyInfoRows.value.filter(hasCompanyTicketMetric);
}

function normalizeCompanyTicketRow(row = {}) {
  const closed = firstNumericValue(row, ['closed_requests', 'closed_ticket_count', 'closed_tickets', 'resolved_requests', 'resolved_ticket_count']);
  const explicitOpen = firstNumericValue(row, ['open_requests', 'open_ticket_count', 'open_tickets', 'unresolved_requests', 'unresolved_ticket_count']);
  const messageCount = firstNumericValue(row, ['message_count', 'total_messages', 'messages_count']);
  const ticketLikeMessages = firstNumericValue(row, ['ticket_like_messages', 'request_messages', 'classified_requests']);
  const open = explicitOpen || (!closed ? (ticketLikeMessages || messageCount) : 0);
  const total = firstNumericValue(row, ['total_requests', 'requests_count', 'ticket_count', 'tickets_count', 'support_ticket_count'])
    || closed + open
    || ticketLikeMessages
    || messageCount;
  return {
    company_id: row.company_id || row.id || row.external_id || row.uyqur_company_id || '',
    name: row.name || row.company_name || row.legal_name || 'Kompaniya',
    total_requests: total,
    closed_requests: closed,
    open_requests: open,
    message_count: messageCount,
    ticket_like_messages: ticketLikeMessages,
    close_rate: Number(row.close_rate || row.sla || 0)
  };
}

function companyTicketKey(row = {}) {
  const name = String(row.name || row.company_name || row.legal_name || '').trim().toLowerCase();
  if (name && name !== 'kompaniya') return `name:${name}`;
  const id = String(row.company_id || row.id || row.external_id || row.uyqur_company_id || '').trim();
  return id ? `id:${id}` : '';
}

function mergeCompanyTicketRows(rows = []) {
  const map = new Map();
  rows.map(normalizeCompanyTicketRow).forEach(row => {
    const key = companyTicketKey(row);
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, row);
      return;
    }

    const closed = Math.max(Number(current.closed_requests || 0), Number(row.closed_requests || 0));
    const open = Math.max(Number(current.open_requests || 0), Number(row.open_requests || 0));
    const messageCount = Math.max(Number(current.message_count || 0), Number(row.message_count || 0));
    const ticketLikeMessages = Math.max(Number(current.ticket_like_messages || 0), Number(row.ticket_like_messages || 0));
    const total = Math.max(
      Number(current.total_requests || 0),
      Number(row.total_requests || 0),
      closed + open,
      ticketLikeMessages,
      messageCount
    );

    map.set(key, {
      ...current,
      ...row,
      company_id: current.company_id || row.company_id || '',
      name: current.name || row.name || 'Kompaniya',
      total_requests: total,
      closed_requests: closed,
      open_requests: open,
      message_count: messageCount,
      ticket_like_messages: ticketLikeMessages,
      close_rate: Number(row.close_rate || current.close_rate || 0)
    });
  });
  return [...map.values()];
}

function companyActivitySessionCount(row = {}) {
  const direct = directCompanyActivityValue(row);
  if (direct) return direct;

  const chatActions = relatedCompanyChatStats(row).reduce((sum, chat) => sum
    + Number(chat.total_requests || 0)
    + Number(chat.closed_requests || 0)
    + Number(chat.unique_customers || 0), 0);
  if (chatActions) return Math.round(chatActions);

  const status = String(row.business_status || '').toUpperCase();
  const statusBonus = status === 'ACTIVE' ? 35 : status === 'NEW' ? 18 : 6;
  const supportBonus = hasCompanySupport(row) ? 12 : 0;
  const refreshBonus = Number(row.auto_refresh_currencies || 0) === 1 ? 8 : 0;
  const expiryBonus = row.expiry_state === 'ok' ? 14 : row.expiry_state === 'soon' ? 6 : 0;
  return Math.max(1, Math.round(companyUsageScore(row) + statusBonus + supportBonus + refreshBonus + expiryBonus));
}

function companyUsageLevel(score = 0) {
  const value = Number(score || 0);
  if (value >= 75) return 'Yuqori';
  if (value >= 45) return 'O‘rta';
  return 'Past';
}

function enrichCompanyUsage(row = {}) {
  const usageScore = companyUsageScore(row);
  return {
    ...row,
    usage_score: usageScore,
    usage_level: companyUsageLevel(usageScore)
  };
}

function parseCompanyDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const text = String(value || '').trim();
  const dotted = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    const [, day, month, year] = dotted;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const dashed = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) {
    const [, year, month, day] = dashed;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dayDiff(start, end) {
  if (!start || !end) return null;
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function fmtCompanyDate(value) {
  const date = parseCompanyDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(date);
}

function durationLabel(days) {
  const value = Number(days);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const years = Math.floor(value / 365);
  const months = Math.floor((value % 365) / 30);
  const restDays = value % 30;
  const parts = [];
  if (years) parts.push(`${years} yil`);
  if (months) parts.push(`${months} oy`);
  if (!years && !months) parts.push(`${restDays || value} kun`);
  if (years && !months && restDays) parts.push(`${restDays} kun`);
  return parts.slice(0, 2).join(' ');
}

function timelineWidth(value, max) {
  const numeric = Number(value || 0);
  const maximum = Number(max || 0);
  if (!numeric || !maximum) return '0%';
  return `${Math.min(100, Math.max(4, (numeric / maximum) * 100))}%`;
}

function enrichCompanyTimeline(row = {}) {
  const enriched = enrichCompanyUsage(row);
  const start = parseCompanyDate(row.subscription_start_date || row.created_at_iso || row.created_at);
  const expiry = parseCompanyDate(row.expired);
  const now = new Date();
  const usageDays = start ? dayDiff(start, now) || 0 : 0;
  const subscriptionDays = start && expiry ? dayDiff(start, expiry) || 0 : 0;
  return {
    ...enriched,
    start_label: start ? fmtCompanyDate(start) : 'Boshlanish belgilanmagan',
    expiry_label: expiry ? fmtCompanyDate(expiry) : 'Muddatsiz',
    usage_days: usageDays,
    subscription_days: subscriptionDays,
    usage_duration_label: usageDays ? `${durationLabel(usageDays)} ishlatmoqda` : 'Muddat noma’lum',
    subscription_label: subscriptionDays ? `Obuna: ${durationLabel(subscriptionDays)}` : 'Obuna: muddatsiz',
    timeline_title: [
      `Boshlanish: ${start ? fmtCompanyDate(start) : '—'}`,
      `Tugash: ${expiry ? fmtCompanyDate(expiry) : 'muddatsiz'}`,
      usageDays ? `Ishlatmoqda: ${durationLabel(usageDays)}` : ''
    ].filter(Boolean).join(' · ')
  };
}

function timelineFillClass(row = {}) {
  if (row.expiry_state === 'expired') return 'expired';
  if (row.expiry_state === 'soon') return 'soon';
  return 'active';
}

function companyPortfolioSummary(rows = []) {
  const enriched = rows.map(enrichCompanyUsage);
  const totalScore = enriched.reduce((sum, row) => sum + Number(row.usage_score || 0), 0);
  return {
    total: enriched.length,
    active: enriched.filter(company => company.business_status === 'ACTIVE').length,
    churn: enriched.filter(isCompanyChurn).length,
    expiring_soon: enriched.filter(isCompanyExpiringSoon).length,
    expired: enriched.filter(company => company.expiry_state === 'expired').length,
    high_usage: enriched.filter(company => Number(company.usage_score || 0) >= 75).length,
    average_score: enriched.length ? Math.round(totalScore / enriched.length) : 0
  };
}

function summarizeCompanyRows(rows = []) {
  return {
    total: rows.length,
    active: rows.filter(company => company.status === 'active').length,
    passive: rows.filter(company => company.status === 'passive').length,
    real: rows.filter(company => Number(company.is_real || 0) === 1).length,
    business_active: rows.filter(company => company.business_status === 'ACTIVE').length,
    business_new: rows.filter(company => company.business_status === 'NEW').length,
    business_paused: rows.filter(company => company.business_status === 'PAUSED').length,
    support_assigned: rows.filter(hasCompanySupport).length,
    expired: rows.filter(company => company.expiry_state === 'expired').length,
    expiring_soon: rows.filter(company => company.expiry_state === 'soon').length
  };
}

function roleLabel(value) {
  return ({
    support: 'Texnik yordam',
    manager: 'Menejer',
    owner: 'Ega',
    admin: 'Admin'
  }[String(value || '').toLowerCase()] || value || '—');
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
const companyInfoRows = computed(() => companyInfo.value.companies || []);
const visibleCompanyInfoRows = computed(() => companyInfoRows.value.filter(hasCompanySupport));
const filteredCompanyInfoRows = computed(() => visibleCompanyInfoRows.value.filter(includesSearch));
const filteredCompanies = computed(() => filteredCompanyInfoRows.value);
function companyAssignKey(row = {}) {
  return String(row.id || row.name || row.phone || '').trim();
}
function companyAssignLabel(row = {}) {
  return [row.name || 'Kompaniya', row.brand, row.director, row.phone].filter(Boolean).join(' · ');
}
const assignCompanyOptions = computed(() => {
  const q = companyAssignForm.search.toLowerCase().trim();
  return companyInfoRows.value
    .map(row => ({ ...row, assign_key: companyAssignKey(row) }))
    .filter(row => row.assign_key)
    .filter(row => !q || companyAssignLabel(row).toLowerCase().includes(q))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 120);
});
const companyActivitySummary = computed(() => summarizeCompanyRows(visibleCompanyInfoRows.value));
const activeCompanyRows = computed(() => filteredCompanyInfoRows.value
  .map(row => ({
    ...row,
    session_count: companyActivitySessionCount(row)
  }))
  .filter(row => Number(row.session_count || 0) > 0)
  .sort((a, b) => Number(b.session_count || 0) - Number(a.session_count || 0)
    || String(a.name || '').localeCompare(String(b.name || '')))
  .slice(0, 6));
const activeCompanyChartMax = computed(() => niceChartMax(Math.max(1, ...activeCompanyRows.value.map(row => Number(row.session_count || 0)))));
const activeCompanyChartBars = computed(() => barChartColumns(activeCompanyRows.value, activeCompanyChartMax.value, {
  left: 95,
  right: 685,
  top: 36,
  bottom: 198
}));
const activeCompanyYTicks = computed(() => chartYTicks(activeCompanyChartMax.value, {
  left: 95,
  right: 685,
  top: 36,
  bottom: 198
}));
const companyAlerts = computed(() => visibleCompanyInfoRows.value
  .filter(row => ['expired', 'soon'].includes(row.expiry_state))
  .sort((a, b) => Number(a.days_until_expiry ?? 9999) - Number(b.days_until_expiry ?? 9999))
  .slice(0, 6));
const productUsageRows = computed(() => visibleCompanyInfoRows.value
  .map(enrichCompanyUsage)
  .sort((a, b) => Number(b.usage_score || 0) - Number(a.usage_score || 0) || String(a.name || '').localeCompare(String(b.name || ''))));
const filteredProductUsageRows = computed(() => productUsageRows.value.filter(includesSearch));
const productUsageChartRows = computed(() => productUsageRows.value.slice(0, 8));
const rawSubscriptionTimelineRows = computed(() => filteredProductUsageRows.value
  .map(enrichCompanyTimeline)
  .sort((a, b) => Number(b.usage_days || 0) - Number(a.usage_days || 0) || String(a.name || '').localeCompare(String(b.name || ''))));
const subscriptionTimelineMaxDays = computed(() => Math.max(1, ...rawSubscriptionTimelineRows.value.map(row => Math.max(Number(row.subscription_days || 0), Number(row.usage_days || 0)))));
const subscriptionTimelineRows = computed(() => rawSubscriptionTimelineRows.value.map(row => ({
  ...row,
  subscription_width: timelineWidth(row.subscription_days || row.usage_days, subscriptionTimelineMaxDays.value),
  used_width: timelineWidth(Math.min(row.usage_days || 0, row.subscription_days || row.usage_days || 0), subscriptionTimelineMaxDays.value)
})));
const longestUsageRows = computed(() => subscriptionTimelineRows.value.slice(0, 5));
const productUsageSummary = computed(() => {
  const summary = companyPortfolioSummary(productUsageRows.value);
  return {
    ...summary,
    risk: productUsageRows.value.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state)).length,
    active_rate: summary.total ? Math.round((summary.active / summary.total) * 100) : 0
  };
});
const businessStatusRows = computed(() => [
  { label: 'Aktiv', count: productUsageRows.value.filter(row => row.business_status === 'ACTIVE').length, color: 'green' },
  { label: 'Yangi', count: productUsageRows.value.filter(row => row.business_status === 'NEW').length, color: 'blue' },
  { label: 'Churn/Pauza', count: productUsageRows.value.filter(isCompanyChurn).length, color: 'orange' }
]);
const businessStatusChartMax = computed(() => Math.max(1, ...businessStatusRows.value.map(row => Number(row.count || 0))));
const usageLevelRows = computed(() => [
  { label: 'Yuqori', count: productUsageRows.value.filter(row => Number(row.usage_score || 0) >= 75).length, color: 'green' },
  { label: 'O‘rta', count: productUsageRows.value.filter(row => Number(row.usage_score || 0) >= 45 && Number(row.usage_score || 0) < 75).length, color: 'blue' },
  { label: 'Past', count: productUsageRows.value.filter(row => Number(row.usage_score || 0) < 45).length, color: 'orange' }
]);
const usageLevelChartMax = computed(() => Math.max(1, ...usageLevelRows.value.map(row => Number(row.count || 0))));
const subscriptionStatusRows = computed(() => [
  { label: 'Barqaror', count: productUsageRows.value.filter(row => row.expiry_state === 'ok').length, color: 'green' },
  { label: 'Yaqin tugaydi', count: productUsageRows.value.filter(row => row.expiry_state === 'soon').length, color: 'orange' },
  { label: 'Tugagan', count: productUsageRows.value.filter(row => row.expiry_state === 'expired').length, color: 'red' },
  { label: 'Muddatsiz', count: productUsageRows.value.filter(row => row.expiry_state === 'none').length, color: 'blue' }
]);
const subscriptionStatusChartMax = computed(() => Math.max(1, ...subscriptionStatusRows.value.map(row => Number(row.count || 0))));
const supportPortfolioRows = computed(() => {
  const grouped = new Map();
  productUsageRows.value.forEach(row => {
    const key = companySupportLabel(row);
    if (!key || key === 'Biriktirilmagan') return;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });
  return [...grouped.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
});
const supportPortfolioChartMax = computed(() => Math.max(1, ...supportPortfolioRows.value.map(row => Number(row.count || 0))));
const topSupportCards = computed(() => supportPerformanceRows.value.map((row, index) => {
  const employee = resolveEmployeeForCompany(row);
  const companies = visibleCompanyInfoRows.value.filter(company => companyMatchesEmployee(company, employee)).map(enrichCompanyUsage);
  const companySummary = companyPortfolioSummary(companies);
  return {
    ...employee,
    ...row,
    rank: index + 1,
    assigned_companies: companies,
    company_summary: companySummary,
    company_total: companySummary.total,
    company_active: companySummary.active,
    company_churn: companySummary.churn,
    company_expiring_soon: companySummary.expiring_soon,
    // Comparison metrics
    closed_comparison: comparisonEnabled.value ? compareValue(row.closed_requests, row.prev_closed_requests) : null,
    sla_comparison: comparisonEnabled.value ? compareValue(row.sla, row.prev_close_rate) : null,
    avg_comparison: comparisonEnabled.value ? compareValue(row.avg_close_minutes, row.prev_avg_close_minutes, true) : null
  };
}));
watch(topSupportCards, rows => {
  rows.slice(0, 20).forEach(row => loadEmployeeAvatar(row));
}, { immediate: true });
const selectedRecipients = computed(() => selectedSendType.value === 'employees' ? selectedEmployees.value : selectedGroups.value);
const selectedSendTitle = computed(() => selectedSendType.value === 'employees' ? 'Xodimlarga xabar yuborish' : 'Guruhlarga xabar yuborish');
const chatDetailTitle = computed(() => {
  const chat = chatDetail.value.chat;
  return chat ? `Chat: ${chat.title || chat.chat_id}` : 'Chat tafsiloti';
});
const chatConversation = computed(() => chatDetail.value.conversation || []);
const metricChatConversation = computed(() => metricChatDetail.value.conversation || []);
const metricChatTitle = computed(() => {
  const chat = metricChatDetail.value.chat;
  return chat ? chat.title || chat.username || chat.chat_id || 'Chat' : 'Chat tanlanmagan';
});
const ticketListCounts = computed(() => {
  const rows = ticketList.value.rows || [];
  return {
    all: rows.length,
    open: rows.filter(row => row.status === 'open').length,
    closed: rows.filter(row => row.status === 'closed').length
  };
});
const ticketListSupportOptions = computed(() => {
  const names = [...new Set((ticketList.value.rows || [])
    .map(row => row.responsible_employee_name || row.support_name || row.closed_by_name || '')
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return [{ value: 'all', label: 'Barcha supportlar' }, ...names.map(name => ({ value: name, label: name }))];
});
const filteredTicketListRows = computed(() => {
  const searchText = ticketListSearch.value.toLowerCase().trim();
  return (ticketList.value.rows || [])
    .filter(row => ticketMatchesStatus(row, ticketList.value.active))
    .filter(row => ticketListSupport.value === 'all' || [row.responsible_employee_name, row.support_name, row.closed_by_name].includes(ticketListSupport.value))
    .filter(row => {
      if (!searchText) return true;
      return [
        row.id,
        row.initial_text,
        row.company_name,
        row.chat_title,
        row.customer_name,
        row.responsible_employee_name,
        row.support_name,
        row.closed_by_name
      ].filter(Boolean).join(' ').toLowerCase().includes(searchText);
    })
    .sort(ticketListSort);
});
const employeeDrilldownTitle = computed(() => employeeDrilldown.value ? `Xodim: ${employeeDrilldown.value.full_name || employeeDrilldown.value.username || '—'}` : 'Xodim tafsiloti');
const employeeCompanyTitle = computed(() => employeeCompanyDetail.value.employee
  ? `Kompaniyalar: ${employeeCompanyDetail.value.employee.full_name || employeeCompanyDetail.value.employee.username || 'Xodim'}`
  : 'Biriktirilgan kompaniyalar');
const employeeSupportTitle = computed(() => {
  const employee = employeeProfile.value.employee || {};
  return employee.full_name || employee.username ? `Xodim: ${employee.full_name || employee.username}` : 'Xodim tafsiloti';
});
function isGenericCompanyName(value = '') {
  return !String(value || '').trim() || String(value || '').trim().toLowerCase() === 'kompaniya';
}

function companyNameFromGroupTitle(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split('|').map(part => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : text;
}

function resolvedCompanyGroupName(detail = {}) {
  const companyName = detail.company?.name || detail.company?.company_name;
  if (!isGenericCompanyName(companyName)) return companyName;
  const firstGroup = (detail.groups || [])[0] || {};
  return companyNameFromGroupTitle(firstGroup.company_name || firstGroup.title || '') || companyName || 'Kompaniya';
}

const companyGroupTitle = computed(() => companyGroupDetail.value.company
  ? `Kompaniya: ${resolvedCompanyGroupName(companyGroupDetail.value)}`
  : 'Kompaniya guruhlari');

function chatOpenCount(row = {}) {
  if (Array.isArray(row.open_requests)) return row.open_requests.length;
  return Number(row.open_requests || row.open_count || 0);
}

function chatHasOpenTickets(row = {}) {
  return chatOpenCount(row) > 0;
}

function sortChatsWithOpenFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const openDiff = chatOpenCount(b) - chatOpenCount(a);
    if (openDiff) return openDiff;
    return String(b.last_message_at || b.created_at || '').localeCompare(String(a.last_message_at || a.created_at || ''));
  });
}

const companyGroupRows = computed(() => sortChatsWithOpenFirst(companyGroupDetail.value.groups || []));
const selectedCompanyGroup = computed(() => {
  const rows = companyGroupRows.value;
  if (!rows.length) return null;
  return rows.find(row => companyGroupChatKey(row) === companyGroupSelectedChatKey.value) || rows[0];
});
const companyGroupConversation = computed(() => selectedCompanyGroup.value?.conversation || []);
const companyGroupRequests = computed(() => selectedCompanyGroup.value?.requests || []);
const employeeProfileChatRows = computed(() => sortChatsWithOpenFirst((employeeProfile.value.groups || []).map(group => {
  const closedRequests = Array.isArray(group.closed_requests) ? group.closed_requests : [];
  const openRequests = Array.isArray(group.open_requests) ? group.open_requests : [];
  const messages = Array.isArray(group.messages) ? group.messages : [];
  const chatMessages = Array.isArray(group.chat_messages) ? group.chat_messages : messages;
  return {
    ...group,
    source_type: group.source_type || 'private',
    closed_count: Number(group.closed_count ?? closedRequests.length),
    open_count: Number(group.open_count ?? openRequests.length),
    message_count: Number(group.message_count ?? messages.length),
    chat_message_count: Number(group.chat_message_count ?? chatMessages.length),
    closed_requests: closedRequests,
    open_requests: openRequests,
    messages,
    chat_messages: chatMessages,
    total_requests: Number(group.total_requests ?? (closedRequests.length + openRequests.length))
  };
})));
const employeeProfilePrivateChats = computed(() => employeeProfileChatRows.value.filter(row => row.source_type !== 'group'));
const employeeProfileGroupChats = computed(() => employeeProfileChatRows.value.filter(row => row.source_type === 'group'));
const employeeProfileVisibleChats = computed(() => employeeProfileTab.value === 'group'
  ? employeeProfileGroupChats.value
  : employeeProfilePrivateChats.value);
watch(companyGroupRows, rows => {
  rows.slice(0, 40).forEach(row => loadChatAvatar(row));
}, { immediate: true });
watch(employeeProfileVisibleChats, rows => {
  rows.slice(0, 40).forEach(row => loadChatAvatar(row));
}, { immediate: true });
const selectedEmployeeProfileChat = computed(() => {
  const rows = employeeProfileVisibleChats.value;
  if (!rows.length) return null;
  return rows.find(row => employeeProfileChatKey(row) === employeeProfileSelectedChatKey.value) || rows[0];
});
const employeeProfileChatRequests = computed(() => {
  const chat = selectedEmployeeProfileChat.value;
  if (!chat) return [];
  return [
    ...(chat.open_requests || []).map(request => ({ ...request, status: request.status || 'open' })),
    ...(chat.closed_requests || []).map(request => ({ ...request, status: request.status || 'closed' }))
  ];
});

function employeeRequestConversationItem(request = {}) {
  return {
    id: `request-${request.id || request.chat_id || request.created_at}`,
    type: 'ticket',
    request_id: request.id || null,
    message_id: request.initial_message_id || null,
    direction: 'inbound',
    actor_type: 'customer',
    origin_type: 'customer',
    source_label: 'Mijoz',
    actor_name: request.customer_name || 'Mijoz',
    actor_username: request.customer_username || '',
    actor_tg_user_id: request.customer_tg_id || null,
    employee_id: null,
    text: request.initial_text || '',
    request_text: request.initial_text || '',
    status: request.status || 'open',
    created_at: request.created_at || request.closed_at || null
  };
}

function employeeRequestEventConversationItems(request = {}, employee = {}) {
  return (Array.isArray(request.events) ? request.events : [])
    .map(event => {
      const eventType = event.event_type || event.type || '';
      const outbound = eventType === 'closed' || Boolean(event.employee_id);
      const origin = event.origin_type || (outbound ? 'employee' : 'customer');
      const item = {
        id: `request-event-${event.id || `${request.id || ''}-${event.message_id || event.created_at || ''}`}`,
        type: eventType === 'closed' ? 'employee_reply' : (eventType === 'opened' ? 'ticket' : 'customer_note'),
        request_id: request.id || event.request_id || null,
        message_id: event.message_id || event.tg_message_id || null,
        direction: outbound ? 'outbound' : 'inbound',
        actor_type: origin,
        origin_type: origin,
        source_label: event.source_label || messageSourceLabel({ origin_type: origin, direction: outbound ? 'outbound' : 'inbound' }),
        actor_name: event.actor_name || (outbound ? request.closed_by_name || 'Xodim' : request.customer_name || 'Mijoz'),
        actor_username: event.actor_username || '',
        actor_tg_user_id: event.actor_tg_id || event.actor_tg_user_id || null,
        employee_id: event.employee_id || null,
        text: event.text || '',
        media: event.media || null,
        request_text: request.initial_text || '',
        status: request.status || 'open',
        classification: eventType,
        created_at: event.created_at || null
      };
      return item.direction === 'outbound' && !messageBelongsToEmployee(item, employee) ? null : item;
    })
    .filter(Boolean);
}

function employeeMessageConversationItem(message = {}, employee = {}) {
  return {
    id: message.id || `message-${message.chat_id || ''}-${message.message_id || message.created_at || ''}`,
    type: 'employee_reply',
    request_id: message.request_id || null,
    message_id: message.message_id || message.tg_message_id || null,
    direction: 'outbound',
    actor_type: message.actor_type || message.origin_type || 'employee',
    origin_type: message.origin_type || message.actor_type || 'employee',
    source_label: message.source_label || messageSourceLabel(message),
    actor_name: message.from_name || message.actor_name || 'Xodim',
    actor_username: message.from_username || message.actor_username || '',
    actor_tg_user_id: message.from_tg_user_id || message.actor_tg_user_id || null,
    employee_id: message.employee_id || null,
    text: message.text || '',
    media: message.media || null,
    request_text: message.request_text || '',
    classification: message.classification || '',
    created_at: message.created_at || null
  };
}

function employeeChatMessageConversationItem(message = {}, employee = {}) {
  const outbound = messageBelongsToEmployee(message, employee)
    || ['employee_message', 'admin_reply', 'ai_reply', 'bot_reply', 'bot_broadcast', 'bot_notification', 'bot_message'].includes(message.classification || '');
  const origin = message.origin_type || message.actor_type || (outbound ? 'employee' : 'customer');
  return {
    id: message.id || `chat-message-${message.chat_id || ''}-${message.message_id || message.created_at || ''}`,
    type: outbound ? 'employee_reply' : 'chat_message',
    request_id: message.request_id || null,
    message_id: message.message_id || message.tg_message_id || null,
    direction: outbound ? 'outbound' : 'inbound',
    actor_type: origin,
    origin_type: origin,
    source_label: message.source_label || messageSourceLabel({ ...message, origin_type: origin, direction: outbound ? 'outbound' : 'inbound' }),
    actor_name: message.from_name || message.actor_name || (outbound ? 'Xodim' : 'Mijoz'),
    actor_username: message.from_username || message.actor_username || '',
    actor_tg_user_id: message.from_tg_user_id || message.actor_tg_user_id || null,
    employee_id: message.employee_id || null,
    text: message.text || '',
    media: message.media || null,
    request_text: message.request_text || '',
    classification: message.classification || '',
    created_at: message.created_at || null
  };
}

function employeeScopedConversation(row = {}, employee = {}) {
  const includeFullGroupThread = row.source_type === 'group';
  const requestRows = [
    ...(Array.isArray(row.open_requests) ? row.open_requests : []).map(request => ({ ...request, status: request.status || 'open' })),
    ...(Array.isArray(row.closed_requests) ? row.closed_requests : []).map(request => ({ ...request, status: request.status || 'closed' }))
  ];
  const requests = requestRows.map(employeeRequestConversationItem);
  const requestEvents = requestRows.flatMap(request => employeeRequestEventConversationItems(request, employee));
  const messages = Array.isArray(row.chat_messages)
    ? row.chat_messages
      .map(message => employeeChatMessageConversationItem(message, employee))
      .filter(message => includeFullGroupThread || message.direction === 'inbound' || messageBelongsToEmployee(message, employee))
    : (Array.isArray(row.messages) ? row.messages : [])
      .map(message => employeeMessageConversationItem(message, employee))
      .filter(message => messageBelongsToEmployee(message, employee));
  const seen = new Set();
  return [...requests, ...requestEvents, ...messages]
    .filter(item => item.text || item.media || item.created_at)
    .filter(item => {
      const key = `${item.direction}:${item.message_id || item.id || item.request_id || item.created_at}:${item.text || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

const employeeProfileConversation = computed(() => {
  const chat = selectedEmployeeProfileChat.value;
  if (!chat) return [];
  const employee = employeeProfile.value.employee || {};
  const conversation = Array.isArray(employeeProfileChatDetail.value.conversation) ? employeeProfileChatDetail.value.conversation : [];
  const includeFullGroupThread = chat.source_type === 'group';
  return (conversation.length ? conversation : employeeScopedConversation(chat, employee))
    .filter(message => includeFullGroupThread || message.direction === 'inbound' || messageBelongsToEmployee(message, employee));
});

const employeeStatColumns = [
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'username', label: 'Foydalanuvchi nomi', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'received_requests', label: 'Qabul', action: 'employeeInfo' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'employeeInfo' },
  { key: 'avg_close_minutes', label: 'O‘rt. daqiqa', format: fmtMinutes, action: 'employeeInfo' },
  { key: 'last_closed_at', label: 'Oxirgi #done', format: fmtDate, action: 'employeeInfo' }
];

const topEmployeeColumns = [
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'username', label: 'Foydalanuvchi nomi', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
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
  { key: 'private_requests', label: 'Shaxsiy', format: fmtNumber },
  { key: 'business_requests', label: 'Biznes', format: fmtNumber },
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

const supportPerformanceColumns = [
  { key: 'rank', label: 'O‘rin', slot: 'rank', action: 'employeeCompanies' },
  { key: 'full_name', label: 'Hodim', slot: 'employeeIdentity', action: 'employeeCompanies' },
  { key: 'company_total', label: 'Kompaniya', format: fmtNumber, action: 'employeeCompanies' },
  { key: 'closed_requests', label: 'Yopilgan', slot: 'closedRequests', action: 'employeeCompanies' },
  { key: 'open_requests', label: 'Ochiq qolgan', slot: 'openRequests', action: 'employeeCompanies' },
  { key: 'close_rate', label: 'Yopish foizi', slot: 'closeRate', action: 'employeeCompanies' },
  { key: 'avg_close_minutes', label: 'O‘rtacha vaqt', slot: 'avgTime', action: 'employeeCompanies' },
  { key: 'sla', label: 'SLA ⓘ', slot: 'sla', action: 'employeeCompanies', tooltip: 'SLA har bir xodim uchun alohida: yopilgan ticketlar / (yopilgan + xodimga biriktirilgan ochiq ticketlar).' }
];

const supportSummaryEmployeeColumns = [
  { key: 'rank', label: 'O‘rin', format: value => value ? `#${fmtNumber(value)}` : '—', action: 'employeeCompanies' },
  { key: 'full_name', label: 'Xodim', format: (_, row) => row.full_name || row.username || 'Xodim', action: 'employeeCompanies' },
  { key: 'total_requests', label: 'So‘rov', format: fmtNumber, action: 'employeeCompanies' },
  { key: 'handled_chats', label: 'Guruh/chat', format: fmtNumber, action: 'employeeCompanies' },
  { key: 'closed_requests', label: 'Yopilgan', format: fmtNumber, action: 'employeeCompanies' },
  { key: 'open_requests', label: 'Ochiq', format: fmtNumber, action: 'employeeCompanies' },
  { key: 'avg_close_minutes', label: 'O‘rtacha javob', format: fmtMinutes, action: 'employeeCompanies' },
  { key: 'sla', label: 'SLA', format: fmtPercent, action: 'employeeCompanies' }
];

const employeeColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'tg_user_id', label: 'Telegram raqami', format: v => v || '—', action: 'employeeInfo' },
  { key: 'username', label: 'Foydalanuvchi nomi', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'role', label: 'Vazifa', format: roleLabel, badge: true, action: 'employeeInfo' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'employeeInfo' },
  { key: 'today_received_requests', label: 'Bugungi so‘rov', format: fmtNumber, action: 'employeeInfo' },
  { key: 'today_answered_requests', label: 'Javob berilgan', format: fmtNumber, action: 'employeeInfo' },
  { key: 'today_open_requests', label: 'Ochiq qolgan', format: fmtNumber, action: 'employeeOpenRequests' },
  { key: 'today_written_groups', label: 'Yozgan guruhlar', format: listPreview, truncate: true, action: 'employeeGroups' },
  { key: 'today_open_customers', label: 'Qolgan so‘rovlar', format: listPreview, truncate: true, action: 'employeeOpenRequests' },
  { key: 'can_message', label: 'Yozish', format: v => v ? 'Mumkin' : 'Botni boshlashi kerak', action: 'employeeMessage' },
  { key: 'is_active', label: 'Holat', format: v => v ? 'Faol' : 'O‘chirilgan', badge: true, action: 'employeeInfo' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const openRequestColumns = [
  { key: 'chat_title', label: 'Chat/Guruh', format: (value, row) => value || row.title || row.chat_id || '—', action: 'chatDetail' },
  { key: 'customer_name', label: 'Mijoz', action: 'chatDetail' },
  { key: 'source_type', label: 'Manba', format: sourceTypeLabel, badge: true, action: 'chatDetail' },
  { key: 'created_at', label: 'Ochiq turgan vaqt', format: openDurationLabel, action: 'chatDetail' },
  { key: 'initial_text', label: 'So‘rov matni', truncate: true, action: 'chatDetail' },
  { key: 'responsible_employee_name', label: 'Mas’ul xodim', format: v => v || 'Biriktirilmagan', action: 'chatDetail' },
  { key: 'reply', label: 'Javob', slot: 'requestReply' }
];

const managerOpenRequestColumns = [
  { key: 'chat_title', label: 'Qayerdan kelgan', format: (value, row) => value || row.title || row.chat_id || '—', action: 'chatDetail' },
  { key: 'customer_name', label: 'Mijoz', format: (value, row) => value || row.customer_username || row.customer_tg_id || '—', action: 'chatDetail' },
  { key: 'responsible_employee_name', label: 'Mas’ul xodim', format: v => v || 'Biriktirilmagan', action: 'chatDetail' },
  { key: 'created_at', label: 'Ochiq turgan vaqt', format: openDurationLabel, action: 'chatDetail' },
  { key: 'initial_text', label: 'So‘rov matni', truncate: true, action: 'chatDetail' },
  { key: 'reply', label: 'Javob', slot: 'requestReply' }
];

const groupColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'title', label: 'Guruh', action: 'telegram' },
  { key: 'chat_id', label: 'Chat raqami', action: 'telegram' },
  { key: 'company_name', label: 'Kompaniya', format: v => v || 'Biriktirilmagan', action: 'companyAssign' },
  { key: 'message_count', label: 'Xabar', format: fmtNumber, action: 'chatDetail' },
  { key: 'last_message_text', label: 'Oxirgi xabar', format: v => v || '—', truncate: true, action: 'chatDetail' },
  { key: 'total_requests', label: 'So‘rov', action: 'requests' },
  { key: 'open_requests', label: 'Ochiq', action: 'requests' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'requests' },
  { key: 'progress', label: 'Yopilish', format: (_, row) => pct(row), action: 'requests' },
  { key: 'last_message_at', label: 'Faollik', format: fmtDate, action: 'chatDetail' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const companyColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'brand', label: 'Brend', format: v => v || '—' },
  { key: 'business_status', label: 'Biznes holati', format: businessStatusLabel },
  { key: 'director', label: 'Direktor', format: v => v || '—' },
  { key: 'uyqur_support_username', label: 'Mas’ul', format: (_, row) => companySupportLabel(row) },
  { key: 'phone', label: 'Telefon', format: v => v || '—' },
  { key: 'subscription_start_date', label: 'Obuna boshlanishi', format: v => v || '—' },
  { key: 'expired', label: 'Obuna', format: (_, row) => expiryStatusLabel(row) },
  { key: 'latest_status_change_at_iso', label: 'Holat o‘zgargan', format: fmtDate }
];

const companyActivityColumns = [
  { key: 'name', label: 'Kompaniya', slot: 'companyIdentity', action: 'companyGroups' },
  { key: 'business_status', label: 'Biznes holati', slot: 'businessStatus', action: 'companyGroups' },
  { key: 'director', label: 'Direktor', format: v => v || '—' },
  { key: 'uyqur_support_username', label: 'Biriktirilgan mas’ul', slot: 'supportOwner' },
  { key: 'phone', label: 'Telefon', format: v => v || '—' },
  { key: 'subscription_start_date', label: 'Boshlanish', format: v => v || '—' },
  { key: 'expired', label: 'Obuna', slot: 'expiryStatus' },
  { key: 'latest_status_change_at_iso', label: 'Holat o‘zgargan', format: fmtDate }
];

const productUsageColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'brand', label: 'Brend', format: v => v || '—' },
  { key: 'usage_score', label: 'Foydalanish', slot: 'usageScore' },
  { key: 'usage_level', label: 'Daraja' },
  { key: 'business_status', label: 'Biznes holati', slot: 'businessStatus' },
  { key: 'uyqur_support_username', label: 'Mas’ul', format: (_, row) => companySupportLabel(row) },
  { key: 'expired', label: 'Obuna', format: (_, row) => expiryStatusLabel(row) }
];

const supportMetricColumns = [
  { key: 'title', label: 'Chat/Guruh', format: (value, row) => value || row.chat_id || '—', action: 'chatDetail' },
  { key: 'source_type', label: 'Tur', format: sourceTypeLabel, badge: true, action: 'chatDetail' },
  { key: 'total_requests', label: 'So‘rov', format: fmtNumber, action: 'requests' },
  { key: 'closed_requests', label: 'Javob berilgan', format: fmtNumber, action: 'requests' },
  { key: 'open_requests', label: 'Ochiq', format: fmtNumber, action: 'requests' },
  { key: 'avg_close_minutes', label: 'O‘rtacha javob', format: fmtMinutes, action: 'chatDetail' },
  { key: 'unique_customers', label: 'Mijozlar', format: fmtNumber, action: 'chatDetail' },
  { key: 'last_request_at', label: 'Oxirgi so‘rov', format: fmtDate, action: 'chatDetail' }
];

const productMetricColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'brand', label: 'Brend', format: v => v || '—' },
  { key: 'uyqur_support_username', label: 'Mas’ul', format: (_, row) => companySupportLabel(row) },
  { key: 'business_status', label: 'Biznes holati', format: businessStatusLabel },
  { key: 'usage_score', label: 'Foydalanish', format: v => fmtPercent(v) },
  { key: 'start_label', label: 'Boshlanish' },
  { key: 'subscription_label', label: 'Obuna muddati' },
  { key: 'usage_duration_label', label: 'Ishlatmoqda' },
  { key: 'expired', label: 'Tugash', format: (_, row) => expiryStatusLabel(row) }
];

const companyMetricColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'brand', label: 'Brend', format: v => v || '—' },
  { key: 'business_status', label: 'Biznes holati', format: businessStatusLabel },
  { key: 'uyqur_support_username', label: 'Mas’ul', format: (_, row) => companySupportLabel(row) },
  { key: 'director', label: 'Direktor', format: v => v || '—' },
  { key: 'phone', label: 'Telefon', format: v => v || '—' },
  { key: 'subscription_start_date', label: 'Boshlanish', format: v => v || '—' },
  { key: 'expired', label: 'Obuna', format: (_, row) => expiryStatusLabel(row) }
];

const employeeCompanyColumns = [
  { key: 'name', label: 'Kompaniya' },
  { key: 'brand', label: 'Brend', format: v => v || '—' },
  { key: 'business_status', label: 'Biznes holati', slot: 'businessStatus' },
  { key: 'usage_score', label: 'Foydalanish', slot: 'usageScore' },
  { key: 'expired', label: 'Obuna', format: (_, row) => expiryStatusLabel(row) },
  { key: 'phone', label: 'Telefon', format: v => v || '—' }
];

const privateColumns = [
  { key: 'title', label: 'Chat', action: 'telegram' },
  { key: 'source_type', label: 'Tur', format: sourceTypeLabel, badge: true, action: 'chatDetail' },
  { key: 'total_requests', label: 'So‘rov', action: 'chatDetail' },
  { key: 'open_requests', label: 'Ochiq', action: 'chatDetail' },
  { key: 'closed_requests', label: 'Yopilgan', action: 'chatDetail' },
  { key: 'last_message_at', label: 'Oxirgi xabar', format: fmtDate, action: 'chatDetail' },
  { key: 'actions', label: 'Amal', slot: 'actions' }
];

const requestColumns = [
  { key: 'customer_name', label: 'Mijoz', action: 'chatDetail' },
  { key: 'initial_text', label: 'So‘rov matni', truncate: true, action: 'chatDetail' },
  { key: 'status', label: 'Holat', format: statusLabel, badge: true, action: 'chatDetail' },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—', action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate, action: 'chatDetail' },
  { key: 'closed_at', label: 'Yopilgan', format: fmtDate, action: 'chatDetail' },
  { key: 'reply', label: 'Javob', slot: 'requestReply' }
];

const ticketListColumns = [
  { key: 'id', label: 'Ticket ID', format: value => `TK-${shortId(value)}` },
  { key: 'initial_text', label: 'So‘rov matni', truncate: true, action: 'chatDetail' },
  { key: 'company_name', label: 'Kompaniya', format: (value, row) => value || row.chat_title || '—', action: 'chatDetail' },
  { key: 'responsible_employee_name', label: 'Mas’ul xodim', format: (value, row) => value || row.support_name || row.closed_by_name || '—' },
  { key: 'created_at', label: 'So‘rov vaqti', format: fmtDate },
  { key: 'closed_at', label: 'Javob vaqti', format: value => value ? fmtDate(value) : '—' },
  { key: 'status', label: 'Holati', format: statusLabel, badge: true },
  { key: 'reply', label: 'Amal', slot: 'requestReply' }
];

const chatRequestColumns = [
  { key: 'customer_name', label: 'Mijoz', format: v => v || '—', action: 'chatDetail' },
  { key: 'initial_text', label: 'Kelgan so‘rov', truncate: true, action: 'chatDetail' },
  { key: 'status', label: 'Holat', format: statusLabel, badge: true, action: 'chatDetail' },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—', action: 'chatDetail' },
  { key: 'solution_text', label: 'Yechim/Javob', truncate: true, format: v => v || '—', action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate },
  { key: 'solution_at', label: 'Javob vaqti', format: fmtDate },
  { key: 'reply', label: 'Javob', slot: 'requestReply' }
];

const employeeOpenRequestColumns = [
  { key: 'chat_title', label: 'Guruh', action: 'chatDetail' },
  { key: 'customer_name', label: 'Mijoz', action: 'chatDetail' },
  { key: 'initial_text', label: 'So‘rov', truncate: true, action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate, action: 'chatDetail' },
  { key: 'reply', label: 'Javob', slot: 'requestReply' }
];

function timelineTypeLabel(type) {
  return ({
    ticket: 'So‘rov',
    note: 'Izoh',
    solution: 'Yechim',
    closed: 'Yopildi',
    employee_reply: 'Javob',
    admin_reply: 'Admin javobi',
    done_without_request: 'So‘rovsiz #done'
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

function messageSourceLabel(message = {}) {
  const label = String(message.source_label || '').trim();
  if (label) return label;
  const origin = String(message.origin_type || message.actor_type || '').trim().toLowerCase();
  if (origin === 'admin') return 'Admin';
  if (origin === 'bot') return 'Bot';
  if (origin === 'ai') return 'AI';
  if (origin === 'employee') return 'Xodim';
  if (origin === 'customer') return 'Mijoz';
  if (message.direction === 'outbound') return 'Xodim';
  return 'Mijoz';
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
  if (!media) return 'Fayl';
  if (mediaErrors.value[media.file_id]) return 'Fayl yuklanmadi';
  if (mediaLoading.value[media.file_id]) return 'Fayl yuklanmoqda...';
  return ({
    photo: 'Rasm',
    video: 'Video',
    video_note: 'Video xabar',
    animation: 'Animatsiya',
    voice: 'Ovozli xabar',
    audio: 'Audio',
    document: media.file_name || 'Fayl'
  }[media.kind] || 'Fayl');
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
    if (activeTab.value === 'stats') await loadSupportPerformance();
    if (activeTab.value === 'productAnalytics') await loadProductAnalytics();
    if (activeTab.value === 'companyActivity') await loadCompanyActivity();
    if (activeTab.value === 'groups') {
      await Promise.all([
        api.groups().then(rows => { groups.value = rows; }),
        loadCompanyInfoOptional()
      ]);
    }
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'companies') await loadCompanyInfo();
    if (activeTab.value === 'integrations') await loadSettings();
    if (activeTab.value === 'knowledgeBase') await loadSettings();
    if (activeTab.value === 'settings') await loadSettings();
  } catch (error) {
    showToast(error.message);
    if (/token/i.test(error.message)) logout();
  } finally {
    stopLoading('refresh');
  }
}

async function loadDashboard() {
  const data = await api.dashboard(dashboardPeriodQuery());
  Object.assign(dashboard, data);
}

async function loadCompanyInfo() {
  companyInfo.value = await api.companyInfo();
}

async function loadCompanyInfoOptional() {
  try {
    await loadCompanyInfo();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadEmployeesOptional() {
  try {
    employees.value = await api.employees();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSupportPerformance() {
  await Promise.all([
    loadDashboard(),
    loadCompanyInfoOptional(),
    loadEmployeesOptional()
  ]);
}

async function loadProductAnalytics() {
  await loadCompanyInfo();
}

async function loadCompanyActivity() {
  await Promise.all([
    loadCompanyInfo(),
    loadDashboard()
  ]);
}

async function loadSettings() {
  const data = await api.settings();
  settingsRaw.value = data;
  const admin = data.admins?.[0];
  if (admin) {
    adminForm.username = admin.username || 'admin';
    adminForm.full_name = admin.full_name || 'Tizim admini';
  }
  const ai = data.settings?.find(s => s.key === 'ai_mode')?.value;
  const integration = data.settings?.find(s => s.key === 'ai_integration')?.value;
  const logNotifications = data.settings?.find(s => s.key === 'log_notifications')?.value;
  const groupMessageAudit = data.settings?.find(s => s.key === 'group_message_audit')?.value;
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
    knowledge_text: integration?.knowledge_text || '',
    last_check_status: integration?.last_check_status || '',
    last_checked_at: integration?.last_checked_at || '',
    last_check_error: integration?.last_check_error || ''
  });
  Object.assign(logForm, {
    enabled: !!logNotifications?.enabled,
    levels: Array.isArray(logNotifications?.levels) && logNotifications.levels.length ? logNotifications.levels : ['error'],
    target: logNotifications?.target || 'main_group',
    sources: normalizeLogSources(logNotifications?.sources || []),
    test_level: logForm.test_level || 'info'
  });
  savedIntegrationSignature.value = aiConnectionSignature(integrationForm);
  const modelVerified = !!(integration?.last_check_status === 'ok' && integration?.model && integration?.has_api_key);
  settingsForm.ai_mode = ai?.enabled && ai?.provider && modelVerified ? 'model' : String(!!ai?.enabled);
  const autoReplySetting = data.settings?.find(s => s.key === 'auto_reply')?.value;
  settingsForm.auto_reply = autoReplySetting !== undefined
    ? String(!!autoReplySetting.enabled)
    : 'true';
  settingsForm.done_tag = done?.tag || '#done';
  settingsForm.main_group_id = mainGroup?.chat_id || '';
  settingsForm.group_message_audit = groupMessageAudit === undefined
    ? 'true'
    : String(groupMessageAudit?.enabled !== false);
  settingsForm.request_detection = detect?.mode || 'keyword';
  await checkTelegramWebhook(false);
}

function setThemeMode(mode) {
  const safeMode = ['system', 'light', 'dark'].includes(mode) ? mode : 'system';
  themeMode.value = safeMode;
  if (typeof window !== 'undefined') window.localStorage.setItem(THEME_STORAGE_KEY, safeMode);
  applyThemeMode(safeMode);
}

function defaultCustomPeriodDates() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function openCustomPeriodModal() {
  previousStatsPeriod.value = selectedStatsPeriod.value === 'custom' ? previousStatsPeriod.value : selectedStatsPeriod.value;
  const defaults = defaultCustomPeriodDates();
  customPeriodForm.start = customPeriodForm.appliedStart || customPeriodForm.start || defaults.start;
  customPeriodForm.end = customPeriodForm.appliedEnd || customPeriodForm.end || defaults.end;
  customPeriodError.value = '';
  selectedStatsPeriod.value = 'custom';
  actionMenuOpen.value = false;
  modal.value = 'customPeriod';
}

function handleStatsPeriodChange() {
  if (selectedStatsPeriod.value === 'custom') {
    openCustomPeriodModal();
    return;
  }
  previousStatsPeriod.value = selectedStatsPeriod.value;
}

function cancelCustomPeriod() {
  customPeriodError.value = '';
  if (!customPeriodForm.appliedStart || !customPeriodForm.appliedEnd) {
    selectedStatsPeriod.value = previousStatsPeriod.value || 'week';
  }
  modal.value = '';
}

function dashboardPeriodQuery() {
  if (selectedStatsPeriod.value !== 'custom' || !customPeriodForm.appliedStart || !customPeriodForm.appliedEnd) return {};
  return {
    period: 'custom',
    start_date: customPeriodForm.appliedStart,
    end_date: customPeriodForm.appliedEnd
  };
}

async function applyCustomPeriod() {
  customPeriodError.value = '';
  if (!customPeriodForm.start || !customPeriodForm.end) {
    customPeriodError.value = 'Ikkala sanani ham tanlang';
    return;
  }
  const start = customPeriodForm.start <= customPeriodForm.end ? customPeriodForm.start : customPeriodForm.end;
  const end = customPeriodForm.start <= customPeriodForm.end ? customPeriodForm.end : customPeriodForm.start;
  customPeriodForm.appliedStart = start;
  customPeriodForm.appliedEnd = end;
  selectedStatsPeriod.value = 'custom';
  modal.value = '';
  startLoading('customPeriod');
  try {
    await loadSupportPerformance();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('customPeriod');
  }
}

function runHeaderAction(action) {
  actionMenuOpen.value = false;
  if (typeof action === 'function') action();
}

async function setTab(key) {
  activeTab.value = isValidTab(key) ? key : 'stats';
  storeActiveTab(activeTab.value);
  search.value = '';
  startLoading('tab');
  try {
    if (activeTab.value === 'stats') await loadSupportPerformance();
    if (activeTab.value === 'productAnalytics') await loadProductAnalytics();
    if (activeTab.value === 'companyActivity') await loadCompanyActivity();
    if (activeTab.value === 'groups') {
      await Promise.all([
        api.groups().then(rows => { groups.value = rows; }),
        loadCompanyInfoOptional()
      ]);
    }
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'companies') await loadCompanyInfo();
    if (activeTab.value === 'integrations') await loadSettings();
    if (activeTab.value === 'knowledgeBase') await loadSettings();
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
    loginError.value = 'Kirish nomi va parolni kiriting.';
    return;
  }

  startLoading('login');
  loginStatus.value = 'Kirish nomi va parol tekshirilmoqda...';
  try {
    const data = await api.login(loginForm.username, loginForm.password);
    loginStatus.value = 'Muvaffaqiyatli. Panel yuklanmoqda...';
    loginStatusType.value = 'success';
    token.value = data.token;
    showToast(data.fallback ? 'Kirdingiz. DB admin yarating yoki parolni o‘zgartiring.' : 'Xush kelibsiz!');
    await loadSettings().catch(error => showToast(error.message));
    if (activeTab.value === 'stats') await loadSupportPerformance();
    else if (activeTab.value === 'productAnalytics') await loadProductAnalytics();
    else await refresh();
    await checkTelegramWebhook(false);
  } catch (error) {
    loginError.value = /login|parol/i.test(error.message)
      ? 'Kirish nomi yoki parol noto‘g‘ri.'
      : error.message;
  } finally {
    stopLoading('login');
  }
}

function logout() {
  actionMenuOpen.value = false;
  stopTelegramAutoSync();
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

function chatIdKey(row = {}) {
  return row?.chat_id === undefined || row?.chat_id === null ? '' : String(row.chat_id);
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
  if (!url) return showToast('Telegramda ochish uchun chat raqami yoki foydalanuvchi nomi topilmadi');
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
    if (!chatRow) return showToast('Chat tafsiloti uchun chat raqami topilmadi');
    loadChatDetail(chatRow);
    return;
  }
  if (action === 'requests') {
    const chatRow = tableActionChatRow(row);
    if (!chatRow) return showToast('So‘rovlar uchun chat raqami topilmadi');
    loadRequests(chatRow);
    return;
  }
  if (action === 'companyAssign') {
    openAssignCompany(row);
    return;
  }
  if (action === 'companyGroups') {
    openCompanyGroupActivity(row);
    return;
  }
  if (action === 'employeeInfo') {
    openEmployee(tableActionEmployeeRow(row));
    return;
  }
  if (action === 'employeeCompanies') {
    openEmployeeCompanies(row);
    return;
  }
  if (action === 'employeeGroups') {
    openEmployeeGroups(row);
    return;
  }
  if (action === 'employeeOpenRequests') {
    openEmployeeOpenRequests(row);
    return;
  }
  if (action === 'employeeMessage') {
    const employee = tableActionEmployeeRow(row);
    if (!employee.id && !employee.employee_id && !employee.tg_user_id) return showToast('Xodim Telegram raqami topilmadi');
    openEmployeeMessage(employee);
    return;
  }
  if (action === 'send') {
    const chatRow = tableActionChatRow(row);
    if (!chatRow) return showToast('Xabar yuborish uchun chat raqami topilmadi');
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
    const tgId = row.tg_user_id ? `Telegram raqami: ${row.tg_user_id}` : 'Telegram raqami ulanmagan';
    return [username, tgId].filter(Boolean).join(' · ');
  }
  return `Chat raqami: ${row.chat_id}`;
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

function openEmployeeGroups(row = {}) {
  employeeDrilldown.value = row;
  employeeGroupActivity.value = Array.isArray(row.today_group_activity) ? row.today_group_activity : [];
  employeeGroupTicketVisibility.value = {};
  if (!employeeGroupActivity.value.length) return showToast('Bugun yozgan guruhlar topilmadi');
  modal.value = 'employeeGroups';
}

function employeeProfileChatKey(row = {}) {
  return String(row.chat_id || row.key || row.title || '').trim();
}

function companyGroupChatKey(row = {}) {
  return String(row.chat_id || row.key || row.title || '').trim();
}

function chatInitials(row = {}) {
  return initialsFromText(row.title || row.customer_name || row.chat_id || 'Chat');
}

function chatPreview(row = {}) {
  const openRequest = Array.isArray(row.open_requests) ? row.open_requests[0] : null;
  const closedRequest = Array.isArray(row.closed_requests) ? row.closed_requests[0] : null;
  const message = Array.isArray(row.chat_messages) ? row.chat_messages[0] : (Array.isArray(row.messages) ? row.messages[0] : null);
  return openRequest?.initial_text || closedRequest?.initial_text || message?.text || 'Yozishma tarixi';
}

function shortId(value = '') {
  const text = String(value || '').replace(/-/g, '');
  return text ? text.slice(0, 6).toUpperCase() : '—';
}

function ticketToggleLabel(isOpen, count = 0) {
  return isOpen ? 'Tiketlarni yashirish' : `Tiketlarni ko‘rish (${fmtNumber(count)})`;
}

function employeeGroupVisibilityKey(group = {}) {
  return String(group.chat_id || group.key || group.title || '').trim();
}

function isEmployeeGroupTicketsOpen(group = {}) {
  const key = employeeGroupVisibilityKey(group);
  return key ? employeeGroupTicketVisibility.value[key] !== false : true;
}

function toggleEmployeeGroupTickets(group = {}) {
  const key = employeeGroupVisibilityKey(group);
  if (!key) return;
  employeeGroupTicketVisibility.value = {
    ...employeeGroupTicketVisibility.value,
    [key]: !isEmployeeGroupTicketsOpen(group)
  };
}

function messageBelongsToEmployee(message = {}, employee = {}) {
  const employeeId = String(employee.id || employee.employee_id || '').trim();
  const messageEmployeeId = String(message.employee_id || '').trim();
  if (employeeId && messageEmployeeId && employeeId === messageEmployeeId) return true;
  const employeeTgUserId = String(employee.tg_user_id || '').trim();
  const messageTgUserId = String(message.actor_tg_user_id || message.from_tg_user_id || '').trim();
  if (employeeTgUserId && messageTgUserId && employeeTgUserId === messageTgUserId) return true;
  const employeeUsername = normalizeSupportUsername(employee.username);
  const messageUsername = normalizeSupportUsername(message.actor_username || message.from_username || '');
  if (employeeUsername && messageUsername && employeeUsername === messageUsername) return true;
  const employeeName = String(employee.full_name || '').trim().toLowerCase();
  const actorName = String(message.actor_name || message.from_name || '').trim().toLowerCase();
  const outboundEmployeeMessage = message.direction === 'outbound' || message.actor_type === 'employee';
  return Boolean(outboundEmployeeMessage && employeeName && actorName && employeeName === actorName);
}

function resetEmployeeProfileChat() {
  employeeProfileSelectedChatKey.value = '';
  employeeProfileChatDetail.value = { chat: null, requests: [], conversation: [] };
  employeeProfileChatLoading.value = false;
  employeeProfileChatError.value = '';
  employeeProfileTicketsOpen.value = false;
  employeeProfileChatToken += 1;
}

function setEmployeeProfileTab(tab) {
  employeeProfileTab.value = tab === 'group' ? 'group' : 'private';
  const first = employeeProfileVisibleChats.value[0];
  if (first) selectEmployeeProfileChat(first);
  else resetEmployeeProfileChat();
}

async function selectEmployeeProfileChat(row = {}) {
  const key = employeeProfileChatKey(row);
  employeeProfileSelectedChatKey.value = key;
  employeeProfileTicketsOpen.value = false;
  if (!row.chat_id) return;
  const token = ++employeeProfileChatToken;
  employeeProfileChatLoading.value = true;
  employeeProfileChatError.value = '';
  clearMediaUrls();
  try {
    if (token !== employeeProfileChatToken || employeeProfileSelectedChatKey.value !== key) return;
    const employee = employeeProfile.value.employee || {};
    employeeProfileChatDetail.value = {
      chat: row,
      requests: employeeProfileChatRequests.value,
      conversation: employeeScopedConversation(row, employee)
    };
    await nextTick();
    scrollEmployeeProfileChatToEnd();
    loadConversationMedia(employeeProfileConversation.value)
      .then(scrollEmployeeProfileChatToEnd)
      .catch(error => showToast(error.message));
  } catch (error) {
    if (token !== employeeProfileChatToken || employeeProfileSelectedChatKey.value !== key) return;
    employeeProfileChatDetail.value = { chat: null, requests: [], conversation: [] };
    employeeProfileChatError.value = error.message;
  } finally {
    if (token === employeeProfileChatToken && employeeProfileSelectedChatKey.value === key) {
      employeeProfileChatLoading.value = false;
    }
  }
}

async function openEmployeeCompanies(row = {}) {
  const employee = resolveEmployeeForCompany(row);
  const companies = (row.assigned_companies || visibleCompanyInfoRows.value
    .filter(company => companyMatchesEmployee(company, employee))
    .map(enrichCompanyUsage));
  employeeCompanyDetail.value = {
    employee,
    companies,
    summary: companyPortfolioSummary(companies)
  };
  employeeProfileLoadToken += 1;
  const loadToken = employeeProfileLoadToken;
  resetEmployeeProfileChat();
  employeeProfileTab.value = 'private';
  employeeProfile.value = {
    employee,
    rank: row.rank || null,
    companies,
    summary: {
      closed_requests: Number(row.closed_requests || 0),
      open_requests: Number(row.open_requests || 0),
      company_total: companies.length || Number(row.company_total || row.assigned_company_count || 0),
      avg_close_minutes: Number(row.avg_close_minutes || 0),
      close_rate: Number(row.close_rate || row.sla || 0),
      sla: Number(row.sla || row.close_rate || 0)
    },
    groups: []
  };
  modal.value = 'employeeCompanies';
  loadEmployeeAvatar(employee);
  const employeeId = employee.id || employee.employee_id || '';
  const tgUserId = employee.tg_user_id || '';
  if (!employeeId && !tgUserId) {
    showToast('Xodim ID topilmadi, faqat kompaniya portfeli ko‘rsatildi');
    return;
  }
  startLoading('employeeActivity');
  try {
    const data = await api.employeeActivity({
      employee_id: employeeId,
      tg_user_id: tgUserId,
      period: selectedStatsPeriod.value
    });
    if (loadToken !== employeeProfileLoadToken) return;
    const summary = data.summary || {};
    employeeProfile.value = {
      employee: data.employee || employee,
      rank: row.rank || null,
      companies,
      summary: {
        closed_requests: Number(summary.closed_requests ?? row.closed_requests ?? 0),
        open_requests: Number(summary.open_requests ?? row.open_requests ?? 0),
        company_total: companies.length || Number(row.company_total || row.assigned_company_count || 0),
        avg_close_minutes: Number(summary.avg_close_minutes ?? row.avg_close_minutes ?? 0),
        close_rate: Number(row.close_rate || row.sla || 0),
        sla: Number(row.sla || row.close_rate || 0),
        handled_chats: Number(summary.handled_chats || row.handled_chats || 0),
        message_count: Number(summary.message_count || 0),
        customer_count: Number(summary.customer_count || 0)
      },
      groups: data.groups || []
    };
    loadEmployeeAvatar(employeeProfile.value.employee);
    await nextTick();
    const first = employeeProfileVisibleChats.value[0] || employeeProfileGroupChats.value[0];
    if (first) {
      if (!employeeProfileVisibleChats.value.length && employeeProfileGroupChats.value.length) employeeProfileTab.value = 'group';
      selectEmployeeProfileChat(first);
    }
  } catch (error) {
    if (loadToken === employeeProfileLoadToken) showToast(error.message);
  } finally {
    if (loadToken === employeeProfileLoadToken) stopLoading('employeeActivity');
  }
}

function openAssignCompany(row = {}) {
  selectedTarget.value = row;
  const currentName = String(row.company_name || '').trim().toLowerCase();
  const current = currentName
    ? companyInfoRows.value.find(company => String(company.name || '').trim().toLowerCase() === currentName)
    : null;
  companyAssignForm.companyKey = current ? companyAssignKey(current) : '';
  companyAssignForm.search = '';
  modal.value = 'assignCompany';
}

async function saveGroupCompanyAssignment(clearOnly = false) {
  if (!selectedTarget.value?.chat_id) return showToast('Guruh tanlanmagan');
  const company = !clearOnly && companyAssignForm.companyKey
    ? companyInfoRows.value.find(row => companyAssignKey(row) === companyAssignForm.companyKey)
    : null;
  startLoading('assignCompany');
  try {
    const payload = company
      ? { chat_id: selectedTarget.value.chat_id, company }
      : { chat_id: selectedTarget.value.chat_id, company_id: '', clear: true };
    await api.assignChatCompany(payload);
    groups.value = await api.groups();
    await loadDashboard().catch(() => null);
    showToast(company ? 'Guruh kompaniyaga biriktirildi' : 'Guruh kompaniyadan ajratildi');
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('assignCompany');
  }
}

function addLogSource() {
  const chatId = String(logSourceDraft.chat_id || '').trim();
  if (!chatId) return showToast('Kanal raqamini kiriting');
  if (logForm.sources.some(source => String(source.chat_id) === chatId)) return showToast('Bu kanal allaqachon qo‘shilgan');
  logForm.sources.push({
    id: `log-source-${Date.now()}`,
    chat_id: chatId,
    label: logSourceDraft.label || chatId,
    source: logSourceDraft.source || 'backend',
    enabled: true
  });
  Object.assign(logSourceDraft, { chat_id: '', label: '', source: 'backend' });
}

function removeLogSource(index) {
  logForm.sources.splice(index, 1);
}

async function openEmployeeActivity(row = {}) {
  const employee = tableActionEmployeeRow(row);
  const employeeId = employee.id || employee.employee_id || '';
  const tgUserId = employee.tg_user_id || '';
  if (!employeeId && !tgUserId) return showToast('Xodim ID topilmadi');
  startLoading('employeeActivity');
  try {
    const data = await api.employeeActivity({
      employee_id: employeeId,
      tg_user_id: tgUserId,
      period: selectedStatsPeriod.value
    });
    employeeActivity.value = {
      employee: data.employee || employee,
      summary: data.summary || {},
      groups: data.groups || [],
      closed_requests: data.closed_requests || [],
      messages: data.messages || []
    };
    employeeDrilldown.value = employeeActivity.value.employee;
    modal.value = 'employeeActivity';
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('employeeActivity');
  }
}

function openEmployeeOpenRequests(row = {}) {
  employeeDrilldown.value = row;
  employeeOpenRequests.value = Array.isArray(row.today_open_requests_detail) ? row.today_open_requests_detail : [];
  if (!employeeOpenRequests.value.length) return showToast('Ochiq qolgan so‘rov topilmadi');
  modal.value = 'employeeOpenRequests';
}

function openRemainingRequests() {
  if (!(dashboard.openRequests || []).length) return showToast('Ochiq so‘rov qolmagan');
  selectedTarget.value = null;
  modal.value = 'openRequests';
}

function resetMetricChatDetail() {
  metricChatDetail.value = { chat: null, requests: [], conversation: [] };
  metricChatLoading.value = false;
  metricChatError.value = '';
  metricChatSelectedId.value = '';
  metricChatTicketsOpen.value = true;
}

function setMetricDetail({ title, rows, columns, empty = 'Ma’lumot topilmadi', pageSize = 12, summary = [], chatPane = false }) {
  resetMetricChatDetail();
  metricDetail.value = { title, rows, columns, empty, pageSize, summary, chatPane };
  modal.value = 'metricDetail';
}

function isGroupMetricRow(row = {}) {
  return String(row.source_type || row.chat_source_type || '').toLowerCase() === 'group';
}

function sumMetricRows(rows = [], key = 'total_requests') {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function supportMetricSummary(rows = []) {
  const groupRows = rows.filter(isGroupMetricRow);
  const chatRows = rows.filter(row => !isGroupMetricRow(row));
  return [
    { label: 'Jami so‘rov', value: fmtNumber(sumMetricRows(rows, 'total_requests')) },
    { label: 'Javob berilgan', value: fmtNumber(sumMetricRows(rows, 'closed_requests')) },
    { label: 'Ochiq', value: fmtNumber(sumMetricRows(rows, 'open_requests')) },
    { label: 'Guruhdan kelgan', value: fmtNumber(sumMetricRows(groupRows, 'total_requests')) },
    { label: 'Chatdan kelgan', value: fmtNumber(sumMetricRows(chatRows, 'total_requests')) }
  ];
}

function setThreadScrollToEnd(thread) {
  if (!thread) return;
  thread.scrollTop = thread.scrollHeight;
}

async function scrollThreadToEnd(threadRef) {
  await nextTick();
  const thread = threadRef.value;
  setThreadScrollToEnd(thread);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setThreadScrollToEnd(thread));
  }
}

async function scrollMetricChatToEnd() {
  await scrollThreadToEnd(metricChatThreadRef);
}

async function scrollChatDetailToEnd() {
  await scrollThreadToEnd(chatDetailThreadRef);
}

async function scrollEmployeeProfileChatToEnd() {
  await scrollThreadToEnd(employeeProfileThreadRef);
}

async function scrollCompanyGroupToEnd() {
  await scrollThreadToEnd(companyGroupThreadRef);
}

watch(chatConversation, () => scrollChatDetailToEnd(), { flush: 'post' });
watch(metricChatConversation, () => scrollMetricChatToEnd(), { flush: 'post' });
watch(employeeProfileConversation, () => scrollEmployeeProfileChatToEnd(), { flush: 'post' });
watch(companyGroupConversation, () => scrollCompanyGroupToEnd(), { flush: 'post' });

async function loadMetricChatDetail(row = {}) {
  const chatRow = tableActionChatRow(row);
  if (!chatRow) {
    metricChatError.value = 'Chat tafsiloti uchun chat raqami topilmadi';
    return;
  }
  const selectedKey = chatIdKey(chatRow);
  metricChatSelectedId.value = selectedKey;
  metricChatLoading.value = true;
  metricChatError.value = '';
  metricChatTicketsOpen.value = true;
  clearMediaUrls();
  try {
    const data = await api.chatDetail({ chat_id: chatRow.chat_id });
    if (metricChatSelectedId.value !== selectedKey) return;
    metricChatDetail.value = data;
    await scrollMetricChatToEnd();
    loadConversationMedia(data.conversation || [])
      .then(scrollMetricChatToEnd)
      .catch(error => showToast(error.message));
  } catch (error) {
    if (metricChatSelectedId.value !== selectedKey) return;
    metricChatDetail.value = {
      chat: { ...chatRow, title: chatRow.title || String(chatRow.chat_id), total_requests: 0, open_requests: 0, closed_requests: 0 },
      requests: [],
      conversation: []
    };
    metricChatError.value = error.message;
  } finally {
    if (metricChatSelectedId.value === selectedKey) metricChatLoading.value = false;
  }
}

function handleMetricDetailCellAction(payload) {
  if (metricDetail.value.chatPane) {
    loadMetricChatDetail(payload.row);
    return;
  }
  handleTableCellAction(payload);
}

function metricDetailRowClass(row = {}) {
  const key = chatIdKey(row);
  return metricDetail.value.chatPane && key && key === metricChatSelectedId.value ? 'selected-row' : '';
}

function openSupportMetricDetail(kind = 'requests') {
  const periodLabel = selectedPeriodLabel.value;
  let rows = [...(chatPerformanceRows.value.length ? chatPerformanceRows.value : groupPerformanceRows.value)];
  let title = `${periodLabel} so‘rovlar`;
  if (kind === 'closed') {
    rows = rows.filter(row => Number(row.closed_requests || 0) > 0)
      .sort((a, b) => Number(b.closed_requests || 0) - Number(a.closed_requests || 0));
    title = `${periodLabel}: javob berilgan chat/guruhlar`;
  } else if (kind === 'avg') {
    rows = rows.filter(row => Number(row.closed_requests || 0) > 0)
      .sort((a, b) => Number(b.avg_close_minutes || 0) - Number(a.avg_close_minutes || 0));
    title = `${periodLabel}: o‘rtacha javob vaqti`;
  } else {
    rows = rows.filter(row => Number(row.total_requests || 0) > 0)
      .sort((a, b) => Number(b.total_requests || 0) - Number(a.total_requests || 0));
  }
  if (!rows.length) return showToast('Bu davr uchun chat/guruh ma’lumoti yo‘q');
  setMetricDetail({
    title,
    rows,
    columns: supportMetricColumns,
    empty: 'Chat/guruh ma’lumoti topilmadi',
    summary: supportMetricSummary(rows),
    chatPane: true
  });
  loadMetricChatDetail(rows[0]);
}

function employeeSummaryKey(row = {}) {
  const username = normalizeSupportUsername(row.username || row.responsible_employee_username || '');
  if (username) return `u:${username}`;
  const id = String(row.employee_id || row.id || row.responsible_employee_id || '').trim();
  if (id) return `id:${id}`;
  const tgUserId = String(row.tg_user_id || '').trim();
  if (tgUserId) return `tg:${tgUserId}`;
  return String(row.full_name || row.responsible_employee_name || '').trim().toLowerCase();
}

function employeeOpenRequestSummaryMap() {
  const map = new Map();
  (dashboard.openRequests || []).forEach(request => {
    const key = employeeSummaryKey(request);
    if (!key) return;
    const current = map.get(key) || {
      key,
      employee_id: request.responsible_employee_id || '',
      username: request.responsible_employee_username || '',
      full_name: request.responsible_employee_name || 'Xodim biriktirilmagan',
      open_requests: 0,
      chat_keys: new Set()
    };
    current.open_requests += 1;
    if (request.chat_id) current.chat_keys.add(String(request.chat_id));
    map.set(key, current);
  });
  return map;
}

function employeeSummaryRows(kind = 'requests') {
  const openMap = employeeOpenRequestSummaryMap();
  const rowMap = new Map();
  topSupportCards.value.forEach(row => {
    const key = employeeSummaryKey(row);
    const openSummary = key ? openMap.get(key) : null;
    const openRequests = openSummary ? Number(openSummary.open_requests || 0) : Number(row.open_requests || 0);
    rowMap.set(key || row.key || row.full_name, {
      ...row,
      total_requests: Number(row.closed_requests || 0) + openRequests,
      open_requests: openRequests,
      handled_chats: Math.max(Number(row.handled_chats || 0), openSummary?.chat_keys?.size || 0)
    });
    if (key) openMap.delete(key);
  });
  openMap.forEach(row => {
    rowMap.set(row.key, {
      ...row,
      rank: '',
      closed_requests: 0,
      total_requests: Number(row.open_requests || 0),
      handled_chats: row.chat_keys.size,
      avg_close_minutes: 0,
      sla: 0,
      close_rate: 0
    });
  });
  const rows = [...rowMap.values()];
  if (kind === 'closed') {
    return rows
      .filter(row => Number(row.closed_requests || 0) > 0)
      .sort((a, b) => Number(b.closed_requests || 0) - Number(a.closed_requests || 0));
  }
  if (kind === 'open') {
    return rows
      .filter(row => Number(row.open_requests || 0) > 0)
      .sort((a, b) => Number(b.open_requests || 0) - Number(a.open_requests || 0));
  }
  if (kind === 'avg') {
    return rows
      .filter(row => Number(row.avg_close_minutes || 0) > 0)
      .sort((a, b) => Number(b.avg_close_minutes || 0) - Number(a.avg_close_minutes || 0));
  }
  return rows
    .filter(row => Number(row.total_requests || 0) > 0)
    .sort((a, b) => Number(b.total_requests || 0) - Number(a.total_requests || 0));
}

function supportSummaryEmployeeSummary(rows = []) {
  return [
    { label: 'Xodimlar', value: fmtNumber(rows.length) },
    { label: 'Jami so‘rov', value: fmtNumber(sumMetricRows(rows, 'total_requests')) },
    { label: 'Yopilgan', value: fmtNumber(sumMetricRows(rows, 'closed_requests')) },
    { label: 'Ochiq', value: fmtNumber(sumMetricRows(rows, 'open_requests')) },
    { label: 'Guruh/chat', value: fmtNumber(sumMetricRows(rows, 'handled_chats')) }
  ];
}

function openSupportEmployeeSummary(kind = 'requests') {
  const titleMap = {
    requests: `${selectedPeriodLabel.value}: xodimlar bo‘yicha so‘rovlar`,
    closed: `${selectedPeriodLabel.value}: javob berilgan so‘rovlar`,
    open: `${selectedPeriodLabel.value}: javobsiz so‘rovlar`,
    avg: `${selectedPeriodLabel.value}: o‘rtacha javob vaqti`
  };
  const rows = employeeSummaryRows(kind);
  if (!rows.length) return showToast('Bu davr uchun xodimlar kesimida ma’lumot yo‘q');
  setMetricDetail({
    title: titleMap[kind] || titleMap.requests,
    rows,
    columns: supportSummaryEmployeeColumns,
    empty: 'Xodimlar bo‘yicha ma’lumot topilmadi',
    summary: supportSummaryEmployeeSummary(rows),
    pageSize: 12
  });
}

function productMetricRows(kind = 'total') {
  const rows = productUsageRows.value.map(enrichCompanyTimeline);
  if (kind === 'active') return rows.filter(row => row.business_status === 'ACTIVE');
  if (kind === 'highUsage') return rows.filter(row => Number(row.usage_score || 0) >= 75);
  if (kind === 'risk') return rows.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state));
  return rows;
}

function openProductMetricDetail(kind = 'total') {
  const titleMap = {
    total: 'Kuzatuvdagi kompaniyalar',
    active: 'Aktiv foydalanayotgan kompaniyalar',
    highUsage: 'Yuqori foydalanishdagi kompaniyalar',
    risk: 'Risk va churn kompaniyalari'
  };
  const rows = productMetricRows(kind);
  if (!rows.length) return showToast('Bu metrika bo‘yicha kompaniya topilmadi');
  setMetricDetail({
    title: titleMap[kind] || 'Kompaniya tafsilotlari',
    rows,
    columns: productMetricColumns,
    empty: 'Kompaniya ma’lumoti topilmadi',
    summary: [
      { label: 'Kompaniya', value: fmtNumber(rows.length) },
      { label: 'Aktiv', value: fmtNumber(rows.filter(row => row.business_status === 'ACTIVE').length) },
      { label: 'Risk', value: fmtNumber(rows.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state)).length) },
      { label: 'O‘rtacha foydalanish', value: fmtPercent(rows.reduce((sum, row) => sum + Number(row.usage_score || 0), 0) / rows.length) }
    ]
  });
}

function companyMetricRows(kind = 'total') {
  const rows = visibleCompanyInfoRows.value;
  if (kind === 'active') return rows.filter(row => row.business_status === 'ACTIVE');
  if (kind === 'paused') return rows.filter(row => row.business_status === 'PAUSED');
  if (kind === 'expiry') return rows.filter(row => ['expired', 'soon'].includes(row.expiry_state));
  return rows;
}

function openCompanyMetricDetail(kind = 'total') {
  const titleMap = {
    total: 'Kompaniyalar',
    active: 'Biznes aktiv kompaniyalar',
    paused: 'Churn/Pauzadagi kompaniyalar',
    expiry: 'Obuna nazoratidagi kompaniyalar'
  };
  const rows = companyMetricRows(kind);
  if (!rows.length) return showToast('Bu metrika bo‘yicha kompaniya topilmadi');
  setMetricDetail({
    title: titleMap[kind] || 'Kompaniya tafsilotlari',
    rows,
    columns: companyMetricColumns,
    empty: 'Kompaniya ma’lumoti topilmadi',
    summary: [
      { label: 'Kompaniya', value: fmtNumber(rows.length) },
      { label: 'Real', value: fmtNumber(rows.filter(row => Number(row.is_real || 0) === 1).length) },
      { label: 'Aktiv', value: fmtNumber(rows.filter(row => row.business_status === 'ACTIVE').length) },
      { label: 'Obuna xavfi', value: fmtNumber(rows.filter(row => ['expired', 'soon'].includes(row.expiry_state)).length) }
    ]
  });
}

function normalizeCompanyGroupPayload(data = {}, fallback = {}) {
  const company = Array.isArray(data.companies) ? data.companies[0] : null;
  const groups = company?.groups || [];
  const fallbackName = fallback.name || fallback.company_name || companyNameFromGroupTitle(groups[0]?.title || '');
  const resolvedName = !isGenericCompanyName(company?.name) ? company.name : (fallbackName || company?.name || 'Kompaniya');
  return {
    company: company
      ? { ...company, name: resolvedName }
      : {
        company_id: fallback.company_id || fallback.id || '',
        name: resolvedName || 'Kompaniya'
      },
    summary: data.summary || {},
    groups
  };
}

async function selectCompanyGroup(row = {}) {
  companyGroupSelectedChatKey.value = companyGroupChatKey(row);
  companyGroupTicketsOpen.value = true;
  clearMediaUrls();
  await nextTick();
  scrollCompanyGroupToEnd();
  loadConversationMedia(companyGroupConversation.value)
    .then(scrollCompanyGroupToEnd)
    .catch(error => showToast(error.message));
}

async function openCompanyGroupActivity(row = {}) {
  const companyId = String(row.company_id || row.id || '').trim();
  const companyName = String(row.name || row.company_name || '').trim();
  if (!companyId && !companyName) return showToast('Kompaniya topilmadi');

  startLoading('companyGroupActivity');
  try {
    const data = await api.companyGroupActivity({
      period: selectedStatsPeriod.value,
      ...dashboardPeriodQuery(),
      company_id: companyId,
      company_name: companyName
    });
    const detail = normalizeCompanyGroupPayload(data, row);
    if (!detail.groups.length) return showToast('Bu kompaniyaga ulangan guruhlarda xabar topilmadi');
    detail.groups = sortChatsWithOpenFirst(detail.groups);
    companyGroupDetail.value = detail;
    companyGroupSelectedChatKey.value = companyGroupChatKey(detail.groups[0]);
    companyGroupTicketsOpen.value = true;
    modal.value = 'companyGroupActivity';
    clearMediaUrls();
    await nextTick();
    scrollCompanyGroupToEnd();
    loadConversationMedia(companyGroupConversation.value).catch(error => showToast(error.message));
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('companyGroupActivity');
  }
}

function ticketFilterFromAction(action = 'requests') {
  if (action === 'open') return 'open';
  if (action === 'closed' || action === 'avg') return 'closed';
  return 'all';
}

function ticketMatchesStatus(row = {}, status = 'all') {
  if (status === 'open') return row.status === 'open';
  if (status === 'closed') return row.status === 'closed';
  return true;
}

function requestRowClass(row = {}) {
  return row.status === 'open' ? 'open-ticket-row' : '';
}

function ticketListSort(left = {}, right = {}) {
  if (ticketList.value.mode === 'avg') {
    return Number(right.response_minutes || 0) - Number(left.response_minutes || 0)
      || String(right.created_at || '').localeCompare(String(left.created_at || ''));
  }
  return String(right.created_at || '').localeCompare(String(left.created_at || ''));
}

async function openSupportSummaryCard(action = 'requests') {
  const titleMap = {
    requests: 'Ticketlar ro‘yxati',
    closed: 'Javob berilgan ticketlar',
    open: 'Javobsiz ticketlar',
    avg: 'Javob vaqti bo‘yicha ticketlar'
  };
  startLoading('ticketList');
  try {
    const rows = await api.requests({
      period: selectedStatsPeriod.value,
      ...dashboardPeriodQuery(),
      limit: 5000
    });
    ticketList.value = {
      rows: Array.isArray(rows) ? rows : [],
      active: ticketFilterFromAction(action),
      mode: action,
      title: titleMap[action] || titleMap.requests
    };
    ticketListSearch.value = '';
    ticketListSupport.value = 'all';
    if (!ticketList.value.rows.length) return showToast('Bu davr uchun ticket topilmadi');
    modal.value = 'ticketList';
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('ticketList');
  }
}

function openCompanyTimelineDetail(row = {}) {
  setMetricDetail({
    title: row.name || 'Kompaniya tafsiloti',
    rows: [row],
    columns: productMetricColumns,
    empty: 'Kompaniya ma’lumoti topilmadi',
    summary: [
      { label: 'Boshlanish', value: row.start_label || '—' },
      { label: 'Obuna muddati', value: row.subscription_label || '—' },
      { label: 'Ishlatmoqda', value: row.usage_duration_label || '—' },
      { label: 'Foydalanish', value: fmtPercent(row.usage_score || 0) }
    ]
  });
}

function openAlertRequests(row = {}) {
  if (!row.chat_id) return openRemainingRequests();
  loadRequests({ chat_id: row.chat_id, title: row.title });
}

function closeModal() {
  if (modal.value === 'chatDetail' || modal.value === 'metricDetail' || modal.value === 'employeeCompanies' || modal.value === 'companyGroupActivity') clearMediaUrls();
  if (modal.value === 'metricDetail') resetMetricChatDetail();
  if (modal.value === 'employeeCompanies') resetEmployeeProfileChat();
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

function openRequestReply(row = {}) {
  const previousModal = modal.value;
  Object.assign(requestReplyForm, {
    request_id: row.id || row.request_id || '',
    chat_id: row.chat_id || selectedTarget.value?.chat_id || '',
    customer_name: row.customer_name || row.title || '',
    initial_text: row.initial_text || row.request_text || '',
    text: ''
  });
  if (!requestReplyForm.request_id) return showToast('So‘rov ID topilmadi');
  if (previousModal === 'chatDetail' || previousModal === 'metricDetail' || previousModal === 'employeeCompanies' || previousModal === 'companyGroupActivity') clearMediaUrls();
  if (previousModal === 'metricDetail') resetMetricChatDetail();
  if (previousModal === 'employeeCompanies') resetEmployeeProfileChat();
  modal.value = 'requestReply';
}

function requestIdentity(row = {}) {
  return String(row.id || row.request_id || '').trim();
}

function isSameRequest(left = {}, rightId = '') {
  const id = requestIdentity(left);
  return Boolean(id && rightId && id === String(rightId));
}

function isInlineReplyOpen(request = {}) {
  return requestIdentity(request) && inlineReplyForm.request_id === requestIdentity(request);
}

function openInlineReply(request = {}) {
  const requestId = requestIdentity(request);
  if (!requestId) return showToast('So‘rov ID topilmadi');
  inlineReplyForm.request_id = requestId;
  inlineReplyForm.text = '';
}

function cancelInlineReply() {
  inlineReplyForm.request_id = '';
  inlineReplyForm.text = '';
}

function closedRequestVersion(request = {}, result = {}, text = '') {
  const saved = result.request || {};
  return {
    ...request,
    ...saved,
    id: request.id || saved.id || result.request_id,
    status: 'closed',
    solution_text: saved.solution_text || text,
    closed_by_name: saved.closed_by_name || adminForm.full_name || adminForm.username || 'admin',
    closed_at: saved.closed_at || new Date().toISOString(),
    solution_at: saved.solution_at || saved.closed_at || new Date().toISOString()
  };
}

function updateRequestListForClose(list = [], requestId = '', closedRequest = {}) {
  return (Array.isArray(list) ? list : []).map(request => isSameRequest(request, requestId) ? closedRequestVersion(request, { request: closedRequest }, closedRequest.solution_text) : request);
}

function applyInlineReplyLocally(requestId = '', result = {}, text = '') {
  const closedRequest = closedRequestVersion({ id: requestId }, result, text);
  const companyGroupHadRequest = (companyGroupDetail.value.groups || [])
    .some(group => (group.requests || []).some(request => isSameRequest(request, requestId)));
  const employeeProfileHadRequest = (employeeProfile.value.groups || [])
    .some(group => [
      ...(Array.isArray(group.open_requests) ? group.open_requests : []),
      ...(Array.isArray(group.closed_requests) ? group.closed_requests : [])
    ].some(request => isSameRequest(request, requestId)));
  requestRows.value = updateRequestListForClose(requestRows.value, requestId, closedRequest);
  ticketList.value = {
    ...ticketList.value,
    rows: updateRequestListForClose(ticketList.value.rows, requestId, closedRequest)
  };
  employeeOpenRequests.value = (employeeOpenRequests.value || []).filter(request => !isSameRequest(request, requestId));
  dashboard.openRequests = (dashboard.openRequests || []).filter(request => !isSameRequest(request, requestId));
  chatDetail.value = {
    ...chatDetail.value,
    requests: updateRequestListForClose(chatDetail.value.requests, requestId, closedRequest)
  };
  metricChatDetail.value = {
    ...metricChatDetail.value,
    requests: updateRequestListForClose(metricChatDetail.value.requests, requestId, closedRequest)
  };
  companyGroupDetail.value = {
    ...companyGroupDetail.value,
    company: companyGroupDetail.value.company && companyGroupHadRequest ? {
      ...companyGroupDetail.value.company,
      open_requests: Math.max(0, Number(companyGroupDetail.value.company.open_requests || 0) - 1),
      closed_requests: Number(companyGroupDetail.value.company.closed_requests || 0) + 1
    } : companyGroupDetail.value.company,
    groups: (companyGroupDetail.value.groups || []).map(group => {
      const hasRequest = (group.requests || []).some(request => isSameRequest(request, requestId));
      if (!hasRequest) return group;
      return {
        ...group,
        requests: updateRequestListForClose(group.requests, requestId, closedRequest),
        open_requests: Math.max(0, Number(group.open_requests || 0) - 1),
        closed_requests: Number(group.closed_requests || 0) + 1
      };
    })
  };
  employeeProfile.value = {
    ...employeeProfile.value,
    summary: employeeProfileHadRequest ? {
      ...employeeProfile.value.summary,
      open_requests: Math.max(0, Number(employeeProfile.value.summary?.open_requests || 0) - 1),
      closed_requests: Number(employeeProfile.value.summary?.closed_requests || 0) + 1
    } : employeeProfile.value.summary,
    groups: (employeeProfile.value.groups || []).map(group => {
      const openRequests = Array.isArray(group.open_requests) ? group.open_requests : [];
      const closedRequests = Array.isArray(group.closed_requests) ? group.closed_requests : [];
      const wasOpen = openRequests.some(request => isSameRequest(request, requestId));
      const wasClosed = closedRequests.some(request => isSameRequest(request, requestId));
      if (!wasOpen && !wasClosed) return group;
      return {
        ...group,
        open_requests: openRequests.filter(request => !isSameRequest(request, requestId)),
        closed_requests: wasClosed
          ? updateRequestListForClose(closedRequests, requestId, closedRequest)
          : [closedRequest, ...closedRequests],
        open_count: Math.max(0, Number(group.open_count || 0) - (wasOpen ? 1 : 0)),
        closed_count: Number(group.closed_count || 0) + (wasOpen ? 1 : 0)
      };
    })
  };
  employeeProfileChatDetail.value = {
    ...employeeProfileChatDetail.value,
    requests: updateRequestListForClose(employeeProfileChatDetail.value.requests, requestId, closedRequest)
  };
}

async function sendInlineRequestReply(request = {}) {
  const requestId = inlineReplyForm.request_id || requestIdentity(request);
  if (!requestId) return showToast('So‘rov ID topilmadi');
  if (!inlineReplyForm.text.trim()) return showToast('Javob matnini kiriting');
  startLoading('replyRequest');
  try {
    const text = inlineReplyForm.text;
    const result = await api.replyRequest({ request_id: requestId, text });
    applyInlineReplyLocally(requestId, result, text);
    await refreshAfterRequestReply(result.chat_id || request.chat_id).catch(() => null);
    cancelInlineReply();
    showToast('Javob yuborildi va ticket yopildi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('replyRequest');
  }
}

async function refreshAfterRequestReply(chatId) {
  await loadDashboard();
  if (activeTab.value === 'groups') groups.value = await api.groups();
  if (activeTab.value === 'privates') privates.value = await api.privates();
  if (activeTab.value === 'employees') employees.value = await api.employees();
  if (chatId) {
    requestRows.value = await api.requests({ chat_id: chatId }).catch(() => requestRows.value);
  }
}

async function sendRequestReply() {
  if (!requestReplyForm.request_id) return showToast('So‘rov tanlanmagan');
  if (!requestReplyForm.text.trim()) return showToast('Javob matnini kiriting');
  startLoading('replyRequest');
  try {
    const result = await api.replyRequest({
      request_id: requestReplyForm.request_id,
      text: requestReplyForm.text
    });
    await refreshAfterRequestReply(result.chat_id || requestReplyForm.chat_id);
    showToast('Javob yuborildi va so‘rov yopildi');
    closeModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('replyRequest');
  }
}

async function loadChatDetail(row) {
  if (!row?.chat_id) return showToast('Chat tanlanmagan');
  selectedTarget.value = row;
  clearMediaUrls();
  chatTicketsOpen.value = true;
  startLoading('chatDetail');
  try {
    chatDetail.value = await api.chatDetail({ chat_id: row.chat_id });
    modal.value = 'chatDetail';
    await scrollChatDetailToEnd();
    loadConversationMedia(chatDetail.value.conversation || [])
      .then(scrollChatDetailToEnd)
      .catch(error => showToast(error.message));
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
  const notes = info.diagnostics?.notes || [];
  const autoSync = telegramAutoSync.value;
  return [
    `Manzil: ${info.url || '—'}`,
    `Kutilayotgan yangilanishlar: ${info.pending_update_count ?? 0}`,
    `Ruxsat etilgan yangilanishlar: ${(info.allowed_updates || []).join(', ') || '—'}`,
    `Oxirgi xato: ${info.last_error_message || '—'}`,
    `Webhooksiz auto sync: ${autoSync.enabled ? `faol${autoSync.running ? ' (olinmoqda)' : ''}, oxirgi: ${autoSync.last_synced_at ? fmtDate(autoSync.last_synced_at) : '—'}, ${fmtNumber(autoSync.processed || 0)}/${fmtNumber(autoSync.fetched || 0)} update` : 'faol emas'}`,
    notes.length ? `Tekshiruv: ${notes.join(' ')}` : 'Tekshiruv: guruh xabarlari uchun webhook sozlamasi to‘g‘ri ko‘rinmoqda'
  ].join('\n');
});

function currentWebhookInfo() {
  return webhookStatus.value?.webhook || webhookStatus.value || null;
}

function shouldAutoSyncTelegramUpdates() {
  if (!token.value) return false;
  const info = currentWebhookInfo();
  if (!info) return false;
  return !String(info.url || '').trim();
}

async function runTelegramAutoSync() {
  if (!shouldAutoSyncTelegramUpdates() || telegramAutoSyncBusy) return;
  telegramAutoSyncBusy = true;
  telegramAutoSync.value = { ...telegramAutoSync.value, enabled: true, running: true, error: '' };
  try {
    const result = await api.syncTelegramUpdates({ limit: 100, mode: 'auto', ignore_saved_offset: true });
    telegramAutoSync.value = {
      enabled: true,
      running: false,
      last_synced_at: new Date().toISOString(),
      fetched: Number(result.fetched || 0),
      processed: Number(result.processed || 0),
      errors: Array.isArray(result.errors) ? result.errors.length : 0,
      error: ''
    };
    if (Number(result.fetched || 0) || Number(result.processed || 0)) {
      await refresh().catch(() => null);
    }
  } catch (error) {
    telegramAutoSync.value = { ...telegramAutoSync.value, enabled: true, running: false, error: error.message };
  } finally {
    telegramAutoSyncBusy = false;
  }
}

function stopTelegramAutoSync() {
  if (telegramAutoSyncTimer) clearInterval(telegramAutoSyncTimer);
  telegramAutoSyncTimer = null;
  telegramAutoSyncBusy = false;
  telegramAutoSync.value = { ...telegramAutoSync.value, enabled: false, running: false };
}

function updateTelegramAutoSync() {
  if (!shouldAutoSyncTelegramUpdates()) {
    stopTelegramAutoSync();
    return;
  }
  telegramAutoSync.value = { ...telegramAutoSync.value, enabled: true };
  if (!telegramAutoSyncTimer) {
    runTelegramAutoSync();
    telegramAutoSyncTimer = setInterval(runTelegramAutoSync, TELEGRAM_AUTO_SYNC_INTERVAL_MS);
  }
}

watch(webhookStatus, updateTelegramAutoSync, { deep: true });
watch(token, updateTelegramAutoSync);

async function checkTelegramWebhook(show = true) {
  if (show) startLoading('webhookInfo');
  try {
    webhookStatus.value = await api.telegramWebhookInfo();
    if (show) showToast('Telegram ulanishi holati yangilandi');
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
    showToast('Telegram ulanishi yangilandi. Endi Telegramda /register yuboring.');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('webhookConnect');
  }
}

async function syncTelegramUpdates() {
  startLoading('webhookSync');
  try {
    const result = await api.syncTelegramUpdates({ limit: 100, mode: 'manual', ignore_saved_offset: true });
    await checkTelegramWebhook(false);
    await refresh();
    const prefix = result.webhook_deleted ? 'Webhook o‘chirildi, ' : '';
    showToast(`${prefix}Telegramdan olindi: ${fmtNumber(result.processed || 0)}/${fmtNumber(result.fetched || 0)} update`);
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('webhookSync');
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
        { key: 'group_message_audit', value: { enabled: settingsForm.group_message_audit === 'true' } },
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
    const rows = await api.saveSettings({
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
    const saved = rows.find(row => row.key === 'ai_integration')?.value;
    if (saved) {
      Object.assign(integrationForm, {
        enabled: saved.enabled !== false,
        provider: saved.provider || 'openai_compatible',
        label: saved.label || saved.model || 'Uyqur AI',
        base_url: saved.base_url || 'https://api.openai.com/v1',
        model: saved.model || '',
        has_api_key: !!saved.has_api_key,
        system_prompt: saved.system_prompt || '',
        knowledge_text: saved.knowledge_text || '',
        last_check_status: saved.last_check_status || '',
        last_checked_at: saved.last_checked_at || '',
        last_check_error: saved.last_check_error || ''
      });
    } else {
      integrationForm.has_api_key = Boolean(integrationForm.api_key || integrationForm.has_api_key);
    }
    integrationForm.api_key = '';
    savedIntegrationSignature.value = aiConnectionSignature(integrationForm);
    showToast(integrationForm.last_check_status === 'ok' ? 'AI tekshirildi va saqlandi' : 'AI integratsiya saqlandi');
  } catch (error) {
    integrationForm.last_check_status = 'failed';
    integrationForm.last_check_error = error.message;
    showToast(error.message);
  } finally {
    stopLoading('saveIntegration');
  }
}

async function saveLogSettings() {
  if (logForm.enabled && !logForm.levels.length) return showToast('Kamida bitta log turini tanlang');
  startLoading('saveLogSettings');
  try {
    const rows = await api.saveSettings({
      settings: [{
        key: 'log_notifications',
        value: {
          enabled: logForm.enabled,
          levels: [...logForm.levels],
          target: logForm.target || 'main_group',
          sources: normalizeLogSources(logForm.sources)
        }
      }]
    });
    const savedLogs = rows.find(row => row.key === 'log_notifications')?.value;
    if (savedLogs) Object.assign(logForm, {
      enabled: !!savedLogs.enabled,
      levels: Array.isArray(savedLogs.levels) && savedLogs.levels.length ? savedLogs.levels : ['error'],
      target: savedLogs.target || 'main_group',
      sources: normalizeLogSources(savedLogs.sources || [])
    });
    showToast('Log sozlamasi saqlandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('saveLogSettings');
  }
}

async function sendTestLog() {
  if (!logForm.enabled) return showToast('Avval log yuborishni yoqing va saqlang');
  if (!logForm.levels.includes(logForm.test_level)) return showToast('Test turi tanlangan loglar ro‘yxatida yo‘q');
  startLoading('testLog');
  try {
    const result = await api.testLogNotification({
      level: logForm.test_level,
      message: 'Admin paneldan yuborilgan test log'
    });
    showToast(result.sent ? `Test log yuborildi: ${result.chat_id}` : `Test log yuborilmadi: ${result.reason}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('testLog');
  }
}

onMounted(async () => {
  applyThemeMode(themeMode.value);
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeydown);
  }
  durationTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);
  if (token.value) {
    await loadSettings().catch(error => showToast(error.message));
    await refresh();
    await checkTelegramWebhook(false);
  }
});

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    document.removeEventListener('keydown', handleDocumentKeydown);
  }
  if (durationTimer) clearInterval(durationTimer);
  stopTelegramAutoSync();
  setModalScrollLock(false);
  Object.values(employeeAvatarUrls.value).filter(Boolean).forEach(url => URL.revokeObjectURL(url));
  Object.values(chatAvatarUrls.value).filter(Boolean).forEach(url => URL.revokeObjectURL(url));
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
  props: {
    columns: Array,
    rows: Array,
    empty: String,
    onCellAction: Function,
    rowClass: Function,
    pageSize: { type: Number, default: 20 }
  },
  setup(props, { slots }) {
    const page = ref(1);
    const safeRows = computed(() => Array.isArray(props.rows) ? props.rows : []);
    const safePageSize = computed(() => Math.max(1, Number(props.pageSize || 20)));
    const totalRows = computed(() => safeRows.value.length);
    const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / safePageSize.value)));
    const currentPage = computed(() => Math.min(page.value, totalPages.value));
    const pagedRows = computed(() => {
      const start = (currentPage.value - 1) * safePageSize.value;
      return safeRows.value.slice(start, start + safePageSize.value);
    });
    const goToPage = nextPage => {
      page.value = Math.max(1, Math.min(totalPages.value, nextPage));
    };
    watch([totalRows, safePageSize], () => {
      page.value = 1;
    });
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
      if (column.truncate) {
        const tooltip = String(text ?? '—');
        return h('span', {
          class: 'truncate-tooltip',
          title: tooltip,
          'data-tooltip': tooltip,
          tabindex: 0
        }, [
          h('span', { class: 'truncate' }, text)
        ]);
      }
      return h('span', text);
    };
    const renderHeader = column => {
      if (!column.tooltip) return column.label;
      return h('span', {
        class: 'table-head-tooltip',
        tabindex: 0,
        'data-tooltip': column.tooltip
      }, column.label);
    };
    const renderPagination = () => {
      if (totalRows.value <= safePageSize.value) return null;
      const start = ((currentPage.value - 1) * safePageSize.value) + 1;
      const end = Math.min(totalRows.value, currentPage.value * safePageSize.value);
      return h('div', { class: 'table-pagination' }, [
        h('span', { class: 'pagination-info' }, `${fmtNumber(start)}-${fmtNumber(end)} / ${fmtNumber(totalRows.value)}`),
        h('div', { class: 'pagination-actions' }, [
          h('button', {
            class: 'btn small page-btn',
            type: 'button',
            disabled: currentPage.value <= 1,
            onClick: () => goToPage(currentPage.value - 1)
          }, 'Oldingi'),
          h('span', { class: 'page-number' }, `${fmtNumber(currentPage.value)} / ${fmtNumber(totalPages.value)}`),
          h('button', {
            class: 'btn small page-btn',
            type: 'button',
            disabled: currentPage.value >= totalPages.value,
            onClick: () => goToPage(currentPage.value + 1)
          }, 'Keyingi')
        ])
      ]);
    };

    return () => h('div', { class: 'data-table' }, [
      h('div', { class: 'table-wrap' }, [
        safeRows.value.length
          ? h('table', [
            h('thead', h('tr', props.columns.map(col => h('th', { class: col.key === 'select' ? 'select-cell' : '' }, renderHeader(col))))),
            h('tbody', pagedRows.value.map(row => h('tr', {
              class: typeof props.rowClass === 'function' ? props.rowClass(row) : ''
            }, props.columns.map(col => {
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
      ]),
      renderPagination()
    ]);
  }
});
</script>
