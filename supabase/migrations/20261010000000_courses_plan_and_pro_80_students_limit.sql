-- ============================================================================
-- MİQRASİYA: 20261010000000_courses_plan_and_pro_80_students_limit.sql
--
-- MƏQSƏD — Repetitor aylıq abunə planlarında yeniliklər:
--   1) `pro` planında "limitsiz şagird" limiti 80 şagirdlə əvəzlənir
--      (`max_students = 80`). Digər bütün üstünlüklər (limitsiz sınaq,
--      analitika, prioritet dəstək) Pro-da qalır. Qiymət: 29.99 AZN.
--   2) Yeni `courses` ("Kurslar üçün") planı əlavə edilir:
--      - Qiymət: 49.99 AZN/ay (50% endirimlə; orijinal qiymət 99.98 AZN).
--      - Pro planındakı BÜTÜN üstünlüklər onda da mövcuddur.
--      - Şagird limiti: LIMITSIZ (`max_students = NULL`).
--      - Sınaq limiti: LIMITSIZ (`max_exams_per_month = NULL`).
--   3) CHECK constraint-lər `courses` (və ehtiyat `kurslar`) dəyərini
--      qəbul edəcək şəkildə genişləndirilir.
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • Heç bir DELETE yoxdur — yalnız UPSERT və plan sütunlarının UPDATE-i.
--   • Mövcud istifadəçilərin şagirdləri silinmir (data loss yoxdur).
--   • RLS bütün cədvəllərdə aktiv qalır (anon/authenticated oxuma qorunması).
--
-- İDEMPOTENTLİK: Faylı TƏKRAR icra etmək təhlükəsizdir
--   (IF EXISTS / IF NOT EXISTS + UPSERT).
--
-- İCRA: Supabase SQL Editor → bütün mətni yapışdır → Run.
-- ============================================================================


-- ############################################################################
-- ADDIM 0. ÖNCƏKİ YOXLAMA (preflight)
-- ############################################################################

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'STOP: public.users cədvəli tapılmadı. Miqrasiyanı dayandırın.';
  END IF;
  IF to_regclass('public.tutor_plans') IS NULL THEN
    RAISE EXCEPTION 'STOP: public.tutor_plans cədvəli yoxdur. Əvvəl 20261004000000 miqrasiyasını icra edin.';
  END IF;
  RAISE NOTICE 'Preflight OK.';
END $$;


-- ############################################################################
-- ADDIM 1. CHECK CONSTRAINT-LƏRİN GENİŞLƏNDİRİLMƏSİ ('courses' / 'kurslar')
-- ############################################################################

-- 1.1. tutor_plans.id
ALTER TABLE public.tutor_plans
  DROP CONSTRAINT IF EXISTS tutor_plans_id_check;

ALTER TABLE public.tutor_plans
  ADD CONSTRAINT tutor_plans_id_check
  CHECK (id IN ('free', 'standard', 'pro', 'courses', 'kurslar', 'pro_plus', 'full_pro'));


-- 1.2. tutor_subscriptions.plan (FK + CHECK)
DO $$
BEGIN
  IF to_regclass('public.tutor_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.tutor_subscriptions
      DROP CONSTRAINT IF EXISTS tutor_subscriptions_plan_check;

    ALTER TABLE public.tutor_subscriptions
      ADD CONSTRAINT tutor_subscriptions_plan_check
      CHECK (plan IN ('free', 'standard', 'pro', 'courses', 'kurslar'));
  END IF;
END $$;


-- 1.3. plan_upgrade_requests.current_plan / desired_plan
DO $$
BEGIN
  IF to_regclass('public.plan_upgrade_requests') IS NOT NULL THEN
    ALTER TABLE public.plan_upgrade_requests
      DROP CONSTRAINT IF EXISTS plan_upgrade_requests_current_plan_check;
    ALTER TABLE public.plan_upgrade_requests
      DROP CONSTRAINT IF EXISTS plan_upgrade_requests_desired_plan_check;

    ALTER TABLE public.plan_upgrade_requests
      ADD CONSTRAINT plan_upgrade_requests_current_plan_check
      CHECK (current_plan IN ('free', 'standard', 'pro', 'courses', 'kurslar'));

    ALTER TABLE public.plan_upgrade_requests
      ADD CONSTRAINT plan_upgrade_requests_desired_plan_check
      CHECK (desired_plan IN ('free', 'standard', 'pro', 'courses', 'kurslar'));
  END IF;
END $$;


-- 1.4. users.plan
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'plan'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_valid_chk;
    ALTER TABLE public.users
      ADD CONSTRAINT users_plan_valid_chk
      CHECK (plan IS NULL OR plan IN ('free', 'standard', 'pro', 'courses', 'kurslar'));
  END IF;
END $$;


-- ############################################################################
-- ADDIM 2. PLAN KATALOQU (UPSERT): PRO YENİLƏNMƏSİ VƏ KURSLAR PLANI
--
-- Qiymətlər AZN/AY:
--   free      →  0.00 AZN |  5 şagird | ayda  2 sınaq
--   standard  → 14.99 AZN | 20 şagird | ayda 15 sınaq   (orijinal 29.98)
--   pro       → 29.99 AZN | 80 şagird | limitsiz sınaq   (orijinal 59.98)
--   courses   → 49.99 AZN | limitsiz  | limitsiz sınaq   (orijinal 99.98)
-- ############################################################################

-- Pro planında şagird limitini 80-ə təyin edirik
UPDATE public.tutor_plans
   SET max_students        = 80,
       description         = '80 şagirdə qədər və limitsiz sınaq',
       original_price_azn  = 59.98,
       discount_percent    = 50,
       is_active           = TRUE
 WHERE id = 'pro';

-- Kurslar üçün yeni plan əlavə edirik (və ya yeniləyirik)
INSERT INTO public.tutor_plans
  (id, display_name, price_azn, original_price_azn, discount_percent,
   max_students, max_exams_per_month, description, sort_order, is_active)
VALUES
  ('courses', 'Kurslar üçün', 49.99, 99.98, 50,
   NULL, NULL,
   'Tədris mərkəzləri və kurslar üçün limitsiz şagird və limitsiz sınaq', 4, TRUE)
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  price_azn           = EXCLUDED.price_azn,
  original_price_azn  = EXCLUDED.original_price_azn,
  discount_percent    = EXCLUDED.discount_percent,
  max_students        = EXCLUDED.max_students,
  max_exams_per_month = EXCLUDED.max_exams_per_month,
  description         = EXCLUDED.description,
  sort_order          = EXCLUDED.sort_order,
  is_active           = TRUE;

COMMENT ON TABLE public.tutor_plans IS
  'Repetitor aylıq abunə planlarının kataloqu. Aktiv planlar: free | standard | pro | courses.';
COMMENT ON COLUMN public.tutor_plans.id IS
  'Plan açarı: free | standard | pro | courses. Köhnə arxivlər is_active=false olaraq saxlanılır.';
COMMENT ON COLUMN public.tutor_plans.max_students IS
  'Qrupdakı maksimum şagird sayı. NULL = limitsiz (yalnız courses planında). Free = 5, Standart = 20, Pro = 80.';


-- ############################################################################
-- ADDIM 3. RLS TƏKİRLƏNMƏSİ
-- ############################################################################

ALTER TABLE public.tutor_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_plan_usage      ENABLE ROW LEVEL SECURITY;


-- ############################################################################
-- ADDIM 4. YOXLAMA (audit)
-- ############################################################################

DO $$
DECLARE
  v_pro record;
  v_courses record;
  v_active_count integer;
BEGIN
  SELECT count(*) INTO v_active_count FROM public.tutor_plans WHERE is_active = TRUE;
  RAISE NOTICE 'Aktiv plan sayı: % (gözlənilən: 4 - free, standard, pro, courses)', v_active_count;

  SELECT id, display_name, price_azn, max_students, max_exams_per_month
    INTO v_pro FROM public.tutor_plans WHERE id = 'pro';
  IF v_pro IS NULL THEN
    RAISE EXCEPTION 'XƏTA: pro planı tapılmadı!';
  ELSE
    RAISE NOTICE 'PRO: % | Qiymət: % AZN | Şagird: % | Sınaq/ay: %',
      v_pro.display_name, v_pro.price_azn, v_pro.max_students,
      COALESCE(v_pro.max_exams_per_month::text, 'LIMITSIZ');
  END IF;

  SELECT id, display_name, price_azn, max_students, max_exams_per_month
    INTO v_courses FROM public.tutor_plans WHERE id = 'courses';
  IF v_courses IS NULL THEN
    RAISE EXCEPTION 'XƏTA: courses planı tapılmadı!';
  ELSE
    RAISE NOTICE 'COURSES: % | Qiymət: % AZN | Şagird: % | Sınaq/ay: %',
      v_courses.display_name, v_courses.price_azn,
      COALESCE(v_courses.max_students::text, 'LIMITSIZ'),
      COALESCE(v_courses.max_exams_per_month::text, 'LIMITSIZ');
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Miqrasiya uğurla tamamlandı: Pro (80 şagird) + Kurslar üçün (49.99 AZN, limitsiz şagird).';
  RAISE NOTICE '==================================================';
END $$;
