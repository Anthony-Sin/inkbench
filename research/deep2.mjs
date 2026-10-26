// Extract the figure iframe contents: core script comments, SVG strokes, palette, interactivity.
import { createRequire } from 'module';
const require = createRequire('/home/ANT/mllab/scripts/x.mjs');
const { chromium } = require('playwright-core');
import fs from 'fs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto('https://colorfigures.vercel.app/#washer', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(9000);

// grab full srcdoc
const srcdoc = await page.evaluate(() => document.getElementById('frame')?.getAttribute('srcdoc') || '');
fs.writeFileSync('/home/ANT/hackathon-cad/research/washer_srcdoc.html', srcdoc);
console.log('srcdoc bytes:', srcdoc.length);

// work inside the frame
const frame = page.frames().find(f => f.url() === 'about:srcdoc');
if (!frame) { console.log('NO FRAME'); process.exit(1); }

const info = await frame.evaluate(() => {
  const out = {};
  out.title = document.title;
  const svg = document.querySelector('svg');
  out.svgCount = document.querySelectorAll('svg').length;
  if (svg) {
    out.svgAttrs = { vb: svg.getAttribute('viewBox'), w: svg.getAttribute('width'), h: svg.getAttribute('height'), style: svg.getAttribute('style') };
  }
  // stroke/fill usage stats
  const strokes = {}, fills = {}, sws = {};
  document.querySelectorAll('svg *').forEach(e => {
    const s = e.getAttribute('stroke'), f = e.getAttribute('fill'), w = e.getAttribute('stroke-width');
    if (s) strokes[s] = (strokes[s] || 0) + 1;
    if (f) fills[f] = (fills[f] || 0) + 1;
    if (w) sws[w] = (sws[w] || 0) + 1;
  });
  out.strokes = strokes; out.fills = fills; out.strokeWidths = sws;
  out.buttons = [...document.querySelectorAll('button, [role=button]')].map(b => ({
    text: b.textContent.trim().slice(0, 50), id: b.id, cls: b.className,
    aria: b.getAttribute('aria-label')
  })).slice(0, 30);
  out.bodyText = document.body.innerText.slice(0, 1200);
  out.bodyBg = getComputedStyle(document.body).backgroundColor;
  out.tags = {};
  document.querySelectorAll('*').forEach(e => { out.tags[e.tagName] = (out.tags[e.tagName] || 0) + 1; });
  return out;
});
console.log(JSON.stringify(info, null, 1));

// click each button and see what changes
const btns = info.buttons;
for (let i = 0; i < Math.min(btns.length, 6); i++) {
  const label = btns[i].text || btns[i].aria || btns[i].id || ('btn' + i);
  try {
    await frame.evaluate(idx => { document.querySelectorAll('button, [role=button]')[idx].click(); }, i);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `/home/ANT/hackathon-cad/research/shots/fig_btn_${i}.png` });
    console.log('clicked', i, label);
  } catch (e) { console.log('click fail', i, e.message); }
}

await page.screenshot({ path: '/home/ANT/hackathon-cad/research/shots/colorfigures.png' });
await page.close();
await browser.close();
