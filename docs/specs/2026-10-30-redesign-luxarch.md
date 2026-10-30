# Redesign complet și redenumire: Atelier Temelia → LUXARCH

> Stare: Aprobată de proprietar (30.10.2026) — inclusiv acordul LH47 pentru poze. Implementată pe ramura `redesign-luxarch`.

## Pe scurt
Refacem complet pagina publică într-un stil „editorial cinematic” de nivel Awwwards: fundal închis, titluri uriașe, poze care se deschid ca o cortină, cursor personalizat, animații GSAP. Biroul se redenumește **LUXARCH** (lux = lumină + lux). Formularul, botul Telegram, Supabase, panoul `/admin`, GitHub și Vercel rămân și funcționează exact ca acum. Se schimbă doar denumirile.

Considerăm că am reușit dacă:
- pagina produce efect „wow” pe desktop;
- pe un telefon de 375px rămâne fluidă și fără scroll orizontal;
- e completă în RO, RU și EN;
- nu conține nicio cifră, recenzie sau proiect inventat;
- o cerere trimisă din formular ajunge în Telegram și în `/admin` ca înainte.

## Pe ce se bazează (starea actuală)
- Site static, fără build: `index.html`, `styles.css`, `script.js`. Folosește fonturile Fraunces și Manrope. Secțiunile sunt: Hero, Poveste, Servicii, Cifre, Proiecte (6 ilustrații SVG provizorii), Proces, Testimoniale (inventate), Întrebări, Contact, plus butonul plutitor WhatsApp.
- Limbi: RO e citit din HTML, EN e un dicționar în `script.js`, iar comutatorul are doar 2 limbi. Limba aleasă se ține în `localStorage` sub cheia `temelia-lang`.
- `api/contact.js`: validare, capcană anti-spam, salvare în Supabase, apoi Telegram și (opțional) Resend. Linia 30 transformă orice limbă în afară de `en` în `ro`.
- În Supabase, coloana `requests.lang` acceptă doar `('ro','en')` (`supabase/schema.sql`, linia 17).
- `admin.js`, linia 180, afișează limba ca „Engleză” sau „Română”.
- `api/_lib/notify.js`, linia 6: `SITE = 'https://atelier-temelia.vercel.app'`. De aici vin linkurile spre `/admin` din Telegram și din email.
- Cookie-ul de admin se numește `temelia_admin` (`api/_lib/auth.js`). Valoarea de rezervă `'temelia'` din `api/_lib/http.js` intră în calculul cheilor de limitare.
- Push pe `main` publică automat pe Vercel. Pe celelalte ramuri, Vercel face o publicare de previzualizare (preview), cu o adresă separată.

## Utilizatori
- **Vizitatorul**: client din Moldova sau din România, care vrea o casă, un ansamblu, o clădire comercială sau o expertiză. Citește în RO, RU sau EN, cel mai des de pe telefon.
- **Proprietarul** (Adrian, arhitect cu drept de semnătură OAR în România): primește cererile pe Telegram și le gestionează în `/admin`. Nu are cunoștințe tehnice.

## Scenariul principal
1. Vizitatorul deschide site-ul. Vede un ecran de intrare scurt: logo-ul LUXARCH se compune din litere, în cel mult 1,5 s. La a doua vizită din aceeași sesiune acest ecran nu mai apare.
2. Hero: titlu uriaș, apoi o poză de proiect pe tot ecranul, deschisă cu efect de cortină. Butoanele „Cere o ofertă” și „Vezi proiectele” sunt vizibile fără derulare.
3. Derulează și vede:
   - manifestul (arhitectură + structură sub același acoperiș);
   - serviciile;
   - proiectele, cu poze mari, cortină și cursorul „Vezi”;
   - faptele;
   - procesul;
   - întrebările frecvente.
4. Deschide un proiect. Pe tot ecranul se deschide o galerie cu 3–5 poze și datele proiectului. O închide cu X, Esc sau gestul „înapoi”.
5. Schimbă limba din comutatorul RO / RU / EN. Tot textul se schimbă fără reîncărcarea paginii.
6. Completează formularul. Câmpurile și comportamentul sunt ca acum: „Se trimite…”, apoi succes sau eroare cu butoane WhatsApp.
7. Proprietarul primește cererea pe Telegram, cu link spre noul URL `/admin`. Limba apare ca RO, RU sau EN.

## Ce trebuie să funcționeze

### Obligatoriu în prima versiune

**Identitate LUXARCH**
- [ ] Numele se scrie peste tot cu litere latine mari: `LUXARCH`, inclusiv în versiunea RU. „ЛЮКСАРХ” apare cel mult ca pronunție, nu în logo.
- [ ] Logo nou, text plus semn simplu în SVG (un fir de lumină sau un arc). Se folosește în meniu, în subsol, în favicon (32px și 180px pentru iOS) și în imaginea de previzualizare a linkului (OG, 1200×630).
- [ ] Subsol: `© 2026 LUXARCH · Arhitectură & Structură`. Fără „SRL” până nu se confirmă denumirea juridică.

**Design „editorial cinematic”**
- [ ] Fundal închis (aproape negru, cald), text alb-cald și un singur accent cald, „lumină” (auriu sau chihlimbar). Contrastul textului e de minimum 4.5:1.
- [ ] Fonturile, cel mult 2 familii, trebuie să aibă litere chirilice și diacritice românești (ă â î ș ț). Fraunces nu are chirilice, deci se înlocuiește.
  - Pentru titluri, de ex. Playfair Display sau Cormorant Garamond.
  - Pentru text, Manrope rămâne, fiindcă are chirilice.
  - Se încarcă cu `display=swap`.
- [ ] Titluri uriașe (pe desktop cel puțin 12vw în Hero), cu apariție animată: literele sau rândurile urcă dintr-o mască.
- [ ] Pozele apar cu efect de cortină (`clip-path`) și au un mic efect de adâncime (parallax) la derulare.
- [ ] Proiecte pe desktop (≥ 1024px): bandă orizontală fixată pe ecran în timpul derulării (GSAP ScrollTrigger, `pin`). Pe telefon: listă verticală, fără fixare.
- [ ] Cursor personalizat: un cerc care urmărește mouse-ul, se mărește și arată „Vezi” / „Смотреть” / „View” peste proiecte. Apare doar când `(hover: hover) and (pointer: fine)`. Pe ecranele tactile rămâne comportamentul normal.
- [ ] GSAP (cu ScrollTrigger) se încarcă dintr-un CDN, cu versiunea fixată în adresă. Fără build și fără alte librării, cu excepția celor de la „Opționale”.

**Secțiuni (ordinea finală)**
- [ ] Hero.
- [ ] Manifest: înlocuiește „Poveste”, cu ideea arhitectură + structură.
- [ ] Servicii: păstrează conținutul actual, cu text nou.
- [ ] Proiecte.
- [ ] Fapte: înlocuiește „Cifre”. Conține 3–4 afirmații adevărate, fără numere inventate:
  - „Arhitect și inginer de structură în aceeași echipă”;
  - „Proiectăm pentru Moldova și România”;
  - „Drept de semnătură în România (OAR)”;
  - „Ofertă în maximum 48 de ore”.
- [ ] Proces: 5 pași.
- [ ] Întrebări frecvente.
- [ ] Contact.
- [ ] Subsol.
- [ ] Secțiunea „Testimoniale” se șterge complet, inclusiv cheile `q.*` din dicționare.
- [ ] Animația cu numărătoarea cifrelor (`data-count`) se șterge.

**Proiecte**
- [ ] 6–10 proiecte cu poze reale, luate de pe lh47arch.com și din rețelele proprietarului. Se publică doar după ce se rezolvă punctul 1 din „Întrebări deschise”.
- [ ] Datele proiectelor stau într-o singură listă în `script.js`. Pentru fiecare proiect: titlu RO/RU/EN, tip, an, stadiu (Concept / În construcție / Finalizat), categorie pentru filtru și o listă de poze. Adăugarea unui proiect înseamnă un singur element nou în listă.
- [ ] Fără orașe și suprafețe inventate: dacă nu se cunosc, nu se afișează.
- [ ] Filtrele rămân: Toate / Rezidențial / Ansambluri / Comercial. Pot fi adaptate categoriilor reale, de ex. Case, Rezidențial, Comercial și industrial, Turism, Interior.
- [ ] Poze optimizate:
  - format WebP;
  - variante de 800, 1400 și 2000px, alese de browser prin `srcset`;
  - cel mult ~300 KB pentru varianta de 1400px;
  - `loading="lazy"` peste tot, în afară de poza din Hero;
  - `width`/`height` setate, ca pagina să nu „sară” la încărcare.
  - Stau în `img/projects/<slug>/`.
- [ ] Galeria pe tot ecranul se închide cu X, Esc, clic pe fundal și butonul „înapoi” al telefonului (`history`). Pozele se schimbă cu săgeți sau glisare. Când e deschisă, pagina din spate nu se derulează.

**Moldova și România**
- [ ] Pasul „Autorizare” din Proces arată ambele țări, una lângă alta (una sub alta pe telefon):
  - **Moldova**: certificat de urbanism, documentație pentru autorizarea de construire, proiect de execuție;
  - **România**: certificat de urbanism, DTAC, PTh.
- [ ] Întrebarea 2 („Cât durează autorizația…”) se rescrie pentru ambele țări, fără termene promise pe care nu le controlăm.
- [ ] Întrebarea 5 se rescrie: „Proiectăm în Moldova și în România”.
- [ ] Hero și meta description: „Arhitectură și inginerie structurală · Chișinău · Moldova & România”.

**Limbi: RO, RU, EN**
- [ ] Comutatorul are 3 opțiuni: `RO · RU · EN`.
- [ ] Toate textele există în 3 limbi:
  - pagina, inclusiv titlul paginii și meta description;
  - mesajele formularului (`MSG`) și banda de cuvinte (`MARQUEE`), dacă banda rămâne;
  - textul de sub bifa de acord;
  - textul cursorului;
  - pagina de confidențialitate.
- [ ] Pentru limba rusă se folosesc termenii obișnuiți în Moldova: архитектура, конструкции, разрешение на строительство и т. д.
- [ ] La prima vizită, fără limbă salvată:
  - `navigator.language` începe cu `ru` → RU;
  - începe cu `ro` sau `mo` → RO;
  - altfel → EN.
  Alegerea se salvează tot sub cheia `temelia-lang`, cu valorile `ro`, `ru` sau `en`.
- [ ] `<html lang>` se schimbă odată cu limba.
- [ ] Formularul trimite `lang: 'ru'` când e aleasă rusa.

**Suport pentru `ru` pe server și în admin** (singura schimbare în fluxul cererilor; se adaugă doar o valoare permisă nouă)
- [ ] Migrare nouă, `supabase/migrations/2026-10-30-lang-ru.sql`: constrângerea de pe `requests.lang` devine `in ('ro','ru','en')`. `schema.sql` se actualizează la fel.
- [ ] Ordinea obligatorie:
  1. Proprietarul rulează migrarea în Supabase (SQL Editor). Asta se verifică.
  2. Abia apoi se publică `api/contact.js`, care acceptă `ru`.
  - Dacă ordinea e greșită, salvarea cade. Funcționează totuși protecția existentă (Telegram cu mesajul „NU a fost salvată în panou”), dar ordinea e obligatorie.
- [ ] `api/contact.js`: `lang` acceptă `ro`, `ru` și `en`; orice altă valoare devine `ro`.
- [ ] `admin.js`: limba se afișează ca „Română”, „Rusă” sau „Engleză”.
- [ ] Telegram și emailul afișează deja `RU` prin `toUpperCase()`. Nu e nevoie de alte schimbări.

**Pagina de confidențialitate**
- [ ] Pagina `confidentialitate.html` (adresa `/confidentialitate`, datorită `cleanUrls`), în același stil, cu comutatorul RO/RU/EN. Conține:
  - cine prelucrează datele: LUXARCH, Adrian Musteață;
  - ce date: nume, telefon, email, detaliile proiectului, limba;
  - scopul: doar răspunsul la cerere;
  - unde ajung: Vercel, Supabase, Telegram, Resend;
  - cât se păstrează: până la cererea de ștergere;
  - cum se cere ștergerea: email la adrian.musteata@lh47arch.com.
- [ ] Linkul spre ea apare în textul de sub bifa de acord și în subsol.

**Bazele pentru Google și pentru partajarea linkului** (lucruri mici, dar obligatorii)
- [ ] Favicon, `theme-color` închis, Open Graph și Twitter Card (titlu, descriere, imagine 1200×630).
- [ ] Date structurate JSON-LD de tip `ProfessionalService`, cu numele LUXARCH, telefonul, adresa Str. Eugen Doga 2, Chișinău, `areaServed` Moldova și România, și URL-ul.
- [ ] `sitemap.xml`, cu `/` și `/confidentialitate`. În `robots.txt`: linkul spre sitemap și `Disallow: /admin`, păstrat.

**Calitate**
- [ ] Pe 375px nu apare scroll orizontal pe nicio secțiune, nici în timpul animațiilor. Se verifică pe 375, 768, 1024 și 1440px.
- [ ] `prefers-reduced-motion: reduce`:
  - fără ecran de intrare, cortine, parallax, fixare la derulare sau cursor personalizat;
  - conținutul e vizibil imediat;
  - proiectele apar ca listă normală.
- [ ] Îmbunătățire progresivă: dacă GSAP nu se încarcă (CDN căzut sau blocat) sau JS e oprit, tot conținutul e vizibil și formularul funcționează.
  - Elementele animate se ascund doar după ce JS adaugă o clasă pe `<html>`, de ex. `js-anim`, și numai dacă `window.gsap` există.
- [ ] Performanță pe telefon (Lighthouse, mobil): Performance ≥ 85, Accessibility ≥ 90, Best Practices ≥ 90. LCP ≤ 2.5 s, CLS ≤ 0.1. Animațiile folosesc doar `transform`, `opacity` și `clip-path`.
- [ ] Accesibilitate:
  - meniul, comutatorul de limbă, galeria și formularul se folosesc din tastatură;
  - focusul e vizibil;
  - pozele au `alt` în limba curentă;
  - galeria păstrează focusul în interiorul ei cât e deschisă.

**Redenumire: unde se schimbă „Temelia” → „LUXARCH”**

În cod (se face de cel care implementează):

| Unde | Ce se schimbă |
|---|---|
| `index.html` | `<title>`, `meta description`, `aria-label` de la logo, logo-ul din meniu și din subsol, `© … SRL`, textul de acord (RO). Practic tot fișierul se rescrie |
| `script.js` | Titlul paginii EN/RU (linia 94), `f.consent` EN plus RU noi. Cheia `temelia-lang` **rămâne** |
| `admin.html` | `<title>Cereri — LUXARCH</title>`, logo-ul `Cereri <em>LUXARCH</em>` |
| `admin.js` | Linia 135: titlul `Cereri — LUXARCH`. Linia 180: eticheta „Rusă” |
| `api/_lib/notify.js` | `SITE` devine `process.env.SITE_URL \|\| 'https://luxarch.vercel.app'` (sau adresa finală obținută la Vercel) |
| `supabase/schema.sql` | Comentariul din antet și constrângerea `lang` |
| `README.md`, `CLAUDE.md` | Numele, URL-ul site-ului și URL-ul repo-ului |
| `docs/specs/2026-10-26-formular-contact.md` | Doar o notă la început: „Biroul a fost redenumit LUXARCH (30.10.2026); subiectul emailului din Etapa 3 devine «… – LUXARCH»”. Restul istoricului nu se rescrie |

În servicii (le face proprietarul, ghidat; Claude nu are acces la conturi):

| Serviciu | Ce se face | Efect |
|---|---|---|
| GitHub | Settings → Rename: `atelier-temelia` → `luxarch` | GitHub redirecționează automat adresa veche. Local: `git remote set-url origin https://github.com/adrianmusteata-cyber/luxarch.git`. După redenumire se verifică, cu un push de test, că Vercel încă publică |
| Vercel | Settings → General → Project Name: `luxarch`. Settings → Domains: se adaugă `luxarch.vercel.app` ca domeniu principal; `atelier-temelia.vercel.app` rămâne, cu redirecționare 308 spre cel nou | Linkurile vechi merg în continuare. Proprietarul trebuie să intre o dată din nou în `/admin` pe noua adresă (cookie-ul ține de domeniu). Dacă `luxarch.vercel.app` e ocupat: `luxarch-studio.vercel.app` |
| Vercel, variabile | Opțional `SITE_URL` = noua adresă | Celelalte variabile (Telegram, Supabase, Resend, `ADMIN_*`, `MAIL_FROM`, `OWNER_EMAIL`) **nu se schimbă** |
| Supabase | Opțional: numele afișat al proiectului, din Settings | Adresa, cheile și tabelele nu se schimbă |
| Telegram | Opțional: `/setname` în @BotFather, ca botul să se numească „LUXARCH Cereri” | Tokenul și chat_id-ul rămân. Numele de utilizator al botului nu se schimbă |

**Ce rămâne neschimbat (de verificat după implementare)**
- [ ] Contractul `POST /api/contact`: câmpurile `name, phone, email, type, service, message, consent, website, lang, startedAt`, valorile fixe `casa…altceva` și `arh_rez…nu_stiu`, validările, limitele, capcana și verificarea de 3 secunde. Singura schimbare permisă e `lang` cu valoarea `ru`.
- [ ] Atributele `id` și `name` din formular (`contactForm`, `formSend`, `formMsg`, `formFallback`, `waPrefill`, `f-*`), ca logica din `script.js` să meargă fără rescriere. Se poate schimba doar aspectul.
- [ ] Butoanele de rezervă la eroare (Trimite pe WhatsApp cu textul completat, WhatsApp, Sună) și butonul plutitor WhatsApp, cu numărul +373 68 133 945.
- [ ] Cookie-ul `temelia_admin`, valoarea de rezervă `'temelia'` din `api/_lib/http.js` și cheia `temelia-lang`. Sunt nume interne, nu le vede nimeni; dacă le schimbăm, proprietarul e scos din panou.
- [ ] Supabase (tabelul `requests`, statusurile `noua` / `in_lucru` / `inchisa`, RLS, contoarele), Telegram, panoul `/admin` (parolă, listă, filtru, detalii, comentariu obligatoriu), emailul Resend aflat în așteptare.
- [ ] Test final, după publicare:
  - o cerere în RU ajunge în Telegram cu `RU` și cu linkul `/admin` corect;
  - cererea apare în `/admin` cu limba „Rusă”;
  - un `GET` pe `/api/admin/requests` dintr-o fereastră privată dă `401`.

**Mod de lucru**
- [ ] Redesign-ul se face pe o ramură separată și se verifică pe adresa de previzualizare Vercel. Pe `main` ajunge doar după ce proprietarul îl aprobă și după ce pozele sunt lămurite. Altfel, push-ul pe `main` publică imediat o pagină neterminată.

### Opționale (dacă e timp)
- Derulare lină pe desktop (Lenis sau GSAP ScrollSmoother), dezactivată pe ecranele tactile și la `reduced-motion`.
- Pozele urmează ușor mouse-ul peste lista de proiecte, pe desktop.
- Un mic „sunet ambiental” oprit implicit: nu se recomandă.

### Mai târziu
- Domeniu propriu (de ex. `luxarch.md` / `luxarch.com`) și email `contact@<domeniu>`.
- Pagini separate pentru fiecare proiect (studii de caz) și adrese separate pentru fiecare limbă (`/ru/`, `/en/`, cu `hreflang`), ca să conteze la Google.
- Cifre reale, recenzii reale cu acordul clienților, secțiunea Echipă.
- Înscrierea la Awwwards sau CSSDA (cu taxă).
- Analiză de trafic (de ex. Vercel Web Analytics).
- Email de confirmare pentru vizitator (Etapa 3 din specificația anterioară).

## Erori și cazuri limită
- **GSAP nu se încarcă**: pagina e statică, completă și lizibilă, iar formularul merge. Fără erori în consolă care să oprească restul codului: logica formularului și a limbii rulează înaintea animațiilor sau independent de ele.
- **O poză nu se încarcă**: rămâne un bloc de culoare cu titlul proiectului, fără icon de imagine ruptă. Animația nu se blochează.
- **Proiect fără date** (an sau tip necunoscut): câmpul lipsă nu se afișează și nu se înlocuiește cu „—”.
- **Telefon slab sau conexiune lentă**: ecranul de intrare dispare după cel mult 1,5 s, chiar dacă poza din Hero nu s-a încărcat încă. Hero folosește o variantă mică a pozei pe ecranele mici.
- **Rotirea telefonului sau redimensionarea ferestrei**: ScrollTrigger se recalculează (`refresh`), iar banda orizontală nu lasă spații goale și nu produce scroll orizontal.
- **Galeria deschisă și utilizatorul apasă „înapoi”**: se închide galeria, nu se părăsește site-ul.
- **Limbă necunoscută în `localStorage`**: se aplică regula de la prima vizită.
- **Cerere în RU înainte de migrarea Supabase**: salvarea cade, cererea vine pe Telegram cu „NU a fost salvată în panou”, iar vizitatorul vede succes. De evitat prin ordinea de publicare.
- **Toate celelalte erori ale formularului și ale panoului**: exact ca în `docs/specs/2026-10-26-formular-contact.md`.

## Date și drepturi de acces
- Nu apar date noi. Se adaugă doar valoarea `ru` în `lang`.
- Drepturile rămân ca acum: doar proprietarul, autentificat, vede cererile.
- Pozele proiectelor sunt publice. Se publică doar cu acordul confirmat (vezi „Întrebări deschise”, punctul 1).
- Emailul de contact rămâne `adrian.musteata@lh47arch.com` (decizie implicită).

## Servicii externe
| Serviciu | Rol | Dacă nu răspunde |
|---|---|---|
| CDN GSAP (de ex. jsDelivr) | Animații | Pagina rămâne completă, fără animații |
| Google Fonts | Fonturi | Fontul de rezervă din sistem, textul e vizibil imediat (`swap`) |
| Vercel, Supabase, Telegram, Resend | Neschimbate | Ca în specificația din 26.10.2026 |

## Nu intră în această sarcină
- Chat pe site.
- Schimbări de funcționalitate în panoul admin (în afară de eticheta „Rusă” și de titlu).
- Câmpuri noi în formular.
- Domeniu propriu.
- Cifre sau recenzii inventate.
- Blog.
- Tot ce e la „Mai târziu”.

## Întrebări deschise pentru implementare
1. **Blocant pentru poze: drepturile asupra pozelor LH47.**
   - Ce am găsit: lh47arch.com e site-ul unui birou mare, „LH47”. Fondat în 2015, are peste 100 de oameni, CEO Serghei Mîrza și birouri în Chișinău, București și Tbilisi. Portofoliul lui are 33 de proiecte.
   - Problema: publicarea acestor lucrări sub alt brand (LUXARCH) poate încălca drepturile LH47. Dacă cineva recunoaște proiectele, site-ul își pierde credibilitatea.
   - Proprietarul trebuie să confirme:
     - (a) la care proiecte a lucrat el personal;
     - (b) că LH47 e de acord ca acestea să apară pe LUXARCH, eventual cu mențiunea „realizat în cadrul LH47”.
   - Până atunci, lucrul se face pe ramura de previzualizare și pe `main` nu se publică nicio poză LH47.
2. Emailul `@lh47arch.com` pe site-ul LUXARCH: aceeași problemă de brand. Rămâne provizoriu; se schimbă odată cu domeniul propriu.
3. Disponibilitatea `luxarch.vercel.app` se află doar la redenumirea din Vercel. URL-ul final trebuie trecut în `SITE_URL` sau în `notify.js`, în `sitemap.xml`, în OG și în JSON-LD.
4. Textele în rusă se publică fără verificarea unui vorbitor nativ (decizia proprietarului). Se scriu simplu, fără idiomuri.
5. Denumirea juridică a firmei (pentru subsol și pagina de confidențialitate) e necunoscută; până atunci apar doar „LUXARCH” și numele proprietarului.
