/* Citirea documentelor cu Claude (API-ul Anthropic), fără dependențe.
   Variabile: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (opțional), OWN_COMPANY_NAMES, OWN_IDNO (opționale).
   Un singur apel: Claude alege unealta tipului de document (sau not_a_document),
   iar argumentele uneltei sunt câmpurile citite. */
const { TYPES, SERVICES, DOC_TYPES } = require('./labels');

const MODEL = () => (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5').trim();
const TIMEOUT = 45000;

const str = description => ({ type: 'string', description });
const strList = description => ({ type: 'array', items: { type: 'string' }, description });
const enumOf = (map, description) => ({ type: 'string', enum: ['', ...Object.keys(map)], description });

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
  aviz: { description: 'Aviz de expediere sau factură fiscală cu rânduri de marfă livrată către noi.' },
  chitanta: { description: 'Bon fiscal, chitanță sau factură marcată „achitat” (o cheltuială deja plătită).' },
  de_platit: { description: 'Factură sau contract emis către noi, cu o dată de plată sau rate, fără semne că e achitat.' },
  de_incasat: { description: 'Factură sau contract emis de NOI către un client (sumă de încasat).' },
  lista_preturi: { description: 'Listă de prețuri a unui furnizor (produse și prețuri).' },
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
async function readDocument(pages, forced = null) {
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

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 4000,
      system: system(),
      // Unele modele nu acceptă tool_choice „any”/„tool”: alegerea rămâne „auto”,
      // iar la tipul ales de utilizator Claude primește doar unealta acelui tip
      tools: forced ? tools().filter(t => t.name === forced) : tools(),
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const call = (data.content || []).find(b => b.type === 'tool_use');
  if (!call) throw new Error(`Claude nu a ales nicio unealtă (stop_reason: ${data.stop_reason})`);
  return { doc_type: call.name === 'not_a_document' ? null : call.name, input: call.input || {} };
}

module.exports = { readDocument };
