# Recunoașterea documentelor — Etapa 2: Cheltuieli și raport financiar

## Pe scurt
Apare secțiunea **„Financiar”** în panoul de admin. Aici stau cheltuielile, cu furnizorul, numărul, data, suma fără TVA, TVA-ul, totalul, categoria și rândurile cu articole. Tot aici e un raport lunar cu venituri și cheltuieli pe categorii.

Cheltuielile se adaugă în trei feluri: din documentele recunoscute de Claude (**avize de expediere** și **chitanțe / facturi achitate**), manual sau, din Etapa 3, automat, când se plătește o factură din „De plătit”.

Veniturile sunt plățile clienților care există deja în CRM. Lei și euro nu se adună niciodată între ele.

**Depinde de Etapa 1:** butonul „Încarcă document”, recunoașterea tipului, ecranul de verificare, `documents` și Storage (`2026-10-30-ocr-carti-vizita.md`).

## Pornim de la ce există
- Toată baza din Etapa 1: `api/_lib/claude.js`, `api/_lib/storage.js`, `docs/upload|read|save|cancel`, tabelul `documents`, bucketul `documente`. În `DOC_TYPES`, tipurile `aviz` și `chitanta` devin „gata” (`supported: true`).
- Plățile clienților stau în `payments` (`paid_on`, `amount`), iar moneda e cea a clientului (`requests.currency`, MDL/EUR). Funcțiile pentru sume sunt în `api/_lib/money.js`.
- O singură parolă de admin, fără roluri. Migrațiile le rulează utilizatorul.

## Pentru cine e
Proprietarul, de pe telefon sau de pe calculator.

## Pașii principali
### Din document
1. „Încarcă document” → Claude recunoaște `aviz` sau `chitanta` (tipul se poate schimba, ca în Etapa 1).
2. Pe ecranul de verificare apar câmpurile:
   - **Furnizor** (obligatoriu), **Cod fiscal (IDNO)**, **Număr document**, **Data** (obligatorie);
   - **Moneda** (MDL/EUR, implicit MDL), **Sumă fără TVA**, **TVA**, **Total** (obligatoriu);
   - **Categorie** (obligatorie; Claude o propune), **Notă**;
   - **Articole**: rânduri cu Denumire, Cod, Unitate, Cantitate, Preț unitar și Sumă. Fiecare rând se poate modifica sau șterge și se pot adăuga rânduri noi.
3. Verificări care **avertizează, dar nu blochează** (mesaj galben deasupra butonului „Salvează”):
   - „Suma fără TVA + TVA nu dă totalul” (diferență mai mare de 0,05);
   - „Suma articolelor (X) diferă de suma fără TVA / total (Y)”. Rândurile se compară cu suma fără TVA sau, dacă ea lipsește, cu totalul. Diferența permisă e 0,05.
4. **Duplicat:** dacă există deja o cheltuială cu același furnizor (fără diferență de litere mari și mici), același număr și aceeași dată, apare „Pare deja înregistrată: <furnizor>, nr. <număr>, <dată>”, cu butoanele „Deschide” și „Salvează oricum”.
5. „Salvează” → cheltuiala se creează, iar documentul se leagă de ea. Se deschide fișa cheltuielii.

### Manual
6. În „Financiar” → „Cheltuieli” → **„Adaugă cheltuială”** se deschid aceleași câmpuri, goale și fără document.

### Lista și fișa
7. „Financiar” are două file: **„Cheltuieli”** și **„Raport”**.
8. **Cheltuieli**: lista ordonată după dată, cele mai noi primele. Fiecare rând are data, furnizorul, categoria, totalul cu moneda și o pictogramă dacă are document. Filtre: luna (implicit luna curentă, cu opțiunea „Toate”), categoria și căutarea după furnizor sau număr. Deasupra listei apare totalul filtrului, separat pe monede: `Total: 12 500 MDL · 300 EUR`.
9. **Fișa cheltuielii**: toate câmpurile se pot modifica, inclusiv articolele. Mai are secțiunea „Documente” (deschide originalul, ca în Etapa 1) și butonul „Șterge”, care cere confirmarea „Ștergi cheltuiala <furnizor>, <total>? Se șterge și documentul.”
10. **Raport**: un tabel cu ultimele 12 luni, inclusiv luna curentă, cele mai noi primele. Pentru fiecare monedă care are date în perioadă există un bloc separat, MDL și/sau EUR, cu coloanele:
    `Luna | Venituri | Cheltuieli | Rezultat`.
    Rezultatul negativ apare în roșu. Sub tabel apar totalurile pe 12 luni.
11. Apăsarea pe o lună din raport deschide detaliul lunii: cheltuielile pe categorii (suma și procentul), separat pe monede, plus lista plăților primite în acea lună (client, dată, sumă), cu link spre fișa clientului.

## Ce trebuie să funcționeze
### Obligatoriu în prima versiune
- [ ] Navigarea în antetul panoului: „CRM | Financiar”. Pe 375px nu apare scroll orizontal.
- [ ] Categoriile sunt o listă fixă, în `labels.js` → `EXPENSE_CATEGORIES`:
  - `materiale` – Materiale;
  - `echipamente` – Echipamente și IT;
  - `software` – Software și abonamente;
  - `transport` – Transport și combustibil;
  - `chirie` – Chirie și utilități;
  - `subcontractori` – Subcontractori și servicii;
  - `birou` – Birou și consumabile;
  - `taxe` – Taxe și impozite;
  - `altele` – Altele.
- [ ] Claude propune categoria (unealta `aviz` / `chitanta` primește lista de coduri). Dacă nu știe, pune `altele`.
- [ ] Unealta Claude pentru `aviz` și `chitanta` întoarce:
  - `supplier`, `supplier_idno`, `doc_number`, `doc_date` (YYYY-MM-DD), `currency`, `amount_net`, `vat`, `amount_total`, `category`;
  - `items[]`: `{ name, code, unit, qty, unit_price, line_total }`.
  Ce lipsește rămâne gol. Dacă documentul e într-o altă monedă decât MDL/EUR, Claude scrie moneda în `note` („Moneda pe document: USD”), iar `currency` rămâne MDL. Utilizatorul decide.
- [ ] Validarea pe server:
  - Furnizor: 1–200 de caractere.
  - Data: obligatorie, nu în viitor (ora Chișinăului).
  - Totalul: obligatoriu, mai mare ca 0.
  - Suma fără TVA și TVA-ul: opționale, ≥ 0, implicit TVA = 0. Toate sumele au cel mult 2 zecimale și cel mult 99 999 999,99, ca la plăți.
  - Cantitatea: cel mult 3 zecimale.
  - Rândurile: cel mult 300. Fiecare rând trebuie să aibă denumirea, iar celelalte câmpuri sunt opționale.
  - Nota: cel mult 1000 de caractere.
- [ ] Sumele se afișează ca în CRM (`12 500 MDL`, `3 000,50 EUR`).
- [ ] Pe telefon, articolele apar ca un șir de carduri mici, nu ca tabel lat.
- [ ] Raportul:
  - venituri = suma `payments.amount` după luna `paid_on`, grupată după `requests.currency`;
  - cheltuieli = suma `expenses.amount_total` (cu TVA) după luna `doc_date`, grupată după `currency`;
  - lunile se socotesc după data documentului sau a plății, nu după data introducerii.
  Totalurile se calculează pe server.
- [ ] Ștergerea unei cheltuieli șterge și articolele (`cascade`), rândurile din `documents` și fișierele din Storage.
- [ ] Butoanele „Salvează” și „Șterge” se dezactivează cât timp lucrează.

### De dorit
- [ ] Graficul cu bare pentru venituri și cheltuieli pe 12 luni, câte unul pentru fiecare monedă.
- [ ] Furnizorii introduși anterior apar ca sugestii în câmpul „Furnizor”.
- [ ] Adăugarea unui document la o cheltuială introdusă manual.

### Mai târziu
- Conversia MDL ↔ EUR (cursul BNM) și totalul unic.
- Legătura articolelor cu catalogul (Etapa 4).
- Exportul în CSV/Excel, rapoarte pentru contabil, TVA de dedus.
- Categorii editabile din interfață.
- Cheltuieli legate de un proiect sau client.

## Erori și cazuri limită
- **Câmp greșit sau gol:** câmpul se marchează, iar sub el apare un mesaj („Introdu totalul”, „Data nu poate fi în viitor”).
- **Serverul sau baza nu răspund:** apare mesajul „Nu s-a salvat. Încearcă din nou.”, iar formularul păstrează ce ai scris.
- **Claude n-a găsit rândurile** (bon fiscal neclar): cheltuiala se salvează fără articole. Articolele sunt opționale.
- **Claude a citit TVA-ul ca sumă fără TVA:** apare avertismentul de la pasul 3. Utilizatorul corectează.
- **Cheltuiala e ștearsă între timp:** apare `404` cu mesajul „Cheltuiala nu mai există”, iar lista se reîncarcă.
- **Lună fără date:** rândul apare cu `—`. O monedă fără date în 12 luni nu are deloc bloc.
- **Clientul cu plăți e șters:** plățile dispar și din venituri (`cascade`, comportament existent).
- **Restul erorilor de încărcare și citire:** ca în Etapa 1.

## Date și drepturi de acces
### Tabel nou `expenses`
- `id bigint generated always as identity primary key`
- `source text not null check (source in ('aviz', 'chitanta', 'manual', 'de_platit'))`: `de_platit` se folosește din Etapa 3
- `supplier text not null`, `supplier_idno text not null default ''`, `doc_number text not null default ''`
- `doc_date date not null`
- `currency text not null default 'MDL' check (currency in ('MDL','EUR'))`
- `amount_net numeric(12,2) check (amount_net is null or amount_net >= 0)`
- `vat numeric(12,2) not null default 0 check (vat >= 0)`
- `amount_total numeric(12,2) not null check (amount_total > 0)`
- `category text not null check (category in (…lista…))`
- `note text not null default ''`
- `created_at timestamptz not null default now()`
- indexuri: `(doc_date desc)`, `(lower(supplier), doc_number, doc_date)`

### Tabel nou `expense_items`
- `id bigint generated always as identity primary key`
- `expense_id bigint not null references public.expenses (id) on delete cascade`
- `pos smallint not null`: ordinea rândului
- `name text not null`, `code text not null default ''`, `unit text not null default ''`
- `qty numeric(14,3)`, `unit_price numeric(12,2)`, `line_total numeric(12,2)`
- index pe `(expense_id, pos)`

### `documents`
- Coloana nouă: `expense_id bigint null references public.expenses (id) on delete cascade`.
- Regula devine `check (num_nonnulls(request_id, expense_id) = 1)`.

RLS e activat pe tabelele noi, fără politici. Migrarea e `supabase/migrations/<data>-ocr-etapa2.sql`, cu actualizarea `schema.sql`. Datele nu sunt personale (doar furnizori). Le vede doar adminul.

### Ce schimbăm în API
Toate rutele cer `requireAdmin`.
- `docs/read` și `docs/save` tratează `aviz` și `chitanta`. `save` creează `expenses` și `expense_items` și leagă documentele. Duplicatul întoarce `409 { duplicates }`, iar `force` trece peste el.
- `GET /api/admin/expenses?month=YYYY-MM|all&category=&q=` → lista (fără articole) și totalurile pe monede.
- `GET /api/admin/expenses?id=` → o cheltuială, cu `items` și `documents`.
- `POST /api/admin/expenses` (manual), `PATCH ?id=` (inclusiv înlocuirea completă a listei `items`), `DELETE ?id=` (șterge și fișierele din Storage).
- `GET /api/admin/report?months=12` → `{ months: [{ month, MDL: { income, expense }, EUR: {…} }], totals }`.
- `GET /api/admin/report?month=YYYY-MM` → detaliul lunii: categoriile pe monede și plățile din lună.

## Servicii externe
Niciunul nou. Se folosesc Claude și Supabase din Etapa 1, cu aceleași reguli la erori.

## Ce nu intră în această sarcină
- Conversia valutară, exporturile, rapoartele fiscale.
- Legătura cu catalogul.
- Scadențele (Etapa 3).

## Întrebări rămase (le rezolvă programatorul)
- **Agregarea pentru raport:** prin PostgREST nu există `group by` direct. Se poate face o funcție SQL (`rpc`) sau se pot aduna rândurile pe server, pentru că la volumul unui birou (sute de rânduri pe an) e suficient. Varianta `rpc` e mai curată.
- **Fișierele din Storage la ștergere:** se șterg din cod, nu prin `cascade`. Dacă ștergerea fișierelor eșuează, cheltuiala se șterge oricum, iar eroarea se scrie în log.
