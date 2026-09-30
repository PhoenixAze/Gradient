-- ============================================================================
-- MİQRASİYA: 20260930000000_debug_exam_management.sql
--
-- MƏQSƏD:
--   Admin konsolundan sınaq əlavə etmək / redaktə etmək / silmək üçün
--   `exams` cədvəlini gücləndirir: `is_active` bayrağı, CHECK constraint-lər,
--   performans indeksləri və RLS tənzimləməsi.
--
-- QEYD — `q_tag` HAQDA:
--   Sualın mövzu teqi (`questions[].q_tag`) `questions` JSONB sütununun
--   İÇİNDƏ saxlanılır, ayrı sütun DEYİL — beləliklə heç bir yeni sütun
--   yaradılmır və mövcud sınaqlar heç vaxt qırılmır. `weak_topics` sütunu
--   (`exam_results`) onsuz da mövcuddur və analitika onu oxuyur.
--
-- BU FAYL NƏ EDİR (qısa izah):
--   1) `exams.is_active` sütunu əlavə edir → sınağı silmədən "deaktiv" etmək.
--   2) CHECK constraint-lər qoyur → pis dəyər (mənfi qiymət, mənfi balans)
--      hətta birbaşa SQL ilə yazılsa da bazaya düşmür.
--   3) İndekslər yaradır → konsolun siyahı/axtarış sorğuları yavaş deyil.
--   4) RLS-i aktivləşdirir → cədvəllərə yalnız service_role (backend)
--      toxuna bilər; brauzer/anon heç vaxt oxuya bilmir.
--   5) Köhnə `anon_*` siyasələrini silir → təsadüfi açıq giriş yoxdur.
--   ⚠️ HEÇ BİR MÖVCUD SƏTİR SİLİNMİR VƏ YA DƏYİŞMİR.
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • RLS bütün əlaqəli cədvəllərdə aktivləşdirilir; anon/authenticated
--     üçün HEÇ BİR siyasə yaradılmır (default: RƏDD) → yalnız service_role.
--   • MƏLUMAT ITKİSİ YOXDUR: heç bir DELETE/UPDATE mövcud sətri dəyişmir.
--   • Bütün əməliyyatlar idempotentdir və AYRI-AYRI ifa olunur (xarici
--     BEGIN/COMMIT YOXDUR) — faylı təkrar icra etmək təhlükəsizdir.
--
-- İCRA: Supabase SQL Editor → bütün mətni yapışdır → Run.
-- ============================================================================


-- ############################################################################
-- ADDIM 0. ÖNCÜKİ YOXLAMA (preflight)
-- ############################################################################

DO $$
DECLARE
  v_exams regclass := to_regclass('public.exams');
BEGIN
  IF v_exams IS NULL THEN
    RAISE EXCEPTION 'STOP: public.exams cədvəli tapılmadı. Miqrasiyanı dayandırın.';
  END IF;
  RAISE NOTICE 'Preflight OK: public.exams tapıldı';
END $$;


-- ############################################################################
-- ADDIM 1. `exams.is_active` SÜTUNU
-- Admin konsolundan sınağı deaktiv etmək üçün (soft-delete) — həll olunmuş
-- sınaq heç vaxt silinmir, yalnız görünməz olur.
-- ############################################################################

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;


-- ############################################################################
-- ADDIM 2. CHECK CONSTRAINT-LƏR
-- Backend Pydantic validasiyası ilə paralel: məlumat bazası səviyyəsində
-- "defense in depth" — hətta birbaşa SQL yazılsa da pis dəyər daxil olmur.
-- ############################################################################

-- price >= 0
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_price_non_negative_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_price_non_negative_chk
  CHECK (price IS NULL OR price >= 0);

-- question_count >= 0
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_question_count_non_negative_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_question_count_non_negative_chk
  CHECK (question_count IS NULL OR question_count >= 0);

-- duration_minutes 1..600
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_duration_range_chk;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_duration_range_chk
  CHECK (duration_minutes IS NULL OR (duration_minutes >= 1 AND duration_minutes <= 600));

-- balance >= 0 (debug konsolundan balans oyun-oyun qərarı ola bilməz)
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_balance_non_negative_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_balance_non_negative_chk
  CHECK (balance IS NULL OR balance >= 0);


-- ############################################################################
-- ADDIM 3. İNDEKSLƏR
-- Admin konsolunun siyahı səhifəsi `ORDER BY created_at DESC` + axtarış
-- (ilike) edir; FK lookup-ları `student_id`/`exam_id` üzrə gedir.
-- ############################################################################

CREATE INDEX IF NOT EXISTS exams_created_at_idx
  ON public.exams (created_at DESC);

CREATE INDEX IF NOT EXISTS exams_is_active_idx
  ON public.exams (is_active);

CREATE INDEX IF NOT EXISTS exams_subject_idx
  ON public.exams (subject);

CREATE INDEX IF NOT EXISTS exam_results_exam_id_idx
  ON public.exam_results (exam_id);

CREATE INDEX IF NOT EXISTS exam_results_student_id_idx
  ON public.exam_results (student_id);


-- ############################################################################
-- ADDIM 4. TITLE UNİKLİK DƏQİQLİYİ (adminsiz silmə üçün ehtiyat)
-- ############################################################################

-- ############################################################################
-- ADDIM 5. RLS TƏNZİMLƏMƏSİ
-- `anon` və `authenticated` rolları üçün siyasə YARADILMIR → default RƏDD.
-- Beləliklə yalnız `service_role` (backend) cədvələ girişi var.
-- Frontend heç vaxt Supabase SDK ilə bu cədvələ toxunmur.
-- ############################################################################

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Təhlükəsizlik: RLS-nin BYPASS edilməsi mümkün olan rollara xidmət etmir.
-- service_role Supabase tərəfindən `bypassrls` atributuna malikdir və bu
-- siyasələr onu bloklamır (bu, gözlənilən davranışdır).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('exams', 'exam_results', 'users')
      AND policyname LIKE 'anon_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped legacy anon policy: %', r.policyname;
  END LOOP;
END $$;


-- ############################################################################
-- YEKUN YOXLAMA
-- ############################################################################

DO $$
DECLARE
  v_rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'exams' AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'STOP: public.exams üçün RLS aktivləşdirilmədi!';
  END IF;

  RAISE NOTICE 'Yekun yoxlama OK: RLS aktiv, constraint-lər və indekslər tətbiq edildi.';
END $$;
