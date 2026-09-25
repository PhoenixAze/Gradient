import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://gradient-backend-fam5.onrender.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rghavkrmidiqkuardais.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnaGF2a3JtaWRpcWt1YXJkYWlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODgwMDc1MSwiZXhwIjoyMTA0Mzc2NzUxfQ.81WtJInGddHjYImwHXXWMaJwiYJRiX2GZqY4UkSS6qo';
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || '5307c8e4ae70e234a147f7e869ace2d97241b765e518c91c02829f43e673edeb';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- YARDIMÇI: Zero-Trust JWT Sessiya Yoxlanışı ---
function extractAndVerifyUser(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.headers['cookie']) {
    const cookies = req.headers['cookie'].split(';');
    for (const c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith('access_token=')) {
        const val = trimmed.substring('access_token='.length);
        token = val.startsWith('Bearer%20') ? val.substring(9) : val.startsWith('Bearer ') ? val.substring(7) : val;
        break;
      }
    }
  }

  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const signature = crypto.createHmac('sha256', JWT_SECRET_KEY)
      .update(parts[0] + '.' + parts[1])
      .digest('base64url');
    if (signature !== parts[2]) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload; // { sub: user_id, role: 'student'|'tutor'|'admin' }
  } catch (e) {
    return null;
  }
}

// --- YARDIMÇI: Supabase REST API Əməliyyatları (Yalnız Server Tərəfində) ---
async function supabaseFetch(tableAndQuery, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${tableAndQuery}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase Error (${res.status}): ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================================
// 1. ŞAGİRD ANALİTİKASI (REAL VERİLƏNLƏR BAZASI HESABLAMALARI)
// ============================================================================
async function handleStudentAnalytics(req, res) {
  const user = extractAndVerifyUser(req);
  if (!user || !user.sub) {
    return res.status(401).json({ detail: "Sessiya tapılmadı və ya vaxtı bitib." });
  }

  try {
    // Şagirdin bitmiş sınaq nəticələrini Supabase-dən çəkirik
    const results = await supabaseFetch(`exam_results?student_id=eq.${user.sub}&order=created_at.desc&select=*`);

    if (!results || results.length === 0) {
      return res.json({
        has_data: false,
        total_exams: 0,
        total_questions: 0,
        correct_count: 0,
        incorrect_count: 0,
        empty_count: 0,
        accuracy_pct: 0.0,
        subject_stats: [],
        history: [],
        ai_diagnosis: null
      });
    }

    // Əlaqəli sınaqları çəkirik
    const examIds = [...new Set(results.map(r => r.exam_id).filter(Boolean))];
    let examsMap = {};
    if (examIds.length > 0) {
      const exams = await supabaseFetch(`exams?id=in.(${examIds.join(',')})&select=id,title,subject,question_count`);
      exams.forEach(e => { examsMap[e.id] = e; });
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalEmpty = 0;
    const subjectsMap = {};
    const history = [];

    for (const r of results) {
      const exam = examsMap[r.exam_id] || {};
      const examTitle = exam.title || "DİM Sınağı";
      const subject = exam.subject || "Ümumi";
      const qCount = r.total_questions || exam.question_count || 0;
      const score = r.score || 0;
      let inc = r.incorrect_count;
      let emp = r.empty_count;

      if (inc === null || inc === undefined) inc = Math.max(0, qCount - score);
      if (emp === null || emp === undefined) emp = Math.max(0, qCount - (score + inc));

      totalQuestions += qCount;
      totalCorrect += score;
      totalIncorrect += inc;
      totalEmpty += emp;

      if (!subjectsMap[subject]) {
        subjectsMap[subject] = {
          subject,
          total_questions: 0,
          correct_count: 0,
          incorrect_count: 0,
          empty_count: 0,
          exams_count: 0
        };
      }
      subjectsMap[subject].total_questions += qCount;
      subjectsMap[subject].correct_count += score;
      subjectsMap[subject].incorrect_count += inc;
      subjectsMap[subject].empty_count += emp;
      subjectsMap[subject].exams_count += 1;

      history.push({
        id: r.id,
        exam_id: r.exam_id,
        title: examTitle,
        subject: subject,
        score: score,
        incorrect_count: inc,
        empty_count: emp,
        total_questions: qCount,
        created_at: r.created_at,
        percentage: qCount > 0 ? Math.round((score / qCount) * 100) : 0
      });
    }

    const subjectStats = Object.values(subjectsMap).map(s => {
      const acc = s.total_questions > 0 ? Math.round((s.correct_count / s.total_questions) * 100 * 10) / 10 : 0;
      return { ...s, accuracy_pct: acc };
    });
    subjectStats.sort((a, b) => b.accuracy_pct - a.accuracy_pct);

    const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100 * 10) / 10 : 0;

    // Real nəticələrə əsaslanan AI Diaqnozu
    let aiDiagnosis = null;
    if (subjectStats.length > 0) {
      const weakest = subjectStats[subjectStats.length - 1];
      const strongest = subjectStats[0];

      if (weakest.accuracy_pct < 60) {
        aiDiagnosis = `Son sınaqların təhlili göstərir ki, ən çox bal itkisi "${weakest.subject}" fənnində qeydə alınıb (${weakest.accuracy_pct}% dəqiqlik). Bu fənn üzrə zəif mövzuları təkrar etmək növbəti sınaqda nəticənizi birbaşa yüksəldəcək.`;
      } else {
        aiDiagnosis = `Ümumi nəticəniz sabitdir (${overallAccuracy}% dəqiqlik). Ən güclü sahəniz "${strongest.subject}" (${strongest.accuracy_pct}%) fənnidir. Balınızı ən yuxarı həddə çatdırmaq üçün vaxt idarəetməsi strategiyasına diqqət yetirin.`;
      }
    }

    return res.json({
      has_data: true,
      total_exams: results.length,
      total_questions: totalQuestions,
      correct_count: totalCorrect,
      incorrect_count: totalIncorrect,
      empty_count: totalEmpty,
      accuracy_pct: overallAccuracy,
      subject_stats: subjectStats,
      history,
      ai_diagnosis: aiDiagnosis
    });
  } catch (err) {
    console.error("Analytics Error:", err);
    return res.status(500).json({ detail: "Analitika məlumatlarını hesablamaq mümkün olmadı." });
  }
}

// ============================================================================
// 2. REPETİTOR İDARƏETMƏ PANELİ (REAL VERİLƏNLƏR BAZASI)
// ============================================================================
async function handleTutorDashboard(req, res) {
  const user = extractAndVerifyUser(req);
  if (!user || !user.sub) {
    return res.status(401).json({ detail: "Sessiya tapılmadı və ya vaxtı bitib." });
  }

  try {
    // Repetitor profilini çəkirik
    const tutorRows = await supabaseFetch(`users?id=eq.${user.sub}&select=id,first_name,last_name,identifier,subject,role,balance`);
    if (!tutorRows || tutorRows.length === 0) {
      return res.status(404).json({ detail: "Repetitor profili tapılmadı." });
    }
    const tutor = tutorRows[0];
    if (tutor.role !== 'tutor') {
      return res.status(403).json({ detail: "Bu panelə yalnız repetitorlar daxil ola bilər." });
    }

    // Repetitora aid olan şagirdləri çəkirik
    const students = await supabaseFetch(`users?tutor_id=eq.${tutor.id}&select=id,first_name,last_name,identifier,grade,created_at`);

    let studentIds = (students || []).map(s => s.id);
    let allResults = [];
    let examsMap = {};

    if (studentIds.length > 0) {
      allResults = await supabaseFetch(`exam_results?student_id=in.(${studentIds.join(',')})&order=created_at.desc&select=*`);
      const examIds = [...new Set((allResults || []).map(r => r.exam_id).filter(Boolean))];
      if (examIds.length > 0) {
        const exams = await supabaseFetch(`exams?id=in.(${examIds.join(',')})&select=id,title,subject`);
        (exams || []).forEach(e => { examsMap[e.id] = e; });
      }
    }

    // Şagirdlər üzrə hesablamalar
    const studentsMap = {};
    (students || []).forEach(s => {
      studentsMap[s.id] = {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        identifier: s.identifier,
        grade: s.grade || "Qeyd edilməyib",
        exams_count: 0,
        total_score: 0,
        total_questions: 0,
        last_exam_date: null,
        last_score: null,
        accuracy_pct: 0,
        status: "Sınaq işləməyib"
      };
    });

    let totalGroupScore = 0;
    let totalGroupQuestions = 0;

    (allResults || []).forEach(r => {
      const st = studentsMap[r.student_id];
      if (st) {
        st.exams_count += 1;
        st.total_score += (r.score || 0);
        st.total_questions += (r.total_questions || 0);
        if (!st.last_exam_date) {
          st.last_exam_date = r.created_at;
          st.last_score = `${r.score || 0}/${r.total_questions || 0}`;
        }
      }
    });

    const studentList = Object.values(studentsMap).map(st => {
      if (st.total_questions > 0) {
        st.accuracy_pct = Math.round((st.total_score / st.total_questions) * 100 * 10) / 10;
        totalGroupScore += st.total_score;
        totalGroupQuestions += st.total_questions;
        if (st.accuracy_pct >= 80) st.status = "Yaxşı";
        else if (st.accuracy_pct >= 50) st.status = "Orta";
        else st.status = "Zəif";
      }
      return st;
    });

    studentList.sort((a, b) => b.accuracy_pct - a.accuracy_pct);

    const groupAvg = totalGroupQuestions > 0 ? Math.round((totalGroupScore / totalGroupQuestions) * 100 * 10) / 10 : 0;

    // Ən son sınaqlar (Feed)
    const recentSubmissions = (allResults || []).slice(0, 10).map(r => {
      const student = (students || []).find(s => s.id === r.student_id);
      const exam = examsMap[r.exam_id] || {};
      const qCount = r.total_questions || 0;
      const sc = r.score || 0;
      return {
        result_id: r.id,
        student_name: student ? `${student.first_name} ${student.last_name}` : "Şagird",
        exam_title: exam.title || "DİM Sınağı",
        subject: exam.subject || "Ümumi",
        score: sc,
        total_questions: qCount,
        percentage: qCount > 0 ? Math.round((sc / qCount) * 100) : 0,
        created_at: r.created_at
      };
    });

    return res.json({
      tutor: {
        id: tutor.id,
        first_name: tutor.first_name,
        last_name: tutor.last_name,
        identifier: tutor.identifier,
        subject: tutor.subject || "Fənn qeyd edilməyib",
        balance: tutor.balance || 0,
        invite_code: tutor.identifier
      },
      stats: {
        total_students: (students || []).length,
        total_exams_completed: (allResults || []).length,
        group_avg_accuracy: groupAvg
      },
      students: studentList,
      recent_submissions: recentSubmissions
    });
  } catch (err) {
    console.error("Tutor Dashboard Error:", err);
    return res.status(500).json({ detail: "Repetitor paneli məlumatlarını yükləmək mümkün olmadı." });
  }
}

// ============================================================================
// 3. REPETİTOR ŞAGİRD ƏLAVƏ ET / SİL / QOŞUL
// ============================================================================
async function handleAddStudent(req, res) {
  const user = extractAndVerifyUser(req);
  if (!user || user.role !== 'tutor') {
    return res.status(403).json({ detail: "Yalnız repetitorlar şagird əlavə edə bilər." });
  }

  const { identifier } = req.body || {};
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ detail: "Şagirdin E-poçt və ya Mobil nömrəsini daxil edin." });
  }

  try {
    const trimmed = identifier.trim();
    const students = await supabaseFetch(`users?identifier=eq.${encodeURIComponent(trimmed)}&select=id,role,first_name,last_name,identifier,grade,tutor_id`);

    if (!students || students.length === 0) {
      return res.status(404).json({ detail: "Bu E-poçt və ya Mobil nömrə ilə qeydiyyatdan keçmiş istifadəçi tapılmadı." });
    }

    const student = students[0];
    if (student.role !== 'student') {
      return res.status(400).json({ detail: "Qeyd olunan istifadəçi şagird deyil." });
    }

    if (student.tutor_id === user.sub) {
      return res.status(400).json({ detail: "Bu şagird artıq sizin qrupunuzdadır." });
    }

    // Şagirdin tutor_id-sini yeniləyirik
    await supabaseFetch(`users?id=eq.${student.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tutor_id: user.sub }),
      headers: { 'Prefer': 'return=representation' }
    });

    return res.json({
      success: true,
      message: `Şagird ${student.first_name} ${student.last_name} uğurla qrupa əlavə edildi!`,
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        identifier: student.identifier,
        grade: student.grade
      }
    });
  } catch (err) {
    console.error("Add Student Error:", err);
    return res.status(500).json({ detail: "Şagirdi qrupa əlavə edərkən xəta baş verdi." });
  }
}

async function handleRemoveStudent(req, res) {
  const user = extractAndVerifyUser(req);
  if (!user || user.role !== 'tutor') {
    return res.status(403).json({ detail: "Yalnız repetitorlar şagird çıxara bilər." });
  }

  const studentId = req.params.id;
  try {
    await supabaseFetch(`users?id=eq.${studentId}&tutor_id=eq.${user.sub}`, {
      method: 'PATCH',
      body: JSON.stringify({ tutor_id: null }),
      headers: { 'Prefer': 'return=representation' }
    });
    return res.json({ success: true, message: "Şagird uğurla qrupdan çıxarıldı." });
  } catch (err) {
    return res.status(500).json({ detail: "Şagirdi çıxarmaq mümkün olmadı." });
  }
}

async function handleJoinTutor(req, res) {
  const user = extractAndVerifyUser(req);
  if (!user || user.role !== 'student') {
    return res.status(400).json({ detail: "Yalnız şagirdlər repetitor qrupuna qoşula bilər." });
  }

  const { tutor_code } = req.body || {};
  if (!tutor_code) {
    return res.status(400).json({ detail: "Repetitor kodunu və ya E-poçtunu daxil edin." });
  }

  try {
    const code = tutor_code.trim();
    let tutors = await supabaseFetch(`users?identifier=eq.${encodeURIComponent(code)}&select=id,role,first_name,last_name,subject`);
    if (!tutors || tutors.length === 0) {
      tutors = await supabaseFetch(`users?id=eq.${encodeURIComponent(code)}&select=id,role,first_name,last_name,subject`);
    }

    if (!tutors || tutors.length === 0 || tutors[0].role !== 'tutor') {
      return res.status(404).json({ detail: "Qeyd olunan kod üzrə repetitor tapılmadı." });
    }

    const tutor = tutors[0];
    await supabaseFetch(`users?id=eq.${user.sub}`, {
      method: 'PATCH',
      body: JSON.stringify({ tutor_id: tutor.id }),
      headers: { 'Prefer': 'return=representation' }
    });

    return res.json({
      success: true,
      message: `${tutor.first_name} ${tutor.last_name} müəllimin qrupuna qoşuldunuz!`,
      tutor_name: `${tutor.first_name} ${tutor.last_name}`,
      subject: tutor.subject
    });
  } catch (err) {
    return res.status(500).json({ detail: "Repetitora qoşularkən xəta baş verdi." });
  }
}

// Explicit API Routes for Real Analytics & Tutor System
app.get('/api/v1/analytics/me', handleStudentAnalytics);
app.get('/api/v1/tutor/dashboard', handleTutorDashboard);
app.post('/api/v1/tutor/students/add', handleAddStudent);
app.delete('/api/v1/tutor/students/:id', handleRemoveStudent);
app.post('/api/v1/tutor/join', handleJoinTutor);

// Reverse proxy for remaining /api/* requests to Render backend
app.all('/api/*', async (req, res) => {
  const targetUrl = `${BACKEND_URL}${req.originalUrl}`;

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    headers['origin'] = 'http://localhost:3000';
    headers['x-forwarded-for'] = req.ip;

    const fetchOptions = {
      method: req.method,
      headers: headers,
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
      headers['content-type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    fetchOptions.signal = controller.signal;

    const backendRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    // Əgər Render-də bu endpoint hələ yoxdursa (404), fallback kimi yoxlayırıq
    if (backendRes.status === 404) {
      if (req.originalUrl.startsWith('/api/v1/analytics/me')) {
        return handleStudentAnalytics(req, res);
      }
      if (req.originalUrl.startsWith('/api/v1/tutor/dashboard')) {
        return handleTutorDashboard(req, res);
      }
    }

    res.status(backendRes.status);

    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding' || lowerKey === 'content-length') return;
      if (lowerKey === 'set-cookie') {
        const modifiedCookie = value
          .replace(/Domain=[^;]+;?/gi, '')
          .replace(/SameSite=Lax/gi, 'SameSite=None')
          .replace(/SameSite=Strict/gi, 'SameSite=None');
        res.append('Set-Cookie', modifiedCookie);
      } else {
        res.setHeader(key, value);
      }
    });

    const responseData = await backendRes.arrayBuffer();
    return res.send(Buffer.from(responseData));
  } catch (err) {
    console.warn(`[Proxy Fallback] ${req.method} ${targetUrl}:`, err.message);

    if (req.originalUrl.includes('/api/v1/settings/contact')) {
      return res.json({
        whatsapp_url: "https://wa.me/994505975697",
        email: "support@gradient.az",
        phone: "+994 50 597 56 97"
      });
    }

    if (req.originalUrl.includes('/api/v1/users/me')) {
      const user = extractAndVerifyUser(req);
      if (user && user.sub) {
        try {
          const profile = await supabaseFetch(`users?id=eq.${user.sub}&select=id,role,first_name,last_name,balance,grade,subject`);
          if (profile && profile.length > 0) return res.json(profile[0]);
        } catch (_) {}
      }
      return res.status(401).json({ detail: "Sessiya tapılmadı." });
    }

    if (req.originalUrl.startsWith('/api/v1/analytics/me')) {
      return handleStudentAnalytics(req, res);
    }

    if (req.originalUrl.startsWith('/api/v1/tutor/dashboard')) {
      return handleTutorDashboard(req, res);
    }

    if (req.originalUrl.includes('/api/v1/exams')) {
      try {
        const exams = await supabaseFetch('exams?select=id,title,subject,price,question_count,duration_minutes,created_at&order=created_at.desc');
        return res.json(exams);
      } catch (_) {}
    }

    return res.status(502).json({
      detail: "Backend serveri hazırda cavab vermir. Zəhmət olmasa bir az sonra yenidən cəhd edin."
    });
  }
});

// Statik faylların təqdim edilməsi
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// Route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gradient platform is running on port ${PORT}`);
});
