/* ==========================================================
   Panoul de administrare — Catalog (Etapa 4): produsele furnizorilor și prețurile lor.
   Ecranul de verificare al listelor de prețuri (dialogul „Încarcă document” din admin.js) e tot aici: `review`.
   Adrese: /admin?cat=list&q=&sid=&sort=name|price|date, /admin?cat=prod&pid=12,
   /admin?cat=sup&sid=3 (&imp=noi-actualizate-neschimbate-vechi după import), /admin?cat=new&sid=3
   ========================================================== */
window.LUXCAT = (() => {
  let L; // ajutoarele comune din admin.js
  const root = () => document.getElementById('cat');
  let seq = 0;
  let suppliersCache = null;
  const STATUS = { new: 'Nou', changed: 'Preț schimbat', same: 'Neschimbat', uncertain: 'Nesigur' };
  const FILTERS = { all: 'Toate', uncertain: 'Nesigure', new: 'Noi', changed: 'Prețuri schimbate' };
  const SORTS = { name: 'Alfabetic', price: 'După preț', date: 'După dată' };
  const CURRENCIES = { MDL: 'MDL', EUR: 'EUR' };
  const FIELD_NAMES = { supplier: 'furnizorul', supplier_idno: 'IDNO', list_date: 'data listei', currency: 'moneda', note: 'nota', rows: 'rândurile', no_rows: 'niciun rând bifat', too_many: 'peste 1000 de rânduri', name: 'denumirea', code: 'codul', unit: 'unitatea', price: 'prețul', idno: 'IDNO' };

  const esc = s => L.esc(s);
  const fmtD = d => (d ? L.fmtPayDay(String(d).slice(0, 10)) : '');
  const pct = v => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`;
  const priceIn = v => (v === '' || v === null || v === undefined ? '' : L.parseMoney(v) !== null ? L.num(L.parseMoney(v)) : String(v));
  const rowsText = list => (list && list.length ? ` (rândurile ${list.slice(0, 12).join(', ')}${list.length > 12 ? '…' : ''})` : '');

  async function suppliers(force) {
    if (!suppliersCache || force) suppliersCache = (await L.api('/api/admin/catalog?suppliers=1')).items;
    return suppliersCache;
  }

  // Mesajele erorilor de la salvare (comune pentru import și formularele catalogului)
  function errText(e2, fallback) {
    const d = e2.data || {};
    if (e2.message === 'unresolved') return `Rezolvă rândurile nesigure${rowsText(d.rows)} sau debifează-le.`;
    if (e2.message === 'conflict') return `Există deja un produs cu același cod / aceeași denumire${rowsText(d.rows)}. Alege „Același cu…” sau debifează rândul.`;
    if (e2.message === 'dup_target') return `Mai multe rânduri duc la același produs${rowsText(d.rows)}. Păstrează doar unul.`;
    if (e2.message === 'rows') return `Unele rânduri bifate au erori${rowsText(d.rows)}. Corectează-le sau debifează-le.`;
    if (e2.message === 'exists') return 'Există deja un produs (sau un furnizor) cu același cod / IDNO.';
    if (e2.status === 404) return 'Furnizorul sau produsul nu mai există. Alege-l din nou.';
    if (e2.status === 400 && e2.fields.length) return `Verifică: ${e2.fields.map(f => FIELD_NAMES[f] || f).join(', ')}${rowsText(d.rows)}.`;
    return fallback;
  }

  /* ==========================================================
     Ecranul de verificare al listei de prețuri
     ========================================================== */
  let rv = null; // starea ecranului (un singur dialog deschis odată)

  function stateHtml(r, i) {
    const out = [`<span class="cat-tag is-${r.status}">${STATUS[r.status] || r.status}</span>`];
    if (r.old_price !== null && r.old_price !== undefined && r.status !== 'same' && r.status !== 'new') {
      const now = L.parseMoney(r.price);
      const diff = r.diff_pct !== null && r.diff_pct !== undefined && r.diff_pct !== 0
        ? ` <b class="${r.diff_pct > 0 ? 'cat-up' : 'cat-down'}">${pct(r.diff_pct)}</b>` : '';
      out.push(`<span class="cat-diff">${esc(L.money(r.old_price, r.old_currency))} → ${now !== null ? esc(L.money(now, rv.currency)) : '—'}${diff}</span>`);
    }
    if (r.older) out.push('<span class="cat-note">Listă mai veche decât prețul actual: prețul intră doar în istoric</span>');
    if (r.currency_note) out.push(`<span class="cat-note">${esc(r.currency_note)}</span>`);
    if (r.status === 'uncertain' && r.reason) out.push(`<span class="cat-reason">${esc(r.reason)}</span>`);
    if (r.error) out.push(`<span class="cat-err">${esc(r.error)}</span>`);
    if (r.status === 'uncertain') out.push(resolveHtml(r, i));
    return out.join('');
  }

  // La un rând nesigur: „Același cu: <produs>” (propus de server sau ales din căutare) sau „Produs nou”
  function resolveHtml(r, i) {
    const prod = p => `${esc(p.name)}${p.code ? ` <span class="muted">(${esc(p.code)})</span>` : ''} — ${esc(L.money(p.price, p.currency))}`;
    const opt = (value, text) => `<label><input type="radio" name="cat-res-${i}" value="${esc(value)}"${String(r.resolve) === String(value) ? ' checked' : ''}> <span>${text}</span></label>`;
    const parts = [];
    if (r.match) parts.push(opt(r.match.id, `Același cu: ${prod(r.match)}`));
    if (r.picked && (!r.match || r.picked.id !== r.match.id)) parts.push(opt(r.picked.id, `Același cu: ${prod(r.picked)}`));
    parts.push(opt('new', 'Produs nou'));
    const search = rv.supplierId ? `<button class="link-btn" type="button" data-act="pick">Alt produs…</button>
      <div class="cat-pick" hidden><input class="admin-input" type="search" placeholder="Caută după denumire sau cod" autocomplete="off" aria-label="Caută produsul"><ul class="cat-pick-list"></ul></div>` : '';
    return `<div class="cat-resolve">${parts.join('')}${search}</div>`;
  }

  function rowHtml(r, i) {
    const cell = (k, label, attrs) => `<label class="exp-cell cat-${k}"><span>${label}</span>
      <input class="admin-input" data-k="${k}" ${attrs} autocomplete="off" value="${esc(k === 'price' ? priceIn(r.price) : r[k] || '')}"></label>`;
    return `<li class="cat-row is-${r.status}${r.include ? '' : ' is-off'}" data-i="${i}">
      <label class="cat-inc"><input type="checkbox" data-k="include"${r.include ? ' checked' : ''}> <span>${i + 1}. Include</span></label>
      ${cell('code', 'Cod', 'maxlength="50"')}${cell('name', 'Denumire', 'maxlength="300"')}${cell('unit', 'Unit.', 'maxlength="50"')}${cell('price', 'Preț', 'inputmode="decimal"')}
      <div class="cat-state">${stateHtml(r, i)}</div>
    </li>`;
  }

  const rowEl = i => rv.el.querySelector(`.cat-row[data-i="${i}"]`);
  function renderState(i) {
    const li = rowEl(i), r = rv.rows[i];
    if (!li) return;
    li.className = `cat-row is-${r.status}${r.include ? '' : ' is-off'}`;
    li.querySelector('.cat-state').innerHTML = stateHtml(r, i);
    li.hidden = rv.filter !== 'all' && r.status !== rv.filter;
  }
  const stateKey = r => JSON.stringify([r.status, r.match && r.match.id, r.old_price, r.diff_pct, r.reason, r.older, r.currency_note, r.error, r.resolve, r.picked && r.picked.id, r.include]);
  const STATE_FIELDS = ['status', 'match_product_id', 'match', 'old_price', 'old_currency', 'diff_pct', 'reason', 'older', 'currency_note', 'error'];

  async function renderSup() {
    const box = rv.el.querySelector('.cat-sup');
    if (rv.supEdit) {
      box.innerHTML = '<label class="new-field"><span class="admin-label">Furnizor</span><select class="admin-input" data-act="sup-select"><option value="">Se încarcă furnizorii…</option></select></label>';
      let list = [];
      try { list = await suppliers(); } catch (e) { /* rămâne doar „Furnizor nou” */ }
      const sel = box.querySelector('select');
      if (!sel) return;
      sel.innerHTML = '<option value="">— alege furnizorul —</option>' +
        list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.idno ? ` · ${esc(s.idno)}` : ''}</option>`).join('') +
        '<option value="__new">＋ Furnizor nou</option>';
      sel.value = rv.supplierId ? String(rv.supplierId) : '__new';
      sel.focus();
      return;
    }
    box.innerHTML = rv.supplierId
      ? `<p class="cat-sup-line"><span class="admin-label">Furnizor</span> <b>${esc(rv.supName)}</b>${rv.supIdno ? ` <span class="muted">· IDNO ${esc(rv.supIdno)}</span>` : ''}
          <button class="link-btn" type="button" data-act="sup-change">Schimbă</button></p>`
      : `<p class="cat-sup-line"><b>Furnizor nou${rv.newName ? `: ${esc(rv.newName)}` : ''}</b>
          <button class="link-btn" type="button" data-act="sup-change">Alege un furnizor existent</button></p>
        <div class="new-grid">
          <label class="new-field"><span class="admin-label">Nume furnizor *</span><input class="admin-input" data-sup="newName" maxlength="200" autocomplete="off" value="${esc(rv.newName)}"></label>
          <label class="new-field"><span class="admin-label">IDNO</span><input class="admin-input" data-sup="newIdno" maxlength="30" autocomplete="off" value="${esc(rv.newIdno)}"></label>
        </div>`;
  }

  // Ce oprește salvarea (butonul „Salvează” e inactiv cât timp există), sau ''
  function blockMsg() {
    if (rv.pending) return 'Se recalculează stările rândurilor…';
    if (rv.failed) return 'Stările rândurilor nu s-au putut recalcula.';
    const inc = rv.rows.filter(r => r.include);
    if (!inc.length) return 'Bifează cel puțin un rând.';
    const bad = inc.filter(r => r.error).length;
    if (bad) return `Completează rândurile cu erori (${bad}) sau debifează-le.`;
    const open = inc.filter(r => r.status === 'uncertain' && !r.resolve).length;
    if (open) return `Rezolvă rândurile nesigure (${open}) sau debifează-le.`;
    return '';
  }

  function refresh() {
    const el = rv.el, rows = rv.rows;
    const c = { new: 0, changed: 0, same: 0, uncertain: 0 };
    rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    const inc = rows.filter(r => r.include).length;
    el.querySelector('.cat-sum').textContent = rows.length
      ? `${rows.length} rânduri: ${c.new} noi, ${c.changed} prețuri schimbate, ${c.same} neschimbate, ${c.uncertain} nesigure${inc !== rows.length ? ` · ${inc} bifate` : ''}`
      : 'Niciun rând. Adaugă rândurile manual.';
    const count = { all: rows.length, ...c };
    el.querySelector('.cat-filter').innerHTML = Object.entries(FILTERS).map(([k, l]) =>
      `<button class="filter${k === rv.filter ? ' is-on' : ''}" type="button" data-f="${k}">${l}<span class="count">${count[k] || 0}</span></button>`).join('');
    const same = el.querySelector('.cat-same');
    same.hidden = !rv.same_list;
    same.textContent = rv.same_list ? `Pare aceeași listă ca cea din ${fmtD(rv.same_list)}. Salvezi oricum?` : '';
    const block = blockMsg();
    const msg = el.querySelector('.cat-block');
    msg.innerHTML = esc(block) + (rv.failed ? ' <button class="link-btn" type="button" data-act="retry">Reîncearcă</button>' : '');
    const save = document.getElementById('docSave');
    if (save) save.disabled = !!block;
  }

  function applyFilter() {
    rv.el.querySelectorAll('.cat-row').forEach(li => {
      const r = rv.rows[Number(li.dataset.i)];
      li.hidden = rv.filter !== 'all' && r.status !== rv.filter;
    });
  }

  // Stările se recalculează pe server după orice corectare (cu o mică pauză cât se scrie)
  function scheduleMatch(delay = 500) {
    clearTimeout(rv.timer);
    rv.seq += 1; // un răspuns pornit înainte nu mai are voie să scrie
    rv.pending = true;
    refresh();
    const state = rv;
    rv.timer = setTimeout(() => doMatch(state), delay);
  }

  async function doMatch(state) {
    if (state !== rv) return; // între timp s-a deschis alt document
    const s = ++state.seq;
    const v = n => state.el.querySelector(`[name="${n}"]`).value;
    state.currency = v('currency');
    try {
      const res = await L.api('/api/admin/catalog?action=match', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: state.supplierId, list_date: v('list_date'), currency: state.currency,
          rows: state.rows.map(r => ({ code: r.code, name: r.name, unit: r.unit, price: r.price, uncertain: r.uncertain, include: r.include })),
        }),
      });
      if (state !== rv || s !== state.seq) return;
      res.rows.forEach((m, i) => {
        const r = state.rows[i];
        if (!r) return;
        const before = stateKey(r);
        STATE_FIELDS.forEach(k => { r[k] = m[k]; });
        // Alegerea rămâne doar cât rândul e tot nesigur și produsul ales e încă printre opțiuni
        if (r.status !== 'uncertain') { r.resolve = ''; r.picked = null; } else if (r.resolve && r.resolve !== 'new' &&
            String(r.resolve) !== String(r.match && r.match.id) && String(r.resolve) !== String(r.picked && r.picked.id)) r.resolve = '';
        if (stateKey(r) !== before || state.redraw) renderState(i);
      });
      state.redraw = false;
      state.same_list = res.same_list;
      state.sameOk = false;
      state.pending = false;
      state.failed = false;
    } catch (err) {
      if (state !== rv || s !== state.seq) return;
      state.pending = false;
      state.failed = true;
      L.onError(err, () => {});
    }
    refresh();
  }

  function searchProducts(input) {
    clearTimeout(rv.searchTimer);
    const ul = input.parentElement.querySelector('.cat-pick-list');
    const state = rv;
    rv.searchTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { ul.innerHTML = ''; return; }
      try {
        const { items } = await L.api(`/api/admin/catalog?supplier_id=${encodeURIComponent(state.supplierId)}&q=${encodeURIComponent(q)}`);
        if (state !== rv) return;
        ul.innerHTML = items.length ? items.slice(0, 10).map(p => `<li><button class="link-btn" type="button" data-pick="${esc(JSON.stringify({ id: p.id, name: p.name, code: p.code, price: p.price, currency: p.currency }))}">
            ${esc(p.name)}${p.code ? ` (${esc(p.code)})` : ''} — ${esc(L.money(p.price, p.currency))}</button></li>`).join('')
          : '<li class="muted">Niciun produs găsit.</li>';
      } catch (err) {
        L.onError(err, () => { ul.innerHTML = '<li class="muted">Căutarea nu a mers. Încearcă din nou.</li>'; });
      }
    }, 300);
  }

  function bindReview(el) {
    rv.el = el;
    // Enter într-un câmp nu trimite formularul (rândurile sunt multe; se salvează doar cu butonul)
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault(); });

    el.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.sup) { rv[t.dataset.sup] = t.value; return; }
      if (t.closest('.cat-pick')) return searchProducts(t);
      const li = t.closest('.cat-row');
      if (!li || !t.dataset.k || t.dataset.k === 'include') return;
      const r = rv.rows[Number(li.dataset.i)];
      r[t.dataset.k] = t.value.trim();
      // Rândul corectat de utilizator nu mai e „citit neclar”; alegerea se face din nou
      r.uncertain = false; r.resolve = ''; r.picked = null;
      scheduleMatch();
    });

    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.k === 'include') {
        const i = Number(t.closest('.cat-row').dataset.i);
        rv.rows[i].include = t.checked;
        rowEl(i).classList.toggle('is-off', !t.checked);
        return scheduleMatch(0); // rândurile dublate se socotesc doar între cele bifate
      }
      if (t.type === 'radio' && t.name.startsWith('cat-res-')) {
        rv.rows[Number(t.closest('.cat-row').dataset.i)].resolve = t.value;
        return refresh();
      }
      if (t.name === 'list_date' || t.name === 'currency') return scheduleMatch(0);
      if (t.dataset.act === 'sup-select') {
        if (!t.value) return;
        if (t.value === '__new') rv.supplierId = null;
        else {
          const s = (suppliersCache || []).find(x => String(x.id) === t.value);
          if (!s) return;
          Object.assign(rv, { supplierId: s.id, supName: s.name, supIdno: s.idno });
        }
        rv.supEdit = false;
        // Alt furnizor: toate stările se recalculează, alegerile de la rândurile nesigure se pierd
        rv.rows.forEach(r => { r.resolve = ''; r.picked = null; });
        rv.redraw = true;
        renderSup();
        scheduleMatch(0);
      }
    });

    el.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.f) { rv.filter = t.dataset.f; applyFilter(); return refresh(); }
      if (t.dataset.act === 'sup-change') { rv.supEdit = true; return renderSup(); }
      if (t.dataset.act === 'retry') return scheduleMatch(0);
      if (t.dataset.act === 'pick') {
        const box = t.nextElementSibling;
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector('input').focus();
        return;
      }
      if (t.dataset.pick) {
        const i = Number(t.closest('.cat-row').dataset.i), r = rv.rows[i];
        r.picked = JSON.parse(t.dataset.pick);
        r.resolve = String(r.picked.id);
        renderState(i);
        return refresh();
      }
      if (t.classList.contains('cat-add')) {
        const i = rv.rows.length;
        rv.rows.push({ code: '', name: '', unit: '', price: '', uncertain: false, include: true, status: 'new', error: 'Lipsește denumirea', resolve: '', picked: null, old_price: null });
        el.querySelector('.cat-rows').insertAdjacentHTML('beforeend', rowHtml(rv.rows[i], i));
        rowEl(i).querySelector('[data-k="name"]').focus();
        if (rv.filter !== 'all') { rv.filter = 'all'; applyFilter(); }
        return scheduleMatch();
      }
    });

    renderSup();
    refresh();
  }

  const review = {
    html: fields => {
      const f = fields || { list_date: L.today(), currency: 'MDL', rows: [], supplier: '', supplier_idno: '', note: '' };
      const sm = f.supplier_match;
      rv = {
        rows: (f.rows || []).map(r => ({ ...r, include: true, resolve: '', picked: null })),
        supplierId: sm ? sm.id : null, supName: sm ? sm.name : '', supIdno: sm ? sm.idno : '',
        newName: f.supplier || '', newIdno: f.supplier_idno || '', supEdit: false,
        currency: f.currency || 'MDL', filter: 'all', same_list: f.same_list || null, sameOk: false,
        pending: false, failed: false, redraw: false, seq: 0, timer: null, searchTimer: null, el: null,
      };
      return `<div class="cat-review">
        <div class="cat-sup"></div>
        <div class="new-grid">
          <label class="new-field"><span class="admin-label">Data listei *</span><input class="admin-input" name="list_date" type="date" value="${esc(f.list_date || L.today())}"></label>
          <label class="new-field"><span class="admin-label">Moneda listei</span><select class="admin-input" name="currency">${L.options(CURRENCIES, rv.currency)}</select></label>
          <label class="new-field new-field-wide"><span class="admin-label">Notă</span><textarea class="admin-input" name="note" rows="2" maxlength="1000">${esc(f.note || '')}</textarea></label>
        </div>
        <p class="exp-warn cat-same" hidden></p>
        <p class="cat-sum"></p>
        <nav class="status-filter cat-filter" aria-label="Filtru rânduri"></nav>
        <div class="cat-head" aria-hidden="true"><span>Include</span><span>Cod</span><span>Denumire</span><span>Unit.</span><span>Preț</span><span>Stare</span></div>
        <ol class="cat-rows">${rv.rows.map(rowHtml).join('')}</ol>
        <button class="btn btn-sm btn-ghost cat-add" type="button">+ Adaugă rând</button>
        <p class="status-note err cat-block" role="status"></p>
      </div>`;
    },
    bind: el => bindReview(el.querySelector('.cat-review')),
    read: el => {
      const v = n => el.querySelector(`[name="${n}"]`).value.trim();
      return {
        supplier: rv.supplierId ? { id: rv.supplierId } : { name: rv.newName.trim(), idno: rv.newIdno.trim() },
        list_date: v('list_date'), currency: v('currency'), note: v('note'),
        rows: rv.rows.map(r => ({ include: r.include, code: r.code, name: r.name, unit: r.unit, price: r.price, resolve: r.status === 'uncertain' ? String(r.resolve || '') : '' })),
      };
    },
    check: f => {
      const block = blockMsg();
      if (block) return block;
      if (!f.supplier.id && !f.supplier.name) return 'Completează numele furnizorului.';
      if (!f.list_date) return 'Alege data listei.';
      if (rv.same_list && !rv.sameOk) {
        rv.sameOk = true;
        return `Pare aceeași listă ca cea din ${fmtD(rv.same_list)}. Apasă din nou „Salvează” ca s-o salvezi oricum.`;
      }
      return '';
    },
    hint: f => (!f ? '' : !(f.rows || []).length
      ? 'Nu s-a citit niciun rând. Adaugă rândurile manual sau încarcă o poză mai clară.'
      : (f.note || '').includes('Prețuri cu TVA') ? 'Lista are doar prețuri cu TVA: prețurile se salvează cu TVA.' : ''),
    dupes: () => '',
    errText,
  };

  /* ==========================================================
     Paginile catalogului
     ========================================================== */
  function route(p) {
    L.show('cat');
    const what = p.get('cat');
    if (what === 'prod' && p.get('pid')) return loadProduct(p.get('pid'));
    if (what === 'sup' && p.get('sid')) return loadSupplier(p.get('sid'), p.get('imp'));
    if (what === 'new') return showNew(p.get('sid'));
    return loadList(p);
  }

  function failed(err, retry) {
    L.onError(err, () => {
      root().insertAdjacentHTML('beforeend', '<p class="admin-msg">Nu am putut încărca datele. <button class="btn btn-sm btn-ghost" data-retry>Reîncearcă</button></p>');
      root().querySelector('[data-retry]').onclick = retry;
    });
  }

  const docBtns = docs => (docs || []).map(d => `<button class="link-btn" type="button" data-doc="${esc(d.id)}">${d.mime === 'application/pdf' ? 'PDF' : `Pagina ${esc(d.page)}`}</button>`).join(' ');

  function itemHtml(p, { supplier = true } = {}) {
    return `<li class="cat-item">
      <a class="cat-item-name" href="/admin?cat=prod&pid=${esc(p.id)}">${esc(p.name)}</a>
      <b class="cat-item-price">${esc(L.money(p.price, p.currency))}</b>
      <span class="cat-item-meta">${p.code ? `cod ${esc(p.code)}` : 'fără cod'}${supplier ? ` · <a href="/admin?cat=sup&sid=${esc(p.supplier_id)}">${esc(p.supplier)}</a>` : ''}${p.unit ? ` · ${esc(p.unit)}` : ''}
        ${p.not_in_last ? ' <span class="cat-tag is-gone">nu apare în ultima listă</span>' : ''}</span>
      <time class="cat-item-date">${esc(fmtD(p.price_date))}</time>
    </li>`;
  }

  /* ---------- Lista cu căutare ---------- */
  function loadList(p) {
    const s = ++seq;
    const q = p.get('q') || '', sid = p.get('sid') || '', sort = SORTS[p.get('sort')] ? p.get('sort') : 'name';
    root().innerHTML = `<div class="admin-head">
        <h1 class="admin-title">Catalog</h1>
        <a class="btn btn-sm" href="/admin?cat=new${sid ? `&sid=${esc(sid)}` : ''}" id="catAdd">+ Adaugă produs</a>
      </div>
      <form class="cat-filters" id="catFilters" role="search">
        <input class="admin-input" type="search" name="q" placeholder="Caută după denumire sau cod" value="${esc(q)}" autocomplete="off" aria-label="Caută">
        <select class="admin-input" name="sid" aria-label="Furnizor"><option value="">Toți furnizorii</option>${sid ? `<option value="${esc(sid)}" selected>Furnizorul ales</option>` : ''}</select>
        <select class="admin-input" name="sort" aria-label="Ordine">${L.options(SORTS, sort)}</select>
      </form>
      <p class="muted cat-sup-link" id="catSupLink" hidden></p>
      <p class="admin-msg" id="catMsg">Se încarcă…</p>
      <ul class="cat-list" id="catList"></ul>
      <button class="btn btn-ghost btn-sm" type="button" id="catMore" hidden>Mai multe</button>`;
    const form = document.getElementById('catFilters');
    let cursor = 0, timer = null, pageSeq = 0;

    suppliers(true).then(list => {
      if (s !== seq) return;
      form.elements.sid.innerHTML = '<option value="">Toți furnizorii</option>' + list.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
      form.elements.sid.value = sid;
      supLink();
    }).catch(() => {});

    function supLink() {
      const el = document.getElementById('catSupLink'), v = form.elements.sid.value;
      el.hidden = !v;
      el.innerHTML = v ? `<a class="link-btn" href="/admin?cat=sup&sid=${esc(v)}">Pagina furnizorului (liste de prețuri, IDNO)</a>` : '';
      document.getElementById('catAdd').setAttribute('href', `/admin?cat=new${v ? `&sid=${encodeURIComponent(v)}` : ''}`);
    }

    async function page(reset) {
      const mine = ++pageSeq;
      if (reset) cursor = 0;
      const qs = new URLSearchParams({ q: form.elements.q.value.trim(), supplier_id: form.elements.sid.value, sort: form.elements.sort.value, cursor: String(cursor) });
      const msg = document.getElementById('catMsg'), more = document.getElementById('catMore');
      more.disabled = true;
      if (reset) msg.textContent = 'Se încarcă…';
      try {
        const { items, next } = await L.api('/api/admin/catalog?' + qs);
        if (mine !== pageSeq || s !== seq) return;
        const list = document.getElementById('catList');
        if (reset) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', items.map(x => itemHtml(x)).join(''));
        msg.textContent = list.children.length ? '' : form.elements.q.value.trim() || form.elements.sid.value ? 'Niciun produs găsit.' : 'Catalogul e gol. Încarcă o listă de prețuri sau adaugă un produs.';
        cursor = next || 0;
        more.hidden = next === null;
      } catch (err) {
        if (mine !== pageSeq || s !== seq) return;
        msg.textContent = '';
        failed(err, () => page(true));
      } finally {
        more.disabled = false;
      }
    }

    // Filtrele stau în adresă (fără reîncărcarea paginii, ca să nu se piardă cursorul din căutare)
    function apply() {
      const qs = new URLSearchParams({ cat: 'list' });
      if (form.elements.q.value.trim()) qs.set('q', form.elements.q.value.trim());
      if (form.elements.sid.value) qs.set('sid', form.elements.sid.value);
      if (form.elements.sort.value !== 'name') qs.set('sort', form.elements.sort.value);
      history.replaceState(null, '', '/admin?' + qs);
      supLink();
      page(true);
    }
    form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); apply(); });
    form.elements.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(apply, 350); });
    form.elements.sid.addEventListener('change', apply);
    form.elements.sort.addEventListener('change', apply);
    document.getElementById('catMore').addEventListener('click', () => page(false));
    page(true);
  }

  /* ---------- Fișa produsului ---------- */
  async function loadProduct(id) {
    const s = ++seq;
    const back = '<a class="back" href="/admin?cat=list">← Catalog</a>';
    root().innerHTML = `${back}<p class="admin-msg">Se încarcă…</p>`;
    let p;
    try {
      ({ item: p } = await L.api('/api/admin/catalog?id=' + encodeURIComponent(id)));
    } catch (err) {
      if (s !== seq) return;
      if (err.status === 404) { root().innerHTML = `${back}<p class="admin-msg">Produsul nu mai există.</p>`; return; }
      root().innerHTML = back;
      return failed(err, () => loadProduct(id));
    }
    if (s !== seq) return;
    const sup = p.supplier || {};
    root().innerHTML = `${back}
      <div class="detail-card">
        <h1>${esc(p.name)}</h1>
        <p class="muted">${p.code ? `Cod ${esc(p.code)} · ` : ''}<a class="link-btn" href="/admin?cat=sup&sid=${esc(sup.id)}">${esc(sup.name)}</a>${p.unit ? ` · ${esc(p.unit)}` : ''}</p>
        <p class="cat-price">${esc(L.money(p.price, p.currency))} <span class="muted">din ${esc(fmtD(p.price_date))}</span></p>
        <div class="reject-actions">
          <button class="btn btn-sm" type="button" id="catEditBtn">Modifică</button>
          <button class="btn btn-sm btn-ghost danger-btn" type="button" id="catDel">Șterge</button>
        </div>
        <form class="cat-edit" id="catEdit" novalidate hidden>
          <div class="new-grid">
            <label class="new-field new-field-wide"><span class="admin-label">Denumire *</span><input class="admin-input" name="name" maxlength="300" value="${esc(p.name)}"></label>
            <label class="new-field"><span class="admin-label">Cod</span><input class="admin-input" name="code" maxlength="50" value="${esc(p.code)}"></label>
            <label class="new-field"><span class="admin-label">Unitate</span><input class="admin-input" name="unit" maxlength="50" value="${esc(p.unit)}"></label>
            <label class="new-field"><span class="admin-label">Preț *</span><input class="admin-input" name="price" inputmode="decimal" value="${esc(L.num(p.price))}"></label>
            <label class="new-field"><span class="admin-label">Moneda</span><select class="admin-input" name="currency">${L.options(CURRENCIES, p.currency)}</select></label>
          </div>
          <p class="muted">Un preț schimbat aici intră în istoric cu data de azi.</p>
          <div class="reject-actions"><button class="btn btn-sm" type="submit">Salvează</button><button class="btn btn-sm btn-ghost" type="button" data-cancel>Anulează</button></div>
        </form>
        <p class="admin-msg" id="catMsg2" role="alert"></p>
        <p class="admin-label rec-title">Istoricul prețurilor</p>
        <ul class="cat-hist">${p.history.map(h => `<li>
            <time>${esc(fmtD(h.price_date))}</time>
            <b>${esc(L.money(h.price, h.currency))}</b>
            <span class="muted">${h.list ? `Lista din ${esc(fmtD(h.list.list_date))}` : 'Fără listă (manual sau listă ștearsă)'}</span>
            ${h.list ? `<span class="cat-docs">${docBtns(h.list.documents)}</span>` : ''}
          </li>`).join('') || '<li class="muted">Fără istoric.</li>'}</ul>
      </div>`;
    const form = document.getElementById('catEdit'), msg = document.getElementById('catMsg2');
    document.getElementById('catEditBtn').onclick = () => { form.hidden = false; form.elements.name.focus(); };
    form.querySelector('[data-cancel]').onclick = () => { form.hidden = true; msg.textContent = ''; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim()) { msg.textContent = 'Completează denumirea.'; return; }
      if (!L.parseMoney(data.price)) { msg.textContent = 'Prețul trebuie să fie mai mare ca 0, cu cel mult 2 zecimale.'; return; }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true; msg.textContent = '';
      try {
        await L.api('/api/admin/catalog?id=' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(data) });
        loadProduct(id);
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('catDel').addEventListener('click', async e => {
      if (!confirm(`Ștergi produsul „${p.name}”? Se șterge și istoricul prețurilor lui.`)) return;
      e.currentTarget.disabled = true;
      try {
        await L.api('/api/admin/catalog?id=' + encodeURIComponent(id), { method: 'DELETE' });
        L.go(`cat=sup&sid=${encodeURIComponent(sup.id)}`, true);
      } catch (err) {
        document.getElementById('catDel').disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a șters. Încearcă din nou.'; });
      }
    });
  }

  /* ---------- Pagina furnizorului ---------- */
  async function loadSupplier(id, imp) {
    const s = ++seq;
    const back = '<a class="back" href="/admin?cat=list">← Catalog</a>';
    root().innerHTML = `${back}<p class="admin-msg">Se încarcă…</p>`;
    let f;
    try {
      ({ item: f } = await L.api('/api/admin/catalog?supplier=' + encodeURIComponent(id)));
    } catch (err) {
      if (s !== seq) return;
      if (err.status === 404) { root().innerHTML = `${back}<p class="admin-msg">Furnizorul nu mai există.</p>`; return; }
      root().innerHTML = back;
      return failed(err, () => loadSupplier(id, imp));
    }
    if (s !== seq) return;
    // Rezumatul importului se arată o singură dată (nu și la reîncărcarea paginii)
    let impText = '';
    if (imp && /^\d+-\d+-\d+-\d+$/.test(imp)) {
      const [a, b, c, d] = imp.split('-').map(Number);
      impText = `Lista a fost salvată: ${a} produse noi, ${b} prețuri actualizate, ${c} neschimbate${d ? `, ${d} doar în istoric (lista e mai veche decât prețul actual)` : ''}.`;
      history.replaceState(null, '', `/admin?cat=sup&sid=${encodeURIComponent(id)}`);
    }
    const gone = f.products.filter(p => p.not_in_last).length;
    root().innerHTML = `${back}
      <div class="detail-card">
        ${impText ? `<p class="admin-msg ok">${esc(impText)}</p>` : ''}
        <h1>${esc(f.name)}</h1>
        <p class="muted">${f.idno ? `IDNO ${esc(f.idno)}` : 'Fără IDNO'} · ${f.products.length} produse</p>
        <div class="reject-actions">
          <button class="btn btn-sm btn-ghost" type="button" id="catEditBtn">Modifică</button>
          <a class="btn btn-sm" href="/admin?cat=new&sid=${esc(f.id)}">+ Adaugă produs</a>
          <a class="btn btn-sm btn-ghost" href="/admin?cat=list&sid=${esc(f.id)}">Caută în produsele lui</a>
        </div>
        <form class="cat-edit" id="catEdit" novalidate hidden>
          <div class="new-grid">
            <label class="new-field"><span class="admin-label">Nume *</span><input class="admin-input" name="name" maxlength="200" value="${esc(f.name)}"></label>
            <label class="new-field"><span class="admin-label">IDNO</span><input class="admin-input" name="idno" maxlength="30" value="${esc(f.idno)}"></label>
          </div>
          <div class="reject-actions"><button class="btn btn-sm" type="submit">Salvează</button><button class="btn btn-sm btn-ghost" type="button" data-cancel>Anulează</button></div>
        </form>
        <p class="admin-msg" id="catMsg2" role="alert"></p>
        <p class="admin-label rec-title">Liste de prețuri</p>
        ${f.lists.length ? `<ul class="cat-lists">${f.lists.map(l => `<li>
            <b>${esc(fmtD(l.list_date))}</b>
            <span class="muted">${esc(l.rows_count)} rânduri · ${esc(l.currency)}${l.note ? ` · ${esc(l.note)}` : ''}</span>
            <span class="cat-docs">${docBtns(l.documents)}</span>
            <button class="link-btn danger" type="button" data-del-list="${esc(l.id)}" data-date="${esc(l.list_date)}">Șterge lista</button>
          </li>`).join('')}</ul>` : '<p class="muted">Nicio listă încărcată.</p>'}
        <p class="admin-label rec-title">Produse${gone ? ` <span class="muted">· ${gone} nu apar în ultima listă</span>` : ''}</p>
        ${f.products.length ? `<ul class="cat-list">${f.products.map(p => itemHtml(p, { supplier: false })).join('')}</ul>` : '<p class="muted">Niciun produs.</p>'}
        <div class="reject-actions cat-danger"><button class="btn btn-sm btn-ghost danger-btn" type="button" id="catDelSup">Șterge furnizorul</button></div>
      </div>`;
    const form = document.getElementById('catEdit'), msg = document.getElementById('catMsg2');
    document.getElementById('catEditBtn').onclick = () => { form.hidden = false; form.elements.name.focus(); };
    form.querySelector('[data-cancel]').onclick = () => { form.hidden = true; msg.textContent = ''; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim()) { msg.textContent = 'Completează numele.'; return; }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await L.api('/api/admin/catalog?supplier=' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(data) });
        suppliersCache = null;
        loadSupplier(id);
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
    root().querySelectorAll('[data-del-list]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Ștergi lista de prețuri din ${fmtD(b.dataset.date)}? Produsele și prețurile lor rămân; documentul original se șterge.`)) return;
      b.disabled = true;
      try {
        await L.api('/api/admin/catalog?list=' + encodeURIComponent(b.dataset.delList), { method: 'DELETE' });
        loadSupplier(id);
      } catch (err) {
        b.disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a șters lista. Încearcă din nou.'; });
      }
    }));
    document.getElementById('catDelSup').addEventListener('click', async e => {
      if (!confirm(`Ștergi furnizorul ${f.name}, cu toate cele ${f.products.length} produse, istoricul lor și listele de prețuri?`)) return;
      e.currentTarget.disabled = true;
      try {
        await L.api('/api/admin/catalog?supplier=' + encodeURIComponent(id), { method: 'DELETE' });
        suppliersCache = null;
        L.go('cat=list', true);
      } catch (err) {
        document.getElementById('catDelSup').disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a șters. Încearcă din nou.'; });
      }
    });
  }

  /* ---------- Produs adăugat manual ---------- */
  async function showNew(sid) {
    const s = ++seq;
    const back = sid ? `/admin?cat=sup&sid=${encodeURIComponent(sid)}` : '/admin?cat=list';
    root().innerHTML = `<a class="back" href="${esc(back)}">← Înapoi</a>
      <form class="detail-card" id="catNew" novalidate>
        <h1>Produs nou</h1>
        <p class="muted">Adăugat manual. Prețul intră în istoric cu data de azi.</p>
        <div class="new-grid">
          <label class="new-field new-field-wide"><span class="admin-label">Furnizor *</span><select class="admin-input" name="supplier"><option value="">Se încarcă furnizorii…</option></select></label>
          <label class="new-field" data-ns hidden><span class="admin-label">Nume furnizor nou *</span><input class="admin-input" name="ns_name" maxlength="200" autocomplete="off"></label>
          <label class="new-field" data-ns hidden><span class="admin-label">IDNO</span><input class="admin-input" name="ns_idno" maxlength="30" autocomplete="off"></label>
          <label class="new-field new-field-wide"><span class="admin-label">Denumire *</span><input class="admin-input" name="name" maxlength="300" autocomplete="off"></label>
          <label class="new-field"><span class="admin-label">Cod</span><input class="admin-input" name="code" maxlength="50" autocomplete="off"></label>
          <label class="new-field"><span class="admin-label">Unitate</span><input class="admin-input" name="unit" maxlength="50" autocomplete="off"></label>
          <label class="new-field"><span class="admin-label">Preț *</span><input class="admin-input" name="price" inputmode="decimal" autocomplete="off"></label>
          <label class="new-field"><span class="admin-label">Moneda</span><select class="admin-input" name="currency">${L.options(CURRENCIES, 'MDL')}</select></label>
        </div>
        <button class="btn" type="submit" id="catNewBtn">Salvează produsul</button>
        <p class="admin-msg" id="catNewMsg" role="alert"></p>
      </form>`;
    const form = document.getElementById('catNew'), msg = document.getElementById('catNewMsg');
    const sel = form.elements.supplier;
    const toggle = () => form.querySelectorAll('[data-ns]').forEach(el => { el.hidden = sel.value !== '__new'; });
    sel.addEventListener('change', toggle);
    let list = [];
    try { list = await suppliers(true); } catch (e) { /* doar furnizor nou */ }
    if (s !== seq) return;
    sel.innerHTML = '<option value="">— alege furnizorul —</option>' + list.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + '<option value="__new">＋ Furnizor nou</option>';
    sel.value = sid && list.some(x => String(x.id) === sid) ? sid : list.length ? '' : '__new';
    toggle();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = n => form.elements[n].value.trim();
      if (!v('supplier')) { msg.textContent = 'Alege furnizorul.'; return; }
      if (v('supplier') === '__new' && !v('ns_name')) { msg.textContent = 'Scrie numele furnizorului nou.'; return; }
      if (!v('name')) { msg.textContent = 'Completează denumirea.'; return; }
      if (!L.parseMoney(v('price'))) { msg.textContent = 'Prețul trebuie să fie mai mare ca 0, cu cel mult 2 zecimale.'; return; }
      const body = {
        supplier: v('supplier') === '__new' ? { name: v('ns_name'), idno: v('ns_idno') } : { id: v('supplier') },
        name: v('name'), code: v('code'), unit: v('unit'), price: v('price'), currency: v('currency'),
      };
      const btn = document.getElementById('catNewBtn');
      btn.disabled = true; msg.textContent = '';
      try {
        const res = await L.api('/api/admin/catalog', { method: 'POST', body: JSON.stringify(body) });
        suppliersCache = null;
        L.go(`cat=prod&pid=${encodeURIComponent(res.item.id)}`, true);
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
  }

  function init(helpers) {
    L = helpers;
    root().addEventListener('click', e => {
      const docBtn = e.target.closest('button[data-doc]');
      if (docBtn) return L.openDoc(docBtn.dataset.doc);
      L.internal(e, e.target.closest('a[href^="/admin"]'));
    });
  }

  return { init, route, review, errText, resetSuppliers: () => { suppliersCache = null; } };
})();
