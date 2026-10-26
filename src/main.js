// Inkbench orchestrator — wires ui <-> agent <-> cad <-> verify.
// Staged flow: beginRun → design → showSpec → showModel → planReady →
// revealBuild (real assembly order) → runVerification → showReport →
// feedback loop. The terminal streams every real step.
import { design } from './agent.js';
import { validateSpec, normalizeSpec } from './spec.js';
import { buildScene, explode } from './cad/renderer.js';
import { runVerification } from './verify/engine.js';
import { planOps } from './ui/buildplan.js';
import { mountUI } from './ui/workbench.js';

const ui = mountUI(document.getElementById('app'));
let built = null;

ui.onSubmit(async (promptText) => {
  ui.beginRun(promptText);
  ui.setStatus('designing…');
  let feedback = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) ui.setStatus(`attempt ${attempt} — redesigning…`);
    const { spec: rawSpec } = await design(promptText, feedback)
      .catch(e => { ui.setStatus('LLM error: ' + e.message); ui.abort(e.message); return { spec: null }; });
    if (!rawSpec) return;
    const spec = normalizeSpec(rawSpec);
    const errs = validateSpec(spec);
    if (errs.length) {
      feedback = 'Schema errors: ' + errs.join('; ');
      ui.setStatus(`attempt ${attempt} — spec rejected: ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''} — redesigning…`);
      continue;
    }
    ui.showSpec(spec);                       // BOM + ribbon fill with real data
    built = buildScene(spec);
    ui.showModel(built);                     // staged into the viewport
    const plan = planOps(spec);
    ui.planReady(plan);                      // op-chain timeline from real plan
    await ui.revealBuild();                  // parts appear in real build order
    const report = runVerification(spec, built);
    ui.showReport(report, { retry: !report.pass && attempt < 3 });
    if (report.pass) { ui.setStatus(`verified ✓ (${attempt} attempt${attempt>1?'s':''})`); return; }
    feedback = report.failures.join('\n');
    ui.setStatus(`attempt ${attempt} failed — redesigning…`);
  }
  ui.setStatus('could not verify after 3 attempts');
});
ui.onExplode((v) => { if (ui.built) explode(ui.built, v); });

// ?demo — screencast entry: a known-good brief inks itself after a beat, so
// the recording opens mid-action (same submit path as the terminal)
if (new URLSearchParams(location.search).has('demo'))
  setTimeout(() => ui.submit(
    'a desk lamp with a heavy round base, an articulated arm, and a tiltable shade'), 1500);
