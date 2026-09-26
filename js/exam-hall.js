"use strict";

const isProductionFrontend = typeof window !== "undefined" && (
  window.location.hostname === "phoenixaze.github.io" ||
  window.location.hostname === "gradient.az" ||
  window.location.hostname === "www.gradient.az"
);
const API_BASE_URL = isProductionFrontend
  ? "https://gradient-backend-fam5.onrender.com"
  : "";

document.addEventListener("DOMContentLoaded", async () => {

    // --- DOM Elementləri ---
    const titleSkeleton = document.getElementById('title-skeleton');
    const examTitleEl = document.getElementById('exam-title');
    const examTypeBadge = document.getElementById('exam-type-badge');
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

    // Format Görünüşləri
    const standardExamView = document.getElementById('standard-exam-view');
    const pdfExamView = document.getElementById('pdf-exam-view');
    const pdfViewerFrame = document.getElementById('pdf-viewer-frame');
    const pdfViewerTitle = document.getElementById('pdf-viewer-title');
    const btnPdfFullscreen = document.getElementById('btn-pdf-fullscreen');
    const pdfOpticalSheet = document.getElementById('pdf-optical-sheet');
    const pdfCounterDisplay = document.getElementById('pdf-counter-display');
    const answerSheetProgressBar = document.getElementById('answer-sheet-progress-bar');
    const btnSubmitPdfExam = document.getElementById('btn-submit-pdf-exam');
    const tabShowPdf = document.getElementById('tab-show-pdf');
    const tabShowSheet = document.getElementById('tab-show-sheet');
    const pdfViewerSection = document.getElementById('pdf-viewer-section');
    const answerSheetSection = document.getElementById('answer-sheet-section');

    const overlay = document.getElementById('exam-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnModalClose = document.getElementById('btn-modal-close');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');

    // --- State (Vəziyyət) ---
    let isAssignment = false;
    let questions = [];
    let assignmentTotalQuestions = 25;
    let currentQuestionIndex = 0;
    let userAnswers = {}; // Standard: {"q_id": "A"}, Assignment: {"1": "A"}
    let timerInterval = null;
    let endTime = 0;
    let isSubmitting = false;
    let examInProgress = false;

    // --- Modal İdarəetməsi ---
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

    // --- URL Parametrlərinin Analizi ---
    const urlParams = new URLSearchParams(window.location.search);
    const assignmentParam = urlParams.get('assignment_id');
    const idParam = urlParams.get('id');
    const typeParam = urlParams.get('type');

    let examId = assignmentParam || idParam;
    isAssignment = Boolean(assignmentParam || typeParam === 'assignment');

    if (!examId) {
        showModal({
            title: "Sınaq tapılmadı",
            message: "Zəhmət olmasa düzgün sınaq linki daxil edin və ya sınaqlar siyahısından seçim edin.",
            closeLabel: "Ana Səhifəyə Qayıt",
            onClose: () => { window.location.href = "index.html"; }
        });
        return;
    }

    const STORAGE_KEY = `gradient_exam_state_${examId}`;

    const loadPersistedState = () => {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    };

    const persistState = () => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                endTime,
                answers: userAnswers,
                currentIndex: currentQuestionIndex
            }));
        } catch (_) { /* no-op */ }
    };

    const clearPersistedState = () => {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) { /* no-op */ }
    };

    const getAuthHeaders = (extra = {}) => {
        const headers = { ...extra };
        try {
            const token = sessionStorage.getItem("gradient_access_token") || localStorage.getItem("gradient_access_token");
            if (token && !headers["Authorization"]) {
                headers["Authorization"] = `Bearer ${token}`;
            }
        } catch (_) {}
        return headers;
    };

    // =========================================================================
    // 1. REPETİTOR PDF SINAĞI İDARƏETMƏSİ (ASSIGNMENT EXAM)
    // =========================================================================
    const initAssignmentExam = async (assignmentId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/tutor/assignments/${encodeURIComponent(assignmentId)}/start`, {
                method: 'GET',
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (response.status === 401) {
                window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
                return;
            }

            if (!response.ok) {
                let message = "Repetitor sınağını yükləmək mümkün olmadı.";
                try {
                    const errData = await response.json();
                    if (errData && typeof errData.detail === 'string') message = errData.detail;
                } catch (_) {}
                throw new Error(message);
            }

            const data = await response.json();

            // Əgər şagird artıq bu sınağı tamamlayıbsa
            if (data.is_completed) {
                const sub = data.submission || {};
                showModal({
                    title: "Sınaq Tamamlanıb",
                    message: data.message || `Siz bu sınağı artıq təhvil vermisiniz. Nəticəniz: ${sub.score || 0} bal.`,
                    closeLabel: "Ana Səhifəyə Qayıt",
                    onClose: () => { window.location.href = "index.html"; }
                });
                return;
            }

            // UI Konfiqurasiyası
            if (standardExamView) standardExamView.style.display = 'none';
            if (pdfExamView) pdfExamView.classList.remove('hidden');

            titleSkeleton.classList.add('hidden');
            examTitleEl.textContent = data.title || 'Müəllim Sınağı';
            examTitleEl.classList.remove('hidden');

            if (examTypeBadge) {
                examTypeBadge.textContent = data.tutor_name ? `${data.tutor_name} (Müəllim Sınağı)` : "Müəllim Sınağı";
                examTypeBadge.classList.remove('hidden');
            }

            assignmentTotalQuestions = Math.max(1, Number(data.question_count) || 25);
            const durationMins = Math.max(1, Number(data.duration_minutes) || 60);

            // PDF Sənədinin yüklənməsi
            if (data.pdf_url && pdfViewerFrame) {
                pdfViewerFrame.src = data.pdf_url;
            } else if (pdfViewerFrame) {
                pdfViewerFrame.src = "about:blank";
            }

            if (pdfViewerTitle) {
                pdfViewerTitle.textContent = `${data.title || 'Sınaq'} (PDF Sənədi)`;
            }

            // Tam Ekran Düyməsi
            if (btnPdfFullscreen && pdfViewerFrame) {
                btnPdfFullscreen.onclick = () => {
                    if (pdfViewerFrame.requestFullscreen) {
                        pdfViewerFrame.requestFullscreen();
                    } else if (pdfViewerFrame.webkitRequestFullscreen) {
                        pdfViewerFrame.webkitRequestFullscreen();
                    }
                };
            }

            // Mobil Switcher Düymələri
            if (tabShowPdf && tabShowSheet && pdfViewerSection && answerSheetSection) {
                tabShowPdf.onclick = () => {
                    tabShowPdf.classList.add('active');
                    tabShowSheet.classList.remove('active');
                    pdfViewerSection.classList.remove('mobile-hidden');
                    answerSheetSection.classList.add('mobile-hidden');
                };
                tabShowSheet.onclick = () => {
                    tabShowSheet.classList.add('active');
                    tabShowPdf.classList.remove('active');
                    answerSheetSection.classList.remove('mobile-hidden');
                    pdfViewerSection.classList.add('mobile-hidden');
                };
            }

            // Əvvəlki vəziyyətin bərpası
            const persisted = loadPersistedState();
            const nowMs = Date.now();
            const defaultDurationMs = durationMins * 60 * 1000;

            if (persisted && typeof persisted.endTime === 'number' && persisted.endTime > nowMs) {
                endTime = persisted.endTime;
                userAnswers = (persisted.answers && typeof persisted.answers === 'object') ? persisted.answers : {};
            } else {
                endTime = nowMs + defaultDurationMs;
                userAnswers = {};
            }

            // Optik Cavab Kartının Render Edilməsi
            renderOpticalSheet(assignmentTotalQuestions);
            updateOpticalSheetStats();

            // Taymer və Göndərmə Düymələri
            startTimer();
            if (btnFinish) btnFinish.disabled = false;
            if (btnSubmitPdfExam) {
                btnSubmitPdfExam.onclick = confirmSubmit;
            }

            examInProgress = true;

        } catch (error) {
            showModal({
                title: "Xəta baş verdi",
                message: error.message,
                closeLabel: "Yenidən cəhd et",
                onClose: () => { overlay.classList.add('hidden'); initAssignmentExam(assignmentId); }
            });
        }
    };

    // Optik Cavab Kartının Qurulması
    const renderOpticalSheet = (total) => {
        if (!pdfOpticalSheet) return;
        pdfOpticalSheet.innerHTML = '';

        const options = ['A', 'B', 'C', 'D', 'E'];

        for (let q = 1; q <= total; q++) {
            const qKey = String(q);
            const row = document.createElement('div');
            row.className = 'optical-row';
            row.id = `optical-row-${qKey}`;

            const qNum = document.createElement('span');
            qNum.className = 'optical-q-num';
            qNum.textContent = `${q}.`;
            row.appendChild(qNum);

            const bubblesWrap = document.createElement('div');
            bubblesWrap.className = 'optical-bubbles';

            const currentAns = userAnswers[qKey] || '';
            if (currentAns) {
                row.classList.add('has-answer');
            }

            options.forEach(opt => {
                const bubble = document.createElement('button');
                bubble.type = 'button';
                bubble.className = 'optical-bubble';
                bubble.textContent = opt;
                bubble.setAttribute('aria-label', `Sual ${q}, Variant ${opt}`);

                if (currentAns === opt) {
                    bubble.classList.add('selected');
                }

                bubble.addEventListener('click', () => {
                    if (userAnswers[qKey] === opt) {
                        // Təkrar basdıqda seçimi təmizləmək imkanı
                        delete userAnswers[qKey];
                        bubble.classList.remove('selected');
                        row.classList.remove('has-answer');
                    } else {
                        userAnswers[qKey] = opt;
                        bubblesWrap.querySelectorAll('.optical-bubble').forEach(b => b.classList.remove('selected'));
                        bubble.classList.add('selected');
                        row.classList.add('has-answer');
                    }

                    updateOpticalSheetStats();
                    persistState();
                });

                bubblesWrap.appendChild(bubble);
            });

            row.appendChild(bubblesWrap);
            pdfOpticalSheet.appendChild(row);
        }
    };

    const updateOpticalSheetStats = () => {
        const answeredCount = Object.keys(userAnswers).length;
        const total = assignmentTotalQuestions;
        const pct = Math.round((answeredCount / total) * 100);

        if (pdfCounterDisplay) {
            pdfCounterDisplay.textContent = `${answeredCount} / ${total} cavablandırılıb`;
        }
        if (answerSheetProgressBar) {
            answerSheetProgressBar.style.width = `${pct}%`;
        }
    };

    // =========================================================================
    // 2. STANDART PLATFORMA İNTERAKTİV SINAĞI İDARƏETMƏSİ
    // =========================================================================
    const fetchExamData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/exams/${encodeURIComponent(examId)}/start`, {
                method: 'GET',
                headers: getAuthHeaders(),
                credentials: 'include'
            });

            if (response.status === 401) {
                window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
                return;
            }

            if (!response.ok) {
                // Əgər standart sınaq tapılmadısa, bəlkə repetitor sınağıdır?
                if (response.status === 404 && !isAssignment) {
                    isAssignment = true;
                    initAssignmentExam(examId);
                    return;
                }

                let message = "Sınağı yükləmək mümkün olmadı. Bir az sonra yenidən cəhd edin.";
                try {
                    const errData = await response.json();
                    if (errData && typeof errData.detail === 'string') message = errData.detail;
                } catch (_) {}
                throw new Error(message);
            }

            const data = await response.json();

            if (!Array.isArray(data.questions) || data.questions.length === 0) {
                throw new Error("Bu sınaqda hazırda heç bir sual mövcud deyil.");
            }
            questions = data.questions;

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

            btnNext.disabled = false;
            btnFinish.disabled = false;
            examInProgress = true;

        } catch (error) {
            showModal({
                title: "Xəta baş verdi",
                message: error.message,
                closeLabel: "Yenidən cəhd et",
                onClose: () => { overlay.classList.add('hidden'); fetchExamData(); }
            });
        }
    };

    // Standart Sual Renderi (XSS Müdafiəsi - createElement və textContent)
    const renderQuestion = (index) => {
        currentQuestionIndex = index;
        const q = questions[index];

        qNumberEl.textContent = `Sual ${index + 1} / ${questions.length}`;
        qTextEl.textContent = (q && q.text) ? q.text : '';

        optionsContainer.innerHTML = '';

        const options = (q && q.options && typeof q.options === 'object') ? q.options : {};
        const optionKeys = Object.keys(options);

        if (optionKeys.length === 0) {
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

    document.addEventListener('keydown', (e) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (!overlay.classList.contains('hidden')) return;
        if (btnNext.disabled) return;

        if (e.key === 'ArrowRight' && !isAssignment) {
            e.preventDefault();
            btnNext.click();
        } else if (e.key === 'ArrowLeft' && !btnPrev.disabled && !isAssignment) {
            e.preventDefault();
            btnPrev.click();
        }
    });

    // =========================================================================
    // 3. TAYMER İDARƏETMƏSİ (Mütləq bitmə anına əsaslanır)
    // =========================================================================
    const startTimer = () => {
        if (timerInterval) clearInterval(timerInterval);

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
                submitExam();
            }
        };

        tick();
        timerInterval = setInterval(tick, 1000);
    };

    // =========================================================================
    // 4. SINAĞIN TƏHVİL VERİLMƏSİ VƏ NƏTİCƏNİN GÖSTƏRİLMƏSİ
    // =========================================================================
    const confirmSubmit = () => {
        const answeredCount = Object.keys(userAnswers).length;
        const total = isAssignment ? assignmentTotalQuestions : questions.length;
        showModal({
            title: "Sınağı bitirirsiniz?",
            message: `${total} sualdan ${answeredCount} dənəsinə cavab verdiniz. Sınağı təhvil verməyə əminsiniz?`,
            closeLabel: "Davam et",
            onClose: () => overlay.classList.add('hidden'),
            confirmLabel: "Təsdiqlə və Bitir",
            onConfirm: () => submitExam()
        });
    };

    btnFinish.addEventListener('click', confirmSubmit);

    const submitExam = async () => {
        if (isSubmitting) return;
        isSubmitting = true;
        clearInterval(timerInterval);
        showModal({ title: "Gözləyin", message: "Cavablarınız qeydə alınır və yoxlanılır..." });

        try {
            const submitUrl = isAssignment
                ? `${API_BASE_URL}/api/v1/tutor/assignments/${encodeURIComponent(examId)}/submit`
                : `${API_BASE_URL}/api/v1/exams/${encodeURIComponent(examId)}/submit`;

            const response = await fetch(submitUrl, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ answers: userAnswers })
            });

            if (!response.ok) {
                let message = "Nəticəni göndərmək mümkün olmadı.";
                try {
                    const errData = await response.json();
                    if (errData && typeof errData.detail === 'string') message = errData.detail;
                } catch (_) {}
                throw new Error(message);
            }

            const result = await response.json();

            examInProgress = false;
            clearPersistedState();

            const score = result.score ?? 0;
            const total = result.total ?? (isAssignment ? assignmentTotalQuestions : questions.length);
            const pct = result.percentage ?? Math.round((score / total) * 100);

            showModal({
                title: "Sınaq Bitdi!",
                message: `Yekun Nəticəniz: ${score} / ${total} (${pct}%).\nDüzgün: ${score} | Səhv: ${result.incorrect ?? result.incorrect_count ?? 0} | Boş: ${result.empty ?? result.empty_count ?? (total - score)}`,
                closeLabel: "Ana Səhifəyə Qayıt",
                onClose: () => { window.location.href = "index.html"; }
            });

        } catch (error) {
            isSubmitting = false;
            showModal({
                title: "Xəta baş verdi",
                message: error.message,
                closeLabel: "Yenidən cəhd et",
                onClose: () => { overlay.classList.add('hidden'); submitExam(); }
            });
        }
    };

    window.addEventListener('beforeunload', (e) => {
        if (!examInProgress) return;
        e.preventDefault();
        e.returnValue = '';
    });

    // Başlat
    if (isAssignment) {
        initAssignmentExam(examId);
    } else {
        fetchExamData();
    }
});
