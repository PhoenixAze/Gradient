-- ============================================================================
-- MİQRASİYA: 20261006000000_two_paid_plans.sql
--
-- MƏQƏD — katalog YALNIZ İKİ pullu plana endirilir:
--   1) `pro_plus` və `full_pro` planları İNAKTİV EDİLİR (katalogdan çıxarılır).
--      Heç bir sətir SİLİNMİR — sətirlər qalır, `is_active = false` olur ki,
--      köhnə hesabların FK-si qırılmasın.
--   2) Mövcud `pro_plus` / `full_pro` ABUNƏLƏRİ → `pro` planına KÖÇÜRÜLÜR
--      (istifadəçi heç bir şeyini itirmir; ödəniş etdiyi səviyyə qalır).
--   3) `standard` planının AYLIK SINAQ limiti 15-ə qoyulur
--      (əvvəl limitsiz idi → indi 15 sınaq/ay).
--   4) `pro` planı: limitsiz şagird + LIMITSİZ sınaq (ayda məhdudiyyət yoxdur).
--   5) CHECK constraint-lər `('free','standard','pro')` ilə daraldılır —
--      artıq yalnız bu üç plan dəstəklənir.
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • Heç bir DELETE yoxdur — yalnız UPSERT və plan sütunlarının UPDATE-i.
--   • Abunə köçürməsi YALNIZ yuxarı səviyyəyə (`pro_plus`/`full_pro` → `pro`)
--     aparılır; heç bir istifadəçi planını itirmir.
--   • RLS bütün cədvəllərdə aktiv qalır (anon/authenticated → RƏDD).
--
-- İDEMPOTENTLİK: Faylı TƏKRAR icra etmək təhlükəsizdir
--   (IF EXISTS / IF NOT EXISTS + UPSERT). Xarici BEGIN/COMMIT YOXDUR.
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
-- ADDIM 1. PLAN KATALOQU (UPSERT) — YALNIZ 3 AKTİV PLAN
--
-- Qiymətlər AZN/AY. `max_students = NULL` → limitsiz.
-- `max_exams_per_month = NULL` → limitsiz.
--
--   free      →  0.00 AZN |  5 şagird | ayda  2 sınaq
--   standard  → 14.99 AZN | 20 şagird | ayda 15 sınaq   (orijinal 29.98)
--   pro       → 29.99 AZN | limitsiz  | limitsiz sınaq   (orijinal 59.98)
--
-- `pro_plus` və `full_pro` sətirləri KİTAB DEYİL, yalnız is_active=false
-- olur → API kataloqda göstərmir (fetch_plans yalnız is_active=true oxuyur).
-- ############################################################################

INSERT INTO public.tutor_plans
  (id, display_name, price_azn, original_price_azn, discount_percent,
   max_students, max_exams_per_month, description, sort_order)
VALUES
  ('free',     'Free',     0.00, NULL,  0,
   5,  2,
   'Kiqik qruplar üçün başlanğıc plan', 1),

  ('standard', 'Standart', 14.99, 29.98, 50,
   20, 15,
   '20 şagirdə qədər, ayda 15 sınaq', 2),

  ('pro',      'Pro',      29.99, 59.98, 50,
   NULL, NULL,
   'Limitsiz şagird və limitsiz sınaq', 3)
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
  'Repetitor aylıq abunə planlarının kataloqu. Aktiv planlar: free | standard | pro.';
COMMENT ON COLUMN public.tutor_plans.id IS
  'Plan açarı (aktiv): free | standard | pro. Köhnə dəyərlər (pro_plus, full_pro) yalnız arxiv üçün saxlanılır və is_active=false-dir.';
COMMENT ON COLUMN public.tutor_plans.max_exams_per_month IS
  'Aylıq sınaq yaratma/yükləmə limiti. NULL = limitsiz. Standart = 15, Pro = limitsiz.';


-- ############################################################################
-- ADDIM 2. KÖHNƏ PLANLARI İNAKTİV EDİRMƏK
--
-- Sətirlər SİLİNMİR — yalnız `is_active = false`. Beləliklə:
--   • `tutor_subscriptions.plan` FK-si qırılmır,
--   • admin istəyəndə geri qaytara bilər,
--   • `/api/v1/plans` yalnız 3 aktiv planı qaytarır.
-- ############################################################################

UPDATE public.tutor_plans
   SET is_active = FALSE
 WHERE id IN ('pro_plus', 'full_pro');


-- ############################################################################
-- ADDIM 3. ABUNƏLƏRİN KÖÇÜRÜLMƏSİ (pro_plus / full_pro → pro)
--
-- ⚠️ MÖVCUD İSTİFADƏÇİNİN PLANI AZALDIRILMIR — hər iki köhnə plan da
--    `pro`-dan (limitsiz şagird + limitsiz sınaq) AŞAĞI deyil, ona bərabər
--    və ya daha yüksək səviyyə idi. Beləliklə heç bir imtiyaz itmir.
--
-- Nəticə: bütün aktiv pullu istifadəçilər indi hər iki funksiyanı (limitsiz
-- şagird + limitsiz sınaq) saxlayır.
-- ############################################################################

-- 3.1. Əsas abunə cədvəli
DO $$
DECLARE
  v_sub regclass := to_regclass('public.tutor_subscriptions');
  v_users_plan boolean;
BEGIN
  IF v_sub IS NOT NULL THEN
    UPDATE public.tutor_subscriptions
       SET plan = 'pro', plan_changed_at = now()
     WHERE plan IN ('pro_plus', 'full_pro');
    RAISE NOTICE 'tutor_subscriptions: köhnə planlar pro-ya köçürüldü.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'plan'
  ) THEN
    UPDATE public.users
       SET plan = 'pro'
     WHERE plan IN ('pro_plus', 'full_pro');
    RAISE NOTICE 'users.plan: köhnə planlar pro-ya köçürüldü.';
  END IF;

  IF to_regclass('public.plan_upgrade_requests') IS NOT NULL THEN
    UPDATE public.plan_upgrade_requests
       SET desired_plan = 'pro'
     WHERE desired_plan IN ('pro_plus', 'full_pro')
       AND status = 'pending';
    UPDATE public.plan_upgrade_requests
       SET current_plan = 'pro'
     WHERE current_plan IN ('pro_plus', 'full_pro');
    RAISE NOTICE 'plan_upgrade_requests: köhnə plan dəyərləri pro-ya köçürüldü.';
  END IF;
END $$;


-- ############################################################################
-- ADDIM 4. CHECK CONSTRAINT-LƏRİN DARALDILMASI ('free','standard','pro')
--
-- MÖCƏD: artıq yalnız iki pullu plan mövcuddur → köhnə 4/5 dəyərli
-- constraint-lər daraldılır. Constraint adları DB tərəfindən avtomatik verilmiş
-- ola bilər → dinamik DROP + sonra ADD.
--
-- ⚠️ TƏHLÜKƏSİZLİK: `ALTER TABLE ... VALIDATE` yoxdur — mövcud sətirlər
--    artıq yuxarıdakı UPDATE ilə təmizlənib, buna görə ADD CONSTRAINT
--    uğurla keçməlidir. Uğursuz olarsa, heç nə dəyişməmiş olmur.
-- ############################################################################

-- 4.1. tutor_plans.id
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


-- 4.2. tutor_subscriptions.plan  (FK + CHECK)
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.tutor_subscriptions') IS NOT NULL THEN
    FOR r IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.tutor_subscriptions'::regclass
         AND contype  = 'c'
         AND pg_get_constraintdef(oid) LIKE '%pro_plus%'
    LOOP
      EXECUTE format('ALTER TABLE public.tutor_subscriptions DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'tutor_subscriptions: constraint % silindi.', r.conname;
    END LOOP;

    ALTER TABLE public.tutor_subscriptions
      DROP CONSTRAINT IF EXISTS tutor_subscriptions_plan_check;

    ALTER TABLE public.tutor_subscriptions
      ADD CONSTRAINT tutor_subscriptions_plan_check
      CHECK (plan IN ('free', 'standard', 'pro'));
  END IF;
END $$;


-- 4.3. plan_upgrade_requests.current_plan / desired_plan
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.plan_upgrade_requests') IS NOT NULL THEN
    FOR r IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.plan_upgrade_requests'::regclass
         AND contype  = 'c'
         AND pg_get_constraintdef(oid) LIKE '%pro_plus%'
    LOOP
      EXECUTE format('ALTER TABLE public.plan_upgrade_requests DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'plan_upgrade_requests: constraint % silindi.', r.conname;
    END LOOP;

    ALTER TABLE public.plan_upgrade_requests
      DROP CONSTRAINT IF EXISTS plan_upgrade_requests_current_plan_check;
    ALTER TABLE public.plan_upgrade_requests
      DROP CONSTRAINT IF EXISTS plan_upgrade_requests_desired_plan_check;

    ALTER TABLE public.plan_upgrade_requests
      ADD CONSTRAINT plan_upgrade_requests_current_plan_check
      CHECK (current_plan IN ('free', 'standard', 'pro'));

    ALTER TABLE public.plan_upgrade_requests
      ADD CONSTRAINT plan_upgrade_requests_desired_plan_check
      CHECK (desired_plan IN ('free', 'standard', 'pro'));
  END IF;
END $$;


-- 4.4. users.plan_valid_chk (köhnə v1 miqrasiyasının qalığı — varsa)
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'plan'
  ) THEN
    FOR r IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.users'::regclass
         AND conname  = 'users_plan_valid_chk'
    LOOP
      EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'users: constraint % silindi.', r.conname;
    END LOOP;

    -- users.plan üçün yeni dar CHECK (FK varsa o da daraldılır)
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_valid_chk;
    ALTER TABLE public.users
      ADD CONSTRAINT users_plan_valid_chk
      CHECK (plan IS NULL OR plan IN ('free', 'standard', 'pro'));
  END IF;
END $$;


-- ############################################################################
-- ADDIM 5. RLS TƏKİRLƏNMƏSİ (təhlükəsizlik regressiyasının qarşısını alır)
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
-- ADDIM 6. YOXLAMA (yalnız NOTICE — icra dayanmır)
-- ############################################################################

DO $$
DECLARE
  v_active   record;
  v_std      record;
  v_pro      record;
  v_archived integer;
BEGIN
  SELECT count(*) INTO v_active FROM public.tutor_plans WHERE is_active;
  RAISE NOTICE 'Aktiv plan sayı: % (gözlənilən: 3)', v_active;

  SELECT count(*) INTO v_archived
    FROM public.tutor_plans
   WHERE is_active = FALSE AND id IN ('pro_plus', 'full_pro');
  RAISE NOTICE 'Arxivləşdirilmiş (is_active=false) köhnə plan: %', v_archived;

  SELECT id, display_name, price_azn, original_price_azn, discount_percent,
         max_students, max_exams_per_month
    INTO v_std FROM public.tutor_plans WHERE id = 'standard';
  IF v_std IS NULL THEN
    RAISE NOTICE 'XƏTA: standard planı kataloqda yoxdur!';
  ELSE
    RAISE NOTICE '%',
      CONCAT('standard | ', v_std.display_name,
             ' | ', v_std.price_azn, ' AZN (orijinal ', v_std.original_price_azn, ')',
             ' | endirim ', v_std.discount_percent, '%',
             ' | şagird ', COALESCE(v_std.max_students::text, 'LIMITSIZ'),
             ' | sınaq/ay ', COALESCE(v_std.max_exams_per_month::text, 'LIMITSIZ'));
  END IF;

  SELECT id, display_name, price_azn, original_price_azn, discount_percent,
         max_students, max_exams_per_month
    INTO v_pro FROM public.tutor_plans WHERE id = 'pro';
  IF v_pro IS NULL THEN
    RAISE NOTICE 'XƏTA: pro planı kataloqda yoxdur!';
  ELSE
    RAISE NOTICE '%',
      CONCAT('pro | ', v_pro.display_name,
             ' | ', v_pro.price_azn, ' AZN (orijinal ', v_pro.original_price_azn, ')',
             ' | endirim ', v_pro.discount_percent, '%',
             ' | şagird ', COALESCE(v_pro.max_students::text, 'LIMITSIZ'),
             ' | sınaq/ay ', COALESCE(v_pro.max_exams_per_month::text, 'LIMITSIZ'));
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Katalog sadalaşdırıldı: Standart (15 sınaq/ay) + Pro (limitsiz).';
  RAISE NOTICE 'pro_plus / full_pro istifadəçiləri Pro planına köçürüldü.';
  RAISE NOTICE '==================================================';
END $$;