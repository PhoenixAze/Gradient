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
  // DOM Elementləri
  const skeletonEl = document.getElementById("tutor-skeleton");
  const contentEl = document.getElementById("tutor-content");

  const tutorNameEl = document.getElementById("tutor-name");
  const tutorSubjectEl = document.getElementById("tutor-subject");
  const welcomeHeadingEl = document.getElementById("welcome-heading");
  const inviteCodeDisplay = document.getElementById("invite-code-display");
  const btnCopyCode = document.getElementById("btn-copy-code");
  const btnLogout = document.getElementById("btn-tutor-logout");

  const statTotalStudents = document.getElementById("stat-total-students");
  const statTotalExams = document.getElementById("stat-total-exams");
  const statGroupAvg = document.getElementById("stat-group-avg");

  const studentsEmptyState = document.getElementById("students-empty-state");
  const studentsTableWrap = document.getElementById("students-table-wrap");
  const studentsTableBody = document.getElementById("students-table-body");

  const submissionsEmpty = document.getElementById("submissions-empty");
  const submissionsTableWrap = document.getElementById("submissions-table-wrap");
  const submissionsTableBody = document.getElementById("submissions-table-body");

  // Modal Elementləri
  const modalOverlay = document.getElementById("add-student-modal");
  const btnOpenModal = document.getElementById("btn-open-add-student");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCancelModal = document.getElementById("btn-cancel-modal");
  const addStudentForm = document.getElementById("add-student-form");
  const studentIdentifierInput = document.getElementById("student-identifier-input");
  const modalFeedback = document.getElementById("modal-feedback");
  const btnSubmitAddStudent = document.getElementById("btn-submit-add-student");

  let tutorData = null;

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

    // Əgər Access Token bitibsə (401), Refresh Token ilə yenisini alırıq
    if (response && response.status === 401) {
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include"
        });

        if (refreshResponse.ok) {
          // Token uğurla yeniləndi, orijinal sorğunu təkrar icra edirik
          response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        } else {
          // Refresh token də bitib -> İstifadəçi login səhifəsinə yönləndirilir
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

  // Xəta Bildirişi Banneri (Boş ekrandan və loop-dan qoruyur)
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
        // İstifadəçi repetitor deyilsə (şagirddirsə), şagird panelinə yönləndir
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
      renderStudents(tutorData.students || []);
      renderSubmissions(tutorData.recent_submissions || []);

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
    statTotalExams.textContent = stats.total_exams_completed || 0;
    statGroupAvg.textContent = `${stats.group_avg_accuracy || 0}%`;
  }

  // Şagirdlər Cədvəlinin Təhlükəsiz (Zero-Trust) Render Edilməsi
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

      // Əməliyyat (Qrupdan çıxar)
      const tdAction = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-ghost btn-sm text-danger";
      removeBtn.style.padding = "4px 8px";
      removeBtn.textContent = "Çıxar";
      removeBtn.addEventListener("click", () => handleRemoveStudent(st.id, `${st.first_name || ""} ${st.last_name || ""}`));
      tdAction.appendChild(removeBtn);

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

  // Son İmtahan Fəallığının Render Edilməsi
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
      tr.appendChild(tdPct);
      tr.appendChild(tdDate);

      submissionsTableBody.appendChild(tr);
    });
  }

  // --- 2. ŞAGİRD SİLMƏK (QRUPDAN ÇIXARMAQ) ---
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

  // --- 3. ŞAGİRD ƏLAVƏ ETMƏ FORMASI ---
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

  // --- 4. KODU KOPYALAMAQ ---
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

  // --- 5. ÇIXIŞ (LOGOUT) ---
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
