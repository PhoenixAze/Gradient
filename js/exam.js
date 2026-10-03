"use strict";

const PROD_API_BASE_URL = "https://gradient-backend-fam5.onrender.com";

/*
 * API ünvanının seçilməsi (.clinerules §2 — Secrets).
 * Lokal rejimdə (Live Server / `file://`) nisli yol heç bir serverə getmir →
 * brauzer "Failed to fetch" atır. Proxy işləmirsə birbaşa production backend.
 * Burada HƏR GÜN açar/CƏDVƏL ADI yoxdur — yalnız public API domeni.
 */
const host = typeof window !== "undefined" ? window.location.hostname : "";
const isLocalDev =
  host === "" || host === "localhost" || host === "127.0.0.1" || host === "::1";
const isProductionFrontend = typeof window !== "undefined" && (
  window.location.hostname === "phoenixaze.github.io" ||
  window.location.hostname.endsWith("github.io") ||
  window.location.hostname === "gradient.az" ||
  window.location.hostname === "www.gradient.az"
);
const useProxy = typeof window !== "undefined" &&
  window.location.protocol === "http:" &&
  !isLocalDev;
const API_BASE_URL = (isProductionFrontend || !useProxy)
  ? PROD_API_BASE_URL
  : "";

// Bildiriş (toast) — bütün stiller .toast klassı ilə CSS-dən gəlir.
// ƏVVƏL: element JS ilə yaradılırdı və inline style istifadə edirdi
// (təhlükəsizlik: CSS injection riski) + `var(--surface)` bu səhifədə
// mövcud DEYİLDİ, ona görə fon rəngi həll olunmurdu.
// DOMContentLoaded-dan ƏVVƏL icra olunduğu üçün bu element hələ mövcud olmur.
// Query dəstəklənir: funksiyalar yalnız hadisə baş verdikdən sonra çağırılır.
const toastRegion = document.getElementById('toast-region');

function showNotification(message, type) {
    if (!toastRegion) return;

    const variant = ['success', 'error', 'warning'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    // XSS müdafiəsi: yalnız textContent (innerHTML qadağandır).
    toast.textContent = String(message || '');

    toastRegion.appendChild(toast);
    // Reflow — keçid animasiyasının işləməsi üçün
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
    // Token Köməkçiləri (Third-party cookie bloklaması və Safari/Mobil brauzerlər üçün)
    function getStoredToken() {
        try {
            // Təhlükəsizlik: access token yalnız sessionStorage-da saxlanılır
            // (XSS ilə uzunömürlü token oğurlanmasının qarşısı alınır).
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

    // --- QLOBAL API İDARƏEDİCİSİ (ZERO-TRUST, COOKIE + DUAL TOKEN) ---
    async function fetchWithAuth(endpoint, options = {}) {
        options.credentials = 'include';
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

        // Əgər Access Token bitibsə (401)
        if (response && response.status === 401) {
            try {
                const rfToken = getStoredRefreshToken();
                const refreshHeaders = {};
                if (rfToken) {
                    refreshHeaders["x-refresh-token"] = rfToken;
                    refreshHeaders["Authorization"] = `Bearer ${rfToken}`;
                }

                // Refresh Token ilə yeni Access Token al
                const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
                    method: 'POST',
                    headers: refreshHeaders,
                    credentials: 'include'
                });

                if (refreshResponse && refreshResponse.ok) {
                    const rfData = await refreshResponse.json().catch(() => ({}));
                    if (rfData && rfData.access_token) {
                        setStoredTokens(rfData.access_token, rfData.refresh_token);
                        options.headers["Authorization"] = `Bearer ${rfData.access_token}`;
                    }
                    // Token yeniləndi, orijinal sorğunu təkrarla
                    response = await fetch(`${API_BASE_URL}${endpoint}`, options);
                } else {
                    clearStoredTokens();
                    // Refresh token də bitib -> Çıxış et
                    window.location.href = "auth.html";
                    return null;
                }
            } catch (error) {
                console.error("Token yenilənmə xətası:", error);
                clearStoredTokens();
                window.location.href = "auth.html";
                return null;
            }
        }
        return response;
    }

    // --- DOM ELEMENTLƏRİ ---
    const overlay = document.getElementById('drawer-overlay');
    const profileDrawer = document.getElementById('profile-drawer');
    const profileToggleBtn = document.getElementById('profile-toggle');
    const closeBtns = document.querySelectorAll('.close-drawer');
    
    const viewLinks = document.querySelectorAll('.drawer-link[data-target]');
    const mainViews = document.querySelectorAll('.main-view');
    const goHomeBtns = document.querySelectorAll('.go-home-btn');
    const brandLogo = document.getElementById('brand-logo');
    
    const examListContainer = document.getElementById('exam-list-container');
    const completedExamListContainer = document.getElementById('completed-exam-list-container');
    const logoutBtn = document.getElementById('btn-logout');

    const profileNameEl = document.querySelector('.profile-name');
    const profileBalanceEl = document.querySelector('.profile-balance span');
    const btnTopup = document.getElementById('btn-topup');

    // Axtarış və Filtr elementləri
    const searchInput = document.getElementById('search-exam');
    const filterSubject = document.getElementById('filter-subject');
    const filterPrice = document.getElementById('filter-price');
    const resultsCount = document.getElementById('exam-results-count');

    // Tənzimləmələr və Əlaqə
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const contactEmailEl = document.getElementById('contact-email');
    const contactPhoneEl = document.getElementById('contact-phone');

    // Qlobal Dəyişənlər
    let currentUser = null;
    let allExams = [];
    let contactSettings = null;

    // --- 1. THEME (GECƏ/GÜNDÜZ REJİMİ) ---
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (savedTheme === 'dark') {
            themeToggleCheckbox.checked = true;
        }
    };

    themeToggleCheckbox.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    initTheme();

    // --- 2. AUTH GUARD VƏ PROFİL ---
    const checkAuthAndLoadProfile = async () => {
        try {
            const response = await fetchWithAuth("/api/v1/users/me", { method: 'GET' });

            if (!response) return;

            // 500, 502, 503 kimi server oyanış xətalarında yönləndirmə etmirik, gözləmə vəziyyətində saxlayırıq
            if (!response.ok) {
                // BUG DÜZƏLİŞİ: əvvəl bütün səhvlər üçün "Serverlə əlaqə qurulur..."
                // göstərilirdi. 401/403 halında bu mesaj tamamilə yanıltıcıdır —
                // istifadəçi ya daxil olmayıb, ya da giriş hüququ yoxdur.
                if (response.status === 401 || response.status === 403) {
                    if (profileNameEl) profileNameEl.textContent = "Giriş tələb olunur";
                    return;
                }
                if (profileNameEl) profileNameEl.textContent = "Serverlə əlaqə qurulur...";
                return;
            }

            currentUser = await response.json();
            if (profileNameEl) {
                profileNameEl.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'İstifadəçi';
            }
            if (profileBalanceEl) {
                profileBalanceEl.textContent = `${parseFloat(currentUser.balance || 0).toFixed(2)} ₼`;
            }
        } catch (error) {
            // Şəbəkə xətalarında və ya server yuxuda olarkən yönləndirmə etmirik
            console.error("Auth Guard Network Error:", error);
            if (profileNameEl) profileNameEl.textContent = "Server yuxudan oyanır, gözləyin...";
        }
    };

    // --- 3. SETTINGS VƏ ƏLAQƏ MƏLUMATLARININ YÜKLƏNMƏSİ ---
    const loadContactSettings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/settings/contact`);
            if (response.ok) {
                contactSettings = await response.json();
            } else {
                throw new Error("Settings not found");
            }
        } catch (error) {
            console.warn("Contact settings fallback aktivləşdirildi:", error);
            contactSettings = {
                whatsapp_url: "https://wa.me/994505975697",
                email: "support@gradient.az",
                phone: "+994 50 597 56 97"
            };
        }

        if (contactEmailEl && contactSettings.email) {
            contactEmailEl.textContent = contactSettings.email;
        }
        if (contactPhoneEl && contactSettings.phone) {
            contactPhoneEl.textContent = contactSettings.phone;
        }
    };

    if (btnTopup) {
        btnTopup.addEventListener('click', () => {
            if (contactSettings && contactSettings.whatsapp_url) {
                window.open(contactSettings.whatsapp_url, '_blank', 'noopener,noreferrer');
            } else {
                showNotification("Əlaqə məlumatı yüklənməyib.", 'error');
            }
        });
    }

    // --- 4. SINAQLARI YÜKLƏMƏ VƏ RENDER ETMƏ ---
    // Skeleton Loader — yalnız təhlükəsiz DOM API-ları (createElement).
    // .clinerules §2: innerHTML qadağandır (XSS riski).
    const renderSkeleton = (container) => {
        container.replaceChildren();
        for (let i = 0; i < 2; i++) {
            const card = document.createElement('div');
            card.className = 'skeleton-card';

            const left = document.createElement('div');
            left.className = 'exam-card-left';

            const icon = document.createElement('div');
            icon.className = 'skeleton skeleton-icon';

            const details = document.createElement('div');
            details.className = 'exam-details';

            const titleSk = document.createElement('div');
            titleSk.className = 'skeleton skeleton-text-title';

            const metaSk = document.createElement('div');
            metaSk.className = 'skeleton skeleton-text-meta';

            details.append(titleSk, metaSk);
            left.append(icon, details);

            const btnSk = document.createElement('div');
            btnSk.className = 'skeleton skeleton-btn';

            card.append(left, btnSk);
            container.appendChild(card);
        }
    };

    /**
     * Təhlükəsiz SVG ikonu yaradır.
     * Əvvəlki kod innerHTML ilə sabit SVG yazırdı — bu, .clinerules-də qadağan idi.
     * İndi createElementNS ilə real SVG elementləri qurulur (XSS riski yoxdur).
     */
    const createSvgIcon = (size, pathData) => {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        pathData.forEach(([tag, attrs]) => {
            const el = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            svg.appendChild(el);
        });
        return svg;
    };

    const ICON_FILE = [
        ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
        ['polyline', { points: '14 2 14 8 20 8' }],
        ['line', { x1: '16', y1: '13', x2: '8', y2: '13' }],
        ['line', { x1: '16', y1: '17', x2: '8', y2: '17' }],
        ['polyline', { points: '10 9 9 9 8 9' }]
    ];

    const ICON_CLOCK = [
        ['circle', { cx: '12', cy: '12', r: '10' }],
        ['polyline', { points: '12 6 12 12 16 14' }]
    ];

    const ICON_LIST = [
        ['line', { x1: '8', y1: '6', x2: '21', y2: '6' }],
        ['line', { x1: '8', y1: '12', x2: '21', y2: '12' }],
        ['line', { x1: '8', y1: '18', x2: '21', y2: '18' }],
        ['line', { x1: '3', y1: '6', x2: '3.01', y2: '6' }],
        ['line', { x1: '3', y1: '12', x2: '3.01', y2: '12' }],
        ['line', { x1: '3', y1: '18', x2: '3.01', y2: '18' }]
    ];

    const ICON_EMPTY = [
        ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
        ['line', { x1: '16', y1: '13', x2: '8', y2: '13' }],
        ['line', { x1: '16', y1: '17', x2: '8', y2: '17' }]
    ];

    const ICON_ALERT = [
        ['circle', { cx: '12', cy: '12', r: '10' }],
        ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
        ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }]
    ];

    /**
     * Boş/Error vəziyyət kartı.
     * ƏVVƏL: ASCII mətn ikonu "(+_+)" istifadə olunurdu — bu, .clinerules §4
     * (Anti-AI Aesthetic) tələblərinə zidd idi. İndi real SVG istifadə olunur.
     */
    const renderEmptyState = (container, message, options) => {
        const opts = options || {};
        const isError = Boolean(opts.isError);

        const wrap = document.createElement('div');
        wrap.className = isError ? 'empty-state is-error' : 'empty-state';

        const icon = document.createElement('span');
        icon.className = 'empty-icon';
        icon.appendChild(createSvgIcon(24, isError ? ICON_ALERT : ICON_EMPTY));

        const title = document.createElement('h3');
        title.className = 'empty-title';
        title.textContent = opts.title || (isError ? 'Xəta baş verdi' : 'Məlumat yoxdur');

        const text = document.createElement('p');
        text.className = 'empty-text';
        text.textContent = String(message || '');

        wrap.append(icon, title, text);

        // Təkrar cəhd düyməsi (yalnız xəta vəziyyətində)
        if (typeof opts.onRetry === 'function') {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn btn-secondary btn-sm empty-action';
            retry.textContent = 'Yenidən cəhd et';
            retry.addEventListener('click', opts.onRetry);
            wrap.appendChild(retry);
        }

        container.replaceChildren(wrap);
    };

    // Satın alma axını (Purchase Flow)
    //
    // TƏKRAR İŞLƏTMƏ QAYDASI: `opts.isRetake = true` olduqda satın alma
    // addımı TAMAMILA keçilir — çünki backend `purchase` endpoint-i də artıq
    // "bu sınaq alınıb" deyə cavab verir və balansı QİYAMƏTDƏ QOYMUR.
    // Əvvəlki nəticə isə `exam_results`-də qalır, yalnız `exam_attempts`-ə
    // yeni cəhd əlavə olunur (statistika dəyişmir).
    const handleExamPurchaseAndStart = async (exam, btnElement, opts) => {
        const options = opts || {};
        const originalText = btnElement.textContent;
        btnElement.textContent = "Gözləyin...";
        btnElement.disabled = true;

        try {
            // Əgər sınaq pulludursa VƏ təkrar cəhd DEYİLSƏ, purchase çağırılır
            if (!options.isRetake && parseFloat(exam.price) > 0) {
                const res = await fetchWithAuth(`/api/v1/exams/${exam.id}/purchase`, {
                    method: 'POST'
                });

                if (!res) {
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }

                if (res.status === 402) {
                    showNotification("Balansınız kifayət etmir. Zəhmət olmasa balansı artırın.", 'warning');
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }
                
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    // detail backend-dən gələn saf mətn ola bilər; sadəcə string kimi göstərilir.
                    showNotification(errData.detail || "Sınağı almaq mümkün olmadı. Yenidən cəhd edin.", 'error');
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }

                // Balansı interfeysdə dərhal yeniləyirik
                const data = await res.json().catch(() => ({}));
                if (data.new_balance !== undefined && profileBalanceEl) {
                    profileBalanceEl.textContent = `${parseFloat(data.new_balance).toFixed(2)} ₼`;
                }
            }
            
            // Uğurludursa və ya pulsuzdursa, sınaq zalına yönləndir.
            // Qeyd: təkrar cəhd URL-də işarələnmir — cəhd nömrəsi backend-də
            // `exam_attempts` sayımı ilə müəyyən edilir (tək mənbə = səhvi azaldır).
            window.location.href = `exam-hall.html?id=${encodeURIComponent(exam.id)}`;
        } catch (error) {
            console.error("Satın alma xətası:", error);
            showNotification("Sistem xətası baş verdi. Yenidən cəhd edin.", 'error');
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        }
    };

    const createExamCard = (exam, isCompleted) => {
        const card = document.createElement('div');
        card.className = 'exam-card';

        const leftDiv = document.createElement('div');
        leftDiv.className = 'exam-card-left';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'exam-icon';
        iconDiv.appendChild(createSvgIcon(24, ICON_FILE));

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'exam-details';

        const title = document.createElement('h3');
        title.className = 'exam-title';
        title.textContent = exam.title;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'exam-meta';
        
        const duration = exam.duration_minutes || 90; 
        const qCount = exam.question_count || 0;

        // Müddət
        const durItem = document.createElement('div');
        durItem.className = 'meta-item';
        durItem.appendChild(createSvgIcon(14, ICON_CLOCK));
        const durText = document.createElement('span');
        durText.textContent = `${duration} dəq`;
        durItem.appendChild(durText);
        metaDiv.appendChild(durItem);

        // Sual sayı
        const qItem = document.createElement('div');
        qItem.className = 'meta-item';
        qItem.appendChild(createSvgIcon(14, ICON_LIST));
        const qText = document.createElement('span');
        qText.textContent = `${qCount} sual`;
        qItem.appendChild(qText);
        metaDiv.appendChild(qItem);

        // Əgər sınaq bitibsə: "Düzgün / Ümumi Sual" (məs: 15/30 düzgün) formatında sadə mətn
        if (isCompleted) {
            const correct = exam.correct_count !== undefined ? exam.correct_count : 0;
            const scoreItem = document.createElement('div');
            scoreItem.className = 'meta-item';

            const scoreBadge = document.createElement('span');
            // Nəticəyə görə vizual differensiasiya (tək vurğu rəngi qorunur)
            const ratio = qCount > 0 ? correct / qCount : 0;
            if (ratio >= 0.8) scoreBadge.className = 'score-badge is-perfect';
            else if (ratio < 0.5) scoreBadge.className = 'score-badge is-low';
            else scoreBadge.className = 'score-badge';
            scoreBadge.textContent = `${correct}/${qCount} düzgün`;

            scoreItem.appendChild(scoreBadge);
            metaDiv.appendChild(scoreItem);
        }
        
        detailsDiv.appendChild(title);
        detailsDiv.appendChild(metaDiv);

        if (!isCompleted) {
            // ƏVVƏL: badge rəngləri element.style.* ilə JS-dən verilirdi
            // (inline style — .clinerules §3 pozuntusu). İndi CSS klassları ilə.
            const isFree = parseFloat(exam.price) === 0;
            const badge = document.createElement('span');
            badge.className = isFree ? 'exam-badge is-free' : 'exam-badge is-paid';

            const dot = document.createElement('span');
            dot.className = 'badge-dot';

            badge.appendChild(dot);
            badge.appendChild(document.createTextNode(isFree ? 'Pulsuz' : `${exam.price} ₼`));
            detailsDiv.appendChild(badge);
        }
        
        leftDiv.appendChild(iconDiv);
        leftDiv.appendChild(detailsDiv);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'exam-card-right';

        if (isCompleted) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';

            // Cəhd sayı göstəricisi (təkrar işlətmə izi)
            const attemptCount = Number(exam.attempt_count) || 1;
            if (attemptCount > 1) {
                const attemptBadge = document.createElement('span');
                attemptBadge.className = 'score-badge';
                attemptBadge.textContent = `${attemptCount} cəhd`;
                actionsDiv.appendChild(attemptBadge);
            }

            // TƏKRAR İŞLƏTMƏ — pulsuzdur (balans toxunulmur) və limitə uyğundur.
            if (exam.can_retake === false) {
                // Limit dolubsa "Yenidən işlə" düyməsi əvəzinə AÇIQ mesaj göstərilir.
                // "Sənə təsir etməyən nəzərə alınmayan" düymə yoxdur — bu, .clinerules §4
                // (Empty/Error State) tələbidir.
                const limitNote = createSvgIcon(14, ICON_ALERT);
                limitNote.setAttribute('aria-hidden', 'true');
                const limitText = document.createElement('span');
                limitText.textContent = 'Cəhd limiti dolub';
                actionsDiv.appendChild(limitText);
            } else {
                const retakeBtn = document.createElement('button');
                retakeBtn.className = 'btn btn-outline';
                retakeBtn.textContent = 'Yenidən işlə';
                retakeBtn.addEventListener('click', () =>
                    handleExamPurchaseAndStart(exam, retakeBtn, { isRetake: true })
                );
                actionsDiv.appendChild(retakeBtn);
            }

            const analyticsBtn = document.createElement('a');
            analyticsBtn.className = 'btn btn-accent';
            analyticsBtn.textContent = 'Analitika →';
            analyticsBtn.href = `analytics.html?id=${encodeURIComponent(exam.id)}`;

            actionsDiv.appendChild(analyticsBtn);
            rightDiv.appendChild(actionsDiv);
        } else {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'btn btn-accent';
            actionBtn.textContent = 'İşlə';
            actionBtn.addEventListener('click', () => handleExamPurchaseAndStart(exam, actionBtn));
            rightDiv.appendChild(actionBtn);
        }

        card.appendChild(leftDiv);
        card.appendChild(rightDiv);
        return card;
    };

    // Axtarış və Filtr məntiqi
    const filterAndRenderExams = () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const subjectVal = filterSubject.value;
        const priceVal = filterPrice.value;

        examListContainer.replaceChildren();

        const activeExams = allExams.filter(e => !e.is_completed);
        
        const filteredExams = activeExams.filter(exam => {
            const matchSearch = exam.title.toLowerCase().includes(searchTerm);
            const matchSubject = subjectVal === 'all' || exam.subject === subjectVal;
            
            let matchPrice = true;
            if (priceVal === 'free') matchPrice = parseFloat(exam.price) === 0;
            if (priceVal === 'paid') matchPrice = parseFloat(exam.price) > 0;

            return matchSearch && matchSubject && matchPrice;
        });

        if (filteredExams.length === 0) {
            renderEmptyState(examListContainer, 'Axtarış və filtr şərtlərinə uyğun sınaq tapılmadı.', {
                title: 'Sınaq tapılmadı'
            });
        } else {
            filteredExams.forEach(exam => {
                examListContainer.appendChild(createExamCard(exam, false));
            });
        }

        // Nəticə sayğacı (a11y: aria-live ilə elan edilir)
        if (resultsCount) {
            const total = allExams.filter(e => !e.is_completed).length;
            resultsCount.textContent = filteredExams.length === total
                ? `${total} sınaq`
                : `${filteredExams.length} / ${total} sınaq`;
        }
    };

    // Fənn filtrini dinamik doldurmaq
    const populateSubjectFilter = (exams) => {
        const uniqueSubjects = [...new Set(exams.map(e => e.subject).filter(Boolean))];
        
        filterSubject.replaceChildren();
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'Bütün fənlər';
        filterSubject.appendChild(allOption);

        uniqueSubjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            filterSubject.appendChild(option);
        });
    };

    const loadExams = async () => {
        renderSkeleton(examListContainer);
        renderSkeleton(completedExamListContainer);
        
        try {
            const response = await fetchWithAuth("/api/v1/exams/", {
                method: 'GET'
            });

            if (!response || !response.ok) throw new Error("Sınaqları yükləmək mümkün olmadı");

            allExams = await response.json();
            
            // Fənn filtrini dinamik doldur
            populateSubjectFilter(allExams);

            // Aktiv sınaqları render et
            filterAndRenderExams();

            // Bitmiş sınaqları render et
            completedExamListContainer.replaceChildren();
            const completedExams = allExams.filter(e => e.is_completed);

            if (completedExams.length === 0) {
                renderEmptyState(completedExamListContainer, 'İşlədiyiniz sınaqlar burada görünəcək. Uğurlu olar!', {
                    title: 'Hələ heç bir sınaq bitirməmisiniz'
                });
            } else {
                completedExams.forEach(exam => {
                    completedExamListContainer.appendChild(createExamCard(exam, true));
                });
            }

        } catch (error) {
            // Texniki detallar (stack trace, DB məlumatı) istifadəçiyə SIZDIRILMIR —
            // .clinerules §1: yalnız ümumi mesaj + təkrar cəhd.
            console.error("Sınaqları yükləmək mümkün olmadı:", error);
            renderEmptyState(examListContainer, 'Sınaqları yükləmək mümkün olmadı. Şəbəkə bağlantısını yoxlayın.', {
                isError: true,
                title: 'Yüklənmə xətası',
                onRetry: loadExams
            });
            renderEmptyState(completedExamListContainer, 'Məlumat yüklənmədi.', {
                isError: true,
                title: 'Yüklənmə xətası',
                onRetry: loadExams
            });
            if (resultsCount) resultsCount.textContent = '';
        }
    };

    // Axtarış üçün debounce — hər klaviatura vuruşunda yenidən render
    // etmək yerine 250ms gözləyir (performans).
    const debounce = (fn, delay) => {
        let timer = null;
        return (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    };

    // Event Listeners for Search & Filter
    searchInput.addEventListener('input', debounce(filterAndRenderExams, 250));
    filterSubject.addEventListener('change', filterAndRenderExams);
    filterPrice.addEventListener('change', filterAndRenderExams);

    // --- 5. MENYU VƏ UI MƏNTİQİ ---
    const openDrawer = (drawerElement) => {
        overlay.classList.add('active');
        drawerElement.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeAllDrawers = () => {
        overlay.classList.remove('active');
        profileDrawer.classList.remove('active');
        document.body.style.overflow = ''; 
    };

    const switchView = (targetId) => {
        mainViews.forEach(view => {
            view.classList.remove('active');
            view.classList.add('hidden');
        });
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('active');
        }
        closeAllDrawers();
    };

    if (profileToggleBtn) profileToggleBtn.addEventListener('click', () => openDrawer(profileDrawer));
    if (overlay) overlay.addEventListener('click', closeAllDrawers);
    closeBtns.forEach(btn => btn.addEventListener('click', closeAllDrawers));

    viewLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('data-target');
            if (!targetId) return;
            
            viewLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            switchView(targetId);
        });
    });

    const goHome = (e) => {
        e.preventDefault();
        viewLinks.forEach(l => l.classList.remove('active'));
        switchView('view-exams');
    };

    goHomeBtns.forEach(btn => btn.addEventListener('click', goHome));
    if (brandLogo) brandLogo.addEventListener('click', goHome);

    // --- 6. ÇIXIŞ (LOGOUT) ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (e) { console.error(e); }
            try {
                sessionStorage.removeItem("gradient_access_token");
                localStorage.removeItem("gradient_access_token");
                sessionStorage.removeItem("gradient_refresh_token");
                localStorage.removeItem("gradient_refresh_token");
            } catch (_) {}
            window.location.href = "auth.html";
        });
    }

    // --- 7. ŞAGİRD REPETİTOR İDARƏETMƏSİ (4 RƏQƏMLİ KOD VƏ İSTƏK) ---
    const quickTutorBanner = document.getElementById("quick-tutor-banner");
    const quickTutorTitle = document.getElementById("quick-tutor-title");
    const quickTutorSub = document.getElementById("quick-tutor-sub");
    const drawerStudentTutorPill = document.getElementById("drawer-student-tutor-pill");
    
    const tutorConnectedCard = document.getElementById("tutor-connected-card");
    const connectedTutorName = document.getElementById("connected-tutor-name");
    const connectedTutorSubject = document.getElementById("connected-tutor-subject");
    const connectedTutorCode = document.getElementById("connected-tutor-code");
    const btnLeaveTutor = document.getElementById("btn-leave-tutor");

    const tutorPendingCard = document.getElementById("tutor-pending-card");
    const pendingTutorName = document.getElementById("pending-tutor-name");
    const pendingTutorDesc = document.getElementById("pending-tutor-desc");
    const btnCancelTutorRequest = document.getElementById("btn-cancel-tutor-request");

    const tutorStatusSkeleton = document.getElementById("tutor-status-skeleton");
    const tutorJoinCard = document.getElementById("tutor-join-card");
    const formJoinTutor = document.getElementById("form-join-tutor");
    const inputTutorCode = document.getElementById("input-tutor-code");
    const btnSubmitJoinTutor = document.getElementById("btn-submit-join-tutor");
    const tutorJoinFeedback = document.getElementById("tutor-join-feedback");

    const loadStudentTutorStatus = async () => {
        // .clinerules §4: dinamik yüklənən blok üçün animasiyalı skeleton
        if (tutorStatusSkeleton) tutorStatusSkeleton.classList.remove("hidden");
        try {
            const res = await fetchWithAuth("/api/v1/tutor/my-request", { method: "GET" });
            if (!res || !res.ok) return;
            const data = await res.json();

            // 1. Şagird aktiv repetitor qrupundadır
            if (data.has_tutor && data.tutor) {
                if (tutorConnectedCard) tutorConnectedCard.classList.remove("hidden");
                if (tutorPendingCard) tutorPendingCard.classList.add("hidden");
                if (tutorJoinCard) tutorJoinCard.classList.add("hidden");

                if (connectedTutorName) connectedTutorName.textContent = data.tutor.name || "Repetitor";
                if (connectedTutorSubject) connectedTutorSubject.textContent = `Fənn: ${data.tutor.subject || "Ümumi"}`;
                if (connectedTutorCode) connectedTutorCode.textContent = data.tutor.code || "----";

                if (drawerStudentTutorPill) {
                    drawerStudentTutorPill.textContent = `Repetitor: ${data.tutor.name || "Aktiv"} (Kod: ${data.tutor.code || "-"})`;
                }
                if (quickTutorTitle) quickTutorTitle.textContent = `Aktiv Qrup: ${data.tutor.name || "Müəllim"}`;
                if (quickTutorSub) quickTutorSub.textContent = `Fənn: ${data.tutor.subject || "Ümumi"} • Repetitor Kodu: ${data.tutor.code || "-"}`;
                return;
            }

            // 2. Şagirdin gözləyən istəyi var
            if (data.pending_request) {
                if (tutorConnectedCard) tutorConnectedCard.classList.add("hidden");
                if (tutorPendingCard) tutorPendingCard.classList.remove("hidden");
                if (tutorJoinCard) tutorJoinCard.classList.add("hidden");

                if (pendingTutorName) pendingTutorName.textContent = data.pending_request.tutor_name || "Repetitor";
                if (pendingTutorDesc) {
                    pendingTutorDesc.textContent = `${data.pending_request.tutor_name || "Müəllimə"} qoşulma istəyiniz göndərilib. Müəllim təsdiq etdikdən sonra qrupa daxil olacaqsınız.`;
                }

                if (drawerStudentTutorPill) {
                    drawerStudentTutorPill.textContent = "Repetitor: Təsdiq gözlənilir";
                }
                if (quickTutorTitle) quickTutorTitle.textContent = "Qoşulma İstəyi Göndərilib";
                if (quickTutorSub) quickTutorSub.textContent = `${data.pending_request.tutor_name || "Müəllim"} tərəfindən təsdiq gözlənilir`;
                return;
            }

            // 3. Heç bir repetitor və ya istək yoxdur
            if (tutorConnectedCard) tutorConnectedCard.classList.add("hidden");
            if (tutorPendingCard) tutorPendingCard.classList.add("hidden");
            if (tutorJoinCard) tutorJoinCard.classList.remove("hidden");

            if (drawerStudentTutorPill) {
                drawerStudentTutorPill.textContent = "Repetitor: Yoxdur";
            }
            if (quickTutorTitle) quickTutorTitle.textContent = "Repetitor Qrupuna Qoşul";
            if (quickTutorSub) quickTutorSub.textContent = "Müəlliminizin 4 rəqəmli kodunu daxil edərək fərdi sınaqları qəbul edin";

        } catch (e) {
            console.error("Student tutor status error:", e);
        } finally {
            if (tutorStatusSkeleton) tutorStatusSkeleton.classList.add("hidden");
        }
    };

    // 4 rəqəmli kod göndərmə
    if (formJoinTutor) {
        formJoinTutor.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (tutorJoinFeedback) {
                tutorJoinFeedback.classList.add("hidden");
                tutorJoinFeedback.textContent = "";
            }

            const code = (inputTutorCode ? inputTutorCode.value : "").trim();
            if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
                if (tutorJoinFeedback) {
                    tutorJoinFeedback.textContent = "Zəhmət olmasa düzgün 4 rəqəmli kod daxil edin (məs: 4829).";
                    tutorJoinFeedback.className = "alert alert-danger";
                    tutorJoinFeedback.classList.remove("hidden");
                }
                return;
            }

            const btnText = btnSubmitJoinTutor ? btnSubmitJoinTutor.querySelector(".btn-text") : null;
            const loader = btnSubmitJoinTutor ? btnSubmitJoinTutor.querySelector(".loader") : null;
            if (btnText) btnText.classList.add("hidden");
            if (loader) loader.classList.remove("hidden");
            if (btnSubmitJoinTutor) btnSubmitJoinTutor.disabled = true;

            try {
                const res = await fetchWithAuth("/api/v1/tutor/requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tutor_code: code })
                });

                if (!res) throw new Error("Serverlə əlaqə yaradıla bilmədi.");
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || "İstək göndərilərkən xəta baş verdi.");
                }

                showNotification(data.message || "Qoşulma istəyi repetitora göndərildi!", 'success');
                if (tutorJoinFeedback) {
                    tutorJoinFeedback.textContent = data.message || "İstək uğurla göndərildi!";
                    // BUG DÜZƏLİŞİ: "auth-alert" sinifi yalnız css/auth.css-də təyin
                    // olunub, bu səhifədə o fayl yüklənmir — stil itirdi.
                    tutorJoinFeedback.className = "alert alert-success";
                    tutorJoinFeedback.classList.remove("hidden");
                }
                if (inputTutorCode) inputTutorCode.value = "";
                await loadStudentTutorStatus();

            } catch (err) {
                if (tutorJoinFeedback) {
                    tutorJoinFeedback.textContent = err.message;
                    tutorJoinFeedback.className = "alert alert-danger";
                    tutorJoinFeedback.classList.remove("hidden");
                }
            } finally {
                if (btnText) btnText.classList.remove("hidden");
                if (loader) loader.classList.add("hidden");
                if (btnSubmitJoinTutor) btnSubmitJoinTutor.disabled = false;
            }
        });
    }

    // İstəyi ləğv et
    if (btnCancelTutorRequest) {
        btnCancelTutorRequest.addEventListener("click", async () => {
            if (!confirm("Qoşulma istəyini ləğv etmək istədiyinizdən əminsiniz?")) return;
            try {
                const res = await fetchWithAuth("/api/v1/tutor/my-request", { method: "DELETE" });
                if (res && res.ok) {
                    showNotification("İstək ləğv edildi.", 'success');
                    await loadStudentTutorStatus();
                } else {
                    const err = res ? await res.json().catch(() => ({})) : {};
                    showNotification(err.detail || "İstəyi ləğv etmək mümkün olmadı.", 'error');
                }
            } catch (e) {
                console.error("İstək ləğv etmə xətası:", e);
                showNotification("İstəyi ləğv etmək mümkün olmadı.", 'error');
            }
        });
    }

    // Qrupdan ayrıl
    if (btnLeaveTutor) {
        btnLeaveTutor.addEventListener("click", async () => {
            if (!confirm("Repetitor qrupundan ayrılmaq istədiyinizdən əminsiniz?")) return;
            const originalText = btnLeaveTutor.textContent;
            btnLeaveTutor.disabled = true;
            btnLeaveTutor.textContent = "Gözlənilir...";
            try {
                const res = await fetchWithAuth("/api/v1/tutor/leave", { method: "POST" });
                if (res && res.ok) {
                    showNotification("Repetitor qrupundan ayrıldınız.", 'success');
                    await loadStudentTutorStatus();
                } else {
                    const err = res ? await res.json().catch(() => ({})) : {};
                    showNotification(err.detail || "Qrupdan ayrılmaq mümkün olmadı.", 'error');
                }
            } catch (e) {
                console.error("Qrupdan ayrılma xətası:", e);
                showNotification("Qrupdan ayrılmaq mümkün olmadı.", 'error');
            } finally {
                btnLeaveTutor.disabled = false;
                btnLeaveTutor.textContent = originalText;
            }
        });
    }

    if (quickTutorBanner) {
        quickTutorBanner.addEventListener("click", () => {
            viewLinks.forEach(l => l.classList.remove('active'));
            const tutorLink = document.querySelector('.drawer-link[data-target="view-tutor"]');
            if (tutorLink) tutorLink.classList.add('active');
            switchView("view-tutor");
        });
    }

    // --- İNİSİALİZASİYA ---
    await checkAuthAndLoadProfile();
    await loadContactSettings();
    await loadStudentTutorStatus();
    loadExams();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("view") === "tutor" || window.location.hash === "#view-tutor") {
        viewLinks.forEach(l => l.classList.remove('active'));
        const tutorLink = document.querySelector('.drawer-link[data-target="view-tutor"]');
        if (tutorLink) tutorLink.classList.add('active');
        switchView("view-tutor");
    }
});