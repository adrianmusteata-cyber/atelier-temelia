# Vizualizare proiect: schița viitoarei case sau renovări, generată din poze

## Pe scurt
Vizitatorul site-ului sau cineva din echipă încarcă 1–3 poze: terenul, fațada sau camera. Scrie ce își dorește și primește în ~30 s o **schiță orientativă** a casei sau a renovării. Imaginea o generează Google Gemini („Nano Banana”), pe server, iar cheia nu ajunge niciodată în browser.

**Pe site**, vizitatorul lasă înainte de generare numele, telefonul și acordul. Fiecare generare devine o **cerere în CRM** (sursa „Site, vizualizare”), cu pozele și schița pe fișă, și un anunț pe Telegram. **Echipa** generează din admin și din Mini App, pe fișa unui client sau fără client, într-o listă generală.

Există limite pe IP, pe telefon, pe om din echipă și un **plafon de 20 de schițe pe zi pentru tot site-ul**, ca să nu existe costuri-surpriză.

**Nu se adaugă funcții Vercel:** rămânem la 12 din 12 pe Hobby. Se extind `api/contact.js` (partea publică) și `api/admin/docs/[action].js` (partea echipei). **E nevoie de o migrare SQL** (o rulează utilizatorul din clipboard).

## Pornim de la ce există
- **Funcțiile (12):** `contact`, `admin/login`, `admin/logout`, `admin/payments`, `admin/telegram-chats`, `admin/report`, `admin/dues`, `admin/expenses`, `admin/catalog`, `admin/requests/index`, `admin/requests/[id]`, `admin/docs/[action]`. În `vercel.json`, doar `docs/[action]` are `maxDuration: 60`.
- **`api/contact.js`** e singura rută publică:
  - protecții: câmpul-capcană `website`, timpul minim de 3 s (`startedAt`), 5 cereri/oră per IP;
  - IP-ul se păstrează doar ca amprentă (`ipKey` din `_lib/http.js`);
  - bifa `consent` e obligatorie;
  - cererea se salvează în `requests` și se anunță pe Telegram/email (`_lib/notify.js`).
- **`api/_lib/auth.js` → `requireAdmin(req, res, { staff })`:**
  - în browser: o singură parolă, deci proprietarul, fără nume;
  - în Mini App: utilizatorul vine din initData verificat (`req.tgUser.id`, rolul `owner`/`staff`), cu autorul dat de `actorOf(req)`.
- **`api/_lib/rate.js`:** `countHits(key, windowMs)` și `addHit(key)` în tabelul `rate_hits`. Înregistrările mai vechi de o zi se șterg din când în când.
- **`api/_lib/storage.js`:** bucketul privat `documente`, linkuri semnate de încărcare și de citire, `move`, ștergere. Recunoașterea documentelor folosește deja fluxul „linkuri semnate → browserul încarcă în `tmp/<token>/` → serverul citește”.
- **Tabelul `requests`:**
  - `name`, `phone`, `email`, `type`, `service` sunt `not null`; telefonul sau emailul trebuie să existe (`requests_phone_or_email`);
  - `source` are un `check` cu `site, manual, carte_vizita, chestionar, document, telegram`;
  - `SOURCES` din `_lib/labels.js` trebuie ținut la fel.
- **`confidentialitate.html`** (RO/RU/EN) enumeră furnizorii: Vercel, Supabase, Telegram, Resend.
- **`i18n.js`** are textele site-ului în RO/RU/EN.

## Pentru cine e
- **Vizitatorul site-ului**, fără cont: un om care își face casă sau renovare și vrea să vadă cum ar putea arăta. Identificat după amprenta IP-ului și după numărul de telefon.
- **Echipa**: proprietarul (browser cu parolă sau Mini App) și angajații (Mini App). Toți pot genera. Angajații văd generările la fel ca restul fișei clientului.

## Pregătirea, o singură dată (o face utilizatorul)

### A. Cheia Google Gemini
1. Intră pe https://aistudio.google.com cu contul Google al biroului.
2. **Get API key** → **Create API key**. Alege sau creează un proiect, de exemplu `luxarch-viz`.
3. **Activează facturarea:** în AI Studio, la cheie, apare „Set up billing” (sau Google Cloud Console → Billing). Se leagă un card. **Fără facturare, generarea de imagini prin API nu merge**: pentru modelele de imagine, nivelul gratuit nu include ieșirea.
4. **Alertă de buget** (gratuită): Google Cloud Console → Billing → **Budgets & alerts** → Create budget pe proiectul `luxarch-viz`, de exemplu 10 $/lună, cu email la 50 %, 90 % și 100 %.
   **Atenție:** alerta doar anunță, nu oprește cheltuielile. Oprirea reală o fac limitele din cod (vezi „Limite”).
5. Copiază cheia. Coordonatorul o pune în Vercel ca `GEMINI_API_KEY`, prin API, din clipboard.

### B. Cloudflare Turnstile (anti-roboți, gratuit)
1. Creează un cont gratuit pe https://dash.cloudflare.com/sign-up. Nu e nevoie să muți domeniul la Cloudflare.
2. În meniu: **Turnstile** → **Add widget**:
   - nume: `LUXARCH vizualizare`;
   - domenii (Hostname): `luxarch.vercel.app` (și `atelier-temelia.vercel.app`, dacă e încă folosit);
   - Widget mode: **Managed** (de obicei invizibil, rar cere o bifă).
3. Cloudflare dă **2 chei**:
   - **Site Key** (publică): ajunge în pagină, o pune coordonatorul în Vercel ca `TURNSTILE_SITE_KEY`;
   - **Secret Key** (secretă): în Vercel ca `TURNSTILE_SECRET_KEY`.
4. După punerea variabilelor: **Redeploy** în Vercel.

### C. Migrarea SQL
Coordonatorul pregătește fișierul `supabase/migrations/2026-10-30-vizualizare.sql` (conținutul e la „Date”). Utilizatorul îl rulează în Supabase → SQL Editor, din clipboard.

## Pașii principali

### Pe site (vizitatorul)
1. În `index.html` apare o secțiune nouă, **„Vedeți-vă viitoarea casă”** (RO/RU/EN prin `i18n.js`), cu link în meniu. Are un text scurt: „Încărcați 1–3 poze și scrieți ce vă doriți. Primiți o schiță orientativă în ~30 de secunde.”
2. Formularul are:
   - **Ce vizualizăm** (obligatoriu): `Casă nouă pe teren` / `Fațadă / renovare exterior` / `Interior`;
   - **Poze**: 1–3, JPEG/PNG/WEBP, până la 10 MB fiecare, cu previzualizare și buton de ștergere pe fiecare;
   - **Dorințele**: text de cel mult 1000 de caractere, de exemplu „casă cu un etaj, acoperiș plat, lemn și piatră”;
   - **Nume**, **Telefon** (obligatorii), **Email** (opțional);
   - **Bifa de acord** (obligatorie), separată de cea a formularului obișnuit: „Sunt de acord ca pozele și datele mele să fie prelucrate pentru generarea schiței (de serviciul Google Gemini) și păstrate împreună cu cererea mea. [Politica de confidențialitate]”;
   - widgetul Turnstile;
   - câmpul-capcană `website` (ascuns) și `startedAt`, ca la formularul de contact;
   - butonul **„Generează schița”**.
3. La apăsare, browserul micșorează pozele la cel mult 2048 px pe latura mare (JPEG, calitate ~0,85). Butonul se blochează și apare „Se generează… ~30 de secunde”.
4. **Pasul „start”** (`POST /api/contact?action=viz-start`), în această ordine:
   1. capcana și timpul minim, ca acum (roboții primesc „succes” fals, fără nimic salvat și fără generare);
   2. validarea câmpurilor;
   3. verificarea Turnstile la Cloudflare;
   4. limita de 5 apeluri „start” pe oră per IP;
   5. **se salvează cererea în CRM** (vezi „Legătura cu CRM”), indiferent dacă urmează sau nu generarea;
   6. se verifică limitele de generare (IP, telefon, plafonul site-ului);
   7. dacă limitele permit: se rezervă o generare (rând `pending`) și se întorc linkurile semnate de încărcare în `tmp/<token>/` + `token`;
   8. dacă limitele nu permit: răspunsul spune care limită s-a atins. Cererea e deja salvată, iar anunțul pe Telegram pleacă.
5. Browserul încarcă pozele direct în Storage, cu linkurile semnate.
6. **Pasul „generate”** (`POST /api/contact?action=viz-generate { token }`):
   - serverul descarcă pozele, construiește promptul și cheamă Gemini;
   - salvează rezultatul în Storage, mută pozele din `tmp/` lângă rezultat și marchează generarea `done`;
   - întoarce un link de citire valabil 1 oră.
7. Vizitatorul vede schița, cu eticheta **„Schiță orientativă generată automat, nu e proiect”**, butonul **„Descarcă”** și textul „Mulțumim! Vă contactăm în curând la <telefon>.”
8. Pe Telegram pleacă anunțul obișnuit despre cerere, cu un rând în plus: „Vizualizare proiect: schița e pe fișă” (sau „nu s-a generat: <motiv>”).

### În admin și în Mini App (echipa)
1. Pe **fișa clientului** apare secțiunea **„Vizualizări”**:
   - lista generărilor clientului: miniatura rezultatului, data, autorul, tipul, dorințele;
   - clic pe o generare → imaginea mare și pozele de intrare, deschise prin link semnat de 5 minute.
2. Pe fișă, butonul **„Vizualizare nouă”** deschide același formular: tip, 1–3 poze, dorințe. Fără câmpuri de contact, fără Turnstile, fără acord.
3. În meniul panoului apare **„Vizualizări”**: lista generală, cu generările echipei făcute fără client, de la cea mai nouă la cea mai veche. Acolo e și butonul **„Vizualizare nouă”** fără client.
4. **Rutele** (în `api/admin/docs/[action].js`, cu `requireAdmin(req, res, { staff: true })`):
   - `POST /api/admin/docs/viz-upload { files, request_id? }` → `{ token, uploads }`;
   - `POST /api/admin/docs/viz-generate { token, kind, wishes }` → `{ id, url }`;
   - `GET  /api/admin/docs/viz-list?request_id=<id>` sau `?general=1` → lista;
   - `GET  /api/admin/docs/viz-open?id=<generare>&what=output|input-<n>` → `{ url }` (5 minute);
   - `POST /api/admin/docs/viz-delete { id }`: șterge rândul și fișierele.
5. Cine poate șterge o generare: proprietarul, oricare; angajatul, doar pe ale lui (după autor).

## Limite
Toate limitele numără **doar generările reușite sau în curs** (`pending` + `done`), pe **ziua calendaristică după ora Moldovei** (Europe/Chisinau, cu resetare la 00:00). Generările `failed` nu se numără (excepție la „Ce se numără”).

| Limita | Valoare | Cheia | Mesajul (RO; la fel în RU/EN) |
|---|---|---|---|
| Per vizitator (IP) | 2 / zi | amprenta IP (`ipKey('viz', req)`) | „Ați folosit azi cele 2 vizualizări. Vă contactăm noi, iar mâine puteți încerca din nou.” |
| Per număr de telefon | 3 în total, pentru totdeauna | telefonul normalizat (doar cifrele, fără prefixul `373`/`0` de la început) | „Pentru acest număr s-au făcut deja 3 vizualizări. Vă contactăm noi pentru detalii.” |
| Plafonul site-ului | 20 / zi, pentru toți vizitatorii | toate generările publice | „Azi s-au terminat vizualizările. Cererea dumneavoastră e salvată și vă contactăm în curând.” |
| Om din echipă | 5 / zi | `tg:<id>` din initData; în browser, `owner` | „Ai folosit azi cele 5 generări. Mâine de la 00:00 poți genera din nou.” |
| Încercări (anti-buclă) | 10 / oră | IP pentru public, omul pentru echipă | „Prea multe încercări. Încercați peste o oră.” |
| Apeluri „start” pe site | 5 / oră per IP | ca la contact | ca la formularul de contact |

- **Plafonul site-ului e separat de limitele echipei:** generările echipei nu consumă cele 20.
- **Ce se numără:**
  - o eroare a serviciului, un timeout sau o problemă la Storage → `failed`, nu se numără;
  - o poză refuzată de filtrul de siguranță Google → `rejected`, **se numără** (altfel cineva ar putea încerca la nesfârșit);
  - toate încercările se numără în limita „10 pe oră”.
- **Rezervarea:** rândul `pending` se creează la „start” (public) sau la „viz-upload” (echipă), **înainte** de apelul la Gemini, și intră în numărătoare. Așa, două cereri simultane nu trec amândouă peste plafon.
  - Un `pending` mai vechi de 15 minute (vizitatorul a închis pagina) se consideră `failed` și nu se mai numără.
  - Rămâne o mică cursă la a 20-a generare (se poate ajunge la 21): e acceptat.
- **Costul maxim** (la ~0,034 $/imagine):
  - site: 20 × 30 ≈ **20 $/lună**;
  - echipa: 5 × numărul de oameni × 30 (3 oameni ≈ 15 $/lună);
  - în realitate, mult mai puțin.
- Valorile (2, 3, 20, 5, 10) stau ca **constante la începutul fișierelor**, ca să se schimbe ușor.

## Legătura cu CRM (partea publică)
- **Sursa nouă:** `vizualizare` → „Site, vizualizare”. Se adaugă în `SOURCES` din `_lib/labels.js` și în `requests_source_check` (migrare).
- **Câmpurile cererii:**
  - `name`, `phone`, `email` (gol dacă lipsește), `lang` (limba paginii);
  - `type` = `casa` pentru „Casă nouă” și „Fațadă”, `altceva` pentru „Interior”;
  - `service` = `design` pentru „Interior”, `nu_stiu` pentru celelalte;
  - `message` = „Vizualizare: <tipul ales>. Dorințe: <text>”;
  - `status` = `noua`.
- **Același telefon, aceeași zi:** dacă azi există deja o cerere cu sursa `vizualizare` și același telefon normalizat, generarea nouă se leagă de ea, fără o cerere nouă. Altfel, se creează o cerere nouă. Cererile din alte surse nu se ating.
- **Cererea se salvează și când nu se generează nimic** (limită atinsă, plafon atins, serviciul a căzut): omul a lăsat contactul, deci e o cerere.
- **Dacă Supabase nu răspunde la „start”:** ca la contact, cererea pleacă pe Telegram cu avertismentul „NU a fost salvată în panou”. Vizitatorul vede: „Nu am putut genera schița acum, dar cererea a ajuns la noi. Vă contactăm.” Fără generare.

## Generarea (comun pentru site și echipă)
- **Modelul:** implicit Nano Banana 2.1 (`gemini-nano-banana-2.1`, ~0,034 $ la 1K), din variabila `GEMINI_IMAGE_MODEL`.
  **Numele exact se verifică la implementare** cu `GET https://generativelanguage.googleapis.com/v1beta/models?key=…` pe cheia utilizatorului: se alege ce e disponibil în contul lui.
  Variante de rezervă, în ordine: `gemini-3.1-flash-lite-image`, apoi `gemini-2.5-flash-image` (acesta se închide pe 15.03.2027).
- **Apelul:**
  - `generateContent`, din Node, cu `fetch`, fără dependențe;
  - pozele trimise ca `inline_data` base64 + textul promptului;
  - răspunsul conține imaginea (`inline_data`), ~1024 px;
  - fără cheie în browser, fără cheie în loguri.
- **Promptul** (text fix pe server, în engleză; dorințele omului se pun la sfârșit, între ghilimele):
  - „Casă nouă pe teren”: „Using the photo of the empty plot, create a realistic architectural visualization of a new house on this exact site, same viewpoint, lighting and surroundings…”;
  - „Fațadă / renovare exterior”: „Renovate the facade of this building, keep its volume, viewpoint and surroundings…”;
  - „Interior”: „Redesign this room's interior, keep the walls, windows and perspective…”;
  - pentru toate: „No text, no watermark, no people. Client wishes: "<dorințele>"”.

  Textul exact se ajustează la implementare, după câteva probe.
- **O generare = o imagine.**
- **Timpul:**
  - `vercel.json` primește `"api/contact.js": { "maxDuration": 60 }`; `docs/[action].js` are deja 60;
  - apelul la Gemini are `AbortController` la 50 s, iar restul (descărcarea pozelor, salvarea) încape în ce rămâne.
- **Fișierele în Storage** (bucketul `documente`):
  - pozele de intrare: `viz/<generation_id>/input-1.jpg`…;
  - rezultatul: `viz/<generation_id>/output.png`;
  - fișierele din `tmp/<token>/` care nu ajung să fie generate se șterg la `cancel` sau la expirarea rezervării (15 minute), cu curățenie ocazională, ca în `rate.js`.

## Ce trebuie să funcționeze

### Obligatoriu în prima versiune
- [ ] Secțiunea „Vedeți-vă viitoarea casă” în `index.html`, în RO/RU/EN, fără scroll orizontal la 375 px.
- [ ] Formularul public cu tipul, 1–3 poze, dorințele, numele, telefonul, emailul opțional, acordul, Turnstile, capcana și `startedAt`.
- [ ] Micșorarea pozelor în browser, la cel mult 2048 px.
- [ ] `viz-start` și `viz-generate` în `api/contact.js`. Formularul de contact existent (POST fără `action`) merge exact ca acum.
- [ ] Verificarea Turnstile pe server, la fiecare `viz-start`.
- [ ] Toate limitele din tabel, cu mesajele în 3 limbi.
- [ ] Cererea în CRM cu sursa `vizualizare`, chiar dacă generarea nu are loc, și anunțul pe Telegram cu rândul despre schiță.
- [ ] Secțiunea „Vizualizări” pe fișa clientului, cu generare nouă (proprietar și angajat, browser și Mini App).
- [ ] Lista generală „Vizualizări” în panou, cu generare fără client.
- [ ] Ștergerea unei generări (rândul + fișierele), după regulile de drepturi.
- [ ] La ștergerea unei cereri din CRM se șterg și generările ei, cu fișierele.
- [ ] Eticheta „Schiță orientativă generată automat, nu e proiect” peste tot unde apare un rezultat.
- [ ] `confidentialitate.html` actualizat în 3 limbi:
  - furnizorii noi: Google (Gemini API, generarea schiței; pe nivelul plătit, Google nu folosește datele pentru antrenare) și Cloudflare (Turnstile, protecție anti-roboți);
  - ce se păstrează: pozele și schița, împreună cu cererea, până la cererea de ștergere.
- [ ] Butonul blocat cât timp se generează; nicio generare dublă la dublu clic.

### Desirabil
- [ ] În anunțul de pe Telegram se trimite chiar schița (`sendPhoto`), nu doar textul.
- [ ] „Leagă de un client”: o generare din lista generală se mută pe fișa unui client.
- [ ] În lista generală, filtrul „doar ale mele”.

### Mai târziu
- Integrarea unui produs din Catalog în interior.
- Imagini pentru oferte comerciale și postări.
- Mai multe variante dintr-o singură generare; „încă o variantă” din rezultat.
- Editarea unei schițe deja generate („fă acoperișul în două ape”).
- Statistica lunară a generărilor și a costului în Financiar.

## Erori și cazuri-limită
| Situația | Ce vede omul | Ce se întâmplă pe server |
|---|---|---|
| Lipsește `GEMINI_API_KEY` sau `TURNSTILE_SECRET_KEY` | Pe site, în locul formularului: „Vizualizarea e temporar indisponibilă. Lăsați o cerere” + linkul spre formularul obișnuit. În admin: „Generarea nu e configurată.” | `viz-start` întoarce `503 viz_off`. Pagina îl cere la încărcare (`GET /api/contact?action=viz-status` → `{ enabled }`). |
| Turnstile nu trece sau Cloudflare nu răspunde | „Nu am putut verifica că nu sunteți robot. Reîncărcați pagina și încercați din nou.” | Nimic salvat, fără generare. |
| Câmpuri greșite | Câmpurile marcate cu roșu, ca la contact | `400 invalid` cu lista câmpurilor |
| Poză prea mare / format greșit / mai mult de 3 | Mesaj lângă poze, înainte de trimitere | Verificat și pe server (mime, mărime) |
| O limită atinsă | Mesajul din tabelul „Limite” | Cererea e salvată (public), anunțul pleacă |
| Gemini răspunde cu eroare sau nu răspunde | „Schița nu s-a putut genera acum. Cererea e salvată, vă contactăm.” Echipa vede „Serviciul nu răspunde, încearcă din nou.” | `failed`, nu se numără; eroarea în log, fără cheie |
| Timeout (peste 50 s) | „Generarea a durat prea mult. Încercați din nou.” (echipa: buton „Încearcă din nou”) | `failed`, nu se numără |
| Fonduri epuizate / cheie blocată (Google 403/429 de facturare) | Ca la „serviciul nu răspunde” | `failed`; pe Telegram, proprietarului, o dată pe zi: „Generarea imaginilor nu merge: <cod>. Verifică facturarea Google.” |
| Filtrul de siguranță Google refuză | „Poza nu a putut fi folosită. Încercați altă poză.” | `rejected`, se numără |
| Vizitatorul închide pagina în timpul generării | — | Generarea se termină pe server și ajunge pe fișă |
| Internetul cade la încărcarea pozelor | „Încărcarea s-a întrerupt. Încercați din nou.” Reîncercarea folosește același `token` cât e valabil (15 minute). | Rezervarea expiră singură |
| Supabase nu răspunde | Vezi „Legătura cu CRM” | Telegram cu avertisment |

## Date și drepturi de acces

### Migrarea `2026-10-30-vizualizare.sql`
1. `requests_source_check` primește și `'vizualizare'`.
2. Tabelul nou `generations`, cu RLS activat și acces doar cu `service_role`, ca restul:
   - `id` uuid pk, `created_at` timestamptz;
   - `request_id` uuid, nullable, `references requests(id) on delete cascade`; gol = lista generală;
   - `origin` text, `check in ('public','team')`;
   - `kind` text, `check in ('casa_noua','fatada','interior')`;
   - `wishes` text, cel mult 1000 de caractere;
   - `status` text, `check in ('pending','done','failed','rejected')`;
   - `error` text, implicit `''`;
   - `model` text;
   - `input_paths` text[];
   - `output_path` text, implicit `''`;
   - `actor` text, implicit `''`: autorul din Mini App, `owner` din browser, gol pentru vizitator;
   - `actor_key` text: cheia pentru limită (`tg:<id>`, `owner`, amprenta IP);
   - `phone_key` text, implicit `''`: telefonul normalizat, doar la public;
   - `token` text unic, `token_expires_at` timestamptz;
   - indexuri pe `(origin, created_at)`, `(actor_key, created_at)`, `phone_key`, `request_id`.
3. La ștergerea unei cereri, rândurile dispar prin `cascade`. **Fișierele din Storage le șterge codul** din `requests/[id].js` (DELETE), înainte de ștergerea rândului, ca la documente.

### Cine ce vede
- **Vizitatorul:** doar schița lui, prin linkul de 1 oră primit la generare. Nu vede nimic altceva, nu are istoric.
- **Proprietarul:** tot.
- **Angajatul:** generările de pe fișele pe care le vede deja și toată lista generală. Șterge doar generările lui. Nu există câmpuri cu bani, deci nu e nimic de ascuns.
- **Date personale:** numele, telefonul, emailul și pozele casei omului.
  - IP-ul se păstrează doar ca amprentă;
  - telefonul normalizat (`phone_key`) servește doar limitei;
  - pozele și schițele stau în bucketul privat și se deschid doar prin linkuri semnate;
  - se șterg odată cu cererea.

## Servicii externe
| Serviciul | Pentru ce | Variabile Vercel | Dacă nu răspunde |
|---|---|---|---|
| Google Gemini API | Generarea schiței | `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` (opțional) | `failed`, mesaj clar; cererea rămâne |
| Cloudflare Turnstile | Anti-roboți pe site | `TURNSTILE_SITE_KEY` (publică, ajunge în pagină prin `viz-status`), `TURNSTILE_SECRET_KEY` | Fără verificare nu se generează și nu se salvează (pe site rămâne formularul obișnuit de contact) |
| Supabase (DB + Storage) | Cererea, generările, fișierele | existente | Ca la contact: Telegram cu avertisment |
| Telegram (botul de notificări) | Anunțul despre cerere | existente | Doar log |

## Funcții Vercel (limita de 12 pe Hobby)
- **Nu se adaugă fișiere în `api/`** (în afară de `api/_lib/`, care nu se numără).
- **Partea publică** extinde `api/contact.js` cu `?action=viz-status|viz-start|viz-generate`. Fără `action`, ruta e formularul de contact de azi, neschimbat.
- **Partea echipei** extinde `api/admin/docs/[action].js` cu `viz-upload|viz-generate|viz-list|viz-open|viz-delete`.
- **Codul comun** (apelul la Gemini, prompturile, limitele, Turnstile) merge în `api/_lib/imagegen.js` și `api/_lib/turnstile.js`.
- În `vercel.json` se adaugă `maxDuration: 60` pentru `api/contact.js`.

## Nu intră în această sarcină
- Integrarea produsului în interior, imaginile pentru oferte și postări, proba de stil, cardul de fidelitate.
- OpenAI / GPT Image.
- Conturi pentru vizitatori și istoricul lor pe site.
- Verificarea telefonului prin SMS.
- Generarea din Mini App pentru clienți (Mini App rămâne doar pentru echipă).
- O oprire automată a cheltuielilor în Google (există doar alerta; oprirea o fac limitele din cod).

## Întrebări deschise pentru implementare
- Numele exact al modelului disponibil pe cheia utilizatorului (vezi „Generarea”). Dacă modelul implicit lipsește, se alege prima variantă de rezervă disponibilă și se notează în `GEMINI_IMAGE_MODEL`.
- Textul final al celor 3 prompturi: se ajustează după 3–5 probe pe poze reale (teren, fațadă, cameră).
- Dacă Gemini întoarce imaginea în alt format sau la altă mărime decât ~1024 px: se salvează așa cum vine (PNG/JPEG), fără conversie.
- Verificarea pe telefon, la 375 px: secțiunea nouă, formularul și rezultatul, fără scroll orizontal.
