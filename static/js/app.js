/* ─── App State ──────────────────────────────────────────────────────────────── */
let currentUser = null;
window._currentPage = null;

const INDUSTRY_KEYS = [
  "ind_auto","ind_hydraulic","ind_construction","ind_medical",
  "ind_appliance","ind_semiconductor","ind_aviation","ind_mold",
  "ind_general","ind_industrial","ind_railway","ind_energy"
];
const INVEST_PURPOSE_KEYS = ["inv_order","inv_production","inv_rd","inv_upgrade"];
const KEY_POINTS_KEYS = [
  "kp_precision","kp_price","kp_automation","kp_trial",
  "kp_efficiency","kp_delivery","kp_onestop","kp_changeover",
  "kp_stability","kp_network","kp_intl_case","kp_domestic_case",
  "kp_config","kp_acceptance","kp_payment","kp_training",
  "kp_aftersales","kp_turnkey"
];
const STATUS_LIST = ["draft","pending_l1","pending_l2","approved","rejected","contracted","expired"];

/* ─── Boot ───────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  applyTranslations();
  updateLangButtons();

  // ── Handle ?invite=CODE in URL ─────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get("invite");
  if (inviteCode) {
    // Pre-fill and show register tab
    const token = getToken();
    if (!token) {
      // Show login page first, then switch to register
      document.getElementById("login-page").classList.remove("hidden");
      document.getElementById("app").classList.add("hidden");
      showLoginTab("register");
      const codeInput = document.getElementById("reg-invite-code");
      if (codeInput) {
        codeInput.value = inviteCode.toUpperCase();
        validateInviteCodeUI(inviteCode.toUpperCase());
      }
      return;
    }
  }

  // ── Invite code live validation ────────────────────────────────────────
  document.getElementById("reg-invite-code")?.addEventListener("blur", async function() {
    await validateInviteCodeUI(this.value);
  });

  const token = getToken();
  if (token) {
    try {
      currentUser = await api.me();
      if (currentUser) { showApp(); await navigate("dashboard"); }
      else showLogin();
    } catch { showLogin(); }
  } else {
    showLogin();
  }
});

async function validateInviteCodeUI(code) {
  const msg = document.getElementById("invite-validate-msg");
  if (!msg || !code || code.length < 6) return;
  try {
    const res = await api.validateInvitation(code);
    if (res?.valid) {
      msg.innerHTML = `<span style="color:var(--success)">✅ 邀请码有效${res.note ? " — " + res.note : ""}</span>`;
    } else {
      msg.innerHTML = `<span style="color:var(--danger)">❌ 邀请码无效或已过期</span>`;
    }
  } catch { msg.innerHTML = ""; }
}

/* ─── Auth ───────────────────────────────────────────────────────────────────── */
function showLogin() {
  document.getElementById("login-page").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  applyTranslations();
  updateLangButtons();
}

function showApp() {
  document.getElementById("login-page").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  setupSidebarVisibility();
  updateTopbar();
  loadNotifications();
}

function showLoginTab(tab) {
  document.getElementById("login-form").classList.toggle("hidden", tab !== "login");
  document.getElementById("register-form").classList.toggle("hidden", tab !== "register");
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  errEl.classList.add("hidden");
  try {
    const res = await api.login(
      document.getElementById("login-username").value,
      document.getElementById("login-password").value
    );
    if (!res) return;
    setToken(res.token);
    currentUser = res.user;
    // Sync language from server
    if (currentUser.language) { currentLang = currentUser.language; localStorage.setItem("crm_lang", currentLang); }
    showApp();
    await navigate("dashboard");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById("register-error");
  errEl.classList.add("hidden");
  try {
    const res = await api.register({
      username: document.getElementById("reg-username").value,
      email: document.getElementById("reg-email").value,
      password: document.getElementById("reg-password").value,
      company_name_cn: document.getElementById("reg-company-cn").value,
      contact_name: document.getElementById("reg-contact").value,
      phone: document.getElementById("reg-phone").value,
      invitation_code: document.getElementById("reg-invite-code")?.value || "",
    });
    if (!res) return;
    setToken(res.token);
    currentUser = res.user;
    showApp();
    await navigate("dashboard");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
}

function handleLogout() {
  clearToken();
  currentUser = null;
  showLogin();
}

/* ─── Layout ─────────────────────────────────────────────────────────────────── */
function setupSidebarVisibility() {
  if (!currentUser) return;
  const role = currentUser.role;
  const isPlatform = ["admin","platform_staff","super_admin","maintenance"].includes(role);
  const isAdmin    = ["admin","super_admin","maintenance"].includes(role);
  document.querySelectorAll(".dealer-only").forEach(el => el.classList.toggle("hidden", role !== "dealer"));
  document.querySelectorAll(".platform-only").forEach(el => el.classList.toggle("hidden", !isPlatform));
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
}

function updateTopbar() {
  const u = currentUser;
  if (!u) return;
  const name = u.dealer?.company_name_cn || u.employee?.name || u.username;
  document.getElementById("topbar-user").textContent = name;
  applyTranslations();
  updateLangButtons();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

function updateNavActive(page) {
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });
}

/* ─── Notifications ─────────────────────────────────────────────────────────── */
async function loadNotifications() {
  try {
    const notifs = await api.notifications();
    if (!notifs) return;
    const unread = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById("notif-badge");
    badge.textContent = unread;
    badge.classList.toggle("hidden", unread === 0);
    if (currentUser?.unread_notifications !== undefined) {
      const rb = document.getElementById("review-badge");
      if (rb && currentUser.employee) {
        // show pending reviews count via dashboard
      }
    }
  } catch {}
}

function toggleNotifications() {
  const panel = document.getElementById("notif-panel");
  if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
  renderNotifPanel();
  panel.classList.remove("hidden");
}

async function renderNotifPanel() {
  const panel = document.getElementById("notif-panel");
  panel.innerHTML = `<div class="notif-header"><strong>${t("nav_profile")}</strong><button class="btn btn-sm btn-ghost" onclick="markAllRead()">全部已读</button></div><div class="loading-spinner" style="height:80px"><div class="spinner"></div></div>`;
  try {
    const notifs = await api.notifications();
    let html = `<div class="notif-header"><strong>通知</strong><button class="btn btn-sm btn-ghost" onclick="markAllRead()">全部已读</button></div>`;
    if (!notifs || notifs.length === 0) {
      html += `<div class="empty-state" style="padding:30px"><div>${t("no_data")}</div></div>`;
    } else {
      notifs.forEach(n => {
        html += `<div class="notif-item ${n.is_read ? "" : "unread"}" onclick="handleNotifClick(${n.related_id})">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${formatDateTime(n.created_at)}</div>
        </div>`;
      });
    }
    panel.innerHTML = html;
  } catch { panel.innerHTML = `<div style="padding:20px;text-align:center">${t("error_general")}</div>`; }
}

async function markAllRead() {
  await api.markAllRead();
  document.getElementById("notif-badge").classList.add("hidden");
  document.getElementById("notif-panel").classList.add("hidden");
}

async function handleNotifClick(reportId) {
  document.getElementById("notif-panel").classList.add("hidden");
  if (reportId) await navigate("report-detail", { id: reportId });
}

/* ─── Router ─────────────────────────────────────────────────────────────────── */
async function navigate(page, params = {}) {
  window._currentPage = page;
  window._pageParams = params;
  updateNavActive(page);
  const pageKey = `page_${page.replace("-", "_")}`;
  document.getElementById("page-title").textContent = t(pageKey) || page;
  await renderPage(page, params);
}

async function renderPage(page, params = {}) {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
  try {
    switch (page) {
      case "dashboard":    await renderDashboard(content); break;
      case "new-report":   await renderReportForm(content, null); break;
      case "my-reports":   await renderReportList(content, { myOnly: true }); break;
      case "my-customers": await renderCustomerList(content, { myOnly: true }); break;
      case "reviews":      await renderReviewQueue(content); break;
      case "all-reports":  await renderReportList(content, {}); break;
      case "dealers":      await renderDealerList(content); break;
      case "all-customers":await renderCustomerList(content, {}); break;
      case "products":     await renderProducts(content); break;
      case "employees":    await renderEmployees(content); break;
      case "templates":    await renderTemplates(content); break;
      case "invitations":  await renderInvitations(content); break;
      case "profile":      await renderProfile(content); break;
      case "report-detail":await renderReportDetail(content, params.id); break;
      default: content.innerHTML = `<div class="empty-state"><div>Page not found</div></div>`;
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>${err.message}</div></div>`;
  }
}

/* ─── Dashboard ──────────────────────────────────────────────────────────────── */
async function renderDashboard(el) {
  const stats = await api.dashboard();
  if (!stats) return;
  const isDealer = currentUser.role === "dealer";

  let html = `<div class="stats-grid">`;
  if (isDealer) {
    html += statCard("📋", stats.total_reports, t("stat_my_reports"));
    html += statCard("⏳", stats.pending_reports, t("stat_pending"), "warning");
    html += statCard("✅", stats.approved_reports, t("stat_approved_reports"), "success");
    html += statCard("🏆", stats.contracted_reports, t("stat_contracted_reports"), "accent");
    html += statCard("👥", stats.total_customers, t("stat_my_customers"));
  } else {
    html += statCard("🏭", stats.total_dealers, t("stat_total_dealers"));
    html += statCard("📋", stats.total_reports, t("stat_total_reports"));
    html += statCard("⏳", stats.pending_reviews, t("stat_pending_reviews"), "warning");
    html += statCard("👥", stats.total_customers, t("stat_total_customers"));
    html += statCard("🏆", stats.contracted_customers, t("stat_contracted"), "accent");
    if (stats.duplicate_warnings > 0)
      html += statCard("⚠️", stats.duplicate_warnings, "重复警告", "danger");
    else
      html += statCard("✅", stats.approved_reports, t("stat_approved"), "success");
  }
  html += `</div>`;

  // AI priority review queue for platform
  if (!isDealer && stats.top_pending?.length) {
    html += `<div class="card mb-4">
      <div class="card-header">
        <span class="card-title">🤖 ${t("ai_sort_by_score")} — ${t("nav_reviews")} Top ${stats.top_pending.length}</span>
        <button class="btn btn-sm btn-outline" onclick="navigate('reviews')">${t("nav_reviews")} →</button>
      </div>
      <table class="data-table"><thead><tr>
        <th>${t("registration_no")}</th>
        <th>${t("customer_name_cn")}</th>
        <th>${t("applicant_company")}</th>
        <th>状态</th>
        <th>${t("ai_score")}</th>
        <th>操作</th>
      </tr></thead><tbody>`;
    stats.top_pending.forEach(r => {
      const score = r.ai_score ?? "—";
      const scoreColor = r.ai_score >= 80 ? "success" : r.ai_score >= 60 ? "info" : r.ai_score >= 40 ? "warning" : "danger";
      html += `<tr>
        <td>
          ${r.has_duplicate_warning ? `<span title="重复警告" style="color:var(--danger);margin-right:4px">⚠️</span>` : ""}
          <a href="#" onclick="navigate('report-detail',{id:${r.id}})" style="color:var(--primary);font-weight:600">${r.registration_no}</a>
        </td>
        <td>${r.customer_name_cn || "—"}</td>
        <td>${r.applicant_company || "—"}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.ai_score != null ? `<span class="status-badge status-${r.ai_score >= 80 ? "approved" : r.ai_score >= 60 ? "contracted" : r.ai_score >= 40 ? "pending_l1" : "rejected"}" style="font-size:13px;font-weight:700">${score}</span>` : "—"}</td>
        <td><button class="btn btn-sm btn-outline" onclick="navigate('report-detail',{id:${r.id}})">审核</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Rules reminder for dealers
  if (isDealer) {
    html += `<div class="card mt-3">
      <div class="card-header"><span class="card-title">📜 ${t("report_rules_title")}</span></div>
      <div class="card-body">
        <ul style="padding-left:20px;line-height:2;font-size:13.5px;color:var(--text-muted)">
          ${[1,2,3,4,5].map(i => `<li>${t("rule"+i)}</li>`).join("")}
        </ul>
      </div>
    </div>`;
  }

  // Quick actions
  if (isDealer) {
    html += `<div class="flex gap-3 mt-3">
      <button class="btn btn-primary" onclick="navigate('new-report')">＋ ${t("nav_new_report")}</button>
      <button class="btn btn-outline" onclick="navigate('my-reports')">${t("nav_my_reports")}</button>
    </div>`;
  } else {
    html += `<div class="flex gap-3 mt-3">
      <button class="btn btn-primary" onclick="navigate('reviews')">⏳ ${t("nav_reviews")} (${stats.pending_reviews})</button>
      <button class="btn btn-outline" onclick="navigate('all-reports')">${t("nav_all_reports")}</button>
      <button class="btn btn-outline" onclick="navigate('invitations')">🔑 ${t("nav_invitations")}</button>
    </div>`;
  }
  el.innerHTML = html;
}

function statCard(icon, value, label, color = "") {
  return `<div class="stat-card ${color}">
    <div class="stat-icon">${icon}</div>
    <div class="stat-value">${value ?? 0}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

/* ─── Report List ────────────────────────────────────────────────────────────── */
async function renderReportList(el, { myOnly = false } = {}) {
  let search = "", filterStatus = "";
  async function load() {
    const params = { search, status: filterStatus };
    const data = await api.listReports(params);
    renderList(data);
  }

  function renderList(data) {
    const isDealer = currentUser.role === "dealer";
    const items = data?.items || [];
    const total = data?.total || 0;

    const statusOptions = STATUS_LIST.map(s => `<option value="${s}">${t("status_" + s)}</option>`).join("");

    let html = `<div class="table-toolbar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="${t("search")}..." value="${search}"
          oninput="reportSearch(this.value)" />
      </div>
      <div class="toolbar-actions">
        <select onchange="reportFilter(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
          <option value="">${t("all_status")}</option>${statusOptions}
        </select>
        ${!myOnly ? `<button class="btn btn-outline btn-sm" onclick="exportReports()">📥 ${t("export")}</button>` : ""}
      </div>
    </div>`;

    if (items.length === 0) {
      html += emptyState();
    } else {
      html += `<div class="card"><table class="data-table"><thead><tr>
        <th>${t("registration_no")}</th>
        <th>${t("customer_name_cn")}</th>
        ${!isDealer ? `<th>${t("applicant_company")}</th>` : ""}
        <th>${t("part_name")}</th>
        <th>状态</th>
        ${!isDealer ? `<th>${t("ai_score")}</th>` : ""}
        <th>${t("valid_until")}</th>
        <th>${t("application_date")}</th>
        <th>操作</th>
      </tr></thead><tbody>`;

      items.forEach(r => {
        const days = daysUntil(r.valid_until);
        const expiryClass = days !== null && days < 14 ? "text-danger fw-bold" : days < 30 ? "text-warning fw-bold" : "";
        const scoreClass = !r.ai_score ? "" : r.ai_score >= 80 ? "status-approved" : r.ai_score >= 60 ? "status-contracted" : r.ai_score >= 40 ? "status-pending_l1" : "status-rejected";
        html += `<tr>
          <td>
            ${r.has_duplicate_warning ? `<span title="⚠️重复警告" style="color:var(--danger)">⚠️ </span>` : ""}
            <a href="#" onclick="navigate('report-detail',{id:${r.id}})" style="color:var(--primary);font-weight:600">${r.registration_no}</a>
          </td>
          <td>${r.customer_name_cn || "—"}</td>
          ${!isDealer ? `<td>${r.applicant_company || "—"}</td>` : ""}
          <td>${r.part_name || "—"}</td>
          <td>${statusBadge(r.status)}</td>
          ${!isDealer ? `<td>${r.ai_score != null ? `<span class="status-badge ${scoreClass}">${r.ai_score}</span>` : "—"}</td>` : ""}
          <td class="${expiryClass}">${r.valid_until ? formatDate(r.valid_until) : (r.status === "contracted" ? "♾️" : "—")}</td>
          <td>${formatDate(r.application_date)}</td>
          <td><div class="actions-cell">
            <button class="btn btn-sm btn-outline" onclick="navigate('report-detail',{id:${r.id}})">查看</button>
            ${r.status === "draft" ? `<button class="btn btn-sm btn-primary" onclick="navigate('new-report',{id:${r.id}})">编辑</button>` : ""}
            ${r.status === "draft" || r.status === "rejected" ? `<button class="btn btn-sm btn-danger" onclick="deleteReport(${r.id})">删除</button>` : ""}
          </div></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
      html += `<div class="text-muted text-sm mt-3">${t("total")} ${total} ${t("items")}</div>`;
    }

    el.innerHTML = html;
    document.querySelector(".search-input-wrap input")?.addEventListener("keyup", e => {
      search = e.target.value;
      load();
    });
  }

  window.reportSearch = (v) => { search = v; load(); };
  window.reportFilter = (v) => { filterStatus = v; load(); };
  window.exportReports = () => downloadExcel("/reports/export/excel", "reports.xlsx");
  window.deleteReport = (id) => confirmAction(t("confirm_delete"), async () => {
    try { await api.deleteReport(id); showToast(t("success_deleted"), "success"); load(); }
    catch (e) { showToast(e.message, "error"); }
  });

  await load();
}

/* ─── Review Queue ──────────────────────────────────────────────────────────── */
async function renderReviewQueue(el) {
  const pendingStatuses = currentUser.role === "admin"
    ? ["pending_l1", "pending_l2"]
    : [`pending_l${currentUser.employee?.review_level || 1}`];

  const allPending = [];
  for (const s of pendingStatuses) {
    const data = await api.listReports({ status: s });
    if (data?.items) allPending.push(...data.items);
  }

  let html = `<div class="card">`;
  if (allPending.length === 0) {
    html += `<div class="card-body">${emptyState()}</div>`;
  } else {
    html += `<table class="data-table"><thead><tr>
      <th>${t("registration_no")}</th>
      <th>${t("customer_name_cn")}</th>
      <th>${t("applicant_company")}</th>
      <th>状态</th>
      <th>${t("application_date")}</th>
      <th>操作</th>
    </tr></thead><tbody>`;
    allPending.forEach(r => {
      html += `<tr>
        <td><strong>${r.registration_no}</strong></td>
        <td>${r.customer_name_cn}</td>
        <td>${r.applicant_company}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${formatDate(r.application_date)}</td>
        <td><div class="actions-cell">
          <button class="btn btn-sm btn-outline" onclick="navigate('report-detail',{id:${r.id}})">查看详情</button>
          <button class="btn btn-sm btn-success" onclick="quickApprove(${r.id})">${t("approve")}</button>
          <button class="btn btn-sm btn-danger" onclick="openRejectModal(${r.id})">${t("reject")}</button>
        </div></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  el.innerHTML = html;

  window.quickApprove = async (id) => {
    confirmAction(t("confirm_approve"), async () => {
      try {
        await api.reviewReport(id, "approve", "");
        showToast(t("success_approved"), "success");
        await renderReviewQueue(el);
      } catch (e) { showToast(e.message, "error"); }
    });
  };

  window.openRejectModal = (id) => {
    const body = `
      <div class="form-group">
        <label><span class="req">*</span> ${t("review_reason")}</label>
        <textarea id="reject-reason" rows="4" placeholder="${t("rejection_reason_placeholder")}"></textarea>
      </div>`;
    const footer = `
      <button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button>
      <button class="btn btn-danger" onclick="submitReject(${id})">${t("reject")}</button>`;
    showModal(t("reject"), body, footer);
  };

  window.submitReject = async (id) => {
    const reason = document.getElementById("reject-reason")?.value?.trim();
    if (!reason) { showToast(t("rejection_reason_placeholder"), "warning"); return; }
    try {
      await api.reviewReport(id, "reject", reason);
      closeModal();
      showToast(t("success_rejected"), "success");
      await renderReviewQueue(el);
    } catch (e) { showToast(e.message, "error"); }
  };
}

/* ─── Report Form ────────────────────────────────────────────────────────────── */
async function renderReportForm(el, existingId = null) {
  let existing = null;
  if (existingId) {
    existing = await api.getReport(existingId);
    // Cache for submission validation (drawing check)
    if (!window._reportCache) window._reportCache = {};
    window._reportCache[existingId] = existing;
  }

  function checkboxGroup(keys, selected = [], name, cols = 4) {
    const grid = cols === 4 ? "checkbox-grid" : "checkbox-grid checkbox-grid-2";
    return `<div class="${grid}">` +
      keys.map(k => `
        <label class="checkbox-item ${selected.includes(t(k)) ? "checked" : ""}" onclick="this.classList.toggle('checked')">
          <input type="checkbox" name="${name}" value="${t(k)}" ${selected.includes(t(k)) ? "checked" : ""} />
          ${t(k)}
        </label>`).join("") +
      `</div>`;
  }

  const v = existing || {};
  const today = new Date().toISOString().split("T")[0];

  el.innerHTML = `
  <form id="report-form" onsubmit="submitReportForm(event, ${existingId || "null"})">

    <!-- App Info -->
    <div class="form-section">
      <div class="form-section-header">📋 ${t("section_app_info")}</div>
      <div class="form-section-body">
        <div class="form-grid">
          <div class="form-group">
            <label>${t("registration_no")}</label>
            <div class="reg-no-display">${v.registration_no || "（提交后自动生成）"}</div>
          </div>
          <div class="form-group">
            <label>${t("application_date")}</label>
            <div style="font-size:14px;padding:8px 0">${formatDate(v.application_date || new Date().toISOString())}</div>
          </div>
          <div class="form-group">
            <label><span class="req">*</span> ${t("applicant_company")}</label>
            <input type="text" id="f-company" value="${v.applicant_company || currentUser.dealer?.company_name_cn || ""}" required />
          </div>
          <div class="form-group">
            <label><span class="req">*</span> ${t("applicant_name")}</label>
            <input type="text" id="f-name" value="${v.applicant_name || currentUser.dealer?.contact_name || ""}" required />
          </div>
          <div class="form-group form-col-full">
            <label>${t("contact_info")}</label>
            <input type="text" id="f-contact" value="${v.contact_info || ""}" placeholder="电话 / 邮箱" />
          </div>
        </div>
      </div>
    </div>

    <!-- Customer Info -->
    <div class="form-section">
      <div class="form-section-header">👥 ${t("section_customer_info")}</div>
      <div class="form-section-body">
        <div class="warning-box">⚠️ ${t("industry_warning")}</div>
        <div class="form-grid">
          <div class="form-group">
            <label><span class="req">*</span> ${t("customer_name_cn")}</label>
            <input type="text" id="f-cname-cn" value="${v.customer_name_cn || ""}" required />
          </div>
          <div class="form-group">
            <label>${t("customer_name_en")}</label>
            <input type="text" id="f-cname-en" value="${v.customer_name_en || ""}" />
          </div>
          <div class="form-group">
            <label>${t("customer_address_cn")}</label>
            <input type="text" id="f-addr-cn" value="${v.customer_address_cn || ""}" />
          </div>
          <div class="form-group">
            <label>${t("customer_address_en")}</label>
            <input type="text" id="f-addr-en" value="${v.customer_address_en || ""}" />
          </div>
          <div class="form-group form-col-full">
            <label>${t("customer_website")}</label>
            <input type="text" id="f-website" value="${v.customer_website || ""}" placeholder="https://" />
          </div>
        </div>
      </div>
    </div>

    <!-- Industry -->
    <div class="form-section">
      <div class="form-section-header">🏭 ${t("section_industry")}</div>
      <div class="form-section-body">
        ${checkboxGroup(INDUSTRY_KEYS, v.industry_categories || [], "industry")}
      </div>
    </div>

    <!-- Project Info -->
    <div class="form-section">
      <div class="form-section-header">⚙️ ${t("section_project_info")}</div>
      <div class="form-section-body">
        <div class="form-grid">
          <div class="form-group">
            <label>${t("part_name")}</label>
            <input type="text" id="f-part" value="${v.part_name || ""}" />
          </div>
          <div class="form-group">
            <label>${t("final_product_use")}</label>
            <input type="text" id="f-use" value="${v.final_product_use || ""}" />
          </div>
          <div class="form-group">
            <label>${t("production_capacity")}</label>
            <input type="text" id="f-capacity" value="${v.production_capacity || ""}" />
          </div>
          <div class="form-group">
            <label>${t("similar_product_count")}</label>
            <input type="text" id="f-similar" value="${v.similar_product_count || ""}" />
          </div>
          <div class="form-group">
            <label>${t("project_budget")}</label>
            <input type="text" id="f-budget" value="${v.project_budget || ""}" placeholder="￥ / $ / ¥" />
          </div>
          <div class="form-group">
            <label>${t("delivery_deadline")}</label>
            <input type="text" id="f-delivery" value="${v.delivery_deadline || ""}" />
          </div>
          <div class="form-group">
            <label>${t("project_model")}</label>
            <input type="text" id="f-model" value="${v.project_model || ""}" />
          </div>
          <div class="form-group">
            <label>${t("estimated_quantity")}</label>
            <input type="text" id="f-qty" value="${v.estimated_quantity || ""}" placeholder="例：2台" />
          </div>
          <div class="form-group">
            <label>${t("main_competitors")}</label>
            <input type="text" id="f-competitors" value="${v.main_competitors || ""}" />
          </div>
        </div>

        <div class="form-group mt-3">
          <label>${t("investment_purpose")}（可多选）</label>
          ${checkboxGroup(INVEST_PURPOSE_KEYS, v.investment_purpose || [], "invest_purpose", 2)}
        </div>

        <div class="form-group mt-3">
          <label>${t("project_key_points")}（可多选）</label>
          ${checkboxGroup(KEY_POINTS_KEYS, v.project_key_points || [], "key_points", 4)}
        </div>

        <div class="form-group mt-3">
          <label>${t("sales_opinion")}</label>
          <textarea id="f-opinion" rows="4">${v.sales_opinion || ""}</textarea>
        </div>

        <!-- Communication type (required) -->
        <div class="form-group mt-4" style="border-top:1px solid var(--border);padding-top:16px">
          <label style="font-size:14px;font-weight:600;color:var(--text)">
            <span class="req">*</span> ${t("comm_section")}
          </label>
          <div class="flex gap-4 mt-2" style="align-items:center;flex-wrap:wrap">
            <label class="flex gap-2" style="align-items:center;cursor:pointer;font-size:14px">
              <input type="radio" name="comm_type" id="comm-meeting" value="面谈"
                ${(v.comm_type === "面谈") ? "checked" : ""}
                onchange="document.getElementById('comm-persons-block').style.display='block'" />
              <span style="font-weight:600">🤝 ${t("comm_type_meeting")}</span>
            </label>
            <label class="flex gap-2" style="align-items:center;cursor:pointer;font-size:14px">
              <input type="radio" name="comm_type" id="comm-online" value="网络交流"
                ${(v.comm_type === "网络交流") ? "checked" : ""}
                onchange="document.getElementById('comm-persons-block').style.display='none'" />
              <span style="font-weight:600">💻 ${t("comm_type_online")}</span>
            </label>
            <div class="form-group" style="margin:0;min-width:150px">
              <input type="number" id="f-comm-count" min="1" max="99"
                value="${v.comm_count || ""}"
                placeholder="${t("comm_count")}"
                style="width:100%;padding:6px 10px;font-size:13px" />
            </div>
            <span style="font-size:12px;color:var(--text-muted)">${t("comm_count")}</span>
          </div>

          <!-- Face-to-face participants (shown only when 面谈 selected) -->
          <div id="comm-persons-block" style="display:${v.comm_type === "面谈" ? "block" : "none"};margin-top:14px">
            <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px">
              👤 ${t("comm_persons")}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div style="background:var(--bg);border-radius:8px;padding:12px">
                <div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:8px">${t("comm_person1")}</div>
                <div class="form-group" style="margin-bottom:6px">
                  <input type="text" id="f-p1-name" value="${v.comm_person1_name || ""}"
                    placeholder="${t("comm_person_name")}"
                    style="width:100%;padding:6px 10px;font-size:13px" />
                </div>
                <div class="form-group" style="margin:0">
                  <input type="text" id="f-p1-title" value="${v.comm_person1_title || ""}"
                    placeholder="${t("comm_person_title")}"
                    style="width:100%;padding:6px 10px;font-size:13px" />
                </div>
              </div>
              <div style="background:var(--bg);border-radius:8px;padding:12px">
                <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">${t("comm_person2")}</div>
                <div class="form-group" style="margin-bottom:6px">
                  <input type="text" id="f-p2-name" value="${v.comm_person2_name || ""}"
                    placeholder="${t("comm_person_name")}"
                    style="width:100%;padding:6px 10px;font-size:13px" />
                </div>
                <div class="form-group" style="margin:0">
                  <input type="text" id="f-p2-title" value="${v.comm_person2_title || ""}"
                    placeholder="${t("comm_person_title")}"
                    style="width:100%;padding:6px 10px;font-size:13px" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress -->
    <div class="form-section">
      <div class="form-section-header">📅 ${t("section_progress")}</div>
      <div class="form-section-body">
        <div class="progress-steps">
          ${[1,2,3,4,5].map(i => {
            const dateVal = v[`step${i}_date`] ? v[`step${i}_date`].split("T")[0] : "";
            return `<div class="progress-step ${dateVal ? "completed" : ""}" id="step-row-${i}">
              <div class="step-num">${i}</div>
              <div class="step-label">${t("step"+i)}</div>
              <div class="step-date">
                <input type="date" id="f-step${i}" value="${dateVal}"
                  onchange="document.getElementById('step-row-${i}').classList.toggle('completed', !!this.value)" />
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- Attachments -->
    <div class="form-section">
      <div class="form-section-header">📎 ${t("section_attachments")}</div>
      <div class="form-section-body">
        <p class="text-muted text-sm mb-3">${t("req_business_card")}<br>${t("req_drawing")}</p>

        ${existing ? `
        <div id="existing-files" style="margin-bottom:20px">
          <strong style="font-size:13px">${t("section_attachments")}（已上传）</strong>
          <div class="file-list mt-2">
            ${(v.attachments || []).map(a => `
              <div class="file-item" id="att-${a.id}">
                <span class="file-item-name">📄 ${a.original_name}</span>
                <span class="file-item-size">${fileSizeLabel(a.file_size)}</span>
                <span style="font-size:11px;color:var(--text-muted)">[${a.file_type}]</span>
                <button class="btn btn-sm btn-ghost" onclick="downloadFile('${API_BASE}/files/report/${v.id}/${a.id}', '${a.original_name}')">⬇</button>
                <button class="btn btn-sm btn-ghost text-danger" onclick="removeAttachment(${v.id}, ${a.id})">✕</button>
              </div>`).join("") || `<div class="text-muted text-sm">${t("no_data")}</div>`}
          </div>
        </div>` : ""}

        <div class="form-grid">
          ${uploadArea("business_card_front", t("ft_business_card_front"), ".pdf")}
          ${uploadArea("business_card_back", t("ft_business_card_back"), ".pdf")}
          ${uploadArea("project_drawing", `<span class="req">*</span> ${t("ft_project_drawing")}`, ".pdf,.jpg,.jpeg,.png")}
        </div>

        ${uploadArea("other", t("ft_other"), "*", true)}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 mb-4">
      <button type="submit" name="action" value="save" class="btn btn-outline">💾 保存草稿</button>
      <button type="button" class="btn btn-primary" onclick="saveThenSubmit(${existingId || "null"})">📨 ${t("submit")}</button>
    </div>
  </form>`;

  // File upload handlers
  document.querySelectorAll(".upload-zone").forEach(zone => {
    const input = zone.querySelector("input[type=file]");
    const ft = zone.dataset.fileType;
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("dragover"); handleFileSelect(e.dataTransfer.files, ft, zone, existingId); });
    input.addEventListener("change", () => handleFileSelect(input.files, ft, zone, existingId));
  });

  window.removeAttachment = async (reportId, attachId) => {
    try {
      await api.deleteReportFile(reportId, attachId);
      document.getElementById(`att-${attachId}`)?.remove();
      showToast(t("success_deleted"), "success");
    } catch (e) { showToast(e.message, "error"); }
  };
}

function uploadArea(fileType, label, accept, multiple = false) {
  return `<div class="form-group">
    <label>${label}</label>
    <div class="upload-zone" data-file-type="${fileType}">
      <input type="file" accept="${accept}" ${multiple ? "multiple" : ""} />
      <div class="upload-icon">📁</div>
      <div class="upload-text">${t("upload")} — 点击或拖放</div>
    </div>
    <div class="file-list" id="fl-${fileType}"></div>
  </div>`;
}

async function handleFileSelect(files, fileType, zone, reportId) {
  const listEl = document.getElementById(`fl-${fileType}`);
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `<span class="file-item-name">📄 ${file.name}</span><span class="file-item-size">${fileSizeLabel(file.size)}</span><span style="font-size:11px;color:var(--info)">上传中...</span>`;
    listEl?.appendChild(item);

    if (reportId) {
      try {
        const res = await api.uploadReportFile(reportId, fileType, file);
        item.innerHTML = `<span class="file-item-name">✅ ${file.name}</span><span class="file-item-size">${fileSizeLabel(file.size)}</span>`;
      } catch (e) {
        item.innerHTML = `<span class="file-item-name">❌ ${file.name}</span><span style="color:var(--danger);font-size:11px">${e.message}</span>`;
      }
    } else {
      // Store for later upload after report is created
      if (!window._pendingFiles) window._pendingFiles = [];
      window._pendingFiles.push({ file, fileType });
      item.querySelector("span:last-child").textContent = "待提交后上传";
    }
  }
}

async function submitReportForm(e, existingId) {
  e.preventDefault();
  const action = e.submitter?.value || "save";
  await saveReport(existingId, action === "save");
}

async function saveThenSubmit(existingId) {
  // 1. Validate comm_type (required)
  const commType = document.querySelector('input[name="comm_type"]:checked')?.value || "";
  if (!commType) {
    showToast(t("comm_type_required"), "warning");
    document.getElementById("comm-meeting")?.closest(".form-group")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // 2. Validate drawing attachment (required for submission)
  const existingDrawing = existingId
    ? (window._reportCache?.[existingId]?.attachments || []).some(a => a.file_type === "project_drawing")
    : false;
  const pendingDrawing = (window._pendingFiles || []).some(f => f.fileType === "project_drawing");
  if (!existingDrawing && !pendingDrawing) {
    showToast(t("req_drawing_missing"), "warning");
    document.querySelector('[data-file-type="project_drawing"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const id = await saveReport(existingId, false);
  if (!id) return;
  confirmAction(t("confirm_submit"), async () => {
    try {
      await api.submitReport(id);
      showToast(t("success_submitted"), "success");
      await navigate("my-reports");
    } catch (e) { showToast(e.message, "error"); }
  });
}

async function saveReport(existingId, showSuccess = true) {
  const getChecked = (name) =>
    [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);

  const payload = {
    applicant_company: document.getElementById("f-company")?.value || "",
    applicant_name: document.getElementById("f-name")?.value || "",
    contact_info: document.getElementById("f-contact")?.value || "",
    customer_name_cn: document.getElementById("f-cname-cn")?.value || "",
    customer_name_en: document.getElementById("f-cname-en")?.value || "",
    customer_address_cn: document.getElementById("f-addr-cn")?.value || "",
    customer_address_en: document.getElementById("f-addr-en")?.value || "",
    customer_website: document.getElementById("f-website")?.value || "",
    industry_categories: getChecked("industry"),
    part_name: document.getElementById("f-part")?.value || "",
    final_product_use: document.getElementById("f-use")?.value || "",
    production_capacity: document.getElementById("f-capacity")?.value || "",
    similar_product_count: document.getElementById("f-similar")?.value || "",
    project_budget: document.getElementById("f-budget")?.value || "",
    delivery_deadline: document.getElementById("f-delivery")?.value || "",
    project_model: document.getElementById("f-model")?.value || "",
    estimated_quantity: document.getElementById("f-qty")?.value || "",
    main_competitors: document.getElementById("f-competitors")?.value || "",
    investment_purpose: getChecked("invest_purpose"),
    project_key_points: getChecked("key_points"),
    sales_opinion: document.getElementById("f-opinion")?.value || "",
    comm_type: document.querySelector('input[name="comm_type"]:checked')?.value || "",
    comm_count: document.getElementById("f-comm-count")?.value || "",
    comm_person1_name: document.getElementById("f-p1-name")?.value || "",
    comm_person1_title: document.getElementById("f-p1-title")?.value || "",
    comm_person2_name: document.getElementById("f-p2-name")?.value || "",
    comm_person2_title: document.getElementById("f-p2-title")?.value || "",
  };

  if (!payload.customer_name_cn || !payload.applicant_name || !payload.applicant_company) {
    showToast(t("required_fields"), "warning");
    return null;
  }

  try {
    let report;
    if (existingId) {
      report = await api.updateReport(existingId, payload);
    } else {
      report = await api.createReport(payload);
    }

    // Upload progress step dates
    for (let i = 1; i <= 5; i++) {
      const val = document.getElementById(`f-step${i}`)?.value || null;
      if (val !== undefined) {
        try { await api.updateProgress(report.id, i, val || null); } catch {}
      }
    }

    // Upload pending files
    if (window._pendingFiles?.length) {
      for (const { file, fileType } of window._pendingFiles) {
        try { await api.uploadReportFile(report.id, fileType, file); } catch (e) { console.error(e); }
      }
      window._pendingFiles = [];
    }

    if (showSuccess) showToast(t("success_saved"), "success");
    return report.id;
  } catch (e) {
    showToast(e.message, "error");
    return null;
  }
}

/* ─── Report Detail ──────────────────────────────────────────────────────────── */
async function renderReportDetail(el, reportId) {
  const r = await api.getReport(reportId);
  if (!r) { el.innerHTML = emptyState(); return; }

  const isDealer = currentUser.role === "dealer";
  const isPlatform = !isDealer;
  const canReview = isPlatform && r.status.startsWith("pending_l");
  const empLevel = currentUser.employee?.review_level;
  const statusLevel = { pending_l1: 1, pending_l2: 2 }[r.status];
  const canDoReview = canReview && (currentUser.role === "admin" || empLevel === statusLevel);

  const days = daysUntil(r.valid_until);
  const validityPct = r.valid_until && r.approved_at
    ? Math.max(0, Math.min(100, (days / 90) * 100))
    : null;

  let html = `
    <!-- Header -->
    <div class="reg-header-box">
      <div>
        <div style="font-size:12px;opacity:.7;margin-bottom:4px">${t("registration_no")}</div>
        <div class="reg-header-no">${r.registration_no}</div>
        <div class="reg-header-date">${t("application_date")}: ${formatDate(r.application_date)}</div>
      </div>
      <div style="text-align:right">
        ${statusBadge(r.status)}
        ${r.approved_at ? `<div style="font-size:12px;opacity:.7;margin-top:6px">${t("approved_at")}: ${formatDate(r.approved_at)}</div>` : ""}
        ${r.valid_until ? `<div style="font-size:12px;opacity:.7">${t("valid_until")}: ${formatDate(r.valid_until)}</div>` : ""}
      </div>
    </div>`;

  // Validity bar
  if (validityPct !== null) {
    const cls = days < 14 ? "danger" : days < 30 ? "warning" : "";
    html += `<div class="validity-bar" style="margin:0 0 20px">
      <div class="validity-bar-track"><div class="validity-bar-fill ${cls}" style="width:${validityPct}%"></div></div>
      <div class="text-sm text-muted" style="margin-top:4px">${t("valid_until")}: ${formatDate(r.valid_until)} (${days > 0 ? days + "天后到期" : "已过期"})</div>
    </div>`;
  }

  // Action bar
  let actions = "";
  if (isDealer && (r.status === "draft" || r.status === "rejected")) {
    actions += `<button class="btn btn-primary" onclick="navigate('new-report',{id:${r.id}})">✏️ 编辑</button>`;
    actions += `<button class="btn btn-accent" onclick="quickSubmit(${r.id})">📨 ${t("submit")}</button>`;
  }
  if (isDealer && r.status === "approved") {
    if ((r.extension_count || 0) < 2) actions += `<button class="btn btn-outline" onclick="extendReport(${r.id})">${t("extend")}</button>`;
    actions += `<button class="btn btn-success" onclick="markContracted(${r.id})">🏆 ${t("mark_contracted")}</button>`;
  }
  if (canDoReview) {
    actions += `<button class="btn btn-success" onclick="doApprove(${r.id})">${t("approve")}</button>`;
    actions += `<button class="btn btn-danger" onclick="doReject(${r.id})">${t("reject")}</button>`;
  }
  if (actions) html += `<div class="flex gap-2 mb-4">${actions}</div>`;

  // AI Score panel (platform only)
  if (!isDealer && r.ai_score != null) {
    const sc = r.ai_score;
    const det = r.ai_score_details || {};
    const barColor = sc >= 80 ? "var(--success)" : sc >= 60 ? "var(--info)" : sc >= 40 ? "var(--warning)" : "var(--danger)";
    const gradeKey = sc >= 80 ? "A" : sc >= 60 ? "B" : sc >= 40 ? "C" : "D";
    html += `<div class="card mb-4" style="border-left:4px solid ${barColor}">
      <div class="card-header">
        <span class="card-title">🤖 ${t("ai_score_title")}</span>
        <span style="font-size:28px;font-weight:800;color:${barColor}">${sc}<small style="font-size:14px;font-weight:400">/100</small></span>
      </div>
      <div class="card-body">
        <p class="text-muted text-sm mb-3">${t("ai_score_desc")}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          ${[
            ["ai_completeness", det.completeness?.score, 40],
            ["ai_attachments",  det.attachments?.score,  35],
            ["ai_reliability",  det.dealer_reliability?.score, 25],
          ].map(([key, score, max]) => `
            <div style="background:var(--bg);border-radius:8px;padding:12px">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${t(key)}</div>
              <div style="font-size:20px;font-weight:700;color:${barColor}">${score ?? "—"}<small style="font-size:11px;font-weight:400;color:var(--text-muted)">/${max}</small></div>
              <div class="validity-bar-track" style="margin-top:6px"><div class="validity-bar-fill" style="width:${score != null ? (score/max*100) : 0}%;background:${barColor}"></div></div>
            </div>`).join("")}
        </div>
        <div style="margin-top:12px;font-size:13px"><strong>${t("ai_grade_"+gradeKey)}</strong></div>
      </div>
    </div>`;
  }

  // Duplicate warnings panel (platform only)
  if (!isDealer && r.has_duplicate_warning && r.duplicate_warnings?.length) {
    html += `<div class="card mb-4" style="border-left:4px solid var(--danger)">
      <div class="card-header" style="background:#FFF5F5">
        <span class="card-title" style="color:var(--danger)">⚠️ ${t("dup_warning_title")}</span>
        <span class="status-badge status-rejected">需重点核查</span>
      </div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${t("dup_warning_desc")}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${r.duplicate_warnings.map(d => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid ${d.level==="high"?"var(--danger)":"var(--warning)"};border-radius:8px;background:${d.level==="high"?"#FFF5F5":"#FFFBEB"}">
              <span class="status-badge ${d.level==="high"?"status-rejected":"status-pending_l1"}">${t("dup_"+d.level)}</span>
              <div style="flex:1">
                <div style="font-weight:600;font-size:13px">${d.name_cn || ""}${d.name_en ? " / "+d.name_en : ""}</div>
                <div style="font-size:11px;color:var(--text-muted)">${d.source==="existing_report" ? t("dup_source_report")+" #"+d.registration_no : t("dup_source_customer")} · ${d.dealer}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:18px;font-weight:800;color:${d.level==="high"?"var(--danger)":"var(--warning)"}">${d.similarity}%</div>
                <div style="font-size:10px;color:var(--text-muted)">${t("dup_similarity")}</div>
              </div>
              ${d.source==="existing_report" ? `<button class="btn btn-sm btn-outline" onclick="navigate('report-detail',{id:${d.id}})">查看</button>` : ""}
            </div>`).join("")}
        </div>
      </div>
    </div>`;
  }

  // Rejection reason
  if (r.rejection_reason) {
    html += `<div class="warning-box">❌ <strong>${t("review_reason")}:</strong> ${r.rejection_reason}</div>`;
  }

  // Main details
  html += `<div class="form-grid" style="gap:20px">`;
  html += detailSection(t("section_app_info"), [
    [t("applicant_company"), r.applicant_company],
    [t("applicant_name"), r.applicant_name],
    [t("contact_info"), r.contact_info],
  ]);
  html += detailSection(t("section_customer_info"), [
    [t("customer_name_cn"), r.customer_name_cn],
    [t("customer_name_en"), r.customer_name_en],
    [t("customer_address_cn"), r.customer_address_cn],
    [t("customer_address_en"), r.customer_address_en],
    [t("customer_website"), r.customer_website ? `<a href="${r.customer_website}" target="_blank">${r.customer_website}</a>` : "—"],
  ]);
  html += `</div>`;

  // Industry
  if (r.industry_categories?.length) {
    html += `<div class="card mb-4"><div class="card-header"><span class="card-title">🏭 ${t("section_industry")}</span></div>
      <div class="card-body"><div class="flex flex-wrap gap-2">
        ${r.industry_categories.map(c => `<span class="status-badge status-approved">${c}</span>`).join("")}
      </div></div></div>`;
  }

  // Project info
  html += `<div class="card mb-4"><div class="card-header"><span class="card-title">⚙️ ${t("section_project_info")}</span></div>
    <div class="card-body"><div class="detail-grid">
      ${detailItem(t("part_name"), r.part_name)}
      ${detailItem(t("final_product_use"), r.final_product_use)}
      ${detailItem(t("production_capacity"), r.production_capacity)}
      ${detailItem(t("similar_product_count"), r.similar_product_count)}
      ${detailItem(t("project_budget"), r.project_budget)}
      ${detailItem(t("delivery_deadline"), r.delivery_deadline)}
      ${detailItem(t("project_model"), r.project_model)}
      ${detailItem(t("main_competitors"), r.main_competitors)}
    </div>
    ${r.investment_purpose?.length ? `<div class="mt-3"><strong style="font-size:12px;color:var(--text-muted)">${t("investment_purpose")}</strong><div class="flex flex-wrap gap-2 mt-2">${r.investment_purpose.map(p => `<span class="status-badge status-approved">${p}</span>`).join("")}</div></div>` : ""}
    ${r.project_key_points?.length ? `<div class="mt-3"><strong style="font-size:12px;color:var(--text-muted)">${t("project_key_points")}</strong><div class="flex flex-wrap gap-2 mt-2">${r.project_key_points.map(p => `<span class="status-badge status-draft">${p}</span>`).join("")}</div></div>` : ""}
    ${r.sales_opinion ? `<div class="mt-3"><strong style="font-size:12px;color:var(--text-muted)">${t("sales_opinion")}</strong><p style="margin-top:6px;line-height:1.7">${r.sales_opinion}</p></div>` : ""}
    </div></div>`;

  // Progress
  html += `<div class="card mb-4"><div class="card-header"><span class="card-title">📅 ${t("section_progress")}</span>${isDealer && r.status === "approved" ? `<button class="btn btn-sm btn-outline" onclick="openProgressEdit(${r.id})">编辑进度</button>` : ""}</div>
    <div class="card-body"><div class="progress-steps">
      ${[1,2,3,4,5].map(i => `
        <div class="progress-step ${r[`step${i}_date`] ? "completed" : ""}">
          <div class="step-num">${r[`step${i}_date`] ? "✓" : i}</div>
          <div class="step-label">${t("step"+i)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${r[`step${i}_date`] ? formatDate(r[`step${i}_date`]) : "—"}</div>
        </div>`).join("")}
    </div></div></div>`;

  // Attachments
  if (r.attachments?.length) {
    html += `<div class="card mb-4"><div class="card-header"><span class="card-title">📎 ${t("section_attachments")}</span></div>
      <div class="card-body"><div class="file-list">
        ${r.attachments.map(a => `
          <div class="file-item">
            <span class="file-item-name">📄 ${a.original_name}</span>
            <span class="file-item-size">${fileSizeLabel(a.file_size)}</span>
            <span class="text-muted text-sm">[${a.file_type}]</span>
            <button class="btn btn-sm btn-outline" onclick="downloadFile('${API_BASE}/files/report/${r.id}/${a.id}', '${a.original_name}')">⬇ ${t("download")}</button>
          </div>`).join("")}
      </div></div></div>`;
  }

  // Review history
  if (r.reviews?.length) {
    html += `<div class="card mb-4"><div class="card-header"><span class="card-title">📜 ${t("section_review_history")}</span></div>
      <div class="card-body"><div class="review-timeline">
        ${r.reviews.map(rv => `
          <div class="review-item ${rv.action}">
            <div>
              <div class="review-level-badge">L${rv.level}</div>
              <div class="review-action">${rv.action === "approve" ? "✅ 批准" : "❌ 驳回"}</div>
              ${rv.reason ? `<div class="review-reason">${rv.reason}</div>` : ""}
              <div class="review-meta">${rv.reviewer} · ${formatDateTime(rv.created_at)}</div>
            </div>
          </div>`).join("")}
      </div></div></div>`;
  }

  el.innerHTML = html;

  window.quickSubmit = (id) => confirmAction(t("confirm_submit"), async () => {
    try { await api.submitReport(id); showToast(t("success_submitted"), "success"); await navigate("report-detail", {id}); }
    catch (e) { showToast(e.message, "error"); }
  });
  window.extendReport = (id) => confirmAction(t("extend"), async () => {
    try { await api.extendReport(id); showToast(t("success_saved"), "success"); await navigate("report-detail", {id}); }
    catch (e) { showToast(e.message, "error"); }
  });
  window.markContracted = (id) => confirmAction(t("mark_contracted"), async () => {
    try { await api.markContracted(id); showToast("✅ 已成单！", "success"); await navigate("report-detail", {id}); }
    catch (e) { showToast(e.message, "error"); }
  });
  window.doApprove = (id) => confirmAction(t("confirm_approve"), async () => {
    try { await api.reviewReport(id, "approve", ""); showToast(t("success_approved"), "success"); await navigate("report-detail", {id}); }
    catch (e) { showToast(e.message, "error"); }
  });
  window.doReject = (id) => {
    const body = `<div class="form-group"><label><span class="req">*</span> ${t("review_reason")}</label><textarea id="rj-reason" rows="4" placeholder="${t("rejection_reason_placeholder")}"></textarea></div>`;
    const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-danger" onclick="submitRejectDetail(${id})">${t("reject")}</button>`;
    showModal(t("reject"), body, footer);
  };
  window.submitRejectDetail = async (id) => {
    const reason = document.getElementById("rj-reason")?.value?.trim();
    if (!reason) { showToast(t("rejection_reason_placeholder"), "warning"); return; }
    try { await api.reviewReport(id, "reject", reason); closeModal(); showToast(t("success_rejected"), "success"); await navigate("report-detail", {id}); }
    catch (e) { showToast(e.message, "error"); }
  };
  window.openProgressEdit = (id) => {
    const body = `<div class="progress-steps">
      ${[1,2,3,4,5].map(i => `
        <div class="progress-step">
          <div class="step-num">${i}</div>
          <div class="step-label" style="font-size:12px">${t("step"+i)}</div>
          <div><input type="date" id="ps-step${i}" value="${r[`step${i}_date`] ? r[`step${i}_date`].split("T")[0] : ""}" /></div>
        </div>`).join("")}
    </div>`;
    const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="saveProgress(${id})">${t("save")}</button>`;
    showModal(`📅 ${t("section_progress")}`, body, footer);
  };
  window.saveProgress = async (id) => {
    try {
      for (let i = 1; i <= 5; i++) {
        const val = document.getElementById(`ps-step${i}`)?.value || null;
        await api.updateProgress(id, i, val);
      }
      closeModal();
      showToast(t("success_saved"), "success");
      await navigate("report-detail", {id});
    } catch (e) { showToast(e.message, "error"); }
  };
}

function detailSection(title, rows) {
  return `<div class="card"><div class="card-header"><span class="card-title">${title}</span></div>
    <div class="card-body"><div class="detail-grid">
      ${rows.map(([l, v]) => `<div class="detail-item"><label>${l}</label><span>${v || "—"}</span></div>`).join("")}
    </div></div></div>`;
}
function detailItem(label, value) {
  return `<div class="detail-item"><label>${label}</label><span>${value || "—"}</span></div>`;
}

/* ─── Customer List ──────────────────────────────────────────────────────────── */
async function renderCustomerList(el, { myOnly = false } = {}) {
  let search = "", filterContracted = null;

  async function load() {
    const params = { search };
    if (filterContracted !== null) params.contracted = filterContracted;
    const data = await api.listCustomers(params);
    renderList(data);
  }

  function renderList(data) {
    const items = data?.items || [];
    const total = data?.total || 0;
    const isDealer = currentUser.role === "dealer";

    let html = `<div class="table-toolbar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="${t("search")}..." value="${search}" />
      </div>
      <div class="toolbar-actions">
        <select onchange="custFilter(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
          <option value="">${t("all_status")}</option>
          <option value="false">${t("customer_uncontracted")}</option>
          <option value="true">${t("customer_contracted")}</option>
        </select>
        ${!isDealer ? `<button class="btn btn-outline btn-sm" onclick="downloadExcel('/customers/export/excel','customers.xlsx')">📥 ${t("export")}</button>` : ""}
        <button class="btn btn-primary btn-sm" onclick="openAddCustomer()">＋ 添加客户</button>
      </div>
    </div>`;

    if (items.length === 0) {
      html += emptyState();
    } else {
      html += `<div class="card"><table class="data-table"><thead><tr>
        <th>${t("customer_name_cn")}</th>
        <th>${t("customer_name_en")}</th>
        <th>${t("section_industry")}</th>
        <th>状态</th>
        ${!isDealer ? `<th>代理商</th>` : ""}
        <th>${t("valid_until")}</th>
        <th>最后更新</th>
        <th>操作</th>
      </tr></thead><tbody>`;
      items.forEach(c => {
        const label = c.is_contracted
          ? `<span class="label-blue">●&nbsp;${t("customer_contracted")}</span>`
          : c.is_expired
          ? `<span style="color:var(--text-muted)">⚠️ ${t("customer_expired")}</span>`
          : `<span class="text-muted">${t("customer_uncontracted")}</span>`;
        html += `<tr>
          <td><strong>${c.name_cn}</strong></td>
          <td>${c.name_en || "—"}</td>
          <td>${(c.industry_categories || []).join(", ") || "—"}</td>
          <td>${label}</td>
          ${!isDealer ? `<td>${c.dealer_name || "平台"}</td>` : ""}
          <td>${c.is_contracted ? `♾️ ${t("customer_permanent")}` : c.expires_at ? formatDate(c.expires_at) : "—"}</td>
          <td>${formatDate(c.updated_at)}</td>
          <td><div class="actions-cell">
            <button class="btn btn-sm btn-outline" onclick="openEditCustomer(${c.id})">${t("edit")}</button>
            ${!isDealer ? `<button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.id})">${t("delete")}</button>` : ""}
          </div></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
      html += `<div class="text-muted text-sm mt-3">${t("total")} ${total} ${t("items")}</div>`;
    }

    el.innerHTML = html;
    el.querySelector(".search-input-wrap input")?.addEventListener("keyup", e => { search = e.target.value; load(); });
  }

  window.custFilter = (v) => { filterContracted = v === "" ? null : v === "true"; load(); };
  window.deleteCustomer = (id) => confirmAction(t("confirm_delete"), async () => {
    try { await api.deleteCustomer(id); showToast(t("success_deleted"), "success"); load(); }
    catch (e) { showToast(e.message, "error"); }
  });
  window.openAddCustomer = () => openCustomerModal(null, load);
  window.openEditCustomer = async (id) => {
    const data = await api.listCustomers({});
    const c = data?.items?.find(x => x.id === id);
    openCustomerModal(c, load);
  };
  await load();
}

function openCustomerModal(existing, onSave) {
  const v = existing || {};
  const body = `
    <div class="form-grid">
      <div class="form-group"><label><span class="req">*</span> ${t("customer_name_cn")}</label><input type="text" id="cm-cn" value="${v.name_cn || ""}" required /></div>
      <div class="form-group"><label>${t("customer_name_en")}</label><input type="text" id="cm-en" value="${v.name_en || ""}" /></div>
      <div class="form-group"><label>${t("customer_address_cn")}</label><input type="text" id="cm-acn" value="${v.address_cn || ""}" /></div>
      <div class="form-group"><label>${t("customer_address_en")}</label><input type="text" id="cm-aen" value="${v.address_en || ""}" /></div>
    </div>
    <div class="form-group mt-2"><label>${t("customer_website")}</label><input type="text" id="cm-web" value="${v.website || ""}" /></div>
    <div class="form-group mt-2">
      <label>标注颜色</label>
      <select id="cm-color"><option value="none">${t("label_none")}</option><option value="blue" ${v.label_color === "blue" ? "selected" : ""}>${t("label_blue")}</option><option value="red" ${v.label_color === "red" ? "selected" : ""}>${t("label_red")}</option></select>
    </div>
    ${existing ? `<div class="form-group mt-2"><label>是否成单</label><select id="cm-contracted"><option value="false" ${!v.is_contracted ? "selected" : ""}>${t("customer_uncontracted")}</option><option value="true" ${v.is_contracted ? "selected" : ""}>${t("customer_contracted")}</option></select></div>` : ""}
    <div class="form-group mt-2"><label>备注</label><textarea id="cm-notes" rows="3">${v.notes || ""}</textarea></div>`;
  const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="saveCustomer(${v.id || "null"})">${t("save")}</button>`;
  showModal(existing ? t("edit") : "添加客户", body, footer);
  window.saveCustomer = async (id) => {
    const payload = {
      name_cn: document.getElementById("cm-cn").value,
      name_en: document.getElementById("cm-en").value,
      address_cn: document.getElementById("cm-acn").value,
      address_en: document.getElementById("cm-aen").value,
      website: document.getElementById("cm-web").value,
      label_color: document.getElementById("cm-color").value,
      notes: document.getElementById("cm-notes").value,
    };
    if (!payload.name_cn) { showToast(t("required_fields"), "warning"); return; }
    if (id) {
      const cont = document.getElementById("cm-contracted");
      if (cont) payload.is_contracted = cont.value === "true";
    }
    try {
      if (id) await api.updateCustomer(id, payload);
      else await api.createCustomer(payload);
      closeModal(); showToast(t("success_saved"), "success"); onSave();
    } catch (e) { showToast(e.message, "error"); }
  };
}

/* ─── Dealer List ────────────────────────────────────────────────────────────── */
async function renderDealerList(el) {
  let search = "";
  async function load() {
    const data = await api.listDealers(search);
    renderList(data || []);
  }

  function renderList(dealers) {
    let html = `<div class="table-toolbar">
      <div class="search-input-wrap"><span class="search-icon">🔍</span>
        <input type="text" placeholder="${t("search")}..." value="${search}" />
      </div>
    </div>`;
    if (!dealers.length) { html += emptyState(); el.innerHTML = html; return; }
    html += `<div class="card"><table class="data-table"><thead><tr>
      <th>用户名</th><th>${t("company_name_cn")}</th><th>${t("contact_name")}</th>
      <th>${t("phone")}</th><th>报备数</th><th>客户数</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>`;
    dealers.forEach(d => {
      html += `<tr>
        <td>${d.username}</td>
        <td><strong>${d.company_name_cn || "—"}</strong>${d.company_name_en ? `<br><span class="text-sm text-muted">${d.company_name_en}</span>` : ""}</td>
        <td>${d.contact_name || "—"}</td>
        <td>${d.phone || "—"}</td>
        <td>${d.report_count}</td>
        <td>${d.customer_count}</td>
        <td><span class="status-badge ${d.is_active ? "status-approved" : "status-expired"}">${d.is_active ? "启用" : "停用"}</span></td>
        <td><div class="actions-cell">
          <button class="btn btn-sm ${d.is_active ? "btn-danger" : "btn-success"}" onclick="toggleDealer(${d.id}, ${!d.is_active})">
            ${d.is_active ? "停用" : "启用"}
          </button>
        </div></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
    el.querySelector(".search-input-wrap input")?.addEventListener("keyup", e => { search = e.target.value; load(); });
    window.toggleDealer = async (id, activate) => {
      try {
        await api.updateDealerStatus(id, activate ? "active" : "inactive");
        showToast(t("success_saved"), "success"); load();
      } catch (e) { showToast(e.message, "error"); }
    };
  }
  await load();
}

/* ─── Products ───────────────────────────────────────────────────────────────── */
async function renderProducts(el) {
  async function load() {
    const [cats, prods] = await Promise.all([api.listCategories(), api.listProducts()]);
    renderAll(cats || [], prods || []);
  }

  function renderAll(cats, prods) {
    let html = `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:20px">
      <!-- Categories -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">${t("add_category")}</span>
          <button class="btn btn-sm btn-primary" onclick="openCatModal(null)">${t("add_category")}</button>
        </div>
        <table class="data-table"><thead><tr><th>分类名称</th><th>产品数</th><th>操作</th></tr></thead><tbody>`;
    cats.forEach(c => {
      html += `<tr><td><strong>${c.name_cn}</strong>${c.name_en ? `<br><span class="text-sm text-muted">${c.name_en}</span>` : ""}</td>
        <td>${c.product_count}</td>
        <td><div class="actions-cell">
          <button class="btn btn-sm btn-outline" onclick="openCatModal(${c.id}, '${c.name_cn}', '${c.name_en || ""}', '${c.name_ja || ""}')">${t("edit")}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCat(${c.id})">${t("delete")}</button>
        </div></td></tr>`;
    });
    html += `</tbody></table></div>
      <!-- Products -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">${t("add_product")}</span>
          <button class="btn btn-sm btn-primary" onclick="openProdModal(cats)">${t("add_product")}</button>
        </div>
        <table class="data-table"><thead><tr><th>产品名称</th><th>分类</th><th>操作</th></tr></thead><tbody>`;
    prods.forEach(p => {
      html += `<tr><td><strong>${p.name_cn}</strong>${p.name_en ? `<br><span class="text-sm text-muted">${p.name_en}</span>` : ""}</td>
        <td>${p.category_name}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteProd(${p.id})">${t("delete")}</button></td></tr>`;
    });
    html += `</tbody></table></div>
    </div>`;
    el.innerHTML = html;

    window.openCatModal = (id, cn = "", en = "", ja = "") => {
      const body = `
        <div class="form-group"><label>名称（中文）</label><input type="text" id="cat-cn" value="${cn}" /></div>
        <div class="form-group mt-2"><label>名称（英文）</label><input type="text" id="cat-en" value="${en}" /></div>
        <div class="form-group mt-2"><label>名称（日文）</label><input type="text" id="cat-ja" value="${ja}" /></div>`;
      const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="saveCat(${id || "null"})">${t("save")}</button>`;
      showModal(id ? t("edit") : t("add_category"), body, footer);
    };
    window.saveCat = async (id) => {
      const payload = { name_cn: document.getElementById("cat-cn").value, name_en: document.getElementById("cat-en").value, name_ja: document.getElementById("cat-ja").value };
      if (!payload.name_cn) { showToast(t("required_fields"), "warning"); return; }
      try {
        if (id) await api.updateCategory(id, payload); else await api.createCategory(payload);
        closeModal(); showToast(t("success_saved"), "success"); load();
      } catch (e) { showToast(e.message, "error"); }
    };
    window.deleteCat = (id) => confirmAction(t("confirm_delete"), async () => {
      try { await api.deleteCategory(id); showToast(t("success_deleted"), "success"); load(); }
      catch (e) { showToast(e.message, "error"); }
    });
    window.openProdModal = (catList) => {
      const opts = catList.map(c => `<option value="${c.id}">${c.name_cn}</option>`).join("");
      const body = `
        <div class="form-group"><label>分类</label><select id="prod-cat">${opts}</select></div>
        <div class="form-group mt-2"><label>产品名称（中文）</label><input type="text" id="prod-cn" /></div>
        <div class="form-group mt-2"><label>产品名称（英文）</label><input type="text" id="prod-en" /></div>
        <div class="form-group mt-2"><label>製品名（日本語）</label><input type="text" id="prod-ja" /></div>`;
      const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="saveProd()">${t("save")}</button>`;
      showModal(t("add_product"), body, footer);
    };
    window.saveProd = async () => {
      const payload = { category_id: parseInt(document.getElementById("prod-cat").value), name_cn: document.getElementById("prod-cn").value, name_en: document.getElementById("prod-en").value, name_ja: document.getElementById("prod-ja").value };
      if (!payload.name_cn) { showToast(t("required_fields"), "warning"); return; }
      try { await api.createProduct(payload); closeModal(); showToast(t("success_saved"), "success"); load(); }
      catch (e) { showToast(e.message, "error"); }
    };
    window.deleteProd = (id) => confirmAction(t("confirm_delete"), async () => {
      try { await api.deleteProduct(id); showToast(t("success_deleted"), "success"); load(); }
      catch (e) { showToast(e.message, "error"); }
    });
  }
  await load();
}

/* ─── Employees ──────────────────────────────────────────────────────────────── */
async function renderEmployees(el) {
  async function load() {
    const emps = await api.listEmployees();
    renderList(emps || []);
  }

  function renderList(emps) {
    let html = `<div class="table-toolbar"><div class="toolbar-actions">
      <button class="btn btn-primary" onclick="openEmpModal()">${t("add_employee")}</button>
    </div></div>`;
    if (!emps.length) { html += emptyState(); el.innerHTML = html; return; }
    html += `<div class="card"><table class="data-table"><thead><tr>
      <th>用户名</th><th>姓名</th><th>${t("department")}</th><th>审核级别</th><th>权限</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>`;
    emps.forEach(e => {
      html += `<tr>
        <td>${e.username}</td>
        <td><strong>${e.name}</strong></td>
        <td>${e.department || "—"}</td>
        <td>L${e.review_level}</td>
        <td>${e.can_review ? "✅ 可审核" : "—"} ${e.can_view_all ? "✅ 可查看全部" : ""}</td>
        <td><span class="status-badge ${e.is_active ? "status-approved" : "status-expired"}">${e.is_active ? "启用" : "停用"}</span></td>
        <td><div class="actions-cell">
          <button class="btn btn-sm btn-outline" onclick="openEmpModal(${e.id}, '${e.name}', '${e.department || ""}', ${e.review_level}, ${e.can_review}, ${e.can_view_all})">${t("edit")}</button>
          <button class="btn btn-sm btn-outline" onclick="openResetPwd(${e.id})">改密码</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmp(${e.id})">${t("delete")}</button>
        </div></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;

    window.openEmpModal = (id = null, name = "", dept = "", lvl = 1, canReview = true, canViewAll = true) => {
      const isNew = !id;
      const body = `
        ${isNew ? `
        <div class="form-row">
          <div class="form-group"><label><span class="req">*</span> 用户名</label><input type="text" id="em-user" /></div>
          <div class="form-group"><label><span class="req">*</span> 邮箱</label><input type="email" id="em-email" /></div>
        </div>
        <div class="form-group mt-2"><label><span class="req">*</span> 初始密码</label><input type="password" id="em-pwd" /></div>` : ""}
        <div class="form-row mt-2">
          <div class="form-group"><label><span class="req">*</span> 姓名</label><input type="text" id="em-name" value="${name}" /></div>
          <div class="form-group"><label>${t("department")}</label><input type="text" id="em-dept" value="${dept}" /></div>
        </div>
        <div class="form-group mt-2">
          <label>审核级别</label>
          <select id="em-lvl">
            <option value="1" ${lvl===1?"selected":""}>L1 — ${t("review_level_1")}</option>
            <option value="2" ${lvl===2?"selected":""}>L2 — ${t("review_level_2")}</option>
          </select>
        </div>
        <div class="flex gap-3 mt-3">
          <label class="checkbox-item ${canReview?"checked":""}">
            <input type="checkbox" id="em-review" ${canReview?"checked":""} /> ${t("can_review")}
          </label>
          <label class="checkbox-item ${canViewAll?"checked":""}">
            <input type="checkbox" id="em-viewall" ${canViewAll?"checked":""} /> ${t("can_view_all")}
          </label>
        </div>`;
      const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="saveEmp(${id || "null"})">${t("save")}</button>`;
      showModal(isNew ? t("add_employee") : t("edit"), body, footer);
    };
    window.saveEmp = async (id) => {
      const payload = {
        name: document.getElementById("em-name")?.value || "",
        department: document.getElementById("em-dept")?.value || "",
        review_level: parseInt(document.getElementById("em-lvl")?.value || "1"),
        can_review: document.getElementById("em-review")?.checked ?? true,
        can_view_all: document.getElementById("em-viewall")?.checked ?? true,
      };
      if (!payload.name) { showToast(t("required_fields"), "warning"); return; }
      try {
        if (id) { await api.updateEmployee(id, payload); }
        else {
          payload.username = document.getElementById("em-user")?.value;
          payload.email = document.getElementById("em-email")?.value;
          payload.password = document.getElementById("em-pwd")?.value;
          if (!payload.username || !payload.email || !payload.password) { showToast(t("required_fields"), "warning"); return; }
          await api.createEmployee(payload);
        }
        closeModal(); showToast(t("success_saved"), "success"); load();
      } catch (e) { showToast(e.message, "error"); }
    };
    window.openResetPwd = (id) => {
      const body = `<div class="form-group"><label>${t("new_password")}</label><input type="password" id="rp-pwd" /></div>`;
      const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button><button class="btn btn-primary" onclick="doResetPwd(${id})">${t("save")}</button>`;
      showModal(t("change_password"), body, footer);
    };
    window.doResetPwd = async (id) => {
      const pwd = document.getElementById("rp-pwd")?.value;
      if (!pwd) { showToast(t("required_fields"), "warning"); return; }
      try { await api.resetPassword(id, pwd); closeModal(); showToast(t("success_saved"), "success"); }
      catch (e) { showToast(e.message, "error"); }
    };
    window.deleteEmp = (id) => confirmAction(t("confirm_delete"), async () => {
      try { await api.deleteEmployee(id); showToast(t("success_deleted"), "success"); load(); }
      catch (e) { showToast(e.message, "error"); }
    });
  }
  await load();
}

/* ─── Templates ──────────────────────────────────────────────────────────────── */
async function renderTemplates(el) {
  const isDealer = currentUser.role === "dealer";

  async function load() {
    const tmpls = await api.listTemplates();
    renderList(tmpls || []);
  }

  function renderList(tmpls) {
    const types = [
      { key: "questionnaire", label: t("tmpl_questionnaire") },
      { key: "quote",         label: t("tmpl_quote") },
      { key: "other",         label: t("tmpl_other") },
    ];

    let html = "";

    // Platform staff: show upload buttons; dealers: show read-only notice
    if (!isDealer) {
      html += `<div class="flex gap-3 mb-4">
        ${types.map(tp => `<button class="btn btn-outline" onclick="openTmplUpload('${tp.key}', '${tp.label}')">⬆ ${t("upload")}${tp.label}</button>`).join("")}
      </div>`;
    } else {
      html += `<div class="warning-box mb-4" style="background:var(--info-bg,#eff6ff);border-color:var(--info,#3b82f6);color:#1d4ed8">
        📥 ${t("tmpl_dealer_notice")}
      </div>`;
    }

    let hasAny = false;
    types.forEach(tp => {
      const list = tmpls.filter(t => t.type === tp.key);
      if (!list.length) return;
      hasAny = true;
      html += `<div class="card mb-4">
        <div class="card-header"><span class="card-title">📄 ${tp.label}</span>
          <span class="text-muted" style="font-size:12px">${list.length} ${t("items")}</span>
        </div>
        <div class="card-body">
          <div class="file-list">`;
      list.forEach(tm => {
        const ext = (tm.original_name || "").split(".").pop().toUpperCase();
        const extIcon = ext === "PDF" ? "📕" : ext.startsWith("XLS") ? "📗" : "📄";
        html += `<div class="file-item">
          <span class="file-item-name">${extIcon} ${tm.original_name}</span>
          <span style="font-size:11px;color:var(--text-muted)">v${tm.version} · ${formatDate(tm.created_at)}</span>
          ${tm.description ? `<span style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis">${tm.description}</span>` : ""}
          <button class="btn btn-sm btn-outline" onclick="downloadFile('${API_BASE}/files/template/${tm.id}', '${tm.original_name}')">⬇ ${t("download")}</button>
          ${!isDealer ? `<button class="btn btn-sm btn-danger" onclick="deleteTmpl(${tm.id})">✕</button>` : ""}
        </div>`;
      });
      html += `</div></div></div>`;
    });

    if (!hasAny) {
      html += `<div class="card"><div class="card-body">${emptyState()}</div></div>`;
    }

    el.innerHTML = html;

    if (!isDealer) {
      window.openTmplUpload = (type, label) => {
        const body = `
          <div class="form-group"><label>${t("tmpl_name")}</label><input type="text" id="tm-name" value="${label}" /></div>
          <div class="form-group mt-2"><label>${t("description")}</label><input type="text" id="tm-desc" placeholder="${t("optional")}" /></div>
          <div class="form-group mt-3">
            <div class="upload-zone" id="tm-zone" onclick="document.getElementById('tm-file').click()">
              <input type="file" id="tm-file" accept=".doc,.docx,.pdf,.xls,.xlsx" style="display:none" onchange="showTmplFile(this)" />
              <div class="upload-icon">📁</div>
              <div class="upload-text" id="tm-file-label">${t("upload")}</div>
            </div>
          </div>`;
        const footer = `<button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button>
                        <button class="btn btn-primary" onclick="doUploadTmpl('${type}')">${t("upload")}</button>`;
        showModal(`${t("upload")}${label}`, body, footer);
      };
      window.showTmplFile = (input) => {
        if (input.files[0]) document.getElementById("tm-file-label").textContent = input.files[0].name;
      };
      window.doUploadTmpl = async (type) => {
        const file = document.getElementById("tm-file")?.files[0];
        const name = document.getElementById("tm-name")?.value || "";
        const desc = document.getElementById("tm-desc")?.value || "";
        if (!file || !name) { showToast(t("required_fields"), "warning"); return; }
        try {
          await api.uploadTemplate(type, name, desc, file);
          closeModal(); showToast(t("success_saved"), "success"); load();
        } catch (e) { showToast(e.message, "error"); }
      };
      window.deleteTmpl = (id) => confirmAction(t("confirm_delete"), async () => {
        try { await api.deleteTemplate(id); showToast(t("success_deleted"), "success"); load(); }
        catch (e) { showToast(e.message, "error"); }
      });
    }
  }
  await load();
}

/* ─── Profile ────────────────────────────────────────────────────────────────── */
async function renderProfile(el) {
  const u = currentUser;
  const isDealer = u.role === "dealer";
  const d = u.dealer || {};

  el.innerHTML = `
  <div style="max-width:600px">
    <div class="card mb-4">
      <div class="card-header"><span class="card-title">👤 ${t("profile_title")}</span></div>
      <div class="card-body">
        <div class="detail-grid">
          <div class="detail-item"><label>用户名</label><span>${u.username}</span></div>
          <div class="detail-item"><label>${t("email")}</label><span>${u.email}</span></div>
          ${isDealer ? `
          <div class="detail-item"><label>${t("company_name_cn")}</label><span>${d.company_name_cn || "—"}</span></div>
          <div class="detail-item"><label>${t("contact_name")}</label><span>${d.contact_name || "—"}</span></div>
          <div class="detail-item"><label>${t("phone")}</label><span>${d.phone || "—"}</span></div>` : `
          <div class="detail-item"><label>姓名</label><span>${u.employee?.name || "—"}</span></div>
          <div class="detail-item"><label>${t("department")}</label><span>${u.employee?.department || "—"}</span></div>
          <div class="detail-item"><label>审核级别</label><span>L${u.employee?.review_level || "—"}</span></div>`}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">🌏 界面语言</span></div>
      <div class="card-body">
        <div class="flex gap-3">
          ${["zh","en","ja"].map(l => `
            <button class="btn ${currentLang === l ? "btn-primary" : "btn-outline"}" onclick="switchLang('${l}')">
              ${l === "zh" ? "中文" : l === "en" ? "English" : "日本語"}
            </button>`).join("")}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">🔑 ${t("change_password")}</span></div>
      <div class="card-body">
        <div class="form-group mb-3"><label>${t("old_password")}</label><input type="password" id="p-old" /></div>
        <div class="form-group mb-3"><label>${t("new_password")}</label><input type="password" id="p-new" /></div>
        <button class="btn btn-primary" onclick="savePassword()">${t("save")}</button>
      </div>
    </div>
  </div>`;

  window.switchLang = async (lang) => {
    try { await api.setLanguage(lang); } catch {}
    setLang(lang);
    await navigate("profile");
  };
  window.savePassword = async () => {
    const o = document.getElementById("p-old")?.value;
    const n = document.getElementById("p-new")?.value;
    if (!o || !n) { showToast(t("required_fields"), "warning"); return; }
    try { await api.changePassword(o, n); showToast(t("success_saved"), "success"); }
    catch (e) { showToast(e.message, "error"); }
  };
}

/* ─── Invitations ────────────────────────────────────────────────────────────── */
async function renderInvitations(el) {
  const isPlatform = currentUser.role !== "dealer";
  if (!isPlatform) { el.innerHTML = `<div class="warning-box">${t("no_permission")}</div>`; return; }

  let showUsed = false;

  async function load() {
    try {
      const list = await api.listInvitations(showUsed);
      render(list);
    } catch (e) { showToast(e.message, "error"); }
  }

  function render(list) {
    const now = new Date();
    el.innerHTML = `
    <div class="page-header mb-4">
      <div class="flex gap-3 align-center">
        <label class="flex align-center gap-2" style="cursor:pointer;font-size:14px">
          <input type="checkbox" id="show-used-cb" ${showUsed ? "checked" : ""}
                 onchange="window._invToggleUsed(this.checked)" />
          ${t("show_used_codes")}
        </label>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-primary" onclick="window._invCreate()">＋ ${t("create_invite")}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr>
            <th>${t("invite_code")}</th>
            <th>${t("note")}</th>
            <th>${t("created_by")}</th>
            <th>${t("expires_at")}</th>
            <th>${t("status")}</th>
            <th>${t("used_by")}</th>
            <th>${t("used_at")}</th>
            <th>${t("actions")}</th>
          </tr></thead>
          <tbody>
          ${list.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">${t("no_data")}</td></tr>` :
            list.map(inv => {
              const expired = inv.expires_at && new Date(inv.expires_at) < now;
              let statusBadgeHtml;
              if (inv.is_used) {
                statusBadgeHtml = `<span class="status-badge status-approved">${t("inv_used")}</span>`;
              } else if (inv.is_revoked) {
                statusBadgeHtml = `<span class="status-badge status-rejected">${t("inv_revoked")}</span>`;
              } else if (expired) {
                statusBadgeHtml = `<span class="status-badge status-expired">${t("inv_expired")}</span>`;
              } else {
                statusBadgeHtml = `<span class="status-badge status-pending_l1">${t("inv_active")}</span>`;
              }
              const canRevoke = !inv.is_used && !inv.is_revoked;
              const copyUrl = `${location.origin}?invite=${inv.code}`;
              return `<tr>
                <td>
                  <code style="font-size:14px;letter-spacing:2px;font-weight:600">${inv.code}</code>
                  <button class="btn btn-outline" style="padding:2px 8px;font-size:11px;margin-left:6px"
                    onclick="window._invCopy('${copyUrl}')" title="${t("copy_invite_link")}">🔗</button>
                </td>
                <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${inv.note || "—"}</td>
                <td>${inv.created_by_username || "—"}</td>
                <td>${inv.expires_at ? formatDate(inv.expires_at) : "—"}</td>
                <td>${statusBadgeHtml}</td>
                <td>${inv.used_by_username || "—"}</td>
                <td>${inv.used_at ? formatDateTime(inv.used_at) : "—"}</td>
                <td>
                  ${canRevoke ? `<button class="btn btn-danger" style="padding:3px 10px;font-size:12px"
                    onclick="window._invRevoke(${inv.id})">${t("revoke")}</button>` : "—"}
                </td>
              </tr>`;
            }).join("")
          }
          </tbody>
        </table>
      </div>
    </div>`;
  }

  window._invToggleUsed = (checked) => {
    showUsed = checked;
    load();
  };

  window._invCopy = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast(t("copied"), "success", 2000);
    }).catch(() => {
      prompt(t("copy_invite_link"), url);
    });
  };

  window._invCreate = () => {
    showModal(t("create_invite"), `
      <div class="form-group mb-3">
        <label>${t("note")}</label>
        <input type="text" id="inv-note" placeholder="${t("invite_note_placeholder")}" style="width:100%" />
      </div>
      <div class="form-group mb-3">
        <label>${t("expire_days")}</label>
        <select id="inv-expire" style="width:100%">
          <option value="7">7 ${t("days")}</option>
          <option value="14">14 ${t("days")}</option>
          <option value="30" selected>30 ${t("days")}</option>
          <option value="60">60 ${t("days")}</option>
          <option value="90">90 ${t("days")}</option>
          <option value="0">${t("no_expiry")}</option>
        </select>
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button>
      <button class="btn btn-primary" onclick="window._invDoCreate()">${t("create_invite")}</button>
    `);
  };

  window._invDoCreate = async () => {
    const note = document.getElementById("inv-note")?.value || "";
    const expireDays = parseInt(document.getElementById("inv-expire")?.value || "30");
    try {
      const res = await api.createInvitation(note, expireDays || null);
      closeModal();
      showToast(`✅ ${t("invite_code")}: ${res.code}`, "success", 6000);
      load();
    } catch (e) { showToast(e.message, "error"); }
  };

  window._invRevoke = (id) => confirmAction(t("confirm_revoke_invite"), async () => {
    try {
      await api.revokeInvitation(id);
      showToast(t("success_revoked"), "success");
      load();
    } catch (e) { showToast(e.message, "error"); }
  });

  await load();
}

/* ─── Helpers ─────────────────────────────────────────────────────────────────── */
function emptyState() {
  return `<div class="empty-state">
    <div class="empty-state-icon">📭</div>
    <div class="empty-state-text">${t("no_data")}</div>
  </div>`;
}
