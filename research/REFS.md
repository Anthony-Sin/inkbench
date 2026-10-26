# Inkbench — Reference Products & Winning Pattern

Media captured: `videos/colorfigures.mp4` (1280×720, 22.7 s, has audio),
`videos/robot_arms.mp4` (3456×1990, 175 s, silent screen-capture),
frame tiles in `shots/*_frames.png`, site shots in `shots/`.
Full renderer source of the design reference: `washer_srcdoc.html` (see DESIGN.md).

---

## 1. Colorfigures — colorfigures.vercel.app (April Zhu)
Tweet: x.com/Aprilzz423/status/2111839048230666590 — *"Describe an everyday object, and Claude
draws it hand-inked and isometric, with buttons that actually work. You can also ask how
something works and the skill will label the parts to explain how each [works]."*

**What it actually is:** a **Claude skill** + a self-contained JS renderer ("Colorfigures core").
The site is a gallery of 26 finished figures (Fig. 01 Washing machine → Fig. 26 Arcade cabinet).
Each figure is one HTML page produced by `mountFigure({...})` — and that object literal is
exactly what the model writes. The contract (from the source):

```js
mountFigure({
  fig:'01', title:'Washing machine',
  size:[W,D,H],                  // bounding box → frames the isometric view
  palette:'mint',                // accent material {l,m,d}
  state:{...},                   // the figure's state machine
  scene: (st, m) => svgString,   // THE DRAWING — pure function of state+palette
  readout: st => 'status text',
  buttons:[ {label,onClick} | {label, choices: st => [...]} ],  // "in the order the user should do them"
  stats: st => [{label,value}],  // big numbers top-right
  acts: { name(st,el,ui){} },    // click handlers for tagged parts of the drawing itself
})
```

So the agent's deliverable = a **declarative scene + state machine + an ordered storyboard of
actions**. The core lib gives the model primitives: `box, cyl, cylX, rod, loft, extrude, shape,
castShadow, tag` (callouts), `act` (clickable parts), materials `{l,m,d}` triplets, fixed iso
projection (yaw 45°, pitch 35.26°), 3-tone toon shading, SVG turbulence wobble.

**Interactive layer the shell adds for free:** orbit-drag + double-click reset, turntable,
zoom, "See-through" x-ray, Labels toggle, 5 colour swatches, hand-drawn-wobble slider,
`?press=Label>Choice@ms` scripted-demo URLs, `?pal=` palette param, toast flash messages.
Fig.01's storyboard: *Load laundry → Add soap → Choose program → Start/pause → Open door,
unload → Close door* — the machine animates each step (drum spins, soap drops, dial turns).

**Why it went viral:** every object is *explainable* — "THE BIG IDEA" one-liner + numbered
part labels + playable mechanism. It feels like a technical illustrator's sketchbook that
responds to you.

## 2. Robot-arms assembly video — @DilumSanjaya
Tweet: x.com/DilumSanjaya/status/2102806161728885145 — *"Two robot arms collaboratively
assembling an engine part. Had Opus 5.5 figure out the planning and coordination. I think
this is a promising direction for fully automated robotic systems, even if some steps still
require more capable hardware."*

**What it shows (175 s screen capture, 3456×1990):** a sim/robotics environment where two
arms pick, hand off, and seat engine components. The LLM didn't write trajectories line-by-line;
it produced the **plan** — task decomposition, sequencing, which arm does what and when —
and the system executed it. Notable: the plan is inspectable; steps still visibly fail when
hardware/precision limits hit, which is honest and reads as capability, not a flaw.

**Lesson for us:** the magic is *plan → verified execution*. Users trust an agent more when
they can see the plan being checked, not just the final render.

## 3. Zoo (zoo.dev) — "CAD software for hardware design"
Dark engineer aesthetic (bg ≈ `#2e3138`, `OCR A Tribute` mono + `owners` sans, lime accent).
Products: **Zoo Design Studio** (modeling app), **Text-to-CAD** API, **KCL** (KittyCAD
Language — CAD as code), geometry engine + ML ephemeris APIs, B-rep SDK. Positioning:
developer-first infrastructure — "modeling is code." Their agent angle: the app has an
ML-eph assistant; the API exists so agents can call CAD ops. Weakness for our demo: it's a
toolkit story, not a delight story — no verification theater, dark UI is generic-SaaS.

## 4. Adam (adam.new) — "The AI Mechanical Engineer" (YC)
White site, Switzer display + Paper Mono, magenta `#d8277c`. Adam works **inside** existing
CAD/PLM/CAE (Fusion, Inventor, Onshape, Creo, Solid Edge, SOLIDWORKS, NX, CATIA; Arena,
Windchill, Teamcenter; Ansys, Abaqus, COMSOL) and "hands back finished work." Feature tabs:
**Prompt to CAD** ("say anything and it generates"), **3D→2D** drawings, **FEA loop**,
**Part editing** (rev 03→04), **DFM checks** — demonstrated on a truck differential, helical
LSD end cover, lower control arm, network chassis. Key: they sell *verification loops*
(FEA, DFM) as first-class agent capabilities — validates our VERIFY pillar.

## 5. Backflip (backflip.ai) — "AI copilot that CADs like a human"
White site, Space Grotesk + IBM Plex Mono `// SECTION_LABEL` terminal styling, orange `#fd8b08`.
By the Markforged founders: a **foundation model trained on 3D geometry** that emits
*parametric models with full feature trees* (sketches, constraints, references) editable in
your CAD. Three ingestion modes: **Drawing→CAD** (legacy prints → parametric), **Scan→CAD**
(mesh → feature tree), **Photo→CAD** (photos + one known dimension → scaled model). Their
demo strip literally scans a differential: "01 Ring gear // READY, 02 Pinion gear // READY,
03 Spider gears // READY" — a part-by-part assembly read-out, again pointing at assembly
awareness as the frontier.

---

## Pattern table

| Product | Gen loop | Verification | Presentation |
|---|---|---|---|
| Colorfigures | LLM writes `scene()`+state+storyboard per object | none (drawings, not CAD) | hand-inked iso, labels, playable buttons — DELIGHT |
| Robot arms | LLM plans multi-agent assembly sequence | plan executed on hardware, failures visible | raw sim capture — CAPABILITY |
| Zoo | text→KCL code→B-rep via API | engine-level correctness | dark dev-tool SaaS |
| Adam | agent inside existing CAD/PLM | FEA loop, DFM checks, BOM sync | enterprise integration |
| Backflip | drawing/scan/photo→parametric feature tree | geometric reconstruction fit | terminal-aesthetic |

## Winning pattern for the Inkbench demo

**"Sketchbook-styled agentic CAD with a verification spine."** Nobody combines colorfigures'
delight with Adam/Backflip's engineering claims:

1. **Prompt → parametric spec** (Adam/Backflip table stakes): user types "a desk fan that
   clamps to a shelf"; agent emits a `mountPart`-style declarative spec — primitives +
   params + material triplets (direct analog of `scene()`).
2. **Live ink-iso render** (colorfigures): orthographic yaw-45/pitch-35.26, 3-tone toon,
   `#231e16` strokes, turbulence wobble, paper grain. Instant recognizability on a projector.
3. **VERIFY panel — the differentiator**: run three checks *live* and badge them like a CI
   readout —
   - `COLLISION` — pairwise part interpenetration; failing pairs flash tomato `#cf5038`
     outlines (use the `ui.flash` toast pattern),
   - `BALANCE` — center of mass projected into the support polygon; render the CoG dot +
     base outline as cream `#fff4d6` callouts,
   - `ASSEMBLY` — topological sort over mates/contacts → ordered insertion plan (the
     robot-arms beat: show the plan, then animate it).
4. **Exploded view** = the plan played backwards: parts fly along their insertion axis with
   numbered `tag()`-style leader pills (Fig.01's labels pattern), See-through x-ray toggle,
   Turntable for orbiting.
5. **Storyboard buttons in the order the user should click**: `Generate → Check collision →
   Check balance → Plan assembly → Explode` — copy the `.actions` column + `.act` pill style.
6. **Stats readout** top-right, 34px tabular mono: part count, mass, CoG offset mm,
   min-clearance — numbers that bump-animate when they change.
7. `?press=`-style scripted demo URL so the pitch can replay itself.

Anti-goals (what the refs got wrong for a hackathon): no dark SaaS skin (zoo), no
enterprise-integration pitch (Adam), no "upload your scan" prerequisite (Backflip).
One prompt in → verified, exploded, inked object out.
