// src/cad/renderer.js — Inkbench: DesignSpec -> three.js scene (the "ink" look).
//
// ======================== COORDINATE CONVENTION ========================
// Spec space (DesignSpec JSON): right-handed, **Z up**, mm.
//   position [x,y,z] = part CENTER; rotation [rx,ry,rz] = euler rad 'XYZ'
//   order applied in spec space.
// three.js world: right-handed, **Y up**.
//   spec [x,y,z] -> three [x, z, -y]   (C = rotation -90deg about X;
//   a proper rotation — same map for points and direction vectors).
// meshForShape() (geometry.js) returns geometry already in the SPEC local
// frame (z-up, origin at part center), so each mesh gets:
//   mesh.position  = C(position_spec)                = [px, pz, -py]
//   mesh.quaternion = C_QUAT * Euler(rotation_spec)  (see threeQuatForSpecEuler)
// Result: a spec-space world point p maps to three-world C*p — consistent
// with partAABB()/specTRS() in geometry.js, which the verify engine uses.
// built.bounds is a THREE.Box3 in THREE space (Y-up) for camera framing.
// explode() displaces in three space; insert_from is mapped with C too.
// =====================================================================
import * as THREE from 'three';
import {
  meshForShape, specToThreeVec3, threeQuatForSpecEuler,
} from './geometry.js';
import { inkToonMaterial, inkOutline } from '../ui/toon.js';

const PAPER = 0xf3eee2;       // paper tone for ground
const GRID_MAJOR = 0x9a927f;
const GRID_MINOR = 0xd8d2c2;
// fallback palette when a part's material isn't found in spec.materials
const FALLBACK = [0x8a9099, 0xb08d57, 0x7d8a6a, 0x9a6f5f, 0x6f7f8f, 0xa89f8d];

/**
 * Part material — 3-tone "inked" toon (implemented in ui/toon.js:
 * MeshToonMaterial + smoothstep-banded gradientMap, thresholds -0.15/-0.45).
 */
export function inkMaterial(color = FALLBACK[0]) {
  return inkToonMaterial(color);
}

/**
 * Ink outline (implemented in ui/toon.js): Group = fat-line crease edges
 * (EdgesGeometry -> LineSegments2, ~1.6px) + BackSide silhouette hull.
 */
export function makeInkOutline(geometry, thresholdDeg = 15) {
  return inkOutline(geometry, { threshold: thresholdDeg });
}

/**
 * DesignSpec -> { group, parts: Map<id,{mesh,spec}>, bounds: Box3(three-space),
 *                 spec, explodeData }.
 * Every mesh: castShadow + ink outline child; userData.home = assembled pose.
 */
export function buildScene(spec) {
  const group = new THREE.Group();
  group.name = spec.name || 'design';
  const parts = new Map();
  const mats = spec.materials || {};

  (spec.parts || []).forEach((p, i) => {
    const geo = meshForShape(p.shape, p.size);
    const color = mats[p.material]?.color ?? FALLBACK[i % FALLBACK.length];
    const mesh = new THREE.Mesh(geo, inkMaterial(color));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(makeInkOutline(geo));
    specToThreeVec3(p.position || [0, 0, 0], mesh.position);
    mesh.quaternion.copy(threeQuatForSpecEuler(p.rotation || [0, 0, 0]));
    mesh.name = p.id;
    mesh.userData.partId = p.id;
    mesh.userData.home = mesh.position.clone(); // assembled position (three space)
    group.add(mesh);
    parts.set(p.id, { mesh, spec: p });
  });

  const bounds = new THREE.Box3().setFromObject(group); // THREE space (y-up)

  // ---- explode vectors ------------------------------------------------
  // insert_from = direction the part arrives FROM (spec space); the explode
  // pushes it back along that vector:  disp = normalize(insert_from) * t * D.
  // Parts with no usable assembly entry are pushed radially from the
  // centroid of all part positions (fallback +z if coincident).
  const insert = new Map((spec.assembly || []).map(a => [a.part, a.insert_from]));
  const centroid = [0, 0, 0];
  (spec.parts || []).forEach(p => {
    const q = p.position || [0, 0, 0];
    centroid[0] += q[0]; centroid[1] += q[1]; centroid[2] += q[2];
  });
  const n = Math.max((spec.parts || []).length, 1);
  centroid[0] /= n; centroid[1] /= n; centroid[2] /= n;

  const size3 = bounds.getSize(new THREE.Vector3());
  const dist = 0.8 * Math.max(size3.x, size3.y, size3.z, 1);

  const dirs = new Map();
  for (const p of spec.parts || []) {
    let d = insert.get(p.id);
    let len = d ? Math.hypot(d[0], d[1], d[2]) : 0;
    if (d && len > 1e-9) {
      d = [d[0] / len, d[1] / len, d[2] / len];
    } else {
      const q = p.position || [0, 0, 0];
      d = [q[0] - centroid[0], q[1] - centroid[1], q[2] - centroid[2]];
      len = Math.hypot(d[0], d[1], d[2]);
      d = len > 1e-9 ? [d[0] / len, d[1] / len, d[2] / len] : [0, 0, 1];
    }
    dirs.set(p.id, specToThreeVec3(d)); // spec dir -> three dir
  }

  return { group, parts, bounds, spec, explodeData: { dist, dirs } };
}

/**
 * Exploded view. t in [0,1]: 0 = assembled pose, 1 = fully separated.
 * Each part is pushed back along its insert_from direction (or radially
 * from the centroid) by t * (0.8 * longest bounds dimension).
 */
export function explode(built, t) {
  const k = Math.min(1, Math.max(0, +t || 0));
  const { dist, dirs } = built.explodeData;
  for (const [id, entry] of built.parts) {
    const d = dirs.get(id);
    if (!d) continue;
    entry.mesh.position.copy(entry.mesh.userData.home).addScaledVector(d, k * dist);
  }
  return built;
}

/** Paper-toned ground: shadow-catching disc + faint sketch grid. Sits just below y=0. */
export function makeGround(size = 600) {
  const g = new THREE.Group();
  g.name = 'ground';

  const paper = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.75, 72).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PAPER, roughness: 1, metalness: 0 }));
  paper.position.y = -0.4;
  paper.receiveShadow = true;

  const grid = new THREE.GridHelper(size, Math.max(10, Math.round(size / 20)),
    GRID_MAJOR, GRID_MINOR);
  grid.position.y = -0.05; // a hair under part bottoms — no z-fighting
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  grid.raycast = () => {};

  g.add(paper, grid);
  return g;
}

/** Ambient fill + warm key directional with shadows + faint cool rim fill. */
export function makeLights() {
  const g = new THREE.Group();
  g.name = 'lights';

  const amb = new THREE.AmbientLight(0xfff6e6, 0.7);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(140, 220, 110);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const c = key.shadow.camera;
  c.left = -260; c.right = 260; c.top = 260; c.bottom = -260;
  c.near = 10; c.far = 700;
  key.shadow.bias = -0.0004;

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); // cool bounce, no shadow
  fill.position.set(-120, 80, -140);

  g.add(amb, key, fill);
  return g;
}
