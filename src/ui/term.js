// PAD-TERM — the agent terminal dock (left panel).
// Real input → the real design pipeline via onSubmit; agent chips pick who
// drives. muse = the Meta designer (real /api/chat). devin = orchestrator:
// after a verified build it auto-replays the arm plan. claude = reviewer:
// after a run it prints a verdict analysis. Commands: use, build, ls,
// verify, plan, explode, help, clear.
const AGENTS = {
  muse:   { model: 'muse-spark-1.3 · Meta Model API · designs the spec' },
  devin:  { model: 'devin · orchestration role — replays the verified arm plan (designs still run through muse)' },
  claude: { model: 'claude · review role — reads the report + weakest margins (designs still run through muse)' },
};

export function mountTerm(root, hooks){
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  let agent = 'muse', inFlight = false, lastSpec = null, lastReport = null;
  const chipCls = a => ' c' + a[0].toUpperCase() + a.slice(1);
  const PS = () => `<span class="ps${chipCls(agent)}">${agent}@inkbench:~$</span>`;

  root.innerHTML = `
    <div class="thead"><span class="dots"><i></i><i></i><i></i></span>PAD-TERM <span class="sheet">/dev/agent0</span></div>
    <div id="tlog"></div>
    <div id="promptRow">
      <span class="pr"><b id="agName" class="${chipCls(agent).trim()}">${agent}</b><i>@inkbench</i>:~$</span>
      <input id="tin" spellcheck="false" placeholder='build "a desk lamp…" · help'>
    </div>`;

  const tlog = $('#tlog');
  function line(txt, cls, ps){
    const d = document.createElement('div');
    d.className = 'tl' + (cls ? ' ' + cls : '');
    d.innerHTML = (ps ? PS() + ' ' : '') + txt;
    tlog.appendChild(d); tlog.scrollTop = tlog.scrollHeight; return d;
  }
  function typeEcho(txt, cb){
    const d = line(PS() + ' ', 'in'); const tgt = d.lastChild; let i = 0;
    const t = setInterval(()=>{ tgt.textContent = txt.slice(0, ++i); tlog.scrollTop = 1e9;
      if (i >= txt.length){ clearInterval(t); cb && cb(); } }, 11);
  }
  function setAgent(a, quiet){
    agent = a;
    const nm = $('#agName'); nm.textContent = a;
    nm.className = chipCls(a).trim();
    if (!quiet) line(`agent ▸ <span class="hl">${a}</span> — ${AGENTS[a].model}`); }

  function cmd(raw){
    line(esc(raw), 'in', true);
    const [c0, ...rest] = raw.trim().split(/\s+/);
    const c = (c0 || '').toLowerCase();
    const arg = rest.join(' ').replace(/^["']|["']$/g, '');
    if (c === 'use' && AGENTS[arg]) return setAgent(arg);
    if (c === 'use') return line('agents: muse · devin · claude');
    if (c === 'help') return line('use &lt;muse|devin|claude&gt; · build "&lt;brief&gt;" · ls · verify · plan · explode · parts · clear');
    if (c === 'clear'){ tlog.innerHTML = ''; return; }
    if (c === 'build' || c === 'design' || c === 'ink'){
      if (inFlight) return line('already working — wait for this run to finish', 'warn');
      const brief = arg || lastBrief();
      if (!brief.trim()) return line('usage: build "&lt;brief&gt;"', 'warn');
      return hooks.submit(brief); }
    if (!lastSpec && ['ls','verify','plan','explode','parts'].includes(c))
      return line('nothing built yet — `build "&lt;brief&gt;"` first', 'dim');
    if (c === 'ls' || c === 'parts'){
      (lastSpec.parts || []).forEach(p => line(`  ${p.id.padEnd(15,' ')}${p.shape.padEnd(9,' ')}${dimOf(p)}`));
      return; }
    if (c === 'verify'){
      (lastReport?.checks || []).forEach(ch =>
        line(`  ${ch.status === 'pass' ? '✓' : ch.status === 'warn' ? '◦' : '✗'} ${ch.name}${ch.measured != null ? ' — ' + (+ch.measured).toFixed(2) : ''}`));
      if (lastReport) line('verdict ▸ ' + (lastReport.pass ? 'PASS' : 'FAIL'), lastReport.pass ? 'ok' : 'fail');
      return; }
    if (c === 'plan') return hooks.printPlan();
    if (c === 'explode') return hooks.explode(0.75);
    if (c === 'status') return hooks.status && line(hooks.status(), 'dim');
    line('unrecognised: ' + esc(c) + ' — try "help"', 'fail');
  }
  function lastBrief(){ return $('#tin')._last || ''; }

  const dimOf = p => Array.isArray(p.size) ? p.size.join('×')
    : (p.size && p.size.r != null ? '⌀' + (p.size.r * 2) + '×' + p.size.h
    : (p.size && p.size.points ? p.size.points.length + 'pt·h' + p.size.h : '?'));

  $('#tin').addEventListener('keydown', e => {
    if (e.key === 'Enter' && $('#tin').value.trim()){
      $('#tin')._last = $('#tin').value;
      cmd($('#tin').value); $('#tin').value = '';
    }});
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== $('#tin')){ e.preventDefault(); $('#tin').focus(); }});

  /* boot text */
  line('inkbench pad-term v0.9', 'dim');
  line('agents: <span class="hl">muse</span> designs · <span class="hl">devin</span> orchestrates + drives arms · <span class="hl">claude</span> reviews', 'dim');
  line('type "help" — every line below is real pipeline output', 'dim');
  line('');

  return {
    line, typeEcho, setAgent, cmd,
    get agent(){ return agent; },
    get inFlight(){ return inFlight; },
    set inFlight(v){ inFlight = v; },
    noteSpec(spec){ lastSpec = spec; },
    noteReport(rep){ lastReport = rep; },
    submitText(text){ hooks.submit(text); },
    focus(){ $('#tin').focus(); },
  };
}
