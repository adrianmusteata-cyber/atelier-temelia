# Recunoașterea documentelor — Etapa 4: Catalog (liste de prețuri ale furnizorilor)

## Pe scurt
Apare secțiunea **„Catalog”**, cu produsele furnizorilor și prețurile lor actuale. Proprietarul încarcă lista de prețuri a unui furnizor (poză sau PDF), iar Claude citește rândurile. Pe ecranul de verificare se vede, pentru fiecare rând, dacă produsul e nou, dacă prețul s-a schimbat sau dacă rândul e nesigur. După salvare, prețurile se actualizează, iar prețul vechi rămâne în istoric. Catalogul are o căutare simplă.

**Depinde de Etapa 1** (încărcare, recunoaștere, `documents`, Storage). Nu depinde de etapele 2–3.

## Pornim de la ce există
- Etapa 1: `docs/*`, `documents`, Storage, `DOC_TYPES` cu `lista_preturi`. Tipul devine acum „gata”.
- Monedele sunt MDL și EUR, ca în restul aplicației. Sumele se scriu cu `money.js`.
- În Etapa 1, limita pentru PDF este 10 MB și 20 de pagini, iar pentru poze este 5 poze.

## Pentru cine e
Proprietarul.

## Pașii principali
1. „Încarcă document” → Claude recunoaște `lista_preturi`.
2. Ecranul de verificare (pe calculator e un tabel, pe telefon un șir de carduri):
   - **Furnizor**. Serverul caută furnizorul după IDNO și, dacă IDNO lipsește, după numele exact (fără diferență de litere mari și mici și fără spațiile de la capete). Dacă îl găsește, e ales automat, cu opțiunea „Schimbă” și o listă cu furnizorii existenți. Dacă nu, apare „Furnizor nou: <nume>”, cu numele editabil.
   - **Data listei** (implicit data de pe document; dacă lipsește, azi) și **Moneda** listei (MDL/EUR).
   - **Rândurile**: Cod, Denumire, Unitate și Preț, plus o **stare** calculată de server:
     - **Nou**: nu există în catalogul furnizorului;
     - **Preț schimbat**: arată `vechi → nou` și diferența în % (verde dacă a scăzut, roșu dacă a crescut);
     - **Neschimbat**;
     - **Nesigur**, cu fundal galben, plus motivul (vezi „Potrivirea produselor”).
   - La fiecare rând se poate bifa sau debifa „Include” (implicit bifat), iar câmpurile se pot corecta. După orice corectare, starea rândului se recalculează.
   - Filtre deasupra rândurilor: „Toate”, „Nesigure”, „Noi”, „Prețuri schimbate”, fiecare cu numărul de rânduri.
   - Sus apare rezumatul: `120 rânduri: 15 noi, 40 prețuri schimbate, 60 neschimbate, 5 nesigure`.
3. La fiecare rând **nesigur**, utilizatorul alege:
   - „Același cu: <produs existent>”, propus de server, cu posibilitatea de a alege altul dintr-o căutare;
   - sau „Produs nou”.
   Butonul „Salvează” rămâne inactiv cât timp există rânduri nesigure bifate și nerezolvate, cu mesajul „Rezolvă rândurile nesigure (N) sau debifează-le”.
4. „Salvează”:
   - se creează furnizorul, dacă e nou;
   - se creează lista de prețuri, iar documentul se leagă de ea;
   - pentru fiecare rând bifat, se creează produsul sau i se actualizează prețul, iar în istoric se scrie un rând nou.
5. Apoi se deschide pagina furnizorului, cu produsele lui, iar sus apare rezumatul importului.

### Catalogul
6. „Catalog” afișează o **căutare** (după denumire sau cod, cu potrivire parțială, fără diferență de litere mari și mici) și un **filtru după furnizor**.
7. Lista produselor: denumirea, codul, furnizorul, unitatea, prețul actual cu moneda și data prețului. Ordinea e alfabetică. Se încarcă câte 50 de produse, cu butonul „Mai multe”.
8. Fișa produsului:
   - **istoricul prețurilor** (data, prețul, moneda și lista din care vine, cu link spre documentul original);
   - butoanele „Modifică” (denumire, cod, unitate, preț manual) și „Șterge”, care cere confirmare.
9. Pagina furnizorului: numele și IDNO-ul (editabile), listele de prețuri încărcate (data, numărul de rânduri, documentul) și produsele lui.
10. Butonul „Adaugă produs” permite adăugarea manuală (furnizor, denumire, cod, unitate, preț, monedă).

## Potrivirea produselor
Un rând din lista nouă e comparat **doar cu produsele aceluiași furnizor**:
1. **Rândul are cod:** se caută un produs cu același cod. Codurile se compară fără diferență de litere mari și mici și fără spații.
   - Găsit → același produs.
   - Negăsit → „Nou”. Rândul devine însă **nesigur** („Cod nou, dar denumirea există deja”) dacă există un produs cu aceeași denumire exactă.
2. **Rândul nu are cod:** se caută un produs **fără cod** cu aceeași denumire exactă (fără diferență de litere mari și mici, cu spațiile multiple reduse la unul și fără spațiile de la capete).
   - Găsit → același produs.
   - Negăsit → „Nou”. Rândul devine **nesigur** („Denumire asemănătoare cu: <produs>”) dacă există un produs a cărui denumire, după ce se scot semnele de punctuație, e identică sau foarte apropiată. Pragul e de cel mult 2 caractere diferite (distanța Levenshtein ≤ 2) sau una dintre denumiri o conține pe cealaltă.
3. **Rânduri nesigure și din alte motive:**
   - Claude a marcat rândul ca citit neclar (`uncertain: true`, de exemplu cifre șterse, sau prețul nu se vede);
   - prețul s-a schimbat cu peste 50% față de cel actual (poate fi o greșeală de citire: „Preț schimbat cu +120%, verifică”);
   - două rânduri din aceeași listă dau peste același produs.
4. Rândurile fără preț sau fără denumire nu se pot include până nu sunt completate.

## Ce trebuie să funcționeze
### Obligatoriu în prima versiune
- [ ] Navigarea are în plus „Catalog”. Pe 375px nu apare scroll orizontal.
- [ ] Unealta Claude pentru `lista_preturi` întoarce:
  - `supplier`, `supplier_idno`, `list_date`, `currency`;
  - `rows[]: { code, name, unit, price, uncertain }`.
  Ca preț se ia cel fără TVA, dacă lista le are pe amândouă. Dacă lista are doar prețul cu TVA, se ia acela, iar în nota listei se scrie „Prețuri cu TVA”. Utilizatorul vede nota.
- [ ] Limite pentru listele de prețuri: PDF de cel mult 20 MB (mai mult decât în Etapa 1, doar pentru acest tip) și 20 de pagini, cel mult 1000 de rânduri. Dacă Claude nu poate întoarce toate rândurile într-un răspuns, citirea se face pe bucăți de pagini (vezi „Întrebări rămase”).
- [ ] Prețul: > 0, cel mult 2 zecimale și cel mult 99 999 999,99. Denumirea: 1–300 de caractere. Codul și unitatea: cel mult 50 de caractere fiecare.
- [ ] **Actualizarea prețului:**
  - dacă data listei e **aceeași sau mai nouă** decât data prețului actual, prețul actual devine cel nou;
  - dacă lista e **mai veche**, prețul nou se scrie doar în istoric, iar prețul actual rămâne. Pe ecranul de verificare apare indicația „Listă mai veche decât prețul actual”.
- [ ] Dacă moneda listei diferă de moneda actuală a produsului, prețul actual se înlocuiește cu cel nou, în moneda nouă, iar istoricul păstrează ambele. Pe ecran apare avertismentul „Moneda produsului se schimbă din EUR în MDL”.
- [ ] Produsele care **nu apar** în lista nouă nu se șterg și nu se schimbă. În pagina furnizorului au eticheta discretă „nu apare în ultima listă”.
- [ ] Ștergerea unui produs îi șterge și istoricul. Ștergerea unei liste de prețuri **nu** schimbă produsele: rândurile din istoric rămân, doar fără legătură, iar documentul se șterge.
- [ ] Butonul „Salvează” se dezactivează cât timp lucrează. Importul se face într-o singură operație (totul sau nimic).

### De dorit
- [ ] Sortarea listei din catalog după preț sau după dată.
- [ ] Compararea aceluiași produs la furnizori diferiți (căutarea arată toate rezultatele, grupate).
- [ ] Fuzionarea a doi furnizori introduși de două ori.

### Mai târziu
- Importul din Excel/CSV (furnizorii trimit des liste în Excel; e mai sigur și mai ieftin decât citirea pozelor).
- Exportul catalogului.
- Legătura cu articolele din cheltuieli (Etapa 2), adică prețul real plătit comparat cu prețul din listă.
- Calculul ofertelor sau devizelor din catalog.

## Erori și cazuri limită
- **Lista e foarte lungă sau citirea durează prea mult:** peste limita de timp apare mesajul „Lista e prea lungă pentru o citire. Încarcă mai puține pagini odată.” Nu se salvează nimic.
- **Aceeași listă încărcată de două ori:** toate rândurile ies „Neschimbat”, iar sus apare „Pare aceeași listă ca cea din <dată>. Salvezi oricum?”. Lista se consideră aceeași dacă are același furnizor, aceeași dată și același număr de rânduri.
- **Claude a citit greșit o cifră:** regula „schimbare peste 50% = nesigur” prinde cele mai multe greșeli. Restul le prinde utilizatorul pe ecranul de verificare.
- **Furnizor ales greșit:** „Schimbă” recalculează stările tuturor rândurilor pentru furnizorul nou ales.
- **Erori de server sau de citire:** ca în Etapa 1 („Nu s-a salvat. Încearcă din nou.”, iar ecranul de verificare își păstrează corecturile).

## Date și drepturi de acces
### Tabel nou `suppliers`
- `id bigint generated always as identity primary key`
- `name text not null`, `idno text not null default ''`
- `created_at timestamptz not null default now()`
- unic: `(idno) where idno <> ''`
- index pe `lower(name)`

### Tabel nou `price_lists`
- `id bigint generated always as identity primary key`
- `supplier_id bigint not null references public.suppliers (id) on delete cascade`
- `list_date date not null`
- `currency text not null check (currency in ('MDL','EUR'))`
- `rows_count integer not null`, `note text not null default ''`
- `created_at timestamptz not null default now()`

### Tabel nou `products`
- `id bigint generated always as identity primary key`
- `supplier_id bigint not null references public.suppliers (id) on delete cascade`
- `code text not null default ''`, `name text not null`, `unit text not null default ''`
- `price numeric(12,2) not null check (price > 0)`, `currency text not null check (currency in ('MDL','EUR'))`, `price_date date not null`
- `last_list_id bigint null references public.price_lists (id) on delete set null`
- `created_at`, `updated_at timestamptz not null default now()`
- unic: `(supplier_id, lower(code)) where code <> ''`
- unic: `(supplier_id, lower(name)) where code = ''`
- index pentru căutare: `lower(name)`, eventual `pg_trgm` (vezi „Întrebări rămase”)

### Tabel nou `price_history`
- `id bigint generated always as identity primary key`
- `product_id bigint not null references public.products (id) on delete cascade`
- `price numeric(12,2) not null`, `currency text not null`, `price_date date not null`
- `price_list_id bigint null references public.price_lists (id) on delete set null`
- `created_at timestamptz not null default now()`

### `documents`
- Coloana nouă: `price_list_id bigint null references public.price_lists (id) on delete cascade`.
- `price_list_id` se adaugă în regula `num_nonnulls(...) = 1`.

RLS e activat pe tabelele noi, fără politici. Migrarea e `supabase/migrations/<data>-ocr-etapa4.sql`, cu actualizarea `schema.sql`. Fără date personale. Le vede doar adminul.

### Ce schimbăm în API
Toate rutele cer `requireAdmin`.
- `docs/read` pentru `lista_preturi` întoarce rândurile **deja comparate** cu catalogul: `status`, `match_product_id`, `old_price`, `reason`.
- `POST /api/admin/catalog/match` `{ supplier_id, rows }` → recalculează stările după corecturi sau după schimbarea furnizorului.
- `docs/save` pentru `lista_preturi` `{ token, supplier: { id } | { name, idno }, list_date, currency, rows: [{ include, code, name, unit, price, resolve: 'new' | <product_id> }] }` → importul atomic.
- `GET /api/admin/catalog?q=&supplier_id=&cursor=` → produsele, câte 50.
- `GET /api/admin/catalog?id=` → produsul, cu istoricul.
- `POST`, `PATCH`, `DELETE /api/admin/catalog` (produs).
- `GET` și `PATCH /api/admin/suppliers?id=` → furnizorul, cu listele lui de prețuri.
- `DELETE /api/admin/price-lists?id=` → șterge lista de prețuri.

## Servicii externe
Niciunul nou. Citirea listelor lungi costă mai mult: o listă de 10 pagini costă aproximativ 10–30 de cenți. Se aplică aceeași limită de 30 de citiri pe oră.

## Ce nu intră în această sarcină
- Excel/CSV, exportul, legătura cu cheltuielile, devizele.
- Prețuri pentru clienți (adaosuri) și stocuri.

## Întrebări rămase (le rezolvă programatorul)
- **Listele lungi:** un răspuns Claude are o limită de lungime. Variante:
  - `max_tokens` mare plus *streaming*;
  - citirea pe bucăți de pagini (pozele se trimit câte 2–3; PDF-ul se trimite întreg, cu instrucțiunea „doar paginile X–Y”, în apeluri succesive).
  Vercel permite funcții de până la 300 s, iar pentru `docs/read` se ridică `maxDuration` la nevoie. De testat pe o listă reală de 10–20 de pagini.
- **Importul atomic** (furnizor + listă + produse + istoric): o funcție SQL (`rpc`) care primește JSON-ul rândurilor. E recomandată.
- **Căutarea:** pentru câteva mii de produse ajunge `ilike '%q%'`. Extensia `pg_trgm` e necesară doar dacă devine lent.
- **„Denumire foarte apropiată”:** distanța Levenshtein se calculează pe server, în JS, doar față de produsele aceluiași furnizor. La câteva sute de produse pe furnizor e suficient.
