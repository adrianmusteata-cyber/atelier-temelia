-- Vizualizare proiect: schițe generate cu Google Gemini din pozele vizitatorului sau ale echipei.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou:
-- fără tabelul generations și fără sursa „vizualizare”, generarea răspunde cu eroare (restul site-ului merge).
-- Se poate rula de mai multe ori fără efecte în plus.

-- Sursă nouă: cererea lăsată din formularul „Vedeți-vă viitoarea casă” (toate sursele existente rămân)
alter table public.requests drop constraint if exists requests_source_check;
alter table public.requests add constraint requests_source_check
  check (source in ('site', 'manual', 'carte_vizita', 'chestionar', 'document', 'telegram', 'vizualizare'));

-- O generare = o schiță. Rândul „pending” se creează înainte de apelul la Gemini (rezervarea),
-- ca două cereri simultane să nu treacă amândouă peste limită.
create table if not exists public.generations (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  request_id       uuid references public.requests (id) on delete cascade,  -- gol = lista generală a echipei
  origin           text not null check (origin in ('public', 'team')),
  kind             text not null check (kind in ('casa_noua', 'fatada', 'interior')),
  wishes           text not null default '' check (char_length(wishes) <= 1000),
  status           text not null default 'pending' check (status in ('pending', 'done', 'failed', 'rejected')),
  error            text not null default '',
  model            text not null default '',
  input_paths      text[] not null default '{}',
  output_path      text not null default '',
  actor            text not null default '',   -- „@username” din Mini App, „owner” din browser, gol pentru vizitator
  actor_key        text not null default '',   -- cheia limitei: tg:<id>, owner sau amprenta IP-ului
  phone_key        text not null default '',   -- telefonul normalizat, doar la public
  token            text unique,                -- dosarul tmp/<token>/ cu pozele încărcate; gol după curățenie
  token_expires_at timestamptz,
  started_at       timestamptz                 -- începutul apelului la Gemini (oprește dublul clic)
);

create index if not exists generations_origin_idx  on public.generations (origin, created_at);
create index if not exists generations_actor_idx   on public.generations (actor_key, created_at);
create index if not exists generations_phone_idx   on public.generations (phone_key);
create index if not exists generations_request_idx on public.generations (request_id);

-- Acces doar de pe server (cheia service_role), ca restul tabelelor
alter table public.generations enable row level security;
