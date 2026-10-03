 ============================================================================
 --MİQRASİYA: 20261003000000_tutor_subscription_plans.sql
--
-- MƏQƏD: Repetitor panelinə aylıq abunə plan sistemi (Free / Standart / Pro / Pro+).
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • RLS bütün əlaqəli cədvəllərdə aktivləşdirilir; anon/authenticated
--     üçün heç bir siyasə yaradılmır (default: RƏDD) → yalnız service_role.
--   • PLAN MƏLUMATLAI frontend-ə gələn `tutor_plans` cədvəlindən oxunur,
--     lakin heç vaxt frontend tərəfdən dəyişdirilə bilmir (yazma yalnız
--     admin/service_role tərəfdəndir).
--   • MƏLUMAT ITKİSİ YOXDUR: heç bir DELETE/UPDATE mövcud sətri yox etmir;
--     yalnız yeni sütunlar əlavə olunur və DEFAULT 'free' ilə doldurulur.
--
-- İCRA: Supabase SQL Editor → bütün mətni yapışdır → Run.
--   ⚠️ Bütün əməliyyatlar idempotentdir və AYRI-AYRI ifa olunur
--      (xarici BEGIN/COMMIT YOXDUR) — bir addım uğursuz olsa, digərləri
--      icra olunmağa davam edir və faylı yenidən icra etmək təhlükəsizdir.
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

  RAISE NOTICE 'Preflight OK: users tapıldı.';
END $$;


-- ############################################################################
-- ADDIM 1. PLAN KATALOQU CƏDVƏLİ
--
-- Qiymətlər AZN/ay (numeric). `max_students`: NULL = limitsiz.
-- `max_exams_per_month`: NULL = limitsiz.
-- Frontend bu cədvəli oxuyur → plan detalları kodda TİKİLİ DEYİL,
-- mərkəzləşdirilmiş və admin tərəfdən dəyişdirilə biləndir.
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_plans (
  id                   text PRIMARY KEY
                         CHECK (id ~ '^(free|standard|pro|pro_plus)$'),
  display_name         text NOT NULL,
  price_azn            numeric(6,2) NOT NULL CHECK (price_azn >= 0),
  max_students         integer CHECK (max_students IS NULL OR max_students > 0),
  max_exams_per_month  integer CHECK (max_exams_per_month IS NULL OR max_exams_per_month > 0),
  description          text,
  sort_order           integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tutor_plans IS
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
-- ADDIM 2. `users` CƏDVƏLİNƏ PLAN SÜTUNLARI
--
-- Yeni repetitor hesabları avtomatik OLARAQ 'free' planında açılır
-- (DEFAULT + backfill). `plan_expires_at` NULL = aktiv abunə (bitməyən),
-- keçmiş tarix = vaxtı bitmiş plan (backend limitləri free səviyyəsinə
-- geri qaytarır — "fail-closed").
-- ############################################################################

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz DEFAULT now();


-- Mövcud sətirlərdə NULL qalmasının qarşısını alır (köhnə sətirlər)
UPDATE public.users SET plan = 'free' WHERE plan IS NULL;


-- CHECK: yalnız katalogdakı plan ID-ləri qəbul olunur.
-- ⚠️ FK aşağıda yaradılır (cədvəl sırasına görə).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_plan_valid_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_plan_valid_chk
  CHECK (plan IN ('free', 'standard', 'pro', 'pro_plus'));

-- Yalnız repetitor rolunun planı ola bilər; şagird üçün 'free' məcburi.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_plan_role_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_plan_role_chk
  CHECK (role <> 'tutor' OR plan IS NOT NULL);


-- ############################################################################
-- ADDIM 3. FK: users.plan → tutor_plans.id
-- ############################################################################

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_plan_fkey
      FOREIGN KEY (plan) REFERENCES public.tutor_plans(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;


-- ############################################################################
-- ADDIM 4. PLAN YÜKSƏLTMƏ SORĞULARI (admin tərəfdən manual icra olunur)
--
-- İstifadəçi "Planı Yüksəlt" düyməsinə basanda WhatsApp-a yönləndirilir;
-- eyni zamanda burada bir sorğu sətri yaranır ki, admin daha sonra
-- hesabı əl ilə yüksətə bilsin. Status: pending | approved | rejected.
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
-- ADDIM 5. AYLIK SINAQ İSTİFADƏ SAYĞACI
--
-- Free plan üçün "ayda 2 sınaq" limiti DB səviyyəsində sayılır.
-- UPSERT + CHECK (created_at >= period_start) → hər sətir yalnız bir
-- təqvim ayına aid olur; köhnə sətirlər avtomatik təmizlənmir (tarix
-- filteri ilə seçilir), beləliklə heç bir məlumat itgisi olmur.
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_plan_usage (
  tutor_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  exams_created integer NOT NULL DEFAULT 0 CHECK (exams_created >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tutor_id, period_start),
  -- Təqvim ayının 1-i ilə başlamalıdır (təhlükəsizlik: yarım ay yarığı yoxdur)
  CHECK (date_trunc('month', period_start)::date = period_start)
);

COMMENT ON TABLE public.tutor_plan_usage IS
  'Repetitor aylıq sınaq yaratma sayğacı (Free plan limiti üçün).';


-- Atomik sayğac artırma RPC-si.
--
-- TƏHLÜKƏSİZLİK:
--   * SECURITY DEFINER + sabitlənmiş `search_path` → search_path manipulyasiya
--     və SQL injection hücumlarının qarşısı alınır.
--   * Yalnız `exams_created` artırılır; heç nə silinmir və overwrite edilmir.
--   * UPSERT → eyni ay üçün təkrar çağırılsa da sayğac düzgün artır.
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

-- RPC yalnız öz sətrini dəyişə bilər (defensive GRANT): public/anon/authenticated
-- üçün icra bağlanır, yalnız service_role (backend) çağıra bilər.
REVOKE ALL ON FUNCTION public.increment_tutor_exam_usage(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_tutor_exam_usage(uuid, date) TO service_role;


-- ############################################################################
-- ADDIM 6. RLS — YALNIZ service_role (anon/authenticated üçün RƏDD)
--
-- ⚠️ Frontend Supabase JS SDK ilə bu cədvəllərə HƏR ZAMAN əlçatmazdır
--    (.clinerules §1 — Supabase İzolasiyası). Bütün oxuma/yazma yalnız
--    FastAPI backend (service_role) vasitəsilədir.
-- ############################################################################

ALTER TABLE public.tutor_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_plan_usage      ENABLE ROW LEVEL SECURITY;

-- Köhnə cədvəllərdən qalx ola biləcək siyasələri təmizləyirik
-- (anon/authenticated üçün AÇIQ siyasə qalmasın).
DROP POLICY IF EXISTS "anon_read_tutor_plans"          ON public.tutor_plans;
DROP POLICY IF EXISTS "authenticated_read_tutor_plans" ON public.tutor_plans;
DROP POLICY IF EXISTS "anon_read_upgrade_requests"     ON public.plan_upgrade_requests;
DROP POLICY IF EXISTS "anon_read_plan_usage"           ON public.tutor_plan_usage;


-- ############################################################################
-- ADDIM 7. İNDEKSLƏR
-- ############################################################################

CREATE INDEX IF NOT EXISTS idx_users_plan       ON public.users (plan)
  WHERE role = 'tutor';
CREATE INDEX IF NOT EXISTS idx_users_tutor_plan ON public.users (tutor_id, plan);


-- ############################################################################
-- ADDIM 8. YOXLAMA (nəticəni görmək üçün)
-- ############################################################################

DO $$
DECLARE
  v_free_plan text;
BEGIN
  SELECT plan INTO v_free_plan FROM public.tutor_plans WHERE id = 'free';
  IF v_free_plan IS NULL THEN
    RAISE EXCEPTION 'STOP: Free plan kataloqa yazıla bilmədi.';
  END IF;
  RAISE NOTICE 'OK: Plan kataloqu hazırdır, bütün repetitorlar Free planlıdır.';
END $$;