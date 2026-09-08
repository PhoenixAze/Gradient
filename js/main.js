"use strict";

document.addEventListener("DOMContentLoaded", () => {
    // ==========================================================================
    // 1. DRAGGABLE & AUTO-SCROLLING MARQUEE MƏNTİQİ
    // ==========================================================================
    const marquee = document.getElementById("hero-marquee");
    
    if (marquee) {
        const track = marquee.querySelector('.marquee-track');
        let isDown = false;
        let startX;
        let scrollLeft;
        let autoScrollSpeed = 0.8; // Sürüşmə sürəti (piksel/kadr)
        let animationId;
        let isHovered = false;

        // Sonsuz dövr (infinite loop) yaratmaq üçün kartları kopyalayırıq
        const cards = Array.from(track.children);
        cards.forEach(card => {
            const clone = card.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true'); // Əlçatanlıq üçün kopyaları gizlədirik
            track.appendChild(clone);
        });

        // Avtomatik sürüşmə funksiyası
        const startAutoScroll = () => {
            if (!isDown && !isHovered) {
                marquee.scrollLeft += autoScrollSpeed;
                
                // Əgər orijinal kartların sonuna çatdıqsa, başa qayıdırıq (Sonsuzluq effekti)
                if (marquee.scrollLeft >= track.scrollWidth / 2) {
                    marquee.scrollLeft = 0;
                }
            }
            animationId = requestAnimationFrame(startAutoScroll);
        };

        // Mouse Hadisələri (Kompüter üçün)
        marquee.addEventListener('mousedown', (e) => {
            isDown = true;
            marquee.classList.add('active');
            startX = e.pageX - marquee.offsetLeft;
            scrollLeft = marquee.scrollLeft;
            cancelAnimationFrame(animationId); // Əllə tutduqda avto-sürüşməni dayandır
        });

        marquee.addEventListener('mouseleave', () => {
            isDown = false;
            isHovered = false;
            marquee.classList.remove('active');
            startAutoScroll();
        });

        marquee.addEventListener('mouseenter', () => {
            isHovered = true; // Mouse üzərində olanda dayansın ki, oxumaq olsun
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
            const walk = (x - startX) * 1.5; // Sürüşdürmə həssaslığı
            marquee.scrollLeft = scrollLeft - walk;
        });

        // Touch Hadisələri (Mobil və Planşet üçün)
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

        // Səhifə yükləndikdə animasiyanı başlat
        startAutoScroll();
    }
});