-- ============================================================================
-- MİQRASİYA: 20261005000000_full_pro_plan_and_discounts.sql
--
-- MƏQƏD:
--   1) YENİ PLAN — "Full Pro" (`full_pro`): LIMITSİZ şagird + limitsiz sınaq,
--      qiymət 49.99 AZN/ay.
--   2) "Pro+" planının qiyməti 34.99 AZN/ay, şagird limiti 100 şagirdə çevrilir.
--   3) 50% ENDİRİM göstərilişi üçün `original_price_azn` + `discount_percent`
--      sütunları əlavə olunur (orijinal qiymət üstündən keçilən şəkildə göstərilir).
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • Heç bir DELETE/UPDATE mövcud sətir YOK EDİLMİR — yalnız katalog
--     (tutor_plans) dəyərləri UPSERT ilə yenilənir və CHECK constraint-lər
--     genişləndirilir.
--   • RLS bütün cədvəllərdə aktiv qalır (anon/authenticated → RƏDD).
--   • Abunə məlumatı (`tutor_subscriptions`) HEÇ VAXT toxunulmur.
--
-- İDEMPOTENTLİK: Faylı TƏKRAR icra etmək təhlükəsizdir (IF EXISTS / IF NOT
--   EXISTS + UPSERT). Xarici BEGIN/COMMIT YOXDUR.
--
-- İCRA: Supabase SQL Editor → bütün mətni yapışdır → Run.
-- ============================================================================


-- ############################################################################
-- ADDIM 0. ÖNCÜKİ YOXLAMA (preflight)
-- ############################################################################

DO $$
DECLARE
  v_users regclass := to_regclass('public.users');
BEGIN
  IF v_users IS NULL THEN
    RAISE EXCEPTION 'STOP: public.users cədvəli tapılmadı. Miqrasiyanı dayandırın.';
  END IF;
  IF to_regclass('public.tutor_plans') IS NULL THEN
    RAISE EXCEPTION 'STOP: public.tutor_plans cədvəli yoxdur. Əvvəl 20261004000000 '
                    'miqrasiyasını icra edin.';
  END IF;
  RAISE NOTICE 'Preflight OK.';
END $$;


-- ############################################################################
-- ADDIM 1. ENDİRİM SÜTUNLARI
--
--   original_price_azn — sənəddə keçilən göstərilən qiymət (NULL = endirim yoxdur).
--   discount_percent   — endirim faizi (0..90).
--
-- Qiymət məntiqi: `price_azn` = ÖDƏNİŞ qiyməti (endpoint bu qiyməti qaytarır və
-- `plan_upgrade_requests` yaradılır). `original_price_azn` yalnız UI göstərimi
-- üçündür → ödəniş heç vaxt bu sütuna baxmır.
-- ############################################################################

ALTER TABLE public.tutor_plans
  ADD COLUMN IF NOT EXISTS original_price_azn numeric(6,2)
    CHECK (original_price_azn IS NULL OR original_price_azn >= 0);

ALTER TABLE public.tutor_plans
  ADD COLUMN IF NOT EXISTS discount_percent integer NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 90);

COMMENT ON COLUMN public.tutor_plans.original_price_azn IS
  'UI-da keçilən göstərilən orijinal qiymət (AZN). NULL = endirim yoxdur.';
COMMENT ON COLUMN public.tutor_plans.discount_percent IS
  'Endirim faizi (0-90). Yalnız UI göstəriliyi üçün.';


-- ############################################################################
-- ADDIM 2. CHECK CONSTRAINT-LƏRİN GENİŞLƏNDİRİLMƏSİ (`full_pro` əlavə olunur)
--
-- Köhnə constraint-lər `id IN ('free','standard','pro','pro_plus')` yoxlayır və
-- `full_pro` sətrini RƏDD edərdi. Constraint adları DB tərəfindən avtomatik
-- verilmiş ola bilər (tutor_plans_id_check) → dinamik DROP lazımdır.
-- ############################################################################

-- 2.1. tutor_plans.id
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.tutor_plans'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%pro_plus%'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_plans DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'tutor_plans: constraint % silindi.', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.tutor_plans
  DROP CONSTRAINT IF EXISTS tutor_plans_id_check;

ALTER TABLE public.tutor_plans
  ADD CONSTRAINT tutor_plans_id_check
  CHECK (id IN ('free', 'standard', 'pro', 'pro_plus', 'full_pro'));

COMMENT ON COLUMN public.tutor_plans.id IS
  'Plan açarı: free | standard | pro | pro_plus | full_pro';


-- 2.2. tutor_subscriptions.plan  (FK + CHECK)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.tutor_subscriptions'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%pro_plus%'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_subscriptions DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'tutor_subscriptions: constraint % silindi.', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.tutor_subscriptions
  DROP CONSTRAINT IF EXISTS tutor_subscriptions_plan_check;

ALTER TABLE public.tutor_subscriptions
  ADD CONSTRAINT tutor_subscriptions_plan_check
  CHECK (plan IN ('free', 'standard', 'pro', 'pro_plus', 'full_pro'));


-- 2.3. plan_upgrade_requests.current_plan / desired_plan
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.plan_upgrade_requests'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%pro_plus%'
  LOOP
    EXECUTE format('ALTER TABLE public.plan_upgrade_requests DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'plan_upgrade_requests: constraint % silindi.', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.plan_upgrade_requests
  DROP CONSTRAINT IF EXISTS plan_upgrade_requests_current_plan_check;
ALTER TABLE public.plan_upgrade_requests
  DROP CONSTRAINT IF EXISTS plan_upgrade_requests_desired_plan_check;

ALTER TABLE public.plan_upgrade_requests
  ADD CONSTRAINT plan_upgrade_requests_current_plan_check
  CHECK (current_plan IN ('free', 'standard', 'pro', 'pro_plus', 'full_pro'));

ALTER TABLE public.plan_upgrade_requests
  ADD CONSTRAINT plan_upgrade_requests_desired_plan_check
  CHECK (desired_plan IN ('free', 'standard', 'pro', 'pro_plus', 'full_pro'));


-- 2.4. users.plan_valid_chk (köhnə v1 miqrasiyasının qalığı — varsa)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND conname  = 'users_plan_valid_chk'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'users: constraint % silindi.', r.conname;
  END LOOP;
END $$;


-- ############################################################################
-- ADDIM 3. PLAN KATALOQU (UPSERT)
--
-- Qiymətlər AZN/AY. `max_students = NULL` → limitsiz.
-- `max_exams_per_month = NULL` → limitsiz.
--
--   free      →  0.00 AZN |  5 şagird | ayda 2 sınaq
--   standard  → 14.99 AZN | 20 şagird | limitsiz sınaq   (orijinal 29.98)
--   pro       → 29.99 AZN | 60 şagird | limitsiz sınaq   (orijinal 59.98)
--   pro_plus  → 34.99 AZN |100 şagird | limitsiz sınaq   (orijinal 69.98)
--   full_pro  → 49.99 AZN | limitsiz  | limitsiz sınaq   (orijinal 99.98)
-- ############################################################################

INSERT INTO public.tutor_plans
  (id, display_name, price_azn, original_price_azn, discount_percent,
   max_students, max_exams_per_month, description, sort_order)
VALUES
  ('free',     'Free',     0.00, NULL,  0,
   5,  2,
   'Kiqik qruplar üçün başlanğıc plan', 1),

  ('standard', 'Standart', 14.99, 29.98, 50,
   20, NULL,
   '20 şagirdə qədər, limitsiz sınaq', 2),

  ('pro',      'Pro',      29.99, 59.98, 50,
   60, NULL,
   'Böyük qruplar üçün limitsiz sınaq', 3),

  ('pro_plus', 'Pro+',     34.99, 69.98, 50,
   100, NULL,
   '100 şagirdə qədər, limitsiz sınaq', 4),

  ('full_pro', 'Full Pro', 49.99, 99.98, 50,
   NULL, NULL,
   'Limitsiz şagird və limitsiz sınaq', 5)
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  price_azn           = EXCLUDED.price_azn,
  original_price_azn  = EXCLUDED.original_price_azn,
  discount_percent    = EXCLUDED.discount_percent,
  max_students        = EXCLUDED.max_students,
  max_exams_per_month = EXCLUDED.max_exams_per_month,
  description         = EXCLUDED.description,
  sort_order          = EXCLUDED.sort_order;


-- ############################################################################
-- ADDIM 4. RLS TƏKİRLƏNMƏSİ (təhlükəsizlik regressiyasının qarşısını alır)
-- ############################################################################

ALTER TABLE public.tutor_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_plan_usage      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_tutor_plans"          ON public.tutor_plans;
DROP POLICY IF EXISTS "authenticated_read_tutor_plans" ON public.tutor_plans;
DROP POLICY IF EXISTS "anon_read_upgrade_requests"     ON public.plan_upgrade_requests;
DROP POLICY IF EXISTS "anon_read_plan_usage"           ON public.tutor_plan_usage;


-- ############################################################################
-- ADDIM 5. YOXLAMA (yalnız NOTICE — icra dayanmır)
-- ############################################################################

DO $$
DECLARE
  v_count integer;
  v_full  record;
BEGIN
  SELECT count(*) INTO v_count FROM public.tutor_plans WHERE is_active;
  RAISE NOTICE 'Aktiv plan sayı: %', v_count;

  SELECT id, display_name, price_azn, original_price_azn, discount_percent,
         max_students, max_exams_per_month
    INTO v_full
    FROM public.tutor_plans
   WHERE id = 'full_pro';

  IF NOT FOUND THEN
    RAISE NOTICE 'XƏTA: full_pro planı kataloqda yoxdur!';
  ELSE
    RAISE NOTICE '%',
      CONCAT(
        'full_pro plan tapıldı | qiymət=', v_full.price_azn,
        ' AZN | orijinal=', COALESCE(v_full.original_price_azn::text, 'yoxdur'),
        ' AZN | endirim=', v_full.discount_percent::text, ' faiz',
        ' | şagird limiti=',
        COALESCE(v_full.max_students::text, 'LIMITSIZ')
      );
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE '%',
    CONCAT('Full Pro planı əlavə olundu. Endirim: ', 50, ' faiz aktivdir.');
  RAISE NOTICE '==================================================';
END $$;
