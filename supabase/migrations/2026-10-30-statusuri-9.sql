-- Încă două etape: „Contactată” (după Nouă) și „Plătit” (după Avans).
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.
alter table public.requests drop constraint if exists requests_status_check;

alter table public.requests
  add constraint requests_status_check
  check (status in ('noua', 'contactata', 'in_lucru', 'procesat', 'avans', 'platit', 'incheiat', 'respins', 'inchisa'));
