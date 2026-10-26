// ============================================================================
// scripts/record_demo2.mjs — re-record research/demo_clip.mp4 with the TABS.
// Drives the headless chromium on CDP :9223 (swiftshader WebGL) via
// playwright-core (same pattern as research/*.mjs). Records a 1700x900 webm
// through a fresh CDP context, then ffmpeg -> mp4.
//
//   node scripts/record_demo2.mjs
//
// Beat sheet (manual control, no ?demo):
//   1. fresh page, empty bench                       ~2s
//   2. 'desk lamp' chip -> ctrl+enter submit
//   3. run streams on the brief card's live log      (wait for terminal status)
//   4. card 02: JSON tab 2s -> Blueprint
//   5. card 04: Measures 2.5s -> Arms 4s (money shot)
//   6. card 04: Checks 3s (VERIFIED stamp + pills)
//   7. explode slider -> ~70%, hold 2s, back to ~15%
//   8. LABELS off/on, WOBBLE on                      ~2s
//   9. smooth pan right -> card 05 + figure gallery, pan back left
// ============================================================================
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';

const require = createRequire('/home/ANT/mllab/scripts/x.mjs');
const { chromium } = require('playwright-core');

const CDP  = process.env.CDP_URL || 'http://127.0.0.1:9223';
const URL_ = process.env.APP_URL || 'http://localhost:4173/';
const OUT_DIR  = '/tmp/inkbench_rec';
const OUT_MP4  = '/home/ANT/hackathon-cad/research/demo_clip.mp4';
const KEEP_MP4 = process.env.OUT_MP4 || OUT_MP4;
const W = 1700, H = 900;

fs.mkdirSync(OUT_DIR, { recursive: true });
const t0 = Date.now();
const beat = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(CDP);
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));

/* ---------- helpers (run inside the page) ---------- */
const panStrip = (to, ms = 1200) => page.evaluate(([to, ms]) => new Promise(res => {
  const el = document.getElementById('app');
  const from = el.scrollLeft, t0 = performance.now();
  const ease = k => k < .5 ? 2 * k * k : -1 + (4 - 2 * k) * k;
  const step = t => {
    const k = Math.min(1, (t - t0) / ms);
    el.scrollLeft = from + (to - from) * ease(k);
    k < 1 ? requestAnimationFrame(step) : res(el.scrollLeft);
  };
  requestAnimationFrame(step);
}), [to, ms]);

const slideTo = (to, ms = 900) => page.evaluate(([to, ms]) => new Promise(res => {
  const s = document.querySelector('input.explode');
  const from = parseFloat(s.value) || 0, t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms);
    s.value = String(from + (to - from) * k);
    s.dispatchEvent(new Event('input', { bubbles: true }));
    k < 1 ? requestAnimationFrame(step) : res();
  };
  requestAnimationFrame(step);
}), [to, ms]);

const clickTab = (card, tab) =>
  page.locator(`.card[data-card="${card}"] .ctab[data-tab="${tab}"]`).click();

const vpPill = (label) =>
  page.locator('.viewport-wrap button', { hasText: label }).first();

const statusText = () => page.evaluate(() =>
  document.querySelector('.status-text')?.textContent || '');

/* --------------------------------- action --------------------------------- */
beat('goto ' + URL_);
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(2500);                                    // three.js + fonts settle
beat('empty bench (2s)');
await sleep(2000);

// 2 — quick brief chip + ctrl+enter (the real submit path)
await page.locator('.qchip', { hasText: 'desk lamp' }).click();
beat('chip: desk lamp filled');
await sleep(700);
await page.locator('.brief-input').focus();
await page.keyboard.press('Control+Enter');
beat('ctrl+enter -> submitted; run starting');

// 3 — camera holds on card 01 while the log streams attempts/failures.
// "attempt N failed — redesigning…" is NOT terminal: attempt N+1 may still
// verify. Only a real terminal status ends the wait.
let lastStatus = '';
const deadline = Date.now() + 175000;
while (Date.now() < deadline) {
  const s = await statusText();
  if (s !== lastStatus) { lastStatus = s; beat('status: ' + s); }
  if (/verified|could not verify|error/i.test(s)) break;
  await sleep(400);
}
beat('terminal status: ' + lastStatus);
await sleep(600);

// 4 — card 02: JSON tab, then back to Blueprint
await clickTab('spec', 'json');      beat('tab: 02 JSON');      await sleep(2000);
await clickTab('spec', 'blueprint'); beat('tab: 02 Blueprint'); await sleep(800);

// 5 — card 04: Measures -> Arms (money shot) -> 6: Checks
await clickTab('report', 'measures'); beat('tab: 04 Measures'); await sleep(2500);
await clickTab('report', 'arms');     beat('tab: 04 ARMS');     await sleep(4000);
await clickTab('report', 'checks');   beat('tab: 04 Checks');   await sleep(3000);

// 7 — exploded view slider: smooth drag to ~70%, hold, ease back to ~15%
beat('explode -> 70%');  await slideTo(0.70, 1000); await sleep(2000);
beat('explode -> 15%');  await slideTo(0.15, 800);  await sleep(600);

// 8 — LABELS off/on, WOBBLE on
await vpPill('LABELS').click(); beat('LABELS off'); await sleep(800);
await vpPill('LABELS').click(); beat('LABELS on');  await sleep(600);
await vpPill('WOBBLE').click(); beat('WOBBLE on');  await sleep(2000);

// 9 — smooth pan right: card 05 EXPLODED/ABOUT + session figures, then back
beat('pan right -> card 05');
await panStrip(402, 1400); await sleep(3000);
beat('pan back left');
await panStrip(0, 1400);   await sleep(1500);

beat('done — closing context (finalizing webm)');
const finalStatus = lastStatus;
const video = page.video();
await ctx.close();
await browser.close();

const webm = await video.path();
beat('webm: ' + webm);
/* A failed take never clobbers the target mp4 — it parks alongside for
   inspection so a previous good take survives. */
const verified = /verified/i.test(finalStatus);
const dest = verified ? KEEP_MP4 : webm.replace(/\.webm$/, '.failed.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', webm,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
  '-movflags', '+faststart', '-an',
  dest,
], { stdio: 'inherit' });
beat((verified ? 'VERIFIED_TAKE mp4 -> ' : 'FAILED_TAKE mp4 -> ') + dest);
if (!verified) process.exit(1);
