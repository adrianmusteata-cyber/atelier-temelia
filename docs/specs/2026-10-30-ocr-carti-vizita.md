# Recunoașterea documentelor prin Claude — Etapa 1: încărcare, recunoaștere, CRM (cărți de vizită și chestionare)

## Pe scurt
În panoul de admin apare un singur buton, **„Încarcă document”**. Proprietarul fotografiază sau încarcă un document. Claude stabilește singur ce tip de document este și citește câmpurile. Proprietarul le verifică pe un ecran special, apoi documentul ajunge în secțiunea potrivită. Originalul se păstrează și se deschide din înregistrare.

Recunoașterea documentelor se face în 4 etape:
- **Etapa 1 (acest document):** baza comună (încărcare, recunoaștere, ecran de verificare, stocarea originalelor) și cele două tipuri care merg în CRM: **cărți de vizită** și **chestionare pe hârtie**.
- **Etapa 2:** `2026-10-30-ocr-etapa2-cheltuieli.md` — avize și chitanțe/facturi → Cheltuieli și raportul financiar.
- **Etapa 3:** `2026-10-30-ocr-etapa3-scadente.md` — facturi și contracte → Scadențe „De plătit” și „De încasat”.
- **Etapa 4:** `2026-10-30-ocr-etapa4-catalog.md` — liste de prețuri → Catalog.

Încă din Etapa 1, Claude recunoaște **toate** tipurile. Cele care nu au încă o secțiune nu se salvează și primesc mesajul „Secțiunea nu e gata încă”.

## Pornim de la ce există
- Site static + funcții Vercel în `/api`, fără `package.json` și fără dependențe. Supabase e apelat prin REST cu `fetch` (`api/_lib/db.js`, cheia `service_role`, doar de pe server). RLS e activat fără politici.
- O singură parolă de admin (`requireAdmin` în `api/_lib/auth.js`), fără roluri.
- Clienții stau în `requests`. Adăugarea manuală se face prin `POST /api/admin/requests`, care acceptă `{ name, phone, channel, email?, type?, service?, status?, notes? }` și validează emailul cu `EMAIL_RE`. Prima etapă a pâlniei este `noua`, iar istoricul îl scrie trigger-ul în `status_history`.
- Etichetele (surse, canale, tipuri, servicii, etape) sunt în `api/_lib/labels.js`. În `admin.js` se folosesc `srcText`/`srcTag`, `cardHtml`, `rowHtml` și `loadDetail`.
- Limite: `api/_lib/rate.js` (`countHits`/`addHit` pe `rate_hits`).
- Supabase Storage nu e folosit încă. Nu există încă nicio legătură cu API-ul Anthropic.
- Modificările bazei se fac printr-un SQL nou în `supabase/migrations/`, pe care utilizatorul îl rulează în Supabase SQL Editor înainte de publicarea codului. Se actualizează și `supabase/schema.sql`.

## Pentru cine e
Un singur utilizator: proprietarul studioului, în panoul de admin, mai ales de pe telefon.

## Tipurile de documente
Codurile se pun în `labels.js` → `DOC_TYPES`.

| Cod | Etichetă | Unde ajunge | Etapa |
|---|---|---|---|
| `carte_vizita` | Carte de vizită | CRM, client nou | 1 |
| `chestionar` | Chestionar | CRM, client nou | 1 |
| `aviz` | Aviz de expediere | Cheltuieli | 2 |
| `chitanta` | Chitanță / factură achitată | Cheltuieli | 2 |
| `de_platit` | Factură / contract de plătit | Scadențe → De plătit | 3 |
| `de_incasat` | Factură / contract de încasat (emis de noi) | Scadențe → De încasat | 3 |
| `lista_preturi` | Listă de prețuri | Catalog | 4 |

Reguli pentru Claude, ca să deosebească tipurile:
- **`de_incasat`:** documentul e emis de **noi**. Numele firmei proprii se ia din `OWN_COMPANY_NAMES` (implicit „LUXARCH, Atelier Temelia”), iar codul fiscal opțional din `OWN_IDNO`.
- **`chitanta`:** bon fiscal, chitanță sau factură marcată „achitat”.
- **`de_platit`:** factură sau contract emis **către noi**, cu o dată de plată sau cu rate și fără semne că e achitat.
- **`aviz`:** aviz de expediere sau factură fiscală cu rânduri de marfă livrată.
- În cazurile neclare, Claude alege tipul cel mai probabil, iar utilizatorul îl schimbă pe ecranul de verificare.

## Pașii principali
1. În antetul panoului de admin, vizibil din orice secțiune, apare butonul **„Încarcă document”**.
2. Se deschide o fereastră cu butonul „Fotografiază / alege fișier”, care pe telefon deschide camera sau galeria. Se pot pune:
   - **de la 1 la 5 poze**, adică paginile documentului (la cartea de vizită: fața și, opțional, verso);
   - sau **un singur PDF**.
   Fiecare poză se arată ca miniatură, cu butoanele „Șterge” și „Mută la stânga/dreapta” (pentru ordinea paginilor).
3. Butonul **„Citește”** devine activ când există cel puțin un fișier. După apăsare, textul lui devine „Se citește…” (butonul e dezactivat). De obicei durează 3–20 de secunde.
4. **Dacă nu e un document** (peisaj, selfie, pagină goală), apare mesajul „Nu pare un document. Nu s-a salvat nimic.” Fișierele încărcate se șterg, iar fereastra revine la pasul 2.
5. **Dacă e un document**, apare **ecranul de verificare**:
   - sus, „Tip document: <etichetă>”, cu o listă din care se poate schimba tipul;
   - miniaturile paginilor, care la apăsare se deschid mărite;
   - câmpurile tipului respectiv, toate editabile.
6. **Schimbarea tipului:** Claude citește din nou aceleași fișiere, doar pentru tipul ales (o citire în plus), iar câmpurile se completează din nou. Ce s-a corectat deja de mână se pierde. Înainte de recitire apare confirmarea: „Schimbi tipul? Câmpurile se citesc din nou.”
7. **Tip din etapele 2–4, dacă etapa respectivă nu e încă publicată:** în locul câmpurilor apare „Tip recunoscut: <etichetă>. Secțiunea nu e gata încă, nu s-a salvat nimic.”, cu butoanele „Schimbă tipul” și „Închide”. La „Închide”, fișierele temporare se șterg.
8. **Carte de vizită / Chestionar:** câmpurile, duplicatele și salvarea sunt descrise mai jos. După „Salvează”, se creează clientul, fereastra se închide și se deschide fișa lui.
9. „Anulează” sau închiderea ferestrei înainte de salvare: nu se creează nimic, iar fișierele temporare se șterg.
10. În fișa clientului apare secțiunea **„Documente”**, de exemplu „Carte de vizită — pagina 1” sau „Chestionar — PDF”. La apăsare, originalul se deschide într-un tab nou.

## Câmpurile pentru CRM
### Carte de vizită
- **Nume** (obligatoriu), **Telefon**, **Email**, **Tip proiect** și **Serviciu** (liste din `labels.js`, implicit goale).
- **Note**: text completat automat, câte un rând pentru fiecare dată găsită (rândurile goale lipsesc):
  ```
  Firma: SRL Exemplu
  Funcția: Director
  Adresa: str. Ștefan cel Mare 1, Chișinău
  Site: exemplu.md
  Alte telefoane: +373 22 000 000
  Alte emailuri: office@exemplu.md
  Altele: …
  ```
- Primul telefon ajunge în „Telefon” și primul email în „Email”, exact cum sunt scrise.
- Dacă pe carte nu e numele unei persoane, numele firmei ajunge în „Nume”.
- Clientul nou: `source = 'carte_vizita'`, `channel = ''`, `status = 'noua'`.

### Chestionar (scris de mână)
- Aceleași câmpuri ca formularul de pe site: **Nume** (obligatoriu), **Telefon**, **Email**, **Tip proiect**, **Serviciu**, **Despre proiect** (`message`), plus **Note**.
- Tipul și serviciul se aleg din liste doar dacă răspunsul se potrivește clar cu o variantă. Altfel rămân goale, iar textul scris de mână ajunge în „Note” (de exemplu „Tip proiect (scris): casă de vacanță”).
- Toate celelalte întrebări și răspunsuri din chestionar ajung în „Note”, câte un rând fiecare: `<întrebare>: <răspuns>`.
- Dacă un cuvânt nu se poate citi, Claude pune `[?]` în locul lui. Dacă sunt semne `[?]`, pe ecranul de verificare apare indicația „Unele cuvinte nu s-au putut citi — sunt marcate cu [?]”.
- Clientul nou: `source = 'chestionar'`, `channel = ''`, `status = 'noua'`.

### Reguli comune pentru cărți de vizită și chestionare
- Datele se preiau cum sunt scrise (română, rusă, engleză), fără traducere și fără transliterare.
- Sunt obligatorii **numele plus cel puțin unul dintre telefon și email**. Altfel, sub câmp apare mesajul „Completează telefonul sau emailul”.
- Limitele sunt cele din `LIMITS`, emailul se validează cu `EMAIL_RE`, iar tipul și serviciul se validează după `labels.js`. Un telefon mai lung de 30 de caractere se taie, iar ce rămâne merge în „Note”.
- **Duplicate:** verificarea se face pe server, imediat după citire și **din nou la salvare**.
  - Emailul se compară fără diferență între litere mari și mici și fără spații.
  - Telefonul se compară doar după cifre: două numere se potrivesc dacă ultimele 8 cifre sunt aceleași.
  - Dacă există o potrivire, apare avertismentul „Există deja: <nume> (<etapa>)”, cu butoanele **„Deschide clientul existent”** și **„Creează oricum”**. Dacă sunt mai multe potriviri, apar toate.
  - Fără „Creează oricum”, salvarea întoarce `409` cu lista potrivirilor.

## Ce trebuie să funcționeze
### Obligatoriu în prima versiune
- [ ] Butonul „Încarcă document” apare în antet. Pe telefon (375px) nu produce scroll orizontal nici fereastra, nici ecranul de verificare.
- [ ] Fișiere acceptate:
  - poze JPG, PNG, WEBP și HEIC/HEIF (dacă browserul le poate deschide), cel mult 5, fiecare de cel mult 15 MB înainte de micșorare;
  - sau un PDF de cel mult 10 MB și cel mult 20 de pagini.
  Nu se amestecă pozele cu PDF-ul.
- [ ] Pozele se micșorează în browser înainte de trimitere: latura mare de cel mult 2000 px, JPEG cu calitate ~0,85. Așa se rezolvă HEIC-ul, pe care Claude nu-l acceptă. **Originalul păstrat este această versiune micșorată.** PDF-ul se păstrează exact cum e.
- [ ] Dacă browserul nu poate deschide poza, apare mesajul „Formatul pozei nu e acceptat. Alege o poză JPG sau PNG.”
- [ ] Toate paginile se trimit lui Claude **într-o singură cerere**: pozele ca blocuri `image`, PDF-ul ca bloc `document`.
- [ ] Recunoașterea și citirea se fac într-un singur apel, prin **tool use**:
  - există câte o unealtă pentru fiecare tip din tabel, plus `not_a_document`, cu `tool_choice: any`;
  - unealta aleasă de Claude dă tipul, iar argumentele ei sunt câmpurile;
  - la schimbarea tipului, `tool_choice` se fixează pe unealta tipului ales.
  În Etapa 1, uneltele pentru tipurile din etapele 2–4 pot avea schema minimă (doar recunoașterea). Fiecare etapă următoare le completează.
- [ ] Instrucțiunea pentru Claude cere să nu inventeze nimic: câmpurile negăsite rămân goale.
- [ ] Clientul nou din document are `lang = 'ro'` (implicit). Etichetele noi ale surselor, „Carte de vizită” și „Chestionar”, apar pe card, în listă și în fișă (`SOURCES`).
- [ ] Originalele se păstrează în bucketul Supabase Storage privat `documente`, iar legătura cu înregistrarea se ține în tabelul `documents`.
- [ ] În fișa clientului, secțiunea „Documente” apare doar dacă există documente. Fișierul se deschide printr-un link semnat valabil 5 minute, cerut de la server la apăsare.
- [ ] Limita de cost: cel mult 30 de citiri pe oră, inclusiv recitirile (`rate.js`, cheia `ocr`). Peste limită apare mesajul „Prea multe citiri într-o oră. Încearcă mai târziu sau completează manual.”
- [ ] Butoanele „Citește” și „Salvează” se dezactivează cât timp lucrează.

### De dorit
- [ ] Rotirea pozei cu 90° în fereastră, înainte de „Citește”.
- [ ] Câmpurile pe care Claude nu le-a găsit sunt marcate discret („nu s-a găsit”).

### Mai târziu
- Încărcarea mai multor documente deodată.
- Atașarea unui document la un client existent (în loc de „Creează oricum”).
- Ștergerea sau adăugarea de documente dintr-o fișă existentă.
- Câmpuri separate „Firmă” și „Funcție” în CRM.

## Erori și cazuri limită
- **Nu e un document:** apare mesajul „Nu pare un document. Nu s-a salvat nimic.” Fișierele temporare se șterg.
- **Carte sau chestionar fără nume, telefon și email lizibile:** apare ecranul de verificare cu ce s-a găsit și cu mesajul „Nu s-au putut citi datele principale. Completează-le manual.”
- **Claude nu răspunde, răspunde cu eroare sau depășește 45 de secunde, ori cheia lipsește sau e greșită:** apare mesajul „Nu s-a putut citi documentul. Încearcă din nou sau completează manual.”, cu butoanele:
  - „Încearcă din nou”, care folosește aceleași fișiere, fără o nouă încărcare;
  - „Completez manual”, care deschide un ecran de verificare gol, cu tipul de ales din listă; fișierele se salvează odată cu înregistrarea.
  Detaliul tehnic se scrie doar în logul Vercel.
- **Storage nu răspunde la încărcare:** apare mesajul „Nu s-a putut încărca fișierul. Încearcă din nou.”, iar fișierele alese rămân în fereastră.
- **Supabase nu răspunde la salvare:** apare mesajul „Nu s-a salvat. Încearcă din nou.”, iar formularul păstrează ce ai scris. Ordinea e: întâi înregistrarea, apoi mutarea fișierelor și rândurile din `documents`. Dacă pasul cu fișierele eșuează, înregistrarea rămâne, iar mesajul e „Înregistrarea a fost creată, dar fișierele nu s-au salvat.”
- **Internetul cade în timpul citirii:** e tratat ca eroarea lui Claude.
- **Fișier prea mare, prea multe pagini sau tip greșit:** fișierul e respins înainte de trimitere, cu un mesaj care spune limita. Serverul verifică și el.
- **Sesiunea a expirat (401):** se cere din nou parola, ca în restul panoului.

## Date și drepturi de acces
### Schimbări în `requests`
- Regula `source`: `check (source in ('site', 'manual', 'carte_vizita', 'chestionar', 'document'))`. Sursa `document` („Document”) va fi folosită în Etapa 3, ca să nu fie nevoie de încă o migrare.
- `phone` rămâne `not null`, dar poate fi `''`. Regulă nouă: `check (phone <> '' or email <> '')`. Înainte de rulare se verifică dacă există rânduri care ar încălca regula.
- `POST /api/admin/requests` (manual) și `api/contact.js` rămân cu telefonul obligatoriu.

### Tabel nou `documents` (comun pentru toate etapele)
- `id bigint generated always as identity primary key`
- `doc_type text not null`: unul dintre codurile din tabel (`check`)
- `request_id uuid null references public.requests (id) on delete cascade`
- `page smallint not null default 1`: numărul paginii (pentru PDF e mereu 1)
- `path text not null`, `mime text not null`, `size_bytes integer not null`
- `created_at timestamptz not null default now()`
- `check (request_id is not null)`. În etapele următoare se adaugă coloane (`expense_id`, `payable_id` etc.), iar regula devine „exact una completată”.
- index pe `(request_id)`
- `alter table public.documents enable row level security;`

### Storage
- Bucket privat `documente`, creat din migrare: `insert into storage.buckets (id, name, public) values ('documente', 'documente', false) on conflict do nothing;`
- Fără politici pe `storage.objects`. Accesul se face doar de pe server, iar browserul primește doar linkuri semnate.
- Fișierele temporare stau în `tmp/<token>/<page>.<ext>`. La salvare se mută în `<doc_type>/<id_înregistrare>/<page>.<ext>`.

### Ce trebuie făcut
- Migrare nouă: `supabase/migrations/2026-10-30-ocr-etapa1.sql`. Se actualizează și `supabase/schema.sql`.
- Date personale: numele, telefonul, emailul, poza cărții sau a chestionarului. Le vede doar adminul, prin API cu `requireAdmin`. Imaginile ajung la Anthropic doar ca să fie citite. Conform politicii lor pentru API, nu sunt folosite pentru antrenare.

### Ce schimbăm în API
Toate rutele cer `requireAdmin`. Fișierul comun pentru apelurile la Claude este `api/_lib/claude.js`, iar cel pentru Storage este `api/_lib/storage.js`.
- `POST /api/admin/docs/upload` `{ files: [{ page, mime, size }] }` → întoarce `{ token, uploads: [{ page, url }] }`, cu linkuri semnate de încărcare (Storage `object/upload/sign`). Browserul face `PUT` direct, așa că nu contează limita de ~4,5 MB a Vercel. Serverul verifică tipurile MIME (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), mărimile și numărul de fișiere.
- `POST /api/admin/docs/read` `{ token, doc_type? }` → citește fișierele din `tmp/<token>/` și cheamă Claude. Cu `doc_type` completat, tipul e forțat. Aplică limita de 30 pe oră. Întoarce:
  - `{ ok: true, doc_type: null }` dacă nu e document, după ce șterge fișierele temporare;
  - `{ ok: true, doc_type, supported: false }`, pentru un tip a cărui etapă nu e gata încă;
  - `{ ok: true, doc_type, supported: true, fields, duplicates? }`.
- `POST /api/admin/docs/save` `{ token, doc_type, fields, force? }` → validează după tip, creează înregistrarea, mută fișierele și scrie rândurile în `documents`. Întoarce `{ ok: true, id }` sau `409 { duplicates }`.
- `POST /api/admin/docs/cancel` `{ token }` → șterge `tmp/<token>/`. Eroarea se ignoră.
- `GET /api/admin/documents?id=<id>` → `{ url }`, un link semnat valabil 300 de secunde.
- `GET /api/admin/requests/:id` întoarce în plus `documents: [{ id, doc_type, page, mime, created_at }]`.
- `token` se validează ca UUID.
- În `vercel.json` (`functions`), `docs/read` primește `maxDuration: 60`.

## Servicii externe
- **Anthropic Claude API** (`https://api.anthropic.com/v1/messages`), apelat cu `fetch`. Variabile:
  - `ANTHROPIC_API_KEY`;
  - `ANTHROPIC_MODEL`: un model actual, rapid, care citește imagini și PDF. Pentru scrisul de mână și chirilică se testează unul de nivel mediu;
  - `OWN_COMPANY_NAMES` și `OWN_IDNO` (opționale).
  Timeout: 45 s. La eroare, vezi „Erori”. Costul estimat: ~1–3 cenți pe document de 1–2 pagini.
- **Supabase Storage** (același proiect și aceeași cheie), prin `/storage/v1/...`.

### Pas pentru utilizator (înainte de publicare)
1. Intră pe https://console.anthropic.com, creează contul și adaugă cardul (Settings → Billing). Pune câțiva dolari în cont și, dacă vrei, o limită lunară de cheltuieli (Settings → Limits).
2. Mergi la Settings → API Keys → „Create Key”, dă-i numele `luxarch-site` și copiază cheia (începe cu `sk-ant-`). Cheia se vede o singură dată.
3. În Vercel deschide proiectul `atelier-temelia` → Settings → Environment Variables. Adaugă `ANTHROPIC_API_KEY` = cheia (Production), apoi fă Redeploy.
4. În Supabase rulează migrarea `supabase/migrations/2026-10-30-ocr-etapa1.sql` (SQL Editor → New query → Run).

## Ce nu intră în această sarcină
- Modulele Cheltuieli, Scadențe și Catalog: sunt etapele 2–4, fiecare cu spec-ul ei.
- Mai multe documente într-o încărcare, sau mai multe documente într-o singură poză.
- Traducerea sau transliterarea datelor.
- Canalul (Apel / Întâlnire) pentru clienții din documente.

## Întrebări rămase (le rezolvă programatorul)
- **Fișiere temporare rămase:** o curățare ocazională la fiecare `docs/upload`, care șterge tot ce e mai vechi de 24 de ore din `tmp/` (ca la `rate_hits`), sau un Vercel Cron zilnic. Prima e mai simplă.
- **Numărarea paginilor PDF fără dependențe:** o estimare din textul PDF-ului (`/Type /Page`) e suficientă. Dacă nu se poate, Claude întoarce o eroare peste 100 de pagini.
- **Modelul exact:** se testează pe 5–10 documente reale, inclusiv un chestionar scris de mână în rusă.
