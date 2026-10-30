-- 7 statusuri: Nouă, În lucru, Procesat, Avans, Încheiat, Respins, Închisă
-- + motivul respingerii (obligatoriu doar la „Respins”, verificat în api/admin/requests/[id].js).
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.
alter table public.requests drop constraint if exists requests_status_check;

alter table public.requests
  add constraint requests_status_check
  check (status in ('noua', 'in_lucru', 'procesat', 'avans', 'incheiat', 'respins', 'inchisa'));

alter table public.requests add column if not exists status_comment text not null default '';
