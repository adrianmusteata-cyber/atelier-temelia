-- ==========================================================
-- LUXARCH (fost Atelier Temelia) — schema pentru cererile din formular.
-- Se rulează o singură dată în Supabase: SQL Editor → New query → Run.
-- Accesul se face doar de pe server (cheia service_role); RLS e activat
-- fără nicio politică, deci tabelele nu pot fi citite din browser.
-- ==========================================================

create table if not exists public.requests (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  name              text not null,
  phone             text not null,
  email             text not null,
  type              text not null,
  service           text not null,
  message           text not null default '',
  lang              text not null default 'ro' check (lang in ('ro', 'ru', 'en')),
  status            text not null default 'noua'
                    check (status in ('noua', 'contactata', 'in_lucru', 'procesat', 'avans', 'platit', 'incheiat', 'respins', 'inchisa')),
  status_comment    text not null default '',   -- motivul, obligatoriu la „respins”
  status_updated_at timestamptz not null default now(),
  source            text not null default 'site' check (source in ('site', 'manual')),
  channel           text not null default '' check (channel in ('', 'apel', 'intalnire')),  -- doar la „manual”
  notes             text not null default '',   -- notele interne din CRM
  contract_value    numeric(12, 2) check (contract_value is null or contract_value >= 0),
  currency          text not null default 'MDL' check (currency in ('MDL', 'EUR'))
);

create index if not exists requests_created_at_idx on public.requests (created_at desc);
create index if not exists requests_status_idx on public.requests (status, created_at desc);

-- Contor pentru limite (5 cereri/oră, 5 parole greșite/15 min). Nu păstrează IP-ul în clar.
create table if not exists public.rate_hits (
  id   bigint generated always as identity primary key,
  key  text not null,
  at   timestamptz not null default now()
);

create index if not exists rate_hits_key_at_idx on public.rate_hits (key, at desc);

-- Istoricul trecerilor între etape, scris de trigger la creare și la fiecare schimbare de etapă
create table if not exists public.status_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.requests (id) on delete cascade,
  from_status text,                      -- null = clientul a fost creat direct în această etapă
  to_status   text not null,
  comment     text not null default '',
  at          timestamptz not null default now()
);

create index if not exists status_history_request_idx on public.status_history (request_id, at);

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

-- Plățile primite de la client, în moneda clientului
create table if not exists public.payments (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  paid_on    date not null,
  amount     numeric(12, 2) not null check (amount > 0),
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payments_request_idx on public.payments (request_id, paid_on);

alter table public.payments       enable row level security;
alter table public.requests       enable row level security;
alter table public.rate_hits      enable row level security;
alter table public.status_history enable row level security;
