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
  source            text not null default 'site'
                    constraint requests_source_check check (source in ('site', 'manual', 'carte_vizita', 'chestionar', 'document')),
  channel           text not null default '' check (channel in ('', 'apel', 'intalnire')),  -- doar la „manual”
  notes             text not null default '',   -- notele interne din CRM
  contract_value    numeric(12, 2) check (contract_value is null or contract_value >= 0),
  currency          text not null default 'MDL' check (currency in ('MDL', 'EUR')),
  -- Telefonul poate lipsi (carte de vizită doar cu email), dar nu ambele
  constraint requests_phone_or_email check (phone <> '' or email <> '')
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

-- Originalele documentelor recunoscute de Claude (poze / PDF în Storage, bucketul privat „documente”)
create table if not exists public.documents (
  id         bigint generated always as identity primary key,
  doc_type   text not null check (doc_type in ('carte_vizita', 'chestionar', 'aviz', 'chitanta', 'de_platit', 'de_incasat', 'lista_preturi')),
  request_id uuid references public.requests (id) on delete cascade,
  expense_id bigint,               -- legătura cu o cheltuială (Etapa 2); cheia externă e adăugată după tabelul expenses
  page       smallint not null default 1,
  path       text not null,
  mime       text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  constraint documents_one_owner check (num_nonnulls(request_id, expense_id) = 1)
);

create index if not exists documents_request_idx on public.documents (request_id);

insert into storage.buckets (id, name, public) values ('documente', 'documente', false)
on conflict (id) do nothing;

-- Cheltuielile (Etapa 2) și articolele lor
create table if not exists public.expenses (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('aviz', 'chitanta', 'manual', 'de_platit')),
  supplier      text not null,
  supplier_idno text not null default '',
  doc_number    text not null default '',
  doc_date      date not null,
  currency      text not null default 'MDL' check (currency in ('MDL', 'EUR')),
  amount_net    numeric(12, 2) check (amount_net is null or amount_net >= 0),
  vat           numeric(12, 2) not null default 0 check (vat >= 0),
  amount_total  numeric(12, 2) not null check (amount_total > 0),
  category      text not null check (category in ('materiale', 'echipamente', 'software', 'transport', 'chirie', 'subcontractori', 'birou', 'taxe', 'altele')),
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (doc_date desc);
create index if not exists expenses_dup_idx on public.expenses (lower(supplier), doc_number, doc_date);

-- Rândurile cu articole ale unei cheltuieli
create table if not exists public.expense_items (
  id         bigint generated always as identity primary key,
  expense_id bigint not null references public.expenses (id) on delete cascade,
  pos        smallint not null,
  name       text not null,
  code       text not null default '',
  unit       text not null default '',
  qty        numeric(14, 3),
  unit_price numeric(12, 2),
  line_total numeric(12, 2)
);

create index if not exists expense_items_expense_idx on public.expense_items (expense_id, pos);

alter table public.documents drop constraint if exists documents_expense_id_fkey;
alter table public.documents add constraint documents_expense_id_fkey foreign key (expense_id) references public.expenses (id) on delete cascade;
create index if not exists documents_expense_idx on public.documents (expense_id);

alter table public.expenses       enable row level security;
alter table public.expense_items  enable row level security;
alter table public.documents      enable row level security;
alter table public.payments       enable row level security;
alter table public.requests       enable row level security;
alter table public.rate_hits      enable row level security;
alter table public.status_history enable row level security;
