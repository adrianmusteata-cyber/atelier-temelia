/* ==========================================================
   Panoul de administrare — Financiar: cheltuieli (listă, fișă, adăugare manuală)
   și raportul lunar. Formularul de cheltuială e folosit și de ecranul de verificare
   al documentelor (admin.js). Adrese: /admin?fin=list&month=2026-10&cat=&q=,
   /admin?fin=exp&eid=12, /admin?fin=new, /admin?fin=report, /admin?fin=report&m=2026-10
   ========================================================== */
window.LUXFIN = (() => {
  let L; // ajutoarele comune din admin.js (api, esc, num, go…)
  const CATEGORIES = { materiale: 'Materiale', echipamente: 'Echipamente și IT', software: 'Software și abonamente', transport: 'Transport și combustibil', chirie: 'Chirie și utilități', subcontractori: 'Subcontractori și servicii', birou: 'Birou și consumabile', taxe: 'Taxe și impozite', altele: 'Altele' };
  const SOURCES = { aviz: 'Aviz', chitanta: 'Chitanță', manual: 'Manual', de_platit: 'De plătit' };
  const FIELD_NAMES = { supplier: 'furnizor', supplier_idno: 'cod fiscal', doc_number: 'număr', doc_date: 'data', currency: 'moneda', amount_net: 'suma fără TVA', vat: 'TVA', amount_total: 'total', category: 'categorie', note: 'notă', items: 'articole' };
  const ITEM_FIELDS = [['name', 'Denumire'], ['code', 'Cod'], ['unit', 'Unit.'], ['qty', 'Cant.'], ['unit_price', 'Preț'], ['line_total', 'Sumă']];
  const fin = () => document.getElementById('fin');
  let seq = 0;

  const monthName = m => {
    const [y, mo] = m.split('-').map(Number);
    const s = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return s[0].toUpperCase() + s.slice(1);
  };
  const thisMonth = () => L.today().slice(0, 7);
  const lastMonths = n => Array.from({ length: n }, (_, i) => {
    const [y, mo] = thisMonth().split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1 - i, 1)).toISOString().slice(0, 7);
  });
  // Sumă pentru câmp: „12 500,5” → la fel; gol → gol
  const amountIn = v => (v === null || v === undefined || v === '' ? '' : L.num(v));
  const qtyIn = v => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
  const parseQty = s => { const t = String(s).replace(/[\s ]/g, '').replace(',', '.'); return /^\d{1,11}(\.\d{1,3})?$/.test(t) ? Number(t) : null; };

  /* ---------- Formularul de cheltuială (comun cu ecranul de verificare) ---------- */
  function itemHtml(it = {}) {
    return `<li class="exp-item">${ITEM_FIELDS.map(([k, l]) => `<label class="exp-cell exp-${k}"><span>${l}</span>
      <input class="admin-input" data-k="${k}" ${['qty', 'unit_price', 'line_total'].includes(k) ? 'inputmode="decimal"' : ''} autocomplete="off"
        value="${L.esc(k === 'qty' ? qtyIn(it[k]) : ['unit_price', 'line_total'].includes(k) ? amountIn(it[k]) : it[k] || '')}"></label>`).join('')}
      <button class="link-btn danger exp-del" type="button" aria-label="Șterge rândul">✕</button></li>`;
  }

  function formHtml(f = {}) {
    const field = (name, label, attrs = '', wide = false) => `<label class="new-field${wide ? ' new-field-wide' : ''}"><span class="admin-label">${label}</span>
      <input class="admin-input" name="${name}" ${attrs} autocomplete="off" value="${L.esc(['amount_net', 'vat', 'amount_total'].includes(name) ? amountIn(f[name]) : f[name] || '')}"></label>`;
    return `<div class="exp-form">
      <div class="new-grid">
        ${field('supplier', 'Furnizor *', 'maxlength="200"', true)}
        ${field('supplier_idno', 'Cod fiscal (IDNO)', 'maxlength="30"')}
        ${field('doc_number', 'Număr document', 'maxlength="60"')}
        <label class="new-field"><span class="admin-label">Data *</span><input class="admin-input" name="doc_date" type="date" max="${L.today()}" value="${L.esc(f.doc_date || '')}"></label>
        <label class="new-field"><span class="admin-label">Categorie *</span><select class="admin-input" name="category">${L.options(CATEGORIES, f.category || 'altele')}</select></label>
        <label class="new-field"><span class="admin-label">Moneda</span><select class="admin-input" name="currency">${L.options({ MDL: 'MDL', EUR: 'EUR' }, f.currency || 'MDL')}</select></label>
        ${field('amount_net', 'Sumă fără TVA', 'inputmode="decimal"')}
        ${field('vat', 'TVA', 'inputmode="decimal"')}
        ${field('amount_total', 'Total *', 'inputmode="decimal"')}
        <label class="new-field new-field-wide"><span class="admin-label">Notă</span><textarea class="admin-input" name="note" rows="2" maxlength="1000">${L.esc(f.note || '')}</textarea></label>
      </div>
      <p class="admin-label exp-items-title">Articole</p>
      <ol class="exp-items">${(f.items || []).map(itemHtml).join('')}</ol>
      <button class="btn btn-sm btn-ghost exp-add" type="button">+ Adaugă rând</button>
      <p class="exp-warn" hidden></p>
    </div>`;
  }

  function readForm(root) {
    const v = n => root.querySelector(`[name="${n}"]`).value.trim();
    const out = {};
    ['supplier', 'supplier_idno', 'doc_number', 'doc_date', 'currency', 'amount_net', 'vat', 'amount_total', 'category', 'note'].forEach(n => { out[n] = v(n); });
    out.items = [...root.querySelectorAll('.exp-item')].map(li => Object.fromEntries(
      [...li.querySelectorAll('input[data-k]')].map(i => [i.dataset.k, i.value.trim()]),
    )).filter(it => Object.values(it).some(Boolean));
    return out;
  }

  // Mesaj de eroare pentru browser, sau '' dacă se poate trimite
  function checkForm(f) {
    if (!f.supplier) return 'Completează furnizorul.';
    if (!f.doc_date) return 'Alege data documentului.';
    if (f.doc_date > L.today()) return 'Data nu poate fi în viitor.';
    if (!L.parseMoney(f.amount_total)) return 'Introdu totalul (mai mare ca 0, cel mult 2 zecimale).';
    for (const k of ['amount_net', 'vat']) if (f[k] && L.parseMoney(f[k]) === null) return `Verifică ${FIELD_NAMES[k]}.`;
    for (const [i, it] of f.items.entries()) {
      if (!it.name) return `Rândul ${i + 1}: lipsește denumirea.`;
      if (it.qty && parseQty(it.qty) === null) return `Rândul ${i + 1}: cantitatea nu e validă.`;
      if ((it.unit_price && L.parseMoney(it.unit_price) === null) || (it.line_total && L.parseMoney(it.line_total) === null)) return `Rândul ${i + 1}: suma nu e validă.`;
    }
    return '';
  }

  // Avertismente care nu blochează salvarea
  function warnings(f) {
    const out = [];
    const net = L.parseMoney(f.amount_net), vat = L.parseMoney(f.vat) || 0, total = L.parseMoney(f.amount_total);
    if (net !== null && total && Math.abs(net + vat - total) > 0.05) out.push(`Suma fără TVA + TVA (${L.num(net + vat)}) nu dă totalul (${L.num(total)}).`);
    if (f.items.length) {
      const sum = f.items.reduce((s, it) => s + (L.parseMoney(it.line_total) ?? ((parseQty(it.qty) || 0) * (L.parseMoney(it.unit_price) || 0))), 0);
      const ref = net ?? total;
      const okVsTotal = total && Math.abs(sum - total) <= 0.05;
      if (ref && Math.abs(sum - ref) > 0.05 && !okVsTotal) out.push(`Suma articolelor (${L.num(sum)}) diferă de ${net !== null ? 'suma fără TVA' : 'total'} (${L.num(ref)}).`);
    }
    return out;
  }

  function bindForm(root) {
    const list = root.querySelector('.exp-items'), warn = root.querySelector('.exp-warn');
    const refresh = () => {
      const w = warnings(readForm(root));
      warn.hidden = !w.length;
      warn.textContent = w.join(' ');
    };
    root.querySelector('.exp-add').addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', itemHtml());
      list.lastElementChild.querySelector('input').focus();
    });
    list.addEventListener('click', e => {
      if (e.target.closest('.exp-del')) { e.target.closest('.exp-item').remove(); refresh(); }
    });
    root.addEventListener('input', refresh);
    refresh();
  }

  const dupesHtml = (list, btnLabel = 'Salvează oricum') => `<p><b>Pare deja înregistrată:</b></p><ul>${list.map(d =>
    `<li>${L.esc(d.supplier)}${d.doc_number ? `, nr. ${L.esc(d.doc_number)}` : ''}, ${L.esc(L.fmtPayDay(d.doc_date))} — ${L.esc(L.money(d.amount_total, d.currency))}
      <a class="link-btn" href="/admin?fin=exp&eid=${L.esc(d.id)}" data-exp="${L.esc(d.id)}">Deschide</a></li>`).join('')}</ul>
    <p class="muted">Dacă e alt document, apasă „${btnLabel}”.</p>`;

  const errText = (e2, fallback) => (e2.status === 400 && e2.fields.length
    ? `Verifică: ${e2.fields.map(f => FIELD_NAMES[f] || f).join(', ')}.` : fallback);

  /* ---------- Navigare ---------- */
  function route(p) {
    L.show('fin');
    const what = p.get('fin');
    if (what === 'exp' && p.get('eid')) return loadExpense(p.get('eid'));
    if (what === 'new') return showNew();
    if (what === 'report') return p.get('m') ? loadMonth(p.get('m')) : loadReport();
    if (what === 'paid') return loadPaid(p);
    return loadList(p);
  }

  const tabs = active => `<div class="admin-head">
      <h1 class="admin-title">Financiar</h1>
      <nav class="view-switch" aria-label="Financiar">
        <a class="filter${active === 'list' ? ' is-on' : ''}" href="/admin?fin=list">Cheltuieli</a>
        <a class="filter${active === 'paid' ? ' is-on' : ''}" href="/admin?fin=paid">Facturi plătite</a>
        <a class="filter${active === 'report' ? ' is-on' : ''}" href="/admin?fin=report">Raport</a>
      </nav>
    </div>`;

  function failed(err, retry) {
    L.onError(err, () => {
      fin().insertAdjacentHTML('beforeend', '<p class="admin-msg">Nu am putut încărca datele. <button class="btn btn-sm btn-ghost" data-retry>Reîncearcă</button></p>');
      fin().querySelector('[data-retry]').onclick = retry;
    });
  }

  /* ---------- Lista cheltuielilor ---------- */
  async function loadList(p) {
    const s = ++seq;
    const month = p.get('month') === 'all' ? 'all' : /^\d{4}-\d{2}$/.test(p.get('month') || '') ? p.get('month') : thisMonth();
    const cat = CATEGORIES[p.get('cat')] ? p.get('cat') : '';
    const q = p.get('q') || '';
    const months = lastMonths(24);
    if (month !== 'all' && !months.includes(month)) months.push(month);
    fin().innerHTML = `${tabs('list')}
      <form class="fin-filters" id="finFilters">
        <select class="admin-input" name="month" aria-label="Luna">
          ${months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${L.esc(monthName(m))}</option>`).join('')}
          <option value="all"${month === 'all' ? ' selected' : ''}>Toate</option>
        </select>
        <select class="admin-input" name="cat" aria-label="Categoria">${L.options(CATEGORIES, cat, 'Toate categoriile')}</select>
        <input class="admin-input" name="q" type="search" placeholder="Furnizor sau număr" value="${L.esc(q)}" aria-label="Caută">
        <a class="btn btn-sm" href="/admin?fin=new">+ Adaugă cheltuială</a>
      </form>
      <p class="fin-total" id="finTotal"></p>
      <p class="admin-msg" id="finMsg">Se încarcă…</p>
      <ul class="req-list" id="finList"></ul>`;

    const form = document.getElementById('finFilters');
    const apply = () => {
      const qs = new URLSearchParams({ fin: 'list', month: form.month.value });
      if (form.cat.value) qs.set('cat', form.cat.value);
      if (form.q.value.trim()) qs.set('q', form.q.value.trim());
      L.go(qs.toString(), true);
    };
    form.month.addEventListener('change', apply);
    form.cat.addEventListener('change', apply);
    form.addEventListener('submit', e => { e.preventDefault(); apply(); });
    let t;
    form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 500); });
    if (q) { form.q.focus(); form.q.setSelectionRange(q.length, q.length); }

    try {
      const qs = new URLSearchParams({ month });
      if (cat) qs.set('category', cat);
      if (q) qs.set('q', q);
      const { items, totals } = await L.api('/api/admin/expenses?' + qs);
      if (s !== seq) return;
      const tot = Object.entries(totals).map(([c, v]) => L.money(v, c)).join(' · ');
      document.getElementById('finTotal').textContent = tot ? `Total: ${tot}` : '';
      document.getElementById('finMsg').textContent = items.length ? '' : 'Nicio cheltuială pentru acest filtru.';
      document.getElementById('finList').innerHTML = items.map(e => `<li><a class="req" href="/admin?fin=exp&eid=${L.esc(e.id)}">
        <span class="req-name">${L.esc(e.supplier)}</span>
        <b class="fin-sum">${L.esc(L.money(e.amount_total, e.currency))}</b>
        <span class="req-meta">${L.esc(L.fmtPayDay(e.doc_date))} · ${L.esc(CATEGORIES[e.category] || e.category)}${e.doc_number ? ` · nr. ${L.esc(e.doc_number)}` : ''}${e.has_doc ? ' · 📎 document' : ''}</span>
      </a></li>`).join('');
    } catch (err) {
      if (s !== seq) return;
      document.getElementById('finMsg').textContent = '';
      failed(err, () => loadList(p));
    }
  }

  /* ---------- Cheltuială nouă (manual) ---------- */
  function showNew() {
    ++seq;
    fin().innerHTML = `<a class="back" href="/admin?fin=list">← Înapoi</a>
      <form class="detail-card" id="expForm" novalidate>
        <h1>Cheltuială nouă</h1>
        <p class="muted">Adăugată manual, fără document. Pentru un aviz sau o chitanță, folosiți „Încarcă document”.</p>
        ${formHtml({ doc_date: L.today() })}
        <div class="doc-dupes" id="expDupes" hidden></div>
        <div class="reject-actions"><button class="btn" type="submit" id="expSave">Salvează cheltuiala</button></div>
        <p class="admin-msg" id="expMsg" role="alert"></p>
      </form>`;
    const form = document.getElementById('expForm');
    bindForm(form);
    form.supplier.focus();
    let force = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = readForm(form), msg = document.getElementById('expMsg'), btn = document.getElementById('expSave');
      const bad = checkForm(f);
      if (bad) { msg.textContent = bad; return; }
      btn.disabled = true; msg.textContent = '';
      try {
        const { item } = await L.api('/api/admin/expenses', { method: 'POST', body: JSON.stringify({ ...f, force }) });
        L.go(`fin=exp&eid=${item.id}`, true);
      } catch (err) {
        L.onError(err, e2 => {
          if (e2.status === 409) {
            force = true;
            const box = document.getElementById('expDupes');
            box.innerHTML = dupesHtml(e2.data.duplicates || []); box.hidden = false;
            btn.textContent = 'Salvează oricum';
            return;
          }
          msg.textContent = errText(e2, 'Nu s-a salvat. Încearcă din nou.');
        });
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Fișa cheltuielii ---------- */
  const docName = d => `${L.DOC_TYPES[d.doc_type]?.label || d.doc_type} — ${d.mime === 'application/pdf' ? 'PDF' : `pagina ${d.page}`}`;

  async function loadExpense(id) {
    const s = ++seq;
    fin().innerHTML = '<a class="back" href="/admin?fin=list">← Înapoi</a><p class="admin-msg">Se încarcă…</p>';
    let e;
    try {
      ({ item: e } = await L.api('/api/admin/expenses?id=' + encodeURIComponent(id)));
    } catch (err) {
      if (s !== seq) return;
      if (err.status === 404) { fin().innerHTML = '<a class="back" href="/admin?fin=list">← Înapoi</a><p class="admin-msg">Cheltuiala nu mai există.</p>'; return; }
      return failed(err, () => loadExpense(id));
    }
    if (s !== seq) return;
    fin().innerHTML = `<a class="back" href="/admin?fin=list&month=${L.esc(e.doc_date.slice(0, 7))}">← Înapoi</a>
      <form class="detail-card" id="expForm" novalidate>
        <h1>${L.esc(e.supplier)}</h1>
        <p class="muted"><span class="src src-${L.esc(e.source)}">${L.esc(SOURCES[e.source] || e.source)}</span> ${L.esc(L.money(e.amount_total, e.currency))} · ${L.esc(L.fmtPayDay(e.doc_date))}</p>
        ${e.documents.length ? `<p class="admin-label">Documente</p><ul class="doc-links">${e.documents.map(d =>
          `<li><button class="link-btn" type="button" data-doc="${L.esc(d.id)}">${L.esc(docName(d))}</button></li>`).join('')}</ul>` : ''}
        ${formHtml(e)}
        <div class="reject-actions">
          <button class="btn" type="submit" id="expSave">Salvează modificările</button>
          ${e.source === 'de_platit' ? '' : '<button class="btn btn-sm btn-ghost" type="button" id="expToPay">Mută în De plătit</button>'}
          <button class="btn btn-sm btn-ghost danger-btn" type="button" id="expDel">Șterge</button>
        </div>
        <p class="admin-msg" id="expMsg" role="alert"></p>
      </form>`;
    const form = document.getElementById('expForm'), msg = document.getElementById('expMsg');
    bindForm(form);
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = readForm(form), btn = document.getElementById('expSave');
      const bad = checkForm(f);
      if (bad) { msg.textContent = bad; return; }
      btn.disabled = true; msg.className = 'admin-msg'; msg.textContent = '';
      try {
        await L.api('/api/admin/expenses?id=' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(f) });
        msg.className = 'admin-msg ok'; msg.textContent = '✓ Salvat';
        form.querySelector('h1').textContent = f.supplier;
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = e2.status === 404 ? 'Cheltuiala nu mai există.' : errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
    // Factura e de fapt neplătită: devine document „De plătit” (cu articolele și originalul)
    document.getElementById('expToPay')?.addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      if (!confirm(`Muți ${e.supplier}, ${L.money(e.amount_total, e.currency)} în Scadențe → De plătit?\nCheltuiala dispare din Financiar până marchezi factura plătită. Scadența propusă: data documentului + 30 de zile (o poți schimba).`)) return;
      btn.disabled = true;
      try {
        const { payable_id: pid } = await L.api(`/api/admin/expenses?id=${encodeURIComponent(id)}&action=to_payable`, { method: 'POST', body: '{}' });
        L.go(`due=payd&pid=${pid}`, true);
      } catch (err) {
        btn.disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a mutat. Încearcă din nou.'; });
      }
    });
    document.getElementById('expDel').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      const docs = e.documents.length ? ' Se șterge și documentul.' : '';
      if (!confirm(`Ștergi cheltuiala ${e.supplier}, ${L.money(e.amount_total, e.currency)}?${docs}`)) return;
      btn.disabled = true;
      try {
        await L.api('/api/admin/expenses?id=' + encodeURIComponent(id), { method: 'DELETE' });
        L.go(`fin=list&month=${e.doc_date.slice(0, 7)}`, true);
      } catch (err) {
        btn.disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a șters. Încearcă din nou.'; });
      }
    });
  }

  /* ---------- Raport ---------- */
  /* ---------- Facturi plătite (din Scadențe → De plătit, după data plății) ---------- */
  async function loadPaid(p) {
    const s = ++seq;
    const month = p.get('month') === 'all' ? 'all' : /^\d{4}-\d{2}$/.test(p.get('month') || '') ? p.get('month') : thisMonth();
    const months = lastMonths(24);
    if (month !== 'all' && !months.includes(month)) months.push(month);
    fin().innerHTML = `${tabs('paid')}
      <form class="fin-filters fin-filters-1" id="paidFilters">
        <select class="admin-input" name="month" aria-label="Luna plății">
          ${months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${L.esc(monthName(m))}</option>`).join('')}
          <option value="all"${month === 'all' ? ' selected' : ''}>Toate</option>
        </select>
      </form>
      <p class="muted">Facturile din Scadențe → De plătit marcate „Plătită”, după data plății.</p>
      <p class="fin-total" id="paidTotal"></p>
      <p class="admin-msg" id="paidMsg">Se încarcă…</p>
      <ul class="req-list" id="paidList"></ul>`;
    document.getElementById('paidFilters').month.addEventListener('change', e => L.go(`fin=paid&month=${e.target.value}`, true));
    try {
      const { items, totals } = await L.api(`/api/admin/dues?kind=pay&filter=paid&month=${month}`);
      if (s !== seq) return;
      const tot = Object.entries(totals).map(([c, v]) => L.money(v, c)).join(' · ');
      document.getElementById('paidTotal').textContent = tot ? `Plătit: ${tot}` : '';
      document.getElementById('paidMsg').textContent = items.length ? '' : 'Nicio factură plătită în această perioadă.';
      document.getElementById('paidList').innerHTML = items.map(r => `<li><a class="req" href="/admin?due=payd&pid=${L.esc(r.payable_id)}">
        <span class="req-name">${L.esc(r.supplier)}</span>
        <b class="fin-sum">${L.esc(L.money(r.paid_amount, r.currency))}</b>
        <span class="req-meta">Plătită ${L.esc(L.fmtPayDay(r.paid_on))}${r.doc_number ? ` · nr. ${L.esc(r.doc_number)}` : ''} · factura din ${L.esc(L.fmtPayDay(r.doc_date))} · ${L.esc(CATEGORIES[r.category] || r.category)}${r.paid_amount !== r.amount ? ` · rata era ${L.esc(L.money(r.amount, r.currency))}` : ''}${r.has_doc ? ' · 📎 document' : ''}</span>
      </a></li>`).join('');
    } catch (err) {
      if (s !== seq) return;
      document.getElementById('paidMsg').textContent = '';
      failed(err, () => loadPaid(p));
    }
  }

  async function loadReport() {
    const s = ++seq;
    fin().innerHTML = `${tabs('report')}<p class="admin-msg" id="repMsg">Se încarcă…</p><div id="rep"></div>`;
    try {
      const { currencies } = await L.api('/api/admin/report');
      if (s !== seq) return;
      document.getElementById('repMsg').textContent = currencies.length ? 'Ultimele 12 luni. Apasă pe o lună pentru cheltuielile pe categorii.' : 'Nicio plată și nicio cheltuială în ultimele 12 luni.';
      const cellMoney = (v, cur) => (v ? L.esc(L.money(v, cur)) : '—');
      document.getElementById('rep').innerHTML = currencies.map(c => `<section class="rep-block">
        <h2>${L.esc(c.currency)}</h2>
        <div class="rep-scroll"><table class="rep-table">
          <thead><tr><th>Luna</th><th>Venituri</th><th>Cheltuieli</th><th>Rezultat</th></tr></thead>
          <tbody>${c.rows.map(r => {
            const res = Math.round((r.income - r.expense) * 100) / 100;
            return `<tr data-m="${r.month}" tabindex="0"><td>${L.esc(monthName(r.month))}</td><td>${cellMoney(r.income, c.currency)}</td>
              <td>${cellMoney(r.expense, c.currency)}</td><td class="${res < 0 ? 'is-neg' : ''}">${r.income || r.expense ? L.esc(L.money(res, c.currency).replace(/^-?/, res < 0 ? '−' : '')) : '—'}</td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><th>Total 12 luni</th><th>${L.esc(L.money(c.totals.income, c.currency))}</th><th>${L.esc(L.money(c.totals.expense, c.currency))}</th>
            <th class="${c.totals.result < 0 ? 'is-neg' : ''}">${L.esc(L.money(Math.abs(c.totals.result), c.currency))}${c.totals.result < 0 ? ' (pierdere)' : ''}</th></tr></tfoot>
        </table></div></section>`).join('');
    } catch (err) {
      if (s !== seq) return;
      document.getElementById('repMsg').textContent = '';
      failed(err, loadReport);
    }
  }

  async function loadMonth(m) {
    const s = ++seq;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return L.go('fin=report', true);
    fin().innerHTML = `<a class="back" href="/admin?fin=report">← Raport</a><h1 class="admin-title">${L.esc(monthName(m))}</h1><p class="admin-msg" id="repMsg">Se încarcă…</p><div id="rep"></div>`;
    try {
      const { expenses, payments } = await L.api('/api/admin/report?month=' + m);
      if (s !== seq) return;
      document.getElementById('repMsg').textContent = '';
      const cats = Object.entries(expenses).map(([cur, c]) => `<section class="rep-block">
        <h2>Cheltuieli · ${L.esc(cur)} <span class="muted">${L.esc(L.money(c.total, cur))}</span></h2>
        <ul class="rep-cats">${Object.entries(c.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>
          <a href="/admin?fin=list&month=${m}&cat=${k}">${L.esc(CATEGORIES[k] || k)}</a>
          <b>${L.esc(L.money(v, cur))}</b><span class="muted">${Math.round(v / c.total * 100)}%</span>
          <span class="rep-bar" style="--w:${(v / c.total * 100).toFixed(1)}%"></span></li>`).join('')}</ul></section>`).join('');
      const pays = payments.length ? `<section class="rep-block"><h2>Plăți primite</h2><ul class="rep-cats">${payments.map(p => `<li>
          <a href="/admin?id=${L.esc(p.request_id)}">${L.esc(p.name)}</a><b>${L.esc(L.money(p.amount, p.currency))}</b><span class="muted">${L.esc(L.fmtPayDay(p.paid_on))}</span></li>`).join('')}</ul></section>` : '';
      document.getElementById('rep').innerHTML = (cats || '<p class="muted">Nicio cheltuială în această lună.</p>') + (pays || '<p class="muted">Nicio plată primită în această lună.</p>');
    } catch (err) {
      if (s !== seq) return;
      document.getElementById('repMsg').textContent = '';
      failed(err, () => loadMonth(m));
    }
  }

  /* ---------- Clicuri ---------- */
  function init(helpers) {
    L = helpers;
    const root = fin();
    root.addEventListener('click', e => {
      const row = e.target.closest('tr[data-m]');
      if (row) return L.go(`fin=report&m=${row.dataset.m}`);
      const docBtn = e.target.closest('button[data-doc]');
      if (docBtn) return L.openDoc(docBtn.dataset.doc);
      L.internal(e, e.target.closest('a[href^="/admin"]'));
    });
    root.addEventListener('keydown', e => {
      const row = e.target.closest('tr[data-m]');
      if (row && e.key === 'Enter') L.go(`fin=report&m=${row.dataset.m}`);
    });
  }

  return { init, route, formHtml, readForm, checkForm, bindForm, dupesHtml, errText };
})();
