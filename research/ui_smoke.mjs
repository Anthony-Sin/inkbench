// ============================================================================
// research/ui_smoke.mjs — headless smoke test for src/ui/workbench.js.
// Stubs just enough DOM for mountUI() to run under Node (no jsdom needed).
// WebGL is absent, so initViewport throws and workbench's fallback engages —
// that path is asserted too. Run:  node research/ui_smoke.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const ok = (name, cond, extra = '') =>
  results.push({ name, pass: !!cond, extra });

/* ----------------------------- fake DOM ---------------------------------- */
class FakeEl {
  constructor(tag){
    this.tagName = String(tag).toUpperCase();
    this._classes = new Set();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientWidth = 800;
    this.clientHeight = 600;
    const self = this;
    this.classList = {
      add:    (...cs) => cs.forEach(c => self._classes.add(c)),
      remove: (...cs) => cs.forEach(c => self._classes.delete(c)),
      toggle: (c, f) => {
        if (f === undefined) f = !self._classes.has(c);
        f ? self._classes.add(c) : self._classes.delete(c);
        return f;
      },
      contains: c => self._classes.has(c),
    };
  }
  get children(){ return this.childNodes.filter(c => c instanceof FakeEl); }
  get className(){ return [...this._classes].join(' '); }
  set className(v){ this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get firstChild(){ return this.childNodes[0] || null; }
  appendChild(c){ c.parentNode = this; this.childNodes.push(c); return c; }
  append(...cs){ for (const c of cs){ this.appendChild(typeof c === 'string' ? { nodeType:3, textContent:c } : c); } }
  removeChild(c){ const i = this.childNodes.indexOf(c); if (i >= 0){ this.childNodes.splice(i,1); c.parentNode = null; } return c; }
  setAttribute(k, v){ this.attributes[k] = String(v); }
  getAttribute(k){ return this.attributes[k]; }
  addEventListener(t, f){ (this.listeners[t] = this.listeners[t] || []).push(f); }
  dispatch(t, ev = {}){
    ev.type = t;
    if (!('target' in ev)) ev.target = this;
    for (const f of this.listeners[t] || []) f(ev);
  }
  click(){ this.dispatch('click'); }
  focus(){}
  matches(sel){
    // supports: tag  .cls  tag.cls  .a.b  [attr]  [attr=val]
    if (sel.startsWith('[')){
      const m = sel.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (!m) return false;
      return m[2] === undefined ? m[1] in this.attributes : this.attributes[m[1]] === m[2];
    }
    const parts = sel.split('.');
    if (parts[0] && this.tagName !== parts[0].toUpperCase()) return false;
    return parts.slice(1).every(c => this._classes.has(c));
  }
  querySelectorAll(sel){
    const sels = sel.trim().split(/\s+/);
    const last = sels[sels.length - 1];
    const out = [];
    const walk = (n) => { for (const c of n.childNodes){ if (c instanceof FakeEl){ if (c.matches(last)) out.push(c); walk(c); } } };
    walk(this);
    if (sels.length === 1) return out;
    // descendant: ancestors must match earlier selectors in order
    return out.filter(el => {
      let i = 0, n = el.parentNode;
      while (n && i < sels.length - 1){
        if (n.matches && n.matches(sels[i])) i++;
        n = n.parentNode;
      }
      return i === sels.length - 1;
    });
  }
  querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }
  closest(sel){
    let n = this;
    while (n){ if (n.matches && n.matches(sel)) return n; n = n.parentNode; }
    return null;
  }
  get textContent(){
    return this.childNodes.map(c => c instanceof FakeEl ? c.textContent : (c.textContent || '')).join('');
  }
  set textContent(v){ this.childNodes = []; this.appendChild({ nodeType:3, textContent:String(v) }); }
  set innerHTML(v){ this.childNodes = []; this._html = String(v); }
  get innerHTML(){ return this._html || ''; }
  getBoundingClientRect(){ return { x:0, y:0, top:0, left:0, width:this.clientWidth, height:this.clientHeight }; }
}

const bodyEl = new FakeEl('body');
globalThis.document = {
  createElement: t => new FakeEl(t),
  createTextNode: t => ({ nodeType:3, textContent:String(t) }),
  createElementNS: (ns, t) => { const e = new FakeEl(t); e.getContext = () => null; return e; },
  body: bodyEl,
  getElementById: () => null,
};
globalThis.window = { addEventListener(){}, devicePixelRatio: 1 };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 0;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };

/* ------------------------------ run -------------------------------------- */
let mountUI;
try {
  ({ mountUI } = await import('../src/ui/workbench.js'));
  ok('import workbench.js', typeof mountUI === 'function');
} catch (e) {
  ok('import workbench.js', false, e.stack || String(e));
  finish();
}

const root = new FakeEl('div');
root.setAttribute('id', 'app');
let ui;
try {
  ui = mountUI(root);
  ok('mountUI mounts without throwing', true);
} catch (e) {
  ok('mountUI mounts without throwing', false, e.stack || String(e));
  finish();
}

/* 1 — api surface */
for (const k of ['onSubmit','setStatus','showModel','showSpec','showReport','onExplode'])
  ok('api.' + k + ' is fn', typeof ui[k] === 'function');
ok('api.built exposed', 'built' in ui);

/* 2 — card order (hard contract) */
const cards = root.querySelectorAll('.card').map(c => c.getAttribute('data-card'));
ok('5 cards in contract order',
   JSON.stringify(cards) === JSON.stringify(['brief','spec','viewport','report','about']),
   cards.join(' → '));

/* 3 — status + log */
ui.setStatus('designing…');
const strip = root.querySelector('.status-strip');
ok('busy dot while designing', strip && strip.classList.contains('busy'));
ok('status text set', root.querySelector('.status-text').textContent === 'designing…');
ui.setStatus('verified ✓ (1 attempt)');
ok('busy cleared on terminal status', !strip.classList.contains('busy'));
const logEl = root.querySelector('.log');
ok('log lines timestamped', logEl.children.length >= 3 &&
   /^\[\d{2}:\d{2}:\d{2}\]$/.test(logEl.children[0].querySelector('.log-time').textContent));

/* 4 — showSpec renders collapsible sections */
const SPEC = {
  name: 'pencil cup v1', units: 'mm',
  materials: { PLA: { density: 1240, color: '#3a6ea5' }, steel: { density: 7850, color: '#8a9099' } },
  parts: [
    { id:'shell', shape:'cylinder', size:{ r:40, h:90 }, material:'PLA', position:[0,0,45] },
    { id:'base',  shape:'box',      size:[86,86,4],      material:'PLA', position:[0,0,2] },
    { id:'rib',   shape:'extrude',  size:{ points:[[0,0],[10,0],[5,8]], h:60 }, material:'steel', position:[38,0,30], rotation:[0,0,0] },
  ],
  joints:   [ { a:'base', b:'shell', type:'fixed', axis:[0,0,1], anchor:[0,0,4] } ],
  assembly: [ { part:'base',  insert_from:[0,0,-80] },
              { part:'shell', insert_from:[0,0,120] },
              { part:'rib',   insert_from:[80,0,0] } ],
  tests: { min_clearance_mm: 0.5, max_tip_angle_deg: 12 },
};
ui.showSpec(SPEC);
const specCard = root.querySelectorAll('.card')[1];
const dets = specCard.querySelectorAll('details');
ok('spec has >=4 collapsible sections', dets.length >= 4, dets.length + ' <details>');
ok('spec name shown', specCard.querySelector('.spec-name').textContent === 'pencil cup v1');
ok('counts visible in summaries', specCard.querySelectorAll('summary .count').length >= 3);
ok('part dims rendered mono', /⌀ 80 × 90|80 × 90/.test(
  specCard.querySelectorAll('.srow .v').map(v=>v.textContent).join(' ')));

/* 5 — showReport renders stamp + pills + red failures */
const REPORT = {
  pass: false,
  checks: [
    { name:'min clearance', pass:false, value:'0.21 mm', detail:'gear ↔ housing gap' },
    { name:'tip angle',     pass:true,  value:'4.2°' },
    { name:'assembly order',pass:true,  value:'3/3' },
  ],
  failures: ['clearance 0.21mm < 0.50mm'],
};
ui.showReport(REPORT);
const repCard = root.querySelectorAll('.card')[3];
const stamp = repCard.querySelector('.stamp');
ok('FAIL stamp rendered', stamp && stamp.textContent === 'FAIL' && stamp.classList.contains('fail'));
ok('one pill per check', repCard.querySelectorAll('.pill').length === 3);
ok('fail pill styled', repCard.querySelectorAll('.pill.fail').length === 1);
ok('red-ink failures listed', repCard.querySelectorAll('.failures li').length === 1);
ui.showReport({ pass:true, checks:[{name:'min clearance',pass:true,value:'1.2 mm'}], failures:[] });
ok('PASS stamp rendered', repCard.querySelector('.stamp').textContent === 'PASS');

/* 6 — showModel stores built + hands to (fallback) viewport */
ui.showModel({ group:null, parts:[{},{},{}], bounds:null });
ok('ui.built stores last model', ui.built && ui.built.parts.length === 3);
ok('viewport fallback engaged (no WebGL)', !!root.querySelector('.viewport-fallback'));

/* 7 — submit wiring */
let got = null;
ui.onSubmit(async t => { got = t; });
const ta = root.querySelector('.brief-input');
ta.value = 'a pencil cup with a hex pattern';
root.querySelector('.ink-btn').dispatch('click');
await new Promise(r => setTimeout(r, 10));
ok('onSubmit received prompt text', got === 'a pencil cup with a hex pattern');
ok('button re-enabled after submit', !root.querySelector('.ink-btn').disabled);

/* 8 — explode slider */
let ev = null;
ui.onExplode(v => { ev = v; });
const slider = root.querySelector('input.explode');
slider.value = '0.42';
slider.dispatch('input');
ok('onExplode got 0.42', Math.abs(ev - 0.42) < 1e-6, 'got ' + ev);
ok('explode % label', root.querySelector('.explode-row output').textContent === '42%');

/* 9 — wheel → horizontal pan, but not over the 3D canvas */
const mkWheel = (target, dy) => ({ deltaY:dy, deltaX:0, deltaMode:0, target,
  preventDefault(){ this.defaultPrevented = true; } });
root.dispatch('wheel', mkWheel(specCard, 120));
ok('vertical wheel pans horizontally', root.scrollLeft === 120, 'scrollLeft=' + root.scrollLeft);
const vpFallback = root.querySelector('.viewport-fallback');
root.dispatch('wheel', mkWheel(vpFallback, 120));
ok('wheel over viewport not hijacked', root.scrollLeft === 120);
const claimed = mkWheel(specCard, 120); claimed.defaultPrevented = true;
root.dispatch('wheel', claimed);
ok('defaultPrevented wheel untouched', root.scrollLeft === 120);

/* 10 — footer hint exists */
ok('kbd-hint footer present', !!root.querySelector('.kbd-hint'));

/* ----------------------------- palette ------------------------------------ */
const css = readFileSync(path.join(here, '..', 'src', 'ui', 'ink.css'), 'utf8');
const accents = [...css.matchAll(/--acc-(\w+):\s*(#[0-9a-f]{3,8})/gi)].map(m => `--acc-${m[1]} = ${m[2]}`);
ok('3+ accent vars in ink.css', accents.length >= 3, accents.join('  '));
ok('paper bg #f5f0e8 in css', /#f5f0e8/i.test(css));
ok('body overflow hidden', /html,body\{[^}]*overflow:hidden/s.test(css) || /body\{[^}]*overflow:hidden/s.test(css));

/* ------------------------------ report ------------------------------------ */
finish();
function finish(){
  const pad = Math.max(...results.map(r => r.name.length));
  let npass = 0;
  for (const r of results){
    if (r.pass) npass++;
    console.log((r.pass ? ' PASS ' : ' FAIL ') + r.name.padEnd(pad) + (r.extra ? '   ' + r.extra.split('\n')[0] : ''));
  }
  console.log(`\n${npass}/${results.length} checks passed`);
  console.log('accents: ' + accents.join('  '));
  process.exitCode = npass === results.length ? 0 : 1;
}
