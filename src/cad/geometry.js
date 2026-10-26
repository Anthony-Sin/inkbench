// src/cad/geometry.js — Inkbench CAD core: shared spec-space math + geometry factory.
// Used by BOTH cad/renderer.js (draw it) and verify/engine.js (test it) — ONE source of truth.
//
// ======================== COORDINATE CONVENTION ========================
// DesignSpec space ("spec space"): right-handed, **Z is up**, millimetres.
//   position [x,y,z] = part CENTER.  rotation [rx,ry,rz] = euler radians,
//   three.js 'XYZ' order, applied in spec space about the part center.
// three.js world space ("three space"): right-handed, Y is up.
//   Mapping  spec -> three :  [x, y, z]  ->  [x, z, -y]
//   (rotation of -90° about the X axis; a proper rotation, no reflection.)
//   Same map applies to direction vectors (insert_from, joint axes, etc).
// Geometry produced by meshForShape() lives in the **spec local frame**:
//   +Z is up, origin = part center.  To place it in three space a mesh needs
//   position = C(pos) and quaternion = C * Euler(rot); to place it in spec
//   space (verify lane) use specTRS(partSpec) — both use THIS file's math so
//   conventions can never drift apart.
// =======================================================================
import * as THREE from 'three';

// C: spec basis expressed in three coords — rotation -PI/2 about X.
export const C_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/** spec [x,y,z] -> three [x,z,-y] (points or direction vectors alike). */
export function specToThree(p) { return [p[0], p[2], -p[1]]; }

/** same, writing into a THREE.Vector3. */
export function specToThreeVec3(p, out = new THREE.Vector3()) {
  return out.set(p[0], p[2], -p[1]);
}

/** spec-space euler [rx,ry,rz] (rad, 'XYZ' order) -> rotation Matrix4 in spec space. */
export function specEulerMatrix(rot = [0, 0, 0]) {
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ'));
}

/** spec euler -> equivalent quaternion for a three.js Object3D (includes basis change C). */
export function threeQuatForSpecEuler(rot = [0, 0, 0]) {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ'));
  return C_QUAT.clone().multiply(q); // C * R_spec
}

/** Full spec-space TRS: spec-local -> spec-world. Verify lane: apply to meshForShape geometry. */
export function specTRS(partSpec) {
  const m = specEulerMatrix(partSpec.rotation);
  const p = partSpec.position || [0, 0, 0];
  m.setPosition(p[0], p[1], p[2]);
  return m;
}

// ------------------------- size normalization -------------------------
// Canonical spec sizes:  box [w,h,d] (extents along spec x,y,z), {r,h}, {r},
// extrude {points:[[x,y],...], h}.  We also tolerate {w,h,d} objects,
// radius/height/depth spellings — LLM output varies.
function sizeOf(shape, size = {}) {
  switch (shape) {
    case 'box': {
      const s = Array.isArray(size)
        ? size
        : [size.w ?? size.x, size.h ?? size.y, size.d ?? size.z];
      return { x: +s[0] || 0, y: +s[1] || 0, z: +s[2] || 0 };
    }
    case 'cylinder':
    case 'cone':
    case 'capsule':
      return { r: +(size.r ?? size.radius) || 0, h: +(size.h ?? size.height) || 0 };
    case 'sphere':
      return { r: +(size.r ?? size.radius ?? (Array.isArray(size) ? size[0] : size)) || 0 };
    case 'extrude':
      return { points: size.points || [], h: +(size.h ?? size.depth) || 0 };
  }
  return {};
}

/** Tight AABB in the SPEC LOCAL frame (z-up, origin at part center). */
export function localAABB(shape, size) {
  const s = sizeOf(shape, size);
  switch (shape) {
    case 'box':
      return { min: [-s.x / 2, -s.y / 2, -s.z / 2], max: [s.x / 2, s.y / 2, s.z / 2] };
    case 'cylinder':
    case 'cone':
    case 'capsule':
      return { min: [-s.r, -s.r, -s.h / 2], max: [s.r, s.r, s.h / 2] };
    case 'sphere':
      return { min: [-s.r, -s.r, -s.r], max: [s.r, s.r, s.r] };
    case 'extrude': {
      const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
      if (!xs.length) return { min: [0, 0, -s.h / 2], max: [0, 0, s.h / 2] };
      return {
        min: [Math.min(...xs), Math.min(...ys), -s.h / 2],
        max: [Math.max(...xs), Math.max(...ys), s.h / 2],
      };
    }
  }
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

/**
 * partSpec -> spec-space world AABB {min:[x,y,z], max:[x,y,z]} (z-up, mm).
 * Box/extrude: exact — transforms the 8 corners of the tight local AABB.
 * Cylinder/cone/capsule/sphere: exact analytic bounds of the rotated body
 * (support-function projection onto each world axis; a = R*zhat is the
 * body's axis of symmetry in spec space).
 */
export function partAABB(partSpec) {
  const { shape } = partSpec;
  const s = sizeOf(shape, partSpec.size);
  const R = specEulerMatrix(partSpec.rotation);
  const e = R.elements;                 // column-major
  const a = [e[2], e[6], e[10]];        // a = R * zhat (shape axis in spec space)
  const p = partSpec.position || [0, 0, 0];
  const min = [0, 0, 0], max = [0, 0, 0];

  if (shape === 'sphere') {
    for (let i = 0; i < 3; i++) { min[i] = p[i] - s.r; max[i] = p[i] + s.r; }
    return { min, max };
  }
  if (shape === 'cylinder') {
    for (let i = 0; i < 3; i++) {
      const ext = Math.abs(a[i]) * s.h / 2 + s.r * Math.sqrt(Math.max(0, 1 - a[i] * a[i]));
      min[i] = p[i] - ext; max[i] = p[i] + ext;
    }
    return { min, max };
  }
  if (shape === 'capsule') {
    // capsule = segment (half-length max(h/2 - r, 0) along a) swept by radius r
    const seg = Math.max(s.h / 2 - s.r, 0);
    for (let i = 0; i < 3; i++) {
      const ext = Math.abs(a[i]) * seg + s.r;
      min[i] = p[i] - ext; max[i] = p[i] + ext;
    }
    return { min, max };
  }
  if (shape === 'cone') {
    // apex at +a*h/2, base disc (radius r) at -a*h/2 — asymmetric, so min/max both ends
    for (let i = 0; i < 3; i++) {
      const apex = p[i] + a[i] * s.h / 2;
      const base = p[i] - a[i] * s.h / 2;
      const rad = s.r * Math.sqrt(Math.max(0, 1 - a[i] * a[i]));
      min[i] = Math.min(apex, base - rad);
      max[i] = Math.max(apex, base + rad);
    }
    return { min, max };
  }
  // box | extrude | unknown: transform 8 corners of the tight local AABB (exact)
  const L = localAABB(shape, partSpec.size);
  min[0] = min[1] = min[2] = Infinity;
  max[0] = max[1] = max[2] = -Infinity;
  for (let ci = 0; ci < 8; ci++) {
    const c = [
      (ci & 1) ? L.max[0] : L.min[0],
      (ci & 2) ? L.max[1] : L.min[1],
      (ci & 4) ? L.max[2] : L.min[2],
    ];
    for (let i = 0; i < 3; i++) {
      const w = e[i] * c[0] + e[i + 4] * c[1] + e[i + 8] * c[2] + p[i];
      if (w < min[i]) min[i] = w;
      if (w > max[i]) max[i] = w;
    }
  }
  return { min, max };
}

/** Analytic volume in mm^3. */
export function partVolume(partSpec) {
  const s = sizeOf(partSpec.shape, partSpec.size);
  switch (partSpec.shape) {
    case 'box':      return s.x * s.y * s.z;
    case 'cylinder': return Math.PI * s.r * s.r * s.h;
    case 'sphere':   return (4 / 3) * Math.PI * s.r ** 3;
    case 'cone':     return Math.PI * s.r * s.r * s.h / 3;
    case 'capsule':  return Math.PI * s.r * s.r * Math.max(s.h - 2 * s.r, 0)
                     + (4 / 3) * Math.PI * s.r ** 3;
    case 'extrude':  return Math.abs(polygonArea(s.points)) * s.h;
  }
  return 0;
}

function polygonArea(pts) {
  const P = dedupeClosed(pts);
  let sum = 0;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function dedupeClosed(pts) {
  const P = (pts || []).filter(q => q && q.length >= 2);
  if (P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
  return P;
}

/**
 * BufferGeometry for a part shape in the **spec local frame**
 * (z-up, origin = part center). Shared by renderer (which wraps it in a mesh
 * applying C) and the verify engine (which applies specTRS).
 *   box [w,h,d]      -> extents along spec x,y,z
 *   cylinder/cone/capsule {r,h} -> axis along spec z, z in [-h/2, h/2]
 *     (capsule h = TOTAL height incl. caps — same invariant as cylinder)
 *   sphere {r}
 *   extrude {points,h} -> profile in spec xy-plane, extruded along spec z,
 *     z in [-h/2, h/2]; shape is explicitly closed.
 */
export function meshForShape(shape, size) {
  const s = sizeOf(shape, size);
  let g;
  switch (shape) {
    case 'box':
      g = new THREE.BoxGeometry(s.x, s.y, s.z);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(s.r, s.r, s.h, 48).rotateX(Math.PI / 2);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(s.r, s.h, 48).rotateX(Math.PI / 2); // apex +z
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(s.r, 40, 28);
      break;
    case 'capsule':
      g = new THREE.CapsuleGeometry(s.r, Math.max(s.h - 2 * s.r, 0), 12, 32).rotateX(Math.PI / 2);
      break;
    case 'extrude': {
      const pts = dedupeClosed(s.points);
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      sh.closePath(); // spec requires the shape closed
      g = new THREE.ExtrudeGeometry(sh, { depth: s.h, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, -s.h / 2); // recenter: profile plane already IS spec-xy
      break;
    }
    default:
      g = new THREE.BoxGeometry(1, 1, 1); // unknown shape: 1mm marker, never crash
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Strict overlap test — true iff the AABBs' interiors intersect (touching != overlap). */
export function aabbOverlap(a, b) {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0]
      && a.min[1] < b.max[1] && a.max[1] > b.min[1]
      && a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

/**
 * Separation between two spec-space AABBs.
 *   > 0 : disjoint — Euclidean clearance between the boxes.
 *  <= 0 : overlapping — equals -(shallowest penetration depth along any axis).
 * Handy for tests.min_clearance_mm.
 */
export function aabbGap(a, b) {
  const dx = Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0]);
  const dy = Math.max(a.min[1] - b.max[1], b.min[1] - a.max[1]);
  const dz = Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2]);
  if (dx > 0 || dy > 0 || dz > 0) {
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
  }
  const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return -Math.min(ox, oy, oz);
}
