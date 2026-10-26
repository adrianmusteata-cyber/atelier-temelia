/* Valorile fixe din formular și statusurile cererilor, cu textul românesc */

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
  nu_stiu: 'Nu știu încă',
};
const STATUSES = {
  noua: 'Nouă',
  in_lucru: 'În lucru',
  inchisa: 'Închisă',
};

module.exports = { TYPES, SERVICES, STATUSES };
