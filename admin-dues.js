/* ==========================================================
   Panoul de administrare — Scadențe: „De plătit” (furnizori) și „De încasat” (clienți).
   Formularele sunt folosite și de ecranul de verificare al documentelor (admin.js).
   Adrese: /admin?due=pay&f=open|overdue|all, /admin?due=get&f=…, /admin?due=payd&pid=12,
   /admin?due=pay&new=1, /admin?due=get&new=1&rid=<client>
   ========================================================== */
window.LUXDUES = (() => {
  let L; // ajutoarele comune din admin.js
  const root = () => document.getElementById('dues');
  const FILTERS = { open: 'De achitat', overdue: 'Restante', all: 'Toate' };
  let seq = 0;
  let clientsCache = null; // lista clienților pentru alegerea clientului la „De încasat”

  const fmtD = d => L.fmtPayDay(d);
  const dayWord = n => (n === 1 ? 'zi' : 'zile');
  // Eticheta stării unei rate
  function stateTag(r, kind) {
    if (r.state === 'paid') {
      return kind === 'pay' ? `<span class="due-tag is-paid">Plătită ${L.esc(fmtD(r.paid_on))}</span>` : '<span class="due-tag is-paid">Achitată</span>';
    }
    const partial = kind === 'get' && r.partial ? `<span class="due-tag">Achitată parțial ${L.esc(L.num(r.covered))} din ${L.esc(L.money(r.amount, r.currency))}</span>` : '';
    if (r.state === 'overdue') return `${partial}<span class="due-tag is-overdue">Restant de ${r.days} ${dayWord(r.days)}</span>`;
    if (r.state === 'soon') return `${partial}<span class="due-tag is-soon">${r.days ? `Scadent în ${r.days} ${dayWord(r.days)}` : 'Scadent azi'}</span>`;
    return partial || `<span class="due-tag">${kind === 'pay' ? 'Neplătită' : 'De încasat'}</span>`;
  }

  /* ---------- Ratele (editor comun) ---------- */
  function instRow(r = {}) {
    return `<li class="due-inst-row">
      <label class="exp-cell"><span>Scadența${r.proposed ? ' (propusă)' : ''}</span><input class="admin-input" type="date" data-k="due_date" value="${L.esc(r.due_date || '')}"></label>
      <label class="exp-cell"><span>Suma</span><input class="admin-input" inputmode="decimal" autocomplete="off" data-k="amount" value="${L.esc(r.amount === '' || r.amount == null ? '' : L.num(r.amount))}"></label>
      <button class="link-btn danger exp-del" type="button" aria-label="Șterge rata">✕</button></li>`;
  }
  const instHtml = list => `<div class="due-inst">
      <p class="admin-label exp-items-title">Scadențe (rate)</p>
      <ol class="due-inst-list">${(list && list.length ? list : [{}]).map(instRow).join('')}</ol>
      <button class="btn btn-sm btn-ghost due-inst-add" type="button">+ Adaugă rată</button>
      <p class="exp-warn due-inst-warn" hidden></p>
    </div>`;
  const readInst = el => [...el.querySelectorAll('.due-inst-row')].map(li => ({
    due_date: li.querySelector('[data-k="due_date"]').value, amount: li.querySelector('[data-k="amount"]').value.trim(),
  })).filter(r => r.due_date || r.amount);
  function checkInst(list, required = true) {
    if (required && !list.length) return 'Adaugă cel puțin o rată (data și suma).';
    for (const [i, r] of list.entries()) {
      if (!r.due_date) return `Rata ${i + 1}: alege data scadenței.`;
      if (!L.parseMoney(r.amount)) return `Rata ${i + 1}: suma trebuie să fie mai mare ca 0.`;
    }
    return '';
  }
  function bindInst(el, totalInput) {
    const list = el.querySelector('.due-inst-list'), warn = el.querySelector('.due-inst-warn');
    const refresh = () => {
      const total = totalInput ? L.parseMoney(totalInput.value) : null;
      const sum = readInst(el).reduce((s, r) => s + (L.parseMoney(r.amount) || 0), 0);
      const bad = total && sum && Math.abs(sum - total) > 0.05;
      warn.hidden = !bad;
      warn.textContent = bad ? `Suma ratelor (${L.num(sum)}) diferă de total (${L.num(total)}).` : '';
    };
    el.querySelector('.due-inst-add').addEventListener('click', () => {
      list.insertAdjacentHTML('beforeend', instRow());
      list.lastElementChild.querySelector('input').focus();
    });
    list.addEventListener('click', e => { if (e.target.closest('.exp-del')) { e.target.closest('li').remove(); refresh(); } });
    el.addEventListener('input', refresh);
    if (totalInput) totalInput.addEventListener('input', refresh);
    refresh();
  }

  /* ---------- Formularul „De plătit” ---------- */
  const pay = {
    html: f => `${window.LUXFIN.formHtml(f || { doc_date: L.today() })}${instHtml((f && f.installments) || [])}`,
    bind: el => { window.LUXFIN.bindForm(el); bindInst(el.querySelector('.due-inst'), el.querySelector('[name="amount_total"]')); },
    read: el => ({ ...window.LUXFIN.readForm(el), installments: readInst(el.querySelector('.due-inst')) }),
    check: f => window.LUXFIN.checkForm(f) || checkInst(f.installments),
    dupes: list => `<p><b>Pare deja înregistrată:</b></p><ul>${list.map(d =>
      `<li>${L.esc(d.supplier)}${d.doc_number ? `, nr. ${L.esc(d.doc_number)}` : ''}, ${L.esc(fmtD(d.doc_date))} — ${L.esc(L.money(d.amount_total, d.currency))}
        <a class="link-btn" href="/admin?due=payd&pid=${L.esc(d.id)}" data-href="due=payd&pid=${L.esc(d.id)}">Deschide</a></li>`).join('')}</ul>
      <p class="muted">Dacă e alt document, apasă „Salvează oricum”.</p>`,
  };

  /* ---------- Formularul „De încasat” ---------- */
  async function clients() {
    if (!clientsCache) clientsCache = (await L.api('/api/admin/requests?all=1')).items;
    return clientsCache;
  }

  // f: câmpurile citite (sau goale); extra: { matches, rid } — potrivirile găsite / clientul ales dinainte
  const get = {
    html: (fields, extra = {}) => {
      const f = fields || {};
      const cp = f.counterparty || {};
      return `<div class="get-form">
        <label class="new-field"><span class="admin-label">Client *</span>
          <select class="admin-input" name="client" data-rid="${L.esc(extra.rid || '')}"><option value="">Se încarcă clienții…</option></select></label>
        <div class="new-grid get-new" hidden>
          <label class="new-field new-field-wide"><span class="admin-label">Nume client nou *</span><input class="admin-input" name="nc_name" maxlength="100" value="${L.esc(cp.name || '')}"></label>
          <label class="new-field"><span class="admin-label">Telefon</span><input class="admin-input" name="nc_phone" type="tel" maxlength="30" value="${L.esc(cp.phone || '')}"></label>
          <label class="new-field"><span class="admin-label">Email</span><input class="admin-input" name="nc_email" type="email" maxlength="150" value="${L.esc(cp.email || '')}"></label>
        </div>
        <p class="exp-warn get-cur" hidden></p>
        <div class="new-grid">
          <label class="new-field"><span class="admin-label">Număr document</span><input class="admin-input" name="doc_number" maxlength="60" value="${L.esc(f.doc_number || '')}"></label>
          <label class="new-field"><span class="admin-label">Data documentului</span><input class="admin-input" name="doc_date" type="date" value="${L.esc(f.doc_date || '')}"></label>
          <label class="new-field"><span class="admin-label">Moneda pe document</span><select class="admin-input" name="currency">${L.options({ MDL: 'MDL', EUR: 'EUR' }, f.currency || 'MDL')}</select></label>
          <label class="new-field"><span class="admin-label">Total</span><input class="admin-input" name="amount_total" inputmode="decimal" value="${L.esc(f.amount_total ? L.num(f.amount_total) : '')}"></label>
          <label class="new-field new-field-wide"><span class="admin-label">Notă</span><textarea class="admin-input" name="note" rows="2" maxlength="1000">${L.esc(f.note || '')}</textarea></label>
        </div>
        <label class="show-pw get-contract" hidden><input type="checkbox" name="set_contract" checked> <span></span></label>
        ${instHtml(f.installments || [])}
        <input type="hidden" name="is_contract" value="${f.is_contract ? '1' : ''}">
        <input type="hidden" name="match_ids" value="${L.esc((extra.matches || []).map(m => m.id).join(','))}">
      </div>`;
    },
    bind: async el => {
      bindInst(el.querySelector('.due-inst'), el.querySelector('[name="amount_total"]'));
      const sel = el.querySelector('[name="client"]');
      const matchIds = el.querySelector('[name="match_ids"]').value.split(',').filter(Boolean);
      let list = [];
      try { list = await clients(); } catch (e) { /* lista rămâne goală; se poate crea client nou */ }
      const byId = new Map(list.map(c => [c.id, c]));
      const opt = c => `<option value="${L.esc(c.id)}">${L.esc(c.name)}${c.phone ? ` · ${L.esc(c.phone)}` : ''}</option>`;
      const matches = matchIds.map(id => byId.get(id)).filter(Boolean);
      sel.innerHTML = '<option value="">— alegeți clientul —</option>' +
        (matches.length ? `<optgroup label="Potriviri după document">${matches.map(opt).join('')}</optgroup>` : '') +
        `<optgroup label="Toți clienții">${list.map(opt).join('')}</optgroup>` +
        '<option value="__new">＋ Client nou</option>';
      sel.value = sel.dataset.rid || (matches[0] ? matches[0].id : (el.querySelector('[name="nc_name"]').value ? '__new' : ''));
      const refresh = () => {
        const c = byId.get(sel.value), cur = el.querySelector('[name="currency"]').value;
        el.querySelector('.get-new').hidden = sel.value !== '__new';
        const w = el.querySelector('.get-cur');
        w.hidden = !(c && c.currency !== cur);
        if (c && c.currency !== cur) {
          w.innerHTML = `Clientul are moneda ${L.esc(c.currency)}, documentul e în ${L.esc(cur)}. Sumele nu se convertesc.
            <label class="show-pw"><input type="checkbox" name="set_currency" value="${L.esc(cur)}"> Schimbă moneda clientului în ${L.esc(cur)}</label>
            <span class="muted">Altfel, ratele se salvează în ${L.esc(c.currency)}.</span>`;
        }
        // Contract și clientul fără valoarea contractului: propunem completarea ei
        const total = L.parseMoney(el.querySelector('[name="amount_total"]').value);
        const box = el.querySelector('.get-contract');
        const show = el.querySelector('[name="is_contract"]').value && total && (sel.value === '__new' || (c && c.contract_value == null));
        box.hidden = !show;
        if (show) box.querySelector('span').textContent = `Setează valoarea contractului clientului la ${L.num(total)}`;
      };
      sel.addEventListener('change', refresh);
      el.querySelector('[name="currency"]').addEventListener('change', refresh);
      el.querySelector('[name="amount_total"]').addEventListener('input', refresh);
      refresh();
    },
    read: el => {
      const v = n => el.querySelector(`[name="${n}"]`)?.value.trim() ?? '';
      const client = v('client');
      const out = { doc_number: v('doc_number'), doc_date: v('doc_date'), note: v('note'), installments: readInst(el.querySelector('.due-inst')) };
      if (client === '__new') out.new_client = { name: v('nc_name'), phone: v('nc_phone'), email: v('nc_email') };
      else out.request_id = client;
      const cur = el.querySelector('[name="set_currency"]');
      if (cur && cur.checked) out.set_currency = cur.value;
      if (client === '__new') out.set_currency = v('currency');
      const box = el.querySelector('.get-contract');
      if (!box.hidden && box.querySelector('input').checked) out.set_contract_value = v('amount_total');
      return out;
    },
    check: f => {
      if (!f.request_id && !f.new_client) return 'Alege clientul.';
      if (f.new_client && !f.new_client.name) return 'Scrie numele clientului nou.';
      if (f.new_client && !f.new_client.phone && !f.new_client.email) return 'Clientul nou are nevoie de telefon sau email.';
      return checkInst(f.installments);
    },
    dupes: () => '',
  };

  const FIELD_NAMES = { installments: 'ratele', client: 'clientul', new_client: 'clientul nou', doc_date: 'data', doc_number: 'numărul', note: 'nota', due_date: 'data scadenței', amount: 'suma', paid_on: 'data plății', paid_amount: 'suma plătită' };
  const errText = (e2, fallback) => (e2.status === 400 && e2.fields.length
    ? `Verifică: ${e2.fields.map(f => FIELD_NAMES[f] || f).join(', ')}.` : window.LUXFIN.errText(e2, fallback));

  /* ---------- Navigare ---------- */
  function route(p) {
    L.show('dues');
    const what = p.get('due');
    if (what === 'payd' && p.get('pid')) return loadPayable(p.get('pid'));
    if (p.get('new')) return showNew(what === 'get' ? 'get' : 'pay', p.get('rid'));
    return loadList(what === 'get' ? 'get' : 'pay', FILTERS[p.get('f')] ? p.get('f') : 'open');
  }

  function failed(err, retry) {
    L.onError(err, () => {
      root().insertAdjacentHTML('beforeend', '<p class="admin-msg">Nu am putut încărca datele. <button class="btn btn-sm btn-ghost" data-retry>Reîncearcă</button></p>');
      root().querySelector('[data-retry]').onclick = retry;
    });
  }

  /* ---------- Listele ---------- */
  async function loadList(kind, filter) {
    const s = ++seq;
    root().innerHTML = `<div class="admin-head">
        <h1 class="admin-title">Scadențe</h1>
        <nav class="view-switch" aria-label="Scadențe">
          <a class="filter${kind === 'pay' ? ' is-on' : ''}" href="/admin?due=pay">De plătit</a>
          <a class="filter${kind === 'get' ? ' is-on' : ''}" href="/admin?due=get">De încasat</a>
        </nav>
      </div>
      <div class="due-bar">
        <nav class="status-filter" aria-label="Filtru">${Object.entries(FILTERS).map(([k, l]) =>
          `<a class="filter${k === filter ? ' is-on' : ''}" href="/admin?due=${kind}&f=${k}">${l}</a>`).join('')}</nav>
        <a class="btn btn-sm" href="/admin?due=${kind}&new=1">+ Adaugă</a>
      </div>
      <p class="fin-total" id="dueTotal"></p>
      <p class="admin-msg" id="dueMsg">Se încarcă…</p>
      <ul class="due-list" id="dueList"></ul>`;
    try {
      const { items, totals } = await L.api(`/api/admin/dues?kind=${kind}&filter=${filter}`);
      if (s !== seq) return;
      const t = Object.entries(totals).map(([c, v]) => `${L.money(v.open, c)}${v.overdue ? ` (restant ${L.money(v.overdue, c)})` : ''}`).join(' · ');
      document.getElementById('dueTotal').textContent = t ? `De achitat: ${t}` : '';
      document.getElementById('dueMsg').textContent = items.length ? ''
        : filter === 'overdue' ? 'Nicio restanță.' : kind === 'pay' ? 'Nicio factură de plătit.' : 'Nicio sumă de încasat.';
      document.getElementById('dueList').innerHTML = items.map(r => (kind === 'pay' ? payRow(r) : getRow(r))).join('');
    } catch (err) {
      if (s !== seq) return;
      document.getElementById('dueMsg').textContent = '';
      failed(err, () => loadList(kind, filter));
    }
  }

  function payRow(r) {
    return `<li class="due-row is-${r.state}" data-iid="${L.esc(r.id)}" data-amount="${L.esc(r.amount)}">
      <div class="due-main">
        <time>${L.esc(fmtD(r.due_date))}</time>
        <a class="due-who" href="/admin?due=payd&pid=${L.esc(r.payable_id)}">${L.esc(r.supplier)}</a>
        <b class="due-sum">${L.esc(L.money(r.state === 'paid' ? r.paid_amount : r.amount, r.currency))}</b>
      </div>
      <div class="due-meta">${r.doc_number ? `<span class="muted">nr. ${L.esc(r.doc_number)}</span>` : ''}${stateTag(r, 'pay')}</div>
      <div class="due-actions">${r.state === 'paid'
        ? '<button class="link-btn danger" type="button" data-act="unpay">Anulează plata</button>'
        : '<button class="btn btn-sm" type="button" data-act="pay">Marchează plătită</button>'}</div>
    </li>`;
  }

  function getRow(r) {
    return `<li class="due-row is-${r.state}" data-rid="${L.esc(r.id)}" data-due="${L.esc(r.due_date)}" data-amount="${L.esc(r.amount)}" data-note="${L.esc(r.note || '')}">
      <div class="due-main">
        <time>${L.esc(fmtD(r.due_date))}</time>
        <a class="due-who" href="/admin?id=${L.esc(r.request_id)}">${L.esc(r.client)}</a>
        <b class="due-sum">${L.esc(L.money(r.amount, r.currency))}</b>
      </div>
      <div class="due-meta">${r.doc_number ? `<span class="muted">nr. ${L.esc(r.doc_number)}</span>` : ''}${r.note ? `<span class="muted">${L.esc(r.note)}</span>` : ''}${stateTag(r, 'get')}</div>
      <div class="due-actions">
        <button class="link-btn" type="button" data-act="edit">Modifică</button>
        <button class="link-btn danger" type="button" data-act="del">Șterge</button>
      </div>
    </li>`;
  }

  // Formular mic sub rând: plata unei rate „De plătit” sau modificarea unei rate „De încasat”
  function inlineForm(li, html, onSave) {
    li.querySelector('.due-inline')?.remove();
    li.insertAdjacentHTML('beforeend', `<form class="due-inline" novalidate>${html}
      <div class="reject-actions"><button class="btn btn-sm" type="submit">Salvează</button><button class="btn btn-sm btn-ghost" type="button" data-cancel>Anulează</button></div>
      <p class="status-note err" role="alert"></p></form>`);
    const form = li.querySelector('.due-inline'), msg = form.querySelector('.err'), btn = form.querySelector('[type="submit"]');
    form.querySelector('[data-cancel]').onclick = () => form.remove();
    form.querySelector('input').focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      btn.disabled = true; msg.textContent = '';
      try {
        const err = await onSave(form);
        if (err) msg.textContent = err;
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = e2.status === 409 ? 'Rata e deja plătită.' : e2.status === 404 ? 'Rata nu mai există.' : errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
  }

  function payForm(li, after) {
    inlineForm(li, `<div class="pay-fields">
        <label class="new-field"><span class="admin-label">Data plății</span><input class="admin-input" name="paid_on" type="date" max="${L.today()}" value="${L.today()}"></label>
        <label class="new-field"><span class="admin-label">Suma plătită</span><input class="admin-input" name="paid_amount" inputmode="decimal" value="${L.esc(L.num(li.dataset.amount))}"></label>
      </div>`, async form => {
      const paidOn = form.paid_on.value, amount = L.parseMoney(form.paid_amount.value);
      if (!paidOn || paidOn > L.today()) return 'Data plății nu poate lipsi sau fi în viitor.';
      if (!amount) return 'Suma trebuie să fie mai mare ca 0.';
      await L.api('/api/admin/dues?kind=pay&action=pay', { method: 'POST', body: JSON.stringify({ installment_id: Number(li.dataset.iid), paid_on: paidOn, paid_amount: amount }) });
      refreshCount();
      after();
      return '';
    });
  }

  async function unpay(li, after) {
    if (!confirm('Anulezi plata? Cheltuiala creată automat se șterge.')) return;
    try {
      await L.api('/api/admin/dues?kind=pay&action=pay&installment_id=' + encodeURIComponent(li.dataset.iid), { method: 'DELETE' });
      refreshCount();
      after();
    } catch (err) {
      L.onError(err, () => alert('Nu s-a anulat plata. Încearcă din nou.'));
    }
  }

  function bindRows(after) {
    root().addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const li = btn.closest('li');
      const act = btn.dataset.act;
      if (act === 'pay') return payForm(li, after);
      if (act === 'unpay') return unpay(li, after);
      if (act === 'edit') {
        return inlineForm(li, `<div class="pay-fields">
            <label class="new-field"><span class="admin-label">Scadența</span><input class="admin-input" name="due_date" type="date" value="${L.esc(li.dataset.due)}"></label>
            <label class="new-field"><span class="admin-label">Suma</span><input class="admin-input" name="amount" inputmode="decimal" value="${L.esc(L.num(li.dataset.amount))}"></label>
            <label class="new-field pay-note-field"><span class="admin-label">Notă</span><input class="admin-input" name="note" maxlength="1000" value="${L.esc(li.dataset.note)}"></label>
          </div>`, async form => {
          const amount = L.parseMoney(form.amount.value);
          if (!form.due_date.value) return 'Alege data scadenței.';
          if (!amount) return 'Suma trebuie să fie mai mare ca 0.';
          await L.api('/api/admin/dues?kind=get&id=' + encodeURIComponent(li.dataset.rid), { method: 'PATCH', body: JSON.stringify({ due_date: form.due_date.value, amount, note: form.note.value }) });
          refreshCount();
          after();
          return '';
        });
      }
      if (act === 'del') {
        if (!confirm('Ștergi această rată de încasat? Plățile clientului nu se schimbă.')) return;
        btn.disabled = true;
        try {
          await L.api('/api/admin/dues?kind=get&id=' + encodeURIComponent(li.dataset.rid), { method: 'DELETE' });
          refreshCount();
          after();
        } catch (err) {
          btn.disabled = false;
          L.onError(err, () => alert('Nu s-a șters. Încearcă din nou.'));
        }
      }
    });
  }

  /* ---------- Adăugare manuală ---------- */
  function showNew(kind, rid) {
    ++seq;
    const f = kind === 'pay' ? pay : get;
    const back = rid ? `/admin?id=${encodeURIComponent(rid)}` : `/admin?due=${kind}`;
    root().innerHTML = `<a class="back" href="${L.esc(back)}">← Înapoi</a>
      <form class="detail-card" id="dueForm" novalidate>
        <h1>${kind === 'pay' ? 'De plătit — document nou' : 'De încasat — rate noi'}</h1>
        <p class="muted">${kind === 'pay' ? 'O factură sau un contract de la un furnizor, cu una sau mai multe rate.' : 'Sumele pe care clientul trebuie să le plătească până la o dată. Starea se calculează din plățile lui din CRM.'}</p>
        <div class="due-form-body">${f.html(kind === 'pay' ? null : {}, { rid })}</div>
        <div class="doc-dupes" id="dueDupes" hidden></div>
        <div class="reject-actions"><button class="btn" type="submit" id="dueSave">Salvează</button></div>
        <p class="admin-msg" id="dueMsg2" role="alert"></p>
      </form>`;
    const form = document.getElementById('dueForm'), body = form.querySelector('.due-form-body');
    f.bind(body);
    let force = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = f.read(body), msg = document.getElementById('dueMsg2'), btn = document.getElementById('dueSave');
      const bad = f.check(data);
      if (bad) { msg.textContent = bad; return; }
      btn.disabled = true; msg.textContent = '';
      try {
        const res = await L.api(`/api/admin/dues?kind=${kind}`, { method: 'POST', body: JSON.stringify({ ...data, force }) });
        clientsCache = null;
        refreshCount();
        if (kind === 'pay') L.go(`due=payd&pid=${res.item.id}`, true);
        else L.go(rid ? `id=${encodeURIComponent(res.request_id)}` : 'due=get', true);
      } catch (err) {
        L.onError(err, e2 => {
          if (e2.status === 409) {
            force = true;
            const box = document.getElementById('dueDupes');
            box.innerHTML = f.dupes(e2.data.duplicates || []); box.hidden = false;
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

  /* ---------- Fișa documentului de plătit ---------- */
  async function loadPayable(id) {
    const s = ++seq;
    root().innerHTML = '<a class="back" href="/admin?due=pay">← Înapoi</a><p class="admin-msg">Se încarcă…</p>';
    let p;
    try {
      ({ item: p } = await L.api('/api/admin/dues?kind=pay&id=' + encodeURIComponent(id)));
    } catch (err) {
      if (s !== seq) return;
      if (err.status === 404) { root().innerHTML = '<a class="back" href="/admin?due=pay">← Înapoi</a><p class="admin-msg">Documentul nu mai există.</p>'; return; }
      return failed(err, () => loadPayable(id));
    }
    if (s !== seq) return;
    const unpaid = p.installments.filter(i => !i.paid_on), paid = p.installments.filter(i => i.paid_on);
    const instRows = p.installments.map(i => `<li class="due-row is-${i.state}" data-iid="${L.esc(i.id)}" data-amount="${L.esc(i.amount)}">
        <div class="due-main"><time>${L.esc(fmtD(i.due_date))}</time><span class="due-who">Rata</span><b class="due-sum">${L.esc(L.money(i.paid_on ? i.paid_amount : i.amount, p.currency))}</b></div>
        <div class="due-meta">${stateTag(i, 'pay')}${i.expense_id ? `<a class="link-btn" href="/admin?fin=exp&eid=${L.esc(i.expense_id)}">Cheltuiala</a>` : ''}</div>
        <div class="due-actions">${i.paid_on ? '<button class="link-btn danger" type="button" data-act="unpay">Anulează plata</button>'
          : '<button class="btn btn-sm" type="button" data-act="pay">Marchează plătită</button>'}</div></li>`).join('');
    // Lista plăților stă în afara formularului: plata unei rate are propriul formular mic
    root().innerHTML = `<a class="back" href="/admin?due=pay">← Înapoi</a>
      <div class="detail-card">
        <h1>${L.esc(p.supplier)}</h1>
        <p class="muted">De plătit · ${L.esc(L.money(p.amount_total, p.currency))}${p.doc_number ? ` · nr. ${L.esc(p.doc_number)}` : ''} · ${L.esc(fmtD(p.doc_date))}</p>
        ${p.documents.length ? `<p class="admin-label">Documente</p><ul class="doc-links">${p.documents.map(d =>
          `<li><button class="link-btn" type="button" data-doc="${L.esc(d.id)}">${L.esc(L.DOC_TYPES[d.doc_type]?.label || d.doc_type)} — ${d.mime === 'application/pdf' ? 'PDF' : `pagina ${d.page}`}</button></li>`).join('')}</ul>` : ''}
        <p class="admin-label">Plăți</p>
        <ul class="due-list">${instRows}</ul>
        <form id="dueForm" novalidate>
        <div class="due-form-body">${window.LUXFIN.formHtml(p)}${instHtml(unpaid)}</div>
        ${paid.length ? '<p class="muted">Ratele plătite nu se modifică aici: întâi „Anulează plata”.</p>' : ''}
        <div class="reject-actions">
          <button class="btn" type="submit" id="dueSave">Salvează modificările</button>
          <button class="btn btn-sm btn-ghost danger-btn" type="button" id="dueDel">Șterge</button>
        </div>
        <p class="admin-msg" id="dueMsg2" role="alert"></p>
        </form>
      </div>`;
    const form = document.getElementById('dueForm'), body = form.querySelector('.due-form-body'), msg = document.getElementById('dueMsg2');
    window.LUXFIN.bindForm(body);
    bindInst(body.querySelector('.due-inst'), body.querySelector('[name="amount_total"]'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = { ...window.LUXFIN.readForm(body), installments: readInst(body.querySelector('.due-inst')) };
      const bad = window.LUXFIN.checkForm(data) || checkInst(data.installments, !paid.length);
      if (bad) { msg.textContent = bad; return; }
      const btn = document.getElementById('dueSave');
      btn.disabled = true; msg.className = 'admin-msg'; msg.textContent = '';
      try {
        await L.api('/api/admin/dues?kind=pay&id=' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(data) });
        refreshCount();
        loadPayable(id);
      } catch (err) {
        L.onError(err, e2 => { msg.textContent = e2.status === 404 ? 'Documentul nu mai există.' : errText(e2, 'Nu s-a salvat. Încearcă din nou.'); });
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('dueDel').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const extra = paid.length ? ' Cheltuielile create din plăți rămân în „Financiar”.' : '';
      if (!confirm(`Ștergi documentul de plătit ${p.supplier}, ${L.money(p.amount_total, p.currency)}?${extra}`)) return;
      btn.disabled = true;
      try {
        await L.api('/api/admin/dues?kind=pay&id=' + encodeURIComponent(id), { method: 'DELETE' });
        refreshCount();
        L.go('due=pay', true);
      } catch (err) {
        btn.disabled = false;
        L.onError(err, () => { msg.textContent = 'Nu s-a șters. Încearcă din nou.'; });
      }
    });
  }

  /* ---------- Numărul de restanțe din antet ---------- */
  async function refreshCount() {
    const el = document.getElementById('dueCount');
    try {
      const { overdue } = await L.api('/api/admin/dues?count=1');
      el.textContent = overdue;
      el.hidden = !overdue;
      el.title = `${overdue} rate restante`;
    } catch (e) { /* fără număr, dacă nu se poate citi */ }
  }

  function init(helpers) {
    L = helpers;
    const el = root();
    // După o plată sau o modificare: lista sau fișa se reîncarcă din adresa curentă
    bindRows(() => route(new URLSearchParams(location.search)));
    el.addEventListener('click', e => {
      const docBtn = e.target.closest('button[data-doc]');
      if (docBtn) return L.openDoc(docBtn.dataset.doc);
      L.internal(e, e.target.closest('a[href^="/admin"]'));
    });
  }

  return { init, route, pay, get, stateTag, refreshCount, resetClients: () => { clientsCache = null; } };
})();
