(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const I = window.LX_I18N || { ru: {}, en: {}, extra: {} };

  // Animațiile pornesc doar dacă GSAP s-a încărcat; altfel pagina rămâne statică și completă
  const anim = !!(window.gsap && window.ScrollTrigger) && root.classList.contains('js-anim');
  if (!anim) root.classList.remove('js-anim', 'intro');
  if (anim) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Limbi: RO e citit din HTML, RU/EN vin din i18n.js ---------- */
  const LANGS = ['ro', 'ru', 'en'];
  const RO = {}, RO_PH = {}, RO_ALT = {}, RO_ARIA = {};
  $$('[data-i18n]').forEach(el => { RO[el.dataset.i18n] = el.innerHTML; });
  $$('[data-i18n-ph]').forEach(el => { RO_PH[el.dataset.i18nPh] = el.placeholder; });
  $$('[data-i18n-alt]').forEach(el => { RO_ALT[el.dataset.i18nAlt] = el.alt; });
  $$('[data-i18n-aria]').forEach(el => { RO_ARIA[el.dataset.i18nAria] = el.getAttribute('aria-label'); });
  let lang = 'ro';
  const dict = () => (lang === 'ro' ? RO : I[lang] || {});
  const t = k => dict()[k] ?? RO[k] ?? '';
  const X = () => (I.extra && (I.extra[lang] || I.extra.ro)) || {};
  const langHooks = [];

  function buildMarquee() {
    const words = X().marquee || [];
    const chunk = words.map(w => `<span>${w}</span><span class="dot" aria-hidden="true">✦</span>`).join('');
    $('#marquee').innerHTML = chunk + chunk;
  }

  function setLang(l) {
    lang = LANGS.includes(l) ? l : 'ro';
    root.lang = lang;
    const d = dict();
    $$('[data-i18n]').forEach(el => { const v = d[el.dataset.i18n] ?? RO[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = d[el.dataset.i18nPh] ?? RO_PH[el.dataset.i18nPh]; });
    $$('[data-i18n-alt]').forEach(el => { el.alt = (lang === 'ro' ? RO_ALT : d)[el.dataset.i18nAlt] ?? RO_ALT[el.dataset.i18nAlt]; });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', d[el.dataset.i18nAria] ?? RO_ARIA[el.dataset.i18nAria]); });
    $$('#lang [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.title = X().title || document.title;
    const desc = $('meta[name="description"]');
    if (desc && X().desc) desc.content = X().desc;
    $('#cursorLabel').textContent = X().cursor || '';
    buildMarquee();
    langHooks.forEach(fn => fn());
    try { localStorage.setItem('temelia-lang', lang); } catch (e) { /* stocare indisponibilă */ }
  }

  // Prima vizită: limba browserului (ru → RU, ro/mo → RO, altfel EN)
  function detectLang() {
    let saved = null;
    try { saved = localStorage.getItem('temelia-lang'); } catch (e) { /* stocare indisponibilă */ }
    if (LANGS.includes(saved)) return saved;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('ro') || nav.startsWith('mo')) return 'ro';
    return 'en';
  }
  $$('#lang [data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  setLang(detectLang());

  /* ---------- Meniu mobil ---------- */
  const burger = $('#burger');
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); burger.focus(); } });

  /* ---------- Nav: fundal după scroll, se ascunde la derulare în jos ---------- */
  const nav = $('#nav');
  let lastY = scrollY, ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('scrolled', y > 40);
      nav.classList.toggle('away', y > 300 && y > lastY && !document.body.classList.contains('menu-open'));
      lastY = y;
      ticking = false;
    });
  }, { passive: true });

  /* ---------- Poze care nu se încarcă: rămâne un bloc de culoare ---------- */
  $$('.project-media img, .hero-media img').forEach(img => {
    const fail = () => img.parentElement.classList.add('broken');
    if (img.complete && !img.naturalWidth) fail(); else img.addEventListener('error', fail);
  });

  /* ---------- Filtre proiecte ---------- */
  const track = $('#track');
  $$('#filters .filter').forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    $$('#filters .filter').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    $$('.project', track).forEach(p => p.classList.toggle('is-hidden', f !== 'all' && p.dataset.cat !== f));
    if (anim) {
      ScrollTrigger.refresh();
      gsap.fromTo($$('.project:not(.is-hidden)', track), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .7, stagger: .06, ease: 'power3.out', clearProps: 'transform' });
    }
  }));

  /* ---------- Galerie pe tot ecranul ---------- */
  // [lățime, înălțime] pentru fiecare poză din img/projects/<slug>/<n>-{800,1400,2000}.webp
  const GALLERY = {
    'vila-apa': [[2048, 1377], [2048, 1377], [2048, 1377], [2048, 1377]],
    'casa-copac': [[1500, 1100], [1500, 1100], [1500, 1100], [1500, 1100]],
    'hotel-panta': [[1875, 2500], [2560, 1536], [2500, 1749], [1875, 2500]],
    'vitraje': [[1250, 875], [1750, 2500], [1250, 750], [850, 1250]],
    'casa-piatra': [[1500, 900], [1500, 1012], [1500, 1024], [1500, 1196]],
    'nistru': [[1500, 1125], [1500, 750], [1250, 962], [1500, 900]],
    'sase-corpuri': [[1920, 1526], [1920, 1528], [2560, 2035], [2560, 2035]],
    'sportiv': [[1276, 851], [1440, 960], [1404, 936], [1328, 886]],
    'data-center': [[1920, 1080], [1920, 1080], [1920, 1440]],
    'crama': [[1088, 1143], [2429, 1249], [1039, 1151]],
  };
  // Ordinea în galerie: pentru hotel-panta și crama, poza de copertă e a 2-a de pe disc
  const ORDER = { 'hotel-panta': [2, 1, 3, 4], 'crama': [2, 1, 3] };
  const srcsetFor = (slug, n, w) => {
    const base = `img/projects/${slug}/${n}`;
    const parts = [`${base}-800.webp 800w`, `${base}-1400.webp ${Math.min(1400, w)}w`];
    if (w > 1400) parts.push(`${base}-2000.webp ${Math.min(2000, w)}w`);
    return parts.join(', ');
  };

  const lb = $('#lb'), lbImg = $('#lbImg'), lbStage = $('#lbStage');
  let lbSlug = null, lbIndex = 0, lbOpener = null;

  function lbShow(i) {
    const list = GALLERY[lbSlug];
    lbIndex = (i + list.length) % list.length;
    const order = ORDER[lbSlug] || list.map((_, k) => k + 1);
    const n = order[lbIndex], [w, h] = list[n - 1];
    const card = $(`.project[data-slug="${lbSlug}"]`);
    const title = $('.project-title', card).textContent;
    lbStage.classList.remove('broken');
    lbImg.onerror = () => lbStage.classList.add('broken');
    lbImg.width = w; lbImg.height = h;
    lbImg.sizes = '100vw';
    lbImg.srcset = srcsetFor(lbSlug, n, w);
    lbImg.src = `img/projects/${lbSlug}/${n}-1400.webp`;
    lbImg.alt = `${title} — ${lbIndex + 1}`;
    $('#lbTitle').textContent = title;
    $('#lbMeta').textContent = $('.project-meta', card).textContent;
    $('#lbCount').textContent = `${String(lbIndex + 1).padStart(2, '0')} ${X().lbOf || '/'} ${String(list.length).padStart(2, '0')}`;
    if (anim) gsap.fromTo(lbImg, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: .7, ease: 'power3.out' });
  }

  function lbOpen(slug, opener) {
    lbSlug = slug; lbOpener = opener;
    lb.hidden = false;
    root.classList.add('lb-open');
    lbShow(0);
    history.pushState({ lb: 1 }, '');
    if (anim) gsap.fromTo(lb, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: .8, ease: 'expo.inOut' });
    $('#lbClose').focus();
  }

  function lbHide() {
    if (lb.hidden) return;
    const done = () => {
      lb.hidden = true;
      root.classList.remove('lb-open');
      lbImg.removeAttribute('src'); lbImg.removeAttribute('srcset');
      if (lbOpener) lbOpener.focus();
    };
    if (anim) gsap.to(lb, { clipPath: 'inset(0 0 100% 0)', duration: .6, ease: 'expo.inOut', onComplete: done });
    else done();
  }
  // Închiderea trece prin istoric, ca butonul „înapoi” al telefonului să închidă galeria
  const lbClose = () => (history.state && history.state.lb ? history.back() : lbHide());
  addEventListener('popstate', lbHide);

  $$('.project-open').forEach(b => b.addEventListener('click', () => lbOpen(b.closest('.project').dataset.slug, b)));
  $('#lbClose').addEventListener('click', lbClose);
  $('#lbPrev').addEventListener('click', () => lbShow(lbIndex - 1));
  $('#lbNext').addEventListener('click', () => lbShow(lbIndex + 1));
  lbStage.addEventListener('click', e => { if (e.target === lbStage) lbClose(); });
  lb.addEventListener('keydown', e => {
    if (e.key === 'Escape') lbClose();
    else if (e.key === 'ArrowRight') lbShow(lbIndex + 1);
    else if (e.key === 'ArrowLeft') lbShow(lbIndex - 1);
    else if (e.key === 'Tab') {
      // focusul rămâne în galerie
      const f = [$('#lbClose'), $('#lbPrev'), $('#lbNext')];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let touchX = null;
  lbStage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lbStage.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) lbShow(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- Formular → /api/contact (Supabase + Telegram) ---------- */
  const form = $('#contactForm');
  const msg = $('#formMsg');
  const sendBtn = $('#formSend');
  const sendLabel = $('[data-i18n="f.send"]', sendBtn);
  const fallback = $('#formFallback');
  const startedAt = Date.now();
  let sending = false;

  const markInvalid = (el, bad) => (el.closest('.field') || el.closest('.consent')).classList.toggle('invalid', bad);
  $$('[required]', form).forEach(inp => inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
    if (inp.checkValidity()) markInvalid(inp, false);
  }));

  // Textul cererii, gata de trimis pe WhatsApp dacă serverul nu răspunde
  function whatsappText() {
    const opt = name => form.elements[name].selectedOptions[0]?.textContent.trim() || '';
    return [
      X().waHello,
      `${t('f.name')}: ${form.elements.name.value.trim()}`,
      `${t('f.phone')}: ${form.elements.phone.value.trim()}`,
      `Email: ${form.elements.email.value.trim()}`,
      `${t('f.type')}: ${opt('type')}`,
      `${t('f.service')}: ${opt('service')}`,
      `${t('f.msg')}: ${form.elements.message.value.trim()}`,
    ].join('\n');
  }

  function setSending(on) {
    sending = on;
    sendBtn.disabled = on;
    sendLabel.textContent = on ? X().sending : t('f.send');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (sending) return;
    fallback.hidden = true;
    let ok = true;
    $$('[required]', form).forEach(inp => {
      const bad = !inp.checkValidity();
      markInvalid(inp, bad);
      if (bad) ok = false;
    });
    if (!ok) { msg.textContent = X().err; return; }

    const f = form.elements;
    const payload = {
      name: f.name.value, phone: f.phone.value, email: f.email.value,
      type: f.type.value, service: f.service.value, message: f.message.value,
      consent: f.consent.checked, website: f.website.value, lang, startedAt,
    };
    msg.textContent = '';
    setSending(true);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        msg.textContent = X().ok;
        form.reset();
      } else if (r.status === 400 && Array.isArray(res.fields) && res.fields.length) {
        res.fields.forEach(n => { if (f[n]) markInvalid(f[n], true); });
        msg.textContent = X().err;
      } else {
        throw new Error(`HTTP ${r.status}`);
      }
    } catch (err) {
      $('#waPrefill').href = 'https://wa.me/37368133945?text=' + encodeURIComponent(whatsappText());
      fallback.hidden = false;
    } finally {
      setSending(false);
    }
  });

  $('#year').textContent = new Date().getFullYear();

  if (!anim) return;

  /* ==========================================================
     ANIMAȚII (doar cu GSAP și fără prefers-reduced-motion)
     ========================================================== */
  const ease = 'expo.out';

  /* ---------- Intro + Hero ---------- */
  const heroTl = gsap.timeline({ defaults: { ease } });
  if (root.classList.contains('intro')) {
    try { sessionStorage.setItem('lx-intro', '1'); } catch (e) { /* stocare indisponibilă */ }
    heroTl
      .fromTo('.loader-word span', { yPercent: 110, y: 0 }, { yPercent: 0, y: 0, duration: .7, stagger: .05 })
      .fromTo('.loader-line span', { scaleX: 0 }, { scaleX: 1, duration: .6, ease: 'power2.inOut' }, '<.1')
      .to('#loader', { yPercent: -100, duration: .7, ease: 'expo.inOut' }, '+=.05')
      .add(() => root.classList.remove('intro'));
  }
  heroTl
    .fromTo('.hero-title .line > span', { yPercent: 110, y: 0 }, { yPercent: 0, y: 0, duration: 1.3, stagger: .1 }, root.classList.contains('intro') ? '-=.35' : 0)
    .to('.hero [data-anim]', { opacity: 1, y: 0, duration: 1, stagger: .08 }, '-=1')
    .fromTo('.hero-media', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' }, '-=1.1')
    .from('.hero-media img', { scale: 1.25, duration: 2, ease }, '<')
    .from('.hero-facts li', { opacity: 0, y: 20, duration: .8, stagger: .08 }, '-=1.2');

  // Parallax pe poza mare din Hero
  gsap.to('.hero-media img', {
    yPercent: 10, ease: 'none',
    scrollTrigger: { trigger: '.hero-media', start: 'top bottom', end: 'bottom top', scrub: true },
  });

  /* ---------- Apariții la scroll ---------- */
  ScrollTrigger.batch('[data-anim]:not(.hero [data-anim])', {
    start: 'top 88%',
    once: true,
    onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: .1, ease }),
  });
  $$('.split-title').forEach(h => {
    gsap.from(h, { yPercent: 40, opacity: 0, duration: 1.3, ease, scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
  });

  /* ---------- Manifest: cuvintele se aprind pe rând la scroll ---------- */
  const manifest = $('#manifestText');
  let manifestTween = null;
  function buildManifest() {
    if (manifestTween) { manifestTween.scrollTrigger.kill(); manifestTween.kill(); }
    manifest.innerHTML = manifest.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    manifestTween = gsap.fromTo($$('.w', manifest), { opacity: .14 }, {
      opacity: 1, stagger: .1, ease: 'none',
      scrollTrigger: { trigger: manifest, start: 'top 80%', end: 'bottom 40%', scrub: true },
    });
  }
  buildManifest();
  langHooks.push(buildManifest);

  /* ---------- Proiecte: bandă orizontală fixată (desktop), cortine (telefon) ---------- */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: '#projectsPin', start: 'top top', end: () => '+=' + dist(),
        pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
      },
    });
    gsap.fromTo('.project-media', { clipPath: 'inset(0% 0% 100% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, stagger: .12, ease: 'expo.inOut',
      scrollTrigger: { trigger: '#projectsPin', start: 'top 70%', once: true },
    });
  });
  mm.add('(max-width: 1023.98px)', () => {
    $$('.project-media').forEach(m => gsap.fromTo(m, { clipPath: 'inset(0% 0% 100% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut',
      scrollTrigger: { trigger: m, start: 'top 90%', once: true },
    }));
  });

  /* ---------- Proces: linia verticală se desenează ---------- */
  gsap.fromTo('#steps', { '--line': 0 }, {
    '--line': 1, ease: 'none',
    scrollTrigger: { trigger: '#steps', start: 'top 75%', end: 'bottom 60%', scrub: true },
  });

  /* ---------- Cuvântul uriaș din subsol ---------- */
  gsap.from('.footer-word', {
    yPercent: 60, opacity: 0, duration: 1.4, ease,
    scrollTrigger: { trigger: '.footer', start: 'top 95%', once: true },
  });

  /* ---------- Cursor personalizat (doar mouse) ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const cursor = $('#cursor');
    root.classList.add('has-cursor');
    const xTo = gsap.quickTo(cursor, 'x', { duration: .5, ease: 'power3' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: .5, ease: 'power3' });
    addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); cursor.classList.add('on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
    $$('[data-cursor]').forEach(el => {
      el.addEventListener('pointerenter', () => cursor.classList.add('view'));
      el.addEventListener('pointerleave', () => cursor.classList.remove('view'));
    });
    $$('a, button:not([data-cursor]), summary, input, select, textarea, label').forEach(el => {
      el.addEventListener('pointerenter', () => cursor.classList.add('link'));
      el.addEventListener('pointerleave', () => cursor.classList.remove('link'));
    });
  }

  // Fonturile și pozele schimbă înălțimile: recalculăm pozițiile
  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
})();
