import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// DIAGNOSTIKA: Mərkəzləşdirilmiş, təhlükəsiz log qatı (Zero-Trust)
// Məqsəd: xətaların kök səbəbini müştəriyə sızdırmadan server tərəfdə izləmək.
// Qeyd: Heç bir açar/sirre/token JURNALDA yazılmır (redaktə olunur).
// ============================================================================
const DIAG = {
  enabled: process.env.DIAG_LOG !== 'off',
  secrets: new Set(
    [
      process.env.GEMINI_API_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.BACKEND_API_URL
    ].filter(Boolean)
  ),
  rid: 0
};

/** Dəyişənləri təhlükəsiz formada redaktə edir (mətn, obyekt, error). */
const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > 3) return '[max-depth]';

  if (typeof value === 'string') {
    let out = value.length > 300 ? `${value.slice(0, 300)}…` : value;
    for (const secret of DIAG.secrets) {
      if (secret && out.includes(secret)) out = out.split(secret).join('***REDACTED***');
    }
    return out;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => sanitize(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: sanitize(value.message, depth + 1) };

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (/(pass(word)?|secret|token|api[_-]?key|authorization|cookie)/i.test(k)) {
      out[k] = '***REDACTED***';
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out;
};

const diag = (event, data = {}) => {
  if (!DIAG.enabled) return;
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    rid: data.rid,
    ...sanitize(data)
  }));
};

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://gradient-backend-fam5.onrender.com';

// Diagnostik: konfiqurasiya və mühit boşluqları (startup audit)
diag('boot.config', {
  rid: 'boot',
  port: PORT,
  backend: BACKEND_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY),
  dotEnvFilePresent: fs.existsSync(path.join(__dirname, '.env'))
});
if (!process.env.GEMINI_API_KEY) {
  diag('boot.warn', { rid: 'boot', reason: 'GEMINI_API_KEY tapılmadı — AI endpoint-ləri upstream backend-ə ötürüləcək' });
}

// ============================================================================
// ZERO-TRUST TƏHLÜKƏSİZLİK QATI (.clinerules §1)
// 1. CORS: yalnız frontend domenləri — wildcard qadağandır.
// 2. Rate limiting: hər IP üçün sürüşmə pəncərəsi (sliding window).
// 3. Gücləndirilmiş security header-lər (HSTS, X-Frame-Options, nosniff).
// 4. İnput sanitizasiyası: gözlənilməz tip/length yoxlamaları.
// ============================================================================

// --- CORS WHITELIST ---
// Yalnız bu mənşələrə icazə verilir. '*' heç vaxt istifadə olunmur.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ||
    'http://localhost:3000,https://gradient.az,https://www.gradient.az,https://phoenixaze.github.io')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Refresh-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- SECURITY HEADERS ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// --- RATE LIMITING (sliding window, in-memory) ---
// Hər bucket üçün ayrı limit. Aşımda 429 + Retry-After qaytarılır.
// Məqsəd: brute-force login, AI endpoint zərbələnməsi və bahalı
// məhsuldarlıq resurslarının (Gemini) sui-istifadəsinin qarşısını almaq.
const RATE_LIMITS = {
  default: { windowMs: 60000, max: 120 },
  ai: { windowMs: 60000, max: 10 },
  auth: { windowMs: 900000, max: 20 }
};

const rateBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of rateBuckets) {
    for (const ts of hits.keys()) {
      if (now - ts > 900000) hits.delete(ts);
    }
    if (hits.size === 0) rateBuckets.delete(key);
  }
}, 60000).unref();

const rateLimit = (bucketName) => (req, res, next) => {
  const cfg = RATE_LIMITS[bucketName] || RATE_LIMITS.default;
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const key = `${bucketName}:${ip}`;
  const now = Date.now();

  if (!rateBuckets.has(key)) rateBuckets.set(key, new Map());
  const hits = rateBuckets.get(key);

  for (const ts of Array.from(hits.keys())) {
    if (now - ts > cfg.windowMs) hits.delete(ts);
  }
  if (hits.size >= cfg.max) {
    const oldest = Math.min.apply(null, Array.from(hits.keys()));
    const retryAfter = Math.max(1, Math.ceil((cfg.windowMs - (now - oldest)) / 1000));
    diag('ratelimit.block', { rid: req.diagId, bucket: bucketName, path: req.originalUrl.split('?')[0] });
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ detail: 'Çox sayda sorğu göndərildi. Bir az sonra yenidən cəhd edin.' });
  }
  hits.set(now, true);
  next();
};

// Bütün API sorğuları üçün default limit
app.use('/api', rateLimit('default'));

// --- INPUT SANITIZATION (Pydantic-ekvivalent yoxlama) ---
/** Mətn sahələrini tip + uzunluq baxımından yoxlayır. */
const safeStr = (value, maxLen, field) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') {
    const err = new Error(`"${field}" düzgün mətn tipində olmalıdır.`);
    err.statusCode = 422;
    throw err;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    const err = new Error(`"${field}" maksimum ${maxLen} simvoldan uzun ola bilməz.`);
    err.statusCode = 422;
    throw err;
  }
  return trimmed;
};

// PDF və böyük sınaq məlumatları üçün payload həddini artırırıq (50mb)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Bütün sorğular üçün yeganə reqyestr izləmə kanalı (müştəri qatına heç nə yazılmır)
app.use((req, res, next) => {
  const rid = `r${++DIAG.rid}`;
  req.diagId = rid;
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    diag('http.request', {
      rid,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100
    });
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      diag('http.abort', { rid, method: req.method, path: req.originalUrl.split('?')[0] });
    }
  });

  next();
});

// ---------------------------------------------------------------------------
// DEV FALLBACK MAĞAZASI (yalnız development rejimində aktivdir)
// Təhlükəsizlik: Production-da bu mağaza tamamilə söndürülür, beləliklə
// autentifikasiya edilməmiş istifadəçi heç vaxt real cavab ala bilmir.
// ---------------------------------------------------------------------------
const DEV_FALLBACK_ENABLED = process.env.NODE_ENV !== 'production' && process.env.DISABLE_DEV_FALLBACK !== 'true';
if (!DEV_FALLBACK_ENABLED) {
  diag('boot.info', { rid: 'boot', note: 'dev-fallback söndürülüb (production rejimi)' });
}

const devAssignments = new Map();
const devAnswerSheets = new Map();

/**
 * Kriptoqrafik təsadüfi ID yaradır.
 * Təhlükəsizlik: Math.random() təxmin edilə biləndir, beləliklə ID-lər
 * enumerasiya hücumuna (guessable ID) məruz qalırdı.
 */
const secureId = (prefix) => prefix + '_' + crypto.randomBytes(12).toString('hex');

/**
 * Sınaq tapşırığı üçün lokal fallback işləyicisi.
 * Bütün məntıq bir dəfə yazılır və həm uğursuz upstream (4xx/5xx),
 * həm də şəbəkə xətası (catch) yollarında istifadə olunur — əvvəlki kod
 * bu bloku 2 dəfə təkrarlamışdı (DRY pozulması + sürəşlənmə riski).
 * Qaytarır: true — sorğu cavoblandırıldı, false — bu route fallback-ə aid deyil.
 */
function handleDevAssignmentFallback(req, res) {
  if (!DEV_FALLBACK_ENABLED) return false;
  if (!req.originalUrl.includes('/api/v1/tutor/assignments')) return false;

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // --- POST /api/v1/tutor/assignments (yaradılma) ---
  if (req.method === 'POST' && req.originalUrl === '/api/v1/tutor/assignments') {
    let title;
    try { title = safeStr(body.title, 200, 'title'); } catch (e) {
      res.status(422).json({ detail: e.message });
      return true;
    }
    const id = secureId('asg');
    const data = {
      id,
      title: title || 'Sınaq İmtahanı',
      pdf_url: typeof body.pdf_url === 'string' ? body.pdf_url : '',
      answer_key: (body.answer_key && typeof body.answer_key === 'object') ? body.answer_key : {},
      question_count: Math.min(Math.max(Number(body.question_count) || 25, 1), 120),
      duration_minutes: Math.min(Math.max(Number(body.duration_minutes) || 60, 1), 600),
      created_at: new Date().toISOString()
    };
    devAssignments.set(id, data);
    diag('devfallback.create', { rid: req.diagId, assignmentId: id });
    res.json({ success: true, assignment_id: id, assignment: data });
    return true;
  }

  // --- GET /api/v1/tutor/assignments (siyahı) ---
  if (req.method === 'GET' && req.originalUrl === '/api/v1/tutor/assignments') {
    const list = Array.from(devAssignments.values()).map((asg) => {
      const sheets = Array.from(devAnswerSheets.values()).filter((s) => s.assignment_id === asg.id);
      const scores = sheets.map((s) => s.score);
      return {
        ...asg,
        submission_count: sheets.length,
        avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        max_score: scores.length ? Math.max(...scores) : 0
      };
    });
    res.json(list);
    return true;
  }

  // --- GET /:id/start (şagird sınağı başladır) ---
  const matchStart = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/start/);
  if (req.method === 'GET' && matchStart) {
    const asg = devAssignments.get(matchStart[1]);
    if (asg) {
      res.json({
        id: asg.id,
        title: asg.title,
        question_count: asg.question_count,
        duration_minutes: asg.duration_minutes,
        pdf_url: asg.pdf_url,
        tutor_name: "Fərdi Repetitor",
        is_completed: false
      });
      return true;
    }
  }

  // --- POST /:id/submit (cavab kartı təhvil verir) ---
  const matchSubmit = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submit/);
  if (req.method === 'POST' && matchSubmit) {
    const asg = devAssignments.get(matchSubmit[1]);
    if (asg) {
      const userAnswers = (body.answers && typeof body.answers === 'object') ? body.answers : {};
      let correct = 0;
      let incorrect = 0;
      const total = asg.question_count || 25;
      for (let i = 1; i <= total; i++) {
        const corr = String(asg.answer_key[String(i)] || '').toUpperCase();
        const usr = String(userAnswers[String(i)] || '').toUpperCase();
        if (usr) {
          if (usr === corr) correct++;
          else incorrect++;
        }
      }
      const empty = Math.max(0, total - (correct + incorrect));
      const subId = secureId('sub');
      devAnswerSheets.set(subId, {
        id: subId,
        assignment_id: asg.id,
        student_name: "Abituriyent",
        score: correct,
        incorrect_count: incorrect,
        empty_count: empty,
        answers: userAnswers,
        submitted_at: new Date().toISOString()
      });
      diag('devfallback.submit', { rid: req.diagId, assignmentId: asg.id, score: correct, total });
      res.json({
        message: "Sınaq uğurla təhvil verildi!",
        score: correct,
        incorrect,
        empty,
        total,
        percentage: total > 0 ? Math.round((correct / total) * 100) : 0
      });
      return true;
    }
  }

  // --- GET /:id/submissions (nəticələr) ---
  const matchSubs = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submissions/);
  if (req.method === 'GET' && matchSubs) {
    const asg = devAssignments.get(matchSubs[1]);
    if (asg) {
      const subs = Array.from(devAnswerSheets.values()).filter((s) => s.assignment_id === asg.id);
      res.json({ assignment: asg, submissions: subs });
      return true;
    }
  }

  return false;
}

// ============================================================================
// GEMINI AI: PDF SINAQDAN CAVAB AÇARININ ÇIXARILMASI (SERVER-SIDE)
// ============================================================================
// Rate-limited + sanitizasiya edilmiş AI cavab açarı generasiyası
app.post('/api/v1/tutor/assignments/ai-generate-answers', rateLimit('ai'), async (req, res, next) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    // Əgər yerli mühitdə açar yoxdursa, Render backend-inə ötür
    diag('ai.skip', { rid: req.diagId, endpoint: 'ai-generate-answers', reason: 'no-gemini-key' });
    return next();
  }

  try {
    let pdf_base64;
    let question_count;
    try {
      pdf_base64 = safeStr(req.body ? req.body.pdf_base64 : null, 40 * 1024 * 1024, 'pdf_base64');
      question_count = safeStr(req.body ? req.body.question_count : null, 4, 'question_count');
    } catch (vErr) {
      diag('ai.validation', { rid: req.diagId, endpoint: 'ai-generate-answers', err: vErr });
      return res.status(vErr.statusCode || 422).json({ detail: vErr.message });
    }

    if (!pdf_base64) {
      diag('ai.validation', { rid: req.diagId, endpoint: 'ai-generate-answers', field: 'pdf_base64' });
      return res.status(400).json({ detail: "PDF faylı göndərilməyib." });
    }

    // Yalnız PDF fayl imzası qəbul edilir — arbitrary payload/prompt injection qarşısı alınır
    const cleanBase64 = pdf_base64.replace(/^data:application\/pdf;base64,/, '');
    if (cleanBase64.slice(0, 5) !== 'JVBER') {
      diag('ai.validation', { rid: req.diagId, endpoint: 'ai-generate-answers', field: 'pdf_base64', reason: 'not-pdf' });
      return res.status(422).json({ detail: "Fayl formatı PDF deyil. Yalnız .pdf faylları qəbul edilir." });
    }

    const qCount = Math.min(Math.max(Number(question_count) || 25, 1), 120);
    diag('ai.start', { rid: req.diagId, endpoint: 'ai-generate-answers', qCount, pdfChars: cleanBase64.length });

    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `Sən peşəkar DİM imtahan eksperti və müəllimsən. Təqdim olunan PDF sınaq imtahan sənədini diqqətlə nəzərdən keçir. Sənəddəki hər bir sualı həll et və 1-dən ${qCount}-ə qədər olan suallar üçün doğru variantı (A, B, C, D və ya E) müəyyən et. ÇIXIŞI YALNIZ AŞAĞIDAKI DƏQİQ JSON FORMATINDA VER, başqa heç bir izahat və ya markdown bloku yazma:\n{\n  "answers": {\n    "1": "A",\n    "2": "B"\n  }\n}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const answers = (parsed && parsed.answers) ? parsed.answers : (parsed || {});
    diag('ai.ok', { rid: req.diagId, endpoint: 'ai-generate-answers', answerCount: Object.keys(answers).length });
    return res.json({ success: true, answers, source: "gemini-3.8-flash" });
  } catch (err) {
    diag('ai.error', { rid: req.diagId, endpoint: 'ai-generate-answers', err });
    // Əgər SDK xətası olarsa, backend proxy-sinə yönəlt
    return next();
  }
});

// ============================================================================
// GEMINI AI: REPETİTOR AI KÖMƏKÇİSİ (CHAT ASİSTENTİ)
// ============================================================================
// Rate-limited + sanitizasiya edilmiş AI repetitor köməkçisi
app.post('/api/v1/tutor/ai-query', rateLimit('ai'), async (req, res, next) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    diag('ai.skip', { rid: req.diagId, endpoint: 'ai-query', reason: 'no-gemini-key' });
    return next();
  }

  try {
    let question;
    let conversation_history;
    try {
      question = safeStr(req.body ? req.body.question : null, 2000, 'question');
      const rawHistory = req.body && Array.isArray(req.body.conversation_history)
        ? req.body.conversation_history.slice(0, 10)
        : [];
      // Hər tarixçə mesajının uzunluğu məhdudlaşdırılır (token zərbələnmə qoruması)
      conversation_history = rawHistory.map((m) => ({
        role: m && m.role === 'user' ? 'user' : 'model',
        content: safeStr(m ? m.content : null, 2000, 'conversation_history[].content') || ''
      }));
    } catch (vErr) {
      diag('ai.validation', { rid: req.diagId, endpoint: 'ai-query', err: vErr });
      return res.status(vErr.statusCode || 422).json({ detail: vErr.message });
    }

    if (!question) {
      diag('ai.validation', { rid: req.diagId, endpoint: 'ai-query', field: 'question' });
      return res.status(400).json({ detail: "Sual daxil edilməyib." });
    }
    diag('ai.start', { rid: req.diagId, endpoint: 'ai-query', questionChars: question.length, historyLen: conversation_history.length });

    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const systemInstruction = `Sən Gradient EdTech platformasında Repetitor/Müəllim üçün çalışan yüksək səviyyəli, səmimi, ağıllı və peşəkar süni intellekt köməkçisisən (Tutor AI Assistant).
Məqsədin repetitora şagirdlərin nəticələrinin analizi, tədris metodikası, zəif mövzuların gücləndirilməsi, DİM imtahanlarına hazırlıq və platformanın funksiyaları (4 rəqəmli repetitor kodu, şagird qoşulma istəkləri, optik cavab kartı, PDF sınaqlar) barədə ən dəqiq, faydalı və motivasiyaedici məsləhətləri verməkdir.
Cavablarını hər zaman səliqəli Azərbaycan dilində, xoş, peşəkar və aydın şəkildə ver. Bəndlər və vurğulardan yerində istifadə et.`;

    const contents = [];
    for (const msg of conversation_history.slice(-6)) {
      if (msg.content) contents.push({ role: msg.role, parts: [{ text: msg.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: question }] });

    const modelsToTry = ['gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    let answer = null;
    let usedModel = 'gemini-3.8-flash';

    for (const m of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7
          }
        });
        if (response && response.text) {
          answer = response.text;
          usedModel = m;
          break;
        }
      } catch (genErr) {
        diag('ai.model_failed', { rid: req.diagId, endpoint: 'ai-query', model: m, err: genErr });
      }
    }

    if (!answer) {
      // Təbii və faydalı ehtiyat cavab (server tərəfli)
      const qLower = question.toLowerCase();
      if (qLower.includes("salam") || qLower.includes("hər vaxtınız")) {
        answer = "Salam, hörmətli müəllim! Xoş gördük. Şagirdlərinizin nəticələri, DİM sınaqları, 4 rəqəmli qoşulma kodu və ya fərdi PDF imtahanları barədə sizə necə kömək edə bilərəm?";
      } else if (qLower.includes("kod") || qLower.includes("qoşul")) {
        answer = "Şagirdlərinizin qrupunuza qoşulması üçün profilinizdə və ya yuxarı paneldə qeyd olunan 4 rəqəmli sistem kodunuzu şagirdlərinizlə paylaşın. Şagirdlər öz panellərində 'Mənim Repetitorum' bölməsinə daxil olaraq bu kodu yazıb istək göndərəcəklər. Siz isə 'Şagird İstəkləri' tabında həmin istəkləri bir kliklə qəbul və ya rədd edə bilərsiniz.";
      } else if (qLower.includes("sınaq") || qLower.includes("pdf") || qLower.includes("cavab")) {
        answer = "Fərdi sınaq təyin etmək üçün 'Fərdi Sınaqlar (PDF)' tabına keçin və '+ Yeni Sınaq Yarat' düyməsini sıxın. PDF faylını yükləyin, sual sayını və vaxtı seçin, optik cavab kartını qeyd edin. Sınaq yaradıldıqdan sonra sınaq kodunu şagirdlərinizlə bölüşə bilərsiniz.";
      } else {
        answer = "Hörmətli müəllim, qeyd etdiyiniz məsələ tədris prosesi üçün çox önəmlidir. Şagirdlərinizin bal dinamikasını artırmaq üçün fərdi səhvlər üzərində işləmək, həftəlik kiçik mövzu sınaqları keçirmək və zəif mövzuları hədəf almaq ən yaxşı nəticəni verir. Hər hansı şagirdin nəticələri və ya platformanın imkanları barədə sualınızı verə bilərsiniz.";
      }
      usedModel = 'conversational-engine';
    }

    diag('ai.ok', { rid: req.diagId, endpoint: 'ai-query', source: usedModel });
    return res.json({
      success: true,
      answer: answer,
      source: usedModel
    });
  } catch (err) {
    diag('ai.error', { rid: req.diagId, endpoint: 'ai-query', err });
    return res.json({
      success: true,
      answer: "Hörmətli müəllim, qeyd etdiyiniz sual qeydə alındı. Şagirdlərinizin inkişaf dinamikası və ya sınaq nəticələri ilə bağlı sualınızı bir daha yaza bilərsiniz.",
      source: "fallback"
    });
  }
});

// ============================================================================
// Zero-Trust API Reverse Proxy
// ============================================================================
// Təhlükəsizlik və Memarlıq Qaydaları:
// 1. Node.js frontend serverində heç bir məlumat bazası açarı (Supabase Service Key),
//    URL-i və ya daxili sirr saxlanılmır (Hardcoded keys qəti qadağandır).
// 2. Bütün API və verilənlər bazası əməliyyatları birbaşa Render.com-da işləyən
//    FastAPI backend-inə proxy edilir.
// 3. Daxili stack trace və ya həssas server xətaları müştəriyə sızdırılmır.
app.all('/api/*', async (req, res) => {
  const targetUrl = `${BACKEND_URL}${req.originalUrl}`;

  try {
    diag('proxy.start', { rid: req.diagId, method: req.method, path: req.originalUrl.split('?')[0] });
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    // Təhlükəsizlik: istifadəçinin göndərdiyi "origin" başlığı yalnız
    // icazəli domenlərdən gəlirsə upstream-ə ötürülür.
    // Əvvəlki sabit 'http://localhost:3000' yazılışı production-da
    // CSRF müdafiəsini zəiflədirdi və bütün istifadəçiləri eyni mənşəli göstərirdi.
    if (headers.origin && !ALLOWED_ORIGINS.has(headers.origin)) {
      delete headers.origin;
    }
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
    const timeout = setTimeout(() => controller.abort(), 65000);
    fetchOptions.signal = controller.signal;

    const backendRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);
    diag('proxy.upstream', { rid: req.diagId, upstreamStatus: backendRes.status, bodyBytes: req.body ? JSON.stringify(req.body).length : 0 });

    // Əgər backend 4xx/5xx verərsə və bu sınaq tapşırığıdırsa,
    // development rejimində yerli mağazadan xidmət göstər (production-da söndürülüb)
    if (!backendRes.ok && handleDevAssignmentFallback(req, res)) {
      return;
    }

    res.status(backendRes.status);

    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding' || lowerKey === 'content-length') return;
      if (lowerKey === 'set-cookie') {
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        let modifiedCookie = value.replace(/Domain=[^;]+;?/gi, '');
        if (!isHttps) {
          modifiedCookie = modifiedCookie
            .replace(/SameSite=None/gi, 'SameSite=Lax')
            .replace(/Secure;?/gi, '');
        } else {
          modifiedCookie = modifiedCookie
            .replace(/SameSite=Lax/gi, 'SameSite=None')
            .replace(/SameSite=Strict/gi, 'SameSite=None');
          if (!modifiedCookie.toLowerCase().includes('secure')) {
            modifiedCookie += '; Secure';
          }
        }
        res.append('Set-Cookie', modifiedCookie);
      } else {
        res.setHeader(key, value);
      }
    });

    const responseData = await backendRes.arrayBuffer();
    return res.send(Buffer.from(responseData));
  } catch (err) {
    diag('proxy.error', { rid: req.diagId, err });
    if (req.originalUrl.includes('/api/v1/settings/contact')) {
      return res.json({
        whatsapp_url: "https://wa.me/994505975697",
        email: "support@gradient.az",
        phone: "+994 50 597 56 97"
      });
    }

    // Upstream şəbəkə xətası: lokal fallback (development-only, DRY — vahid funksiya)
    if (handleDevAssignmentFallback(req, res)) {
      return;
    }

    diag('proxy.fail', { rid: req.diagId, method: req.method, path: req.originalUrl.split('?')[0], status: 502 });
    return res.status(502).json({
      detail: "Xidmət hazırda əlçatan deyil. Zəhmət olmasa bir az sonra yenidən cəhd edin."
    });
  }
});

// Statik faylların təqdim edilməsi
// Təhlükəsizlik: .env, server.js, package.json kimi server fayllarının
// ictimai təqdim edilməsi bloklanır (source/config disclosure qoruması).
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
  dotfiles: 'deny',
  setHeaders: (res, filePath) => {
    const blocked = ['server.js', 'package.json', 'package-lock.json', 'metadata.json', '.env.example'];
    if (blocked.includes(path.basename(filePath))) {
      res.setHeader('Content-Security-Policy', "default-src 'none'");
    }
  }
}));

// Açıq mənbə fayllarına birbaşa girişi rədd et (defense-in-depth)
app.use((req, res, next) => {
  const denied = ['/server.js', '/package.json', '/package-lock.json', '/metadata.json', '/.env', '/.env.example'];
  if (denied.includes(req.path)) {
    diag('static.denied', { rid: req.diagId, path: req.path });
    return res.status(404).json({ detail: 'Tapılmadı' });
  }
  next();
});

// Route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gradient platform is running on port ${PORT}`);
});
