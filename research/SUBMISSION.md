# Devpost submission draft — Inkbench

**Track:** Indie Developer · **Event:** Meta Global AI Developer Hackathon

## Tagline
Agentic CAD that proves it works — describe a part in plain words, an agent drafts the spec, real geometric checks stamp it PASS or FAIL, and a two-arm build plan falls out of the verified design.

## Inspiration
Text-to-3D tools hand you a picture. We wanted the bench: an agent that has to *earn* the render — every dimension, mass, and clearance measured off real geometry, with failures fed back until the design actually passes. The endgame isn't a prettier model, it's a buildable one: the verified spec compiles into an ordered program a vision-guided two-arm cell could execute.

## What it does
- Plain-language brief → Meta **muse-spark-1.3** drafts a parametric DesignSpec (parts, dims, materials, joints, assembly order) — real Meta Model API calls, key proxied server-side.
- three.js builds true geometry from the spec — no canned models.
- Verification engine runs five real checks: spec sanity, triangle-level collision (Möller–Trumbore), mass-weighted CoM stability with a measured tip margin, swept-AABB assembly-order simulation, and raycast clearance along movable joint axes.
- Any failure goes back to the agent as feedback — up to 3 redesign attempts, live in the UI.
- The **Arms** tab compiles the verified spec into a deterministic two-arm workcell program: per-step ARM A/B assignments, insert_from vectors, press-weld vs align-hinge ops per joint type, measured part masses, and >5kg two-arm lift flags.
- Hand-inked isometric UI (toon shading, indigo cast shadows, numbered figure gallery) on a horizontal card strip — the page never scrolls vertically.

## How we built it
Vanilla ES modules, zero build step. A tiny node server serves the app and proxies `/api/chat` to the Meta Model API so the key never reaches the client. The verifier tessellates every part and measures the real mesh — nothing is stubbed: collision is triangle-vs-triangle, mass is volume×density, stability is CoM-vs-support-polygon.

## Challenges
- Reasoning-model latency and token budget (muse-spark needs generous max_tokens headroom).
- Teaching the model *buildable* geometry — hinge joints where parts sit side-by-side along the axis, insertion orders that don't trap later parts. Failure-feedback loops closed most of the gap.
- Solid-primitive world has no drilled holes — the clearance check enforces real rotational freedom for movable joints.

## Accomplishments
- The full fail→redesign→verify loop running live against a real frontier model, with honest red-ink failures and measured margins.
- A deterministic robot build plan generated from verified geometry — the bridge from CAD to assembly.
- 4/4 quick-brief designs verified end-to-end in QA.

## What's next
Wire the Arms plan to a real cell: OpenCV part detection + a vision model for state estimation, with the same verify-then-replan loop driving the arms' next move.

## Built with
Meta Model API (muse-spark-1.3) · three.js · vanilla ES modules · node
