// research/test_cad.mjs — node smoke test for src/cad/{geometry,renderer}.js
// Run: node research/test_cad.mjs   (three resolves from node_modules)
import * as THREE from 'three';
import { buildScene, explode, makeGround, makeLights, inkMaterial }
  from '../src/cad/renderer.js';
import {
  partAABB, partVolume, meshForShape, aabbOverlap, aabbGap,
  specToThree, threeQuatForSpecEuler, specTRS, localAABB,
} from '../src/cad/geometry.js';

let fails = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error('  FAIL:', msg); }
}
function near(a, b, eps, msg) {
  checks++;
  if (Math.abs(a - b) > eps) { fails++; console.error(`  FAIL: ${msg} (${a} !~= ${b})`); }
}
function near3(v, [x, y, z], eps, msg) {
  near(v.x ?? v[0], x, eps, msg + ' .x');
  near(v.y ?? v[1], y, eps, msg + ' .y');
  near(v.z ?? v[2], z, eps, msg + ' .z');
}

// ---------------- test spec: a small desk lamp -------------------------
// base: cylinder r60 h12, bottom at z=0.  stem r8 h120 overlaps base top by
// 2mm.  shade: cone r45 h60 overlapping stem top by 15mm.  finial: sphere,
// deliberately left OUT of assembly[] to exercise the radial fallback.
const spec = {
  name: 'desk lamp', units: 'mm',
  materials: {
    steel: { density: 7850, color: '#8a9099' },
    brass: { density: 8600, color: '#b08d57' },
  },
  parts: [
    { id: 'base',   shape: 'cylinder', size: { r: 60, h: 12 },  material: 'steel', position: [0, 0, 6],   rotation: [0, 0, 0] },
    { id: 'stem',   shape: 'cylinder', size: { r: 8,  h: 120 }, material: 'brass', position: [0, 0, 70],  rotation: [0, 0, 0] },
    { id: 'shade',  shape: 'cone',     size: { r: 45, h: 60 },  material: 'steel', position: [0, 0, 145], rotation: [0, 0, 0] },
    { id: 'finial', shape: 'sphere',   size: { r: 6 },          material: 'brass', position: [0, 0, 178], rotation: [0, 0, 0] },
  ],
  joints: [
    { a: 'base', b: 'stem',  type: 'fixed',    axis: [0, 0, 1], anchor: [0, 0, 12] },
    { a: 'stem', b: 'shade', type: 'revolute', axis: [1, 0, 0], anchor: [0, 0, 140] },
  ],
  assembly: [
    { part: 'base',  insert_from: [0, -1, 0] },
    { part: 'stem',  insert_from: [0, 0, 1] },
    { part: 'shade', insert_from: [0, 0, 1] },
  ],
  tests: { min_clearance_mm: 0.5, max_tip_angle_deg: 12 },
};

// ---------------- buildScene -------------------------------------------
console.log('buildScene…');
const built = buildScene(spec);
ok(built.group instanceof THREE.Group, 'built.group is a THREE.Group');
ok(built.parts instanceof Map && built.parts.size === 4, 'parts Map has 4 entries');
ok(built.bounds instanceof THREE.Box3 && !built.bounds.isEmpty(), 'bounds is non-empty Box3');
ok(built.group.children.length === 4, 'group holds 4 part meshes');

// spec world: x [-60,60], y [-60,60], z [0,184] -> three: x±60, y 0..184, z±60
const bsz = built.bounds.getSize(new THREE.Vector3());
near3(bsz, [120, 184, 120], 0.6, 'bounds size (three-space)');

// mesh transforms: spec pos [0,0,70] -> three [0,70,0]
const stem = built.parts.get('stem').mesh;
near3(stem.position, [0, 70, 0], 1e-9, 'stem mesh position');
ok(stem.userData.home instanceof THREE.Vector3, 'userData.home stored');
ok(stem.children.some(c => c.isLineSegments), 'ink outline LineSegments attached');
ok(stem.castShadow && stem.receiveShadow, 'shadows enabled on mesh');
near(built.parts.get('base').mesh.material.color.getHex(), 0x8a9099, 0, 'spec material color used');

// ---------------- partAABB ---------------------------------------------
console.log('partAABB…');
const abBase = partAABB(spec.parts[0]);
near3(abBase.min, [-60, -60, 0], 1e-9, 'base aabb min');
near3(abBase.max, [60, 60, 12], 1e-9, 'base aabb max');
const abStem = partAABB(spec.parts[1]);
near3(abStem.min, [-8, -8, 10], 1e-9, 'stem aabb min');
near3(abStem.max, [8, 8, 130], 1e-9, 'stem aabb max');
const abShade = partAABB(spec.parts[2]);
near3(abShade.min, [-45, -45, 115], 1e-9, 'shade aabb min');
near3(abShade.max, [45, 45, 175], 1e-9, 'shade aabb max');

// rotated box: size [40,10,10] rotated 90° about spec z -> x±5, y±20, z±5
const rotBox = { id: 'rb', shape: 'box', size: [40, 10, 10], position: [10, 20, 30], rotation: [0, 0, Math.PI / 2] };
const abRB = partAABB(rotBox);
near3(abRB.min, [5, 0, 25], 1e-9, 'rotated box aabb min');
near3(abRB.max, [15, 40, 35], 1e-9, 'rotated box aabb max');

// cross-check: rendered mesh world AABB must equal the spec AABB mapped
// through spec->three ([x,y,z]->[x,z,-y] swaps +negates the y/z pair)
const rbBuilt = buildScene({ name: 'rb', parts: [rotBox] });
const rbBox3 = new THREE.Box3().setFromObject(rbBuilt.parts.get('rb').mesh);
near3(rbBox3.min, [5, 25, -40], 1e-6, 'mesh world box min (three)');
near3(rbBox3.max, [15, 35, 0], 1e-6, 'mesh world box max (three)');

// tilted cylinder exact-bound check: r8 h120 tilted 30deg about spec x
const tilt = { id: 't', shape: 'cylinder', size: { r: 8, h: 120 }, position: [0, 0, 0], rotation: [Math.PI / 6, 0, 0] };
const abT = partAABB(tilt);
const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
// axis tips toward -y: |a_y|=sin30, |a_z|=cos30 -> z extent stays the large one
near(abT.max[1], 60 * s30 + 8 * c30, 1e-9, 'tilted cyl y extent (exact analytic)');
near(abT.max[2], 60 * c30 + 8 * s30, 1e-9, 'tilted cyl z extent (exact analytic)');
near(abT.max[0], 8, 1e-9, 'tilted cyl x extent');

// ---------------- partVolume -------------------------------------------
console.log('partVolume…');
near(partVolume(spec.parts[0]), Math.PI * 60 * 60 * 12, 1e-6, 'cylinder volume');
near(partVolume(spec.parts[2]), Math.PI * 45 * 45 * 60 / 3, 1e-6, 'cone volume');
near(partVolume(spec.parts[3]), (4 / 3) * Math.PI * 216, 1e-6, 'sphere volume');
near(partVolume({ shape: 'box', size: [40, 10, 10] }), 4000, 1e-9, 'box volume');
near(partVolume({ shape: 'capsule', size: { r: 5, h: 30 } }),
  Math.PI * 25 * 20 + (4 / 3) * Math.PI * 125, 1e-6, 'capsule volume');
near(partVolume({ shape: 'extrude', size: { points: [[-5, -5], [5, -5], [5, 5], [-5, 5]], h: 5 } }),
  500, 1e-9, 'extrude volume');

// ---------------- meshForShape ------------------------------------------
console.log('meshForShape…');
const cylGeo = meshForShape('cylinder', { r: 60, h: 12 }); // spec local frame: z-up
ok(cylGeo instanceof THREE.BufferGeometry, 'meshForShape returns BufferGeometry');
near(cylGeo.boundingBox.min.z, -6, 1e-9, 'cyl local z min (centered, z-up)');
near(cylGeo.boundingBox.max.z, 6, 1e-9, 'cyl local z max');
near(cylGeo.boundingBox.max.x, 60, 0.5, 'cyl local x extent (facet tol)');
const coneGeo = meshForShape('cone', { r: 45, h: 60 });
near(coneGeo.boundingBox.max.z, 30, 1e-9, 'cone apex at +z/2');
const exGeo = meshForShape('extrude', { points: [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]], h: 5 }); // closed pts tolerated
near3(exGeo.boundingBox.min, [-5, -5, -2.5], 1e-9, 'extrude local min');
near3(exGeo.boundingBox.max, [5, 5, 2.5], 1e-9, 'extrude local max');
const capGeo = meshForShape('capsule', { r: 5, h: 30 });
near(capGeo.boundingBox.max.z, 15, 0.6, 'capsule total height = h');
const boxGeo = meshForShape('box', [40, 10, 10]);
near3(boxGeo.boundingBox.max, [20, 5, 5], 1e-9, 'box local extents = size/2 per spec axis');

// ---------------- aabb helpers ------------------------------------------
console.log('aabbOverlap / aabbGap…');
ok(aabbOverlap(abBase, abStem) === true, 'base/stem overlap (joined 2mm)');
ok(aabbOverlap(abBase, abShade) === false, 'base/shade disjoint');
near(aabbGap(abBase, abStem), -2, 1e-9, 'gap = -penetration (2mm)');
near(aabbGap(abBase, abShade), 103, 1e-9, 'gap = clearance (103mm)');

// ---------------- explode -----------------------------------------------
console.log('explode…');
const D = 0.8 * 184; // 147.2 — 0.8x longest bounds dim
near(built.explodeData.dist, D, 1e-9, 'explode distance = 0.8 * longest dim');

explode(built, 0);
near3(stem.position, [0, 70, 0], 1e-9, 't=0 assembled');

explode(built, 1);
// stem insert_from [0,0,1] (from above) -> pushed +z spec -> +y three
near3(stem.position, [0, 70 + D, 0], 1e-6, 'stem exploded +y');
// base insert_from [0,-1,0] spec -> three [0,0,+1]
const baseM = built.parts.get('base').mesh;
near3(baseM.position, [0, 6, D], 1e-6, 'base exploded +z (spec -y mapped)');
// shade same +y
near3(built.parts.get('shade').mesh.position, [0, 145 + D, 0], 1e-6, 'shade exploded +y');
// finial: no assembly entry -> radial from centroid (0,0,99.75) -> +z spec -> +y three
near3(built.parts.get('finial').mesh.position, [0, 178 + D, 0], 1e-6, 'finial radial +y');

explode(built, 0.5);
near(stem.position.y, 70 + D / 2, 1e-6, 't=0.5 halfway');
explode(built, 0);
near3(stem.position, [0, 70, 0], 1e-9, 't=0 restores assembled pose');
explode(built, 2); // clamps
near(stem.position.y, 70 + D, 1e-6, 't clamps to 1');

// ---------------- ground / lights / material ----------------------------
console.log('makeGround / makeLights…');
const ground = makeGround(400);
ok(ground instanceof THREE.Group && ground.children.length >= 2, 'ground group with plane+grid');
const lights = makeLights();
ok(lights instanceof THREE.Group && lights.children.length >= 2, 'lights group');
ok(lights.children.some(l => l.isDirectionalLight && l.castShadow), 'key light casts shadow');
ok(lights.children.some(l => l.isAmbientLight), 'ambient present');
ok(inkMaterial('#ff0000') instanceof THREE.MeshStandardMaterial, 'inkMaterial -> MeshStandardMaterial');

// fallback path: unknown material must not throw
const fb = buildScene({ name: 'x', parts: [{ id: 'p', shape: 'sphere', size: { r: 3 }, material: 'unobtanium', position: [0, 0, 0] }] });
ok(fb.parts.get('p').mesh.material.color instanceof THREE.Color, 'fallback material color assigned');

// ---------------- specToThree / specTRS sanity --------------------------
console.log('coordinate helpers…');
near3(specToThree([1, 2, 3]), [1, 3, -2], 0, 'specToThree mapping');
// specTRS applied to local geom point must agree with spec-space expectation:
// base local top-center (0,0,6) -> world (0,0,12)
const wp = new THREE.Vector3(0, 0, 6).applyMatrix4(specTRS(spec.parts[0]));
near3(wp, [0, 0, 12], 1e-9, 'specTRS maps local->spec world');
// threeQuatForSpecEuler: identity spec rot -> C (rot -90 about x): spec z->three y
const q = threeQuatForSpecEuler([0, 0, 0]);
const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
near3(v, [0, 1, 0], 1e-9, 'C maps spec up -> three up');
const v2 = new THREE.Vector3(1, 0, 0).applyQuaternion(threeQuatForSpecEuler([0, 0, Math.PI / 2]));
near3(v2, [0, 0, -1], 1e-9, 'spec 90deg-about-z rot -> three-space dir');

console.log(`\n${checks} checks, ${fails} failures`);
if (fails === 0) console.log('PASS');
else { console.log('FAIL'); process.exit(1); }
