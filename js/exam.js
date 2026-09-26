"use strict";

const isProductionFrontend = typeof window !== "undefined" && (
  window.location.hostname === "phoenixaze.github.io" ||
  window.location.hostname.endsWith("github.io") ||
  window.location.hostname === "gradient.az" ||
  window.location.hostname === "www.gradient.az"
);
const API_BASE_URL = isProductionFrontend
  ? "https://gradient-backend-fam5.onrender.com"
  : ""; 

function showNotification(message) {
    let toast = document.getElementById('gradient-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gradient-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.zIndex = '9999';
        toast.style.backgroundColor = 'var(--surface)';
        toast.style.color = 'var(--text-main)';
        toast.style.border = '1px solid var(--border)';
        toast.style.borderRadius = '10px';
        toast.style.padding = '12px 20px';
        toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
        toast.style.fontWeight = '500';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 4000);
} 

document.addEventListener("DOMContentLoaded", async () => {
    // Token Köməkçiləri (Third-party cookie bloklaması və Safari/Mobil brauzerlər üçün)
    function getStoredToken() {
        try {
            return sessionStorage.getItem("gradient_access_token") || localStorage.getItem("gradient_access_token") || "";
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
                localStorage.setItem("gradient_access_token", accessToken);
            }
            if (refreshToken) {
                localStorage.setItem("gradient_refresh_token", refreshToken);
                sessionStorage.setItem("gradient_refresh_token", refreshToken);
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
                showNotification("Əlaqə məlumatı yüklənməyib.");
            }
        });
    }

    // --- 4. SINAQLARI YÜKLƏMƏ VƏ RENDER ETMƏ ---
    const renderSkeleton = (container) => {
        container.innerHTML = ''; 
        for(let i=0; i<2; i++) {
            container.innerHTML += `
                <div class="skeleton-card">
                    <div class="exam-card-left">
                        <div class="skeleton skeleton-icon"></div>
                        <div class="exam-details">
                            <div class="skeleton skeleton-text-title"></div>
                            <div class="skeleton skeleton-text-meta"></div>
                        </div>
                    </div>
                    <div class="skeleton skeleton-btn"></div>
                </div>
            `;
        }
    };

    const renderEmptyState = (container, message) => {
        container.innerHTML = `
            <div class="empty-state">
              <span class="empty-icon">(⁠+⁠_⁠+⁠)</span>
              <p class="empty-text">${message}</p>
            </div>
        `;
    };

    // Satın alma axını (Purchase Flow)
    const handleExamPurchaseAndStart = async (exam, btnElement) => {
        const originalText = btnElement.textContent;
        btnElement.textContent = "Gözləyin...";
        btnElement.disabled = true;

        try {
            // Əgər sınaq pulludursa, backend-də purchase endpoint-inə müraciət edirik
            if (parseFloat(exam.price) > 0) {
                const res = await fetchWithAuth(`/api/v1/exams/${exam.id}/purchase`, {
                    method: 'POST'
                });

                if (!res) {
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }

                if (res.status === 402) {
                    showNotification("Balansınız kifayət etmir. Zəhmət olmasa balansı artırın.");
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }
                
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    showNotification(errData.detail || "Sınağı almaq mümkün olmadı. Yenidən cəhd edin.");
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
            
            // Uğurludursa və ya pulsuzdursa, sınaq zalına yönləndir
            window.location.href = `exam-hall.html?id=${encodeURIComponent(exam.id)}`;
        } catch (error) {
            console.error("Satın alma xətası:", error);
            showNotification("Sistem xətası baş verdi. Yenidən cəhd edin.");
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
        iconDiv.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

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
        durItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
        const durText = document.createElement('span');
        durText.textContent = `${duration} dəq`;
        durItem.appendChild(durText);
        metaDiv.appendChild(durItem);

        // Sual sayı
        const qItem = document.createElement('div');
        qItem.className = 'meta-item';
        qItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
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
            scoreBadge.className = 'score-badge';
            scoreBadge.textContent = `${correct}/${qCount} düzgün`;
            
            scoreItem.appendChild(scoreBadge);
            metaDiv.appendChild(scoreItem);
        }
        
        detailsDiv.appendChild(title);
        detailsDiv.appendChild(metaDiv);

        if (!isCompleted) {
            const badge = document.createElement('span');
            badge.className = 'exam-badge';
            const isFree = parseFloat(exam.price) === 0;
            badge.style.color = isFree ? 'var(--success)' : 'var(--text-main)';
            
            const dot = document.createElement('span');
            dot.className = 'badge-dot-success';
            dot.style.backgroundColor = isFree ? 'var(--success)' : 'var(--accent)';
            
            badge.appendChild(dot);
            badge.appendChild(document.createTextNode(isFree ? ' pulsuz' : ` ${exam.price} ₼`));
            detailsDiv.appendChild(badge);
        }
        
        leftDiv.appendChild(iconDiv);
        leftDiv.appendChild(detailsDiv);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'exam-card-right';

        if (isCompleted) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';

            const retakeBtn = document.createElement('button');
            retakeBtn.className = 'btn btn-outline';
            retakeBtn.textContent = 'Yenidən işlə';
            retakeBtn.addEventListener('click', () => handleExamPurchaseAndStart(exam, retakeBtn));

            const analyticsBtn = document.createElement('a');
            analyticsBtn.className = 'btn btn-accent';
            analyticsBtn.textContent = 'Analitika →';
            analyticsBtn.href = `analytics.html?id=${encodeURIComponent(exam.id)}`;

            actionsDiv.appendChild(retakeBtn);
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

        examListContainer.innerHTML = '';

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
            renderEmptyState(examListContainer, "Axtarışa uyğun sınaq tapılmadı");
        } else {
            filteredExams.forEach(exam => {
                examListContainer.appendChild(createExamCard(exam, false));
            });
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
            completedExamListContainer.innerHTML = '';
            const completedExams = allExams.filter(e => e.is_completed);

            if (completedExams.length === 0) {
                renderEmptyState(completedExamListContainer, "Hələ heç bir sınaq bitirməmisiniz");
            } else {
                completedExams.forEach(exam => {
                    completedExamListContainer.appendChild(createExamCard(exam, true));
                });
            }

        } catch (error) {
            console.error(error);
            examListContainer.innerHTML = `<div class="empty-state"><p class="empty-text text-danger">Xəta baş verdi. Səhifəni yeniləyin.</p></div>`;
            completedExamListContainer.innerHTML = `<div class="empty-state"><p class="empty-text text-danger">Xəta baş verdi.</p></div>`;
        }
    };

    // Event Listeners for Search & Filter
    searchInput.addEventListener('input', filterAndRenderExams);
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

    const tutorJoinCard = document.getElementById("tutor-join-card");
    const formJoinTutor = document.getElementById("form-join-tutor");
    const inputTutorCode = document.getElementById("input-tutor-code");
    const btnSubmitJoinTutor = document.getElementById("btn-submit-join-tutor");
    const tutorJoinFeedback = document.getElementById("tutor-join-feedback");

    const loadStudentTutorStatus = async () => {
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
                    tutorJoinFeedback.className = "auth-alert alert-danger";
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

                showNotification(data.message || "Qoşulma istəyi repetitora göndərildi!");
                if (tutorJoinFeedback) {
                    tutorJoinFeedback.textContent = data.message || "İstək uğurla göndərildi!";
                    tutorJoinFeedback.className = "auth-alert alert-success";
                    tutorJoinFeedback.classList.remove("hidden");
                }
                if (inputTutorCode) inputTutorCode.value = "";
                await loadStudentTutorStatus();

            } catch (err) {
                if (tutorJoinFeedback) {
                    tutorJoinFeedback.textContent = err.message;
                    tutorJoinFeedback.className = "auth-alert alert-danger";
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
                    showNotification("İstək ləğv edildi.");
                    await loadStudentTutorStatus();
                } else {
                    const err = res ? await res.json().catch(() => ({})) : {};
                    alert(err.detail || "İstəyi ləğv etmək mümkün olmadı.");
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    // Qrupdan ayrıl
    if (btnLeaveTutor) {
        btnLeaveTutor.addEventListener("click", async () => {
            if (!confirm("Repetitor qrupundan ayrılmaq istədiyinizdən əminsiniz?")) return;
            try {
                const res = await fetchWithAuth("/api/v1/tutor/leave", { method: "POST" });
                if (res && res.ok) {
                    showNotification("Repetitor qrupundan ayrıldınız.");
                    await loadStudentTutorStatus();
                } else {
                    const err = res ? await res.json().catch(() => ({})) : {};
                    alert(err.detail || "Qrupdan ayrılmaq mümkün olmadı.");
                }
            } catch (e) {
                console.error(e);
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