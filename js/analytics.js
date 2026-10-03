"use strict";

/*
 * ANALİTİKA SƏHİFƏSİ
 *
 * TƏHLÜKƏSİZLİK (.clinerules §1–§3):
 *   - Bütün mətn `textContent` ilə yazılır. `innerHTML`/`outerHTML`/
 *     `document.write` HƏR YERDƏ qadağandır — AI cavabları və sual
 *     mətnləri istifadəçi/DB məlumatından yaranır (XSS riski).
 *   - Heç bir açar və ya cədvəl adı frontend-də yoxdur.
 *   - Token yalnız sessionStorage-dan oxunur.
 *   - Səhifə daxili "göz yorucu" təkrarlanan mətnlərdən azad edilmişdir;
 *     məlumat yoxdursa istifadəçi BOŞ PANEL deyil, kompakt boş vəziyyət
 *     kartı görür (dərs kitabı prensipi: heç vaxt "ölü" sahə yoxdur).
 *
 * FUNKSİONAL:
 *   1) `/api/v1/analytics/me`              → metrikalar + fənn/mövzu statistikası.
 *   2) `/api/v1/analytics/attempts`        → şagirdin BÜTÜN cəhdləri (axtarış + filtr).
 *   3) `/api/v1/analytics/attempts/{id}`   → cəhd təfsilatı: sual üzrə səhv/boş/düzgün.
 *   4) `/api/v1/analytics/attempts/{id}/ai-analysis` (GET)  → SAXLANMIŞ analiz (pulsuz).
 *   5) `/api/v1/analytics/attempts/{id}/ai-analysis` (POST) → analiz yarat/yenilə.
 *   6) `/api/v1/analytics/overall/ai-analysis` → ümumi analiz (GET cache / POST yarat).
 */

const PROD_API_BASE_URL = "https://gradient-backend-fam5.onrender.com";

/*
 * API ünvanının seçilməsi.
 *  - `server.js` proxy işləyirsə (http:// + localhost deyil) nisbi yol istifadə olunur.
 *  - Production frontend və ya `file://`/Live Server rejimlərində birbaşa backend.
 * TƏHLÜKƏSİZLİK: burada açar/cədvəl adı YOXDUR — yalnız public API domeni.
 * Həqiqi məlumat sətri həmişə FastAPI tərəfdə `.eq("student_id", ...)` ilə qorunur.
 */
const host = typeof window !== "undefined" ? window.location.hostname : "";
const isLocalDev =
  host === "" ||
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1";

const isProductionFrontend =
  host === "phoenixaze.github.io" ||
  host.endsWith("github.io") ||
  host === "gradient.az" ||
  host === "www.gradient.az";

const useProxy =
  typeof window !== "undefined" &&
  window.location.protocol === "http:" &&
  !isLocalDev;

const API_BASE_URL = (isProductionFrontend || !useProxy) ? PROD_API_BASE_URL : "";

document.addEventListener("DOMContentLoaded", async () => {
  // ==========================================================================
  // DOM REFERANSLARI
  // ==========================================================================
  const skeletonEl = document.getElementById("analytics-skeleton");
  const emptyEl = document.getElementById("analytics-empty");
  const contentEl = document.getElementById("analytics-content");

  const valAccuracy = document.getElementById("val-accuracy");
  const valTotalExams = document.getElementById("val-total-exams");
  const valCorrect = document.getElementById("val-correct");
  const valWrong = document.getElementById("val-wrong");

  const diagnosisText = document.getElementById("diagnosis-text");
  const subjectListContainer = document.getElementById("subject-list-container");
  const topicListContainer = document.getElementById("topic-list-container");

  const attemptsList = document.getElementById("attempts-list");
  const attemptsSkeleton = document.getElementById("attempts-skeleton");
  const attemptsNone = document.getElementById("attempts-none");
  const searchInput = document.getElementById("attempt-search");
  const filterSelect = document.getElementById("attempt-filter");

  const btnOverall = document.getElementById("btn-overall-analysis");
  const btnOverallRefresh = document.getElementById("btn-overall-refresh");
  const overallLoading = document.getElementById("ai-overview-loading");
  const overallResult = document.getElementById("ai-overview-result");
  const overallMeta = document.getElementById("ai-overview-meta");

  const detailModal = document.getElementById("detail-modal");
  const detailTitle = document.getElementById("detail-modal-title");
  const detailSubtitle = document.getElementById("detail-modal-subtitle");
  const detailStats = document.getElementById("detail-stats");
  const detailLoading = document.getElementById("detail-loading");
  const detailQuestions = document.getElementById("detail-questions");
  const detailModelNote = document.getElementById("detail-model-note");
  const detailCloseBtn = document.getElementById("detail-modal-close");
  const detailDoneBtn = document.getElementById("detail-modal-done");
  const segAll = document.getElementById("seg-all");
  const segWrong = document.getElementById("seg-wrong");

  const modal = document.getElementById("ai-modal");
  const modalTitle = document.getElementById("ai-modal-title");
  const modalSubtitle = document.getElementById("ai-modal-subtitle");
  const modalContent = document.getElementById("ai-modal-content");
  const modalLoading = document.getElementById("ai-modal-loading");
  const modalModelNote = document.getElementById("ai-modal-model");
  const modalCloseBtn = document.getElementById("ai-modal-close");
  const modalDoneBtn = document.getElementById("ai-modal-done");

  const toastRegion = document.getElementById("toast-region");

  // AI imkanı backend-dən gəlir (açar server ENV-dədir).
  let aiAvailable = true;

  // ==========================================================================
  // TOKEN KÖMƏKÇİLƏRİ
  // ==========================================================================
  function getStoredToken() {
    try {
      return sessionStorage.getItem("gradient_access_token") || "";
    } catch (_) {
      return "";
    }
  }

  function getStoredRefreshToken() {
    try {
      return localStorage.getItem("gradient_refresh_token") ||
        sessionStorage.getItem("gradient_refresh_token") || "";
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
    } catch (_) { /* storage bağlıdır — sessiya sürədə davam edir */ }
  }

  function clearStoredTokens() {
    try {
      sessionStorage.removeItem("gradient_access_token");
      localStorage.removeItem("gradient_access_token");
      sessionStorage.removeItem("gradient_refresh_token");
      localStorage.removeItem("gradient_refresh_token");
    } catch (_) {}
  }

  async function fetchWithAuth(endpoint, options = {}) {
    options.credentials = "include";
    options.headers = options.headers || {};

    const token = getStoredToken();
    if (token && !options.headers["Authorization"]) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch (err) {
      console.error("Şəbəkə xətası:", err);
      return null;
    }

    if (response && response.status === 401) {
      try {
        const rfToken = getStoredRefreshToken();
        const refreshHeaders = {};
        if (rfToken) {
          refreshHeaders["x-refresh-token"] = rfToken;
          refreshHeaders["Authorization"] = `Bearer ${rfToken}`;
        }

        const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: refreshHeaders,
          credentials: "include"
        });

        if (refreshRes && refreshRes.ok) {
          const rfData = await refreshRes.json().catch(() => ({}));
          if (rfData && rfData.access_token) {
            setStoredTokens(rfData.access_token, rfData.refresh_token);
            options.headers["Authorization"] = `Bearer ${rfData.access_token}`;
          }
          response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        } else {
          clearStoredTokens();
          window.location.href = "auth.html";
          return null;
        }
      } catch (e) {
        clearStoredTokens();
        window.location.href = "auth.html";
        return null;
      }
    }

    return response;
  }

  // ==========================================================================
  // KÖMƏKÇİ UI FUNKSİYALARI
  // ==========================================================================

  function showToast(message, type) {
    if (!toastRegion) return;
    const variant = ["success", "error", "warning"].includes(type) ? type : "info";
    const toast = document.createElement("div");
    toast.className = `toast toast-${variant}`;
    toast.textContent = String(message || "");
    toastRegion.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  /** TƏHLÜKƏSİZ DOM yaradıcı — mətn yalnız `textContent` ilə yazılır. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function makeButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /**
   * `.btn-ai` düyməsinin mətn hissəsini dəyişir, SVG ikonu saxlayır.
   * @param {HTMLElement} btn - makeAiButton() ilə yaradılmış düymə
   * @param {string} label - yeni mətn (textContent → XSS yoxdur)
   */
  function setAiButtonLabel(btn, label) {
    if (!btn) return;
    const icon = btn.querySelector(".btn-ai-icon");
    if (icon) {
      btn.replaceChildren(icon, document.createTextNode(String(label || "")));
    } else {
      btn.textContent = String(label || "");
    }
  }

  /**
   * AI analiz düyməsi — `makeButton` + inline SVG nişanı.
   * TƏHLÜKƏSİZLİK: SVG `createElementNS` ilə qurulur, heç bir dəyişən
   * interpolasiya edilmir (innerHTML YOXDUR). .clinerules §2 (XSS).
   */
  function makeAiButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ai btn-sm";

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "btn-ai-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // Spark (parıltı) — emoji istifadəsi olmadan vizual nişan (.clinerules §4)
    path.setAttribute("d", "M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3z");
    icon.appendChild(path);

    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(label));
    btn.addEventListener("click", onClick);
    return btn;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("az-AZ", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("az-AZ", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function accuracyClass(pct) {
    if (pct >= 75) return "is-success";
    if (pct >= 50) return "is-warning";
    return "is-danger";
  }

  function statusLabel(status) {
    if (status === "correct") return "Düzgün";
    if (status === "incorrect") return "Səhv";
    if (status === "empty") return "Boş";
    return "Qeyd yoxdur";
  }

  /**
   * Model cavabının forması dəyişə bilər → normalize.
   * Heç vaxt `item.name` kimi təhlükəli sahəyə birbaşa toxunulmur.
   */
  function normalizeItems(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (typeof item === "string") return { text: item };
        if (item && typeof item === "object") return item;
        return null;
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  function itemTitle(item) {
    if (typeof item === "string") return item;
    return item.topic || item.subject || item.title || item.name || item.text || "—";
  }

  function itemNote(item) {
    if (typeof item === "string") return "";
    return item.note || item.reason || item.issue || item.action || item.advice || "";
  }

  function priorityClass(priority) {
    const p = String(priority || "").toLowerCase();
    if (p === "high") return "is-high";
    if (p === "medium") return "is-medium";
    if (p === "low") return "is-low";
    return "";
  }

  // ==========================================================================
  // AI NƏTİCƏNİN RENDER EDİLMƏSİ
  // ==========================================================================
  function renderAnalysisInto(container, analysis) {
    container.replaceChildren();
    if (!analysis || typeof analysis !== "object") {
      container.appendChild(el("p", "ai-empty", "Analiz məlumatı boşdur."));
      return;
    }

    if (analysis.headline) {
      container.appendChild(el("h3", "ai-headline", analysis.headline));
    }
    if (analysis.summary) {
      container.appendChild(el("p", "ai-summary", analysis.summary));
    }

    // Güclü tərəflər
    const strong = normalizeItems(analysis.strong_topics);
    if (strong.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Güclü tərəflər"));
      const list = el("ul", "ai-list is-positive");
      strong.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(el("span", "ai-list-title", itemTitle(item)));
        const note = itemNote(item);
        if (note) li.appendChild(el("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Gücləndirilməsi lazım olan mövzular
    const focusTopics = normalizeItems(analysis.focus_topics || analysis.weak_topics);
    if (focusTopics.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Zəif mövzular"));
      const list = el("ul", "ai-list is-warning");
      focusTopics.forEach((item) => {
        const li = document.createElement("li");
        const head = el("div", "ai-list-head");
        head.appendChild(el("span", "ai-list-title", itemTitle(item)));

        const pct = Number(item.accuracy_pct);
        if (Number.isFinite(pct) && pct >= 0) {
          head.appendChild(el("span", "ai-badge " + priorityClass(item.priority), `${Math.round(pct)}%`));
        } else if (item.priority) {
          head.appendChild(el("span", "ai-badge " + priorityClass(item.priority), String(item.priority)));
        }
        li.appendChild(head);

        const note = itemNote(item);
        if (note) li.appendChild(el("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Ən çətin fənnlər (yalnız ümumi analizdə gəlir)
    const focusSubjects = normalizeItems(analysis.focus_subjects);
    if (focusSubjects.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Fənnlər"));
      const list = el("ul", "ai-list");
      focusSubjects.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(el("span", "ai-list-title", itemTitle(item)));
        const note = itemNote(item);
        if (note) li.appendChild(el("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Təkrarlanan səhvlər (per-cəhd analizlərdə)
    const mistakes = normalizeItems(analysis.mistakes);
    if (mistakes.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Səhvləriniz"));
      const list = el("ul", "ai-list is-danger");
      mistakes.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(el("span", "ai-list-title", itemTitle(item)));
        const issue = item && item.issue ? item.issue : "";
        const advice = item && item.advice ? item.advice : "";
        if (issue) li.appendChild(el("span", "ai-list-note", issue));
        if (advice) li.appendChild(el("span", "ai-list-advice", advice));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Tövsiyələr
    const recs = normalizeItems(analysis.recommendations);
    if (recs.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Tövsiyələr"));
      const list = el("ol", "ai-list ai-list-ordered");
      recs.forEach((item) => {
        const li = document.createElement("li");
        const note = itemNote(item);
        li.appendChild(el("span", "ai-list-note", itemTitle(item) + (note ? ` — ${note}` : "")));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Öyrənmə planı
    const plan = normalizeItems(analysis.study_plan || analysis.weekly_plan);
    if (plan.length) {
      const block = el("div", "ai-block");
      block.appendChild(el("h4", "ai-block-title", "Plan"));
      const list = el("ol", "ai-list ai-list-ordered");
      plan.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(el("span", "ai-list-note", itemTitle(item)));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Heç nə göstərilə bilməz — istifadəçi boş panel görməməlidir
    if (!container.hasChildNodes()) {
      container.appendChild(el("p", "ai-empty", "Analiz çox qısa oldu. Yenidən cəhd edin."));
    }
  }

  // ==========================================================================
  // MODALLAR
  // ==========================================================================
  let lastFocusedEl = null;

  function lockScroll(lock) {
    document.body.style.overflow = lock ? "hidden" : "";
  }

  /**
   * Model adı göstərilmədiyi üçün alt-not elementləri həmişə boş qalır.
   * Elementlər HTML-də saxlanılır (CSS/modal quruluşu qırılmır), sadəcə
   * mətn yazılmır. `null` halında səhva yol verilməsin.
   */
  function clearModelNote() {
    if (modalModelNote) modalModelNote.textContent = "";
    if (detailModelNote) detailModelNote.replaceChildren();
  }

  function openModal(title, subtitle) {
    if (!modal) return;
    lastFocusedEl = document.activeElement;
    modalTitle.textContent = String(title || "AI Analiz");
    modalSubtitle.textContent = String(subtitle || "");
    modalContent.replaceChildren();
    modalLoading.classList.add("hidden");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    lockScroll(true);
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    modalContent.replaceChildren();
    clearModelNote();
    lockScroll(false);
    // Fokus idarəetməsi (a11y): modal bağlananda fokus əvvəlki düyməyə qayıdır
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
  }

  function openDetailModal(title, subtitle) {
    if (!detailModal) return;
    lastFocusedEl = document.activeElement;
    detailTitle.textContent = String(title || "Cəhd");
    detailSubtitle.textContent = String(subtitle || "");
    detailStats.replaceChildren();
    detailQuestions.replaceChildren();
    clearModelNote();
    detailLoading.classList.remove("hidden");
    detailModal.classList.remove("hidden");
    detailModal.setAttribute("aria-hidden", "false");
    lockScroll(true);
    if (detailCloseBtn) detailCloseBtn.focus();
  }

  function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.add("hidden");
    detailModal.setAttribute("aria-hidden", "true");
    detailQuestions.replaceChildren();
    lockScroll(false);
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute("data-close-modal") === "true") closeModal();
    });
  }
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalDoneBtn) modalDoneBtn.addEventListener("click", closeModal);

  if (detailModal) {
    detailModal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute("data-close-detail") === "true") closeDetailModal();
    });
  }
  if (detailCloseBtn) detailCloseBtn.addEventListener("click", closeDetailModal);
  if (detailDoneBtn) detailDoneBtn.addEventListener("click", closeDetailModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal && !modal.classList.contains("hidden")) closeModal();
    if (detailModal && !detailModal.classList.contains("hidden")) closeDetailModal();
  });

  // ==========================================================================
  // TAB İDARƏETMƏSİ
  // ==========================================================================
  const tabs = [
    { btn: document.getElementById("tab-attempts"), panel: document.getElementById("panel-attempts") },
    { btn: document.getElementById("tab-overview"), panel: document.getElementById("panel-overview") },
    { btn: document.getElementById("tab-topics"), panel: document.getElementById("panel-topics") },
    { btn: document.getElementById("tab-ai"), panel: document.getElementById("panel-ai") }
  ].filter((t) => t.btn && t.panel);

  function activateTab(index) {
    tabs.forEach((t, i) => {
      const active = i === index;
      t.btn.classList.toggle("is-active", active);
      t.btn.setAttribute("aria-selected", active ? "true" : "false");
      t.panel.classList.toggle("hidden", !active);
    });
    // URL hash ilə paylaşma (təkrar yükləmədə eyni tab açılır)
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `#${tabs[index].btn.id}`);
    }
  }

  tabs.forEach((t, i) => {
    t.btn.addEventListener("click", () => activateTab(i));
  });

  // ==========================================================================
  // SINAQ KARTLARININ RENDER EDİLMƏSİ
  // ==========================================================================
  let allAttempts = [];

  function visibleAttempts() {
    const term = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    const mode = filterSelect ? filterSelect.value : "all";

    return allAttempts.filter((a) => {
      if (mode === "mistakes" && !a.has_mistakes) return false;
      if (mode === "analyzed" && !a.has_ai_analysis) return false;
      if (!term) return true;
      return (
        String(a.title || "").toLowerCase().includes(term) ||
        String(a.subject || "").toLowerCase().includes(term)
      );
    });
  }

  function renderAttempts() {
    if (!attemptsList) return;
    attemptsList.replaceChildren();

    const rows = visibleAttempts();
    if (attemptsNone) attemptsNone.classList.toggle("hidden", rows.length > 0);

    rows.forEach((a) => {
      const card = el("article", "attempt-card");
      if (a.is_primary) card.classList.add("is-primary");

      // --- Başlıq sətri: ad + status nişanları ---
      const head = el("div", "attempt-card-head");

      const titleWrap = el("div", "attempt-card-title-wrap");
      const titleLink = el("h3", "attempt-card-title", a.title || "Sınaq");
      /*
        ƏLÇATANLIQ: `<h3>` semantik başlıq olaraq qalır, lakin düymə kimi işləyir
        → `role="button"` + `tabindex="0"` və Enter/Saxə dəstəyi (WCAG 2.1:
        hərəkətə klaviatura ilə də mümkün olmalıdır).
      */
      titleLink.setAttribute("role", "button");
      titleLink.setAttribute("tabindex", "0");
      const openDetail = () => openAttemptDetail(a.attempt_id, a);
      titleLink.addEventListener("click", openDetail);
      titleLink.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      });
      titleWrap.appendChild(titleLink);

      const chips = el("div", "chips");
      chips.appendChild(el("span", "chip", a.subject || "Digər"));
      chips.appendChild(
        el("span", "chip chip-quiet", a.attempt_no > 1 ? `${a.attempt_no}-cı cəhd` : "1-ci cəhd")
      );
      if (a.is_primary) chips.appendChild(el("span", "chip chip-quiet", "Əsas nəticə"));
      if (a.has_ai_analysis) {
        // ƏLÇATANLIQ: nişan kliklənə biləndir → `role="button"` + `tabindex` +
        // Enter/Saxə dəstəyi (yalnız siçanla deyil, klaviatura ilə də).
        const badge = el("span", "chip chip-ai", "AI analiz var");
        badge.setAttribute("role", "button");
        badge.setAttribute("tabindex", "0");
        const viewAi = () => viewCachedAnalysis(a);
        badge.addEventListener("click", viewAi);
        badge.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            viewAi();
          }
        });
        chips.appendChild(badge);
      }
      titleWrap.appendChild(chips);
      head.appendChild(titleWrap);

      const scoreBox = el("div", "attempt-card-score");
      scoreBox.appendChild(el("div", "score-value " + accuracyClass(a.percentage), `${a.percentage}%`));
      scoreBox.appendChild(el("div", "score-sub", `${a.score} / ${a.total_questions}`));
      head.appendChild(scoreBox);

      card.appendChild(head);

      // --- Statistika sətri: səhv / boş / tarix ---
      const meta = el("div", "attempt-card-meta");
      const wrong = Number(a.incorrect_count) || 0;
      const empty = Number(a.empty_count) || 0;
      if (wrong) meta.appendChild(el("span", "meta-item is-danger", `Səhv: ${wrong}`));
      if (empty) meta.appendChild(el("span", "meta-item is-warning", `Boş: ${empty}`));
      if (!wrong && !empty) meta.appendChild(el("span", "meta-item is-success", "Səhvsiz"));
      meta.appendChild(el("span", "meta-item", formatDate(a.created_at)));
      card.appendChild(meta);

      // --- Əməliyyatlar ---
      const actions = el("div", "attempt-card-actions");
      actions.appendChild(
        makeButton("Nəticələr", "btn btn-outline btn-sm", () => openAttemptDetail(a.attempt_id, a))
      );
      actions.appendChild(
        makeAiButton(
          a.has_ai_analysis ? "AI Analizi oxu" : "AI Analiz yarat",
          () => (a.has_ai_analysis ? viewCachedAnalysis(a) : createAnalysis(a))
        )
      );
      card.appendChild(actions);

      attemptsList.appendChild(card);
    });
  }

  if (searchInput) {
    let debounceId = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(renderAttempts, 150);
    });
  }
  if (filterSelect) filterSelect.addEventListener("change", renderAttempts);

  // ==========================================================================
  // CƏHD TƏFSİLATI — SƏHVLƏR
  // ==========================================================================
  let detailRows = [];
  let detailWrongOnly = false;

  function renderDetailQuestions() {
    if (!detailQuestions) return;
    detailQuestions.replaceChildren();

    const rows = detailWrongOnly
      ? detailRows.filter((q) => q.status === "incorrect" || q.status === "empty")
      : detailRows;

    if (rows.length === 0) {
      detailQuestions.appendChild(
        el("p", "ai-empty", detailWrongOnly
          ? "Bu cəhdə səhv yoxdur."
          : "Bu cəhd üçün sual təfsilatı yoxdur.")
      );
      return;
    }

    rows.forEach((q) => {
      const item = el("div", "q-item is-" + String(q.status || "unknown"));

      const head = el("div", "q-head");
      head.appendChild(el("span", "q-number", `${q.number}-ci sual`));
      head.appendChild(el("span", "q-status", statusLabel(q.status)));
      item.appendChild(head);

      if (q.text_preview) {
        item.appendChild(el("p", "q-text", q.text_preview));
      }

      item.appendChild(el("div", "q-tag", q.q_tag || "—"));

      const answers = el("div", "q-answers");
      const chosenWrap = el("span", "q-answer " + (q.status === "correct" ? "is-ok" : "is-bad"));
      chosenWrap.textContent = `Sizin cavabınız: ${q.chosen || "boş"}`;
      answers.appendChild(chosenWrap);

      if (q.correct) {
        const correctWrap = el("span", "q-answer is-ok", `Düzgün cavab: ${q.correct}`);
        answers.appendChild(correctWrap);
      }
      item.appendChild(answers);

      detailQuestions.appendChild(item);
    });
  }

  function setWrongOnly(value) {
    detailWrongOnly = Boolean(value);
    if (segAll) segAll.classList.toggle("is-active", !detailWrongOnly);
    if (segWrong) segWrong.classList.toggle("is-active", detailWrongOnly);
    renderDetailQuestions();
  }

  if (segAll) segAll.addEventListener("click", () => setWrongOnly(false));
  if (segWrong) segWrong.addEventListener("click", () => setWrongOnly(true));

  async function openAttemptDetail(attemptId, meta) {
    if (!attemptId) {
      showToast("Cəhd məlumatı tapılmadı.", "warning");
      return;
    }

    openDetailModal(
      meta ? meta.title : "Cəhd",
      meta && meta.attempt_no > 1 ? `${meta.attempt_no}-cı cəhd` : "1-ci cəhd"
    );

    const response = await fetchWithAuth(
      `/api/v1/analytics/attempts/${encodeURIComponent(attemptId)}`,
      { method: "GET" }
    );

    detailLoading.classList.add("hidden");

    if (!response || !response.ok) {
      detailQuestions.replaceChildren(
        el("p", "ai-empty", response
          ? "Cəhd təfsilatı yüklənmədi."
          : "Serverə qoşulmaq mümkün olmadı.")
      );
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      detailQuestions.replaceChildren(el("p", "ai-empty", "Cavab oxunmadı."));
      return;
    }

    // Başlıq metası server məlumatı ilə dəqiqləşdirilir (güvən: mənbə = backend)
    detailTitle.textContent = data.title || "Cəhd";
    detailSubtitle.textContent = `${data.subject || "Digər"} • ${formatDateTime(data.created_at)}`;

    // İstatistika zolaqları
    const stats = [
      { label: "Dəqiqlik", value: `${data.percentage}%`, cls: accuracyClass(data.percentage) },
      { label: "Düzgün", value: String(data.score), cls: "is-success" },
      { label: "Səhv", value: String(data.incorrect_count), cls: "is-danger" },
      { label: "Boş", value: String(data.empty_count), cls: "is-warning" }
    ];
    stats.forEach((s) => {
      const box = el("div", "detail-stat");
      box.appendChild(el("span", "detail-stat-value " + s.cls, s.value));
      box.appendChild(el("span", "detail-stat-label", s.label));
      detailStats.appendChild(box);
    });

    detailRows = Array.isArray(data.questions) ? data.questions : [];
    setWrongOnly(false);

    // AI analiz varsa, sağ altda "bəxş etmək" mümkün olsun (AI xərci etmədən)
    clearModelNote();
    if (detailModelNote && data.has_ai_analysis !== false && data.ai_analysis) {
      detailModelNote.appendChild(
        makeButton("AI analizini bəxş et", "btn btn-ghost btn-sm", () => {
          closeDetailModal();
          renderAnalysisInto(modalContent, data.ai_analysis);
          if (modal) {
            modalTitle.textContent = data.title || "AI Analiz";
            modalSubtitle.textContent = `Saxlanmış analiz • ${formatDateTime(data.ai_generated_at)}`;
            modalLoading.classList.add("hidden");
            modal.classList.remove("hidden");
            modal.setAttribute("aria-hidden", "false");
            lockScroll(true);
            if (modalCloseBtn) modalCloseBtn.focus();
          }
        })
      );
    }
  }

  // ==========================================================================
  // AI ANALİZ: CACHE-Lİ OXA / YENİDƏN YARAT
  // ==========================================================================
  async function viewCachedAnalysis(attempt) {
    if (!attempt.attempt_id) {
      showToast("Cəhd məlumatı tapılmadı.", "warning");
      return;
    }
    openModal(attempt.title || "AI Analiz", "Saxlanmış analiz");
    modalLoading.classList.add("hidden");

    const response = await fetchWithAuth(
      `/api/v1/analytics/attempts/${encodeURIComponent(attempt.attempt_id)}/ai-analysis`,
      { method: "GET" }
    );

    if (!response) {
      modalContent.replaceChildren(el("p", "ai-empty", "Serverə qoşulmaq mümkün olmadı."));
      return;
    }

    if (response.status === 404) {
      modalContent.replaceChildren(el("p", "ai-empty", "Bu cəhd üçün analiz yoxdur."));
      modalSubtitle.textContent = "Analiz yaradın";
      return;
    }

    if (!response.ok) {
      modalContent.replaceChildren(el("p", "ai-empty", "Analiz yüklənmədi."));
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.analysis) {
      modalContent.replaceChildren(el("p", "ai-empty", "Analiz məlumatı boşdur."));
      return;
    }

    renderAnalysisInto(modalContent, data.analysis);
    modalSubtitle.textContent = `Saxlanmış analiz • ${formatDateTime(data.generated_at)}`;
    // MƏHSUL ƏTRAFI (məxfilik / brendinq): AI modelinin adı istifadəçiyə
    // GÖSTƏRİLMİR — provider adı məhsul üzərində reklam təsiri yaradır və
    // texniki detallar istifadəçi üçün vacib deyil. Sahə yalnız server logunda qalır.
    clearModelNote();
  }

  async function createAnalysis(attempt, buttonEl) {
    if (!attempt.attempt_id) {
      showToast("Cəhd məlumatı tapılmadı.", "warning");
      return;
    }
    if (!aiAvailable) {
      showToast("AI xidməti hazırda konfiqurasiya edilməyib.", "warning");
      return;
    }

    openModal(attempt.title || "AI Analiz", "Analiz yaradılır");
    modalLoading.classList.remove("hidden");
    modalContent.replaceChildren();

    if (buttonEl) {
      buttonEl.disabled = true;
      // YALNIZ mətn düyəsi dəyişir — SVG ikon silinmir (textContent səhifəni
      // təmizləyərdi). `replaceChildren` təhlükəsizdir, xarici məlumat yoxdur.
      setAiButtonLabel(buttonEl, "Analiz gedir…");
    }

    try {
      const response = await fetchWithAuth(
        `/api/v1/analytics/attempts/${encodeURIComponent(attempt.attempt_id)}/ai-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false })
        }
      );

      if (!response) throw new Error("Serverə qoşulmaq mümkün olmadı.");
      if (response.status === 429) {
        throw new Error("Çox sayda sorğu göndərildi. Bir az gözləyin.");
      }
      if (!response.ok) {
        let message = "Analiz alına bilmədi.";
        try {
          const errData = await response.json().catch(() => ({}));
          if (errData && typeof errData.detail === "string") message = errData.detail;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await response.json();
      modalLoading.classList.add("hidden");
      renderAnalysisInto(modalContent, data.analysis);
      clearModelNote();

      // Siyahını yenilə: "AI analiz var" nişanı əmələ gəlir
      attempt.has_ai_analysis = true;
      renderAttempts();

    } catch (err) {
      modalLoading.classList.add("hidden");
      console.error("AI analiz xətası:", err);
      modalContent.replaceChildren(el("p", "ai-empty", err.message || "Analiz alına bilmədi."));
      showToast(err.message || "Analiz alına bilmədi.", "error");
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        setAiButtonLabel(buttonEl, "AI Analiz yarat");
      }
    }
  }

  // ==========================================================================
  // ÜMUMİ AI ANALİZ
  // ==========================================================================
  async function runOverallAnalysis(force) {
    if (!aiAvailable) {
      showToast("AI xidməti hazırda konfiqurasiya edilməyib.", "warning");
      return;
    }

    if (btnOverall) {
      btnOverall.disabled = true;
      btnOverall.textContent = "Analiz gedir…";
    }
    overallLoading.classList.remove("hidden");
    overallResult.classList.add("hidden");

    try {
      const response = await fetchWithAuth("/api/v1/analytics/overall/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(force) })
      });

      if (!response) throw new Error("Serverə qoşulmaq mümkün olmadı.");
      if (response.status === 429) throw new Error("Çox sayda sorğu göndərildi. Bir az gözləyin.");
      if (!response.ok) {
        let message = "Ümumi analiz alına bilmədi.";
        try {
          const errData = await response.json().catch(() => ({}));
          if (errData && typeof errData.detail === "string") message = errData.detail;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await response.json();
      overallLoading.classList.add("hidden");
      overallResult.classList.remove("hidden");
      overallResult.replaceChildren();
      renderAnalysisInto(overallResult, data.analysis);

      // Model adı göstərilmir (bax: `clearModelNote` izahı) — yalnız tarix.
      if (overallMeta) {
        overallMeta.textContent = data.updated_at ? formatDateTime(data.updated_at) : "";
      }
      if (btnOverallRefresh) btnOverallRefresh.classList.remove("hidden");

    } catch (err) {
      overallLoading.classList.add("hidden");
      console.error("Ümumi AI analiz xətası:", err);
      showToast(err.message || "Ümumi analiz alınmadı.", "error");
      if (overallMeta) overallMeta.textContent = "Analiz alına bilmədi.";
    } finally {
      if (btnOverall) {
        btnOverall.disabled = false;
        btnOverall.textContent = "Yarat";
      }
    }
  }

  if (btnOverall) btnOverall.addEventListener("click", () => runOverallAnalysis(false));
  if (btnOverallRefresh) btnOverallRefresh.addEventListener("click", () => runOverallAnalysis(true));

  async function loadCachedOverall() {
    try {
      const response = await fetchWithAuth("/api/v1/analytics/overall/ai-analysis", { method: "GET" });
      if (!response || !response.ok) return;
      const data = await response.json();
      if (!data || !data.has_analysis) {
        if (overallMeta) overallMeta.textContent = "Hələ yaradılmayıb.";
        return;
      }
      overallLoading.classList.add("hidden");
      overallResult.classList.remove("hidden");
      renderAnalysisInto(overallResult, data.analysis);
      if (overallMeta) {
        overallMeta.textContent = data.updated_at ? formatDateTime(data.updated_at) : "";
      }
      if (btnOverallRefresh) btnOverallRefresh.classList.remove("hidden");
    } catch (_) {
      // Cache yoxdursa bu normaldır — heç bir xəta göstərilmir.
    }
  }

  // ==========================================================================
  // STATİSTİKA RENDER
  // ==========================================================================
  function renderTopicStats(topics) {
    if (!topicListContainer) return;
    topicListContainer.replaceChildren();

    if (!topics.length) {
      topicListContainer.appendChild(
        el("p", "ai-empty", "Mövzu statistikası yoxdur.")
      );
      return;
    }

    topics.slice(0, 20).forEach((t) => {
      const item = el("div", "topic-item");

      const head = el("div", "topic-head");
      head.appendChild(el("span", "topic-name", t.topic));
      head.appendChild(el("span", "topic-stats", `${t.accuracy_pct}% • ${t.correct_count}/${t.total_questions}`));
      item.appendChild(head);

      const track = el("div", "progress-track is-thin");
      const fill = el("div", "progress-fill");
      const pct = Number(t.accuracy_pct) || 0;
      if (pct >= 75) fill.classList.add("high");
      else if (pct >= 50) fill.classList.add("mid");
      else fill.classList.add("low");
      // CSS custom property — dəyər rəqəm formatında təsdiqlənir (XSS yoxdur)
      fill.style.setProperty("--progress-width", `${Math.min(100, Math.max(0, pct))}%`);
      track.appendChild(fill);
      item.appendChild(track);

      topicListContainer.appendChild(item);
    });
  }

  function renderSubjectStats(subjects) {
    if (!subjectListContainer) return;
    subjectListContainer.replaceChildren();

    if (!subjects.length) {
      subjectListContainer.appendChild(el("p", "ai-empty", "Fənn statistikası yoxdur."));
      return;
    }

    subjects.forEach((s) => {
      const item = el("div", "subject-item");

      const header = el("div", "subject-header");
      header.appendChild(el("span", "subject-name", s.subject));
      header.appendChild(
        el("span", "subject-meta", `${s.accuracy_pct}% • ${s.correct_count}/${s.total_questions}`)
      );

      const track = el("div", "progress-track");
      const fill = el("div", "progress-fill");
      const pct = Number(s.accuracy_pct) || 0;
      if (pct >= 75) fill.classList.add("high");
      else if (pct >= 50) fill.classList.add("mid");
      else fill.classList.add("low");
      fill.style.setProperty("--progress-width", `${Math.min(100, Math.max(0, pct))}%`);

      track.appendChild(fill);
      item.appendChild(header);
      item.appendChild(track);
      subjectListContainer.appendChild(item);
    });
  }

  // ==========================================================================
  // ƏSAS YÜKLƏMƏ
  // ==========================================================================

  /** Bütün cəhdləri çəkir (axtarış + filtr üçün mənbə). */
  async function loadAttempts() {
    if (attemptsSkeleton) attemptsSkeleton.classList.remove("hidden");
    try {
      const response = await fetchWithAuth("/api/v1/analytics/attempts?limit=100", { method: "GET" });
      if (!response || !response.ok) {
        allAttempts = [];
      } else {
        const data = await response.json().catch(() => null);
        allAttempts = data && Array.isArray(data.attempts) ? data.attempts : [];
      }
      renderAttempts();
    } finally {
      if (attemptsSkeleton) attemptsSkeleton.classList.add("hidden");
    }
  }

  async function loadAnalytics() {
    try {
      const response = await fetchWithAuth("/api/v1/analytics/me", { method: "GET" });

      if (!response) {
        skeletonEl.classList.add("hidden");
        return;
      }
      if (response.status === 401) {
        window.location.href = "auth.html";
        return;
      }
      if (!response.ok) {
        // TƏHLÜKƏSİZLİK: backend `detail` mesajı DB/SQL detalları daşıya bilər —
        // istifadəçiyə YALNIZ generic mesaj göstərilir.
        let serverDetail = "";
        try {
          const errData = await response.json().catch(() => ({}));
          if (errData && typeof errData.detail === "string") serverDetail = errData.detail;
        } catch (_) {}
        console.error("Analitika xətası:", response.status, serverDetail);
        throw new Error("Analitika məlumatlarını almaq mümkün olmadı.");
      }

      const data = await response.json();
      skeletonEl.classList.add("hidden");

      if (!data.has_data || data.total_exams === 0) {
        emptyEl.classList.remove("hidden");
        return;
      }

      contentEl.classList.remove("hidden");
      aiAvailable = data.ai_available !== false;

      valAccuracy.textContent = `${Math.round(Number(data.accuracy_pct) || 0)}%`;
      valTotalExams.textContent = String(data.total_exams);
      valCorrect.textContent = String(data.correct_count);
      valWrong.textContent = String((Number(data.incorrect_count) || 0) + (Number(data.empty_count) || 0));

      if (diagnosisText) diagnosisText.textContent = data.ai_diagnosis || "";

      renderSubjectStats(data.subject_stats || []);
      renderTopicStats(data.topic_stats || []);

      await loadAttempts();
      loadCachedOverall();

    } catch (err) {
      console.error("Analitika yüklənmə xətası:", err);
      skeletonEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      emptyEl.classList.add("is-error");
      const title = emptyEl.querySelector(".empty-box-title");
      const desc = emptyEl.querySelector(".empty-box-desc");
      if (title) title.textContent = "Məlumat yüklənmədi";
      if (desc) desc.textContent = "İnternet bağlantınızı yoxlayın və səhifəni yeniləyin.";
    }
  }

  await loadAnalytics();

  // URL hash ilə tab seçimi (?id= isə sınaq təfsilatına fokus)
  const hashIndex = tabs.findIndex((t) => `#${t.btn.id}` === window.location.hash);
  if (hashIndex >= 0) activateTab(hashIndex);

  const focusId = new URLSearchParams(window.location.search).get("id");
  if (focusId) {
    const target = allAttempts.find((a) => String(a.exam_id) === String(focusId));
    if (target) {
      activateTab(0);
      openAttemptDetail(target.attempt_id, target);
    }
  }
});
