-- ==========================================================
-- Atelier Temelia — schema pentru cererile din formular.
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
  lang              text not null default 'ro' check (lang in ('ro', 'en')),
  status            text not null default 'noua'
                    check (status in ('noua', 'contactat', 'oferta', 'contract', 'refuzat')),
  status_updated_at timestamptz not null default now()
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

alter table public.requests  enable row level security;
alter table public.rate_hits enable row level security;
