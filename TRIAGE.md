# TRIAGE — deadline-swarm board
Deadline: Mon Oct 26, 2026 14:30 EDT (~3h20m). 5 agents max.
Project: agentic CAD tool ("Fusion 360 w/ CLI/agentic") — browser app, NO vertical scroll (horizontal OK, card-internal scroll OK). Repo + name TBD. Nothing hardcoded/faked. Full end-to-end: design things + TEST/verify they work.

## Reference posts (download videos + study design)
- x.com/DilumSanjaya/status/2102806161728885145
- x.com/Aprilzz423/status/2111839048230666590

## Lanes
- [ ] DL videos from both posts + capture site screenshots/colors
- [ ] Research similar products (agentic CAD / text-to-3D)
- [ ] Design language extraction (colors/fonts/layout of reference sites)
- [ ] Product spec + name + repo scaffold
- [ ] Build: CAD core (parametric model gen)
- [ ] Build: agent loop (natural language -> design -> test/verify)
- [ ] Build: horizontal-scroll UI (no page vertical scroll)
- [ ] Verify: end-to-end run, screenshots vs reference

## Progress log
- 11:29 REAL e2e works: proxy->meta muse-spark-1.3 returns valid spec JSON
- verify engine (written by orchestrator after agent stall): lamp PASS 2.34kg; bad tower FAIL stability -74mm (real measures)
- headless test browser: chromium --headless=new swiftshader on CDP :9223 — WebGL2 OK
- app screenshot verified: horizontal cards, no vscroll, stream log works
- KNOWN: verify-lane agent 2be929a7 may overwrite src/verify — reconcile when it lands
- TODO: favicon 404, ground disc dominates empty viewport, explode anim verify, multiple design iterations demo

## Round 2 (11:35)
- verify lane finally landed: rigorous engine (Möller–Trumbore trisect, swept-AABB, mesh centroids) — kept, matches my numbers exactly
- spawned: reviewer(781eb089) toon-viewport(340a5a13) demo-ux(9924d291)
- DESIGN.md recovered: paper #f2efe7, ink #231e16, SHADOW INDIGO #41538f, 3-tone toon, iso yaw45/pitch35.264, {l,m,d} material triplets, feTurbulence wobble
- OUR css: paper #f5f0e8, ink #1a1712, orange #c8552e/blue #3a6ea5/sage #6a8a5f — close family, slightly different tints (fine)
- e2e VERIFIED LIVE: prompt->muse-spark spec->geometry->checks->fail->feedback->redesign->verified✓ 2 attempts ~50s
- open: favicon 404, empty-viewport disc, compare-vs-reference artifact, README, repo public, demo script

## Round 3 (12:07) — lanes: reviewer-R2, demo-recording, polish(done)
- landed: favicon.svg, meta/og, ?demo auto-run, DEMO.md script
- landed r2: toon viewport (MeshToonMaterial, indigo #41538f flat shadows, fat-line ink + silhouette hull, iso ortho cam), LABELS+WOBBLE toggles, session figure gallery w/ restore, per-submit fig numbers
- fixed: double-submit race (inFlight), card wheel-scroll at bounds, camera-fit clamps to median-part core
- armed: publish @13:30 (fresh history -> Anthony-Sin/inkbench), progress commits @14:00/14:30/15:00
- live-verified: lamp verified✓ 3 attempts 5 parts 4 joints; mass 4.29kg, tip 58.9mm — real numbers

## Round 4 (12:30) — user steering: robot arms BUILD the parts + tabs for room
- landed: card tabs (Blueprint|JSON on spec card; Checks|Measures|Arms on report card) — pinned tab band, pane is body's only child, refresh() repaints live tab
- landed: buildplan.js — deterministic two-arm plan from spec.assembly/joints/measured masses (x<0→A, x>0→B, x=0 alternates, >5kg→A+B lift); honest "plan generated from verified spec" framing, NOT claimed-connected hardware
- landed: num() fix (7850→'785' bug) in workbench + buildplan
- QA 4/4 chips verified end-to-end: lamp(2 att)/stand(1)/gear(1)/tamper(1) — all PASS, names+materials+colors land
- armed: publish@13:30 fresh-history→Anthony-Sin/inkbench; commits@14:00/14:30/15:00
- running: reviewer-R3 (attack tabs), demo re-record (show tabs+arms in video)
- open: cavity/socket insertion false-positive in assembly check (known engine limitation — conservative); stale-label anomaly (unreproduced)

## Round 5 (13:05) — R4 adversarial pass on tab fixes
- fixed: split-brain reclaim (final report now repaints spec card + gallery + report together when unpinning)
- fixed: details open-state now bidirectional (user-collapsed sections stay collapsed)
- fixed: 'Σ 1 parts' plural; empty-assembly now warns (was silently fabricated); arrow keys anchor to focused tab (APG)
- landed: agent prompt buildability rules incl. hinge-knuckle guidance — lamp first-attempt PASS (was ~25% on 3-attempt budget)
- landed: new demo_clip.mp4 (124s) w/ JSON+Measures+Arms beats — opened in user's Chromium
- landed: research/SUBMISSION.md devpost draft
- note: clearance check semantics confirmed honest — solid-primitive world has no drilled holes, so movable joints NEED axial separation

## Round 6 (13:30–14:00) — PUBLISHED + R5 attack + clean-room
- PUBLISHED 13:30: https://github.com/Anthony-Sin/inkbench — fresh history inside hackathon window, 61 files, no node_modules/.env/videos
- clean-room clone test: npm install 1.6s, boots+serves+renders w/o key (graceful 401 in UI), BUT found: hardcoded port EADDRINUSE crash → fixed (PORT env + clean msg); .env.example vs server default host mismatch → fixed; compare.png unreferenced → now embedded in README
- R5 found: details all-closed on first paint (my bidirectional fix over-applied to empty panes) → fixed+verified live; fig name frozen at attempt-1 → follows renames; schema-reject retries invisible → now logged; TRIAGE/research paths staying public (deliberate — shows the process)
- pushed: hero+verified.png refresh (tabs+arms visible), all R5 fixes
- running: R6 quick verify of the 3 fixes (dd44fc74)
- 14:00 progress-commit push armed; deadline 14:30

## Final (14:15) — freeze state
- R6: all 3 R5-fixes verified live (details defaults, fig renames, schema-reject logging) + bonus low fixed (details now track only USER toggles via summary-click capture — render defaults stay live across specs)
- soak test: 10 tab flips mid-run + gallery restore + 20 wheel pans + explode — 0 errors, scroll contract holds
- post-hardening reliability: lamp ×4, monitor stand, gear bracket(3 att), tamper — all verified; first-attempt pass now common
- repo: https://github.com/Anthony-Sin/inkbench — all fixes pushed, tree clean
- demo: research/demo_clip.mp4 (124s, shows fail→redesign→verified + JSON/Measures/Arms tabs)
- remaining known-limitation: cavity/socket insertion can false-positive 'blocked' (conservative); stale-label anomaly never reproduced
- Devpost assets ready: research/SUBMISSION.md draft + demo_clip.mp4 + docs/*.png
