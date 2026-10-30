# Recunoașterea documentelor — Etapa 3: Scadențe („De plătit” și „De încasat”)

## Pe scurt
Apare secțiunea **„Scadențe”**, cu două liste separate:
- **De plătit**: facturile și contractele primite de la furnizori sau subcontractori, cu data până la care trebuie plătite. Când proprietarul marchează o factură „Plătită”, ea devine automat o cheltuială în „Financiar”.
- **De încasat**: sumele pe care clienții din CRM trebuie să le plătească până la o dată (factură emisă de noi sau rate dintr-un contract). Starea lor se calculează singură din plățile clientului care există deja în CRM.

Restanțele se văd în roșu. Nu se trimit notificări.

**Depinde de Etapa 1** (încărcare, recunoaștere, `documents`) și **de Etapa 2** (`expenses`, categorii, `expense_items`).

## Pornim de la ce există
- Etapa 1: `docs/*`, `documents`, Storage, `DOC_TYPES` cu `de_platit` și `de_incasat`. Aceste două tipuri devin acum „gata”.
- Etapa 2: `expenses` (cu `source = 'de_platit'` prevăzut), `expense_items`, `EXPENSE_CATEGORIES`, „Financiar”.
- CRM: `requests` (moneda clientului, `contract_value`) și `payments` (plățile primite). Sursa `document` există deja în regula `source` (Etapa 1).
- Fără Resend sau notificări (amânat).

## Pentru cine e
Proprietarul.

## Pașii principali
### De plătit, din document
1. „Încarcă document” → Claude recunoaște `de_platit`.
2. Ecranul de verificare are câmpurile:
   - **Furnizor** (obligatoriu), **IDNO**, **Număr**, **Data documentului** (obligatorie);
   - **Moneda**, **Sumă fără TVA**, **TVA**, **Total**;
   - **Categorie** (propusă de Claude), **Notă**, **Articole** (ca în Etapa 2);
   - **Scadențe**: unul sau mai multe rânduri `{ data scadenței, sumă }`. O factură are de obicei un singur rând. Un contract cu rate are mai multe.
3. Dacă documentul nu are o dată de plată, Claude lasă câmpul gol, iar ecranul propune „data documentului + 30 de zile”, marcată „propusă”. Câmpul e obligatoriu la salvare.
4. Avertisment (nu blochează): „Suma ratelor (X) diferă de total (Y)”.
5. Duplicat: același furnizor + număr + dată ca o factură „De plătit” existentă → „Pare deja înregistrată”, cu „Deschide” și „Salvează oricum”.
6. „Salvează” → se creează un document de plătit cu ratele lui.

### De plătit, plata
7. În listă sau în fișă, fiecare rată are butonul **„Marchează plătită”**. Se deschide un mic formular cu **data plății** (implicit azi, nu poate fi în viitor) și **suma**, completată cu suma ratei. Apoi „Salvează”.
8. La salvare, rata devine „Plătită”, iar în `expenses` se creează automat o cheltuială:
   - `source = 'de_platit'`;
   - furnizorul, numărul, categoria și moneda sunt cele ale documentului;
   - `doc_date` = data plății, iar `amount_total` = suma plătită;
   - `vat` și `amount_net` se împart proporțional (cât reprezintă rata din total), rotunjite la 2 zecimale;
   - articolele se copiază doar dacă documentul are o singură rată.
   Cheltuiala are un link înapoi spre documentul de plătit.
9. „Anulează plata” pe o rată plătită cere confirmarea „Anulezi plata? Cheltuiala creată automat se șterge.” Apoi rata redevine „Neplătită”, iar cheltuiala legată se șterge.

### De încasat, din document
10. „Încarcă document” → Claude recunoaște `de_incasat` (document emis de noi către client).
11. Ecranul de verificare are câmpurile:
    - **Client** (obligatoriu): se alege dintre clienții din CRM. Serverul propune potriviri după email, telefon (ultimele 8 cifre) sau nume (conține, fără diferență de litere mari și mici), plus butonul **„Client nou”**;
    - **Număr**, **Data documentului**, **Moneda**, **Total**, **Notă**;
    - **Scadențe**: rânduri `{ data scadenței, sumă }`, ca la pasul 2.
12. „Client nou” creează clientul din datele contrapărții (nume, telefon, email; dacă lipsesc telefonul și emailul, cere unul) cu `source = 'document'`, `status = 'noua'`, `channel = ''`. Se aplică verificarea de duplicate din Etapa 1.
13. Moneda: dacă moneda documentului diferă de moneda clientului, apare avertismentul „Clientul are moneda EUR, documentul e în MDL. Sumele nu se convertesc.”, cu butoanele „Schimbă moneda clientului” sau „Folosește moneda clientului”. Nu se salvează sume în altă monedă decât a clientului.
14. Dacă clientul nu are valoarea contractului completată și documentul e un contract, apare propunerea „Setezi valoarea contractului la <total>?”. La „Da” se completează `requests.contract_value`.
15. „Salvează” → se creează ratele de încasat pentru acel client.

### Manual
16. În fiecare listă, butonul **„Adaugă”** deschide aceleași câmpuri, fără document. În fișa clientului din CRM, secțiunea „Plăți” primește butonul **„Adaugă scadență”**, cu clientul deja ales.

### Listele
17. „Scadențe” are două file: **„De plătit”** și **„De încasat”**. Fiecare rând este o rată și arată:
    - data scadenței și furnizorul sau clientul;
    - numărul documentului;
    - suma și moneda;
    - starea: „Neplătită”, „Plătită <dată>”, „Achitată parțial X din Y”, „Achitată”.
18. Filtre: **„De achitat”** (implicit), „Restante”, „Toate”. Ordinea e după data scadenței, cele mai vechi primele.
19. **Restanță** = data scadenței e înaintea zilei de azi (ora Chișinăului), iar rata nu e achitată integral. Rândul are fundal sau bordură roșie și eticheta „Restant de N zile”.
20. **Scadența apropie** = rata nu e achitată, iar scadența e azi sau în următoarele 7 zile. Rândul are eticheta portocalie „Scadent în N zile”, sau „Scadent azi”.
21. Deasupra fiecărei liste apar totalurile pe monede: `De achitat: 25 000 MDL (restant 5 000 MDL) · 1 200 EUR`.
22. În antet, lângă „Scadențe”, apare un număr roșu cu câte rate restante sunt în ambele liste, dacă există.

## Cum se calculează „De încasat”
- Ratele de încasat **nu se marchează de mână**. Starea lor vine din `payments` ale clientului.
- Regula: toate plățile clientului, în ordinea `paid_on`, acoperă ratele în ordinea scadenței (`due_date`, apoi `id`). Fiecare plată completează întâi cea mai veche rată neacoperită.
  - Exemplu: rate 5 000 (01.11) + 5 000 (01.12), plăți 3 000 + 4 000 → prima rată „Achitată”, a doua „Achitată parțial 2 000 din 5 000”.
- Plățile care depășesc suma tuturor ratelor nu schimbă nimic, pentru că totul e deja achitat.
- Calculul se face pe server, la fiecare citire. Nu se salvează nimic în plus.
- În fișa clientului din CRM, secțiunea „Plăți” arată în plus lista ratelor, cu starea fiecăreia.
- Pe cardul clientului de pe tablă apare eticheta roșie „Restant”, dacă clientul are o rată restantă.

## Ce trebuie să funcționeze
### Obligatoriu în prima versiune
- [ ] Navigarea: „CRM | Financiar | Scadențe”, cu numărul de restanțe. Pe 375px nu apare scroll orizontal, iar pe telefon listele sunt carduri.
- [ ] Unealta Claude pentru `de_platit` întoarce câmpurile din Etapa 2 plus `installments[]: { due_date, amount }`.
- [ ] Unealta Claude pentru `de_incasat` întoarce:
  - `counterparty: { name, idno, phone, email }`;
  - `doc_number`, `doc_date`, `currency`, `amount_total`, `is_contract`;
  - `installments[]`.
- [ ] Validări:
  - cel puțin o rată și cel mult 60;
  - data scadenței e obligatorie și poate fi și în trecut (documente vechi);
  - suma ratei > 0, cel mult 2 zecimale și cel mult 99 999 999,99;
  - plata „Marchează plătită”: data nu poate fi în viitor, suma > 0.
- [ ] O rată „De plătit” se plătește **o singură dată**, integral sau cu altă sumă decât cea scrisă (de exemplu, cu o reducere). Plățile parțiale repetate către furnizori nu intră în prima versiune.
- [ ] Modificarea sau ștergerea unei rate deja plătite din „De plătit” se poate face doar după „Anulează plata”.
- [ ] Ștergerea unui document de plătit cere confirmare și șterge ratele și documentele din Storage. Cheltuielile create deja din plăți **rămân**, pentru că banii au fost dați. Doar legătura lor devine goală.
- [ ] Ștergerea unei rate de încasat nu atinge `payments`.
- [ ] Un client șters își șterge ratele de încasat (`cascade`).
- [ ] Ziua de azi și restanțele se calculează după `Europe/Chisinau`.

### De dorit
- [ ] Pe cardul CRM apare suma restantă, de exemplu „Restant 5 000 MDL”.
- [ ] Filtrul după furnizor sau client și căutarea în liste.
- [ ] Butonul „Adaugă plata” direct din rândul unei rate de încasat (deschide formularul de plată al clientului, cu suma ratei).

### Mai târziu
- Notificări pe email sau în Telegram despre scadențe și restanțe (după Resend).
- Plăți parțiale repetate către furnizori.
- Penalități de întârziere și conversia valutară.
- Legarea manuală a unei plăți de o anumită rată (în loc de regula „cea mai veche întâi”).

## Erori și cazuri limită
- **Data scadenței lipsește din document:** se propune data documentului + 30 de zile, marcată „propusă”.
- **Contractul are rate în procente** („30% avans, 70% la predare”): Claude calculează sumele din total. Dacă o dată nu e fixă („la predare”), rata rămâne fără dată, iar câmpul e marcat ca obligatoriu de completat.
- **Clientul nu e găsit:** se folosește „Client nou”. Fără client ales, nu se poate salva („Alege clientul”).
- **Documentul e emis de noi, dar Claude a ales `de_platit`, sau invers:** tipul se schimbă pe ecranul de verificare, iar câmpurile se recitesc (Etapa 1).
- **Plata a fost marcată de două ori** (dublu-clic sau alt tab): serverul refuză a doua marcare a unei rate deja plătite, cu `409` și mesajul „Rata e deja plătită”. Lista se reîncarcă.
- **Cheltuiala creată automat a fost ștearsă de mână în „Financiar”:** rata rămâne „Plătită”, fără legătură. „Anulează plata” funcționează și atunci.
- **Plata unui client e ștearsă sau modificată:** starea ratelor se recalculează singură la următoarea citire.
- **Erori de server sau de citire:** ca în etapele 1–2 („Nu s-a salvat. Încearcă din nou.”, formularul se păstrează).

## Date și drepturi de acces
### Tabel nou `payables` (documentul de plătit)
- `id bigint generated always as identity primary key`
- `supplier text not null`, `supplier_idno text not null default ''`, `doc_number text not null default ''`, `doc_date date not null`
- `currency text not null default 'MDL' check (currency in ('MDL','EUR'))`
- `amount_net numeric(12,2)`, `vat numeric(12,2) not null default 0`, `amount_total numeric(12,2) not null check (amount_total > 0)`
- `category text not null check (…EXPENSE_CATEGORIES…)`, `note text not null default ''`
- `created_at timestamptz not null default now()`

### Tabel nou `payable_items`
Aceeași structură ca `expense_items`, cu `payable_id ... on delete cascade`.

### Tabel nou `payable_installments`
- `id bigint generated always as identity primary key`
- `payable_id bigint not null references public.payables (id) on delete cascade`
- `due_date date not null`
- `amount numeric(12,2) not null check (amount > 0)`
- `paid_on date null`, `paid_amount numeric(12,2) null`
- `expense_id bigint null references public.expenses (id) on delete set null`
- `check ((paid_on is null) = (paid_amount is null))`
- index pe `(due_date)`

### Tabel nou `receivables` (rată de încasat)
- `id bigint generated always as identity primary key`
- `request_id uuid not null references public.requests (id) on delete cascade`
- `doc_number text not null default ''`, `doc_date date null`
- `due_date date not null`
- `amount numeric(12,2) not null check (amount > 0)`: în moneda clientului
- `note text not null default ''`
- `group_id uuid null`: ratele din același document au același `group_id`
- `created_at timestamptz not null default now()`
- index pe `(request_id, due_date)`

### `documents`
- Coloane noi: `payable_id bigint null references public.payables (id) on delete cascade` și `receivable_group uuid null`.
- Documentul de încasat se leagă de grupul de rate. Fișierele se șterg din cod când se șterge ultima rată a grupului.
- Regula devine `num_nonnulls(request_id, expense_id, payable_id, receivable_group) = 1`.

### `expenses`
Coloana nouă: `payable_id bigint null references public.payables (id) on delete set null`.

RLS e activat pe tabelele noi, fără politici. Migrarea e `supabase/migrations/<data>-ocr-etapa3.sql`, cu actualizarea `schema.sql`. Datele personale sunt doar cele ale clienților, care există deja. Le vede doar adminul.

### Ce schimbăm în API
Toate rutele cer `requireAdmin`.
- `docs/read` și `docs/save` tratează `de_platit` și `de_incasat`. La `de_incasat`, `read` întoarce în plus `client_matches`.
- `GET /api/admin/payables?filter=open|overdue|all` → ratele, cu datele documentului și totalurile pe monede.
- `GET /api/admin/payables?id=` → documentul de plătit, cu ratele, articolele și documentele.
- `POST`, `PATCH`, `DELETE /api/admin/payables` (document).
- `POST /api/admin/payables/pay` `{ installment_id, paid_on, paid_amount }` → marchează rata plătită și creează cheltuiala.
- `DELETE /api/admin/payables/pay?installment_id=` → anulează plata și șterge cheltuiala legată.
- `GET /api/admin/receivables?filter=open|overdue|all` → ratele, cu starea calculată (`paid`, `status`, `overdue_days`) și totalurile pe monede.
- `POST`, `PATCH`, `DELETE /api/admin/receivables`.
- `GET /api/admin/requests/:id` întoarce în plus `receivables` cu starea calculată.
- `GET ?all=1` (tabla) întoarce în plus `overdue: true|false`.
- `GET /api/admin/dues/count` → `{ overdue }`, pentru numărul din antet. Poate fi inclus și într-un răspuns deja existent.

## Servicii externe
Niciunul nou.

## Ce nu intră în această sarcină
- Notificările, plățile parțiale repetate către furnizori, conversia valutară, penalitățile.
- Legătura cu banca.

## Întrebări rămase (le rezolvă programatorul)
- **Crearea atomică a plății și a cheltuielii** (pasul 8): printr-o funcție SQL (`rpc`), ca să nu rămână o rată plătită fără cheltuială. Se recomandă `rpc`.
- **Starea ratelor de încasat pe tablă** (`overdue` pentru toți clienții): se calculează pe server din ratele și plățile cerute împreună cu clienții. La sub 1000 de clienți e suficient.
