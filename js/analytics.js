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
  const skeletonEl = document.getElementById("analytics-skeleton");
  const emptyEl = document.getElementById("analytics-empty");
  const contentEl = document.getElementById("analytics-content");

  const valAccuracy = document.getElementById("val-accuracy");
  const valTotalExams = document.getElementById("val-total-exams");
  const valQuestions = document.getElementById("val-questions");
  const diagnosisText = document.getElementById("diagnosis-text");
  const subjectListContainer = document.getElementById("subject-list-container");
  const historyTableBody = document.getElementById("history-table-body");

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

  // Qlobal Təhlükəsiz API Sorğu İdarəedicisi
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

        const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: refreshHeaders,
          credentials: "include"
        });

        if (refreshRes && refreshRes.ok) {
          const rfData = await refreshRes.json().catch(() => ({}));
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
      } catch (e) {
        clearStoredTokens();
        window.location.href = "auth.html";
        return null;
      }
    }

    return response;
  }

  // Sessiya və Analitika Məlumatının Çəkilməsi
  async function loadAnalytics() {
    try {
      const response = await fetchWithAuth("/api/v1/analytics/me", {
        method: "GET"
      });

      if (!response) {
        skeletonEl.classList.add("hidden");
        return;
      }

      if (response.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      if (!response.ok) {
        throw new Error("Analitika məlumatlarını almaq mümkün olmadı.");
      }

      const data = await response.json();
      skeletonEl.classList.add("hidden");

      if (!data.has_data || data.total_exams === 0) {
        emptyEl.classList.remove("hidden");
        return;
      }

      // Real Metrikaları Təhlükəsiz Şəkildə (textContent) Render Edirik
      contentEl.classList.remove("hidden");

      valAccuracy.textContent = `${data.accuracy_pct}%`;
      valTotalExams.textContent = data.total_exams;
      valQuestions.textContent = `${data.correct_count} / ${data.total_questions}`;

      if (data.ai_diagnosis) {
        diagnosisText.textContent = data.ai_diagnosis;
      } else {
        diagnosisText.textContent = "Sınaq nəticələriniz əsasında fərdi inkişaf trayektoriyanız hazırlanır.";
      }

      // Fənlər üzrə Dəqiqlik
      subjectListContainer.replaceChildren();
      if (Array.isArray(data.subject_stats) && data.subject_stats.length > 0) {
        data.subject_stats.forEach((s) => {
          const item = document.createElement("div");
          item.className = "subject-item";

          const header = document.createElement("div");
          header.className = "subject-header";

          const nameSpan = document.createElement("span");
          nameSpan.textContent = s.subject;

          const metaSpan = document.createElement("span");
          metaSpan.className = "subject-meta";
          metaSpan.textContent = `${s.correct_count}/${s.total_questions} düzgün (${s.accuracy_pct}%)`;

          header.appendChild(nameSpan);
          header.appendChild(metaSpan);

          const track = document.createElement("div");
          track.className = "progress-track";

          const fill = document.createElement("div");
          let levelClass = "low";
          if (s.accuracy_pct >= 75) levelClass = "high";
          else if (s.accuracy_pct >= 50) levelClass = "mid";

          fill.className = `progress-fill ${levelClass}`;
          fill.style.width = `${Math.min(100, Math.max(0, s.accuracy_pct))}%`;

          track.appendChild(fill);
          item.appendChild(header);
          item.appendChild(track);
          subjectListContainer.appendChild(item);
        });
      }

      // Sınaq Tarixçəsi Cədvəli
      historyTableBody.replaceChildren();
      if (Array.isArray(data.history) && data.history.length > 0) {
        data.history.forEach((h) => {
          const tr = document.createElement("tr");

          const tdTitle = document.createElement("td");
          tdTitle.style.fontWeight = "500";
          tdTitle.textContent = h.title || "Sınaq";

          const tdSubject = document.createElement("td");
          const subjBadge = document.createElement("span");
          subjBadge.className = "badge-tag";
          subjBadge.textContent = h.subject || "Ümumi";
          tdSubject.appendChild(subjBadge);

          const tdScore = document.createElement("td");
          tdScore.textContent = `${h.score} / ${h.total_questions}`;

          const tdPct = document.createElement("td");
          tdPct.style.fontWeight = "600";
          tdPct.textContent = `${h.percentage}%`;
          if (h.percentage >= 75) tdPct.style.color = "var(--success)";
          else if (h.percentage >= 50) tdPct.style.color = "var(--warning)";
          else tdPct.style.color = "var(--danger)";

          const tdDate = document.createElement("td");
          tdDate.style.color = "var(--text-muted)";
          if (h.created_at) {
            const d = new Date(h.created_at);
            tdDate.textContent = d.toLocaleDateString("az-AZ", {
              year: "numeric",
              month: "short",
              day: "numeric"
            });
          } else {
            tdDate.textContent = "-";
          }

          tr.appendChild(tdTitle);
          tr.appendChild(tdSubject);
          tr.appendChild(tdScore);
          tr.appendChild(tdPct);
          tr.appendChild(tdDate);

          historyTableBody.appendChild(tr);
        });
      }

    } catch (err) {
      console.error(err);
      skeletonEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      emptyEl.querySelector(".empty-box-title").textContent = "Məlumat yüklənərkən xəta baş verdi";
      emptyEl.querySelector(".empty-box-desc").textContent = "Zəhmət olmasa internet bağlantınızı yoxlayın və ya səhifəni yeniləyin.";
    }
  }

  await loadAnalytics();
});
