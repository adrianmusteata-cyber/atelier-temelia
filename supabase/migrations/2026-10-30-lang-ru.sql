-- Site-ul are acum și limba rusă: cererile pot veni cu lang = 'ru'.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica noul api/contact.js.
alter table public.requests drop constraint if exists requests_lang_check;

alter table public.requests
  add constraint requests_lang_check check (lang in ('ro', 'ru', 'en'));
