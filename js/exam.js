"use strict";

const API_BASE_URL = "https://gradient-backend-fam5.onrender.com"; 

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
    const goHomeBtns = document.querySelectorAll('.go-home-btn');
    const brandLogo = document.getElementById('brand-logo');
    
    const examListContainer = document.getElementById('exam-list-container');
    const completedExamListContainer = document.getElementById('completed-exam-list-container');
    const logoutBtn = document.getElementById('btn-logout');

    const profileNameEl = document.querySelector('.profile-name');
    const profileBalanceEl = document.querySelector('.profile-balance span');

    // --- 1. AUTH GUARD ---
    const checkAuthAndLoadProfile = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error("Sessiya etibarsızdır");

            const user = await response.json();
            profileNameEl.textContent = `${user.first_name} ${user.last_name}`;
            profileBalanceEl.textContent = `${parseFloat(user.balance).toFixed(2)} ₼`;
            return user;
        } catch (error) {
            console.error("Auth Error:", error);
            window.location.href = "auth.html";
        }
    };

    // --- 2. SINAQLARI YÜKLƏMƏ VƏ RENDER ETMƏ ---
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

    // Tək bir sınaq kartını yaradan funksiya (XSS Müdafiəli)
    const createExamCard = (exam, isCompleted) => {
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

        const title = document.createElement('h3');
        title.className = 'exam-title';
        title.textContent = exam.title;

        // Meta məlumatlar (Sual sayı və Vaxt)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'exam-meta';
        
        // QEYD: Backend-də duration_minutes hələ yoxdur deyə fallback olaraq 90 dəqiqə qoyuruq.
        const duration = exam.duration_minutes || 90; 
        const qCount = exam.question_count || 0;

        metaDiv.innerHTML = `
            <div class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${duration} dəq</span>
            </div>
            <div class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span>${qCount} sual</span>
            </div>
        `;

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
        detailsDiv.appendChild(metaDiv);
        detailsDiv.appendChild(badge);
        
        leftDiv.appendChild(iconDiv);
        leftDiv.appendChild(detailsDiv);

        // Sağ tərəf (Düymələr)
        const rightDiv = document.createElement('div');
        rightDiv.className = 'exam-card-right';

        if (isCompleted) {
            // Bitmiş sınaqlar üçün 2 düymə
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';

            const retakeBtn = document.createElement('a');
            retakeBtn.className = 'btn btn-outline';
            retakeBtn.textContent = 'Yenidən işlə';
            retakeBtn.href = `exam-hall.html?id=${exam.id}`;

            const analyticsBtn = document.createElement('a');
            analyticsBtn.className = 'btn btn-accent';
            analyticsBtn.textContent = 'Analitika →';
            analyticsBtn.href = `analitika.html?id=${exam.id}`;

            actionsDiv.appendChild(retakeBtn);
            actionsDiv.appendChild(analyticsBtn);
            rightDiv.appendChild(actionsDiv);
        } else {
            // Aktiv sınaqlar üçün 1 düymə
            const actionBtn = document.createElement('a');
            actionBtn.className = 'btn btn-accent';
            actionBtn.textContent = 'İşlə';
            actionBtn.href = `exam-hall.html?id=${exam.id}`;
            rightDiv.appendChild(actionBtn);
        }

        card.appendChild(leftDiv);
        card.appendChild(rightDiv);
        return card;
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

            const exams = await response.json();
            
            examListContainer.innerHTML = ''; 
            completedExamListContainer.innerHTML = '';

            // QEYD: Backend hələ is_completed qaytarmır. 
            // Gələcəkdə backend yeniləndikdə bu filter avtomatik işləyəcək.
            const activeExams = exams.filter(e => !e.is_completed);
            const completedExams = exams.filter(e => e.is_completed);

            // Aktiv sınaqları render et
            if (activeExams.length === 0) {
                renderEmptyState(examListContainer, "Hələlik heç bir sınaq yoxdur");
            } else {
                activeExams.forEach(exam => {
                    examListContainer.appendChild(createExamCard(exam, false));
                });
            }

            // Bitmiş sınaqları render et
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

    if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => openDrawer(navDrawer));
    if (profileToggleBtn) profileToggleBtn.addEventListener('click', () => openDrawer(profileDrawer));
    if (overlay) overlay.addEventListener('click', closeAllDrawers);
    closeBtns.forEach(btn => btn.addEventListener('click', closeAllDrawers));

    // Ümumi / Repetitor tabları
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

    // Yan menyu linkləri
    viewLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('data-target');
            if (!targetId) return;
            
            viewLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            switchView(targetId);
        });
    });

    // Geri qayıt düymələri və Loqo (Əsas sınaqlar səhifəsinə qayıtmaq üçün)
    const goHome = (e) => {
        e.preventDefault();
        viewLinks.forEach(l => l.classList.remove('active'));
        switchView('view-exams');
    };

    goHomeBtns.forEach(btn => btn.addEventListener('click', goHome));
    if (brandLogo) brandLogo.addEventListener('click', goHome);

    // --- 4. ÇIXIŞ (LOGOUT) ---
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
    loadExams();
});