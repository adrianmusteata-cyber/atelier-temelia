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
  in_lucru: 'În lucru',
  procesat: 'Procesat',
  avans: 'Avans',
  incheiat: 'Încheiat',
  respins: 'Respins',
  inchisa: 'Închisă',
};

const SOURCES = {
  site: 'Site web',
  manual: 'Manual',
};

// Canalul clientului adăugat manual
const CHANNELS = {
  apel: 'Apel',
  intalnire: 'Întâlnire',
};

module.exports = { TYPES, SERVICES, STATUSES, SOURCES, CHANNELS };
