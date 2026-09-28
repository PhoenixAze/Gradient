-- ############################################################################
-- Gradient — Səhv yüksəldilmiş şagirdlərin təmizi + tutor kodunun UNİKALLIĞI
-- Tarix: 2026-09-28
--
-- NECƏ İCRA EDİLİR (Supabase Dashboard → SQL Editor)
--   1-ci blok = YALNIZ HESABAT (heç nəyi dəyişmir) → Run → nəticəni oxu
--   2-ci blok = TƏMİZLİK → hesabatı təsdiqlədinsə → Run
--
-- QEYD: Bu faylda `RAISE NOTICE` yalnız DO $$ ... $$ bloklarının içində
-- istifadə olunur. Əsas skriptdə RAISE yazılmır, çünki o, yalnız
-- PL/pgSQL məntiqi daxilində etibarlıdır (səhv 42601).
-- Hesabat nəticələri üçün SELECT istifadə olunur ki, SQL Editor-də
-- "Results" bölməsində görünsün.
-- ############################################################################


-- ############################################################################
-- 1-Cİ BLOK — YALNIZ HESABAT. HEÇ NƏ DƏYİŞMİR.
--
-- Aşağıdakı şərtləri ALLIQLA ÖZÜNÜ TƏSDİQLƏYƏN hesablar göstərilir:
--   * rolu 'tutor'dir
--   * heç bir şagirdi, kursu, tapşırığı YOXDUR
--   * heç bir qoşulma istəyi ALMAMIB
-- Yəni bu hesablar əsl repetitor deyil — "Mən repetitoram" seçimi ilə deyil,
-- səhv funksiyanın təsiri ilə yüksəldilmiş şagirdlərdir.
-- ############################################################################

SELECT
  u.id,
  u.identifier,
  u.first_name,
  u.last_name,
  u.tutor_code,
  u.created_at
FROM public.users u
WHERE u.role = 'tutor'
  AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id)
ORDER BY u.created_at;


-- ############################################################################
-- 2-Cİ BLOK — TƏMİZLİK
-- YALNIZ 1-ci blokun nəticəsini yoxlayıb TƏSDİQLƏNDİKDƏN SONRA icra edin.
-- ############################################################################

BEGIN;

-- 2.1) Təmizlənəcək hesabların siyahısını müvəqqəti cədvəlda saxla
CREATE TEMP TABLE _promoted_students ON COMMIT DROP AS
SELECT u.id
FROM public.users u
WHERE u.role = 'tutor'
  AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id);

-- 2.2) Rolu geri qaytar (student) və sistem kodunu SİL
--      Kod şagirddə yerdə tapınmamalıdır — o, yalnız repetitorlara aiddir.
UPDATE public.users u
SET role = 'student',
    tutor_code = NULL
FROM _promoted_students p
WHERE u.id = p.id;

-- 2.3) Real repetitorlar arasında TƏKRARLANAN kodları yoxdur
--      Ən köhnə sətir öz kodunu saxlayır, qalanlarına yeni unikal kod verilir.
DO $$
DECLARE
  dup_row record;
  new_code text;
BEGIN
  FOR dup_row IN
    SELECT id FROM (
      SELECT id, tutor_code,
             row_number() OVER (PARTITION BY tutor_code ORDER BY created_at, id) AS rn
      FROM public.users
      WHERE role = 'tutor' AND tutor_code IS NOT NULL
    ) d
    WHERE d.rn > 1
  LOOP
    LOOP
      new_code := (1000 + floor(random() * 9000))::int::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.users x
        WHERE x.tutor_code = new_code AND x.role = 'tutor'
      );
    END LOOP;

    UPDATE public.users SET tutor_code = new_code WHERE id = dup_row.id;
  END LOOP;
END $$;

-- 2.4) DB SƏVİYYƏSİNDƏ MÜDAFİƏ — eyni kodu iki repetitor ala bilməz
--      (bərabər vaxtlı sorğular/race condition halında da qorunur)
CREATE UNIQUE INDEX IF NOT EXISTS users_tutor_code_unique
  ON public.users (tutor_code)
  WHERE tutor_code IS NOT NULL;

COMMENT ON INDEX public.users_tutor_code_unique IS
  'Repetitor sistem kodları unikal olmalıdır — iki repetitor eyni kodu '
  'almamalıdır, çünki şagird yanlış qrupa daxil ola bilər.';

COMMIT;


-- ############################################################################
-- 3-CÜ BLOK — YOXLAMA
-- 1) qalan_suspekt_hesab = 0 olmalıdır
-- 2) təkrarlanan kod = sətir olmamalıdır
-- 3) UNIQUE indeks mövcud olmalıdır
-- ############################################################################

SELECT
  (SELECT count(*) FROM public.users u
    WHERE u.role = 'tutor'
      AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id)
  ) AS "1_qalan_suspekt_hesab_0_olmali",

  (SELECT count(*) FROM (
     SELECT tutor_code FROM public.users
     WHERE role = 'tutor' AND tutor_code IS NOT NULL
     GROUP BY tutor_code HAVING count(*) > 1
   ) d
  ) AS "2_tekrar_kod_0_olmali",

  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'users'
       AND indexname = 'users_tutor_code_unique'
  ) AS "3_unique_indeks_1_olmali";

-- 4) Bütün repetitorlar və onların kodları
SELECT id, identifier, first_name, last_name, tutor_code
FROM public.users
WHERE role = 'tutor'
ORDER BY tutor_code;

-- 5) Şagirdlərdən qalıq sistem kodu var? (heç bir sətir olmamalıdır)
SELECT id, identifier, role, tutor_code
FROM public.users
WHERE tutor_code IS NOT NULL AND role <> 'tutor';
