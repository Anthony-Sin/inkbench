// Inkbench verification engine — runs the real geometric checks from tests.js
// and produces the report consumed by ui.showReport / the agent feedback loop.
//
// Contract:
//   runVerification(spec, built) -> {
//     pass, checks[], failures[], explodedOrder, timingMs
//   }
//   - spec: the DesignSpec JSON (required)
//   - built: OPTIONAL — output of cad/renderer.buildScene(spec)
//            ({group, parts: Map<id,{mesh,spec}>, bounds}). May be null.
//            NOTE: built meshes live in three.js space (Y-up); the checks
//            use their spec-local geometry + spec-space TRS, so an exploded
//            view pose never pollutes measurements.

import { sanityCheck, collisionCheck, stabilityCheck, assemblyOrderCheck, clearanceCheck } from './tests.js';

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function runVerification(spec, built = null) {
  const t0 = now();
  const checks = [], failures = [];
  let explodedOrder = null;

  const push = (r) => {
    checks.push(r);
    for (const f of r.failures || []) failures.push(f.includes(':') ? f : `${r.name}: ${f}`);
    return r;
  };
  const run = (fn, name) => {
    try { return push(fn(spec, built)); }
    catch (e) { return push({ name, status: 'warn', detail: `check error: ${e?.message || e}`, measured: null, failures: [] }); }
  };

  const sanity = run(sanityCheck, 'spec sanity');
  if (!sanity.fatal) {
    run(collisionCheck, 'collision');
    run(stabilityCheck, 'stability');
    const asm = run(assemblyOrderCheck, 'assembly order');
    if (asm?.order?.length) explodedOrder = asm.order;
    run(clearanceCheck, 'clearance');
  }
  if (!explodedOrder) {
    explodedOrder = (spec?.assembly?.length
      ? spec.assembly.map(a => a.part)
      : (spec?.parts || []).map(p => p.id)).filter(Boolean);
  }

  const pass = checks.length > 0 && !checks.some(c => c.status === 'fail');
  return { pass, checks, failures, explodedOrder, timingMs: +(now() - t0).toFixed(1) };
}

// Re-export checks + helpers for tests and other lanes.
export * from './tests.js';
