# Inkbench — Design Tokens (extracted from live pages)

Primary reference: **colorfigures.vercel.app** — "Hand-inked isometric figures you can play with."
Source of truth: the site renders each figure inside `<iframe id="frame" srcdoc=…>` — the full
renderer source ("Colorfigures core") is inlined there. Saved copy: `research/washer_srcdoc.html`
(Fig. 01 Washing machine, 127 KB — contains the whole core lib + the figure's scene code).

Everything below was measured from computed styles + the inlined renderer source, not guessed.

---

## 1. Core palette (colorfigures)

CSS custom properties on `:root` (identical in both the shell page and the figure iframe):

```css
:root{
  --paper:  #f2efe7;   /* warm off-white paper — page + figure background */
  --ink:    #231e16;   /* warm near-black brown — ALL strokes, text, borders */
  --muted:  #857d6e;   /* warm gray — captions, secondary labels */
  --rule:   #ddd6c8;   /* hairline separators */
  --az-h:   90px;      /* shell header height */
}
```

Two more constants from the renderer source:

```js
const INK    = '#231e16';   // every SVG stroke
const SHADOW = '#41538f';   // cast shadows are muted INDIGO, not gray — signature look
```

Paper is **not flat**: the body background layers a subtle fractal-noise grain
(SVG `feTurbulence` baseFrequency .85, 3 octaves, ~16% alpha warm-gray). Measurements on the
screenshot: dominant rendered bg ≈ `#ece9e1`–`#f2efe7`. Recipe (drop-in data-URI):

```html
<svg width="320" height="320"><filter id="p">
<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/>
<feColorMatrix values="0 0 0 0 .42  0 0 0 0 .39  0 0 0 0 .33  .16 0 0 0 0"/>
</filter><rect width="100%" height="100%" filter="url(#p)"/></svg>
```

### Accent swatch palettes (the 5 "COLOUR" dots on every figure)

Every object material is a `{l,m,d}` triplet — light face / mid face / dark face:

```js
mustard: { l:'#f4b829', m:'#d49c1f', d:'#4e4a18' }
tomato:  { l:'#ef6a4c', m:'#cf5038', d:'#4a2219' }
mint:    { l:'#93d3b0', m:'#71b693', d:'#1f4034' }
cobalt:  { l:'#76a0e2', m:'#5a82c6', d:'#1c2948' }
blush:   { l:'#f3a6bb', m:'#d8869c', d:'#4b2430' }
```

`--accent` is set to the active palette's `.l`; "working" label pills and pressed states use it.
Derive any new material with `matOf(hex) = {l:hex, m:mix(hex,#000,.16), d:mix(hex,#000,.42)}`.

### Named materials (steel, rubber, ceramic, etc.)

```js
METAL   { l:'#eef0f0', m:'#c6ccce', d:'#8f989b' }   // brushed light metal
STEEL   { l:'#8c9599', m:'#6a7377', d:'#454d51' }   // darker steel
RUBBER  { l:'#5a5752', m:'#403d39', d:'#2a2825' }   // door seals, feet
DARK    { l:'#55504a', m:'#3d3935', d:'#272421' }   // near-black parts
CERAMIC { l:'#fbfaf3', m:'#e3e0d2', d:'#bdb8a6' }   // enamel white goods
CLEAR   { l:'#e4f2f4', m:'#c4dfe4', d:'#97b9c0' }   // glass — drawn at opacity .72
BOARD   { l:'#e6e1d4', m:'#cfc8b8', d:'#aaa293' }   // ground/floor board
WOOD    { l:'#d9a86c', m:'#bf8a4f', d:'#8e6236' }
PL_M    { l:'#7cc4ea', m:'#5aa6d0', d:'#2f6d92' }   // water/blue plastic
BEZEL   { l:'#f4f5f3', m:'#c9cfd0', d:'#8f989b' }
CREAM   '#fff4d6'                                    // label pill background
CREAM2  '#fbf7ea'                                    // highlight face
```

---

## 2. Typography

| Role | Spec (measured) |
|---|---|
| UI / body | `ui-monospace, SFMono-Regular, Menlo, monospace`, **13px / 1.4** |
| Figure title | same mono 13px, weight 700, letter-spacing .26px — "Fig. 01 — Washing machine" |
| Captions (".cap") | mono 11px, letter-spacing **.08em**, `text-transform:uppercase`, color `--muted` |
| Status readout | mono, uppercase, letter-spacing .08em, `text-shadow: 0 0 3px/6px/10px var(--paper)` (paper halo so it reads over the drawing) |
| Big stats | mono **34px, weight 800**, `font-variant-numeric: tabular-nums` — "4 KG · 40°", "1:30" |
| In-SVG labels | `ui-monospace,Menlo,monospace` **800 weight**, letter-spacing .04em, fill `--ink` |
| Brand text on objects | `tx()` helper, letterspaced — "WASHMATIC 9", weight 800 |
| Shell nav | `Inter, "Helvetica Neue", Arial, "PingFang SC"` for portfolio links |

Rule: **everything is monospace**. Numbers always tabular. Labels always uppercase-with-tracking.

---

## 3. UI component anatomy (hard ink style)

```css
/* pill button — the default control */
.act, button {
  font: inherit;                       /* 13px mono */
  color: var(--ink);
  background: var(--paper);            /* .act is filled; plain button is transparent */
  border: 1.5px solid var(--ink);
  border-radius: 999px;                /* full pill */
  padding: 5px 14px;
}
.act:hover { background: color-mix(in srgb, var(--paper) 92%, var(--ink)); }
button[aria-pressed="true"]:not(.sw) { background: var(--ink); color: var(--paper); }
.act:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }

/* dropdown chip (picker options) */
.chip {
  font-size: 11.5px; font-weight: 700;
  border: 1.5px solid var(--ink);
  border-radius: 8px;                  /* squarer than pills */
  padding: 4px 8px;
  box-shadow: 2px 2px 0 var(--ink);    /* HARD offset shadow, no blur */
}
.chip.current { background: var(--ink); color: var(--paper); }

/* popover panel that holds chips */
.chips {
  border: 2px solid var(--ink);
  border-radius: 12px;
  box-shadow: 3px 3px 0 var(--ink);    /* hard offset again */
}

/* toast / tooltip */
border: 1.5px solid var(--ink); border-radius: 8px; box-shadow: 2px 2px 0 var(--ink);

/* colour swatch dot */
.sw { width:26px; height:26px; border-radius:50%; padding:0;
      border:1.5px solid var(--ink); }
.sw[aria-pressed="true"] { outline:2px solid var(--ink); outline-offset:2px; }

/* "arcade" big action button (physical-press feel) */
.kpad .go { border-radius:999px; box-shadow: 0 3px 0 var(--ink), inset 0 -4px 0 rgba(0,0,0,.18); }
.kpad .go.down { transform:translateY(2px); box-shadow: 0 1px 0 var(--ink), inset 0 -2px 0 rgba(0,0,0,.18); }

input[type=range] { accent-color: var(--ink); }
```

Shadows are **always `Nx Ny 0 var(--ink)`** — crisp, offset, zero blur. Borders always ink, 1.5px.

---

## 4. The isometric renderer spec (this is the product's soul)

### Projection — true isometric, orthographic

```js
const C = Math.cos(Math.PI/6), S = Math.sin(Math.PI/6);   // cos30°, sin30°
const P0 = (x,y,z) => [ (x-y)*C + OX , (x+y)*S - z + OY ];
// x = depth toward viewer-RIGHT, y = toward viewer-LEFT, z = up
```

Free orbit camera (drag to orbit, double-click resets):

```js
YAW0   = 45°                       // classic front-left view
PITCH0 = atan(1/√2) ≈ 35.264°      // TRUE isometric pitch
CAM_K  = sqrt(1.5)
camBasis(yaw,pitch): R=[sin,−cos,0]  U=[−sinP·cos,−sinP·sin,cosP]  V=[cosP·cos,cosP·sin,sinP]
```

Pitch clamped 6–78° (free) or 15–62° (limited figures); yaw can be constrained per figure
(`CAM_LIM`, e.g. only front-ish) or `turn:'full'` for 360° turntable.
Axes land where you expect: +x goes down-right at 30°, +y down-left at 30°, +z straight up.

### Lighting — fixed relative to the viewer

- Light sits "above, behind the viewer's right shoulder": **front is lit, left side in shade**.
- Interior/props light: `LIN = normalize([.6, .2, 1])`.
- Exterior sun derives from yaw; ground shadow direction rotates with yaw so
  **cast shadows always fall toward the lower-left of the screen**.
- Cast shadows drawn SHORT: `SHADOW_LEN = 0.45 × height` (a real sun would give 0.85×);
  clipped to the ground board so they don't spill.

### Shading — softened 3-tone toon

```js
SOFT = .18   // smoothstep band at each tone boundary
step3(d, hi, lo, m): a = smoothstep(hi-SOFT,hi+SOFT,d); b = smoothstep(lo-SOFT,lo+SOFT,d)
  a>=1 → m.l ;  b<=0 → m.d ;  else blend m.m↔m.l / m.d↔m.m
tone (exterior): d = dot(rotV(n), L),   thresholds hi=-.15, lo=-.45
toneI (interior): d = dot(rotV(n), LIN), thresholds hi=.60,  lo=.05
```

Faces snap to one of 3 flat tones at rest, but blend across a narrow band while rotating —
so orbit never "pops" colors. This is why the figures read as flat-print-yet-alive.

### Ink strokes

- `ink()` = `<path fill="none" stroke="#231e16" stroke-linejoin="round" stroke-linecap="round">` — **round joins/caps always**.
- Measured widths in Fig.01 (viewBox 229.5×172.2): dominant **0.27** (323 paths), details 0.25–0.59,
  feature outlines ~0.7–0.9, silhouettes ~1.1–1.8, ground outline 2.2.
- `INK_K = vbWidth / 585` — stroke widths rescale by figure size so every figure has equal "pen weight" on screen (`inkScale()` post-multiplies all stroke-widths).
- Silhouettes get `hullInk()` = outline ink weighted by on-screen thickness: `min(w, .9 + 20·thick)` — like a hand inker pressing harder on outer contours.

### Hand-drawn wobble (SVG filter — the single most copyable trick)

```xml
<filter>
  <feTurbulence type="fractalNoise" baseFrequency="0.045/k" numOctaves="2" seed="4" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4*k" xChannelSelector="R" yChannelSelector="G" result="wob"/>
  <!-- plus two grain octaves for paper tooth -->
  <feTurbulence baseFrequency="0.9/k"  numOctaves="3" seed="11"/>
  <feTurbulence baseFrequency="0.012/k" numOctaves="2" seed="7"/>
</filter>
```

Displacement scale is user-adjustable via the "HAND-DRAWN WOBBLE" slider (0–7, default 2.4).
Baked into PNG tiles at load for perf (browsers recompute feTurbulence per repaint).

### Labels / callouts — `tag(p3, dx, dy, text, on)`

- Leader line + 1.3-unit ink dot at the anchor, then a **cream pill `#fff4d6`** (rounded rect,
  ink 1.2px border) containing mono-800 uppercase text.
- `on:true` ⇒ pill fills `--accent` (active mechanism highlight).
- Mobile: pills collapse to numbered badges + a legend under the figure (numbered `b` chips,
  ink 1.2px, `#fff4d6`; selected = ink-inverted). Legend hover highlights the tag.
- Toggle via "Labels" button / `?labels=0|1`.

---

## 5. Layout patterns

**Outer gallery (colorfigures.vercel.app shell):** portfolio top-nav (Featured / Approach /
AI & Tools / All Projects / Archi & Art / Contact / About Me), left index of `Fig. 01–26`
hash links, `<main>` holds the figure iframe. Mobile: burger menu.

**Figure page (inside iframe):** flex-column, centered, max ~760px:

1. `header` — "Fig. 01 — Washing machine" (mono 13 bold)
2. `.idea` — "**THE BIG IDEA**" (uppercase 11px/.12em strong) + one-line plain-English explanation
3. `.actions` — top-left column of step buttons ("listed in the order the user should do them")
4. `<svg id="fig">` — the drawing; `cursor:grab` → `grabbing` on drag; `[data-act]` parts `cursor:pointer`
5. `#readout` — uppercase tracked status line under the figure
6. `.stats` — top-right big tabular numbers (credit, change, countdown); `.bump` anim on change
7. `.vset` — top-right control cluster, captioned: `SEE-THROUGH` `LABELS` / `COLOUR` swatches /
   `VIEW` = Front view + Turntable / zoom `− 100% +` round chips
8. `.ctl` — "HAND-DRAWN WOBBLE" range slider
9. `.made-with` — muted "Made with Colorfigures" credit

Interaction details worth stealing:
- Buttons animate nothing on hover except subtle fill shift; pressed = ink-invert. No shadows move except `.go` press.
- `?press=Label>Choice@ms` URL param auto-clicks buttons at offsets — **scripted demos/screenshots**.
- `?pal=` sets palette, `?labels=` presets labels.
- `ui.flash(text)` toasts a message into the readout + a shadowed chip ("program locked while running").
- Everything is a state machine (`st`) rendered by `scene(st, palette)` → SVG string; one rAF driver runs all animation step functions then draws once.
- Turntable = continuous yaw orbit; "See-through" = x-ray mode driven by a state var (`st.xr`) that swaps outer shell fills for translucent/ghosted tones.
- Errors are recorded on `<html data-errors>` — the build pipeline validates scenes.

---

## 6. Comparison palette pulls

| Site | BG | Text | Accent | Type |
|---|---|---|---|---|
| colorfigures | `#f2efe7` paper+grain | `#231e16` | object palettes + `#41538f` shadows | mono 13px everywhere |
| zoo.dev | `oklch(0.2264 0 264.48)` ≈ `#2e3138` dark | `oklch(0.9551)` ≈ `#e5eade` | `--_energy` lime ≈ oklch(122° hue), teal `#59d8d5` selection | `owners` sans + `OCR A Tribute Pro Monospaced` |
| adam.new | `#ffffff` | `#0a0a0a` | **`#d8277c` magenta** | `Switzer` 112px/−3.36px tracking + `Paper Mono` for UI |
| backflip.ai | `#ffffff` | `#000` + `#1a1a1a` | **`#fd8b08` orange** + `#ffe4bd` tint | `Space Grotesk` 60px/−4.2px + `IBM Plex Mono` labels |
| robot_arms.mp4 | lab env `#e4e2e1` | — | warm tan `#bd9261` (parts) | — |

Takeaway: **we should NOT copy the competitors' dark/saas look** — Inkbench's identity should be
the colorfigures ink-on-paper language (it matches "hand-inked isometric" and demos better on a
projector). Competitors confirm the functional bar: prompt→parametric CAD, feature tree,
verification loops (Adam's "FEA loop", "DFM checks"), integrations.

---

## 7. Paste-ready CSS foundation for Inkbench

```css
:root{
  --paper:#f2efe7; --ink:#231e16; --muted:#857d6e; --rule:#ddd6c8;
  --accent:#93d3b0;                 /* active palette .l */
  --shadow:#41538f;                 /* cast-shadow indigo */
  --cream:#fff4d6;                  /* callout pills */
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
body{ background:var(--paper); color:var(--ink); font:13px/1.4 var(--mono); }
.btn{ font:inherit; color:var(--ink); background:var(--paper);
      border:1.5px solid var(--ink); border-radius:999px; padding:5px 14px; cursor:pointer; }
.btn:hover{ background:color-mix(in srgb,var(--paper) 92%,var(--ink)); }
.btn[aria-pressed=true]{ background:var(--ink); color:var(--paper); }
.chip{ font:700 11.5px var(--mono); border:1.5px solid var(--ink); border-radius:8px;
       padding:4px 8px; box-shadow:2px 2px 0 var(--ink); }
.panel{ border:2px solid var(--ink); border-radius:12px; box-shadow:3px 3px 0 var(--ink); }
.cap{ font:11px var(--mono); letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.stat-v{ font:800 34px/1.05 var(--mono); font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.callout{ background:var(--cream); border:1.2px solid var(--ink); border-radius:999px;
          font:800 10px/15px var(--mono); }
svg .stroke{ stroke:var(--ink); stroke-linejoin:round; stroke-linecap:round; fill:none; }
```
