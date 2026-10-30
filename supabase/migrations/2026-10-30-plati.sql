-- Plăți: valoarea contractului și moneda la fiecare client, plus plățile primite.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.
alter table public.requests
  add column if not exists contract_value numeric(12, 2) check (contract_value is null or contract_value >= 0);

alter table public.requests
  add column if not exists currency text not null default 'MDL' check (currency in ('MDL', 'EUR'));

create table if not exists public.payments (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  paid_on    date not null,
  amount     numeric(12, 2) not null check (amount > 0),
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payments_request_idx on public.payments (request_id, paid_on);
alter table public.payments enable row level security;
