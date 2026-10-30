/* Ce vede angajatul (rolul 'staff' din Mini App Telegram): pâlnia și scanerul, fără bani.
   Filtrele se aplică pe server; interfața doar ascunde ce oricum nu primește. */

// Câmpurile cu bani din cereri: nu pleacă niciodată spre angajat
const MONEY_FIELDS = ['contract_value', 'currency', 'paid_total', 'overdue', 'payments', 'receivables'];

// Tipurile de documente pe care angajatul le poate salva: clienți (carte de vizită, chestionar) și cheltuieli
const STAFF_DOC_TYPES = ['carte_vizita', 'chestionar', 'aviz', 'chitanta'];

// Clientul fără câmpurile cu bani
function stripMoney(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  MONEY_FIELDS.forEach(k => { delete out[k]; });
  return out;
}

// Duplicatele unei cheltuieli: furnizorul, numărul și data, fără sumă și fără id (deci fără link)
const expenseDupes = list => (list || []).map(({ supplier, doc_number, doc_date }) => ({ supplier, doc_number, doc_date }));

module.exports = { MONEY_FIELDS, STAFF_DOC_TYPES, stripMoney, expenseDupes };
