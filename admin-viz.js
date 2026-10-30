/* ==========================================================
   Panoul de administrare — Vizualizări (schițe generate pe server: Cloudflare Workers AI sau Gemini):
   secțiunea de pe fișa clientului, lista generală a echipei (/admin?viz=list, /admin?viz=list&mine=1),
   dialogul „Vizualizare nouă” și dialogul unei generări (schița mare, pozele de intrare, ștergerea).
   Proprietarul și angajatul pot genera (5 pe zi de om); angajatul șterge doar generările lui (serverul verifică).
   ========================================================== */
window.LUXVIZ = (() => {
  let L; // ajutoarele comune din admin.js (api, esc, go, show…)
  const KINDS = { casa_noua: 'Casă nouă pe teren', fatada: 'Fațadă / renovare exterior', interior: 'Interior' };
  const MAX = 3, MAX_SIZE = 10 * 1024 * 1024;
  let SIDE = 2048; // latura mare după micșorare: vine de la server (max_side; Cloudflare primește doar poze sub 512 px)
  const LABEL = 'Schiță orientativă generată automat, nu e proiect';
  const $ = id => document.getElementById(id);
  let seq = 0;

  // Ce se reîncarcă după o generare nouă sau o ștergere: secțiunea de pe fișă sau lista generală
  let refresh = () => {};

  const fmt = d => new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const author = g => (g.origin === 'public' ? 'Vizitator (site)' : g.actor === 'owner' ? 'Proprietar' : `${g.actor} (Telegram)`);
  // Linkul semnat cu „download”: Storage trimite fișierul ca descărcare
  const downloadUrl = url => url + (url.includes('?') ? '&' : '?') + 'download=luxarch-schita';

  const ERRORS = {
    viz_off: 'Generarea nu e configurată.',
    limit_team: 'Ai folosit azi cele 5 generări. Mâine de la 00:00 poți genera din nou.',
    limit_tries: 'Prea multe încercări. Încearcă peste o oră.',
    timeout: 'Generarea a durat prea mult. Încearcă din nou.',
    service: 'Serviciul nu răspunde, încearcă din nou.',
    rejected: 'Poza nu a putut fi folosită. Încearcă altă poză.',
    quota: 'Limita gratuită zilnică a serviciului de imagini e atinsă (se resetează la 00:00 UTC). Nu se numără la cele 5 ale tale.',
    expired: 'Rezervarea a expirat (15 minute). Apasă din nou „Generează”.',
    busy: 'Generarea e deja în curs. Așteaptă câteva secunde.',
    nofiles: 'Încărcarea s-a întrerupt. Încearcă din nou.',
    storage: 'Încărcarea s-a întrerupt. Încearcă din nou.',
    files: 'Pozele nu sunt acceptate (1–3 poze JPG, PNG sau WEBP, până la 10 MB).',
    notfound: 'Clientul sau generarea nu mai există.',
  };
  const errText = e => ERRORS[e.message] || ERRORS[e.status] || 'Nu s-a putut genera. Încearcă din nou.';

  /* ---------- Lista (comună pentru fișă și lista generală) ---------- */
  function itemsHtml(items) {
    return `<ul class="viz-items">${items.map(g => `<li class="viz-item">
      <button class="viz-thumb" type="button" data-viz="${L.esc(g.id)}" aria-label="Deschide vizualizarea din ${L.esc(fmt(g.created_at))}">
        ${g.thumb ? `<img src="${L.esc(g.thumb)}" alt="" loading="lazy">` : '<span class="viz-noimg">Schiță</span>'}
        <span class="viz-tag">Schiță orientativă</span>
      </button>
      <div class="viz-meta">
        <b>${L.esc(KINDS[g.kind] || g.kind)}</b>
        <span class="muted">${L.esc(fmt(g.created_at))} · ${L.esc(author(g))}</span>
        ${g.wishes ? `<span class="viz-wishes">${L.esc(g.wishes)}</span>` : ''}
      </div>
    </li>`).join('')}</ul>`;
  }

  // Elementele afișate, după id: dialogul generării le folosește (dorințe, autor, drept de ștergere)
  const shown = new Map();
  function remember(items) { items.forEach(g => shown.set(g.id, g)); }

  const usageText = d => `Azi ai folosit ${d.used} din ${d.limit} generări.`;

  /* ---------- Secțiunea „Vizualizări” de pe fișa clientului ---------- */
  async function box(el, requestId, clientName) {
    refresh = () => box(el, requestId, clientName);
    el.innerHTML = '<p class="muted">Se încarcă…</p>';
    try {
      const d = await L.api('/api/admin/docs/viz-list?request_id=' + encodeURIComponent(requestId));
      if (!el.isConnected) return;
      remember(d.items);
      el.innerHTML = (d.items.length ? itemsHtml(d.items) : '<p class="muted">Nicio vizualizare încă.</p>') +
        (d.enabled ? '<button class="btn btn-sm btn-ghost" type="button" data-viz-new>+ Vizualizare nouă</button>'
          : '<p class="status-note">Generarea nu e configurată.</p>');
      el.onclick = e => {
        const t = e.target.closest('[data-viz]');
        if (t) return openView(t.dataset.viz);
        if (e.target.closest('[data-viz-new]')) openNew(requestId, clientName, d);
      };
    } catch (err) {
      L.onError(err, () => { el.innerHTML = '<p class="status-note err">Nu am putut încărca vizualizările.</p>'; });
    }
  }

  /* ---------- Lista generală (fără client) ---------- */
  async function route(p) {
    const my = ++seq, mine = p.get('mine') === '1';
    const root = $('vizList');
    L.show('viz');
    refresh = () => route(new URLSearchParams(location.search));
    root.innerHTML = '<p class="admin-msg">Se încarcă…</p>';
    try {
      const d = await L.api('/api/admin/docs/viz-list?general=1' + (mine ? '&mine=1' : ''));
      if (my !== seq) return;
      remember(d.items);
      root.innerHTML = `
        <div class="admin-head">
          <h1 class="admin-title">Vizualizări</h1>
          <div class="admin-tools">${d.enabled ? '<button class="btn btn-sm" type="button" data-viz-new>+ Vizualizare nouă</button>' : ''}</div>
        </div>
        <p class="muted">Schițele echipei făcute fără client, cele mai noi primele. Cele de pe fișele clienților sunt pe fiecare fișă.
          ${d.enabled ? L.esc(usageText(d)) : 'Generarea nu e configurată.'}</p>
        <nav class="status-filter viz-filter" aria-label="Filtru">
          <a class="filter${mine ? '' : ' is-on'}" href="/admin?viz=list">Toate</a>
          <a class="filter${mine ? ' is-on' : ''}" href="/admin?viz=list&mine=1">Doar ale mele</a>
        </nav>
        ${d.items.length ? itemsHtml(d.items) : `<p class="admin-msg">${mine ? 'Nu ai încă nicio vizualizare fără client.' : 'Nicio vizualizare încă.'}</p>`}`;
      root.onclick = e => {
        const t = e.target.closest('[data-viz]');
        if (t) return openView(t.dataset.viz);
        if (e.target.closest('[data-viz-new]')) return openNew(null, '', d);
        L.internal(e, e.target.closest('a.filter'));
      };
    } catch (err) {
      if (my !== seq) return;
      L.onError(err, () => {
        root.innerHTML = '<p class="admin-msg">Nu am putut încărca vizualizările. <button class="btn btn-sm btn-ghost" type="button" id="vizRetryList">Reîncearcă</button></p>';
        $('vizRetryList').onclick = () => route(p);
      });
    }
  }

  /* ---------- Dialogul „Vizualizare nouă” ---------- */
  const st = { requestId: null, photos: [], token: null, uploaded: false, busy: false, done: false };

  // Poza se micșorează în browser: latura mare ≤ 2048 px, JPEG ~0,85
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
    const k = Math.min(1, SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) throw new Error('canvas');
    return blob;
  }

  const msg = (text, detail = '') => { $('vizDlgMsg').textContent = text; $('vizDlgDetail').textContent = detail; };

  function renderThumbs() {
    $('vizDlgThumbs').innerHTML = st.photos.map((p, i) => `<li>
      <img src="${p.url}" alt="Poza ${i + 1}">
      <span class="doc-thumb-actions"><button class="link-btn danger" type="button" data-del="${i}">Șterge</button></span>
    </li>`).join('');
    const full = st.photos.length >= MAX;
    $('vizFileLabel').hidden = full;
    $('vizCamLabel').hidden = full || !L.inTg;
  }

  // Pozele s-au schimbat: rezervarea veche (cu pozele vechi) se anulează pe server
  function dropReservation() {
    if (st.token && !st.done) L.api('/api/admin/docs/viz-cancel', { method: 'POST', body: JSON.stringify({ token: st.token }) }).catch(() => {});
    st.token = null; st.uploaded = false;
  }

  function step(name) {
    $('vizDlgForm').hidden = name !== 'form';
    $('vizDlgResult').hidden = name !== 'result';
  }

  function resetDlg() {
    st.photos.forEach(p => URL.revokeObjectURL(p.url));
    Object.assign(st, { photos: [], token: null, uploaded: false, busy: false, done: false });
    $('vizWishes').value = '';
    $('vizDlgImg').removeAttribute('src');
    $('vizRetryBox').hidden = true;
    msg('');
    renderThumbs();
    setBusy(false);
    step('form');
  }

  function openNew(requestId, clientName, d) {
    resetDlg();
    st.requestId = requestId;
    if (d && Number(d.max_side) >= 256) SIDE = Number(d.max_side);
    $('vizDlgFor').textContent = requestId ? `Pentru clientul: ${clientName}` : 'Fără client: apare în lista generală „Vizualizări”.';
    $('vizUsage').textContent = d ? usageText(d) : '';
    $('vizDlg').showModal();
    L.syncBack();
  }

  function setBusy(on) {
    st.busy = on;
    $('vizGo').disabled = on;
    $('vizRetry').disabled = on;
    $('vizGo').textContent = on ? 'Se generează… ~30 de secunde' : 'Generează';
    $('vizRetry').textContent = on ? 'Se generează…' : 'Încearcă din nou';
  }

  async function onPicked(e) {
    const picked = [...e.target.files];
    e.target.value = '';
    if (st.busy || !picked.length) return;
    msg('');
    if (st.photos.length + picked.length > MAX) return msg(`Cel mult ${MAX} poze.`);
    // Orice poză pe care browserul o poate citi (și HEIC pe iPhone): pleacă oricum ca JPEG micșorat
    if (picked.some(f => (f.type && !f.type.startsWith('image/')) || f.size > MAX_SIZE)) return msg('Alege poze (JPG, PNG sau WEBP), de cel mult 10 MB fiecare.');
    msg('Se pregătesc pozele…');
    try {
      for (const f of picked) {
        const blob = await shrink(f);
        st.photos.push({ blob, url: URL.createObjectURL(blob) });
      }
      msg('');
    } catch (err) {
      msg('Formatul pozei nu e acceptat. Alege o poză JPG sau PNG.');
    }
    dropReservation();
    renderThumbs();
  }

  // Rezervarea (5 pe zi de om) și încărcarea directă în Storage, o singură dată pentru aceleași poze
  async function upload() {
    if (!st.token) {
      const meta = st.photos.map((p, i) => ({ page: i + 1, mime: 'image/jpeg', size: p.blob.size }));
      const r = await L.api('/api/admin/docs/viz-upload', {
        method: 'POST', body: JSON.stringify({ files: meta, request_id: st.requestId || undefined, kind: $('vizKind').value }),
      });
      st.token = r.token;
      st.uploads = r.uploads;
      st.uploaded = false;
    }
    if (st.uploaded) return;
    await Promise.all(st.uploads.map(async u => {
      const p = st.photos[u.page - 1];
      const r = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: p.blob });
      if (!r.ok) throw Object.assign(new Error('storage'), { status: 'storage' });
    }));
    st.uploaded = true;
  }

  async function generate() {
    if (st.busy) return; // dublu clic: o singură generare
    if (!st.photos.length) return msg('Adaugă cel puțin o poză.');
    setBusy(true);
    msg('');
    $('vizRetryBox').hidden = true;
    try {
      await upload();
      const r = await L.api('/api/admin/docs/viz-generate', {
        method: 'POST',
        body: JSON.stringify({ token: st.token, kind: $('vizKind').value, wishes: $('vizWishes').value }),
        signal: AbortSignal.timeout(75000),
      });
      st.done = true;
      $('vizDlgImg').src = r.url;
      $('vizDlgDownload').href = downloadUrl(r.url);
      step('result');
      refresh();
    } catch (err) {
      L.onError(err, e2 => {
        if (e2.name === 'TimeoutError' || e2.name === 'AbortError') e2 = Object.assign(new Error('timeout'), { status: 504 });
        const code = e2.message;
        if (['rejected', 'expired', 'files'].includes(code)) { st.token = null; st.uploaded = false; }
        if (code === 'nofiles') st.uploaded = false;
        msg(errText(e2), e2.data && e2.data.detail ? `Detaliu tehnic: ${e2.data.detail}` : '');
        // Eșecul nu se numără: aceeași rezervare se poate încerca din nou
        $('vizRetryBox').hidden = !['timeout', 'service', 'nofiles', 'storage', 'busy'].includes(code);
      });
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Dialogul unei generări ---------- */
  async function openView(id) {
    const g = shown.get(id);
    if (!g) return;
    const dlg = $('vizViewDlg');
    $('vizViewTitle').textContent = KINDS[g.kind] || 'Vizualizare';
    $('vizViewMeta').textContent = `${fmt(g.created_at)} · ${author(g)}`;
    $('vizViewWishes').textContent = g.wishes ? `Dorințe: ${g.wishes}` : '';
    $('vizViewInputs').innerHTML = g.inputs ? `<span class="admin-label">Pozele de intrare</span> ${Array.from({ length: g.inputs }, (_, i) =>
      `<button class="link-btn" type="button" data-input="${i + 1}">Poza ${i + 1}</button>`).join(' ')}` : '';
    $('vizViewDelete').hidden = !g.can_delete;
    $('vizViewDelete').disabled = false;
    $('vizViewMsg').textContent = '';
    $('vizViewImg').removeAttribute('src');
    $('vizViewDownload').removeAttribute('href');
    dlg.dataset.id = id;
    dlg.showModal();
    L.syncBack();
    try {
      // Linkul din listă poate fi vechi (5 minute): se cere unul nou la deschidere
      const { url } = await L.api(`/api/admin/docs/viz-open?id=${encodeURIComponent(id)}&what=output`);
      if (dlg.dataset.id !== id) return;
      $('vizViewImg').src = url;
      $('vizViewDownload').href = downloadUrl(url);
    } catch (err) {
      L.onError(err, () => { $('vizViewMsg').textContent = 'Nu am putut deschide schița. Încearcă din nou.'; });
    }
  }

  // Poza de intrare într-o fereastră nouă (deschisă imediat, altfel browserul o blochează)
  async function openInput(id, n) {
    const w = window.open('', '_blank');
    try {
      const { url } = await L.api(`/api/admin/docs/viz-open?id=${encodeURIComponent(id)}&what=input-${n}`);
      if (w) { w.opener = null; w.location = url; } else location.href = url;
    } catch (err) {
      if (w) w.close();
      L.onError(err, () => alert('Nu am putut deschide poza. Încearcă din nou.'));
    }
  }

  async function removeShown() {
    const dlg = $('vizViewDlg'), id = dlg.dataset.id, btn = $('vizViewDelete');
    if (!confirm('Ștergi această vizualizare, cu schița și pozele ei? Nu se poate anula.')) return;
    btn.disabled = true;
    try {
      await L.api('/api/admin/docs/viz-delete', { method: 'POST', body: JSON.stringify({ id }) });
      shown.delete(id);
      dlg.close();
      refresh();
    } catch (err) {
      btn.disabled = false;
      L.onError(err, e2 => {
        $('vizViewMsg').textContent = e2.status === 403 ? 'Poți șterge doar vizualizările făcute de tine.' : 'Nu s-a șters. Încearcă din nou.';
      });
    }
  }

  function init(helpers) {
    L = helpers;
    $('vizKind').innerHTML = Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${L.esc(l)}</option>`).join('');
    if (L.inTg) $('vizFileText').textContent = 'Alege din galerie';
    $('vizFileIn').addEventListener('change', onPicked);
    $('vizCam').addEventListener('change', onPicked);
    $('vizDlgThumbs').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b || st.busy) return;
      URL.revokeObjectURL(st.photos.splice(Number(b.dataset.del), 1)[0].url);
      dropReservation();
      renderThumbs();
    });
    $('vizDlgForm').addEventListener('submit', e => { e.preventDefault(); generate(); });
    $('vizRetry').addEventListener('click', generate);
    $('vizDlgAnother').addEventListener('click', () => { resetDlg(); });
    ['vizDlgClose', 'vizDlgCancel', 'vizDlgDone'].forEach(id => $(id).addEventListener('click', () => $('vizDlg').close()));
    // Închiderea fără generare: rezervarea se anulează, ca să nu ocupe una din cele 5 generări ale zilei
    $('vizDlg').addEventListener('close', () => { if (!st.busy) dropReservation(); L.syncBack(); });
    $('vizDlg').addEventListener('cancel', e => { if (st.busy) e.preventDefault(); });
    $('vizViewClose').addEventListener('click', () => $('vizViewDlg').close());
    $('vizViewDlg').addEventListener('close', () => { $('vizViewDlg').dataset.id = ''; L.syncBack(); });
    $('vizViewDelete').addEventListener('click', removeShown);
    $('vizViewInputs').addEventListener('click', e => {
      const b = e.target.closest('[data-input]');
      if (b) openInput($('vizViewDlg').dataset.id, b.dataset.input);
    });
  }

  return { init, route, box, label: LABEL };
})();
