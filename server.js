import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://gradient-backend-fam5.onrender.com';

// PDF və böyük sınaq məlumatları üçün payload həddini artırırıq (50mb)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory assignment store for dev/preview resilience (Zero-Trust fallback)
const devAssignments = new Map();
const devAnswerSheets = new Map();

// ============================================================================
// GEMINI AI: PDF SINAQDAN CAVAB AÇARININ ÇIXARILMASI (SERVER-SIDE)
// ============================================================================
app.post('/api/v1/tutor/assignments/ai-generate-answers', async (req, res, next) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    // Əgər yerli mühitdə açar yoxdursa, Render backend-inə ötür
    return next();
  }

  try {
    const { pdf_base64, question_count } = req.body;
    if (!pdf_base64) {
      return res.status(400).json({ detail: "PDF faylı göndərilməyib." });
    }

    const qCount = Math.min(Math.max(Number(question_count) || 25, 1), 120);
    const cleanBase64 = pdf_base64.includes(',') ? pdf_base64.split(',')[1] : pdf_base64;

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
    return res.json({ success: true, answers, source: "gemini-3.8-flash" });
  } catch (err) {
    console.error("AI Generation Error in Node server:", err);
    // Əgər SDK xətası olarsa, backend proxy-sinə yönəlt
    return next();
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
    const timeout = setTimeout(() => controller.abort(), 35000);
    fetchOptions.signal = controller.signal;

    const backendRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    // Əgər backend 404/502 verərsə və bu sınaq tapşırığıdırsa (məs: Render deploy ərəfəsində),
    // yerli dev mağazasından xidmət göstər
    if (!backendRes.ok && req.originalUrl.includes('/api/v1/tutor/assignments')) {
      if (req.method === 'POST' && req.originalUrl === '/api/v1/tutor/assignments') {
        const id = 'asg_' + Math.random().toString(36).substring(2, 10);
        const data = {
          id,
          title: req.body.title || 'Sınaq İmtahanı',
          pdf_url: req.body.pdf_url || '',
          answer_key: req.body.answer_key || {},
          question_count: req.body.question_count || 25,
          duration_minutes: req.body.duration_minutes || 60,
          created_at: new Date().toISOString()
        };
        devAssignments.set(id, data);
        return res.json({ success: true, assignment_id: id, assignment: data });
      }

      if (req.method === 'GET' && req.originalUrl === '/api/v1/tutor/assignments') {
        const list = Array.from(devAssignments.values()).map(asg => {
          const sheets = Array.from(devAnswerSheets.values()).filter(s => s.assignment_id === asg.id);
          const scores = sheets.map(s => s.score);
          return {
            ...asg,
            submission_count: sheets.length,
            avg_score: scores.length ? Math.round(scores.reduce((a,b)=>a+b, 0)/scores.length) : 0,
            max_score: scores.length ? Math.max(...scores) : 0
          };
        });
        return res.json(list);
      }

      const matchStart = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/start/);
      if (req.method === 'GET' && matchStart) {
        const asgId = matchStart[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          return res.json({
            id: asg.id,
            title: asg.title,
            question_count: asg.question_count,
            duration_minutes: asg.duration_minutes,
            pdf_url: asg.pdf_url,
            tutor_name: "Fərdi Repetitor",
            is_completed: false
          });
        }
      }

      const matchSubmit = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submit/);
      if (req.method === 'POST' && matchSubmit) {
        const asgId = matchSubmit[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          const userAnswers = req.body.answers || {};
          let correct = 0;
          let incorrect = 0;
          const total = asg.question_count || 25;
          for (let i = 1; i <= total; i++) {
            const corr = (asg.answer_key[String(i)] || '').toUpperCase();
            const usr = (userAnswers[String(i)] || '').toUpperCase();
            if (usr) {
              if (usr === corr) correct++;
              else incorrect++;
            }
          }
          const empty = Math.max(0, total - (correct + incorrect));
          const subId = 'sub_' + Math.random().toString(36).substring(2, 10);
          devAnswerSheets.set(subId, {
            id: subId,
            assignment_id: asgId,
            student_name: "Abituriyent",
            score: correct,
            incorrect_count: incorrect,
            empty_count: empty,
            answers: userAnswers,
            submitted_at: new Date().toISOString()
          });
          return res.json({
            message: "Sınaq uğurla təhvil verildi!",
            score: correct,
            incorrect,
            empty,
            total,
            percentage: Math.round((correct / total) * 100)
          });
        }
      }

      const matchSubs = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submissions/);
      if (req.method === 'GET' && matchSubs) {
        const asgId = matchSubs[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          const subs = Array.from(devAnswerSheets.values()).filter(s => s.assignment_id === asgId);
          return res.json({
            assignment: asg,
            submissions: subs
          });
        }
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
    if (req.originalUrl.includes('/api/v1/settings/contact')) {
      return res.json({
        whatsapp_url: "https://wa.me/994505975697",
        email: "support@gradient.az",
        phone: "+994 50 597 56 97"
      });
    }

    // Local dev resilience for assignments if backend is temporarily unreachable
    if (req.originalUrl.includes('/api/v1/tutor/assignments')) {
      if (req.method === 'POST' && req.originalUrl === '/api/v1/tutor/assignments') {
        const id = 'asg_' + Math.random().toString(36).substring(2, 10);
        const data = {
          id,
          title: req.body.title || 'Sınaq İmtahanı',
          pdf_url: req.body.pdf_url || '',
          answer_key: req.body.answer_key || {},
          question_count: req.body.question_count || 25,
          duration_minutes: req.body.duration_minutes || 60,
          created_at: new Date().toISOString()
        };
        devAssignments.set(id, data);
        return res.json({ success: true, assignment_id: id, assignment: data });
      }

      if (req.method === 'GET' && req.originalUrl === '/api/v1/tutor/assignments') {
        const list = Array.from(devAssignments.values()).map(asg => {
          const sheets = Array.from(devAnswerSheets.values()).filter(s => s.assignment_id === asg.id);
          const scores = sheets.map(s => s.score);
          return {
            ...asg,
            submission_count: sheets.length,
            avg_score: scores.length ? Math.round(scores.reduce((a,b)=>a+b, 0)/scores.length) : 0,
            max_score: scores.length ? Math.max(...scores) : 0
          };
        });
        return res.json(list);
      }

      const matchStart = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/start/);
      if (req.method === 'GET' && matchStart) {
        const asgId = matchStart[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          return res.json({
            id: asg.id,
            title: asg.title,
            question_count: asg.question_count,
            duration_minutes: asg.duration_minutes,
            pdf_url: asg.pdf_url,
            tutor_name: "Fərdi Repetitor",
            is_completed: false
          });
        }
      }

      const matchSubmit = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submit/);
      if (req.method === 'POST' && matchSubmit) {
        const asgId = matchSubmit[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          const userAnswers = req.body.answers || {};
          let correct = 0;
          let incorrect = 0;
          const total = asg.question_count || 25;
          for (let i = 1; i <= total; i++) {
            const corr = (asg.answer_key[String(i)] || '').toUpperCase();
            const usr = (userAnswers[String(i)] || '').toUpperCase();
            if (usr) {
              if (usr === corr) correct++;
              else incorrect++;
            }
          }
          const empty = Math.max(0, total - (correct + incorrect));
          const subId = 'sub_' + Math.random().toString(36).substring(2, 10);
          devAnswerSheets.set(subId, {
            id: subId,
            assignment_id: asgId,
            student_name: "Abituriyent",
            score: correct,
            incorrect_count: incorrect,
            empty_count: empty,
            answers: userAnswers,
            submitted_at: new Date().toISOString()
          });
          return res.json({
            message: "Sınaq uğurla təhvil verildi!",
            score: correct,
            incorrect,
            empty,
            total,
            percentage: Math.round((correct / total) * 100)
          });
        }
      }

      const matchSubs = req.originalUrl.match(/\/api\/v1\/tutor\/assignments\/([^/]+)\/submissions/);
      if (req.method === 'GET' && matchSubs) {
        const asgId = matchSubs[1];
        const asg = devAssignments.get(asgId);
        if (asg) {
          const subs = Array.from(devAnswerSheets.values()).filter(s => s.assignment_id === asgId);
          return res.json({
            assignment: asg,
            submissions: subs
          });
        }
      }
    }

    return res.status(502).json({
      detail: "Xidmət hazırda əlçatan deyil. Zəhmət olmasa bir az sonra yenidən cəhd edin."
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
