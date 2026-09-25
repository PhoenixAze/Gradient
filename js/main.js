"use strict";

// ==========================================================================
// QLOBAL API İDARƏEDİCİSİ (ZERO-TRUST & REFRESH TOKEN)
// ==========================================================================
const isProductionFrontend = typeof window !== "undefined" && (
  window.location.hostname === "phoenixaze.github.io" ||
  window.location.hostname === "gradient.az" ||
  window.location.hostname === "www.gradient.az"
);
const API_BASE_URL = isProductionFrontend
  ? "https://gradient-backend-fam5.onrender.com"
  : "";

async function fetchWithAuth(endpoint, options = {}, redirectOnFailure = true) {
    options.credentials = 'include'; // HttpOnly cookie-lər üçün məcburidir
    
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch (err) {
        console.error("Şəbəkə xətası:", err);
        return null;
    }

    // Əgər Access Token bitibsə (401)
    if (response.status === 401) {
        try {
            // Refresh Token ilə yeni Access Token al
            const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();
                // Token yeniləndi, orijinal sorğunu təkrarla
                response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            } else {
                // Refresh token də bitib -> Lazım gələrsə Çıxış et
                if (redirectOnFailure) {
                    window.location.href = "auth.html";
                }
                return null;
            }
        } catch (error) {
            console.error("Token yenilənmə xətası:", error);
            if (redirectOnFailure) {
                window.location.href = "auth.html";
            }
            return null;
        }
    }
    return response;
}

// ==========================================================================
// LANDING PAGE: DRAGGABLE & AUTO-SCROLLING MARQUEE MƏNTİQİ VƏ SESSİYA YOXLANILMASI
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Aktiv Sessiyanı Yoxla və Navbar-ı Dinamik Dəyişdir
    const checkLandingPageAuth = async () => {
        const navActions = document.querySelector(".nav-actions");
        const heroButtons = document.querySelector(".hero-buttons");

        try {
            // redirectOnFailure = false veririk ki, daxil olmayıbsa auth.html-ə yönləndirməsin, sadəcə qonaq kimi qalsın
            const response = await fetchWithAuth("/api/v1/users/me", { method: "GET" }, false);
            
            if (response && response.ok) {
                const user = await response.json();
                const isStudent = user.role === "student";
                const dashboardUrl = isStudent ? "exam.html" : "tutor-dashboard.html";
                const dashboardName = isStudent ? "Sınaqlar Zalı" : "Repetitor Paneli";

                // Navbar Yeniləməsi
                if (navActions) {
                    navActions.innerHTML = `
                        <span class="welcome-user-text" style="font-weight: 500; color: var(--text-muted); margin-right: 12px;">Xoş gəldin, ${user.first_name}</span>
                        <a href="${dashboardUrl}" class="btn btn-primary">${dashboardName}</a>
                        <button id="btn-landing-logout" class="btn btn-ghost">Çıxış</button>
                    `;

                    // Çıxış düyməsinin funksionallığı
                    const logoutBtn = document.getElementById("btn-landing-logout");
                    if (logoutBtn) {
                        logoutBtn.addEventListener("click", async () => {
                            try {
                                await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
                                    method: 'POST',
                                    credentials: 'include'
                                });
                            } catch (err) {
                                console.error(err);
                            }
                            window.location.reload();
                        });
                    }
                }

                // Hero düymələrinin yenilənməsi
                if (heroButtons) {
                    heroButtons.innerHTML = `
                        <a href="${dashboardUrl}" class="btn btn-primary btn-lg">${dashboardName} keçid et &rarr;</a>
                    `;
                }
            }
        } catch (error) {
            console.warn("Landing page auth check skipped/failed:", error);
        }
    };

    // Sessiyanı yoxlayırıq
    await checkLandingPageAuth();

    const marquee = document.getElementById("hero-marquee");
    
    if (marquee) {
        const track = marquee.querySelector('.marquee-track');
        let isDown = false;
        let startX;
        let scrollLeft;
        let autoScrollSpeed = 0.8; 
        let animationId;
        let isHovered = false;

        const cards = Array.from(track.children);
        cards.forEach(card => {
            const clone = card.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true'); 
            track.appendChild(clone);
        });

        const startAutoScroll = () => {
            if (!isDown && !isHovered) {
                marquee.scrollLeft += autoScrollSpeed;
                if (marquee.scrollLeft >= track.scrollWidth / 2) {
                    marquee.scrollLeft = 0;
                }
            }
            animationId = requestAnimationFrame(startAutoScroll);
        };

        marquee.addEventListener('mousedown', (e) => {
            isDown = true;
            marquee.classList.add('active');
            startX = e.pageX - marquee.offsetLeft;
            scrollLeft = marquee.scrollLeft;
            cancelAnimationFrame(animationId); 
        });

        marquee.addEventListener('mouseleave', () => {
            isDown = false;
            isHovered = false;
            marquee.classList.remove('active');
            startAutoScroll();
        });

        marquee.addEventListener('mouseenter', () => {
            isHovered = true; 
        });

        marquee.addEventListener('mouseup', () => {
            isDown = false;
            marquee.classList.remove('active');
            startAutoScroll();
        });

        marquee.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - marquee.offsetLeft;
            const walk = (x - startX) * 1.5; 
            marquee.scrollLeft = scrollLeft - walk;
        });

        marquee.addEventListener('touchstart', (e) => {
            isDown = true;
            startX = e.touches[0].pageX - marquee.offsetLeft;
            scrollLeft = marquee.scrollLeft;
            cancelAnimationFrame(animationId);
        }, { passive: true });

        marquee.addEventListener('touchend', () => {
            isDown = false;
            startAutoScroll();
        });

        marquee.addEventListener('touchmove', (e) => {
            if (!isDown) return;
            const x = e.touches[0].pageX - marquee.offsetLeft;
            const walk = (x - startX) * 1.5;
            marquee.scrollLeft = scrollLeft - walk;
        }, { passive: true });

        startAutoScroll();
    }
});