// ============================================================================
// src/ui/viewport.js — three.js scene manager for Inkbench, "hand-inked
// isometric" edition (see ./toon.js for the recovered colorfigures recipe):
//   · OrthographicCamera — true iso: yaw 45°, elevation atan(1/√2) ≈ 35.264°
//   · transparent canvas over a feTurbulence paper-grain container
//   · 3-tone toon parts (materials applied in cad/renderer.js via toon.js)
//   · key light re-aimed every frame relative to the viewer: front lit,
//     left faces shaded, flat indigo #41538f shadows falling lower-left
//   · "LABELS" pill: numbered cream callouts with leader strokes
//   · "WOBBLE" pill: feTurbulence displacement on the canvas (off by default)
// Exported API (contract): initViewport(container) -> {show, resize, controls}
// plus scene/camera/renderer/labels — the workbench mounts a stub if WebGL
// is unavailable (initViewport throws), which is preserved.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  INK_CSS, PAPER_CSS,
  makeInkStage, trackKeyLight, setInkResolution, setInkHullWidth,
  InkCallouts, installWobble, paperGrainBackground, releaseInk, isSharedInkTexture,
} from './toon.js';

// true-isometric view direction in three space (y-up): spec (1,1,1) -> (1,1,-1)
// => yaw 45°, elevation atan(1/√2) = 35.264°
const ISO_DIR = new THREE.Vector3(1, 1, -1).normalize();
const MIN_POLAR = THREE.MathUtils.degToRad(90 - 78);  // elevation clamp 78°
const MAX_POLAR = THREE.MathUtils.degToRad(90 - 6);   // elevation clamp 6°

export function initViewport(container){
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);                // paper comes from the container
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;       // crisp-ish edge for the flat look
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('tabindex', '0');
  container.appendChild(renderer.domElement);
  paperGrainBackground(container);                    // grain shows through the canvas

  const scene = new THREE.Scene();                    // no background, no fog — flat paper

  /* ------------------------- orthographic iso camera ---------------------- */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80000);
  camera.up.set(0, 1, 0);
  let viewR = 120;                                    // frustum half-height (mm-ish)
  function applyOrtho(){
    const a = camera.aspect || 1;
    camera.top = viewR;  camera.bottom = -viewR;
    camera.left = -viewR * a; camera.right = viewR * a;
    camera.updateProjectionMatrix();
  }
  camera.aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
  applyOrtho();
  camera.position.copy(ISO_DIR).multiplyScalar(900);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minPolarAngle = MIN_POLAR;
  controls.maxPolarAngle = MAX_POLAR;
  controls.minZoom = 0.35;
  controls.maxZoom = 8;
  controls.target.set(0, 40, 0);

  /* ------------------------------- stage ---------------------------------- */
  // paper ground + indigo shadow catcher + ambient floor + key light.
  // (renderer.js' makeGround/makeLights are superseded by the toon stage.)
  const stage = makeInkStage();
  scene.add(stage.root);
  const keyLight = stage.key;
  let lightDist = 800;

  const modelHolder = new THREE.Group();
  modelHolder.name = 'model';
  scene.add(modelHolder);
  let current = null;

  /* ------------------------------- labels --------------------------------- */
  const callouts = new InkCallouts(container);
  const pill = (id, label, on) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    Object.assign(b.style, {
      position: 'absolute', top: '8px', zIndex: 4,
      font: '700 9.5px ui-monospace,"SF Mono",Menlo,Consolas,monospace',
      letterSpacing: '.14em', padding: '3px 10px',
      borderRadius: '999px', border: `1.5px solid ${INK_CSS}`,
      background: on ? INK_CSS : 'rgba(245,240,232,.88)',
      color: on ? PAPER_CSS : INK_CSS, cursor: 'pointer',
      boxShadow: '1.5px 1.5px 0 rgba(35,30,22,.18)',
    });
    b.style.left = `${8 + (id * 74)}px`;
    b.addEventListener('click', () => {
      const now = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(now));
      b.style.background = now ? INK_CSS : 'rgba(245,240,232,.88)';
      b.style.color = now ? PAPER_CSS : INK_CSS;
      b._cb(now);
    });
    container.appendChild(b);
    return b;
  };
  const labelsBtn = pill(0, 'LABELS', true);
  labelsBtn._cb = (on) => callouts.set(on);
  const wobbleBtn = pill(1, 'WOBBLE', false);
  wobbleBtn._cb = installWobble(container, renderer.domElement, 2.4);

  /* --------------------------------- show --------------------------------- */
  function show(built){
    if (current){
      modelHolder.remove(current);
      disposeDeep(current);
      current = null;
    }
    callouts.clear();
    if (!built || !built.group) return;
    current = built.group;
    current.traverse(o => {
      if (o.isMesh){
        const deco = !!o.userData.inkDeco;
        o.castShadow = !deco;
        o.receiveShadow = !deco;
      }
    });
    modelHolder.add(current);
    setInkResolution(current, container.clientWidth || 1, container.clientHeight || 1);
    const box = toBox3(built.bounds, current);
    fitCamera(box, built);
    sizeStage(box);
    callouts.setParts(partAnchors(built));
    callouts.update(camera);
  }

  function toBox3(bounds, fallbackObj){
    if (bounds && bounds.isBox3 && !bounds.isEmpty()) return bounds;
    if (bounds && bounds.min && bounds.max){
      const b = new THREE.Box3(
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z));
      if (!b.isEmpty()) return b;
    }
    return new THREE.Box3().setFromObject(fallbackObj);
  }

  // label anchors: part world position + top-face lift
  function partAnchors(built){
    const out = [];
    const v = new THREE.Vector3(), b = new THREE.Box3();
    if (!built.parts || !built.parts.forEach) return out;
    built.parts.forEach((entry, key) => {
      const mesh = entry && (entry.mesh || entry.object3D || entry);
      if (!mesh || !mesh.isObject3D) return;
      b.setFromObject(mesh);
      mesh.getWorldPosition(v);
      const lift = Math.max(b.max.y - v.y, 0) * 0.92 + 1.5;
      const id = (entry && entry.spec && entry.spec.id) || mesh.userData.partId || key;
      out.push({ id, mesh, lift });
    });
    return out;
  }

  // iso preset: elevation 35.264°, yaw 45°, ortho frustum hugs the bounds.
  // Pathological specs (a stray part metres away) would shrink everything to
  // specks — fit the tight core: parts within 2.5x median distance of the
  // centre, so the subject stays readable and outliers just crop.
  function fitCamera(box, built){
    const center = box.getCenter(new THREE.Vector3());
    let radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 12);
    if (built && built.parts && built.parts.size > 2){
      const ds = [];
      const v = new THREE.Vector3();
      built.parts.forEach(e => {
        const m = e && (e.mesh || e.object3D || e);
        if (m && m.isObject3D){ m.getWorldPosition(v); ds.push(v.distanceTo(center)); }
      });
      if (ds.length > 2){
        ds.sort((a,b)=>a-b);
        const med = ds[Math.floor(ds.length/2)];
        if (med > 1e-3 && radius > med * 4) radius = med * 4;
      }
    }
    const dist = radius * 5;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(ISO_DIR, dist);
    camera.near = Math.max(dist - radius * 4, 0.05);
    camera.far = dist + radius * 8;
    viewR = radius * 1.24;
    applyOrtho();
    controls.update();
  }

  // shadow camera + light distance sized to the model
  function sizeStage(box){
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 12);
    lightDist = radius * 5;
    const sc = keyLight.shadow.camera, r = radius * 1.7;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = Math.max(lightDist - r * 2.1, 0.5);
    sc.far = lightDist + r * 2.1;
    sc.updateProjectionMatrix();
  }

  /* -------------------------------- resize -------------------------------- */
  function resize(){
    const w = container.clientWidth, hgt = container.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    applyOrtho();
    setInkResolution(scene, w, hgt);
  }
  resize();
  if (typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(resize).observe(container);
  } else if (typeof window !== 'undefined'){
    window.addEventListener('resize', resize);
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    trackKeyLight(keyLight, camera, controls.target, lightDist);
    // silhouette weight ~ constant px under zoom (colorfigures' inkScale)
    const pxH = renderer.domElement.clientHeight || 1;
    setInkHullWidth((2 * viewR) / (camera.zoom * pxH));
    renderer.render(scene, camera);
    callouts.update(camera);
  });

  return {
    show, resize, controls, scene, camera, renderer,
    labels: (on) => callouts.set(on),
    wobble: (on) => wobbleBtn._cb(on),
  };
}

/* ------------------------------ disposal ---------------------------------- */
function disposeDeep(root){
  releaseInk(root);
  root.traverse?.(o => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats){
      for (const k of Object.keys(m)){
        const v = m[k];
        if (v && v.isTexture && !isSharedInkTexture(v)) v.dispose();
      }
      m.dispose?.();
    }
  });
}
