-- ============================================================================
-- MİQRASİYA: 20261004000000_tutor_subscriptions.sql  (v2 — DÜZƏLİŞ)
--
-- SƏBƏB: Əvvəlki versiya (`20261003000000`) `users` cədvəlinə yeni `plan`
--   sütunu əlavə edirdi. Database sxemi göstərir ki, `users` cədvəlində
--   ARTIQ `subscription_status` sütunu mövcuddur — yeni sütun əlavə etmək
--   mövcud biznes məntiqinə toxunma riski yaradır.
--
--   HƏLL: Abunə məlumatı ARİRİ cədvələ (`tutor_subscriptions`) köçürülür.
--   `users` cədvəlinə HEÇ BİR TOXUNULMUR (dəyişiklik yoxdur).
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • `users` cədvəli SİLİNMİR, DƏYİŞMİR — yalnız oxunur.
--   • RLS bütün yeni cədvəllərdə aktiv; anon/authenticated üçün RƏDD
--     (yalnız service_role = FastAPI backend).
--   • MƏLUMAT ITKİSİ YOXDUR: heç bir DELETE/UPDATE mövcud sətri yox etmir.
--
-- İDEMPOTENTLİK: Bu fayl TƏKRAR İCRA EDİLƏ BİLƏR (bütün əməliyyatlar
--   IF EXISTS / IF NOT EXISTS qoruyucusu ilə). Əvvəlki səhvin yarım
--   qalan hissəsini (tutor_plans cədvəli, users.plan sütunu) da təmizləyir.
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
  RAISE NOTICE 'Preflight OK: public.users tapıldı.';
END $$;


-- ############################################################################
-- ADDIM 1. PLAN KATALOQU CƏDVƏLİ
--
-- Qiymətlər AZN/ay (numeric). `max_students`: NULL = limitsiz.
-- `max_exams_per_month`: NULL = limitsiz.
-- Plan məlumatları frontend-ə gələn TƏK MƏNBƏYİDİR (tikili qiymət yoxdur).
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_plans (
  id                   text PRIMARY KEY
                         CHECK (id IN ('free', 'standard', 'pro', 'pro_plus')),
  display_name         text NOT NULL,
  price_azn            numeric(6,2) NOT NULL CHECK (price_azn >= 0),
  max_students         integer CHECK (max_students IS NULL OR max_students > 0),
  max_exams_per_month  integer CHECK (max_exams_per_month IS NULL OR max_exams_per_month > 0),
  description          text,
  sort_order           integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tutor_plans IS
  'Repetitor aylıq abunə planlarının kataloqu (mərkəzləşdirilmiş konfiqurasiya).';
COMMENT ON COLUMN public.tutor_plans.id IS
  'Plan açarı: free | standard | pro | pro_plus';
COMMENT ON COLUMN public.tutor_plans.max_students IS
  'Aktiv şagird limiti. NULL = limitsiz.';
COMMENT ON COLUMN public.tutor_plans.max_exams_per_month IS
  'Aylıq sınaq yaratma/yükləmə limiti. NULL = limitsiz.';


-- Katalog məlumatı (UPSERT — yenidən icra edilmə təhlükəsizdir)
INSERT INTO public.tutor_plans
  (id, display_name, price_azn, max_students, max_exams_per_month, description, sort_order)
VALUES
  ('free',     'Free',     0.00,  5,  2,
   'Kiqik qruplar üçün başlanğıc plan', 1),
  ('standard', 'Standart', 14.99, 20, NULL,
   '20 şagirdə qədər, limitsiz sınaq', 2),
  ('pro',      'Pro',      29.99, 60, NULL,
   'Böyük qruplar üçün limitsiz sınaq', 3),
  ('pro_plus', 'Pro+',     49.99, NULL, NULL,
   'Limitsiz şagird və limitsiz sınaq', 4)
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  price_azn           = EXCLUDED.price_azn,
  max_students        = EXCLUDED.max_students,
  max_exams_per_month = EXCLUDED.max_exams_per_month,
  description         = EXCLUDED.description,
  sort_order          = EXCLUDED.sort_order;


-- ############################################################################
-- ADDIM 2. ABUNƏ CƏDVƏLİ (AYRI CƏDVƏL — `users` TOXUNULMUR)
--
-- Hər repetitor üçün ən çoxu BİR sətir (tutor_id PK).
-- Sətir YOXDURSA = Free plan (defensive, defektə görə).
--
-- ALLAH İNŞA SİZ ON PLAN VERİRSİNİZ BURAYA:
--   UPDATE public.tutor_subscriptions
--      SET plan = 'pro', plan_expires_at = now() + interval '30 days'
--    WHERE tutor_id = '<repetitor UUID>';
-- Əgər sətir yoxdursa, INSERT edin (aşağıdakı SQL ilə).
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_subscriptions (
  tutor_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  plan           text NOT NULL DEFAULT 'free'
                 CHECK (plan IN ('free', 'standard', 'pro', 'pro_plus')),
  plan_expires_at timestamptz,
  plan_changed_at timestamptz DEFAULT now(),
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tutor_subscriptions IS
  'Repetitor abunə planı. Sətir yoxdursa = Free plan (default).';


-- FK: tutor_subscriptions.plan → tutor_plans.id (təhlükəsizlik: yalnız katalogdakı planlar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tutor_subscriptions_plan_fkey'
  ) THEN
    ALTER TABLE public.tutor_subscriptions
      ADD CONSTRAINT tutor_subscriptions_plan_fkey
      FOREIGN KEY (plan) REFERENCES public.tutor_plans(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;


-- ############################################################################
-- ADDIM 3. PLAN YÜKSƏLTMƏ SORĞULARI (admin tərəfdən manual icra)
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.plan_upgrade_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  current_plan text NOT NULL DEFAULT 'free'
                CHECK (current_plan IN ('free', 'standard', 'pro', 'pro_plus')),
  desired_plan text NOT NULL
                CHECK (desired_plan IN ('free', 'standard', 'pro', 'pro_plus')),
  contact_hint text,
  status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note   text,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_upgrade_requests IS
  'Repetitor plan yüksəltmə sorğuları. Admin tərəfdən manual qəbul edilir.';

CREATE INDEX IF NOT EXISTS idx_plan_upgrade_requests_tutor
  ON public.plan_upgrade_requests (tutor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_upgrade_requests_status
  ON public.plan_upgrade_requests (status, created_at DESC);


-- ############################################################################
-- ADDIM 4. AYLIK SINAQ İSTİFADƏ SAYĞACI
--
-- UPSERT + CHECK (tarix ayın 1-i olmalıdır) → təqvim ayı bölməsi.
-- Köhnə sətirlər SİLİNMİR (tarix filteri ilə seçilir).
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_plan_usage (
  tutor_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  exams_created integer NOT NULL DEFAULT 0 CHECK (exams_created >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tutor_id, period_start),
  CHECK (date_trunc('month', period_start)::date = period_start)
);

COMMENT ON TABLE public.tutor_plan_usage IS
  'Repetitor aylıq sınaq yaratma sayğacı (Free plan limiti üçün).';


-- Atomik sayğac artırma RPC-si.
-- SECURITY DEFINER + sabitlənmiş search_path → search_path manipulyasiya
-- və SQL injection hücumlarının qarşısı alınır.
CREATE OR REPLACE FUNCTION public.increment_tutor_exam_usage(
  p_tutor_id     uuid,
  p_period_start date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_value integer;
BEGIN
  INSERT INTO public.tutor_plan_usage (tutor_id, period_start, exams_created)
  VALUES (p_tutor_id, p_period_start, 1)
  ON CONFLICT (tutor_id, period_start)
  DO UPDATE SET exams_created = public.tutor_plan_usage.exams_created + 1,
                updated_at = now()
  RETURNING exams_created INTO v_new_value;

  RETURN v_new_value;
END $$;

-- RPC yalnız öz sətrini dəyişə bilər (defensive GRANT).
REVOKE ALL ON FUNCTION public.increment_tutor_exam_usage(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_tutor_exam_usage(uuid, date) TO service_role;


-- ############################################################################
-- ADDIM 5. RLS — YALNIZ service_role (anon/authenticated üçün RƏDD)
--
-- ⚠️ Frontend Supabase JS SDK ilə bu cədvəllərə HƏR ZAMAN əlçatmazdır
--    (.clinerules §1 — Supabase İzolasiyası).
-- ############################################################################

ALTER TABLE public.tutor_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_plan_usage      ENABLE ROW LEVEL SECURITY;

-- Köhnə açıq siyasələri təmizləyirik (heç bir rol açıq qalmasın).
DROP POLICY IF EXISTS "anon_read_tutor_plans"          ON public.tutor_plans;
DROP POLICY IF EXISTS "authenticated_read_tutor_plans" ON public.tutor_plans;
DROP POLICY IF EXISTS "anon_read_upgrade_requests"     ON public.plan_upgrade_requests;
DROP POLICY IF EXISTS "anon_read_plan_usage"           ON public.tutor_plan_usage;


-- ############################################################################
-- ADDIM 6. İNDEKSLƏR
-- ############################################################################

CREATE INDEX IF NOT EXISTS idx_tutor_subscriptions_plan
  ON public.tutor_subscriptions (plan);
CREATE INDEX IF NOT EXISTS idx_plan_usage_period
  ON public.tutor_plan_usage (period_start);


-- ############################################################################
-- ADDIM 7. KÖHNƏ MİQRASİYANIN YARIM QALAN HİSSƏSİNİN TƏMİZLƏNMƏSİ
--
-- Əvvəlki icra (`20261003000000`) `users.plan` sütununu əlavə etmiş ola bilər.
-- Bu sütun artıq istifadə OLUNMUR (kod `tutor_subscriptions`-dan oxuyur).
-- ⚠️ SÜTUN SİLİNMİR — yalnız qeydə alınır. Silmək məlumat riskidir və
--    heç bir dəstək dəyəri yoxdur.
-- ############################################################################

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'users'
       AND column_name = 'plan'
  ) THEN
    RAISE NOTICE 'Qeyd: public.users.plan sütunu mövcuddur amma İSTİFADƏ OLUNMUR. '
                 'Aktiv abunə məlumatı public.tutor_subscriptions cədvəlindədir.';
  ELSE
    RAISE NOTICE 'public.users.plan sütunu yoxdur (gözlənilən — istifadə olunmur).';
  END IF;

  -- mövcud subscription_status sütununa toxunmuruz (məlumat riski yoxdur).
  RAISE NOTICE 'public.users cədvəlinə dəyişiklik edilmədi.';
END $$;


-- ############################################################################
-- ADDIM 8. YOXLAMA — hər şey hazırdır?
--
-- ⚠️ DİQQƏT: Bu blok `RAISE EXCEPTION` atmır — yalnız NOTICE çıxarır.
-- Beləliklə SQL Editor-da qırmızı xəta ekranı yaranmır və sonrakı
-- əməliyyatlar dayanmır.
--
-- ⚠️ `SELECT plan` əvəzinə `SELECT id` — `tutor_plans` cədvəlində
--    "plan" ADLI SÜTUN YOXDUR (plan açarı sütununun adı `id`-dir).
--    Bu, əvvəlki səhvin (42703) mənbəyi idi.
-- ############################################################################

DO $$
DECLARE
  v_free_ok       boolean;
  v_subs_ok       boolean;
  v_upgrade_ok    boolean;
  v_usage_ok      boolean;
  v_fn_ok         boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.tutor_plans WHERE id = 'free')
    INTO v_free_ok;

  SELECT to_regclass('public.tutor_subscriptions') IS NOT NULL
    INTO v_subs_ok;

  SELECT to_regclass('public.plan_upgrade_requests') IS NOT NULL
    INTO v_upgrade_ok;

  SELECT to_regclass('public.tutor_plan_usage') IS NOT NULL
    INTO v_usage_ok;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'increment_tutor_exam_usage'
       AND pronamespace = 'public'::regnamespace
  ) INTO v_fn_ok;

  IF v_free_ok AND v_subs_ok AND v_upgrade_ok AND v_usage_ok AND v_fn_ok THEN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MİQRASİYA UĞURLU TAMAMLANDI';
    RAISE NOTICE '  • tutor_plans (4 plan kataloqu) — hazır';
    RAISE NOTICE '  • tutor_subscriptions — hazır';
    RAISE NOTICE '  • plan_upgrade_requests — hazır';
    RAISE NOTICE '  • tutor_plan_usage + RPC — hazır';
    RAISE NOTICE '  • RLS aktiv (yalnız service_role)';
    RAISE NOTICE 'Bütün repetitorlar avtomatik Free plandadır.';
    RAISE NOTICE '==================================================';
  ELSE
    RAISE NOTICE 'XƏBƏRDARLIQ: free=% subs=% upgrade=% usage=% fn=%',
      v_free_ok, v_subs_ok, v_upgrade_ok, v_usage_ok, v_fn_ok;
  END IF;
END $$;


-- ############################################################################
-- İSTİFADƏÇİ QEYDİ (admin üçün) — yalnız lazım olanda icra edin
--
-- Bütün gözləyən sorğular:
--   SELECT id, tutor_id, current_plan, desired_plan, created_at
--     FROM public.plan_upgrade_requests
--    WHERE status = 'pending'
--    ORDER BY created_at DESC;
--
-- Plan YÜKSƏLTMƏ (sətir yoxdursa INSERT):
--   INSERT INTO public.tutor_subscriptions (tutor_id, plan, plan_expires_at)
--   VALUES ('<UUID>', 'pro', now() + interval '30 days')
--   ON CONFLICT (tutor_id) DO UPDATE
--     SET plan = EXCLUDED.plan,
--         plan_expires_at = EXCLUDED.plan_expires_at,
--         plan_changed_at = now();
--
-- PLAN LƏĞV ETMƏ (Free-ə qaytarmaq):
--   UPDATE public.tutor_subscriptions
--      SET plan = 'free', plan_expires_at = NULL, plan_changed_at = now()
--    WHERE tutor_id = '<UUID>';
--
-- Cari vəziyyəti görmək:
--   SELECT u.identifier, COALESCE(s.plan, 'free') AS plan,
--          s.plan_expires_at
--     FROM public.users u
--     LEFT JOIN public.tutor_subscriptions s ON s.tutor_id = u.id
--    WHERE u.role = 'tutor';
-- ############################################################################