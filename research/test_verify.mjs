// Verification-lane test: good lamp, bad tower, hinge clearance specs.
// Run from repo root:  node research/test_verify.mjs
import { runVerification } from '../src/verify/engine.js';

// --- spec 1: desk lamp — stable, insertable, should PASS ---------------------
const lamp = {
  name: 'lamp', units: 'mm',
  materials: { pla: { density: 1240, color: '#cfd4da' }, steel: { density: 7850, color: '#888' } },
  parts: [
    { id: 'base',  shape: 'cylinder', size: { r: 40, h: 12 }, material: 'steel', position: [0, 0, 6],   rotation: [0, 0, 0] },  // z 0..12
    { id: 'stem',  shape: 'cylinder', size: { r: 4,  h: 80 }, material: 'pla',   position: [0, 0, 52],  rotation: [0, 0, 0] },  // z 12..92
    { id: 'shade', shape: 'cone',     size: { r: 35, h: 30 }, material: 'pla',   position: [0, 0, 107], rotation: [0, 0, 0] },  // z 92..122
  ],
  joints: [
    { a: 'base', b: 'stem',  type: 'fixed', axis: [0, 0, 1], anchor: [0, 0, 12] },
    { a: 'stem', b: 'shade', type: 'fixed', axis: [0, 0, 1], anchor: [0, 0, 92] },
  ],
  assembly: [
    { part: 'base',  insert_from: [0, 0, 1] },
    { part: 'stem',  insert_from: [0, 0, 1] },
    { part: 'shade', insert_from: [0, 0, 1] },
  ],
  tests: { min_clearance_mm: 0.5, max_tip_angle_deg: 12 },
};

// --- spec 2: bad tower — stability + collision + assembly must FAIL ----------
const tower = {
  name: 'top-heavy tower', units: 'mm',
  materials: { pla: { density: 1240, color: '#ccc' } },
  parts: [
    { id: 'foot',   shape: 'box', size: [6, 6, 4],    material: 'pla', position: [0, 0, 2] },    // z 0..4, tiny base
    { id: 'column', shape: 'box', size: [4, 4, 60],   material: 'pla', position: [0, 0, 34] },   // z 4..64
    { id: 'head',   shape: 'box', size: [40, 40, 20], material: 'pla', position: [20, 0, 74] },  // z 64..84, CoM way off-axis
    { id: 'badge',  shape: 'box', size: [6, 6, 6],    material: 'pla', position: [6, 0, 61] },   // under head overhang → blocked from top
    { id: 'lump',   shape: 'box', size: [10, 10, 10], material: 'pla', position: [38, 0, 79] },  // inside head → unjointed collision
  ],
  joints: [
    { a: 'foot', b: 'column', type: 'fixed', axis: [0, 0, 1], anchor: [0, 0, 4] },
    { a: 'column', b: 'head', type: 'fixed', axis: [0, 0, 1], anchor: [1, 0, 64] },
  ],
  assembly: [
    { part: 'foot',   insert_from: [0, 0, 1] },
    { part: 'column', insert_from: [0, 0, 1] },
    { part: 'head',   insert_from: [0, 0, 1] },
    { part: 'badge',  insert_from: [0, 0, 1] },  // comes after head → must pass through it
    { part: 'lump',   insert_from: [1, 0, 0] },  // comes from +x side
  ],
  tests: { min_clearance_mm: 0.5 },
};

// --- spec 3: hinge — revolute joint, 2.5mm face gap → clearance pass ---------
const hinge = {
  name: 'hinge', units: 'mm',
  materials: { steel: { density: 7850, color: '#999' } },
  parts: [
    { id: 'leafA', shape: 'box', size: [4, 30, 20], material: 'steel', position: [0, 0, 10] },   // x -2..2
    { id: 'leafB', shape: 'box', size: [4, 30, 20], material: 'steel', position: [6.5, 0, 10] }, // x 4.5..8.5 → 2.5mm gap
  ],
  joints: [{ a: 'leafA', b: 'leafB', type: 'revolute', axis: [0, 1, 0], anchor: [3.25, 0, 10] }],
  assembly: [
    { part: 'leafA', insert_from: [0, 0, 1] },
    { part: 'leafB', insert_from: [0, 0, 1] },
  ],
  tests: { min_clearance_mm: 0.5 },
};

// --- spec 4: tight hinge — 0.2mm gap < 0.5 required → clearance FAIL ---------
const hingeTight = {
  name: 'binding hinge', units: 'mm',
  materials: { steel: { density: 7850, color: '#999' } },
  parts: [
    { id: 'leafA', shape: 'box', size: [4, 30, 20], material: 'steel', position: [0, 0, 10] },   // x -2..2
    { id: 'leafB', shape: 'box', size: [4, 30, 20], material: 'steel', position: [4.2, 0, 10] }, // x 2.2..6.2 → 0.2mm gap
  ],
  joints: [{ a: 'leafA', b: 'leafB', type: 'revolute', axis: [0, 1, 0], anchor: [2.1, 0, 10] }],
  assembly: [
    { part: 'leafA', insert_from: [0, 0, 1] },
    { part: 'leafB', insert_from: [0, 0, 1] },
  ],
  tests: { min_clearance_mm: 0.5 },
};

// --- spec 5: knuckle — parts interleaved along the joint axis, 0.8mm gap -----
const knuckle = {
  name: 'knuckle', units: 'mm',
  materials: { steel: { density: 7850, color: '#999' } },
  parts: [
    { id: 'leafA', shape: 'box', size: [20, 4, 20], material: 'steel', position: [0, 2, 0] },    // y 0..4
    { id: 'leafB', shape: 'box', size: [20, 4, 20], material: 'steel', position: [0, 6.8, 0] },  // y 4.8..8.8 → 0.8mm axis gap
  ],
  joints: [{ a: 'leafA', b: 'leafB', type: 'revolute', axis: [0, 1, 0], anchor: [0, 4.4, 0] }],
  assembly: [
    { part: 'leafA', insert_from: [0, 0, 1] },
    { part: 'leafB', insert_from: [0, 0, 1] },
  ],
  tests: { min_clearance_mm: 0.5 },
};

// ---------------------------------------------------------------------------
const specs = { lamp, tower, hinge, hingeTight, knuckle };
const results = {};
for (const [k, s] of Object.entries(specs)) results[k] = runVerification(s, null);

for (const [k, r] of Object.entries(results)) {
  console.log(`\n=== ${k} — pass=${r.pass}  (${r.timingMs}ms) ===`);
  for (const c of r.checks)
    console.log(`  ${c.status.toUpperCase().padEnd(4)}  ${c.name.padEnd(14)} ${c.measured ?? '—'}  ${c.detail}`);
  console.log(`  explodedOrder: ${r.explodedOrder.join(' → ')}`);
  if (r.failures.length) console.log('  failures:\n    ' + r.failures.join('\n    '));
}

// ---------------------------------------------------------------------------
const byName = (r) => Object.fromEntries(r.checks.map(c => [c.name, c]));
const expect = [];
const ck = (label, cond) => { expect.push([label, !!cond]); };

const L = byName(results.lamp);
ck('lamp: overall pass', results.lamp.pass);
ck('lamp: sanity pass', L['spec sanity'].status === 'pass');
ck('lamp: collision pass', L['collision'].status === 'pass');
ck('lamp: stability pass w/ margin', L['stability'].status === 'pass' && L['stability'].measured > 5);
ck('lamp: assembly pass', L['assembly order'].status === 'pass');
ck('lamp: clearance pass (no movable joints)', L['clearance'].status === 'pass');
ck('lamp: explodedOrder kept', results.lamp.explodedOrder.join(',') === 'base,stem,shade');

const T = byName(results.tower);
ck('tower: overall fail', !results.tower.pass);
ck('tower: collision fail (lump∩head)', T['collision'].status === 'fail' && T['collision'].detail.includes('lump'));
ck('tower: stability fail (CoM outside)', T['stability'].status === 'fail' && T['stability'].measured < 0);
ck('tower: assembly fail (badge blocked)', T['assembly order'].status === 'fail' && /badge/.test(T['assembly order'].detail));
ck('tower: badge reordered before head', results.tower.explodedOrder.indexOf('badge') < results.tower.explodedOrder.indexOf('head'));
ck('tower: failures[] non-empty strings', results.tower.failures.length >= 3 && results.tower.failures.every(f => typeof f === 'string'));

const H = byName(results.hinge), HT = byName(results.hingeTight), K = byName(results.knuckle);
ck('hinge: clearance pass ~2.5mm', H['clearance'].status === 'pass' && H['clearance'].measured > 2 && H['clearance'].measured < 3);
ck('hingeTight: clearance FAIL ~0.2mm', HT['clearance'].status === 'fail' && HT['clearance'].measured < 0.5);
ck('knuckle: axis-gap measured ~0.8mm', K['clearance'].measured > 0.5 && K['clearance'].measured < 1.2 && K['clearance'].status !== 'fail');
ck('all: fast (<2000ms each)', Object.values(results).every(r => r.timingMs < 2000));

console.log('\n=== expectations ===');
let allOk = true;
for (const [label, ok] of expect) { if (!ok) allOk = false; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(allOk ? '\nALL PASS' : '\nSOME EXPECTATIONS FAILED');
process.exit(allOk ? 0 : 1);
