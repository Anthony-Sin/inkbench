# Inkbench vs the references — visual comparison

## ours vs Colorfigures (the design-language source)
`shots/compare_colorfigures.png` — left: colorfigures.vercel.app (hand-inked washer);
right: Inkbench running a real verified lamp build.

What we took, and what we deliberately kept different:
- paper `#f5f0e8` (theirs `#f2efe7`), ink `#1a1712` (theirs `#231e16`) — same family, not a clone
- card strip instead of their left-rail figure index — our "figures" are generated, not curated
- real 3D viewport (orbitable, explodeable) vs their flat SVG illustration — same look, different substrate
- PASS/FAIL ink stamp + measured margins — they have no verification layer at all

## ours vs the agentic-CAD incumbents
`shots/compare_market.png` — zoo.dev · adam.new · backflip.ai · Inkbench.
- Zoo/adam/backflip all go dark-mode or glossy-white marketing sites; we went the opposite
  direction — a *bench*, not a landing page
- Adam sells "FEA loop" and Backflip demos "assembly readiness" as claims on a page;
  our collision/stability/assembly numbers are computed live in the browser, shown in
  the report card with the actual measurements
- none of them show the failure→redesign loop. Inkbench's agent log is the demo.

## the two source posts
- Dilum's robot-arms clip (`videos/robot_arms.mp4`, 181MB — agent plans assembly) →
  inspired the *verification* side: an agent shouldn't just design, it should prove
- April's Colorfigures (`videos/colorfigures.mp4`) → the *presentation* side:
  hand-inked isometric objects people actually want to look at
