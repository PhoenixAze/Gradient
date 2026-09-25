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
  const tabBtnExams = document.getElementById("tab-btn-exams");
  const tabBtnAi = document.getElementById("tab-btn-ai");
  const paneStudents = document.getElementById("pane-students");
  const paneExams = document.getElementById("pane-exams");
  const paneAi = document.getElementById("pane-ai");
  const tabStudentsCount = document.getElementById("tab-students-count");
  const tabSubmissionsCount = document.getElementById("tab-submissions-count");

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

  // --- QLOBAL TƏHLÜKƏSİZ API SORĞU İDARƏEDİCİSİ (ZERO-TRUST & REFRESH TOKEN) ---
  async function fetchWithAuth(endpoint, options = {}) {
    options.credentials = "include";

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch (err) {
      console.error("Şəbəkə xətası:", err);
      return null;
    }

    if (response && response.status === 401) {
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include"
        });

        if (refreshResponse.ok) {
          response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        } else {
          window.location.href = "auth.html";
          return null;
        }
      } catch (refreshErr) {
        console.error("Token yeniləmə xətası:", refreshErr);
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
      { id: "exams", btn: tabBtnExams, pane: paneExams },
      { id: "ai", btn: tabBtnAi, pane: paneAi }
    ];

    tabs.forEach(({ id, btn, pane }) => {
      if (id === targetTab) {
        btn.classList.add("active");
        pane.classList.remove("hidden");
      } else {
        btn.classList.remove("active");
        pane.classList.add("hidden");
      }
    });
  }

  if (tabBtnStudents) tabBtnStudents.addEventListener("click", () => switchTab("students"));
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

  // Başlat
  await loadDashboard();
});
