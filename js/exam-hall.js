"use strict";

const API_BASE_URL = "https://gradient-backend-fam5.onrender.com"; 

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    if (!examId) {
        alert("Sınaq tapılmadı!");
        window.location.href = "exam.html";
        return;
    }

    // Yaddaş açarları (Hər sınaq üçün unikal)
    const storageKeyAnswers = `exam_${examId}_answers`;
    const storageKeyEndTime = `exam_${examId}_endTime`;

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

    let questions = [];
    let currentQuestionIndex = 0;
    let userAnswers = {}; 
    let timerInterval;

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

            const data = await response.json();

            if (!response.ok) {
                // Əgər backend "Siz artıq işləmisiniz" deyirsə, xəbərdarlıq edib geri atırıq
                alert(data.detail || "Xəta baş verdi.");
                window.location.href = "exam.html";
                return;
            }

            examTitleEl.textContent = data.title;
            questions = data.questions;

            // Yaddaşdan əvvəlki cavabları bərpa et (Səhifə yenilənibsə)
            const savedAnswers = localStorage.getItem(storageKeyAnswers);
            if (savedAnswers) {
                userAnswers = JSON.parse(savedAnswers);
            }

            initPalette();
            renderQuestion(0);
            startTimer();

            skeletonBox.classList.add('hidden');
            contentBox.classList.remove('hidden');

        } catch (error) {
            showModal("Xəta", error.message, false);
        }
    };

    const renderQuestion = (index) => {
        currentQuestionIndex = index;
        const q = questions[index];

        qNumberEl.textContent = `Sual ${index + 1} / ${questions.length}`;
        qTextEl.textContent = q.text; 

        optionsContainer.innerHTML = ''; 

        for (const [key, value] of Object.entries(q.options)) {
            const label = document.createElement('label');
            label.className = 'option-label';
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `question_${q.q_id}`;
            input.value = key;
            input.className = 'option-input';

            if (userAnswers[q.q_id] === key) {
                input.checked = true;
                label.classList.add('selected');
            }

            input.addEventListener('change', () => {
                document.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
                label.classList.add('selected');
                
                userAnswers[q.q_id] = key;
                // Hər cavab verəndə yaddaşa yazırıq
                localStorage.setItem(storageKeyAnswers, JSON.stringify(userAnswers));
                updatePalette();
            });

            const textSpan = document.createElement('span');
            textSpan.className = 'option-text';
            textSpan.textContent = `${key}) ${value}`;

            label.appendChild(input);
            label.appendChild(textSpan);
            optionsContainer.appendChild(label);
        }

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
            btns[i].className = 'palette-btn'; 
            
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

    const startTimer = () => {
        // Yaddaşda bitmə vaxtı varsa onu götür, yoxdursa indidən 60 dəqiqə sonranı təyin et
        let endTime = localStorage.getItem(storageKeyEndTime);
        if (!endTime) {
            endTime = Date.now() + (60 * 60 * 1000); // 60 dəqiqə
            localStorage.setItem(storageKeyEndTime, endTime);
        }

        timerInterval = setInterval(() => {
            const now = Date.now();
            let timeLeft = Math.floor((endTime - now) / 1000);

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitExam(); 
                return;
            }
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `${m}:${s}`;
        }, 1000);
    };

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

            const result = await response.json();

            if (!response.ok) throw new Error(result.detail || "Nəticəni göndərmək mümkün olmadı.");
            
            // Sınaq bitdisə, yaddaşı təmizləyirik ki, bir daha bərpa olunmasın
            localStorage.removeItem(storageKeyAnswers);
            localStorage.removeItem(storageKeyEndTime);

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

    fetchExamData();
});