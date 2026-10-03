"use strict";

/* ==========================================================================
   ABUNƏ PLANLARI SƏHİFƏSİ — FRONTEND MƏNTİQİ
   Təhlükəsizlik (.clinerules §1-2):
     • Bütün DOM quruluşu innerHTML-siz (yalnız textContent / createElement)
     • Bütün şəbəkə sorğuları eyni auth qatı (cookie + access/refresh token)
     • Heç bir açar və ya cədvəl adı frontend-də yoxdur
     • Plan məlumatları BACKEND-dən oxunur (tikili qiymət YOXDUR) —
       biznes qaydalarının tək mənbəyi serverdir
   ========================================================================== */

const API_BASE_URL = (() => {
  const host = window.location.hostname;
  const isProd = host.endsWith("github.io") || host === "gradient.az" || host === "www.gradient.az";
  return isProd ? "https://gradient-backend-fam5.onrender.com" : "";
})();

/* Plan sırası — yalnız UI məqsədi ilə (hansı kartı "tövsiyə" göstərik).
   Həqiqi qiymət/limit məlumatları serverdən gəlir. */
const PLAN_ORDER = ["free", "standard", "pro", "pro_plus"];

/* "Tövsiyə olunan" plan — hansı kart vurğulansın */
const FEATURED_PLAN = "pro";

/* Ehtiyat ölçü — fallback (yalnız server əlçatmaz olduqda istifadə olunur) */
const FALLBACK_WHATSAPP = "https://wa.me/994505975697";

document.addEventListener("DOMContentLoaded", () => {
  /* ------------------------------------------------------------------
     1. DOM ELEMENTLƏRİ
     ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  const skeletonEl = $("plans-skeleton");
  const gridEl = $("plans-grid");
  const stateEl = $("plans-state");
  const stateTitleEl = $("plans-state-title");
  const stateTextEl = $("plans-state-text");
  const retryBtn = $("plans-retry");

  const currentPlanCard = $("current-plan-card");
  const currentPlanTitle = $("current-plan-title");
  const currentPlanText = $("current-plan-text");

  const usageCard = $("usage-card");
  const usagePeriod = $("usage-period");
  const usageStudentsValue = $("usage-students-value");
  const usageStudentsFill = $("usage-students-fill");
  const usageStudentsBarWrap = $("usage-students-bar-wrap");
  const usageStudentsNote = $("usage-students-note");
  const usageExamsValue = $("usage-exams-value");
  const usageExamsFill = $("usage-exams-fill");
  const usageExamsBarWrap = $("usage-exams-bar-wrap");
  const usageExamsNote = $("usage-exams-note");

  let currentPlanId = "free";
  let contactSettings = null;

  /* ------------------------------------------------------------------
     2. TOKEN KÖMƏKÇİLƏRİ (eyni model: access → sessionStorage)
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
      localStorage.removeItem("gradient_refresh_token");
      sessionStorage.removeItem("gradient_refresh_token");
    } catch (_) { /* noop */ }
  }

  /* ------------------------------------------------------------------
     3. UNİVERSAL AUTH SORĞU QATI
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
     4. UI ALƏTLƏRİ
     ------------------------------------------------------------------ */

  /** Yüklənmə skeletini göstərir / gizlədir. */
  function setLoading(isLoading) {
    if (skeletonEl) skeletonEl.classList.toggle("hidden", !isLoading);
    if (gridEl) gridEl.classList.toggle("hidden", isLoading);
  }

  /** Error / Empty state göstərir. */
  function showState(title, text, isError = true) {
    if (!stateEl) return;
    if (stateTitleEl) stateTitleEl.textContent = title;
    if (stateTextEl) stateTextEl.textContent = text;
    stateEl.classList.remove("hidden");
    stateEl.classList.toggle("is-error", isError);
  }

  function hideState() {
    if (stateEl) stateEl.classList.add("hidden");
  }

  /** SVG ikon yaradır (innerHTML OLMADAN — createElement + setAttribute). */
  function createIcon(pathDataList, className) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);

    pathDataList.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });

    return svg;
  }

  const CHECK_PATH = ["M20 6L9 17l-5-5"];
  const CROSS_PATH = ["M18 6L6 18", "M6 6l12 12"];

  /* ------------------------------------------------------------------
     5. PLAN KARTLARININ QURULUŞU (innerHTML OLMADAN)
     ------------------------------------------------------------------ */

  /**
   * Bir planın "xüsusiyyət" sətrini yaradır.
   * @param {string} text — xüsusiyyət mətni (textContent ilə — XSS təhlükəsiz)
   * @param {boolean} included — plan daxildirsə true
   */
  function createFeatureItem(text, included) {
    const li = document.createElement("li");
    li.className = "plan-feature-item";

    const iconWrap = document.createElement("span");
    iconWrap.style.display = "inline-flex";
    iconWrap.appendChild(
      createIcon(included ? CHECK_PATH : CROSS_PATH,
                 included ? "plan-feature-icon" : "plan-feature-icon is-muted")
    );

    const span = document.createElement("span");
    span.textContent = text; // textContent → XSS təhlükəsiz

    li.appendChild(iconWrap);
    li.appendChild(span);
    return li;
  }

  /** Plan adının göstəriləcəyi mətn (serverdən gəlir, dəyişdirilmir). */
  function planLabel(plan) {
    const id = plan.id;
    if (id === "free") return "Free";
    if (id === "standard") return "Standart";
    if (id === "pro") return "Pro";
    if (id === "pro_plus") return "Pro+";
    return plan.name || "Plan";
  }

  /** Qiyməti "14.99" formatında qaytarır. */
  function formatPrice(price) {
    const num = Number(price);
    if (!Number.isFinite(num) || num <= 0) return "0";
    return num.toFixed(2);
  }

  /** Bir planın xüsusiyyət siyahısını qurur (mərkəzləşdirilmiş məntiq). */
  function buildFeatureList(plan) {
    const isUnlimitedStudents = plan.unlimited_students;
    const studentsLimit = plan.max_students;
    const isUnlimitedExams = plan.unlimited_exams;

    const features = [];

    // Şagird limiti
    features.push(
      isUnlimitedStudents
        ? createFeatureItem("Limitsiz şagird", true)
        : createFeatureItem(`${studentsLimit} şagirdə qədər`, true)
    );

    // Sınaq limiti
    features.push(
      isUnlimitedExams
        ? createFeatureItem("Limitsiz sınaq yaratma", true)
        : createFeatureItem(`Ayda ${plan.max_exams_per_month} sınaq yaratma`, true)
    );

    // Əlavə fərqləndiricilər (yalnız pullu planlarda)
    if (plan.id !== "free") {
      features.push(createFeatureItem("Limitsiz analitika", true));
      features.push(createFeatureItem("Prioritet dəstək", true));
    }

    // Free üçün məhdudiyyət xəbərdarlığı
    if (plan.id === "free") {
      features.push(createFeatureItem("AI analitika məhduddur", false));
    }

    return features;
  }

  /**
   * Bir plan kartının düyməsinə basıldıqda:
   *  1) Backend-ə yüksəltmə sorğusu göndərilir (admin üçün qeyd);
   *  2) İstifadəçi WhatsApp-a yönləndirilir (ödəniş hələ yoxdur).
   */
  async function handlePlanCta(plan, btn) {
    const planId = plan.id;
    if (!planId || planId === "free" || planId === currentPlanId) return;

    // Düyməni "işlənir" vəziyyətinə keçir (təkrar klik qorunması)
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Göndərilir...";

    // 1. Yüksəltmə sorğusunu qeyd et (best-effort — uğursuz olsa da
    //    istifadəçi yönləndirilməyə davam edir)
    try {
      await fetchWithAuth("/api/v1/plans/upgrade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired_plan: planId })
      });
    } catch (_) {
      /* sessiz: WhatsApp addımı əsas axıdır */
    }

    // 2. WhatsApp mesajını hazırlayıb yönləndir
    const whatsappUrl = buildWhatsappUrl(planId, planLabel(plan));
    if (whatsappUrl) {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }

    // Düyməni geri qaytar
    btn.disabled = false;
    btn.textContent = originalLabel;
  }

  /** WhatsApp "yüksəltmə" mesajı URL-i qurur. */
  function buildWhatsappUrl(planId, planName) {
    const base = (contactSettings && contactSettings.whatsapp_url) || FALLBACK_WHATSAPP;
    // Təhlükəsizlik: yalnız https://wa.me/... formatını qəbul edirik
    if (!/^https:\/\/wa\.me\/\d+$/i.test(base)) {
      console.warn("WhatsApp URL formatı xarici — ehtiyat URL istifadə olunur.");
      return `${FALLBACK_WHATSAPP}?text=${encodeURIComponent(planId)}`;
    }

    const message =
      "Salam! Gradient repetitor panelində " +
      planName +
      " planına yüksəltmək istəyirəm. " +
      "Hesabımı yüksəltmək üçün mənə kömək edə bilərsiniz?";

    return `${base}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Bir plan kartını DOM-a əlavə edir (tam təhlükəsiz — innerHTML yoxdur).
   * @param {object} plan — serverdən gələn plan obyekti
   * @param {number} index — animasiya gecikməsi üçün sıra
   */
  function buildPlanCard(plan, index) {
    const card = document.createElement("article");
    card.className = "plan-card";

    const isCurrent = plan.id === currentPlanId;
    const isFeatured = plan.id === FEATURED_PLAN && !isCurrent;

    if (isCurrent) card.classList.add("is-current");
    if (isFeatured) card.classList.add("is-featured");

    // --- Badge (Tövsiyə / Cari plan) ---
    if (isCurrent || isFeatured) {
      const badge = document.createElement("span");
      badge.className = isCurrent
        ? "plan-card-badge is-current"
        : "plan-card-badge";
      badge.textContent = isCurrent ? "Cari planınız" : "Tövsiyə olunan";
      card.appendChild(badge);
    }

    // --- Plan adı ---
    const nameEl = document.createElement("h3");
    nameEl.className = "plan-name";
    nameEl.textContent = planLabel(plan);
    card.appendChild(nameEl);

    // --- Təsvir ---
    const descEl = document.createElement("p");
    descEl.className = "plan-description";
    descEl.textContent = plan.description || "";
    card.appendChild(descEl);

    // --- Qiymət ---
    const priceRow = document.createElement("div");
    priceRow.className = "plan-price-row";

    const priceEl = document.createElement("span");
    priceEl.className = "plan-price";
    priceEl.textContent = formatPrice(plan.price);

    const periodEl = document.createElement("span");
    periodEl.className = "plan-price-period";
    periodEl.textContent = "AZN / ay";

    priceRow.appendChild(priceEl);
    priceRow.appendChild(periodEl);
    card.appendChild(priceRow);

    // --- Xüsusiyyətlər ---
    const featuresEl = document.createElement("ul");
    featuresEl.className = "plan-features";
    buildFeatureList(plan).forEach((item) => featuresEl.appendChild(item));
    card.appendChild(featuresEl);

    // --- CTA düyməsi ---
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary plan-action";

    if (isCurrent) {
      btn.textContent = "Cari planınız";
      btn.disabled = true;
    } else if (plan.id === "free") {
      btn.textContent = "Free planda qalın";
      btn.disabled = true;
    } else {
      btn.textContent = `${planLabel(plan)} planını seçin`;
      btn.addEventListener("click", () => handlePlanCta(plan, btn));
    }

    card.appendChild(btn);
    return card;
  }

  /**
   * Plan siyahısını qurur (serverdən alınan sıraya görə).
   * @param {Array} plans — plan obyektləri
   */
  function renderPlans(plans) {
    if (!gridEl) return;
    gridEl.textContent = ""; // təhlükəsiz təmizləmə

    // Server sırasına hörmət et, amma bilinməyən planları süz (defensive)
    const safePlans = (plans || []).filter((p) => p && PLAN_ORDER.includes(p.id));

    safePlans.forEach((plan) => {
      const card = buildPlanCard(plan);
      gridEl.appendChild(card);
    });

    gridEl.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------
     6. İSTİFADƏ / HAZIRKI LIMİTLƏR BLOKU
     ------------------------------------------------------------------ */

  /**
   * Proqres çubuğunu doldurur (animasiyalı).
   * @param {HTMLElement} fillEl — dolgu elementi
   * @param {HTMLElement} barWrapEl — progressbar wrapper (aria)
   * @param {number} used — istifadə olunan
   * @param {number|null} limit — limit (null = limitsiz)
   */
  function updateUsageBar(fillEl, barWrapEl, used, limit) {
    if (!fillEl) return;

    if (limit === null || limit === undefined) {
      // Limitsiz plan → tam dolu "göyə" çubuq
      fillEl.style.width = "100%";
      fillEl.classList.remove("is-near-limit", "is-at-limit");
      if (barWrapEl) barWrapEl.removeAttribute("aria-valuemax");
      return;
    }

    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
    fillEl.style.width = `${pct}%`;

    fillEl.classList.remove("is-near-limit", "is-at-limit");
    if (pct >= 100) fillEl.classList.add("is-at-limit");
    else if (pct >= 70) fillEl.classList.add("is-near-limit");

    if (barWrapEl) {
      barWrapEl.setAttribute("aria-valuemax", String(limit));
      barWrapEl.setAttribute("aria-valuenow", String(used));
    }
  }

  /**
   * "Hazırkı limitləriniz" blokunu doldurur.
   * @param {object} usage — /api/v1/plans/me cavabı
   */
  function renderUsage(usage) {
    if (!usage || !usageCard) return;

    const planName = usage.plan && usage.plan.name ? usage.plan.name : "Free";

    // --- Şagird ---
    if (usageStudentsValue) {
      usageStudentsValue.textContent =
        usage.students_limit === null
          ? `${usage.students_used} / limitsiz`
          : `${usage.students_used} / ${usage.students_limit}`;
    }
    updateUsageBar(usageStudentsFill, usageStudentsBarWrap, usage.students_used, usage.students_limit);
    if (usageStudentsNote) {
      usageStudentsNote.textContent =
        usage.students_limit === null
          ? "Planınız limitsiz şagirdə icazə verir."
          : `${planName} planında maksimum ${usage.students_limit} şagirdə qədər.`;
    }

    // --- Sınaq ---
    if (usageExamsValue) {
      usageExamsValue.textContent =
        usage.exams_limit === null
          ? `${usage.exams_used} / limitsiz`
          : `${usage.exams_used} / ${usage.exams_limit}`;
    }
    updateUsageBar(usageExamsFill, usageExamsBarWrap, usage.exams_used, usage.exams_limit);
    if (usageExamsNote) {
      usageExamsNote.textContent =
        usage.exams_limit === null
          ? "Planınız limitsiz sınaq yaratmağa icazə verir."
          : `${planName} planında hər ay ${usage.exams_limit} sınaq yarada bilərsiniz.`;
    }

    // --- Dövr mətni ---
    if (usagePeriod) usagePeriod.textContent = "Bu ay";

    usageCard.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------
     7. CARİ PLAN BİLYİYİ (yalnız Free / aşağı planda)
     ------------------------------------------------------------------ */
  function renderCurrentPlanNotice(usage) {
    if (!usage || !currentPlanCard) return;

    const plan = usage.plan || {};
    const isFree = plan.id === "free";

    // Yalnız Free planda məlumatlandırıcı blok göstərilir
    if (!isFree) return;

    const nameEl = currentPlanTitle;
    const textEl = currentPlanText;

    if (nameEl) nameEl.textContent = "Hazırda Free plandasınız";

    if (textEl) {
      textEl.textContent =
        "Free plan limitsiz başlanğıcdır. Yüksəltmə etsəniz, qrupunuzdakı şagird " +
        "sayı və aylıq sınaq limiti dərhal artacaq. Aşağıdakı planlardan birini seçin.";
    }

    currentPlanCard.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------
     8. MƏLUMATLARIN YÜKLƏNMƏSİ
     ------------------------------------------------------------------ */

  async function loadContactSettings() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/settings/contact`);
      if (response.ok) {
        contactSettings = await response.json();
      } else {
        contactSettings = { whatsapp_url: FALLBACK_WHATSAPP };
      }
    } catch (_) {
      contactSettings = { whatsapp_url: FALLBACK_WHATSAPP };
    }
  }

  async function loadPlans() {
    setLoading(true);
    hideState();

    // Əvvəlcə cari planı (banner mətnində istifadə olunur)
    let usage = null;
    try {
      const meResponse = await fetchWithAuth("/api/v1/plans/me", { method: "GET" });
      if (meResponse && meResponse.status === 401) {
        // fetchWithAuth artıq redirect etmiş ola bilər
        return;
      }
      if (meResponse && meResponse.ok) {
        usage = await meResponse.json();
        currentPlanId = (usage.plan && usage.plan.id) || "free";
      }
    } catch (err) {
      console.warn("Cari plan yüklənmədi:", err);
    }

    // Plan kataloqu
    let plans = [];
    try {
      const response = await fetchWithAuth("/api/v1/plans", { method: "GET" });

      if (!response) {
        setLoading(false);
        showState(
          "Serverlə əlaqə yaradıla bilmədi",
          "İnternet bağlantınızı yoxlayın və yenidən cəhd edin."
        );
        return;
      }

      if (response.status === 401) {
        clearStoredTokens();
        window.location.href = "auth.html";
        return;
      }

      if (response.status === 403) {
        setLoading(false);
        showState(
          "Giriş tələb olunur",
          "Bu səhifəni görmək üçün repetitor hesabı ilə daxil olmalısınız.",
          false
        );
        return;
      }

      if (!response.ok) {
        setLoading(false);
        showState(
          "Plan məlumatları yüklənmədi",
          "Server xətası baş verdi. Bir az sonra yenidən cəhd edin."
        );
        return;
      }

      const data = await response.json();
      plans = data.plans || [];
    } catch (err) {
      console.error("Plan yükləmə xətası:", err);
      setLoading(false);
      showState(
        "Gözlənilməz xəta",
        "Plan məlumatlarını yüklərkən xəta baş verdi. Səhifəni yeniləməyi sınayın."
      );
      return;
    }

    setLoading(false);

    // Katalog boş → Empty state
    if (!plans.length) {
      showState(
        "Plan məlumatları yoxdur",
        "Abunə planları hələ təyin edilməyib. Tezliklə əlaqə saxlayın.",
        false
      );
      return;
    }

    renderPlans(plans);

    // Cari plan məlumatı varsa göstər
    if (usage) {
      renderCurrentPlanNotice(usage);
      renderUsage(usage);
    }
  }

  /* ------------------------------------------------------------------
     9. İNİSİALİZASİYA
     ------------------------------------------------------------------ */
  if (retryBtn) {
    retryBtn.addEventListener("click", () => loadPlans());
  }

  // Əlaqə məlumatları paralel yüklənir (WhatsApp linki üçün)
  loadContactSettings();
  loadPlans();
});