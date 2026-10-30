-- Clienții adăugați manual: pe ce canal au venit (apel sau întâlnire).
-- Gol pentru cererile de pe site și pentru clienții manuali adăugați înainte de această migrare.
-- Rulat o singură dată în Supabase (SQL Editor) ÎNAINTE de a publica codul nou.
alter table public.requests
  add column if not exists channel text not null default '' check (channel in ('', 'apel', 'intalnire'));
