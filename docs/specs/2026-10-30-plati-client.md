# Plăți în fișa clientului

## Pe scurt
În fișa clientului din CRM se pot introduce valoarea contractului și plățile primite (dată + sumă). Aplicația arată cât s-a plătit și cât a rămas. Pe cardul de pe tablă se vede pe scurt situația plăților. Proprietarul vede dintr-o privire cine a plătit avansul și cine a achitat tot, fără să țină socoteala separat.

## Pornim de la ce există
- Site static + funcții Vercel în `/api` + Supabase prin REST. Accesul se face doar de pe server, cu cheia `service_role`, iar RLS e activat fără politici.
- O singură parolă de admin (`requireAdmin`), fără roluri.
- Clienții stau în tabelul `requests`, cu 7 etape în `status`. Istoricul etapelor îl scrie trigger-ul în `status_history`.
- Tabla primește datele din `GET /api/admin/requests?all=1`, cu câmpurile din `FIELDS`. Fișa folosește `GET/PATCH /api/admin/requests/:id`.
- Interfața e în `admin.js`: cardul se desenează în `cardHtml`, fișa în `loadDetail`.
- Modificările de bază de date se fac printr-un fișier SQL nou în `supabase/migrations/`, pe care îl rulează utilizatorul în Supabase înainte de publicarea codului. Trebuie actualizat și `supabase/schema.sql`.

## Pentru cine e
Un singur utilizator: proprietarul studioului, care intră în panoul de admin.

## Pașii principali
1. Proprietarul deschide fișa clientului.
2. În secțiunea nouă „Plăți” alege moneda (MDL sau EUR) și scrie valoarea contractului, apoi salvează.
3. Apasă „Adaugă plată” și completează data (implicit azi), suma și, dacă vrea, o notă (de exemplu „numerar”, „transfer, factura 12”). Apoi salvează.
4. Plata apare în listă. Totalurile „Contract”, „Plătit” și „Rămas” se recalculează.
5. Dacă e prima plată și clientul e în Nouă, În lucru sau Procesat, aplicația întreabă: „Prima plată înregistrată. Muți clientul în Avans?” La „Da”, clientul se mută în Avans (de la Nouă, Contactată, În lucru sau Procesat), prin același mecanism ca mutarea manuală, așa că apare și în istoric. La „Nu”, nu se întâmplă nimic.
6. Dacă suma rămasă ajunge la 0 sau mai jos (doar când valoarea contractului e completată) și clientul nu e deja în Plătit sau Încheiat, aplicația întreabă: „Achitat integral. Muți clientul în Plătit?” (etapa „Plătit” a fost adăugată după scrierea spec-ului) Răspunsurile funcționează la fel ca la pasul 5.
7. Pe tablă, cardul clientului arată pe scurt plățile.

## Ce trebuie să funcționeze
### Obligatoriu în prima versiune
- [ ] Moneda se alege la fiecare client: `MDL` (implicit) sau `EUR`. Toate sumele clientului sunt în moneda lui. Nu se fac conversii.
- [ ] Valoarea contractului e opțională. Poate fi completată, schimbată sau ștearsă oricând.
- [ ] Moneda se poate schimba oricând. Dacă clientul are deja plăți, aplicația cere confirmare: „Sumele nu se convertesc, se schimbă doar moneda afișată. Continui?”
- [ ] Plățile se pot adăuga la orice etapă a clientului.
- [ ] Fiecare plată are o dată (obligatorie, nu poate fi în viitor), o sumă (obligatorie, mai mare ca 0, cu cel mult 2 zecimale, acceptă virgulă sau punct) și o notă (opțională, cel mult 200 de caractere).
- [ ] Lista plăților din fișă e ordonată după dată, cele mai vechi primele. Pe fiecare rând apar data, suma, nota și butoanele „Modifică” și „Șterge”.
- [ ] „Modifică” deschide aceleași câmpuri, completate cu datele plății, și le salvează.
- [ ] „Șterge” cere confirmare: „Ștergi plata de 5 000 MDL din 12.10.2026?”
- [ ] Totalurile din fișă:
  - „Contract: X”, sau „Contract: —” dacă valoarea lipsește;
  - „Plătit: Y”;
  - „Rămas: X − Y”, doar dacă valoarea contractului e completată. Dacă Y > X, în loc de „Rămas” apare „Plătit în plus: Y − X”.
- [ ] Cum se scriu sumele: separator de mii cu spațiu, zecimalele doar când există, apoi moneda. Exemple: `12 500 MDL`, `3 000,50 EUR`.
- [ ] Propunerile de mutare de la pașii 5 și 6:
  - apar doar după ce adaugi sau modifici o plată, nu și după ce ștergi una;
  - nu apar dacă clientul e în Respins sau Închisă;
  - nu mută niciodată clientul fără „Da”.
- [ ] Ce apare pe cardul de pe tablă:
  - cu contract completat: `Plătit 5 000 / 12 000 MDL`;
  - fără contract, dar cu plăți: `Plătit 5 000 MDL`;
  - fără contract și fără plăți: nimic.
- [ ] Pe telefon (lățime 375px) secțiunea „Plăți” și cardul nu produc scroll orizontal.

### De dorit
- [ ] Coloana „Plătit / Contract” în lista clienților (`rowHtml`).
- [ ] Când clientul e achitat integral, cardul primește un marcaj vizual discret (de exemplu suma afișată în verde).

### Mai târziu
- Graficul de plăți (rate planificate, marcaj „restant”).
- Totaluri pe toată tabla sau pe lună (pentru că se amestecă lei cu euro, ar avea nevoie de cursul valutar).
- Metoda de plată ca listă fixă de opțiuni, facturi sau chitanțe în PDF.
- Exportul plăților (CSV/Excel).

## Erori și cazuri limită
- **Câmp greșit sau gol:** câmpul se marchează, iar sub el apare un mesaj, de exemplu „Introdu o sumă mai mare ca 0”, „Data nu poate fi în viitor”.
- **Serverul sau baza nu răspund:** apare mesajul „Nu s-a salvat. Încearcă din nou.” Formularul păstrează ce ai scris, iar lista și totalurile rămân cum erau.
- **Dublu-clic:** butonul „Salvează” se dezactivează cât timp se salvează, ca să nu apară două plăți identice.
- **Plata e ștearsă între timp** (de exemplu din alt tab): serverul răspunde 404, apare mesajul „Plata nu mai există”, iar lista se reîncarcă.
- **Ștergerea clientului:** plățile lui se șterg odată cu el (`on delete cascade`).
- **Suma plătită depășește contractul:** nu se blochează nimic, apare „Plătit în plus: …”.
- **Valoarea contractului se șterge:** „Rămas” dispare, iar cardul trece la formatul fără contract.
- **Limite:** suma și valoarea contractului pot fi cel mult 99 999 999,99. Nu există limită la numărul de plăți.

## Date și drepturi de acces
### Coloane noi în `requests`
- `contract_value numeric(12,2) null`, cu regula `contract_value is null or contract_value >= 0`;
- `currency text not null default 'MDL'`, cu regula `currency in ('MDL','EUR')`.

### Tabel nou `payments`
- `id bigint generated always as identity primary key`
- `request_id uuid not null references public.requests (id) on delete cascade`
- `paid_on date not null`
- `amount numeric(12,2) not null check (amount > 0)`
- `note text not null default ''`
- `created_at timestamptz not null default now()`
- index pe `(request_id, paid_on)`
- `alter table public.payments enable row level security;` (fără politici, la fel ca restul tabelelor)

### Ce trebuie făcut
- Migrare nouă: `supabase/migrations/2026-10-30-plati.sql`. Se actualizează și `supabase/schema.sql`.
- Datele nu sunt personale în plus față de ce există deja. Le vede și le modifică doar adminul, numai prin API-ul cu `requireAdmin`.

### Ce schimbăm în API
- `GET /api/admin/requests/:id` întoarce în plus `payments: [...]`, ordonate `paid_on.asc,id.asc`.
- `PATCH /api/admin/requests/:id` acceptă în plus `contract_value` (număr ≥ 0 sau `null`) și `currency` (`MDL`/`EUR`).
- Endpointuri noi pentru plăți:
  - `POST` creează o plată, cu `{ paid_on, amount, note? }`;
  - `PATCH` modifică o plată;
  - `DELETE` șterge o plată.
  Fiecare răspuns întoarce lista actualizată de plăți. Implementat ca `POST /api/admin/payments`, `PATCH` și `DELETE /api/admin/payments?id=<id>` (`api/admin/payments.js`).
- `GET ?all=1` (tabla) întoarce în plus `contract_value`, `currency` și `paid_total`. Pentru `paid_total` se cer plățile împreună cu clientul (`payments(amount)`) și se adună pe server. Pentru cel mult 1000 de clienți e suficient.
- Validarea se face pe server, chiar dacă există și în browser: suma > 0 și cel mult 99 999 999,99, maximum 2 zecimale, data în format `YYYY-MM-DD` și nu în viitor (după ora Chișinăului), nota de cel mult 200 de caractere.

## Servicii externe
Niciunul nou. Se folosește doar Supabase, care există deja. Dacă Supabase nu răspunde, API-ul întoarce 502, iar interfața afișează mesajul de eroare de mai sus.

## Ce nu intră în această sarcină
- Rate planificate sau graficul de plăți, notificări despre restanțe.
- Conversia valutară și totaluri pe mai mulți clienți.
- Facturi, chitanțe, integrare cu banca sau cu plăți online.
- Mai mulți utilizatori sau roluri.

## Întrebări rămase (le rezolvă programatorul)
- **Calea endpointurilor de plăți.** Se pot pune în `api/admin/requests/[id]/payments.js` (verificat că rutarea Vercel merge alături de `[id].js`) sau separat, în `api/admin/payments/index.js` + `[pid].js`, cu `request_id` în cerere. Oricare variantă e bună.
- **Ziua de azi după ora Chișinăului.** Pentru verificarea „data nu e în viitor” se calculează ziua curentă în fusul orar `Europe/Chisinau`.
