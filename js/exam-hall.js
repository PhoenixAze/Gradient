"use strict";

const API_BASE_URL = "https://gradient-backend-fam5.onrender.com";

document.addEventListener("DOMContentLoaded", async () => {

    // --- DOM Elementləri ---
    const titleSkeleton = document.getElementById('title-skeleton');
    const examTitleEl = document.getElementById('exam-title');
    const timerBox = document.getElementById('timer-box');
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

    // --- State (Vəziyyət) ---
    let questions = [];
    let examDurationMinutes = 60; // Default olaraq 60
    let currentQuestionIndex = 0;
    let userAnswers = {}; // Format: {"q_id": "A"}
    let timerInterval = null;
    let endTime = 0;       // Sayğac yox, mütləq bitmə anı (ms) - arxa plan tabında sapma (drift) olmasın deyə
    let isSubmitting = false;
    let examInProgress = false; // true olduqda səhifədən çıxış xəbərdarlığı aktivdir

    // --- Modal (Diqqət: bütün dinamik hallar bura yığılıb ki, "düymələri gizli qalan"
    //     modal vəziyyəti yaranmasın - əvvəlki versiyada xəta zamanı bu baş verirdi) ---
    const showModal = ({ title, message, closeLabel = null, confirmLabel = null, onClose = null, onConfirm = null }) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        overlay.classList.remove('hidden');

        if (closeLabel) {
            btnModalClose.textContent = closeLabel;
            btnModalClose.classList.remove('hidden');
            btnModalClose.onclick = onClose || (() => overlay.classList.add('hidden'));
        } else {
            btnModalClose.classList.add('hidden');
            btnModalClose.onclick = null;
        }

        if (confirmLabel) {
            btnModalConfirm.textContent = confirmLabel;
            btnModalConfirm.classList.remove('hidden');
            btnModalConfirm.onclick = onConfirm || null;
        } else {
            btnModalConfirm.classList.add('hidden');
            btnModalConfirm.onclick = null;
        }
    };

    // --- URL-dən sınaq ID-sini alırıq ---
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    if (!examId) {
        // Əvvəlki versiya çılpaq alert() göstərirdi - dizayn sistemi ilə uyğunsuz idi
        showModal({
            title: "Sınaq tapılmadı",
            message: "Zəhmət olmasa sınaqlar siyahısından düzgün sınaq seçin.",
            closeLabel: "Sınaqlara qayıt",
            onClose: () => { window.location.href = "exam.html"; }
        });
        return;
    }

    // --- Səhifə yenilənməsindən (refresh) qorunma: qalan vaxt və cavablar sessionStorage-də saxlanılır ---
    // Qeyd: bu sırf UI rahatlığıdır. Yekun nəticənin doğruluğu hər zaman backend tərəfindən təsdiqlənməlidir,
    // çünki Zero-Trust prinsipinə görə client-in bildirdiyi vaxta/cavaba deyil, server tərəfin hesabına etibar edilir.
    const STORAGE_KEY = `gradient_exam_state_${examId}`;

    const loadPersistedState = () => {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null; // Private rejim və ya storage bloklanıbsa, sadəcə yaddaşsız davam et
        }
    };

    const persistState = () => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                endTime,
                answers: userAnswers,
                currentIndex: currentQuestionIndex
            }));
        } catch (_) { /* saxlama uğursuz olsa belə sınaq davam edə bilməlidir */ }
    };

    const clearPersistedState = () => {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) { /* no-op */ }
    };

    // --- 1. AUTH GUARD VƏ MƏLUMATIN ÇƏKİLMƏSİ ---
    const fetchExamData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/${encodeURIComponent(examId)}/start`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                // Zero-Trust: frontend sessiyanın etibarlılığı barədə qərar vermir, yalnız
                // backend-in 401 cavabına əməl edir
                window.location.href = "auth.html";
                return;
            }

            if (!response.ok) {
                let message = "Sınağı yükləmək mümkün olmadı. Bir az sonra yenidən cəhd edin.";
                try {
                    const errData = await response.json();
                    if (errData && typeof errData.detail === 'string') message = errData.detail;
                } catch (_) { /* JSON deyilsə ümumi mesaj qalır - server detalları sızdırılmır */ }
                throw new Error(message);
            }

            const data = await response.json();

            if (!Array.isArray(data.questions) || data.questions.length === 0) {
                throw new Error("Bu sınaqda hazırda heç bir sual mövcud deyil.");
            }
            questions = data.questions;

            // Əvvəlki sessiyadan qalan vaxt/cavab varsa bərpa et, yoxdursa yeni sayğac başlat.
            // (Backend gələcəkdə "duration_minutes" göndərərsə nəzərə alınır, göndərməsə 60 dəqiqə defolt olur.)
            const persisted = loadPersistedState();
            const nowMs = Date.now();
            const defaultDurationMs = (Number(data.duration_minutes) > 0 ? Number(data.duration_minutes) * 60 : 60 * 60) * 1000;

            if (persisted && typeof persisted.endTime === 'number' && persisted.endTime > nowMs) {
                endTime = persisted.endTime;
                userAnswers = (persisted.answers && typeof persisted.answers === 'object') ? persisted.answers : {};
                currentQuestionIndex = Number.isInteger(persisted.currentIndex) ? persisted.currentIndex : 0;
            } else {
                endTime = nowMs + defaultDurationMs;
            }
            currentQuestionIndex = Math.min(Math.max(currentQuestionIndex, 0), questions.length - 1);

            titleSkeleton.classList.add('hidden');
            examTitleEl.textContent = data.title || 'Sınaq';
            examTitleEl.classList.remove('hidden');

            initPalette();
            renderQuestion(currentQuestionIndex);
            startTimer();

            skeletonBox.classList.add('hidden');
            contentBox.classList.remove('hidden');

            // Məlumat yüklənənə qədər bu düymələr bağlı idi ki, boş sınaq təsadüfən göndərilməsin
            btnNext.disabled = false;
            btnFinish.disabled = false;
            examInProgress = true;

        } catch (error) {
            // Əvvəlki versiyada bu blok yalnız showModal(..., false) çağırırdı - bu isə HEÇ BİR
            // düymə göstərmirdi və istifadəçi xətadan sonra tamamilə çıxılmaz vəziyyətdə qalırdı.
            showModal({
                title: "Xəta baş verdi",
                message: error.message,
                closeLabel: "Yenidən cəhd et",
                onClose: () => { overlay.classList.add('hidden'); fetchExamData(); }
            });
        }
    };

    // --- 2. SUALLARIN RENDER EDİLMƏSİ (XSS MÜDAFİƏSİ) ---
    const renderQuestion = (index) => {
        currentQuestionIndex = index;
        const q = questions[index];

        qNumberEl.textContent = `Sual ${index + 1} / ${questions.length}`;
        qTextEl.textContent = (q && q.text) ? q.text : ''; // innerHTML QƏTİ QADAĞANDIR!

        optionsContainer.innerHTML = ''; // Sabit boş sətir - istifadəçi datası deyil, təhlükəsizdir

        const options = (q && q.options && typeof q.options === 'object') ? q.options : {};
        const optionKeys = Object.keys(options);

        if (optionKeys.length === 0) {
            // Müdafiə: backend gözlənilməz formatda sual göndərsə səhifə çökməsin, təmiz boş vəziyyət göstərsin
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'question-text';
            emptyMsg.textContent = 'Bu sual üçün cavab variantı tapılmadı.';
            optionsContainer.appendChild(emptyMsg);
        } else {
            for (const key of optionKeys) {
                const value = options[key];
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
                    updatePalette();
                    persistState();
                });

                const textSpan = document.createElement('span');
                textSpan.className = 'option-text';
                textSpan.textContent = `${key}) ${value}`;

                label.appendChild(input);
                label.appendChild(textSpan);
                optionsContainer.appendChild(label);
            }
        }

        btnPrev.disabled = index === 0;
        if (index === questions.length - 1) {
            btnNext.textContent = "Bitir";
            btnNext.classList.remove('btn-accent');
            btnNext.classList.add('btn-danger');
        } else {
            btnNext.textContent = "Növbəti";
            btnNext.classList.remove('btn-danger');
            btnNext.classList.add('btn-accent');
        }

        updatePalette();
        persistState();
    };

    // --- 3. PALİTRA VƏ NAVİQASİYA ---
    const initPalette = () => {
        paletteGrid.innerHTML = '';
        questions.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
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
            const isAnswered = Boolean(userAnswers[qId]);
            const isCurrent = i === currentQuestionIndex;

            btns[i].className = 'palette-btn';
            if (isAnswered) btns[i].classList.add('answered');

            if (isCurrent) {
                btns[i].classList.add('current');
                btns[i].setAttribute('aria-current', 'true');
            } else {
                btns[i].removeAttribute('aria-current');
            }

            btns[i].setAttribute(
                'aria-label',
                `Sual ${i + 1}${isAnswered ? ', cavablandırılıb' : ', boş'}${isCurrent ? ', hazırkı sual' : ''}`
            );
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

    // Ox düymələri ilə naviqasiya (radio-inputların öz native ox-naviqasiyasına mane olmamaq üçün
    // fokus radio üzərindədirsə və ya modal açıqdırsa iştirak etmir)
    document.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (!overlay.classList.contains('hidden')) return;
        if (btnNext.disabled) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            btnNext.click();
        } else if (e.key === 'ArrowLeft' && !btnPrev.disabled) {
            e.preventDefault();
            btnPrev.click();
        }
    });

    // --- 4. TAYMER (mütləq bitmə vaxtına əsaslanır - arxa plan tabında setInterval-in
    //     "throttle" olunmasından yaranan vaxt sapmasının qarşısını alır) ---
    const startTimer = () => {
        if (timerInterval) clearInterval(timerInterval); // təkrar başlatma qorunması

        const tick = () => {
            const remainingSec = Math.max(0, Math.round((endTime - Date.now()) / 1000));

            const h = Math.floor(remainingSec / 3600);
            const m = Math.floor((remainingSec % 3600) / 60).toString().padStart(2, '0');
            const s = (remainingSec % 60).toString().padStart(2, '0');
            timerDisplay.textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;

            timerBox.classList.toggle('warning', remainingSec <= 300 && remainingSec > 60);
            timerBox.classList.toggle('critical', remainingSec <= 60 && remainingSec > 0);

            if (remainingSec <= 0) {
                clearInterval(timerInterval);
                submitExam(); // Vaxt bitəndə avtomatik göndər
            }
        };

        tick();
        timerInterval = setInterval(tick, 1000);
    };

    // --- 5. SINAĞI BİTİRMƏK VƏ GÖNDƏRMƏK ---
    const confirmSubmit = () => {
        const answeredCount = Object.keys(userAnswers).length;
        const total = questions.length;
        showModal({
            title: "Sınağı bitirirsiniz?",
            message: `${total} sualdan ${answeredCount} dənəsinə cavab verdiniz. Təsdiqləyirsiniz?`,
            closeLabel: "Geri qayıt",
            onClose: () => overlay.classList.add('hidden'),
            confirmLabel: "Təsdiqlə",
            onConfirm: () => submitExam()
        });
    };

    btnFinish.addEventListener('click', confirmSubmit);

    const submitExam = async () => {
        if (isSubmitting) return; // Taymerin bitməsi ilə əl ilə təsdiqin eyni ana düşməsindən yaranan təkrar göndərməni önləyir
        isSubmitting = true;
        clearInterval(timerInterval);
        showModal({ title: "Gözləyin", message: "Cavablarınız yoxlanılır..." });

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/${encodeURIComponent(examId)}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ answers: userAnswers })
            });

            if (!response.ok) {
                let message = "Nəticəni göndərmək mümkün olmadı.";
                try {
                    const errData = await response.json();
                    if (errData && typeof errData.detail === 'string') message = errData.detail;
                } catch (_) { /* ümumi mesaj qalır */ }
                throw new Error(message);
            }

            const result = await response.json();

            examInProgress = false; // Sınaq təsdiqlənib - artıq səhifədən çıxış xəbərdarlığına ehtiyac yoxdur
            clearPersistedState();

            showModal({
                title: "Sınaq Bitdi!",
                message: `Nəticəniz: ${result.score} / ${result.total} düzgün cavab.`,
                closeLabel: "Ana Səhifəyə Qayıt",
                onClose: () => { window.location.href = "exam.html"; }
            });

        } catch (error) {
            isSubmitting = false; // Yenidən cəhd etməyə icazə ver
            showModal({
                title: "Xəta baş verdi",
                message: error.message,
                closeLabel: "Yenidən cəhd et",
                onClose: () => { overlay.classList.add('hidden'); submitExam(); }
            });
        }
    };

    // Səhifədən təsadüfən çıxış (bağlama/yenidən yükləmə) zamanı xəbərdarlıq - sınaq bitənə qədər aktivdir
    window.addEventListener('beforeunload', (e) => {
        if (!examInProgress) return;
        e.preventDefault();
        e.returnValue = '';
    });

    // Başlat
    fetchExamData();
});
