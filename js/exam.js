"use strict";

// TƏHLÜKƏSİZLİK QEYDİ: Render.com-dakı backend linkini bura yaz.
const API_BASE_URL = "https://SENIN-RENDER-LINKIN.onrender.com"; 

document.addEventListener("DOMContentLoaded", async () => {
    // --- DOM ELEMENTLƏRİ ---
    const overlay = document.getElementById('drawer-overlay');
    const navDrawer = document.getElementById('nav-drawer');
    const profileDrawer = document.getElementById('profile-drawer');
    const menuToggleBtn = document.getElementById('menu-toggle');
    const profileToggleBtn = document.getElementById('profile-toggle');
    const closeBtns = document.querySelectorAll('.close-drawer');
    const examCategoryRadios = document.querySelectorAll('input[name="exam_category"]');
    const generalExamsSection = document.getElementById('general-exams');
    const tutorExamsSection = document.getElementById('tutor-exams');
    const viewLinks = document.querySelectorAll('.drawer-link[data-target]');
    const mainViews = document.querySelectorAll('.main-view');
    const examListContainer = document.getElementById('exam-list-container');
    const logoutBtn = document.getElementById('btn-logout');

    // Profil DOM Elementləri
    const profileNameEl = document.querySelector('.profile-name');
    const profileBalanceEl = document.querySelector('.profile-balance span');

    // --- 1. AUTH GUARD (İstifadəçini yoxla) ---
    const checkAuthAndLoadProfile = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
                method: 'GET',
                credentials: 'include' // HttpOnly cookie-ni göndərir
            });

            if (!response.ok) {
                throw new Error("Sessiya etibarsızdır");
            }

            const user = await response.json();
            
            // XSS Müdafiəsi: textContent istifadə edirik
            profileNameEl.textContent = `${user.first_name} ${user.last_name}`;
            profileBalanceEl.textContent = `${parseFloat(user.balance).toFixed(2)} ₼`;
            
            return user;
        } catch (error) {
            console.error("Auth Error:", error);
            window.location.href = "auth.html"; // Token yoxdursa və ya vaxtı bitibsə qovuruq
        }
    };

    // --- 2. SINAQLARI YÜKLƏMƏ VƏ RENDER ETMƏ (Zero-Trust & XSS Protection) ---
    const renderSkeleton = () => {
        examListContainer.innerHTML = ''; // Əvvəlki məzmunu təmizlə
        for(let i=0; i<3; i++) {
            examListContainer.innerHTML += `
                <div class="skeleton-card">
                    <div class="exam-card-left">
                        <div class="skeleton skeleton-icon"></div>
                        <div class="exam-details" style="flex-direction: column; align-items: flex-start;">
                            <div class="skeleton skeleton-text-title"></div>
                            <div class="skeleton skeleton-text-badge"></div>
                        </div>
                    </div>
                    <div class="skeleton skeleton-btn"></div>
                </div>
            `;
        }
    };

    const renderEmptyState = () => {
        examListContainer.innerHTML = `
            <div class="empty-state">
              <span class="empty-icon">(⁠+⁠_⁠+⁠)</span>
              <p class="empty-text">Hələlik heç bir sınaq yoxdur</p>
            </div>
        `;
    };

    const loadExams = async () => {
        renderSkeleton();
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error("Sınaqları yükləmək mümkün olmadı");

            const exams = await response.json();
            examListContainer.innerHTML = ''; // Skeleton-u sil

            if (exams.length === 0) {
                renderEmptyState();
                return;
            }

            // XSS Müdafiəsi: DOM elementlərini tək-tək yaradırıq (innerHTML QADAĞANDIR)
            exams.forEach(exam => {
                const card = document.createElement('div');
                card.className = 'exam-card';

                // Sol tərəf
                const leftDiv = document.createElement('div');
                leftDiv.className = 'exam-card-left';

                const iconDiv = document.createElement('div');
                iconDiv.className = 'exam-icon';
                iconDiv.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'exam-details';
                detailsDiv.style.flexDirection = 'column';
                detailsDiv.style.alignItems = 'flex-start';
                detailsDiv.style.gap = '4px';

                const title = document.createElement('h3');
                title.className = 'exam-title';
                title.textContent = exam.title; // TƏHLÜKƏSİZ

                const badge = document.createElement('span');
                badge.className = 'exam-badge';
                
                const isFree = parseFloat(exam.price) === 0;
                badge.style.color = isFree ? 'var(--success)' : 'var(--text-main)';
                
                const dot = document.createElement('span');
                dot.className = 'badge-dot-success';
                dot.style.backgroundColor = isFree ? 'var(--success)' : 'var(--accent)';
                
                badge.appendChild(dot);
                badge.appendChild(document.createTextNode(isFree ? ' pulsuz' : ` ${exam.price} ₼`));

                detailsDiv.appendChild(title);
                detailsDiv.appendChild(badge);
                leftDiv.appendChild(iconDiv);
                leftDiv.appendChild(detailsDiv);

                // Sağ tərəf (Düymə)
                const rightDiv = document.createElement('div');
                rightDiv.className = 'exam-card-right';

                const actionBtn = document.createElement('a');
                actionBtn.className = 'btn btn-accent';
                actionBtn.textContent = 'İşlə';
                actionBtn.href = `exam-hall.html?id=${exam.id}`; // Sınaq ID-sini URL-ə qoyuruq

                rightDiv.appendChild(actionBtn);

                // Karta birləşdir
                card.appendChild(leftDiv);
                card.appendChild(rightDiv);

                examListContainer.appendChild(card);
            });

        } catch (error) {
            console.error(error);
            examListContainer.innerHTML = `<div class="empty-state"><p class="empty-text text-danger">Xəta baş verdi. Səhifəni yeniləyin.</p></div>`;
        }
    };

    // --- 3. MENYU VƏ UI MƏNTİQİ ---
    const openDrawer = (drawerElement) => {
        overlay.classList.add('active');
        drawerElement.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeAllDrawers = () => {
        overlay.classList.remove('active');
        navDrawer.classList.remove('active');
        profileDrawer.classList.remove('active');
        document.body.style.overflow = ''; 
    };

    if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => openDrawer(navDrawer));
    if (profileToggleBtn) profileToggleBtn.addEventListener('click', () => openDrawer(profileDrawer));
    if (overlay) overlay.addEventListener('click', closeAllDrawers);
    closeBtns.forEach(btn => btn.addEventListener('click', closeAllDrawers));

    examCategoryRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'general') {
                generalExamsSection.classList.remove('hidden');
                generalExamsSection.classList.add('active');
                tutorExamsSection.classList.remove('active');
                tutorExamsSection.classList.add('hidden');
            } else {
                tutorExamsSection.classList.remove('hidden');
                tutorExamsSection.classList.add('active');
                generalExamsSection.classList.remove('active');
                generalExamsSection.classList.add('hidden');
            }
        });
    });

    viewLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('data-target');
            if (!targetId) return;

            mainViews.forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });

            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            viewLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            closeAllDrawers();
        });
    });

    // --- 4. ÇIXIŞ (LOGOUT) MƏNTİQİ ---
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

    // --- İNİSİALİZASİYA (Səhifə açılanda işləyəcək ardıcıllıq) ---
    await checkAuthAndLoadProfile(); // 1. Kimliyi yoxla
    loadExams(); // 2. Sınaqları gətir
});