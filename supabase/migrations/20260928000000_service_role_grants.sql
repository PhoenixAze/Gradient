-- ############################################################################
-- Gradient — service_role GRANT düzəlişi
-- Tarix: 2026-09-28
-- Problem: Render log xətası
--     ERROR: permission denied for table tutor_assignments
--     code: 42501, hint: GRANT SELECT ON public.tutor_assignments TO service_role
--
-- SƏBƏB NƏDİR (.clinerules §1 — Supabase İzolasiyası):
--   Bütün DB əməliyyatları yalnız FastAPI backend-i vasitəsilə,
--   supabase-py + SERVICE_ROLE açarı ilə aparılır. Frontend heç vaxt
--   cədvələ toxunmur (anon/authenticated üçün icazə YOXDUR).
--
--   Amma PostgreSQL-də icazə iki müstəqil qatdır:
--     1) RLS (Row Level Security)  — service_role BYPASSRLS ilə keçir ✔
--     2) GRANT (cədvəl icazələri)  — service_role-a ayrıca verilmalıdır ✘
--
--   Əvvəlki miqrasiya (20260101000000) cədvəlləri `postgres` rolu ilə yaradıb
--   və `REVOKE ... FROM anon, authenticated` etdi, lakin `service_role`-a GRANT
--   vermədi. Nəticədə RLS keçilsə belə, PostgREST icazə yoxdurluğu görə
--   42501 qaytarır. Cədvəl "yoxdur" deyil — sadəcə icazəsi yoxdur.
--
-- BU MİQRASİYA NƏ EDİR:
--   * Backend-in istifadə etdiyi BÜTÜN cədvəllərə service_role üçün GRANT
--   * RPC funksiyalarına (SECURITY DEFINER) icra icazəsi
--   * Təhlükəsizlik nəzarəti: anon/authenticated üçün icazə YOXDUR
--     (frontend yalnız FastAPI vasitəsilə əlaqə qurur)
--   * İdempotenttir: təkrar icra etmək təhlükəsizdir
--
-- NECƏ İCRA EDİLİR:
--   Supabase Dashboard → SQL Editor → bu faylın içindəkini yapışdır → Run
--   və ya:   psql "$SUPABASE_DB_URL" -f 20260928000000_service_role_grants.sql
-- ############################################################################

BEGIN;

-- ############################################################################
-- ADDIM 1. Backend-in istifadə etdiyi cədvəllərin siyahısı
-- (app/routers/*.py və app/core/*.py daxilindəki .table(...) çağırışlarından)
-- ############################################################################
-- users                 → auth, security, tutor, tutor_group, exams, users
-- exams                 → exams, analytics, tutor, tutor_group
-- exam_results          → exams, analytics, tutor, tutor_group
-- tutor_courses         → tutor
-- tutor_assignments     → tutor  (42501 səhvin mənbəyi)
-- student_answer_sheets → tutor
-- tutor_join_requests   → tutor_group
--
-- ⚠️ `tutor_requests`: app/routers/tutor.py bu cədvələ yazmağa çalışır,
--    lakin Supabase sxeminizdə O YOXDUR (mövcud olan: `tutor_join_requests`).
--    Bu, kod tərəfi problemdir və SQL ilə həll olunmur — bərabər yolda
--    `tutor.py` → `tutor_join_requests`/`tutor_group.py` axınına keçirilməlidir.
--    Aşağıdakı blok hələ də onu qoruyur: cədvəl sonradan yaradılsa,
--    icazə avtomatik verilmiş olacaq (bütün bloklar mövcudluq yoxlayır).

DO $$
DECLARE
  t text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'exams', 'exam_results', 'tutor_courses',
    'tutor_assignments', 'student_answer_sheets',
    'tutor_join_requests', 'tutor_requests'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing := array_append(missing, t);
    ELSE
      RAISE NOTICE '✓ % cədvəli mövcuddur', t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE WARNING 'Aşağıdakı cədvəllər yoxdur və GRANT tətbiq olunmadı: %', missing;
  END IF;
END $$;

-- ############################################################################
-- ADDIM 2. service_role-a tam icazə (SELECT/INSERT/UPDATE/DELETE/TRUNCATE)
--
-- TƏHLÜKƏSİZLİK İZAHI: Bu GRANT yalnız service_role-a verilir.
-- service_role açarı yalnız backend server env dəyişənində saxlanılır və
-- heç vaxt frontend-ə göndərilmənir (.clinerules §1 "Secrets").
-- ############################################################################
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'exams', 'exam_results', 'tutor_courses',
    'tutor_assignments', 'student_answer_sheets',
    'tutor_join_requests', 'tutor_requests'
  ]
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
-- ADDIM 3. Sequence icazələri
-- (INSERT zamanı nextval() çağırılır; icazə yoxdursa sequence xətası verir)
-- ############################################################################
-- QEYD: information_schema.sequences cədvəlində sütun adı `sequence_schema`-dır
-- (`table_schema` YOXDUR — əvvəlki versiya bu səhvlə 42703 atırdı).
-- Aşağıda sabit `pg_catalog` istifadə olunur: relkind = 'S' → SEQUENCE.
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
    RAISE NOTICE 'Sequence icazəsi verildi: public.%', s;
  END LOOP;
END $$;

-- ############################################################################
-- ADDIM 4. RPC funksiyalarına icra icazəsi
--
-- tutor_group.py bu funksiyaları `.rpc(...)` vasitəsilə çağırır:
--   submit_tutor_join_request
--   accept_tutor_join_request
--   reject_tutor_join_request
--
-- Bu funksiyalar SECURITY DEFINER olaraq yaradılıb, yəni cədvəl
-- icazələrini dəyişə bilməyən istifadəçi adından işləyirlər.
-- ############################################################################
-- DƏQİQ imzalar (20260101000000_tutor_group_system.sql ilə uyğunlaşdırılıb):
--   submit_tutor_join_request(uuid, text)
--   accept_tutor_join_request(uuid)
--   reject_tutor_join_request(uuid)
-- İmza AÇIQ yazılır — PostgreSQL-də GRANT-da parametr siyahısı mütləq
-- göstərilir; imzasız yazım funksiya adının şemada unikal olmasına görə
-- asılıdır və overload halında səhv funksiyaya icazə verə bilər.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'submit_tutor_join_request(uuid,text)',
    'accept_tutor_join_request(uuid)',
    'reject_tutor_join_request(uuid)'
  ]
  LOOP
    IF to_regprocedure('public.' || sig) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', sig);
      RAISE NOTICE 'GRANT EXECUTE verildi: public.%', sig;
    ELSE
      RAISE WARNING 'RPC funksiyası tapılmadı (miqrasiya 20260101 icra olunmamış ola bilər): public.%', sig;
    END IF;
  END LOOP;
END $$;

-- ############################################################################
-- ADDIM 5. TƏHLÜKƏSİZLİK NƏZARƏTİ — frontend heç vaxt cədvələ toxunmur
--
-- Bu, mühüm olan hissədir: icazəni service_role-ya VERDİK, amma
-- frontend-ə heç nə vermədiklə. Supabase JS SDK ilə anon/authenticated
-- rolları cədvəllərə daxil ola bilməz — cədvəl səviyyəsində RLS
-- policiesi yoxdur, yəni default olaraq RƏDD edilir.
-- ############################################################################
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'exams', 'exam_results', 'tutor_courses',
    'tutor_assignments', 'student_answer_sheets',
    'tutor_join_requests', 'tutor_requests'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- Frontend rollarına İCƏƏ YOXDUR
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      -- RLS aktiv olmalıdır: RLS olmayan cədvəldə GRANT yoxdursa
      -- "permission denied for table" xətası yaranır
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ############################################################################
-- ADDIM 6. İDEMPOTENT OLMAQ ÜÇÜN GƏLƏCƏK CƏDVƏLLƏR ÜÇÜN DEFAULT
--
-- Gələcəkdə yaradılacaq cədvəllər də avtomatik olaraq düzgün icazə alır.
-- Əks halda hər dəfə 42501 xətası təkrar edir.
-- ############################################################################
DO $$
BEGIN
  -- Supabase defoltları varsa onları gücləndiririk
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role');
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                 'GRANT USAGE, SELECT ON SEQUENCES TO service_role');
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                 'GRANT EXECUTE ON FUNCTIONS TO service_role');
  RAISE NOTICE '✓ Default privileges gücləndirildi (gələcək cədvəllər üçün)';
END $$;

COMMIT;

-- ############################################################################
-- YOXLAMA SORĞULARI
-- Bu miqrasiyanı icra etdikdən sonra aşağıdakıları yoxlayın:
-- ############################################################################

-- YOXLAMA 1 — Bütün cədvəllərdə service_role üçün icazə varmı?
-- Gözlənilən: hər cədvəl üçün 6 sətir (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES)
SELECT
  c.relname              AS "cədvəl",
  c.relrowsecurity       AS "rls_aktiv",
  has_table_privilege('service_role', 'public.' || c.relname, 'SELECT') AS "select_var",
  has_table_privilege('anon',          'public.' || c.relname, 'SELECT') AS "anon_select_var",
  has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT') AS "auth_select_var"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'users','exams','exam_results','tutor_courses','tutor_assignments',
    'student_answer_sheets','tutor_join_requests','tutor_requests'
  )
ORDER BY c.relname;

-- YOXLAMA 2 — RPC funksiyalarının icazəsi
SELECT
  p.proname            AS "funksiya",
  p.prosecdef          AS "security_definer",
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS "icra_edə_bilir"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'submit_tutor_join_request','accept_tutor_join_request','reject_tutor_join_request'
  );

-- ############################################################################
-- TƏHLÜKƏSİZLİK QEYDİ
-- Bu miqrasiya GRANT vermir — icazəni MÜHAYYİDƏ azaldır:
--   * service_role: BÜTÜN icazə (yalnız server tərəfdə, açarlar gizlidir)
--   * anon / authenticated: SIFIR icazə (frontend cədvələ toxunmur)
-- Beləliklə DB əlçatanlığı yalnız FastAPI backend vasitəsilədir —
-- .clinerules §1 "Supabase İzolasiyası" tələbi tam təmin olunur.
-- ############################################################################
