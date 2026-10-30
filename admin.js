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
  const SOURCES = { site: 'Site web', manual: 'Manual' };
  const CHANNELS = { apel: 'Apel', intalnire: 'Întâlnire' };
  const FIELD_NAMES = { name: 'nume', phone: 'telefon', channel: 'cum a venit', email: 'email', type: 'tip proiect', service: 'servicii', status: 'etapă', notes: 'note' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDay = d => new Date(d).toLocaleDateString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric' });
  const badge = s => `<span class="badge s-${esc(s)}">${esc(STATUSES[s] || s)}</span>`;
  // „Site web” sau „Manual · Apel” / „Manual · Întâlnire”
  const srcText = r => (SOURCES[r.source] || r.source) + (r.channel ? ` · ${CHANNELS[r.channel] || r.channel}` : '');
  const srcTag = r => `<span class="src src-${esc(r.source)}">${esc(srcText(r))}</span>`;
  const label = (map, k) => (k ? esc(map[k] || k) : '—');
  const digits = p => String(p).replace(/[^\d+]/g, '');
  const options = (map, selected, empty) =>
    (empty ? `<option value="">${esc(empty)}</option>` : '') +
    Object.entries(map).map(([k, l]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const views = { login: $('#view-login'), board: $('#view-board'), list: $('#view-list'), new: $('#view-new'), detail: $('#view-detail') };
  function show(name) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
    $('#logout').hidden = name === 'login';
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
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, fields: data.fields || [] });
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
      <span class="card-meta">${esc(r.phone)}</span>
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
      <span class="req-meta">${esc(fmt(r.created_at))} · ${esc(r.phone)} · ${esc(srcText(r))}${r.type ? ` · ${esc(TYPES[r.type] || r.type)}` : ''}</span>
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
      const { item: r, history: hist } = await api('/api/admin/requests/' + encodeURIComponent(id));
      if (seq !== loadSeq) return;
      const phone = digits(r.phone);
      $('#detail').innerHTML = `
        <article class="detail-card">
          <h1>${esc(r.name)}</h1>
          <p class="muted">${srcTag(r)} Creat la ${esc(fmt(r.created_at))}${r.source === 'site' ? ` · ${({ en: 'Engleză', ru: 'Rusă' })[r.lang] || 'Română'}` : ''}</p>
          <div class="detail-actions">
            <a class="btn btn-sm" href="tel:${esc(phone)}">Sună</a>
            <a class="btn btn-sm btn-clay" href="https://wa.me/${esc(phone.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>
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
            <dt>Telefon</dt><dd><a href="tel:${esc(phone)}">${esc(r.phone)}</a></dd>
            <dt>Sursă</dt><dd>${esc(srcText(r))}</dd>
            <dt>Creat</dt><dd>${esc(fmt(r.created_at))}</dd>
            <dt>Email</dt><dd>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'}</dd>
            <dt>Tip proiect</dt><dd>${label(TYPES, r.type)}</dd>
            <dt>Servicii</dt><dd>${label(SERVICES, r.service)}</dd>
            ${r.source === 'site' || r.message ? `<dt>Despre proiect</dt><dd class="detail-msg">${r.message ? esc(r.message) : '—'}</dd>` : ''}
            <dt><label for="notes">Note</label></dt>
            <dd>
              <textarea class="admin-input notes" id="notes" rows="4" maxlength="5000" placeholder="Ce s-a discutat, ce urmează…">${esc(r.notes || '')}</textarea>
              <div class="notes-actions">
                <button class="btn btn-sm btn-ghost" id="notesSave" type="button">Salvează notele</button>
                <span class="status-note" id="notesNote"></span>
              </div>
            </dd>
            <dt>Istoric etape</dt><dd><ol class="history" id="history">${historyHtml(hist)}</ol></dd>
          </dl>
        </article>`;
      bindStatus(r);
      bindNotes(r);
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
        current = item.status;
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

  $('#back').addEventListener('click', e => internal(e, e.currentTarget));

  route();
})();
