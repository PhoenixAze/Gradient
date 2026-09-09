"use strict";

const API_BASE_URL = "https://gradient-backend-fam5.onrender.com"; 

document.addEventListener("DOMContentLoaded", async () => {
    // URL-dən sınaq ID-sini alırıq
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    if (!examId) {
        alert("Sınaq tapılmadı!");
        window.location.href = "exam.html";
        return;
    }

    // DOM Elementləri
    const examTitleEl = document.getElementById('exam-title');
    const timerDisplay = document.getElementById('timer-display');
    const skeletonBox = document.getElementById('question-skeleton');
    const contentBox = document.getElementById('question-content');
    const qNumberEl = document.getElementById('q-number');
    const qTextEl = document.getElementById('q-text');
    const optionsContainer = document.getElementById('options-container');
    const paletteGrid = document.getElementById('palette-grid');
    
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnFinish = document.getElementById('btn-finish-exam');
    
    const overlay = document.getElementById('exam-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnModalClose = document.getElementById('btn-modal-close');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');

    // State (Vəziyyət)
    let questions = [];
    let currentQuestionIndex = 0;
    let userAnswers = {}; // Format: {"q_id": "A"}
    let timerInterval;
    let timeLeft = 60 * 60; // 60 dəqiqə (Saniyə ilə)

    // --- 1. AUTH GUARD VƏ MƏLUMATIN ÇƏKİLMƏSİ ---
    const fetchExamData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/start`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                window.location.href = "auth.html";
                return;
            }

            if (!response.ok) throw new Error("Sınağı yükləmək mümkün olmadı.");

            const data = await response.json();
            examTitleEl.textContent = data.title;
            questions = data.questions;

            initPalette();
            renderQuestion(0);
            startTimer();

            skeletonBox.classList.add('hidden');
            contentBox.classList.remove('hidden');

        } catch (error) {
            showModal("Xəta", error.message, false);
        }
    };

    // --- 2. SUALLARIN RENDER EDİLMƏSİ (XSS MÜDAFİƏSİ) ---
    const renderQuestion = (index) => {
        currentQuestionIndex = index;
        const q = questions[index];

        qNumberEl.textContent = `Sual ${index + 1} / ${questions.length}`;
        qTextEl.textContent = q.text; // innerHTML QƏTİ QADAĞANDIR!

        optionsContainer.innerHTML = ''; // Köhnə variantları təmizlə

        // Variantları yarat (A, B, C, D)
        for (const [key, value] of Object.entries(q.options)) {
            const label = document.createElement('label');
            label.className = 'option-label';
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `question_${q.q_id}`;
            input.value = key;
            input.className = 'option-input';

            // Əgər əvvəlcədən cavab veribsə, seçili et
            if (userAnswers[q.q_id] === key) {
                input.checked = true;
                label.classList.add('selected');
            }

            // Seçim edildikdə
            input.addEventListener('change', () => {
                // Bütün labellərdən selected sil
                document.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
                label.classList.add('selected');
                
                // Cavabı yadda saxla
                userAnswers[q.q_id] = key;
                updatePalette();
            });

            const textSpan = document.createElement('span');
            textSpan.className = 'option-text';
            textSpan.textContent = `${key}) ${value}`;

            label.appendChild(input);
            label.appendChild(textSpan);
            optionsContainer.appendChild(label);
        }

        // Düymələrin vəziyyəti
        btnPrev.disabled = index === 0;
        if (index === questions.length - 1) {
            btnNext.textContent = "Bitir";
            btnNext.classList.replace('btn-accent', 'btn-danger');
        } else {
            btnNext.textContent = "Növbəti";
            btnNext.classList.replace('btn-danger', 'btn-accent');
        }

        updatePalette();
    };

    // --- 3. PALİTRA VƏ NAVİQASİYA ---
    const initPalette = () => {
        paletteGrid.innerHTML = '';
        questions.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.className = 'palette-btn';
            btn.textContent = idx + 1;
            btn.addEventListener('click', () => renderQuestion(idx));
            paletteGrid.appendChild(btn);
        });
    };

    const updatePalette = () => {
        const btns = paletteGrid.children;
        for (let i = 0; i < btns.length; i++) {
            const qId = questions[i].q_id;
            btns[i].className = 'palette-btn'; // Reset
            
            if (userAnswers[qId]) btns[i].classList.add('answered');
            if (i === currentQuestionIndex) btns[i].classList.add('current');
        }
    };

    btnPrev.addEventListener('click', () => {
        if (currentQuestionIndex > 0) renderQuestion(currentQuestionIndex - 1);
    });

    btnNext.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            renderQuestion(currentQuestionIndex + 1);
        } else {
            confirmSubmit();
        }
    });

    // --- 4. TAYMER ---
    const startTimer = () => {
        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitExam(); // Vaxt bitəndə avtomatik göndər
                return;
            }
            timeLeft--;
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `${m}:${s}`;
        }, 1000);
    };

    // --- 5. SINAĞI BİTİRMƏK VƏ GÖNDƏRMƏK ---
    const showModal = (title, message, showConfirm = false) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        overlay.classList.remove('hidden');
        
        if (showConfirm) {
            btnModalClose.classList.remove('hidden');
            btnModalConfirm.classList.remove('hidden');
        } else {
            btnModalClose.classList.add('hidden');
            btnModalConfirm.classList.add('hidden');
        }
    };

    const confirmSubmit = () => {
        const answeredCount = Object.keys(userAnswers).length;
        const total = questions.length;
        showModal("Sınağı bitirirsiniz?", `${total} sualdan ${answeredCount} dənəsinə cavab verdiniz. Təsdiqləyirsiniz?`, true);
    };

    btnFinish.addEventListener('click', confirmSubmit);
    btnModalClose.addEventListener('click', () => overlay.classList.add('hidden'));

    btnModalConfirm.addEventListener('click', async () => {
        overlay.classList.add('hidden');
        await submitExam();
    });

    const submitExam = async () => {
        clearInterval(timerInterval);
        showModal("Gözləyin", "Cavablarınız yoxlanılır...", false);

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/${examId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ answers: userAnswers })
            });

            if (!response.ok) throw new Error("Nəticəni göndərmək mümkün olmadı.");

            const result = await response.json();
            
            // Uğurlu nəticə ekranı
            modalTitle.textContent = "Sınaq Bitdi!";
            modalMessage.textContent = `Nəticəniz: ${result.score} / ${result.total} düzgün cavab.`;
            
            btnModalClose.textContent = "Ana Səhifəyə Qayıt";
            btnModalClose.classList.remove('hidden');
            btnModalClose.onclick = () => window.location.href = "exam.html";

        } catch (error) {
            showModal("Xəta", error.message, false);
            btnModalClose.textContent = "Bağla";
            btnModalClose.classList.remove('hidden');
            btnModalClose.onclick = () => overlay.classList.add('hidden');
        }
    };

    // Başlat
    fetchExamData();
});