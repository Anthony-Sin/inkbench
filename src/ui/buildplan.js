// ============================================================================
// src/ui/buildplan.js — Measures table + two-arm "workcell" build plan.
// Rendered into tabs on the 04 TEST REPORT card. Every value derives from the
// spec: dims/volume come from cad/geometry.js (the SAME math the renderer and
// verifier use), mass from spec.materials[id].density, arm assignment and
// joint ops from spec.assembly + spec.joints. Deterministic — no randomness,
// no fixtures, nothing hardcoded.
// ============================================================================
import { partVolume, partAABB } from '../cad/geometry.js';

const FALLBACK_DENSITY = 1200;   // kg/m³ — generic polymer when a material omits density
const HEAVY_G = 5000;            // > 5 kg -> two-arm lift

/* --------------------------- tiny dom/num kit ---------------------------- */
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const num = (n) => {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const s = Math.abs(n) >= 100 ? n.toFixed(0)
          : Math.abs(n) >= 10  ? n.toFixed(1)
          :                      n.toFixed(2);
  // strip trailing zeros ONLY past a decimal point — '300' must stay '300'
  return s.includes('.') ? (s.replace(/\.?0+$/, '') || '0') : s;
};
const big = (n) => isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';
const vec = (v) => Array.isArray(v) ? '[' + v.map(num).join(', ') + ']' : '—';
const massStr = (g) => !isFinite(g) ? '—'
                    : g >= 1000 ? num(g / 1000) + ' kg'
                    : Math.round(g) + ' g';

function emptyBox(l1, l2, mono){
  const e = h('div', 'empty');
  e.append(document.createTextNode(l1));
  if (l2) e.append(document.createTextNode(' ' + l2));
  if (mono) e.append(h('span', 'mono', mono));
  return e;
}

/* ------------------------------ measurements ----------------------------- */
/** Per-part real measurements, in spec order.
 *  dims = spec-space world-AABB extents (mm) — what a calliper would read.
 *  volMM3 = analytic volume via partVolume.  massG = vol × density. */
export function measuresFor(spec){
  const mats = (spec && spec.materials) || {};
  return ((spec && spec.parts) || []).map((p) => {
    const aabb = partAABB(p);
    const dims = aabb.max.map((v, i) => v - aabb.min[i]);
    const vol = partVolume(p);                                   // mm³
    const rho = +((mats[p.material] || {}).density) || FALLBACK_DENSITY;
    return {
      id: p.id || '?', shape: p.shape || '?', material: p.material || '—',
      dims, volMM3: vol, density: rho,
      massG: vol * rho * 1e-6,               // mm³ · kg/m³ -> g
      pos: p.position || null,
    };
  });
}

/* ---------------------------- insert arrow glyph ------------------------- */
/** Dominant axis of insert_from -> compass glyph. The arrow points AT the
 *  source — the direction the part comes from: +z = from above '↑',
 *  +x = from the right '→', +y = from the back '↖' (diagonals mark the
 *  depth axis so it can't be confused with x or z). Deterministic. */
export function dirGlyph(v){
  const x = +((v || [])[0]) || 0, y = +((v || [])[1]) || 0, z = +((v || [])[2]) || 0;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (Math.max(ax, ay, az) < 1e-9) return '·';
  if (ax >= ay && ax >= az) return x > 0 ? '→' : '←';
  if (az >= ax && az >= ay) return z > 0 ? '↑' : '↓';
  return y > 0 ? '↖' : '↘';
}

/* ------------------------------ plan builder ----------------------------- */
/** Deterministic two-arm op list: placements in spec.assembly order, joint
 *  ops interleaved the moment both joined parts are on the bench.
 *  arm rule: part-x < 0 -> ARM A (left), x > 0 -> ARM B (right),
 *  x == 0 / missing -> alternates A,B,A,B (deterministic, not random),
 *  mass > 5 kg -> 'A+B' two-arm lift regardless of side. */
export function planOps(spec){
  const parts = (spec && spec.parts) || [];
  const byId = new Map(parts.map(p => [p.id, p]));
  const mass = new Map(measuresFor(spec).map(m => [m.id, m.massG]));
  const asm = (spec && spec.assembly && spec.assembly.length)
    ? spec.assembly
    : parts.map(p => ({ part: p.id, insert_from: [0, 0, 1] }));
  const joints = (spec && spec.joints) || [];
  const placed = new Set(), done = new Set();
  let amb = 0;
  const ops = [];
  for (const a of asm){
    const p = byId.get(a.part);
    const x = p && Array.isArray(p.position) ? +p.position[0] : NaN;
    const g = mass.get(a.part);
    const heavy = isFinite(g) && g > HEAVY_G;
    const arm = heavy ? 'A+B'
              : (isFinite(x) && x !== 0) ? (x < 0 ? 'A' : 'B')
              : ((amb++ % 2) ? 'B' : 'A');
    ops.push({ kind: 'place', part: a.part, arm, heavy,
               glyph: dirGlyph(a.insert_from), feed: a.insert_from || null,
               seat: p ? p.position : null, massG: isFinite(g) ? g : null });
    placed.add(a.part);
    joints.forEach((j, ji) => {
      if (done.has(ji) || !placed.has(j.a) || !placed.has(j.b)) return;
      done.add(ji);
      ops.push({ kind: 'joint', type: j.type || 'fixed', a: j.a, b: j.b,
                 axis: j.axis || null, anchor: j.anchor || null });
    });
  }
  // joints the assembly order never closes (spec gap) — still surfaced honestly
  joints.forEach((j, ji) => {
    if (done.has(ji) || !byId.has(j.a) || !byId.has(j.b)) return;
    done.add(ji);
    ops.push({ kind: 'joint', type: j.type || 'fixed', a: j.a, b: j.b,
               axis: j.axis || null, anchor: j.anchor || null, late: true });
  });
  return ops;
}

const JOINT_OP = {
  fixed: 'press + weld',
  revolute: 'align + hinge',
  prismatic: 'align + slide-fit',
};

/* ------------------------------- renders --------------------------------- */
/** Measures tab — per-part stats table computed live from the spec. */
export function renderMeasures(panel, spec){
  const rows = measuresFor(spec);
  if (!rows.length){
    panel.append(emptyBox('no parts measured yet —',
      'the stats table lands with the first spec', 'DIMS · VOL · MASS'));
    return;
  }
  const t = h('table', 'mtab');
  const thead = h('thead');
  const hr = h('tr');
  for (const [txt, r] of [['part', 0], ['dims mm', 1], ['vol mm³', 1], ['mass', 1], ['ρ kg/m³', 1]])
    hr.append(h('th', r ? 'r' : null, txt));
  thead.append(hr);
  t.append(thead);
  const tb = h('tbody');
  let tv = 0, tm = 0;
  for (const r of rows){
    tv += r.volMM3; tm += r.massG;
    const tr = h('tr');
    const idc = h('td', 'id', r.id);
    idc.append(h('span', 'sh', r.shape));
    tr.append(
      idc,
      h('td', 'r', r.dims.map(num).join(' × ')),
      h('td', 'r', big(r.volMM3)),
      h('td', 'r' + (r.massG > HEAVY_G ? ' heavy' : ''), massStr(r.massG)),
      h('td', 'r', big(r.density))
    );
    tb.append(tr);
  }
  const tr = h('tr', 'total');
  tr.append(
    h('td', 'id', 'Σ ' + rows.length + ' part' + (rows.length === 1 ? '' : 's')),
    h('td', 'r', ''),
    h('td', 'r', big(tv)),
    h('td', 'r', massStr(tm)),
    h('td', 'r', '')
  );
  tb.append(tr);
  t.append(tb);
  panel.append(t);
  panel.append(h('div', 'mnote',
    'dims = spec-space AABB extents · volume via partVolume · mass = volume × spec.materials density (fallback ' +
    big(FALLBACK_DENSITY) + ' kg/m³) · all mm'));
}

/** Arms tab — two-arm workcell program generated from the spec. */
export function renderBuildPlan(panel, spec, report){
  const parts = (spec && spec.parts) || [];
  if (!parts.length){
    panel.append(emptyBox('the cell program inks itself with the first spec', '', 'TWO-ARM CELL'));
    return;
  }
  const verified = !!(report && report.pass);
  const note = h('div', 'cell-note');
  note.append(
    h('b', null, 'A/B — two-arm cell · vision-guided'),
    document.createTextNode(' — ' + (verified
      ? 'this plan is generated from the verified spec'
      : report
        ? 'generated from the draft spec — verification failed; provisional'
        : 'generated from the draft spec — checks pending')),
    h('div', 'cell-sub',
      'order = spec.assembly · arrow = direction the part comes from · load = measured part mass')
  );
  panel.append(note);

  const ops = planOps(spec);
  const asmSet = new Set(((spec && spec.assembly) || []).map(a => a.part));
  const unplaced = parts.map(p => p.id).filter(id => !asmSet.has(id));
  if (unplaced.length)
    panel.append(h('div', 'cell-note warn',
      '⚠ ' + unplaced.length + ' part' + (unplaced.length === 1 ? '' : 's') +
      ' missing from spec.assembly — no place op generated: ' + unplaced.join(', ')));
  const list = h('div', 'plan');
  let stepNo = 0, jops = 0, lifts = 0;
  for (const op of ops){
    if (op.kind === 'place'){
      stepNo++;
      if (op.heavy) lifts++;
      const r = h('div', 'pstep');
      const act = h('span', 'pact');
      const dg = h('span', 'dir', op.glyph);
      dg.setAttribute('title', 'insert_from ' + vec(op.feed));
      act.append(
        document.createTextNode('place '),
        h('b', null, op.part),
        document.createTextNode(' from '),
        dg
      );
      r.append(
        h('span', 'asm-num', String(stepNo)),
        h('span', 'armtag ' + (op.arm === 'A' ? 'a' : op.arm === 'B' ? 'b' : 'ab'),
          'ARM ' + op.arm),
        act,
        h('span', 'load' + (op.heavy ? ' heavy' : ''),
          op.massG == null ? '—' : massStr(op.massG) + (op.heavy ? ' · 2-arm lift' : ''))
      );
      const wrap = h('div', 'pwrap');
      wrap.append(r, h('div', 'psub',
        'insert_from ' + vec(op.feed) + (op.seat ? '  →  seat ' + vec(op.seat) : '')));
      list.append(wrap);
    } else {
      jops++;
      const j = h('div', 'jop' + (op.late ? ' late' : ''));
      j.append(
        h('span', 'tag ' + op.type, op.type),
        h('span', null,
          op.a + ' ↔ ' + op.b + ' — ' + (JOINT_OP[op.type] || 'secure') +
          (op.type === 'revolute' && op.axis ? ' · axis ' + vec(op.axis) : '') +
          (op.anchor ? ' · @ ' + vec(op.anchor) : '') +
          (op.late ? ' · post-step' : ''))
      );
      list.append(j);
    }
  }
  panel.append(list);
  panel.append(h('div', 'mnote',
    stepNo + ' place op' + (stepNo === 1 ? '' : 's') + ' · ' + jops + ' joint op' + (jops === 1 ? '' : 's') + (lifts ? ' · ' + lifts + ' two-arm lift' + (lifts > 1 ? 's' : '') : '') +
    ' · x<0 → arm A · x>0 → arm B · centre alternates · >' + (HEAVY_G / 1000) + ' kg → both arms' +
    ' · deterministic — recomputed from spec'));
}
