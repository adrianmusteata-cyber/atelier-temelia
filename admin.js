/* ==========================================================
   Panoul de administrare (CRM): autentificare, tabla pâlniei de vânzări,
   listă cu filtru, client nou adăugat manual, fișa clientului.
   Starea stă în adresă: /admin (tabla), /admin?view=list&status=noua,
   /admin?new=1 sau /admin?id=<uuid>
   ========================================================== */
(() => {
  const $ = (s, c = document) => c.querySelector(s);

  // Etapele pâlniei, în ordine; „Respins” și „Închisă” sunt ieșirile din pâlnie
  const STATUSES = { noua: 'Nouă', contactata: 'Contactată', in_lucru: 'În lucru', procesat: 'Procesat', avans: 'Avans', platit: 'Plătit', incheiat: 'Încheiat', respins: 'Respins', inchisa: 'Închisă' };
  const TYPES = { casa: 'Casă unifamilială', ansamblu: 'Ansamblu rezidențial', birouri: 'Clădire de birouri / comercială', hala: 'Hală / industrial', expertiza: 'Expertiză / consolidare', altceva: 'Altceva' };
  const SERVICES = { arh_rez: 'Arhitectură + Rezistență', arh: 'Doar arhitectură', rez: 'Doar rezistență', design: 'Design interior', management: 'Management de proiect', nu_stiu: 'Nu știu încă' };
  const SOURCES = { site: 'Site web', manual: 'Manual', carte_vizita: 'Carte de vizită', chestionar: 'Chestionar', document: 'Document' };
  // Tipurile de documente; `ready` = secțiunea lor există (restul vin în etapele următoare)
  const DOC_TYPES = {
    carte_vizita: { label: 'Carte de vizită', ready: true },
    chestionar: { label: 'Chestionar', ready: true },
    aviz: { label: 'Aviz de expediere', ready: false },
    chitanta: { label: 'Chitanță / factură achitată', ready: false },
    de_platit: { label: 'Factură / contract de plătit', ready: false },
    de_incasat: { label: 'Factură / contract de încasat', ready: false },
    lista_preturi: { label: 'Listă de prețuri', ready: false },
  };
  const CHANNELS = { apel: 'Apel', intalnire: 'Întâlnire' };
  const FIELD_NAMES = { name: 'nume', phone: 'telefon', channel: 'cum a venit', email: 'email', type: 'tip proiect', service: 'servicii', status: 'etapă', notes: 'note', contact: 'telefon sau email', message: 'despre proiect' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDay = d => new Date(d).toLocaleDateString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric' });
  const badge = s => `<span class="badge s-${esc(s)}">${esc(STATUSES[s] || s)}</span>`;
  // „Site web” sau „Manual · Apel” / „Manual · Întâlnire”
  const srcText = r => (SOURCES[r.source] || r.source) + (r.channel ? ` · ${CHANNELS[r.channel] || r.channel}` : '');
  const srcTag = r => `<span class="src src-${esc(r.source)}">${esc(srcText(r))}</span>`;
  const label = (map, k) => (k ? esc(map[k] || k) : '—');

  // Sume: „12 500”, „3 000,50” (spațiu nedespărțitor la mii, zecimale doar când există)
  const num = v => {
    const [i, d] = Number(v).toFixed(2).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d === '00' ? '' : ',' + d);
  };
  const money = (v, cur) => `${num(v)} ${cur}`;
  const hasContract = r => r.contract_value !== null && r.contract_value !== undefined;
  const fullyPaid = (r, paid) => hasContract(r) && Number(r.contract_value) > 0 && paid >= Number(r.contract_value);
  // Pe carte și în listă: „Plătit 5 000 / 12 000 MDL”, „Plătit 5 000 MDL” sau nimic
  function payText(r) {
    const paid = Number(r.paid_total || 0);
    if (hasContract(r)) return `Plătit ${num(paid)} / ${money(r.contract_value, r.currency)}`;
    return paid > 0 ? `Plătit ${money(paid, r.currency)}` : '';
  }
  // „12 500,5” sau „12500.50” → 12500.5; altfel null
  const parseMoney = s => {
    const t = String(s).replace(/[\s ]/g, '').replace(',', '.');
    return /^\d{1,8}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
  };
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
  const fmtPayDay = d => d.split('-').reverse().join('.');
  const digits = p => String(p).replace(/[^\d+]/g, '');
  const options = (map, selected, empty) =>
    (empty ? `<option value="">${esc(empty)}</option>` : '') +
    Object.entries(map).map(([k, l]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const views = { login: $('#view-login'), board: $('#view-board'), list: $('#view-list'), new: $('#view-new'), detail: $('#view-detail') };
  function show(name) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
    $('#logout').hidden = name === 'login';
    $('#docBtn').hidden = name === 'login';
    $('#toolbar').hidden = name !== 'board' && name !== 'list';
    $('#main').classList.toggle('is-wide', name === 'board');
    $('#viewSwitch').querySelectorAll('a').forEach(a => a.classList.toggle('is-on', a.dataset.view === name));
  }

  class AuthError extends Error {}
  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
    });
    if (r.status === 401) throw new AuthError();
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, fields: data.fields || [], data });
    return data;
  }

  // Orice 401 golește ecranul și cere parola din nou
  function onError(err, fallback) {
    if (err instanceof AuthError) {
      $('#list').innerHTML = ''; $('#board').innerHTML = ''; $('#detail').innerHTML = '';
      show('login'); $('#pw').focus();
      return;
    }
    fallback(err);
  }

  /* ---------- Navigare ---------- */
  const params = () => new URLSearchParams(location.search);
  function go(qs, replace) {
    history[replace ? 'replaceState' : 'pushState'](null, '', '/admin' + (qs ? '?' + qs : ''));
    route();
  }
  function route() {
    const p = params();
    if (p.get('id')) loadDetail(p.get('id'));
    else if (p.get('new')) showNew();
    else if (p.get('view') === 'list') loadList(true);
    else loadBoard();
  }
  window.addEventListener('popstate', route);

  // Linkurile interne merg fără reîncărcare (Ctrl/Cmd + clic deschide în tab nou)
  function internal(e, a) {
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return false;
    e.preventDefault();
    go(a.getAttribute('href').split('?')[1] || '');
    return true;
  }

  // Unde duce „Înapoi”: pagina de unde s-a deschis fișa (tabla sau lista filtrată)
  function backQs() {
    const p = params();
    p.delete('id'); p.delete('new');
    return p.toString();
  }
  // Fișa păstrează în adresă de unde a fost deschisă
  function detailQs(id) {
    const p = params();
    p.delete('new');
    p.set('id', id);
    return p.toString();
  }

  /* ---------- Autentificare ---------- */
  $('#showPw').addEventListener('change', e => { $('#pw').type = e.target.checked ? 'text' : 'password'; });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginBtn'), msg = $('#loginMsg');
    btn.disabled = true; msg.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
      $('#pw').value = '';
      route();
    } catch (err) {
      msg.textContent = err.status === 429 ? 'Prea multe încercări, reveniți în 15 minute.'
        : err instanceof AuthError ? 'Parolă incorectă.'
        : 'Nu am putut verifica parola. Reîncercați.';
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    $('#list').innerHTML = ''; $('#board').innerHTML = ''; $('#detail').innerHTML = '';
    history.replaceState(null, '', '/admin');
    show('login');
  });

  $('#toolbar').addEventListener('click', e => internal(e, e.target.closest('a[href^="/admin"]')));

  const setTitle = n => { document.title = `${n ? `(${n}) ` : ''}Clienți — LUXARCH`; };

  /* ---------- Motivul respingerii ---------- */
  // Întoarce motivul scris sau null, dacă s-a renunțat
  function askReason(who) {
    const dlg = $('#rejectDlg'), form = $('#rejectDlgForm'), text = $('#rejectDlgText'), msg = $('#rejectDlgMsg');
    $('#rejectDlgWho').textContent = who;
    text.value = ''; msg.textContent = '';
    dlg.showModal(); text.focus();
    return new Promise(resolve => {
      function done(value) {
        form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(value);
      }
      function onSubmit(e) {
        e.preventDefault();
        if (e.submitter && e.submitter.value === 'cancel') return done(null);
        if (!text.value.trim()) { msg.textContent = 'Motivul e obligatoriu la „Respins”.'; text.focus(); return; }
        done(text.value.trim());
      }
      const onClose = () => done(null); // Esc
      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('close', onClose);
    });
  }

  // Doar ultima încărcare pornită are voie să scrie pe ecran:
  // clicuri repetate nu mai dublează rândurile
  let loadSeq = 0;

  /* ---------- Tabla pâlniei ---------- */
  const board = $('#board');
  const boardItems = new Map();

  function cardHtml(r) {
    const moves = Object.entries(STATUSES).filter(([k]) => k !== r.status)
      .map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
    return `<article class="card${r.status === 'noua' ? ' is-new' : ''}" draggable="true" data-id="${esc(r.id)}">
      <a class="card-name" href="/admin?id=${esc(r.id)}">${esc(r.name)}</a>
      <span class="card-meta">${esc(r.phone || r.email)}</span>
      ${payText(r) ? `<span class="card-pay${fullyPaid(r, r.paid_total) ? ' is-paid' : ''}">${esc(payText(r))}</span>` : ''}
      <span class="card-foot">${srcTag(r)}<span>${esc(fmtDay(r.created_at))}</span></span>
      <select class="card-move" aria-label="Mută „${esc(r.name)}” în altă etapă">
        <option value="" selected>Mută în…</option>${moves}
      </select>
    </article>`;
  }

  function renderBoard() {
    const items = [...boardItems.values()];
    board.innerHTML = Object.keys(STATUSES).map(s => `
      <section class="col" data-status="${s}" aria-label="${esc(STATUSES[s])}">
        <header class="col-head">${badge(s)}<span class="count"></span></header>
        <div class="col-body">${items.filter(r => r.status === s).map(cardHtml).join('')}</div>
      </section>`).join('');
    updateCounts();
  }

  function updateCounts() {
    board.querySelectorAll('.col').forEach(col => {
      const n = col.querySelectorAll('.card').length;
      col.querySelector('.count').textContent = n;
      col.classList.toggle('is-empty', !n);
    });
    setTitle([...boardItems.values()].filter(r => r.status === 'noua').length);
  }

  // Pune cartea clientului (din nou) în coloana etapei lui, sus
  function placeCard(r) {
    board.querySelector(`.card[data-id="${CSS.escape(r.id)}"]`)?.remove();
    board.querySelector(`.col[data-status="${r.status}"] .col-body`).insertAdjacentHTML('afterbegin', cardHtml(r));
    updateCounts();
  }

  async function moveCard(id, next) {
    const r = boardItems.get(id), msg = $('#boardMsg');
    if (!r || r.status === next || !STATUSES[next]) return;
    let comment = '';
    if (next === 'respins') {
      comment = await askReason(r.name);
      if (comment === null) { // cartea rămâne unde era, selectorul revine la „Mută în…”
        const sel = board.querySelector(`.card[data-id="${CSS.escape(id)}"] .card-move`);
        if (sel) sel.value = '';
        return;
      }
    }
    const prev = r.status;
    r.status = next; placeCard(r); // se mută imediat; revine dacă salvarea eșuează
    msg.textContent = '';
    try {
      const { item } = await api('/api/admin/requests/' + encodeURIComponent(id), {
        method: 'PATCH', body: JSON.stringify({ status: next, comment }),
      });
      Object.assign(r, item);
    } catch (err) {
      r.status = prev; placeCard(r);
      onError(err, () => { msg.textContent = `Nu am putut muta „${r.name}”. Reîncercați.`; });
    }
  }

  async function loadBoard() {
    const seq = ++loadSeq, msg = $('#boardMsg');
    if (!boardItems.size) msg.textContent = 'Se încarcă…';
    try {
      const { items } = await api('/api/admin/requests?all=1');
      if (seq !== loadSeq) return;
      boardItems.clear();
      items.forEach(r => boardItems.set(r.id, r));
      show('board');
      renderBoard();
      msg.textContent = items.length ? '' : 'Niciun client încă. Cererile de pe site apar aici automat, în „Nouă”.';
    } catch (err) {
      if (seq !== loadSeq) return;
      onError(err, () => {
        show('board');
        msg.innerHTML = 'Nu am putut încărca clienții. <button class="btn btn-sm btn-ghost" id="retryB">Reîncearcă</button>';
        $('#retryB').onclick = loadBoard;
      });
    }
  }

  // Trage cu mouse-ul: drag & drop între coloane
  let dragId = null;
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    card.classList.add('is-drag');
  });
  board.addEventListener('dragend', () => {
    dragId = null;
    board.querySelectorAll('.is-drag, .is-over').forEach(el => el.classList.remove('is-drag', 'is-over'));
  });
  board.addEventListener('dragover', e => {
    const col = e.target.closest('.col');
    if (!col || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    board.querySelectorAll('.col.is-over').forEach(c => c !== col && c.classList.remove('is-over'));
    col.classList.add('is-over');
  });
  board.addEventListener('dragleave', e => {
    const col = e.target.closest('.col');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-over');
  });
  board.addEventListener('drop', e => {
    const col = e.target.closest('.col');
    if (!col || !dragId) return;
    e.preventDefault();
    col.classList.remove('is-over');
    moveCard(dragId, col.dataset.status);
  });

  // Pe telefon (și din tastatură): selectorul „Mută în…” de pe carte
  board.addEventListener('change', e => {
    const sel = e.target.closest('.card-move');
    if (sel && sel.value) moveCard(sel.closest('.card').dataset.id, sel.value);
  });

  // Clic pe carte (oriunde, în afară de selector) → fișa clientului
  board.addEventListener('click', e => {
    if (e.target.closest('.card-move')) return;
    const card = e.target.closest('.card');
    if (!card || (e.target.closest('a') && (e.metaKey || e.ctrlKey))) return;
    e.preventDefault();
    go(`id=${encodeURIComponent(card.dataset.id)}`);
  });

  /* ---------- Lista ---------- */
  let cursor = null;
  let loadingMore = false;

  function renderFilter(counts, current) {
    const opts = [['toate', 'Toate'], ...Object.entries(STATUSES)];
    $('#filter').innerHTML = opts.map(([k, l]) => {
      const href = k === 'toate' ? '/admin?view=list' : `/admin?view=list&status=${k}`;
      return `<a class="filter${k === current ? ' is-on' : ''}" href="${href}">${esc(l)}<span class="count">${counts[k] ?? 0}</span></a>`;
    }).join('');
  }

  function rowHtml(r) {
    return `<li><a class="req${r.status === 'noua' ? ' is-new' : ''}" href="/admin?${detailQs(r.id)}">
      <span class="req-name">${esc(r.name)}</span>
      ${badge(r.status)}
      <span class="req-meta">${esc(fmt(r.created_at))} · ${esc(r.phone || r.email)} ·${esc(srcText(r))}${r.type ? ` · ${esc(TYPES[r.type] || r.type)}` : ''}${payText(r) ? ` · ${esc(payText(r))}` : ''}</span>
    </a></li>`;
  }

  async function loadList(reset) {
    if (!reset && (loadingMore || !cursor)) return;
    const seq = ++loadSeq;
    const status = STATUSES[params().get('status')] ? params().get('status') : 'toate';
    const msg = $('#listMsg');
    if (reset) { cursor = null; $('#list').innerHTML = ''; }
    msg.textContent = reset ? 'Se încarcă…' : '';
    $('#more').hidden = true;
    loadingMore = !reset;
    try {
      const qs = new URLSearchParams({ status });
      if (!reset && cursor) qs.set('cursor', cursor);
      const data = await api('/api/admin/requests?' + qs);
      if (seq !== loadSeq) return;
      show('list');
      renderFilter(data.counts, status);
      if (reset) $('#list').innerHTML = '';
      $('#list').insertAdjacentHTML('beforeend', data.items.map(rowHtml).join(''));
      cursor = data.nextCursor;
      $('#more').hidden = !cursor;
      const empty = !$('#list').children.length;
      msg.textContent = empty ? (status === 'toate' ? 'Niciun client încă.' : 'Niciun client în această etapă.') : '';
      setTitle(data.counts.noua);
    } catch (err) {
      if (seq !== loadSeq) return;
      onError(err, () => {
        show('list');
        msg.innerHTML = 'Nu am putut încărca clienții. <button class="btn btn-sm btn-ghost" id="retry">Reîncearcă</button>';
        $('#retry').onclick = () => loadList(true);
      });
    } finally {
      if (seq === loadSeq) loadingMore = false;
    }
  }

  $('#more').addEventListener('click', () => loadList(false));
  $('#filter').addEventListener('click', e => internal(e, e.target.closest('a')));
  $('#list').addEventListener('click', e => internal(e, e.target.closest('a.req')));

  /* ---------- Client nou (manual) ---------- */
  const newForm = $('#newForm');
  // „Respins” cere motiv, deci se alege abia din fișa clientului
  $('#newStatus').innerHTML = options(Object.fromEntries(Object.entries(STATUSES).filter(([k]) => k !== 'respins')), 'noua');
  $('#newChannel').innerHTML = options(CHANNELS, '', '— alegeți —');
  $('#newType').innerHTML = options(TYPES, '', '— nespecificat —');
  $('#newService').innerHTML = options(SERVICES, '', '— nespecificat —');

  function showNew() {
    ++loadSeq;
    $('#backNew').href = '/admin' + (backQs() ? '?' + backQs() : '');
    $('#newMsg').textContent = '';
    show('new');
    newForm.elements.name.focus();
  }

  newForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#newBtn'), msg = $('#newMsg');
    const data = Object.fromEntries(new FormData(newForm));
    const missing = ['name', 'phone', 'channel'].find(k => !(data[k] || '').trim());
    if (missing) {
      msg.textContent = 'Numele, telefonul și „Cum a venit” sunt obligatorii.';
      newForm.elements[missing].focus();
      return;
    }
    btn.disabled = true; msg.textContent = '';
    try {
      const { item } = await api('/api/admin/requests', { method: 'POST', body: JSON.stringify(data) });
      newForm.reset();
      go(`id=${encodeURIComponent(item.id)}`, true); // „Înapoi” din fișă duce la tablă, nu la formular
    } catch (err) {
      onError(err, e2 => {
        msg.textContent = e2.status === 400 && e2.fields.length
          ? `Verificați: ${e2.fields.map(f => FIELD_NAMES[f] || f).join(', ')}.`
          : 'Nu am putut salva clientul. Reîncercați.';
      });
    } finally {
      btn.disabled = false;
    }
  });
  $('#backNew').addEventListener('click', e => internal(e, e.currentTarget));

  /* ---------- Fișa clientului ---------- */
  function historyHtml(h) {
    if (!h.length) return '<li class="muted">Fără înregistrări.</li>';
    return h.map(x => `<li>
      <time>${esc(fmt(x.at))}</time>
      <span class="history-step">${x.from_status ? `${badge(x.from_status)} <span aria-label="în">→</span> ` : '<span class="muted">Creat în</span> '}${badge(x.to_status)}</span>
      ${x.comment ? `<span class="history-note">Motiv: ${esc(x.comment)}</span>` : ''}
    </li>`).join('');
  }

  async function loadDetail(id) {
    const seq = ++loadSeq; // anulează și o încărcare de listă rămasă în curs
    $('#back').href = '/admin' + (backQs() ? '?' + backQs() : '');
    $('#detail').innerHTML = '<p class="admin-msg">Se încarcă…</p>';
    show('detail');
    try {
      const { item: r, history: hist, payments: pays, documents: docs = [] } = await api('/api/admin/requests/' + encodeURIComponent(id));
      if (seq !== loadSeq) return;
      const phone = digits(r.phone);
      // „Carte de vizită — pagina 2” / „Chestionar — PDF”
      const docName = d => `${DOC_TYPES[d.doc_type]?.label || d.doc_type} — ${d.mime === 'application/pdf' ? 'PDF' : `pagina ${d.page}`}`;
      $('#detail').innerHTML = `
        <article class="detail-card">
          <h1>${esc(r.name)}</h1>
          <p class="muted">${srcTag(r)} Creat la ${esc(fmt(r.created_at))}${r.source === 'site' ? ` · ${({ en: 'Engleză', ru: 'Rusă' })[r.lang] || 'Română'}` : ''}</p>
          <div class="detail-actions">
            ${phone ? `<a class="btn btn-sm" href="tel:${esc(phone)}">Sună</a>
            <a class="btn btn-sm btn-clay" href="https://wa.me/${esc(phone.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            ${r.email ? `<a class="btn btn-sm btn-ghost" href="mailto:${esc(r.email)}">Email</a>` : ''}
          </div>
          <dl class="detail-grid">
            <dt>Etapă</dt>
            <dd>
              <div class="status-box">
                <select class="status-select" id="statusSel" aria-label="Etapă">${options(STATUSES, r.status)}</select>
                <span class="status-note" id="statusNote">Schimbat la ${esc(fmt(r.status_updated_at))}</span>
              </div>
              <p class="status-comment" id="statusComment"${r.status === 'respins' && r.status_comment ? '' : ' hidden'}>Motiv: ${esc(r.status_comment || '')}</p>
            </dd>
            <dt>Telefon</dt><dd>${phone ? `<a href="tel:${esc(phone)}">${esc(r.phone)}</a>` : '—'}</dd>
            <dt>Sursă</dt><dd>${esc(srcText(r))}</dd>
            <dt>Creat</dt><dd>${esc(fmt(r.created_at))}</dd>
            <dt>Email</dt><dd>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'}</dd>
            <dt>Tip proiect</dt><dd>${label(TYPES, r.type)}</dd>
            <dt>Servicii</dt><dd>${label(SERVICES, r.service)}</dd>
            ${docs.length ? `<dt>Documente</dt><dd><ul class="doc-links">${docs.map(d =>
              `<li><button class="link-btn" type="button" data-doc="${esc(d.id)}">${esc(docName(d))}</button></li>`).join('')}</ul></dd>` : ''}
            ${r.source === 'site' || r.message ? `<dt>Despre proiect</dt><dd class="detail-msg">${r.message ? esc(r.message) : '—'}</dd>` : ''}
            <dt><label for="notes">Note</label></dt>
            <dd>
              <textarea class="admin-input notes" id="notes" rows="4" maxlength="5000" placeholder="Ce s-a discutat, ce urmează…">${esc(r.notes || '')}</textarea>
              <div class="notes-actions">
                <button class="btn btn-sm btn-ghost" id="notesSave" type="button">Salvează notele</button>
                <span class="status-note" id="notesNote"></span>
              </div>
            </dd>
            <dt>Plăți</dt>
            <dd class="pay">
              <div class="pay-contract">
                <label class="new-field"><span class="admin-label">Valoare contract</span>
                  <input class="admin-input" id="payContract" inputmode="decimal" autocomplete="off" placeholder="ex. 12 500" value="${hasContract(r) ? esc(num(r.contract_value)) : ''}"></label>
                <label class="new-field"><span class="admin-label">Moneda</span>
                  <select class="admin-input" id="payCurrency">${options({ MDL: 'MDL', EUR: 'EUR' }, r.currency)}</select></label>
                <button class="btn btn-sm btn-ghost" id="payContractSave" type="button">Salvează</button>
              </div>
              <p class="status-note" id="payContractNote"></p>
              <div class="pay-totals" id="payTotals"></div>
              <ul class="pay-list" id="payList"></ul>
              <button class="btn btn-sm" id="payAdd" type="button">+ Adaugă plată</button>
              <form class="pay-form" id="payForm" hidden novalidate>
                <div class="pay-fields">
                  <label class="new-field"><span class="admin-label">Data</span><input class="admin-input" name="paid_on" type="date" required></label>
                  <label class="new-field"><span class="admin-label">Suma (<span id="payCur">${esc(r.currency)}</span>)</span><input class="admin-input" name="amount" inputmode="decimal" autocomplete="off" required></label>
                  <label class="new-field pay-note-field"><span class="admin-label">Notă</span><input class="admin-input" name="note" maxlength="200" autocomplete="off" placeholder="numerar, transfer, factura 12…"></label>
                </div>
                <div class="reject-actions">
                  <button class="btn btn-sm" type="submit" id="paySave">Salvează plata</button>
                  <button class="btn btn-sm btn-ghost" type="button" id="payCancel">Anulează</button>
                </div>
                <p class="status-note err" id="payMsg" role="alert"></p>
              </form>
            </dd>
            <dt>Istoric etape</dt><dd><ol class="history" id="history">${historyHtml(hist)}</ol></dd>
          </dl>
        </article>`;
      const moveTo = bindStatus(r);
      bindNotes(r);
      bindPayments(r, pays || [], moveTo);
    } catch (err) {
      if (seq !== loadSeq) return;
      onError(err, e => {
        const back = $('#back').getAttribute('href');
        $('#detail').innerHTML = e.status === 404
          ? `<p class="admin-msg">Clientul nu a fost găsit.</p><a class="btn btn-sm btn-ghost" href="${esc(back)}">Înapoi</a>`
          : '<p class="admin-msg">Nu am putut încărca fișa. <button class="btn btn-sm btn-ghost" id="retryD">Reîncearcă</button></p>';
        const retry = $('#retryD');
        if (retry) retry.onclick = () => loadDetail(id);
      });
    }
  }

  function bindStatus(r) {
    const sel = $('#statusSel'), note = $('#statusNote'), shown = $('#statusComment');
    let current = r.status;

    // „Respins” se salvează doar împreună cu motivul; restul etapelor, imediat
    sel.addEventListener('change', async () => {
      const next = sel.value;
      let comment = '';
      if (next === 'respins') {
        comment = await askReason(r.name);
        if (comment === null) { sel.value = current; return; }
      }
      sel.disabled = true;
      note.className = 'status-note'; note.textContent = 'Se salvează…';
      try {
        const { item, history: hist } = await api('/api/admin/requests/' + encodeURIComponent(r.id), {
          method: 'PATCH', body: JSON.stringify({ status: next, comment }),
        });
        current = r.status = item.status;
        shown.hidden = !(item.status === 'respins' && item.status_comment);
        shown.textContent = `Motiv: ${item.status_comment || ''}`;
        $('#history').innerHTML = historyHtml(hist);
        note.className = 'status-note ok'; note.textContent = `✓ Salvat · ${fmt(item.status_updated_at)}`;
      } catch (err) {
        sel.value = current;
        onError(err, () => { note.className = 'status-note err'; note.textContent = 'Nu am putut salva etapa. Reîncercați.'; });
      } finally {
        sel.disabled = false;
      }
    });

    // Folosit de propunerile din „Plăți”: aceeași mutare ca din selector, deci intră și în istoric
    return next => { sel.value = next; sel.dispatchEvent(new Event('change')); };
  }

  function bindNotes(r) {
    const text = $('#notes'), btn = $('#notesSave'), note = $('#notesNote');
    let saved = r.notes || '';
    text.addEventListener('input', () => {
      note.className = 'status-note';
      note.textContent = text.value.trim() === saved.trim() ? '' : 'Modificări nesalvate';
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      note.className = 'status-note'; note.textContent = 'Se salvează…';
      try {
        const { item } = await api('/api/admin/requests/' + encodeURIComponent(r.id), {
          method: 'PATCH', body: JSON.stringify({ notes: text.value }),
        });
        saved = item.notes;
        note.className = 'status-note ok'; note.textContent = '✓ Notele au fost salvate';
      } catch (err) {
        onError(err, () => { note.className = 'status-note err'; note.textContent = 'Nu am putut salva notele. Reîncercați.'; });
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Plăți ---------- */
  function bindPayments(r, list, moveTo) {
    const form = $('#payForm'), msg = $('#payMsg'), addBtn = $('#payAdd'), saveBtn = $('#paySave');
    let pays = list;
    let editing = null; // plata care se modifică; null = plată nouă

    const paidSum = () => Math.round(pays.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;

    function render() {
      const paid = paidSum(), cur = r.currency;
      const rows = [
        ['Contract', hasContract(r) ? money(r.contract_value, cur) : '—', ''],
        ['Plătit', money(paid, cur), ''],
      ];
      if (hasContract(r)) {
        const left = Math.round((Number(r.contract_value) - paid) * 100) / 100;
        rows.push(left >= 0
          ? ['Rămas', money(left, cur), left === 0 && paid > 0 ? 'is-ok' : '']
          : ['Plătit în plus', money(-left, cur), 'is-over']);
      }
      $('#payTotals').innerHTML = rows.map(([k, v, c]) => `<div class="${c}"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
      $('#payList').innerHTML = pays.length ? pays.map(p => `<li data-id="${esc(p.id)}">
          <time>${esc(fmtPayDay(p.paid_on))}</time>
          <b>${esc(money(p.amount, cur))}</b>
          ${p.note ? `<span class="pay-note">${esc(p.note)}</span>` : ''}
          <span class="pay-actions">
            <button class="link-btn" type="button" data-act="edit">Modifică</button>
            <button class="link-btn danger" type="button" data-act="del">Șterge</button>
          </span>
        </li>`).join('') : '<li class="muted">Nicio plată încă.</li>';
      $('#payCur').textContent = cur;
    }

    function openForm(p) {
      editing = p;
      form.elements.paid_on.max = today();
      form.elements.paid_on.value = p ? p.paid_on : today();
      form.elements.amount.value = p ? num(p.amount) : '';
      form.elements.note.value = p ? p.note : '';
      saveBtn.textContent = p ? 'Salvează modificarea' : 'Salvează plata';
      msg.textContent = '';
      form.hidden = false; addBtn.hidden = true;
      form.elements.amount.focus();
    }
    function closeForm() {
      editing = null;
      form.hidden = true; addBtn.hidden = false;
    }

    // Plata a fost ștearsă între timp (de ex. din alt tab): reîncărcăm fișa
    function gone() {
      alert('Plata nu mai există.');
      loadDetail(r.id);
    }

    // Etapa nu se mută singură: doar propunem, după o plată adăugată sau modificată
    function suggest(first) {
      if (r.status === 'respins' || r.status === 'inchisa') return;
      if (fullyPaid(r, paidSum())) {
        if (r.status !== 'platit' && r.status !== 'incheiat' && confirm('Achitat integral. Muți clientul în „Plătit”?')) moveTo('platit');
        return;
      }
      if (first && ['noua', 'contactata', 'in_lucru', 'procesat'].includes(r.status) &&
          confirm('Prima plată înregistrată. Muți clientul în „Avans”?')) moveTo('avans');
    }

    addBtn.addEventListener('click', () => openForm(null));
    $('#payCancel').addEventListener('click', closeForm);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const paidOn = form.elements.paid_on.value;
      const amount = parseMoney(form.elements.amount.value);
      const note = form.elements.note.value.trim();
      if (!paidOn) { msg.textContent = 'Alegeți data plății.'; form.elements.paid_on.focus(); return; }
      if (paidOn > today()) { msg.textContent = 'Data nu poate fi în viitor.'; form.elements.paid_on.focus(); return; }
      if (!amount) { msg.textContent = 'Introduceți o sumă mai mare ca 0 (cel mult 2 zecimale).'; form.elements.amount.focus(); return; }

      const first = !editing && pays.length === 0;
      saveBtn.disabled = true; msg.textContent = '';
      try {
        const body = JSON.stringify({ request_id: r.id, paid_on: paidOn, amount, note });
        ({ payments: pays } = editing
          ? await api('/api/admin/payments?id=' + encodeURIComponent(editing.id), { method: 'PATCH', body })
          : await api('/api/admin/payments', { method: 'POST', body }));
        closeForm();
        render();
        suggest(first);
      } catch (err) {
        onError(err, e2 => {
          if (e2.status === 404) return gone();
          msg.textContent = e2.status === 400 ? 'Verificați data și suma.' : 'Nu s-a salvat. Încercați din nou.';
        });
      } finally {
        saveBtn.disabled = false;
      }
    });

    $('#payList').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const p = pays.find(x => String(x.id) === btn.closest('li').dataset.id);
      if (!p) return;
      if (btn.dataset.act === 'edit') return openForm(p);
      if (!confirm(`Ștergi plata de ${money(p.amount, r.currency)} din ${fmtPayDay(p.paid_on)}?`)) return;
      btn.disabled = true;
      try {
        ({ payments: pays } = await api('/api/admin/payments?id=' + encodeURIComponent(p.id), { method: 'DELETE' }));
        if (editing && editing.id === p.id) closeForm();
        render();
      } catch (err) {
        btn.disabled = false;
        onError(err, e2 => (e2.status === 404 ? gone() : alert('Nu s-a șters plata. Încercați din nou.')));
      }
    });

    // Valoarea contractului și moneda
    const note = $('#payContractNote');
    $('#payContractSave').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const raw = $('#payContract').value.trim();
      const value = raw === '' ? null : parseMoney(raw);
      const currency = $('#payCurrency').value;
      if (raw !== '' && value === null) {
        note.className = 'status-note err'; note.textContent = 'Valoarea contractului nu e un număr valid.'; $('#payContract').focus(); return;
      }
      if (currency !== r.currency && pays.length &&
          !confirm('Sumele nu se convertesc, se schimbă doar moneda afișată. Continui?')) {
        $('#payCurrency').value = r.currency; return;
      }
      btn.disabled = true;
      note.className = 'status-note'; note.textContent = 'Se salvează…';
      try {
        const { item } = await api('/api/admin/requests/' + encodeURIComponent(r.id), {
          method: 'PATCH', body: JSON.stringify({ contract_value: value, currency }),
        });
        r.contract_value = item.contract_value; r.currency = item.currency;
        $('#payContract').value = hasContract(r) ? num(r.contract_value) : '';
        render();
        note.className = 'status-note ok'; note.textContent = '✓ Salvat';
      } catch (err) {
        onError(err, () => { note.className = 'status-note err'; note.textContent = 'Nu s-a salvat. Încercați din nou.'; });
      } finally {
        btn.disabled = false;
      }
    });

    render();
  }

  $('#back').addEventListener('click', e => internal(e, e.currentTarget));

  // Originalul documentului: link semnat, valabil 5 minute, cerut abia la clic.
  // Fereastra se deschide imediat (altfel browserul o blochează), adresa vine după.
  $('#detail').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-doc]');
    if (!btn) return;
    const w = window.open('', '_blank');
    try {
      const { url } = await api('/api/admin/docs/open?id=' + encodeURIComponent(btn.dataset.doc));
      if (w) { w.opener = null; w.location = url; } else location.href = url;
    } catch (err) {
      if (w) w.close();
      onError(err, () => alert('Nu am putut deschide documentul. Încercați din nou.'));
    }
  });

  /* ---------- Document recunoscut de Claude ---------- */
  const dlg = $('#docDlg'), docForm = $('#docForm'), docMsg = $('#docMsg');
  const MAX_IMAGES = 5, MAX_IMAGE = 15 * 1024 * 1024, MAX_PDF = 10 * 1024 * 1024, MAX_SIDE = 2000;
  const doc = { files: [], token: null, type: '', forced: null, dupes: [], saved: false };

  $('#docType').innerHTML = Object.entries(DOC_TYPES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('');
  $('#docProjType').innerHTML = options(TYPES, '', '— nespecificat —');
  $('#docService').innerHTML = options(SERVICES, '', '— nespecificat —');

  function step(name) {
    dlg.querySelectorAll('.doc-step').forEach(s => { s.hidden = s.dataset.step !== name; });
  }

  function thumbsHtml(small) {
    return doc.files.map((f, i) => `<li>
      ${f.mime === 'application/pdf' ? '<span class="doc-pdf">PDF</span>' : `<img src="${f.url}" alt="Pagina ${i + 1}">`}
      ${small ? '' : `<span class="doc-thumb-actions">
        ${i ? `<button class="link-btn" type="button" data-act="left" data-i="${i}" aria-label="Mută la stânga">←</button>` : ''}
        ${i < doc.files.length - 1 ? `<button class="link-btn" type="button" data-act="right" data-i="${i}" aria-label="Mută la dreapta">→</button>` : ''}
        <button class="link-btn danger" type="button" data-act="del" data-i="${i}">Șterge</button>
      </span>`}
    </li>`).join('');
  }
  function renderThumbs() {
    $('#docThumbs').innerHTML = thumbsHtml(false);
    $('#docRead').disabled = !doc.files.length;
  }

  // Fișierele s-au schimbat: cele urcate deja nu mai sunt valabile
  function dropUpload() {
    if (doc.token) api('/api/admin/docs/cancel', { method: 'POST', body: JSON.stringify({ token: doc.token }) }).catch(() => {});
    doc.token = null;
  }

  function resetDoc() {
    doc.files.forEach(f => URL.revokeObjectURL(f.url));
    Object.assign(doc, { files: [], token: null, type: '', forced: null, dupes: [], saved: false });
    docForm.reset();
    $('#docFile').value = '';
    docMsg.textContent = '';
    renderThumbs();
    step('pick');
  }

  // Poza se micșorează în browser (latura mare ≤ 2000 px, JPEG): încape în cerere și rezolvă HEIC
  async function shrink(file) {
    let src, w, h, url;
    try {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
      w = src.width; h = src.height;
    } catch (e) {
      url = URL.createObjectURL(file);
      src = await new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok(img); img.onerror = fail; img.src = url; });
      w = src.naturalWidth; h = src.naturalHeight;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) throw new Error('canvas');
    return blob;
  }

  $('#docBtn').addEventListener('click', () => { resetDoc(); dlg.showModal(); });

  $('#docFile').addEventListener('change', async e => {
    const picked = [...e.target.files];
    e.target.value = '';
    docMsg.textContent = '';
    const pdfs = picked.filter(f => f.type === 'application/pdf');
    if (pdfs.length) {
      if (picked.length > 1 || doc.files.length) { docMsg.textContent = 'Un PDF se încarcă singur, fără alte fișiere.'; return; }
      if (pdfs[0].size > MAX_PDF) { docMsg.textContent = 'PDF-ul e mai mare de 10 MB.'; return; }
      dropUpload();
      doc.files = [{ mime: 'application/pdf', blob: pdfs[0], url: '' }];
      return renderThumbs();
    }
    if (doc.files.some(f => f.mime === 'application/pdf')) { docMsg.textContent = 'Un PDF se încarcă singur, fără alte fișiere.'; return; }
    if (doc.files.length + picked.length > MAX_IMAGES) { docMsg.textContent = `Cel mult ${MAX_IMAGES} poze pentru un document.`; return; }
    if (picked.some(f => f.size > MAX_IMAGE)) { docMsg.textContent = 'O poză e mai mare de 15 MB.'; return; }
    $('#docRead').disabled = true;
    docMsg.textContent = 'Se pregătesc pozele…';
    try {
      for (const f of picked) {
        const blob = await shrink(f);
        doc.files.push({ mime: 'image/jpeg', blob, url: URL.createObjectURL(blob) });
      }
      docMsg.textContent = '';
    } catch (err) {
      docMsg.textContent = 'Formatul pozei nu e acceptat. Alege o poză JPG sau PNG.';
    }
    dropUpload();
    renderThumbs();
  });

  $('#docThumbs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.dataset.i), f = doc.files;
    if (btn.dataset.act === 'del') URL.revokeObjectURL(f.splice(i, 1)[0].url);
    else { const j = btn.dataset.act === 'left' ? i - 1 : i + 1; [f[i], f[j]] = [f[j], f[i]]; }
    dropUpload();
    renderThumbs();
  });

  // Urcă fișierele direct în Storage (o singură dată pentru aceleași fișiere)
  async function uploadFiles() {
    if (doc.token) return;
    const meta = doc.files.map((f, i) => ({ page: i + 1, mime: f.mime, size: f.blob.size }));
    const { token, uploads } = await api('/api/admin/docs/upload', { method: 'POST', body: JSON.stringify({ files: meta }) });
    await Promise.all(uploads.map(async u => {
      const f = doc.files[u.page - 1];
      const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': f.mime }, body: f.blob });
      if (!r.ok) throw Object.assign(new Error('storage'), { status: 'storage' });
    }));
    doc.token = token;
  }

  function fillForm(fields) {
    docForm.reset();
    Object.entries(fields || {}).forEach(([k, v]) => { if (docForm.elements[k]) docForm.elements[k].value = v || ''; });
  }

  function showReview(type, fields, dupes) {
    doc.type = type;
    $('#docType').value = type;
    $('#docMessageField').hidden = type !== 'chestionar';
    $('#docReviewThumbs').innerHTML = thumbsHtml(true);
    fillForm(fields);
    const f = fields || {};
    $('#docHint').textContent = !fields ? ''
      : !f.name && !f.phone && !f.email ? 'Nu s-au putut citi datele principale. Completează-le manual.'
        : Object.values(f).some(v => String(v).includes('[?]')) ? 'Unele cuvinte nu s-au putut citi — sunt marcate cu [?].' : '';
    showDupes(dupes || []);
    step('review');
  }

  function showDupes(list) {
    doc.dupes = list;
    const box = $('#docDupes');
    box.hidden = !list.length;
    box.innerHTML = list.length ? `<p><b>Există deja:</b></p><ul>${list.map(d =>
      `<li>${esc(d.name)} (${esc(d.status)}) <button class="link-btn" type="button" data-open="${esc(d.id)}">Deschide clientul existent</button></li>`).join('')}</ul>
      <p class="muted">Dacă e altă persoană, apasă „Creează oricum”.</p>` : '';
    $('#docSave').textContent = list.length ? 'Creează oricum' : 'Salvează';
  }

  // Citirea cu Claude; `forced` = tipul ales de utilizator
  async function readDoc(forced) {
    const btn = $('#docRead');
    btn.disabled = true; btn.textContent = 'Se citește…';
    docMsg.textContent = '';
    doc.forced = forced;
    try {
      await uploadFiles();
      const res = await api('/api/admin/docs/read', { method: 'POST', body: JSON.stringify({ token: doc.token, doc_type: forced || undefined }) });
      if (!res.doc_type) {
        doc.token = null; // serverul a șters deja fișierele
        step('pick');
        docMsg.textContent = 'Nu pare un document. Nu s-a salvat nimic.';
        return;
      }
      if (!res.supported) {
        doc.type = res.doc_type;
        $('#docUnsupported').textContent = `Tip recunoscut: ${DOC_TYPES[res.doc_type].label}. Secțiunea nu e gata încă, nu s-a salvat nimic.`;
        return step('unsupported');
      }
      showReview(res.doc_type, res.fields, res.duplicates);
    } catch (err) {
      if (err instanceof AuthError) dlg.close();
      onError(err, e2 => {
        if (e2.status === 'storage') { step('pick'); docMsg.textContent = 'Nu s-a putut încărca fișierul. Încearcă din nou.'; return; }
        if (e2.status === 429) { step('pick'); docMsg.textContent = 'Prea multe citiri într-o oră. Încearcă mai târziu sau completează manual.'; return; }
        if (e2.status === 400) { dropUpload(); step('pick'); docMsg.textContent = e2.message === 'pages' ? 'PDF-ul are mai mult de 20 de pagini.' : 'Fișierul nu e acceptat (tip sau mărime).'; return; }
        $('#docErrDetail').textContent = e2.data?.detail ? `Detaliu tehnic: ${e2.data.detail}` : '';
        step('error');
      });
    } finally {
      btn.disabled = !doc.files.length; btn.textContent = 'Citește';
    }
  }

  $('#docRead').addEventListener('click', () => readDoc(null));
  $('#docRetry').addEventListener('click', () => { step('pick'); readDoc(doc.forced); });
  $('#docManual').addEventListener('click', () => showReview('carte_vizita', null, []));
  $('#docChangeType').addEventListener('click', () => {
    showReview(DOC_TYPES[doc.type]?.ready ? doc.type : 'carte_vizita', null, []);
    $('#docType').focus();
  });

  // Alt tip: Claude recitește documentul pentru tipul ales (sau doar se schimbă câmpurile, la completare manuală)
  $('#docType').addEventListener('change', async e => {
    const next = e.target.value;
    if (!DOC_TYPES[next].ready) {
      e.target.value = doc.type;
      $('#docHint').textContent = `„${DOC_TYPES[next].label}”: secțiunea nu e gata încă.`;
      return;
    }
    if (!doc.files.length) { doc.type = next; $('#docMessageField').hidden = next !== 'chestionar'; return; }
    if (!confirm('Schimbi tipul? Câmpurile se citesc din nou.')) { e.target.value = doc.type; return; }
    step('pick');
    await readDoc(next);
  });

  docForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(docForm));
    if (doc.type !== 'chestionar') fields.message = '';
    if (!fields.name.trim()) { docMsg.textContent = 'Numele e obligatoriu.'; docForm.elements.name.focus(); return; }
    if (!fields.phone.trim() && !fields.email.trim()) { docMsg.textContent = 'Completează telefonul sau emailul.'; docForm.elements.phone.focus(); return; }
    const btn = $('#docSave');
    btn.disabled = true; docMsg.textContent = '';
    try {
      if (doc.files.length) await uploadFiles();
      const res = await api('/api/admin/docs/save', {
        method: 'POST',
        body: JSON.stringify({ token: doc.token || crypto.randomUUID(), doc_type: doc.type, fields, force: doc.dupes.length > 0 }),
      });
      doc.saved = true;
      dlg.close();
      if (res.filesError) alert('Clientul a fost creat, dar fișierele nu s-au salvat.');
      go(`id=${encodeURIComponent(res.id)}`);
    } catch (err) {
      if (err instanceof AuthError) dlg.close();
      onError(err, e2 => {
        if (e2.status === 409) { showDupes(e2.data.duplicates || []); return; }
        docMsg.textContent = e2.status === 'storage' ? 'Nu s-a putut încărca fișierul. Încearcă din nou.'
          : e2.status === 400 && e2.fields.length ? `Verificați: ${e2.fields.map(f => FIELD_NAMES[f] || f).join(', ')}.`
            : 'Nu s-a salvat. Încearcă din nou.';
      });
    } finally {
      btn.disabled = false;
    }
  });

  $('#docDupes').addEventListener('click', e => {
    const btn = e.target.closest('button[data-open]');
    if (!btn) return;
    dlg.close();
    go(`id=${encodeURIComponent(btn.dataset.open)}`);
  });

  // Închiderea fără salvare: fișierele temporare se șterg
  ['#docClose', '#docCancel', '#docUnsupportedClose'].forEach(s => $(s).addEventListener('click', () => dlg.close()));
  dlg.addEventListener('close', () => { if (!doc.saved) dropUpload(); });

  route();
})();
