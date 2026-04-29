/* ─── API Client ─────────────────────────────────────────────────────────────── */
const API_BASE = "/api";

function getToken() { return localStorage.getItem("crm_token"); }
function setToken(t) { localStorage.setItem("crm_token", t); }
function clearToken() { localStorage.removeItem("crm_token"); localStorage.removeItem("crm_user"); }

async function apiRequest(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isFormData && body) headers["Content-Type"] = "application/json";

  const opts = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) { clearToken(); showLogin(); return null; }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || t("error_general"));
    return data;
  }
  if (!res.ok) throw new Error(t("error_general"));
  return res;
}

const api = {
  // Auth
  login: (u, p) => apiRequest("POST", "/auth/login", { username: u, password: p }),
  register: (d) => apiRequest("POST", "/auth/register", d),
  me: () => apiRequest("GET", "/auth/me"),
  changePassword: (old_p, new_p) => apiRequest("POST", "/auth/change-password", { old_password: old_p, new_password: new_p }),
  setLanguage: (lang) => apiRequest("PUT", "/auth/language", { language: lang }),
  notifications: () => apiRequest("GET", "/auth/notifications"),
  markAllRead: () => apiRequest("POST", "/auth/notifications/read-all"),

  // Dashboard
  dashboard: () => apiRequest("GET", "/platform/dashboard"),

  // Employees
  listEmployees: () => apiRequest("GET", "/employees"),
  createEmployee: (d) => apiRequest("POST", "/employees", d),
  updateEmployee: (id, d) => apiRequest("PUT", `/employees/${id}`, d),
  resetPassword: (id, p) => apiRequest("POST", `/employees/${id}/reset-password`, { new_password: p }),
  deleteEmployee: (id) => apiRequest("DELETE", `/employees/${id}`),

  // Dealers
  listDealers: (s = "") => apiRequest("GET", `/platform/dealers?search=${encodeURIComponent(s)}`),
  updateDealerStatus: (id, status) => apiRequest("PUT", `/platform/dealers/${id}/status`, { status }),

  // Customers
  listCustomers: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.contracted !== undefined && params.contracted !== null) q.set("contracted", params.contracted);
    if (params.dealer_id) q.set("dealer_id", params.dealer_id);
    if (params.skip) q.set("skip", params.skip);
    if (params.limit) q.set("limit", params.limit);
    return apiRequest("GET", `/customers?${q}`);
  },
  createCustomer: (d) => apiRequest("POST", "/customers", d),
  updateCustomer: (id, d) => apiRequest("PUT", `/customers/${id}`, d),
  deleteCustomer: (id) => apiRequest("DELETE", `/customers/${id}`),
  exportCustomers: (params = {}) => {
    const q = new URLSearchParams(params);
    return apiRequest("GET", `/customers/export/excel?${q}`);
  },

  // Reports
  listReports: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.status) q.set("status", params.status);
    if (params.dealer_id) q.set("dealer_id", params.dealer_id);
    if (params.skip) q.set("skip", params.skip);
    if (params.limit) q.set("limit", params.limit);
    return apiRequest("GET", `/reports?${q}`);
  },
  createReport: (d) => apiRequest("POST", "/reports", d),
  getReport: (id) => apiRequest("GET", `/reports/${id}`),
  updateReport: (id, d) => apiRequest("PUT", `/reports/${id}`, d),
  submitReport: (id) => apiRequest("POST", `/reports/${id}/submit`),
  reviewReport: (id, action, reason) => apiRequest("POST", `/reports/${id}/review`, { action, reason }),
  extendReport: (id) => apiRequest("POST", `/reports/${id}/extend`),
  markContracted: (id) => apiRequest("POST", `/reports/${id}/mark-contracted`),
  updateProgress: (id, step, date) => apiRequest("PUT", `/reports/${id}/progress`, { step, date }),
  deleteReport: (id) => apiRequest("DELETE", `/reports/${id}`),
  exportReports: (params = {}) => {
    const q = new URLSearchParams(params);
    return apiRequest("GET", `/reports/export/excel?${q}`);
  },

  // Files
  uploadReportFile: (reportId, fileType, file) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("file_type", fileType);
    return apiRequest("POST", `/files/report/${reportId}`, fd, true);
  },
  deleteReportFile: (reportId, attachId) => apiRequest("DELETE", `/files/report/${reportId}/${attachId}`),
  getFileUrl: (reportId, attachId) => `${API_BASE}/files/report/${reportId}/${attachId}`,
  getTemplateUrl: (tmplId) => `${API_BASE}/files/template/${tmplId}`,
  uploadTemplate: (type, name, desc, file) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    fd.append("name", name);
    fd.append("description", desc);
    return apiRequest("POST", "/files/template", fd, true);
  },

  // Products & Categories
  listCategories: () => apiRequest("GET", "/platform/product-categories"),
  createCategory: (d) => apiRequest("POST", "/platform/product-categories", d),
  updateCategory: (id, d) => apiRequest("PUT", `/platform/product-categories/${id}`, d),
  deleteCategory: (id) => apiRequest("DELETE", `/platform/product-categories/${id}`),
  listProducts: () => apiRequest("GET", "/platform/products"),
  createProduct: (d) => apiRequest("POST", "/platform/products", d),
  deleteProduct: (id) => apiRequest("DELETE", `/platform/products/${id}`),

  // Templates
  listTemplates: () => apiRequest("GET", "/platform/templates"),
  deleteTemplate: (id) => apiRequest("DELETE", `/platform/templates/${id}`),

  // Invitations
  listInvitations: (showUsed = false) => apiRequest("GET", `/invitations?show_used=${showUsed}`),
  createInvitation: (note, expireDays) => apiRequest("POST", "/invitations", { note, expire_days: expireDays }),
  revokeInvitation: (id) => apiRequest("DELETE", `/invitations/${id}`),
  validateInvitation: (code) => apiRequest("POST", "/invitations/validate", { code }),
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function showToast(msg, type = "info", duration = 3500) {
  const c = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function showModal(title, bodyHTML, footerHTML = "") {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-overlay").classList.remove("hidden");
  if (footerHTML) {
    let footer = document.querySelector(".modal-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "modal-footer";
      document.getElementById("modal-box").appendChild(footer);
    }
    footer.innerHTML = footerHTML;
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
  const footer = document.querySelector(".modal-footer");
  if (footer) footer.innerHTML = "";
}

function confirmAction(msg, onConfirm) {
  const body = `<p style="font-size:15px; line-height:1.6">${msg}</p>`;
  const footer = `
    <button class="btn btn-outline" onclick="closeModal()">${t("cancel")}</button>
    <button class="btn btn-danger" id="confirm-action-btn">${t("confirm")}</button>
  `;
  showModal(t("confirm"), body, footer);
  document.getElementById("confirm-action-btn").onclick = () => { closeModal(); onConfirm(); };
}

function formatDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString(
    currentLang === "ja" ? "ja-JP" : currentLang === "en" ? "en-US" : "zh-CN",
    { year: "numeric", month: "2-digit", day: "2-digit" }
  );
}

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString(
    currentLang === "ja" ? "ja-JP" : currentLang === "en" ? "en-US" : "zh-CN"
  );
}

function daysUntil(isoStr) {
  if (!isoStr) return null;
  const diff = new Date(isoStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function statusBadge(status) {
  const label = t(`status_${status}`) || status;
  return `<span class="status-badge status-${status}">${label}</span>`;
}

function fileSizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function downloadFile(url, filename) {
  const token = getToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { showToast(t("error_general"), "error"); return; }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadExcel(url, filename) {
  const token = getToken();
  const res = await fetch(API_BASE + url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { showToast(t("error_general"), "error"); return; }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
