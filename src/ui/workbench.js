// Inkbench workbench — graphterm shell.
// Layout: appbar (doc-tab figures) / workspace ribbon / term | viewport | BOM
// / op timeline. Everything here renders real pipeline output.
import { initViewport } from './viewport.js';
import { mountTerm } from './term.js';
import { measuresFor } from './buildplan.js';

const h = (tag, cls, txt) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (txt != null) el.textContent = txt;
  return el;
};
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const num = v => {
  const s = (+v).toFixed(2);
  return s.includes('.') ? s.replace(/0+$/,'').replace(/\.$/,'') : s;
};
const dimStr = p => Array.isArray(p.size) ? p.size.join('×')
  : (p.size && p.size.r != null ? '⌀' + (p.size.r * 2) + '×' + p.size.h
  : (p.size && p.size.points ? p.size.points.length + 'pt·h' + p.size.h : '?'));
const shapeIc = s => ({box:'▦',cylinder:'◉',extrude:'✚',sphere:'●',cone:'▲',capsule:'▯'}[s] || '◇');
const shortTitle = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,22) || 'design';

export function mountUI(root){
  root.innerHTML = `
  <div id="app">
    <div id="appbar">
      <span class="cell-logo"></span>
      <span class="word">INK<em>BENCH</em>/ENG</span>
      <div class="dtabs" id="dtabs"></div>
      <div class="qact">
        <span class="qbtn" id="qVerify" title="print last verification">✓</span>
      </div>
      <div class="right"><span class="avatar">EG</span></div>
    </div>
    <div id="ribbon">
      <div id="wtabs"></div>
      <div id="ribbonBody"><div class="rempty">build something — the ribbon fills with real spec data</div></div>
    </div>
    <div id="ws">
      <aside id="term"></aside>
      <main id="vp">
        <div class="mat"><div id="vpwrap"></div></div>
        <div id="vpempty"><b>AWAITING FIRST DESIGN</b><span>type a brief in the terminal — muse designs, the bench verifies</span></div>
        <div class="docchip card" hidden><div class="fig" id="figLbl"></div><div class="meta" id="figMeta"></div></div>
        <div class="buildtag card" id="btag"></div>
        <div class="maxhint card">esc · double-click to restore</div>
        <div class="viewcube card"><svg width="54" height="50" viewBox="0 0 54 50">
          <g fill="none" stroke="#231e16" stroke-width="1.3">
            <path d="M27 4 L48 16 L48 36 L27 47 L6 36 L6 16 Z"/>
            <path d="M27 4 L27 25 M6 16 L27 25 M48 16 L27 25 M27 25 L27 47"/>
            <path d="M16.5 10 L37.5 22 M16.5 10 L16.5 31 M37.5 22 L37.5 43" stroke="rgba(65,83,143,.4)" stroke-width=".8"/>
          </g>
          <text x="27" y="15" font-size="6" text-anchor="middle" font-family="ui-monospace" fill="#41538f">Z</text>
          <text x="14" y="39" font-size="6" text-anchor="middle" font-family="ui-monospace" fill="#231e16">X</text>
          <text x="40" y="39" font-size="6" text-anchor="middle" font-family="ui-monospace" fill="#231e16">Y</text>
        </svg><span class="lbl">ISO-GRID</span></div>
        <div class="strips" id="strips"></div>
        <div id="chkl"></div>
        <div class="navbar card" id="navbar"></div>
        <div class="seal" id="seal"></div>
        <div id="insp" class="card">
          <div class="ih"><span id="insT"></span><button class="x" id="insX">✕</button></div>
          <table id="insTb"></table>
        </div>
      </main>
      <aside id="browser">
        <div class="dhead">BILL OF PARTS <span class="sheet" id="bomRev">rev —</span></div>
        <div id="bsearch">⌕&nbsp;<input id="bq" placeholder="item lookup…" spellcheck="false"></div>
        <div id="tree"><div class="empty">no items — run a build</div></div>
      </aside>
    </div>
    <div id="timeline">
      <div class="tlSide">
        <div class="t1">Op Chain · click to scrub</div>
        <div class="t2" id="tlCount">—</div>
        <button class="play" id="tlPlay" title="replay build" disabled>▶</button>
      </div>
      <div id="tlRow"><div class="empty">op chain — awaiting build</div></div>
    </div>
  </div>`;

  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const vp = $('#vp'), tree = $('#tree'), tlRow = $('#tlRow');
  const docChip = $('.docchip'), figLbl = $('#figLbl'), figMeta = $('#figMeta'),
        btag = $('#btag'), seal = $('#seal'), chkl = $('#chkl'), vpempty = $('#vpempty');

  /* ============================ state ============================ */
  let spec = null, built = null, report = null, reportOpts = null, plan = [], measures = [];
  let figures = [], figNum = 0, selFig = null, draftFig = null, userPinned = false;
  let submitFn = null, explodeFn = null, inFlight = false, revealTimers = [];

  /* ========================== viewport ========================== */
  let viewport;
  try { viewport = initViewport($('#vpwrap')); }
  catch (err) {
    $('#vpwrap').append(h('div','viewport-fallback','WebGL unavailable — ' + (err && err.message || err)));
    viewport = { show(){}, resize(){}, setStyle(){}, setPartVisible(){}, showOnlyParts(){},
                 allPartIds(){ return []; }, labels(){}, wobble(){}, dimExcept(){}, clearDim(){} };
  }
  $('#vpempty').style.display = '';

  /* style strips — real render passes */
  const STYLES = ['toon','flat','wire','clay','blueprint','xray','exploded'];
  const stripsEl = $('#strips');
  STYLES.forEach(k => {
    const b = h('button','strip',k); b.dataset.s = k;
    b.addEventListener('click', () => setStyle(k));
    stripsEl.appendChild(b);
  });
  function setStyle(k){
    if (!built) return;
    $$('.strip').forEach(s => s.classList.toggle('on', s.dataset.s === k));
    if (k === 'exploded'){ viewport.setStyle('toon'); explodeFn && explodeFn(0.75); }
    else { explodeFn && explodeFn(0); viewport.setStyle(k); }
  }
  function activeStyle(){ const s = $('.strip.on'); return s ? s.dataset.s : 'toon'; }
  setStyleOn('toon');
  function setStyleOn(k){ $$('.strip').forEach(s => s.classList.toggle('on', s.dataset.s === k)); }

  /* nav bar — real controls */
  const nav = [['⌂','home'],['✥','orbit'],['⤢','pan'],['+','in'],['−','out'],['▣','fit']];
  const navbar = $('#navbar');
  navbar.innerHTML = nav.map((n,i) =>
    (i===3?'<span class="sep"></span>':'') + `<button class="nbtn" data-n="${n[1]}" title="${n[1]}">${n[0]}</button>`).join('');
  navbar.addEventListener('click', e => {
    const b = e.target.closest('.nbtn'); if (!b) return;
    const c = viewport.controls; if (!c) return;
    const n = b.dataset.n;
    if (n === 'in') viewport.camera.zoom = Math.min(viewport.camera.zoom * 1.25, 60);
    if (n === 'out') viewport.camera.zoom = Math.max(viewport.camera.zoom / 1.25, 0.02);
    if (n === 'home' || n === 'fit'){ if (built) viewport.show(built); }
    viewport.camera.updateProjectionMatrix();
    if (n === 'orbit' || n === 'pan'){
      $$('.nbtn').forEach(x => x.classList.remove('on')); b.classList.add('on');
      c.mouseButtons.LEFT = n === 'orbit' ? 0 : 2; /* ROTATE vs PAN in three's enum order */
    }
  });

  /* maximize on double-click */
  vp.addEventListener('dblclick', e => {
    if (e.target.closest('#insp,button,input')) return;
    vp.classList.toggle('max'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ vp.classList.remove('max'); hideInsp(); }});

  /* seal */
  seal.innerHTML = `<svg width="104" height="104" viewBox="0 0 104 104" style="position:absolute;inset:0">
    <circle cx="52" cy="52" r="48" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="52" cy="52" r="40" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2"/></svg>
    <div class="inner"><span class="big" id="sealBig">PASS</span><span class="sm" id="sealSm"></span></div>`;

  /* inspector card */
  const insp = $('#insp'), insT = $('#insT'), insTb = $('#insTb');
  function hideInsp(){ insp.style.display = 'none'; }
  $('#insX').addEventListener('click', hideInsp);
  function showInsp(partId){
    const p = spec && spec.parts.find(x => x.id === partId);
    const m = measures.find(x => x.id === partId);
    if (!p || !m) return;
    const joins = spec.joints.filter(j => j.a === partId || j.b === partId)
      .map(j => j.a === partId ? j.b : j.a);
    insT.textContent = 'ITEM ' + partId;
    insTb.innerHTML =
      `<tr><td>shape</td><td>${esc(p.shape)}</td></tr>` +
      `<tr><td>dims</td><td>${esc(dimStr(p))} mm</td></tr>` +
      `<tr><td>material</td><td>${esc(p.material)}</td></tr>` +
      `<tr><td>mass</td><td>${m.massG.toFixed(2)} g</td></tr>` +
      `<tr><td>pos</td><td>[${m.pos.map(v=>num(v)).join(', ')}]</td></tr>` +
      `<tr><td>joins</td><td>${esc(joins.join(', ') || '—')}</td></tr>`;
    const row = tree.querySelector(`.tr.part[data-p="${CSS.escape(partId)}"]`);
    const bR = $('#browser').getBoundingClientRect();
    const r = row ? row.getBoundingClientRect() : bR;
    insp.style.display = 'block';
    insp.style.right = (innerWidth - bR.left + 16) + 'px';
    insp.style.top = Math.min(Math.max(r.top - 40, 60), innerHeight - 240) + 'px';
  }

  /* =========================== terminal =========================== */
  const term = mountTerm($('#term'), {
    submit(text){ doSubmit(text); },
    explode(v){ setStyle('exploded'); },
    printPlan(){
      if (!plan.length) return term.line('no plan yet — verify a build first', 'dim');
      plan.forEach((s,i) => term.line('  ' + (i+1) + '. ' +
        (s.kind === 'place'
          ? `[${s.arm}] place ${s.part} @ (${(s.seat||[]).map(v=>num(v)).join(',')})`
          : `⚿ ${s.type} ${s.a}~${s.b}`)));
    },
    status(){ return lastStatus; },
  });
  let lastStatus = 'pad ready';
  const setStatus = s => { lastStatus = s; term.line('· ' + s, 'dim'); };
  $('#qVerify').addEventListener('click', () => term.cmd('verify'));

  /* ========================== ribbon ========================== */
  const wtabs = $('#wtabs'), ribbonBody = $('#ribbonBody');
  const group = (cap, items) => `<div class="rgroup"><div class="items">${items}</div><div class="gcap">${cap}</div></div>`;
  const rb = (ic, label, sub, tip, data) =>
    `<button class="rbtn" title="${esc(tip||'')}" ${data||''}><span class="ic">${ic}</span><span>${esc(label)}</span>${sub?`<span class="sub">${esc(sub)}</span>`:''}</button>`;

  const TABS = {
    'DESIGN': () => spec && (
      group('Materials', Object.entries(spec.materials||{}).map(([k,m]) =>
        `<button class="rbtn" data-act="mat" data-k="${esc(k)}" title="${esc(k)} · ρ ${m.density}"><span class="sw" style="background:${esc(m.color||'#ccc')}"></span><span>${esc(k)}</span><span class="sub">${num(m.density)}</span></button>`).join('')) +
      group('Primitives', (spec.parts||[]).map(p =>
        rb(shapeIc(p.shape), p.id, dimStr(p), p.shape + ' @ ' + (p.position||[]).join(', '), `data-act="part" data-k="${esc(p.id)}"`)).join('')) +
      group('Constraints',
        rb('⇄','clr '+num(spec.tests.min_clearance_mm)+'mm','', 'min clearance') +
        rb('∠','tip '+num(spec.tests.max_tip_angle_deg)+'°','', 'max tip angle'))
    ),
    'VERIFY': () => report && (
      group('Checks', report.checks.map((c,i) =>
        `<button class="rbtn" data-act="chk" data-k="${i}" title="${esc(c.detail||'')}"><span class="ic">${c.status==='pass'?'✓':c.status==='warn'?'◦':'✗'}</span><span>${esc(c.name)}</span><span class="st ${c.status==='pass'?'stP':c.status==='warn'?'stW':'stF'}">${(c.status||'').toUpperCase()}</span></button>`).join('')) +
      group('Measures', measures.map(m =>
        rb('⌖', m.id, m.massG.toFixed(1)+'g', m.dims.map(d=>num(d)).join(' × ')+' mm', `data-act="part" data-k="${esc(m.id)}"`)).join(''))
    ),
    'ASSEMBLE': () => spec && (
      group('Joints', spec.joints.map(j =>
        rb('⚿', j.a+'~'+j.b, j.type, 'anchor ('+j.anchor.join(', ')+') axis ('+j.axis.join(', ')+')', `data-act="jnt" data-k="${esc(j.a+'~'+j.b)}"`)).join('')) +
      group('Order', spec.assembly.map((a,i) =>
        rb('↓'+(i+1), a.part, '+dir', 'insert ('+a.insert_from.join(',')+')', `data-act="part" data-k="${esc(a.part)}"`)).join(''))
    ),
    'BUILD': () => plan.length && (
      group('Plan', plan.filter(s=>s.kind==='place').map(s => {
        const i = plan.indexOf(s);
        return `<button class="rbtn" data-act="op" data-k="${i}" title="seat (${s.seat.map(v=>num(v)).join(', ')})"><span class="ic">${s.glyph}</span><span>${esc(s.part)}</span><span class="arm ${s.arm==='A'?'aA':s.arm==='B'?'aB':'aAB'}">${s.arm}</span></button>`; }).join('')) +
      group('Fix', plan.filter(s=>s.kind==='joint').map((s,i) =>
        rb('⚿', s.type, s.a+'~'+s.b, 'anchor ('+s.anchor.join(', ')+')', `data-act="jnt" data-k="${esc(s.a+'~'+s.b)}"`)).join(''))
    ),
  };
  const TABS_META = [['DESIGN',0],['VERIFY',1],['ASSEMBLE',2],['BUILD',3]];
  wtabs.innerHTML = TABS_META.map(([t,i]) =>
    `<div class="wtab" data-t="${t}"><span class="n">[${i+1}]</span>${t}</div>`).join('');
  let activeWtab = 'DESIGN';
  function paintRibbon(){
    const fn = TABS[activeWtab];
    const out = fn && fn();
    ribbonBody.innerHTML = out || '<div class="rempty">no ' + activeWtab.toLowerCase() + ' data yet — run a build</div>';
  }
  $$('.wtab').forEach(t => t.addEventListener('click', () => {
    activeWtab = t.dataset.t;
    $$('.wtab').forEach(x => x.classList.toggle('on', x === t));
    paintRibbon();
  }));
  $$('.wtab')[0].classList.add('on');
  /* ribbon actions → real scene/data effects */
  ribbonBody.addEventListener('click', e => {
    const b = e.target.closest('.rbtn'); if (!b || !b.dataset.act) return;
    const { act, k } = b.dataset;
    if (act === 'mat'){
      const on = b.classList.contains('on');
      $$('.rbtn[data-act="mat"]').forEach(x => x.classList.remove('on'));
      if (on){ viewport.clearDim(); }
      else { b.classList.add('on');
        viewport.dimExcept(m => (currentSpecEntry(m)?.material) === k);
        term.line('isolate ▸ material <span class="hl">'+esc(k)+'</span>'); }
    } else if (act === 'part'){
      viewport.clearDim(); viewport.dimExcept(m => m.userData.partId === k);
      selectBomRow(k); showInsp(k);
    } else if (act === 'chk'){
      const c = report && report.checks[+k];
      if (c) term.line('check ▸ '+esc(c.name)+' — '+esc(c.detail||''), c.status==='fail'?'fail':'');
    } else if (act === 'jnt'){
      const j = spec && spec.joints.find(x => (x.a+'~'+x.b) === k);
      if (j) term.line('joint ▸ '+esc(k)+' · '+j.type+' · axis ['+j.axis.join(', ')+'] · anchor ['+j.anchor.join(', ')+']');
    } else if (act === 'op'){
      scrubTo(+k); tlRow.querySelector(`.tn[data-i="${+k}"]`)?.scrollIntoView({inline:'center',block:'nearest'});
    }
  });
  function currentSpecEntry(mesh){
    const id = mesh.userData.partId;
    return spec && spec.parts.find(p => p.id === id);
  }

  /* ============================ BOM ============================ */
  function paintBom(){
    if (!spec){ tree.innerHTML = '<div class="empty">no items — run a build</div>'; $('#bomRev').textContent = 'rev —'; return; }
    $('#bomRev').textContent = 'rev ' + (report ? 'B' : 'A');
    let tb = `<div class="tr sel"><span class="idx">—</span><b class="nm">${esc(spec.name||'design')}</b><span class="mt">${esc(spec.units||'mm')}</span></div>`;
    tb += '<div class="bsec"><span>item · part <span class="hint">dbl-click inspect</span></span><span>dims</span></div><div class="tbl">';
    spec.parts.forEach((p,i) => {
      tb += `<div class="tr part" data-p="${esc(p.id)}"><span class="idx">${i+1}</span><span class="eye" data-p="${esc(p.id)}"></span><span class="nm">${esc(p.id)}</span><span class="mt">${esc(dimStr(p))}</span></div>`; });
    tb += '</div><div class="bsec"><span>item · joint</span><span>type</span></div><div class="tbl">';
    spec.joints.forEach((j,i) => {
      tb += `<div class="tr"><span class="idx">J${i+1}</span><span class="nm">${esc(j.a)} ~ ${esc(j.b)}</span><span class="mt">${esc(j.type)}</span></div>`; });
    tb += '</div><div class="bsec"><span>doc</span><span>val</span></div><div class="tbl">';
    tb += `<div class="tr"><span class="idx">S</span><span class="nm">units</span><span class="mt">${esc(spec.units)}</span></div>`;
    tb += `<div class="tr"><span class="idx">S</span><span class="nm">clearance</span><span class="mt">${num(spec.tests.min_clearance_mm)}mm</span></div>`;
    tb += `<div class="tr"><span class="idx">S</span><span class="nm">tip max</span><span class="mt">${num(spec.tests.max_tip_angle_deg)}°</span></div>`;
    tb += '</div><div class="bsec"><span>material</span><span>ρ</span></div><div class="tbl">';
    Object.entries(spec.materials||{}).forEach(([k,m],i) => {
      tb += `<div class="tr"><span class="idx">M${i+1}</span><span class="nm"><span class="msw" style="background:${esc(m.color||'#ccc')}"></span>${esc(k)}</span><span class="mt">${num(m.density)}</span></div>`; });
    tb += '</div>';
    tree.innerHTML = tb;
  }
  function selectBomRow(id){
    $$('#tree .tr').forEach(x => x.classList.remove('sel'));
    const r = tree.querySelector(`.tr.part[data-p="${CSS.escape(id)}"]`);
    if (r) r.classList.add('sel');
  }
  tree.addEventListener('click', e => {
    const ey = e.target.closest('.eye');
    if (ey){
      ey.classList.toggle('off');
      const off = ey.classList.contains('off');
      ey.closest('.tr').classList.toggle('off', off);
      viewport.setPartVisible(ey.dataset.p, !off);
      return;
    }
    const n = e.target.closest('.tr'); if (!n) return;
    $$('#tree .tr').forEach(x => x.classList.remove('sel')); n.classList.add('sel');
  });
  tree.addEventListener('dblclick', e => {
    const n = e.target.closest('.tr.part'); if (!n) return hideInsp();
    showInsp(n.dataset.p);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#insp') && !e.target.closest('#tree .part')) hideInsp(); });
  $('#bq').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    $$('#tree .tr').forEach(t => { t.style.display = !q || t.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });

  /* ========================== timeline ========================== */
  const tlSide = $('.tlSide'), tlCount = $('#tlCount'), tlPlay = $('#tlPlay');
  function paintTimeline(){
    if (!plan.length){ tlRow.innerHTML = '<div class="empty">op chain — awaiting build</div>'; tlCount.textContent = '—'; tlPlay.disabled = true; return; }
    tlPlay.disabled = false;
    tlCount.textContent = plan.length + ' links';
    tlRow.innerHTML = plan.map((s,i) => {
      const j = s.kind === 'joint';
      const cap = j ? s.a+'~'+s.b : s.part;
      const tag = j ? '⚿ '+s.type : ('arm '+s.arm+' '+s.glyph);
      return `<div class="tn${j?' j':''}" data-i="${i}"><span class="num">${i+1}</span><div class="tick"></div><div class="cap">${esc(cap)}<b>${esc(tag)}</b></div></div>`; }).join('');
  }
  const placeIdx = i => { /* how many place-ops are complete through plan index i */
    let n = 0; for (let j = 0; j <= i; j++) if (plan[j].kind === 'place') n++; return n; };
  function scrubTo(i){
    if (!plan.length || !built) return;
    const nodes = $$('#tlRow .tn');
    nodes.forEach((n,j) => { n.classList.toggle('done', j <= i); n.classList.toggle('sel', j === i); n.classList.remove('live'); });
    const op = plan[i];
    /* show exactly the parts placed through op i — real intermediate states */
    const visible = plan.slice(0, i+1).filter(s => s.kind === 'place').map(s => s.part);
    viewport.showOnlyParts(visible);
    btag.style.display = 'block';
    btag.innerHTML = op.kind === 'place'
      ? `op ${i+1} — <b>place ${esc(op.part)}</b> · arm ${op.arm}` + (op.massG != null ? ` · ${op.massG.toFixed(1)}g` : '')
      : `op ${i+1} — <b>⚿ ${esc(op.type)}</b> ${esc(op.a)} ~ ${esc(op.b)}`;
    $$('#tree .tr.part').forEach(t => t.classList.toggle('building',
      op.kind === 'place' && t.dataset.p === op.part));
  }
  tlRow.addEventListener('click', e => {
    const n = e.target.closest('.tn'); if (!n) return;
    stopReplay(); scrubTo(+n.dataset.i); });
  function showAllParts(){ viewport.showOnlyParts(viewport.allPartIds()); btag.style.display='none';
    $$('#tree .tr.part').forEach(t => t.classList.remove('building')); }

  /* ======================== reveal / replay ======================== */
  let revealResolve = null;
  function stopReplay(){
    revealTimers.forEach(clearTimeout); revealTimers = [];
    tlPlay.textContent = '▶';
    if (revealResolve){ const r = revealResolve; revealResolve = null; r(); }
  }
  const after = (ms, fn) => revealTimers.push(setTimeout(fn, ms));
  function setNodeDone(i, live){
    const nodes = $$('#tlRow .tn');
    nodes.forEach((n,j) => { n.classList.toggle('done', j <= i); n.classList.toggle('live', j === i && live); });
  }
  /* the agent builds in front of you: real ops, real order, real meshes */
  function replayBuild(){
    if (!built || !plan.length) return;
    stopReplay(); tlPlay.textContent = '❚❚';
    $$('#tree .tr.part').forEach(t => t.classList.remove('building'));
    viewport.showOnlyParts([]);
    let t = 200;
    plan.forEach((op, i) => {
      after(t, () => {
        scrubTo(i);
        const n = $$('#tlRow .tn')[i]; if (n) n.classList.add('live');
        if (op.kind === 'place') term.line(`  [${op.arm}] place ${op.part} @ (${(op.seat||[]).map(v=>num(v)).join(', ')})`, '', true);
        else term.line(`  ⚿ ${op.type} ${op.a} ~ ${op.b}`, 'dim', true);
      });
      t += 480;
    });
    after(t += 300, () => {
      tlPlay.textContent = '▶';
      $$('#tlRow .tn').forEach(n => n.classList.remove('live'));
      btag.style.display = 'none';
      $$('#tree .tr.part').forEach(t2 => t2.classList.remove('building'));
      if (report && report.pass) stampSeal(true); });
  }
  tlPlay.addEventListener('click', () => { tlPlay.textContent === '❚❚' ? stopReplay() : replayBuild(); });

  function stampSeal(pass){
    const checks = (report && report.checks) || [], fails = (report && report.failures) || [];
    $('#sealBig').textContent = pass ? 'PASS' : 'FAIL';
    $('#sealSm').innerHTML = pass
      ? 'ENG. CHECK<br>' + checks.filter(c=>c.status==='pass').length + '/' + checks.length + ' OK'
      : 'REWORK<br>' + fails.length + ' DEFECTS';
    seal.classList.toggle('bad', !pass);
    seal.style.color = pass ? 'var(--ok)' : 'var(--red)';
    seal.classList.add('stamped');
  }

  /* ====================== figures → doc tabs ====================== */
  const dtabs = $('#dtabs');
  function paintTabs(){
    dtabs.innerHTML = figures.map(f =>
      `<div class="dtab${f === selFig ? ' on sel' : ''}" data-i="${f.idx}" title="fig ${f.figNum} — ${esc(f.name)}">
        <span class="dot ${f.report ? (f.report.pass ? 'pass' : 'fail') : 'wip'}"></span>${esc(shortTitle(f.name))}.eng</div>`).join('') +
      `<div class="dtab new" data-i="-1" title="new design">+</div>`;
  }
  dtabs.addEventListener('click', e => {
    const t = e.target.closest('.dtab'); if (!t) return;
    const i = +t.dataset.i;
    if (i < 0){ term.focus(); return; }
    selectFigure(i);
  });
  paintTabs();
  function selectFigure(idx){
    const fig = figures[idx]; if (!fig) return;
    selFig = fig; userPinned = true;
    spec = fig.spec; built = fig.built; report = fig.report; reportOpts = fig.reportOpts;
    plan = fig.plan || []; measures = fig.spec ? measuresFor(fig.spec) : [];
    if (fig.built){ viewport.show(fig.built); showAllParts(); setStyleOn('toon'); }
    vpempty.style.display = 'none';
    docChip.hidden = false;
    figLbl.textContent = 'Fig. ' + String(fig.figNum).padStart(2,'0') + ' — ' + fig.name;
    figMeta.textContent = (fig.spec?fig.spec.parts.length:0) + ' parts · ' + (fig.spec?fig.spec.joints.length:0) + ' joints' +
      (fig.report ? ' · ' + fig.report.timingMs + 'ms' : '');
    paintBom(); paintRibbon(); paintTimeline();
    seal.classList.remove('stamped');
    if (fig.report) stampSeal(fig.report.pass);
    paintTabs();
    term.line('figure ▸ Fig. ' + String(fig.figNum).padStart(2,'0') + ' restored — ' + esc(fig.name), 'dim');
  }

  /* ====================== pipeline emit API ====================== */
  function newFig(specObj, title){
    return { idx: figures.length, figNum: ++figNum, name: title || (specObj && specObj.name) || 'untitled design',
             spec: specObj || null, built: null, report: null, reportOpts: null,
             plan: [], attempts: 0, el: null };
  }

  const api = {
    onSubmit(fn){ submitFn = fn; },
    onExplode(fn){ explodeFn = fn; },
    submit(text){ doSubmit(text); },
    get built(){ return built; },
    term, setStatus,

    beginRun(prompt){
      inFlight = true; term.inFlight = true;
      stopReplay();
      draftFig = newFig(null, 'working…');
      figures.push(draftFig);
      selFig = draftFig; userPinned = false;
      paintTabs();
      term.line('brief ▸ ' + esc(prompt), '', true);
      vpempty.style.display = 'none';
    },

    showSpec(specObj){
      spec = specObj;
      measures = specObj ? measuresFor(specObj) : [];
      term.noteSpec(specObj);
      if (draftFig){
        draftFig.spec = specObj;
        if (specObj && specObj.name && String(specObj.name).trim())
          draftFig.name = shortTitle(specObj.name);
        paintTabs();
      }
      if (!userPinned || selFig === draftFig){
        selFig = draftFig;
        docChip.hidden = false;
        figLbl.textContent = 'Fig. ' + String(draftFig.figNum).padStart(2,'0') + ' — ' + (draftFig.name || 'untitled');
        figMeta.textContent = specObj.parts.length + ' parts · ' + specObj.joints.length + ' joints';
        paintBom(); paintRibbon();
      }
      term.line('spec ▸ ' + specObj.parts.length + ' part(s), ' + specObj.joints.length + ' joint(s)', '', true);
    },

    showModel(b){
      built = b;
      if (draftFig) draftFig.built = b;
      if (userPinned && selFig !== draftFig) return;   // user parked an old figure
      viewport.show(b);
      setStyleOn('toon');
      seal.classList.remove('stamped');
      chkl.innerHTML = '';
    },

    planReady(planOps_){
      plan = planOps_ || [];
      if (draftFig) draftFig.plan = plan;
      if (!userPinned || selFig === draftFig) paintTimeline();
    },

    /* staggered reveal — real assembly order; returns a promise */
    revealBuild(){
      return new Promise(res => {
        if (!built || !plan.length){ res(); return; }
        stopReplay();
        revealResolve = res;
        viewport.showOnlyParts([]);
        let t = 150;
        plan.forEach((op, i) => {
          after(t, () => {
            setNodeDone(i, true);
            const visible = plan.slice(0, i+1).filter(s => s.kind === 'place').map(s => s.part);
            viewport.showOnlyParts(visible);
            if (op.kind === 'place'){
              term.line(`  [${op.arm}] place ${op.part} @ (${(op.seat||[]).map(v=>num(v)).join(', ')})`, '', true);
              $$('#tree .tr.part').forEach(r => r.classList.toggle('building', r.dataset.p === op.part));
            } else term.line(`  ⚿ ${op.type} ${op.a} ~ ${op.b}`, 'dim', true);
          });
          t += 300;
        });
        after(t + 120, () => {
          $$('#tree .tr.part').forEach(r => r.classList.remove('building'));
          $$('#tlRow .tn').forEach(n => n.classList.remove('live'));
          if (revealResolve === res) revealResolve = null;
          res(); });
      });
    },

    showReport(rep, opts){
      report = rep; reportOpts = opts || null;
      term.noteReport(rep);
      if (draftFig){
        draftFig.report = rep; draftFig.reportOpts = opts || null; draftFig.attempts++;
      }
      if (!opts || !opts.retry) userPinned = false;
      if (!userPinned && selFig !== draftFig && draftFig){ selFig = draftFig;
        spec = draftFig.spec; built = draftFig.built; plan = draftFig.plan || [];
        measures = spec ? measuresFor(spec) : [];
        if (built) viewport.show(built);
        paintBom(); paintTimeline();
      }
      const showing = selFig === draftFig;
      if (showing){
        docChip.hidden = false;
        figMeta.textContent = (spec?spec.parts.length:0) + ' parts · ' + (spec?spec.joints.length:0) +
          ' joints · ' + rep.timingMs + 'ms · attempt ' + draftFig.attempts;
        $('#bomRev').textContent = rep.pass ? 'rev B' : 'rev A';
        paintRibbon();
        showAllParts();
      }
      /* stamp real check results in sequence (presentation timing, real data) */
      if (showing) chkl.innerHTML = '';
      term.line('verify ▸ ' + rep.checks.length + ' checks…', '', true);
      let t = 200;
      rep.checks.forEach((c, i) => {
        after(t, () => {
          if (showing){
            const d = h('div','chk' + (c.status === 'fail' ? ' bad' : c.status === 'warn' ? ' warn' : ''));
            d.innerHTML = '<b>' + (c.status === 'pass' ? '✓' : c.status === 'warn' ? '◦' : '✗') + '</b> ' + esc(c.name);
            d.title = c.detail || '';
            d.addEventListener('click', () => term.line('check ▸ ' + esc(c.name) + ' — ' + esc(c.detail||''), c.status==='fail'?'fail':''));
            chkl.appendChild(d);
            requestAnimationFrame(() => d.classList.add('show'));
          }
          term.line('  ' + (c.status==='pass'?'✓':c.status==='warn'?'◦':'✗') + ' ' + esc(c.name) +
            (c.measured != null ? ' — ' + num(c.measured) : ''), c.status==='fail'?'fail':'', true);
        });
        t += 320;
      });
      after(t += 260, () => {
        term.line('report ▸ ' + (rep.pass ? 'PASS' : 'FAIL') + ' — ' + rep.timingMs + 'ms', rep.pass ? 'ok' : 'fail', true);
        if (showing) stampSeal(rep.pass);
        (rep.failures || []).forEach(f => term.line('✗ ' + esc(String(f)), 'fail'));
        rep.checks.filter(c => c.status === 'warn')
          .forEach(c => term.line('◦ ' + esc(c.name) + ' — ' + esc(c.detail || ''), 'warn'));
        if (opts && opts.retry) term.line('↻ feeding failures back — redesign queued…', 'warn');
        else {
          inFlight = false; term.inFlight = false;
          /* figure finalized — keep its geometry alive for doc-tab restore */
          if (draftFig && draftFig.built) draftFig.built.group.userData.keepAlive = true;
          if (rep.pass) term.line('verified ✓ (' + draftFig.attempts + ' attempt' + (draftFig.attempts>1?'s':'') + ')', 'ok');
          paintTabs();
          afterAgentHook(rep);
        }
        /* check chips fade after a beat */
        after(3200, () => $$('#chkl .chk').forEach((c,i) => setTimeout(() => c.classList.remove('show'), i*110)));
      });
    },

    /* pipeline died mid-run (LLM error etc) — release the terminal, mark fig */
    abort(msg){
      inFlight = false; term.inFlight = false;
      stopReplay();
      if (draftFig && !draftFig.report) draftFig.report = { pass: false, aborted: true, checks: [], failures: [] };
      paintTabs();
      if (msg) term.line('✗ ' + esc(String(msg)), 'fail');
    },

    /* gallery restore parity with old selectFigure */
    selectFigure,
    figures(){ return figures; },
  };

  /* agent-specific post-run behaviour — real effects per chip */
  function afterAgentHook(rep){
    if (term.agent === 'devin' && rep.pass){
      term.line('devin ▸ verified — replaying two-arm program', 'dim');
      setTimeout(replayBuild, 900);
    } else if (term.agent === 'claude'){
      const worst = rep.checks.reduce((a,c) => (c.measured != null && c.measured < (a?.measured ?? 1e9) ? c : a), null);
      term.line('claude ▸ review: ' + (rep.pass ? 'buildable' : 'not buildable') +
        (worst && worst.measured != null ? ' · weakest margin ' + esc(worst.name) + ' ' + num(worst.measured) : '') +
        ' · ' + draftFig.attempts + ' attempt(s)', 'dim');
    }
  }

  /* ------------------------- submit ------------------------- */
  function doSubmit(text){
    const t = (text || '').trim();
    if (!t || inFlight || !submitFn) return;
    term.typeEcho('build "' + t + '"');
    submitFn(t);
  }

  return api;
}
