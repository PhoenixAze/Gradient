"use strict";

/*
 * ANALİTİKA SƏHİFƏSİ
 *
 * TƏHLÜKƏSİZLİK (.clinerules §2):
 *   - Bütün mətn `textContent` ilə yazılır. `innerHTML`/`outerHTML`
 *     HƏR YERDƏ qadağandır — AI cavabları istifadəçi məlumatından
 *     yaranır, ona görə bu, həm XSS, həm də render performansı baxımından
 *     vacibdir.
 *   - Heç bir açar/Supabase cədvəl adı frontend-də yoxdur.
 *   - Token yalnız sessionStorage-dan oxunur.
 *
 * FUNKSİONAL:
 *   1) `/api/v1/analytics/me` → metrikalar, fənn və mövzu (q_tag) statistikası.
 *   2) Hər bitmiş sınaq üçün "AI Analiz" → per-cəhd Gemini analizi.
 *   3) "Bütün sınaqların ümumi AI analizi" → cache-li, DB-yə yazılan analiz.
 *   4) Hər sınaq üçün "Cəhdlər" → təkrar cəhd nəticələri (əvvəlki nəticə
 *      qorunur, təkrar cəhd statistikaya təsir etmir).
 */

const isProductionFrontend = typeof window !== "undefined" && (
  window.location.hostname === "phoenixaze.github.io" ||
  window.location.hostname.endsWith("github.io") ||
  window.location.hostname === "gradient.az" ||
  window.location.hostname === "www.gradient.az"
);
const API_BASE_URL = isProductionFrontend
  ? "https://gradient-backend-fam5.onrender.com"
  : "";

document.addEventListener("DOMContentLoaded", async () => {
  const skeletonEl = document.getElementById("analytics-skeleton");
  const emptyEl = document.getElementById("analytics-empty");
  const contentEl = document.getElementById("analytics-content");

  const valAccuracy = document.getElementById("val-accuracy");
  const valTotalExams = document.getElementById("val-total-exams");
  const valQuestions = document.getElementById("val-questions");
  const diagnosisText = document.getElementById("diagnosis-text");
  const subjectListContainer = document.getElementById("subject-list-container");
  const historyTableBody = document.getElementById("history-table-body");

  const topicListContainer = document.getElementById("topic-list-container");
  const topicCard = document.getElementById("topic-card");

  const btnOverall = document.getElementById("btn-overall-analysis");
  const btnOverallRefresh = document.getElementById("btn-overall-refresh");
  const overallLoading = document.getElementById("ai-overview-loading");
  const overallResult = document.getElementById("ai-overview-result");
  const overallMeta = document.getElementById("ai-overview-meta");

  const modal = document.getElementById("ai-modal");
  const modalTitle = document.getElementById("ai-modal-title");
  const modalSubtitle = document.getElementById("ai-modal-subtitle");
  const modalContent = document.getElementById("ai-modal-content");
  const modalLoading = document.getElementById("ai-modal-loading");
  const modalModelNote = document.getElementById("ai-modal-model");
  const modalCloseBtn = document.getElementById("ai-modal-close");
  const modalDoneBtn = document.getElementById("ai-modal-done");
  const toastRegion = document.getElementById("toast-region");

  // Qeyd: AI imkanı backend-dən gəlir (GEMINI_API_KEY server ENV-dədir).
  // Əgər yoxdursa düymələr "AI xidməti qurulmayıb" mesajı ilə sönür —
  // heç vaxt səhvi gizlətmir, amma istifadəçini boşluqda saxlamır.
  let aiAvailable = true;

  // ---------------------------------------------------------------------
  // TOKEN KÖMƏKÇİLƏRİ
  // ---------------------------------------------------------------------
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
    } catch (_) {}
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

  // ---------------------------------------------------------------------
  // BİLDİRİŞ (toast) — innerHTML YOXDUR
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // KÖMƏKÇİ DOM YARADICI
  // ---------------------------------------------------------------------
  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function createButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /**
   * Obyektlərdən (dict[]) siyahı yaradır. Model cavabının forması
   * dəyişə bilər ({"topic":...} / {"text":...} / ["mətn"]), ona görə
   * normalize edilib. Heç vaxt `item.name` kimi təhlükəli sahəyə
   * birbaşa toxunulmur — bütün mətn textContent ilə yazılır.
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

  // ---------------------------------------------------------------------
  // AI NƏTİCƏNİN RENDER EDİLMƏSİ (ümumi struktur)
  // ---------------------------------------------------------------------
  function renderAnalysisInto(container, analysis, options) {
    const opts = options || {};
    container.replaceChildren();
    if (!analysis || typeof analysis !== "object") {
      container.appendChild(createElement("p", "ai-empty", "Analiz məlumatı boşdur."));
      return;
    }

    if (analysis.headline) {
      container.appendChild(createElement("h3", "ai-headline", analysis.headline));
    }

    if (analysis.summary) {
      container.appendChild(createElement("p", "ai-summary", analysis.summary));
    }

    // --- Güclü tərəflər ---
    const strong = normalizeItems(analysis.strong_topics);
    if (strong.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Güclü olduğunuz mövzular"));
      const list = createElement("ul", "ai-list is-positive");
      strong.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(createElement("span", "ai-list-title", itemTitle(item)));
        const note = itemNote(item);
        if (note) li.appendChild(createElement("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // --- Zəif mövzular / fənnlər ---
    const focusTopics = normalizeItems(analysis.focus_topics || analysis.weak_topics);
    if (focusTopics.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Gücləndirməniz lazım olan mövzular"));
      const list = createElement("ul", "ai-list is-warning");
      focusTopics.forEach((item) => {
        const li = document.createElement("li");
        const head = document.createElement("div");
        head.className = "ai-list-head";
        head.appendChild(createElement("span", "ai-list-title", itemTitle(item)));

        const pct = Number(item.accuracy_pct);
        if (Number.isFinite(pct) && pct >= 0) {
          const badge = createElement("span", "ai-badge " + priorityClass(item.priority), `${Math.round(pct)}%`);
          head.appendChild(badge);
        } else if (item.priority) {
          const badge = createElement("span", "ai-badge " + priorityClass(item.priority), String(item.priority));
          head.appendChild(badge);
        }
        li.appendChild(head);

        const note = itemNote(item);
        if (note) li.appendChild(createElement("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // --- Fənn focus (ümumi analiz) ---
    const focusSubjects = normalizeItems(analysis.focus_subjects);
    if (focusSubjects.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Ən çətin fənnlər"));
      const list = createElement("ul", "ai-list");
      focusSubjects.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(createElement("span", "ai-list-title", itemTitle(item)));
        const note = itemNote(item);
        if (note) li.appendChild(createElement("span", "ai-list-note", note));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // --- Təkrarlanan səhvlər (per-sınaq analizləri üçün) ---
    const mistakes = normalizeItems(analysis.mistakes);
    if (mistakes.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Təkrarlanan səhvlər"));
      const list = createElement("ul", "ai-list is-danger");
      mistakes.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(createElement("span", "ai-list-title", itemTitle(item)));
        const issue = item && item.issue ? item.issue : "";
        const advice = item && item.advice ? item.advice : "";
        if (issue) li.appendChild(createElement("span", "ai-list-note", issue));
        if (advice) li.appendChild(createElement("span", "ai-list-advice", advice));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // --- Tövsiyələr ---
    const recs = normalizeItems(analysis.recommendations);
    if (recs.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Tövsiyələr"));
      const list = createElement("ol", "ai-list ai-list-ordered");
      recs.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(createElement("span", "ai-list-note", itemTitle(item) + (itemNote(item) ? ` — ${itemNote(item)}` : "")));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // --- Öyrənmə planı ---
    const plan = normalizeItems(analysis.study_plan || analysis.weekly_plan);
    if (plan.length) {
      const block = createElement("div", "ai-block");
      block.appendChild(createElement("h4", "ai-block-title", "Öyrənmə planı"));
      const list = createElement("ol", "ai-list ai-list-ordered");
      plan.forEach((item) => {
        const li = document.createElement("li");
        li.appendChild(createElement("span", "ai-list-note", itemTitle(item)));
        list.appendChild(li);
      });
      block.appendChild(list);
      container.appendChild(block);
    }

    // Heç nə göstərilməyə bilməz — istifadəçi boş panel görməməlidir
    if (!container.hasChildNodes()) {
      container.appendChild(createElement("p", "ai-empty", "Analiz çox qısa oldu. Bir az sonra yenidən cəhd edin."));
    }
  }

  // ---------------------------------------------------------------------
  // MODAL İDARƏETMƏSİ
  // ---------------------------------------------------------------------
  let lastFocusedEl = null;

  function openModal(title, subtitle) {
    if (!modal) return;
    lastFocusedEl = document.activeElement;
    modalTitle.textContent = String(title || "AI Analiz");
    modalSubtitle.textContent = String(subtitle || "");
    modalContent.replaceChildren();
    modalLoading.classList.add("hidden");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    modalContent.replaceChildren();
    modalModelNote.textContent = "";
    // Fokus idarəetməsi (a11y): modal bağlananda fokus əvvəlki düyməyə qayıdır
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute("data-close-modal") === "true") closeModal();
    });
  }
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalDoneBtn) modalDoneBtn.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  // ---------------------------------------------------------------------
  // HƏR BİR SINAQ ÜÇÜN AI ANALİZ
  // ---------------------------------------------------------------------
  async function runExamAnalysis(attemptId, examTitle, buttonEl) {
    if (!attemptId) {
      showToast("Analiz üçün cəhd məlumatı tapılmadı.", "warning");
      return;
    }

    openModal(examTitle, "Səhv etdiyiniz mövzular süni intellektlə təhlil olunur");
    modalLoading.classList.remove("hidden");
    modalContent.replaceChildren();

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.dataset.originalText = buttonEl.textContent;
      buttonEl.textContent = "Analiz olunur…";
    }

    try {
      const response = await fetchWithAuth(
        `/api/v1/analytics/attempts/${encodeURIComponent(attemptId)}/ai-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false })
        }
      );

      if (!response) {
        throw new Error("Serverə qoşulmaq mümkün olmadı.");
      }

      if (response.status === 429) {
        throw new Error("Çox sayda analiz sorğusu göndərildi. Bir az gözləyin.");
      }

      if (!response.ok) {
        let message = "AI analiz əldə etmək mümkün olmadı.";
        try {
          const errData = await response.json().catch(() => ({}));
          if (errData && typeof errData.detail === "string") message = errData.detail;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await response.json();
      modalLoading.classList.add("hidden");
      renderAnalysisInto(modalContent, data.analysis);
      modalModelNote.textContent = data.ai_model
        ? `Model: ${data.ai_model}${data.cached ? " • əvvəlki analiz yenidən göstərilir" : ""}`
        : "";

    } catch (err) {
      modalLoading.classList.add("hidden");
      // Texniki detallar istifadəçiyə SIZDIRILMIR (.clinerules §1)
      console.error("AI analiz xətası:", err);
      const msg = createElement("p", "ai-empty", err.message || "Analiz zamanı xəta baş verdi.");
      modalContent.replaceChildren(msg);
      showToast(err.message || "Analiz zamanı xəta baş verdi.", "error");
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = buttonEl.dataset.originalText || "AI Analiz";
      }
    }
  }

  // ---------------------------------------------------------------------
  // CƏHDLƏR MODALI (təkrar işlətmə nəticələri)
  // ---------------------------------------------------------------------
  async function openAttemptsModal(examId, examTitle) {
    openModal(examTitle, "Bu sınaqın bütün cəhdləri");
    modalLoading.classList.remove("hidden");
    modalContent.replaceChildren();

    try {
      const response = await fetchWithAuth(
        `/api/v1/exams/${encodeURIComponent(examId)}/attempts`,
        { method: "GET" }
      );

      if (!response) throw new Error("Serverə qoşulmaq mümkün olmadı.");
      if (!response.ok) {
        let message = "Cəhd məlumatları yüklənmədi.";
        try {
          const errData = await response.json().catch(() => ({}));
          if (errData && typeof errData.detail === "string") message = errData.detail;
        } catch (_) {}
        throw new Error(message);
      }

      const data = await response.json();
      modalLoading.classList.add("hidden");
      modalContent.replaceChildren();

      const attempts = Array.isArray(data.attempts) ? data.attempts : [];
      if (attempts.length === 0) {
        modalContent.appendChild(createElement("p", "ai-empty", "Bu sınaq üçün cəhd tapılmadı."));
        return;
      }

      const notice = createElement(
        "p",
        "ai-notice",
        "İlk cəhd statistikanı qorunur. Təkrar cəhdlər yalnız əlavə öyrənmə üçün saxlanılır."
      );
      modalContent.appendChild(notice);

      const list = createElement("ul", "attempt-list");
      attempts.forEach((a) => {
        const li = document.createElement("li");
        li.className = "attempt-item" + (a.is_primary ? " is-primary" : " is-retake");

        const head = document.createElement("div");
        head.className = "attempt-head";

        const label = createElement(
          "span",
          "attempt-label",
          a.attempt_no === 1 ? "1-ci cəhd (əsas nəticə)" : `${a.attempt_no}-cı cəhd (təkrar)`
        );
        head.appendChild(label);

        const scoreEl = createElement("span", "attempt-score", `${a.score} / ${a.total_questions}`);
        head.appendChild(scoreEl);
        li.appendChild(head);

        const meta = createElement(
          "p",
          "attempt-meta",
          `Dəqiqlik: ${a.percentage}% • Səhv: ${a.incorrect_count} • Boş: ${a.empty_count}` +
          (a.created_at ? ` • ${formatDate(a.created_at)}` : "")
        );
        li.appendChild(meta);

        // Zəif mövzu teqləri
        const topics = Array.isArray(a.weak_topics) ? a.weak_topics.slice(0, 6) : [];
        if (topics.length) {
          const tagWrap = createElement("div", "attempt-tags");
          topics.forEach((t) => {
            if (!t || typeof t !== "object") return;
            const topicName = String(t.topic || "").slice(0, 60);
            if (!topicName) return;
            tagWrap.appendChild(createElement("span", "topic-chip", topicName));
          });
          if (tagWrap.hasChildNodes()) li.appendChild(tagWrap);
        }

        // Bu cəhd üçün ayrıca AI analiz
        if (a.attempt_id) {
          const actions = createElement("div", "attempt-actions");
          actions.appendChild(
            createButton(
              a.has_ai_analysis ? "AI Analizi Gör" : "Bu Cəhdi Analiz Et",
              "btn btn-outline btn-sm",
              () => runExamAnalysis(a.attempt_id, `${examTitle} — ${a.attempt_no}-cı cəhd`)
            )
          );
          li.appendChild(actions);
        }

        list.appendChild(li);
      });

      modalContent.appendChild(list);

      const retakeWrap = createElement("div", "attempt-retake");
      if (data.can_retake) {
        retakeWrap.appendChild(createElement(
          "p",
          "ai-notice",
          "Sınağı təkrar işlətmək istəyirsinizsə, sınaqlar zalından “Yenidən işlə” düyməsini istifadə edin."
        ));
        const link = document.createElement("a");
        link.className = "btn btn-primary btn-sm";
        link.href = `exam-hall.html?id=${encodeURIComponent(examId)}`;
        link.textContent = "Sınağı Təkrar İşlə";
        retakeWrap.appendChild(link);
      } else {
        retakeWrap.appendChild(createElement(
          "p",
          "ai-notice",
          `Bu sınaq üçün cəhd limitinə (${data.max_attempts}) çatmısınız.`
        ));
      }
      modalContent.appendChild(retakeWrap);

    } catch (err) {
      modalLoading.classList.add("hidden");
      console.error("Cəhd yükləmə xətası:", err);
      modalContent.replaceChildren(
        createElement("p", "ai-empty", err.message || "Cəhd məlumatları yüklənmədi.")
      );
    }
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("az-AZ", { year: "numeric", month: "short", day: "numeric" });
  }

  // ---------------------------------------------------------------------
  // ÜMUMİ AI ANALİZ
  // ---------------------------------------------------------------------
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

      if (response.status === 429) {
        throw new Error("Çox sayda analiz sorğusu göndərildi. Bir az gözləyin.");
      }

      if (!response.ok) {
        let message = "Ümumi analiz əldə etmək mümkün olmadı.";
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

      if (overallMeta) {
        const parts = [];
        if (data.ai_model) parts.push(`Model: ${data.ai_model}`);
        if (data.cached) parts.push("saxlanmış analiz göstərilir");
        parts.push("Yeniləmək üçün \"Yenilə\" düyməsini istifadə edin.");
        overallMeta.textContent = parts.join(" • ");
      }
      if (btnOverallRefresh) btnOverallRefresh.classList.remove("hidden");

    } catch (err) {
      overallLoading.classList.add("hidden");
      console.error("Ümumi AI analiz xətası:", err);
      showToast(err.message || "Ümumi analiz alınmadı.", "error");
      if (overallMeta) {
        overallMeta.textContent = "Analiz alına bilmədi. Düyməni yenidən sınayın.";
      }
    } finally {
      if (btnOverall) {
        btnOverall.disabled = false;
        btnOverall.textContent = "AI Analiz Yarat";
      }
    }
  }

  if (btnOverall) {
    btnOverall.addEventListener("click", () => runOverallAnalysis(false));
  }
  if (btnOverallRefresh) {
    btnOverallRefresh.addEventListener("click", () => runOverallAnalysis(true));
  }

  // ---------------------------------------------------------------------
  // ƏSAS YÜKLƏMƏ
  // ---------------------------------------------------------------------
  let analyticsData = null;

  async function loadAttemptsForExam(examId) {
    try {
      const response = await fetchWithAuth(
        `/api/v1/exams/${encodeURIComponent(examId)}/attempts`,
        { method: "GET" }
      );
      if (!response || !response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
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
        throw new Error("Analitika məlumatlarını almaq mümkün olmadı.");
      }

      const data = await response.json();
      analyticsData = data;
      skeletonEl.classList.add("hidden");

      if (!data.has_data || data.total_exams === 0) {
        emptyEl.classList.remove("hidden");
        return;
      }

      contentEl.classList.remove("hidden");
      aiAvailable = data.ai_available !== false;

      const accuracy = Number(data.accuracy_pct) || 0;
      valAccuracy.textContent = `${Math.round(accuracy)}%`;
      valTotalExams.textContent = data.total_exams;

      const retakeNote = Number(data.retake_attempts) > 0
        ? ` (təkrar cəhd: ${data.retake_attempts})`
        : "";
      valQuestions.textContent = `${data.correct_count} / ${data.total_questions}${retakeNote}`;

      diagnosisText.textContent = data.ai_diagnosis
        || "Sınaq nəticələriniz əsasında fərdi inkişaf trayektoriyanız hazırlanır.";

      // ---- Fənnlər üzrə dəqiqlik ----
      subjectListContainer.replaceChildren();
      (data.subject_stats || []).forEach((s) => {
        const item = createElement("div", "subject-item");

        const header = createElement("div", "subject-header");
        header.appendChild(createElement("span", null, s.subject));
        header.appendChild(
          createElement("span", "subject-meta", `${s.correct_count}/${s.total_questions} düzgün (${s.accuracy_pct}%)`)
        );

        const track = createElement("div", "progress-track");
        const fill = createElement("div", "progress-fill");
        const pct = Number(s.accuracy_pct) || 0;
        if (pct >= 75) fill.classList.add("high");
        else if (pct >= 50) fill.classList.add("mid");
        else fill.classList.add("low");
        // CSS custom property — dəyər rəqəm formatında təsdiqlənir (XSS yoxdur)
        fill.style.setProperty("--progress-width", `${Math.min(100, Math.max(0, pct))}%`);

        track.appendChild(fill);
        item.appendChild(header);
        item.appendChild(track);
        subjectListContainer.appendChild(item);
      });

      // ---- Mövzu (q_tag) statistikası ----
      renderTopicStats(data.topic_stats || []);

      // ---- Sınaq tarixçəsi + AI düymələri ----
      await renderHistory(data.history || []);

      // ---- Əvvəl saxlanmış ümumi analiz (AI xərci etmədən) ----
      loadCachedOverall();

    } catch (err) {
      console.error("Analitika yüklənmə xətası:", err);
      skeletonEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      emptyEl.classList.add("is-error");
      const title = emptyEl.querySelector(".empty-box-title");
      const desc = emptyEl.querySelector(".empty-box-desc");
      if (title) title.textContent = "Məlumat yüklənərkən xəta baş verdi";
      if (desc) desc.textContent = "Zəhmət olmasa internet bağlantınızı yoxlayın və ya səhifəni yeniləyin.";
    }
  }

  function renderTopicStats(topics) {
    if (!topicListContainer) return;

    topicListContainer.replaceChildren();

    if (topics.length === 0) {
      if (topicCard) topicCard.classList.add("hidden");
      return;
    }
    if (topicCard) topicCard.classList.remove("hidden");

    topics.slice(0, 15).forEach((t) => {
      const item = createElement("div", "topic-item");

      const head = createElement("div", "topic-head");
      head.appendChild(createElement("span", "topic-name", t.topic));

      const stats = createElement("span", "topic-stats");
      stats.textContent =
        `${t.accuracy_pct}% • səhv ${t.incorrect_count} • boş ${t.empty_count} • cəmi ${t.total_questions}`;
      head.appendChild(stats);
      item.appendChild(head);

      const track = createElement("div", "progress-track is-thin");
      const fill = createElement("div", "progress-fill");
      const pct = Number(t.accuracy_pct) || 0;
      if (pct >= 75) fill.classList.add("high");
      else if (pct >= 50) fill.classList.add("mid");
      else fill.classList.add("low");
      fill.style.setProperty("--progress-width", `${Math.min(100, Math.max(0, pct))}%`);
      track.appendChild(fill);
      item.appendChild(track);

      topicListContainer.appendChild(item);
    });
  }

  async function renderHistory(history) {
    historyTableBody.replaceChildren();

    // Bütün sınaqların cəhd məlumatları paralel çəkilir (hər sıra üçün 1 sorğu).
    const attemptsByExam = {};
    await Promise.all(
      history.map(async (h) => {
        if (!h.exam_id) return;
        const data = await loadAttemptsForExam(h.exam_id);
        if (data) attemptsByExam[h.exam_id] = data;
      })
    );

    history.forEach((h) => {
      const tr = document.createElement("tr");

      // Başlıq + cəhd badge
      const tdTitle = document.createElement("td");
      tdTitle.className = "cell-strong";
      tdTitle.appendChild(document.createTextNode(h.title || "Sınaq"));

      const attempts = (attemptsByExam[h.exam_id] || {}).attempts || [];
      const totalAttempts = attempts.length || 1;

      const badgeWrap = createElement("div", "cell-badges");
      const primaryAttempt = attempts.find((a) => a.is_primary);

      const badge = createElement(
        "span",
        totalAttempts > 1 ? "badge-attempts is-multi" : "badge-attempts",
        totalAttempts > 1 ? `${totalAttempts} cəhd` : "1 cəhd"
      );
      badgeWrap.appendChild(badge);

      // AI düyməsi — hansı cəhd analiz olunacaq?
      const aiBtn = createButton(
        "AI Analiz",
        "btn btn-outline btn-sm",
        () => {
          const target = primaryAttempt || attempts[0];
          if (target && target.attempt_id) {
            runExamAnalysis(
              target.attempt_id,
              `${h.title || "Sınaq"} — ${target.attempt_no || 1}-ci cəhd`
            );
          } else {
            showToast("Bu sınaq üçün cəhd məlumatı tapılmadı.", "warning");
          }
        }
      );
      badgeWrap.appendChild(aiBtn);
      tdTitle.appendChild(badgeWrap);
      tr.appendChild(tdTitle);

      // Fənn
      const tdSubject = document.createElement("td");
      tdSubject.appendChild(createElement("span", "badge-tag", h.subject || "Ümumi"));
      tr.appendChild(tdSubject);

      // Bal
      tr.appendChild(createElement("td", null, `${h.score} / ${h.total_questions}`));

      // Dəqiqlik
      const percentage = Number(h.percentage) || 0;
      let pctClass = "cell-danger";
      if (percentage >= 75) pctClass = "cell-success";
      else if (percentage >= 50) pctClass = "cell-warning";
      tr.appendChild(createElement("td", `cell-strong ${pctClass}`, `${percentage}%`));

      // Tarix
      tr.appendChild(createElement("td", "cell-muted", formatDate(h.created_at)));

      // Əməliyyatlar: cəhdlər + təkrar işlət
      const tdActions = document.createElement("td");
      tdActions.className = "col-actions";

      const actions = createElement("div", "row-actions");

      if (totalAttempts > 1 || (attemptsByExam[h.exam_id] || {}).can_retake) {
        actions.appendChild(
          createButton("Cəhdlər", "btn btn-ghost btn-sm", () => openAttemptsModal(h.exam_id, h.title))
        );
      }

      if ((attemptsByExam[h.exam_id] || {}).can_retake) {
        const retake = document.createElement("a");
        retake.className = "btn btn-outline btn-sm";
        retake.href = `exam-hall.html?id=${encodeURIComponent(h.exam_id)}`;
        retake.textContent = "Təkrar İşlə";
        actions.appendChild(retake);
      }

      tdActions.appendChild(actions);
      tr.appendChild(tdActions);

      historyTableBody.appendChild(tr);
    });
  }

  /**
   * Səhifə açılışında saxlanmış ümumi analizi göstərir — AI API-yə
   * müraciət etmədən (qənaət + sürət).
   */
  async function loadCachedOverall() {
    try {
      const response = await fetchWithAuth("/api/v1/analytics/overall/ai-analysis", { method: "GET" });
      if (!response || !response.ok) return;
      const data = await response.json();
      if (!data || !data.has_analysis) return;

      overallLoading.classList.add("hidden");
      overallResult.classList.remove("hidden");
      renderAnalysisInto(overallResult, data.analysis);

      if (overallMeta && data.ai_model) {
        overallMeta.textContent =
          `Model: ${data.ai_model} • son yenilənmə: ${data.updated_at ? formatDate(data.updated_at) : "-"}`;
      }
      if (btnOverallRefresh) btnOverallRefresh.classList.remove("hidden");
    } catch (_) {
      // Cache yoxdursa bu normaldır — heç bir xəta göstərilmir.
    }
  }

  await loadAnalytics();

  // URL-də `?id=` varsa (sınaq zalından "Analitika" keçidi), həmin sınağın
  // AI analizi avtomatik açılır — istifadəçi əlavə klik etməyə ehtiyac duymur.
  // TƏHLÜKƏSİZLİK: `id` yalnız `encodeURIComponent` ilə URL-yə yazılır və
  // backend `.eq("student_id")` filtri sayəsində başqa şagirdin cəhdi açılmır.
  if (analyticsData && analyticsData.has_data) {
    const focusExamId = new URLSearchParams(window.location.search).get("id");
    if (focusExamId) {
      const focused = (analyticsData.history || []).find(
        (h) => String(h.exam_id) === String(focusExamId)
      );
      if (focused) {
        const matches = Array.from(
          historyTableBody.querySelectorAll("tr")
        ).filter((row) => row.textContent.includes(focused.title || " "));
        if (matches.length) {
          matches[0].classList.add("is-highlighted");
          matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }
});
