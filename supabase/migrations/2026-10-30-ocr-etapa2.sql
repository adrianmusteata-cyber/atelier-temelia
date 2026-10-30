-- Recunoașterea documentelor, Etapa 2: cheltuieli (avize, chitanțe, manual) și raportul financiar.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.

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

-- Documentul original poate fi legat și de o cheltuială (exact una dintre legături)
alter table public.documents add column if not exists expense_id bigint references public.expenses (id) on delete cascade;
alter table public.documents drop constraint if exists documents_request_id_check;
alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner check (num_nonnulls(request_id, expense_id) = 1);
create index if not exists documents_expense_idx on public.documents (expense_id);

alter table public.expenses      enable row level security;
alter table public.expense_items enable row level security;
