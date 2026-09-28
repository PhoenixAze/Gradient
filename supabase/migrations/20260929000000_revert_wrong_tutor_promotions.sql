-- ############################################################################
-- Gradient — Səhv yüksəldilmiş şagirdlərin təmizi + tutor kodunun UNİKALLIĞI
-- Tarix: 2026-09-28
--
-- PROBLEM
--   `tutor.py` daxilindəki `_ensure_tutor_role()` funksiyası repetitor
--   endpoint-lərinin 17-də çağırılır və rolu 'student' olan istifadəçiyə
--   avtomatik olaraq 'tutor' rolu VERİRDİ. Nəticə:
--     * Şagird DB-də repetitor kimi qeydə alındı (privilege escalation)
--     * Şagirdə 4 rəqəmli sistem kodu verildi
--     * Həmin kod əsl repetitorun kodu ilə KONFLİKT yaratdı
--     * Şagird "Öz kodunuzu daxil edə bilməzsiniz" xətası alırdı
--
--   Bundan əlavə, kod generatoru `crc32(id) % 9000 + 1000` idi:
--   təsadüfi DEYİL, yalnız 9000 dəyər, unikal yoxlaması YOX.
--
-- BU MİQRASİYA NƏ EDİR
--   1) Səhv yüksəldilmiş hesabları MÜŞAHİDƏ EDİR (hesabat üçün snapshot)
--   2) Yalnız həmin hesabları 'student' roluna qaytarır və kodlarını silir
--   3) Real repetitorlar arasındakı təkrarlanan kodları yoxdur
--   4) tutor_code üzərində UNIQUE indeks qurur (DB səviyyəsində müdafiə)
--
-- TƏHLÜKƏSİZLİK (.clinerules §1)
--   Rol heç vaxt istifadəçi sorğusu ilə dəyişdirilmir. Rol yalnız
--   `POST /api/v1/auth/register` zamanı "Mən repetitoram" seçimi ilə
--   təyin olunur (backend + frontend kodu bu icra etdiyi üçün uyğundur).
--
-- NECƏ İCRA EDİLİR
--   Supabase Dashboard → SQL Editor → Run
--
--   ⚠️ ƏVVƏLCƏ YALNIZ ADDIM 1-İ İCRА EDİN və nəticəni yoxlayın.
--      Sonra ADDIM 2-ni icra edin.
-- ############################################################################


-- ############################################################################
-- ADDIM 1 (ƏVVƏLCƏ BU: yalnız hesabat) — şübhəli hesabların siyahısı
--
-- Aşağıdakı şərtləri ALLIQLA ÖZÜNÜ TƏSDİQLƏYƏN hesablar göstərilir:
--   * rolu 'tutor'dir
--   * heç bir şagirdi YOXDUR (users.tutor_id)
--   * heç bir kursu YOXDUR
--   * heç bir tapşırığı YOXDUR
--   * heç bir qoşulma istəyi ALMAMIB
-- Yəni bu hesablar əsl repetitor deyil — qeydiyyat "Mən repetitoram"
-- seçimi ilə deyil, səhv funksiyanın təsiri ilə yüksəldilmiş şagirdlərdir.
-- ############################################################################

SELECT
  u.id,
  u.identifier,
  u.first_name,
  u.last_name,
  u.tutor_code,
  u.created_at,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
      THEN 'kursu var'
    WHEN EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
      THEN 'tapşırığı var'
    WHEN EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
      THEN 'şagirdi var'
    WHEN EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id)
      THEN 'istək alıb'
    ELSE 'şübhəli: heç bir iz yoxdur'
  END AS "səbəb"
FROM public.users u
WHERE u.role = 'tutor'
  AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id)
ORDER BY u.created_at;


-- ############################################################################
-- ADDIM 2 (TƏSDİQLƏNDİKDƏN SONRA BU) — təmizlik + unikal kod
-- ############################################################################

BEGIN;

-- 2.1) Təmizlənəcək hesabların snapshot-ı
CREATE TEMP TABLE _promoted_students ON COMMIT DROP AS
SELECT u.id, u.identifier, u.tutor_code
FROM public.users u
WHERE u.role = 'tutor'
  AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id);

RAISE NOTICE 'Təmizlənəcək hesab sayı: %', (SELECT count(*) FROM _promoted_students);

-- 2.2) Rolu geri qaytar və KODU SİL (kod şagirddə yerdə tapılmamalıdır)
UPDATE public.users u
SET role = 'student',
    tutor_code = NULL
FROM _promoted_students p
WHERE u.id = p.id;

RAISE NOTICE 'Rol "student" və tutor_code NULL edilən hesab sayı: %',
  (SELECT count(*) FROM public.users u JOIN _promoted_students p ON p.id = u.id
   WHERE u.role = 'student' AND u.tutor_code IS NULL);

-- 2.3) KONFLİKT YOXDURMA — real repetitorlar arasında təkrarlanan kodlar
--      Ən köhnə sətir öz kodunu saxlayır, qalanlarına YENİ unikal kod verilir.
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
    RAISE NOTICE 'Konklik həll edildi: user_id=% → yeni kod %', dup_row.id, new_code;
  END LOOP;
END $$;

-- 2.4) DB SƏVİYYƏSİNDƏ MÜDAFİƏ — eyni kodu iki repetitor ala bilməz
--      (race condition halında da təhlükəsizlik qorunur)
CREATE UNIQUE INDEX IF NOT EXISTS users_tutor_code_unique
  ON public.users (tutor_code)
  WHERE tutor_code IS NOT NULL;

COMMENT ON INDEX public.users_tutor_code_unique IS
  'Repetitor sistem kodları unikal olmalıdır — iki repetitor eyni kodu '
  'almamalıdır, çünki şagird YANLIŞ qrupa daxil ola bilər.';

COMMIT;

-- ############################################################################
-- YOXLAMA
-- ############################################################################

-- 1) Hələ də "suspicious" hesab varmı? (0 olmalıdır)
SELECT count(*) AS "qalan_suspekt_hesab"
FROM public.users u
WHERE u.role = 'tutor'
  AND NOT EXISTS (SELECT 1 FROM public.users s WHERE s.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_courses c WHERE c.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_assignments a WHERE a.tutor_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.tutor_join_requests r WHERE r.tutor_id = u.id);

-- 2) Təkrarlanan kod varmı? (0 sətir olmalıdır)
SELECT tutor_code, count(*) AS "say"
FROM public.users
WHERE role = 'tutor' AND tutor_code IS NOT NULL
GROUP BY tutor_code
HAVING count(*) > 1;

-- 3) UNIQUE indeks mövcuddurmu?
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'users'
  AND indexname = 'users_tutor_code_unique';

-- 4) Bütün repetitorların kodu varmı?
SELECT id, identifier, first_name, last_name, tutor_code
FROM public.users
WHERE role = 'tutor'
ORDER BY tutor_code;

-- ############################################################################
-- QEYD
-- Əgər 1-ci yoxlama 0-dan böyükdürsə, həmin hesablar əsl repetitordur
-- (yeni qeydiyyat olub, hələ işə başlamayıb). Onları RUMLA düzəltməyin —
-- aşağıdakı əməliyyatı konkret id ilə edin:
--
--   UPDATE public.users SET tutor_code = NULL WHERE id = '<ID>';
--
-- Əgər bir hesabı əsl repetitor olmaqdan çıxarmaq lazımdırsa:
--
--   UPDATE public.users SET role = 'student', tutor_code = NULL
--   WHERE id = '<ID>';
-- ############################################################################
