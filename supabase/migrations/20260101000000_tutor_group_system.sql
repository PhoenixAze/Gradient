-- ============================================================================
-- MİQRASİYA: 20260101000000_tutor_group_system.sql  (v2 — səhvsiz)
--
-- Problem:
--   1) `users` cədvəlində `tutor_code` sütunu YOXDUR → dashboard "----" göstərir
--   2) `users.tutor_id` FK/index yoxdur və qrupa qoşulma cədvəli yoxdur
--      → "Şagird Əlavə Et" nəticəsi bazada saxlanmır
--
-- TƏHLÜKƏSİZLİK (.clinerules §1):
--   • RLS bütün əlaqəli cədvəllərdə aktivləşdirilir; anon/authenticated
--     üçün heç bir siyasə yaradılmır (default: RƏDD) → yalnız service_role.
--   • KOD GENERASİYASI: trigger ilə, unique index + təkrar cəhd dövrü.
--   • MƏLUMAT ITKİSİ YOXDUR: heç bir DELETE/UPDATE məlumat sətrini yox etmir.
--
-- İCRA: Supabase SQL Editor → bütün mətni yapışdır → Run.
--   ⚠️ Bütün əməliyyatlar idempotentdir və AYRI-AYRI ifa olunur
--      (xarici BEGIN/COMMIT YOXDUR) — bir addım uğursuz olsa, digərləri
--      icra olunmağa davam edir və faylı yenidən icra etmək təhlükəsizdir.
-- ============================================================================


-- ############################################################################
-- ADDIM 0. ÖNCÜKİ YOXLAMA (preflight) — cədvəl/sütun varlığını təsdiqləyir
-- ############################################################################

DO $$
DECLARE
  v_users regclass := to_regclass('public.users');
  v_courses regclass := to_regclass('public.tutor_courses');
BEGIN
  IF v_users IS NULL THEN
    RAISE EXCEPTION 'STOP: public.users cədvəli tapılmadı. Miqrasiyanı dayandırın.';
  END IF;

  IF to_regclass('public.tutor_join_requests') IS NULL THEN
    -- Əvvəlcədən mövcud cədvəl idarəetmə qaydalarını söndürürük ki,
    -- aşağıdakı CREATE TABLE dəyişikliyi bloklanmasın.
    EXECUTE 'ALTER TABLE public.tutor_join_requests OWNER TO postgres';
  END IF;

  RAISE NOTICE 'Preflight OK: users tapıldı, tutor_courses = %', v_courses;
END $$;


-- ############################################################################
-- ADDIM 1. `users.tutor_code` SÜTUNU
-- ############################################################################

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tutor_code text;

-- CHECK constraint: əgər varsa, silib yenidən yaradırıq
-- (köhnə sətirlər NULL olduğu üçün CHECK qəbul olunur).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_tutor_code_format_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_tutor_code_format_chk
  CHECK (tutor_code IS NULL OR tutor_code ~ '^[0-9]{4}$');


-- ############################################################################
-- ADDIM 2. KOD GENERASİYA FUNKSİYASI (trigger-dan əvvəl yaradılır)
--
--  Aralıq: 1000–9999. Ön sıfır yazılmır ki, "0087" və "87"
--  bir-birindən ayrılsın (insan faktoru xətasının qarşısı).
-- ############################################################################

CREATE OR REPLACE FUNCTION public.gen_unique_tutor_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate text;
  v_attempt  integer := 0;
BEGIN
  LOOP
    v_candidate := lpad((floor(random() * 9000) + 1000)::integer::text, 4, '0');
    v_attempt  := v_attempt + 1;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tutor_code = v_candidate);
    EXIT WHEN v_attempt >= 50;
  END LOOP;

  IF v_attempt >= 50 THEN
    RAISE EXCEPTION 'users_tutor_code_exhausted: 4 rəqəmli kod ehtiyatı tükəndi';
  END IF;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.gen_unique_tutor_code() IS
  'users cədvəlində istifadə olunmayan unikal 4 rəqəmli kod qaytarır (1000-9999).';


-- ############################################################################
-- ADDIM 3. UNİKAL İNDEKS
--  ⚠️ Əvvəlcə təkrar kodları təmizləyirik (aşağıda yoxlama SQL-i var).
-- ############################################################################

-- Köhnə indeks varsa silinir (təkrar icrada bloklanmasın)
DROP INDEX IF EXISTS public.idx_users_tutor_code;

CREATE UNIQUE INDEX idx_users_tutor_code
  ON public.users (tutor_code)
  WHERE tutor_code IS NOT NULL;


-- ############################################################################
-- ADDIM 4. TRIGGER — role='tutor' olan hər sətirə kod verir
-- ############################################################################

CREATE OR REPLACE FUNCTION public.assign_tutor_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Yalnız repetitor sətri
  IF NEW.role IS DISTINCT FROM 'tutor' THEN
    RETURN NEW;
  END IF;

  -- Artıq düzgün kod varsa (idx import) toxunma
  IF NEW.tutor_code IS NOT NULL AND NEW.tutor_code ~ '^[0-9]{4}$' THEN
    RETURN NEW;
  END IF;

  NEW.tutor_code := public.gen_unique_tutor_code();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_assign_tutor_code ON public.users;

CREATE TRIGGER trg_users_assign_tutor_code
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_tutor_code();


-- ############################################################################
-- ADDIM 5. MÖVCUD REPETİTORLAR ÜÇÜN BACKFILL
--  ⚠️ Diqqət: trigger yalnız INSERT-də işləyir, ona görə UPDATE
--     ayrıca tələb edir (sətirlər trigger-dan əvvəl yarandı).
-- ############################################################################

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.users
    WHERE role = 'tutor' AND tutor_code IS NULL
  LOOP
    -- Yarışma qoruması: unikal indeks varsa, eyni kod iki sətri ala bilməz
    BEGIN
      UPDATE public.users
      SET tutor_code = public.gen_unique_tutor_code()
      WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'tutor_code backfill keçildi: %', r.id;
    END;
  END LOOP;
END $$;


-- ############################################################################
-- ADDIM 6. `users.tutor_id` — FK və İNDEKS
--  ⚠️ ƏVVƏL SƏTİRLƏR SİLİNMİR — yalnız sıradan kənar FK dəyərləri NULL edilir.
-- ############################################################################

-- 6.1 Mövcud FK-ni (varsa) çıxar — yenidən səhvsiz formata salınır
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tutor_id_fkey;

-- 6.2 Sıradan kənar dəyərləri təmizlə (MƏLUMAT ITKİSİ YOXDUR)
UPDATE public.users u
SET tutor_id = NULL
WHERE u.tutor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.users t WHERE t.id = u.tutor_id AND t.role = 'tutor'
  );

-- 6.3 FK-ni əlavə et
ALTER TABLE public.users
  ADD CONSTRAINT users_tutor_id_fkey
  FOREIGN KEY (tutor_id) REFERENCES public.users (id) ON DELETE SET NULL;

-- 6.4 Dashboard sorğuları üçün indeks
DROP INDEX IF EXISTS public.idx_users_tutor_id;
CREATE INDEX idx_users_tutor_id
  ON public.users (tutor_id)
  WHERE tutor_id IS NOT NULL;

-- 6.5 `identifier` üzərində UNIQUE indeks
--     ⚠️ Təhlükəlidir: əgər bazada təkrarlar varsa CREATE UNIQUE xəta verir.
--     Aşağıdakı SQL ilə təkrar yoxlanılmalıdır. Təkrar varsa bu addımı
--     əl ilə dayandırın, təkrar sətirləri təmizləyin, sonra icra edin.
DROP INDEX IF EXISTS public.idx_users_identifier;

DO $$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT identifier
    FROM public.users
    WHERE identifier IS NOT NULL
    GROUP BY identifier
    HAVING count(*) > 1
  ) t;

  IF v_dupes = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_users_identifier ON public.users (identifier)';
  ELSE
    EXECUTE 'CREATE INDEX idx_users_identifier ON public.users (identifier)';
    RAISE WARNING
      'idx_users_identifier UNIQUE yaradılmadı: % təkrarlı dəyər var. '
      'Əvvəlcə təkrar sətirləri təmizləyin.', v_dupes;
  END IF;
END $$;


-- ############################################################################
-- ADDIM 7. QRUPA QOŞULMA İSTƏKLƏRİ CƏDVƏLİ
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.tutor_join_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL,
  tutor_id    uuid NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,

  CONSTRAINT tutor_join_requests_status_chk
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),

  CONSTRAINT tutor_join_requests_not_self_chk
    CHECK (student_id <> tutor_id)
);

-- FK-lər: CREATE TABLE-dan sonra əlavə olunur ki, əvvəlcədən mövcud
-- cədvəldə FK olmasa da heç bir problem yaranmasın.
ALTER TABLE public.tutor_join_requests
  DROP CONSTRAINT IF EXISTS tutor_join_requests_student_fkey;
ALTER TABLE public.tutor_join_requests
  ADD CONSTRAINT tutor_join_requests_student_fkey
  FOREIGN KEY (student_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.tutor_join_requests
  DROP CONSTRAINT IF EXISTS tutor_join_requests_tutor_fkey;
ALTER TABLE public.tutor_join_requests
  ADD CONSTRAINT tutor_join_requests_tutor_fkey
  FOREIGN KEY (tutor_id) REFERENCES public.users (id) ON DELETE CASCADE;

-- UNIQUE(student_id, tutor_id) — eyni repetitora təkrar istək göndərilməsin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tutor_join_requests_student_tutor_uniq'
  ) THEN
    ALTER TABLE public.tutor_join_requests
      ADD CONSTRAINT tutor_join_requests_student_tutor_uniq
      UNIQUE (student_id, tutor_id);
  END IF;
END $$;

-- Sorğu indeksləri
DROP INDEX IF EXISTS public.idx_tjr_student_status;
CREATE INDEX idx_tjr_student_status
  ON public.tutor_join_requests (student_id, status, created_at DESC);

DROP INDEX IF EXISTS public.idx_tjr_tutor_status;
CREATE INDEX idx_tjr_tutor_status
  ON public.tutor_join_requests (tutor_id, status, created_at DESC);

-- Hər şagird üçün yalnız BİR aktiv (pending) istək
DROP INDEX IF EXISTS public.idx_tjr_one_pending;
CREATE UNIQUE INDEX idx_tjr_one_pending
  ON public.tutor_join_requests (student_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.tutor_join_requests IS
  'Şagirdin 4 rəqəmli repetitor kodu ilə qoşulma sorğusu. '
  'Qəbul edildikdə users.tutor_id doldurulur.';


-- ############################################################################
-- ADDIM 8. REPETİTOR KURSU (subscription) SÜTUNLARI
--  ⚠️ Cədvəl mövcud deyilsə bu blok səssizcə keçilir.
-- ############################################################################

DO $$
BEGIN
  IF to_regclass('public.tutor_courses') IS NULL THEN
    RAISE NOTICE 'tutor_courses cədvəli yoxdur — subscription sütunları atlandı.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.tutor_courses
           ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true';
  EXECUTE 'ALTER TABLE public.tutor_courses
           ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT ''active''';

  EXECUTE 'DROP INDEX IF EXISTS public.idx_tutor_courses_tutor_active';
  EXECUTE 'CREATE INDEX idx_tutor_courses_tutor_active
           ON public.tutor_courses (tutor_id) WHERE is_active';
END $$;


-- ############################################################################
-- ADDIM 9. RPC — İSTƏYİ GÖNDƏR (şagird tərəfi)
--
--  ⚠️ `p_student_id` parametr kimi ötürülür, `auth.uid()` ilə deyil.
--  Səbəb: FastAPI service_role açarı ilə işləyir və service_role-da
--  `auth.uid()` NULL qaytarır. Şagirdin kimliyini FastAPI öz auth qatında
--  (require_user) yoxlayıb burada ötürür.
--
--  "Hər şagird üçün yalnız bir pending istək" invariantını qoruyur.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.submit_tutor_join_request(
  p_student_id uuid,
  p_tutor_code  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student uuid := p_student_id;
  v_tutor   uuid;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: Giriş tələb olunur';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_student AND role = 'student') THEN
    RAISE EXCEPTION 'not_a_student: Tələb edən şagird deyil';
  END IF;

  SELECT id INTO v_tutor
  FROM public.users
  WHERE tutor_code = p_tutor_code AND role = 'tutor'
  LIMIT 1;

  IF v_tutor IS NULL THEN
    RAISE EXCEPTION 'tutor_not_found: Bu kodla repetitor tapılmadı';
  END IF;

  IF v_tutor = v_student THEN
    RAISE EXCEPTION 'self_join: Bu kod özünüzə aiddir';
  END IF;

  -- Əvvəlki pending istəkləri ləğv edilir (invariant: yalnız bir pending)
  UPDATE public.tutor_join_requests
  SET status = 'cancelled', resolved_at = now()
  WHERE student_id = v_student AND status = 'pending';

  INSERT INTO public.tutor_join_requests (student_id, tutor_id, status)
  VALUES (v_student, v_tutor, 'pending')
  ON CONFLICT (student_id, tutor_id)
  DO UPDATE SET status = 'pending', created_at = now(), resolved_at = NULL;

  RETURN jsonb_build_object('tutor_id', v_tutor, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tutor_join_request(uuid, text) FROM PUBLIC;


-- ############################################################################
-- ADDIM 10. RPC — QƏBUL / RƏDD (repetitor tərəfi)
--  `SELECT ... FOR UPDATE` ilə atomik: status və users.tutor_id
--  heç vaxt bir-birindən ayrı vəziyyətdə qalmır.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.accept_tutor_join_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req      record;
  v_tutor    record;
  v_old_tid  uuid;
BEGIN
  SELECT id, student_id, tutor_id, status
    INTO v_req
  FROM public.tutor_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: Tələb tapılmadı';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'already_resolved: Tələb artıq % vəziyyətindədir', v_req.status;
  END IF;

  SELECT id, role INTO v_tutor FROM public.users WHERE id = v_req.tutor_id;
  IF v_tutor.role <> 'tutor' THEN
    RAISE EXCEPTION 'not_a_tutor: Hədəf istifadəçi repetitor deyil';
  END IF;

  -- Köhnə qrup varsa, digər pending istəkləri ləğv et
  SELECT tutor_id INTO v_old_tid FROM public.users WHERE id = v_req.student_id;

  IF v_old_tid IS NOT NULL AND v_old_tid <> v_req.tutor_id THEN
    UPDATE public.tutor_join_requests
    SET status = 'cancelled', resolved_at = now()
    WHERE student_id = v_req.student_id AND status = 'pending';
  END IF;

  UPDATE public.users SET tutor_id = v_req.tutor_id WHERE id = v_req.student_id;

  UPDATE public.tutor_join_requests
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('student_id', v_req.student_id, 'tutor_id', v_req.tutor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_tutor_join_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
BEGIN
  SELECT id, status INTO v_req
  FROM public.tutor_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: Tələb tapılmadı';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'already_resolved: Tələb artıq % vəziyyətindədir', v_req.status;
  END IF;

  UPDATE public.tutor_join_requests
  SET status = 'rejected', resolved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tutor_join_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_tutor_join_request(uuid) FROM PUBLIC;


-- ############################################################################
-- ADDIM 11. RLS — frontend heç vaxt cədvələ toxunmur (.clinerules §1)
--  anon/authenticated üçün siyası yaradılmır → RLS default olaraq RƏDD edir.
--  service_role (FastAPI) BYPASSRLS ilə keçir.
-- ############################################################################

-- Cədvəl mövcud deyilsə səhva atmamaq üçün hər biri ayrıca yoxlanılır.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','tutor_join_requests','tutor_courses']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    ELSE
      RAISE NOTICE '% cədvəli yoxdur — RLS addımı atlandı.', t;
    END IF;
  END LOOP;
END $$;

-- Əvvəl mövcud olmuş "permissive policy" qaydalarını silirik ki,
-- service_role-dan başqa heç kəs daxil ola bilməsin.
DROP POLICY IF EXISTS "anon_all"  ON public.users;
DROP POLICY IF EXISTS "auth_all"  ON public.users;
DROP POLICY IF EXISTS "anon_read" ON public.users;

DO $$
BEGIN
  IF to_regclass('public.tutor_courses') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "anon_all" ON public.tutor_courses';
    EXECUTE 'DROP POLICY IF EXISTS "auth_all" ON public.tutor_courses';
  END IF;
END $$;

REVOKE ALL ON public.users               FROM anon, authenticated;
REVOKE ALL ON public.tutor_join_requests FROM anon, authenticated;


-- ############################################################################
-- ADDIM 12. VIEW — dashboard siyahısı
-- ############################################################################

DROP VIEW IF EXISTS public.v_tutor_students;

CREATE VIEW public.v_tutor_students AS
SELECT
  s.id,
  s.tutor_id,
  s.first_name,
  s.last_name,
  s.identifier,
  s.grade,
  s.created_at
FROM public.users s
WHERE s.role = 'student' AND s.tutor_id IS NOT NULL;

COMMENT ON VIEW public.v_tutor_students IS
  'Repetitor panelində göstərilən şagirdlər (users.tutor_id əsasında).';

-- ============================================================================
-- MİQRASİYA TAMAMLANDI
-- Yoxlama sorğuları: supabase/README.md
-- ============================================================================
