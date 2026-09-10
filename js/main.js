"use strict";

// ==========================================================================
// QLOBAL API İDARƏEDİCİSİ (ZERO-TRUST & REFRESH TOKEN)
// ==========================================================================
const API_BASE_URL = "https://gradient-backend-fam5.onrender.com";

async function fetchWithAuth(endpoint, options = {}) {
    options.credentials = 'include'; // HttpOnly cookie-lər üçün məcburidir
    
    let response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    // Əgər Access Token bitibsə (401)
    if (response.status === 401) {
        try {
            // Refresh Token ilə yeni Access Token al
            const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            if (refreshResponse.ok) {
                // Token yeniləndi, orijinal sorğunu təkrarla
                response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            } else {
                // Refresh token də bitib -> Çıxış et
                window.location.href = "auth.html";
                return null;
            }
        } catch (error) {
            console.error("Token yenilənmə xətası:", error);
            window.location.href = "auth.html";
            return null;
        }
    }
    return response;
}

// ==========================================================================
// LANDING PAGE: DRAGGABLE & AUTO-SCROLLING MARQUEE MƏNTİQİ
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
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