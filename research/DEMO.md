# INKBENCH — 3-minute demo script

Submission video outline. Every beat is a shipped feature — no mockups, no
cutaways. Record at `http://localhost:4173` (or `/?demo` to auto-run the lamp
brief 1.5s after load). One continuous take; the strip pans horizontally.

**Hook line (cold open, over the empty bench):**
> "Text-to-3D tools give you a picture. Inkbench gives you a part that's been
> *measured* — and when it fails, the agent has to fix it."

---

## 0:00 — The problem (~20s)
- **On screen:** the five-card strip: `01 BRIEF → 02 SPEC → 03 VIEWPORT → 04 REPORT → 05 ABOUT`. Status strip reads `idle — awaiting a brief`.
- **Say:** "CAD agents hallucinate geometry and call it done. Inkbench is a
  bench, not a toy: an agent drafts the spec, a builder makes real meshes, and
  a verification engine stamps the result — PASS or FAIL, in ink."
- **Do:** wheel-scroll across the strip once, end back on card 01.

## 0:20 — Live prompt → spec (~40s)
- **Do:** click the `desk lamp` quick-brief chip — the textarea fills with
  *"a desk lamp with a heavy round base, an articulated arm, and a tiltable
  shade"* — then hit `Draft it →` (or ctrl+enter). *(Alt: open `/?demo` and
  let it fire itself.)*
- **On screen:** status `designing…`; the log timestamps `brief ▸ …`; card 02
  draws the Spec Blueprint — parts with dimensions, joints, materials,
  assembly order — live from the returned JSON.
- **Say:** "That spec just came back from Meta's muse-spark-1.3 — real
  dimensions, joints, materials. The blueprint on card two is that JSON,
  drawn like a figure plate."

## 1:00 — Failure → redesign loop (~40s)
- **On screen:** card 04 stamps **FAIL** in red; the log carries one red
  `✗` line per failing check (e.g. `stability — CoM outside support polygon`,
  `collision — parts interpenetrate`). Status: `attempt 1 failed — redesigning…`.
- **Do:** point at the red ink; don't touch anything — let the loop run.
- **Say:** "Five real checks ran — spec sanity, triangle-level collision,
  center-of-mass stability with a measured tip margin, a swept assembly-order
  simulation, and clearance raycasts along the joint axes. These failures go
  straight back to the agent as feedback. Watch it redesign."
- **On screen:** attempt 2 rebuilds; parts reposition; the gallery pill on
  card 05 shows the attempt count ticking up (`inking…` → `×2`).

## 1:40 — Verified stamp + exploded view (~25s)
- **On screen:** card 04 flips to the green **VERIFIED** stamp —
  `N checks · 0 failures` plus real numbers (mass kg, tip margin mm, timing).
  Status: `verified ✓ (2 attempts)`.
- **Do:** drag the **Exploded view** slider 0 → 1; parts fly apart along
  their `insert_from` assembly vectors, then slide back.
- **Say:** "The stamp means measured margins, not vibes. And the explosion
  isn't a canned animation — it's driven by the assembly order the agent
  wrote into the spec."

## 2:05 — Tabs: raw spec → measures → the two-arm plan (~40s)
- **Do:** on card 02, flip `Blueprint → JSON` — the tinted raw spec the model
  actually returned, scrollable inside the card. Back to Blueprint.
- **Do:** on card 04, flip `Checks → Measures` — every part's dims, volume and
  mass computed from the mesh; then `→ Arms` — the build plan.
- **Say:** "Same verified spec, three readings. The Arms tab is the program a
  two-arm cell would run: ARM A places the base from above, ARM B seats the
  arm links along their insertion vectors, revolute joints get align-and-hinge,
  fixed joints get press-and-weld — every load number measured off the real
  geometry. This is the hand-off to the vision-guided arms."
- **On screen:** per-step `ARM A`/`ARM B` pills, `insert_from` arrows, mass
  column, joint ops interleaved in assembly order.

## 2:45 — Labels, wobble, gallery restore (~30s)
- **Do:** toggle the `LABELS` pill — numbered part callouts pin to the mesh
  (`1 · BASE`, `2 · ARM`…). Flick on `WOBBLE` — the whole viewport gets the
  hand-inked feTurbulence shake. Orbit once with a drag.
- **Do:** pan to card 05, click a `Fig. 01` entry in Session figures — the
  spec, report, and model all repaint from the session cache.
- **Say:** "Every design this session files itself as a numbered figure —
  click one and the bench restores it, ink and all."

## 3:15 — Meta API callout + close (~20s)
- **On screen:** hold on the VERIFIED report card, log still scrolling.
- **Say:** "The agent is Meta's muse-spark-1.3 over the Meta Model API,
  proxied through a tiny node server so the key never touches the client.
  three.js, no build step, no faked checks. Inkbench — CAD that proves it
  works."
- **End card:** brand block on card 01 — `INKBENCH.`
