"use strict";

const API_BASE_URL = "https://gradient-backend-fam5.onrender.com"; 

document.addEventListener("DOMContentLoaded", async () => {
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
            const response = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
                method: 'GET',
                credentials: 'include'
            });

            // Təhlükəsizlik: Yalnız 401 Unauthorized olduqda yönləndiririk
            if (response.status === 401) {
                window.location.href = "auth.html";
                return;
            }

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
                alert("Əlaqə məlumatı yüklənməyib.");
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
                const res = await fetch(`${API_BASE_URL}/api/v1/exams/${exam.id}/purchase`, {
                    method: 'POST',
                    credentials: 'include'
                });

                if (res.status === 402) {
                    alert("Balansınız kifayət etmir. Zəhmət olmasa balansı artırın.");
                    btnElement.textContent = originalText;
                    btnElement.disabled = false;
                    return;
                }
                
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    alert(errData.detail || "Sınağı almaq mümkün olmadı. Yenidən cəhd edin.");
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
            alert("Sistem xətası baş verdi. Yenidən cəhd edin.");
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
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error("Sınaqları yükləmək mümkün olmadı");

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
            window.location.href = "auth.html";
        });
    }

    // --- İNİSİALİZASİYA ---
    await checkAuthAndLoadProfile();
    await loadContactSettings();
    loadExams();
});