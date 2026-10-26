-- Trecere de la 5 statusuri la 3 (cerința temei: новая / в работе / закрыта).
-- contactat, oferta → in_lucru; contract, refuzat → inchisa. Rulat o singură dată în Supabase.
alter table public.requests drop constraint if exists requests_status_check;

update public.requests
set status = case
  when status in ('contactat', 'oferta') then 'in_lucru'
  when status in ('contract', 'refuzat') then 'inchisa'
  else status
end
where status not in ('noua', 'in_lucru', 'inchisa');

alter table public.requests
  add constraint requests_status_check check (status in ('noua', 'in_lucru', 'inchisa'));
