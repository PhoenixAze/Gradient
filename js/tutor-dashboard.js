"use strict";

/* ==========================================================================
   REPETİTOR İDARƏETMƏ PANELİ — FRONTEND MƏNTİQİ
   Təhlükəsizlik (.clinerules §1-2):
   • Bütün DOM quruluşu innerHTML-siz (yalnız textContent / createElement)
   • Bütün şəbəkə sorğuları eyni auth qatı (cookie + access/refresh token)
   • Heç bir açar və ya cədvəl adı frontend-də yoxdur
   ========================================================================== */

const API_BASE_URL = (() => {
  const host = window.location.hostname;
  const isProd = host.endsWith("github.io") || host === "gradient.az" || host === "www.gradient.az";
  return isProd ? "https://gradient-backend-fam5.onrender.com" : "";
})();

const AI_MAX_CHARS = 500;
const AI_HISTORY_LIMIT = 12; // göndərilən son mesajların sayı (token qənaəti)
const MAX_PDF_BYTES = 25 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  /* ------------------------------------------------------------------
     1. DOM ELEMENTLƏRİ
     ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  const skeletonEl = $("tutor-skeleton");
  const contentEl = $("tutor-content");

  // Header & profil
  const tutorNameEl = $("tutor-name");
  const tutorSubjectEl = $("tutor-subject");
  const welcomeHeadingEl = $("welcome-heading");
  const inviteCodeDisplay = $("invite-code-display");
  const btnCopyCode = $("btn-copy-code");
  const btnLogout = $("btn-tutor-logout");
  const btnToggleTutorProfile = $("btn-toggle-tutor-profile");
  const headerProfilePill = $("header-profile-pill");

  // Drawer
  const tutorDrawerOverlay = $("tutor-drawer-overlay");
  const tutorProfileDrawer = $("tutor-profile-drawer");
  const btnCloseTutorDrawer = $("btn-close-tutor-drawer");
  const drawerTutorName = $("drawer-tutor-name");
  const drawerTutorSubject = $("drawer-tutor-subject");
  const drawerTutorIdentifier = $("drawer-tutor-identifier");
  const drawerTutorCode = $("drawer-tutor-code");
  const btnDrawerCopyCode = $("btn-drawer-copy-code");
  const btnDrawerLogout = $("btn-drawer-logout");
  const tutorProfileEditForm = $("tutor-profile-edit-form");
  const editTutorName = $("edit-tutor-name");
  const editTutorSurname = $("edit-tutor-surname");
  const editTutorSubject = $("edit-tutor-subject");
  const profileEditFeedback = $("profile-edit-feedback");

  const drawerNavStudents = $("drawer-nav-students");
  const drawerNavRequests = $("drawer-nav-requests");
  const drawerNavAssignments = $("drawer-nav-assignments");
  const drawerNavAi = $("drawer-nav-ai");
  const drawerNavProfile = $("drawer-nav-profile");

  // Profil pane
  const tabBtnProfile = $("tab-btn-profile");
  const paneProfile = $("pane-profile");
  const profilePaneFullname = $("profile-pane-fullname");
  const profilePaneSubjectPill = $("profile-pane-subject-pill");
  const profilePaneIdentifier = $("profile-pane-identifier");
  const profilePaneCode = $("profile-pane-code");
  const btnProfilePaneCopyCode = $("btn-profile-pane-copy-code");
  const linkGotoRequests = $("link-goto-requests");
  const formProfilePaneInfo = $("form-profile-pane-info");
  const profileInputFirstname = $("profile-input-firstname");
  const profileInputLastname = $("profile-input-lastname");
  const profileInputSubject = $("profile-input-subject");
  const profileInputIdentifier = $("profile-input-identifier");
  const profilePaneFeedback = $("profile-pane-feedback");
  const formProfilePanePassword = $("form-profile-pane-password");
  const profilePassCurrent = $("profile-pass-current");
  const profilePassNew = $("profile-pass-new");
  const profilePassConfirm = $("profile-pass-confirm");
  const profilePassFeedback = $("profile-pass-feedback");
  const btnProfilePaneLogout = $("btn-profile-pane-logout");

  // Şagird istəkləri
  const tabBtnRequests = $("tab-btn-requests");
  const paneRequests = $("pane-requests");
  const tabRequestsCount = $("tab-requests-count");
  const requestsEmptyState = $("requests-empty-state");
  const requestsGrid = $("requests-grid");
  const btnRefreshRequests = $("btn-refresh-requests");

  // Metrikalar
  const statTotalStudents = $("stat-total-students");
  const statStudentsSub = $("stat-students-sub");
  const statTotalExams = $("stat-total-exams");
  const statGroupAvg = $("stat-group-avg");
  const statTopStudent = $("stat-top-student");
  const statLowestStudent = $("stat-lowest-student");

  // Tablar
  const tabBtnStudents = $("tab-btn-students");
  const tabBtnAssignments = $("tab-btn-assignments");
  const tabBtnExams = $("tab-btn-exams");
  const tabBtnAi = $("tab-btn-ai");
  const paneStudents = $("pane-students");
  const paneAssignments = $("pane-assignments");
  const paneExams = $("pane-exams");
  const paneAi = $("pane-ai");
  const tabStudentsCount = $("tab-students-count");
  const tabAssignmentsCount = $("tab-assignments-count");
  const tabSubmissionsCount = $("tab-submissions-count");

  // Sınaq yaratma modalı
  const btnHeroCreateAsg = $("btn-hero-create-asg");
  const btnOpenCreateAsg = $("btn-open-create-asg");
  const btnEmptyCreateAsg = $("btn-empty-create-asg");
  const assignmentsEmptyState = $("assignments-empty-state");
  const assignmentsGrid = $("assignments-grid");
  const createAssignmentModal = $("create-assignment-modal");
  const createAssignmentForm = $("create-assignment-form");
  const asgTitleInput = $("asg-title-input");
  const asgQCountInput = $("asg-qcount-input");
  const asgDurationInput = $("asg-duration-input");
  const asgPdfFileInput = $("asg-pdf-file-input");
  const pdfDropzone = $("pdf-dropzone");
  const pdfFileInfo = $("pdf-file-info");
  const pdfFileName = $("pdf-file-name");
  const pdfFileSize = $("pdf-file-size");
  const btnRemovePdf = $("btn-remove-pdf");
  const btnAiExtractAnswers = $("btn-ai-extract-answers");
  const answerKeyGrid = $("answer-key-grid");
  const answerKeyCounter = $("answer-key-counter");
  const btnClearAnswerKey = $("btn-clear-answer-key");
  const createAsgFeedback = $("create-asg-feedback");
  const btnSubmitCreateAsg = $("btn-submit-create-asg");
  const btnCloseCreateAsgModal = $("btn-close-create-asg-modal");
  const btnCancelCreateAsg = $("btn-cancel-create-asg");

  // Paylaşma linki modalı
  const shareAssignmentModal = $("share-assignment-modal");
  const shareLinkInput = $("share-link-input");
  const btnCopyShareLink = $("btn-copy-share-link");
  const shareCopyFeedback = $("share-copy-feedback");
  const btnCloseShareModal = $("btn-close-share-modal");
  const btnDoneShareModal = $("btn-done-share-modal");

  // Nəticələr modalı
  const assignmentSubmissionsModal = $("assignment-submissions-modal");
  const submissionsModalTitle = $("submissions-modal-title");
  const submissionsModalMeta = $("submissions-modal-meta");
  const asgSubmissionsTableBody = $("asg-submissions-table-body");
  const asgSubmissionsEmpty = $("asg-submissions-empty");
  const asgSubmissionsTableWrap = assignmentSubmissionsModal
    ? assignmentSubmissionsModal.querySelector(".modal-table-scroll")
    : null;
  const btnCloseSubmissionsModal = $("btn-close-submissions-modal");
  const btnCloseSubmissionsModalBtn = $("btn-close-submissions-modal-btn");

  // Cavab kartı təhlili modalı
  const assignmentAnswersReviewModal = $("assignment-answers-review-modal");
  const reviewStudentName = $("review-student-name");
  const reviewStudentMeta = $("review-student-meta");
  const reviewScore = $("review-score");
  const reviewCounts = $("review-counts");
  const reviewPercent = $("review-percent");
  const studentReviewGrid = $("student-review-grid");
  const btnCloseReviewModal = $("btn-close-review-modal");
  const btnCloseReviewModalBtn = $("btn-close-review-modal-btn");

  // Şagird siyahısı
  const studentSearchInput = $("student-search-input");
  const studentStatusFilter = $("student-status-filter");
  const studentsEmptyState = $("students-empty-state");
  const studentsNoResultState = $("students-no-result-state");
  const btnResetStudentFilters = $("btn-reset-student-filters");
  const filterResultCount = $("filter-result-count");
  const studentsTableWrap = $("students-table-wrap");
  const studentsTableBody = $("students-table-body");

  // Sınaq xülasələri
  const examsSummaryEmpty = $("exams-summary-empty");
  const examsSummaryTableWrap = $("exams-summary-table-wrap");
  const examsSummaryTableBody = $("exams-summary-table-body");
  const submissionsEmpty = $("submissions-empty");
  const submissionsTableWrap = $("submissions-table-wrap");
  const submissionsTableBody = $("submissions-table-body");

  // Şagird əlavə etmə modalı
  const addStudentModal = $("add-student-modal");
  const btnOpenModal = $("btn-open-add-student");
  const btnCloseModal = $("btn-close-modal");
  const btnCancelModal = $("btn-cancel-modal");
  const addStudentForm = $("add-student-form");
  const studentIdentifierInput = $("student-identifier-input");
  const modalFeedback = $("modal-feedback");
  const btnSubmitAddStudent = $("btn-submit-add-student");

  // Şagird detalları modalı
  const studentDetailModal = $("student-detail-modal");
  const detailStudentName = $("detail-student-name");
  const detailStudentMeta = $("detail-student-meta");
  const detailStudentExams = $("detail-student-exams");
  const detailStudentAcc = $("detail-student-acc");
  const detailStudentScore = $("detail-student-score");
  const detailStudentHistoryBody = $("detail-student-history-body");
  const detailStudentHistoryWrap = studentDetailModal
    ? studentDetailModal.querySelector(".student-history-wrap")
    : null;
  const detailStudentEmpty = $("detail-student-empty");
  const btnCloseDetailModal = $("btn-close-detail-modal");
  const btnCloseDetailModalBtn = $("btn-close-detail-modal-btn");

  // Təsdiq dialoqu
  const confirmModal = $("confirm-modal");
  const confirmTitle = $("confirm-title");
  const confirmText = $("confirm-text");
  const btnConfirmOk = $("btn-confirm-ok");
  const btnConfirmCancel = $("btn-confirm-cancel");
  const btnConfirmX = $("btn-confirm-x");

  // AI köməkçi
  const aiChatMessages = $("ai-chat-messages");
  const aiChatForm = $("ai-chat-form");
  const aiQueryInput = $("ai-query-input");
  const btnSubmitAi = $("btn-submit-ai");
  const btnClearAiChat = $("btn-clear-ai-chat");
  const aiChipButtons = Array.from(document.querySelectorAll(".ai-chip-btn"));
  const chatStatusDot = $("chat-status-dot");
  const chatSubtitle = $("chat-subtitle");
  const aiCharCounter = $("ai-char-counter");

  /* ------------------------------------------------------------------
     2. VƏZİYYƏT
     ------------------------------------------------------------------ */
  let tutorData = null;
  let aiConversationHistory = [];
  let isAiResponding = false;
  let currentPdfBase64 = null;
  let answerKeyMap = {};
  let searchDebounceId = null;
  let lastFocusedElement = null;

  /* ------------------------------------------------------------------
     3. TOKEN KÖMƏKÇİLƏRİ
     ------------------------------------------------------------------ */
  function getStoredToken() {
    try {
      return sessionStorage.getItem("gradient_access_token") || "";
    } catch (_) {
      return "";
    }
  }

  function getStoredRefreshToken() {
    try {
      return localStorage.getItem("gradient_refresh_token") || sessionStorage.getItem("gradient_refresh_token") || "";
    } catch (_) {
      return "";
    }
  }

  function setStoredTokens(accessToken, refreshToken) {
    try {
      if (accessToken) {
        sessionStorage.setItem("gradient_access_token", accessToken);
        localStorage.removeItem("gradient_access_token");
      }
      if (refreshToken) {
        localStorage.setItem("gradient_refresh_token", refreshToken);
        sessionStorage.removeItem("gradient_refresh_token");
      }
    } catch (_) { /* storage bağlı ola bilər */ }
  }

  function clearStoredTokens() {
    try {
      sessionStorage.removeItem("gradient_access_token");
      localStorage.removeItem("gradient_access_token");
      sessionStorage.removeItem("gradient_refresh_token");
      localStorage.removeItem("gradient_refresh_token");
    } catch (_) { /* noop */ }
  }

  /* ------------------------------------------------------------------
     4. TƏHLÜKƏSİZ URL YOXLAMASI
     ------------------------------------------------------------------ */
  function isSafeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const parsed = new URL(value, window.location.origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function openPdfViewer(url) {
    if (!isSafeHttpUrl(url)) {
      showToast("PDF linki təhlükəsiz deyil və açıla bilmədi.", "error");
      return;
    }
    const viewer = window.open("about:blank", "_blank", "noopener,noreferrer");
    if (!viewer) {
      showToast("Pop-up bloklandı. Zəhmət olmasa brauzerinizdə icazə verin.", "error");
      return;
    }
    const frame = viewer.document.createElement("iframe");
    frame.src = url;
    frame.style.width = "100%";
    frame.style.height = "100vh";
    frame.style.border = "none";
    frame.setAttribute("sandbox", "allow-same-origin allow-popups");
    frame.setAttribute("referrerpolicy", "no-referrer");
    viewer.document.body.style.margin = "0";
    viewer.document.body.appendChild(frame);
  }

  /* ------------------------------------------------------------------
     5. UNİVERSAL AUTH SORĞU QATI
     ------------------------------------------------------------------ */
  async function fetchWithAuth(endpoint, options = {}) {
    const opts = { ...options };
    opts.credentials = "include";
    opts.headers = { ...(options.headers || {}) };

    const token = getStoredToken();
    if (token && !opts.headers.Authorization) {
      opts.headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, opts);
    } catch (err) {
      console.error("Şəbəkə xətası:", err);
      return null;
    }

    if (response && response.status === 401) {
      const rfToken = getStoredRefreshToken();
      const refreshHeaders = {};
      if (rfToken) {
        refreshHeaders["x-refresh-token"] = rfToken;
        refreshHeaders.Authorization = `Bearer ${rfToken}`;
      }

      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: refreshHeaders,
          credentials: "include"
        });

        if (refreshResponse && refreshResponse.ok) {
          const rfData = await refreshResponse.json().catch(() => ({}));
          if (rfData && rfData.access_token) {
            setStoredTokens(rfData.access_token, rfData.refresh_token);
            opts.headers.Authorization = `Bearer ${rfData.access_token}`;
            response = await fetch(`${API_BASE_URL}${endpoint}`, opts);
          } else {
            clearStoredTokens();
            window.location.href = "auth.html";
            return null;
          }
        } else {
          clearStoredTokens();
          window.location.href = "auth.html";
          return null;
        }
      } catch (refreshErr) {
        console.error("Token yeniləmə xətası:", refreshErr);
        clearStoredTokens();
        window.location.href = "auth.html";
        return null;
      }
    }

    return response;
  }

  /* ------------------------------------------------------------------
     6. UI ALƏTLƏRİ: Toast, Modal, Təsdiq
     ------------------------------------------------------------------ */

  // Müvəqqəti bildiriş (brouzər alert() əvzinə)
  let toastEl = null;
  let toastTimer = null;

  function showToast(message, variant = "info") {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.className = `toast toast-${variant} is-visible`;
    toastEl.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 3600);
  }

  // Bütün modallar üçün vahid aç/bağ idarəetməsi
  const modalStack = [];

  function openModal(modal) {
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    if (modalStack.indexOf(modal) === -1) modalStack.push(modal);
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    const focusTarget = modal.querySelector(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not(.icon-btn)"
    );
    if (focusTarget) {
      setTimeout(() => focusTarget.focus({ preventScroll: true }), 60);
    }
  }

  function isDrawerOpen() {
    return Boolean(tutorProfileDrawer && tutorProfileDrawer.classList.contains("active"));
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("active");
    const idx = modalStack.indexOf(modal);
    if (idx > -1) modalStack.splice(idx, 1);
    // Scroll kilidi yalnız bütün qatlar (modal + drawer) bağlandıqda açılır
    if (modalStack.length === 0 && !isDrawerOpen()) {
      document.body.classList.remove("modal-open");
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  function closeTopModal() {
    if (modalStack.length === 0) return;
    closeModal(modalStack[modalStack.length - 1]);
  }

  // Overlay-ə klikləməklə bağlama
  document.querySelectorAll(".tutor-modal-overlay").forEach((overlay) => {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  // Escape ilə bağlama
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalStack.length > 0) {
      e.preventDefault();
      closeTopModal();
    } else if (tutorProfileDrawer && tutorProfileDrawer.classList.contains("active")) {
      closeTutorDrawer();
    }
  });

  // Təsdiq dialoqu (confirm əvzinə)
  function askConfirm({ title, message, confirmLabel = "Təsdiqlə" }) {
    return new Promise((resolve) => {
      if (!confirmModal) {
        resolve(window.confirm(message)); // fallback
        return;
      }
      if (confirmTitle) confirmTitle.textContent = title;
      if (confirmText) confirmText.textContent = message;
      if (btnConfirmOk) btnConfirmOk.textContent = confirmLabel;

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (btnConfirmOk) btnConfirmOk.removeEventListener("click", onOk);
        if (btnConfirmCancel) btnConfirmCancel.removeEventListener("click", onCancel);
        if (btnConfirmX) btnConfirmX.removeEventListener("click", onCancel);
        closeModal(confirmModal);
        resolve(value);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);

      if (btnConfirmOk) btnConfirmOk.addEventListener("click", onOk);
      if (btnConfirmCancel) btnConfirmCancel.addEventListener("click", onCancel);
      if (btnConfirmX) btnConfirmX.addEventListener("click", onCancel);

      openModal(confirmModal);
    });
  }

  /* ------------------------------------------------------------------
     7. DASHBOARD YÜKLƏMƏ
     ------------------------------------------------------------------ */
  function showDashboardError(message) {
    let banner = $("tutor-error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "tutor-error-banner";
      banner.className = "auth-alert alert-danger error-banner";
      banner.setAttribute("role", "alert");

      const text = document.createElement("span");
      text.className = "error-banner-text";
      text.textContent = message;

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn btn-secondary btn-sm";
      retryBtn.textContent = "Yenidən yoxla";
      retryBtn.addEventListener("click", () => {
        banner.classList.add("hidden");
        if (skeletonEl) skeletonEl.classList.remove("hidden");
        loadDashboard();
      });

      banner.appendChild(text);
      banner.appendChild(retryBtn);

      const mainEl = document.querySelector(".tutor-main") || document.body;
      mainEl.insertBefore(banner, mainEl.firstChild);
    }
    const textEl = banner.querySelector(".error-banner-text");
    if (textEl) textEl.textContent = message;
    banner.classList.remove("hidden");
  }

  async function loadDashboard() {
    try {
      const response = await fetchWithAuth("/api/v1/tutor/dashboard", { method: "GET" });

      if (!response) {
        if (skeletonEl) skeletonEl.classList.add("hidden");
        showDashboardError("Serverlə əlaqə yaradıla bilmədi. İnternet bağlantınızı və ya server vəziyyətini yoxlayın.");
        return;
      }

      if (response.status === 401) {
        clearStoredTokens();
        window.location.href = "auth.html";
        return;
      }

      if (response.status === 403) {
        showDashboardError("Bu panelə giriş üçün repetitor hesabı ilə daxil olmalısınız.");
        if (skeletonEl) skeletonEl.classList.add("hidden");
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Məlumatları yükləmək mümkün olmadı.");
      }

      tutorData = await response.json();
      if (skeletonEl) skeletonEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");

      const banner = $("tutor-error-banner");
      if (banner) banner.classList.add("hidden");

      renderTutorInfo(tutorData.tutor);
      renderStats(tutorData.stats);
      renderStudents(getFilteredStudents());
      renderExamSummaries(tutorData.exam_summaries || []);
      renderSubmissions(tutorData.recent_submissions || []);

      if (tabStudentsCount) tabStudentsCount.textContent = (tutorData.students || []).length;
      if (tabSubmissionsCount) tabSubmissionsCount.textContent = (tutorData.recent_submissions || []).length;
    } catch (err) {
      console.error("Dashboard error:", err);
      if (skeletonEl) skeletonEl.classList.add("hidden");
      showDashboardError(err.message || "Gözlənilməz xəta baş verdi.");
    }
  }

  /* ------------------------------------------------------------------
     8. PROFİL VƏ 4 RƏQƏMLİ KOD
     ------------------------------------------------------------------ */
  function openTutorDrawer() {
    if (tutorProfileDrawer) tutorProfileDrawer.classList.add("active");
    if (tutorDrawerOverlay) {
      tutorDrawerOverlay.classList.add("active");
      tutorDrawerOverlay.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("modal-open");
  }

  function closeTutorDrawer() {
    if (tutorProfileDrawer) tutorProfileDrawer.classList.remove("active");
    if (tutorDrawerOverlay) {
      tutorDrawerOverlay.classList.remove("active");
      tutorDrawerOverlay.setAttribute("aria-hidden", "true");
    }
    if (modalStack.length === 0) document.body.classList.remove("modal-open");
  }

  function getTutorCode() {
    const raw = (tutorData && tutorData.tutor && (tutorData.tutor.tutor_code || tutorData.tutor.invite_code)) || "";
    return /^\d{4}$/.test(raw) ? raw : "";
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* aşağıdakı fallback-ə keçir */ }

    // Fallback: müvəqqəti textarea (document.execCommand — yalnız lokal klonda)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function flashButtonText(btn, text) {
    if (!btn) return;
    const original = btn.textContent;
    const wasDisabled = btn.disabled;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      // Əgər düymə əvvəl artıq deaktiv idisə (məsələn, kod təyin edilməyib),
      // o vəziyyətdə deaktiv qalır.
      btn.disabled = wasDisabled;
    }, 1800);
  }

  async function copy4DigitCode() {
    const code = getTutorCode();
    if (!code) {
      showToast("Repetitor kodu hələ təyin edilməyib.", "error");
      return;
    }
    const ok = await copyText(code);
    if (ok) {
      flashButtonText(btnCopyCode, "Kopyalandı");
      flashButtonText(btnDrawerCopyCode, "Kopyalandı");
      flashButtonText(btnProfilePaneCopyCode, "Kopyalandı");
      showToast(`${code} kodu buferə kopyalandı.`, "success");
    } else {
      showToast("Kopyalama mümkün olmadı. Kodu əl ilə yazın.", "error");
    }
  }

  function renderTutorInfo(tutor) {
    if (!tutor) return;
    const first = (tutor.first_name || "").trim();
    const last = (tutor.last_name || "").trim();
    const fullName = [first, last].filter(Boolean).join(" ") || "Repetitor";
    const subject = tutor.subject || "Ümumi";

    // 4 rəqəmli kod yalnız server tərəfində (users.tutor_code) saxlanılır.
    // Kod yoxdursa "----" göstərmək istifadəçini çaşırır — açıq vəziyyət
    // göstərilir: "Təyin edilməyib".
    const rawCode = String(tutor.tutor_code || tutor.invite_code || "");
    const hasCode = /^\d{4}$/.test(rawCode);
    const code = hasCode ? rawCode : "Təyin edilməyib";

    if (tutorNameEl) tutorNameEl.textContent = fullName;
    if (tutorSubjectEl) tutorSubjectEl.textContent = subject;
    if (welcomeHeadingEl) welcomeHeadingEl.textContent = `Xoş gəlmisiniz, ${first || "müəllim"}`;

    [inviteCodeDisplay, drawerTutorCode, profilePaneCode].forEach((el) => {
      if (!el) return;
      el.textContent = code;
      el.classList.toggle("code-missing", !hasCode);
      el.title = hasCode ? "4 rəqəmli sistem kodunuz" : "Kod hələ təyin edilməyib";
    });
    [btnCopyCode, btnDrawerCopyCode, btnProfilePaneCopyCode].forEach((btn) => {
      if (btn) btn.disabled = !hasCode;
    });

    if (drawerTutorName) drawerTutorName.textContent = fullName;
    if (drawerTutorSubject) drawerTutorSubject.textContent = subject;
    if (drawerTutorIdentifier) drawerTutorIdentifier.textContent = tutor.identifier || "—";

    if (editTutorName) editTutorName.value = first;
    if (editTutorSurname) editTutorSurname.value = last;
    if (editTutorSubject) editTutorSubject.value = tutor.subject || "";

    if (profilePaneFullname) profilePaneFullname.textContent = fullName;
    if (profilePaneSubjectPill) profilePaneSubjectPill.textContent = `Fənn: ${subject}`;
    if (profilePaneIdentifier) profilePaneIdentifier.textContent = tutor.identifier || "—";
    if (profileInputFirstname) profileInputFirstname.value = first;
    if (profileInputLastname) profileInputLastname.value = last;
    if (profileInputSubject) profileInputSubject.value = tutor.subject || "";
    if (profileInputIdentifier) profileInputIdentifier.value = tutor.identifier || "—";
  }

  function renderStats(stats) {
    if (!stats) return;
    if (statTotalStudents) statTotalStudents.textContent = stats.total_students || 0;
    if (statStudentsSub) {
      statStudentsSub.textContent = `${stats.active_students || 0} aktiv sınaq işləyən`;
    }
    if (statTotalExams) statTotalExams.textContent = stats.total_exams_completed || 0;
    if (statGroupAvg) statGroupAvg.textContent = `${Number(stats.group_avg_accuracy || 0)}%`;
    if (statTopStudent) {
      statTopStudent.textContent = stats.top_student || "Yoxdur";
      statTopStudent.title = stats.top_student || "";
    }
    if (statLowestStudent) {
      statLowestStudent.textContent = stats.lowest_student || "Yoxdur";
      statLowestStudent.title = stats.lowest_student || "";
    }
  }

  /* ------------------------------------------------------------------
     9. TAB İDARƏETMƏSİ
     ------------------------------------------------------------------ */
  const TAB_MAP = [
    { id: "students", btn: tabBtnStudents, pane: paneStudents },
    { id: "requests", btn: tabBtnRequests, pane: paneRequests },
    { id: "assignments", btn: tabBtnAssignments, pane: paneAssignments },
    { id: "exams", btn: tabBtnExams, pane: paneExams },
    { id: "ai", btn: tabBtnAi, pane: paneAi },
    { id: "profile", btn: tabBtnProfile, pane: paneProfile }
  ];

  function switchTab(targetTab) {
    let found = false;
    TAB_MAP.forEach(({ id, btn, pane }) => {
      if (!btn || !pane) return;
      const isActive = id === targetTab;
      if (isActive) found = true;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      pane.classList.toggle("hidden", !isActive);
    });

    if (!found) return;

    if (targetTab === "assignments") loadAssignments();
    if (targetTab === "requests") loadJoinRequests();
    if (targetTab === "ai" && aiQueryInput) aiQueryInput.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------
     10. ŞAGİRD SİYAHISI: AXTARIŞ, FİLTR, RENDER
     ------------------------------------------------------------------ */
  function getFilteredStudents() {
    if (!tutorData || !Array.isArray(tutorData.students)) return [];
    const query = (studentSearchInput ? studentSearchInput.value : "").trim().toLowerCase();
    const statusVal = studentStatusFilter ? studentStatusFilter.value : "all";

    return tutorData.students.filter((st) => {
      if (statusVal !== "all" && st.status !== statusVal) return false;
      if (!query) return true;
      const haystack = [
        st.first_name,
        st.last_name,
        st.identifier,
        st.grade
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }

  function renderStudents(filtered) {
    const students = Array.isArray(filtered) ? filtered : [];
    const totalStudents = tutorData && Array.isArray(tutorData.students) ? tutorData.students.length : 0;
    studentsTableBody.replaceChildren();

    // Üç müxtəlif vəziyyət: (a) qrup boşdur, (b) filtr nəticəsi yoxdur, (c) cədvəl
    const hasAnyStudent = totalStudents > 0;
    const hasResults = students.length > 0;

    if (!hasAnyStudent) {
      if (studentsEmptyState) studentsEmptyState.classList.remove("hidden");
      if (studentsNoResultState) studentsNoResultState.classList.add("hidden");
      if (studentsTableWrap) studentsTableWrap.classList.add("hidden");
      if (filterResultCount) filterResultCount.textContent = "";
      return;
    }

    if (studentsEmptyState) studentsEmptyState.classList.add("hidden");

    if (!hasResults) {
      if (studentsNoResultState) studentsNoResultState.classList.remove("hidden");
      if (studentsTableWrap) studentsTableWrap.classList.add("hidden");
      if (filterResultCount) filterResultCount.textContent = `0 nəticə (${totalStudents} şagirddən)`;
      return;
    }

    if (studentsNoResultState) studentsNoResultState.classList.add("hidden");
    if (studentsTableWrap) studentsTableWrap.classList.remove("hidden");
    if (filterResultCount) {
      filterResultCount.textContent =
        totalStudents === students.length
          ? `${students.length} şagird`
          : `${students.length} nəticə (${totalStudents} şagirddən)`;
    }

    students.forEach((st) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.className = "cell-strong";
      tdName.textContent = [st.first_name, st.last_name].filter(Boolean).join(" ") || "Şagird";

      const tdIdentifier = document.createElement("td");
      tdIdentifier.className = "cell-muted";
      tdIdentifier.textContent = st.identifier || "—";

      const tdGrade = document.createElement("td");
      tdGrade.textContent = st.grade ? `${st.grade}-ci sinif` : "—";

      const tdExams = document.createElement("td");
      tdExams.className = "cell-num";
      tdExams.textContent = `${st.exams_count || 0} sınaq`;

      const tdAccuracy = document.createElement("td");
      tdAccuracy.className = "cell-num cell-strong";
      tdAccuracy.textContent = st.total_questions > 0 ? `${st.accuracy_pct || 0}%` : "—";

      const tdLastScore = document.createElement("td");
      tdLastScore.className = "cell-num";
      tdLastScore.textContent = st.last_score || "—";

      const tdStatus = document.createElement("td");
      const tag = document.createElement("span");
      const map = { Yaxşı: "good", Orta: "mid", Zəif: "bad" };
      tag.className = `student-tag ${map[st.status] || "none"}`;
      tag.textContent = st.status || "Məlum deyil";
      tdStatus.appendChild(tag);

      const tdAction = document.createElement("td");
      const actionGroup = document.createElement("div");
      actionGroup.className = "action-btn-group";

      const detailBtn = document.createElement("button");
      detailBtn.type = "button";
      detailBtn.className = "btn btn-outline btn-sm";
      detailBtn.textContent = "Analiz";
      detailBtn.title = "Şagird analitikasına bax";
      detailBtn.addEventListener("click", () => handleViewStudentDetail(st.id, tdName.textContent));

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-ghost btn-sm text-danger";
      removeBtn.textContent = "Çıxar";
      removeBtn.title = "Şagirdi qrupdan çıxar";
      removeBtn.addEventListener("click", () => handleRemoveStudent(st.id, tdName.textContent));

      actionGroup.appendChild(detailBtn);
      actionGroup.appendChild(removeBtn);
      tdAction.appendChild(actionGroup);

      tr.append(tdName, tdIdentifier, tdGrade, tdExams, tdAccuracy, tdLastScore, tdStatus, tdAction);
      studentsTableBody.appendChild(tr);
    });
  }

  function refreshStudentFilter() {
    renderStudents(getFilteredStudents());
  }

  /* ------------------------------------------------------------------
     11. SINAQ XÜLASƏLƏRİ VƏ TƏQDİMATLAR
     ------------------------------------------------------------------ */
  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("az-AZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function makeCell(text, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function makeTag(text, variant) {
    const span = document.createElement("span");
    span.className = `student-tag ${variant}`;
    span.textContent = text;
    return span;
  }

  function accuracyVariant(pct) {
    if (pct >= 80) return "good";
    if (pct >= 50) return "mid";
    return "bad";
  }

  function renderExamSummaries(summaries) {
    examsSummaryTableBody.replaceChildren();
    const list = Array.isArray(summaries) ? summaries : [];

    if (list.length === 0) {
      if (examsSummaryEmpty) examsSummaryEmpty.classList.remove("hidden");
      if (examsSummaryTableWrap) examsSummaryTableWrap.classList.add("hidden");
      return;
    }

    if (examsSummaryEmpty) examsSummaryEmpty.classList.add("hidden");
    if (examsSummaryTableWrap) examsSummaryTableWrap.classList.remove("hidden");

    list.forEach((es) => {
      const tr = document.createElement("tr");
      tr.appendChild(makeCell(es.title || "Sınaq", "cell-strong"));

      const tdSubject = document.createElement("td");
      tdSubject.appendChild(makeTag(es.subject || "Ümumi", "none"));
      tr.appendChild(tdSubject);

      tr.appendChild(makeCell(`${es.total_questions || 0} sual`, "cell-num"));
      tr.appendChild(makeCell(`${es.participant_count || 0} nəfər`, "cell-num cell-strong"));
      tr.appendChild(makeCell(`${es.avg_score || 0} bal`, "cell-num"));
      tr.appendChild(makeCell(`${es.highest_score || 0} bal`, "cell-num"));
      tr.appendChild(makeCell(`${es.lowest_score || 0} bal`, "cell-num"));
      examsSummaryTableBody.appendChild(tr);
    });
  }

  function renderSubmissions(submissions) {
    submissionsTableBody.replaceChildren();
    const list = Array.isArray(submissions) ? submissions : [];

    if (list.length === 0) {
      if (submissionsEmpty) submissionsEmpty.classList.remove("hidden");
      if (submissionsTableWrap) submissionsTableWrap.classList.add("hidden");
      return;
    }

    if (submissionsEmpty) submissionsEmpty.classList.add("hidden");
    if (submissionsTableWrap) submissionsTableWrap.classList.remove("hidden");

    list.forEach((sub) => {
      const pct = Number(sub.percentage || 0);
      const tr = document.createElement("tr");

      tr.appendChild(makeCell(sub.student_name || "Şagird", "cell-strong"));
      tr.appendChild(makeCell(sub.exam_title || "Sınaq"));

      const tdSubject = document.createElement("td");
      tdSubject.appendChild(makeTag(sub.subject || "Ümumi", "none"));
      tr.appendChild(tdSubject);

      tr.appendChild(makeCell(`${sub.score || 0} / ${sub.total_questions || 0}`, "cell-num"));
      tr.appendChild(makeCell(`${sub.incorrect_count || 0} s. / ${sub.empty_count || 0} b.`, "cell-num"));

      const tdPct = document.createElement("td");
      tdPct.appendChild(makeTag(`${pct}%`, accuracyVariant(pct)));
      tr.appendChild(tdPct);

      tr.appendChild(makeCell(formatDateTime(sub.created_at), "cell-muted"));
      submissionsTableBody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------
     12. ŞAGİRD ANALİTIKASI MODALI
     ------------------------------------------------------------------ */
  async function handleViewStudentDetail(studentId, fallbackName) {
    detailStudentName.textContent = fallbackName || "Şagird Analitikası";
    detailStudentMeta.textContent = "Analitika yüklənir...";
    detailStudentExams.textContent = "—";
    detailStudentAcc.textContent = "—";
    detailStudentScore.textContent = "—";
    detailStudentHistoryBody.replaceChildren();
    detailStudentEmpty.classList.add("hidden");
    if (detailStudentHistoryWrap) detailStudentHistoryWrap.classList.remove("hidden");

    openModal(studentDetailModal);

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/students/${encodeURIComponent(studentId)}/analytics`, {
        method: "GET"
      });

      if (!res || !res.ok) throw new Error("Şagird analitikasını yükləmək mümkün olmadı.");

      const data = await res.json();
      const student = data.student || {};
      const stats = data.stats || {};

      detailStudentName.textContent = student.name || fallbackName || "Şagird";
      detailStudentMeta.textContent = [
        student.grade ? `${student.grade}-ci sinif` : "Sinif qeyd edilməyib",
        `Əlaqə: ${student.identifier || "—"}`
      ].join(" • ");

      detailStudentExams.textContent = stats.total_exams || 0;
      detailStudentAcc.textContent = `${stats.overall_accuracy || 0}%`;
      detailStudentScore.textContent = `${stats.total_score || 0} / ${stats.total_questions || 0}`;

      const history = Array.isArray(data.history) ? data.history : [];
      if (history.length === 0) {
        detailStudentEmpty.classList.remove("hidden");
        if (detailStudentHistoryWrap) detailStudentHistoryWrap.classList.add("hidden");
        return;
      }

      history.forEach((h) => {
        const pct = Number(h.percentage || 0);
        const tr = document.createElement("tr");
        tr.appendChild(makeCell(h.title || "Sınaq", "cell-strong"));

        const tdSubj = document.createElement("td");
        tdSubj.appendChild(makeTag(h.subject || "Ümumi", "none"));
        tr.appendChild(tdSubj);

        tr.appendChild(makeCell(`${h.score || 0} / ${h.total_questions || 0}`, "cell-num"));
        tr.appendChild(makeCell(`${h.incorrect_count || 0} s. / ${h.empty_count || 0} b.`, "cell-num"));

        const tdPct = document.createElement("td");
        tdPct.appendChild(makeTag(`${pct}%`, accuracyVariant(pct)));
        tr.appendChild(tdPct);

        tr.appendChild(makeCell(formatDateTime(h.created_at), "cell-muted"));
        detailStudentHistoryBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      detailStudentMeta.textContent = "Məlumatları əldə etmək mümkün olmadı.";
      if (detailStudentHistoryWrap) detailStudentHistoryWrap.classList.add("hidden");
      detailStudentEmpty.classList.remove("hidden");
      detailStudentEmpty.querySelector(".empty-box-desc").textContent =
        "Şagird analitikası yüklənmədi. Bir az sonra yenidən cəhd edin.";
    }
  }

  /* ------------------------------------------------------------------
     13. ŞAGİRDİ QRUPDAN ÇIXARMAQ
     ------------------------------------------------------------------ */
  async function handleRemoveStudent(studentId, studentName) {
    const confirmed = await askConfirm({
      title: "Şagirdi qrupdan çıxar",
      message: `${studentName} adlı şagirdi qrupunuzdan çıxarmaq istədiyinizə əminsiniz? Şagirdin hesabı silinmir, sadəcə qrupdan ayrılır.`,
      confirmLabel: "Çıxar"
    });
    if (!confirmed) return;

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/students/${encodeURIComponent(studentId)}`, {
        method: "DELETE"
      });

      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        showToast(err.detail || "Şagirdi çıxarmaq mümkün olmadı.", "error");
        return;
      }

      showToast(`${studentName} qrupdan çıxarıldı.`, "success");
      await loadDashboard();
    } catch (e) {
      console.error(e);
      showToast("Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.", "error");
    }
  }

  /* ------------------------------------------------------------------
     14. ŞAGİRD ƏLAVƏ ETMƏ
     ------------------------------------------------------------------ */
  const IDENTIFIER_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$|^\+?994\d{9}$|^0\d{9}$/;

  function validateIdentifier(value) {
    const v = (value || "").trim();
    if (!v) return "Zəhmət olmasa E-poçt və ya mobil nömrəni daxil edin.";
    if (v.length > 120) return "Məlumat çox uzundur.";
    if (!IDENTIFIER_RE.test(v)) return "E-poçt və ya mobil nömrə formatı düzgün deyil.";
    return null;
  }

  function setFeedback(el, message, isSuccess) {
    if (!el) return;
    el.textContent = message;
    el.className = isSuccess ? "auth-alert success" : "auth-alert error";
    el.classList.remove("hidden");
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    const btnText = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".loader");
    if (btnText) btnText.classList.toggle("hidden", isLoading);
    if (loader) loader.classList.toggle("hidden", !isLoading);
    btn.disabled = isLoading;
  }

  /* ------------------------------------------------------------------
     15. AI KÖMƏKÇİ — SÖHBƏT MƏNTİQİ
     ------------------------------------------------------------------ */
  function scrollChatToBottom(force = false) {
    if (!aiChatMessages) return;
    const nearBottom =
      aiChatMessages.scrollHeight - aiChatMessages.scrollTop - aiChatMessages.clientHeight < 120;
    if (force || nearBottom) {
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }
  }

  function updateCharCounter() {
    if (!aiCharCounter || !aiQueryInput) return;
    const len = aiQueryInput.value.length;
    aiCharCounter.textContent = `${len} / ${AI_MAX_CHARS}`;
    aiCharCounter.classList.toggle("is-limit", len >= AI_MAX_CHARS);
  }

  function autoGrowInput() {
    if (!aiQueryInput) return;
    aiQueryInput.style.height = "auto";
    aiQueryInput.style.height = `${Math.min(aiQueryInput.scrollHeight, 140)}px`;
  }

  function setChatBusy(isBusy) {
    isAiResponding = isBusy;
    if (chatStatusDot) chatStatusDot.classList.toggle("is-busy", isBusy);
    if (chatSubtitle) {
      chatSubtitle.textContent = isBusy ? "Qrup məlumatları təhlil edilir..." : "AI Köməkçi hazırdır";
    }
    if (btnSubmitAi) btnSubmitAi.disabled = isBusy;
    aiChipButtons.forEach((chip) => { chip.disabled = isBusy; });
  }

  function createMessageElement(role, text, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = `ai-message ai-message-${role}`;
    if (options.isError) wrap.classList.add("is-error");

    const avatar = document.createElement("div");
    avatar.className = "ai-message-avatar";
    avatar.textContent = role === "user" ? "SİZ" : "AI";
    avatar.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "ai-message-body";

    const meta = document.createElement("div");
    meta.className = "ai-message-meta";

    const author = document.createElement("span");
    author.className = "ai-message-author";
    author.textContent = role === "user" ? "Siz" : "AI Köməkçi";
    meta.appendChild(author);

    const time = document.createElement("span");
    time.className = "ai-message-time";
    time.textContent = new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
    meta.appendChild(time);

    const bubble = document.createElement("div");
    bubble.className = "ai-message-bubble";

    const textEl = document.createElement("div");
    textEl.className = "ai-message-text";
    textEl.textContent = text;

    bubble.appendChild(textEl);
    body.append(meta, bubble);
    wrap.append(avatar, body);

    return { wrap, body, textEl, bubble };
  }

  // Təhlükəsiz markdown render (innerHTML-siz — yalnız createElement/textContent)
  function renderSafeMarkdownToElement(container, rawText) {
    container.replaceChildren();
    const lines = String(rawText || "").split("\n");
    let currentList = null;

    const flush = () => {
      currentList = null;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flush();
        return;
      }

      // \u2022 = "•" (bullet). Unicode escape istifadə olunur ki, fayl
      // kodlamasından asılı olmayaraq regex həmişə düzgün işləsin.
      const BULLET_RE = /^[\u2022\-*]\s+/;
      const ORDERED_RE = /^\d+[.)]\s+/;

      const isBullet = BULLET_RE.test(trimmed) || ORDERED_RE.test(trimmed);
      if (isBullet) {
        if (!currentList) {
          currentList = document.createElement("ul");
          container.appendChild(currentList);
        }
        const li = document.createElement("li");
        appendFormattedTextNodes(li, trimmed.replace(BULLET_RE, "").replace(ORDERED_RE, ""));
        currentList.appendChild(li);
        return;
      }

      flush();
      const p = document.createElement("p");
      appendFormattedTextNodes(p, trimmed);
      container.appendChild(p);
    });
  }

  function appendFormattedTextNodes(parentEl, text) {
    String(text)
      .split(/(\*\*[^*]+\*\*)/g)
      .forEach((part) => {
        if (!part) return;
        if (part.startsWith("**") && part.endsWith("**")) {
          const strong = document.createElement("strong");
          strong.textContent = part.slice(2, -2);
          parentEl.appendChild(strong);
        } else {
          parentEl.appendChild(document.createTextNode(part));
        }
      });
  }

  function appendTypingIndicator() {
    const { wrap, textEl } = createMessageElement("assistant", "");
    textEl.replaceChildren();

    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.setAttribute("aria-label", "Köməkçi yazır");
    for (let i = 0; i < 3; i += 1) {
      typing.appendChild(document.createElement("span"));
    }
    textEl.appendChild(typing);
    aiChatMessages.appendChild(wrap);
    return wrap;
  }

  function resetChatToWelcome(message) {
    if (!aiChatMessages) return;
    aiChatMessages.replaceChildren();
    const { wrap } = createMessageElement(
      "assistant",
      message ||
        "Salam, hörmətli müəllim! Mən qrupunuzun sınaq nəticələrini təhlil etmək üçün buradayam. Şagirdlərinizin balları, ən son sınağın nəticələri və ya platformanın iş prinsipləri barədə sualınızı verə bilərsiniz."
    );
    aiChatMessages.appendChild(wrap);
  }

  async function submitAIQuery(rawQuery) {
    const query = String(rawQuery || "").trim();
    if (!query || isAiResponding) return;

    if (query.length > AI_MAX_CHARS) {
      showToast(`Sual ${AI_MAX_CHARS} simvoldan uzun ola bilməz.`, "error");
      return;
    }

    if (aiQueryInput) {
      aiQueryInput.value = "";
      updateCharCounter();
      autoGrowInput();
    }

    setChatBusy(true);

    const userMsg = createMessageElement("user", query);
    aiChatMessages.appendChild(userMsg.wrap);
    scrollChatToBottom(true);

    const pending = appendTypingIndicator();
    scrollChatToBottom(true);

    try {
      const res = await fetchWithAuth("/api/v1/tutor/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          conversation_history: aiConversationHistory.slice(-AI_HISTORY_LIMIT)
        })
      });

      if (!res) throw new Error("Serverlə əlaqə qurmaq mümkün olmadı.");

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Cavab hazırlanarkən xəta baş verdi.");
      }

      const answer = data.answer || "Məlumat tapılmadı.";

      pending.replaceWith(createMessageElement("assistant", "").wrap);
      const assistantNodes = Array.from(aiChatMessages.querySelectorAll(".ai-message-assistant"));
      const lastAssistant = assistantNodes[assistantNodes.length - 1];
      const lastTextEl = lastAssistant ? lastAssistant.querySelector(".ai-message-text") : null;
      if (lastTextEl) renderSafeMarkdownToElement(lastTextEl, answer);

      aiConversationHistory.push({ role: "user", content: query });
      aiConversationHistory.push({ role: "model", content: answer });
      if (aiConversationHistory.length > AI_HISTORY_LIMIT * 2) {
        aiConversationHistory = aiConversationHistory.slice(-AI_HISTORY_LIMIT * 2);
      }
    } catch (err) {
      console.error("AI Query Error:", err);
      const errMsg = err.message || "Gözlənilməz xəta baş verdi.";
      pending.replaceWith(createMessageElement("assistant", `Xəta: ${errMsg}`, { isError: true }).wrap);
    } finally {
      setChatBusy(false);
      scrollChatToBottom(true);
      if (aiQueryInput) aiQueryInput.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------
     16. CAVAB KARTI QURUCUSU
     ------------------------------------------------------------------ */
  const ANSWER_OPTIONS = ["A", "B", "C", "D", "E"];

  function normalizeQuestionCount(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return 25;
    return Math.min(Math.max(n, 1), 120);
  }

  function updateAnswerKeyCounter(total) {
    if (!answerKeyCounter) return;
    const filled = Object.keys(answerKeyMap).length;
    answerKeyCounter.textContent = `${filled} / ${total} qeyd edilib`;
  }

  function renderAnswerKeyGrid(count) {
    if (!answerKeyGrid) return;
    answerKeyGrid.replaceChildren();
    const total = normalizeQuestionCount(count);

    for (let i = 1; i <= total; i += 1) {
      const key = String(i);

      const row = document.createElement("div");
      row.className = "answer-key-row";

      const numEl = document.createElement("span");
      numEl.className = "answer-key-qnum";
      numEl.textContent = `${i}.`;
      row.appendChild(numEl);

      const group = document.createElement("div");
      group.className = "bubble-options-group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `${i}-ci sualın doğru variantı`);

      ANSWER_OPTIONS.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bubble-btn";
        btn.textContent = opt;
        btn.setAttribute("aria-pressed", answerKeyMap[key] === opt ? "true" : "false");
        btn.setAttribute("aria-label", `${i}-ci sual: variant ${opt}`);

        if (answerKeyMap[key] === opt) btn.classList.add("active");

        btn.addEventListener("click", () => {
          if (answerKeyMap[key] === opt) {
            delete answerKeyMap[key];
          } else {
            answerKeyMap[key] = opt;
          }
          group.querySelectorAll(".bubble-btn").forEach((b) => {
            const active = b.textContent === answerKeyMap[key];
            b.classList.toggle("active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          });
          updateAnswerKeyCounter(total);
        });

        group.appendChild(btn);
      });

      row.appendChild(group);
      answerKeyGrid.appendChild(row);
    }

    updateAnswerKeyCounter(total);
  }

  /* ------------------------------------------------------------------
     17. PDF YÜKLƏMƏ
     ------------------------------------------------------------------ */
  function handlePdfFileSelect(file) {
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      showCreateAsgError("Yalnız .pdf formatında sənədlər qəbul edilir.");
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      showCreateAsgError("PDF faylının həcmi 25 MB-dan çox olmamalıdır.");
      return;
    }

    if (file.size === 0) {
      showCreateAsgError("Seçilmiş fayl boşdur.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentPdfBase64 = e.target.result;
      if (pdfDropzone) pdfDropzone.classList.add("hidden");
      if (pdfFileInfo) pdfFileInfo.classList.remove("hidden");
      if (pdfFileName) pdfFileName.textContent = file.name;
      if (pdfFileSize) pdfFileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
      if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = false;
      hideCreateAsgError();
    };
    reader.onerror = () => {
      showCreateAsgError("PDF faylı oxunarkən xəta baş verdi. Yenidən cəhd edin.");
    };
    reader.readAsDataURL(file);
  }

  function showCreateAsgError(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert error";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function showCreateAsgSuccess(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert success";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function showCreateAsgInfo(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert info";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function hideCreateAsgError() {
    if (createAsgFeedback) {
      createAsgFeedback.classList.add("hidden");
      createAsgFeedback.textContent = "";
    }
  }

  function openCreateAssignmentModal() {
    if (!createAssignmentModal) return;
    hideCreateAsgError();
    if (createAssignmentForm) createAssignmentForm.reset();
    currentPdfBase64 = null;
    answerKeyMap = {};

    if (asgQCountInput) asgQCountInput.value = "25";
    if (asgDurationInput) asgDurationInput.value = "60";
    if (pdfDropzone) pdfDropzone.classList.remove("hidden");
    if (pdfFileInfo) pdfFileInfo.classList.add("hidden");
    if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = true;

    renderAnswerKeyGrid(25);
    openModal(createAssignmentModal);
  }

  function closeCreateAssignmentModal() {
    closeModal(createAssignmentModal);
  }

  /* ------------------------------------------------------------------
     18. PAYLAŞMA LİNKİ
     ------------------------------------------------------------------ */
  function buildShareUrl(assignmentId) {
    const safeId = encodeURIComponent(String(assignmentId || ""));
    const url = new URL("exam-hall.html", window.location.origin);
    url.searchParams.set("assignment_id", safeId);
    return url.toString();
  }

  function openShareModal(assignmentId) {
    if (!shareAssignmentModal || !shareLinkInput) return;
    shareLinkInput.value = buildShareUrl(assignmentId);
    if (shareCopyFeedback) shareCopyFeedback.classList.add("hidden");
    openModal(shareAssignmentModal);
  }

  /* ------------------------------------------------------------------
     19. SINAQLAR SIYAHISI
     ------------------------------------------------------------------ */
  async function loadAssignments() {
    if (!assignmentsGrid) return;
    try {
      const res = await fetchWithAuth("/api/v1/tutor/assignments");
      if (!res || !res.ok) throw new Error("Sınaqlar siyahısı alına bilmədi.");
      const list = await res.json();
      const items = Array.isArray(list) ? list : [];
      if (tabAssignmentsCount) tabAssignmentsCount.textContent = items.length;
      renderAssignments(items);
    } catch (err) {
      console.warn("Load assignments warning:", err);
      if (tabAssignmentsCount) tabAssignmentsCount.textContent = "0";
      renderAssignments([]);
    }
  }

  function renderAssignments(assignments) {
    if (!assignmentsGrid) return;
    assignmentsGrid.replaceChildren();
    const list = Array.isArray(assignments) ? assignments : [];

    if (list.length === 0) {
      if (assignmentsEmptyState) assignmentsEmptyState.classList.remove("hidden");
      assignmentsGrid.classList.add("hidden");
      return;
    }

    if (assignmentsEmptyState) assignmentsEmptyState.classList.add("hidden");
    assignmentsGrid.classList.remove("hidden");

    list.forEach((asg) => {
      const card = document.createElement("article");
      card.className = "assignment-card";

      const header = document.createElement("div");
      header.className = "asg-header";

      const tag = document.createElement("span");
      tag.className = "asg-tag";
      tag.textContent = "PDF Sınaq";
      header.appendChild(tag);

      const dateEl = document.createElement("span");
      dateEl.className = "asg-date";
      dateEl.textContent = asg.created_at
        ? new Date(asg.created_at).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "Tarix yoxdur";
      header.appendChild(dateEl);
      card.appendChild(header);

      const titleEl = document.createElement("h3");
      titleEl.className = "asg-title";
      titleEl.textContent = asg.title || "Adsız sınaq";
      card.appendChild(titleEl);

      const metaRow = document.createElement("div");
      metaRow.className = "asg-meta-row";
      metaRow.appendChild(makeMetaItem(`${asg.question_count || 25} sual`));
      metaRow.appendChild(makeMetaItem(`${asg.duration_minutes || 60} dəqiqə`));
      card.appendChild(metaRow);

      const subCount = asg.submission_count || 0;
      const statsBanner = document.createElement("div");
      statsBanner.className = "asg-stats-banner";

      const subInfo = document.createElement("span");
      subInfo.textContent = subCount > 0 ? `${subCount} şagird təhvil verib` : "Hələ təhvil verilməyib";
      statsBanner.appendChild(subInfo);

      const avgInfo = document.createElement("span");
      avgInfo.className = "asg-stats-val";
      avgInfo.textContent = subCount > 0 ? `Orta: ${asg.avg_score || 0} bal` : "—";
      statsBanner.appendChild(avgInfo);
      card.appendChild(statsBanner);

      const actions = document.createElement("div");
      actions.className = "asg-actions";

      const btnCopy = document.createElement("button");
      btnCopy.type = "button";
      btnCopy.className = "btn btn-outline btn-sm";
      btnCopy.textContent = "Linki Kopyala";
      btnCopy.addEventListener("click", async () => {
        const ok = await copyText(buildShareUrl(asg.id));
        if (ok) {
          flashButtonText(btnCopy, "Kopyalandı");
        } else {
          openShareModal(asg.id);
        }
      });
      actions.appendChild(btnCopy);

      const btnResults = document.createElement("button");
      btnResults.type = "button";
      btnResults.className = "btn btn-secondary btn-sm";
      btnResults.textContent = "Nəticələr";
      btnResults.addEventListener("click", () => openAssignmentSubmissions(asg.id, asg.title));
      actions.appendChild(btnResults);

      if (isSafeHttpUrl(asg.pdf_url)) {
        const btnPdf = document.createElement("button");
        btnPdf.type = "button";
        btnPdf.className = "btn btn-ghost btn-sm";
        btnPdf.textContent = "PDF";
        btnPdf.title = "Sınaq PDF faylını aç";
        btnPdf.addEventListener("click", () => openPdfViewer(asg.pdf_url));
        actions.appendChild(btnPdf);
      }

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost btn-sm text-danger";
      btnDel.textContent = "Sil";
      btnDel.addEventListener("click", async () => {
        const confirmed = await askConfirm({
          title: "Sınağı sil",
          message: `"${asg.title || "Bu sınaq"}" və ona aid bütün nəticələr silinəcək. Əməliyyat geri qaytarılmaz.`,
          confirmLabel: "Sil"
        });
        if (!confirmed) return;
        try {
          const res = await fetchWithAuth(`/api/v1/tutor/assignments/${encodeURIComponent(asg.id)}`, {
            method: "DELETE"
          });
          if (!res || !res.ok) {
            const err = res ? await res.json().catch(() => ({})) : {};
            showToast(err.detail || "Sınağı silmək mümkün olmadı.", "error");
            return;
          }
          showToast("Sınaq silindi.", "success");
          await loadAssignments();
        } catch (err) {
          console.error(err);
          showToast("Sınağı silmək mümkün olmadı.", "error");
        }
      });
      actions.appendChild(btnDel);

      card.appendChild(actions);
      assignmentsGrid.appendChild(card);
    });
  }

  function makeMetaItem(text) {
    const el = document.createElement("span");
    el.className = "asg-meta-item";
    el.textContent = text;
    return el;
  }

  /* ------------------------------------------------------------------
     20. SINAQ NƏTİCƏLƏRİ MODALI
     ------------------------------------------------------------------ */
  async function openAssignmentSubmissions(asgId, title) {
    if (!assignmentSubmissionsModal) return;
    if (submissionsModalTitle) submissionsModalTitle.textContent = title || "Sınaq Nəticələri";
    if (submissionsModalMeta) submissionsModalMeta.textContent = "Yüklənir...";
    if (asgSubmissionsTableBody) asgSubmissionsTableBody.replaceChildren();
    if (asgSubmissionsTableWrap) asgSubmissionsTableWrap.classList.add("hidden");
    if (asgSubmissionsEmpty) asgSubmissionsEmpty.classList.add("hidden");

    openModal(assignmentSubmissionsModal);

    try {
      const res = await fetchWithAuth(
        `/api/v1/tutor/assignments/${encodeURIComponent(asgId)}/submissions`
      );
      if (!res || !res.ok) throw new Error("Nəticələr yüklənmədi.");

      const data = await res.json();
      const asg = data.assignment || {};
      const subs = Array.isArray(data.submissions) ? data.submissions : [];

      if (submissionsModalMeta) {
        submissionsModalMeta.textContent = `${asg.question_count || 25} sual • ${subs.length} şagird iştirak edib`;
      }

      if (subs.length === 0) {
        if (asgSubmissionsEmpty) asgSubmissionsEmpty.classList.remove("hidden");
        return;
      }

      if (asgSubmissionsTableWrap) asgSubmissionsTableWrap.classList.remove("hidden");

      subs.forEach((sub) => {
        const pct = Number(sub.percentage || 0);
        const tr = document.createElement("tr");

        tr.appendChild(makeCell(sub.student_name || "Şagird", "cell-strong"));
        tr.appendChild(makeCell(sub.student_identifier || "—", "cell-muted"));
        tr.appendChild(makeCell(`${sub.score || 0} / ${sub.total_questions || 0}`, "cell-num"));
        tr.appendChild(
          makeCell(`Düz: ${sub.score || 0} | Səhv: ${sub.incorrect_count || 0} | Boş: ${sub.empty_count || 0}`, "cell-num")
        );

        const tdAcc = document.createElement("td");
        tdAcc.appendChild(makeTag(`${pct}%`, accuracyVariant(pct)));
        tr.appendChild(tdAcc);

        tr.appendChild(makeCell(formatDateTime(sub.submitted_at), "cell-muted"));

        const tdAction = document.createElement("td");
        const btnReview = document.createElement("button");
        btnReview.type = "button";
        btnReview.className = "btn btn-outline btn-sm";
        btnReview.textContent = "Cavab kartı";
        btnReview.addEventListener("click", () => {
          openStudentAnswerReview(sub, asg.answer_key || {}, asg.question_count || 25);
        });
        tdAction.appendChild(btnReview);
        tr.appendChild(tdAction);

        asgSubmissionsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("Fetch submissions error:", err);
      if (submissionsModalMeta) submissionsModalMeta.textContent = "Məlumat yüklənərkən xəta baş verdi.";
      if (asgSubmissionsEmpty) {
        asgSubmissionsEmpty.classList.remove("hidden");
        const desc = asgSubmissionsEmpty.querySelector(".empty-box-desc");
        if (desc) desc.textContent = "Nəticələr yüklənmədi. Zəhmət olmasa pəncərəni bağlayıb yenidən cəhd edin.";
      }
    }
  }

  function openStudentAnswerReview(submission, answerKey, totalQuestions) {
    if (!assignmentAnswersReviewModal) return;

    const total = normalizeQuestionCount(totalQuestions);
    if (reviewStudentName) reviewStudentName.textContent = `${submission.student_name || "Şagird"} — Cavab Kartı`;
    if (reviewStudentMeta) {
      reviewStudentMeta.textContent = [
        submission.student_identifier || "—",
        `Təhvil: ${formatDateTime(submission.submitted_at)}`
      ].join(" • ");
    }
    if (reviewScore) reviewScore.textContent = `${submission.score || 0} / ${total}`;
    if (reviewCounts) {
      reviewCounts.textContent = `${submission.score || 0} düzgün, ${submission.incorrect_count || 0} səhv`;
    }
    if (reviewPercent) reviewPercent.textContent = `${submission.percentage || 0}%`;

    if (studentReviewGrid) {
      studentReviewGrid.replaceChildren();
      const userAnswers = submission.answers || {};

      for (let i = 1; i <= total; i += 1) {
        const key = String(i);
        const correctAns = String(answerKey[key] || "").toUpperCase();
        const studentAns = String(userAnswers[key] || "").toUpperCase();

        const isCorrect = Boolean(studentAns) && studentAns === correctAns;
        const isEmpty = !studentAns;

        const card = document.createElement("div");
        card.className = "review-q-card";
        if (isCorrect) card.classList.add("correct");
        else if (isEmpty) card.classList.add("empty");
        else card.classList.add("incorrect");

        const info = document.createElement("div");
        const qStrong = document.createElement("strong");
        qStrong.textContent = `Sual ${i}: `;
        info.appendChild(qStrong);
        info.appendChild(document.createTextNode("Açar: "));
        const keyEl = document.createElement("b");
        keyEl.textContent = correctAns || "—";
        info.appendChild(keyEl);
        card.appendChild(info);

        const badge = document.createElement("span");
        if (isCorrect) {
          badge.className = "review-badge correct";
          badge.textContent = `Düzgün: ${studentAns}`;
        } else if (isEmpty) {
          badge.className = "review-badge empty";
          badge.textContent = "Boş";
        } else {
          badge.className = "review-badge incorrect";
          badge.textContent = `Səhv: ${studentAns}`;
        }
        card.appendChild(badge);

        studentReviewGrid.appendChild(card);
      }
    }

    openModal(assignmentAnswersReviewModal);
  }

  /* ------------------------------------------------------------------
     21. ŞAGİRD İSTƏKLƏRİ
     ------------------------------------------------------------------ */
  async function loadJoinRequests() {
    try {
      const res = await fetchWithAuth("/api/v1/tutor/requests");
      if (!res || !res.ok) {
        renderJoinRequests([]);
        return;
      }
      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : payload.requests || [];
      if (tabRequestsCount) {
        tabRequestsCount.textContent = list.length;
        tabRequestsCount.classList.toggle("has-alert", list.length > 0);
      }
      renderJoinRequests(list);
    } catch (err) {
      console.warn("Load requests warning:", err);
      renderJoinRequests([]);
    }
  }

  function renderJoinRequests(requests) {
    if (!requestsGrid) return;
    requestsGrid.replaceChildren();
    const list = Array.isArray(requests) ? requests : [];

    if (list.length === 0) {
      if (requestsEmptyState) requestsEmptyState.classList.remove("hidden");
      requestsGrid.classList.add("hidden");
      return;
    }

    if (requestsEmptyState) requestsEmptyState.classList.add("hidden");
    requestsGrid.classList.remove("hidden");

    list.forEach((req) => {
      const card = document.createElement("article");
      card.className = "request-card";

      const header = document.createElement("div");
      header.className = "request-card-header";

      const nameEl = document.createElement("h3");
      nameEl.className = "request-student-name";
      nameEl.textContent = req.student_name || "Şagird";

      const timeEl = document.createElement("span");
      timeEl.className = "request-time-badge";
      timeEl.textContent = req.created_at
        ? new Date(req.created_at).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit" })
        : "Yeni";

      header.append(nameEl, timeEl);
      card.appendChild(header);

      const details = document.createElement("div");
      details.className = "request-details";
      details.appendChild(
        makeDetailRow("Sinif", req.student_grade ? `${req.student_grade}-ci sinif` : "Qeyd edilməyib")
      );
      details.appendChild(makeDetailRow("Əlaqə", req.student_identifier || "—"));
      card.appendChild(details);

      const actions = document.createElement("div");
      actions.className = "request-actions";

      const btnAccept = document.createElement("button");
      btnAccept.type = "button";
      btnAccept.className = "btn btn-primary btn-sm";
      btnAccept.textContent = "Qəbul et";
      btnAccept.addEventListener("click", () => acceptJoinRequest(req.id, req.student_name));

      const btnReject = document.createElement("button");
      btnReject.type = "button";
      btnReject.className = "btn btn-ghost btn-sm text-danger";
      btnReject.textContent = "Rədd et";
      btnReject.addEventListener("click", () => rejectJoinRequest(req.id, req.student_name));

      actions.append(btnAccept, btnReject);
      card.appendChild(actions);
      requestsGrid.appendChild(card);
    });
  }

  function makeDetailRow(label, value) {
    const row = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.appendChild(strong);
    row.appendChild(document.createTextNode(value));
    return row;
  }

  async function acceptJoinRequest(requestId, studentName) {
    try {
      const res = await fetchWithAuth(`/api/v1/tutor/requests/${encodeURIComponent(requestId)}/accept`, {
        method: "POST"
      });
      if (!res || !res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "İstəyi qəbul etmək mümkün olmadı.");
      }
      showToast(`${studentName || "Şagird"} qrupa qəbul edildi.`, "success");
      await Promise.allSettled([loadDashboard(), loadJoinRequests()]);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function rejectJoinRequest(requestId, studentName) {
    const confirmed = await askConfirm({
      title: "Qoşulma istəyini rədd et",
      message: `${studentName || "Şagirdin"} qoşulma istəyini rədd etmək istədiyinizə əminsiniz?`,
      confirmLabel: "Rədd et"
    });
    if (!confirmed) return;

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/requests/${encodeURIComponent(requestId)}/reject`, {
        method: "POST"
      });
      if (!res || !res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "İstəyi rədd etmək mümkün olmadı.");
      }
      showToast("İstək rədd edildi.", "info");
      await loadJoinRequests();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  /* ------------------------------------------------------------------
     22. PROFİL YENİLƏMƏ FORMALARI
     ------------------------------------------------------------------ */
  function validateProfileFields(first, last, subject) {
    if (!first || first.length < 2) return "Ad ən azı 2 simvol olmalıdır.";
    if (!last || last.length < 2) return "Soyad ən azı 2 simvol olmalıdır.";
    if (!subject || subject.length < 2) return "Tədris fənni ən azı 2 simvol olmalıdır.";
    return null;
  }

  async function saveProfile({ first, last, subject }, feedbackEl, btnId) {
    const error = validateProfileFields(first, last, subject);
    if (error) {
      if (feedbackEl) {
        feedbackEl.className = "auth-alert error";
        feedbackEl.textContent = error;
        feedbackEl.classList.remove("hidden");
      }
      return false;
    }

    const btn = btnId ? $(btnId) : null;
    setButtonLoading(btn, true);

    try {
      const res = await fetchWithAuth("/api/v1/tutor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last, subject })
      });

      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        throw new Error(err.detail || "Məlumatları saxlamaq mümkün olmadı.");
      }

      if (feedbackEl) {
        feedbackEl.className = "auth-alert success";
        feedbackEl.textContent = "Məlumatlar uğurla saxlanıldı.";
        feedbackEl.classList.remove("hidden");
        setTimeout(() => feedbackEl.classList.add("hidden"), 3500);
      }
      showToast("Profil məlumatları yeniləndi.", "success");
      await loadDashboard();
      return true;
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.className = "auth-alert error";
        feedbackEl.textContent = err.message;
        feedbackEl.classList.remove("hidden");
      }
      return false;
    } finally {
      setButtonLoading(btn, false);
    }
  }

  async function changePassword() {
    const current = profilePassCurrent ? profilePassCurrent.value : "";
    const next = profilePassNew ? profilePassNew.value : "";
    const confirmVal = profilePassConfirm ? profilePassConfirm.value : "";

    const fail = (msg) => {
      if (!profilePassFeedback) return;
      profilePassFeedback.className = "auth-alert error";
      profilePassFeedback.textContent = msg;
      profilePassFeedback.classList.remove("hidden");
    };

    if (!current || !next) {
      fail("Cari və yeni şifrəni daxil edin.");
      return;
    }
    if (next.length < 8) {
      fail("Yeni şifrə ən azı 8 simvol olmalıdır.");
      return;
    }
    if (next !== confirmVal) {
      fail("Yeni şifrələr uyğun gəlmir.");
      return;
    }
    if (next === current) {
      fail("Yeni şifrə cari şifrədən fərqli olmalıdır.");
      return;
    }

    const btn = $("btn-save-profile-pass");
    setButtonLoading(btn, true);

    try {
      const res = await fetchWithAuth("/api/v1/tutor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next })
      });

      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        throw new Error(err.detail || "Şifrəni yeniləmək mümkün olmadı.");
      }

      if (formProfilePanePassword) formProfilePanePassword.reset();
      if (profilePassFeedback) {
        profilePassFeedback.className = "auth-alert success";
        profilePassFeedback.textContent = "Şifrəniz uğurla yeniləndi.";
        profilePassFeedback.classList.remove("hidden");
        setTimeout(() => profilePassFeedback.classList.add("hidden"), 3500);
      }
      showToast("Şifrə yeniləndi.", "success");
    } catch (err) {
      fail(err.message);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  /* ------------------------------------------------------------------
     23. ÇIXIŞ
     ------------------------------------------------------------------ */
  const handleLogout = async () => {
    try {
      await fetchWithAuth("/api/v1/auth/logout", { method: "POST" });
    } catch (_) { /* lokal olaraq token təmizlənir */ }
    clearStoredTokens();
    window.location.href = "auth.html";
  };

  /* ------------------------------------------------------------------
     24. EVENT REGİSTRASİYASI
     ------------------------------------------------------------------ */

  // Drawer
  if (btnToggleTutorProfile) btnToggleTutorProfile.addEventListener("click", openTutorDrawer);
  if (headerProfilePill) {
    headerProfilePill.addEventListener("click", openTutorDrawer);
    headerProfilePill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTutorDrawer();
      }
    });
  }
  if (btnCloseTutorDrawer) btnCloseTutorDrawer.addEventListener("click", closeTutorDrawer);
  if (tutorDrawerOverlay) tutorDrawerOverlay.addEventListener("click", closeTutorDrawer);

  if (drawerNavStudents) drawerNavStudents.addEventListener("click", () => { closeTutorDrawer(); switchTab("students"); });
  if (drawerNavRequests) drawerNavRequests.addEventListener("click", () => { closeTutorDrawer(); switchTab("requests"); });
  if (drawerNavAssignments) drawerNavAssignments.addEventListener("click", () => { closeTutorDrawer(); switchTab("assignments"); });
  if (drawerNavAi) drawerNavAi.addEventListener("click", () => { closeTutorDrawer(); switchTab("ai"); });
  if (drawerNavProfile) drawerNavProfile.addEventListener("click", () => { closeTutorDrawer(); switchTab("profile"); });

  // Kod kopyalama (Vahid funksiya — əvvəlki təkrar listener xətası aradan qaldırıldı)
  [btnCopyCode, btnDrawerCopyCode, btnProfilePaneCopyCode].forEach((btn) => {
    if (btn) btn.addEventListener("click", copy4DigitCode);
  });

  // Tablar
  if (tabBtnStudents) tabBtnStudents.addEventListener("click", () => switchTab("students"));
  if (tabBtnRequests) tabBtnRequests.addEventListener("click", () => switchTab("requests"));
  if (tabBtnAssignments) tabBtnAssignments.addEventListener("click", () => switchTab("assignments"));
  if (tabBtnExams) tabBtnExams.addEventListener("click", () => switchTab("exams"));
  if (tabBtnAi) tabBtnAi.addEventListener("click", () => switchTab("ai"));
  if (tabBtnProfile) tabBtnProfile.addEventListener("click", () => switchTab("profile"));
  if (linkGotoRequests) {
    linkGotoRequests.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("requests");
    });
  }

  // Şagird filtrləri
  if (studentSearchInput) {
    studentSearchInput.addEventListener("input", () => {
      clearTimeout(searchDebounceId);
      searchDebounceId = setTimeout(refreshStudentFilter, 180);
    });
  }
  if (studentStatusFilter) {
    studentStatusFilter.addEventListener("change", refreshStudentFilter);
  }
  if (btnResetStudentFilters) {
    btnResetStudentFilters.addEventListener("click", () => {
      if (studentSearchInput) studentSearchInput.value = "";
      if (studentStatusFilter) studentStatusFilter.value = "all";
      refreshStudentFilter();
    });
  }

  // Şagird detalları modalları
  if (btnCloseDetailModal) btnCloseDetailModal.addEventListener("click", () => closeModal(studentDetailModal));
  if (btnCloseDetailModalBtn) btnCloseDetailModalBtn.addEventListener("click", () => closeModal(studentDetailModal));
  if (btnCloseSubmissionsModal) btnCloseSubmissionsModal.addEventListener("click", () => closeModal(assignmentSubmissionsModal));
  if (btnCloseSubmissionsModalBtn) btnCloseSubmissionsModalBtn.addEventListener("click", () => closeModal(assignmentSubmissionsModal));
  if (btnCloseReviewModal) btnCloseReviewModal.addEventListener("click", () => closeModal(assignmentAnswersReviewModal));
  if (btnCloseReviewModalBtn) btnCloseReviewModalBtn.addEventListener("click", () => closeModal(assignmentAnswersReviewModal));

  // Şagird əlavə etmə
  if (btnOpenModal) {
    btnOpenModal.addEventListener("click", () => {
      if (modalFeedback) {
        modalFeedback.classList.add("hidden");
        modalFeedback.textContent = "";
      }
      if (addStudentForm) addStudentForm.reset();
      openModal(addStudentModal);
    });
  }
  const closeAddStudentModal = () => {
    closeModal(addStudentModal);
    if (modalFeedback) {
      modalFeedback.classList.add("hidden");
      modalFeedback.textContent = "";
    }
  };
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeAddStudentModal);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeAddStudentModal);

  if (addStudentForm) {
    addStudentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const identifier = studentIdentifierInput ? studentIdentifierInput.value.trim() : "";
      const err = validateIdentifier(identifier);
      if (err) {
        setFeedback(modalFeedback, err, false);
        if (studentIdentifierInput) studentIdentifierInput.focus();
        return;
      }

      setButtonLoading(btnSubmitAddStudent, true);
      try {
        const res = await fetchWithAuth("/api/v1/tutor/students/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier })
        });

        if (!res) throw new Error("Serverlə əlaqə qurmaq mümkün olmadı.");

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Şagird əlavə edilərkən xəta baş verdi.");

        setFeedback(modalFeedback, data.message || "Şagird uğurla qrupa əlavə edildi!", true);
        if (addStudentForm) addStudentForm.reset();
        showToast("Şagird qrupa əlavə edildi.", "success");

        setTimeout(async () => {
          closeAddStudentModal();
          await loadDashboard();
        }, 1000);
      } catch (err) {
        setFeedback(modalFeedback, err.message, false);
      } finally {
        setButtonLoading(btnSubmitAddStudent, false);
      }
    });
  }

  // Cavab açarı
  if (asgQCountInput) {
    asgQCountInput.addEventListener("input", () => renderAnswerKeyGrid(asgQCountInput.value));
  }
  if (btnClearAnswerKey) {
    btnClearAnswerKey.addEventListener("click", () => {
      answerKeyMap = {};
      renderAnswerKeyGrid(asgQCountInput ? asgQCountInput.value : 25);
    });
  }

  // PDF dropzone
  if (pdfDropzone) {
    const openPicker = () => { if (asgPdfFileInput) asgPdfFileInput.click(); };
    pdfDropzone.addEventListener("click", openPicker);
    pdfDropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    });
    pdfDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      pdfDropzone.classList.add("dragover");
    });
    pdfDropzone.addEventListener("dragleave", () => pdfDropzone.classList.remove("dragover"));
    pdfDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      pdfDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handlePdfFileSelect(e.dataTransfer.files[0]);
      }
    });
  }
  if (asgPdfFileInput) {
    asgPdfFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) handlePdfFileSelect(e.target.files[0]);
    });
  }
  if (btnRemovePdf) {
    btnRemovePdf.addEventListener("click", () => {
      currentPdfBase64 = null;
      if (asgPdfFileInput) asgPdfFileInput.value = "";
      if (pdfDropzone) pdfDropzone.classList.remove("hidden");
      if (pdfFileInfo) pdfFileInfo.classList.add("hidden");
      if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = true;
      hideCreateAsgError();
    });
  }

  // AI ilə cavab kartı
  if (btnAiExtractAnswers) {
    btnAiExtractAnswers.addEventListener("click", async () => {
      if (!currentPdfBase64) {
        showCreateAsgError("Əvvəlcə sınaq PDF faylını yükləyin.");
        return;
      }
      const qCount = normalizeQuestionCount(asgQCountInput ? asgQCountInput.value : 25);
      setButtonLoading(btnAiExtractAnswers, true);
      showCreateAsgInfo("Süni intellekt PDF sənədini analiz edir və doğru cavab kartını hazırlayır...");

      try {
        const response = await fetchWithAuth("/api/v1/tutor/assignments/ai-generate-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: currentPdfBase64, question_count: qCount })
        });

        if (!response) throw new Error("Serverlə əlaqə qurmaq mümkün olmadı.");
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Süni intellekt cavabları hazırlaya bilmədi.");
        }

        const data = await response.json();
        const extracted = data.answers || {};

        answerKeyMap = {};
        for (let i = 1; i <= qCount; i += 1) {
          const val = String(extracted[String(i)] || "").trim().toUpperCase();
          if (ANSWER_OPTIONS.includes(val)) answerKeyMap[String(i)] = val;
        }

        renderAnswerKeyGrid(qCount);
        showCreateAsgSuccess(
          `${Object.keys(answerKeyMap).length} sual üçün cavab açarı təyin edildi. Lazım gələrsə variantları dəyişə bilərsiniz.`
        );
      } catch (err) {
        console.error("AI answer extraction error:", err);
        showCreateAsgError(err.message || "Analiz uğursuz oldu. Cavabları əl ilə qeyd edə bilərsiniz.");
      } finally {
        setButtonLoading(btnAiExtractAnswers, false);
      }
    });
  }

  // Sınaq yaratma
  [btnHeroCreateAsg, btnOpenCreateAsg, btnEmptyCreateAsg].forEach((btn) => {
    if (btn) btn.addEventListener("click", openCreateAssignmentModal);
  });
  if (btnCloseCreateAsgModal) btnCloseCreateAsgModal.addEventListener("click", closeCreateAssignmentModal);
  if (btnCancelCreateAsg) btnCancelCreateAsg.addEventListener("click", closeCreateAssignmentModal);

  if (createAssignmentForm) {
    createAssignmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideCreateAsgError();

      const title = (asgTitleInput ? asgTitleInput.value : "").trim();
      const qCount = normalizeQuestionCount(asgQCountInput ? asgQCountInput.value : 25);
      const duration = normalizeQuestionCount(asgDurationInput ? asgDurationInput.value : 60);

      if (title.length < 3) {
        showCreateAsgError("Sınaq adı ən azı 3 simvol olmalıdır.");
        return;
      }
      if (!currentPdfBase64) {
        showCreateAsgError("Zəhmət olmasa sınaq PDF faylını yükləyin.");
        return;
      }
      if (Object.keys(answerKeyMap).length === 0) {
        showCreateAsgError("Doğru cavab kartında ən azı 1 sualın cavabını qeyd edin.");
        return;
      }

      setButtonLoading(btnSubmitCreateAsg, true);
      try {
        const res = await fetchWithAuth("/api/v1/tutor/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            pdf_url: currentPdfBase64,
            answer_key: answerKeyMap,
            question_count: qCount,
            duration_minutes: duration
          })
        });

        if (!res || !res.ok) {
          const err = res ? await res.json().catch(() => ({})) : {};
          throw new Error(err.detail || "Sınaq yaradılarkən xəta baş verdi.");
        }

        const data = await res.json();
        const assignmentId = data.assignment_id || (data.assignment && data.assignment.id) || "";
        closeCreateAssignmentModal();
        showToast("Sınaq uğurla yaradıldı.", "success");
        openShareModal(assignmentId);
        await loadAssignments();
      } catch (err) {
        console.error("Create assignment error:", err);
        showCreateAsgError(err.message || "Sınaq yaradılarkən xəta baş verdi.");
      } finally {
        setButtonLoading(btnSubmitCreateAsg, false);
      }
    });
  }

  // Paylaşma linki
  if (btnCloseShareModal) btnCloseShareModal.addEventListener("click", () => closeModal(shareAssignmentModal));
  if (btnDoneShareModal) btnDoneShareModal.addEventListener("click", () => closeModal(shareAssignmentModal));
  if (btnCopyShareLink) {
    btnCopyShareLink.addEventListener("click", async () => {
      const url = shareLinkInput ? shareLinkInput.value : "";
      if (!url) return;
      const ok = await copyText(url);
      if (ok) {
        flashButtonText(btnCopyShareLink, "Kopyalandı");
        if (shareCopyFeedback) {
          shareCopyFeedback.classList.remove("hidden");
          setTimeout(() => shareCopyFeedback.classList.add("hidden"), 3000);
        }
      } else {
        showToast("Kopyalama mümkün olmadı. Linki əl ilə seçib kopyalayın.", "error");
        if (shareLinkInput) shareLinkInput.select();
      }
    });
  }

  // AI söhbət
  if (aiChatForm) {
    aiChatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitAIQuery(aiQueryInput ? aiQueryInput.value : "");
    });
  }
  if (aiQueryInput) {
    aiQueryInput.addEventListener("input", () => {
      updateCharCounter();
      autoGrowInput();
    });
    aiQueryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitAIQuery(aiQueryInput.value);
      }
    });
  }
  aiChipButtons.forEach((chip) => {
    chip.addEventListener("click", () => {
      const query = chip.getAttribute("data-query");
      if (!query) return;
      switchTab("ai");
      submitAIQuery(query);
    });
  });
  if (btnClearAiChat) {
    btnClearAiChat.addEventListener("click", () => {
      aiConversationHistory = [];
      resetChatToWelcome("Söhbət təmizləndi. Qrupunuz, sınaqlar və ya şagirdlərinizin nəticələri barədə yeni sual verə bilərsiniz.");
      showToast("Söhbət təmizləndi.", "info");
    });
  }

  // Profil formaları
  if (tutorProfileEditForm) {
    tutorProfileEditForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveProfile(
        {
          first: editTutorName ? editTutorName.value.trim() : "",
          last: editTutorSurname ? editTutorSurname.value.trim() : "",
          subject: editTutorSubject ? editTutorSubject.value.trim() : ""
        },
        profileEditFeedback,
        "btn-save-tutor-profile"
      );
    });
  }

  if (formProfilePaneInfo) {
    formProfilePaneInfo.addEventListener("submit", (e) => {
      e.preventDefault();
      saveProfile(
        {
          first: profileInputFirstname ? profileInputFirstname.value.trim() : "",
          last: profileInputLastname ? profileInputLastname.value.trim() : "",
          subject: profileInputSubject ? profileInputSubject.value.trim() : ""
        },
        profilePaneFeedback,
        "btn-save-profile-pane"
      );
    });
  }

  if (formProfilePanePassword) {
    formProfilePanePassword.addEventListener("submit", (e) => {
      e.preventDefault();
      changePassword();
    });
  }

  // Şagird istəkləri
  if (btnRefreshRequests) btnRefreshRequests.addEventListener("click", loadJoinRequests);

  // Çıxış
  if (btnLogout) btnLogout.addEventListener("click", handleLogout);
  if (btnDrawerLogout) btnDrawerLogout.addEventListener("click", handleLogout);
  if (btnProfilePaneLogout) btnProfilePaneLogout.addEventListener("click", handleLogout);

  /* ------------------------------------------------------------------
     25. İLK YÜKLƏMƏ
     ------------------------------------------------------------------ */
  resetChatToWelcome();
  updateCharCounter();
  autoGrowInput();
  switchTab("students");

  Promise.allSettled([loadDashboard(), loadAssignments(), loadJoinRequests()]);
});
