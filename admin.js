/* ==========================================================
   Panoul de administrare: autentificare, listă, filtru, detalii
   Starea stă în adresă: /admin?status=noua sau /admin?id=<uuid>
   ========================================================== */
(() => {
  const $ = (s, c = document) => c.querySelector(s);

  const STATUSES = { noua: 'Nouă', contactat: 'Contactat', oferta: 'Ofertă trimisă', contract: 'Contract', refuzat: 'Refuzat' };
  const TYPES = { casa: 'Casă unifamilială', ansamblu: 'Ansamblu rezidențial', birouri: 'Clădire de birouri / comercială', hala: 'Hală / industrial', expertiza: 'Expertiză / consolidare', altceva: 'Altceva' };
  const SERVICES = { arh_rez: 'Arhitectură + Rezistență', arh: 'Doar arhitectură', rez: 'Doar rezistență', nu_stiu: 'Nu știu încă' };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const badge = s => `<span class="badge s-${esc(s)}">${esc(STATUSES[s] || s)}</span>`;
  const digits = p => String(p).replace(/[^\d+]/g, '');

  const views = { login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail') };
  function show(name) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
    $('#logout').hidden = name === 'login';
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
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
    return data;
  }

  // Orice 401 golește ecranul și cere parola din nou
  function onError(err, fallback) {
    if (err instanceof AuthError) {
      $('#list').innerHTML = ''; $('#detail').innerHTML = '';
      show('login'); $('#pw').focus();
      return;
    }
    fallback(err);
  }

  /* ---------- Navigare ---------- */
  const params = () => new URLSearchParams(location.search);
  function go(qs) {
    history.pushState(null, '', '/admin' + (qs ? '?' + qs : ''));
    route();
  }
  function route() {
    const p = params();
    if (p.get('id')) loadDetail(p.get('id'));
    else loadList(true);
  }
  window.addEventListener('popstate', route);

  /* ---------- Autentificare ---------- */
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
    $('#list').innerHTML = ''; $('#detail').innerHTML = '';
    history.replaceState(null, '', '/admin');
    show('login');
  });

  /* ---------- Lista ---------- */
  let cursor = null;

  function renderFilter(counts, current) {
    const opts = [['toate', 'Toate'], ...Object.entries(STATUSES)];
    $('#filter').innerHTML = opts.map(([k, label]) => {
      const href = k === 'toate' ? '/admin' : `/admin?status=${k}`;
      return `<a class="filter${k === current ? ' is-on' : ''}" href="${href}" data-status="${k}">${esc(label)}<span class="count">${counts[k] ?? 0}</span></a>`;
    }).join('');
  }

  function rowHtml(r) {
    const qs = new URLSearchParams({ id: r.id });
    const st = params().get('status');
    if (st) qs.set('status', st);
    return `<li><a class="req${r.status === 'noua' ? ' is-new' : ''}" href="/admin?${qs}" data-id="${esc(r.id)}">
      <span class="req-name">${esc(r.name)}</span>
      ${badge(r.status)}
      <span class="req-meta">${esc(fmt(r.created_at))} · ${esc(r.phone)} · ${esc(TYPES[r.type] || r.type)}</span>
    </a></li>`;
  }

  async function loadList(reset) {
    const status = STATUSES[params().get('status')] ? params().get('status') : 'toate';
    const msg = $('#listMsg');
    if (reset) { cursor = null; $('#list').innerHTML = ''; }
    msg.textContent = reset ? 'Se încarcă…' : '';
    $('#more').hidden = true;
    try {
      const qs = new URLSearchParams({ status });
      if (cursor) qs.set('cursor', cursor);
      const data = await api('/api/admin/requests?' + qs);
      show('list');
      renderFilter(data.counts, status);
      $('#list').insertAdjacentHTML('beforeend', data.items.map(rowHtml).join(''));
      cursor = data.nextCursor;
      $('#more').hidden = !cursor;
      const empty = !$('#list').children.length;
      msg.textContent = empty ? (status === 'toate' ? 'Nicio cerere încă.' : 'Nicio cerere cu acest status.') : '';
      document.title = `${data.counts.noua ? `(${data.counts.noua}) ` : ''}Cereri — Atelier Temelia`;
    } catch (err) {
      onError(err, () => {
        show('list');
        msg.innerHTML = 'Nu am putut încărca cererile. <button class="btn btn-sm btn-ghost" id="retry">Reîncearcă</button>';
        $('#retry').onclick = () => loadList(true);
      });
    }
  }

  $('#more').addEventListener('click', () => loadList(false));
  $('#filter').addEventListener('click', e => {
    const a = e.target.closest('a[data-status]');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.status === 'toate' ? '' : `status=${a.dataset.status}`);
  });
  $('#list').addEventListener('click', e => {
    const a = e.target.closest('a.req');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    go(a.getAttribute('href').split('?')[1]);
  });

  /* ---------- Detalii ---------- */
  function backHref() {
    const st = params().get('status');
    return st ? `/admin?status=${encodeURIComponent(st)}` : '/admin';
  }

  async function loadDetail(id) {
    $('#back').href = backHref();
    $('#detail').innerHTML = '<p class="admin-msg">Se încarcă…</p>';
    show('detail');
    try {
      const { item: r } = await api('/api/admin/requests/' + encodeURIComponent(id));
      const phone = digits(r.phone);
      $('#detail').innerHTML = `
        <article class="detail-card">
          <h1>${esc(r.name)}</h1>
          <p class="muted">${esc(fmt(r.created_at))} · ${r.lang === 'en' ? 'Engleză' : 'Română'}</p>
          <div class="detail-actions">
            <a class="btn btn-sm" href="tel:${esc(phone)}">Sună</a>
            <a class="btn btn-sm btn-clay" href="https://wa.me/${esc(phone.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="btn btn-sm btn-ghost" href="mailto:${esc(r.email)}">Email</a>
          </div>
          <dl class="detail-grid">
            <dt>Status</dt>
            <dd>
              <div class="status-box">
                <select class="status-select" id="statusSel" aria-label="Status">
                  ${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${esc(l)}</option>`).join('')}
                </select>
                <span class="status-note" id="statusNote">Schimbat la ${esc(fmt(r.status_updated_at))}</span>
              </div>
            </dd>
            <dt>Telefon</dt><dd><a href="tel:${esc(phone)}">${esc(r.phone)}</a></dd>
            <dt>Email</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>
            <dt>Tip proiect</dt><dd>${esc(TYPES[r.type] || r.type)}</dd>
            <dt>Servicii</dt><dd>${esc(SERVICES[r.service] || r.service)}</dd>
            <dt>Despre proiect</dt><dd class="detail-msg">${r.message ? esc(r.message) : '—'}</dd>
          </dl>
        </article>`;
      bindStatus(r);
    } catch (err) {
      onError(err, e => {
        $('#detail').innerHTML = e.status === 404
          ? `<p class="admin-msg">Cererea nu a fost găsită.</p><a class="btn btn-sm btn-ghost" href="${esc(backHref())}">Înapoi la listă</a>`
          : '<p class="admin-msg">Nu am putut încărca cererea. <button class="btn btn-sm btn-ghost" id="retryD">Reîncearcă</button></p>';
        const retry = $('#retryD');
        if (retry) retry.onclick = () => loadDetail(id);
      });
    }
  }

  function bindStatus(r) {
    const sel = $('#statusSel'), note = $('#statusNote');
    let current = r.status;
    sel.addEventListener('change', async () => {
      const next = sel.value;
      sel.disabled = true;
      note.className = 'status-note'; note.textContent = 'Se salvează…';
      try {
        const { item } = await api('/api/admin/requests/' + encodeURIComponent(r.id), {
          method: 'PATCH', body: JSON.stringify({ status: next }),
        });
        current = item.status;
        note.className = 'status-note ok'; note.textContent = `✓ Salvat · ${fmt(item.status_updated_at)}`;
      } catch (err) {
        sel.value = current;
        onError(err, () => { note.className = 'status-note err'; note.textContent = 'Nu am putut salva statusul. Reîncercați.'; });
      } finally {
        sel.disabled = false;
      }
    });
  }

  $('#back').addEventListener('click', e => { e.preventDefault(); go(backHref().split('?')[1] || ''); });

  route();
})();
