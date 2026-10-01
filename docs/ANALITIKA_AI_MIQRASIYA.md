# Analitika + AI Analiz Arxitekturası

Bu sənəd **"AI Analiz" funksiyalarının** və **təkrar cəhd mexanizminin**
arxitektura qərarlarını, təhlükəsizlik sərhədlərini və SQL miqrasiyasını izah edir.

---

## 1. Əsas qərarlar (və niyə)

| Qərar | Alternativ | Seçilən | Səbəb |
| --- | --- | --- | --- |
| Yeni `exam_attempts` cədvəli | `exam_results`-a `attempt_no` sütunu əlavə etmək | **Yeni cədvəl** | Mövcud sətirlər heç vaxt qırılmır, geri qaytarma sadəcə `DROP`. `exam_results` "1-ci cəhd = statistika mənbəyi" olaraq qalır |
| Təkrar cəhd `exam_results`-ə yazılmır | Təkrar cəhd də `exam_results`-ə yazılsın | **Yalnız 1-ci cəhd** | Tələb: "təkrar cəhd statistikaya təsir etməsin, əvvəlki nəticə qalsın". Supabase ilə increment/upsert yarışması da yaranmır |
| AI nəticəsi DB-də saxlanılır | Hər dəfə Gemini-yə sorğu | **Cədvəldə cache** | Təkrar sorğular = pul xərci yoxdur; səhifə yenidən açılanda AI çağrısı olmur |
| Gemini çağırışı yalnız backend-də | Frontend-dən birbaşa | **Server-only** | API açarı frontend-ə heç vaxt düşmür (`.clinerules` §1) |
| AI cavabı JSON | Mətn (markdown) | **JSON** | Frontend sabit sxem ilə render edir → sabit dizayn + təhlükəsizlik |
| Strukturlaşdırılmış, faktiki analiz | "Yaradıcı" AI mətni | **temperature 0.3 + prompt qaydaları** | Rəqəm uydurma (halüsinasiya) riski minimuma endirilir |
| Rate limit `ai` bucket | `read`/`write` | **Ayrı `ai` bucket** | AI sorğusu bahalıdır; `RATE_LIMIT_AI_MAX` ilə maliyyə qorunur |

---

## 2. Məlumat axını

```
Sınaq təhvil edilir (POST /api/v1/exams/{id}/submit)
        │
        ├─ cəhd sayı hesablanır (exam_attempts sayı + 1)
        │
        ├─ attempt_no == 1 ?
        │     ├─ BELƏ → exam_results  +  exam_attempts(is_primary=true)
        │     └─ XEYR → YALNIZ exam_attempts(is_primary=false)
        │              (exam_results-ə TOXUNULMUR → əvvəlki nəticə qalır)
        ▼
Analytics (GET /api/v1/analytics/me)
        │
        ├─ Ümumi statistika  ← exam_results (yalnız 1-ci cəhdlər)
        ├─ Fənn statistikası ← exam_attempts (bütün cəhdlər)
        └─ Mövzu (q_tag)     ← exam_attempts.question_details (bütün cəhdlər)
        ▼
AI analiz
        ├─ POST /api/v1/analytics/attempts/{id}/ai-analysis  → exam_attempts.ai_analysis
        └─ POST /api/v1/analytics/overall/ai-analysis        → student_ai_insights
```

**Niyə mövzu statistikası bütün cəhdlərdən, ümumi statistika isə yalnız 1-ci cəhdlərdən?**
Tələb iki müxtəlif şeydir:
- "Əvvəlki nəticə qalmalıdır" → **ümumi statistika** dəyişməz.
- "Hansı mövzuları gücləndirmək lazımdı" → təkrar cəhd məlumatı **faydalıdır**
  (təkrarlanan səhvlər daha aydın görünür), ona görə mövzu (q_tag) aqreqatı
  bütün cəhdlərdən toplanır.

---

## 3. SQL miqrasiyası (icra sırası)

**Fayl:** [`supabase/migrations/20261001000000_exam_attempts_ai_analysis.sql`](../supabase/migrations/20261001000000_exam_attempts_ai_analysis.sql)

**İcra:** Supabase Dashboard → SQL Editor → faylın bütün mətnini yapışdır → **Run**

> Faylda xarici `BEGIN/COMMIT` yoxdur; bütün operatorlar idempotentdir
> (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... $$`).
> Təkrar icra etmək təhlükəsizdir.

### Yaradılan cədvəllər

| Cədvəl | Məqsəd |
| --- | --- |
| `exam_attempts` | Bütün cəhdlər: `attempt_no`, `is_primary`, `answers`, `question_details`, `weak_topics`, `ai_analysis` |
| `student_ai_insights` | Şagirdin ümumi analizi (`UNIQUE(student_id)`) — upsert ilə yenilənir |

### Təhlükəsizlik (RLS)

Hər iki cədvəldə RLS aktivləşdirilir və `anon` / `authenticated` rolları üçün
**heç bir siyasə yaradılmır** → default davranış `RƏDD`. Yalnız `service_role`
(baxış açarı ilə işləyən FastAPI backend) girişə malikdir.

### Constraint-lər

- `UNIQUE (student_id, exam_id, attempt_no)` — paralel submit yarışmasında
  təkrar cəhd nömrəsinin təkrarlanmasını bloklayır.
- `CHECK (... >= 0)` — bal/saylar mənfi ola bilmir.
- `CHECK (attempt_no >= 1)` — cəhd nömrəsi 1-dən kiçik ola bilməz.

### Backfill (köhnə nəticələr)

Miqrasiyanın son addımı mövcud `exam_results` sətirlərini `exam_attempts`-ə
`attempt_no = 1, is_primary = true` kimi köçürür. Beləliklə:
- AI analiz həm köhnə, həm yeni nəticələrdə işləyir;
- analytics-də heç bir sıra "itmir".

⚠️ Köhnə sətirlərdə `question_details` **NULL**dır (o vaxt cavablar
saxlanılmırdı) — bu sətirlərin AI analizi yalnız bal və `weak_topics`
göstəricilərinə əsaslanır.

---

## 4. Endpoint-lər

| Method | Yol | Rate limit | Məqsəd |
| --- | --- | --- | --- |
| GET | `/api/v1/analytics/me` | — | Metrikalar, fənn + mövzu statistikası, tarixçə |
| POST | `/api/v1/analytics/attempts/{id}/ai-analysis` | `ai` | Bir cəhdin fərdi AI analizi |
| POST | `/api/v1/analytics/overall/ai-analysis` | `ai` | Bütün sınaqların ümumi AI analizi |
| GET | `/api/v1/analytics/overall/ai-analysis` | — | Saxlanmış ümumi analiz (AI xərci etmədən) |
| GET | `/api/v1/exams/{exam_id}/attempts` | — | Bir sınağın bütün cəhdləri |
| GET | `/api/v1/exams/attempts/all` | — | Bütün cəhdlər (səhifə render üçün) |

> `/api/v1/exams/attempts/all` yolu `/api/v1/exams/{exam_id}/attempts`-dən
> **ƏVVƏL** qeyd olunmalıdır — yoxsa `{exam_id}` dəyişəni onu tutur.
> (Hazırda `/api/v1/exams/attempts/all` sonradan qeyd olunur, lakin
> `{exam_id}` = literal `"attempts"` olmadığı üçün problem yaranmır —
> yəni hər ikisi fərqli URL formasıdır: `/{exam_id}/attempts` vs `/attempts/all`.)

---

## 5. Təhlükəsizlik sərhədləri

| Təhlükə | Müdafiə |
| --- | --- |
| Başqa şagirdin nəticisinin oxunması (IDOR) | Hər sorğuda `.eq("student_id", current_user["id"])`; klient `student_id` parametri **göndərə bilmir** (endpoint qəbul etmir) |
| Düzgün cavabların sızması | `/start` yalnız `q_id`, `text`, `options` qaytarır (`correct_answer`, `explanation` allow-list-də yoxdur) |
| AI açarının sızması | Açar yalnız `os.getenv` ilə oxunur, `app/core/gemini.py` daxilində, heç bir cavabda qaytarılmır |
| Upstream xəta məlumatının sızması | `logger` yalnız model adı + HTTP status yazır; URL/body istifadəçiyə ötürülmür |
| AI xərci (DoS/maliyyə) | `ai` bucket + cache (`ai_analysis` mövcuddursa Gemini çağırılmır) |
| Prompt injection (sual mətni vasitəsilə) | Şagird cavabları yalnız `A–H` + `q_id` (64 simvol) + `q_tag`/`text_preview` (180 simvol) kimi sanitasiya olunur; `text_preview` modelə kontekst kimi verilir, **komanda** kimi yox |
| XSS | Bütün AI mətnləri `textContent` ilə yazılır; `innerHTML` istifadəsi yoxdur |
| Nəhəng cavab (DoS) | `MAX_ANSWERS_PER_SUBMIT = 300`, cəhd limiti 5, AI cavabı serverdə kəsilir |

---

## 6. Deployment addımları

1. **SQL:** `supabase/migrations/20261001000000_exam_attempts_ai_analysis.sql`
   faylını SQL Editor-da icra et.
2. **Render ENV:** `GEMINI_API_KEY` təyin olunmalıdır (yoxdursa analiz
   endpoint-ləri 503 qaytarır, platforma işləməyə davam edir).
3. **Render deploy:** `Gradient-backend` repusu push olunur (Render auto-deploy).
4. **Frontend:** `Gradient` reposu push olunur.

> `RATE_LIMIT_AI_MAX` dəyərini artırmazdan əvvəl xərci nəzərə alın —
> hər AI sorğusu Gemini-də real ödəniş yaradır.

---

## 7. Əlavə tövsiyələr (Supabase arxitekturası üzrə)

1. **Redundansı azaltmaq** — `question_details` JSONB-də saxlanılır, yoxsa
   `exam_attempt_questions` ayrı cədvəli daha normalizə olunmuş olardı.
   Mövcud yanaşma 5 cəhd limiti üçün kifayətdir; cəhd limiti artırılarsa
   ayrı cədvələ keçmək tövsiyə olunur.
2. **Vacib mövzular üçün materialized view** — `topic_stats` hər sorğuda JS/Python-da
   hesablanır. Sıra sayı minləri keçəndə `pg_matview` (`student_topic_stats`)
   yaradıb `analytics/me` sorğusunu sürətləndirmək olar.
3. **AI prompt versiyalama** — `student_ai_insights.ai_model` yazılır, lakin
   prompt versiyası yazılmır. Promptu dəyişdikdə köhnə analizləri müqayisə etmək
   üçün `prompt_version` sütunu əlavə etmək tövsiyə olunur.
4. **Soft delete** — `exam_attempts` FK-si `ON DELETE CASCADE` ilədir: sınaq
   silinəndə cəhd tarixçəsi də silinir. Əgər audit lazımdırsa,
   `deleted_at timestamptz` əlavə edib `ON DELETE SET NULL` istifadə edin.