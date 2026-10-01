-- ============================================================================
-- MİQRASİYA: 20261001000000_exam_attempts_ai_analysis.sql
--
-- MƏQSƏD (3 funksiya):
--   1) TƏKRAR CƏHD — şagird bitirdiyi sınağı yenidən işləyə biləcək, lakin
--      əvvəlki (ilk) nəticəsi QORUNACAQ və ümumi statistikaya TƏSİR ETMƏYƏCƏK.
--   2) PER-SUAL DETALLAR — hər cəhd üçün sual/səhv/q_tag məlumatının saxlanması
--      (AI analiz üçün real mənbə).
--   3) AI ANALİZ CACHE — hər cəhd üçün Gemini analizi və şagirdin ümumi
--      (bütün sınaqlar) analizinin bazada saxlanması.
--
-- ARXITEKTURA QƏRARI (.clinerules §1 "DB Əlaqəsi" və zero-downtime):
--   • `exam_results` mövcud cədvəli HEÇ VASİTƏ DƏYİŞMİR. O, yalnız BİRİNCİ
--     cəhdin nəticəsini saxlayır və bütün statistikanın (analytics /me,
--     repetitor paneli) mənbəyi olmaqda davam edir.
--   • `exam_attempts` yeni cədvəli BÜTÜN cəhdləri (o cümlədən 1-ci də)
--     saxlayır: `attempt_no`, cavablar, per-sual detalları, AI analizi.
--   • Beləliklə statistika "ilk cəhd" qalır (təkrar cəhd həll yoxdur —
--     supabase-py ilə upsert/increment yarışması yarana bilərdi), təkrar cəhd
--     isə müstəqil, izlənə bilən bir sətirdir.
--   • Cədvəl genişləndirmə (ALTER TABLE ADD COLUMN) yerinə YENİ cədvəl
--     yaradılır → mövcud sətirlər heç vaxt qırılmır, geri qaytarma (rollback)
--     sadəcə cədvəli DROP etməklədir.
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • Hər iki yeni cədvəldə RLS ACTIVATİR, `anon`/`authenticated` üçün
--     HEÇ BİR siyasə yaradılmır (default = RƏDD) → yalnız service_role
--     (FastAPI backend) toxuna bilər. Frontend Supabase SDK istifadə etmir.
--   • `student_ai_insights` UNIQUE(student_id) → təkrar yazma zamanı
--     "upsert" idarəetməsi lazımdır (backend `.upsert(...).eq("student_id")`).
--   • CHECK constraint-lər: bal/saylar mənfi ola bilmir, `attempt_no >= 1`.
--   • Bütün əməliyyatlar idempotentdir (IF NOT EXISTS) və AYRI-AYRI ifa olunur
--     (xarici BEGIN/COMMIT YOXDUR) → faylı təkrar icra etmək təhlükəsizdir.
--
-- İCRA: Supabase Dashboard → SQL Editor → yapışdır → Run.
-- ============================================================================


-- ############################################################################
-- ADDIM 0. ÖNCÜKİ YOXLAMA (preflight)
-- ############################################################################

DO $$
DECLARE
  v_exam_results regclass := to_regclass('public.exam_results');
  v_exams        regclass := to_regclass('public.exams');
BEGIN
  IF v_exams IS NULL OR v_exam_results IS NULL THEN
    RAISE EXCEPTION 'STOP: public.exams və ya public.exam_results cədvəli tapılmadı. Miqrasiyanı dayandırın.';
  END IF;
  RAISE NOTICE 'Preflight OK: exams + exam_results mövcuddur';
END $$;


-- ############################################################################
-- ADDIM 1. `exam_attempts` — BÜTÜN CƏHDLƏR (o cümlədən 1-ci cəhd)
--
-- Sütun izahı:
--   exam_result_id  → 1-ci cəhd üçün `exam_results.id`, təkrar cəhd üçün NULL.
--   is_primary      → true YALNIZ 1-ci cəhd üçün (statistikanın mənbəyi).
--   answers         → şagirdin seçimləri {"q_id": "A"} (sensitive deyil, amma
--                     minimum data prinsipi: yalnız öz cədvəli üçün).
--   question_details→ [{q_id, q_tag, status, chosen, correct, text_preview}]
--                     `status`: correct | incorrect | empty
--                     AI analizin əsas yemidir (hansı mövzuda şəhv edilib).
--   weak_topics     → bu cəhd üzrə zəif mövzu teqlərinin sayğacı (jsonb).
--   ai_analysis     → Gemini-nin qaytardığı strukturlaşdırılmış analiz.
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_result_id    uuid NULL REFERENCES public.exam_results (id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  exam_id           uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,

  attempt_no        integer NOT NULL DEFAULT 1,
  is_primary        boolean NOT NULL DEFAULT false,

  score             integer NOT NULL DEFAULT 0,
  incorrect_count   integer NOT NULL DEFAULT 0,
  empty_count       integer NOT NULL DEFAULT 0,
  total_questions   integer NOT NULL DEFAULT 0,

  answers           jsonb NULL,
  question_details  jsonb NULL,
  weak_topics       jsonb NULL,

  ai_analysis       jsonb NULL,
  ai_model          text NULL,
  ai_generated_at   timestamptz NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exam_attempts_score_non_negative_chk
    CHECK (score IS NULL OR score >= 0),
  CONSTRAINT exam_attempts_incorrect_non_negative_chk
    CHECK (incorrect_count IS NULL OR incorrect_count >= 0),
  CONSTRAINT exam_attempts_empty_non_negative_chk
    CHECK (empty_count IS NULL OR empty_count >= 0),
  CONSTRAINT exam_attempts_total_non_negative_chk
    CHECK (total_questions IS NULL OR total_questions >= 0),
  CONSTRAINT exam_attempts_attempt_no_positive_chk
    CHECK (attempt_no IS NULL OR attempt_no >= 1),

  -- TƏHLÜKƏSİZLİK/İŞA KİMİYYƏTİ: eyni şagird üçün eyni sınaqda eyni
  -- cəhd nömrəsi İKİ DƏFƏ OLMAMALIDIR (təkrar submit yarışmasının qarşısı).
  CONSTRAINT exam_attempts_unique_student_exam_attempt_chk
    UNIQUE (student_id, exam_id, attempt_no)
);


-- ############################################################################
-- ADDIM 2. `student_ai_insights` — ŞAGİRDİN ÜMUMİ (BÜTÜN SINAQLAR) ANALİZİ
--
-- Hər şagird üçün YALNIZ BİR sətir (UNIQUE(student_id)). Yenilənmə
-- zamanı `updated_at` + `version` artırılır → frontend "son analiz neçədir?"
-- sualına cavab verə bilir.
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.student_ai_insights (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,

  scope             text NOT NULL DEFAULT 'overall',
  summary           text NULL,
  headline          text NULL,

  focus_subjects    jsonb NULL,   -- ən çətin fənn(lər) + səbəb
  focus_topics      jsonb NULL,   -- gücləndirilməsi lazım olan mövzu teqləri
  strong_topics     jsonb NULL,   -- yaxşı yazılan mövzular
  recommendations   jsonb NULL,   -- həftəlik/şagirdə xüsusi tövsiyələr
  stats_snapshot    jsonb NULL,   -- analiz anındakı rəqəmlər (audit/izləmə)

  ai_model          text NULL,
  version           integer NOT NULL DEFAULT 1,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT student_ai_insights_scope_chk
    CHECK (scope IN ('overall')),
  CONSTRAINT student_ai_insights_version_positive_chk
    CHECK (version IS NULL OR version >= 1),
  CONSTRAINT student_ai_insights_unique_student_chk
    UNIQUE (student_id)
);


-- ############################################################################
-- ADDIM 3. İNDEKSLƏR
-- ############################################################################

CREATE INDEX IF NOT EXISTS exam_attempts_student_idx
  ON public.exam_attempts (student_id);

CREATE INDEX IF NOT EXISTS exam_attempts_exam_idx
  ON public.exam_attempts (exam_id);

CREATE INDEX IF NOT EXISTS exam_attempts_student_exam_idx
  ON public.exam_attempts (student_id, exam_id, attempt_no DESC);

-- AI analizi olmayan cəhdləri sürətli tapmaq üçün partial index
CREATE INDEX IF NOT EXISTS exam_attempts_without_ai_idx
  ON public.exam_attempts (student_id, created_at DESC)
  WHERE ai_analysis IS NULL;

CREATE INDEX IF NOT EXISTS student_ai_insights_updated_idx
  ON public.student_ai_insights (updated_at DESC);


-- ############################################################################
-- ADDIM 4. RLS TƏNZİMLƏMƏSİ
-- `anon` və `authenticated` rolları üçün siyasə YARADILMIR → default RƏDD.
-- Yalnız `service_role` (backend, `bypassrls`) girişi var.
-- ############################################################################

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_ai_insights ENABLE ROW LEVEL SECURITY;

-- Köhnə təsadüfi açıq siyasaları təmizlə (bu cədvəllər yeni olsa da,
-- eyni adla əvvəl yaradılmış variantlarda ola bilər)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('exam_attempts', 'student_ai_insights')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped policy: % on %', r.policyname, r.tablename;
  END LOOP;
END $$;


-- ############################################################################
-- ADDIM 5. service_role GRANT-ləri
-- (backend bu cədvəlləri oxuyur/yazır; anon/authenticated heç vaxt toxunmur)
-- ############################################################################

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_attempts', 'student_ai_insights']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES '
        'ON public.%I TO service_role', t);
      RAISE NOTICE 'GRANT verildi: public.%', t;
    END IF;
  END LOOP;
END $$;


-- ############################################################################
-- ADDIM 6. KEÇMİŞ SƏTİRLƏRİN GERİYƏ UYĞUNLUĞU (backfill)
--
-- Mövcud `exam_results` sətirləri (1-ci cəhd) `exam_attempts`-ə əks olunur ki:
--   • AI analiz həm köhnə, həm yeni sınaqlar üçün işləsin,
--   • frontend cəhd siyahısında heç bir sıra "itməsin".
--
-- ⚠️ `question_details` KÖHNƏ sətirlərdə YOXDUR (o vaxt cavablar
--    saxlanılmırdı) → NULL qalır. AI analiz bu sətirlərdə yalnız
--    `weak_topics` + bal göstəricilərinə əsaslanır (backend bunu GPU ilə
--    idarə edir və istifadəçiyə "detallı məlumat yoxdur" mesajı göstərir).
-- ############################################################################

INSERT INTO public.exam_attempts (
  exam_result_id, student_id, exam_id,
  attempt_no, is_primary,
  score, incorrect_count, empty_count, total_questions,
  weak_topics, created_at
)
SELECT
  r.id,
  r.student_id,
  r.exam_id,
  1,
  true,
  COALESCE(r.score, 0),
  COALESCE(r.incorrect_count, 0),
  COALESCE(r.empty_count, 0),
  COALESCE(r.total_questions, 0),
  r.weak_topics,
  COALESCE(r.created_at, now())
FROM public.exam_results r
WHERE r.student_id IS NOT NULL
  AND r.exam_id IS NOT NULL
ON CONFLICT (student_id, exam_id, attempt_no) DO NOTHING;


-- ############################################################################
-- YEKUN YOXLAMA
-- ############################################################################

DO $$
DECLARE
  v_ok boolean;
  v_cnt bigint;
BEGIN
  SELECT relrowsecurity INTO v_ok
  FROM pg_class WHERE relname = 'exam_attempts' AND relnamespace = 'public'::regnamespace;
  IF v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: exam_attempts üçün RLS aktivləşdirilmədi!';
  END IF;

  SELECT relrowsecurity INTO v_ok
  FROM pg_class WHERE relname = 'student_ai_insights' AND relnamespace = 'public'::regnamespace;
  IF v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: student_ai_insights üçün RLS aktivləşdirilmədi!';
  END IF;

  -- Təsadüfi açıq siyasə qalmasın
  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('exam_attempts', 'student_ai_insights');

  IF v_cnt > 0 THEN
    RAISE WARNING 'Diqqət: % adlı cədvəllərdə % siyasə qalıb.', ARRAY['exam_attempts','student_ai_insights'], v_cnt;
  END IF;

  RAISE NOTICE 'Yekun yoxlama OK: RLS aktiv, indekslər, GRANT-lər və backfill tamamlandı.';
END $$;