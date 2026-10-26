// ============================================================================
// src/ui/workbench.js — mounts the Inkbench card strip into #app.
// Card order (contract): Brief → Spec Blueprint → Viewport → Test Report →
// Exploded/About. The page never scrolls vertically; #app scrolls horizontally
// (vertical wheel is translated to scrollLeft) and each card scrolls inside.
// ============================================================================
import { initViewport } from './viewport.js';
import { renderMeasures, renderBuildPlan } from './buildplan.js';

/* ------------------------------ tiny dom kit ------------------------------ */
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const clock = () => new Date().toTimeString().slice(0, 8);
const num = (n) => {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  const s = (Math.abs(n) >= 100 ? n.toFixed(0)
          : Math.abs(n) >= 10  ? n.toFixed(1)
          :                      n.toFixed(2));
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s) || '0';
};
const vec = (v) => Array.isArray(v) ? '[' + v.map(num).join(', ') + ']' : '—';
const shortTitle = (s, max = 42) => {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  if (sp > 12) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:—–-]+$/, '') + '…';
};
const titleFrom = (text) => {          // brief -> 2–4 word title: "a desk lamp with…" -> "Desk lamp"
  let t = String(text || '').trim().replace(/^(a|an|the)\s+/i, '');
  if (!t) return '';
  t = t.split(/[,:;.!?–—([]/)[0];      // first clause only — tails truncate ugly
  const STOP = new Set(['a','an','the','with','for','and','of','to','in','on',
                        'at','by','from','or','that','which']);
  const w = t.split(/\s+/).filter(Boolean);
  let n = Math.min(4, w.length);
  while (n > 2 && STOP.has(w[n - 1].toLowerCase())) n--;   // never end on a connector
  if (!n) return '';
  const out = w.slice(0, n).join(' ');
  return out[0].toUpperCase() + out.slice(1);
};

function cardEl(idx, title, cls, dataKey){
  const card = h('section', 'card' + (cls ? ' ' + cls : ''));
  card.setAttribute('data-card', dataKey);
  const head = h('header', 'card-head');
  head.append(h('span', 'card-idx', idx), h('h2', 'card-title', title), h('span', 'rule'));
  const body = h('div', 'card-body');
  card.append(head, body);
  return { card, head, body };
}

function row(k, v, sub){
  const r = h('div', 'srow');
  if (k != null) r.append(h('span', 'k', k));
  if (v != null) r.append(h('span', 'v', v));
  if (sub != null) r.append(h('span', 'sub', sub));
  return r;
}

function detailsEl(title, count, open){
  const d = h('details');
  if (open) d.setAttribute('open', '');
  const s = h('summary');
  s.append(h('span', null, title));
  if (count != null) s.append(h('span', 'count' + (count ? '' : ' none'), String(count)));
  const body = h('div', 'det-body');
  d.append(s, body);
  return { d, body };
}

/* ---- generic card tabs ----------------------------------------------------
   .ctabs strip of .ctab pills pinned between the card head and card-body;
   the active pane is the body scroller's only child, so tab content scrolls
   inside the card exactly like untabbed content (page still never scrolls).
   def.render(pane) runs on every switch AND every refresh() — live repaints
   keep whichever tab the user is looking at current. */
function makeTabs(cardEls, defs){
  const strip = h('div', 'ctabs');
  strip.setAttribute('role', 'tablist');
  cardEls.card.insertBefore(strip, cardEls.body);
  const btns = {};
  let active = defs[0].id;
  const state = {};              // per-tab view state kept across rebuilds
  for (const d of defs){
    const b = h('button', 'ctab', d.label);
    b.setAttribute('type', 'button');
    b.setAttribute('role', 'tab');
    b.dataset.tab = d.id;
    b.addEventListener('click', () => select(d.id));
    strip.append(btns[d.id] = b);
  }
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    // APG: movement is relative to the FOCUSED tab, not the active one
    const from = (document.activeElement && document.activeElement.dataset
      && defs.some(d => d.id === document.activeElement.dataset.tab))
      ? document.activeElement.dataset.tab : active;
    const i = defs.findIndex(d => d.id === from);
    e.preventDefault();
    const j = (i + (e.key === 'ArrowRight' ? 1 : defs.length - 1)) % defs.length;
    select(defs[j].id); btns[defs[j].id].focus();
  });
  /* panes are rebuilt on every repaint, so capture scroll position and which
     <details> sections are open BEFORE clear — otherwise every design-loop
     emit would yank the reader back to the top of the card */
  function snapshot(){
    const st = state[active] || (state[active] = {});
    st.scrollTop = cardEls.body.scrollTop;
    st.open = new Set([...cardEls.body.querySelectorAll('details[open] > summary')]
      .map(s => { const t = s.querySelector('span'); return t ? t.textContent : null; })
      .filter(Boolean));
  }
  function restore(){
    const st = state[active];
    if (!st) return;
    if (st.open) for (const d of cardEls.body.querySelectorAll('details')){
      const t = d.querySelector('summary > span');
      if (t) d.toggleAttribute('open', st.open.has(t.textContent));
    }
    cardEls.body.scrollTop = st.scrollTop || 0;
  }
  function rebuild(){
    clear(cardEls.body);
    const def = defs.find(d => d.id === active);
    const pane = h('div', 'ctab-pane');
    pane.setAttribute('role', 'tabpanel');
    cardEls.body.append(pane);
    if (def) def.render(pane);
    restore();
  }
  function select(id){
    if (id === active || !defs.some(d => d.id === id)) return;
    snapshot();                  // outgoing tab keeps its scroll/open state
    active = id; sync(); rebuild();
  }
  function sync(){
    for (const d of defs){
      btns[d.id].classList.toggle('on', d.id === active);
      btns[d.id].setAttribute('aria-selected', d.id === active ? 'true' : 'false');
    }
  }
  function refresh(){            // repaint of the SAME tab — preserve its view
    snapshot();
    rebuild();
  }
  sync(); rebuild();
  return { select, refresh, get active(){ return active; } };
}

/* pretty-printed spec JSON with light ink-tinting (keys / strings / numbers /
   literals) — real data, escaped, then tokenised by one regex pass */
function tintJSON(obj){
  let s;
  try { s = JSON.stringify(obj, null, 2); } catch (e) { s = String(obj); }
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (m, str, colon) => {
      if (str) return '<span class="' + (colon ? 'jk' : 'js') + '">' + str + '</span>' + (colon || '');
      if (m === 'true' || m === 'false' || m === 'null') return '<span class="jb">' + m + '</span>';
      return '<span class="jn">' + m + '</span>';
    });
}

/* --------------------------------- mount ---------------------------------- */
export function mountUI(root){
  root.setAttribute('data-inkbench', '');

  /* ===================== 01 · BRIEF ===================== */
  const brief = cardEl('01', 'Brief', 'card-brief', 'brief');

  const brand = h('div', 'brand-block');
  const brandH = h('h1', 'brand');
  brandH.append(h('span', null, 'INKBENCH'), h('span', 'brand-dot', '.'));
  brand.append(
    brandH,
    h('p', 'tagline', 'agentic CAD that proves it works'),
    h('div', 'brand-rule')
  );

  const how = h('ol', 'how');
  for (const t of [
    'describe a part in plain words',
    'the agent drafts a JSON spec',
    'real geometry is built in the viewport',
    'checks stamp it PASS or FAIL',
  ]) how.append(h('li', null, t));

  const promptLabel = h('label', 'field-label', 'Your brief');
  const ta = h('textarea', 'brief-input');
  ta.setAttribute('placeholder', 'e.g. a phone stand with a cable slot, 70° tilt, 4mm plate…');
  ta.setAttribute('rows', '4');
  ta.setAttribute('spellcheck', 'false');

  /* quick-brief chips — fill the textarea only; the demo shows the agent
     doing the real work after a deliberate ctrl+enter / button press */
  const chipRow = h('div', 'chip-row');
  chipRow.append(h('span', 'chip-label', 'try'));
  const QUICK_BRIEFS = [
    ['desk lamp',       'a desk lamp with a heavy round base, an articulated arm, and a tiltable shade'],
    ['monitor stand',   'a monitor stand with a flat top plate, two side legs, and a cable slot'],
    ['gear bracket',    'an L-shaped gear bracket: a vertical mounting plate and a horizontal shelf'],
    ['espresso tamper', 'an espresso tamper: a flat circular 58mm base with a rounded handle on top'],
  ];
  for (const [label, briefText] of QUICK_BRIEFS){
    const chip = h('button', 'qchip', label);
    chip.setAttribute('type', 'button');
    chip.setAttribute('title', 'fill the brief — then draft it');
    chip.addEventListener('click', () => {
      ta.value = briefText;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    chipRow.append(chip);
  }

  const submitRow = h('div', 'submit-row');
  const btn = h('button', 'ink-btn', 'Draft it →');
  btn.setAttribute('type', 'button');
  const submitHint = h('span', 'submit-hint');
  const kbd = h('kbd', null, 'ctrl+enter');
  submitHint.append(kbd, document.createTextNode(' to submit'));
  submitRow.append(btn, submitHint);

  const log = h('div', 'log');
  log.setAttribute('role', 'log');

  const statusStrip = h('div', 'status-strip');
  const statusDot = h('span', 'status-dot');
  const statusText = h('span', 'status-text', 'idle — awaiting a brief');
  statusStrip.append(statusDot, statusText);

  brief.body.append(brand, how, promptLabel, ta, chipRow, submitRow, log);
  brief.card.append(statusStrip);   // pinned to card bottom, outside the scroller

  /* ===================== 02 · SPEC BLUEPRINT ===================== */
  const specC = cardEl('02', 'Spec Blueprint', 'card-spec', 'spec');
  // figure title — "Fig. 01 — Desk lamp" — lands in the card head once a
  // design actually builds; figNum is real state (one per built design)
  const figEl = h('div', 'fig-title');
  figEl.hidden = true;
  specC.head.append(figEl);
  const specEmpty = h('div', 'empty');
  specEmpty.append(
    document.createTextNode('awaiting first design —'),
    document.createTextNode(' the blueprint draws itself here'),
    h('span', 'mono', 'JSON SPEC → SECTIONS')
  );
  const jsonEmpty = h('div', 'empty');
  jsonEmpty.append(
    document.createTextNode('awaiting first design —'),
    document.createTextNode(' the raw JSON inks itself with the spec'),
    h('span', 'mono', '{ … }')
  );

  /* ===================== 03 · VIEWPORT ===================== */
  const viewC = cardEl('03', 'Viewport', 'card-viewport', 'viewport');
  const vpWrap = h('div', 'viewport-wrap');
  const vpCorner = h('div', 'viewport-corner', 'z↑ · mm · iso 35°');
  vpWrap.append(vpCorner);
  // empty-bench overlay — pure CSS, fades out the moment real geometry lands
  const vpEmpty = h('div', 'viewport-empty');
  vpEmpty.append(
    h('div', 've-mark'),
    h('div', 've-text', 'the bench is empty — draft something'),
    h('div', 've-sub', 'or click a quick brief on card 01')
  );
  vpWrap.append(vpEmpty);

  const explodeRow = h('div', 'explode-row');
  const exLabel = h('label', null, 'Exploded view');
  const exSlider = h('input', 'explode');
  exSlider.setAttribute('type', 'range');
  exSlider.setAttribute('min', '0');
  exSlider.setAttribute('max', '1');
  exSlider.setAttribute('step', '0.01');
  exSlider.value = '0';
  const exOut = h('output', null, '0%');
  explodeRow.append(exLabel, exSlider, exOut);

  viewC.body.append(vpWrap, explodeRow);

  let viewport;
  try {
    viewport = initViewport(vpWrap);
  } catch (err) {
    // headless / no-WebGL: keep the rest of the UI alive
    vpWrap.append(h('div', 'viewport-fallback',
      'WebGL unavailable — viewport offline (' + (err && err.message || err) + ')'));
    viewport = { show(){}, resize(){}, controls: null };
  }

  /* ===================== 04 · TEST REPORT ===================== */
  const repC = cardEl('04', 'Test Report', 'card-report', 'report');
  const repEmpty = h('div', 'empty');
  repEmpty.append(
    document.createTextNode('no checks yet —'),
    document.createTextNode(' the stamp lands after a build'),
    h('span', 'mono', 'PASS / FAIL')
  );

  /* ===================== 05 · EXPLODED / ABOUT ===================== */
  const aboutC = cardEl('05', 'Exploded / About', 'card-about', 'about');
  const aboutP = h('p', 'about-p');
  aboutP.append(
    document.createTextNode('INKBENCH turns a plain-language brief into '),
    h('b', null, 'verified mechanical parts'),
    document.createTextNode('. The agent writes a spec, the bench builds real geometry, then physical checks stamp the result — nothing is faked.')
  );
  const exP = h('p', 'about-p');
  exP.append(
    document.createTextNode('Every spec carries an assembly order with '),
    h('b', null, 'insert_from'),
    document.createTextNode(' vectors. The slider in the viewport card spreads parts along them: '),
    h('b', null, '0'),
    document.createTextNode(' assembled · '),
    h('b', null, '1'),
    document.createTextNode(' fully exploded.')
  );
  const legend = h('div', 'legend');
  for (const [c, name, use] of [
    ['#c8552e', 'burnt orange', 'actions · fail-adjacent'],
    ['#3a6ea5', 'muted blue',   'spec · info'],
    ['#6a8a5f', 'sage',         'pass · joints'],
  ]){
    const r2 = h('div', 'lrow');
    const sw = h('span', 'swatch');
    sw.style.background = c;
    r2.append(sw, h('span', null, name + ' '), h('span', 'mono', c + ' — ' + use));
    legend.append(r2);
  }
  const fine = h('div', 'fine',
    'paper #f5f0e8 · ink #1a1712 · three.js r180\nhorizontal strip — the page never scrolls down');

  /* session figure gallery — every design that actually builds this session
     files itself here ("Fig. 01 — Desk lamp"); entries are real restore
     points: clicking one repaints its cached spec/report/model */
  const galEmpty = h('div', 'gal-empty',
    'nothing built yet — each finished design files itself here');
  const gal = h('div', 'gallery');
  aboutC.body.append(aboutP, h('div', 'mini-title', 'Session figures'),
                     galEmpty, gal,
                     h('div', 'mini-title', 'Exploded view'),
                     exP, h('div', 'mini-title', 'Ink palette'), legend, fine);

  /* ---- assemble strip (contract order) ---- */
  root.append(brief.card, specC.card, viewC.card, repC.card, aboutC.card);

  /* ---- tiny fixed keyboard-hint footer ---- */
  root.append(h('div', 'kbd-hint',
    'wheel = pan horizontally · drag = orbit on viewport · wheel on model = zoom'));

  /* ===================== strip behaviour ===================== */
  // vertical wheel -> horizontal pan (except over the 3D canvas, where wheel
  // is OrbitControls' zoom — it preventDefaults, which we also respect)
  root.addEventListener('wheel', (e) => {
    if (e.defaultPrevented) return;
    if (e.target && e.target.closest && e.target.closest('.viewport-wrap')) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) && e.deltaX !== 0) return;
    // overflowing card interiors scroll first; the strip pans at the bounds
    const cb = e.target && e.target.closest && e.target.closest('.card-body');
    if (cb && cb.scrollHeight > cb.clientHeight + 2) {
      const atTop = cb.scrollTop <= 1;
      const atBot = cb.scrollTop + cb.clientHeight >= cb.scrollHeight - 2;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBot)) return;
    }
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    root.scrollLeft += d;
    e.preventDefault();
  }, { passive: false });

  // pointer-drag pan on non-interactive background
  let drag = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target && e.target.closest &&
        e.target.closest('button,textarea,input,select,a,summary,.viewport-wrap,.log,details')) return;
    drag = { x: e.clientX, sl: root.scrollLeft };
    root.classList.add('dragging');
  });
  root.addEventListener('pointermove', (e) => {
    if (drag) root.scrollLeft = drag.sl - (e.clientX - drag.x);
  });
  const endDrag = () => { drag = null; root.classList.remove('dragging'); };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  /* ===================== helpers ===================== */
  function logLine(msg, cls){
    const line = h('div', 'log-line' + (cls ? ' ' + cls : ''));
    line.append(h('span', 'log-time', '[' + clock() + ']'), h('span', 'log-msg', msg));
    log.append(line);
    while (log.children.length > 200) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  /* ===================== public api ===================== */
  let submitFn = null;
  let explodeFn = null;
  let figNum = 0;          // running figure counter — one per submitted design
  let lastSpec = null;     // spec behind the current blueprint/report/tabs
  let lastReport = null;      // report behind the current report card
  let lastReportOpts = null;  // its render opts ({retry})
  let lastPrompt = '';     // brief text (kept for the log)
  let lastTitle = '';      // display title — chip label or titleized brief
  const figures = [];      // session cache — every figure is a restore point
  let draftFig = null;     // figure the in-flight submission is writing to
  let selFig = null;       // figure currently painted in spec/report/viewport
  let userPinned = false;  // user picked a gallery figure mid-run — don't steal it back

  const api = {
    built: null,

    onSubmit(fn){ submitFn = fn; },

    // programmatic submit (e.g. ?demo) — fills the brief, then runs the exact
    // same doSubmit path as the button and ctrl+enter
    submit(text){
      if (typeof text === 'string' && text.trim()) ta.value = text;
      doSubmit();
    },

    setStatus(str){
      statusText.textContent = str;
      const busy = /(designing|redesigning|verifying|building|testing|inking|checking|sending|working)/i.test(str);
      statusStrip.classList.toggle('busy', busy);
      logLine(str);
    },

    showModel(built){
      api.built = built;
      viewport.show(built);
      if (explodeFn){ const v = parseFloat(exSlider.value) || 0; if (v > 0) explodeFn(v); }
      const nParts = built && built.parts ? (built.parts.size ?? built.parts.length) : 0;
      vpEmpty.classList.toggle('gone', !!nParts);
      if (nParts) logLine('model ▸ ' + nParts + ' part(s) in viewport');
    },

    showSpec(spec){
      // emit path — the orchestrator calls this once per build ATTEMPT.
      // all attempts of one brief share a figure (draftFig resets in doSubmit);
      // the counter never moves on repaint or restore.
      if (!draftFig){
        figNum++;
        draftFig = {
          figNum,
          name: shortTitle(
            (spec && spec.name && String(spec.name).trim()) || lastTitle || 'untitled design'),
          spec, built: api.built,
          report: null, reportOpts: null, attempts: 0,
          idx: figures.length, el: null
        };
        figures.push(draftFig);
        galEmpty.hidden = true;
        gal.append(galEntryEl(draftFig));
      } else {
        draftFig.spec = spec;
        draftFig.built = api.built;
      }
      updateGalEntry(draftFig);
      // a user-pinned gallery figure keeps the cards while a run is in
      // flight — the draft's gallery entry still updates live. pinning the
      // in-flight draft itself still follows repaints.
      if (!userPinned || selFig === draftFig){ selFig = draftFig; paintSpec(selFig); }
      logLine('spec ▸ ' + (spec && spec.parts ? spec.parts.length : 0) + ' part(s), ' +
              (spec && spec.joints ? spec.joints.length : 0) + ' joint(s)');
    },

    showReport(report, opts){
      // verdict + attempt count land on the figure being drafted — the
      // gallery pill is live red/green ink, not a fixture
      if (draftFig){
        draftFig.report = report;
        draftFig.reportOpts = opts || null;
        draftFig.attempts++;
        updateGalEntry(draftFig);
      }
      // final report (no retry queued) reclaims the cards even when pinned —
      // and repaints the spec card too so blueprint/report/gallery agree
      if (!opts || !opts.retry) userPinned = false;
      if (!userPinned && selFig !== draftFig && draftFig){
        selFig = draftFig; paintSpec(draftFig);
      } else if (!userPinned) selFig = draftFig;
      if (selFig === draftFig) paintReport(report, opts);
      else paintReport(selFig ? selFig.report : null, selFig ? selFig.reportOpts : null);
      markSel();
      const pass = !!(report && report.pass);
      logLine('report ▸ ' + (pass ? 'PASS' : 'FAIL'));
      // red-ink the failing checks into the agent log — one line each
      const checks = (report && report.checks) || [];
      const fails  = (report && report.failures) || [];
      const stOf = (c) => c.status || (c.pass != null ? (c.pass ? 'pass' : 'fail') : (c.ok ? 'pass' : 'fail'));
      if (fails.length) for (const f of fails) logLine('✗ ' + String(f), 'fail');
      else for (const c of checks)
        if (stOf(c) === 'fail')
          logLine('✗ ' + (c.name || 'check') + (c.detail ? ' — ' + c.detail : ''), 'fail');
      for (const c of checks)
        if (stOf(c) === 'warn')
          logLine('◦ ' + (c.name || 'check') + ' — ' + (c.detail || c.message || 'warning'), 'warn');
    },

    onExplode(fn){ explodeFn = fn; },

    // gallery restore — repaints a cached figure's spec/report/model.
    // pure render path: figNum untouched, no new gallery entry.
    selectFigure(idx){
      const fig = figures[idx];
      if (!fig) return;
      selFig = fig;
      userPinned = true;
      if (fig.built){
        api.showModel(fig.built);                       // real geometry back on the bench
        if (explodeFn) explodeFn(parseFloat(exSlider.value) || 0);  // slider stays truth
      }
      paintSpec(fig);
      paintReport(fig.report, fig.reportOpts);
      markSel();
      logLine('gallery ▸ Fig. ' + String(fig.figNum).padStart(2, '0') +
              ' restored — ' + fig.name);
    },
  };

  /* ---- submit wiring ---- */
  let inFlight = false;
  const doSubmit = () => {
    const text = (ta.value || '').trim();
    if (!text){ logLine('describe something first'); ta.focus && ta.focus(); return; }
    if (!submitFn || inFlight){ if (inFlight) logLine('already inking — one brief at a time'); return; }
    lastPrompt = text;
    userPinned = false;             // new run — the draft owns the cards again
    draftFig = null;                // the next built spec opens a fresh figure
    const qb = QUICK_BRIEFS.find(([, b]) => b === text);
    lastTitle = qb ? (qb[0][0].toUpperCase() + qb[0].slice(1)) : titleFrom(text);
    logLine('brief ▸ ' + (text.length > 90 ? text.slice(0, 87) + '…' : text));
    inFlight = true;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = 'inking…';
    Promise.resolve().then(() => submitFn(text))
      .catch(err => api.setStatus('error: ' + (err && err.message || err)))
      .finally(() => {
        inFlight = false;
        btn.disabled = false;
        btn.classList.remove('busy');
        btn.textContent = 'Draft it →';
      });
  };
  btn.addEventListener('click', doSubmit);
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); doSubmit(); }
  });

  /* ---- explode wiring ---- */
  exSlider.addEventListener('input', () => {
    const v = parseFloat(exSlider.value) || 0;
    exOut.textContent = Math.round(v * 100) + '%';
    if (explodeFn) explodeFn(v);
  });

  /* ===================== renderers ===================== */
  /* paint* = pure render paths (shared by live emit AND gallery restore —
     they never touch figNum, the figures cache, or the gallery list) */
  function paintSpec(fig){
    lastSpec = fig.spec;
    specTabs.refresh();      // re-renders whichever spec tab is live
    // figure number stamped when the figure was drafted, not when repainted
    clear(figEl);
    figEl.append(
      h('span', 'fig-num', 'Fig. ' + String(fig.figNum).padStart(2, '0')),
      h('span', 'fig-dash', '—'),
      h('span', 'fig-name', fig.name)
    );
    figEl.hidden = false;
    markSel();
  }

  function paintReport(report, opts){
    lastReport = report || null;
    lastReportOpts = opts || null;
    repC.card.classList.toggle('verified', !!report && !!report.pass);
    repC.card.classList.toggle('failed', !!report && !report.pass);
    repTabs.refresh();       // re-renders whichever report tab is live
  }

  /* ---- session figure gallery ---- */
  function galEntryEl(fig){
    const b = h('button', 'gfig wip');
    b.setAttribute('type', 'button');
    b.setAttribute('title', 'restore this figure to the bench');
    const bd = h('span', 'gfig-body');
    const top = h('span', 'gfig-top');
    top.append(h('span', 'gfig-no'), h('span', 'gfig-name'));
    bd.append(top, h('span', 'gfig-sub'));
    b.append(h('span', 'gfig-thumb'), bd, h('span', 'pill'));
    b.addEventListener('click', () => api.selectFigure(fig.idx));
    fig.el = b;
    updateGalEntry(fig);
    return b;
  }

  function updateGalEntry(fig){
    if (!fig.el) return;
    const nParts  = (fig.spec && fig.spec.parts  ? fig.spec.parts.length  : 0);
    const nJoints = (fig.spec && fig.spec.joints ? fig.spec.joints.length : 0);
    fig.el.querySelector('.gfig-thumb').textContent = nParts;   // thumbnail = part-count cell
    fig.el.querySelector('.gfig-no').textContent =
      'Fig. ' + String(fig.figNum).padStart(2, '0');
    fig.el.querySelector('.gfig-name').textContent = fig.name;
    fig.el.querySelector('.gfig-sub').textContent =
      nParts + ' part' + (nParts === 1 ? '' : 's') + ' · ' + nJoints + ' joint' + (nJoints === 1 ? '' : 's') +
      (fig.attempts ? ' · ' + fig.attempts + ' attempt' + (fig.attempts > 1 ? 's' : '') : '');
    const pill = fig.el.querySelector('.pill');
    fig.el.classList.remove('sel');
    if (fig.report){
      const pass = !!fig.report.pass;
      fig.el.classList.remove('wip');
      fig.el.classList.toggle('pass', pass);
      fig.el.classList.toggle('fail', !pass);
      pill.className = 'pill ' + (pass ? 'pass' : 'fail');
      pill.textContent = (pass ? 'VERIFIED' : 'FAIL') +
        (fig.attempts > 1 ? ' ×' + fig.attempts : '');
    } else {
      fig.el.classList.add('wip');
      fig.el.classList.remove('pass', 'fail');
      pill.className = 'pill wip';
      pill.textContent = 'inking…';
    }
  }

  function markSel(){
    const sel = selFig && selFig.el;
    for (const el of gal.querySelectorAll('.gfig'))
      el.classList.toggle('sel', el === sel);
  }

  function renderSpec(spec, title){
    const wrap = h('div', 'spec');
    spec = spec || {};
    const parts = spec.parts || [], joints = spec.joints || [], asm = spec.assembly || [];
    const mats = spec.materials || {};

    wrap.append(
      h('p', 'spec-name',
        (spec.name && String(spec.name).trim()) || title || lastTitle || 'untitled design'),
      h('div', 'spec-meta',
        'units ' + (spec.units || 'mm') + ' · ' + parts.length + ' part' + (parts.length === 1 ? '' : 's') + ' · ' +
        joints.length + ' joint' + (joints.length === 1 ? '' : 's') + ' · ' + asm.length + ' assembly step' + (asm.length === 1 ? '' : 's'))
    );

    /* ---- overview / tests ---- */
    const ov = detailsEl('Contract & tests', null, true);
    if (spec.tests){
      for (const [k, v] of Object.entries(spec.tests)) ov.body.append(row(k, num(v)));
    } else ov.body.append(row('tests', '—'));
    wrap.append(ov.d);

    /* ---- materials ---- */
    const mKeys = Object.keys(mats);
    const mt = detailsEl('Materials', mKeys.length, false);
    for (const k of mKeys){
      const m = mats[k] || {};
      const r2 = h('div', 'srow');
      const chip = h('span', 'chip');
      if (/^#[0-9a-f]{3,8}$/i.test(m.color || '')) chip.style.background = m.color;
      else chip.style.background = 'transparent';
      r2.append(chip, h('span', 'k', k),
        h('span', 'v', (m.density ? num(m.density) + ' kg/m³' : '') + (m.color ? '  ' + m.color : '')));
      mt.body.append(r2);
    }
    wrap.append(mt.d);

    /* ---- parts ---- */
    const pt = detailsEl('Parts', parts.length, true);
    parts.forEach((p, i) => {
      const r2 = h('div', 'srow');
      r2.style.flexWrap = 'wrap';
      r2.append(
        h('span', 'asm-num', String(i + 1)),
        h('span', 'k', p.id || 'part_' + i),
        h('span', 'tag', p.shape || '?'),
        h('span', 'v', dimStr(p))
      );
      const sub = h('div', 'check');
      sub.append(h('span', 'cdetail',
        'mat ' + (p.material || '—') +
        (p.position ? '  @ ' + vec(p.position) : '') +
        (Array.isArray(p.rotation) && p.rotation.some(x => x) ? '  rot ' + vec(p.rotation) : '')));
      pt.body.append(r2, sub);
    });
    wrap.append(pt.d);

    /* ---- joints ---- */
    const jt = detailsEl('Joints', joints.length, joints.length <= 6);
    joints.forEach(j => {
      const r2 = h('div', 'srow');
      r2.style.flexWrap = 'wrap';
      r2.append(
        h('span', 'k', (j.a || '?') + ' ↔ ' + (j.b || '?')),
        h('span', 'tag ' + (j.type || ''), j.type || 'joint'),
        h('span', 'v',
          (j.axis ? 'axis ' + vec(j.axis) : '') + (j.anchor ? '  @ ' + vec(j.anchor) : ''))
      );
      jt.body.append(r2);
    });
    wrap.append(jt.d);

    /* ---- assembly order ---- */
    const as = detailsEl('Assembly order', asm.length, asm.length <= 8);
    asm.forEach((a, i) => {
      const r2 = h('div', 'srow');
      r2.append(
        h('span', 'asm-num', String(i + 1)),
        h('span', 'k', a.part || '?'),
        h('span', 'asm-arrow', '←'),
        h('span', 'v', 'insert_from ' + vec(a.insert_from))
      );
      as.body.append(r2);
    });
    wrap.append(as.d);

    return wrap;
  }

  function dimStr(p){
    const s = p && p.size;
    if (Array.isArray(s)) return s.map(num).join(' × ');
    if (s && Array.isArray(s.points)) return 'extrude ' + s.points.length + ' pts · h ' + num(s.h);
    if (s && s.r != null) return '⌀ ' + num(2 * s.r) + (s.h != null ? ' × ' + num(s.h) : '');
    return '—';
  }

  function renderReport(report, opts){
    const wrap = h('div', 'report');
    report = report || {};
    opts = opts || {};
    const checks = report.checks || [];
    const fails = report.failures || [];
    const pass = !!report.pass;

    const zone = h('div', 'stamp-zone');
    zone.append(h('div', 'stamp ' + (pass ? 'pass' : 'fail'), pass ? 'VERIFIED' : 'FAIL'));
    zone.append(h('div', 'stamp-sub',
      checks.length + ' checks · ' + fails.length + ' failure' + (fails.length === 1 ? '' : 's')));
    wrap.append(zone);

    // real-count summary line: parts + joints come from the spec this
    // report ran against; checks + timing from the report itself
    const bits = [];
    if (lastSpec){
      const np = (lastSpec.parts || []).length, nj = (lastSpec.joints || []).length;
      bits.push(np + ' part' + (np === 1 ? '' : 's'));
      bits.push(nj + ' joint' + (nj === 1 ? '' : 's'));
    }
    bits.push(checks.length + ' checks');
    if (typeof report.timingMs === 'number') bits.push(num(report.timingMs) + 'ms');
    wrap.append(h('div', 'report-summary', bits.join('  ·  ')));

    if (!pass){
      wrap.append(h('div', 'retry-note' + (opts.retry ? '' : ' dead'),
        opts.retry
          ? '↻ feeding failures back to the agent — redesign queued…'
          : '✗ no retries left — the red ink stands'));
    }

    for (const c of checks){
      const st = c.status || (c.pass != null ? (c.pass ? 'pass' : 'fail') : (c.ok ? 'pass' : 'fail'));
      const ok = st === 'pass';
      const r2 = h('div', 'check' + (st === 'fail' ? ' fail' : st === 'warn' ? ' warn' : ''));
      r2.append(
        h('span', 'pill ' + st, ok ? '✓ pass' : st === 'warn' ? '◦ warn' : '✗ fail'),
        h('span', 'cname', c.name || c.check || 'check'),
        h('span', 'cval', c.value != null ? String(c.value)
                        : c.measured != null ? String(c.measured) : '')
      );
      const detail = c.detail || c.message || c.msg;
      if (detail) r2.append(h('span', 'cdetail', detail));
      wrap.append(r2);
    }

    if (fails.length){
      const fb = h('div', 'failures');
      fb.append(h('div', 'fhead', 'FAILURES — RED INK'));
      const ul = h('ul');
      for (const f of fails) ul.append(h('li', null, String(f)));
      fb.append(ul);
      wrap.append(fb);
    }
    return wrap;
  }

  /* ---- card tabs — created after state vars exist; each pane renders on
     switch AND on every paint* refresh, so a live tab always shows the
     current figure's data (and gallery restores repaint it too) ---- */
  const specTabs = makeTabs(specC, [
    { id: 'blueprint', label: 'Blueprint',
      render: (pane) => pane.append(lastSpec
        ? renderSpec(lastSpec, selFig && selFig.name)
        : specEmpty) },
    { id: 'json', label: 'JSON',
      render: (pane) => {
        if (!lastSpec){ pane.append(jsonEmpty); return; }
        const pre = h('pre', 'spec-json');
        pre.innerHTML = tintJSON(lastSpec);
        pane.append(pre);
      } },
  ]);
  const repTabs = makeTabs(repC, [
    { id: 'checks', label: 'Checks',
      render: (pane) => pane.append(lastReport
        ? renderReport(lastReport, lastReportOpts)
        : repEmpty) },
    { id: 'measures', label: 'Measures',
      render: (pane) => renderMeasures(pane, lastSpec) },
    { id: 'arms', label: 'Arms',
      render: (pane) => renderBuildPlan(pane, lastSpec, lastReport) },
  ]);

  /* ---- opening log line ---- */
  logLine('inkbench ready — describe a part to begin');
  return api;
}
