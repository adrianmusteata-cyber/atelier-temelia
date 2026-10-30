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

-- ==========================================================
-- Etapa 3: Scadențe (De plătit / De încasat). Identic cu migrations/2026-10-30-ocr-etapa3.sql
-- ==========================================================
-- Documentul de plătit (factură / contract primit)
create table if not exists public.payables (
  id            bigint generated always as identity primary key,
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

create table if not exists public.payable_items (
  id         bigint generated always as identity primary key,
  payable_id bigint not null references public.payables (id) on delete cascade,
  pos        smallint not null,
  name       text not null,
  code       text not null default '',
  unit       text not null default '',
  qty        numeric(14, 3),
  unit_price numeric(12, 2),
  line_total numeric(12, 2)
);
create index if not exists payable_items_payable_idx on public.payable_items (payable_id, pos);

-- Cheltuiala creată la plată păstrează legătura cu documentul de plătit
alter table public.expenses add column if not exists payable_id bigint references public.payables (id) on delete set null;

-- Ratele de plătit; o rată se plătește o singură dată
create table if not exists public.payable_installments (
  id          bigint generated always as identity primary key,
  payable_id  bigint not null references public.payables (id) on delete cascade,
  due_date    date not null,
  amount      numeric(12, 2) not null check (amount > 0),
  paid_on     date,
  paid_amount numeric(12, 2) check (paid_amount is null or paid_amount > 0),
  expense_id  bigint references public.expenses (id) on delete set null,
  check ((paid_on is null) = (paid_amount is null))
);
create index if not exists payable_installments_due_idx on public.payable_installments (due_date);
create index if not exists payable_installments_payable_idx on public.payable_installments (payable_id);

-- Ratele de încasat de la clienți (în moneda clientului); starea se calculează din plățile clientului
create table if not exists public.receivables (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  doc_number text not null default '',
  doc_date   date,
  due_date   date not null,
  amount     numeric(12, 2) not null check (amount > 0),
  note       text not null default '',
  group_id   uuid,
  created_at timestamptz not null default now()
);
create index if not exists receivables_request_idx on public.receivables (request_id, due_date);

-- Documentele originale se pot lega și de un document de plătit sau de un grup de rate de încasat
alter table public.documents add column if not exists payable_id bigint references public.payables (id) on delete cascade;
alter table public.documents add column if not exists receivable_group uuid;
alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(request_id, expense_id, payable_id, receivable_group) = 1);
create index if not exists documents_payable_idx on public.documents (payable_id);
create index if not exists documents_receivable_idx on public.documents (receivable_group);

-- Plata unei rate: rata devine plătită și se creează cheltuiala, totul sau nimic
create or replace function public.pay_installment(p_id bigint, p_paid_on date, p_amount numeric)
returns bigint language plpgsql as $$
declare
  i public.payable_installments;
  p public.payables;
  n int;
  share numeric;
  exp_id bigint;
begin
  select * into i from public.payable_installments where id = p_id for update;
  if not found then raise exception 'notfound'; end if;
  if i.paid_on is not null then raise exception 'already_paid'; end if;
  select * into p from public.payables where id = i.payable_id;
  select count(*) into n from public.payable_installments where payable_id = p.id;
  share := p_amount / p.amount_total;
  insert into public.expenses (source, supplier, supplier_idno, doc_number, doc_date, currency, amount_net, vat, amount_total, category, note, payable_id)
  values ('de_platit', p.supplier, p.supplier_idno, p.doc_number, p_paid_on, p.currency,
          case when p.amount_net is null then null else round(p.amount_net * share, 2) end,
          round(p.vat * share, 2), p_amount, p.category, p.note, p.id)
  returning id into exp_id;
  -- Articolele se copiază doar când documentul are o singură rată
  if n = 1 then
    insert into public.expense_items (expense_id, pos, name, code, unit, qty, unit_price, line_total)
    select exp_id, pos, name, code, unit, qty, unit_price, line_total from public.payable_items where payable_id = p.id;
  end if;
  update public.payable_installments set paid_on = p_paid_on, paid_amount = p_amount, expense_id = exp_id where id = p_id;
  return exp_id;
end $$;

-- Anularea plății: rata redevine neplătită, cheltuiala creată automat se șterge
create or replace function public.unpay_installment(p_id bigint)
returns void language plpgsql as $$
declare
  i public.payable_installments;
begin
  select * into i from public.payable_installments where id = p_id for update;
  if not found then raise exception 'notfound'; end if;
  update public.payable_installments set paid_on = null, paid_amount = null, expense_id = null where id = p_id;
  if i.expense_id is not null then delete from public.expenses where id = i.expense_id; end if;
end $$;

-- Funcțiile se cheamă doar de pe server (cheia service_role)
revoke execute on function public.pay_installment(bigint, date, numeric) from public, anon, authenticated;
revoke execute on function public.unpay_installment(bigint) from public, anon, authenticated;
grant execute on function public.pay_installment(bigint, date, numeric), public.unpay_installment(bigint) to service_role;

alter table public.payables             enable row level security;
alter table public.payable_items        enable row level security;
alter table public.payable_installments enable row level security;
alter table public.receivables          enable row level security;
