// Inkbench verification — REAL geometric checks. No fake numbers: every
// measured value comes from tessellated part geometry in spec space (mm, z-up).
//
// Conventions (per src/spec.js + cad/geometry.js):
//   - spec space: right-handed, Z up, mm. position = part CENTER.
//   - rotation = Euler radians, three.js 'XYZ' order, applied about the center.
//   - shapes centered on local origin; cylinder/cone/capsule axis = local z;
//     extrude profile in local xy, extruded h and recentered on z.
//   - insert_from = direction the part arrives FROM; it travels -insert_from.
//
// Shared math: ../cad/geometry.js is the single source of truth when present
// (partAABB / partVolume / aabbOverlap / meshForShape / specTRS). Loaded via a
// guarded dynamic import so this module also works standalone; the local
// fallbacks are real implementations (mesh-derived), never estimates.
//
// IMPORTANT: built.parts[*].mesh lives in THREE space (Y-up) — never use
// mesh.matrixWorld here. The mesh GEOMETRY is spec-local, so spec-space world
// triangles are geometry × specTRS(partSpec).

import * as THREE from 'three';

let SHARED = null;
try {
  SHARED = await import('../cad/geometry.js');
  if (!SHARED?.partAABB || !SHARED?.partVolume || !SHARED?.meshForShape) SHARED = null; // unexpected shape — go local
} catch (e) {
  SHARED = null;
  if (typeof console !== 'undefined')
    console.warn('[verify] ../cad/geometry.js unavailable — local geometry fallback (' + (e?.message || e) + ')');
}

const DEPTH_TOL = 0.02;   // mm — penetration below this counts as touching, not colliding
const GROUND_TOL = 2.0;   // mm above global min-z that still counts as ground contact
const SAMPLE_CAP = 1200;  // max probe points per part in collision sampling
const INSIDE_CAP = 12;    // stop probing a pair after this many confirmed inside points
const RAY = (() => { const l = Math.hypot(1, 0.3741, 0.2119); return [1 / l, 0.3741 / l, 0.2119 / l]; })();

const okNum = (x) => Number.isFinite(x);
const v3 = (v) => Array.isArray(v) ? v : (v && 'x' in v ? [v.x, v.y, v.z] : null);

// ---------------------------------------------------------------------------
// geometry plumbing
// ---------------------------------------------------------------------------

// Spec-local BufferGeometry (z-up, origin = part center). Shared builder first
// (same tessellation the renderer shows), local fallback otherwise.
export function localGeometry(part) {
  if (SHARED?.meshForShape) {
    try {
      const g = SHARED.meshForShape(part.shape, part.size);
      if (g?.attributes?.position) return g;
    } catch { /* fall through */ }
  }
  const s = part.size;
  switch (part.shape) {
    case 'box': {
      const a = Array.isArray(s) ? s : [s?.w ?? s?.x, s?.h ?? s?.y, s?.d ?? s?.z];
      return new THREE.BoxGeometry(a[0], a[1], a[2]);
    }
    case 'sphere': {
      const r = typeof s === 'number' ? s : (s?.r ?? s?.radius ?? s?.[0]);
      return new THREE.SphereGeometry(r, 28, 20);
    }
    case 'cylinder': {
      const r = s?.r ?? s?.radius, h = s?.h ?? s?.height;
      return new THREE.CylinderGeometry(r, r, h, 28).rotateX(Math.PI / 2);
    }
    case 'cone': {
      const r = s?.r ?? s?.radius, h = s?.h ?? s?.height;
      return new THREE.ConeGeometry(r, h, 28).rotateX(Math.PI / 2);
    }
    case 'capsule': { // h = TOTAL height incl. caps (geometry.js convention)
      const r = s?.r ?? s?.radius, h = s?.h ?? s?.height;
      return new THREE.CapsuleGeometry(r, Math.max(h - 2 * r, 0), 6, 20).rotateX(Math.PI / 2);
    }
    case 'extrude': {
      const pts = (s?.points || []).map(p => new THREE.Vector2(p[0], p[1]));
      const h = s?.h ?? s?.depth ?? 1;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, -h / 2);
      return g;
    }
    default:
      throw new Error('unknown shape: ' + part.shape);
  }
}

// Spec-space local->world transform for a part.
export function partMatrix(part) {
  if (SHARED?.specTRS) { try { return SHARED.specTRS(part); } catch { /* fall through */ } }
  const p = v3(part.position) || [0, 0, 0];
  const r = v3(part.rotation) || [0, 0, 0];
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0] || 0, r[1] || 0, r[2] || 0, 'XYZ'));
  m.setPosition(p[0] || 0, p[1] || 0, p[2] || 0);
  return m;
}

// Triangles in SPEC space: { v: Float64Array xyz, idx, triCount }.
// Uses the built mesh's geometry when available (it's spec-local — never its
// matrixWorld, which is three-space), else tessellates from the spec.
export function partTris(part, built) {
  let geom = built?.parts?.get?.(part.id)?.mesh?.geometry ?? null;
  if (!geom?.attributes?.position) geom = localGeometry(part);
  const mat = partMatrix(part);
  const pos = geom.attributes.position;
  const v = new Float64Array(pos.count * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).applyMatrix4(mat);
    v[i * 3] = tmp.x; v[i * 3 + 1] = tmp.y; v[i * 3 + 2] = tmp.z;
  }
  const idx = geom.index ? geom.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
  return { v, idx, triCount: idx.length / 3 };
}

export function aabbFromTris(T) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T.v.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (T.v[i + k] < mn[k]) mn[k] = T.v[i + k];
      if (T.v[i + k] > mx[k]) mx[k] = T.v[i + k];
    }
  return { min: mn, max: mx };
}

export function partAABB(part, built) {
  if (SHARED?.partAABB) {
    try {
      const b = SHARED.partAABB(part);
      const mn = v3(b?.min ?? b?.[0]), mx = v3(b?.max ?? b?.[1]);
      if (mn && mx && mn.every(okNum) && mx.every(okNum)) return { min: mn, max: mx };
    } catch { /* fall through */ }
  }
  try { return aabbFromTris(partTris(part, built)); } catch { return null; }
}

function localAABBOverlap(a, b) { // strict — pure face-touching is NOT an overlap
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
         a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
         a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

export function aabbOverlap(a, b) {
  if (SHARED?.aabbOverlap) {
    try { const r = SHARED.aabbOverlap(a, b); if (typeof r === 'boolean') return r; } catch { /* fall through */ }
  }
  return localAABBOverlap(a, b);
}

// Signed-tetrahedron volume of a closed mesh (divergence theorem).
export function meshVolume(geom) {
  const p = geom.attributes.position, idx = geom.index ? geom.index.array : null;
  const n = idx ? idx.length : p.count;
  const g = (i) => idx ? idx[i] : i;
  let sum = 0;
  for (let t = 0; t < n; t += 3) {
    const a = g(t) * 3, b = g(t + 1) * 3, c = g(t + 2) * 3;
    sum += (p.array[a] * (p.array[b + 1] * p.array[c + 2] - p.array[b + 2] * p.array[c + 1])
          - p.array[a + 1] * (p.array[b] * p.array[c + 2] - p.array[b + 2] * p.array[c])
          + p.array[a + 2] * (p.array[b] * p.array[c + 1] - p.array[b + 1] * p.array[c])) / 6;
  }
  return Math.abs(sum);
}

// Volume-weighted centroid of a closed mesh, local coords.
export function meshCentroid(geom) {
  const p = geom.attributes.position, idx = geom.index ? geom.index.array : null;
  const n = idx ? idx.length : p.count;
  const g = (i) => idx ? idx[i] : i;
  let wsum = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < n; t += 3) {
    const a = g(t) * 3, b = g(t + 1) * 3, c = g(t + 2) * 3;
    const w = (p.array[a] * (p.array[b + 1] * p.array[c + 2] - p.array[b + 2] * p.array[c + 1])
             - p.array[a + 1] * (p.array[b] * p.array[c + 2] - p.array[b + 2] * p.array[c])
             + p.array[a + 2] * (p.array[b] * p.array[c + 1] - p.array[b + 1] * p.array[c])) / 6;
    wsum += w;
    cx += w * (p.array[a] + p.array[b] + p.array[c]) / 4;
    cy += w * (p.array[a + 1] + p.array[b + 1] + p.array[c + 1]) / 4;
    cz += w * (p.array[a + 2] + p.array[b + 2] + p.array[c + 2]) / 4;
  }
  if (Math.abs(wsum) < 1e-12) {
    for (let i = 0; i < p.count; i++) { cx += p.array[i * 3]; cy += p.array[i * 3 + 1]; cz += p.array[i * 3 + 2]; }
    return [cx / p.count, cy / p.count, cz / p.count];
  }
  return [cx / wsum, cy / wsum, cz / wsum];
}

export function partVolume(part) {
  if (SHARED?.partVolume) {
    try { const r = SHARED.partVolume(part); if (okNum(r) && r > 0) return r; } catch { /* fall through */ }
  }
  return meshVolume(localGeometry(part));
}

export function densityOf(spec, part) {
  const d = spec?.materials?.[part.material]?.density;
  return okNum(d) && d > 0 ? d : 1200; // fallback: generic plastic kg/m^3
}

function safeTris(part, built) {
  try { return partTris(part, built); } catch { return null; }
}

// ---------------------------------------------------------------------------
// low-level queries: ray-triangle, point-in-mesh, distances, tri intersection
// ---------------------------------------------------------------------------

// Möller–Trumbore ray vs triangle (ray origin p, fixed dir RAY). t>eps or -1.
function rayTri(ax, ay, az, bx, by, bz, cx, cy, cz, px, py, pz) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const hx = RAY[1] * e2z - RAY[2] * e2y, hy = RAY[2] * e2x - RAY[0] * e2z, hz = RAY[0] * e2y - RAY[1] * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const f = 1 / det;
  const sx = px - ax, sy = py - ay, sz = pz - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < -1e-9 || u > 1 + 1e-9) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const w = f * (RAY[0] * qx + RAY[1] * qy + RAY[2] * qz);
  if (w < -1e-9 || u + w > 1 + 1e-9) return -1;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t > 1e-6 ? t : -1;
}

// Segment (p -> p+d, t in (0,1)) vs triangle. Returns t or -1.
function segTri(px, py, pz, dx, dy, dz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const f = 1 / det;
  const sx = px - ax, sy = py - ay, sz = pz - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < -1e-9 || u > 1 + 1e-9) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const w = f * (dx * qx + dy * qy + dz * qz);
  if (w < -1e-9 || u + w > 1 + 1e-9) return -1;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return (t > 1e-6 && t < 1 - 1e-6) ? t : -1;
}

// All ray/triangle intersections of a ray (origin o, unit dir d) — sorted t list.
function rayHits(T, px, py, pz, dx, dy, dz) {
  const out = [];
  const { v, idx } = T;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = v[b] - v[a], e1y = v[b + 1] - v[a + 1], e1z = v[b + 2] - v[a + 2];
    const e2x = v[c] - v[a], e2y = v[c + 1] - v[a + 1], e2z = v[c + 2] - v[a + 2];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (det > -1e-12 && det < 1e-12) continue;
    const f = 1 / det;
    const sx = px - v[a], sy = py - v[a + 1], sz = pz - v[a + 2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = f * (dx * qx + dy * qy + dz * qz);
    if (w < -1e-9 || u + w > 1 + 1e-9) continue;
    const tt = f * (e2x * qx + e2y * qy + e2z * qz);
    if (tt > 1e-6) out.push(tt);
  }
  return out.sort((x, y) => x - y);
}

function pointInside(T, px, py, pz) {
  let hits = 0;
  const { v, idx } = T;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    if (rayTri(v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2], px, py, pz) > 0) hits++;
  }
  return (hits & 1) === 1;
}

const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(),
      _tp = new THREE.Vector3(), _tq = new THREE.Vector3(), _tri = new THREE.Triangle();

// Distance from point to mesh surface (min over triangles).
function distToMesh(T, px, py, pz) {
  let best = Infinity;
  _tp.set(px, py, pz);
  const { v, idx } = T;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    _tri.set(_ta.set(v[a], v[a + 1], v[a + 2]), _tb.set(v[b], v[b + 1], v[b + 2]), _tc.set(v[c], v[c + 1], v[c + 2]));
    _tri.closestPointToPoint(_tp, _tq);
    const d = _tp.distanceToSquared(_tq);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Per-triangle AABBs of a mesh — prefilter for edge/segment tests.
function triAABBs(T) {
  const n = T.idx.length / 3, bb = new Float64Array(n * 6);
  for (let t = 0; t < n; t++) {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = T.idx[t * 3 + k] * 3;
      if (T.v[i] < mnx) mnx = T.v[i]; if (T.v[i] > mxx) mxx = T.v[i];
      if (T.v[i + 1] < mny) mny = T.v[i + 1]; if (T.v[i + 1] > mxy) mxy = T.v[i + 1];
      if (T.v[i + 2] < mnz) mnz = T.v[i + 2]; if (T.v[i + 2] > mxz) mxz = T.v[i + 2];
    }
    bb.set([mnx, mny, mnz, mxx, mxy, mxz], t * 6);
  }
  return bb;
}

// Real mesh-mesh intersection + penetration estimate.
// For every mesh edge: gather ALL crossing parameters t where the edge pierces
// the other mesh's triangles (per-tri AABB prefilter). Sorted crossings split
// the edge into inside/outside intervals (closed-mesh parity, seeded by a
// point-in-mesh test on the start vertex); the midpoint of each inside
// interval is a guaranteed-inside probe point whose distance-to-surface is a
// real penetration depth. Returns { hit, depth }.
// Coplanar face-on-face contact produces no crossings → not an intersection.
function meshPenetration(Ta, Tb, aabbA, aabbB) {
  const oneWay = (src, dst, dstAabb) => {
    const nb = dst.idx.length / 3;
    const bb = triAABBs(dst);
    let hit = false, depth = 0;
    const nT = src.idx.length;
    for (let t = 0; t < nT; t += 3) {
      const ai = [src.idx[t] * 3, src.idx[t + 1] * 3, src.idx[t + 2] * 3];
      // src tri AABB vs dst whole AABB — skip most edges instantly
      let tmnx = Infinity, tmny = Infinity, tmnz = Infinity, tmxx = -Infinity, tmxy = -Infinity, tmxz = -Infinity;
      for (const i of ai) {
        if (src.v[i] < tmnx) tmnx = src.v[i]; if (src.v[i] > tmxx) tmxx = src.v[i];
        if (src.v[i + 1] < tmny) tmny = src.v[i + 1]; if (src.v[i + 1] > tmxy) tmxy = src.v[i + 1];
        if (src.v[i + 2] < tmnz) tmnz = src.v[i + 2]; if (src.v[i + 2] > tmxz) tmxz = src.v[i + 2];
      }
      if (tmxx < dstAabb.min[0] || tmnx > dstAabb.max[0] ||
          tmxy < dstAabb.min[1] || tmny > dstAabb.max[1] ||
          tmxz < dstAabb.min[2] || tmnz > dstAabb.max[2]) continue;
      for (let e = 0; e < 3; e++) {
        const p = ai[e], q = ai[(e + 1) % 3];
        const dx = src.v[q] - src.v[p], dy = src.v[q + 1] - src.v[p + 1], dz = src.v[q + 2] - src.v[p + 2];
        const emn = [Math.min(src.v[p], src.v[q]), Math.min(src.v[p + 1], src.v[q + 1]), Math.min(src.v[p + 2], src.v[q + 2])];
        const emx = [Math.max(src.v[p], src.v[q]), Math.max(src.v[p + 1], src.v[q + 1]), Math.max(src.v[p + 2], src.v[q + 2])];
        const raw = [];
        for (let s = 0; s < nb; s++) {
          const o = s * 6;
          if (emx[0] < bb[o] || emn[0] > bb[o + 3] || emx[1] < bb[o + 1] || emn[1] > bb[o + 4] || emx[2] < bb[o + 2] || emn[2] > bb[o + 5]) continue;
          const bi = [dst.idx[s * 3] * 3, dst.idx[s * 3 + 1] * 3, dst.idx[s * 3 + 2] * 3];
          const r = segTri(src.v[p], src.v[p + 1], src.v[p + 2], dx, dy, dz,
                           dst.v[bi[0]], dst.v[bi[0] + 1], dst.v[bi[0] + 2], dst.v[bi[1]], dst.v[bi[1] + 1], dst.v[bi[1] + 2], dst.v[bi[2]], dst.v[bi[2] + 1], dst.v[bi[2] + 2]);
          if (r >= 0) raw.push(r);
        }
        if (!raw.length) continue;
        hit = true;
        raw.sort((a, b) => a - b);
        // merge coincident crossings: a run of n hits at same t toggles parity n%2 times
        const ts = [];
        for (let i = 0; i < raw.length; i++) {
          let j = i; while (j + 1 < raw.length && raw[j + 1] - raw[i] < 1e-5) j++;
          if ((j - i + 1) % 2 === 1) ts.push(raw[i]);
          i = j;
        }
        let inside = pointInside(dst, src.v[p], src.v[p + 1], src.v[p + 2]);
        let prev = 0;
        const midProbe = (a, b) => {
          if (b - a < 1e-7) return;
          const m = (a + b) / 2;
          const d = distToMesh(dst, src.v[p] + dx * m, src.v[p + 1] + dy * m, src.v[p + 2] + dz * m);
          if (d > depth) depth = d;
        };
        for (const tc of ts) { if (inside) midProbe(prev, tc); inside = !inside; prev = tc; }
        if (inside) midProbe(prev, 1);
      }
    }
    return { hit, depth };
  };
  const r1 = oneWay(Ta, Tb, aabbB);
  const r2 = oneWay(Tb, Ta, aabbA);
  return { hit: r1.hit || r2.hit, depth: Math.max(r1.depth, r2.depth) };
}

// ---------------------------------------------------------------------------
// 0. spec sanity — always first
// ---------------------------------------------------------------------------

export function sanityCheck(spec) {
  const errors = [], warns = [];
  if (!spec || typeof spec !== 'object') {
    return { name: 'spec sanity', status: 'fail', detail: 'spec is not an object', measured: null,
             failures: ['spec sanity: spec is not an object'], fatal: true };
  }
  const parts = Array.isArray(spec.parts) ? spec.parts : [];
  if (!parts.length) errors.push('parts array is empty or missing');

  const ids = new Set();
  for (const [i, p] of parts.entries()) {
    const tag = p?.id || `part[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`part[${i}] is not an object`); continue; }
    if (!p.id || typeof p.id !== 'string') errors.push(`part[${i}] missing string id`);
    else if (ids.has(p.id)) errors.push(`duplicate part id '${p.id}'`);
    else ids.add(p.id);
    // geometry validity: probe the same path checks will use
    if (!p.shape) errors.push(`'${tag}' missing shape`);
    else {
      const bb = partAABB(p, null);
      if (!bb || !bb.min.every(okNum) || !bb.max.every(okNum) ||
          !(bb.max[0] > bb.min[0]) || !(bb.max[1] > bb.min[1]) || !(bb.max[2] > bb.min[2]))
        errors.push(`'${tag}' has zero-size/degenerate geometry (shape '${p.shape}', bad size)`);
    }
    const pos = v3(p.position), rot = v3(p.rotation);
    if (pos && !(pos.length === 3 && pos.every(okNum))) errors.push(`'${tag}' has NaN position`);
    if (!pos) warns.push(`'${tag}' missing position — assumed [0,0,0]`);
    if (rot && !(rot.length === 3 && rot.every(okNum))) errors.push(`'${tag}' has NaN rotation`);
    if (p.material && spec.materials && !spec.materials[p.material])
      warns.push(`'${tag}' material '${p.material}' not in materials — density fallback 1200`);
  }

  for (const [i, j] of (spec.joints || []).entries()) {
    if (!ids.has(j.a)) errors.push(`joint[${i}] references unknown part '${j.a}'`);
    if (!ids.has(j.b)) errors.push(`joint[${i}] references unknown part '${j.b}'`);
    if (j.a === j.b) errors.push(`joint[${i}] connects '${j.a}' to itself`);
    if (!['fixed', 'revolute', 'prismatic'].includes(j.type))
      warns.push(`joint[${i}] '${j.a}~${j.b}' has unknown type '${j.type}' — treated as non-fixed`);
  }

  const inAssembly = new Set();
  for (const [i, a] of (spec.assembly || []).entries()) {
    if (!ids.has(a.part)) errors.push(`assembly[${i}] references unknown part '${a.part}'`);
    else inAssembly.add(a.part);
    const d = v3(a.insert_from);
    if (d && !(d.length === 3 && d.every(okNum))) warns.push(`assembly[${i}] '${a.part}' bad insert_from — default [0,0,1]`);
  }
  if (spec.assembly?.length) {
    const missing = [...ids].filter(id => !inAssembly.has(id));
    if (missing.length) warns.push(`parts missing from assembly order: ${missing.join(', ')}`);
  } else if (parts.length) {
    warns.push('no assembly order — using parts[] order, insert_from defaults [0,0,1]');
  }

  const detail = [...errors, ...warns].join('; ') || `ok — ${parts.length} parts, ${(spec.joints || []).length} joints`;
  const status = errors.length ? 'fail' : warns.length ? 'warn' : 'pass';
  return { name: 'spec sanity', status, detail, measured: errors.length + warns.length,
           failures: errors.map(e => 'spec sanity: ' + e), fatal: !parts.length };
}

// ---------------------------------------------------------------------------
// 1. collision check — AABB prefilter, then real triangle tests
// ---------------------------------------------------------------------------

export function collisionCheck(spec, built) {
  const parts = (spec?.parts || []).filter(p => p?.id);
  const data = new Map();
  for (const p of parts) {
    const T = safeTris(p, built);
    if (T && T.triCount > 0) data.set(p.id, { T, aabb: aabbFromTris(T) });
  }
  const fixedPairs = new Set();
  for (const j of spec?.joints || [])
    if (j.type === 'fixed') fixedPairs.add([j.a, j.b].sort().join('|'));

  const colliding = [], touchingFixed = [];
  const ids = [...data.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = data.get(ids[i]), B = data.get(ids[j]);
      if (!aabbOverlap(A.aabb, B.aabb)) continue;
      // --- real mesh test on the AABB-overlapping pair ---
      let maxDepth = 0, probes = 0;
      const probe = (src, dst, dstAabb) => {
        const cand = [];
        const nV = src.v.length / 3;
        const stride = Math.max(1, Math.floor(nV / (SAMPLE_CAP / 2)));
        for (let k = 0; k < nV; k += stride) cand.push([src.v[k * 3], src.v[k * 3 + 1], src.v[k * 3 + 2]]);
        const nT = src.idx.length / 3;
        const tStride = Math.max(1, Math.floor(nT / (SAMPLE_CAP / 2)));
        for (let t = 0; t < nT && cand.length < SAMPLE_CAP; t += tStride) {
          const a = src.idx[t * 3] * 3, b = src.idx[t * 3 + 1] * 3, c = src.idx[t * 3 + 2] * 3;
          cand.push([(src.v[a] + src.v[b] + src.v[c]) / 3, (src.v[a + 1] + src.v[b + 1] + src.v[c + 1]) / 3, (src.v[a + 2] + src.v[b + 2] + src.v[c + 2]) / 3]);
        }
        for (const [x, y, z] of cand) {
          if (probes >= INSIDE_CAP) return;
          if (x < dstAabb.min[0] || x > dstAabb.max[0] || y < dstAabb.min[1] || y > dstAabb.max[1] || z < dstAabb.min[2] || z > dstAabb.max[2]) continue;
          if (!pointInside(dst, x, y, z)) continue;
          probes++;
          const d = distToMesh(dst, x, y, z);
          if (d > maxDepth) maxDepth = d;
        }
      };
      probe(A.T, B.T, B.aabb);
      probe(B.T, A.T, A.aabb);
      const pen = meshPenetration(A.T, B.T, A.aabb, B.aabb);
      if (pen.depth > maxDepth) maxDepth = pen.depth;
      const collides = maxDepth > DEPTH_TOL || pen.hit;
      if (!collides) continue;
      const rec = { a: ids[i], b: ids[j], depth: maxDepth };
      if (fixedPairs.has([ids[i], ids[j]].sort().join('|'))) touchingFixed.push(rec);
      else colliding.push(rec);
    }
  }

  const failures = colliding.map(c =>
    `collision: '${c.a}' intersects '${c.b}'` + (c.depth > DEPTH_TOL ? ` (~${c.depth.toFixed(2)}mm penetration)` : ' (surface intersection)'));
  const detailParts = [];
  if (colliding.length) detailParts.push('colliding: ' + colliding.map(c => `${c.a}~${c.b} ${c.depth.toFixed(2)}mm`).join(', '));
  if (touchingFixed.length) detailParts.push('fixed-joint overlap (allowed): ' + touchingFixed.map(c => `${c.a}~${c.b} ${c.depth.toFixed(2)}mm`).join(', '));
  const status = colliding.length ? 'fail' : touchingFixed.length ? 'warn' : 'pass';
  return {
    name: 'collision', status,
    detail: detailParts.join(' | ') || `no interpenetration across ${ids.length} parts`,
    measured: Math.max(0, ...colliding.map(c => c.depth), ...touchingFixed.map(c => c.depth)),
    failures,
  };
}

// ---------------------------------------------------------------------------
// 2. stability — mass-weighted CoM projected into convex hull of ground footprint
// ---------------------------------------------------------------------------

function convexHull2D(pts) { // Andrew monotone chain → CCW hull
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

function hullSignedDist(hull, x, y) { // >0 inside (CCW hull); min distance to edges
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1e-12;
    const d = (ex * (y - a[1]) - ey * (x - a[0])) / l;
    if (d < best) best = d;
  }
  return best;
}

export function stabilityCheck(spec, built) {
  const parts = spec?.parts || [];
  let massSum = 0, cx = 0, cy = 0, cz = 0, minZ = Infinity;
  const boxes = new Map(), tris = new Map();
  for (const p of parts) {
    const T = safeTris(p, built);
    if (!T) continue;
    tris.set(p.id, T);
    const bb = aabbFromTris(T); boxes.set(p.id, bb);
    if (bb.min[2] < minZ) minZ = bb.min[2];
    let vol, centroid;
    try {
      const g = localGeometry(p);
      vol = partVolume(p);
      if (!okNum(vol) || vol <= 0) vol = meshVolume(g);
      centroid = meshCentroid(g);
    } catch { continue; }
    const c = new THREE.Vector3(...centroid).applyMatrix4(partMatrix(p));
    const m = vol * densityOf(spec, p);
    massSum += m; cx += m * c.x; cy += m * c.y; cz += m * c.z;
  }
  if (massSum <= 0 || !okNum(massSum))
    return { name: 'stability', status: 'warn', detail: 'no measurable mass', measured: null, failures: [] };
  const com = [cx / massSum, cy / massSum, cz / massSum];

  const groundIds = [...boxes.entries()].filter(([, b]) => b.min[2] <= minZ + GROUND_TOL).map(([id]) => id);
  const pts = [];
  for (const id of groundIds) {
    const T = tris.get(id);
    for (let i = 0; i < T.v.length; i += 3) pts.push([T.v[i], T.v[i + 1]]);
  }
  const hull = convexHull2D(pts);
  const area = hull.length >= 3 ? Math.abs(hull.reduce((s, p, i) => {
    const q = hull[(i + 1) % hull.length]; return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2) : 0;
  if (hull.length < 3 || area < 1e-3) {
    return { name: 'stability', status: 'fail', measured: null,
      detail: `support footprint degenerate (${groundIds.join('+')} → ${hull.length} hull points) — object cannot stand`,
      failures: [`stability: no usable support polygon (ground parts: ${groundIds.join(', ') || 'none'})`] };
  }
  const margin = hullSignedDist(hull, com[0], com[1]);
  const inside = margin >= -1e-9;
  const massKg = massSum * 1e-9;
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
  const base = `CoM=(${com.map(f1).join(',')})mm mass=${massKg.toFixed(3)}kg support={${groundIds.join('+')}} hull=${hull.length}pt/${area.toFixed(0)}mm² tip-margin=${margin.toFixed(2)}mm`;
  if (!inside)
    return { name: 'stability', status: 'fail', measured: +margin.toFixed(3), detail: base + ' — CoM outside support polygon',
      failures: [`stability: center of mass projects ${(-margin).toFixed(1)}mm outside the support polygon (ground: ${groundIds.join('+')}) — object tips over`] };
  const status = margin < 2 ? 'warn' : 'pass';
  return { name: 'stability', status, measured: +margin.toFixed(3), detail: base + (status === 'warn' ? ' — low margin' : ''), failures: [] };
}

// ---------------------------------------------------------------------------
// 3. assembly order — swept-AABB insertion simulation + topo-sort fix
// ---------------------------------------------------------------------------

// Moving box M travels from M+u*L down to M (u = insert_from unit, s = remaining
// distance to seat). Overlap interval in s clipped to [0,L], or null.
function sweepInterval(m, s, u, L) {
  let lo = 0, hi = L;
  for (let i = 0; i < 3; i++) {
    const ui = u[i];
    if (Math.abs(ui) < 1e-12) {
      if (m.min[i] >= s.max[i] || m.max[i] <= s.min[i]) return null; // never overlaps on this axis
    } else {
      let a = (s.min[i] - m.max[i]) / ui, b = (s.max[i] - m.min[i]) / ui;
      if (a > b) [a, b] = [b, a];
      if (a > lo) lo = a;
      if (b < hi) hi = b;
      if (lo > hi) return null;
    }
  }
  lo = Math.max(lo, 0); hi = Math.min(hi, L);
  return lo <= hi ? [lo, hi] : null;
}

export function assemblyOrderCheck(spec, built) {
  const parts = spec?.parts || [];
  const byId = new Map(parts.map(p => [p.id, p]));
  const aabbs = new Map();
  for (const p of parts) { const b = partAABB(p, built); if (b) aabbs.set(p.id, b); }

  const entries = spec?.assembly?.length
    ? spec.assembly
    : parts.map(p => ({ part: p.id, insert_from: [0, 0, 1] }));
  const dirOf = (e) => {
    let u = v3(e?.insert_from);
    if (!u || u.length !== 3 || !u.every(okNum) || Math.hypot(...u) < 1e-9) u = [0, 0, 1];
    const l = Math.hypot(...u); return u.map(x => x / l);
  };

  const orderIds = entries.map(e => e.part).filter(id => byId.has(id) && aabbs.has(id));
  for (const p of parts) if (!orderIds.includes(p.id) && aabbs.has(p.id)) orderIds.push(p.id);
  const dirMap = new Map(entries.map(e => [e.part, dirOf(e)]));

  const all = [...aabbs.values()];
  const sceneMin = [0, 1, 2].map(i => Math.min(...all.map(b => b.min[i])));
  const sceneMax = [0, 1, 2].map(i => Math.max(...all.map(b => b.max[i])));
  const diag = Math.hypot(sceneMax[0] - sceneMin[0], sceneMax[1] - sceneMin[1], sceneMax[2] - sceneMin[2]) || 1;
  const L = diag * 10;
  const epsF = Math.max(0.25, diag * 1e-4); // mm — "at final position" tolerance

  const simulate = (order) => {
    const placed = [], blocked = [];
    for (const id of order) {
      const u = dirMap.get(id) || [0, 0, 1];
      const m = aabbs.get(id);
      for (const qid of placed) {
        const iv = sweepInterval(m, aabbs.get(qid), u, L);
        if (iv && iv[1] > epsF) blocked.push({ part: id, blocker: qid, firstContactMm: iv[1] });
      }
      placed.push(id);
    }
    return blocked;
  };

  const blocked = simulate(orderIds);
  if (!blocked.length)
    return { name: 'assembly order', status: 'pass', measured: 0,
      detail: `all ${orderIds.length} parts insert cleanly along their insert_from directions`,
      failures: [], order: orderIds };

  // corrected order: the blocker must come AFTER the part it blocks (topo-sort)
  const adj = new Map(orderIds.map(id => [id, new Set()]));
  for (const b of blocked) adj.get(b.part)?.add(b.blocker);
  const origIdx = new Map(orderIds.map((id, i) => [id, i]));
  const topo = () => {
    const indeg = new Map(orderIds.map(id => [id, 0]));
    for (const [, outs] of adj) for (const o of outs) indeg.set(o, (indeg.get(o) || 0) + 1);
    const ready = orderIds.filter(id => !indeg.get(id)).sort((a, b) => origIdx.get(a) - origIdx.get(b));
    const out = [];
    while (ready.length) {
      const n = ready.shift(); out.push(n);
      for (const o of adj.get(n) || []) {
        indeg.set(o, indeg.get(o) - 1);
        if (!indeg.get(o)) { ready.push(o); ready.sort((a, b) => origIdx.get(a) - origIdx.get(b)); }
      }
    }
    return out.length === orderIds.length ? out : orderIds; // cycle → keep original
  };
  const corrected = topo();
  const residual = simulate(corrected);
  const seen = new Set();
  const bstrs = blocked.filter(b => !seen.has(b.part + b.blocker) && seen.add(b.part + b.blocker))
    .map(b => `'${b.part}' blocked by '${b.blocker}' (${b.firstContactMm.toFixed(1)}mm before seat)`);
  const failures = bstrs.map(s => 'assembly: ' + s);
  if (residual.length)
    failures.push(`assembly: suggested order still has ${residual.length} conflict(s) — geometry likely un-assemblable`);
  return {
    name: 'assembly order', status: 'fail', measured: blocked.length,
    detail: `${blocked.length} insertion conflict(s): ${bstrs.join('; ')}. Suggested order: ${corrected.join(' → ')}${residual.length ? ' (still conflicts)' : ' (verified clean)'}`,
    failures, order: corrected,
  };
}

// ---------------------------------------------------------------------------
// 4. clearance — revolute/prismatic joints: real surface gaps along joint axis
// ---------------------------------------------------------------------------

export function clearanceCheck(spec, built) {
  const minReq = spec?.tests?.min_clearance_mm ?? 0.5;
  const movable = (spec?.joints || []).filter(j => (j.type === 'revolute' || j.type === 'prismatic'));
  if (!movable.length)
    return { name: 'clearance', status: 'pass', measured: null, detail: 'no revolute/prismatic joints', failures: [] };

  const byId = new Map((spec?.parts || []).map(p => [p.id, p]));
  const jointReports = [];
  let worst = Infinity, fails = 0, warns = 0;

  for (const j of movable) {
    const pa = byId.get(j.a), pb = byId.get(j.b);
    const Ta = pa && safeTris(pa, built), Tb = pb && safeTris(pb, built);
    if (!Ta || !Tb) { jointReports.push(`'${j.a}~${j.b}': unmeasurable`); continue; }
    const ba = aabbFromTris(Ta), bb = aabbFromTris(Tb);

    let axis = v3(j.axis) || [0, 0, 1];
    if (!axis.every(okNum) || Math.hypot(...axis) < 1e-9) axis = [0, 0, 1];
    const al = Math.hypot(...axis); axis = axis.map(x => x / al);
    const anchor = v3(j.anchor) || [
      (ba.min[0] + ba.max[0] + bb.min[0] + bb.max[0]) / 4,
      (ba.min[1] + ba.max[1] + bb.min[1] + bb.max[1]) / 4,
      (ba.min[2] + ba.max[2] + bb.min[2] + bb.max[2]) / 4];

    // two unit vectors perpendicular to axis
    const seed = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const p1 = new THREE.Vector3(...axis).cross(new THREE.Vector3(...seed)).normalize();
    const p2 = new THREE.Vector3(...axis).cross(p1).normalize();
    const minDim = Math.min(
      ba.max[0] - ba.min[0], ba.max[1] - ba.min[1], ba.max[2] - ba.min[2],
      bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    const off = Math.max(0.5, minDim * 0.3);
    const origins = [[0, 0, 0], [off, 0, 0], [-off, 0, 0], [0, off, 0], [0, -off, 0]]
      .map(([a, b]) => [anchor[0] + p1.x * a + p2.x * b, anchor[1] + p1.y * a + p2.y * b, anchor[2] + p1.z * a + p2.z * b]);

    // along-axis gap: parallel lines through the joint; on any line where both
    // parts have surface hits, the gap is the separation of their hit intervals.
    let axisGap = null;
    for (const o of origins) {
      const ha = rayHits(Ta, o[0], o[1], o[2], axis[0], axis[1], axis[2])
        .concat(rayHits(Ta, o[0], o[1], o[2], -axis[0], -axis[1], -axis[2]).map(t => -t));
      const hb = rayHits(Tb, o[0], o[1], o[2], axis[0], axis[1], axis[2])
        .concat(rayHits(Tb, o[0], o[1], o[2], -axis[0], -axis[1], -axis[2]).map(t => -t));
      if (!ha.length || !hb.length) continue;
      const amin = Math.min(...ha), amax = Math.max(...ha), bmin = Math.min(...hb), bmax = Math.max(...hb);
      const gap = Math.max(bmin - amax, amin - bmax); // + separated, − interval overlap on the line
      axisGap = axisGap === null ? gap : Math.min(axisGap, gap);
    }

    // surface-to-surface minimum distance (vertex sampling, both directions)
    let surf = Infinity;
    const sample = (src, dst) => {
      const nV = src.v.length / 3, stride = Math.max(1, Math.floor(nV / 300));
      for (let k = 0; k < nV; k += stride) {
        const d = distToMesh(dst, src.v[k * 3], src.v[k * 3 + 1], src.v[k * 3 + 2]);
        if (d < surf) surf = d;
        if (surf < 1e-6) return;
      }
    };
    sample(Ta, Tb); if (surf > 1e-6) sample(Tb, Ta);

    const measured = Math.min(axisGap ?? Infinity, surf);
    if (measured < worst) worst = measured;
    const tag = measured < minReq ? (fails++, 'FAIL') : measured < minReq * 1.5 ? (warns++, 'tight') : 'ok';
    jointReports.push(`'${j.a}~${j.b}' (${j.type}): ${measured === Infinity ? 'n/a' : measured.toFixed(2) + 'mm'} [${tag}]` +
      (axisGap !== null ? ` axis-gap ${axisGap.toFixed(2)}` : ' axis-gap n/a') + ` surf ${surf === Infinity ? 'n/a' : surf.toFixed(2)}`);
  }

  const status = fails ? 'fail' : warns ? 'warn' : 'pass';
  const failures = fails
    ? [`clearance: ${fails} movable joint(s) below required ${minReq}mm — ` + jointReports.filter(r => r.includes('FAIL')).join('; ')]
    : [];
  return { name: 'clearance', status, measured: worst === Infinity ? null : +worst.toFixed(3),
    detail: `min_clearance_mm=${minReq} — ` + jointReports.join(' | '), failures };
}
