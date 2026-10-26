// Inkbench orchestrator — wires ui <-> agent <-> cad <-> verify.
import { design } from './agent.js';
import { validateSpec, normalizeSpec } from './spec.js';
import { buildScene, explode } from './cad/renderer.js';
import { runVerification } from './verify/engine.js';
import { mountUI } from './ui/workbench.js';

const ui = mountUI(document.getElementById('app'));
let built = null;

ui.onSubmit(async (promptText) => {
  ui.setStatus('designing…');
  let feedback = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { spec: rawSpec } = await design(promptText, feedback).catch(e => { ui.setStatus('LLM error: '+e.message); throw e; });
    const spec = normalizeSpec(rawSpec);
    const errs = validateSpec(spec);
    if (errs.length) {
      feedback = 'Schema errors: ' + errs.join('; ');
      ui.setStatus(`attempt ${attempt} — spec rejected: ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''} — redesigning…`);
      continue;
    }
    built = buildScene(spec);
    ui.showModel(built);
    ui.showSpec(spec);
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
// the recording opens mid-action (same submit path as the button)
if (new URLSearchParams(location.search).has('demo'))
  setTimeout(() => ui.submit(
    'a desk lamp with a heavy round base, an articulated arm, and a tiltable shade'), 1500);
