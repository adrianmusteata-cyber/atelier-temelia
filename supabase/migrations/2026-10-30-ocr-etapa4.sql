-- Recunoașterea documentelor, Etapa 4: Catalog — furnizori, produse și prețuri din listele de prețuri.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.

create table if not exists public.suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  idno       text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_idno_key on public.suppliers (idno) where idno <> '';
create index if not exists suppliers_name_idx on public.suppliers (lower(name));

-- O listă de prețuri încărcată (documentul original e în documents.price_list_id)
create table if not exists public.price_lists (
  id          bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers (id) on delete cascade,
  list_date   date not null,
  currency    text not null check (currency in ('MDL', 'EUR')),
  rows_count  integer not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists price_lists_supplier_idx on public.price_lists (supplier_id, list_date desc);

-- Produsul cu prețul actual; last_list_id = ultima listă care i-a dat prețul actual
create table if not exists public.products (
  id           bigint generated always as identity primary key,
  supplier_id  bigint not null references public.suppliers (id) on delete cascade,
  code         text not null default '',
  name         text not null,
  unit         text not null default '',
  price        numeric(12, 2) not null check (price > 0),
  currency     text not null check (currency in ('MDL', 'EUR')),
  price_date   date not null,
  last_list_id bigint references public.price_lists (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists products_code_key on public.products (supplier_id, lower(code)) where code <> '';
create unique index if not exists products_name_key on public.products (supplier_id, lower(name)) where code = '';
create index if not exists products_name_idx on public.products (lower(name));

-- Istoricul prețurilor: un rând la fiecare import și la fiecare preț schimbat manual
create table if not exists public.price_history (
  id            bigint generated always as identity primary key,
  product_id    bigint not null references public.products (id) on delete cascade,
  price         numeric(12, 2) not null,
  currency      text not null,
  price_date    date not null,
  price_list_id bigint references public.price_lists (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists price_history_product_idx on public.price_history (product_id, price_date desc);

-- Documentele originale se pot lega și de o listă de prețuri
alter table public.documents add column if not exists price_list_id bigint references public.price_lists (id) on delete cascade;
alter table public.documents drop constraint if exists documents_one_owner;
alter table public.documents add constraint documents_one_owner
  check (num_nonnulls(request_id, expense_id, payable_id, receivable_group, price_list_id) = 1);
create index if not exists documents_price_list_idx on public.documents (price_list_id);

/* Importul unei liste de prețuri, totul sau nimic.
   p = { supplier_id | null, supplier_name, supplier_idno, list_date, currency, note,
         rows: [{ product_id | null, code, name, unit, price }] }
   Prețul actual se schimbă doar dacă lista e la fel de nouă sau mai nouă decât prețul actual;
   altfel prețul ajunge doar în istoric. Moneda nouă înlocuiește moneda produsului. */
create or replace function public.import_price_list(p jsonb)
returns jsonb language plpgsql as $$
declare
  sup_id  bigint := nullif(p->>'supplier_id', '')::bigint;
  d       date := (p->>'list_date')::date;
  cur     text := p->>'currency';
  list_id bigint;
  r       jsonb;
  prod    public.products;
  pid     bigint;
  v_price numeric;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_old int := 0;
begin
  if sup_id is null then
    -- Furnizor nou; dacă IDNO-ul există deja, se folosește furnizorul acela
    if coalesce(p->>'supplier_idno', '') <> '' then
      select id into sup_id from public.suppliers where idno = p->>'supplier_idno';
    end if;
    if sup_id is null then
      insert into public.suppliers (name, idno) values (p->>'supplier_name', coalesce(p->>'supplier_idno', '')) returning id into sup_id;
    end if;
  elsif not exists (select 1 from public.suppliers where id = sup_id) then
    raise exception 'notfound';
  end if;

  insert into public.price_lists (supplier_id, list_date, currency, rows_count, note)
  values (sup_id, d, cur, jsonb_array_length(p->'rows'), coalesce(p->>'note', ''))
  returning id into list_id;

  for r in select value from jsonb_array_elements(p->'rows') loop
    v_price := (r->>'price')::numeric;
    if coalesce(r->>'product_id', '') = '' then
      insert into public.products (supplier_id, code, name, unit, price, currency, price_date, last_list_id)
      values (sup_id, coalesce(r->>'code', ''), r->>'name', coalesce(r->>'unit', ''), v_price, cur, d, list_id)
      returning id into pid;
      n_new := n_new + 1;
    else
      select * into prod from public.products where id = (r->>'product_id')::bigint and supplier_id = sup_id for update;
      if not found then raise exception 'product % notfound', r->>'product_id'; end if;
      pid := prod.id;
      if d >= prod.price_date then
        if prod.price = v_price and prod.currency = cur then n_same := n_same + 1; else n_upd := n_upd + 1; end if;
        update public.products
           set price = v_price, currency = cur, price_date = d, last_list_id = list_id, updated_at = now(),
               unit = case when prod.unit = '' then coalesce(r->>'unit', '') else prod.unit end
         where id = pid;
      else
        n_old := n_old + 1;
      end if;
    end if;
    insert into public.price_history (product_id, price, currency, price_date, price_list_id)
    values (pid, v_price, cur, d, list_id);
  end loop;

  return jsonb_build_object('supplier_id', sup_id, 'price_list_id', list_id,
    'created', n_new, 'updated', n_upd, 'unchanged', n_same, 'older', n_old);
end $$;

-- Funcția se cheamă doar de pe server (cheia service_role)
revoke execute on function public.import_price_list(jsonb) from public, anon, authenticated;
grant execute on function public.import_price_list(jsonb) to service_role;

alter table public.suppliers     enable row level security;
alter table public.price_lists   enable row level security;
alter table public.products      enable row level security;
alter table public.price_history enable row level security;
