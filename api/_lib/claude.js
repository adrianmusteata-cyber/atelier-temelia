/* Citirea documentelor cu Claude (API-ul Anthropic), fără dependențe.
   Variabile: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (opțional), OWN_COMPANY_NAMES, OWN_IDNO (opționale).
   Un singur apel: Claude alege unealta tipului de document (sau not_a_document),
   iar argumentele uneltei sunt câmpurile citite. */
const { TYPES, SERVICES, DOC_TYPES, EXPENSE_CATEGORIES } = require('./labels');

const MODEL = () => (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5').trim();
const TIMEOUT = 55000; // funcția are cel mult 60 s (vercel.json)
/* Limita unui răspuns. Fără streaming, limita reală e timpul: în 55 s Claude scrie cam 4–6 mii de tokeni,
   adică ~150–250 de rânduri dintr-o listă de prețuri (un rând ≈ 25 de tokeni). max_tokens e mai mare,
   ca un răspuns care încape în timp să nu fie tăiat. O listă mai lungă se oprește fie la max_tokens
   (stop_reason „max_tokens”), fie la timeout: în ambele cazuri utilizatorul primește „încarcă mai puține
   pagini odată”, nu o eroare generică (codurile too_long / timeout de mai jos, tratate în docs/read). */
const MAX_TOKENS = 32000;

// Eroare cu cod, pe care docs/read o transformă într-un mesaj clar
const coded = (code, message) => Object.assign(new Error(message), { code });

const str = description => ({ type: 'string', description });
const strList = description => ({ type: 'array', items: { type: 'string' }, description });
const enumOf = (map, description) => ({ type: 'string', enum: ['', ...Object.keys(map)], description });

const num = description => ({ type: 'number', description });

// Avize și chitanțe → cheltuieli (Etapa 2)
const EXPENSE_PROPS = {
  supplier: str('Furnizorul (vânzătorul / emitentul), nu cumpărătorul'),
  supplier_idno: str('Codul fiscal (IDNO) al furnizorului'),
  doc_number: str('Numărul documentului (serie și număr)'),
  doc_date: str('Data documentului, format YYYY-MM-DD'),
  currency: str('Moneda: MDL, EUR sau alta (cod de 3 litere); lei = MDL'),
  amount_net: num('Suma fără TVA'),
  vat: num('TVA-ul (suma), 0 dacă nu există'),
  amount_total: num('Totalul de plată, cu TVA'),
  category: { type: 'string', enum: Object.keys(EXPENSE_CATEGORIES), description: `Categoria cheltuielii: ${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => `${k} = ${v}`).join('; ')}. Dacă nu e clar: altele` },
  items: {
    type: 'array',
    description: 'Rândurile cu articole, în ordinea din document',
    items: {
      type: 'object',
      properties: {
        name: str('Denumirea'), code: str('Codul articolului'), unit: str('Unitatea de măsură'),
        qty: num('Cantitatea'), unit_price: num('Prețul unitar (fără TVA, dacă documentul îl are)'), line_total: num('Suma rândului'),
      },
      required: ['name'],
    },
  },
};

// Ratele / scadențele (Etapa 3)
const INSTALLMENTS = {
  type: 'array',
  description: 'Datele de plată și sumele. O factură are de obicei o singură scadență. Dacă ratele sunt în procente, calculează sumele din total. Dacă o dată nu e fixă („la predare”), lasă due_date gol.',
  items: { type: 'object', properties: { due_date: str('Data scadenței, YYYY-MM-DD'), amount: num('Suma') } },
};

// Câmpurile fiecărui tip. Tipurile din etapele 2–4 au deocamdată doar recunoașterea.
const SCHEMAS = {
  carte_vizita: {
    description: 'Carte de vizită (a unei persoane sau firme).',
    properties: {
      name: str('Numele persoanei; dacă nu există, numele firmei'),
      phone: str('Primul număr de telefon, exact cum e scris'),
      email: str('Primul email'),
      company: str('Firma'),
      position: str('Funcția'),
      address: str('Adresa'),
      website: str('Site-ul'),
      other_phones: strList('Celelalte numere de telefon'),
      other_emails: strList('Celelalte emailuri'),
      other: str('Alte informații utile de pe carte (mesagerie, rețele sociale etc.)'),
    },
  },
  chestionar: {
    description: 'Chestionar sau formular completat (de obicei de mână) de un client care vrea un proiect.',
    properties: {
      name: str('Numele clientului'),
      phone: str('Telefonul, exact cum e scris'),
      email: str('Emailul'),
      type: enumOf(TYPES, `Tipul proiectului, doar dacă răspunsul se potrivește clar: ${Object.entries(TYPES).map(([k, v]) => `${k} = ${v}`).join('; ')}`),
      type_written: str('Tipul proiectului exact cum l-a scris clientul'),
      service: enumOf(SERVICES, `Serviciul dorit, doar dacă se potrivește clar: ${Object.entries(SERVICES).map(([k, v]) => `${k} = ${v}`).join('; ')}`),
      service_written: str('Serviciul exact cum l-a scris clientul'),
      message: str('Descrierea proiectului / „Despre proiect”'),
      answers: {
        type: 'array',
        description: 'Toate celelalte întrebări din chestionar cu răspunsurile lor',
        items: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] },
      },
    },
  },
  aviz: {
    description: 'Aviz de expediere sau factură fiscală cu rânduri de marfă livrată către noi.',
    properties: EXPENSE_PROPS,
  },
  chitanta: {
    description: 'Bon fiscal, chitanță sau factură marcată „achitat” (o cheltuială deja plătită).',
    properties: EXPENSE_PROPS,
  },
  de_platit: {
    description: 'Factură sau contract emis către noi, cu o dată de plată sau rate, fără semne că e achitat.',
    properties: { ...EXPENSE_PROPS, installments: INSTALLMENTS },
  },
  de_incasat: {
    description: 'Factură sau contract emis de NOI către un client (sumă de încasat).',
    properties: {
      counterparty: {
        type: 'object',
        description: 'Clientul (cumpărătorul / beneficiarul), nu firma noastră',
        properties: { name: str('Numele clientului (persoană sau firmă)'), idno: str('Codul fiscal / IDNP'), phone: str('Telefonul'), email: str('Emailul') },
      },
      doc_number: str('Numărul documentului'),
      doc_date: str('Data documentului, format YYYY-MM-DD'),
      currency: str('Moneda: MDL, EUR sau alta (cod de 3 litere); lei = MDL'),
      amount_total: num('Totalul de încasat'),
      is_contract: { type: 'boolean', description: 'true dacă e un contract (nu o factură)' },
      installments: INSTALLMENTS,
    },
  },
  // Listele de prețuri (Etapa 4): rânduri scurte, ca să încapă cât mai multe într-un răspuns
  lista_preturi: {
    description: 'Listă de prețuri (ofertă, prețuri curente) a unui furnizor: produse cu prețuri, fără o livrare anume.',
    properties: {
      supplier: str('Furnizorul care a emis lista'),
      supplier_idno: str('Codul fiscal (IDNO) al furnizorului'),
      list_date: str('Data listei (sau „valabil din”), format YYYY-MM-DD'),
      currency: str('Moneda prețurilor: MDL, EUR sau alta (cod de 3 litere); lei = MDL'),
      prices_with_vat: { type: 'boolean', description: 'true DOAR dacă lista are numai prețuri cu TVA (nu are și coloana fără TVA)' },
      rows: {
        type: 'array',
        description: 'TOATE rândurile cu produse, în ordinea din listă (fără titluri de grupă și fără totaluri). ' +
          'Ca preț ia prețul fără TVA, dacă lista le are pe amândouă. Omite câmpurile goale; „uncertain” doar când e true.',
        items: {
          type: 'object',
          properties: {
            code: str('Codul / articolul produsului'),
            name: str('Denumirea'),
            unit: str('Unitatea de măsură'),
            price: num('Prețul unitar'),
            uncertain: { type: 'boolean', description: 'true dacă rândul e citit neclar (cifre șterse, prețul nu se vede)' },
          },
          required: ['name'],
        },
      },
    },
  },
};

function tools() {
  const list = Object.entries(SCHEMAS).map(([name, s]) => ({
    name,
    description: `${DOC_TYPES[name].label}: ${s.description}`,
    input_schema: { type: 'object', properties: s.properties || { summary: str('Pe scurt, ce document e și de la cine') } },
  }));
  list.push({
    name: 'not_a_document',
    description: 'Imaginea nu e un document (peisaj, persoană, obiect, pagină goală sau ilizibilă).',
    input_schema: { type: 'object', properties: { reason: str('De ce nu e un document') } },
  });
  return list;
}

function system() {
  const own = (process.env.OWN_COMPANY_NAMES || 'LUXARCH, Atelier Temelia').trim();
  const idno = (process.env.OWN_IDNO || '').trim();
  return [
    'Citești documente fotografiate sau scanate pentru biroul de arhitectură LUXARCH din Republica Moldova.',
    'Răspunde DOAR apelând exact o unealtă, fără text: tipul documentului, cu câmpurile citite, sau not_a_document.',
    `Firma noastră: ${own}${idno ? ` (IDNO ${idno})` : ''}. Un document emis de noi către altcineva e „de_incasat”.`,
    'Reguli:',
    '- Nu inventa nimic. Un câmp care nu apare în document rămâne gol ("").',
    '- Copiază textul exact cum e scris (română, rusă sau engleză), fără traducere și fără transliterare.',
    '- La scrisul de mână, pune [?] în locul unui cuvânt pe care nu-l poți citi.',
    '- Toate paginile primite sunt același document (de ex. fața și verso unei cărți de vizită).',
  ].join('\n');
}

// pages: [{ mime, data: Buffer }]; forced: tipul ales de utilizator (sau null)
// timeout: cât mai are voie să dureze apelul (docs/read scade timpul deja folosit pentru descărcarea fișierelor)
async function readDocument(pages, forced = null, timeout = TIMEOUT) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('Lipsește ANTHROPIC_API_KEY');

  const content = pages.map(p => (p.mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: p.mime, data: p.data.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data.toString('base64') } }));
  content.push({
    type: 'text',
    text: forced
      ? `Acesta e un document de tipul „${DOC_TYPES[forced].label}”. Citește câmpurile și apelează unealta ${forced}.`
      : 'Ce document e acesta? Apelează unealta potrivită și completează câmpurile.',
  });

  let data;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: MAX_TOKENS,
        system: system(),
        // Unele modele nu acceptă tool_choice „any”/„tool”: alegerea rămâne „auto”,
        // iar la tipul ales de utilizator Claude primește doar unealta acelui tip
        tools: forced ? tools().filter(t => t.name === forced) : tools(),
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
    data = await r.json();
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw coded('timeout', `Claude nu a răspuns în ${Math.round(timeout / 1000)} s`);
    throw e;
  }
  // Răspuns tăiat: unealta e incompletă (lipsesc rândurile de la sfârșit), deci nu se folosește deloc
  if (data.stop_reason === 'max_tokens') throw coded('too_long', 'Răspunsul lui Claude a fost tăiat (max_tokens)');
  const call = (data.content || []).find(b => b.type === 'tool_use');
  if (!call) throw new Error(`Claude nu a ales nicio unealtă (stop_reason: ${data.stop_reason})`);
  return { doc_type: call.name === 'not_a_document' ? null : call.name, input: call.input || {} };
}

module.exports = { readDocument };
