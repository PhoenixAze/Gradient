-- ============================================================================
-- DİAGNOSTİKA — miqrasiyanı icra etməmişdən ƏVVƏL bunu işlədin
-- Nəticələri yoxla; əgər "Problem" sütununda dəyər varsa, miqrasiyanın
-- müvafiq addımını əl ilə düzəlt və ya uyğunlaşdır.
-- ============================================================================

-- 1) Cədvəllər mövcuddurmu?
SELECT
  c.relname AS table_name,
  CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'mat.view' ELSE c.relkind::text END AS kind,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('users','tutor_courses','tutor_assignments','exams',
                    'exam_results','tutor_join_requests','student_answer_sheets')
ORDER BY c.relname;

-- 2) `users` cədvəlinin sütunları (tutor_code və tutor_id varmı?)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 3) `users` üzərində mövcud FK-lər (tutor_id FK-si varmı?)
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public' AND rel.relname = 'users' AND con.contype = 'f';

-- 4) `users` üzərində mövcud indekslər
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users';

-- 5) TƏKRAR `identifier` VARSA — UNIQUE indeks yaradıla bilməz!
SELECT identifier, count(*) AS cnt
FROM public.users
WHERE identifier IS NOT NULL
GROUP BY identifier
HAVING count(*) > 1;

-- 6) TƏKRAR `tutor_code` VARSA — UNIQUE indeks yaradıla bilməz
--    (cədvədə sütun yoxdursa bu sorğu xəta verəcək, ona görə əvvəlcə
--     aşağıdakı müdafiəli sorğunu işlədin)
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='tutor_code'
  ) THEN 'sütun mövcuddur' ELSE 'sütun YOXDUR' END AS tutor_code_status;

-- 7) Sıradan kənar `tutor_id` dəyərləri (FK əlavə olunmadan əvvəl təmizlənir)
--    ⚠️ `tutor_id` sütunu yoxdursa bu sorğu xəta verəcək — onda 2-ci sorğunun
--    nəticəsinə bax və 7-ci sorğunu atla.
SELECT count(*) AS dangling_tutor_id
FROM public.users u
WHERE u.tutor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users ref WHERE ref.id = u.tutor_id);

-- 8) Mövcud repetitorlar (trigger-dan əvvəl yarandılar, backfill lazımdır)
SELECT id, first_name, last_name, role, tutor_code
FROM public.users
WHERE role = 'tutor'
ORDER BY created_at;

-- 9) RLS vəziyyəti — "anon/authenticated" üçün açıq policy VARMı?
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 10) Backend əlçatan funksiyalar (təsdiq: RPC-lər mövcuddurmu?)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('gen_unique_tutor_code','assign_tutor_code',
                    'submit_tutor_join_request',
                    'accept_tutor_join_request','reject_tutor_join_request')
ORDER BY p.proname;
