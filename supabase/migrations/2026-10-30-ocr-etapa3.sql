-- Recunoașterea documentelor, Etapa 3: Scadențe — „De plătit” (furnizori) și „De încasat” (clienți).
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.

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
