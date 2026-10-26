# Formular de contact funcțional (Telegram, admin, email)

> Stare: Confirmată (26.10.2026). Etapa 1 livrată (Telegram). Etapa 2 livrată și verificată de proprietar: Supabase + panou /admin. Emailul către proprietar (Resend) e scris, dar inactiv până se adaugă RESEND_API_KEY, OWNER_EMAIL, MAIL_FROM. Etapa 3 nu e începută.

## Pe scurt
Acum formularul de pe site e doar o demonstrație: afișează „Mulțumim” și nu trimite nimic. O cerere reală s-a pierdut deja. Îl facem să livreze cererile în trei etape:
1. Imediat, cererile ajung pe Telegram.
2. Apoi se salvează într-o bază de date și apar într-o secțiune închisă a site-ului (panoul de administrare). Acolo proprietarul vede lista, deschide fiecare cerere, îi schimbă statusul și filtrează după status. Tot din etapa asta, cererile vin și pe email.
3. La final, vizitatorul primește un email automat de confirmare.

Considerăm că am reușit dacă nicio cerere trimisă nu se mai pierde: fie ajunge la proprietar, fie vizitatorul vede clar că trimiterea a eșuat și primește o cale alternativă (WhatsApp sau telefon).

## Pe ce se bazează
- Site static: `index.html`, `styles.css`, `script.js`. Nu are build și nu are backend. E găzduit pe Vercel Hobby, se publică automat la push pe `main`, iar `vercel.json` conține doar `cleanUrls: true`. Nu există login, bază de date sau integrări.
- Formularul `#contactForm` (index.html 455–483) are câmpurile name, phone, email (toate trei obligatorii), type și service (select-uri), message și bifa de acord (obligatorie, dar fără `name`).
- Logica demo e în script.js 239–252. Limba curentă e în variabila `lang` (`ro`/`en`), iar mesajele sunt în `MSG[lang]`.
- Opțiunile din select-uri nu au `value`, așa că se trimite textul tradus. Fără schimbare, în admin aceeași opțiune ar apărea uneori în RO, alteori în EN.
- Pe site scrie „Revenim cu o ofertă în maximum 48 de ore”. Emailul de confirmare trebuie să promită același termen.

## Utilizatori
- **Vizitatorul** (RO sau EN) completează formularul. Nu are acces la nicio cerere, nici măcar la a lui.
- **Proprietarul** (Adrian, o singură persoană, fără cunoștințe tehnice) primește notificările și lucrează cu cererile în panoul de administrare.

## Scenariul principal
1. Vizitatorul completează formularul și apasă „Trimite cererea”.
2. Butonul se blochează și afișează „Se trimite…”. Al doilea clic nu mai trimite nimic.
3. Serverul (`POST /api/contact`) verifică datele și filtrează spamul. În Etapa 1 trimite cererea pe Telegram. Din Etapa 2, întâi o salvează în baza de date, apoi trimite notificările.
4. Vizitatorul vede mesajul de mulțumire, iar formularul se golește. Din Etapa 3 primește și un email de confirmare în limba site-ului.
5. Proprietarul primește mesajul pe Telegram și, din Etapa 2, un email pe drnmusteata@gmail.com. Ambele au toate câmpurile, iar pe numărul de telefon se poate apăsa.
6. Din Etapa 2, proprietarul lucrează în panou:
   - intră pe `/admin` și introduce parola;
   - vede lista cererilor, cele mai noi sus;
   - filtrează după status;
   - deschide o cerere, îi vede toate detaliile și îi schimbă statusul.

## Ce trebuie să funcționeze

### Obligatoriu în prima versiune

#### Etapa 1: Telegram (urgent, se livrează separat)
- [ ] Funcția serverless `api/contact.js` (Node, cu cât mai puține dependențe) acceptă doar `POST`, cu JSON: `name, phone, email, type, service, message, consent, lang, website, startedAt` (`website` e câmpul-capcană). Răspunde doar cu `{ ok: true }` sau cu o eroare și nu returnează niciodată datele salvate. Alte metode decât `POST` dau `405`.
- [ ] Validare pe server: name, phone și email nu pot fi goale, email-ul trebuie să aibă un format valid, iar `consent === true`. Limite de lungime: name 100, phone 30, email 150, message 3000 de caractere. Dacă datele nu trec validarea, răspunsul e `400` cu o listă a câmpurilor greșite.
- [ ] Câmp-capcană: un input `website` ascuns prin CSS (în afara ecranului), cu `tabindex="-1"`, `autocomplete="off"` și `aria-hidden="true"`. Dacă vine completat, serverul răspunde `200 { ok: true }` ca la succes, dar nu trimite și nu salvează nimic.
- [ ] Verificare de timp: formularul trimite `startedAt`, momentul în care s-a încărcat pagina. Dacă trimiterea vine în mai puțin de 3 secunde, e tratată ca spam (același răspuns de succes fals).
- [ ] Trimiterea pe Telegram se face prin Bot API `sendMessage`. Tokenul și chat_id-ul stau doar în variabilele de mediu Vercel (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) și nu apar niciodată în browser sau în repo.
- [ ] Mesajul pe Telegram conține: „Cerere nouă de pe site”, numele, telefonul, emailul, tipul proiectului, serviciile, textul, limba (RO/EN), data și ora (ora Chișinăului). Textul introdus de vizitator e „escape”-uit (caracterele speciale sunt neutralizate), ca să nu strice formatarea mesajului.
- [ ] Select-urile primesc `value` fix, independent de limbă: tip `casa`, `ansamblu`, `birouri`, `hala`, `expertiza`, `altceva`; servicii `arh_rez`, `arh`, `rez`, `nu_stiu`. Serverul le transformă în text românesc pentru notificări și pentru admin. O valoare necunoscută dă `400`.
- [ ] Bifa de acord primește `name="consent"`. Sub ea apare textul de confidențialitate în RO/EN (vezi „Date și drepturi de acces”).
- [ ] Interfața: starea „Se trimite…”, apoi succes (mesajul existent din `MSG[lang].ok`) sau eroare (vezi „Erori”). La validarea din browser rămâne marcajul roșu existent (`.invalid`).
- [ ] Toate textele noi există în RO și EN, în dicționarul din `script.js`.
- [ ] Pe un ecran de 375px lățime nu apare scroll orizontal.

#### Etapa 2: bază de date, panou de administrare, email către proprietar

**Salvarea cererilor**
- [ ] Baza de date: **Supabase** (Postgres, planul gratuit), la cererea utilizatorului (26.10.2026), în locul Upstash. Tabel `requests`; serverul scrie cu cheia `SUPABASE_SERVICE_ROLE_KEY` (doar în variabilele Vercel), cu Row Level Security activat și fără politici publice, deci nimeni nu citește tabelul din browser. Contorul de limită pe oră stă tot în Supabase (tabel separat) sau se renunță la el dacă e prea complex.
- [ ] Ordinea de prelucrare: întâi se salvează cererea în baza de date. Dacă salvarea nu reușește, vizitatorul vede eroare. Dacă reușește, se trimit Telegram și emailul. Dacă unul dintre ele cade, vizitatorul tot vede succes, iar problema se scrie în log.
- [ ] Fiecare cerere salvată are: `id`, `createdAt`, `name`, `phone`, `email`, `type`, `service`, `message`, `lang`, `status` (implicit `noua`), `statusUpdatedAt`.
- [ ] Statusuri fixe: `noua` (Nouă), `contactat` (Contactat), `oferta` (Ofertă trimisă), `contract` (Contract), `refuzat` (Refuzat).
- [ ] Limită de trimiteri: maximum 5 cereri pe oră de la aceeași adresă IP, cu contorul ținut în Redis și expirare după o oră. Peste limită, serverul răspunde `429`, iar vizitatorul vede mesajul de eroare cu butoanele WhatsApp și Sună.

**Acces închis**
- [ ] Panoul e o secțiune separată a site-ului, la `/admin` (`admin.html`). Nu apare în meniu, are `noindex` (motoarele de căutare nu o arată) și e exclusă din indexare și prin `robots.txt`.
- [ ] Fără autentificare nu se vede nicio cerere. Pagina `/admin` nu conține date în HTML: încarcă doar formularul de parolă, iar datele vin de la API numai după autentificare.
- [ ] Autentificare: `POST /api/admin/login` compară parola cu variabila `ADMIN_PASSWORD`, printr-o comparație „în timp constant”, care nu dezvăluie prin durată cât de aproape a fost parola. Dacă parola e corectă, serverul setează un cookie `httpOnly`, `Secure`, `SameSite=Strict`, semnat cu `ADMIN_SECRET`, valabil 7 zile. Butonul „Ieșire” (`POST /api/admin/logout`) șterge cookie-ul.
- [ ] Toate rutele `/api/admin/*` (în afară de login) verifică cookie-ul și, fără o sesiune validă, răspund `401` fără niciun fel de date. Trebuie verificat explicit: un `GET` direct pe API dintr-o fereastră privată întoarce `401`.
- [ ] Încercările de parolă sunt limitate la 5 greșeli în 15 minute de pe același IP.

**Lista**
- [ ] `GET /api/admin/requests?status=<status|toate>&cursor=<…>` întoarce cererile de la cea mai nouă la cea mai veche, câte 50, cu butonul „Mai multe”.
- [ ] Fiecare rând arată data și ora, numele, telefonul, tipul proiectului și statusul (eticheta colorată). Cererile cu statusul „Nouă” se disting vizual.
- [ ] Deasupra listei e un filtru după status: Toate / Nouă / Contactat / Ofertă trimisă / Contract / Refuzat, cu numărul de cereri pentru fiecare. Filtrul ales se păstrează în adresa paginii (de ex. `/admin?status=noua`), ca să rămână la reîncărcare.

**Detaliile unei cereri**
- [ ] Un clic pe rând deschide cererea (`GET /api/admin/requests/:id`) și arată toate detaliile:
  - data și ora;
  - numele;
  - telefonul (link `tel:`), cu buton WhatsApp (`wa.me`);
  - emailul (link `mailto:`);
  - tipul proiectului, serviciile;
  - textul complet;
  - limba;
  - statusul și momentul ultimei schimbări de status.
- [ ] Statusul se schimbă din detalii, dintr-o listă derulantă (`PATCH /api/admin/requests/:id` cu `{ status }`). Se salvează imediat, cu confirmare vizuală. Dacă salvarea nu reușește, apare un mesaj de eroare și se revine la statusul vechi. Statusurile din afara celor 5 dau `400`.
- [ ] Din detalii se poate reveni la listă, cu filtrul păstrat. În listă, cererea apare cu statusul nou.
- [ ] Panoul e utilizabil pe telefon (375px, fără scroll orizontal).

**Email către proprietar**
- [ ] Email prin Resend, la fiecare cerere, la adresa `OWNER_EMAIL` = drnmusteata@gmail.com. Conține aceleași informații ca pe Telegram plus un link spre `/admin`. Are `Reply-To` setat la emailul vizitatorului, ca proprietarul să poată răspunde direct.
  - Până se verifică domeniul: se trimite de pe `onboarding@resend.dev`. Asta funcționează doar dacă contul Resend e creat cu drnmusteata@gmail.com.
  - După verificare: se trimite de pe `contact@lh47arch.com`.
  - Adresa expeditorului vine din variabila de mediu `MAIL_FROM`, ca trecerea de la o adresă la alta să nu ceară modificări de cod.
- [ ] În Etapa 2, mesajul pe Telegram conține și el linkul spre `/admin`.

#### Etapa 3: email de confirmare pentru vizitator (după verificarea domeniului lh47arch.com în Resend)
- [ ] După salvare, vizitatorul primește un email de pe `contact@lh47arch.com`, în limba `lang`. Subiectul e „Am primit cererea dvs. – Atelier Temelia” / „We received your request – Atelier Temelia”. Conținutul: mulțumire, „revenim în maximum 48 de ore”, un rezumat al cererii, telefonul și WhatsApp-ul biroului.
- [ ] Emailul de confirmare are `Reply-To` spre adresa proprietarului (vezi „Întrebări deschise”).
- [ ] Confirmarea se activează din variabila de mediu `SEND_AUTOREPLY=true`. Până atunci nu se trimite nimic către vizitatori.
- [ ] Dacă trimiterea confirmării nu reușește, asta nu afectează ce vede vizitatorul pe site (vede tot succes). Problema se scrie doar în log.

### Opționale (dacă e timp)
- Linkul „Trimite pe WhatsApp” se pune și în emailul de confirmare.
- Numărul de cereri „Nouă” apare în titlul paginii de admin.

### Mai târziu
- Notițe la cereri, ștergere din admin, export Excel/CSV.
- Căutare după nume sau telefon în admin.
- Mai mulți utilizatori sau roluri în admin.
- Cloudflare Turnstile (doar dacă trece spam de protecțiile actuale).
- Ștergerea automată a cererilor vechi.
- Atașarea de fișiere (planuri, fotografii) în formular.
- Statistici despre cereri.

## Erori și cazuri limită
- **Trimiterea eșuează** (fără internet, eroare `5xx`, timeout de 15 secunde, `429`): textul rămâne în formular. Apare mesajul „Nu am putut trimite cererea. Scrieți-ne direct:” / „We couldn't send your request. Contact us directly:”, cu trei butoane:
  - **Trimite pe WhatsApp**: deschide `https://wa.me/37368133945?text=…` cu toate câmpurile completate (URL-encoded);
  - **WhatsApp** (chat gol);
  - **Sună** (`tel:+37368133945`).
  Butonul „Trimite cererea” se deblochează, ca vizitatorul să poată încerca din nou.
- **Câmpuri invalide** (`400`): se marchează câmpurile primite de la server, iar formularul nu se golește.
- **Dublu clic sau Enter repetat**: cât timp trimiterea e în curs, butonul e dezactivat și se trimite o singură cerere.
- **Spam (capcana sau trimitere în mai puțin de 3 secunde)**: robotul vede succes, dar nu se trimite și nu se salvează nimic.
- **Etapa 1, Telegram nu răspunde**: e singurul canal, deci vizitatorul vede eroarea și butoanele de mai sus. Nimic nu se pierde, pentru că vizitatorul știe că trebuie să folosească WhatsApp.
- **Etapa 2, baza de date nu răspunde**: cererea se trimite totuși pe Telegram, marcată „NU a fost salvată în panou”, iar vizitatorul vede succes. Eroare (cu WhatsApp) vede doar dacă nici Telegram nu merge. (Schimbat 26.10.2026, ca să nu se piardă cereri.)
- **Etapa 2, Telegram sau emailul cad după salvare**: vizitatorul vede succes, iar cererea apare oricum în admin.
- **Admin, parolă greșită**: „Parolă incorectă”. După 5 greșeli: „Prea multe încercări, reveniți în 15 minute”.
- **Admin, sesiune expirată sau răspuns `401`**: orice ecran revine la formularul de parolă, fără să rămână date afișate.
- **Admin, fără cereri** (sau niciuna cu statusul filtrat): „Nicio cerere încă” / „Nicio cerere cu acest status”.
- **Admin, cerere inexistentă** (`id` greșit în adresă): „Cererea nu a fost găsită”, cu link înapoi la listă.
- **Admin, baza de date nu răspunde**: „Nu am putut încărca cererile. Reîncercați.”, cu buton „Reîncearcă”.

## Date și drepturi de acces
- **Ce se păstrează**: nume, telefon, email, tip proiect, servicii, text, limbă, dată, status și data ultimei schimbări de status. Nu se păstrează IP-ul (contorul de limită expiră după o oră).
- **Cine vede și cine modifică**:
  - Proprietarul, după autentificare: vede tot și poate schimba doar statusul.
  - Vizitatorii și oricine altcineva: nu văd nimic. Nicio rută publică nu întoarce cereri.
  - În v1 nimeni nu poate modifica sau șterge din interfață celelalte câmpuri.
- **Unde ajung datele**: Vercel, Upstash, Telegram, Resend și Gmail (servicii din afara Moldovei).
- **Cât timp se păstrează**: nelimitat. Ștergerea la cerere se face manual, de către cine întreține site-ul (din consola Upstash).
- **Textul de sub bifă** (de verificat de proprietar):
  - RO: „Sunt de acord ca Atelier Temelia să folosească numele, telefonul și emailul meu doar pentru a-mi răspunde la această cerere. Datele nu sunt transmise altor firme în scop de marketing. Pentru ștergerea datelor scrieți la adrian.musteata@lh47arch.com.”
  - EN: „I agree that Atelier Temelia may use my name, phone and email only to reply to this request. The data is not shared with other companies for marketing. To have your data deleted, write to adrian.musteata@lh47arch.com.”
- **Secrete** (doar în variabilele de mediu Vercel, niciodată în repo sau în browser): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SECRET`, `SEND_AUTOREPLY`, plus variabilele Upstash.

## Servicii externe
| Serviciu | Etapa | Cine creează contul | Dacă nu răspunde |
|---|---|---|---|
| Telegram Bot (@BotFather) | 1 | Proprietarul, ghidat. Trebuie să-i scrie botului o dată, ca să aflăm chat_id-ul | Etapa 1: eroare și WhatsApp. Etapa 2: cererea e deja salvată |
| Upstash Redis (Vercel Marketplace) | 2 | Proprietarul, cu clicuri din panoul Vercel | Formular: eroare și WhatsApp. Admin: „Reîncearcă” |
| Resend | 2–3 | Proprietarul, cu drnmusteata@gmail.com | Doar log, cererea e deja salvată |
| DNS lh47arch.com (înregistrările Resend) | 3 | Cine administrează domeniul | Confirmarea pentru vizitator rămâne oprită |

Ce introduce proprietarul în variabilele de mediu Vercel: tokenul botului, chat_id-ul (îl aflăm împreună), cheia Resend și parola de admin aleasă de el. Claude nu poate crea conturi și nu poate introduce parole în locul lui.

## Nu intră în această sarcină
Tot ce e la „Mai târziu”. În plus: schimbarea câmpurilor formularului (în afară de `value`, `name="consent"` și câmpul-capcană), notificări pe WhatsApp, o pagină separată de politică de confidențialitate, trecerea pe alt plan Vercel.

## Întrebări deschise pentru implementare
1. **Riscul principal**: nu știm cine administrează DNS-ul lh47arch.com. Etapa 3 depinde de asta și nu blochează Etapele 1–2.
2. Există deja căsuța `contact@lh47arch.com`? Dacă nu, `Reply-To` din emailul de confirmare trebuie pus pe adrian.musteata@lh47arch.com (sau pe Gmail?). E de confirmat cu proprietarul înainte de Etapa 3.
3. Condițiile planului Vercel Hobby permit doar uz personal, necomercial. Pentru site-ul unei firme, Vercel poate cere trecerea pe Pro. Riscul trebuie semnalat proprietarului; nu e o problemă de cod.
4. Textul de sub bifă e o propunere practică, nu un aviz juridic despre legea Republicii Moldova privind datele personale.
