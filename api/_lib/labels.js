/* Valorile fixe din formular, etapele pâlniei de vânzări și sursele, cu textul românesc */

const TYPES = {
  casa: 'Casă unifamilială',
  ansamblu: 'Ansamblu rezidențial',
  birouri: 'Clădire de birouri / comercială',
  hala: 'Hală / industrial',
  expertiza: 'Expertiză / consolidare',
  altceva: 'Altceva',
};
const SERVICES = {
  arh_rez: 'Arhitectură + Rezistență',
  arh: 'Doar arhitectură',
  rez: 'Doar rezistență',
  design: 'Design interior',
  management: 'Management de proiect',
  nu_stiu: 'Nu știu încă',
};
const STATUSES = {
  noua: 'Nouă',
  contactata: 'Contactată',
  in_lucru: 'În lucru',
  procesat: 'Procesat',
  avans: 'Avans',
  platit: 'Plătit',
  incheiat: 'Încheiat',
  respins: 'Respins',
  inchisa: 'Închisă',
};

const SOURCES = {
  site: 'Site web',
  manual: 'Manual',
  carte_vizita: 'Carte de vizită',
  chestionar: 'Chestionar',
  document: 'Document',
};

// Tipurile de documente recunoscute de Claude; `ready` = secțiunea de destinație există deja
const DOC_TYPES = {
  carte_vizita: { label: 'Carte de vizită', ready: true },
  chestionar: { label: 'Chestionar', ready: true },
  aviz: { label: 'Aviz de expediere', ready: false },
  chitanta: { label: 'Chitanță / factură achitată', ready: false },
  de_platit: { label: 'Factură / contract de plătit', ready: false },
  de_incasat: { label: 'Factură / contract de încasat', ready: false },
  lista_preturi: { label: 'Listă de prețuri', ready: false },
};

// Canalul clientului adăugat manual
const CHANNELS = {
  apel: 'Apel',
  intalnire: 'Întâlnire',
};

module.exports = { TYPES, SERVICES, STATUSES, SOURCES, CHANNELS, DOC_TYPES };
