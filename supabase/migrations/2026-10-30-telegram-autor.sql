-- Mini App Telegram: sursa „telegram” și autorul acțiunilor (cine a creat clientul, cine a schimbat etapa).
-- Autorul e „@username” sau numele din Telegram, luat pe server din initData verificat; gol din browser (parola).
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou:
-- fără coloanele noi, adăugarea clienților, schimbarea etapei și fișa clientului răspund cu eroare.
-- Se poate rula de mai multe ori fără efecte în plus.

-- Sursă nouă: client adăugat din Mini App Telegram (toate sursele existente rămân)
alter table public.requests drop constraint if exists requests_source_check;
alter table public.requests add constraint requests_source_check
  check (source in ('site', 'manual', 'carte_vizita', 'chestionar', 'document', 'telegram'));

-- Cine a creat clientul și cine i-a schimbat ultima dată etapa
alter table public.requests add column if not exists created_by   text not null default '';
alter table public.requests add column if not exists status_actor text not null default '';

-- Cine a făcut trecerea, în istoricul etapelor
alter table public.status_history add column if not exists actor text not null default '';

-- Trigger-ul de istoric: la fel ca înainte, plus autorul (new.status_actor) în actor
create or replace function public.log_status_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.status_history (request_id, from_status, to_status, comment, actor, at)
    values (new.id, null, new.status, new.status_comment, new.status_actor, new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_history (request_id, from_status, to_status, comment, actor, at)
    values (new.id, old.status, new.status, new.status_comment, new.status_actor, new.status_updated_at);
  end if;
  return new;
end $$;

drop trigger if exists requests_status_log on public.requests;
create trigger requests_status_log
  after insert or update of status on public.requests
  for each row execute function public.log_status_change();
