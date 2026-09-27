# Supabase — Miqrasiya və Diaqnostika

Bu qovluq repetitor qrup sisteminin (4 rəqəmli kod + qurmaq) cədvəl
dəyişikliklərini saxlayır. Bütün SQL `public` sxemasına aiddir və
**yalnız `service_role` açarı ilə** (FastAPI) icra olunur — frontend heç vaxt
Supabase SDK ilə cədvələ toxunmur (`.clinerules` §1 "Supabase İzolasiyası").

## Vacib: iki addımlı icra

### ADDIM 1 — Diaqnostika (icra etməmişdən əvvəl)
[`diagnostics.sql`](diagnostics.sql) faylını SQL Editor-da işlədin və
nəticələri yoxlayın. Bu, hazırkı sxemin miqrasiyadakı fərqlərini aşkarlayır.

**Dayanmalı əsas nöqtələr:**

| Sorğu | Problem | Həll |
| --- | --- | --- |
| 2 | `tutor_code` sütunu YOXDUR | Normaldır — miqrasiya əlavə edir |
| 2 | `tutor_id` sütunu yoxdur | Miqrasiyanı dayandırın və məlumat verin |
| 5 | `identifier` təkrarları | **UNIQUE indeks yaradıla bilməz.** Əvvəlcə təkrar sətirləri təmizləyin |
| 7 | `dangling_tutor_id > 0` | Miqrasiya avtomatik `NULL`-ləyir, amma nəticəni yoxlayın |
| 9 | `anon`/`authenticated` üçün açıq policy | Miqrasiya onları `DROP` edir |

### ADDIM 2 — Miqrasiya
[`migrations/20260101000000_tutor_group_system.sql`](migrations/20260101000000_tutor_group_system.sql)
faylının **bütün mətnini** SQL Editor-a yapışdırıb **Run** edin.

> Faylda xarici `BEGIN/COMMIT` **yoxdur** — addımlar bir-birindən müstəqildir.
> Bir addım uğursuz olsa, digərləri icra olunmağa davam edir və faylı
> **təkrar icra etmək təhlükəsizdir** (bütün operatorlar idempotentdir:
> `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, `CREATE OR REPLACE`).

**Uğurlu icra əlamətləri (SQL log-da görünəcək):**
- `NOTICE: Preflight OK: users tapıldı, tutor_courses = ...`
- Əgər `identifier` təkrarları varsa: `WARNING: idx_users_identifier UNIQUE yaradılmadı: N təkrarlı dəyər var` — bu xəta deyil, xəbərdarlıqdır.
- Sonunda heç bir `ERROR` yoxdur.

## Əvvəlki (v1) versiyada düzəldilmiş səhvlər

| Səhv | Risk | Düzəliş |
| --- | --- | --- |
| FK əlavə etmək üçün `DELETE FROM public.users` | **Məlumat itkisi** — sıradan kənar FK-ləri olan şagirdlər silinirdi | İndi `UPDATE ... SET tutor_id = NULL` (məlumat qorunur) |
| Bütün fayl `BEGIN/COMMIT` içində | Bir səhv **bütün** miqrasiyanı geri qaytarırdı | Xarici tranzaksiya silindi, addımlar müstəqildir |
| `identifier` üzərində həmişə `CREATE UNIQUE INDEX` | Təkrarlar varsa **xəta** | Əvvəlcə təkrar yoxlanılır; varsa adi index + `WARNING` |
| Trigger funksiyası trigger-dan **sonra** yaradılırdı, amma `UPDATE` ondan əvvəl çağırılırdı | `function does not exist` xətası | `gen_unique_tutor_code()` trigger-dan əvvəl yaradılır |
| Trigger `INSERT OR UPDATE OF role, tutor_code` | UPDATE-də `tutor_code` özü dəyişəndə sonsuz dövrə riski | Yalnız `BEFORE INSERT`; mövcud sətirlər üçün ayrıca backfill addımı |
| `SET search_path = public` | `pg_temp` zəiflədilmə riski | `SET search_path = public, pg_temp` |
| `RAISE EXCEPTION` formatında `%` dəyəri | Unikal trigger dəyəri formatlaşdırmada xəta verirdi | `%` yerinə düzgün dəyişən keçirildi |
| `tutor_courses` yoxdursa | "relation does not exist" | `to_regclass()` ilə qorunur, `NOTICE` atılır |

## Nəyi həll edir

| Problem | Həll |
| --- | --- |
| 4 rəqəmli kod yoxdur / `----` göstərilir | `users.tutor_code` + `trg_users_assign_tutor_code` trigger-i + UNIQUE index |
| Şagird əlavə edildikdən sonra yoxa çıxır | `users.tutor_id` üçün FK + partial index; əlaqə bazada saxlanılır |
| Qrupa qoşulma istəkləri üçün cədvəl yoxdur | `tutor_join_requests` (status, UNIQUE, indekslər, RLS) |
| İstək qəbul/rədd yarışma yarada bilər | `accept_/reject_tutor_join_request` RPC-ləri (`FOR UPDATE`) |
| Bir şagird bir neçə repetitora eyni anda "pending" ola bilərdi | `submit_tutor_join_request` RPC + `idx_tjr_one_pending` partial UNIQUE index |
| Cədvələ birbaşa giriş riski | RLS aktiv + `anon`/`authenticated` rollarından `REVOKE` |

## 4 rəqəmli kod qaydaları

* Format: `^[0-9]{4}$` (CHECK constraint)
* Aralıq: `1000–9999` — ön sıfır yazılmır ("0087" ≠ "87" qarışıqlığının qarşısı)
* Unikal: `idx_users_tutor_code` UNIQUE (NULL istisnadır)
* Yalnız `role = 'tutor'` sətrində generasiya olunur (`BEFORE INSERT`)
* Profil yeniləmə endpoint-i kodu dəyişməyə icazə vermir → kod yalnız sistem tərəfindən dəyişir

## Miqrasiyadan sonra yoxlama

```sql
-- 1) Bütün repetitorların kodu varmı? (NULL qaytarmamalıdır)
SELECT count(*) FILTER (WHERE tutor_code IS NULL) AS missing_code,
       count(*) AS total
FROM public.users WHERE role = 'tutor';

-- 2) Təkrarlı kod varmı? (boş OLMALIDIR)
SELECT tutor_code, count(*) FROM public.users
WHERE tutor_code IS NOT NULL GROUP BY tutor_code HAVING count(*) > 1;

-- 3) FK işləyirmi? (sıradan kənar dəyər boş OLMALIDIR)
SELECT count(*) AS dangling FROM public.users u
WHERE u.tutor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users t WHERE t.id = u.tutor_id);

-- 4) RLS aktivdirmi?
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename IN ('users','tutor_join_requests','tutor_courses');

-- 5) RPC-lər yaradıldıqmı? (5 sətir gözlənilir)
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname LIKE '%tutor%';
```

## Sonrakı addım

Miqrasiya icra edildikdən sonra backend tərəfdə
[`docs/backend/tutor_group.py`](../docs/backend/tutor_group.py) modulunu
yerləşdirib `main.py`-ə qeyd etmək lazımdır — o, `tutor_code`-u dashboard
cavabında qaytarır və `users.tutor_id` əlaqəsini yazır.
