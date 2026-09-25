import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://gradient-backend-fam5.onrender.com';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const timeout = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    const backendRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

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
    // Təhlükəsizlik: Backend müvəqqəti əlçatan olmadıqda ümumi xəta qaytarılır
    if (req.originalUrl.includes('/api/v1/settings/contact')) {
      return res.json({
        whatsapp_url: "https://wa.me/994505975697",
        email: "support@gradient.az",
        phone: "+994 50 597 56 97"
      });
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
