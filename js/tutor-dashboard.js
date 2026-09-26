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
  // DOM Elementləri - Əsas Konteynerlər
  const skeletonEl = document.getElementById("tutor-skeleton");
  const contentEl = document.getElementById("tutor-content");

  // Header & Profil
  const tutorNameEl = document.getElementById("tutor-name");
  const tutorSubjectEl = document.getElementById("tutor-subject");
  const welcomeHeadingEl = document.getElementById("welcome-heading");
  const inviteCodeDisplay = document.getElementById("invite-code-display");
  const btnCopyCode = document.getElementById("btn-copy-code");
  const btnLogout = document.getElementById("btn-tutor-logout");

  // Metrikalar
  const statTotalStudents = document.getElementById("stat-total-students");
  const statStudentsSub = document.getElementById("stat-students-sub");
  const statTotalExams = document.getElementById("stat-total-exams");
  const statGroupAvg = document.getElementById("stat-group-avg");
  const statTopStudent = document.getElementById("stat-top-student");
  const statLowestStudent = document.getElementById("stat-lowest-student");

  // Tab Elementləri
  const tabBtnStudents = document.getElementById("tab-btn-students");
  const tabBtnAssignments = document.getElementById("tab-btn-assignments");
  const tabBtnExams = document.getElementById("tab-btn-exams");
  const tabBtnAi = document.getElementById("tab-btn-ai");
  const paneStudents = document.getElementById("pane-students");
  const paneAssignments = document.getElementById("pane-assignments");
  const paneExams = document.getElementById("pane-exams");
  const paneAi = document.getElementById("pane-ai");
  const tabStudentsCount = document.getElementById("tab-students-count");
  const tabAssignmentsCount = document.getElementById("tab-assignments-count");
  const tabSubmissionsCount = document.getElementById("tab-submissions-count");

  // Fərdi Sınaqlar (PDF Assignments) Elementləri
  const btnHeroCreateAsg = document.getElementById("btn-hero-create-asg");
  const btnOpenCreateAsg = document.getElementById("btn-open-create-asg");
  const btnEmptyCreateAsg = document.getElementById("btn-empty-create-asg");
  const assignmentsEmptyState = document.getElementById("assignments-empty-state");
  const assignmentsGrid = document.getElementById("assignments-grid");

  // Sınaq Yaratma Modalı Elementləri
  const createAssignmentModal = document.getElementById("create-assignment-modal");
  const createAssignmentForm = document.getElementById("create-assignment-form");
  const asgTitleInput = document.getElementById("asg-title-input");
  const asgQCountInput = document.getElementById("asg-qcount-input");
  const asgDurationInput = document.getElementById("asg-duration-input");
  const asgPdfFileInput = document.getElementById("asg-pdf-file-input");
  const pdfDropzone = document.getElementById("pdf-dropzone");
  const pdfFileInfo = document.getElementById("pdf-file-info");
  const pdfFileName = document.getElementById("pdf-file-name");
  const pdfFileSize = document.getElementById("pdf-file-size");
  const btnRemovePdf = document.getElementById("btn-remove-pdf");
  const btnAiExtractAnswers = document.getElementById("btn-ai-extract-answers");
  const answerKeyGrid = document.getElementById("answer-key-grid");
  const answerKeyCounter = document.getElementById("answer-key-counter");
  const btnClearAnswerKey = document.getElementById("btn-clear-answer-key");
  const createAsgFeedback = document.getElementById("create-asg-feedback");
  const btnSubmitCreateAsg = document.getElementById("btn-submit-create-asg");
  const btnCloseCreateAsgModal = document.getElementById("btn-close-create-asg-modal");
  const btnCancelCreateAsg = document.getElementById("btn-cancel-create-asg");

  // Sınaq Paylaşma Linki Modalı
  const shareAssignmentModal = document.getElementById("share-assignment-modal");
  const shareLinkInput = document.getElementById("share-link-input");
  const btnCopyShareLink = document.getElementById("btn-copy-share-link");
  const shareCopyFeedback = document.getElementById("share-copy-feedback");
  const btnCloseShareModal = document.getElementById("btn-close-share-modal");
  const btnDoneShareModal = document.getElementById("btn-done-share-modal");

  // Sınaq Nəticələri Modalı
  const assignmentSubmissionsModal = document.getElementById("assignment-submissions-modal");
  const submissionsModalTitle = document.getElementById("submissions-modal-title");
  const submissionsModalMeta = document.getElementById("submissions-modal-meta");
  const asgSubmissionsTableBody = document.getElementById("asg-submissions-table-body");
  const asgSubmissionsEmpty = document.getElementById("asg-submissions-empty");
  const btnCloseSubmissionsModal = document.getElementById("btn-close-submissions-modal");
  const btnCloseSubmissionsModalBtn = document.getElementById("btn-close-submissions-modal-btn");

  // Şagird Cavab Kartı İncələmə Modalı
  const assignmentAnswersReviewModal = document.getElementById("assignment-answers-review-modal");
  const reviewStudentName = document.getElementById("review-student-name");
  const reviewStudentMeta = document.getElementById("review-student-meta");
  const reviewScore = document.getElementById("review-score");
  const reviewCounts = document.getElementById("review-counts");
  const reviewPercent = document.getElementById("review-percent");
  const studentReviewGrid = document.getElementById("student-review-grid");
  const btnCloseReviewModal = document.getElementById("btn-close-review-modal");
  const btnCloseReviewModalBtn = document.getElementById("btn-close-review-modal-btn");

  // Assignment Qlobal Vəziyyəti
  let currentPdfBase64 = null;
  let answerKeyMap = {};
  let tutorAssignmentsList = [];

  // Şagirdlər Siyahısı & Filtrlər
  const studentSearchInput = document.getElementById("student-search-input");
  const studentStatusFilter = document.getElementById("student-status-filter");
  const studentsEmptyState = document.getElementById("students-empty-state");
  const studentsTableWrap = document.getElementById("students-table-wrap");
  const studentsTableBody = document.getElementById("students-table-body");

  // Sınaq Xülasələri və Son Fəallıq
  const examsSummaryEmpty = document.getElementById("exams-summary-empty");
  const examsSummaryTableWrap = document.getElementById("exams-summary-table-wrap");
  const examsSummaryTableBody = document.getElementById("exams-summary-table-body");
  const submissionsEmpty = document.getElementById("submissions-empty");
  const submissionsTableWrap = document.getElementById("submissions-table-wrap");
  const submissionsTableBody = document.getElementById("submissions-table-body");

  // Şagird Əlavə Etmə Modalı
  const modalOverlay = document.getElementById("add-student-modal");
  const btnOpenModal = document.getElementById("btn-open-add-student");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCancelModal = document.getElementById("btn-cancel-modal");
  const addStudentForm = document.getElementById("add-student-form");
  const studentIdentifierInput = document.getElementById("student-identifier-input");
  const modalFeedback = document.getElementById("modal-feedback");
  const btnSubmitAddStudent = document.getElementById("btn-submit-add-student");

  // Şagird Detalları Modalı
  const studentDetailModal = document.getElementById("student-detail-modal");
  const detailStudentName = document.getElementById("detail-student-name");
  const detailStudentMeta = document.getElementById("detail-student-meta");
  const detailStudentExams = document.getElementById("detail-student-exams");
  const detailStudentAcc = document.getElementById("detail-student-acc");
  const detailStudentScore = document.getElementById("detail-student-score");
  const detailStudentHistoryBody = document.getElementById("detail-student-history-body");
  const detailStudentEmpty = document.getElementById("detail-student-empty");
  const btnCloseDetailModal = document.getElementById("btn-close-detail-modal");
  const btnCloseDetailModalBtn = document.getElementById("btn-close-detail-modal-btn");

  // Tutor AI Köməkçi Elementləri
  const aiChatMessages = document.getElementById("ai-chat-messages");
  const aiChatForm = document.getElementById("ai-chat-form");
  const aiQueryInput = document.getElementById("ai-query-input");
  const btnSubmitAi = document.getElementById("btn-submit-ai");
  const btnClearAiChat = document.getElementById("btn-clear-ai-chat");
  const aiChipButtons = document.querySelectorAll(".ai-chip-btn");

  // Qlobal Vəziyyət (State)
  let tutorData = null;
  let aiConversationHistory = [];
  let isAiResponding = false;

  // Token Köməkçiləri (Third-party cookie-lər bloklanan və Safari/Mobil brauzerlər üçün)
  function getStoredToken() {
    try {
      return sessionStorage.getItem("gradient_access_token") || localStorage.getItem("gradient_access_token") || "";
    } catch (_) {
      return "";
    }
  }

  function getStoredRefreshToken() {
    try {
      return localStorage.getItem("gradient_refresh_token") || sessionStorage.getItem("gradient_refresh_token") || "";
    } catch (_) {
      return "";
    }
  }

  function setStoredTokens(accessToken, refreshToken) {
    try {
      if (accessToken) {
        sessionStorage.setItem("gradient_access_token", accessToken);
        localStorage.setItem("gradient_access_token", accessToken);
      }
      if (refreshToken) {
        localStorage.setItem("gradient_refresh_token", refreshToken);
        sessionStorage.setItem("gradient_refresh_token", refreshToken);
      }
    } catch (_) {}
  }

  function clearStoredTokens() {
    try {
      sessionStorage.removeItem("gradient_access_token");
      localStorage.removeItem("gradient_access_token");
      sessionStorage.removeItem("gradient_refresh_token");
      localStorage.removeItem("gradient_refresh_token");
    } catch (_) {}
  }

  // --- QLOBAL TƏHLÜKƏSİZ API SORĞU İDARƏEDİCİSİ (ZERO-TRUST, COOKIE + DUAL TOKEN) ---
  async function fetchWithAuth(endpoint, options = {}) {
    options.credentials = "include";
    options.headers = options.headers || {};

    const token = getStoredToken();
    if (token && !options.headers["Authorization"]) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch (err) {
      console.error("Şəbəkə xətası:", err);
      return null;
    }

    if (response && response.status === 401) {
      try {
        const rfToken = getStoredRefreshToken();
        const refreshHeaders = {};
        if (rfToken) {
          refreshHeaders["x-refresh-token"] = rfToken;
          refreshHeaders["Authorization"] = `Bearer ${rfToken}`;
        }

        const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: refreshHeaders,
          credentials: "include"
        });

        if (refreshResponse && refreshResponse.ok) {
          const rfData = await refreshResponse.json().catch(() => ({}));
          if (rfData && rfData.access_token) {
            setStoredTokens(rfData.access_token, rfData.refresh_token);
            options.headers["Authorization"] = `Bearer ${rfData.access_token}`;
          }
          response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        } else {
          clearStoredTokens();
          window.location.href = "auth.html";
          return null;
        }
      } catch (refreshErr) {
        console.error("Token yeniləmə xətası:", refreshErr);
        clearStoredTokens();
        window.location.href = "auth.html";
        return null;
      }
    }

    return response;
  }

  // Xəta Bildirişi Banneri
  function showDashboardError(message) {
    let errBanner = document.getElementById("tutor-error-banner");
    if (!errBanner) {
      errBanner = document.createElement("div");
      errBanner.id = "tutor-error-banner";
      errBanner.className = "auth-alert alert-danger";
      errBanner.style.margin = "20px auto";
      errBanner.style.maxWidth = "800px";
      errBanner.style.textAlign = "center";

      const retryBtn = document.createElement("button");
      retryBtn.className = "btn btn-secondary btn-sm";
      retryBtn.style.marginLeft = "12px";
      retryBtn.textContent = "Yenidən yoxla";
      retryBtn.addEventListener("click", () => {
        errBanner.classList.add("hidden");
        skeletonEl.classList.remove("hidden");
        loadDashboard();
      });
      errBanner.appendChild(retryBtn);

      const mainEl = document.querySelector(".tutor-main") || document.body;
      mainEl.insertBefore(errBanner, mainEl.firstChild);
    }

    const textSpan = errBanner.querySelector("span") || document.createElement("span");
    textSpan.textContent = message;
    if (!errBanner.contains(textSpan)) {
      errBanner.insertBefore(textSpan, errBanner.firstChild);
    }
    errBanner.classList.remove("hidden");
  }

  // --- 1. MƏLUMATLARI BAZADAN ÇƏKMƏ VƏ RENDER ---
  async function loadDashboard() {
    try {
      const response = await fetchWithAuth("/api/v1/tutor/dashboard", {
        method: "GET"
      });

      if (!response) {
        skeletonEl.classList.add("hidden");
        showDashboardError("Serverlə əlaqə yaradıla bilmədi. İnternet bağlantınızı və ya server vəziyyətini yoxlayın.");
        return;
      }

      if (response.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      if (response.status === 403) {
        window.location.href = "exam.html";
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Məlumatları yükləmək mümkün olmadı.");
      }

      tutorData = await response.json();
      skeletonEl.classList.add("hidden");
      contentEl.classList.remove("hidden");

      renderTutorInfo(tutorData.tutor);
      renderStats(tutorData.stats);
      renderStudents(getFilteredStudents());
      renderExamSummaries(tutorData.exam_summaries || []);
      renderSubmissions(tutorData.recent_submissions || []);

      // Tab sayğacları
      if (tabStudentsCount) {
        tabStudentsCount.textContent = (tutorData.students || []).length;
      }
      if (tabSubmissionsCount) {
        tabSubmissionsCount.textContent = (tutorData.recent_submissions || []).length;
      }

    } catch (err) {
      console.error("Dashboard error:", err);
      skeletonEl.classList.add("hidden");
      showDashboardError(err.message || "Gözlənilməz xəta baş verdi.");
    }
  }

  function renderTutorInfo(tutor) {
    if (!tutor) return;
    const fullName = `${tutor.first_name || ""} ${tutor.last_name || ""}`.trim() || "Repetitor";
    tutorNameEl.textContent = fullName;
    tutorSubjectEl.textContent = tutor.subject || "Ümumi";
    welcomeHeadingEl.textContent = `Xoş gəldiniz, ${tutor.first_name || "Müəllim"}`;
    inviteCodeDisplay.textContent = tutor.invite_code || tutor.identifier || "-";
  }

  function renderStats(stats) {
    if (!stats) return;
    statTotalStudents.textContent = stats.total_students || 0;
    if (statStudentsSub) {
      statStudentsSub.textContent = `${stats.active_students || 0} aktiv sınaq işləyən`;
    }
    statTotalExams.textContent = stats.total_exams_completed || 0;
    statGroupAvg.textContent = `${stats.group_avg_accuracy || 0}%`;

    if (statTopStudent) {
      statTopStudent.textContent = stats.top_student || "Hələ yoxdur";
      statTopStudent.title = stats.top_student || "";
    }
    if (statLowestStudent) {
      statLowestStudent.textContent = stats.lowest_student || "Yoxdur";
      statLowestStudent.title = stats.lowest_student || "";
    }
  }

  // --- 2. TAB İDARƏETMƏSİ ---
  function switchTab(targetTab) {
    const tabs = [
      { id: "students", btn: tabBtnStudents, pane: paneStudents },
      { id: "assignments", btn: tabBtnAssignments, pane: paneAssignments },
      { id: "exams", btn: tabBtnExams, pane: paneExams },
      { id: "ai", btn: tabBtnAi, pane: paneAi }
    ];

    tabs.forEach(({ id, btn, pane }) => {
      if (!btn || !pane) return;
      if (id === targetTab) {
        btn.classList.add("active");
        pane.classList.remove("hidden");
        if (id === "assignments") {
          loadAssignments();
        }
      } else {
        btn.classList.remove("active");
        pane.classList.add("hidden");
      }
    });
  }

  if (tabBtnStudents) tabBtnStudents.addEventListener("click", () => switchTab("students"));
  if (tabBtnAssignments) tabBtnAssignments.addEventListener("click", () => switchTab("assignments"));
  if (tabBtnExams) tabBtnExams.addEventListener("click", () => switchTab("exams"));
  if (tabBtnAi) tabBtnAi.addEventListener("click", () => {
    switchTab("ai");
    if (aiQueryInput) aiQueryInput.focus();
  });

  // --- 3. ŞAGİRD AXTARIŞI VƏ FİLTR ---
  function getFilteredStudents() {
    if (!tutorData || !tutorData.students) return [];
    const query = (studentSearchInput ? studentSearchInput.value : "").trim().toLowerCase();
    const statusVal = studentStatusFilter ? studentStatusFilter.value : "all";

    return tutorData.students.filter((st) => {
      const fullName = `${st.first_name || ""} ${st.last_name || ""}`.toLowerCase();
      const identifier = (st.identifier || "").toLowerCase();
      const grade = `${st.grade || ""}`.toLowerCase();

      const matchesQuery = !query || fullName.includes(query) || identifier.includes(query) || grade.includes(query);
      const matchesStatus = statusVal === "all" || st.status === statusVal;

      return matchesQuery && matchesStatus;
    });
  }

  if (studentSearchInput) {
    studentSearchInput.addEventListener("input", () => {
      renderStudents(getFilteredStudents());
    });
  }

  if (studentStatusFilter) {
    studentStatusFilter.addEventListener("change", () => {
      renderStudents(getFilteredStudents());
    });
  }

  // Şagirdlər Cədvəlinin Təhlükəsiz (Zero-Trust DOM) Render Edilməsi
  function renderStudents(students) {
    studentsTableBody.replaceChildren();

    if (!students || students.length === 0) {
      studentsEmptyState.classList.remove("hidden");
      studentsTableWrap.classList.add("hidden");
      return;
    }

    studentsEmptyState.classList.add("hidden");
    studentsTableWrap.classList.remove("hidden");

    students.forEach((st) => {
      const tr = document.createElement("tr");

      // Ad, Soyad
      const tdName = document.createElement("td");
      tdName.style.fontWeight = "600";
      tdName.textContent = `${st.first_name || ""} ${st.last_name || ""}`.trim() || "Şagird";

      // Əlaqə
      const tdIdentifier = document.createElement("td");
      tdIdentifier.style.color = "var(--text-muted)";
      tdIdentifier.textContent = st.identifier || "-";

      // Sinif
      const tdGrade = document.createElement("td");
      tdGrade.textContent = st.grade ? `${st.grade}-ci sinif` : "-";

      // İşlənmiş sınaqlar
      const tdExams = document.createElement("td");
      tdExams.textContent = `${st.exams_count || 0} sınaq`;

      // Dəqiqlik faizi
      const tdAccuracy = document.createElement("td");
      tdAccuracy.style.fontWeight = "600";
      tdAccuracy.textContent = st.total_questions > 0 ? `${st.accuracy_pct}%` : "-";

      // Son Nəticə
      const tdLastScore = document.createElement("td");
      tdLastScore.textContent = st.last_score || "-";

      // Vəziyyət Teqi
      const tdStatus = document.createElement("td");
      const tag = document.createElement("span");
      let tagClass = "none";
      if (st.status === "Yaxşı") tagClass = "good";
      else if (st.status === "Orta") tagClass = "mid";
      else if (st.status === "Zəif") tagClass = "bad";
      tag.className = `student-tag ${tagClass}`;
      tag.textContent = st.status || "Məlum deyil";
      tdStatus.appendChild(tag);

      // Əməliyyatlar
      const tdAction = document.createElement("td");
      const actionGroup = document.createElement("div");
      actionGroup.className = "action-btn-group";

      const detailBtn = document.createElement("button");
      detailBtn.className = "btn btn-outline btn-sm";
      detailBtn.style.padding = "4px 8px";
      detailBtn.style.fontSize = "0.78rem";
      detailBtn.textContent = "Analizə bax";
      detailBtn.addEventListener("click", () => handleViewStudentDetail(st.id, `${st.first_name || ""} ${st.last_name || ""}`));

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-ghost btn-sm text-danger";
      removeBtn.style.padding = "4px 8px";
      removeBtn.style.fontSize = "0.78rem";
      removeBtn.textContent = "Çıxar";
      removeBtn.addEventListener("click", () => handleRemoveStudent(st.id, `${st.first_name || ""} ${st.last_name || ""}`));

      actionGroup.appendChild(detailBtn);
      actionGroup.appendChild(removeBtn);
      tdAction.appendChild(actionGroup);

      tr.appendChild(tdName);
      tr.appendChild(tdIdentifier);
      tr.appendChild(tdGrade);
      tr.appendChild(tdExams);
      tr.appendChild(tdAccuracy);
      tr.appendChild(tdLastScore);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAction);

      studentsTableBody.appendChild(tr);
    });
  }

  // --- 4. SINAQ XÜLASƏLƏRİ VƏ TƏQDİMATLARIN RENDERİ ---
  function renderExamSummaries(summaries) {
    examsSummaryTableBody.replaceChildren();

    if (!summaries || summaries.length === 0) {
      examsSummaryEmpty.classList.remove("hidden");
      examsSummaryTableWrap.classList.add("hidden");
      return;
    }

    examsSummaryEmpty.classList.add("hidden");
    examsSummaryTableWrap.classList.remove("hidden");

    summaries.forEach((es) => {
      const tr = document.createElement("tr");

      const tdTitle = document.createElement("td");
      tdTitle.style.fontWeight = "600";
      tdTitle.textContent = es.title || "Sınaq";

      const tdSubject = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "student-tag none";
      badge.textContent = es.subject || "Ümumi";
      tdSubject.appendChild(badge);

      const tdQuestions = document.createElement("td");
      tdQuestions.textContent = `${es.total_questions || 0} sual`;

      const tdParticipants = document.createElement("td");
      tdParticipants.style.fontWeight = "600";
      tdParticipants.textContent = `${es.participant_count || 0} nəfər`;

      const tdAvg = document.createElement("td");
      tdAvg.textContent = `${es.avg_score || 0} bal`;

      const tdHigh = document.createElement("td");
      tdHigh.style.fontWeight = "600";
      tdHigh.style.color = "var(--success)";
      tdHigh.textContent = `${es.highest_score || 0} bal`;

      const tdLow = document.createElement("td");
      tdLow.style.color = "var(--danger)";
      tdLow.textContent = `${es.lowest_score || 0} bal`;

      tr.appendChild(tdTitle);
      tr.appendChild(tdSubject);
      tr.appendChild(tdQuestions);
      tr.appendChild(tdParticipants);
      tr.appendChild(tdAvg);
      tr.appendChild(tdHigh);
      tr.appendChild(tdLow);

      examsSummaryTableBody.appendChild(tr);
    });
  }

  function renderSubmissions(submissions) {
    submissionsTableBody.replaceChildren();

    if (!submissions || submissions.length === 0) {
      submissionsEmpty.classList.remove("hidden");
      submissionsTableWrap.classList.add("hidden");
      return;
    }

    submissionsEmpty.classList.add("hidden");
    submissionsTableWrap.classList.remove("hidden");

    submissions.forEach((sub) => {
      const tr = document.createElement("tr");

      const tdStudent = document.createElement("td");
      tdStudent.style.fontWeight = "600";
      tdStudent.textContent = sub.student_name || "Şagird";

      const tdExam = document.createElement("td");
      tdExam.textContent = sub.exam_title || "Sınaq";

      const tdSubject = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "student-tag none";
      badge.textContent = sub.subject || "Ümumi";
      tdSubject.appendChild(badge);

      const tdScore = document.createElement("td");
      tdScore.textContent = `${sub.score || 0} / ${sub.total_questions || 0}`;

      const tdMistakes = document.createElement("td");
      tdMistakes.textContent = `${sub.incorrect_count || 0} s. / ${sub.empty_count || 0} b.`;

      const tdPct = document.createElement("td");
      tdPct.style.fontWeight = "600";
      const pct = sub.percentage || 0;
      tdPct.textContent = `${pct}%`;
      if (pct >= 75) tdPct.style.color = "var(--success)";
      else if (pct >= 50) tdPct.style.color = "var(--warning)";
      else tdPct.style.color = "var(--danger)";

      const tdDate = document.createElement("td");
      tdDate.style.color = "var(--text-muted)";
      if (sub.created_at) {
        const d = new Date(sub.created_at);
        tdDate.textContent = d.toLocaleDateString("az-AZ", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      } else {
        tdDate.textContent = "-";
      }

      tr.appendChild(tdStudent);
      tr.appendChild(tdExam);
      tr.appendChild(tdSubject);
      tr.appendChild(tdScore);
      tr.appendChild(tdMistakes);
      tr.appendChild(tdPct);
      tr.appendChild(tdDate);

      submissionsTableBody.appendChild(tr);
    });
  }

  // --- 5. ŞAGİRD DETALLI ANALİTİKA MODALI ---
  async function handleViewStudentDetail(studentId, fallbackName) {
    detailStudentName.textContent = fallbackName;
    detailStudentMeta.textContent = "Analitika yüklənir...";
    detailStudentExams.textContent = "...";
    detailStudentAcc.textContent = "...";
    detailStudentScore.textContent = "...";
    detailStudentHistoryBody.replaceChildren();
    detailStudentEmpty.classList.add("hidden");
    studentDetailModal.classList.add("active");

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/students/${studentId}/analytics`, {
        method: "GET"
      });

      if (!res || !res.ok) {
        throw new Error("Şagird analitikasını yükləmək mümkün olmadı.");
      }

      const data = await res.json();
      detailStudentName.textContent = data.student.name || fallbackName;
      detailStudentMeta.textContent = `${data.student.grade ? data.student.grade + '-ci sinif' : 'Sinif qeyd edilməyib'} • Əlaqə: ${data.student.identifier || '-'}`;
      detailStudentExams.textContent = data.stats.total_exams || 0;
      detailStudentAcc.textContent = `${data.stats.overall_accuracy || 0}%`;
      detailStudentScore.textContent = `${data.stats.total_score || 0} / ${data.stats.total_questions || 0}`;

      const history = data.history || [];
      if (history.length === 0) {
        detailStudentEmpty.classList.remove("hidden");
      } else {
        detailStudentEmpty.classList.add("hidden");
        history.forEach((h) => {
          const tr = document.createElement("tr");

          const tdTitle = document.createElement("td");
          tdTitle.style.fontWeight = "600";
          tdTitle.textContent = h.title || "Sınaq";

          const tdSubj = document.createElement("td");
          const tag = document.createElement("span");
          tag.className = "student-tag none";
          tag.textContent = h.subject || "Ümumi";
          tdSubj.appendChild(tag);

          const tdScore = document.createElement("td");
          tdScore.textContent = `${h.score || 0} / ${h.total_questions || 0}`;

          const tdMistakes = document.createElement("td");
          tdMistakes.textContent = `${h.incorrect_count || 0} s. / ${h.empty_count || 0} b.`;

          const tdPct = document.createElement("td");
          tdPct.style.fontWeight = "600";
          tdPct.textContent = `${h.percentage || 0}%`;
          if (h.percentage >= 75) tdPct.style.color = "var(--success)";
          else if (h.percentage >= 50) tdPct.style.color = "var(--warning)";
          else tdPct.style.color = "var(--danger)";

          const tdDate = document.createElement("td");
          tdDate.style.color = "var(--text-muted)";
          if (h.created_at) {
            const d = new Date(h.created_at);
            tdDate.textContent = d.toLocaleDateString("az-AZ", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            });
          } else {
            tdDate.textContent = "-";
          }

          tr.appendChild(tdTitle);
          tr.appendChild(tdSubj);
          tr.appendChild(tdScore);
          tr.appendChild(tdMistakes);
          tr.appendChild(tdPct);
          tr.appendChild(tdDate);

          detailStudentHistoryBody.appendChild(tr);
        });
      }

    } catch (err) {
      console.error(err);
      detailStudentMeta.textContent = "Məlumatları əldə etmək mümkün olmadı.";
    }
  }

  const closeDetailModal = () => {
    studentDetailModal.classList.remove("active");
  };

  if (btnCloseDetailModal) btnCloseDetailModal.addEventListener("click", closeDetailModal);
  if (btnCloseDetailModalBtn) btnCloseDetailModalBtn.addEventListener("click", closeDetailModal);

  // --- 6. ŞAGİRD SİLMƏK (QRUPDAN ÇIXARMAQ) ---
  async function handleRemoveStudent(studentId, studentName) {
    const confirmed = confirm(`${studentName} adlı şagirdi qrupdan çıxarmaq istədiyinizə əminsiniz?`);
    if (!confirmed) return;

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/students/${studentId}`, {
        method: "DELETE"
      });

      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => ({})) : {};
        alert(err.detail || "Şagirdi çıxarmaq mümkün olmadı.");
        return;
      }

      await loadDashboard();
    } catch (e) {
      console.error(e);
      alert("Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.");
    }
  }

  // --- 7. ŞAGİRD ƏLAVƏ ETMƏ FORMASI ---
  const showModalFeedback = (message, isSuccess = false) => {
    modalFeedback.textContent = message;
    modalFeedback.className = isSuccess ? "auth-alert alert-success" : "auth-alert alert-danger";
    modalFeedback.classList.remove("hidden");
  };

  const hideModalFeedback = () => {
    modalFeedback.textContent = "";
    modalFeedback.classList.add("hidden");
  };

  btnOpenModal.addEventListener("click", () => {
    hideModalFeedback();
    addStudentForm.reset();
    modalOverlay.classList.add("active");
    studentIdentifierInput.focus();
  });

  const closeModal = () => {
    modalOverlay.classList.remove("active");
    hideModalFeedback();
  };

  btnCloseModal.addEventListener("click", closeModal);
  btnCancelModal.addEventListener("click", closeModal);

  addStudentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideModalFeedback();

    const identifier = studentIdentifierInput.value.trim();
    if (!identifier) {
      showModalFeedback("Zəhmət olmasa E-poçt və ya Mobil nömrəni daxil edin.");
      return;
    }

    const btnText = btnSubmitAddStudent.querySelector(".btn-text");
    const loader = btnSubmitAddStudent.querySelector(".loader");
    btnText.classList.add("hidden");
    loader.classList.remove("hidden");
    btnSubmitAddStudent.disabled = true;

    try {
      const res = await fetchWithAuth("/api/v1/tutor/students/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier })
      });

      if (!res) {
        throw new Error("Serverlə əlaqə qurmaq mümkün olmadı.");
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Şagird əlavə edilərkən xəta baş verdi.");
      }

      showModalFeedback(data.message || "Şagird uğurla qrupa əlavə edildi!", true);
      addStudentForm.reset();

      setTimeout(async () => {
        closeModal();
        await loadDashboard();
      }, 1200);

    } catch (err) {
      showModalFeedback(err.message);
    } finally {
      btnText.classList.remove("hidden");
      loader.classList.add("hidden");
      btnSubmitAddStudent.disabled = false;
    }
  });

  // --- 8. TUTOR AI KÖMƏKÇİ (GEMINI AI SÖHBƏT VƏ TƏHLİL) ---

  // Təhlükəsiz (Zero-Trust XSS-Protection) Markdown Render Edici
  function renderSafeMarkdownToElement(container, rawText) {
    container.replaceChildren();

    const lines = (rawText || "").split("\n");
    let currentUl = null;

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        currentUl = null;
        return;
      }

      // Maddə (bullet point): • və ya - və ya *
      if (trimmed.startsWith("•") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!currentUl) {
          currentUl = document.createElement("ul");
          container.appendChild(currentUl);
        }
        const li = document.createElement("li");
        const bulletText = trimmed.replace(/^[•\-\*]\s*/, "");
        appendFormattedTextNodes(li, bulletText);
        currentUl.appendChild(li);
        return;
      }

      currentUl = null;

      // Paraqraf
      const p = document.createElement("p");
      appendFormattedTextNodes(p, trimmed);
      container.appendChild(p);
    });
  }

  // Mətn daxilindəki **bold** hissələrini təhlükəsiz DOM elementinə çevirir
  function appendFormattedTextNodes(parentEl, text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        parentEl.appendChild(strong);
      } else if (part) {
        parentEl.appendChild(document.createTextNode(part));
      }
    });
  }

  // AI Sual Göndərmə İcraçısı
  async function submitAIQuery(query) {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery || isAiResponding) return;

    isAiResponding = true;
    if (aiQueryInput) aiQueryInput.value = "";

    const btnText = btnSubmitAi.querySelector(".btn-text");
    const loader = btnSubmitAi.querySelector(".loader");
    btnText.classList.add("hidden");
    loader.classList.remove("hidden");
    btnSubmitAi.disabled = true;

    // 1. İstifadəçi Mesajını Əlavə Edirik
    const userMsgEl = document.createElement("div");
    userMsgEl.className = "ai-message ai-message-user";

    const userAvatar = document.createElement("div");
    userAvatar.className = "ai-message-avatar";
    userAvatar.textContent = "Siz";

    const userBubble = document.createElement("div");
    userBubble.className = "ai-message-bubble";

    const userTextEl = document.createElement("div");
    userTextEl.className = "ai-message-text";
    userTextEl.textContent = cleanQuery;

    userBubble.appendChild(userTextEl);
    userMsgEl.appendChild(userAvatar);
    userMsgEl.appendChild(userBubble);
    aiChatMessages.appendChild(userMsgEl);

    // 2. Köməkçinin Gözləmə Mesajı
    const assistantMsgEl = document.createElement("div");
    assistantMsgEl.className = "ai-message ai-message-assistant";

    const assistantAvatar = document.createElement("div");
    assistantAvatar.className = "ai-message-avatar";
    assistantAvatar.textContent = "AI";

    const assistantBubble = document.createElement("div");
    assistantBubble.className = "ai-message-bubble";

    const assistantAuthor = document.createElement("div");
    assistantAuthor.className = "ai-message-author";
    assistantAuthor.textContent = "Tutor AI Köməkçi";

    const assistantTextEl = document.createElement("div");
    assistantTextEl.className = "ai-message-text";
    assistantTextEl.textContent = "Qrup məlumatlarınız təhlil edilir...";

    assistantBubble.appendChild(assistantAuthor);
    assistantBubble.appendChild(assistantTextEl);
    assistantMsgEl.appendChild(assistantAvatar);
    assistantMsgEl.appendChild(assistantBubble);
    aiChatMessages.appendChild(assistantMsgEl);

    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

    // 3. Backend-ə Sorğu Göndəririk
    try {
      const res = await fetchWithAuth("/api/v1/tutor/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: cleanQuery,
          conversation_history: aiConversationHistory
        })
      });

      if (!res) {
        throw new Error("Serverlə əlaqə qurmaq mümkün olmadı.");
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Cavab hazırlanarkən xəta baş verdi.");
      }

      const answerText = data.answer || "Məlumat tapılmadı.";

      // Cavabı təhlükəsiz render edirik
      renderSafeMarkdownToElement(assistantTextEl, answerText);

      // Dialoq tarixçəsini yeniləyirik
      aiConversationHistory.push({ role: "user", content: cleanQuery });
      aiConversationHistory.push({ role: "model", content: answerText });

    } catch (err) {
      console.error("AI Query Error:", err);
      assistantTextEl.textContent = `Xəta: ${err.message || "Gözlənilməz xəta baş verdi."}`;
    } finally {
      isAiResponding = false;
      btnText.classList.remove("hidden");
      loader.classList.add("hidden");
      btnSubmitAi.disabled = false;
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }
  }

  if (aiChatForm) {
    aiChatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitAIQuery(aiQueryInput.value);
    });
  }

  // Sürətli sual çipləri
  aiChipButtons.forEach((chipBtn) => {
    chipBtn.addEventListener("click", () => {
      const query = chipBtn.getAttribute("data-query");
      if (query) {
        // AI tabına keç
        switchTab("ai");
        submitAIQuery(query);
      }
    });
  });

  // Söhbəti Təmizləmək
  if (btnClearAiChat) {
    btnClearAiChat.addEventListener("click", () => {
      aiConversationHistory = [];
      aiChatMessages.replaceChildren();

      const welcomeMsgEl = document.createElement("div");
      welcomeMsgEl.className = "ai-message ai-message-assistant";

      const avatar = document.createElement("div");
      avatar.className = "ai-message-avatar";
      avatar.textContent = "AI";

      const bubble = document.createElement("div");
      bubble.className = "ai-message-bubble";

      const author = document.createElement("div");
      author.className = "ai-message-author";
      author.textContent = "Tutor AI Köməkçi";

      const text = document.createElement("div");
      text.className = "ai-message-text";
      text.textContent = "Salam, hörmətli müəllim! Söhbət təmizləndi. Qrupunuz, sınaqlar və ya şagirdlərinizin nəticələri barədə istənilən yeni sualınızı verə bilərsiniz.";

      bubble.appendChild(author);
      bubble.appendChild(text);
      welcomeMsgEl.appendChild(avatar);
      welcomeMsgEl.appendChild(bubble);
      aiChatMessages.appendChild(welcomeMsgEl);
    });
  }

  // --- 9. KODU KOPYALAMAQ ---
  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", async () => {
      const code = inviteCodeDisplay.textContent;
      if (!code || code === "...") return;
      try {
        await navigator.clipboard.writeText(code);
        const originalText = btnCopyCode.textContent;
        btnCopyCode.textContent = "Kopyalandı!";
        setTimeout(() => {
          btnCopyCode.textContent = originalText;
        }, 2000);
      } catch (err) {
        prompt("Repetitor kodunuz:", code);
      }
    });
  }

  // --- 10. ÇIXIŞ (LOGOUT) ---
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await fetchWithAuth("/api/v1/auth/logout", {
          method: "POST"
        });
      } catch (_) {}
      window.location.href = "auth.html";
    });
  }

  // ============================================================================
  // FƏRDİ SINAQLAR (PDF ASSIGNMENTS) VƏ CAVAB KARTLARI İDARƏETMƏSİ
  // ============================================================================

  // 1. Doğru Cavab Kartı Cədvəlinin Qurulması (Answer Key Builder)
  function renderAnswerKeyGrid(count) {
    if (!answerKeyGrid) return;
    answerKeyGrid.replaceChildren();

    const options = ["A", "B", "C", "D", "E"];
    const total = Math.min(Math.max(Number(count) || 25, 1), 120);

    for (let i = 1; i <= total; i++) {
      const qNumStr = String(i);

      const row = document.createElement("div");
      row.className = "answer-key-row";

      const numEl = document.createElement("span");
      numEl.className = "answer-key-qnum";
      numEl.textContent = `${i}.`;
      row.appendChild(numEl);

      const group = document.createElement("div");
      group.className = "bubble-options-group";

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bubble-btn";
        btn.textContent = opt;
        btn.setAttribute("data-q", qNumStr);
        btn.setAttribute("data-opt", opt);

        if (answerKeyMap[qNumStr] === opt) {
          btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
          if (answerKeyMap[qNumStr] === opt) {
            delete answerKeyMap[qNumStr];
            btn.classList.remove("active");
          } else {
            answerKeyMap[qNumStr] = opt;
            group.querySelectorAll(".bubble-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
          }
          updateAnswerKeyCounter(total);
        });

        group.appendChild(btn);
      });

      row.appendChild(group);
      answerKeyGrid.appendChild(row);
    }

    updateAnswerKeyCounter(total);
  }

  function updateAnswerKeyCounter(total) {
    if (!answerKeyCounter) return;
    const filled = Object.keys(answerKeyMap).length;
    answerKeyCounter.textContent = `${filled} / ${total} qeyd edilib`;
  }

  if (asgQCountInput) {
    asgQCountInput.addEventListener("input", () => {
      const count = Number(asgQCountInput.value) || 25;
      renderAnswerKeyGrid(count);
    });
  }

  if (btnClearAnswerKey) {
    btnClearAnswerKey.addEventListener("click", () => {
      answerKeyMap = {};
      const count = Number(asgQCountInput ? asgQCountInput.value : 25) || 25;
      renderAnswerKeyGrid(count);
    });
  }

  // 2. PDF Fayl Yükləmə İdarəedicisi
  function handlePdfFileSelect(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      showCreateAsgError("Yalnız .pdf formatında sənədlər qəbul edilir.");
      return;
    }

    const maxSize = 25 * 1024 * 1024; // 25 MB
    if (file.size > maxSize) {
      showCreateAsgError("PDF faylının həcmi 25MB-dan çox olmamalıdır.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentPdfBase64 = e.target.result;
      if (pdfDropzone) pdfDropzone.classList.add("hidden");
      if (pdfFileInfo) pdfFileInfo.classList.remove("hidden");
      if (pdfFileName) pdfFileName.textContent = file.name;
      if (pdfFileSize) pdfFileSize.textContent = ` (${Math.round(file.size / 1024)} KB)`;
      if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = false;
      hideCreateAsgError();
    };
    reader.onerror = () => {
      showCreateAsgError("PDF faylı oxunarkən xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.");
    };
    reader.readAsDataURL(file);
  }

  if (pdfDropzone) {
    pdfDropzone.addEventListener("click", () => {
      if (asgPdfFileInput) asgPdfFileInput.click();
    });

    pdfDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      pdfDropzone.classList.add("dragover");
    });

    pdfDropzone.addEventListener("dragleave", () => {
      pdfDropzone.classList.remove("dragover");
    });

    pdfDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      pdfDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handlePdfFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (asgPdfFileInput) {
    asgPdfFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePdfFileSelect(e.target.files[0]);
      }
    });
  }

  if (btnRemovePdf) {
    btnRemovePdf.addEventListener("click", () => {
      currentPdfBase64 = null;
      if (asgPdfFileInput) asgPdfFileInput.value = "";
      if (pdfDropzone) pdfDropzone.classList.remove("hidden");
      if (pdfFileInfo) pdfFileInfo.classList.add("hidden");
      if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = true;
    });
  }

  // 3. AI ilə Cavab Kartının Çıxarılması
  if (btnAiExtractAnswers) {
    btnAiExtractAnswers.addEventListener("click", async () => {
      if (!currentPdfBase64) {
        showCreateAsgError("Əvvəlcə sınaq PDF faylını yükləyin.");
        return;
      }

      const qCount = Number(asgQCountInput ? asgQCountInput.value : 25) || 25;
      const btnText = btnAiExtractAnswers.querySelector(".btn-text");
      const loader = btnAiExtractAnswers.querySelector(".loader");

      btnAiExtractAnswers.disabled = true;
      if (btnText) btnText.classList.add("hidden");
      if (loader) loader.classList.remove("hidden");
      showCreateAsgInfo("Süni İntellekt PDF sənədini analiz edir və doğru cavab kartını həll edir... Zəhmət olmasa gözləyin.");

      try {
        const response = await fetchWithAuth("/api/v1/tutor/assignments/ai-generate-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdf_base64: currentPdfBase64,
            question_count: qCount
          })
        });

        if (!response.ok) {
          let msg = "Süni İntellekt cavabları generasiya edə bilmədi.";
          try {
            const err = await response.json();
            if (err.detail) msg = err.detail;
          } catch (_) {}
          throw new Error(msg);
        }

        const data = await response.json();
        const extracted = data.answers || {};

        answerKeyMap = {};
        for (let i = 1; i <= qCount; i++) {
          const k = String(i);
          if (extracted[k]) {
            const val = String(extracted[k]).trim().toUpperCase();
            if (["A", "B", "C", "D", "E"].includes(val)) {
              answerKeyMap[k] = val;
            }
          }
        }

        renderAnswerKeyGrid(qCount);
        showCreateAsgSuccess(`Gemini AI ${Object.keys(answerKeyMap).length} sual üçün cavab açarını uğurla təyin etdi! Lazım gələrsə variantları yoxlayıb dəyişə bilərsiniz.`);

      } catch (err) {
        console.error("AI answer extraction error:", err);
        showCreateAsgError(err.message || "Süni intellekt analizi uğursuz oldu. Cavabları əl ilə qeyd edə bilərsiniz.");
      } finally {
        btnAiExtractAnswers.disabled = false;
        if (btnText) btnText.classList.remove("hidden");
        if (loader) loader.classList.add("hidden");
      }
    });
  }

  function showCreateAsgError(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert error";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function showCreateAsgSuccess(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert success";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function showCreateAsgInfo(msg) {
    if (!createAsgFeedback) return;
    createAsgFeedback.className = "auth-alert info";
    createAsgFeedback.textContent = msg;
    createAsgFeedback.classList.remove("hidden");
  }

  function hideCreateAsgError() {
    if (createAsgFeedback) createAsgFeedback.classList.add("hidden");
  }

  // 4. Sınaq Yaratma Modalının Açılması / Bağlanması
  function openCreateAssignmentModal() {
    if (!createAssignmentModal) return;
    hideCreateAsgError();
    if (createAssignmentForm) createAssignmentForm.reset();
    currentPdfBase64 = null;
    answerKeyMap = {};

    if (asgQCountInput) asgQCountInput.value = "25";
    if (asgDurationInput) asgDurationInput.value = "60";
    if (pdfDropzone) pdfDropzone.classList.remove("hidden");
    if (pdfFileInfo) pdfFileInfo.classList.add("hidden");
    if (btnAiExtractAnswers) btnAiExtractAnswers.disabled = true;

    renderAnswerKeyGrid(25);
    createAssignmentModal.classList.add("active");
  }

  function closeCreateAssignmentModal() {
    if (createAssignmentModal) createAssignmentModal.classList.remove("active");
  }

  if (btnOpenCreateAsg) btnOpenCreateAsg.addEventListener("click", openCreateAssignmentModal);
  if (btnEmptyCreateAsg) btnEmptyCreateAsg.addEventListener("click", openCreateAssignmentModal);
  if (btnHeroCreateAsg) btnHeroCreateAsg.addEventListener("click", openCreateAssignmentModal);
  if (btnCloseCreateAsgModal) btnCloseCreateAsgModal.addEventListener("click", closeCreateAssignmentModal);
  if (btnCancelCreateAsg) btnCancelCreateAsg.addEventListener("click", closeCreateAssignmentModal);

  // 5. Sınağı Təsdiqlə və Yarat
  if (createAssignmentForm) {
    createAssignmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideCreateAsgError();

      const title = (asgTitleInput ? asgTitleInput.value : "").trim();
      const qCount = Number(asgQCountInput ? asgQCountInput.value : 25) || 25;
      const duration = Number(asgDurationInput ? asgDurationInput.value : 60) || 60;

      if (!title) {
        showCreateAsgError("Zəhmət olmasa sınaq adını daxil edin.");
        return;
      }

      if (!currentPdfBase64) {
        showCreateAsgError("Zəhmət olmasa sınaq PDF faylını yükləyin.");
        return;
      }

      const answeredCount = Object.keys(answerKeyMap).length;
      if (answeredCount === 0) {
        showCreateAsgError("Doğru cavab kartında ən azı 1 sualın cavabını qeyd edin və ya AI ilə generasiya edin.");
        return;
      }

      const btnText = btnSubmitCreateAsg.querySelector(".btn-text");
      const loader = btnSubmitCreateAsg.querySelector(".loader");
      btnSubmitCreateAsg.disabled = true;
      if (btnText) btnText.classList.add("hidden");
      if (loader) loader.classList.remove("hidden");

      try {
        const payload = {
          title,
          pdf_url: currentPdfBase64,
          answer_key: answerKeyMap,
          question_count: qCount,
          duration_minutes: duration
        };

        const res = await fetchWithAuth("/api/v1/tutor/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          let msg = "Sınaq yaradılarkən xəta baş verdi.";
          try {
            const err = await res.json();
            if (err.detail) msg = err.detail;
          } catch (_) {}
          throw new Error(msg);
        }

        const data = await res.json();
        closeCreateAssignmentModal();

        // Paylaşma linki modalını açırıq
        const assignmentId = data.assignment_id || (data.assignment ? data.assignment.id : "");
        openShareModal(assignmentId);

        // Siyahını yeniləyirik
        await loadAssignments();

      } catch (err) {
        console.error("Create assignment error:", err);
        showCreateAsgError(err.message || "Sınaq yaradılarkən xəta baş verdi.");
      } finally {
        btnSubmitCreateAsg.disabled = false;
        if (btnText) btnText.classList.remove("hidden");
        if (loader) loader.classList.add("hidden");
      }
    });
  }

  // 6. Paylaşma Linki Modalı
  function openShareModal(assignmentId) {
    if (!shareAssignmentModal || !shareLinkInput) return;
    const shareUrl = `${window.location.origin}/exam-hall.html?assignment_id=${encodeURIComponent(assignmentId)}`;
    shareLinkInput.value = shareUrl;
    if (shareCopyFeedback) shareCopyFeedback.classList.add("hidden");
    shareAssignmentModal.classList.add("active");
  }

  function closeShareModal() {
    if (shareAssignmentModal) shareAssignmentModal.classList.remove("active");
  }

  if (btnCloseShareModal) btnCloseShareModal.addEventListener("click", closeShareModal);
  if (btnDoneShareModal) btnDoneShareModal.addEventListener("click", closeShareModal);

  if (btnCopyShareLink) {
    btnCopyShareLink.addEventListener("click", async () => {
      const url = shareLinkInput ? shareLinkInput.value : "";
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        if (shareCopyFeedback) {
          shareCopyFeedback.classList.remove("hidden");
          setTimeout(() => shareCopyFeedback.classList.add("hidden"), 3000);
        }
        btnCopyShareLink.textContent = "Kopyalandı!";
        setTimeout(() => {
          btnCopyShareLink.textContent = "Linki Kopyala";
        }, 2000);
      } catch (_) {
        if (shareLinkInput) {
          shareLinkInput.select();
          document.execCommand("copy");
        }
      }
    });
  }

  // 7. Sınaqların Yüklənməsi və Render Edilməsi
  async function loadAssignments() {
    try {
      const res = await fetchWithAuth("/api/v1/tutor/assignments");
      if (!res || !res.ok) throw new Error("Sınaqlar siyahısı alına bilmədi.");
      const list = await res.json();
      tutorAssignmentsList = Array.isArray(list) ? list : [];

      if (tabAssignmentsCount) {
        tabAssignmentsCount.textContent = tutorAssignmentsList.length;
      }

      renderAssignments(tutorAssignmentsList);
    } catch (err) {
      console.warn("Load assignments warning:", err);
      renderAssignments([]);
    }
  }

  function renderAssignments(assignments) {
    if (!assignmentsGrid) return;
    assignmentsGrid.replaceChildren();

    if (!assignments || assignments.length === 0) {
      if (assignmentsEmptyState) assignmentsEmptyState.classList.remove("hidden");
      assignmentsGrid.classList.add("hidden");
      return;
    }

    if (assignmentsEmptyState) assignmentsEmptyState.classList.add("hidden");
    assignmentsGrid.classList.remove("hidden");

    assignments.forEach((asg) => {
      const card = document.createElement("div");
      card.className = "assignment-card";

      const header = document.createElement("div");
      header.className = "asg-header";

      const tag = document.createElement("span");
      tag.className = "asg-tag";
      tag.textContent = "PDF Sınaq";
      header.appendChild(tag);

      const dateStr = asg.created_at
        ? new Date(asg.created_at).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "Yeni";
      const dateEl = document.createElement("span");
      dateEl.style.fontSize = "0.8rem";
      dateEl.style.color = "var(--text-sub)";
      dateEl.textContent = dateStr;
      header.appendChild(dateEl);
      card.appendChild(header);

      const titleEl = document.createElement("h3");
      titleEl.className = "asg-title";
      titleEl.textContent = asg.title || "Sınaq";
      card.appendChild(titleEl);

      const metaRow = document.createElement("div");
      metaRow.className = "asg-meta-row";

      const qItem = document.createElement("div");
      qItem.className = "asg-meta-item";
      qItem.textContent = `${asg.question_count || 25} sual`;
      metaRow.appendChild(qItem);

      const dItem = document.createElement("div");
      dItem.className = "asg-meta-item";
      dItem.textContent = `${asg.duration_minutes || 60} dəqiqə`;
      metaRow.appendChild(dItem);

      card.appendChild(metaRow);

      const statsBanner = document.createElement("div");
      statsBanner.className = "asg-stats-banner";

      const subCount = asg.submission_count || 0;
      const subInfo = document.createElement("span");
      subInfo.textContent = `${subCount} şagird təhvil verib`;
      statsBanner.appendChild(subInfo);

      const avgInfo = document.createElement("span");
      avgInfo.className = "asg-stats-val";
      avgInfo.textContent = subCount > 0 ? `Orta: ${asg.avg_score || 0} bal` : "Hələ işlənməyib";
      statsBanner.appendChild(avgInfo);

      card.appendChild(statsBanner);

      const actions = document.createElement("div");
      actions.className = "asg-actions";

      // Linki kopyala düyməsi
      const btnCopy = document.createElement("button");
      btnCopy.type = "button";
      btnCopy.className = "btn btn-primary btn-sm";
      btnCopy.textContent = "Linki Kopyala";
      btnCopy.addEventListener("click", async () => {
        const shareUrl = `${window.location.origin}/exam-hall.html?assignment_id=${encodeURIComponent(asg.id)}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          btnCopy.textContent = "Kopyalandı!";
          setTimeout(() => { btnCopy.textContent = "Linki Kopyala"; }, 2000);
        } catch (_) {
          openShareModal(asg.id);
        }
      });
      actions.appendChild(btnCopy);

      // Nəticələrə bax düyməsi
      const btnResults = document.createElement("button");
      btnResults.type = "button";
      btnResults.className = "btn btn-outline btn-sm";
      btnResults.textContent = "Nəticələrə Bax";
      btnResults.addEventListener("click", () => {
        openAssignmentSubmissions(asg.id, asg.title);
      });
      actions.appendChild(btnResults);

      // PDF-ə bax düyməsi
      if (asg.pdf_url) {
        const btnPdf = document.createElement("button");
        btnPdf.type = "button";
        btnPdf.className = "btn btn-ghost btn-sm";
        btnPdf.textContent = "PDF";
        btnPdf.title = "Sınaq PDF faylını aç";
        btnPdf.addEventListener("click", () => {
          const w = window.open("");
          if (w) {
            w.document.write(`<iframe src="${asg.pdf_url}" style="width:100%;height:100vh;border:none;"></iframe>`);
          }
        });
        actions.appendChild(btnPdf);
      }

      // Sınağı sil düyməsi
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost btn-sm";
      btnDel.textContent = "Sil";
      btnDel.style.color = "var(--danger)";
      btnDel.addEventListener("click", async () => {
        if (!confirm(`"${asg.title}" sınağını və ona aid bütün nəticələri silmək istədiyinizdən əminsiniz?`)) return;
        try {
          await fetchWithAuth(`/api/v1/tutor/assignments/${encodeURIComponent(asg.id)}`, { method: "DELETE" });
          await loadAssignments();
        } catch (err) {
          alert("Sınağı silmək mümkün olmadı: " + err.message);
        }
      });
      actions.appendChild(btnDel);

      card.appendChild(actions);
      assignmentsGrid.appendChild(card);
    });
  }

  // 8. Sınaq Nəticələri Modalı (Tələbələrin Cavab Kartları ilə)
  async function openAssignmentSubmissions(asgId, title) {
    if (!assignmentSubmissionsModal) return;
    if (submissionsModalTitle) submissionsModalTitle.textContent = title || "Sınaq Nəticələri";
    if (submissionsModalMeta) submissionsModalMeta.textContent = "Yüklənir...";
    if (asgSubmissionsTableBody) asgSubmissionsTableBody.replaceChildren();
    if (asgSubmissionsEmpty) asgSubmissionsEmpty.classList.add("hidden");

    assignmentSubmissionsModal.classList.add("active");

    try {
      const res = await fetchWithAuth(`/api/v1/tutor/assignments/${encodeURIComponent(asgId)}/submissions`);
      if (!res || !res.ok) throw new Error("Nəticələr yüklənmədi.");
      const data = await res.json();

      const asg = data.assignment || {};
      const subs = data.submissions || [];

      if (submissionsModalMeta) {
        submissionsModalMeta.textContent = `${asg.question_count || 25} sual • Cəmi ${subs.length} şagird iştirak edib`;
      }

      if (subs.length === 0) {
        if (asgSubmissionsEmpty) asgSubmissionsEmpty.classList.remove("hidden");
        return;
      }

      subs.forEach((sub) => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.style.fontWeight = "600";
        tdName.textContent = sub.student_name || "Şagird";
        tr.appendChild(tdName);

        const tdContact = document.createElement("td");
        tdContact.textContent = sub.student_identifier || "-";
        tr.appendChild(tdContact);

        const tdScore = document.createElement("td");
        tdScore.style.fontWeight = "700";
        tdScore.style.color = "var(--primary)";
        tdScore.textContent = `${sub.score} / ${sub.total_questions}`;
        tr.appendChild(tdScore);

        const tdCounts = document.createElement("td");
        tdCounts.textContent = `Düz: ${sub.score} | Səhv: ${sub.incorrect_count || 0} | Boş: ${sub.empty_count || 0}`;
        tr.appendChild(tdCounts);

        const tdAcc = document.createElement("td");
        const accTag = document.createElement("span");
        accTag.className = "student-tag " + (sub.percentage >= 80 ? "good" : sub.percentage >= 50 ? "mid" : "bad");
        accTag.textContent = `${sub.percentage}%`;
        tdAcc.appendChild(accTag);
        tr.appendChild(tdAcc);

        const tdDate = document.createElement("td");
        tdDate.textContent = sub.submitted_at
          ? new Date(sub.submitted_at).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "-";
        tr.appendChild(tdDate);

        const tdAction = document.createElement("td");
        const btnReview = document.createElement("button");
        btnReview.type = "button";
        btnReview.className = "btn btn-outline btn-sm";
        btnReview.textContent = "Cavab Kartına Bax";
        btnReview.addEventListener("click", () => {
          openStudentAnswerReview(sub, asg.answer_key || {}, asg.question_count || 25);
        });
        tdAction.appendChild(btnReview);
        tr.appendChild(tdAction);

        asgSubmissionsTableBody.appendChild(tr);
      });

    } catch (err) {
      console.error("Fetch submissions error:", err);
      if (submissionsModalMeta) submissionsModalMeta.textContent = "Məlumat yüklənərkən xəta baş verdi.";
    }
  }

  function closeAssignmentSubmissions() {
    if (assignmentSubmissionsModal) assignmentSubmissionsModal.classList.remove("active");
  }

  if (btnCloseSubmissionsModal) btnCloseSubmissionsModal.addEventListener("click", closeAssignmentSubmissions);
  if (btnCloseSubmissionsModalBtn) btnCloseSubmissionsModalBtn.addEventListener("click", closeAssignmentSubmissions);

  // 9. Şagird Cavab Kartı İncələmə Modalı
  function openStudentAnswerReview(submission, answerKey, totalQuestions) {
    if (!assignmentAnswersReviewModal) return;

    if (reviewStudentName) reviewStudentName.textContent = `${submission.student_name} — Cavab Kartı`;
    if (reviewStudentMeta) reviewStudentMeta.textContent = `${submission.student_identifier || ""} • Təhvil verilib: ${new Date(submission.submitted_at).toLocaleString("az-AZ")}`;

    if (reviewScore) reviewScore.textContent = `${submission.score} / ${totalQuestions}`;
    if (reviewCounts) reviewCounts.textContent = `${submission.score} düzgün, ${submission.incorrect_count || 0} səhv`;
    if (reviewPercent) reviewPercent.textContent = `${submission.percentage}%`;

    if (studentReviewGrid) {
      studentReviewGrid.replaceChildren();

      const userAnswers = submission.answers || {};

      for (let i = 1; i <= totalQuestions; i++) {
        const qNumStr = String(i);
        const correctAns = (answerKey[qNumStr] || "").toUpperCase();
        const studentAns = (userAnswers[qNumStr] || "").toUpperCase();

        const card = document.createElement("div");
        card.className = "review-q-card";

        const isCorrect = studentAns && studentAns === correctAns;
        const isEmpty = !studentAns;

        if (isCorrect) card.classList.add("correct");
        else if (isEmpty) card.classList.add("empty");
        else card.classList.add("incorrect");

        const qInfo = document.createElement("div");
        const strongEl = document.createElement("strong");
        strongEl.textContent = `Sual ${i}: `;
        const labelText = document.createTextNode("Müəllim Açarı: ");
        const bEl = document.createElement("b");
        bEl.textContent = correctAns || "-";
        qInfo.appendChild(strongEl);
        qInfo.appendChild(labelText);
        qInfo.appendChild(bEl);
        card.appendChild(qInfo);

        const badge = document.createElement("span");
        if (isCorrect) {
          badge.className = "review-badge correct";
          badge.textContent = `✓ Şagird: ${studentAns}`;
        } else if (isEmpty) {
          badge.className = "review-badge empty";
          badge.textContent = "Boş";
        } else {
          badge.className = "review-badge incorrect";
          badge.textContent = `✗ Şagird: ${studentAns}`;
        }
        card.appendChild(badge);

        studentReviewGrid.appendChild(card);
      }
    }

    assignmentAnswersReviewModal.classList.add("active");
  }

  function closeStudentAnswerReview() {
    if (assignmentAnswersReviewModal) assignmentAnswersReviewModal.classList.remove("active");
  }

  if (btnCloseReviewModal) btnCloseReviewModal.addEventListener("click", closeStudentAnswerReview);
  if (btnCloseReviewModalBtn) btnCloseReviewModalBtn.addEventListener("click", closeStudentAnswerReview);

  // İlk açılışda həm ümumi repetitor panelini, həm də fərdi PDF sınaqları paralel yükləyirik
  await Promise.allSettled([
    loadDashboard(),
    loadAssignments()
  ]);
});
