(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Traduceri (RO e citit din HTML, EN e definit aici) ---------- */
  const EN = {
    'nav.how': 'How we work', 'nav.services': 'Services', 'nav.projects': 'Projects', 'nav.faq': 'FAQ', 'nav.contact': 'Contact',
    'cta.offer': 'Request a quote', 'cta.projects': 'See projects',
    'hero.eyebrow': 'Architecture & structural engineering · Cluj-Napoca',
    'hero.l1': 'Warm spaces,', 'hero.l2': '<em>structures</em> that', 'hero.l3': 'endure.',
    'hero.lead': 'We design homes, residential developments and buildings for businesses. Architecture and structural engineering under one roof — one point of contact, from the first sketch to final handover.',
    'hero.seal': 'ARCHITECTURE · STRUCTURE · PERMITTING · ',
    'hero.badge1': '2 disciplines', 'hero.badge2': '1 single team',
    'story.eyebrow': 'How we work', 'story.title': 'From foundation <em>to home.</em>',
    'story.s1t': 'Foundation', 'story.s1p': 'We read the site: geotechnical survey, zoning rules, orientation. Every good project starts on solid ground.',
    'story.s2t': 'Structure', 'story.s2p': 'Our engineers size the columns, beams and slabs from the concept stage — not after the drawings are done.',
    'story.s3t': 'Architecture', 'story.s3p': 'Volumes, light and materials grow together with the structure. That is why nothing needs redoing halfway.',
    'story.s4t': 'Home', 'story.s4p': 'A complete, coherent, permitted design — ready to build, with us on site until handover.',
    'svc.eyebrow': 'Services', 'svc.title': 'Two disciplines. <em>One roof.</em>',
    'svc.lead': 'When the architect and the structural engineer sit at the same table, the project comes out more coherent, faster and with no surprises on site.',
    'svc.arch': 'Architecture', 'svc.struct': 'Structure', 'svc.core': 'one single<br>contact',
    'svc.a.t': 'Architectural design', 'svc.a.p': 'We create beautiful, livable spaces, tailored to the site, the budget and the way you want to live or work.',
    'svc.a.1': 'Feasibility studies & concept', 'svc.a.2': 'Building permit documentation', 'svc.a.3': 'Technical design & construction details',
    'svc.a.4': 'Interior design & 3D renderings', 'svc.a.5': 'On-site technical assistance',
    'svc.b.t': 'Structural design', 'svc.b.p': 'Safe, efficient and economical structures — carefully calculated, for buildings that stand the test of time and earthquakes.',
    'svc.b.1': 'Reinforced concrete, steel and timber structures', 'svc.b.2': 'Seismic design to current codes', 'svc.b.3': 'Technical assessments of existing buildings',
    'svc.b.4': 'Strengthening, refurbishment & extra storeys', 'svc.b.5': 'Construction cost optimisation',
    'stats.1': 'years of experience', 'stats.2': 'projects delivered', 'stats.3': 'sqm designed', 'stats.4': 'architects & engineers on the team',
    'proj.eyebrow': 'Portfolio', 'proj.title': 'Selected <em>projects</em>',
    'proj.f.all': 'All', 'proj.f.rez': 'Residential', 'proj.f.dev': 'Developments', 'proj.f.com': 'Commercial',
    'tag.both': 'Architecture + Structure', 'tag.arch': 'Architecture', 'tag.struct': 'Structure',
    'p1.t': 'House among the orchards', 'p1.m': 'Feleacu · 2024 · 240 sqm',
    'p2.t': 'Valea Ierii Cabin', 'p2.m': 'Valea Ierii · 2025 · 120 sqm',
    'p3.t': 'Teilor Residences', 'p3.m': 'Cluj-Napoca · 2024 · 48 apartments',
    'p4.t': 'Hillside Villa', 'p4.m': 'Florești · 2023 · 380 sqm',
    'p5.t': 'Nordwood Headquarters', 'p5.m': 'Cluj-Napoca · 2022 · 1,900 sqm',
    'p6.t': 'Jucu Logistics Hall', 'p6.m': 'Jucu · 2023 · 4,200 sqm',
    'proc.eyebrow': 'Process', 'proc.title': 'Five steps, <em>no surprises.</em>',
    'proc.1t': 'First meeting', 'proc.1p': 'Tell us what you want. We review the site, the paperwork and the budget — free of charge.',
    'proc.2t': 'Concept', 'proc.2p': 'Sketches, volumes and first renderings, structurally checked from day one.',
    'proc.3t': 'Permitting', 'proc.3p': 'We prepare the permit documentation and guide you through approvals and the building permit.',
    'proc.4t': 'Technical design', 'proc.4p': 'Complete construction drawings — architecture and structure, perfectly coordinated.',
    'proc.5t': 'On site', 'proc.5p': 'Technical assistance and inspections at key stages, until final handover.',
    'q.eyebrow': 'Clients', 'q.title': 'What <em>people</em> say',
    'q.1': '“We had a single point of contact for the whole project. No passing the buck between architect and engineer.”', 'q.1c': 'Family house, Feleacu',
    'q.2': '“The structure was optimised from the concept stage. We saved a lot on construction, with no compromises.”', 'q.2c': 'Developer, Teilor Residences',
    'q.3': '“Deadlines met, clear communication and an office building our team genuinely enjoys.”', 'q.3c': 'Director, Nordwood',
    'faq.eyebrow': 'FAQ', 'faq.title': 'Good to <em>know</em>', 'faq.lead': 'Can’t find the answer? Call or write to us — we reply the same working day.',
    'faq.1q': 'How much does a project cost?', 'faq.1a': 'It depends on the area, complexity and the stages you need. After a first conversation we send a clear quote, broken down by stage, with no hidden costs.',
    'faq.2q': 'How long until I get the building permit?', 'faq.2a': 'For a house, the permit documentation is usually ready 4–8 weeks after the concept is approved. Approval times then depend on the city hall.',
    'faq.3q': 'Why is it better to have architecture and structure done by the same team?', 'faq.3a': 'Because the structure is designed together with the space. You avoid redesigns, delays and extra costs that appear when two separate designers don’t coordinate.',
    'faq.4q': 'Do you do only the structural design if I already have an architect?', 'faq.4a': 'Yes. We often work with other architects and studios, providing structural design and technical assessments.',
    'faq.5q': 'Do you work outside Cluj?', 'faq.5a': 'Yes, we design all over the country. We agree together on a schedule for site visits.',
    'c.eyebrow': 'Contact', 'c.title': 'Let’s build <em>something good</em> together.', 'c.lead': 'Tell us briefly about your project. We’ll send a quote within 48 hours.',
    'c.phone': 'Phone', 'c.wa': 'Message us on WhatsApp', 'c.addr': 'Office',
    'f.name': 'Name', 'f.phone': 'Phone', 'f.type': 'Project type', 'f.service': 'Services needed', 'f.msg': 'About the project',
    'f.msgph': 'Location, approximate area, what you have in mind…',
    'f.t1': 'Family house', 'f.t2': 'Residential development', 'f.t3': 'Office / commercial building', 'f.t4': 'Hall / industrial', 'f.t5': 'Assessment / strengthening', 'f.t6': 'Something else',
    'f.s1': 'Architecture + Structure', 'f.s2': 'Architecture only', 'f.s3': 'Structure only', 'f.s4': 'Not sure yet',
    'f.consent': 'I agree to the processing of my data in order to be contacted.', 'f.send': 'Send request',
    'foot.tag': 'Architecture & Structure',
  };
  const MSG = {
    ro: { ok: 'Mulțumim! Am primit cererea și revenim în curând.', err: 'Completează câmpurile marcate, te rog.' },
    en: { ok: 'Thank you! We received your request and will be in touch soon.', err: 'Please fill in the highlighted fields.' },
  };
  const MARQUEE = {
    ro: ['Case unifamiliale', 'Ansambluri rezidențiale', 'Clădiri de birouri', 'Hale industriale', 'Expertize tehnice', 'Consolidări', 'Design interior'],
    en: ['Family homes', 'Residential developments', 'Office buildings', 'Industrial halls', 'Technical assessments', 'Strengthening', 'Interior design'],
  };

  const RO = {}, RO_PH = {};
  $$('[data-i18n]').forEach(el => { RO[el.dataset.i18n] = el.innerHTML; });
  $$('[data-i18n-ph]').forEach(el => { RO_PH[el.dataset.i18nPh] = el.placeholder; });
  const ROTITLE = document.title;
  let lang = 'ro';

  function buildMarquee() {
    const words = MARQUEE[lang];
    const chunk = words.map(w => `<span>${w}</span><span class="dot">✦</span>`).join('');
    $('#marquee').innerHTML = chunk + chunk;
  }

  function setLang(l) {
    lang = l;
    document.documentElement.lang = l;
    const dict = l === 'en' ? EN : RO;
    $$('[data-i18n]').forEach(el => { const v = dict[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = l === 'en' ? EN[el.dataset.i18nPh] : RO_PH[el.dataset.i18nPh]; });
    $$('#langToggle [data-lang]').forEach(s => s.classList.toggle('is-on', s.dataset.lang === l));
    document.title = l === 'en' ? 'Atelier Temelia — Architecture & Structure' : ROTITLE;
    buildMarquee();
    try { localStorage.setItem('temelia-lang', l); } catch (e) { /* stocare indisponibilă */ }
  }
  $('#langToggle').addEventListener('click', () => setLang(lang === 'ro' ? 'en' : 'ro'));
  let saved = null;
  try { saved = localStorage.getItem('temelia-lang'); } catch (e) { /* stocare indisponibilă */ }
  setLang(saved === 'en' ? 'en' : 'ro');

  /* ---------- Meniu mobil ---------- */
  $('#burger').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

  /* ---------- Apariții la scroll ---------- */
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, .venn, .process-list').forEach(el => io.observe(el));

  /* ---------- Contoare ---------- */
  const fmt = n => n.toLocaleString(lang === 'en' ? 'en-US' : 'ro-RO');
  const countIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, suf = el.dataset.suffix || '';
    if (reduce) { el.textContent = fmt(end) + suf; return; }
    const t0 = performance.now(), dur = 1800;
    const tick = now => {
      const t = clamp((now - t0) / dur);
      el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - t, 4)))) + suf;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: .6 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- Desenul din secțiunea „Cum lucrăm” ---------- */
  const story = $('#poveste');
  const groups = {};
  $$('[data-stage]', story).forEach(el => { (groups[el.dataset.stage] ||= []).push(el); });
  const RANGES = { 1: [.02, .24], 2: [.26, .5], 3: [.52, .74], 4: [.76, .96] };
  const steps = $$('.story-step', story);
  const bar = $('#storyBar');

  function renderStory() {
    const r = story.getBoundingClientRect();
    const total = story.offsetHeight - innerHeight;
    const p = reduce ? 1 : clamp(-r.top / total);
    for (const s in groups) {
      const [a, b] = RANGES[s];
      const t = clamp((p - a) / (b - a));
      const g = groups[s], n = g.length;
      g.forEach((el, i) => {
        // elementele dintr-o etapă se desenează pe rând, ușor suprapus
        const start = n > 1 ? (i / n) * .55 : 0;
        const lt = clamp((t - start) / (n > 1 ? .45 : 1));
        if (el.classList.contains('fill')) el.style.opacity = lt;
        else el.style.strokeDashoffset = 1 - lt;
      });
    }
    const active = p < RANGES[2][0] ? 0 : p < RANGES[3][0] ? 1 : p < RANGES[4][0] ? 2 : 3;
    steps.forEach((s, i) => s.classList.toggle('is-active', i === active));
    bar.style.transform = `scaleX(${p})`;
  }

  /* ---------- Nav + scroll ---------- */
  const nav = $('#nav');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.classList.toggle('scrolled', scrollY > 40);
      renderStory();
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Ilustrații provizorii pentru proiecte ---------- */
  const sky = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#${id})"/>`;
  const grid = (x0, y0, cols, rows, w, h, gx, gy, fill) => {
    let s = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += `<rect x="${x0 + c * gx}" y="${y0 + r * gy}" width="${w}" height="${h}" fill="${fill}"/>`;
    return s;
  };
  const ART = {
    house: id => sky(id, '#F0DCC3', '#DDB28C') +
      `<circle cx="300" cy="86" r="30" fill="#F8E6CD"/><path d="M0 232 Q200 204 400 226 V300 H0Z" fill="#8F8E66"/>
       <polygon points="120,232 120,152 185,106 250,152 250,232" fill="#EFE5D6"/>
       <polyline points="108,160 185,100 262,160" fill="none" stroke="#2B2520" stroke-width="4" stroke-linejoin="round"/>
       <rect x="250" y="176" width="84" height="56" fill="#A8754B"/><rect x="246" y="172" width="92" height="5" fill="#2B2520"/>
       <rect x="138" y="176" width="36" height="36" fill="#2E2722"/><rect x="198" y="190" width="24" height="42" fill="#8E4A2A"/>
       <rect x="264" y="192" width="56" height="26" fill="#F4C27F"/><circle cx="185" cy="140" r="8" fill="#2E2722"/>
       <circle cx="62" cy="206" r="26" fill="#5F6347"/><rect x="60" y="222" width="4" height="14" fill="#3A3128"/>`,
    cabin: id => sky(id, '#C9A98E', '#E8C7A0') +
      `<circle cx="96" cy="76" r="22" fill="#F6E3C8" opacity=".9"/>
       <path d="M0 250 L60 170 L120 250Z M300 250 L350 160 L400 250Z" fill="#5F6347"/><path d="M30 250 L80 186 L130 250Z M330 250 L372 190 L400 230 V250Z" fill="#4E5239"/>
       <rect x="0" y="246" width="400" height="54" fill="#6C6A4C"/>
       <polygon points="140,250 210,108 280,250" fill="#A8754B"/><polygon points="168,250 210,166 252,250" fill="#F4C27F"/>
       <path d="M210 166 V250 M189 208 H231" stroke="#2B2520" stroke-width="3"/><polyline points="132,256 210,98 288,256" fill="none" stroke="#2B2520" stroke-width="5" stroke-linejoin="round"/>`,
    block: id => sky(id, '#E9DCCB', '#D7C1A6') +
      `<rect x="0" y="252" width="400" height="48" fill="#B9A487"/>
       <rect x="60" y="84" width="120" height="168" fill="#EFE6D8"/>${grid(74, 98, 4, 7, 16, 14, 26, 21, '#4A3F36')}
       <rect x="196" y="128" width="140" height="124" fill="#C98F67"/>${grid(210, 142, 5, 5, 14, 12, 25, 21, '#F4D3A6')}
       <rect x="56" y="80" width="128" height="6" fill="#2B2520"/><rect x="192" y="124" width="148" height="6" fill="#2B2520"/>
       <circle cx="360" cy="230" r="22" fill="#5F6347"/><circle cx="40" cy="232" r="20" fill="#5F6347"/>`,
    villa: id => sky(id, '#EADFCF', '#CDB79C') +
      `<path d="M0 220 Q140 180 400 200 V300 H0Z" fill="#9C9670"/>
       <rect x="60" y="168" width="270" height="62" fill="#F2EBE0"/><rect x="130" y="118" width="190" height="50" fill="#E3D6C2"/>
       <rect x="50" y="163" width="290" height="7" fill="#2B2520"/><rect x="120" y="112" width="210" height="7" fill="#2B2520"/>
       <rect x="80" y="184" width="130" height="40" fill="#3B332C"/><rect x="150" y="130" width="110" height="30" fill="#F4C27F"/>
       <rect x="230" y="184" width="80" height="40" fill="#A8754B"/><rect x="30" y="246" width="230" height="14" fill="#8FB0AA"/>
       <circle cx="356" cy="196" r="26" fill="#5F6347"/>`,
    office: id => sky(id, '#E6D3BD', '#C9A584') +
      `<rect x="0" y="256" width="400" height="44" fill="#A99377"/>
       <rect x="120" y="44" width="170" height="212" fill="#D8CAB5"/>${grid(130, 54, 1, 1, 150, 192, 0, 0, '#3E3630')}
       ${Array.from({ length: 11 }, (_, i) => `<rect x="${132 + i * 14}" y="54" width="5" height="192" fill="#B5643C"/>`).join('')}
       <rect x="112" y="38" width="186" height="8" fill="#2B2520"/><rect x="290" y="170" width="70" height="86" fill="#EFE5D6"/>
       <rect x="300" y="186" width="50" height="22" fill="#F4C27F"/><circle cx="70" cy="230" r="30" fill="#5F6347"/>`,
    hall: id => sky(id, '#EEE2D2', '#D9C3A6') +
      `<rect x="0" y="238" width="400" height="62" fill="#B6A285"/>
       <path d="M40 238 V150 L100 126 V150 L160 126 V150 L220 126 V150 L280 126 V150 L340 126 V150 L360 150 V238Z" fill="#CDBFA9"/>
       <path d="M40 150 L100 126 V150 L160 126 V150 L220 126 V150 L280 126 V150 L340 126 V150" fill="none" stroke="#2B2520" stroke-width="3"/>
       <rect x="70" y="186" width="44" height="52" fill="#5E534A"/><rect x="134" y="186" width="44" height="52" fill="#5E534A"/><rect x="198" y="186" width="44" height="52" fill="#5E534A"/>
       <rect x="270" y="168" width="70" height="20" fill="#F4C27F"/><rect x="40" y="160" width="320" height="4" fill="#B5643C"/>`,
  };
  $$('.project').forEach((p, i) => {
    const fn = ART[p.dataset.art];
    if (fn) $('.project-media', p).innerHTML = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fn('pg' + i)}</svg>`;
  });

  /* ---------- Filtre proiecte ---------- */
  const gridEl = $('#projectGrid');
  $$('.filter').forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    $$('.filter').forEach(b => b.classList.toggle('is-on', b === btn));
    gridEl.classList.toggle('filtered', f !== 'all');
    $$('.project', gridEl).forEach(p => {
      p.classList.toggle('is-hidden', f !== 'all' && p.dataset.cat !== f);
      p.classList.add('in');
    });
  }));

  /* ---------- Formular (demo: nu trimite nicăieri încă) ---------- */
  const form = $('#contactForm');
  const msg = $('#formMsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    $$('[required]', form).forEach(inp => {
      const bad = !inp.checkValidity();
      (inp.closest('.field') || inp.closest('.consent')).classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    msg.textContent = ok ? MSG[lang].ok : MSG[lang].err;
    if (ok) form.reset();
  });

  $('#year').textContent = new Date().getFullYear();
})();
