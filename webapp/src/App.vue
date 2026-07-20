<template>
  <main v-if="!token" class="login-screen">
    <section class="card login-card">
      <img class="logo login-logo" :src="uyqurLogoUrl" alt="Uyqur" width="48" height="48" />
      <h1>Uyqur Yordam</h1>
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
        <img class="logo" :src="uyqurLogoUrl" alt="Uyqur" width="42" height="42" />
        <div class="brand-wrapper">
          <div class="brand-title">Uyqur Yordam</div>
          <strong class="dashboard-creator">
            Made by: <a href="https://t.me/uyqur_nurali" target="_blank">Nurali Vafoyev</a>
          </strong>
        </div>
      </div>

      <nav class="nav">
        <button v-for="item in mainTabs" :key="item.key" :class="{ active: activeTab === item.key }"
          @click="setTab(item.key)">
          <b>{{ item.label }}</b>
        </button>
        <div class="nav-group" :class="{ open: otherMenuOpen }">
          <button class="nav-disclosure" :class="{ active: isOtherTabActive }" type="button"
            :aria-expanded="otherMenuOpen ? 'true' : 'false'" @click="otherMenuOpen = !otherMenuOpen">
            <b>Boshqa menyular</b>
            <em>{{ otherMenuOpen ? '−' : '+' }}</em>
          </button>
          <Transition name="fade">
            <div v-if="otherMenuOpen" class="nav-submenu">
              <button v-for="item in otherTabs" :key="item.key" :class="{ active: activeTab === item.key }"
                @click="setTab(item.key)">
                <b>{{ item.label }}</b>
              </button>
            </div>
          </Transition>
        </div>
      </nav>

      <nav class="nav nav-bottom">
        <button :class="{ active: activeTab === settingsTab.key }" @click="setTab(settingsTab.key)">
          <b>{{ settingsTab.label }}</b>
        </button>
      </nav>
    </aside>

    <section class="main">
      <header class="topbar">
        <div class="page-title">
          <h1>{{ currentTitle }}</h1>
        </div>
        <div class="topbar-actions">
          <button class="btn topbar-refresh" type="button" :disabled="loadingAction === 'refresh'" @click="refresh">
            {{ loadingAction === 'refresh' ? 'Yangilanmoqda...' : 'Yangilash' }}
          </button>
          <div class="top-actions-menu" ref="actionMenuRef">
            <button class="profile-action" type="button" :aria-expanded="actionMenuOpen"
              @click="actionMenuOpen = !actionMenuOpen">
              <span class="profile-avatar">{{ userInitials }}</span>
              <span>Amallar</span>
              <b>⌄</b>
            </button>
            <Transition name="fade">
              <div v-if="actionMenuOpen" class="actions-dropdown">
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
                    <div class="support-summary-value" :class="{ danger: card.tone === 'danger' }">{{ card.value }}
                    </div>
                    <Transition name="fade">
                      <div v-if="comparisonEnabled && card.comparison" class="trend-label" :class="card.comparison.tone"
                        :title="card.comparison.title || card.comparison.text">
                        {{ card.comparison.text }}
                      </div>
                    </Transition>
                  </div>
                  <div class="support-summary-note">{{ card.note }}</div>
                </div>
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
                empty="Hozircha natija ma’lumoti yo‘q" :on-cell-action="handleTableCellAction"
                :row-class="supportPerformanceRowClass" :page-size="5">
                <template #rank="{ row }">
                  <b class="rank-number">{{ row.rank }}</b>
                </template>
                <template #employeeIdentity="{ row }">
                  <span class="employee-cell">
                    <img v-if="employeeAvatarUrl(row)" class="employee-avatar"
                      :class="{ premium: isEmployeePremium(row) }" :data-tooltip="employeePremiumTooltip(row) || null"
                      :src="employeeAvatarUrl(row)" alt="" />
                    <span v-else class="employee-avatar fallback" :class="{ premium: isEmployeePremium(row) }"
                      :data-tooltip="employeePremiumTooltip(row) || null">{{ employeeInitials(row) }}</span>
                    <b>{{ row.full_name || 'Xodim' }}</b>
                  </span>
                </template>
                <template #closedRequests="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong">{{ fmtNumber(row.closed_requests || 0) }} ta</b>
                    <span v-if="comparisonEnabled && row.closed_comparison" class="trend-label"
                      :class="row.closed_comparison.tone">
                      {{ row.closed_comparison.percentText }} ({{ row.closed_comparison.diff }})
                    </span>
                  </div>
                </template>
                <template #openRequests="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong" :class="{ 'text-muted': !row.open_requests }">
                      {{ fmtNumber(row.open_requests || 0) }} ta
                    </b>
                    <span v-if="comparisonEnabled && row.open_comparison" class="trend-label"
                      :class="row.open_comparison.tone">
                      {{ row.open_comparison.percentText }} ({{ row.open_comparison.diff }})
                    </span>
                  </div>
                </template>
                <template #closeRate="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong">{{ pct(row) }}</b>
                    <span v-if="comparisonEnabled && row.sla_comparison" class="trend-label"
                      :class="row.sla_comparison.tone">
                      {{ row.sla_comparison.percentText }}
                    </span>
                  </div>
                </template>
                <template #avgTime="{ row }">
                  <div class="trend-cell">
                    <b class="table-strong">{{ fmtMinutes(row.avg_close_minutes) }}</b>
                    <span v-if="comparisonEnabled && row.avg_comparison" class="trend-label"
                      :class="row.avg_comparison.tone">
                      {{ row.avg_comparison.percentText }} ({{ row.avg_comparison.diff }})
                    </span>
                  </div>
                </template>
                <template #sla="{ row }">
                  <div class="trend-cell">
                    <div class="sla-badge sla-tooltip" :class="slaClass(row.sla)"
                      :data-tooltip="employeeSlaTooltip(row)" tabindex="0">
                      {{ fmtPercent(row.sla) }}
                    </div>
                    <span v-if="comparisonEnabled && row.sla_comparison" class="trend-label"
                      :class="row.sla_comparison.tone">
                      {{ row.sla_comparison.percentText }}
                    </span>
                  </div>
                </template>
              </DataTable>
            </section>

            <div class="spacer"></div>

            <div class="stats-charts support-analytics-grid">
              <section class="card chart-card ticket-trend-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">Ticket va javoblar trendi</div>
                  </div>
                </div>
                <div v-if="ticketTrendRows.length" class="ticket-trend-chart">
                  <article v-for="row in ticketTrendRows" :key="row.date_key" class="ticket-trend-day">
                    <div class="ticket-trend-bars" :aria-label="ticketTrendTooltip(row)">
                      <div class="ticket-bar-stack" :data-tooltip="ticketTrendBarTooltip(row)" tabindex="0"
                        :style="{ height: chartBarHeight(row.total_requests, ticketTrendMax) }">
                        <span class="ticket-bar-segment closed"
                          :style="{ height: ticketTrendSegmentHeight(row.closed_requests, row.total_requests) }"></span>
                        <span class="ticket-bar-segment open"
                          :style="{ height: ticketTrendSegmentHeight(row.open_requests, row.total_requests) }"></span>
                      </div>
                    </div>
                    <b>{{ row.weekday_label }}</b>
                    <span>{{ row.date_label }}</span>
                    <em class="sla-chip" :class="slaClass(row.sla)">SLA {{ fmtPercent(row.sla) }}</em>
                  </article>
                </div>
                <div v-else class="empty compact">Bu davr uchun trend ma’lumoti yo‘q</div>
              </section>

              <section class="card chart-card company-ticket-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">Kompaniyalar bo‘yicha ticketlar</div>
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
                      <span class="company-ticket-fill closed" :style="companyTicketClosedStyle(row)"></span>
                      <span class="company-ticket-fill open" :style="companyTicketOpenStyle(row)"></span>
                    </div>
                    <strong style="display: flex; gap: 10px; font-size: 14px;">
                      <span class="total-text" style="color: var(--text);" title="Jami ticketlar">{{
                        fmtNumber(row.total_requests)
                      }}</span>
                      <span class="closed-text" style="color: #00d26a;" title="Javob berilgan">{{
                        fmtNumber(row.closed_requests)
                      }}</span>
                      <span class="open-text" style="color: #f73164;" title="Ochiq">{{ fmtNumber(row.open_requests)
                      }}</span>
                    </strong>
                  </article>
                </div>
                <div v-else class="empty compact">Bu davr uchun kompaniya statistikasi yo‘q</div>
                <div class="company-ticket-legend">
                  <span><i class="legend-square closed"></i>Yopilgan ticket</span>
                  <span><i class="legend-square open"></i>Ochiq ticket</span>
                  <span>Bar = javob berilgan va qolgan ticketlar nisbati</span>
                </div>
              </section>
            </div>

          </template>

          <template v-if="activeTab === 'productAnalytics'">
            <Toolbar v-model="search" />

            <div class="spacer"></div>

            <div class="metric-strip">
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Kuzatuvdagi kompaniyalarni ko‘rish" @click="openProductMetricDetail('total')"
                @keydown.enter.prevent="openProductMetricDetail('total')"
                @keydown.space.prevent="openProductMetricDetail('total')">
                <div class="metric-head">
                  <div class="metric-label">Kuzatuvdagi kompaniya</div>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.total) }}</div>
                <div class="metric-mini">Texnik yordam biriktirilgan kompaniyalar</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Aktiv kompaniyalarni ko‘rish" @click="openProductMetricDetail('active')"
                @keydown.enter.prevent="openProductMetricDetail('active')"
                @keydown.space.prevent="openProductMetricDetail('active')">
                <div class="metric-head">
                  <div class="metric-label">Biznes aktiv</div>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.active) }}</div>
                <div class="metric-mini">Biznes holati ACTIVE</div>
              </article>
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Riskdagi kompaniyalarni ko‘rish" @click="openProductMetricDetail('risk')"
                @keydown.enter.prevent="openProductMetricDetail('risk')"
                @keydown.space.prevent="openProductMetricDetail('risk')">
                <div class="metric-head">
                  <div class="metric-label">Risk va churn</div>
                </div>
                <div class="metric-value">{{ fmtNumber(productUsageSummary.risk) }}</div>
                <div class="metric-mini">{{ fmtNumber(productUsageSummary.expiring_soon) }} ta obuna yaqin</div>
              </article>
            </div>

            <div class="spacer"></div>

            <div class="stats-table-stack">
              <section class="card subscription-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Kompaniyalar obuna timeline diagrammasi</div>
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
                          <span class="timeline-label-start">Boshlanish: {{ row.start_label }}</span>
                          <span class="timeline-label-subscription">{{ row.subscription_label }}</span>
                          <span class="timeline-label-usage">{{ row.usage_duration_label }}</span>
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
            <Toolbar v-model="search" />

            <div class="metric-strip company-metrics">
              <article class="card metric clickable-metric" role="button" tabindex="0"
                title="Kompaniyalar ro‘yxatini ko‘rish" @click="openCompanyMetricDetail('total')"
                @keydown.enter.prevent="openCompanyMetricDetail('total')"
                @keydown.space.prevent="openCompanyMetricDetail('total')">
                <div class="metric-head">
                  <div class="metric-label">Kompaniyalar</div>
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
                </div>
                <div class="metric-value">{{ fmtNumber(companyActivitySummary.expiring_soon) }}</div>
                <div class="metric-mini">{{ fmtNumber(companyActivitySummary.expired) }} ta obuna tugagan</div>
              </article>
            </div>

            <div class="spacer"></div>

            <div class="company-activity-stack">
              <section class="card company-module-table-card">
                <div class="card-header company-module-table-head">
                  <div>
                    <div class="card-title">Bo‘limlar foydalanish statistikasi</div>
                  </div>
                  <div class="company-module-table-controls">
                    <div class="company-module-filter company-module-filter-wide company-module-filter-menu-wrap"
                      ref="companyModuleFilterMenuRef">
                      <span>Filter</span>
                      <div class="company-module-filter-picker">
                        <button type="button" class="company-module-filter-trigger select mini-select"
                          @click.stop="toggleCompanyModuleFilterMenu">
                          <span class="company-module-filter-trigger-label">{{ companyModuleFilterButtonLabel }}</span>
                          <span class="company-module-filter-trigger-caret">▾</span>
                        </button>
                        <Transition name="fade">
                          <div v-if="companyModuleFilterMenuOpen" class="company-module-filter-menu actions-dropdown"
                            @click.stop>
                            <template v-if="!companyModuleFilterMenuGroup">
                              <button v-for="group in companyModuleControlGroups"
                                :key="`module-filter-menu-${group.key}`" type="button"
                                class="company-module-filter-menu-group"
                                @click="group.key === 'show' ? selectCompanyModuleControlOption(group, group.options[0]) : openCompanyModuleFilterGroup(group.key)">
                                <span>{{ group.label }}</span>
                                <span v-if="group.key !== 'show'" class="company-module-filter-menu-arrow">›</span>
                              </button>
                            </template>
                            <template v-else-if="companyModuleFilterActiveGroup">
                              <button type="button" class="company-module-filter-back"
                                @click="companyModuleFilterMenuGroup = ''">
                                <span class="company-module-filter-menu-arrow">‹</span>
                                <span>{{ companyModuleFilterActiveGroup.label }}</span>
                              </button>
                              <button v-for="option in companyModuleFilterActiveGroup.options"
                                :key="`module-filter-option-${companyModuleFilterActiveGroup.key}-${option.key}`"
                                type="button" class="company-module-filter-option"
                                :class="{ active: isCompanyModuleControlOptionActive(companyModuleFilterActiveGroup, option) }"
                                @click="selectCompanyModuleControlOption(companyModuleFilterActiveGroup, option)">
                                <span>{{ option.label }}</span>
                                <span v-if="isCompanyModuleControlOptionActive(companyModuleFilterActiveGroup, option)"
                                  class="company-module-filter-check">✓</span>
                              </button>
                            </template>
                          </div>
                        </Transition>
                      </div>
                    </div>
                    <label class="company-module-filter">
                      <span>Davr</span>
                      <select :value="companyModulePeriod" class="select mini-select"
                        @change="handleCompanyModulePeriodChange($event.target.value)"
                        @mousedown="handleCompanyModulePeriodSelectPointerDown"
                        @mouseup="handleCompanyModulePeriodSelectPointerUp">
                        <option v-for="period in companyModulePeriodOptions" :key="`module-period-${period.key}`"
                          :value="period.key">
                          {{ companyModulePeriodOptionLabel(period) }}
                        </option>
                      </select>
                    </label>
                    <div class="card-header-actions company-module-menu" ref="moduleCompareMenuRef">
                      <button type="button" class="btn-icon mini-icon" title="Sozlamalar"
                        @click="moduleCompareMenuOpen = !moduleCompareMenuOpen">
                        <span>⋯</span>
                      </button>
                      <Transition name="fade">
                        <div v-if="moduleCompareMenuOpen" class="actions-dropdown mini-dropdown right-align">
                          <label class="theme-menu-row">
                            <span>Taqqoslash</span>
                            <label class="switch mini-switch">
                              <input type="checkbox" v-model="companyModuleCompareEnabled">
                              <span class="slider"></span>
                            </label>
                          </label>
                        </div>
                      </Transition>
                    </div>
                  </div>
                </div>
                <div v-if="companyModuleTableSummary.total" class="company-module-summary">
                  <div class="company-module-summary-main">
                    <strong>Umumiy</strong>
                    <span>{{ companyModuleTableSummary.total }} ta kompaniya</span>
                  </div>
                  <div class="company-module-summary-grid">
                    <div class="company-module-summary-cell">
                      <span class="company-module-summary-label">O'rtacha faollik</span>
                      <div class="company-module-summary-metrics">
                        <b class="company-module-summary-value">{{ companyModuleTableSummary.avgPercent }}%</b>
                        <span v-if="companyModuleCompareEnabled && companyModuleTableSummary.usedComparison"
                          class="trend-label module-trend-label company-module-summary-delta"
                          :class="companyModuleTableSummary.usedComparison.tone">
                          {{ companyModuleTableSummary.usedComparison.percentText }}
                        </span>
                      </div>
                    </div>
                    <div v-for="column in companyModuleColumns" :key="`module-summary-${column.key}`"
                      class="company-module-summary-cell">
                      <span class="company-module-summary-label">{{ column.label }}</span>
                      <div class="company-module-summary-metrics">
                        <b class="company-module-summary-value">{{ companyModuleTableSummary.modulePercents[column.key]
                        }}%</b>
                        <span
                          v-if="companyModuleCompareEnabled && companyModuleTableSummary.moduleComparisons[column.key]"
                          class="trend-label module-trend-label company-module-summary-delta"
                          :class="companyModuleTableSummary.moduleComparisons[column.key].tone">
                          {{ companyModuleTableSummary.moduleComparisons[column.key].percentText }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div v-if="companyModuleTableSummary.supportStaff.length" class="company-module-summary-support">
                    <span class="company-module-summary-support-label">Mas’ul xodimlar</span>
                    <b class="company-module-summary-support-value">{{ companyModuleTableSummary.supportStaff.join(', ')
                    }}</b>
                  </div>
                </div>
                <div class="company-module-table-wrap">
                  <table v-if="companyModuleBaseRows.length" class="company-module-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Kompaniya</th>
                        <th class="module-business-col">Biznes holati</th>
                        <th class="module-support-col">Mas’ul xodim</th>
                        <th class="module-count-col">O'rtacha faollik</th>
                        <th v-for="column in companyModuleColumns" :key="`module-head-${column.key}`">{{ column.label }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, index) in companyModuleTableRows" :key="row.id || row.name || index"
                        class="company-module-row-clickable" role="button" tabindex="0"
                        :title="`${row.name || 'Kompaniya'} xodimlar faolligini ko‘rish`"
                        @click="openCompanyModuleEmployeeDetail(row)"
                        @keydown.enter.prevent="openCompanyModuleEmployeeDetail(row)"
                        @keydown.space.prevent="openCompanyModuleEmployeeDetail(row)">
                        <td class="module-index-col">{{ index + 1 }}</td>
                        <td class="module-company-col">
                          <span class="company-identity company-module-identity">
                            <img v-if="row.icon" :src="row.icon" alt="" />
                            <span>
                              <b>{{ row.name || 'Kompaniya' }}</b>
                              <small>{{ row.brand || 'Brend kiritilmagan' }}</small>
                            </span>
                          </span>
                        </td>
                        <td class="module-business-col">
                          <span class="status-pill mini" :class="businessStatusClass(row.business_status)">{{
                            businessStatusLabel(row.business_status) }}</span>
                        </td>
                        <td class="module-support-col">
                          <span class="support-owner">{{ companySupportLabel(row) }}</span>
                        </td>
                        <td class="module-count-col">
                          <div class="module-count-stack">
                            <span class="module-count-badge"
                              :title="`${row.module_active_count} / ${companyModuleKeys.length}`">
                              {{ row.module_active_percent }}%
                            </span>
                            <span v-if="companyModuleCompareEnabled && row.module_percent_comparison"
                              class="trend-label module-trend-label" :class="row.module_percent_comparison.tone"
                              :title="companyModuleCompareAgainstLabel">
                              {{ row.module_percent_comparison.percentText }}
                            </span>
                          </div>
                        </td>
                        <td v-for="column in companyModuleColumns" :key="`${row.id || row.name}-${column.key}`"
                          class="module-status-cell">
                          <span v-if="moduleUsageDeltaMark(row, column.key)" class="module-status-delta"
                            :class="moduleUsageDeltaMark(row, column.key) === '+' ? 'plus' : 'minus'"
                            :title="companyModuleCompareAgainstLabel">
                            {{ moduleUsageDeltaMark(row, column.key) }}
                          </span>
                          <span class="module-status-icon" :class="row.module_usage[column.key] ? 'yes' : 'no'"
                            :title="moduleStatusTitle(row, column.key)"
                            :aria-label="row.module_usage[column.key] ? 'Ishlatilgan' : 'Ishlatilmagan'">
                            <template v-if="row.module_usage[column.key]">✓</template>
                            <template v-else>✗</template>
                          </span>
                        </td>
                      </tr>
                      <tr v-if="!companyModuleTableRows.length">
                        <td :colspan="5 + companyModuleColumns.length" class="company-module-filter-empty">
                          Filter bo‘yicha kompaniya topilmadi
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="empty compact">Kompaniya ma’lumoti topilmadi</div>
                </div>
              </section>

              <section v-if="companyModuleChartRows.length"
                class="card chart-card line-chart-card company-module-chart-card">
                <div class="card-header chart-card-head company-module-chart-head">
                  <div>
                    <div class="card-title">Bo‘limlar dinamikasi</div>
                  </div>
                  <div class="company-module-chart-controls">
                    <div class="company-module-filter company-module-filter-wide company-module-filter-menu-wrap"
                      ref="companyModuleChartCompanyMenuRef">
                      <span>Kompaniyalar</span>
                      <div class="company-module-filter-picker">
                        <button type="button" class="company-module-filter-trigger select mini-select"
                          @click.stop="toggleCompanyModuleChartCompanyMenu">
                          <span class="company-module-filter-trigger-label">{{ companyModuleChartCompanyLabel }}</span>
                          <span class="company-module-filter-trigger-caret">▾</span>
                        </button>
                        <Transition name="fade">
                          <div v-if="companyModuleChartCompanyMenuOpen"
                            class="company-module-filter-menu actions-dropdown" @click.stop>
                            <button type="button" class="company-module-filter-option"
                              :class="{ active: !companyModuleChartCompanyId }"
                              @click="selectCompanyModuleChartCompany('')">
                              <span>Hammasi</span>
                              <span v-if="!companyModuleChartCompanyId" class="company-module-filter-check">✓</span>
                            </button>
                            <button v-for="company in companyModuleChartCompanyOptions"
                              :key="`module-chart-company-${company.id}`" type="button"
                              class="company-module-filter-option"
                              :class="{ active: companyModuleChartCompanyId === company.id }"
                              @click="selectCompanyModuleChartCompany(company.id)">
                              <span>{{ company.name }}</span>
                              <span v-if="companyModuleChartCompanyId === company.id"
                                class="company-module-filter-check">✓</span>
                            </button>
                          </div>
                        </Transition>
                      </div>
                    </div>
                    <div class="company-module-chart-metric-tabs">
                      <button v-for="option in companyModuleChartMetricOptions"
                        :key="`module-chart-metric-${option.key}`" type="button" class="company-module-chart-metric-btn"
                        :class="{ active: companyModuleChartMetricKeys.includes(option.key) }"
                        @click="toggleCompanyModuleChartMetric(option.key)">
                        {{ option.label }}
                      </button>
                    </div>
                    <label class="company-module-filter">
                      <span>Davr</span>
                      <select :value="companyModuleChartPeriod" class="select mini-select"
                        @change="handleCompanyModuleChartPeriodChange($event.target.value)"
                        @mousedown="handleCompanyModuleChartPeriodSelectPointerDown"
                        @mouseup="handleCompanyModuleChartPeriodSelectPointerUp">
                        <option v-for="period in companyModulePeriodOptions" :key="`module-chart-period-${period.key}`"
                          :value="period.key">
                          {{ companyModuleChartPeriodOptionLabel(period) }}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
                <div class="company-module-chart-shell" ref="companyModuleChartRef"
                  @mouseleave="companyModuleChartHoverIndex = -1">
                  <div class="company-module-chart-legend top">
                    <button v-for="line in companyModuleChartLines" :key="`module-chart-legend-${line.key}`"
                      type="button" class="company-module-chart-legend-item"
                      :class="{ inactive: !companyModuleChartVisibleModules.includes(line.key) }"
                      @click="toggleCompanyModuleChartModule(line.key)">
                      <i :style="{ borderColor: line.color }"></i>{{ line.label }}
                    </button>
                    <button type="button" class="company-module-chart-legend-item average"
                      :class="{ inactive: !companyModuleChartShowAverage }"
                      @click="companyModuleChartShowAverage = !companyModuleChartShowAverage">
                      <i></i>O‘rtacha
                    </button>
                  </div>
                  <div class="trend-chart company-module-trend-chart">
                    <svg :viewBox="`0 0 ${COMPANY_MODULE_CHART_VIEW.width} ${COMPANY_MODULE_CHART_VIEW.height}`"
                      role="img" :aria-label="companyModuleChartAriaLabel" @mousemove="onCompanyModuleChartMove"
                      @touchstart.passive="onCompanyModuleChartTouch" @touchmove.passive="onCompanyModuleChartTouch">
                      <text class="company-module-chart-axis-title" x="14" :y="companyModuleChartAxisTitleY"
                        :transform="`rotate(-90 14 ${companyModuleChartAxisTitleY})`">{{ companyModuleChartAxisLabel
                        }}</text>
                      <g class="trend-grid">
                        <line v-for="tick in companyModuleChartYTicks" :key="`module-chart-y-${tick.value}`"
                          :x1="COMPANY_MODULE_CHART_DIMS.left" :x2="COMPANY_MODULE_CHART_DIMS.right" :y1="tick.y"
                          :y2="tick.y" />
                      </g>
                      <g class="trend-axis company-module-chart-axis">
                        <text v-for="tick in companyModuleChartYTicks" :key="`module-chart-y-label-${tick.value}`"
                          x="52" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
                      </g>
                      <line v-if="companyModuleChartTooltip" class="company-module-chart-guide"
                        :x1="companyModuleChartTooltip.x" :x2="companyModuleChartTooltip.x"
                        :y1="COMPANY_MODULE_CHART_DIMS.top" :y2="COMPANY_MODULE_CHART_DIMS.bottom" />
                      <g v-for="line in companyModuleChartVisibleLines" :key="`module-chart-line-${line.key}`"
                        class="company-module-chart-module-line">
                        <path v-if="line.points.length > 1 && line.path" :d="line.path" fill="none" :stroke="line.color"
                          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 6" />
                        <circle v-for="(point, pointIndex) in line.points"
                          :key="`module-chart-dot-${line.key}-${pointIndex}`" class="company-module-chart-dot"
                          :class="{ active: companyModuleChartHoverIndex === pointIndex }" :cx="point.x" :cy="point.y"
                          :r="companyModuleChartHoverIndex === pointIndex ? 3.5 : 2.5" :fill="line.color"
                          :stroke="line.color" :stroke-width="companyModuleChartHoverIndex === pointIndex ? 2 : 1" />
                      </g>
                      <g v-if="companyModuleChartShowAverage && companyModuleChartAverageLine.points.length > 1"
                        class="company-module-chart-average-line">
                        <path :d="companyModuleChartAverageLine.path" fill="none" stroke="#111827" stroke-width="2.5"
                          stroke-linecap="round" stroke-linejoin="round" />
                        <circle v-for="(point, pointIndex) in companyModuleChartAverageLine.points"
                          :key="`module-chart-avg-dot-${pointIndex}`" :cx="point.x" :cy="point.y" r="3.5" fill="#111827"
                          stroke="#111827" stroke-width="1.5" />
                      </g>
                      <g class="trend-axis company-module-chart-axis">
                        <text v-for="tick in companyModuleChartXTicks" :key="`module-chart-x-${tick.date_key}`"
                          :x="tick.x" :y="COMPANY_MODULE_CHART_DIMS.bottom + 16" text-anchor="middle">{{ tick.label
                          }}</text>
                      </g>
                    </svg>
                    <div v-if="companyModuleChartTooltip" class="company-module-chart-tooltip"
                      :style="companyModuleChartTooltipStyle">
                      <b>{{ companyModuleChartTooltip.label }}</b>
                      <div v-for="item in companyModuleChartTooltip.items" :key="`module-chart-tip-${item.key}`"
                        class="company-module-chart-tooltip-row">
                        <span :style="{ color: item.color }">{{ item.label }}</span>
                        <strong v-if="item.dual" class="company-module-chart-tooltip-pair">
                          <span>{{ item.activityText }}</span>
                          <span class="company-module-chart-tooltip-sep">·</span>
                          <span>{{ item.actionsText }}</span>
                        </strong>
                        <strong v-else>{{ item.valueText }}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card">
                <div class="card-header">
                  <div>
                    <div class="card-title">Kompaniya aktivligi</div>
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

              <section class="card chart-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">MRR taqsimoti</div>
                  </div>
                  <div class="company-module-table-controls">
                    <div class="company-module-filter company-module-filter-wide company-module-filter-menu-wrap"
                      ref="companyMrrFilterMenuRef">
                      <span>Filter</span>
                      <div class="company-module-filter-picker">
                        <button type="button" class="company-module-filter-trigger select mini-select"
                          @click.stop="toggleCompanyMrrFilterMenu">
                          <span class="company-module-filter-trigger-label">{{ companyModuleFilterButtonLabel }}</span>
                          <span class="company-module-filter-trigger-caret">▾</span>
                        </button>
                        <Transition name="fade">
                          <div v-if="companyMrrFilterMenuOpen" class="company-module-filter-menu actions-dropdown"
                            @click.stop>
                            <template v-if="!companyMrrFilterMenuGroup">
                              <button v-for="group in companyMrrControlGroups" :key="`mrr-filter-menu-${group.key}`"
                                type="button" class="company-module-filter-menu-group"
                                @click="group.key === 'show' ? selectCompanyModuleControlOption(group, group.options[0], closeCompanyMrrFilterMenu) : openCompanyMrrFilterGroup(group.key)">
                                <span>{{ group.label }}</span>
                                <span v-if="group.key !== 'show'" class="company-module-filter-menu-arrow">›</span>
                              </button>
                            </template>
                            <template v-else-if="companyMrrFilterActiveGroup">
                              <button type="button" class="company-module-filter-back"
                                @click="companyMrrFilterMenuGroup = ''">
                                <span class="company-module-filter-menu-arrow">‹</span>
                                <span>{{ companyMrrFilterActiveGroup.label }}</span>
                              </button>
                              <button v-for="option in companyMrrFilterActiveGroup.options"
                                :key="`mrr-filter-option-${companyMrrFilterActiveGroup.key}-${option.key}`"
                                type="button" class="company-module-filter-option"
                                :class="{ active: isCompanyModuleControlOptionActive(companyMrrFilterActiveGroup, option) }"
                                @click="selectCompanyModuleControlOption(companyMrrFilterActiveGroup, option, closeCompanyMrrFilterMenu)">
                                <span>{{ option.label }}</span>
                                <span v-if="isCompanyModuleControlOptionActive(companyMrrFilterActiveGroup, option)"
                                  class="company-module-filter-check">✓</span>
                              </button>
                            </template>
                          </div>
                        </Transition>
                      </div>
                    </div>
                    <label class="company-module-filter">
                      <span>Davr</span>
                      <select :value="companyModulePeriod" class="select mini-select"
                        @change="handleCompanyModulePeriodChange($event.target.value)"
                        @mousedown="handleCompanyModulePeriodSelectPointerDown"
                        @mouseup="handleCompanyModulePeriodSelectPointerUp">
                        <option v-for="period in companyModulePeriodOptions" :key="`mrr-bar-period-${period.key}`"
                          :value="period.key">
                          {{ companyModulePeriodOptionLabel(period) }}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
                <div v-if="companyMrrChartRows.length" class="company-mrr-bars">
                  <article v-for="row in companyMrrChartRows" :key="`mrr-bar-${row.id}`" class="company-mrr-row">
                    <b>{{ row.name }}</b>
                    <div class="company-mrr-track">
                      <span class="company-mrr-fill" :style="{ width: row.bar_percent + '%' }"></span>
                    </div>
                    <strong>
                      {{ fmtNumber(row.mrr_amount) }}
                      <span class="company-mrr-score" :style="{ background: activityScoreColor(row.activity_score) }"
                        :title="`Faollik balli: ${row.activity_score}/5`">{{ row.activity_score }}</span>
                    </strong>
                  </article>
                </div>
                <div v-else class="empty compact">MRR ma’lumoti topilmadi</div>
              </section>

              <section class="card chart-card">
                <div class="card-header chart-card-head">
                  <div>
                    <div class="card-title">MRR vs Faollik</div>
                  </div>
                  <div class="company-module-table-controls">
                    <label class="company-module-filter">
                      <span>Kompaniya</span>
                      <select v-model="companyMrrScatterCompanyId" class="select mini-select">
                        <option value="">Hammasi</option>
                        <option v-for="company in companyMrrScatterCompanyOptions" :key="`mrr-scatter-company-${company.id}`"
                          :value="company.id">{{ company.name }}</option>
                      </select>
                    </label>
                    <label class="company-module-filter">
                      <span>Biznes holati</span>
                      <select v-model="companyMrrScatterBusinessFilter" class="select mini-select">
                        <option value="all">Hammasi</option>
                        <option v-for="status in companyMrrScatterBusinessOptions" :key="`mrr-scatter-business-${status}`"
                          :value="status">{{ businessStatusLabel(status) }}</option>
                      </select>
                    </label>
                    <label class="company-module-filter">
                      <span>Mas’ul xodim</span>
                      <select v-model="companyMrrScatterSupportFilter" class="select mini-select">
                        <option value="all">Hammasi</option>
                        <option v-for="username in companyMrrScatterSupportOptions" :key="`mrr-scatter-support-${username}`"
                          :value="username">{{ companyModuleSupportDisplayLabel(username) }}</option>
                      </select>
                    </label>
                    <label class="company-module-filter">
                      <span>Davr</span>
                      <select :value="companyMrrScatterPeriod" class="select mini-select"
                        @change="handleCompanyMrrScatterPeriodChange($event.target.value)">
                        <option v-for="period in companyMrrScatterPeriodOptions" :key="`mrr-scatter-period-${period.key}`"
                          :value="period.key">
                          {{ period.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
                <div v-if="companyMrrScatterPoints.length" class="trend-chart company-mrr-scatter"
                  ref="companyMrrScatterChartRef">
                  <svg :viewBox="`0 0 ${COMPANY_MRR_SCATTER_VIEW.width} ${COMPANY_MRR_SCATTER_VIEW.height}`" role="img"
                    aria-label="MRR va faollik balli nisbati">
                    <rect class="company-mrr-scatter-risk company-mrr-scatter-quadrant" :x="COMPANY_MRR_SCATTER_DIMS.left"
                      :y="COMPANY_MRR_SCATTER_DIMS.top" :width="companyMrrScatterThresholds.riskWidth"
                      :height="companyMrrScatterThresholds.riskHeight" @click="openCompanyMrrQuadrantDetail('risk')">
                      <title>Yuqori MRR + past faollik (Risk zonasi) — ro‘yxatni ko‘rish uchun bosing</title>
                    </rect>
                    <rect class="company-mrr-scatter-quadrant" :x="companyMrrScatterThresholds.x"
                      :y="COMPANY_MRR_SCATTER_DIMS.top"
                      :width="COMPANY_MRR_SCATTER_DIMS.right - companyMrrScatterThresholds.x"
                      :height="companyMrrScatterThresholds.riskHeight" fill="transparent"
                      @click="openCompanyMrrQuadrantDetail('topRight')">
                      <title>Yuqori MRR + yuqori faollik — ro‘yxatni ko‘rish uchun bosing</title>
                    </rect>
                    <rect class="company-mrr-scatter-quadrant" :x="COMPANY_MRR_SCATTER_DIMS.left"
                      :y="companyMrrScatterThresholds.y" :width="companyMrrScatterThresholds.riskWidth"
                      :height="COMPANY_MRR_SCATTER_DIMS.bottom - companyMrrScatterThresholds.y" fill="transparent"
                      @click="openCompanyMrrQuadrantDetail('bottomLeft')">
                      <title>Past MRR + past faollik — ro‘yxatni ko‘rish uchun bosing</title>
                    </rect>
                    <rect class="company-mrr-scatter-quadrant" :x="companyMrrScatterThresholds.x"
                      :y="companyMrrScatterThresholds.y"
                      :width="COMPANY_MRR_SCATTER_DIMS.right - companyMrrScatterThresholds.x"
                      :height="COMPANY_MRR_SCATTER_DIMS.bottom - companyMrrScatterThresholds.y" fill="transparent"
                      @click="openCompanyMrrQuadrantDetail('bottomRight')">
                      <title>Past MRR + yuqori faollik — ro‘yxatni ko‘rish uchun bosing</title>
                    </rect>
                    <text class="company-mrr-scatter-risk-label" :x="COMPANY_MRR_SCATTER_DIMS.left + 8"
                      :y="COMPANY_MRR_SCATTER_DIMS.top + 18">Yuqori MRR + past faollik (Risk zonasi)</text>
                    <g class="trend-grid">
                      <line v-for="tick in companyMrrScatterYTicks" :key="`mrr-y-grid-${tick.value}`"
                        :x1="COMPANY_MRR_SCATTER_DIMS.left" :x2="COMPANY_MRR_SCATTER_DIMS.right" :y1="tick.y"
                        :y2="tick.y" />
                    </g>
                    <line class="company-mrr-scatter-threshold" :x1="companyMrrScatterThresholds.x"
                      :x2="companyMrrScatterThresholds.x" :y1="COMPANY_MRR_SCATTER_DIMS.top"
                      :y2="COMPANY_MRR_SCATTER_DIMS.bottom" />
                    <line class="company-mrr-scatter-threshold" :x1="COMPANY_MRR_SCATTER_DIMS.left"
                      :x2="COMPANY_MRR_SCATTER_DIMS.right" :y1="companyMrrScatterThresholds.y"
                      :y2="companyMrrScatterThresholds.y" />
                    <g class="trend-axis">
                      <text v-for="tick in companyMrrScatterYTicks" :key="`mrr-y-label-${tick.value}`" x="52"
                        :y="tick.y + 4" text-anchor="end">{{ fmtNumber(tick.value) }}</text>
                      <text v-for="tick in companyMrrScatterXTicks" :key="`mrr-x-label-${tick.value}`" :x="tick.x"
                        :y="COMPANY_MRR_SCATTER_DIMS.bottom + 16" text-anchor="middle">{{ tick.value }}</text>
                    </g>
                    <g v-for="point in companyMrrScatterPoints" :key="`mrr-point-${point.id}`"
                      class="company-mrr-scatter-point" @mouseenter="hoverCompanyMrrScatterPoint(point)"
                      @mouseleave="unhoverCompanyMrrScatterPoint(point)" @click.stop="selectCompanyMrrScatterPoint(point)">
                      <circle :cx="point.x" :cy="point.y" r="5" :fill="activityScoreColor(point.activity_score)"
                        fill-opacity="0.9" />
                      <text :x="point.x" :y="point.y" text-anchor="middle" dominant-baseline="central"
                        class="company-mrr-scatter-point-label">{{ point.activity_score }}</text>
                    </g>
                  </svg>
                  <div v-if="companyMrrScatterTooltip" class="company-module-chart-tooltip"
                    :style="companyMrrScatterTooltipStyle">
                    <b>{{ companyMrrScatterTooltip.name }}</b>
                    <div class="company-module-chart-tooltip-row"><span>MRR</span><strong>{{
                        fmtNumber(companyMrrScatterTooltip.mrr_amount) }}</strong></div>
                    <div class="company-module-chart-tooltip-row"><span>Faollik</span><strong>{{
                        companyMrrScatterTooltip.activity_score }}/5</strong></div>
                    <div class="company-module-chart-tooltip-row"><span>Mas’ul xodim</span><strong>{{
                        companyMrrScatterTooltip.support_label || 'Biriktirilmagan' }}</strong></div>
                    <div class="company-module-chart-tooltip-row"><span>Faol modullar</span><strong>{{
                        companyMrrScatterTooltip.active_modules?.length ?
                          companyMrrScatterTooltip.active_modules.join(', ') : 'Yo‘q' }}</strong></div>
                  </div>
                </div>
                <div v-else class="empty compact">MRR ma’lumoti topilmadi</div>
                <div class="company-ticket-legend">
                  <span><i class="legend-square" style="background: var(--danger);"></i>Past faollik (0-2)</span>
                  <span><i class="legend-square" style="background: #f59e0b;"></i>O‘rtacha faollik (3)</span>
                  <span><i class="legend-square" style="background: var(--success);"></i>Yuqori faollik (4-5)</span>
                  <span>r = {{ fmtNumber(companyMrrCorrelation) }}</span>
                </div>
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'groups'">
            <Toolbar v-model="search">
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
            <div class="toolbar">
              <SearchField v-model="search" />
              <div class="toolbar-actions">
                <button class="btn primary" @click="openCompany()">+ Kompaniya</button>
              </div>
            </div>
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">Kompaniyalar</div>
                </div>
              </div>
              <DataTable :columns="companyColumns" :rows="filteredCompanies" empty="Kompaniya topilmadi"
                :on-cell-action="handleTableCellAction" />
            </section>
          </template>

          <template v-if="activeTab === 'privates'">
            <Toolbar v-model="search" />
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
              <SearchField v-model="search" />
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
                  <button class="btn small danger" :disabled="deletingEmployeeId === employeeKey(row)"
                    @click="deleteEmployee(row)">
                    {{ deletingEmployeeId === employeeKey(row) ? 'O‘chirilmoqda...' : 'O‘chirish' }}
                  </button>
                </template>
              </DataTable>
            </section>
          </template>

          <template v-if="activeTab === 'clickup'">
            <div class="toolbar">
              <SearchField v-model="search" />
              <TransitionGroup name="action-pop" tag="div" class="toolbar-actions">
                <button key="refresh" class="btn primary" :disabled="loadingAction === 'clickupTask'"
                  @click="loadClickUpTasks">Yangilash</button>
              </TransitionGroup>
            </div>
            <section class="card">
              <div class="card-header">
                <div>
                  <div class="card-title">ClickUp vazifalar</div>
                </div>
              </div>
              <DataTable :columns="clickupColumns" :rows="filteredClickUpTasks" empty="ClickUp vazifa topilmadi">
                <template #telegramLink="{ row }">
                  <a v-if="row.message_link" class="table-link" :href="row.message_link" target="_blank"
                    rel="noreferrer">Ochish</a>
                  <span v-else>—</span>
                </template>
                <template #clickupLink="{ row }">
                  <a v-if="row.clickup_task_url" class="table-link" :href="row.clickup_task_url" target="_blank"
                    rel="noreferrer">Task</a>
                  <span v-else>{{ row.clickup_task_id || '—' }}</span>
                </template>
                <template #actions="{ row }">
                  <button class="btn small" :disabled="loadingAction === 'clickupTask' || !row.clickup_task_id"
                    @click="syncClickUpTask(row)">Sync</button>
                  <button class="btn small danger"
                    :disabled="loadingAction === 'clickupTask' || row.status === 'closed'"
                    @click="closeClickUpTask(row)">Yopish</button>
                </template>
              </DataTable>
            </section>
          </template>

          <template v-if="activeTab === 'settings'">
            <div class="settings-layout">
              <aside class="settings-menu" aria-label="Sozlamalar menyusi">
                <button v-for="section in settingsSections" :key="section.key"
                  :class="{ active: activeSettingsSection === section.key }" type="button"
                  @click="activeSettingsSection = section.key">
                  <span>{{ section.icon }}</span>
                  <b>{{ section.label }}</b>
                </button>
              </aside>

              <section v-if="activeSettingsSection === 'bot'" class="card pad settings-card settings-panel">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Bot sozlamalari</div>
                  </div>
                </div>
                <form class="form settings-form settings-form-grid" @submit.prevent="saveSettings">
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
                  <label class="label">Telegram reaksiyalari
                    <select v-model="settingsForm.message_reactions" class="select">
                      <option value="false">O‘chirilgan</option>
                      <option value="true">👀 task yaratish va 💯 yopish</option>
                    </select>
                  </label>
                  <label class="label">Yopish tegi
                    <input v-model.trim="settingsForm.done_tag" class="input" placeholder="#done" />
                  </label>
                  <label class="label">Asosiy guruh raqami
                    <input v-model.trim="settingsForm.main_group_id" class="input" placeholder="-1001234567890" />
                  </label>
                  <label class="label">Ticket xabarnomalari
                    <select v-model="settingsForm.ticket_notifications" class="select">
                      <option value="false">O‘chirilgan</option>
                      <option value="true">Yoqilgan (AI va 👀 ochganda)</option>
                    </select>
                  </label>
                  <label v-if="settingsForm.ticket_notifications === 'true'" class="label">Ticket guruh chat ID
                    <input v-model.trim="settingsForm.ticket_group_id" class="input" placeholder="-1001234567890" />
                  </label>
                  <label v-if="settingsForm.ticket_notifications === 'true'" class="label">Topic ID (ixtiyoriy)
                    <input v-model.trim="settingsForm.ticket_topic_id" class="input" placeholder="12345" />
                  </label>
                  <p v-if="settingsForm.ticket_notifications === 'true'" class="card-note wide">
                    Yangi ticket ochilganda shu guruhga xabar ketadi. Topic ID kiritilsa xabar aynan shu topic ichiga
                    yuboriladi. Shaxsiy chat ticketlari faqat mijoz va support ikkalasi bir quruvchi guruhda bo‘lsa
                    ochiladi. «Boshqa hodimga» da faqat support xodimlar (kompaniya mas’uli va menejerlar yo‘q).
                  </p>
                  <label class="label">Guruh xabari saqlansa
                    <select v-model="settingsForm.group_message_audit" class="select">
                      <option value="channel">Kanalga xabar berish</option>
                      <option value="main_group">Asosiy guruhga xabar berish</option>
                      <option value="false">Xabar bermaslik</option>
                    </select>
                  </label>
                  <label v-if="settingsForm.group_message_audit === 'channel'" class="label wide">Audit kanali
                    <input v-model.trim="settingsForm.group_message_audit_channel_id" class="input"
                      placeholder="-1001234567890 yoki @kanal_username" />
                  </label>
                  <label class="label wide">So‘rov aniqlash rejimi
                    <select v-model="settingsForm.request_detection" class="select">
                      <option value="keyword">Kalit so‘z</option>
                      <option value="all_private_keyword_group">Shaxsiy chatlar hammasi, guruhlar kalit so‘z bilan
                      </option>
                    </select>
                  </label>
                  <div class="settings-actions wide">
                    <button class="btn primary" :disabled="loadingAction === 'saveSettings'">{{ loadingAction ===
                      'saveSettings' ? 'Saqlamoqda...' : 'Sozlamani saqlash' }}</button>
                    <button class="btn" type="button" :disabled="loadingAction === 'auditStats'"
                      @click="sendGroupAuditStats">
                      {{ loadingAction === 'auditStats' ? 'Yuborilmoqda...' : 'Audit kanaliga statistika yuborish' }}
                    </button>
                  </div>
                </form>
              </section>

              <section v-else-if="activeSettingsSection === 'telegram'" class="card pad settings-card settings-panel">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Telegram ulanishi</div>
                  </div>
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
                <Transition name="fade">
                  <pre v-if="webhookStatusText" class="webhook-status">{{ webhookStatusText }}</pre>
                </Transition>
              </section>

              <div v-else-if="activeSettingsSection === 'integrations'" class="settings-stack integration-stack">
                <section class="card pad settings-card">
                  <div class="settings-head">
                    <div>
                      <div class="card-title">Integratsiya</div>
                    </div>
                    <span class="status-pill" :class="{ ready: aiIntegrationReady, error: aiIntegrationHasError }">{{
                      aiIntegrationStatus }}</span>
                  </div>
                  <form class="form settings-form integration-form" @submit.prevent="saveIntegration">
                    <label class="label">Xizmat turi
                      <select v-model="integrationForm.provider" class="select">
                        <option value="openai_compatible">OpenAI formatiga mos (LLM)</option>
                      </select>
                    </label>
                    <label class="label">Endpoint
                      <input v-model.trim="integrationForm.base_url" class="input"
                        placeholder="https://llm.example.com/v1" />
                    </label>
                    <label class="label">Team
                      <input v-model.trim="integrationForm.team" class="input" placeholder="team-id" />
                    </label>
                    <label class="label">Key alias
                      <input v-model.trim="integrationForm.key_alias" class="input" placeholder="support-bot-key" />
                    </label>
                    <label class="label">Secret
                      <input v-model="integrationForm.api_key" class="input" type="password" autocomplete="new-password"
                        :placeholder="integrationForm.has_api_key ? 'Saqlangan secretni almashtirish' : 'sk-...'" />
                    </label>
                    <label class="label">Model (LLM)
                      <input v-model.trim="integrationForm.model" class="input" placeholder="gpt-4o-mini" />
                    </label>
                    <label class="label">Holat
                      <select v-model="integrationForm.enabled" class="select">
                        <option :value="true">Faol</option>
                        <option :value="false">O‘chirilgan</option>
                      </select>
                    </label>
                    <p class="card-note wide">
                      So‘rovlar <code>{endpoint}/chat/completions</code> ga ketadi. Autentifikatsiya uchun faqat
                      <code>Authorization: Bearer {secret}</code> ishlatiladi. Team va key alias saqlanadi, lekin har
                      bir LLM so‘rovida yuborilmaydi.
                    </p>
                    <label class="label wide">Tizim ko‘rsatmasi
                      <textarea v-model="integrationForm.system_prompt" class="textarea tall"></textarea>
                    </label>
                    <button class="btn primary"
                      :disabled="loadingAction === 'saveIntegration' || loadingAction === 'extractKnowledge'">
                      {{ loadingAction === 'saveIntegration' ? 'Saqlamoqda...' : 'Integratsiyani saqlash' }}
                    </button>
                  </form>
                </section>

                <section class="card pad settings-card">
                  <div class="settings-head">
                    <div>
                      <div class="card-title">ClickUp integratsiya</div>
                    </div>
                    <span class="status-pill"
                      :class="{ ready: clickUpIntegrationReady, error: clickUpIntegrationHasError }">
                      {{ clickUpIntegrationStatus }}
                    </span>
                  </div>
                  <form class="form settings-form integration-form" @submit.prevent="saveClickUpIntegration">
                    <label class="label">API token
                      <input v-model="clickupForm.api_token" class="input" type="password" autocomplete="new-password"
                        :placeholder="clickupForm.has_api_token ? 'Saqlangan tokenni almashtirish' : 'pk_...'" />
                    </label>
                    <label class="label">Newbies List ID
                      <input v-model.trim="clickupForm.newbies_list_id" class="input" placeholder="123456789" />
                    </label>
                    <label class="label">Big team List ID
                      <input v-model.trim="clickupForm.big_team_list_id" class="input" placeholder="987654321" />
                    </label>
                    <label class="label">Newbies chat ID
                      <input v-model.trim="clickupForm.newbies_chat_id" class="input" placeholder="-1001234567890" />
                    </label>
                    <label class="label">Big team chat ID
                      <input v-model.trim="clickupForm.big_team_chat_id" class="input" placeholder="-1009876543210" />
                    </label>
                    <label class="label">Yopish statusi
                      <input v-model.trim="clickupForm.done_status" class="input" placeholder="complete" />
                    </label>
                    <div class="settings-actions wide">
                      <button class="btn primary" :disabled="loadingAction === 'saveClickUpIntegration'">
                        {{ loadingAction === 'saveClickUpIntegration' ? 'Tekshirilmoqda...' : 'Integratsiya qilish' }}
                      </button>
                      <button v-if="clickupForm.enabled || clickupForm.has_api_token" class="btn danger" type="button"
                        :disabled="loadingAction === 'disconnectClickUp'" @click="disconnectClickUpIntegration">
                        {{ loadingAction === 'disconnectClickUp' ? 'Uzilmoqda...' : 'Uzish' }}
                      </button>
                    </div>
                  </form>
                  <p v-if="clickupForm.last_check_error" class="form-error wide">{{ clickupForm.last_check_error }}</p>
                </section>

                <section class="card pad settings-card">
                  <div class="integration-note log-settings-panel">
                    <div class="settings-head compact">
                      <div>
                        <div class="card-title">Asosiy guruh loglari</div>
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
                        <input v-model.trim="logSourceDraft.chat_id" class="input"
                          placeholder="Kanal raqami: -100..." />
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

              <section v-else-if="activeSettingsSection === 'admin'" class="card pad settings-card settings-panel">
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
                    <input v-model="adminForm.new_password" class="input" type="password" autocomplete="new-password"
                      placeholder="Bo‘sh qoldirilsa o‘zgarmaydi" />
                  </label>
                  <button class="btn primary" :disabled="loadingAction === 'saveAdmin'">{{ loadingAction === 'saveAdmin'
                    ? 'Saqlamoqda...' : 'Saqlash' }}</button>
                </form>
              </section>
            </div>
          </template>

          <template v-if="activeTab === 'knowledgeBase'">
            <div class="settings-stack integration-stack">
              <section class="card pad settings-card">
                <div class="settings-head">
                  <div>
                    <div class="card-title">Bilim bazasi</div>
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
      <Modal v-if="modal === 'companyModuleCustomPeriod'" title="Ixtiyoriy davr"
        @close="cancelCompanyModuleCustomPeriod">
        <form class="form two custom-period-form" @submit.prevent="applyCompanyModuleCustomPeriod">
          <label class="label">Boshlanish sanasi
            <input v-model="companyModuleCustomPeriodForm.start" class="input" type="date" required />
          </label>
          <label class="label">Tugash sanasi
            <input v-model="companyModuleCustomPeriodForm.end" class="input" type="date" required />
          </label>
          <p v-if="companyModuleCustomPeriodError" class="form-error">{{ companyModuleCustomPeriodError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="cancelCompanyModuleCustomPeriod">Bekor qilish</button>
            <button class="btn primary" type="submit" :disabled="loadingAction === 'companyModuleCustomPeriod'">
              {{ loadingAction === 'companyModuleCustomPeriod' ? 'Yuklanmoqda...' : 'Qo‘llash' }}
            </button>
          </div>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'companyModuleChartCustomPeriod'" title="Grafik davri"
        @close="cancelCompanyModuleChartCustomPeriod">
        <form class="form two custom-period-form" @submit.prevent="applyCompanyModuleChartCustomPeriod">
          <label class="label">Boshlanish sanasi
            <input v-model="companyModuleChartCustomPeriodForm.start" class="input" type="date" required />
          </label>
          <label class="label">Tugash sanasi
            <input v-model="companyModuleChartCustomPeriodForm.end" class="input" type="date" required />
          </label>
          <p v-if="companyModuleChartCustomPeriodError" class="form-error">{{ companyModuleChartCustomPeriodError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="cancelCompanyModuleChartCustomPeriod">Bekor qilish</button>
            <button class="btn primary" type="submit" :disabled="loadingAction === 'companyModuleChartCustomPeriod'">
              {{ loadingAction === 'companyModuleChartCustomPeriod' ? 'Yuklanmoqda...' : 'Qo‘llash' }}
            </button>
          </div>
        </form>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'companyModuleEmployeeActivity'" :title="companyModuleEmployeeDetailTitle" wide
        @close="closeModal">
        <div v-if="companyModuleEmployeeDetail" class="company-module-employee-detail">
          <div class="company-module-employee-head">
            <div>
              <div class="company-module-employee-company">{{ companyModuleEmployeeDetail.name || 'Kompaniya' }}</div>
              <div class="company-module-employee-meta">
                <span v-if="companyModuleEmployeeReportLabel">{{ companyModuleEmployeeReportLabel }}</span>
                <span v-if="companyModuleEmployeePanelPeriodLabel">{{ companyModuleEmployeePanelPeriodLabel }}</span>
                <span v-if="companyModuleEmployeeSupportLabel">Mas’ul: {{ companyModuleEmployeeSupportLabel }}</span>
              </div>
            </div>
          </div>

          <div v-if="companyModuleEmployeeHasActivity" class="company-module-employee-summary">
            <div class="company-module-employee-summary-item">
              <span class="company-module-employee-summary-icon">📊</span>
              <span>Jami amallar: <b>{{ fmtNumber(companyModuleEmployeeActivity.total_actions || 0) }} amal</b></span>
            </div>
            <div class="company-module-employee-summary-item">
              <span class="company-module-employee-summary-icon">✅</span>
              <span>Faol xodimlar <b>({{ fmtNumber(companyModuleEmployeeActiveCount) }})</b></span>
            </div>
            <div class="company-module-employee-summary-item">
              <span class="company-module-employee-summary-icon">❌</span>
              <span>Nofaol xodimlar <b>({{ fmtNumber(companyModuleEmployeeInactiveCount) }})</b></span>
            </div>
          </div>

          <div v-if="companyModuleEmployeeActiveRows.length" class="company-module-employee-section">
            <div class="company-module-employee-section-title">Faol xodimlar</div>
            <div class="company-module-employee-list">
              <article v-for="employee in companyModuleEmployeeActiveRows"
                :key="`active-employee-${employee.id || employee.name}`" class="company-module-employee-card">
                <div class="company-module-employee-card-head">
                  <b>{{ employee.name || 'Xodim' }}</b>
                  <span class="company-module-employee-count">{{ fmtNumber(employee.action_count || 0) }} amal</span>
                </div>
                <div v-if="employee.important_count" class="company-module-employee-note">
                  Muhim amallar: {{ fmtNumber(employee.important_count) }}
                </div>
              </article>
            </div>
          </div>

          <div v-if="companyModuleEmployeeInactiveRows.length" class="company-module-employee-section">
            <div class="company-module-employee-section-title">Nofaol xodimlar</div>
            <div class="company-module-employee-list">
              <article v-for="employee in companyModuleEmployeeInactiveRows"
                :key="`inactive-employee-${employee.id || employee.name}`"
                class="company-module-employee-card inactive">
                <div class="company-module-employee-card-head">
                  <b>{{ employee.name || 'Xodim' }}</b>
                  <span v-if="employee.last_activity_date" class="company-module-employee-last">
                    Oxirgi: {{ employee.last_activity_date }}
                  </span>
                </div>
                <div v-if="employee.important_count" class="company-module-employee-note">
                  Muhim amallar: {{ fmtNumber(employee.important_count) }}
                </div>
              </article>
            </div>
          </div>

          <div v-else-if="!companyModuleEmployeeHasActivity" class="empty compact">
            Bu kompaniya uchun xodimlar faolligi hali saqlanmagan. Yangi syncdan keyin ko‘rinadi.
          </div>
        </div>
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
          <label class="label">Telegram username
            <input v-model.trim="employeeForm.username" class="input" placeholder="@username" />
          </label>
          <label class="label">Telefon
            <input v-model.trim="employeeForm.phone" class="input" placeholder="+998..." />
          </label>
          <label class="label">ClickUp User ID
            <input v-model.trim="employeeForm.clickup_user_id" class="input" placeholder="12345678" />
          </label>
          <label class="label">Rol
            <select v-model="employeeForm.role" class="select">
              <option value="support">Texnik yordam</option>
              <option value="manager">Menejer</option>
              <option value="owner">Ega</option>
              <option value="admin">Bot admin</option>
            </select>
          </label>
          <label class="label">Kompaniya
            <select v-model="employeeForm.company_id" class="select">
              <option value="">Biriktirilmagan</option>
              <option v-for="company in assignCompanyOptions" :key="company.assign_key" :value="company.assign_key">
                {{ companyAssignLabel(company) }}
              </option>
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
      <Modal v-if="modal === 'company'" :title="companyForm.id ? 'Kompaniyani tahrirlash' : 'Kompaniya qo‘shish'"
        @close="closeModal">
        <form class="form" @submit.prevent="saveCompany">
          <label class="label">Kompaniya nomi
            <input v-model.trim="companyForm.name" class="input" placeholder="Misol: Uyqur MChJ" required />
          </label>
          <label class="label">Yuridik nomi (ixtiyoriy)
            <input v-model.trim="companyForm.legal_name" class="input" />
          </label>
          <label class="label">Telefon (ixtiyoriy)
            <input v-model.trim="companyForm.phone" class="input" />
          </label>
          <label class="label">Qo'shimcha eslatmalar (ixtiyoriy)
            <textarea v-model.trim="companyForm.notes" class="input" rows="3"></textarea>
          </label>
          <label class="label">Telegram guruhi (ixtiyoriy)
            <select v-model="companyForm.chat_id" class="select">
              <option value="">Guruh biriktirilmagan</option>
              <option v-for="group in companyFormGroupOptions" :key="group.chat_id" :value="group.chat_id">
                {{ group.label }}{{ group.company_name ? ` · hozir: ${group.company_name}` : '' }}
              </option>
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="companyForm.is_active" /> Faol kompaniya
          </label>
          <div class="actions">
            <button class="btn primary" :disabled="loadingAction === 'saveCompany'">
              {{ loadingAction === 'saveCompany' ? 'Saqlanmoqda...' : 'Saqlash' }}
            </button>
            <button class="btn" type="button" @click="closeModal" :disabled="loadingAction === 'saveCompany'">Bekor
              qilish</button>
          </div>
        </form>
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
          <div class="ticket-filter-tabs source-tabs">
            <button :class="{ active: ticketList.source === 'all' }" @click="ticketList.source = 'all'">Umumiy</button>
            <button :class="{ active: ticketList.source === 'group' }" @click="ticketList.source = 'group'">
              Guruh <span>{{ fmtNumber(ticketListCounts.group) }}</span>
            </button>
            <button :class="{ active: ticketList.source === 'private' }"
              @click="ticketList.source = 'private'">Shaxsiy</button>
          </div>
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
            <SearchField v-model="ticketListSearch" />
            <select v-model="ticketListSupport" class="select">
              <option v-for="option in ticketListSupportOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <DataTable :columns="ticketListColumns" :rows="filteredTicketListRows" empty="Ticket topilmadi"
            :page-size="10" :on-cell-action="handleTableCellAction" :row-class="requestRowClass">
            <template #requestReply="{ row }">
              <button v-if="isOpenTicketStatus(row.status)" class="btn small primary" type="button"
                @click.stop="openRequestReply(row)">Javob berish</button>
              <button v-else class="btn small" type="button" @click.stop="loadChatDetail(row)">Ko‘rish</button>
            </template>
          </DataTable>
        </div>
      </Modal>
    </Transition>

    <Transition name="modal-fade">
      <Modal v-if="modal === 'openRequests'" :title="openRequestsTitle" wide @close="closeModal">
        <DataTable :columns="openRequestColumns" :rows="filteredOpenRequests" empty="Ochiq so‘rov qolmagan"
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
            <div class="metric-detail-body" :class="{ 'with-chat': metricDetail.chatPane }">
              <div class="metric-detail-main">
                <div v-if="metricDetail.showSourceTabs" class="ticket-filter-tabs source-tabs compact-tabs">
                  <button :class="{ active: metricDetail.source === 'all' }"
                    @click="metricDetail.source = 'all'">Umumiy</button>
                  <button :class="{ active: metricDetail.source === 'group' }"
                    @click="metricDetail.source = 'group'">Guruh</button>
                  <button :class="{ active: metricDetail.source === 'private' }"
                    @click="metricDetail.source = 'private'">Shaxsiy</button>
                </div>
                <DataTable :columns="metricDetail.columns" :rows="filteredMetricDetailRows" :empty="metricDetail.empty"
                  :on-cell-action="handleMetricDetailCellAction" :row-class="metricDetailRowClass"
                  :page-size="metricDetail.pageSize || 12" />
              </div>
            </div>
          </section>

          <section class="detail-section metric-chat-panel">
            <Transition name="fade-slide-up" mode="out-in">
              <div v-if="metricChatDetail.chat" :key="chatIdKey(metricChatDetail.chat)" class="chat-pane-shell">
                <div class="metric-chat-header">
                  <div>
                    <div class="card-title">{{ metricChatTitle }}</div>
                    <div class="card-note">
                      {{ metricChatDetail.chat ? fmtNumber(metricChatConversation.length) + ' ta xabar' : 'Chat tanlang'
                      }}
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
                      <article v-for="request in metricChatDetail.requests" :key="request.id"
                        class="metric-request-card" :class="{ open: request.status === 'open' }">
                        <div class="metric-request-head">
                          <span class="badge" :class="request.status === 'closed' ? 'green' : 'orange'">
                            {{ requestStatusLabel(request) }}
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
                    <div v-else class="empty compact">{{ metricChatDetail.requests?.length ? 'Ticketlar yashirilgan' :
                      'Bu chatda so‘rov yo‘q' }}</div>
                  </section>

                  <div v-if="metricChatConversation.length" ref="metricChatThreadRef"
                    class="telegram-thread metric-chat-thread">
                    <TransitionGroup name="chat-msg">
                      <article v-for="message in metricChatConversation" :key="chatBubbleKey(message)"
                        class="chat-bubble-row"
                        :class="{ outbound: message.direction === 'outbound', system: isSystemMessage(message) }">
                        <div v-if="isSystemMessage(message)" class="chat-system-pill">
                          <span>{{ message.text }}</span>
                          <time>{{ fmtChatTime(message.created_at) }}</time>
                        </div>
                        <div v-else class="chat-bubble"
                          :class="{ 'ticket-message': isTicketMessage(message), 'ticket-message-open': isOpenTicketMessage(message), 'ticket-message-closed': isClosedTicketMessage(message) }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ?
                            'Xodim'
                            : 'Mijoz') }}</div>
                          <div v-if="message.media" class="chat-media">
                            <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)"
                              class="chat-media-image" :src="mediaUrl(message.media)" alt="" />
                            <button v-else-if="message.media.kind === 'photo'" type="button"
                              class="chat-media-placeholder chat-media-open" @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-video" :src="mediaUrl(message.media)" controls playsinline></video>
                            <button v-else-if="isVideoMedia(message.media)" type="button"
                              class="chat-media-placeholder chat-media-open"
                              :title="mediaErrors[message.media.file_id] || undefined"
                              @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <template v-else-if="isAudioMedia(message.media)">
                              <audio v-if="mediaAudioReady(message.media)" :key="mediaAudioKey(message.media)"
                                class="chat-media-audio" controls preload="auto" playsinline
                                :src="mediaUrl(message.media)" @error="onAudioPlaybackError(message.media)" />
                              <button v-else type="button" class="chat-media-placeholder chat-media-open"
                                :title="mediaErrors[message.media.file_id] || undefined"
                                @click="retryMediaLoad(message.media)">{{ mediaPlaceholder(message.media) }}</button>
                              <button v-if="mediaUrl(message.media)" type="button"
                                class="chat-media-link chat-media-open" @click="retryMediaLoad(message.media)">Qayta
                                yuklash</button>
                              <a v-if="mediaUrl(message.media)" class="chat-media-link" :href="mediaUrl(message.media)"
                                :download="mediaDownloadName(message.media)" target="_blank"
                                rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            </template>
                            <a v-else-if="isDocumentMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-file" :href="mediaUrl(message.media)"
                              :download="mediaDownloadName(message.media)" target="_blank" rel="noopener noreferrer">{{
                                mediaPlaceholder(message.media) }}</a>
                            <div v-else class="chat-media-placeholder"
                              :class="{ sticker: message.media.kind === 'sticker' }">
                              {{ mediaPlaceholder(message.media) }}
                            </div>
                            <a v-if="showMediaOpenLink(message.media)" class="chat-media-link"
                              :href="mediaUrl(message.media)" :download="mediaDownloadName(message.media)"
                              target="_blank" rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            <a v-if="showTelegramOpenLink(message)" class="chat-media-link"
                              :href="telegramMessageLink(message)" target="_blank" rel="noopener noreferrer">Telegramda
                              ochish</a>
                          </div>
                          <div v-if="chatMessageBodyText(message)" class="chat-message-text"
                            v-html="chatMessageHtml(message)"></div>
                          <div class="chat-bubble-footer">
                            <span v-if="isClosedTicketMessage(message)" class="chat-ticket chat-ticket-closed">{{
                              messageStatusLabel(message) }}</span>
                            <span v-else-if="showMessageStatus(message)" class="badge"
                              :class="messageStatusBadgeClass(message)">{{ messageStatusLabel(message) }}</span>
                            <span v-if="showRequestBadge(message)" class="chat-ticket">So‘rov</span>
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
          <div v-if="metricDetail.showSourceTabs" class="ticket-filter-tabs source-tabs">
            <button :class="{ active: metricDetail.source === 'all' }"
              @click="metricDetail.source = 'all'">Umumiy</button>
            <button :class="{ active: metricDetail.source === 'group' }"
              @click="metricDetail.source = 'group'">Guruh</button>
            <button :class="{ active: metricDetail.source === 'private' }"
              @click="metricDetail.source = 'private'">Shaxsiy</button>
          </div>
          <div v-if="metricDetail.summary?.length" class="detail-summary metric-detail-summary">
            <div v-for="item in metricDetail.summary" :key="item.label">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
            </div>
          </div>
          <DataTable :columns="metricDetail.columns" :rows="filteredMetricDetailRows" :empty="metricDetail.empty"
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
              <span>Yopilgan</span>
              <b class="success">{{ fmtNumber(companyGroupDetail.company?.closed_requests ||
                companyGroupDetail.summary?.closed_requests) }}</b>
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
                    <small>{{ chatMessageText(group.conversation?.[0]) || group.requests?.[0]?.initial_text ||
                      'Yozishma tarixi' }}</small>
                    <em>{{ fmtNumber(group.total_messages) }} xabar · Jami ticket: {{ fmtNumber(group.total_requests) }}
                      ·
                      Javob berilgan: {{ fmtNumber(group.closed_requests) }} · Ochiq: {{ fmtNumber(group.open_requests)
                      }}</em>
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
                      <span>{{ fmtNumber(selectedCompanyGroup.total_messages) }} xabar · Jami ticket: {{
                        fmtNumber(selectedCompanyGroup.total_requests) }} · Javob berilgan: {{
                          fmtNumber(selectedCompanyGroup.closed_requests) }} · Ochiq: {{
                          fmtNumber(selectedCompanyGroup.open_requests) }}</span>
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
                            {{ requestStatusLabel(request) }}
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
                          <button v-else class="btn small primary" type="button" @click="openInlineReply(request)">
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
                        class="chat-bubble-row"
                        :class="{ outbound: message.direction === 'outbound', system: isSystemMessage(message) }">
                        <div v-if="isSystemMessage(message)" class="chat-system-pill">
                          <span>{{ message.text }}</span>
                          <time>{{ fmtChatTime(message.created_at) }}</time>
                        </div>
                        <div v-else class="chat-bubble"
                          :class="{ 'ticket-message': isTicketMessage(message), 'ticket-message-open': isOpenTicketMessage(message), 'ticket-message-closed': isClosedTicketMessage(message) }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ?
                            'Xodim' : 'Mijoz') }}</div>
                          <div v-if="message.media" class="chat-media">
                            <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)"
                              class="chat-media-image" :src="mediaUrl(message.media)" alt="" />
                            <button v-else-if="message.media.kind === 'photo'" type="button"
                              class="chat-media-placeholder chat-media-open" @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-video" :src="mediaUrl(message.media)" controls playsinline></video>
                            <button v-else-if="isVideoMedia(message.media)" type="button"
                              class="chat-media-placeholder chat-media-open"
                              :title="mediaErrors[message.media.file_id] || undefined"
                              @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <template v-else-if="isAudioMedia(message.media)">
                              <audio v-if="mediaAudioReady(message.media)" :key="mediaAudioKey(message.media)"
                                class="chat-media-audio" controls preload="auto" playsinline
                                :src="mediaUrl(message.media)" @error="onAudioPlaybackError(message.media)" />
                              <button v-else type="button" class="chat-media-placeholder chat-media-open"
                                :title="mediaErrors[message.media.file_id] || undefined"
                                @click="retryMediaLoad(message.media)">{{ mediaPlaceholder(message.media) }}</button>
                              <button v-if="mediaUrl(message.media)" type="button"
                                class="chat-media-link chat-media-open" @click="retryMediaLoad(message.media)">Qayta
                                yuklash</button>
                              <a v-if="mediaUrl(message.media)" class="chat-media-link" :href="mediaUrl(message.media)"
                                :download="mediaDownloadName(message.media)" target="_blank"
                                rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            </template>
                            <a v-else-if="isDocumentMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-file" :href="mediaUrl(message.media)"
                              :download="mediaDownloadName(message.media)" target="_blank" rel="noopener noreferrer">{{
                                mediaPlaceholder(message.media) }}</a>
                            <div v-else class="chat-media-placeholder"
                              :class="{ sticker: message.media.kind === 'sticker' }">
                              {{ mediaPlaceholder(message.media) }}
                            </div>
                            <a v-if="showMediaOpenLink(message.media)" class="chat-media-link"
                              :href="mediaUrl(message.media)" :download="mediaDownloadName(message.media)"
                              target="_blank" rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            <a v-if="showTelegramOpenLink(message)" class="chat-media-link"
                              :href="telegramMessageLink(message)" target="_blank" rel="noopener noreferrer">Telegramda
                              ochish</a>
                          </div>
                          <div v-if="chatMessageBodyText(message)" class="chat-message-text"
                            v-html="chatMessageHtml(message)"></div>
                          <div class="chat-bubble-footer">
                            <span v-if="isClosedTicketMessage(message)" class="chat-ticket chat-ticket-closed">{{
                              messageStatusLabel(message) }}</span>
                            <span v-else-if="showMessageStatus(message)" class="badge"
                              :class="messageStatusBadgeClass(message)">{{ messageStatusLabel(message) }}</span>
                            <span v-if="showRequestBadge(message)" class="chat-ticket">Ticket</span>
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
                  {{ fmtNumber(group.chat_message_count || group.message_count) }} xabar · {{
                    fmtNumber(group.closed_count)
                  }} yopilgan · {{
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
                <div class="drilldown-label">Dialog</div>
                <div v-if="groupChatMessages(group).length" class="mini-list">
                  <article v-for="message in groupChatMessages(group)"
                    :key="message.id || message.message_id || message.created_at" class="mini-item">
                    <b>{{ message.from_name || message.actor_name || message.source_label || 'Mijoz' }}</b>
                    <p>{{ chatMessageText(message) || 'Matn yo‘q' }}</p>
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
                :class="{ premium: isEmployeePremium(employeeProfile.employee) }"
                :data-tooltip="employeePremiumTooltip(employeeProfile.employee) || null"
                :src="employeeAvatarUrl(employeeProfile.employee)" alt="" />
              <span v-else class="employee-profile-avatar fallback"
                :class="{ premium: isEmployeePremium(employeeProfile.employee) }"
                :data-tooltip="employeePremiumTooltip(employeeProfile.employee) || null">{{
                  employeeInitials(employeeProfile.employee)
                }}</span>
            </span>
            <div class="employee-profile-title">
              <h2>
                <button
                  v-if="employeeProfile.employee?.member_employees?.length || employeeProfile.member_stats?.length"
                  type="button" class="employee-manager-heading-toggle" :class="{ open: employeeManagerDetailsOpen }"
                  :title="employeeManagerDetailsOpen ? 'Menejer ma’lumotlarini yopish' : 'Menejer ma’lumotlarini ochish'"
                  @click="employeeManagerDetailsOpen = !employeeManagerDetailsOpen">
                  <span class="employee-manager-heading-icon" aria-hidden="true">{{ employeeManagerDetailsOpen ? '▾' :
                    '▸'
                  }}</span>
                  <span>{{ employeeProfile.employee?.full_name || employeeProfile.employee?.username || 'Xodim'
                  }}</span>
                </button>
                <template v-else>{{ employeeProfile.employee?.full_name || employeeProfile.employee?.username || 'Xodim'
                }}</template>
              </h2>
              <p>Support yozishmalari</p>
              <span>Davr: {{ selectedPeriodLabel }}</span>
              <div
                v-if="(employeeProfile.employee?.member_employees?.length || employeeProfile.member_stats?.length) && employeeManagerDetailsOpen"
                class="employee-manager-details">
                <div v-if="employeeProfile.employee?.member_employees?.length" class="employee-profile-members">
                  <small>Ichidagi menejerlar</small>
                  <div class="employee-profile-member-list">
                    <span v-for="member in employeeProfile.employee.member_employees" :key="supportRowKey(member)"
                      class="profile-pill member-pill">
                      {{ member.full_name || member.username || 'Menejer' }}
                    </span>
                  </div>
                </div>
                <section v-if="employeeProfile.member_stats?.length" class="employee-member-breakdown">
                  <div class="detail-section-head">
                    <b>Menejerlar bo‘yicha alohida statistika</b>
                  </div>
                  <DataTable :columns="managerMemberColumns" :rows="employeeProfile.member_stats"
                    empty="Menejer statistikasi topilmadi" :on-cell-action="handleTableCellAction" :page-size="10" />
                </section>
              </div>
              <div class="employee-profile-mini-stats">
                <span>
                  <small>Yopilgan</small>
                  <b>{{ fmtNumber(employeeProfile.summary?.closed_requests) }}</b>
                </span>
                <span>
                  <small>Ochiq</small>
                  <b>{{ fmtNumber(employeeProfile.summary?.open_requests) }}</b>
                </span>
                <button type="button" class="employee-profile-stat-card" :disabled="employeeProfileCompanyTotal <= 0"
                  @click="openEmployeeCompanyList">
                  <small>Kompaniya</small>
                  <b>{{ fmtNumber(employeeProfileCompanyTotal) }}</b>
                </button>
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
              <Transition name="fade-slide-up" mode="out-in" @after-enter="scrollEmployeeProfileChatToEnd">
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
                        <span>{{ requestStatusLabel(request) }}</span>
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
                        class="chat-bubble-row"
                        :class="{ outbound: message.direction === 'outbound', system: isSystemMessage(message) }">
                        <div v-if="isSystemMessage(message)" class="chat-system-pill">
                          <span>{{ message.text }}</span>
                          <time>{{ fmtChatTime(message.created_at) }}</time>
                        </div>
                        <div v-else class="chat-bubble"
                          :class="{ 'ticket-message': isTicketMessage(message), 'ticket-message-open': isOpenTicketMessage(message), 'ticket-message-closed': isClosedTicketMessage(message) }">
                          <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ?
                            employeeProfile.employee?.full_name || 'Xodim' : 'Mijoz') }}</div>
                          <div v-if="message.media" class="chat-media">
                            <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)"
                              class="chat-media-image" :src="mediaUrl(message.media)" alt="" />
                            <button v-else-if="message.media.kind === 'photo'" type="button"
                              class="chat-media-placeholder chat-media-open" @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-video" :src="mediaUrl(message.media)" controls playsinline></video>
                            <button v-else-if="isVideoMedia(message.media)" type="button"
                              class="chat-media-placeholder chat-media-open"
                              :title="mediaErrors[message.media.file_id] || undefined"
                              @click="retryMediaLoad(message.media)">{{
                                mediaPlaceholder(message.media) }}</button>
                            <template v-else-if="isAudioMedia(message.media)">
                              <audio v-if="mediaAudioReady(message.media)" :key="mediaAudioKey(message.media)"
                                class="chat-media-audio" controls preload="auto" playsinline
                                :src="mediaUrl(message.media)" @error="onAudioPlaybackError(message.media)" />
                              <button v-else type="button" class="chat-media-placeholder chat-media-open"
                                :title="mediaErrors[message.media.file_id] || undefined"
                                @click="retryMediaLoad(message.media)">{{ mediaPlaceholder(message.media) }}</button>
                              <button v-if="mediaUrl(message.media)" type="button"
                                class="chat-media-link chat-media-open" @click="retryMediaLoad(message.media)">Qayta
                                yuklash</button>
                              <a v-if="mediaUrl(message.media)" class="chat-media-link" :href="mediaUrl(message.media)"
                                :download="mediaDownloadName(message.media)" target="_blank"
                                rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            </template>
                            <a v-else-if="isDocumentMedia(message.media) && mediaUrl(message.media)"
                              class="chat-media-file" :href="mediaUrl(message.media)"
                              :download="mediaDownloadName(message.media)" target="_blank" rel="noopener noreferrer">{{
                                mediaPlaceholder(message.media) }}</a>
                            <div v-else class="chat-media-placeholder"
                              :class="{ sticker: message.media.kind === 'sticker' }"
                              :title="mediaErrors[message.media.file_id] || undefined">
                              {{ mediaPlaceholder(message.media) }}
                            </div>
                            <a v-if="showMediaOpenLink(message.media)" class="chat-media-link"
                              :href="mediaUrl(message.media)" :download="mediaDownloadName(message.media)"
                              target="_blank" rel="noopener noreferrer">{{ mediaOpenLabel(message.media) }}</a>
                            <a v-if="showTelegramOpenLink(message)" class="chat-media-link"
                              :href="telegramMessageLink(message)" target="_blank" rel="noopener noreferrer">Telegramda
                              ochish</a>
                          </div>
                          <div v-if="chatMessageBodyText(message)" class="chat-message-text"
                            v-html="chatMessageHtml(message)"></div>
                          <div class="chat-bubble-footer">
                            <span v-if="isClosedTicketMessage(message)" class="chat-ticket chat-ticket-closed">{{
                              messageStatusLabel(message) }}</span>
                            <span v-else-if="showMessageStatus(message)" class="badge"
                              :class="messageStatusBadgeClass(message)">{{ messageStatusLabel(message) }}</span>
                            <span v-if="showRequestBadge(message)" class="chat-ticket">So‘rov</span>
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
      <Modal v-if="modal === 'employeeCompanyList'" :title="employeeCompanyTitle" wide @close="closeModal">
        <div class="detail-stack">
          <section class="detail-summary">
            <div><span>Kompaniya</span><b>{{ fmtNumber(employeeCompanyDetail.summary?.total) }}</b></div>
            <div><span>Aktiv</span><b>{{ fmtNumber(employeeCompanyDetail.summary?.active) }}</b></div>
            <div><span>Obuna xavfi</span><b>{{ fmtNumber(employeeCompanyDetail.summary?.expiring_soon) }}</b></div>
            <div><span>Churn/Pauza</span><b>{{ fmtNumber(employeeCompanyDetail.summary?.churn) }}</b></div>
          </section>
          <DataTable :columns="employeeCompanyColumns" :rows="employeeCompanyDetail.companies || []"
            empty="Bu xodimga biriktirilgan kompaniya topilmadi" :page-size="12"
            :on-cell-action="handleTableCellAction">
            <template #businessStatus="{ row }">
              <span class="status-pill mini" :class="businessStatusClass(row.business_status)">{{
                businessStatusLabel(row.business_status) }}</span>
            </template>
          </DataTable>
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
                    {{ fmtNumber(group.chat_message_count || group.message_count) }} xabar · {{
                      fmtNumber(group.closed_count) }} yopilgan ·
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
                  <div class="drilldown-label">Dialog</div>
                  <div v-if="groupChatMessages(group).length" class="mini-list">
                    <article v-for="message in groupChatMessages(group)"
                      :key="message.id || message.message_id || message.created_at" class="mini-item">
                      <b>{{ message.from_name || message.actor_name || message.source_label || 'Mijoz' }}</b>
                      <p>{{ chatMessageText(message) || 'Matn yo‘q' }}</p>
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
      <Modal v-if="modal === 'chatDetail'" :title="chatDetailTitle" wide xlarge @close="closeModal">
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
            <div v-if="chatMembershipLabel(chatDetail.chat)" class="chat-status-summary"
              :class="chatMembershipTone(chatDetail.chat)">
              <span>Telegram holati</span>
              <b>{{ chatMembershipLabel(chatDetail.chat) }}</b>
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
                <template #initialText="{ row }">
                  <button type="button" class="request-preview-btn" :title="row.initial_text || '—'"
                    @click.stop="focusChatRequest(row)">
                    {{ previewFirstWords(row.initial_text) }}
                  </button>
                </template>
                <template #requestReply="{ row }">
                  <button class="btn small" type="button" :disabled="row.status !== 'open'"
                    @click.stop="focusChatRequest(row)">Javob</button>
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
                  :class="{ outbound: message.direction === 'outbound', system: isSystemMessage(message) }">
                  <div v-if="isSystemMessage(message)" class="chat-system-pill">
                    <span>{{ message.text }}</span>
                    <time>{{ fmtChatTime(message.created_at) }}</time>
                  </div>
                  <div v-else :id="chatMessageDomId(message)" class="chat-bubble"
                    :class="{ 'ticket-message': isTicketMessage(message), 'ticket-message-open': isOpenTicketMessage(message), 'ticket-message-closed': isClosedTicketMessage(message), 'chat-bubble-highlight': isChatMessageFocused(message) }">
                    <div class="chat-bubble-author">{{ message.actor_name || (message.direction === 'outbound' ? 'Xodim'
                      :
                      'Mijoz') }}</div>
                    <div v-if="message.media" class="chat-media">
                      <img v-if="message.media.kind === 'photo' && mediaUrl(message.media)" class="chat-media-image"
                        :src="mediaUrl(message.media)" alt="" />
                      <button v-else-if="message.media.kind === 'photo'" type="button"
                        class="chat-media-placeholder chat-media-open" @click="retryMediaLoad(message.media)">{{
                          mediaPlaceholder(message.media) }}</button>
                      <video v-else-if="isVideoMedia(message.media) && mediaUrl(message.media)" class="chat-media-video"
                        :src="mediaUrl(message.media)" controls playsinline></video>
                      <button v-else-if="isVideoMedia(message.media)" type="button"
                        class="chat-media-placeholder chat-media-open"
                        :title="mediaErrors[message.media.file_id] || undefined"
                        @click="retryMediaLoad(message.media)">{{
                          mediaPlaceholder(message.media) }}</button>
                      <template v-else-if="isAudioMedia(message.media)">
                        <audio v-if="mediaAudioReady(message.media)" :key="mediaAudioKey(message.media)"
                          class="chat-media-audio" controls preload="auto" playsinline :src="mediaUrl(message.media)"
                          @error="onAudioPlaybackError(message.media)" />
                        <button v-else type="button" class="chat-media-placeholder chat-media-open"
                          :title="mediaErrors[message.media.file_id] || undefined"
                          @click="retryMediaLoad(message.media)">{{ mediaPlaceholder(message.media) }}</button>
                        <button v-if="mediaUrl(message.media)" type="button" class="chat-media-link chat-media-open"
                          @click="retryMediaLoad(message.media)">Qayta yuklash</button>
                        <a v-if="mediaUrl(message.media)" class="chat-media-link" :href="mediaUrl(message.media)"
                          :download="mediaDownloadName(message.media)" target="_blank" rel="noopener noreferrer">{{
                            mediaOpenLabel(message.media) }}</a>
                      </template>
                      <a v-else-if="isDocumentMedia(message.media) && mediaUrl(message.media)" class="chat-media-file"
                        :href="mediaUrl(message.media)" :download="mediaDownloadName(message.media)" target="_blank"
                        rel="noopener noreferrer">{{ mediaPlaceholder(message.media) }}</a>
                      <div v-else class="chat-media-placeholder" :class="{ sticker: message.media.kind === 'sticker' }"
                        :title="mediaErrors[message.media.file_id] || undefined">
                        {{ mediaPlaceholder(message.media) }}
                      </div>
                      <a v-if="showMediaOpenLink(message.media)" class="chat-media-link" :href="mediaUrl(message.media)"
                        :download="mediaDownloadName(message.media)" target="_blank" rel="noopener noreferrer">{{
                          mediaOpenLabel(message.media) }}</a>
                      <a v-if="showTelegramOpenLink(message)" class="chat-media-link"
                        :href="telegramMessageLink(message)" target="_blank" rel="noopener noreferrer">Telegramda
                        ochish</a>
                    </div>
                    <div v-if="chatMessageBodyText(message)" class="chat-message-text"
                      v-html="chatMessageHtml(message)">
                    </div>
                    <div class="chat-bubble-footer">
                      <span v-if="isClosedTicketMessage(message)" class="chat-ticket chat-ticket-closed">Yopilgan</span>
                      <span v-else-if="showMessageStatus(message)" class="badge"
                        :class="messageStatusBadgeClass(message)">{{ messageStatusLabel(message) }}</span>
                      <span v-if="showRequestBadge(message)" class="chat-ticket">So‘rov</span>
                      <span class="chat-source">{{ messageSourceLabel(message) }}</span>
                      <time>{{ fmtChatTime(message.created_at) }}</time>
                    </div>
                  </div>
                </article>
              </div>
              <div v-else class="empty compact">Dialog tarixi yo‘q</div>
              <div v-if="chatDetailActiveRequest" class="chat-detail-reply-box">
                <div class="card-note">Javob: {{ previewFirstWords(chatDetailActiveRequest.initial_text, 8) }}</div>
                <form class="inline-reply-form" @submit.prevent="sendChatDetailRequestReply">
                  <textarea v-model.trim="inlineReplyForm.text" class="textarea"
                    placeholder="Javob yozing..."></textarea>
                  <div>
                    <button class="btn small" type="button" @click="cancelInlineReply">Bekor</button>
                    <button class="btn small primary" type="submit" :disabled="loadingAction === 'replyRequest'">
                      Yuborish
                    </button>
                  </div>
                </form>
              </div>
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
      <div v-if="floatingTooltip.visible" class="floating-tooltip" :class="floatingTooltip.placement"
        :style="floatingTooltipStyle">
        {{ floatingTooltip.text }}
      </div>
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
import uyqurLogoUrl from './assets/uyqur-logo.png';

const ACTIVE_TAB_STORAGE_KEY = 'uyqur_support_active_tab';
const SETTINGS_SECTION_STORAGE_KEY = 'uyqur_support_settings_section';
const THEME_STORAGE_KEY = 'uyqur_support_theme';
const COMPARISON_STORAGE_KEY = 'uyqur_support_comparison_enabled';
const TELEGRAM_AUTO_SYNC_INTERVAL_MS = 25_000;
const COMPANY_ACTIVITY_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const SETTINGS_SECTION_KEYS = ['bot', 'integrations', 'telegram', 'admin'];
const tabs = [
  { key: 'stats', label: 'Support performance', icon: '📊' },
  { key: 'productAnalytics', label: 'Product analytics', icon: '📈' },
  { key: 'companyActivity', label: 'Company activity', icon: '🏢' },
  { key: 'groups', label: 'Bot ulangan guruhlar', icon: '👥' },
  { key: 'employees', label: 'Xodimlar', icon: '🧑‍💼' },
  { key: 'companies', label: 'Kompaniyalar', icon: '🏬' },
  { key: 'clickup', label: 'ClickUp', icon: '✅' },
  { key: 'privates', label: 'Mijozlar', icon: '💬' },
  { key: 'knowledgeBase', label: 'Bilim bazasi', icon: '📚' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️' }
];
const mainTabKeys = ['stats', 'productAnalytics', 'companyActivity'];
const otherTabKeys = ['groups', 'employees', 'companies', 'clickup', 'privates', 'knowledgeBase'];

function isValidTab(key) {
  return tabs.some(tab => tab.key === key);
}

function getStoredActiveTab() {
  if (typeof window === 'undefined') return 'stats';
  const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (stored === 'integrations') {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, 'settings');
    window.localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, 'integrations');
    return 'settings';
  }
  return isValidTab(stored) ? stored : 'stats';
}

function storeActiveTab(key) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, key);
}

function getStoredSettingsSection() {
  if (typeof window === 'undefined') return 'bot';
  const stored = window.localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY);
  return SETTINGS_SECTION_KEYS.includes(stored) ? stored : 'bot';
}

function storeSettingsSection(key) {
  if (typeof window === 'undefined' || !SETTINGS_SECTION_KEYS.includes(key)) return;
  window.localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, key);
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
const deletingEmployeeId = ref('');
const selectedSendType = ref('groups');
const selectedStatsPeriod = ref('week');
const previousStatsPeriod = ref('week');
const actionMenuOpen = ref(false);
const actionMenuRef = ref(null);
const rankingMenuOpen = ref(false);
const rankingMenuRef = ref(null);
const moduleCompareMenuOpen = ref(false);
const moduleCompareMenuRef = ref(null);
const companyModuleFilterMenuOpen = ref(false);
const companyModuleFilterMenuGroup = ref('');
const companyModuleFilterMenuRef = ref(null);
const companyMrrFilterMenuOpen = ref(false);
const companyMrrFilterMenuGroup = ref('');
const companyMrrFilterMenuRef = ref(null);
const companyModuleChartCompanyId = ref('');
const companyModuleChartCompanyMenuOpen = ref(false);
const companyModuleChartCompanyMenuRef = ref(null);
const companyModuleChartRef = ref(null);
const companyModuleChartHoverIndex = ref(-1);
const comparisonEnabled = ref(getStoredComparisonEnabled());
const themeMode = ref(getStoredThemeMode());
applyThemeMode(themeMode.value);
const selectedGroups = ref([]);
const selectedEmployees = ref([]);
const activeSettingsSection = ref(getStoredSettingsSection());
const otherMenuOpen = ref(otherTabKeys.includes(activeTab.value));
const dashboard = reactive({ summary: {}, employeeStats: [], chatStats: [], openRequests: [], analytics: {} });
const groups = ref([]);
const privates = ref([]);
const employees = ref([]);
const clickupTasks = ref([]);
const companyInfo = ref({ summary: {}, companies: [], fetched_at: '', source: '' });
const companyModuleReports = ref({ companies: [], report_dates: [], period: 'all' });
const companyModuleChartSource = ref({ period: 'week', daily_companies: [], report_dates: [] });
const companyModuleReportsPrevious = ref({ companies: [], report_dates: [], period: '' });
const companyModuleCompareEnabled = ref(false);
const requestRows = ref([]);
const periodTicketRows = ref([]);
const ticketList = ref({ rows: [], active: 'all', mode: 'all', source: 'all', title: 'Ticketlar ro‘yxati' });
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
const chatDetailFocusedMessageId = ref('');
const employeeProfileThreadRef = ref(null);
const companyGroupThreadRef = ref(null);
const employeeDrilldown = ref(null);
const employeeActivity = ref({ employee: null, summary: {}, groups: [], closed_requests: [], messages: [] });
const employeeCompanyDetail = ref({ employee: null, summary: {}, companies: [] });
const employeeProfile = ref({ employee: null, rank: null, summary: {}, groups: [], companies: [] });
const employeeManagerDetailsOpen = ref(false);
const employeeProfileTab = ref('private');
const employeeProfileSelectedChatKey = ref('');
const employeeProfileChatDetail = ref({ chat: null, requests: [], conversation: [] });
const employeeProfileChatLoading = ref(false);
const employeeProfileChatError = ref('');
const employeeProfileTicketsOpen = ref(false);
const metricDetail = ref({ title: '', columns: [], rows: [], empty: 'Ma’lumot yo‘q', pageSize: 12, summary: [], source: 'all', showSourceTabs: true });
const employeeGroupActivity = ref([]);
const employeeGroupTicketVisibility = ref({});
const employeeOpenRequests = ref([]);
const companyGroupDetail = ref({ company: null, summary: {}, groups: [] });
const companyModuleEmployeeDetail = ref(null);
const companyGroupSelectedChatKey = ref('');
const companyGroupTicketsOpen = ref(false);
const employeeAvatarUrls = ref({});
const employeeAvatarLoading = ref({});
const chatAvatarUrls = ref({});
const chatAvatarLoading = ref({});
const mediaUrls = ref({});
const mediaLoading = ref({});
const mediaErrors = ref({});
let mediaLoadToken = 0;
let dashboardLoadToken = 0;
let periodOpenTicketsLoadToken = 0;
let companyModuleReportsLoadToken = 0;
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
let companyActivitySyncTimer = null;
let telegramAutoSyncBusy = false;
let modalScrollY = 0;
let activeTooltipTarget = null;
const floatingTooltip = ref({ visible: false, text: '', x: 0, y: 0, placement: 'top' });
const floatingTooltipStyle = computed(() => ({
  left: `${floatingTooltip.value.x}px`,
  top: `${floatingTooltip.value.y}px`,
  transform: floatingTooltip.value.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
}));

const settingsForm = reactive({ ai_mode: 'false', auto_reply: 'true', message_reactions: 'true', ticket_notifications: 'false', ticket_group_id: '', ticket_topic_id: '', done_tag: '#done', main_group_id: '', group_message_audit: 'main_group', group_message_audit_channel_id: '', request_detection: 'keyword' });
const isManagerMode = computed(() => false);
const mainTabs = computed(() => tabs.filter(tab => mainTabKeys.includes(tab.key)));
const otherTabs = computed(() => tabs.filter(tab => otherTabKeys.includes(tab.key) && (tab.key !== 'clickup' || clickUpIntegrationReady.value)));
const isOtherTabActive = computed(() => otherTabKeys.includes(activeTab.value));
const settingsTab = tabs.find(tab => tab.key === 'settings');
watch(activeTab, key => {
  actionMenuOpen.value = false;
  rankingMenuOpen.value = false;
  moduleCompareMenuOpen.value = false;
  if (otherTabKeys.includes(key)) otherMenuOpen.value = true;
});

watch(activeSettingsSection, key => {
  storeSettingsSection(key);
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
const employeeForm = reactive({ id: '', tg_user_id: '', full_name: '', username: '', phone: '', role: 'support', clickup_user_id: '', is_active: true, company_id: '' });
const adminForm = reactive({ username: 'admin', full_name: 'Tizim admini', new_password: '' });
const integrationForm = reactive({
  enabled: true,
  provider: 'openai_compatible',
  label: 'Uyqur AI',
  team: '',
  key_alias: '',
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
const clickupForm = reactive({
  enabled: false,
  api_token: '',
  has_api_token: false,
  newbies_list_id: '',
  big_team_list_id: '',
  newbies_chat_id: '',
  big_team_chat_id: '',
  done_status: 'complete',
  last_check_status: '',
  last_checked_at: '',
  last_check_error: ''
});
const savedClickUpSignature = ref('');

const current = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0]);
const currentTitle = computed(() => current.value.label);
const settingsSections = [
  { key: 'bot', label: 'Bot sozlamalari', icon: '⚙️', note: 'AI, audit va so‘rov aniqlash' },
  { key: 'integrations', label: 'Integratsiya', icon: '🔌', note: 'AI, ClickUp va loglar' },
  { key: 'telegram', label: 'Telegram ulanishi', icon: '🔗', note: 'Webhook va sinxronlash' },
  { key: 'admin', label: 'Admin profili', icon: '👤', note: 'Login va parol' }
];
const userInitials = computed(() => {
  const source = adminForm.full_name || adminForm.username || 'Uyqur';
  return String(source).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'UQ';
});
const loginFeedback = computed(() => loginError.value || loginStatus.value);
const loginButtonText = computed(() => loadingAction.value === 'login' ? 'Tekshirilmoqda...' : 'Kirish');
function aiConnectionSignature(source = {}) {
  return [
    source.enabled !== false,
    source.provider || 'openai_compatible',
    source.team || '',
    source.key_alias || '',
    source.base_url || '',
    source.model || '',
    Boolean(source.has_api_key)
  ].join('|');
}

function clickUpConnectionSignature(source = {}) {
  return [
    source.enabled === true,
    source.newbies_list_id || '',
    source.big_team_list_id || '',
    source.newbies_chat_id || '',
    source.big_team_chat_id || '',
    source.done_status || 'complete',
    Boolean(source.has_api_token)
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
  ? `${integrationForm.key_alias || integrationForm.label || integrationForm.model} modeli`
  : 'AI modeli tekshirilmagan');
const aiIntegrationStatus = computed(() => {
  if (!integrationForm.enabled) return 'O‘chiq';
  if (aiIntegrationReady.value) return 'Ulangan va tekshirildi';
  if (aiIntegrationHasError.value) return 'Ulanmadi';
  if (aiIntegrationDirty.value) return 'Qayta tekshirish kerak';
  if (integrationForm.last_check_status === 'incomplete') return 'Token yoki model kerak';
  return 'Tekshirilmagan';
});

const clickUpIntegrationDirty = computed(() => Boolean(
  clickupForm.api_token
  || (savedClickUpSignature.value && clickUpConnectionSignature(clickupForm) !== savedClickUpSignature.value)
));
const clickUpIntegrationReady = computed(() => !!(
  clickupForm.enabled
  && clickupForm.newbies_list_id
  && clickupForm.big_team_list_id
  && (clickupForm.api_token || clickupForm.has_api_token)
  && clickupForm.last_check_status === 'ok'
  && !clickUpIntegrationDirty.value
));
const clickUpIntegrationHasError = computed(() => clickupForm.last_check_status === 'failed' || Boolean(clickupForm.last_check_error));
const clickUpIntegrationStatus = computed(() => {
  if (clickUpIntegrationDirty.value) return 'Tekshirish kerak';
  if (clickUpIntegrationReady.value) return 'Ulangan';
  if (clickupForm.enabled && clickupForm.last_check_status === 'incomplete') return 'To‘liq emas';
  if (clickUpIntegrationHasError.value) return 'Xato';
  if (clickupForm.enabled) return 'Kutilmoqda';
  return 'O‘chirilgan';
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
  overdue_open_requests: 0,
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
  const currentRange = String(currentPeriodDates.value?.current || '').trim();
  if (currentRange) return currentRange;
  return periodOptions.find(period => period.key === selectedStatsPeriod.value)?.label || '7 kun';
});
function computePeriodTicketStats(rows = []) {
  const openRows = rows.filter(row => isOpenTicketStatus(row.status));
  const closedRows = rows.filter(row => isClosedLikeTicketStatus(row.status));
  const handledTotal = openRows.length + closedRows.length;
  return {
    total_requests: rows.length,
    open_requests: openRows.length,
    closed_requests: closedRows.length,
    close_rate: handledTotal ? Math.round((closedRows.length / handledTotal) * 1000) / 10 : 0,
    overdue_open_requests: openRows.filter(row => openMinutes(row.created_at) > 30).length
  };
}

const periodTicketStats = computed(() => computePeriodTicketStats(periodTicketRows.value || []));

const selectedPeriodStats = computed(() => {
  if (!analyticsMatchesSelectedPeriod()) return emptyPeriodStats;
  const base = analytics.value.periods?.[selectedStatsPeriod.value] || emptyPeriodStats;
  if (!periodTicketRows.value.length) return base;
  return {
    ...base,
    ...periodTicketStats.value
  };
});
const topEmployeeRows = computed(() => (analytics.value.employeePerformance?.[selectedStatsPeriod.value] || [])
  .filter(row => !row.is_unassigned && !isUnassignedRankingRow(row)));
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
function analyticsMatchesSelectedPeriod() {
  const focusedPeriod = String(analytics.value.focused_period || '').trim();
  if (!focusedPeriod) return true;
  return focusedPeriod === selectedStatsPeriod.value;
}

function filterTicketTrendRowsForSelectedPeriod(rows = []) {
  const period = selectedStatsPeriod.value;
  if (period === 'all') return rows;
  if (period === 'today') {
    const todayKey = tashkentDateKey(new Date());
    return rows.filter(row => row.date_key === todayKey);
  }
  if (period === 'week') {
    const todayKey = tashkentDateKey(new Date());
    const weekStart = addDaysToDateKey(todayKey, -6);
    return rows.filter(row => row.date_key >= weekStart && row.date_key <= todayKey);
  }
  if (period === 'month') {
    const todayKey = tashkentDateKey(new Date());
    const monthStart = addDaysToDateKey(todayKey, -29);
    return rows.filter(row => row.date_key >= monthStart && row.date_key <= todayKey);
  }
  if (period === 'custom') {
    const startKey = normalizeDateKey(customPeriodForm.appliedStart);
    const endKey = normalizeDateKey(customPeriodForm.appliedEnd);
    if (!startKey || !endKey) return rows;
    return rows.filter(row => row.date_key >= startKey && row.date_key <= endKey);
  }
  return rows;
}

const ticketTrendRows = computed(() => {
  if (!analyticsMatchesSelectedPeriod()) {
    return buildTicketTrendFallbackRows(selectedStatsPeriod.value);
  }
  const mappedRows = (analytics.value.ticketAnswerTrend?.[selectedStatsPeriod.value] || [])
    .map(row => ({
      date_key: row.date_key || row.date || row.label,
      date_label: row.date_label || row.date || '—',
      weekday_label: row.weekday_label || row.weekday || '—',
      total_requests: Number(row.total_requests || 0),
      closed_requests: Number(row.closed_requests || 0),
      open_requests: Number(row.open_requests || 0),
      sla: Number(row.sla || row.close_rate || 0)
    }))
    .filter(row => row.date_key);
  const rows = mappedRows.length
    ? filterTicketTrendRowsForSelectedPeriod(mappedRows)
    : buildTicketTrendFallbackRows(selectedStatsPeriod.value);
  if (!rows.length) return rows;
  return rows.filter(row => selectedStatsPeriod.value !== 'month' || row.total_requests || row.closed_requests || row.open_requests);
});
const ticketTrendMax = computed(() => Math.max(1, ...ticketTrendRows.value.map(row => Math.max(
  Number(row.total_requests || 0),
  Number(row.closed_requests || 0),
  Number(row.open_requests || 0)
))));
const companyTicketRows = computed(() => {
  if (!analyticsMatchesSelectedPeriod()) return [];
  const rows = (analytics.value.companyTickets?.[selectedStatsPeriod.value] || [])
    .map(normalizeCompanyTicketRow)
    .filter(row => Number(row.total_requests || 0) > 0);
  return rows.sort((a, b) => {
    if (a.is_unassigned) return 1;
    if (b.is_unassigned) return -1;
    return b.total_requests - a.total_requests
      || b.closed_requests - a.closed_requests
      || String(a.name || '').localeCompare(String(b.name || ''));
  });
});
const companyTicketTotals = computed(() => companyTicketRows.value.reduce((totals, row) => ({
  total: totals.total + Number(row.total_requests || 0),
  closed: totals.closed + Number(row.closed_requests || 0),
  open: totals.open + Number(row.open_requests || 0)
}), { total: 0, closed: 0, open: 0 }));
const companyTicketMax = computed(() => Math.max(1, ...companyTicketRows.value.map(row => Number(row.total_requests || 0))));
const supportPeriodAvgCloseMinutes = computed(() => Number(selectedPeriodStats.value.avg_close_minutes || 0));
const supportSummaryCards = computed(() => {
  const stats = selectedPeriodStats.value;
  const previousLabel = currentPeriodDates.value.prev || 'oldingi davr';
  const attachPreviousLabel = comparison => comparison ? {
    ...comparison,
    title: `${previousLabel} bilan taqqoslash: ${comparison.text}`
  } : null;
  const cards = [
    {
      key: 'requests',
      title: selectedStatsPeriod.value === 'today' ? 'Bugungi so‘rovlar' : `${selectedPeriodLabel.value} so‘rovlar`,
      value: fmtNumber(stats.total_requests),
      note: `${fmtNumber(stats.unique_customers)} ta mijozdan kelgan`,
      comparison: attachPreviousLabel(compareValue(stats.total_requests, stats.prev_total_requests, { unit: 'ta' })),
      icon: '🎫',
      action: 'requests'
    },
    {
      key: 'closed',
      title: 'Javob berilgan',
      value: fmtNumber(stats.closed_requests),
      note: `${fmtPercent(stats.close_rate)} so‘rov yopilgan`,
      comparison: attachPreviousLabel(compareValue(stats.closed_requests, stats.prev_closed_requests, { unit: 'ta' })),
      icon: '✅',
      action: 'closed'
    },
    {
      key: 'open',
      title: 'Javobsiz',
      value: fmtNumber(stats.open_requests),
      note: `${fmtNumber(stats.overdue_open_requests)} tasi 30 daqiqadan oshgan`,
      comparison: attachPreviousLabel(compareValue(stats.open_requests, stats.prev_open_requests, { invert: true, unit: 'ta' })),
      icon: '⚠️',
      tone: 'danger',
      action: 'open'
    },
    {
      key: 'avg',
      title: 'O‘rtacha javob',
      value: fmtMinutes(supportPeriodAvgCloseMinutes.value),
      note: `SLA: ${fmtPercent(stats.close_rate)}`,
      comparison: attachPreviousLabel(compareValue(supportPeriodAvgCloseMinutes.value, stats.prev_avg_close_minutes, { invert: true, unit: 'min' })),
      icon: '⏱️',
      action: 'avg'
    }
  ];

  return cards;
});
const topEmployeeChartRows = computed(() => topEmployeeRows.value.slice(0, 6));
const topEmployeeChartMax = computed(() => Math.max(1, ...topEmployeeChartRows.value.map(row => Number(row.closed_requests || 0))));
const groupChartRows = computed(() => groupPerformanceRows.value.slice(0, 6));
const groupChartMax = computed(() => Math.max(1, ...groupChartRows.value.map(row => Number(row.total_requests || 0))));
const managerStats = computed(() => dashboard.manager || {});
function buildTicketTrendFallbackRows(period = 'week') {
  const todayKey = tashkentDateKey(new Date());
  let dateKeys = [];
  if (period === 'today') {
    dateKeys = [todayKey];
  } else if (period === 'week') {
    dateKeys = [];
    let cursor = addDaysToDateKey(todayKey, -6);
    let guard = 0;
    while (cursor && cursor <= todayKey && guard < 7) {
      dateKeys.push(cursor);
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
  } else if (period === 'month') {
    dateKeys = [];
    let cursor = addDaysToDateKey(todayKey, -29);
    let guard = 0;
    while (cursor && cursor <= todayKey && guard < 31) {
      dateKeys.push(cursor);
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
  } else if (period === 'custom') {
    const startKey = normalizeDateKey(customPeriodForm.appliedStart);
    const endKey = normalizeDateKey(customPeriodForm.appliedEnd);
    if (!startKey || !endKey) return [];
    let cursor = startKey <= endKey ? startKey : endKey;
    const lastKey = startKey <= endKey ? endKey : startKey;
    let guard = 0;
    while (cursor && cursor <= lastKey && guard < 62) {
      dateKeys.push(cursor);
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
  }
  return dateKeys.map(dateKey => ({
    date_key: dateKey,
    date_label: dateKey.split('-').slice(1).reverse().join('.') + '.' + dateKey.slice(0, 4),
    weekday_label: '—',
    total_requests: 0,
    closed_requests: 0,
    open_requests: 0,
    sla: 0
  }));
}

function isInSelectedPeriodDate(dateString) {
  if (!dateString) return false;
  const dateKey = tashkentDateKey(dateString);
  const period = selectedStatsPeriod.value;

  if (period === 'all') return true;
  if (period === 'today') {
    return dateKey === tashkentDateKey(new Date());
  }
  if (period === 'week') {
    const todayKey = tashkentDateKey(new Date());
    const weekStart = addDaysToDateKey(todayKey, -6);
    return dateKey >= weekStart && dateKey <= todayKey;
  }
  if (period === 'month') {
    const todayKey = tashkentDateKey(new Date());
    const monthStart = addDaysToDateKey(todayKey, -29);
    return dateKey >= monthStart && dateKey <= todayKey;
  }
  if (period === 'custom') {
    const startKey = normalizeDateKey(customPeriodForm.appliedStart);
    const endKey = normalizeDateKey(customPeriodForm.appliedEnd);
    if (!startKey || !endKey) return false;
    return dateKey >= startKey && dateKey <= endKey;
  }
  return true;
}

function tashkentDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function tashkentDateKey(value = new Date()) {
  const parts = tashkentDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return tashkentDateKey(date);
}

function normalizeDateKey(value = '') {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

const filteredOpenRequests = computed(() => (dashboard.openRequests || []).filter(request => isInSelectedPeriodDate(request.created_at)));
const rankingOpenRequests = computed(() => {
  const fromPeriod = periodTicketRows.value.filter(request => isOpenTicketStatus(request.status));
  if (fromPeriod.length) return fromPeriod;
  return filteredOpenRequests.value || [];
});

const managerOpenRequests = computed(() => (filteredOpenRequests.value || [])
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

function isSupportEmployee(row = {}) {
  return String(row.role || '').trim().toLowerCase() === 'support';
}

function isManagerEmployee(row = {}) {
  return String(row.role || '').trim().toLowerCase() === 'manager';
}

function isManagerPerformanceRow(row = {}) {
  return row.is_manager_group === true || isManagerEmployee(row);
}

function isUnassignedRankingRow(row = {}) {
  const name = String(row.full_name || row.name || '').trim().toLowerCase();
  return row.is_unassigned === true
    || row.key === 'unassigned:open'
    || name === 'biriktirilmagan';
}

function isUnassignedCompanyTicketRow(row = {}) {
  const name = String(row.name || row.company_name || '').trim().toLowerCase();
  return row.is_unassigned === true
    || row.company_id === '__unassigned__'
    || name === 'biriktirilmagan';
}

function shouldShowInSupportRanking(row = {}) {
  if (isUnassignedRankingRow(row)) return Number(row.open_requests || 0) > 0;
  if (row.is_manager_group === true) return true;
  if (isManagerEmployee(row)) return false;
  if (!isSupportEmployee(row)) return false;
  return Boolean(row.employee_id || row.id || row.tg_user_id || row.username);
}

function hasEmployeeActivity(row = {}) {
  const numericKeys = ['closed_requests', 'open_requests', 'handled_chats', 'total_requests', 'message_count', 'customer_count'];
  if (numericKeys.some(key => Number(row?.[key] || 0) > 0)) return true;
  if (Array.isArray(row?.groups) && row.groups.length) return true;
  if (Array.isArray(row?.messages) && row.messages.length) return true;
  if (Array.isArray(row?.chat_messages) && row.chat_messages.length) return true;
  if (Array.isArray(row?.closed_requests) && row.closed_requests.length) return true;
  if (Array.isArray(row?.open_requests) && row.open_requests.length) return true;
  return false;
}

function weightedAverageBy(rows = [], valueKey = 'avg_close_minutes', weightKey = 'closed_requests') {
  let totalWeight = 0;
  let totalValue = 0;
  rows.forEach(row => {
    const weight = Number(row[weightKey] || 0);
    const value = Number(row[valueKey] || 0);
    if (!weight || !Number.isFinite(value)) return;
    totalWeight += weight;
    totalValue += value * weight;
  });
  return totalWeight ? totalValue / totalWeight : 0;
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
  const weightedAvg = current._avg_weight
    ? Number(current._avg_total || 0) / Number(current._avg_weight)
    : 0;
  const avgCloseMinutes = source === 'period'
    ? Number(row.avg_close_minutes || weightedAvg || 0)
    : (weightedAvg || Number(row.avg_close_minutes || current.avg_close_minutes || 0));
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
    telegram_is_premium: current.telegram_is_premium === true || row.telegram_is_premium === true,
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
  const openSummaryMap = employeeOpenRequestSummaryMap();
  const periodStatsLookup = buildPerformanceStatsLookup(topEmployeeRows.value);
  const periodClosedLookup = periodClosedCountLookup();
  const periodTicketCounts = buildPeriodTicketCountsByEmployeeKey();
  const usePeriodTicketCounts = periodTicketRows.value.length > 0;

  // Faqat ma'lum bo'lgan xodimlarning kalitlarini yig'ib olamiz
  const knownEmployeeKeys = new Set([
    ...employees.value
      .filter(row => !isAdminLikeEmployee(row) && (isSupportEmployee(row) || isManagerEmployee(row)))
      .map(supportRowKey),
    ...topEmployeeRows.value
      .filter(row => Number(row.open_requests || 0) > 0 || Number(row.closed_requests || 0) > 0)
      .map(supportRowKey),
    ...visibleCompanyInfoRows.value.filter(hasCompanySupport).map(c =>
      supportRowKey({ username: c.uyqur_support_username, phone: c.uyqur_support_phone })
    )
  ].filter(Boolean));

  employees.value
    .filter(row => !isAdminLikeEmployee(row) && isSupportEmployee(row))
    .forEach(row => mergeSupportCandidate(merged, row, 'employee'));
  employees.value
    .filter(row => !isAdminLikeEmployee(row) && isManagerEmployee(row))
    .forEach(row => mergeSupportCandidate(merged, row, 'employee'));
  (dashboard.employeeStats || []).forEach(row => {
    if (isUnassignedRankingRow(row)) return;
    mergeSupportCandidate(merged, row, 'stats');
  });
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

  const candidateRows = [...merged.values()]
    .filter(row => !isAdminLikeEmployee(row) && !isUnassignedRankingRow(row))
    .map((row, index) => {
      const stat = employeeStatsMap.value.get(employeeLookupKey(row)) || row;
      const candidate = { ...row, ...stat };
      const rowKey = supportRowKey(candidate) || supportRowKey(row);
      const employeeRef = employees.value.find(item => supportRowKey(item) === rowKey) || null;
      const resolvedRole = row.role || stat.role || employeeRef?.role || '';
      const lookupKeys = [...new Set([
        ...employeePerformanceLookupKeys(candidate),
        ...employeePerformanceLookupKeys(row),
        ...employeePerformanceLookupKeys(stat)
      ])];
      const periodRow = resolvePerformanceStatsRow(periodStatsLookup, candidate)
        || resolvePerformanceStatsRow(periodStatsLookup, row)
        || resolvePerformanceStatsRow(periodStatsLookup, stat);
      const openSummary = lookupKeys.map(key => openSummaryMap.get(key)).find(Boolean) || null;
      lookupKeys.forEach(key => openSummaryMap.delete(key));
      const assignedCompanyCount = companyInfoRows.value.filter(company => companyMatchesEmployee(company, candidate)).length;

      const periodRowCounts = usePeriodTicketCounts ? periodTicketCounts.counts.get(rowKey) : null;
      const closedFallback = periodRow ? Number(periodRow.closed_requests || 0) : 0;
      const closedRaw = periodRowCounts
        ? Number(periodRowCounts.closed || 0)
        : resolvePeriodClosedCount(lookupKeys, closedFallback, periodClosedLookup);
      const openRaw = periodRowCounts
        ? Number(periodRowCounts.open || 0)
        : (openSummary ? Number(openSummary.open_requests || 0) : 0);
      const totalRaw = closedRaw + openRaw;
      const slaRaw = totalRaw > 0 ? (closedRaw / totalRaw) * 100 : 100;
      const avgRaw = periodRow ? Number(periodRow.avg_close_minutes || 0) : 0;
      const handledChatsRaw = Math.max(
        periodRow ? Number(periodRow.handled_chats || 0) : 0,
        openSummary?.chat_keys?.size || 0
      );

      const isManager = isManagerEmployee({ role: resolvedRole });
      const closed = closedRaw;
      const open = isManager ? 0 : openRaw;
      const total = isManager ? closedRaw : totalRaw;
      const sla = isManager ? (closedRaw > 0 ? 100 : 0) : slaRaw;
      const avg = avgRaw;
      const handledChats = handledChatsRaw;

      const grade = performanceGrade(sla, avg);
      return {
        key: rowKey || `${row.full_name || 'employee'}-${index}`,
        id: row.id || row.employee_id || stat.id || stat.employee_id || '',
        employee_id: row.employee_id || row.id || stat.employee_id || stat.id || '',
        tg_user_id: row.tg_user_id || stat.tg_user_id || '',
        username: row.username || stat.username || '',
        phone: row.phone || stat.phone || '',
        role: resolvedRole,
        full_name: row.full_name || stat.full_name || employeeRef?.full_name || 'Xodim',
        telegram_is_premium: row.telegram_is_premium === true || stat.telegram_is_premium === true,
        is_support_employee: isSupportEmployee({ role: resolvedRole }),
        handled_chats: handledChats,
        closed_requests: closed,
        open_requests: open,
        total_requests: total,
        company_total: assignedCompanyCount,
        assigned_company_count: assignedCompanyCount,
        period_company_total: periodRow ? Number(periodRow.company_total || 0) : 0,
        avg_close_minutes: avg,
        close_rate: sla,
        sla,
        prev_closed_requests: periodRow ? Number(periodRow.prev_closed_requests || 0) : 0,
        prev_open_requests: isManager ? 0 : (periodRow ? Number(periodRow.prev_open_requests || 0) : 0),
        prev_company_total: periodRow ? Number(periodRow.prev_company_total || 0) : 0,
        prev_avg_close_minutes: periodRow ? Number(periodRow.prev_avg_close_minutes || 0) : 0,
        prev_close_rate: isManager ? (Number(periodRow?.prev_closed_requests || 0) > 0 ? 100 : 0) : (periodRow ? Number(periodRow.prev_close_rate || 0) : 0),
        grade
      };
    });

  const rows = candidateRows
    .filter(row => shouldShowInSupportRanking(row) && knownEmployeeKeys.has(supportRowKey(row)));

  openSummaryMap.forEach(summary => {
    if (isUnassignedRankingRow(summary)) return;
    const summarySupportKey = supportRowKey(summary);
    if (summarySupportKey && !knownEmployeeKeys.has(summarySupportKey)) return;
    if (!isSupportEmployee(summary)) return;
    rows.push({
      key: summary.key,
      id: summary.employee_id || '',
      employee_id: summary.employee_id || '',
      tg_user_id: '',
      username: summary.username || '',
      phone: '',
      role: 'support',
      full_name: summary.full_name || 'Xodim',
      telegram_is_premium: false,
      is_support_employee: true,
      is_unassigned: false,
      handled_chats: summary.chat_keys?.size || 0,
      closed_requests: 0,
      open_requests: Number(summary.open_requests || 0),
      total_requests: Number(summary.open_requests || 0),
      company_total: 0,
      assigned_company_count: 0,
      avg_close_minutes: 0,
      close_rate: 0,
      sla: 0,
      prev_closed_requests: 0,
      prev_open_requests: 0,
      prev_avg_close_minutes: 0,
      prev_close_rate: 0,
      grade: performanceGrade(0, 0)
    });
  });

  const registeredManagers = employees.value.filter(row => !isAdminLikeEmployee(row) && isManagerEmployee(row));
  const managerStatsByKey = new Map(
    candidateRows.filter(isManagerEmployee).map(row => [supportRowKey(row), row])
  );
  const allManagerRows = registeredManagers.map(manager => {
    const stats = managerStatsByKey.get(supportRowKey(manager)) || {};
    const managerKeys = employeePerformanceLookupKeys({ ...manager, ...stats });
    const closedFromPeriod = resolvePeriodClosedCount(
      managerKeys,
      Number(stats.closed_requests || 0),
      periodClosedLookup
    );
    return {
      ...manager,
      ...stats,
      role: 'manager',
      closed_requests: closedFromPeriod,
      open_requests: 0,
      prev_open_requests: 0
    };
  });
  const unassignedOpen = usePeriodTicketCounts
    ? Number(periodTicketCounts.unassigned.open || 0)
    : Number(openSummaryMap.get('unassigned:open')?.open_requests || 0);
  if (unassignedOpen > 0) {
    rows.push({
      key: 'unassigned:open',
      id: '',
      employee_id: '',
      tg_user_id: '',
      username: '',
      phone: '',
      role: 'support',
      full_name: 'Biriktirilmagan',
      telegram_is_premium: false,
      is_support_employee: false,
      is_unassigned: true,
      handled_chats: openSummaryMap.get('unassigned:open')?.chat_keys?.size || 0,
      closed_requests: usePeriodTicketCounts ? Number(periodTicketCounts.unassigned.closed || 0) : 0,
      open_requests: unassignedOpen,
      total_requests: unassignedOpen + (usePeriodTicketCounts ? Number(periodTicketCounts.unassigned.closed || 0) : 0),
      company_total: 0,
      assigned_company_count: 0,
      avg_close_minutes: 0,
      close_rate: 0,
      sla: 0,
      prev_closed_requests: 0,
      prev_open_requests: 0,
      prev_avg_close_minutes: 0,
      prev_close_rate: 0,
      grade: performanceGrade(0, 0)
    });
  }

  if (allManagerRows.length) {
    const closedRequests = usePeriodTicketCounts
      ? Number(periodTicketCounts.managerClosed || 0)
      : allManagerRows.reduce((sum, row) => sum + Number(row.closed_requests || 0), 0);
    const openRequests = 0;
    const totalRequests = closedRequests;
    const managerSla = closedRequests > 0 ? 100 : 0;
    const prevClosedRequests = allManagerRows.reduce((sum, row) => sum + Number(row.prev_closed_requests || 0), 0);
    rows.push({
      key: 'manager:all',
      id: '',
      employee_id: '',
      tg_user_id: '',
      username: '',
      phone: '',
      role: 'manager',
      full_name: 'Barcha menejerlar',
      telegram_is_premium: false,
      is_support_employee: false,
      is_manager_group: true,
      handled_chats: allManagerRows.reduce((sum, row) => sum + Number(row.handled_chats || 0), 0),
      closed_requests: closedRequests,
      open_requests: openRequests,
      total_requests: totalRequests,
      assigned_company_count: allManagerRows.length,
      company_total: allManagerRows.length,
      avg_close_minutes: weightedAverageBy(allManagerRows, 'avg_close_minutes', 'closed_requests'),
      close_rate: managerSla,
      sla: managerSla,
      prev_closed_requests: prevClosedRequests,
      prev_open_requests: 0,
      prev_avg_close_minutes: weightedAverageBy(allManagerRows, 'prev_avg_close_minutes', 'prev_closed_requests'),
      prev_close_rate: prevClosedRequests > 0 ? 100 : 0,
      grade: performanceGrade(
        managerSla,
        weightedAverageBy(allManagerRows, 'avg_close_minutes', 'closed_requests')
      )
    });
  }

  return rows
    .filter(shouldShowInSupportRanking)
    .sort((a, b) => b.closed_requests - a.closed_requests
      || b.open_requests - a.open_requests
      || b.assigned_company_count - a.assigned_company_count
      || a.full_name.localeCompare(b.full_name));
});
const filteredMetricDetailRows = computed(() => {
  const rows = Array.isArray(metricDetail.value.rows) ? metricDetail.value.rows : [];
  return rows.filter(row => {
    const source = metricDetail.value.source;
    if (source === 'all') return true;
    const type = String(row.source_type || row.chat_source_type || '').toLowerCase();
    if (source === 'group') return type === 'group';
    if (source === 'private') return type === 'private' || type === 'personal' || type === 'business';
    return true;
  });
});

// Top hodim faqat Uyqur xodimlaridan tanlanadi
const topPerformer = computed(() => supportPerformanceRows.value.find(row => row.is_support_employee && !row.is_manager_group) || null);
const topPerformerName = computed(() => topPerformer.value?.full_name || '');
const currentPeriodDates = computed(() => analytics.value.periodDates?.[selectedStatsPeriod.value] || { current: '', prev: '' });
const openRequestsTitle = computed(() => `Ochiq so‘rovlar (${fmtNumber((filteredOpenRequests.value || []).length)})`);
const unansweredAlerts = computed(() => {
  const grouped = new Map();
  (filteredOpenRequests.value || []).forEach((request, index) => {
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
const overdueOpenRequestsTotal = computed(() => filteredOpenRequests.value
  .filter(request => openMinutes(request.created_at) > 30).length);
const loadingText = computed(() => ({
  login: 'Kirilmoqda...',
  refresh: 'Yangilanmoqda...',
  tab: 'Yuklanmoqda...',
  sendSingle: 'Yuborilmoqda...',
  broadcast: 'Yuborilmoqda...',
  saveEmployee: 'Saqlamoqda...',
  deleteGroup: 'O‘chirilmoqda...',
  deleteEmployee: 'Xodim o‘chirilmoqda...',
  employeeSend: 'Yuborilmoqda...',
  selectedSend: 'Yuborilmoqda...',
  assignCompany: 'Kompaniya biriktirilmoqda...',
  chatDetail: 'Chat tafsiloti yuklanmoqda...',
  replyRequest: 'Javob yuborilmoqda...',
  saveAdmin: 'Saqlamoqda...',
  mainStats: 'Yuborilmoqda...',
  auditStats: 'Audit statistikasi yuborilmoqda...',
  webhookInfo: 'Tekshirilmoqda...',
  webhookConnect: 'Ulanmoqda...',
  webhookSync: 'Telegram yangilanishlari olinmoqda...',
  employeeActivity: 'Xodim faoliyati yuklanmoqda...',
  saveSettings: 'Saqlamoqda...',
  saveIntegration: 'Saqlamoqda...',
  saveClickUpIntegration: 'ClickUp tekshirilmoqda...',
  disconnectClickUp: 'ClickUp uzilmoqda...',
  clickupTask: 'ClickUp yangilanmoqda...',
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
  if (moduleCompareMenuOpen.value) {
    const root = moduleCompareMenuRef.value;
    if (!root || !root.contains(event.target)) moduleCompareMenuOpen.value = false;
  }
  if (companyModuleFilterMenuOpen.value) {
    const root = companyModuleFilterMenuRef.value;
    if (!root || !root.contains(event.target)) closeCompanyModuleFilterMenu();
  }
  if (companyMrrFilterMenuOpen.value) {
    const root = companyMrrFilterMenuRef.value;
    if (!root || !root.contains(event.target)) closeCompanyMrrFilterMenu();
  }
  if (companyModuleChartCompanyMenuOpen.value) {
    const root = companyModuleChartCompanyMenuRef.value;
    if (!root || !root.contains(event.target)) closeCompanyModuleChartCompanyMenu();
  }
  if (companyMrrScatterSelectedPointId.value) {
    const root = companyMrrScatterChartRef.value;
    if (!root || !root.contains(event.target)) closeCompanyMrrScatterTooltip();
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    actionMenuOpen.value = false;
    rankingMenuOpen.value = false;
    moduleCompareMenuOpen.value = false;
    closeCompanyModuleFilterMenu();
    closeCompanyMrrFilterMenu();
    closeCompanyModuleChartCompanyMenu();
    closeCompanyMrrScatterTooltip();
    hideFloatingTooltip();
    if (modal.value) closeModal();
  }
}

function tooltipTargetFromEventTarget(target) {
  return target && typeof target.closest === 'function' ? target.closest('[data-tooltip]') : null;
}

function positionFloatingTooltip(target) {
  if (!target || typeof window === 'undefined') return;
  const text = String(target.getAttribute('data-tooltip') || '').trim();
  if (!text) return hideFloatingTooltip();

  const rect = target.getBoundingClientRect();
  const maxWidth = Math.min(380, Math.max(260, window.innerWidth - 24));
  const half = maxWidth / 2;
  const center = rect.left + rect.width / 2;
  const x = Math.min(Math.max(center, half + 12), window.innerWidth - half - 12);
  const hasTopSpace = rect.top > 96;
  floatingTooltip.value = {
    visible: true,
    text,
    x,
    y: hasTopSpace ? rect.top - 10 : rect.bottom + 10,
    placement: hasTopSpace ? 'top' : 'bottom'
  };
}

function showFloatingTooltip(target) {
  activeTooltipTarget = target;
  positionFloatingTooltip(target);
}

function hideFloatingTooltip() {
  activeTooltipTarget = null;
  floatingTooltip.value = { ...floatingTooltip.value, visible: false };
}

function handleDocumentTooltipOver(event) {
  const target = tooltipTargetFromEventTarget(event.target);
  if (target) showFloatingTooltip(target);
}

function handleDocumentTooltipMove() {
  if (activeTooltipTarget) positionFloatingTooltip(activeTooltipTarget);
}

function handleDocumentTooltipOut(event) {
  if (!activeTooltipTarget) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget && activeTooltipTarget.contains(nextTarget)) return;
  hideFloatingTooltip();
}

function handleDocumentTooltipFocusIn(event) {
  const target = tooltipTargetFromEventTarget(event.target);
  if (target) showFloatingTooltip(target);
}

function handleDocumentTooltipFocusOut() {
  hideFloatingTooltip();
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

function isEmployeePremium(row = {}) {
  row = row || {};
  return row.telegram_is_premium === true || row.telegram_premium === true || row.is_premium === true;
}

function employeePremiumTooltip(row = {}) {
  return isEmployeePremium(row) ? 'Telegram Premium' : '';
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

function ticketTrendSegmentHeight(part, total) {
  const segment = Number(part || 0);
  const whole = Number(total || 0);
  if (!segment || !whole) return '0%';
  return `${Math.max(0, Math.min(100, (segment / whole) * 100))}%`;
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

function slaClass(value = 0) {
  return slaToneClass(value);
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

function ticketTrendBarTooltip(row = {}) {
  return [
    row.date_label,
    `Javob berildi: ${fmtNumber(row.closed_requests)}`,
    `Javobsiz: ${fmtNumber(row.open_requests)}`
  ].join('\n');
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

function smoothLinePath(points = []) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} C ${points[0].x} ${points[0].y}, ${points[1].x} ${points[1].y}, ${points[1].x} ${points[1].y}`;
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - current.x) / 6;
    const cp2y = next.y - (after.y - current.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return path;
}

function moduleChartYMax(value = 0) {
  const numeric = Math.max(1, Number(value || 0));
  const step = numeric <= 50 ? 5 : 10;
  return Math.ceil(numeric / step) * step;
}

function moduleChartYTicks(max = 1, dims = COMPANY_MODULE_CHART_DIMS, stepOverride = 0) {
  const maximum = moduleChartYMax(max);
  const step = stepOverride || (maximum <= 50 ? 5 : 10);
  const count = Math.floor(maximum / step) + 1;
  const height = dims.bottom - dims.top;
  return Array.from({ length: count }, (_, index) => {
    const value = maximum - step * index;
    const y = dims.top + (height / Math.max(count - 1, 1)) * index;
    return { value, y: Math.round(y * 10) / 10 };
  });
}

function moduleChartYTicksRange(min = 0, max = 100, dims = COMPANY_MODULE_CHART_DIMS, stepOverride = 0) {
  const minimum = Number(min || 0);
  const maximum = Number(max || minimum + 1);
  const span = Math.max(maximum - minimum, 1);
  const step = stepOverride || (span <= 24 ? 5 : span <= 50 ? 10 : 20);
  const count = Math.floor(span / step) + 1;
  const height = dims.bottom - dims.top;
  return Array.from({ length: count }, (_, index) => {
    const value = maximum - step * index;
    const y = dims.top + (height / Math.max(count - 1, 1)) * index;
    return { value: Math.round(value * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

function companyModuleChartPlotY(value = 0, minimum = 0, maximum = 1, dims = COMPANY_MODULE_CHART_DIMS) {
  const height = dims.bottom - dims.top;
  const span = Math.max(maximum - minimum, 1);
  const normalized = (Number(value || 0) - minimum) / span;
  return Math.round((dims.bottom - normalized * height) * 10) / 10;
}

function buildCompanyModuleChartYRange(metric = 'activity', rows = [], visibleKeys = [], showAverage = true) {
  let min = Infinity;
  let max = -Infinity;
  rows.forEach(row => {
    visibleKeys.forEach(key => {
      const value = companyModuleChartMetricValue(row, key, metric);
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    if (showAverage) {
      const value = metric === 'activity'
        ? Number(row.avgActivity || 0)
        : companyModuleChartAverageForRow(row, metric, visibleKeys);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return metric === 'activity' ? { min: 0, max: 100 } : { min: 0, max: 5 };
  }
  if (min === max) {
    const pad = metric === 'activity' ? 8 : 2;
    return {
      min: Math.max(0, min - pad),
      max: metric === 'activity' ? Math.min(100, max + pad) : max + pad
    };
  }
  const span = max - min;
  const pad = metric === 'activity'
    ? Math.max(5, Math.round((span * 0.18) / 5) * 5)
    : Math.max(1, Math.ceil(span * 0.18));
  let rangeMin = metric === 'activity'
    ? Math.max(0, Math.floor((min - pad) / 5) * 5)
    : Math.max(0, Math.floor(min - pad));
  let rangeMax = metric === 'activity'
    ? Math.min(100, Math.ceil((max + pad) / 5) * 5)
    : moduleChartYMax(max + pad);
  const minSpan = metric === 'activity' ? 20 : 4;
  if (rangeMax - rangeMin < minSpan) {
    const extra = minSpan - (rangeMax - rangeMin);
    rangeMin = Math.max(0, rangeMin - Math.ceil(extra / 2));
    rangeMax = metric === 'activity' ? Math.min(100, rangeMax + Math.floor(extra / 2)) : rangeMax + extra;
  }
  return { min: rangeMin, max: rangeMax };
}

function companyModuleChartMonthKey(dateKey = '') {
  return String(dateKey || '').slice(0, 7);
}

function companyModuleChartMonthLabel(monthKey = '') {
  const [, month] = String(monthKey || '').split('-').map(Number);
  const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  return months[month - 1] || monthKey;
}

function aggregateCompanyModuleChartMonths(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    const monthKey = companyModuleChartMonthKey(row.date_key);
    const current = map.get(monthKey);
    if (!current || String(row.date_key) > String(current.date_key)) {
      map.set(monthKey, {
        date_key: row.date_key,
        date_label: companyModuleChartMonthLabel(monthKey),
        counts: { ...(row.counts || {}) },
        percents: { ...(row.percents || {}) },
        avgActivity: Number(row.avgActivity || 0),
        totalCompanies: Number(row.totalCompanies || 0)
      });
    }
  });
  return [...map.values()].sort((a, b) => String(a.date_key).localeCompare(String(b.date_key)));
}

function finalizeCompanyModuleChartRows(rows = []) {
  if (rows.length <= 31) return rows;
  const months = new Set(rows.map(row => companyModuleChartMonthKey(row.date_key)));
  if (months.size < 2) return rows;
  return aggregateCompanyModuleChartMonths(rows);
}

function companyModuleChartDateLabel(dateKey = '', total = 0) {
  const key = String(dateKey || '').trim();
  if (!key) return '—';
  const [, month, day] = key.split('-').map(Number);
  const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  if (!month) return key;
  if (key.length === 7) return months[month - 1] || key;
  return `${String(day || '').padStart(2, '0')}.${String(month).padStart(2, '0')}`;
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

function compareValue(current, previous, options = {}) {
  const { invert = false, isPercentage = false, unit = '' } = options;
  const curr = Number(current || 0);
  const prev = Number(previous || 0);

  const diff = curr - prev;
  const diffAbs = Math.abs(diff);
  const arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '');

  const diffFormatted = diff > 0 ? `+${fmtNumber(diffAbs)}` : (diff < 0 ? `-${fmtNumber(diffAbs)}` : '0');
  const diffWithUnit = unit ? `${diffFormatted} ${unit}` : diffFormatted;

  let tone = 'neutral';
  if (diff > 0) tone = invert ? 'bad' : 'good';
  else if (diff < 0) tone = invert ? 'good' : 'bad';

  if (isPercentage) {
    const pDiff = Math.abs(Math.round(diff));
    const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
    return {
      text: `${arrow} ${sign}${pDiff}%`,
      diff: diffWithUnit,
      percentText: `${sign}${pDiff}%`,
      tone
    };
  }

  if (curr === prev) {
    return {
      text: 'o‘zgarish yo‘q',
      diff: unit ? `0 ${unit}` : '0',
      percentText: '0%',
      tone: 'neutral'
    };
  }

  if (prev === 0) {
    return {
      text: `${arrow} ${diffWithUnit}`,
      diff: diffWithUnit,
      percentText: diff > 0 ? '+100%' : '-100%',
      tone
    };
  }

  const percent = Math.round((diffAbs / prev) * 100);
  const sign = diff > 0 ? '+' : '-';
  return {
    text: `${arrow} ${sign}${percent}% (${diffWithUnit})`,
    diff: diffWithUnit,
    percent: percent,
    percentText: `${sign}${percent}%`,
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

function isOpenTicketStatus(status = '') {
  return String(status || '').trim().toLowerCase() === 'open';
}

function isClosedLikeTicketStatus(status = '') {
  return ['closed', 'cancelled'].includes(String(status || '').trim().toLowerCase());
}

function statusLabel(value) {
  return ({
    open: 'Ochiq',
    closed: 'Yopilgan',
    cancelled: 'Bekor qilingan',
    pending: 'Kutilmoqda'
  }[String(value || '').toLowerCase()] || value || '—');
}

function isReactionClosedRequest(request = {}, message = {}) {
  if (String(request?.status || '').toLowerCase() !== 'closed') return false;
  const messageId = String(message?.message_id || '').trim();
  const doneId = String(request.done_message_id || '').trim();
  if (messageId && doneId && messageId === doneId) return true;
  const initialId = String(request.initial_message_id || '').trim();
  return Boolean(initialId && doneId && initialId === doneId);
}

function requestStatusLabel(request = {}, message = {}) {
  if (isReactionClosedRequest(request, message)) return 'Javob berildi';
  return statusLabel(request?.status);
}

function chatMembershipLabel(chat = {}) {
  const sourceType = String(chat?.source_type || '').toLowerCase();
  if (sourceType !== 'group') return '';
  const status = String(chat.member_status || '').toLowerCase();
  if (status === 'left') return 'Bot guruhdan chiqqan';
  if (status === 'kicked') return 'Bot guruhdan chiqarilgan';
  if (status === 'hidden') return 'Webapp ro‘yxatidan yashirilgan';
  if (chat.is_active === false) return 'Guruh faol emas';
  if (status) return `Bot holati: ${status}`;
  return 'Guruh faol';
}

function chatMembershipTone(chat = {}) {
  const status = String(chat?.member_status || '').toLowerCase();
  return chat?.is_active === false || ['left', 'kicked', 'hidden'].includes(status) ? 'inactive' : 'active';
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
  const username = normalizeSupportUsername(row.uyqur_support_username);
  return username ? `@${username}` : 'Biriktirilmagan';
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
  return Boolean(normalizeSupportUsername(row.uyqur_support_username));
}

function normalizeSupportUsername(value = '') {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function supportIdentityKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function supportIdentitiesMatch(left = '', right = '') {
  const a = supportIdentityKey(left);
  const b = supportIdentityKey(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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
  const companyId = String(company.id || company.company_id || '').trim();
  const employeeCompanyId = String(employee.company_id || '').trim();
  if (companyId && employeeCompanyId && companyId === employeeCompanyId) return true;
  return employeeMatchesSupportUsername(employee, company.uyqur_support_username);
}

function companyScopeKeyFromCompany(company = {}) {
  const companyId = String(company.id || company.company_id || '').trim();
  if (companyId) return `id:${companyId}`;
  const companyName = normalizedCompanyName(company.name);
  return companyName ? `name:${companyName}` : '';
}

function employeeAssignedCompaniesPack(allAssigned = []) {
  const companies = Array.isArray(allAssigned) ? allAssigned : [];
  return {
    companies,
    total: companies.length,
    summary: companies.length ? companyPortfolioSummary(companies) : {
      total: 0,
      active: 0,
      churn: 0,
      expiring_soon: 0,
      expired: 0
    }
  };
}

function isCompanyChurn(row = {}) {
  return String(row.business_status || '').toUpperCase() === 'PAUSED';
}

function isCompanyExpiringSoon(row = {}) {
  return row.expiry_state === 'soon';
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
    if (companyName && normalizedCompanyName(chat.company_name) === companyName) return true;
    return companyName && normalizedCompanyName(companyNameFromChatTitle(chat.title)) === companyName;
  });
}

function companyNameFromChatTitle(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split('|').map(part => part.trim()).filter(Boolean);
  return parts[0] || text;
}

function companyGroupChatIds(company = {}) {
  const chatIds = new Set();
  const mainChatId = String(company.chat_id || '').trim();
  if (mainChatId) chatIds.add(mainChatId);
  const companyId = String(company.id || company.company_id || '').trim();
  const companyName = normalizedCompanyName(company.name);
  (Array.isArray(company.groups) ? company.groups : []).forEach(group => {
    const chatId = String(group.chat_id || group.telegram_chat_id || group.group_id || '').trim();
    if (chatId) chatIds.add(chatId);
  });
  (companyInfo.value?.groups || []).forEach(group => {
    const groupCompanyId = String(group.company_id || '').trim();
    const groupCompanyName = normalizedCompanyName(group.company_name);
    if ((companyId && groupCompanyId === companyId) || (companyName && groupCompanyName === companyName)) {
      const chatId = String(group.chat_id || group.telegram_chat_id || group.group_id || '').trim();
      if (chatId) chatIds.add(chatId);
    }
  });
  relatedCompanyChatStats(company).forEach(chat => {
    const chatId = String(chat.chat_id || '').trim();
    if (chatId) chatIds.add(chatId);
  });
  (dashboard.chatStats || []).forEach(chat => {
    const chatId = String(chat.chat_id || '').trim();
    if (!chatId) return;
    const chatCompanyId = String(chat.company_id || '').trim();
    const chatCompanyName = normalizedCompanyName(chat.company_name || companyNameFromChatTitle(chat.title));
    if ((companyId && chatCompanyId === companyId) || (companyName && chatCompanyName === companyName)) {
      chatIds.add(chatId);
    }
  });
  return chatIds;
}

function companyMatchesGroupChat(company = {}, chatId = '') {
  const normalized = String(chatId || '').trim();
  return Boolean(normalized && companyGroupChatIds(company).has(normalized));
}

function findCompanyByGroupChatId(chatId = '') {
  const normalized = String(chatId || '').trim();
  if (!normalized) return null;
  return (visibleCompanyInfoRows.value || []).find(company => companyMatchesGroupChat(company, normalized)) || null;
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

function normalizeCompanyTicketRow(row = {}) {
  const closed = firstNumericValue(row, ['closed_requests', 'closed_ticket_count', 'closed_tickets', 'resolved_requests', 'resolved_ticket_count']);
  const explicitOpen = firstNumericValue(row, ['open_requests', 'open_ticket_count', 'open_tickets', 'unresolved_requests', 'unresolved_ticket_count']);
  const messageCount = firstNumericValue(row, ['message_count', 'total_messages', 'messages_count']);
  const ticketLikeMessages = firstNumericValue(row, ['ticket_like_messages', 'request_messages', 'classified_requests']);
  const open = explicitOpen;
  const explicitTotal = firstNumericValue(row, ['total_requests', 'requests_count', 'ticket_count', 'tickets_count', 'support_ticket_count']);
  const total = explicitTotal || (closed + open);
  const companyId = row.company_id || row.id || row.external_id || row.uyqur_company_id || '';
  return {
    company_id: companyId,
    name: row.name || row.company_name || row.legal_name || 'Kompaniya',
    total_requests: total,
    closed_requests: closed,
    open_requests: open,
    message_count: messageCount,
    ticket_like_messages: ticketLikeMessages,
    close_rate: Number(row.close_rate || row.sla || 0),
    is_unassigned: row.is_unassigned === true || companyId === '__unassigned__'
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
      closed + open
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
  return 0;
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
  const start = parseCompanyDate(row.subscription_start_date || row.created_at_iso || row.created_at);
  const expiry = parseCompanyDate(row.expired);
  const now = new Date();
  const usageDays = start ? dayDiff(start, now) || 0 : 0;
  const subscriptionDays = start && expiry ? dayDiff(start, expiry) || 0 : 0;
  return {
    ...row,
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
  return {
    total: rows.length,
    active: rows.filter(company => company.business_status === 'ACTIVE').length,
    churn: rows.filter(isCompanyChurn).length,
    expiring_soon: rows.filter(isCompanyExpiringSoon).length,
    expired: rows.filter(company => company.expiry_state === 'expired').length
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
const filteredClickUpTasks = computed(() => clickupTasks.value.filter(includesSearch));
const filteredGroups = computed(() => groups.value.filter(includesSearch));
const filteredPrivates = computed(() => privates.value.filter(includesSearch));
function attachCompanyInfoGroups(companies = [], groups = []) {
  if (!companies.length || !groups.length) return companies;
  if (companies.some(company => Array.isArray(company.groups) && company.groups.length)) return companies;
  const byId = new Map(companies.map(company => [String(company.id || company.company_id || '').trim(), { ...company, groups: [] }]).filter(([id]) => id));
  const byName = new Map(companies.map(company => [normalizedCompanyName(company.name), company]).filter(([name]) => name));
  groups.forEach(group => {
    const company = byId.get(String(group.company_id || '').trim()) || byName.get(normalizedCompanyName(group.company_name));
    if (!company) return;
    const chatId = String(group.chat_id || '').trim();
    if (!chatId) return;
    if (!company.groups.some(item => String(item.chat_id || '').trim() === chatId)) {
      company.groups.push(group);
    }
  });
  return companies;
}

const companyInfoRows = computed(() => attachCompanyInfoGroups(
  companyInfo.value.companies || [],
  companyInfo.value.groups || []
));
const visibleCompanyInfoRows = computed(() => companyInfoRows.value.filter(hasCompanySupport));
const filteredCompanyInfoRows = computed(() => visibleCompanyInfoRows.value.filter(includesSearch));
const filteredCompanies = computed(() => companyInfoRows.value.filter(includesSearch));
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
const companyModuleColumns = [
  { key: 'taminot', label: 'Ta’minot' },
  { key: 'kassa', label: 'Kassa' },
  { key: 'omborxona', label: 'Omborxona' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'qurilish_jarayoni', label: 'Qurilish jarayoni' }
];
const COMPANY_MODULE_CHART_COLORS = Object.freeze({
  taminot: '#3b82f6',
  kassa: '#22c55e',
  omborxona: '#f59e0b',
  monitoring: '#8b5cf6',
  qurilish_jarayoni: '#ef4444'
});
const COMPANY_MODULE_CHART_DIMS = Object.freeze({
  left: 62,
  right: 780,
  top: 56,
  bottom: 332
});
const COMPANY_MODULE_CHART_VIEW = Object.freeze({ width: 820, height: 360 });
const companyModuleChartAxisTitleY = (COMPANY_MODULE_CHART_DIMS.top + COMPANY_MODULE_CHART_DIMS.bottom) / 2;
const companyModuleKeys = companyModuleColumns.map(column => column.key);
const companyModulePeriod = ref('today');
const companyModuleFilterKeys = ref(['business:ACTIVE']);
const companyModuleSort = ref('modules_desc');
const companyModuleSortOptions = [
  { key: 'modules_desc', label: 'Ko‘p ishlatilgan' },
  { key: 'modules_asc', label: 'Kam ishlatilgan' },
  { key: 'name', label: 'Kompaniya nomi' },
  { key: 'support', label: 'Mas’ul xodim' }
];
const companyModulePeriodOptions = [
  { key: 'today', label: 'Bugun' },
  { key: 'yesterday', label: 'Kecha' },
  { key: 'week', label: '7 kun' },
  { key: 'month', label: '1 oy' },
  { key: 'custom', label: 'Ixtiyoriy' }
];
const companyModuleCustomPeriodForm = reactive({ start: '', end: '', appliedStart: '', appliedEnd: '' });
const companyModuleCustomPeriodError = ref('');
const previousCompanyModulePeriod = ref('today');
const companyModuleChartPeriod = ref('month');
const companyModuleChartCustomPeriodForm = reactive({ start: '', end: '', appliedStart: '', appliedEnd: '' });
const companyModuleChartCustomPeriodError = ref('');
const previousCompanyModuleChartPeriod = ref('month');
const companyModuleChartMetricKeys = ref(['activity']);
const companyModuleChartVisibleModules = ref([...companyModuleKeys]);
const companyModuleChartShowAverage = ref(true);
const companyModuleChartMetricOptions = [
  { key: 'activity', label: 'O‘rtacha faollik' },
  { key: 'actions', label: 'Amallar soni' }
];

function emptyCompanyModuleUsageMap() {
  return Object.fromEntries(companyModuleKeys.map(key => [key, false]));
}

function companyModuleUsageValue(row = {}, key = '') {
  const usage = row.module_usage || row.modules || row.product_modules || {};
  if (usage && typeof usage === 'object') {
    if (usage[key] !== undefined) return Boolean(usage[key]);
    if (key === 'qurilish_jarayoni' && usage.qurilish !== undefined) return Boolean(usage.qurilish);
  }
  if (row[`${key}_used`] !== undefined) return Boolean(row[`${key}_used`]);
  if (key === 'qurilish_jarayoni' && row.qurilish_used !== undefined) return Boolean(row.qurilish_used);
  return false;
}

function companyModuleUsageMap(row = {}) {
  return Object.fromEntries(companyModuleKeys.map(key => [key, companyModuleUsageValue(row, key)]));
}

function companyModuleActiveCount(usage = {}) {
  return companyModuleKeys.reduce((sum, key) => sum + (usage[key] ? 1 : 0), 0);
}

function companyModuleActivePercent(usage = {}) {
  const total = companyModuleKeys.length;
  if (!total) return 0;
  return Math.round((companyModuleActiveCount(usage) / total) * 100);
}

const BUSINESS_STATUS_SORT_ORDER = Object.freeze({
  ACTIVE: 0,
  NEW: 1,
  PAUSED: 2
});

function matchesCompanyModuleFilter(row = {}, filters = []) {
  const keys = Array.isArray(filters) ? filters.filter(Boolean) : [];
  if (!keys.length) return true;

  const businessKeys = keys.filter(key => key.startsWith('business:'));
  if (businessKeys.length) {
    const statuses = businessKeys.map(key => key.slice(9).toUpperCase());
    if (!statuses.includes(String(row.business_status || '').toUpperCase())) return false;
  }

  const moduleKeys = keys.filter(key => key.startsWith('module:'));
  if (moduleKeys.length) {
    if (!moduleKeys.some(key => Boolean(row.module_usage?.[key.slice(7)]))) return false;
  }

  const moduleNotKeys = keys.filter(key => key.startsWith('module_not:'));
  if (moduleNotKeys.length) {
    if (!moduleNotKeys.some(key => !row.module_usage?.[key.slice(11)])) return false;
  }

  if (keys.includes('used') && Number(row.module_active_count || 0) === 0) return false;
  if (keys.includes('unused') && Number(row.module_active_count || 0) > 0) return false;

  const supportKeys = keys.filter(key => key.startsWith('support:') && key !== 'support:all');
  if (supportKeys.length) {
    const usernames = supportKeys.map(key => key.slice(8));
    const rowUsername = normalizeSupportUsername(row.uyqur_support_username);
    if (!usernames.includes(rowUsername)) return false;
  }
  return true;
}

function sortCompanyModuleRows(rows = [], sort = 'modules_desc') {
  return [...rows].sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'support') {
      return companySupportLabel(a).localeCompare(companySupportLabel(b), 'uz')
        || String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sort === 'business_status') {
      const left = BUSINESS_STATUS_SORT_ORDER[String(a.business_status || '').toUpperCase()] ?? 99;
      const right = BUSINESS_STATUS_SORT_ORDER[String(b.business_status || '').toUpperCase()] ?? 99;
      return left - right || String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sort === 'modules_asc') {
      return a.module_active_count - b.module_active_count
        || String(a.name || '').localeCompare(String(b.name || ''));
    }
    return b.module_active_count - a.module_active_count
      || String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function handleCompanyModuleControlChange(value = '') {
  const next = String(value || '').trim();
  if (next.startsWith('sort:')) {
    companyModuleSort.value = next.slice(5) || 'modules_desc';
    return;
  }
}

function companyModuleFilterNamespace(key = '') {
  if (key === 'all' || key === 'used' || key === 'unused') return 'global';
  const colon = String(key).indexOf(':');
  return colon >= 0 ? key.slice(0, colon) : key;
}

function companyModuleSupportDisplayLabel(username = '') {
  const normalized = normalizeSupportUsername(username);
  if (!normalized) return '';
  const employee = employees.value.find(row =>
    !isAdminLikeEmployee(row) && normalizeSupportUsername(row.username) === normalized
  );
  if (employee?.full_name) return employee.full_name;
  return `@${normalized}`;
}

function toggleCompanyModuleFilterMenu() {
  companyModuleFilterMenuOpen.value = !companyModuleFilterMenuOpen.value;
  companyModuleFilterMenuGroup.value = '';
}

function closeCompanyModuleFilterMenu() {
  companyModuleFilterMenuOpen.value = false;
  companyModuleFilterMenuGroup.value = '';
}

function openCompanyModuleFilterGroup(groupKey = '') {
  companyModuleFilterMenuGroup.value = String(groupKey || '');
}

function toggleCompanyMrrFilterMenu() {
  companyMrrFilterMenuOpen.value = !companyMrrFilterMenuOpen.value;
  companyMrrFilterMenuGroup.value = '';
}

function closeCompanyMrrFilterMenu() {
  companyMrrFilterMenuOpen.value = false;
  companyMrrFilterMenuGroup.value = '';
}

function openCompanyMrrFilterGroup(groupKey = '') {
  companyMrrFilterMenuGroup.value = String(groupKey || '');
}

function findCompanyModuleControlOption(type = 'filter', key = '') {
  for (const group of companyModuleControlGroups.value) {
    if (group.type !== type) continue;
    const option = group.options.find(item => item.key === key);
    if (option) return { group, option };
  }
  return null;
}

function isCompanyModuleControlOptionActive(group = {}, option = {}) {
  if (group.type === 'sort') return companyModuleSort.value === option.key;
  if (option.key === 'all') return !companyModuleFilterKeys.value.length;
  if (option.key === 'support:all') {
    return !companyModuleFilterKeys.value.some(key => key.startsWith('support:') && key !== 'support:all');
  }
  return companyModuleFilterKeys.value.includes(option.key);
}

function selectCompanyModuleControlOption(group = {}, option = {}, onClose = closeCompanyModuleFilterMenu) {
  if (group.type === 'sort') {
    companyModuleSort.value = companyModuleSort.value === option.key ? 'modules_desc' : option.key;
    onClose();
    return;
  }
  if (option.key === 'all') {
    companyModuleFilterKeys.value = [];
    onClose();
    return;
  }
  if (!group.multi) {
    const namespace = companyModuleFilterNamespace(option.key);
    const keys = companyModuleFilterKeys.value.filter(key => companyModuleFilterNamespace(key) !== namespace);
    if (isCompanyModuleControlOptionActive(group, option)) {
      companyModuleFilterKeys.value = keys;
      onClose();
      return;
    }
    if (option.key !== 'support:all') keys.push(option.key);
    companyModuleFilterKeys.value = keys;
    onClose();
    return;
  }
  const keys = [...companyModuleFilterKeys.value];
  const index = keys.indexOf(option.key);
  if (index >= 0) keys.splice(index, 1);
  else keys.push(option.key);
  companyModuleFilterKeys.value = keys;
}

function moduleUsageDeltaMark(row = {}, moduleKey = '') {
  if (!companyModuleCompareEnabled.value || !row?.has_previous_report) return '';
  const current = Boolean(row.module_usage?.[moduleKey]);
  const previous = Boolean(row.previous_usage?.[moduleKey]);
  if (current === previous) return '';
  return current ? '+' : '-';
}

function companyModulePeriodQuery(period = 'today') {
  if (period === 'custom') {
    if (!companyModuleCustomPeriodForm.appliedStart || !companyModuleCustomPeriodForm.appliedEnd) {
      return { period: 'today', include_daily: 0 };
    }
    return {
      period: 'custom',
      start_date: companyModuleCustomPeriodForm.appliedStart,
      end_date: companyModuleCustomPeriodForm.appliedEnd,
      include_daily: 0
    };
  }
  return { period: period || 'today', include_daily: 0 };
}

function companyModuleChartPeriodQuery(period = 'week') {
  if (period === 'custom') {
    if (!companyModuleChartCustomPeriodForm.appliedStart || !companyModuleChartCustomPeriodForm.appliedEnd) {
      return { period: 'week', include_daily: 1 };
    }
    return {
      period: 'custom',
      start_date: companyModuleChartCustomPeriodForm.appliedStart,
      end_date: companyModuleChartCustomPeriodForm.appliedEnd,
      include_daily: 1
    };
  }
  return { period: period || 'week', include_daily: 1 };
}

function companyModulePreviousPeriodKey(period = 'today') {
  return ({
    today: 'yesterday',
    yesterday: 'day_before_yesterday',
    week: 'prev_week',
    month: 'prev_month'
  })[period] || null;
}

const companyModuleCompareAgainstLabel = computed(() => ({
  today: 'kechaga nisbatan',
  yesterday: 'undan oldingi kunga nisbatan',
  week: 'oldingi 7 kunga nisbatan',
  month: 'oldingi 1 oyga nisbatan'
}[companyModulePeriod.value] || ''));

const companyModulePeriodLabel = computed(() => {
  if (companyModulePeriod.value === 'custom' && companyModuleCustomPeriodForm.appliedStart && companyModuleCustomPeriodForm.appliedEnd) {
    return `${dateInputLabel(companyModuleCustomPeriodForm.appliedStart)} — ${dateInputLabel(companyModuleCustomPeriodForm.appliedEnd)}`;
  }
  return companyModulePeriodOptions.find(period => period.key === companyModulePeriod.value)?.label || 'Bugun';
});

function companyModulePeriodOptionLabel(period = {}) {
  if (period.key === 'custom' && companyModuleCustomPeriodForm.appliedStart && companyModuleCustomPeriodForm.appliedEnd) {
    return companyModulePeriodLabel.value;
  }
  return period.label || 'Ixtiyoriy';
}

let companyModulePeriodSelectValueOnPointerDown = '';
let companyModuleChartPeriodSelectValueOnPointerDown = '';

function companyModuleChartPeriodOptionLabel(period = {}) {
  if (period.key === 'custom'
    && companyModuleChartCustomPeriodForm.appliedStart
    && companyModuleChartCustomPeriodForm.appliedEnd) {
    return companyModuleChartPeriodLabel.value;
  }
  return period.label || 'Ixtiyoriy';
}

const companyModuleReportDatesLabel = computed(() => {
  const dates = [...(companyModuleReports.value?.report_dates || [])].filter(Boolean).sort();
  if (!dates.length) return 'ma’lumot yo‘q';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} — ${dates.at(-1)} (${dates.length} kun)`;
});

const companyModuleFetchedAt = computed(() => companyModuleReports.value?.fetched_at || '');

function moduleStatusTitle(row = {}, moduleKey = '') {
  const active = Boolean(row.module_usage?.[moduleKey]);
  const lastDate = row.module_last_dates?.[moduleKey];
  if (active && lastDate) return `Ishlatilgan · oxirgi: ${lastDate}`;
  if (active) return 'Ishlatilgan';
  if (lastDate) return `Ishlatilmagan · oxirgi: ${lastDate}`;
  return 'Ishlatilmagan';
}

function companyModuleReportKeys(row = {}) {
  return [...new Set([
    row.id,
    row.company_id,
    row.external_id,
    row.uyqur_company_id
  ].map(value => String(value || '').trim()).filter(Boolean))];
}

function companyModuleReportRowKeys(row = {}) {
  return [...new Set([
    row.company_id,
    row.id
  ].map(value => String(value || '').trim()).filter(Boolean))];
}

function findCompanyModuleReport(map, row = {}) {
  for (const key of companyModuleReportKeys(row)) {
    const report = map.get(key);
    if (report) return report;
  }
  return null;
}

const companyModuleReportByCompanyId = computed(() => {
  const map = new Map();
  (companyModuleReports.value.companies || []).forEach(row => {
    companyModuleReportRowKeys(row).forEach(key => map.set(key, row));
  });
  return map;
});

const companyModuleReportPreviousByCompanyId = computed(() => {
  const map = new Map();
  (companyModuleReportsPrevious.value.companies || []).forEach(row => {
    companyModuleReportRowKeys(row).forEach(key => map.set(key, row));
  });
  return map;
});

function companyInfoRowWithoutModuleFields(row = {}) {
  const next = { ...row };
  delete next.module_usage;
  delete next.module_last_dates;
  delete next.module_active_count;
  delete next.report_date;
  return next;
}

function companyModuleUsageForPeriod(row = {}, report = null, context = {}) {
  if (!report?.module_usage) return emptyCompanyModuleUsageMap();
  const { expectedDates = [], mode = '', targetDate = '' } = context;
  if (mode === 'single' && targetDate) return report.module_usage;
  const reportDate = String(report.report_date || '').trim();
  if (expectedDates.length === 1 && reportDate && reportDate !== expectedDates[0]) {
    return emptyCompanyModuleUsageMap();
  }
  return report.module_usage;
}

const companyModuleBaseRows = computed(() => {
  const reportById = companyModuleReportByCompanyId.value;
  const previousById = companyModuleReportPreviousByCompanyId.value;
  const hasPreviousReports = (companyModuleReportsPrevious.value?.report_dates || []).length > 0;
  const compareEnabled = companyModuleCompareEnabled.value;
  const expectedDates = [...(companyModuleReports.value?.report_dates || [])].filter(Boolean);
  const moduleReportContext = {
    expectedDates,
    mode: companyModuleReports.value?.mode || '',
    targetDate: companyModuleReports.value?.target_date || ''
  };
  return filteredCompanyInfoRows.value.map(row => {
    const report = findCompanyModuleReport(reportById, row);
    const previousReport = findCompanyModuleReport(previousById, row);
    const module_usage = companyModuleUsageForPeriod(row, report, moduleReportContext);
    const previous_usage = previousReport?.module_usage || emptyCompanyModuleUsageMap();
    const module_last_dates = report?.module_last_dates || {};
    const module_active_count = companyModuleActiveCount(module_usage);
    const module_active_percent = companyModuleActivePercent(module_usage);
    const previous_percent = companyModuleActivePercent(previous_usage);
    return {
      ...companyInfoRowWithoutModuleFields(row),
      module_usage,
      previous_usage,
      module_last_dates,
      module_active_count,
      module_active_percent,
      has_previous_report: Boolean(previousReport),
      module_percent_comparison: compareEnabled && hasPreviousReports
        ? compareValue(module_active_percent, previous_percent, { isPercentage: true })
        : null,
      report_date: report?.employee_activity?.report_date || report?.report_date || null,
      employee_activity: report?.employee_activity || null
    };
  });
});

const COMPANY_MRR_SCATTER_VIEW = { width: 460, height: 260 };
const COMPANY_MRR_SCATTER_DIMS = { left: 60, right: 430, top: 20, bottom: 210 };

function activityScoreColor(score = 0) {
  if (score >= 4) return 'var(--success)';
  if (score >= 3) return '#f59e0b';
  return 'var(--danger)';
}

function pearsonCorrelation(pairs = []) {
  const n = pairs.length;
  if (n < 2) return 0;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  pairs.forEach(([x, y]) => {
    const dx = x - meanX;
    const dy = y - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  });
  const denom = Math.sqrt(denomX * denomY);
  return denom ? numerator / denom : 0;
}

const companyMrrRows = computed(() => {
  const moduleDataById = new Map();
  companyModuleBaseRows.value.forEach(row => {
    const id = String(row.id || '').trim();
    if (id) moduleDataById.set(id, row);
  });
  const filters = companyModuleFilterKeys.value;
  return companyInfoRows.value
    .filter(includesSearch)
    .filter(row => matchesCompanyModuleFilter(moduleDataById.get(String(row.id || '').trim()) || row, filters))
    .map(row => {
      const id = String(row.id || '').trim();
      const moduleRow = moduleDataById.get(id);
      const usage = moduleRow?.module_usage || {};
      const activeModules = companyModuleColumns.filter(column => usage[column.key]).map(column => column.label);
      return {
        id,
        name: row.name || 'Kompaniya',
        mrr_amount: Number(row.mrr_amount || 0),
        activity_percent: Number(moduleRow?.module_active_percent || 0),
        activity_score: Number(moduleRow?.module_active_count || 0),
        support_label: companySupportLabel(row),
        active_modules: activeModules
      };
    })
    .filter(row => row.mrr_amount > 0);
});

const companyMrrChartRows = computed(() => {
  const rows = [...companyMrrRows.value].sort((a, b) => b.mrr_amount - a.mrr_amount);
  const max = Math.max(1, ...rows.map(row => row.mrr_amount));
  return rows.map(row => ({ ...row, bar_percent: Math.round((row.mrr_amount / max) * 1000) / 10 }));
});

const companyMrrScatterPeriod = ref('today');
const companyMrrScatterReports = ref({ companies: [], report_dates: [], period: 'today', fetched_at: null });
const companyMrrScatterBusinessFilter = ref('ACTIVE');
const companyMrrScatterSupportFilter = ref('all');
const companyMrrScatterCompanyId = ref('');
const companyMrrScatterPeriodOptions = companyModulePeriodOptions.filter(period => period.key !== 'custom');

async function loadCompanyMrrScatterReports() {
  try {
    const data = await api.companyModuleReports({ period: companyMrrScatterPeriod.value, include_daily: 0 });
    companyMrrScatterReports.value = { ...data, period: companyMrrScatterPeriod.value };
  } catch (error) {
    companyMrrScatterReports.value = {
      companies: [],
      report_dates: [],
      period: companyMrrScatterPeriod.value,
      fetched_at: null
    };
    showToast(error.message);
  }
}

async function handleCompanyMrrScatterPeriodChange(value) {
  companyMrrScatterPeriod.value = value;
  await loadCompanyMrrScatterReports();
}

const companyMrrScatterReportByCompanyId = computed(() => {
  const map = new Map();
  (companyMrrScatterReports.value.companies || []).forEach(row => {
    companyModuleReportRowKeys(row).forEach(key => map.set(key, row));
  });
  return map;
});

const companyMrrScatterBaseRows = computed(() => {
  const reportById = companyMrrScatterReportByCompanyId.value;
  const moduleReportContext = {
    expectedDates: [...(companyMrrScatterReports.value?.report_dates || [])].filter(Boolean),
    mode: companyMrrScatterReports.value?.mode || '',
    targetDate: companyMrrScatterReports.value?.target_date || ''
  };
  return companyInfoRows.value
    .filter(row => Number(row.mrr_amount || 0) > 0)
    .map(row => {
      const report = findCompanyModuleReport(reportById, row);
      const module_usage = companyModuleUsageForPeriod(row, report, moduleReportContext);
      return {
        ...row,
        module_usage,
        module_active_count: companyModuleActiveCount(module_usage),
        module_active_percent: companyModuleActivePercent(module_usage)
      };
    });
});

const companyMrrScatterCompanyOptions = computed(() => [...companyMrrScatterBaseRows.value]
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'uz'))
  .map(row => ({ id: String(row.id || '').trim(), name: row.name || 'Kompaniya' }))
  .filter(option => option.id));

const companyMrrScatterBusinessOptions = computed(() => {
  const values = new Set();
  companyMrrScatterBaseRows.value.forEach(row => {
    const value = String(row.business_status || '').toUpperCase().trim();
    if (value) values.add(value);
  });
  return [...values].sort();
});

const companyMrrScatterSupportOptions = computed(() => {
  const usernames = new Set();
  companyMrrScatterBaseRows.value.forEach(row => {
    const username = normalizeSupportUsername(row.uyqur_support_username);
    if (username) usernames.add(username);
  });
  return [...usernames].sort((a, b) => companyModuleSupportDisplayLabel(a).localeCompare(companyModuleSupportDisplayLabel(b), 'uz'));
});

const companyMrrScatterRows = computed(() => {
  const businessFilter = companyMrrScatterBusinessFilter.value;
  const supportFilter = companyMrrScatterSupportFilter.value;
  const companyId = companyMrrScatterCompanyId.value;
  return companyMrrScatterBaseRows.value
    .filter(includesSearch)
    .filter(row => !companyId || String(row.id || '').trim() === companyId)
    .filter(row => businessFilter === 'all' || String(row.business_status || '').toUpperCase().trim() === businessFilter)
    .filter(row => {
      const username = normalizeSupportUsername(row.uyqur_support_username);
      if (supportFilter === 'all') return true;
      if (supportFilter === 'assigned') return Boolean(username);
      if (supportFilter === 'unassigned') return !username;
      return username === supportFilter;
    })
    .map(row => {
      const usage = row.module_usage || {};
      const activeModules = companyModuleColumns.filter(column => usage[column.key]).map(column => column.label);
      return {
        id: String(row.id || '').trim(),
        name: row.name || 'Kompaniya',
        mrr_amount: Number(row.mrr_amount || 0),
        activity_percent: Number(row.module_active_percent || 0),
        activity_score: Number(row.module_active_count || 0),
        support_label: companySupportLabel(row),
        active_modules: activeModules
      };
    });
});

function niceAxisMax(value = 0) {
  const raw = Math.max(1, Number(value) || 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  let niceNormalized = 10;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  return niceNormalized * magnitude;
}

const companyMrrScatterMax = computed(() => niceAxisMax(Math.max(1, ...companyMrrScatterRows.value.map(row => row.mrr_amount))));

const companyMrrScatterPoints = computed(() => {
  const dims = COMPANY_MRR_SCATTER_DIMS;
  const width = dims.right - dims.left;
  const height = dims.bottom - dims.top;
  const max = companyMrrScatterMax.value;
  return companyMrrScatterRows.value.map(row => {
    const xRatio = row.activity_score / 5;
    const yRatio = row.mrr_amount / max;
    return {
      ...row,
      x: Math.round((dims.left + xRatio * width) * 10) / 10,
      y: Math.round((dims.bottom - yRatio * height) * 10) / 10
    };
  });
});

const companyMrrScatterXTicks = computed(() => {
  const dims = COMPANY_MRR_SCATTER_DIMS;
  const width = dims.right - dims.left;
  return [0, 1, 2, 3, 4, 5].map(value => ({
    value,
    x: Math.round((dims.left + (value / 5) * width) * 10) / 10
  }));
});

const companyMrrScatterYTicks = computed(() => {
  const dims = COMPANY_MRR_SCATTER_DIMS;
  const height = dims.bottom - dims.top;
  const max = companyMrrScatterMax.value;
  const steps = 5;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const value = Math.round((max / steps) * index);
    return {
      value,
      y: Math.round((dims.bottom - (index / steps) * height) * 10) / 10
    };
  });
});

const companyMrrScatterThresholds = computed(() => {
  const dims = COMPANY_MRR_SCATTER_DIMS;
  const max = companyMrrScatterMax.value;
  const width = dims.right - dims.left;
  const height = dims.bottom - dims.top;
  const scoreThreshold = 3;
  const mrrThreshold = 5;
  const x = Math.round((dims.left + (scoreThreshold / 5) * width) * 10) / 10;
  const y = Math.round((dims.bottom - (mrrThreshold / max) * height) * 10) / 10;
  return {
    x,
    y,
    riskWidth: Math.max(0, x - dims.left),
    riskHeight: Math.max(0, y - dims.top),
    medianMrr: mrrThreshold,
    scoreThreshold
  };
});

const companyMrrCorrelation = computed(() => pearsonCorrelation(
  companyMrrScatterRows.value.map(row => [row.activity_score, row.mrr_amount])
));

const COMPANY_MRR_QUADRANT_TITLES = Object.freeze({
  risk: 'Yuqori MRR + past faollik (Risk zonasi)',
  topRight: 'Yuqori MRR + yuqori faollik',
  bottomLeft: 'Past MRR + past faollik',
  bottomRight: 'Past MRR + yuqori faollik'
});

const companyMrrQuadrantColumns = [
  { key: 'name', label: 'Kompaniya', action: 'selectMrrScatterCompany' },
  { key: 'mrr_amount', label: 'MRR', format: fmtNumber },
  { key: 'activity_score', label: 'Faollik balli', format: v => `${v}/5` },
  { key: 'support_label', label: 'Mas’ul xodim' },
  { key: 'active_modules', label: 'Faol modullar', format: v => (v?.length ? v.join(', ') : 'Yo‘q') }
];

function companyMrrQuadrantRows(quadrantKey = '') {
  const { medianMrr, scoreThreshold } = companyMrrScatterThresholds.value;
  return companyMrrScatterRows.value.filter(row => {
    const highActivity = row.activity_score >= scoreThreshold;
    const highMrr = row.mrr_amount > medianMrr;
    if (quadrantKey === 'risk') return !highActivity && highMrr;
    if (quadrantKey === 'topRight') return highActivity && highMrr;
    if (quadrantKey === 'bottomLeft') return !highActivity && !highMrr;
    if (quadrantKey === 'bottomRight') return highActivity && !highMrr;
    return false;
  }).sort((a, b) => b.mrr_amount - a.mrr_amount);
}

function openCompanyMrrQuadrantDetail(quadrantKey = '') {
  closeCompanyMrrScatterTooltip();
  const rows = companyMrrQuadrantRows(quadrantKey);
  if (!rows.length) return showToast('Bu zonada kompaniya topilmadi');
  setMetricDetail({
    title: COMPANY_MRR_QUADRANT_TITLES[quadrantKey] || 'Kompaniyalar',
    rows,
    columns: companyMrrQuadrantColumns,
    empty: 'Kompaniya topilmadi',
    showSourceTabs: false,
    summary: [
      { label: 'Kompaniya', value: fmtNumber(rows.length) },
      { label: 'Jami MRR', value: fmtNumber(rows.reduce((sum, row) => sum + row.mrr_amount, 0)) }
    ]
  });
}

const companyMrrScatterChartRef = ref(null);
const companyMrrScatterSelectedPointId = ref('');

function hoverCompanyMrrScatterPoint(point = {}) {
  companyMrrScatterSelectedPointId.value = String(point.id || '').trim();
}

function unhoverCompanyMrrScatterPoint(point = {}) {
  const id = String(point.id || '').trim();
  if (companyMrrScatterSelectedPointId.value === id) companyMrrScatterSelectedPointId.value = '';
}

function selectCompanyMrrScatterPoint(point = {}) {
  const id = String(point.id || '').trim();
  if (!id) return;
  selectCompanyModuleChartCompany(id);
  nextTick(() => {
    companyModuleChartRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function closeCompanyMrrScatterTooltip() {
  companyMrrScatterSelectedPointId.value = '';
}

const companyMrrScatterTooltip = computed(() => {
  const id = companyMrrScatterSelectedPointId.value;
  if (!id) return null;
  return companyMrrScatterPoints.value.find(point => String(point.id) === id) || null;
});

const companyMrrScatterTooltipStyle = computed(() => {
  const tooltip = companyMrrScatterTooltip.value;
  const root = companyMrrScatterChartRef.value;
  if (!tooltip || !root) return {};
  const svg = root.querySelector('svg');
  if (!svg) return {};
  const rect = svg.getBoundingClientRect();
  const shellRect = root.getBoundingClientRect();
  const ratio = rect.width / COMPANY_MRR_SCATTER_VIEW.width;
  const left = (rect.left - shellRect.left) + tooltip.x * ratio;
  const top = (rect.top - shellRect.top) + tooltip.y * ratio;
  const clampedLeft = Math.max(12, Math.min(left, shellRect.width - 220));
  const clampedTop = Math.max(12, top - 12);
  return { left: `${clampedLeft}px`, top: `${clampedTop}px` };
});

const companyModuleSupportFilterOptions = computed(() => {
  const usernames = new Set();
  companyModuleBaseRows.value.forEach(row => {
    const username = normalizeSupportUsername(row.uyqur_support_username);
    if (username) usernames.add(username);
  });
  return [...usernames]
    .sort((a, b) => companyModuleSupportDisplayLabel(a).localeCompare(companyModuleSupportDisplayLabel(b), 'uz'))
    .map(username => ({
      key: `support:${username}`,
      label: companyModuleSupportDisplayLabel(username)
    }));
});

const companyModuleControlGroups = computed(() => {
  const usedModuleOptions = companyModuleColumns.map(column => ({
    key: `module:${column.key}`,
    label: column.label
  }));
  const unusedModuleOptions = companyModuleColumns.map(column => ({
    key: `module_not:${column.key}`,
    label: column.label
  }));
  return [
    {
      key: 'show',
      label: 'Hammasi',
      type: 'filter',
      options: [{ key: 'all', label: 'Hammasi' }]
    },
    {
      key: 'used',
      label: 'Ishlatilgan',
      type: 'filter',
      multi: true,
      options: [
        { key: 'used', label: 'Ishlatilgan' },
        ...usedModuleOptions
      ]
    },
    {
      key: 'unused',
      label: 'Ishlatilmagan',
      type: 'filter',
      multi: true,
      options: [
        { key: 'unused', label: 'Ishlatilmagan' },
        ...unusedModuleOptions
      ]
    },
    {
      key: 'business',
      label: 'Biznes holat bo‘yicha',
      type: 'filter',
      multi: true,
      options: [
        { key: 'business:ACTIVE', label: 'Aktiv' },
        { key: 'business:NEW', label: 'Yangi' },
        { key: 'business:PAUSED', label: 'Pauza' }
      ]
    },
    {
      key: 'support',
      label: 'Mas’ul xodim',
      type: 'filter',
      multi: false,
      options: [
        { key: 'support:all', label: 'Hammasi' },
        ...companyModuleSupportFilterOptions.value
      ]
    },
    {
      key: 'sort',
      label: 'Saralash',
      type: 'sort',
      options: companyModuleSortOptions.map(option => ({ ...option }))
    }
  ];
});

const companyModuleFilterActiveGroup = computed(() => companyModuleControlGroups.value
  .find(group => group.key === companyModuleFilterMenuGroup.value) || null);

const companyMrrControlGroups = computed(() => companyModuleControlGroups.value
  .filter(group => ['show', 'business', 'support'].includes(group.key)));

const companyMrrFilterActiveGroup = computed(() => companyMrrControlGroups.value
  .find(group => group.key === companyMrrFilterMenuGroup.value) || null);

const companyModuleFilterButtonLabel = computed(() => {
  const keys = companyModuleFilterKeys.value;
  let filterLabel = 'Hammasi';
  if (keys.length) {
    const labels = keys
      .map(key => findCompanyModuleControlOption('filter', key)?.option?.label)
      .filter(Boolean);
    if (labels.length === 1) filterLabel = labels[0];
    else if (labels.length === 2) filterLabel = labels.join(', ');
    else if (labels.length > 2) filterLabel = `${labels[0]}, +${labels.length - 1}`;
  }
  const sort = findCompanyModuleControlOption('sort', companyModuleSort.value);
  if (companyModuleSort.value !== 'modules_desc' && sort?.option?.label) {
    return `${filterLabel} · ${sort.option.label}`;
  }
  return filterLabel;
});

function companyModuleSupportStaffLabels(rows = []) {
  const labels = new Set();
  rows.forEach(row => {
    const label = companySupportLabel(row);
    if (label && label !== 'Biriktirilmagan') labels.add(label);
  });
  return [...labels].sort((a, b) => a.localeCompare(b, 'uz'));
}

const companyModuleFilteredRows = computed(() => companyModuleBaseRows.value
  .filter(row => matchesCompanyModuleFilter(row, companyModuleFilterKeys.value)));

const companyModuleTableSummary = computed(() => {
  const rows = companyModuleFilteredRows.value;
  const total = rows.length;
  if (!total) {
    return {
      total: 0,
      usedCount: 0,
      avgPercent: 0,
      modules: {},
      modulePercents: {},
      usedComparison: null,
      moduleComparisons: {},
      supportStaff: []
    };
  }
  const usedCount = rows.filter(row => Number(row.module_active_count || 0) > 0).length;
  const avgPercent = Math.round(
    rows.reduce((sum, row) => sum + Number(row.module_active_percent || 0), 0) / total
  );
  const modules = Object.fromEntries(
    companyModuleColumns.map(column => [
      column.key,
      rows.filter(row => Boolean(row.module_usage?.[column.key])).length
    ])
  );
  const modulePercents = Object.fromEntries(
    companyModuleColumns.map(column => [
      column.key,
      Math.round((modules[column.key] / total) * 100)
    ])
  );

  let usedComparison = null;
  const moduleComparisons = {};
  const hasPreviousReports = (companyModuleReportsPrevious.value?.report_dates || []).length > 0;
  if (companyModuleCompareEnabled.value && hasPreviousReports) {
    const prevAvgPercent = Math.round(
      rows.reduce((sum, row) => sum + Number(companyModuleActivePercent(row.previous_usage || {})), 0) / total
    );
    usedComparison = compareValue(avgPercent, prevAvgPercent, { isPercentage: true });

    companyModuleColumns.forEach(column => {
      const key = column.key;
      const currentPercent = modulePercents[key] || 0;
      const prevCount = rows.filter(row => Boolean(row.previous_usage?.[key])).length;
      const prevPercent = total ? Math.round((prevCount / total) * 100) : 0;
      moduleComparisons[key] = compareValue(currentPercent, prevPercent, { isPercentage: true });
    });
  }

  return {
    total,
    usedCount,
    avgPercent,
    modules,
    modulePercents,
    usedComparison,
    moduleComparisons,
    supportStaff: companyModuleSupportStaffLabels(rows)
  };
});

const companyModuleTableRows = computed(() => sortCompanyModuleRows(
  companyModuleFilteredRows.value,
  companyModuleSort.value
));

const companyModuleEmployeeActivity = computed(() => companyModuleEmployeeDetail.value?.employee_activity || null);

const companyModuleEmployeeDetailTitle = computed(() => {
  const row = companyModuleEmployeeDetail.value || {};
  return `${row.name || row.company_name || 'Kompaniya'} · xodimlar faolligi`;
});

const companyModuleEmployeeHasActivity = computed(() => Boolean(
  companyModuleEmployeeActivity.value
  && (
    Number(companyModuleEmployeeActivity.value.total_actions || 0) > 0
    || (companyModuleEmployeeActivity.value.active_employees || []).length
    || (companyModuleEmployeeActivity.value.inactive_employees || []).length
  )
));

const companyModuleEmployeeActiveCount = computed(() => Number(
  companyModuleEmployeeActivity.value?.active_employee_count
  ?? (companyModuleEmployeeActivity.value?.active_employees || []).filter(employee => Number(employee.action_count || 0) > 0).length
));

const companyModuleEmployeeInactiveCount = computed(() => Number(
  companyModuleEmployeeActivity.value?.inactive_employee_count
  ?? (companyModuleEmployeeActivity.value?.inactive_employees || []).length
));

const companyModuleEmployeeActiveRows = computed(() => {
  const rows = companyModuleEmployeeActivity.value?.active_employees || [];
  return [...rows].sort((a, b) => Number(b.action_count || 0) - Number(a.action_count || 0));
});

const companyModuleEmployeeInactiveRows = computed(() => {
  const rows = companyModuleEmployeeActivity.value?.inactive_employees || [];
  return [...rows].sort((a, b) => String(a.last_activity_date || '').localeCompare(String(b.last_activity_date || '')));
});

const companyModuleEmployeeReportLabel = computed(() => {
  const reports = companyModuleReports.value || {};
  const activity = companyModuleEmployeeActivity.value || {};
  const start = String(reports.range_start || '').trim();
  const end = String(reports.range_end || activity.report_date || companyModuleEmployeeDetail.value?.report_date || '').trim();
  if (reports.mode === 'range' && start && end && start !== end) {
    return `Hisobot davri: ${start} — ${end}`;
  }
  const date = end || start || String(activity.report_date || '').trim();
  return date ? `Hisobot: ${date}` : '';
});

const companyModuleEmployeePanelPeriodLabel = computed(() => {
  const reports = companyModuleReports.value || {};
  const activity = companyModuleEmployeeActivity.value;
  const panelLabel = companyModulePeriodLabel.value;
  if (!panelLabel) return '';
  if (activity?.aggregated && reports.mode === 'range') {
    return `Davr: ${panelLabel} · jamlangan`;
  }
  return `Davr: ${panelLabel}`;
});

const companyModuleEmployeeSupportLabel = computed(() => {
  const username = String(companyModuleEmployeeActivity.value?.support?.username || '').trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  const phone = String(companyModuleEmployeeActivity.value?.support?.phone || '').trim();
  return phone || '';
});

const companyInfoById = computed(() => {
  const map = new Map();
  filteredCompanyInfoRows.value.forEach(row => {
    const key = String(row.id || '').trim();
    if (key) map.set(key, row);
  });
  return map;
});

function companyModuleRowForChart(company = {}, reportRow = {}) {
  const module_usage = reportRow.module_usage || emptyCompanyModuleUsageMap();
  return {
    ...company,
    module_usage,
    module_active_count: Number(reportRow.module_active_count ?? companyModuleActiveCount(module_usage)),
    business_status: company.business_status,
    uyqur_support_username: company.uyqur_support_username
  };
}

function companyModuleChartExpectedDateKeys(period = 'week') {
  const today = tashkentDateKey();
  if (period === 'today') return [today];
  if (period === 'yesterday') return [addDaysToDateKey(today, -1)];
  if (period === 'week') {
    return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(today, index - 6));
  }
  if (period === 'month') {
    return Array.from({ length: 30 }, (_, index) => addDaysToDateKey(today, index - 29));
  }
  if (period === 'custom') {
    const start = companyModuleChartCustomPeriodForm.appliedStart;
    const end = companyModuleChartCustomPeriodForm.appliedEnd;
    if (!start || !end) return [];
    const rangeStart = start <= end ? start : end;
    const rangeEnd = start <= end ? end : start;
    const keys = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      keys.push(cursor);
      if (cursor === rangeEnd) break;
      cursor = addDaysToDateKey(cursor, 1);
      if (keys.length > 400) break;
    }
    return keys;
  }
  return [today];
}

function companyModuleChartDateKeys(dates = [], period = 'week') {
  const expected = companyModuleChartExpectedDateKeys(period);
  if (!expected.length) return [];

  if (period === 'today' || period === 'yesterday') {
    return expected;
  }

  if (period === 'week' || period === 'month') {
    return expected;
  }

  if (period === 'custom') {
    const available = [...new Set(dates.filter(Boolean))].sort();
    if (!available.length) return expected;
    const min = expected[0];
    const max = expected.at(-1);
    const inRange = available.filter(date => date >= min && date <= max);
    return inRange.length ? inRange : expected;
  }

  return expected;
}

function findCompanyModuleDailyRow(map, company = {}) {
  for (const key of companyModuleReportKeys(company)) {
    const row = map.get(key);
    if (row) return row;
  }
  return null;
}

function buildCompanyModuleChartDayRow(date, dailyRows, companyMap, filters, companyId = '') {
  const counts = Object.fromEntries(companyModuleKeys.map(key => [key, 0]));
  let totalCompanies = 0;
  let activitySum = 0;
  const selectedCompanyId = String(companyId || '').trim();
  const dailyByCompanyId = new Map();
  dailyRows
    .filter(row => row.report_date === date)
    .forEach(reportRow => {
      companyModuleReportRowKeys(reportRow).forEach(key => dailyByCompanyId.set(key, reportRow));
    });

  const candidates = selectedCompanyId
    ? [...companyMap.values()].filter(company => companyModuleReportKeys(company).includes(selectedCompanyId))
    : [...companyMap.values()];

  candidates.forEach(company => {
    const reportRow = findCompanyModuleDailyRow(dailyByCompanyId, company);
    const merged = companyModuleRowForChart(company, reportRow || {});
    if (!matchesCompanyModuleFilter(merged, filters)) return;
    totalCompanies += 1;
    activitySum += companyModuleActivePercent(merged.module_usage);
    companyModuleKeys.forEach(key => {
      if (merged.module_usage?.[key]) counts[key] += 1;
    });
  });
  const percents = Object.fromEntries(companyModuleKeys.map(key => [
    key,
    totalCompanies ? Math.round((counts[key] / totalCompanies) * 100) : 0
  ]));
  return {
    date_key: date,
    counts,
    percents,
    totalCompanies,
    avgActivity: totalCompanies ? Math.round(activitySum / totalCompanies) : 0
  };
}

function companyModuleChartRowLabel(dateKey = '', total = 0) {
  return companyModuleChartDateLabel(dateKey, total);
}

function companyModuleChartMetricValue(row = {}, key = '', metric = 'activity') {
  if (metric === 'actions') return Number(row.counts?.[key] || 0);
  return Number(row.percents?.[key] || 0);
}

function companyModuleChartValueText(value = 0, metric = 'activity') {
  if (metric === 'actions') return `${fmtNumber(value)} amal`;
  return `${fmtNumber(value)}%`;
}

function companyModuleChartMetricKeysSelected() {
  return [...companyModuleChartMetricKeys.value];
}

function companyModuleChartModuleIsActive(row = {}, key = '', metricKeys = []) {
  if (metricKeys.includes('activity') && companyModuleChartMetricValue(row, key, 'activity') > 0) return true;
  if (metricKeys.includes('actions') && companyModuleChartMetricValue(row, key, 'actions') > 0) return true;
  return false;
}

function companyModuleChartTooltipMetricTexts(row = {}, key = '', metricKeys = []) {
  const hasActivity = metricKeys.includes('activity');
  const hasActions = metricKeys.includes('actions');
  if (hasActivity && hasActions) {
    return {
      dual: true,
      activityText: companyModuleChartValueText(companyModuleChartMetricValue(row, key, 'activity'), 'activity'),
      actionsText: companyModuleChartValueText(companyModuleChartMetricValue(row, key, 'actions'), 'actions')
    };
  }
  const metric = hasActions ? 'actions' : 'activity';
  return {
    dual: false,
    valueText: companyModuleChartValueText(companyModuleChartMetricValue(row, key, metric), metric)
  };
}

function toggleCompanyModuleChartMetric(key = '') {
  const keys = [...companyModuleChartMetricKeys.value];
  const index = keys.indexOf(key);
  if (index >= 0) {
    if (keys.length === 1) return;
    keys.splice(index, 1);
  } else {
    keys.push(key);
  }
  companyModuleChartMetricKeys.value = keys;
  companyModuleChartHoverIndex.value = -1;
}

function toggleCompanyModuleChartModule(key = '') {
  const keys = [...companyModuleChartVisibleModules.value];
  const index = keys.indexOf(key);
  if (index >= 0) {
    if (keys.length === 1) return;
    keys.splice(index, 1);
  } else {
    keys.push(key);
  }
  companyModuleChartVisibleModules.value = keys;
}

function toggleCompanyModuleChartCompanyMenu() {
  companyModuleChartCompanyMenuOpen.value = !companyModuleChartCompanyMenuOpen.value;
}

function closeCompanyModuleChartCompanyMenu() {
  companyModuleChartCompanyMenuOpen.value = false;
}

function selectCompanyModuleChartCompany(companyId = '') {
  companyModuleChartCompanyId.value = String(companyId || '').trim();
  closeCompanyModuleChartCompanyMenu();
}

function isCompanyModuleBusinessActive(row = {}) {
  return String(row.business_status || '').toUpperCase() === 'ACTIVE';
}

const companyModuleChartCompanyOptions = computed(() => companyModuleBaseRows.value
  .filter(isCompanyModuleBusinessActive)
  .map(row => ({
    id: String(row.id || '').trim(),
    name: row.name || 'Kompaniya'
  }))
  .filter(row => row.id)
  .sort((a, b) => a.name.localeCompare(b.name, 'uz')));

const companyModuleChartCompanyLabel = computed(() => {
  const selected = String(companyModuleChartCompanyId.value || '').trim();
  if (!selected) return 'Hammasi';
  const option = companyModuleChartCompanyOptions.value.find(row => row.id === selected);
  return option?.name || 'Hammasi';
});

watch(companyModuleChartCompanyOptions, (options) => {
  const selected = String(companyModuleChartCompanyId.value || '').trim();
  if (!selected) return;
  if (!options.some(row => row.id === selected)) {
    companyModuleChartCompanyId.value = '';
  }
});

watch(companyModuleChartCompanyId, () => {
  companyModuleChartHoverIndex.value = -1;
});

function companyModuleChartAverageForRow(row = {}, metric = 'activity', visibleKeys = []) {
  const values = visibleKeys.map(key => companyModuleChartMetricValue(row, key, metric));
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function companyModuleChartAverageActivityForRow(row = {}, metric = 'activity', visibleKeys = []) {
  if (metric === 'activity') return Number(row.avgActivity || 0);
  return companyModuleChartAverageForRow(row, metric, visibleKeys);
}

const companyModuleChartRows = computed(() => {
  const source = companyModuleChartSource.value;
  const period = companyModuleChartPeriod.value;
  const dates = companyModuleChartDateKeys(source.report_dates || [], period);
  if (!dates.length) return [];

  const dailyRows = (!source.period || source.period === period) && Array.isArray(source.daily_companies)
    ? source.daily_companies
    : [];

  const companyMap = companyInfoById.value;
  const filters = companyModuleFilterKeys.value;
  const chartCompanyId = companyModuleChartCompanyId.value;
  const dateSet = new Set(dates);
  const scopedDailyRows = dailyRows.filter(row => dateSet.has(row.report_date));

  return finalizeCompanyModuleChartRows(dates.map(date => {
    const row = buildCompanyModuleChartDayRow(date, scopedDailyRows, companyMap, filters, chartCompanyId);
    return {
      ...row,
      date_label: companyModuleChartRowLabel(date, dates.length)
    };
  }));
});

const companyModuleChartActiveMetric = computed(() => {
  const keys = companyModuleChartMetricKeys.value;
  if (keys.includes('actions')) return 'actions';
  return 'activity';
});

const companyModuleChartAxisLabel = computed(() => (
  companyModuleChartActiveMetric.value === 'actions' ? 'Amallar soni' : 'Foiz (%)'
));

function onCompanyModuleChartPointer(clientX = 0) {
  const root = companyModuleChartRef.value;
  const svg = root?.querySelector('svg');
  const points = companyModuleChartPlotPoints.value;
  if (!svg || !points.length) {
    companyModuleChartHoverIndex.value = -1;
    return;
  }
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * COMPANY_MODULE_CHART_VIEW.width;
  let nearest = 0;
  let minDistance = Infinity;
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - x);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = index;
    }
  });
  companyModuleChartHoverIndex.value = nearest;
}

function onCompanyModuleChartMove(event) {
  onCompanyModuleChartPointer(event.clientX);
}

function onCompanyModuleChartTouch(event) {
  const touch = event.touches?.[0];
  if (!touch) return;
  onCompanyModuleChartPointer(touch.clientX);
}

const companyModuleChartPlotPoints = computed(() => {
  const rows = companyModuleChartRows.value;
  const dims = COMPANY_MODULE_CHART_DIMS;
  const width = dims.right - dims.left;
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  return rows.map((row, index) => ({
    index,
    date_key: row.date_key,
    label: row.date_label,
    x: rows.length > 1 ? dims.left + step * index : dims.left + width / 2,
    counts: row.counts || {},
    percents: row.percents || {},
    avgActivity: Number(row.avgActivity || 0)
  }));
});

const companyModuleChartYRange = computed(() => buildCompanyModuleChartYRange(
  companyModuleChartActiveMetric.value,
  companyModuleChartRows.value,
  companyModuleChartVisibleModules.value,
  companyModuleChartShowAverage.value
));

const companyModuleChartMin = computed(() => companyModuleChartYRange.value.min);
const companyModuleChartMax = computed(() => companyModuleChartYRange.value.max);

const companyModuleChartYTicks = computed(() => {
  const range = companyModuleChartYRange.value;
  const metric = companyModuleChartActiveMetric.value;
  const span = range.max - range.min;
  const step = metric === 'activity'
    ? (span <= 24 ? 5 : span <= 50 ? 10 : 20)
    : (span <= 12 ? 2 : span <= 30 ? 5 : 10);
  return moduleChartYTicksRange(range.min, range.max, COMPANY_MODULE_CHART_DIMS, step);
});

const companyModuleChartXTicks = computed(() => {
  const rows = companyModuleChartRows.value;
  if (!rows.length) return [];
  const dims = COMPANY_MODULE_CHART_DIMS;
  const width = dims.right - dims.left;
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  const stride = rows.length > 12 ? Math.ceil(rows.length / 8) : 1;
  const lastIndex = rows.length - 1;
  const indices = new Set();
  for (let i = 0; i < rows.length; i += stride) indices.add(i);
  indices.add(lastIndex);
  const sorted = [...indices].sort((a, b) => a - b);
  const secondLast = sorted[sorted.length - 2];
  if (secondLast !== undefined && lastIndex - secondLast < stride) indices.delete(secondLast);
  return rows
    .map((row, index) => ({
      date_key: row.date_key,
      label: row.date_label,
      x: rows.length > 1 ? dims.left + step * index : dims.left + width / 2,
      index
    }))
    .filter(tick => indices.has(tick.index));
});

const companyModuleChartLines = computed(() => {
  const rows = companyModuleChartRows.value;
  const metric = companyModuleChartActiveMetric.value;
  const minimum = companyModuleChartMin.value;
  const maximum = companyModuleChartMax.value;
  const dims = COMPANY_MODULE_CHART_DIMS;
  const width = dims.right - dims.left;
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;

  return companyModuleColumns.map(column => {
    const points = rows.map((row, index) => {
      const value = companyModuleChartMetricValue(row, column.key, metric);
      const x = rows.length > 1 ? dims.left + step * index : dims.left + width / 2;
      const y = companyModuleChartPlotY(value, minimum, maximum, dims);
      return {
        x: Math.round(x * 10) / 10,
        y,
        value,
        label: row.date_label
      };
    });
    return {
      key: column.key,
      label: column.label,
      color: COMPANY_MODULE_CHART_COLORS[column.key] || 'var(--primary)',
      points,
      path: smoothLinePath(points)
    };
  });
});

const companyModuleChartVisibleLines = computed(() => companyModuleChartLines.value
  .filter(line => companyModuleChartVisibleModules.value.includes(line.key)));

const companyModuleChartAverageLine = computed(() => {
  const rows = companyModuleChartRows.value;
  const metric = companyModuleChartActiveMetric.value;
  const visible = companyModuleChartVisibleModules.value;
  const minimum = companyModuleChartMin.value;
  const maximum = companyModuleChartMax.value;
  const dims = COMPANY_MODULE_CHART_DIMS;
  const width = dims.right - dims.left;
  const step = rows.length > 1 ? width / (rows.length - 1) : 0;
  const points = rows.map((row, index) => {
    const value = companyModuleChartAverageActivityForRow(row, metric, visible);
    const x = rows.length > 1 ? dims.left + step * index : dims.left + width / 2;
    const y = companyModuleChartPlotY(value, minimum, maximum, dims);
    return {
      x: Math.round(x * 10) / 10,
      y,
      value,
      label: row.date_label
    };
  });
  return {
    points,
    path: smoothLinePath(points)
  };
});

const companyModuleChartTooltip = computed(() => {
  const index = companyModuleChartHoverIndex.value;
  if (index < 0) return null;
  const point = companyModuleChartPlotPoints.value[index];
  const row = companyModuleChartRows.value[index];
  if (!point || !row) return null;
  const metricKeys = companyModuleChartMetricKeysSelected();
  const visible = companyModuleChartVisibleModules.value;
  const items = companyModuleColumns
    .filter(column => visible.includes(column.key))
    .filter(column => companyModuleChartModuleIsActive(row, column.key, metricKeys))
    .map(column => ({
      key: column.key,
      label: column.label,
      color: COMPANY_MODULE_CHART_COLORS[column.key],
      ...companyModuleChartTooltipMetricTexts(row, column.key, metricKeys)
    }));
  if (companyModuleChartShowAverage.value) {
    const activeKeys = visible.filter(key => companyModuleChartModuleIsActive(row, key, metricKeys));
    if (metricKeys.includes('activity') && metricKeys.includes('actions')) {
      items.push({
        key: 'average',
        label: 'O‘rtacha',
        color: '#111827',
        dual: true,
        activityText: companyModuleChartValueText(companyModuleChartAverageActivityForRow(row, 'activity', activeKeys), 'activity'),
        actionsText: companyModuleChartValueText(companyModuleChartAverageForRow(row, 'actions', activeKeys), 'actions')
      });
    } else {
      const metric = metricKeys.includes('actions') ? 'actions' : 'activity';
      items.push({
        key: 'average',
        label: 'O‘rtacha',
        color: '#111827',
        dual: false,
        valueText: companyModuleChartValueText(companyModuleChartAverageActivityForRow(row, metric, activeKeys), metric)
      });
    }
  }
  return {
    label: point.label,
    x: point.x,
    dual: metricKeys.includes('activity') && metricKeys.includes('actions'),
    items
  };
});

const companyModuleChartTooltipStyle = computed(() => {
  const tooltip = companyModuleChartTooltip.value;
  const root = companyModuleChartRef.value;
  if (!tooltip || !root) return {};
  const svg = root.querySelector('svg');
  if (!svg) return {};
  const rect = svg.getBoundingClientRect();
  const shellRect = root.getBoundingClientRect();
  const ratio = rect.width / COMPANY_MODULE_CHART_VIEW.width;
  const left = (rect.left - shellRect.left) + tooltip.x * ratio;
  const top = 72;
  const clampedLeft = Math.max(12, Math.min(left, shellRect.width - (tooltip.dual ? 230 : 190)));
  return {
    left: `${clampedLeft}px`,
    top: `${top}px`
  };
});

const companyModuleChartAriaLabel = computed(() => {
  const period = companyModuleChartPeriodLabel.value;
  const points = companyModuleChartRows.value.length;
  const metric = companyModuleChartActiveMetric.value === 'actions' ? 'amallar soni' : 'o‘rtacha faollik';
  return `Bo‘limlar dinamikasi grafigi, ${period}, ${metric}, ${points} ta nuqta`;
});

const companyModuleChartPeriodLabel = computed(() => {
  if (companyModuleChartPeriod.value === 'custom'
    && companyModuleChartCustomPeriodForm.appliedStart
    && companyModuleChartCustomPeriodForm.appliedEnd) {
    return `${dateInputLabel(companyModuleChartCustomPeriodForm.appliedStart)} — ${dateInputLabel(companyModuleChartCustomPeriodForm.appliedEnd)}`;
  }
  return companyModulePeriodOptions.find(period => period.key === companyModuleChartPeriod.value)?.label || '7 kun';
});

const companyAlerts = computed(() => visibleCompanyInfoRows.value
  .filter(row => ['expired', 'soon'].includes(row.expiry_state))
  .sort((a, b) => Number(a.days_until_expiry ?? 9999) - Number(b.days_until_expiry ?? 9999))
  .slice(0, 6));
const productUsageRows = computed(() => visibleCompanyInfoRows.value
  .slice()
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
const filteredProductUsageRows = computed(() => productUsageRows.value.filter(includesSearch));
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
    risk: productUsageRows.value.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state)).length
  };
});
const businessStatusRows = computed(() => [
  { label: 'Aktiv', count: productUsageRows.value.filter(row => row.business_status === 'ACTIVE').length, color: 'green' },
  { label: 'Yangi', count: productUsageRows.value.filter(row => row.business_status === 'NEW').length, color: 'blue' },
  { label: 'Churn/Pauza', count: productUsageRows.value.filter(isCompanyChurn).length, color: 'orange' }
]);
const businessStatusChartMax = computed(() => Math.max(1, ...businessStatusRows.value.map(row => Number(row.count || 0))));
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
const topSupportCards = computed(() => supportPerformanceRows.value
  .filter(shouldShowInSupportRanking)
  .map((row, index) => {
    const employee = resolveEmployeeForCompany(row);
    const companies = visibleCompanyInfoRows.value.filter(company => companyMatchesEmployee(company, employee));
    const companySummary = companyPortfolioSummary(companies);
    return {
      ...employee,
      ...row,
      rank: index + 1,
      assigned_companies: companies,
      company_summary: companySummary,
      company_total: companies.length,
      company_active: companySummary.active,
      company_churn: companySummary.churn,
      company_expiring_soon: companySummary.expiring_soon,
      // Comparison metrics
      closed_comparison: comparisonEnabled.value ? compareValue(row.closed_requests, row.prev_closed_requests, { unit: 'ta' }) : null,
      open_comparison: comparisonEnabled.value ? compareValue(row.open_requests, row.prev_open_requests, { invert: true, unit: 'ta' }) : null,
      sla_comparison: comparisonEnabled.value ? compareValue(row.sla, row.prev_close_rate, { isPercentage: true }) : null,
      avg_comparison: comparisonEnabled.value ? compareValue(row.avg_close_minutes, row.prev_avg_close_minutes, { invert: true, unit: 'min' }) : null
    };
  }));

const rankingClosedRequestsTotal = computed(() => topSupportCards.value.reduce(
  (sum, row) => sum + Number(row.closed_requests || 0),
  0
));

const rankingPrevClosedRequestsTotal = computed(() => topSupportCards.value.reduce(
  (sum, row) => sum + Number(row.prev_closed_requests || 0),
  0
));

const rankingCloseRate = computed(() => {
  const closed = rankingClosedRequestsTotal.value;
  const open = rankingOpenRequestsTotal.value;
  const total = closed + open;
  return total > 0 ? (closed / total) * 100 : Number(selectedPeriodStats.value.close_rate || 0);
});

const rankingOpenRequestsTotal = computed(() => topSupportCards.value.reduce(
  (sum, row) => sum + Number(row.open_requests || 0),
  0
));

const rankingOverdueOpenRequestsTotal = computed(() => countAssignedOverdueOpenRequests(rankingOpenRequests.value || []));

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
const chatDetailActiveRequest = computed(() => {
  if (!inlineReplyForm.request_id) return null;
  return (chatDetail.value.requests || []).find(request => isSameRequest(request, inlineReplyForm.request_id)) || null;
});
const metricChatConversation = computed(() => metricChatDetail.value.conversation || []);
const metricChatTitle = computed(() => {
  const chat = metricChatDetail.value.chat;
  return chat ? chat.title || chat.username || chat.chat_id || 'Chat' : 'Chat tanlanmagan';
});
function countTicketListRows(rows = [], { source = 'all', status = 'all' } = {}) {
  return rows.filter(row => ticketMatchesSource(row, source) && ticketMatchesStatus(row, status)).length;
}

const ticketListCounts = computed(() => {
  const rows = ticketList.value.rows || [];
  const source = ticketList.value.source || 'all';
  return {
    all: countTicketListRows(rows, { source }),
    open: countTicketListRows(rows, { source, status: 'open' }),
    closed: countTicketListRows(rows, { source, status: 'closed' }),
    group: countTicketListRows(rows, { source: 'group' }),
    group_open: countTicketListRows(rows, { source: 'group', status: 'open' }),
    group_closed: countTicketListRows(rows, { source: 'group', status: 'closed' }),
    private: countTicketListRows(rows, { source: 'private' }),
    private_open: countTicketListRows(rows, { source: 'private', status: 'open' }),
    private_closed: countTicketListRows(rows, { source: 'private', status: 'closed' })
  };
});
function buildTicketListEmployeeMappings() {
  const mappings = [];
  employees.value
    .filter(row => !isAdminLikeEmployee(row) && (isSupportEmployee(row) || isManagerEmployee(row)))
    .forEach(employee => {
      const mapping = buildOpenRequestEmployeeMapping(employee, mappings);
      if (mapping) mappings.push(mapping);
    });
  return mappings;
}

function ticketInvolvesManager(row = {}) {
  const managers = employees.value.filter(employee => !isAdminLikeEmployee(employee) && isManagerEmployee(employee));
  if (!managers.length) return false;
  const managerIds = new Set(managers.map(employee => String(employee.id || '').trim()).filter(Boolean));
  const involvedIds = [
    row.closed_by_employee_id,
    row.opened_by_employee_id,
    row.assigned_to_employee_id,
    row.responsible_employee_id
  ].map(id => String(id || '').trim()).filter(Boolean);
  if (involvedIds.some(id => managerIds.has(id))) return true;
  const names = [row.closed_by_name, row.responsible_employee_name, row.support_name].filter(Boolean);
  return managers.some(manager => {
    const managerName = String(manager.full_name || '').trim();
    const managerUsername = normalizeSupportUsername(manager.username);
    return names.some(name => supportIdentitiesMatch(name, managerName)
      || (managerUsername && supportIdentitiesMatch(name, managerUsername)));
  });
}

function ticketMatchesSupportFilter(row = {}, filterValue = 'all') {
  if (!filterValue || filterValue === 'all') return true;
  if (filterValue === 'manager:all') return ticketInvolvesManager(row);
  const employee = employees.value.find(item => !isAdminLikeEmployee(item)
    && isSupportEmployee(item)
    && supportRowKey(item) === filterValue);
  if (!employee) return false;
  const matched = resolveOpenRequestEmployeeMapping(row, buildTicketListEmployeeMappings());
  return String(matched?.id || '').trim() === String(employee.id || '').trim();
}

const ticketListSupportOptions = computed(() => {
  const options = [{ value: 'all', label: 'Barcha supportlar' }];
  employees.value
    .filter(row => !isAdminLikeEmployee(row) && isSupportEmployee(row))
    .slice()
    .sort((left, right) => String(left.full_name || left.username || '').localeCompare(String(right.full_name || right.username || '')))
    .forEach(employee => {
      const key = supportRowKey(employee);
      if (!key) return;
      options.push({
        value: key,
        label: employee.full_name || employee.username || 'Support'
      });
    });
  const hasManagers = employees.value.some(row => !isAdminLikeEmployee(row) && isManagerEmployee(row));
  if (hasManagers) {
    options.push({ value: 'manager:all', label: 'Barcha menejerlar' });
  }
  return options;
});
const filteredTicketListRows = computed(() => {
  const searchText = ticketListSearch.value.toLowerCase().trim();
  return (ticketList.value.rows || [])
    .filter(row => ticketMatchesSource(row, ticketList.value.source))
    .filter(row => ticketMatchesStatus(row, ticketList.value.active))
    .filter(row => ticketMatchesSupportFilter(row, ticketListSupport.value))
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
const employeeProfileCompanyTotal = computed(() => {
  const companies = employeeCompanyDetail.value.companies?.length
    ? employeeCompanyDetail.value.companies
    : (employeeProfile.value.companies || []);
  if (companies.length) return companies.length;
  return Number(
    employeeCompanyDetail.value.summary?.total
    ?? employeeProfile.value.summary?.company_total
    ?? 0
  );
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
    closed_count: Math.max(Number(group.closed_count || 0), closedRequests.length),
    open_count: Math.max(Number(group.open_count || 0), openRequests.length),
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
    chat_id: request.chat_id || null,
    direction: 'inbound',
    actor_type: 'customer',
    origin_type: 'customer',
    source_label: 'Mijoz',
    actor_name: request.customer_name || 'Mijoz',
    actor_username: request.customer_username || '',
    actor_tg_user_id: request.customer_tg_id || null,
    employee_id: null,
    text: request.initial_text || '',
    media: request.media || null,
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
  if (isSystemMessage(message)) {
    return { ...message, direction: 'system', type: message.type || 'service', text: message.text || '', created_at: message.created_at || null };
  }
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

function findEmployeeProfileRequestForMessage(message = {}, requestRows = []) {
  const requestId = String(message.request_id || '').trim();
  const messageId = String(message.message_id || message.tg_message_id || '').trim();
  if (requestId) {
    const byId = requestRows.find(row => String(row.id || '') === requestId);
    if (byId) return byId;
  }
  if (messageId) {
    return requestRows.find(row => String(row.initial_message_id || '') === messageId) || null;
  }
  return null;
}

function employeeChatMessageConversationItem(message = {}, employee = {}, requestRows = []) {
  if (isSystemMessage(message)) {
    return { ...message, direction: 'system', type: message.type || 'service', text: message.text || '', created_at: message.created_at || null };
  }
  const outbound = messageBelongsToEmployee(message, employee)
    || ['employee_message', 'admin_reply', 'ai_reply', 'bot_reply', 'bot_broadcast', 'bot_notification', 'bot_message'].includes(message.classification || '');
  const origin = message.origin_type || message.actor_type || (outbound ? 'employee' : 'customer');
  const linkedRequest = findEmployeeProfileRequestForMessage(message, requestRows);
  return {
    id: message.id || `chat-message-${message.chat_id || ''}-${message.message_id || message.created_at || ''}`,
    type: outbound ? 'employee_reply' : 'chat_message',
    request_id: message.request_id || linkedRequest?.id || null,
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
    request_text: message.request_text || linkedRequest?.initial_text || '',
    status: message.status || linkedRequest?.status || '',
    classification: message.classification || '',
    created_at: message.created_at || null
  };
}

function employeeScopedConversation(row = {}, employee = {}) {
  const requestRows = [
    ...(Array.isArray(row.open_requests) ? row.open_requests : []).map(request => ({ ...request, status: request.status || 'open' })),
    ...(Array.isArray(row.closed_requests) ? row.closed_requests : []).map(request => ({ ...request, status: request.status || 'closed' }))
  ];
  const requests = requestRows.map(employeeRequestConversationItem);
  const requestEvents = requestRows.flatMap(request => employeeRequestEventConversationItems(request, employee));
  const messages = Array.isArray(row.chat_messages)
    ? row.chat_messages
      .map(message => employeeChatMessageConversationItem(message, employee, requestRows))
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
  return conversation.length ? conversation : employeeScopedConversation(chat, employee);
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
  { key: 'sla', label: 'SLA ⓘ', slot: 'sla', action: 'employeeCompanies', tooltip: 'SLA = yopilgan / (yopilgan + xodimga biriktirilgan ochiq). O‘rtacha vaqt = shu ticketlarning javob/kutish daqiqalari o‘rtachasi (tanlangan davr).' }
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

const managerMemberColumns = [
  { key: 'full_name', label: 'Menejer', action: 'employeeCompanies' },
  { key: 'closed_requests', label: 'Yopilgan', format: fmtNumber },
  { key: 'handled_chats', label: 'Guruh/chat', format: fmtNumber },
  { key: 'avg_close_minutes', label: 'O‘rtacha vaqt', format: fmtMinutes },
  { key: 'sla', label: 'SLA', format: fmtPercent }
];

const employeeColumns = [
  { key: 'select', label: '', slot: 'select' },
  { key: 'full_name', label: 'Xodim', action: 'employeeInfo' },
  { key: 'tg_user_id', label: 'Telegram raqami', format: v => v || '—', action: 'employeeInfo' },
  { key: 'username', label: 'Foydalanuvchi nomi', format: v => v ? `@${v}` : '—', action: 'employeeInfo' },
  { key: 'clickup_user_id', label: 'ClickUp ID', format: v => v || '—', action: 'employeeInfo' },
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

const clickupColumns = [
  { key: 'title', label: 'Vazifa', truncate: true },
  { key: 'chat_title', label: 'Guruh', format: value => value || '—' },
  { key: 'clickup_list_key', label: 'Oqim', format: value => value === 'big_team' ? 'Big team' : value === 'newbies' ? 'Newbies' : '—', badge: true },
  { key: 'mentioned_usernames', label: 'Mention', format: value => Array.isArray(value) && value.length ? value.map(item => `@${item}`).join(', ') : '—', truncate: true },
  { key: 'assignee_clickup_ids', label: 'ClickUp mas’ul', format: value => Array.isArray(value) && value.length ? value.join(', ') : '—', truncate: true },
  { key: 'status', label: 'Holat', format: value => ({ created: 'Yaratildi', closed: 'Yopildi', error: 'Xato', pending: 'Kutilmoqda', skipped: 'O‘tkazildi' }[value] || value || '—'), badge: true },
  { key: 'created_at', label: 'Sana', format: fmtDate },
  { key: 'message_link', label: 'Telegram', slot: 'telegramLink' },
  { key: 'clickup_task_url', label: 'ClickUp', slot: 'clickupLink' },
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
  { key: 'name', label: 'Kompaniya', action: 'companyEdit' },
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
  { key: 'name', label: 'Kompaniya', action: 'companyGroups' },
  { key: 'brand', label: 'Brend', format: v => v || '—', action: 'companyGroups' },
  { key: 'business_status', label: 'Biznes holati', slot: 'businessStatus', action: 'companyGroups' },
  { key: 'expired', label: 'Obuna', format: (_, row) => expiryStatusLabel(row), action: 'companyGroups' },
  { key: 'phone', label: 'Telefon', format: v => v || '—', action: 'companyGroups' }
];

const privateColumns = [
  { key: 'title', label: 'Chat', action: 'telegram' },
  { key: 'source_type', label: 'Tur', format: sourceTypeLabel, badge: true, action: 'chatDetail' },
  { key: 'employee_name', label: 'Xodim', format: (value, row) => value || (row.employee_username ? `@${row.employee_username}` : '—'), action: 'chatDetail' },
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
  { key: 'initial_text', label: 'Kelgan so‘rov', slot: 'initialText' },
  { key: 'status', label: 'Holat', format: statusLabel, badge: true, action: 'chatDetail' },
  { key: 'closed_by_name', label: 'Yopgan', format: v => v || '—', action: 'chatDetail' },
  { key: 'solution_text', label: 'Javob', truncate: true, format: v => v || '—', action: 'chatDetail' },
  { key: 'created_at', label: 'Kelgan', format: fmtDate },
  { key: 'solution_at', label: 'Vaqt', format: fmtDate },
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
  if (isSystemMessage(message)) return 'Telegram';
  const origin = String(message.origin_type || message.actor_type || '').trim().toLowerCase();
  if (origin === 'admin') return 'Admin';
  if (origin === 'bot') return 'Bot';
  if (origin === 'ai') return 'AI';
  if (origin === 'employee') return 'Xodim';
  if (origin === 'customer') return 'Mijoz';
  if (message.direction === 'outbound') return 'Xodim';
  return 'Mijoz';
}

function isSystemMessage(message = {}) {
  return message.direction === 'system' || message.type === 'service' || message.origin_type === 'system';
}

function chatBubbleKey(message) {
  return `${message.message_id || message.id || 'msg'}:${message.created_at || ''}`;
}

function chatMessageDomId(message = {}) {
  const messageId = message.message_id || message.id;
  return messageId ? `chat-msg-${messageId}` : '';
}

function previewFirstWords(text = '', count = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '—';
  if (words.length <= count) return words.join(' ');
  return `${words.slice(0, count).join(' ')}...`;
}

function messageRequestStatus(message = {}) {
  if (message.status) return String(message.status).toLowerCase();
  const requestId = String(message.request_id || '').trim();
  const messageId = String(message.message_id || '').trim();
  const lookup = modal.value === 'companyGroupActivity'
    ? [...(companyGroupRequests.value || [])]
    : modal.value === 'employeeCompanies'
      ? [
        ...(employeeProfileChatDetail.value.requests || []),
        ...(employeeProfileChatRequests.value || [])
      ]
      : modal.value === 'metricDetail'
        ? [...(metricChatDetail.value.requests || [])]
        : [
          ...(chatDetail.value.requests || []),
          ...(employeeProfileChatDetail.value.requests || []),
          ...(employeeProfileChatRequests.value || [])
        ];
  if (requestId) {
    const request = lookup.find(row => isSameRequest(row, requestId));
    if (request?.status) return String(request.status).toLowerCase();
  }
  if (messageId) {
    const request = lookup.find(row => String(row.initial_message_id || '') === messageId);
    if (request?.status) return String(request.status).toLowerCase();
  }
  return '';
}

function messageRequestRow(message = {}) {
  const requestId = String(message.request_id || '').trim();
  const messageId = String(message.message_id || '').trim();
  const lookup = modal.value === 'companyGroupActivity'
    ? [...(companyGroupRequests.value || [])]
    : modal.value === 'employeeCompanies'
      ? [
        ...(employeeProfileChatDetail.value.requests || []),
        ...(employeeProfileChatRequests.value || [])
      ]
      : modal.value === 'metricDetail'
        ? [...(metricChatDetail.value.requests || [])]
        : [
          ...(chatDetail.value.requests || []),
          ...(employeeProfileChatDetail.value.requests || []),
          ...(employeeProfileChatRequests.value || [])
        ];
  if (requestId) {
    const request = lookup.find(row => isSameRequest(row, requestId));
    if (request) return request;
  }
  if (messageId) {
    const request = lookup.find(row => String(row.initial_message_id || '') === messageId);
    if (request) return request;
  }
  return null;
}

function messageStatusLabel(message = {}) {
  const request = messageRequestRow(message);
  if (request) return requestStatusLabel(request, message);
  const status = messageRequestStatus(message);
  return status ? statusLabel(status) : '';
}

function messageStatusBadgeClass(message = {}) {
  const status = messageRequestStatus(message);
  if (status === 'closed') return 'green';
  if (status === 'open') return 'orange';
  if (status === 'cancelled') return 'blue';
  return '';
}

function showMessageStatus(message = {}) {
  return !!messageStatusLabel(message);
}

function isTicketMessage(message = {}) {
  if (String(message.type || '').toLowerCase() === 'ticket') return true;
  return Boolean(String(message.request_text || '').trim());
}

function isOpenTicketMessage(message = {}) {
  if (!isTicketMessage(message) || isClosedTicketMessage(message)) return false;
  const status = messageRequestStatus(message);
  return !status || status === 'open';
}

function isClosedTicketMessage(message = {}) {
  return isTicketMessage(message) && messageRequestStatus(message) === 'closed';
}

function isChatMessageFocused(message = {}) {
  const messageId = String(message.message_id || message.id || '').trim();
  return Boolean(messageId && messageId === chatDetailFocusedMessageId.value);
}

function findConversationMessageForRequest(request = {}, conversation = []) {
  const initialId = String(request.initial_message_id || '').trim();
  const requestId = requestIdentity(request);
  if (initialId) {
    const byMessageId = conversation.find(message => String(message.message_id || '').trim() === initialId);
    if (byMessageId) return byMessageId;
  }
  if (!requestId) return null;
  return conversation.find(message => String(message.request_id || '').trim() === requestId
    && String(message.direction || '').toLowerCase() !== 'outbound') || null;
}

async function scrollChatDetailToMessage(message = {}) {
  await nextTick();
  const thread = chatDetailThreadRef.value;
  const domId = chatMessageDomId(message);
  if (!thread || !domId) return false;
  const target = thread.querySelector(`#${CSS.escape(domId)}`);
  if (!target) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  chatDetailFocusedMessageId.value = String(message.message_id || message.id || '').trim();
  window.setTimeout(() => {
    if (chatDetailFocusedMessageId.value === String(message.message_id || message.id || '').trim()) {
      chatDetailFocusedMessageId.value = '';
    }
  }, 2200);
  return true;
}

async function focusChatRequest(request = {}) {
  const message = findConversationMessageForRequest(request, chatConversation.value);
  if (message) await scrollChatDetailToMessage(message);
  if (request.status !== 'open') {
    cancelInlineReply();
    if (!message) showToast('Dialogda xabar topilmadi');
    else showToast('Bu so‘rov allaqachon yopilgan');
    return;
  }
  openInlineReply(request);
  if (!message) showToast('Dialogda xabar topilmadi, lekin javob yozishingiz mumkin');
}

async function sendChatDetailRequestReply() {
  const request = chatDetailActiveRequest.value;
  if (!request) {
    cancelInlineReply();
    return;
  }
  await sendInlineRequestReply(request);
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

function audioMediaMimeType(media = {}) {
  const mime = String(media.mime_type || '').trim().toLowerCase();
  if (mime.includes('ogg') || mime.includes('opus')) {
    return mime.includes('codecs') ? mime : 'audio/ogg; codecs=opus';
  }
  if (mime) return mime;
  if (media.kind === 'voice') return 'audio/ogg; codecs=opus';
  if (media.kind === 'audio') return 'audio/mpeg';
  return 'audio/ogg; codecs=opus';
}

function mediaAudioKey(media = {}) {
  const fileId = media?.file_id || '';
  return fileId ? `${fileId}:${mediaUrl(media)}` : '';
}

function mediaAudioReady(media = {}) {
  return Boolean(media?.file_id && mediaUrl(media) && !mediaErrors.value[media.file_id]);
}

function mediaDownloadName(media = {}) {
  if (media?.file_name) return media.file_name;
  if (media?.kind === 'voice') return 'voice.ogg';
  if (media?.kind === 'audio') return 'audio.mp3';
  if (media?.kind === 'photo') return 'photo.jpg';
  if (media?.kind === 'video') return 'video.mp4';
  if (media?.kind === 'animation') return 'animation.mp4';
  if (media?.kind === 'video_note') return 'video-note.mp4';
  if (media?.kind === 'sticker') return 'sticker.webp';
  if (media?.kind === 'document') return 'document.bin';
  return 'telegram-file';
}

function onAudioPlaybackError(media = {}) {
  const fileId = media?.file_id;
  if (!fileId) return;
  mediaErrors.value = {
    ...mediaErrors.value,
    [fileId]: 'Brauzer ovozni ijro eta olmadi. Qayta yuklash yoki havolani yangi oynada oching.'
  };
}

function isDocumentMedia(media) {
  return media?.kind === 'document';
}

function showMediaOpenLink(media) {
  return Boolean(media && media.file_id && mediaUrl(media));
}

function mediaOpenLabel(media) {
  if (media?.kind === 'voice') return 'Ovozli xabarni alohida ochish';
  if (media?.kind === 'audio') return 'Audioni alohida ochish';
  return 'Faylni ochish';
}

function telegramMessageLink(message = {}) {
  const tgMessageId = message?.message_id || message?.tg_message_id || message?.media?.tg_message_id;
  const chatId = message?.chat_id || message?.media?.chat_id;
  if (!tgMessageId || !chatId) return '';
  const chatStr = String(chatId);
  if (chatStr.startsWith('-100')) {
    return `https://t.me/c/${chatStr.slice(4)}/${tgMessageId}`;
  }
  if (chatStr.startsWith('-')) {
    return `https://t.me/c/${chatStr.slice(1)}/${tgMessageId}`;
  }
  return '';
}

function showTelegramOpenLink(message = {}) {
  const media = message?.media;
  if (!media || !media.file_id) return false;
  const error = String(mediaErrors.value[media.file_id] || '');
  if (!error) return false;
  return Boolean(telegramMessageLink(message));
}

function mediaPlaceholder(media) {
  if (!media) return 'Fayl';
  const labels = {
    sticker: 'Stikerli xabar',
    photo: 'Rasm',
    video: 'Video',
    video_note: 'Video xabar',
    animation: 'Animatsiya',
    voice: 'Ovozli xabar',
    audio: 'Audio',
    document: media.file_name || 'Fayl'
  };
  const baseLabel = labels[media.kind] || 'Fayl';
  if (mediaErrors.value[media.file_id]) {
    const detail = String(mediaErrors.value[media.file_id] || '').trim();
    if (detail.length > 72) return `${baseLabel} (Yuklab bo‘lmadi)`;
    return `${baseLabel} (${detail})`;
  }
  if (mediaLoading.value[media.file_id]) {
    return `${baseLabel} yuklanmoqda...`;
  }
  return baseLabel;
}

function chatMessageText(message = {}) {
  const text = String(message?.text || '').trim();
  if (text) return text;
  if (message?.media?.kind === 'sticker') return 'Stikerli xabar';
  return '';
}

function chatMessageBodyText(message = {}) {
  const text = String(message?.text || '').trim();
  if (!text) return '';
  if (message?.media?.kind) {
    const kind = message.media.kind;
    if (kind === 'sticker' && (text === 'Stikerli xabar' || text === 'Sticker')) return '';
    if (kind === 'audio' && (text === 'Audio xabar' || text === 'Audio' || text === 'Audioni alohida ochish')) return '';
    if (kind === 'voice' && (text === 'Ovozli xabar' || text === 'Ovozli xabarni alohida ochish')) return '';
    if (kind === 'photo' && (text === 'Rasmli xabar' || text === 'Rasm')) return '';
    if (kind === 'video' && (text === 'Videoli xabar' || text === 'Video')) return '';
    if (kind === 'video_note' && (text === 'Video xabar' || text === 'Video note')) return '';
    if (kind === 'animation' && (text === 'Animatsiyali xabar' || text === 'Animatsiya')) return '';
    if (kind === 'document' && (text === 'Faylli xabar' || text === 'Fayl' || text === message.media.file_name)) return '';
  }
  return text;
}

function showRequestBadge(message = {}) {
  const status = messageRequestStatus(message);
  if (status === 'closed' || status === 'cancelled') return false;
  if (String(message?.type || '').toLowerCase() === 'ticket') return true;
  if (!String(message?.request_text || '').trim()) return false;
  const direction = String(message?.direction || '').toLowerCase();
  const origin = String(message?.origin_type || message?.actor_type || '').toLowerCase();
  const type = String(message?.type || '').toLowerCase();
  const classification = String(message?.classification || '').toLowerCase();
  if (direction === 'outbound' || origin === 'employee') return false;
  if (['employee_reply', 'admin_reply', 'solution'].includes(type)) return false;
  if (['employee_message', 'admin_reply', 'ai_reply', 'bot_reply', 'bot_broadcast', 'bot_notification', 'bot_message'].includes(classification)) return false;
  return true;
}

const allowedChatHtmlTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'INS', 'S', 'STRIKE', 'DEL', 'CODE', 'PRE', 'BR', 'A']);

function escapeHtmlText(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeChatHtml(raw = '') {
  const text = String(raw || '');
  if (typeof document === 'undefined') {
    return escapeHtmlText(text).replace(/\n/g, '<br>');
  }
  const template = document.createElement('template');
  template.innerHTML = text;
  const sanitizeNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }
    const tag = node.tagName;
    if (!allowedChatHtmlTags.has(tag)) {
      Array.from(node.childNodes).forEach(sanitizeNode);
      const fragment = document.createDocumentFragment();
      while (node.firstChild) fragment.appendChild(node.firstChild);
      node.replaceWith(fragment);
      return;
    }
    Array.from(node.attributes || []).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (tag === 'A' && name === 'href') {
        try {
          const url = new URL(attribute.value, window.location.origin);
          if (['http:', 'https:', 'mailto:', 'tg:'].includes(url.protocol)) return;
        } catch (_error) {
          // Drop unsafe or malformed URLs.
        }
      }
      node.removeAttribute(attribute.name);
    });
    if (tag === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    Array.from(node.childNodes).forEach(sanitizeNode);
  };
  Array.from(template.content.childNodes).forEach(sanitizeNode);
  return template.innerHTML.replace(/\n/g, '<br>');
}

function chatMessageHtml(message = {}) {
  return sanitizeChatHtml(chatMessageBodyText(message));
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

function ticketBarPercent(part = 0, total = 0) {
  const safeTotal = Number(total) || 0;
  const safePart = Number(part) || 0;
  if (!safeTotal) return '0%';
  return `${Math.max(0, Math.min(100, (safePart / safeTotal) * 100))}%`;
}

function companyTicketClosedStyle(row = {}) {
  return { width: ticketBarPercent(row.closed_requests, row.total_requests) };
}

function companyTicketOpenStyle(row = {}) {
  const total = Number(row.total_requests) || 0;
  const closedPct = total ? (Number(row.closed_requests) / total) * 100 : 0;
  const openPct = total ? (Number(row.open_requests) / total) * 100 : 0;
  return { left: `${closedPct}%`, width: `${openPct}%` };
}

async function retryMediaLoad(media) {
  if (!media?.file_id) return;
  const fileId = media.file_id;
  const existing = mediaUrls.value[fileId];
  if (existing) {
    try { URL.revokeObjectURL(existing); } catch (_error) { }
    const nextUrls = { ...mediaUrls.value };
    delete nextUrls[fileId];
    mediaUrls.value = nextUrls;
  }
  const nextErrors = { ...mediaErrors.value };
  delete nextErrors[fileId];
  mediaErrors.value = nextErrors;
  const nextLoading = { ...mediaLoading.value };
  delete nextLoading[fileId];
  mediaLoading.value = nextLoading;
  await loadConversationMedia([{ media }]);
}

async function loadConversationMedia(messages = []) {
  const loadToken = mediaLoadToken;
  const mediaItems = messages
    .filter(message => message && message.media && message.media.file_id)
    .map(message => ({
      ...message.media,
      chat_id: message.media.chat_id || message.chat_id || null,
      tg_message_id: message.media.tg_message_id || message.message_id || message.tg_message_id || null,
      thumbnail_file_id: message.media.thumbnail_file_id || null
    }))
    .filter(media => !mediaUrls.value[media.file_id]);
  const uniqueMedia = [...new Map(mediaItems.map(media => [media.file_id, media])).values()];
  if (!uniqueMedia.length) return;

  await Promise.all(uniqueMedia.map(async media => {
    mediaLoading.value = { ...mediaLoading.value, [media.file_id]: true };
    try {
      const blob = await api.telegramFile(media);
      const bytes = await blob.arrayBuffer();
      const mimeType = audioMediaMimeType(media) || blob.type || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
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
    if (activeTab.value === 'companyActivity') {
      await loadCompanyActivity();
      startCompanyActivitySyncTimer();
    } else {
      stopCompanyActivitySyncTimer();
    }
    if (activeTab.value === 'groups') {
      await Promise.all([
        api.groups().then(rows => { groups.value = rows; }),
        loadCompanyInfoOptional({ cached: true })
      ]);
    }
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'companies') await loadCompanyInfo();
    if (activeTab.value === 'clickup') await loadClickUpTasks();
    if (activeTab.value === 'knowledgeBase') await loadSettings();
    if (activeTab.value === 'settings') await loadSettings();
    if (activeTab.value === 'settings') checkTelegramWebhook(false).catch(() => null);
  } catch (error) {
    showToast(error.message);
    if (/token/i.test(error.message)) logout();
  } finally {
    stopLoading('refresh');
  }
}

async function loadDashboard() {
  const loadToken = ++dashboardLoadToken;
  const data = await api.dashboard(dashboardPeriodQuery());
  if (loadToken !== dashboardLoadToken) return;
  const nextAnalytics = data.analytics || {};
  const { analytics: _ignoredAnalytics, ...rest } = data;
  Object.assign(dashboard, rest);
  dashboard.analytics = nextAnalytics;
}

async function loadPeriodOpenTickets() {
  const loadToken = ++periodOpenTicketsLoadToken;
  try {
    const rows = await api.requests({
      ...dashboardPeriodQuery(),
      limit: 5000
    });
    if (loadToken !== periodOpenTicketsLoadToken) return;
    periodTicketRows.value = (Array.isArray(rows) ? rows : [])
      .filter(request => isInSelectedPeriodDate(request.created_at));
  } catch {
    if (loadToken !== periodOpenTicketsLoadToken) return;
    periodTicketRows.value = [];
  }
}

async function loadCompanyModuleReports(query = {}, loadToken = companyModuleReportsLoadToken) {
  const data = await api.companyModuleReports(query);
  if (loadToken !== companyModuleReportsLoadToken) return data;
  const period = query.period || companyModulePeriod.value || data.period || 'today';
  if (data.period && query.period && data.period !== query.period) return data;
  companyModuleReports.value = {
    ...data,
    period
  };
  return data;
}

async function loadCompanyModuleReportsOptional(query = {}) {
  const loadToken = ++companyModuleReportsLoadToken;
  try {
    return await loadCompanyModuleReports(query, loadToken);
  } catch (error) {
    if (loadToken !== companyModuleReportsLoadToken) return;
    companyModuleReports.value = {
      companies: [],
      report_dates: [],
      period: query.period || companyModulePeriod.value || 'today',
      fetched_at: null
    };
    showToast(error.message);
  }
}

async function loadCompanyModuleReportsPreviousOptional(query = {}) {
  try {
    const data = await api.companyModuleReports(query);
    companyModuleReportsPrevious.value = data;
    return data;
  } catch (error) {
    companyModuleReportsPrevious.value = { companies: [], report_dates: [], period: query.period || '' };
    showToast(error.message);
  }
}

async function refreshCompanyModuleReports() {
  const period = companyModulePeriod.value;
  await loadCompanyModuleReportsOptional(companyModulePeriodQuery(period));
  if (!companyModuleCompareEnabled.value) {
    companyModuleReportsPrevious.value = { companies: [], report_dates: [], period: '' };
    return;
  }
  const previousPeriod = companyModulePreviousPeriodKey(period);
  if (!previousPeriod) {
    companyModuleReportsPrevious.value = { companies: [], report_dates: [], period: '' };
    return;
  }
  await loadCompanyModuleReportsPreviousOptional({ period: previousPeriod, include_daily: 0 });
}

async function syncCompanyModuleChartSource() {
  const period = companyModuleChartPeriod.value;
  try {
    const data = await api.companyModuleReports(companyModuleChartPeriodQuery(period));
    companyModuleChartSource.value = {
      period,
      daily_companies: data.daily_companies || [],
      report_dates: data.report_dates || []
    };
  } catch {
    companyModuleChartSource.value = { period, daily_companies: [], report_dates: [] };
  }
}

async function refreshCompanyModuleChartData() {
  await syncCompanyModuleChartSource();
}

function openCompanyModuleCustomPeriodModal() {
  const defaults = defaultCustomPeriodDates();
  companyModuleCustomPeriodForm.start = companyModuleCustomPeriodForm.appliedStart || companyModuleCustomPeriodForm.start || defaults.start;
  companyModuleCustomPeriodForm.end = companyModuleCustomPeriodForm.appliedEnd || companyModuleCustomPeriodForm.end || defaults.end;
  companyModuleCustomPeriodError.value = '';
  companyModulePeriod.value = 'custom';
  modal.value = 'companyModuleCustomPeriod';
}

function handleCompanyModulePeriodSelectPointerDown(event) {
  const select = event.currentTarget;
  if (select?.value) companyModulePeriodSelectValueOnPointerDown = select.value;
}

function handleCompanyModulePeriodSelectPointerUp(event) {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const previousValue = companyModulePeriodSelectValueOnPointerDown;
  companyModulePeriodSelectValueOnPointerDown = '';
  requestAnimationFrame(() => {
    if (select.value === 'custom' && previousValue === 'custom') {
      openCompanyModuleCustomPeriodModal();
    }
  });
}

async function handleCompanyModulePeriodChange(value) {
  if (value === 'custom') {
    previousCompanyModulePeriod.value = companyModulePeriod.value === 'custom'
      ? previousCompanyModulePeriod.value
      : companyModulePeriod.value;
    openCompanyModuleCustomPeriodModal();
    return;
  }
  companyModuleCustomPeriodForm.appliedStart = '';
  companyModuleCustomPeriodForm.appliedEnd = '';
  previousCompanyModulePeriod.value = value;
  companyModuleReports.value = {
    companies: [],
    report_dates: [],
    period: value,
    fetched_at: null
  };
  companyModulePeriod.value = value;
  await refreshCompanyModuleReports();
}

function cancelCompanyModuleCustomPeriod() {
  companyModuleCustomPeriodError.value = '';
  if (!companyModuleCustomPeriodForm.appliedStart || !companyModuleCustomPeriodForm.appliedEnd) {
    companyModulePeriod.value = previousCompanyModulePeriod.value || 'today';
  }
  modal.value = '';
}

async function applyCompanyModuleCustomPeriod() {
  companyModuleCustomPeriodError.value = '';
  if (!companyModuleCustomPeriodForm.start || !companyModuleCustomPeriodForm.end) {
    companyModuleCustomPeriodError.value = 'Ikkala sanani ham tanlang';
    return;
  }
  const start = companyModuleCustomPeriodForm.start <= companyModuleCustomPeriodForm.end
    ? companyModuleCustomPeriodForm.start
    : companyModuleCustomPeriodForm.end;
  const end = companyModuleCustomPeriodForm.start <= companyModuleCustomPeriodForm.end
    ? companyModuleCustomPeriodForm.end
    : companyModuleCustomPeriodForm.start;
  companyModuleCustomPeriodForm.appliedStart = start;
  companyModuleCustomPeriodForm.appliedEnd = end;
  companyModulePeriod.value = 'custom';
  companyModuleReports.value = {
    companies: [],
    report_dates: [],
    period: 'custom',
    fetched_at: null
  };
  modal.value = '';
  startLoading('companyModuleCustomPeriod');
  try {
    await refreshCompanyModuleReports();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('companyModuleCustomPeriod');
  }
}

function openCompanyModuleChartCustomPeriodModal() {
  const defaults = defaultCustomPeriodDates();
  companyModuleChartCustomPeriodForm.start = companyModuleChartCustomPeriodForm.appliedStart || companyModuleChartCustomPeriodForm.start || defaults.start;
  companyModuleChartCustomPeriodForm.end = companyModuleChartCustomPeriodForm.appliedEnd || companyModuleChartCustomPeriodForm.end || defaults.end;
  companyModuleChartCustomPeriodError.value = '';
  companyModuleChartPeriod.value = 'custom';
  modal.value = 'companyModuleChartCustomPeriod';
}

function handleCompanyModuleChartPeriodSelectPointerDown(event) {
  const select = event.currentTarget;
  if (select?.value) companyModuleChartPeriodSelectValueOnPointerDown = select.value;
}

function handleCompanyModuleChartPeriodSelectPointerUp(event) {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const previousValue = companyModuleChartPeriodSelectValueOnPointerDown;
  companyModuleChartPeriodSelectValueOnPointerDown = '';
  requestAnimationFrame(() => {
    if (select.value === 'custom' && previousValue === 'custom') {
      openCompanyModuleChartCustomPeriodModal();
    }
  });
}

async function handleCompanyModuleChartPeriodChange(value) {
  if (value === 'custom') {
    previousCompanyModuleChartPeriod.value = companyModuleChartPeriod.value === 'custom'
      ? previousCompanyModuleChartPeriod.value
      : companyModuleChartPeriod.value;
    openCompanyModuleChartCustomPeriodModal();
    return;
  }
  companyModuleChartCustomPeriodForm.appliedStart = '';
  companyModuleChartCustomPeriodForm.appliedEnd = '';
  previousCompanyModuleChartPeriod.value = value;
  companyModuleChartPeriod.value = value;
  companyModuleChartHoverIndex.value = -1;
  companyModuleChartSource.value = {
    period: value,
    daily_companies: [],
    report_dates: []
  };
  startLoading('companyModuleChartPeriod');
  try {
    await refreshCompanyModuleChartData();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('companyModuleChartPeriod');
  }
}

function cancelCompanyModuleChartCustomPeriod() {
  companyModuleChartCustomPeriodError.value = '';
  if (!companyModuleChartCustomPeriodForm.appliedStart || !companyModuleChartCustomPeriodForm.appliedEnd) {
    companyModuleChartPeriod.value = previousCompanyModuleChartPeriod.value || 'week';
  }
  modal.value = '';
}

async function applyCompanyModuleChartCustomPeriod() {
  companyModuleChartCustomPeriodError.value = '';
  if (!companyModuleChartCustomPeriodForm.start || !companyModuleChartCustomPeriodForm.end) {
    companyModuleChartCustomPeriodError.value = 'Ikkala sanani ham tanlang';
    return;
  }
  const start = companyModuleChartCustomPeriodForm.start <= companyModuleChartCustomPeriodForm.end
    ? companyModuleChartCustomPeriodForm.start
    : companyModuleChartCustomPeriodForm.end;
  const end = companyModuleChartCustomPeriodForm.start <= companyModuleChartCustomPeriodForm.end
    ? companyModuleChartCustomPeriodForm.end
    : companyModuleChartCustomPeriodForm.start;
  companyModuleChartCustomPeriodForm.appliedStart = start;
  companyModuleChartCustomPeriodForm.appliedEnd = end;
  companyModuleChartPeriod.value = 'custom';
  companyModuleChartHoverIndex.value = -1;
  companyModuleChartSource.value = {
    period: 'custom',
    daily_companies: [],
    report_dates: []
  };
  modal.value = '';
  startLoading('companyModuleChartCustomPeriod');
  try {
    await refreshCompanyModuleChartData();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('companyModuleChartCustomPeriod');
  }
}

async function loadCompanyInfo(query = {}) {
  const data = await api.companyInfo(query);
  companyInfo.value = data;
  return data;
}

async function loadCompanyInfoOptional(query = {}) {
  try {
    await loadCompanyInfo(query);
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
  const secondaryLoads = [loadDashboard(), loadPeriodOpenTickets()];
  if (!companyInfo.value?.companies?.length) secondaryLoads.push(loadCompanyInfoOptional({ cached: true }));
  if (!employees.value.length) secondaryLoads.push(loadEmployeesOptional());
  await Promise.all(secondaryLoads);
}

async function loadProductAnalytics() {
  const data = await loadCompanyInfo({ cached: true });
  if (data?.from_cache) loadCompanyInfo().catch(error => showToast(error.message));
}

async function syncCompanyModuleReportLive() {
  try {
    return await api.companyReport();
  } catch {
    return null;
  }
}

async function loadCompanyActivity(options = {}) {
  const syncLive = options.syncLive !== false;
  const notifyOnSyncError = options.notifyOnSyncError !== false;
  const [data] = await Promise.all([
    loadCompanyInfo({ cached: true }),
    refreshCompanyModuleReports(),
    refreshCompanyModuleChartData(),
    loadCompanyMrrScatterReports(),
    loadDashboard()
  ]);
  if (syncLive) {
    syncCompanyModuleReportLive()
      .then(synced => {
        if (!synced && notifyOnSyncError && !companyModuleReports.value?.companies?.length) {
          showToast('Kompaniya modul hisoboti yangilanmadi');
        }
        if (synced) {
          return Promise.all([
            refreshCompanyModuleReports(),
            refreshCompanyModuleChartData(),
            loadCompanyMrrScatterReports()
          ]);
        }
        return null;
      })
      .catch(() => null);
  } else if (!companyModuleReports.value?.companies?.length) {
    try {
      await api.companyReport();
      await refreshCompanyModuleReports();
    } catch (error) {
      showToast(error.message);
    }
  }
  if (data?.from_cache) loadCompanyInfo().catch(error => showToast(error.message));
}

function stopCompanyActivitySyncTimer() {
  if (!companyActivitySyncTimer) return;
  clearInterval(companyActivitySyncTimer);
  companyActivitySyncTimer = null;
}

function startCompanyActivitySyncTimer() {
  stopCompanyActivitySyncTimer();
  if (activeTab.value !== 'companyActivity') return;
  companyActivitySyncTimer = setInterval(() => {
    if (activeTab.value !== 'companyActivity') return;
    loadCompanyActivity({ syncLive: true, notifyOnSyncError: false }).catch(() => null);
  }, COMPANY_ACTIVITY_SYNC_INTERVAL_MS);
}

watch(companyModuleCompareEnabled, refreshCompanyModuleReports);

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
  const clickupIntegration = data.settings?.find(s => s.key === 'clickup_integration')?.value;
  const logNotifications = data.settings?.find(s => s.key === 'log_notifications')?.value;
  const groupMessageAudit = data.settings?.find(s => s.key === 'group_message_audit')?.value;
  const messageReactions = data.settings?.find(s => s.key === 'message_reactions')?.value;
  const ticketNotifications = data.settings?.find(s => s.key === 'ticket_notifications')?.value;
  const done = data.settings?.find(s => s.key === 'done_tag')?.value;
  const mainGroup = data.settings?.find(s => s.key === 'main_group')?.value;
  const detect = data.settings?.find(s => s.key === 'request_detection')?.value;
  Object.assign(integrationForm, {
    enabled: integration?.enabled !== false,
    provider: integration?.provider || 'openai_compatible',
    label: integration?.label || integration?.key_alias || integration?.model || 'Uyqur AI',
    team: integration?.team || '',
    key_alias: integration?.key_alias || '',
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
  Object.assign(clickupForm, {
    enabled: clickupIntegration?.enabled === true,
    api_token: '',
    has_api_token: !!clickupIntegration?.has_api_token,
    newbies_list_id: clickupIntegration?.newbies_list_id || '',
    big_team_list_id: clickupIntegration?.big_team_list_id || '',
    newbies_chat_id: clickupIntegration?.newbies_chat_id || '',
    big_team_chat_id: clickupIntegration?.big_team_chat_id || '',
    done_status: clickupIntegration?.done_status || 'complete',
    last_check_status: clickupIntegration?.last_check_status || '',
    last_checked_at: clickupIntegration?.last_checked_at || '',
    last_check_error: clickupIntegration?.last_check_error || ''
  });
  savedClickUpSignature.value = clickUpConnectionSignature(clickupForm);
  const modelVerified = !!(integration?.last_check_status === 'ok' && integration?.model && integration?.has_api_key);
  settingsForm.ai_mode = ai?.enabled && ai?.provider && modelVerified ? 'model' : String(!!ai?.enabled);
  const autoReplySetting = data.settings?.find(s => s.key === 'auto_reply')?.value;
  settingsForm.auto_reply = autoReplySetting !== undefined
    ? String(!!autoReplySetting.enabled)
    : 'true';
  settingsForm.message_reactions = messageReactions === undefined
    ? 'true'
    : String(messageReactions?.enabled !== false);
  settingsForm.ticket_notifications = ticketNotifications === undefined
    ? 'false'
    : String(!!ticketNotifications?.enabled);
  settingsForm.ticket_group_id = ticketNotifications?.target_chat_id || ticketNotifications?.targetChatId || '';
  settingsForm.ticket_topic_id = String(ticketNotifications?.message_thread_id ?? ticketNotifications?.messageThreadId ?? '').trim();
  settingsForm.done_tag = done?.tag || '#done';
  settingsForm.main_group_id = mainGroup?.chat_id || '';
  settingsForm.group_message_audit = groupMessageAudit === undefined
    ? 'main_group'
    : groupMessageAudit?.enabled === false
      ? 'false'
      : groupMessageAudit?.target === 'channel'
        ? 'channel'
        : 'main_group';
  settingsForm.group_message_audit_channel_id = groupMessageAudit?.channel_id || groupMessageAudit?.channelId || '';
  settingsForm.request_detection = detect?.mode || 'keyword';
}

async function loadClickUpTasks() {
  clickupTasks.value = await api.clickupTasks({ limit: 200 });
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

async function handleStatsPeriodChange() {
  if (selectedStatsPeriod.value === 'custom') {
    openCustomPeriodModal();
    return;
  }
  customPeriodForm.appliedStart = '';
  customPeriodForm.appliedEnd = '';
  customPeriodForm.start = '';
  customPeriodForm.end = '';
  previousStatsPeriod.value = selectedStatsPeriod.value;
  startLoading('period');
  try {
    await loadSupportPerformance();
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('period');
  }
}

function cancelCustomPeriod() {
  customPeriodError.value = '';
  if (!customPeriodForm.appliedStart || !customPeriodForm.appliedEnd) {
    selectedStatsPeriod.value = previousStatsPeriod.value || 'week';
  }
  modal.value = '';
}

function dashboardPeriodQuery() {
  if (selectedStatsPeriod.value !== 'custom') return { period: selectedStatsPeriod.value };
  if (!customPeriodForm.appliedStart || !customPeriodForm.appliedEnd) return { period: previousStatsPeriod.value || 'week' };
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
    if (activeTab.value === 'companyActivity') {
      await loadCompanyActivity();
      startCompanyActivitySyncTimer();
    } else {
      stopCompanyActivitySyncTimer();
    }
    if (activeTab.value === 'groups') {
      await Promise.all([
        api.groups().then(rows => { groups.value = rows; }),
        loadCompanyInfoOptional({ cached: true })
      ]);
    }
    if (activeTab.value === 'privates') privates.value = await api.privates();
    if (activeTab.value === 'employees') employees.value = await api.employees();
    if (activeTab.value === 'companies') await loadCompanyInfo();
    if (activeTab.value === 'clickup') await loadClickUpTasks();
    if (activeTab.value === 'knowledgeBase') await loadSettings();
    if (activeTab.value === 'settings') await loadSettings();
    if (activeTab.value === 'settings') checkTelegramWebhook(false).catch(() => null);
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
    resetTenantScopedState();
    token.value = data.token;
    showToast(data.fallback ? 'Kirdingiz. DB admin yarating yoki parolni o‘zgartiring.' : 'Xush kelibsiz!');
    loadSettings().catch(error => showToast(error.message));
    if (activeTab.value === 'stats') await loadSupportPerformance();
    else if (activeTab.value === 'productAnalytics') await loadProductAnalytics();
    else await refresh();
    checkTelegramWebhook(false).catch(() => null);
  } catch (error) {
    loginError.value = /login|parol/i.test(error.message)
      ? 'Kirish nomi yoki parol noto‘g‘ri.'
      : error.message;
  } finally {
    stopLoading('login');
  }
}

function resetTenantScopedState() {
  dashboard.summary = {};
  dashboard.employeeStats = [];
  dashboard.chatStats = [];
  dashboard.openRequests = [];
  dashboard.analytics = {};
  groups.value = [];
  privates.value = [];
  employees.value = [];
  clickupTasks.value = [];
  companyInfo.value = { summary: {}, companies: [], fetched_at: '', source: '' };
}

function logout() {
  actionMenuOpen.value = false;
  stopTelegramAutoSync();
  setToken('');
  token.value = '';
  resetTenantScopedState();
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
  if (row?.chat_id === undefined || row?.chat_id === null) return '';
  return [row.chat_id, row.business_connection_id || ''].filter(value => value !== undefined && value !== null).join('::');
}

function conversationQuery(row = {}) {
  const query = { chat_id: row.chat_id };
  if (row.business_connection_id) query.business_connection_id = row.business_connection_id;
  return query;
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
  if (action === 'selectMrrScatterCompany') {
    if (!row?.id) return;
    closeModal();
    selectCompanyMrrScatterPoint(row);
    return;
  }
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
  if (action === 'companyEdit') {
    openCompany(row);
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
    if (row?.is_unassigned) {
      employeeDrilldown.value = row;
      employeeOpenRequests.value = unassignedOpenRequestsList();
      if (!employeeOpenRequests.value.length) return showToast('Biriktirilmagan ochiq so‘rov topilmadi');
      modal.value = 'employeeOpenRequests';
      return;
    }
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
    clickup_user_id: row?.clickup_user_id || '',
    is_active: row?.is_active ?? true,
    company_id: row?.company_id || ''
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
  if (row.chat_id !== undefined && row.chat_id !== null) return chatIdKey(row);
  return String(row.key || row.title || '').trim();
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
  return openRequest?.initial_text || closedRequest?.initial_text || chatMessageText(message) || 'Yozishma tarixi';
}

function groupChatMessages(group = {}) {
  const rows = Array.isArray(group.chat_messages) && group.chat_messages.length
    ? group.chat_messages
    : (Array.isArray(group.messages) ? group.messages : []);
  return rows;
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
  const memberEmployees = Array.isArray(employee.member_employees) ? employee.member_employees : [];
  if (memberEmployees.some(member => messageBelongsToEmployee(message, member))) return true;
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

function dedupeRowsBy(rows = [], keyFn) {
  const seen = new Set();
  return rows.filter(row => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeManagerActivityGroups(groups = []) {
  const merged = new Map();
  groups.forEach(group => {
    const key = employeeProfileChatKey(group);
    if (!key) return;
    const current = merged.get(key) || {
      ...group,
      closed_requests: [],
      open_requests: [],
      messages: [],
      chat_messages: []
    };
    current.closed_requests = current.closed_requests.concat(Array.isArray(group.closed_requests) ? group.closed_requests : []);
    current.messages = current.messages.concat(Array.isArray(group.messages) ? group.messages : []);
    current.chat_messages = current.chat_messages.concat(Array.isArray(group.chat_messages) ? group.chat_messages : []);
    current.last_message_at = [current.last_message_at, group.last_message_at].filter(Boolean).sort().at(-1) || current.last_message_at || group.last_message_at || null;
    merged.set(key, current);
  });

  return [...merged.values()].map(group => {
    const closedRequests = dedupeRowsBy(group.closed_requests, row => String(row.id || `${row.chat_id || ''}:${row.initial_message_id || row.created_at || ''}`));
    const messages = dedupeRowsBy(group.messages, row => String(row.message_id || row.id || `${row.chat_id || ''}:${row.created_at || ''}`));
    const chatMessages = dedupeRowsBy(group.chat_messages, row => String(row.message_id || row.id || `${row.chat_id || ''}:${row.created_at || ''}`));
    return {
      ...group,
      closed_requests: closedRequests.sort((a, b) => String(b.closed_at || b.created_at || '').localeCompare(String(a.closed_at || a.created_at || ''))),
      open_requests: [],
      open_count: 0,
      closed_count: closedRequests.length,
      messages: messages.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      chat_messages: chatMessages.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      message_count: messages.length,
      chat_message_count: chatMessages.length,
      total_requests: closedRequests.length
    };
  });
}

function buildManagerAggregateProfile(row = {}, managers = [], payloads = []) {
  const groups = mergeManagerActivityGroups(payloads.flatMap(payload => Array.isArray(payload.groups) ? payload.groups : []));
  const summaries = payloads.map(payload => payload.summary || {});
  const closedRequests = summaries.reduce((sum, summary) => sum + Number(summary.closed_requests || 0), 0);
  const openRequests = 0;
  const totalRequests = closedRequests;
  const managerSla = closedRequests > 0 ? 100 : 0;
  const handledChats = new Set(groups.map(group => employeeProfileChatKey(group)).filter(Boolean)).size;
  const messageCount = summaries.reduce((sum, summary) => sum + Number(summary.message_count || 0), 0);
  const customerCount = summaries.reduce((sum, summary) => sum + Number(summary.customer_count || 0), 0);
  const memberStats = managers.map((manager, index) => {
    const summary = summaries[index] || {};
    const closed = Number(summary.closed_requests || 0);
    return {
      ...manager,
      id: manager.id || manager.employee_id || '',
      employee_id: manager.employee_id || manager.id || '',
      full_name: manager.full_name || manager.username || 'Menejer',
      role: 'manager',
      closed_requests: closed,
      open_requests: 0,
      total_requests: closed,
      handled_chats: Number(summary.handled_chats || 0),
      avg_close_minutes: Number(summary.avg_close_minutes || 0),
      sla: closed > 0 ? 100 : 0,
      close_rate: closed > 0 ? 100 : 0
    };
  });
  return {
    employee: {
      ...row,
      full_name: row.full_name || 'Barcha menejerlar',
      role: 'manager',
      member_employees: managers
    },
    rank: row.rank || null,
    companies: [],
    summary: {
      closed_requests: closedRequests,
      open_requests: openRequests,
      company_total: managers.length,
      avg_close_minutes: weightedAverageBy(summaries, 'avg_close_minutes', 'closed_requests'),
      close_rate: managerSla,
      sla: managerSla,
      handled_chats: handledChats,
      message_count: messageCount,
      customer_count: customerCount
    },
    groups,
    member_stats: memberStats
  };
}

function openEmployeeCompanyList() {
  if (employeeProfileCompanyTotal.value <= 0) return showToast('Bu xodimga biriktirilgan kompaniya topilmadi');
  modal.value = 'employeeCompanyList';
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
    employeeProfileChatLoading.value = false;
    await nextTick();
    await scrollEmployeeProfileChatToEnd();
    loadConversationMedia(employeeProfileConversation.value)
      .then(() => scrollEmployeeProfileChatToEnd())
      .catch(error => showToast(error.message));
  } catch (error) {
    if (token !== employeeProfileChatToken || employeeProfileSelectedChatKey.value !== key) return;
    employeeProfileChatDetail.value = { chat: null, requests: [], conversation: [] };
    employeeProfileChatError.value = error.message;
  } finally {
    if (token === employeeProfileChatToken && employeeProfileSelectedChatKey.value === key) {
      employeeProfileChatLoading.value = false;
      nextTick().then(() => scrollEmployeeProfileChatToEnd());
    }
  }
}

function assignedCompaniesForEmployeeRow(row = {}, apiCompanies = []) {
  const employee = resolveEmployeeForCompany(row);
  if (apiCompanies.length) return apiCompanies;
  if (row.assigned_companies?.length) return row.assigned_companies;
  return visibleCompanyInfoRows.value.filter(company => companyMatchesEmployee(company, employee));
}

async function openEmployeeCompanies(row = {}) {
  const employee = resolveEmployeeForCompany(row);
  const allAssigned = assignedCompaniesForEmployeeRow(row);
  const companyPack = employeeAssignedCompaniesPack(allAssigned);
  employeeManagerDetailsOpen.value = false;
  employeeCompanyDetail.value = {
    employee,
    companies: companyPack.companies,
    summary: companyPack.summary
  };
  employeeProfileLoadToken += 1;
  const loadToken = employeeProfileLoadToken;
  resetEmployeeProfileChat();
  employeeProfileTab.value = 'private';
  employeeProfile.value = {
    employee,
    rank: row.rank || null,
    companies: companyPack.companies,
    summary: {
      closed_requests: Number(row.closed_requests || 0),
      open_requests: Number(row.open_requests || 0),
      company_total: companyPack.total,
      avg_close_minutes: Number(row.avg_close_minutes || 0),
      close_rate: Number(row.close_rate || row.sla || 0),
      sla: Number(row.sla || row.close_rate || 0)
    },
    groups: []
  };
  modal.value = 'employeeCompanies';
  loadEmployeeAvatar(employee);

  if (row.is_manager_group) {
    const managers = employees.value.filter(manager => !isAdminLikeEmployee(manager) && isManagerEmployee(manager));
    if (!managers.length) {
      showToast('Menejerlar topilmadi');
      return;
    }
    startLoading('employeeActivity');
    try {
      const payloads = await Promise.all(managers.map(manager => api.employeeActivity({
        employee_id: manager.id || manager.employee_id || '',
        tg_user_id: manager.tg_user_id || '',
        ...dashboardPeriodQuery()
      })));
      if (loadToken !== employeeProfileLoadToken) return;
      employeeProfile.value = buildManagerAggregateProfile({
        ...row,
        open_requests: 0,
        prev_open_requests: 0
      }, managers, payloads);
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
    return;
  }

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
      ...dashboardPeriodQuery()
    });
    if (loadToken !== employeeProfileLoadToken) return;
    const summary = data.summary || {};
    const allAssigned = assignedCompaniesForEmployeeRow(row, data.assigned_companies || []);
    const companyPack = employeeAssignedCompaniesPack(allAssigned);
    employeeCompanyDetail.value = {
      employee: { ...employee, ...(data.employee || {}) },
      companies: companyPack.companies,
      summary: companyPack.summary
    };
    employeeProfile.value = {
      employee: { ...employee, ...(data.employee || {}) },
      rank: row.rank || null,
      companies: companyPack.companies,
      summary: {
        closed_requests: Number(summary.closed_requests ?? row.closed_requests ?? 0),
        open_requests: Number(summary.open_requests ?? row.open_requests ?? 0),
        company_total: companyPack.total,
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

const companyForm = reactive({ id: '', name: '', legal_name: '', phone: '', notes: '', is_active: true });

function openCompany(row = {}) {
  companyForm.id = row.id || '';
  companyForm.name = row.name || '';
  companyForm.legal_name = row.legal_name || '';
  companyForm.phone = row.phone || '';
  companyForm.notes = row.notes || '';
  companyForm.is_active = row.is_active !== false;
  modal.value = 'company';
}

async function saveCompany() {
  if (!companyForm.name) {
    showToast('Kompaniya nomini kiriting');
    return;
  }
  startLoading('saveCompany');
  try {
    await api.saveCompany({ ...companyForm });
    showToast('Kompaniya saqlandi');
    await loadCompanyInfoOptional();
    modal.value = '';
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('saveCompany');
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
      ...dashboardPeriodQuery()
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
  if (!(filteredOpenRequests.value || []).length) return showToast('Ochiq so‘rov qolmagan');
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

function setMetricDetail({ title, rows, columns, empty = 'Ma’lumot topilmadi', pageSize = 12, summary = [], chatPane = false, showSourceTabs = true }) {
  resetMetricChatDetail();
  metricDetail.value = { title, rows, columns, empty, pageSize, summary, chatPane, source: 'all', showSourceTabs };
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
  if (thread.scrollTo) {
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' });
  }
}

function isThreadNearBottom(thread, tolerance = 80) {
  if (!thread) return true;
  const distance = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
  return distance <= tolerance;
}

async function scrollThreadToEnd(threadRef) {
  await nextTick();
  const thread = threadRef.value;
  if (!thread) return;

  setThreadScrollToEnd(thread);

  let userScrolledUp = false;
  let lastScrollTop = thread.scrollTop;
  const onUserScroll = () => {
    const current = threadRef.value;
    if (!current) return;
    const goingUp = current.scrollTop < lastScrollTop - 4;
    lastScrollTop = current.scrollTop;
    if (goingUp && !isThreadNearBottom(current)) userScrolledUp = true;
    else if (isThreadNearBottom(current)) userScrolledUp = false;
  };
  thread.addEventListener('scroll', onUserScroll, { passive: true });

  const safeScroll = () => {
    const current = threadRef.value;
    if (!current || userScrolledUp) return;
    setThreadScrollToEnd(current);
    lastScrollTop = current.scrollTop;
  };

  const attempts = [10, 50, 100, 300, 600, 1000, 1500, 2500, 4000, 6000];
  attempts.forEach(ms => setTimeout(safeScroll, ms));

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(safeScroll);
  }

  let stopped = false;
  const stopAll = () => {
    stopped = true;
    thread.removeEventListener('scroll', onUserScroll);
  };
  setTimeout(stopAll, 8000);

  if (typeof MutationObserver === 'function') {
    const mutationObserver = new MutationObserver(() => {
      if (stopped) return;
      safeScroll();
    });
    mutationObserver.observe(thread, { childList: true, subtree: true, attributes: true });
    setTimeout(() => mutationObserver.disconnect(), 8000);
  }

  thread.querySelectorAll('img, video, audio').forEach(el => {
    const handler = () => { if (!stopped) safeScroll(); };
    el.addEventListener('load', handler, { once: true });
    el.addEventListener('loadedmetadata', handler, { once: true });
    el.addEventListener('canplay', handler, { once: true });
  });
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
watch(employeeProfileConversation, conversation => {
  scrollEmployeeProfileChatToEnd();
  loadConversationMedia(conversation).catch(error => showToast(error.message));
}, { flush: 'post' });
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
    const data = await api.chatDetail(conversationQuery(chatRow));
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

function employeePerformanceLookupKeys(row = {}) {
  const keys = [];
  const employeeId = String(row.employee_id || row.id || row.responsible_employee_id || '').trim();
  if (employeeId) keys.push(`id:${employeeId}`);
  const tgUserId = String(row.tg_user_id || '').trim();
  if (tgUserId) keys.push(`tg:${tgUserId}`);
  const username = normalizeSupportUsername(row.username || row.responsible_employee_username || '');
  if (username) keys.push(`u:${username}`);
  const fullName = String(row.full_name || row.responsible_employee_name || '').trim().toLowerCase();
  if (fullName) keys.push(`n:${fullName}`);
  return keys;
}

function employeeSummaryKey(row = {}) {
  return employeePerformanceLookupKeys(row)[0] || '';
}

function buildPerformanceStatsLookup(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    employeePerformanceLookupKeys(row).forEach(key => {
      if (!map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function resolvePerformanceStatsRow(lookup = new Map(), row = {}) {
  return employeePerformanceLookupKeys(row).map(key => lookup.get(key)).find(Boolean) || null;
}

function employeeMatchesSupportUsername(employee = {}, supportUsername = '') {
  if (!supportUsername) return false;
  return supportIdentitiesMatch(employee.username, supportUsername)
    || supportIdentitiesMatch(employee.full_name, supportUsername);
}

function buildPrivateChatSupportIndex() {
  const index = new Map();
  (dashboard.chatStats || []).forEach(chat => {
    const sourceType = String(chat.source_type || '').toLowerCase();
    if (!['private', 'business'].includes(sourceType)) return;
    const chatId = String(chat.chat_id || '').trim();
    const companyId = String(chat.company_id || '').trim();
    if (!chatId || !companyId) return;
    const company = (visibleCompanyInfoRows.value || []).find(item => String(item.id || item.company_id || '').trim() === companyId);
    if (!company || !hasCompanySupport(company)) return;
    const employee = (employees.value || []).find(row => !isAdminLikeEmployee(row)
      && employeeMatchesSupportUsername(row, company.uyqur_support_username));
    if (!employee || !isSupportEmployee(employee) || isManagerEmployee(employee)) return;
    if (!index.has(chatId)) index.set(chatId, employee);
  });
  return index;
}

function buildCompanyGroupSupportIndex() {
  const index = new Map();
  (visibleCompanyInfoRows.value || []).forEach(company => {
    if (!hasCompanySupport(company)) return;
    const employee = (employees.value || []).find(row => !isAdminLikeEmployee(row)
      && employeeMatchesSupportUsername(row, company.uyqur_support_username));
    if (!employee || !isSupportEmployee(employee) || isManagerEmployee(employee)) return;
    companyGroupChatIds(company).forEach(chatId => {
      if (!index.has(chatId)) index.set(chatId, employee);
    });
  });
  return index;
}

function resolveCompanySupportMappingForRequest(request = {}, employeeMappings = []) {
  const chatId = String(request.chat_id || '').trim();
  const companyId = String(request.company_id || '').trim();
  const companyName = normalizedCompanyName(request.company_name || request.chat_title || '');

  const company = findCompanyByGroupChatId(chatId)
    || (visibleCompanyInfoRows.value || []).find(item => {
      if (companyId && String(item.id || item.company_id || '').trim() === companyId) return true;
      if (companyName && normalizedCompanyName(item.name) === companyName) return true;
      return false;
    });
  if (!company || !hasCompanySupport(company)) return null;

  const username = normalizeSupportUsername(company.uyqur_support_username);
  if (!username) return null;

  let mapping = employeeMappings.find(item => supportIdentitiesMatch(item.username, company.uyqur_support_username)
    || supportIdentitiesMatch(item.full_name, company.uyqur_support_username));
  if (!mapping) {
    const employee = employees.value.find(row => !isAdminLikeEmployee(row)
      && employeeMatchesSupportUsername(row, company.uyqur_support_username));
    if (!employee || !isSupportEmployee(employee)) return null;
    mapping = {
      employee,
      key: employeeSummaryKey(employee),
      username,
      id: String(employee.id || employee.employee_id || '').trim(),
      tg_user_id: String(employee.tg_user_id || '').trim(),
      full_name: String(employee.full_name || '').trim().toLowerCase(),
      companyIds: new Set(),
      companyNames: new Set(),
      chatIds: new Set()
    };
  }
  return mapping;
}

function buildOpenRequestEmployeeMapping(employee, employeeMappings = []) {
  if (!employee) return null;
  const id = String(employee.id || employee.employee_id || '').trim();
  const existing = employeeMappings.find(mapping => mapping.id === id);
  if (existing) return existing;
  return {
    employee,
    key: employeeSummaryKey(employee),
    username: normalizeSupportUsername(employee.username),
    id,
    tg_user_id: String(employee.tg_user_id || '').trim(),
    full_name: String(employee.full_name || '').trim().toLowerCase(),
    companyIds: new Set(),
    companyNames: new Set(),
    chatIds: new Set()
  };
}

function resolveOpenRequestEmployeeMapping(request = {}, employeeMappings = []) {
  if (isClosedLikeTicketStatus(request.status)) {
    const closedId = String(request.closed_by_employee_id || '').trim();
    if (closedId) {
      const byClosed = employeeMappings.find(mapping => mapping.id === closedId);
      if (byClosed) return byClosed;
      const closedEmployee = employees.value.find(row => !isAdminLikeEmployee(row)
        && String(row.id || row.employee_id || '').trim() === closedId);
      const closedMapping = buildOpenRequestEmployeeMapping(closedEmployee, employeeMappings);
      if (closedMapping) return closedMapping;
    }
  }

  const assignedId = String(request.assigned_to_employee_id || '').trim();
  if (assignedId) {
    const byAssigned = employeeMappings.find(mapping => mapping.id === assignedId);
    if (byAssigned) return byAssigned;
    const assignedEmployee = employees.value.find(row => !isAdminLikeEmployee(row)
      && String(row.id || row.employee_id || '').trim() === assignedId);
    const assignedMapping = buildOpenRequestEmployeeMapping(assignedEmployee, employeeMappings);
    if (assignedMapping) return assignedMapping;
  }

  const openedId = String(request.opened_by_employee_id || '').trim();
  if (openedId) {
    const openedEmployee = employees.value.find(row => !isAdminLikeEmployee(row)
      && String(row.id || row.employee_id || '').trim() === openedId);
    if (openedEmployee && !isManagerEmployee(openedEmployee)) {
      const byOpened = employeeMappings.find(mapping => mapping.id === openedId);
      if (byOpened) return byOpened;
      const openedMapping = buildOpenRequestEmployeeMapping(openedEmployee, employeeMappings);
      if (openedMapping) return openedMapping;
    }
  }

  const responsibleId = String(request.responsible_employee_id || '').trim();
  if (responsibleId) {
    const byResponsibleId = employeeMappings.find(mapping => mapping.id === responsibleId);
    if (byResponsibleId) return byResponsibleId;
    const employee = employees.value.find(row => !isAdminLikeEmployee(row) && String(row.id || row.employee_id || '').trim() === responsibleId);
    const mapped = buildOpenRequestEmployeeMapping(employee, employeeMappings);
    if (mapped) return mapped;
  }

  const responsibleUsername = normalizeSupportUsername(request.responsible_employee_username || request.support_username || '');
  if (responsibleUsername) {
    const byResponsibleUser = employeeMappings.find(mapping => supportIdentitiesMatch(mapping.username, responsibleUsername));
    if (byResponsibleUser) return byResponsibleUser;
    const employee = employees.value.find(row => !isAdminLikeEmployee(row) && supportIdentitiesMatch(row.username, responsibleUsername));
    const mapped = buildOpenRequestEmployeeMapping(employee, employeeMappings);
    if (mapped) return mapped;
  }

  const responsibleName = String(request.responsible_employee_name || request.support_name || '').trim();
  if (responsibleName) {
    const byResponsibleName = employeeMappings.find(mapping =>
      supportIdentitiesMatch(mapping.full_name, responsibleName)
      || supportIdentitiesMatch(mapping.username, responsibleName)
      || String(mapping.employee?.full_name || '').trim() === responsibleName);
    if (byResponsibleName) return byResponsibleName;
    const employee = employees.value.find(row => !isAdminLikeEmployee(row)
      && (supportIdentitiesMatch(row.full_name, responsibleName) || supportIdentitiesMatch(row.username, responsibleName)));
    const mapped = buildOpenRequestEmployeeMapping(employee, employeeMappings);
    if (mapped) return mapped;
  }

  return null;
}

function findEmployeeMappingForOpenRequest(request = {}, employeeMappings = [], groupSupportIndex = null) {
  const direct = resolveOpenRequestEmployeeMapping(request, employeeMappings);
  if (direct) return direct;

  const chatId = String(request.chat_id || '').trim();
  const privateIndex = buildPrivateChatSupportIndex();
  const privateEmployee = chatId ? privateIndex.get(chatId) : null;
  if (privateEmployee) {
    const byPrivate = employeeMappings.find(mapping => mapping.id === String(privateEmployee.id || privateEmployee.employee_id || '').trim());
    if (byPrivate) return byPrivate;
  }

  const groupIndex = groupSupportIndex || buildCompanyGroupSupportIndex();
  const groupEmployee = chatId ? groupIndex.get(chatId) : null;
  if (groupEmployee) {
    const byGroup = employeeMappings.find(mapping => mapping.id === String(groupEmployee.id || groupEmployee.employee_id || '').trim());
    if (byGroup) return byGroup;
  }

  const chatTitleCompany = findCompanyByGroupChatId(chatId)
    || visibleCompanyInfoRows.value.find(company => {
      const titleName = normalizedCompanyName(companyNameFromChatTitle(request.chat_title || request.title || ''));
      return titleName && normalizedCompanyName(company.name) === titleName;
    });
  if (chatTitleCompany) {
    const titleMapping = resolveCompanySupportMappingForRequest({
      ...request,
      company_id: request.company_id || chatTitleCompany.id || chatTitleCompany.company_id,
      company_name: request.company_name || chatTitleCompany.name
    }, employeeMappings);
    if (titleMapping) return titleMapping;
  }
  const companyId = String(request.company_id || '').trim();
  const companyName = normalizedCompanyName(request.company_name || request.chat_title || '');

  const byCompanyScope = employeeMappings.find(mapping => {
    if (companyId && mapping.companyIds.has(companyId)) return true;
    if (companyName && mapping.companyNames.has(companyName)) return true;
    if (chatId && mapping.chatIds.has(chatId)) return true;
    return false;
  });
  return byCompanyScope || resolveCompanySupportMappingForRequest(request, employeeMappings) || null;
}

function buildEmployeeOpenRequestMappings() {
  return (employees.value || []).filter(emp => !isAdminLikeEmployee(emp)).map(emp => {
    const companies = (visibleCompanyInfoRows.value || []).filter(c => companyMatchesEmployee(c, emp));
    const companyIds = new Set(companies.map(c => String(c.id || c.company_id || '').trim()).filter(Boolean));
    const companyNames = new Set(companies.map(c => normalizedCompanyName(c.name)).filter(Boolean));
    const chatIds = new Set();
    companies.forEach(company => {
      companyGroupChatIds(company).forEach(chatId => chatIds.add(chatId));
    });
    return {
      employee: emp,
      key: employeeSummaryKey(emp),
      username: normalizeSupportUsername(emp.username),
      id: String(emp.id || emp.employee_id || '').trim(),
      tg_user_id: String(emp.tg_user_id || '').trim(),
      full_name: String(emp.full_name || '').trim().toLowerCase(),
      companyIds,
      companyNames,
      chatIds
    };
  });
}

function countAssignedOverdueOpenRequests(requests = []) {
  const employeeMappings = buildEmployeeOpenRequestMappings();
  const groupSupportIndex = buildCompanyGroupSupportIndex();
  return requests.filter(request => {
    const matchedEmp = findEmployeeMappingForOpenRequest(request, employeeMappings, groupSupportIndex);
    if (!matchedEmp || !isSupportEmployee(matchedEmp.employee) || isManagerEmployee(matchedEmp.employee)) return false;
    return openMinutes(request.created_at) > 30;
  }).length;
}

function classifyOpenRequestAssignment(request = {}, employeeMappings = [], groupSupportIndex = null) {
  const matchedEmp = resolveOpenRequestEmployeeMapping(request, employeeMappings)
    || findEmployeeMappingForOpenRequest(request, employeeMappings, groupSupportIndex);
  if (!matchedEmp || !isSupportEmployee(matchedEmp.employee) || isManagerEmployee(matchedEmp.employee)) {
    return { assigned: false, mapping: null };
  }
  return { assigned: true, mapping: matchedEmp };
}

function classifyRankingOpenRequestAssignment(request = {}, employeeMappings = []) {
  const groupSupportIndex = buildCompanyGroupSupportIndex();
  const matchedEmp = resolveOpenRequestEmployeeMapping(request, employeeMappings)
    || findEmployeeMappingForOpenRequest(request, employeeMappings, groupSupportIndex);
  if (!matchedEmp || !isSupportEmployee(matchedEmp.employee) || isManagerEmployee(matchedEmp.employee)) {
    return { assigned: false, mapping: null };
  }
  return { assigned: true, mapping: matchedEmp };
}

function buildPeriodTicketCountsByEmployeeKey() {
  const counts = new Map();
  const managerTotals = new Map();
  const unassigned = { open: 0, closed: 0 };
  if (!periodTicketRows.value.length) {
    return { counts, managerTotals, unassigned, managerClosed: 0 };
  }

  const employeeMappings = buildTicketListEmployeeMappings();
  const bump = (employee, field) => {
    if (!employee) return false;
    if (isManagerEmployee(employee)) {
      const managerKey = supportRowKey(employee);
      const current = managerTotals.get(managerKey) || { open: 0, closed: 0, employee };
      current[field] += 1;
      managerTotals.set(managerKey, current);
      return true;
    }
    const key = supportRowKey(employee);
    if (!key) return false;
    const current = counts.get(key) || { open: 0, closed: 0 };
    current[field] += 1;
    counts.set(key, current);
    return true;
  };

  periodTicketRows.value.forEach(request => {
    const mapping = resolveOpenRequestEmployeeMapping(request, employeeMappings)
      || findEmployeeMappingForOpenRequest(request, employeeMappings);
    const employee = mapping?.employee || null;
    if (isOpenTicketStatus(request.status) && !bump(employee, 'open')) unassigned.open += 1;
    if (isClosedLikeTicketStatus(request.status) && !bump(employee, 'closed')) unassigned.closed += 1;
  });

  const managerClosed = [...managerTotals.values()].reduce((sum, row) => sum + Number(row.closed || 0), 0);
  return { counts, managerTotals, unassigned, managerClosed };
}

function periodClosedCountLookup() {
  const lookup = new Map();
  if (!periodTicketRows.value.length) return lookup;
  const employeeMappings = buildEmployeeOpenRequestMappings();
  const groupSupportIndex = buildCompanyGroupSupportIndex();
  periodTicketRows.value
    .filter(request => isClosedLikeTicketStatus(request.status))
    .forEach(request => {
      const mapping = resolveOpenRequestEmployeeMapping(request, employeeMappings)
        || findEmployeeMappingForOpenRequest(request, employeeMappings, groupSupportIndex);
      if (!mapping?.employee) return;
      employeePerformanceLookupKeys(mapping.employee).forEach(key => {
        lookup.set(key, Number(lookup.get(key) || 0) + 1);
      });
    });
  return lookup;
}

function resolvePeriodClosedCount(lookupKeys = [], fallback = 0, closedLookup = new Map()) {
  if (!periodTicketRows.value.length) return fallback;
  const keys = [...new Set(lookupKeys.filter(Boolean))];
  if (!keys.length) return 0;
  return keys.reduce((max, key) => Math.max(max, Number(closedLookup.get(key) || 0)), 0);
}

function employeeOpenRequestSummaryMap() {
  const map = new Map();
  const employeeMappings = buildEmployeeOpenRequestMappings();
  const unassignedSummary = {
    key: 'unassigned:open',
    employee_id: '',
    username: '',
    full_name: 'Biriktirilmagan',
    role: 'support',
    tg_user_id: '',
    is_unassigned: true,
    open_requests: 0,
    chat_keys: new Set()
  };

  (rankingOpenRequests.value || []).forEach(request => {
    const { assigned, mapping } = classifyRankingOpenRequestAssignment(request, employeeMappings);
    if (!assigned) {
      unassignedSummary.open_requests += 1;
      if (request.chat_id) unassignedSummary.chat_keys.add(String(request.chat_id));
      return;
    }

    const summary = {
      key: mapping.key,
      employee_id: mapping.employee.id || mapping.employee.employee_id || '',
      username: mapping.employee.username || '',
      full_name: mapping.employee.full_name || 'Xodim',
      role: mapping.employee.role || 'support',
      tg_user_id: mapping.employee.tg_user_id || '',
      is_unassigned: false,
      open_requests: 0,
      chat_keys: new Set()
    };
    employeePerformanceLookupKeys(mapping.employee).forEach(key => {
      const current = map.get(key) || { ...summary, chat_keys: new Set(summary.chat_keys) };
      current.open_requests += 1;
      if (request.chat_id) current.chat_keys.add(String(request.chat_id));
      map.set(key, current);
    });
  });

  if (unassignedSummary.open_requests > 0) {
    map.set('unassigned:open', unassignedSummary);
  }

  return map;
}

function unassignedOpenRequestsList() {
  const employeeMappings = buildEmployeeOpenRequestMappings();
  const groupSupportIndex = buildCompanyGroupSupportIndex();
  return (filteredOpenRequests.value || []).filter(request => !classifyOpenRequestAssignment(request, employeeMappings, groupSupportIndex).assigned);
}

function employeeSummaryRows(kind = 'requests') {
  const openMap = employeeOpenRequestSummaryMap();
  const rowMap = new Map();
  topSupportCards.value.forEach(row => {
    const openSummary = resolvePerformanceStatsRow(openMap, row);
    const openRequests = isManagerPerformanceRow(row)
      ? 0
      : (openSummary ? Number(openSummary.open_requests || 0) : 0);
    const closedRequests = Number(row.closed_requests || 0);
    const rowKey = supportRowKey(row) || row.key || row.full_name;
    rowMap.set(rowKey, {
      ...row,
      total_requests: isManagerPerformanceRow(row) ? closedRequests : closedRequests + openRequests,
      open_requests: openRequests,
      handled_chats: Math.max(Number(row.handled_chats || 0), openSummary?.chat_keys?.size || 0)
    });
    employeePerformanceLookupKeys(row).forEach(key => openMap.delete(key));
  });
  const seenOpenKeys = new Set();
  openMap.forEach(row => {
    if (isUnassignedRankingRow(row) && Number(row.open_requests || 0) <= 0) return;
    const dedupeKey = supportRowKey(row) || row.key;
    if (!dedupeKey || seenOpenKeys.has(dedupeKey)) return;
    seenOpenKeys.add(dedupeKey);
    rowMap.set(dedupeKey, {
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
  if (kind === 'risk') return rows.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state));
  return rows;
}

function openProductMetricDetail(kind = 'total') {
  const titleMap = {
    total: 'Kuzatuvdagi kompaniyalar',
    active: 'Biznes aktiv kompaniyalar',
    risk: 'Risk va churn kompaniyalari'
  };
  const rows = productMetricRows(kind);
  if (!rows.length) return showToast('Bu metrika bo‘yicha kompaniya topilmadi');
  setMetricDetail({
    title: titleMap[kind] || 'Kompaniya tafsilotlari',
    rows,
    columns: productMetricColumns,
    empty: 'Kompaniya ma’lumoti topilmadi',
    showSourceTabs: false,
    summary: [
      { label: 'Kompaniya', value: fmtNumber(rows.length) },
      { label: 'Aktiv', value: fmtNumber(rows.filter(row => row.business_status === 'ACTIVE').length) },
      { label: 'Risk', value: fmtNumber(rows.filter(row => isCompanyChurn(row) || ['expired', 'soon'].includes(row.expiry_state)).length) }
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
    showSourceTabs: false,
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
  companyGroupTicketsOpen.value = false;
  clearMediaUrls();
  await nextTick();
  await scrollCompanyGroupToEnd();
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
    if (!detail.groups.length) {
      return showToast(row.is_unassigned
        ? 'Bu davrda kompaniyaga biriktirilmagan guruh ticketlari topilmadi'
        : 'Bu kompaniyaga ulangan guruhlarda xabar topilmadi');
    }
    detail.groups = sortChatsWithOpenFirst(detail.groups);
    companyGroupDetail.value = detail;
    companyGroupSelectedChatKey.value = companyGroupChatKey(detail.groups[0]);
    companyGroupTicketsOpen.value = false;
    modal.value = 'companyGroupActivity';
    clearMediaUrls();
    await nextTick();
    await scrollCompanyGroupToEnd();
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
  if (status === 'open') return isOpenTicketStatus(row.status);
  if (status === 'closed') return isClosedLikeTicketStatus(row.status);
  return true;
}

function ticketMatchesSource(row = {}, source = 'all') {
  if (source === 'all') return true;
  const type = String(row.source_type || row.chat_source_type || '').toLowerCase();
  if (source === 'group') return type === 'group';
  if (source === 'private') return type === 'private' || type === 'personal' || type === 'business';
  return true;
}

function requestRowClass(row = {}) {
  return row.status === 'open' ? 'open-ticket-row' : '';
}

function supportPerformanceRowClass(row = {}) {
  if (row.is_unassigned) return 'unassigned-ranking-row';
  return Number(row.sla || 0) >= 100 ? 'top-performer-row' : '';
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
    if (!employees.value.length) await loadEmployeesOptional();
    if (!periodTicketRows.value.length) await loadPeriodOpenTickets();
    const rows = periodTicketRows.value.length
      ? periodTicketRows.value
      : await api.requests({
        period: selectedStatsPeriod.value,
        ...dashboardPeriodQuery(),
        limit: 5000
      });
    ticketList.value = {
      rows: Array.isArray(rows) ? rows : [],
      active: ticketFilterFromAction(action),
      mode: action,
      source: 'all',
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

function openCompanyModuleEmployeeDetail(row = {}) {
  companyModuleEmployeeDetail.value = row;
  modal.value = 'companyModuleEmployeeActivity';
}

function openCompanyTimelineDetail(row = {}) {
  setMetricDetail({
    title: row.name || 'Kompaniya tafsiloti',
    rows: [row],
    columns: productMetricColumns,
    empty: 'Kompaniya ma’lumoti topilmadi',
    showSourceTabs: false,
    summary: [
      { label: 'Boshlanish', value: row.start_label || '—' },
      { label: 'Obuna muddati', value: row.subscription_label || '—' },
      { label: 'Ishlatmoqda', value: row.usage_duration_label || '—' }
    ]
  });
}

function openAlertRequests(row = {}) {
  if (!row.chat_id) return openRemainingRequests();
  loadRequests({ chat_id: row.chat_id, title: row.title });
}

function closeModal() {
  hideFloatingTooltip();
  if (modal.value === 'chatDetail' || modal.value === 'metricDetail' || modal.value === 'employeeCompanies' || modal.value === 'companyGroupActivity') clearMediaUrls();
  if (modal.value === 'metricDetail') resetMetricChatDetail();
  if (modal.value === 'employeeCompanies') resetEmployeeProfileChat();
  if (modal.value === 'companyModuleEmployeeActivity') companyModuleEmployeeDetail.value = null;
  modal.value = '';
  selectedTarget.value = null;
}

async function sendSingleMessage() {
  if (!selectedTarget.value?.chat_id) return showToast('Chat tanlanmagan');
  startLoading('sendSingle');
  try {
    await api.sendMessage({ ...conversationQuery(selectedTarget.value), text: messageForm.text });
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

async function deleteEmployee(row) {
  const key = employeeKey(row);
  if (!key) return showToast('Xodim tanlanmagan');
  const ok = window.confirm(`${row.full_name || row.username || row.tg_user_id || 'Xodim'} ro‘yxatdan o‘chirilsinmi?`);
  if (!ok) return;
  deletingEmployeeId.value = key;
  startLoading('deleteEmployee');
  try {
    await api.deleteEmployee({ id: row.id || row.employee_id, tg_user_id: row.tg_user_id });
    employees.value = employees.value.filter(employee => employeeKey(employee) !== key);
    selectedEmployees.value = selectedEmployees.value.filter(employee => employeeKey(employee) !== key);
    showToast('Xodim o‘chirildi');
  } catch (error) {
    showToast(error.message);
  } finally {
    deletingEmployeeId.value = '';
    stopLoading('deleteEmployee');
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
  requestRows.value = await api.requests(conversationQuery(row));
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
  chatDetailFocusedMessageId.value = '';
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
  periodTicketRows.value = updateRequestListForClose(periodTicketRows.value, requestId, closedRequest);
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
  await Promise.all([
    loadDashboard(),
    activeTab.value === 'stats' ? loadPeriodOpenTickets() : Promise.resolve()
  ]);
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
  cancelInlineReply();
  chatTicketsOpen.value = true;
  startLoading('chatDetail');
  try {
    chatDetail.value = await api.chatDetail(conversationQuery(row));
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

async function sendGroupAuditStats() {
  startLoading('auditStats');
  try {
    const result = await api.sendGroupAuditStats({});
    showToast(`Audit statistikasi yuborildi: ${result.chat_id} · ${fmtNumber(result.saved_groups_count || 0)} guruh`);
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('auditStats');
  }
}

const webhookStatusText = computed(() => {
  if (!webhookStatus.value) return '';
  const info = webhookStatus.value.webhook || webhookStatus.value;
  const notes = info.diagnostics?.notes || [];
  const autoSync = telegramAutoSync.value;
  return [
    `Ulangan bot: ${info.bot ? `@${info.bot.username || '—'} (${info.bot.first_name || ''}, id: ${info.bot.id})` : (info.bot_error ? `aniqlanmadi (${info.bot_error})` : '—')}`,
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
    if (result.webhook_skipped) {
      stopTelegramAutoSync();
      return;
    }
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
    stopTelegramAutoSync();
    webhookStatus.value = await api.setTelegramWebhook({ app_url: window.location.origin });
    stopTelegramAutoSync();
    const info = webhookStatus.value?.webhook || webhookStatus.value || {};
    const connected = !!String(info.url || '').trim();
    showToast(connected ? 'Telegram webhook ulandi va saqlanadi.' : 'Telegram ulanishi yangilandi, lekin manzil hali ko‘rinmayapti.');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('webhookConnect');
  }
}

async function syncTelegramUpdates() {
  const info = currentWebhookInfo();
  if (String(info?.url || '').trim()) {
    const confirmed = window.confirm('Webhooksiz sinxronlash faol webhookni o‘chiradi. Davom etasizmi?');
    if (!confirmed) return;
  }
  startLoading('webhookSync');
  try {
    const result = await api.syncTelegramUpdates({
      limit: 100,
      mode: 'manual',
      ignore_saved_offset: true,
      allow_webhook_delete: true
    });
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
    if (settingsForm.group_message_audit === 'channel' && !settingsForm.group_message_audit_channel_id) {
      throw new Error('Audit kanali ID yoki username kiriting');
    }
    const useModel = settingsForm.ai_mode === 'model' && aiIntegrationReady.value;
    await api.saveSettings({
      settings: [
        {
          key: 'ai_mode',
          value: {
            enabled: settingsForm.ai_mode !== 'false',
            provider: useModel ? integrationForm.provider : null,
            model: useModel ? integrationForm.model : null,
            model_label: useModel ? (integrationForm.key_alias || integrationForm.label || integrationForm.model) : null
          }
        },
        { key: 'auto_reply', value: { enabled: settingsForm.auto_reply === 'true' } },
        { key: 'message_reactions', value: { enabled: settingsForm.message_reactions === 'true', ticket_close: settingsForm.message_reactions === 'true', accept_custom_emoji_as_eye: true } },
        {
          key: 'ticket_notifications',
          value: {
            enabled: settingsForm.ticket_notifications === 'true',
            target_chat_id: settingsForm.ticket_group_id,
            message_thread_id: settingsForm.ticket_topic_id,
            notify_on_ai: true,
            notify_on_reaction: true
          }
        },
        { key: 'done_tag', value: { tag: settingsForm.done_tag, auto_reply: true } },
        { key: 'main_group', value: { chat_id: settingsForm.main_group_id } },
        {
          key: 'group_message_audit',
          value: {
            enabled: settingsForm.group_message_audit !== 'false',
            target: settingsForm.group_message_audit === 'channel' ? 'channel' : 'main_group',
            channel_id: settingsForm.group_message_audit_channel_id
          }
        },
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
            label: integrationForm.key_alias || integrationForm.model || integrationForm.label || 'Uyqur AI',
            team: integrationForm.team,
            key_alias: integrationForm.key_alias,
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
        label: saved.label || saved.key_alias || saved.model || 'Uyqur AI',
        team: saved.team || '',
        key_alias: saved.key_alias || '',
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

function applySavedClickUpIntegration(saved = {}) {
  Object.assign(clickupForm, {
    enabled: saved.enabled === true,
    api_token: '',
    has_api_token: !!saved.has_api_token,
    newbies_list_id: saved.newbies_list_id || '',
    big_team_list_id: saved.big_team_list_id || '',
    newbies_chat_id: saved.newbies_chat_id || '',
    big_team_chat_id: saved.big_team_chat_id || '',
    done_status: saved.done_status || 'complete',
    last_check_status: saved.last_check_status || '',
    last_checked_at: saved.last_checked_at || '',
    last_check_error: saved.last_check_error || ''
  });
  savedClickUpSignature.value = clickUpConnectionSignature(clickupForm);
}

async function saveClickUpIntegration() {
  startLoading('saveClickUpIntegration');
  try {
    const rows = await api.saveSettings({
      settings: [{
        key: 'clickup_integration',
        value: {
          enabled: true,
          api_token: clickupForm.api_token,
          has_api_token: clickupForm.has_api_token,
          newbies_list_id: clickupForm.newbies_list_id,
          big_team_list_id: clickupForm.big_team_list_id,
          newbies_chat_id: clickupForm.newbies_chat_id,
          big_team_chat_id: clickupForm.big_team_chat_id,
          done_status: clickupForm.done_status || 'complete'
        }
      }]
    });
    const saved = rows.find(row => row.key === 'clickup_integration')?.value;
    if (saved) applySavedClickUpIntegration(saved);
    else clickupForm.has_api_token = Boolean(clickupForm.api_token || clickupForm.has_api_token);
    clickupForm.api_token = '';
    showToast(clickupForm.last_check_status === 'ok' ? 'ClickUp ulandi va tekshirildi' : 'ClickUp sozlamasi saqlandi');
  } catch (error) {
    clickupForm.last_check_status = 'failed';
    clickupForm.last_check_error = error.message;
    showToast(error.message);
  } finally {
    stopLoading('saveClickUpIntegration');
  }
}

async function disconnectClickUpIntegration() {
  const ok = window.confirm('ClickUp integratsiyasi uzilsinmi? Token va list sozlamalari o‘chiriladi.');
  if (!ok) return;
  startLoading('disconnectClickUp');
  try {
    const rows = await api.saveSettings({
      settings: [{
        key: 'clickup_integration',
        value: {
          enabled: false,
          disconnect: true,
          clear_token: true,
          api_token: '',
          newbies_list_id: '',
          big_team_list_id: '',
          newbies_chat_id: '',
          big_team_chat_id: '',
          done_status: 'complete'
        }
      }]
    });
    const saved = rows.find(row => row.key === 'clickup_integration')?.value;
    applySavedClickUpIntegration(saved || {});
    clickupTasks.value = [];
    showToast('ClickUp integratsiyasi uzildi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('disconnectClickUp');
  }
}

async function closeClickUpTask(row = {}) {
  if (!row.id) return showToast('Task tanlanmagan');
  const ok = window.confirm(`${row.title || 'ClickUp task'} yopildi deb belgilansinmi?`);
  if (!ok) return;
  startLoading('clickupTask');
  try {
    await api.updateClickupTask({ id: row.id, status: 'closed', close_clickup: true });
    await loadClickUpTasks();
    showToast('ClickUp task yopildi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('clickupTask');
  }
}

async function syncClickUpTask(row = {}) {
  if (!row.id) return showToast('Task tanlanmagan');
  startLoading('clickupTask');
  try {
    await api.updateClickupTask({ id: row.id, sync_clickup: true });
    await loadClickUpTasks();
    showToast('ClickUp task holati yangilandi');
  } catch (error) {
    showToast(error.message);
  } finally {
    stopLoading('clickupTask');
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
    document.addEventListener('pointerover', handleDocumentTooltipOver);
    document.addEventListener('pointermove', handleDocumentTooltipMove);
    document.addEventListener('pointerout', handleDocumentTooltipOut);
    document.addEventListener('focusin', handleDocumentTooltipFocusIn);
    document.addEventListener('focusout', handleDocumentTooltipFocusOut);
  }
  durationTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);
  if (token.value) {
    loadSettings().catch(error => showToast(error.message));
    await refresh();
    checkTelegramWebhook(false).catch(() => null);
  }
});

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    document.removeEventListener('keydown', handleDocumentKeydown);
    document.removeEventListener('pointerover', handleDocumentTooltipOver);
    document.removeEventListener('pointermove', handleDocumentTooltipMove);
    document.removeEventListener('pointerout', handleDocumentTooltipOut);
    document.removeEventListener('focusin', handleDocumentTooltipFocusIn);
    document.removeEventListener('focusout', handleDocumentTooltipFocusOut);
  }
  if (durationTimer) clearInterval(durationTimer);
  stopTelegramAutoSync();
  stopCompanyActivitySyncTimer();
  setModalScrollLock(false);
  Object.values(employeeAvatarUrls.value).filter(Boolean).forEach(url => URL.revokeObjectURL(url));
  Object.values(chatAvatarUrls.value).filter(Boolean).forEach(url => URL.revokeObjectURL(url));
});

const SearchField = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: 'search-field' }, [
      h('span', { class: 'search-field-icon', 'aria-hidden': 'true' }, [
        h('svg', { viewBox: '0 0 20 20', fill: 'none' }, [
          h('path', {
            d: 'M9 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z',
            stroke: 'currentColor',
            'stroke-width': '1.6'
          }),
          h('path', {
            d: 'm13.5 13.5 3 3',
            stroke: 'currentColor',
            'stroke-width': '1.6',
            'stroke-linecap': 'round'
          })
        ])
      ]),
      h('input', {
        class: 'search',
        type: 'search',
        value: props.modelValue,
        ...(props.placeholder ? { placeholder: props.placeholder } : {}),
        onInput: e => emit('update:modelValue', e.target.value)
      })
    ]);
  }
});

const Toolbar = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('div', { class: 'toolbar' }, [
      h(SearchField, {
        modelValue: props.modelValue,
        placeholder: props.placeholder,
        'onUpdate:modelValue': value => emit('update:modelValue', value)
      }),
      slots.default ? slots.default() : null
    ]);
  }
});

const Modal = defineComponent({
  props: { title: String, wide: Boolean, xlarge: Boolean },
  emits: ['close'],
  setup(props, { slots, emit }) {
    const modalClass = props.xlarge ? 'modal-xlarge' : (props.wide ? 'modal-wide' : '');
    return () => h('div', { class: 'modal-backdrop', onClick: () => emit('close') }, [
      h('section', { class: ['modal', modalClass], onClick: e => e.stopPropagation() }, [
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
    const renderPlainValue = (column, row) => {
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
    const renderValue = (column, row) => {
      if (column.slot && slots[column.slot]) {
        try {
          return slots[column.slot]({ row });
        } catch (error) {
          console.error('[webapp:data-table:slot-error]', {
            slot: column.slot,
            key: column.key,
            error: error && error.message ? error.message : String(error || 'Unknown error')
          });
        }
      }
      return renderPlainValue(column, row);
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
