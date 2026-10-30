-- CRM: sursa clientului (site / manual), note și istoricul trecerilor între etape.
-- Istoricul îl scrie baza de date singură (trigger), la creare și la fiecare schimbare de etapă.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.
alter table public.requests
  add column if not exists source text not null default 'site' check (source in ('site', 'manual'));

alter table public.requests add column if not exists notes text not null default '';

create table if not exists public.status_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.requests (id) on delete cascade,
  from_status text,                      -- null = clientul a fost creat direct în această etapă
  to_status   text not null,
  comment     text not null default '',  -- motivul, la „respins”
  at          timestamptz not null default now()
);

create index if not exists status_history_request_idx on public.status_history (request_id, at);
alter table public.status_history enable row level security;

create or replace function public.log_status_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.status_history (request_id, from_status, to_status, comment, at)
    values (new.id, null, new.status, new.status_comment, new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_history (request_id, from_status, to_status, comment, at)
    values (new.id, old.status, new.status, new.status_comment, new.status_updated_at);
  end if;
  return new;
end $$;

drop trigger if exists requests_status_log on public.requests;
create trigger requests_status_log
  after insert or update of status on public.requests
  for each row execute function public.log_status_change();

-- Cererile vechi: crearea (ca „Nouă”) și, dacă e cazul, ultima schimbare cunoscută
insert into public.status_history (request_id, from_status, to_status, comment, at)
select id, null, 'noua', '', created_at from public.requests r
where not exists (select 1 from public.status_history h where h.request_id = r.id);

insert into public.status_history (request_id, from_status, to_status, comment, at)
select id, 'noua', status, status_comment, status_updated_at from public.requests r
where status <> 'noua'
  and (select count(*) from public.status_history h where h.request_id = r.id) = 1;
