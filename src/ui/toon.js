// ============================================================================
// src/ui/toon.js — the "hand-inked isometric" look for Inkbench.
// Recovered from colorfigures.vercel.app's renderer (research/DESIGN.md):
//   · true isometric: orthographic, yaw 45°, elevation atan(1/√2) ≈ 35.264°
//   · 3-tone toon shading, smoothstep band SOFT ≈ .18, thresholds hi=-.15/lo=-.45
//   · key light fixed relative to the viewer (upper-right behind shoulder):
//     front lit, LEFT faces shaded, cast shadows always fall lower-left
//   · cast shadows are FLAT INDIGO #41538f (ShadowMaterial, no blur look)
//   · ink #231e16 outlines; heavier silhouette hull + hairline crease edges
//   · cream #fff4d6 callout pills on thin leader lines ("Labels" toggle)
// ============================================================================
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const INK       = 0x231e16;
export const INK_CSS   = '#231e16';
export const PAPER_CSS = '#f5f0e8';
export const SHADOW    = 0x41538f;   // signature indigo cast shadow
export const CREAM     = '#fff4d6';  // callout pill background

/* ---------------------------------------------------------------------------
 * 3-tone gradient map. MeshToonMaterial samples this at
 *   coord.x = dotNL * .5 + .5  (dotNL = normal·lightDir)
 * and multiplies the sampled value by the light colour. We reproduce
 * colorfigures' step3(d, hi=-.15, lo=-.45, SOFT=.18): three flat tones with a
 * narrow smoothstep blend so orbiting never "pops" colours.
 * Tones are DIRECT-light multipliers — an ambient floor lifts them to roughly
 * dark .55C / mid .82C / lit 1.0C of the part's material colour.
 * ------------------------------------------------------------------------- */
const HI = -0.15, LO = -0.45, SOFT = 0.18;
const TONE_D = 0.0, TONE_M = 0.62, TONE_L = 1.0;

let _gradientMap = null;
export function toonGradientMap() {
  if (_gradientMap) return _gradientMap;
  const N = 256, data = new Uint8Array(N * 4);
  const ss = (a, b, x) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  for (let i = 0; i < N; i++) {
    const d = (i / (N - 1)) * 2 - 1;                      // coord -> dotNL
    const a = ss(HI - SOFT, HI + SOFT, d);                 // mid -> light blend
    const b = ss(LO - SOFT, LO + SOFT, d);                 // dark -> mid blend
    let v;
    if (a >= 1)      v = TONE_L;
    else if (b <= 0) v = TONE_D;
    else if (a > 0)  v = TONE_M + (TONE_L - TONE_M) * a;
    else if (b < 1)  v = TONE_D + (TONE_M - TONE_D) * b;
    else             v = TONE_M;
    const g = Math.round(v * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g;
    data[i * 4 + 3] = 255;
  }
  _gradientMap = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  _gradientMap.minFilter = _gradientMap.magFilter = THREE.LinearFilter;
  _gradientMap.generateMipmaps = false;
  _gradientMap.needsUpdate = true;
  return _gradientMap;
}

/** Flat-print part material: 3-tone toon, no specular, no PBR gloss. */
export function inkToonMaterial(color = 0x8a9099) {
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradientMap(),
  });
  return m;
}

/* ---------------------------------------------------------------------------
 * Ink outlines. Two layers, like a hand inker:
 *   1. fat-line crease edges (EdgesGeometry -> LineSegments2, ~1.6px, ink)
 *   2. silhouette hull — BackSide mesh pushed out along its normals; only the
 *      rim past the part's silhouette is visible => heavier outer contour.
 * Hull width is set in WORLD units but rescaled every frame by the viewport
 * (setInkHullWidth) so the silhouette keeps a constant ~px weight under zoom —
 * the same trick as colorfigures' inkScale().
 * ------------------------------------------------------------------------- */
const _hullUniforms = new Set();
const HULL_PX = 2.4;                                  // silhouette weight, css px
let _lastHullW = -1;
/** worldUnitsPerPixel -> all hull uniforms. Called per frame by the viewport. */
export function setInkHullWidth(worldPerPx) {
  const v = worldPerPx * HULL_PX;
  if (Math.abs(v - _lastHullW) < 1e-6) return;
  _lastHullW = v;
  for (const u of _hullUniforms) u.value = v;
}

/** drop hull uniforms owned by a subtree — call before disposing a model */
export function releaseInk(root){
  root.traverse?.(o => { const u = o.userData?.uHull; if (u) _hullUniforms.delete(u); });
}

/** true for the shared toon gradient map — never dispose it per-model */
export function isSharedInkTexture(t){ return t === _gradientMap; }

export function inkOutline(geometry, { threshold = 15, edgePx = 1.6, hull = true } = {}) {
  const g = new THREE.Group();
  g.name = 'ink-outline';

  const edges = new THREE.EdgesGeometry(geometry, threshold);
  try {
    const lg = new LineSegmentsGeometry().setPositions(
      edges.getAttribute('position').array);
    const lm = new LineMaterial({ color: INK, linewidth: edgePx });
    lm.resolution.set(1024, 768);                 // sane default; viewport syncs real size
    const ls = new LineSegments2(lg, lm);
    ls.name = 'ink-edges';
    g.add(ls);
  } catch (e) {
    // addon unavailable -> hairline fallback
    g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: INK })));
  }

  if (hull) {
    try {
      const uHull = { value: 0.5 };
      _hullUniforms.add(uHull);
      const hm = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
      hm.onBeforeCompile = (s) => {
        s.uniforms.uHull = uHull;
        s.vertexShader = 'uniform float uHull;\n' + s.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\ttransformed += normal * uHull;');
      };
      const hullMesh = new THREE.Mesh(geometry, hm);
      hullMesh.name = 'ink-hull';
      hullMesh.userData.uHull = uHull;   // so releaseInk() can drop it from the live set
      g.add(hullMesh);
    } catch (e) { /* hull is decorative — ignore */ }
  }

  g.traverse(o => {
    o.raycast = () => {};            // decoration never intercepts picking
    o.castShadow = false;            // outlines must not throw shadows
    o.receiveShadow = false;
    o.userData.inkDeco = true;
  });
  return g;
}

/* ---------------------------------------------------------------------------
 * Stage: paper ground + indigo shadow catcher + faint blueprint grid,
 * ambient floor + viewer-relative key light (with shadows) + cool hemi lift.
 * ------------------------------------------------------------------------- */
export function makeInkStage() {
  const root = new THREE.Group();
  root.name = 'stage';

  // indigo parallelogram catcher — ShadowMaterial only darkens where shadowed
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color: SHADOW, opacity: 0.85 }));
  catcher.receiveShadow = true;
  catcher.position.y = 0;
  catcher.raycast = () => {};

  // hairline blueprint grid, a whisper under the drawing
  const grid = new THREE.GridHelper(2400, 60, 0xb9ae97, 0xd8d0be);
  grid.position.y = -0.12;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  grid.raycast = () => {};

  const ground = new THREE.Group();
  ground.name = 'ground';
  ground.add(catcher, grid);

  // lights — ambient floor carries the "dark" tone, key adds lit/mid delta
  const lights = new THREE.Group();
  lights.name = 'lights';
  const amb = new THREE.AmbientLight(0xfff1da, 1.75);          // ~0.55 flat floor
  const hemi = new THREE.HemisphereLight(0xfff8ea, 0xcfc2ab, 0.35);
  const key = new THREE.DirectionalLight(0xfff7ec, 1.45);      // ~0.46 direct delta
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.4;
  key.shadow.radius = 1.5;
  const sc = key.shadow.camera;
  sc.left = -400; sc.right = 400; sc.top = 400; sc.bottom = -400;
  sc.near = 1; sc.far = 4000;
  lights.add(amb, hemi, key, key.target);

  root.add(ground, lights);
  return { root, key };
}

/* ---------------------------------------------------------------------------
 * Key light follows the viewer — "above, behind the viewer's right shoulder",
 * like colorfigures' sun derived from yaw. Result: the front is always lit,
 * the left side is always in shade, cast shadows always fall lower-left.
 *   R = screen-right component, U = up, B = along viewer direction (back)
 * ------------------------------------------------------------------------- */
const _back = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
export function trackKeyLight(key, camera, target, dist = 800) {
  _back.subVectors(camera.position, target).normalize();
  _right.crossVectors(_up, _back).normalize();           // camera +X in world
  key.position.copy(target)
    .addScaledVector(_right, 0.62 * dist)
    .addScaledVector(_up,    0.85 * dist)
    .addScaledVector(_back, -0.12 * dist);               // slightly far side -> shadows tip down-left
  key.target.position.copy(target);
  key.target.updateMatrixWorld();
}

/** Push the real drawing-buffer size into every fat-line material. */
export function setInkResolution(root, w, h) {
  root.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) if (m && m.isLineMaterial) m.resolution.set(w, h);
  });
}

/* ---------------------------------------------------------------------------
 * InkCallouts — colorfigures' `tag()`: numbered cream pills on hairline
 * leader strokes with an ink dot at the anchor. Absolutely-positioned DOM
 * over the canvas; projected each frame through the camera matrix.
 * ------------------------------------------------------------------------- */
const SVGNS = 'http://www.w3.org/2000/svg';

export class InkCallouts {
  constructor(container) {
    this.on = true;
    this.items = [];
    this.root = document.createElement('div');
    this.root.className = 'ink-callouts';
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      overflow: 'hidden', zIndex: 3, display: 'none',
    });
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    Object.assign(this.svg.style, { position: 'absolute', inset: '0', overflow: 'visible' });
    this.root.appendChild(this.svg);
    container.appendChild(this.root);
    this._v = new THREE.Vector3();
  }

  /** list: [{id, mesh, lift}] — lift = anchor height above mesh origin (world). */
  setParts(list) {
    // wipe
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    for (const it of this.items) it.pill.remove();
    this.items = [];

    (list || []).forEach((p, i) => {
      const side = (i % 2 === 0) ? 1 : -1;                      // alternate L/R
      const it = {
        id: p.id, mesh: p.mesh, lift: p.lift || 0,
        dx: side * 54,
        dy: -(44 + (i % 4) * 12),
      };
      it.line = document.createElementNS(SVGNS, 'line');
      it.line.setAttribute('stroke', INK_CSS);
      it.line.setAttribute('stroke-width', '1.1');
      it.line.setAttribute('stroke-linecap', 'round');
      it.dot = document.createElementNS(SVGNS, 'circle');
      it.dot.setAttribute('r', '2.4');
      it.dot.setAttribute('fill', INK_CSS);
      it.pill = document.createElement('div');
      it.pill.textContent = `${i + 1} · ${String(p.id || 'part').toUpperCase()}`;
      Object.assign(it.pill.style, {
        position: 'absolute', left: '0', top: '0',
        background: CREAM, color: INK_CSS,
        border: `1.2px solid ${INK_CSS}`, borderRadius: '999px',
        padding: '1px 8px', whiteSpace: 'nowrap',
        font: '800 9.5px/1.6 ui-monospace,"SF Mono",Menlo,Consolas,monospace',
        letterSpacing: '.08em',
        boxShadow: `1.5px 1.5px 0 rgba(35,30,22,.25)`,
        pointerEvents: 'none',
      });
      this.svg.appendChild(it.line);
      this.svg.appendChild(it.dot);
      this.root.appendChild(it.pill);
      this.items.push(it);
    });
    this.setVisible(this.on && this.items.length > 0);
  }

  clear() { this.setParts([]); }
  set(on) { this.on = on; this.setVisible(on && this.items.length > 0); }
  setVisible(v) { this.root.style.display = v ? '' : 'none'; this._v2 = !!v; }

  update(camera) {
    if (!this._v2) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const v = this._v;
    for (const it of this.items) {
      it.mesh.getWorldPosition(v);
      v.y += it.lift;
      v.project(camera);
      const hidden = v.z > 1 || v.z < -1 || !it.mesh.visible;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const px = sx + it.dx, py = sy + it.dy;
      it.pill.style.transform =
        `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -55%)`;
      it.pill.style.display = hidden ? 'none' : '';
      it.line.style.display = hidden ? 'none' : '';
      it.dot.style.display = hidden ? 'none' : '';
      if (hidden) continue;
      // leader: anchor dot -> a hair under the pill's ink border
      it.line.setAttribute('x1', sx.toFixed(1));
      it.line.setAttribute('y1', sy.toFixed(1));
      it.line.setAttribute('x2', px.toFixed(1));
      it.line.setAttribute('y2', (py + 6).toFixed(1));
      it.dot.setAttribute('cx', sx.toFixed(1));
      it.dot.setAttribute('cy', sy.toFixed(1));
    }
  }
}

/* ---------------------------------------------------------------------------
 * Hand-drawn wobble — the feTurbulence displacement trick from colorfigures,
 * applied as a DOM filter on the canvas element. Kept behind a toggle:
 * browsers recompute turbulence every repaint, so it can be heavy.
 * ------------------------------------------------------------------------- */
export function installWobble(container, canvas, scale = 2.2) {
  const defs = document.createElementNS(SVGNS, 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  Object.assign(defs.style, { position: 'absolute', width: '0', height: '0' });
  const id = 'inkwob' + Math.floor(Math.random() * 1e6);
  defs.innerHTML =
    `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="4" result="w"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="w" scale="${scale}" ` +
    `xChannelSelector="R" yChannelSelector="G"/></filter>`;
  container.appendChild(defs);
  return (on) => { canvas.style.filter = on ? `url(#${id})` : ''; };
}

/* ---------------------------------------------------------------------------
 * Paper grain for the viewport container (canvas renders transparent on top).
 * Same feTurbulence grain recipe as colorfigures' body background.
 * ------------------------------------------------------------------------- */
export function paperGrainBackground(el) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='280'>` +
    `<filter id='p'><feTurbulence type='fractalNoise' baseFrequency='.8' ` +
    `numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='` +
    `0 0 0 0 .42  0 0 0 0 .39  0 0 0 0 .33  .14 0 0 0 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#p)'/></svg>`;
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  el.style.backgroundColor = PAPER_CSS;
  el.style.backgroundImage =
    `${uri},` +
    `repeating-linear-gradient(0deg, transparent 0 2px, rgba(26,23,18,.018) 2px 3px),` +
    `repeating-linear-gradient(90deg, transparent 0 3px, rgba(26,23,18,.014) 3px 4px)`;
}
