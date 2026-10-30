-- Recunoașterea documentelor, Etapa 1: cărți de vizită și chestionare → CRM.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.

-- Surse noi pentru clienți: carte de vizită, chestionar, document (pentru Etapa 3)
alter table public.requests drop constraint if exists requests_source_check;
alter table public.requests add constraint requests_source_check
  check (source in ('site', 'manual', 'carte_vizita', 'chestionar', 'document'));

-- Telefonul poate lipsi (carte de vizită doar cu email), dar nu ambele
alter table public.requests drop constraint if exists requests_phone_or_email;
alter table public.requests add constraint requests_phone_or_email
  check (phone <> '' or email <> '');

-- Originalele documentelor (pozele / PDF-ul), legate de înregistrarea creată din ele
create table if not exists public.documents (
  id         bigint generated always as identity primary key,
  doc_type   text not null check (doc_type in ('carte_vizita', 'chestionar', 'aviz', 'chitanta', 'de_platit', 'de_incasat', 'lista_preturi')),
  request_id uuid references public.requests (id) on delete cascade,
  page       smallint not null default 1,
  path       text not null,
  mime       text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  check (request_id is not null)
);

create index if not exists documents_request_idx on public.documents (request_id);
alter table public.documents enable row level security;

-- Dosarul privat pentru fișiere; fără politici: accesul doar de pe server
insert into storage.buckets (id, name, public) values ('documente', 'documente', false)
on conflict (id) do nothing;
