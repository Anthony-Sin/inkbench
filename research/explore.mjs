// Explore a URL in the CDP browser: screenshot + dump computed styles + DOM summary.
// Usage: node explore.mjs <url> <shot_path> [extra_wait_ms] [scroll]
import { createRequire } from 'module';
const require = createRequire('/home/ANT/mllab/scripts/x.mjs');
const { chromium } = require('playwright-core');

const url = process.argv[2];
const shot = process.argv[3];
const extraWait = parseInt(process.argv[4] || '6000', 10);
const doScroll = process.argv[5] === 'scroll';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });

page.on('console', m => { const t = m.text(); if (!/vite|hmr|favicon|DevTools/i.test(t)) console.log('CONSOLE:', t.slice(0, 300)); });
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 300)));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(extraWait);
  if (doScroll) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
  }
} catch (e) { console.log('NAV ERR:', e.message); }

await page.screenshot({ path: shot, fullPage: false });
console.log('shot saved:', shot);
await page.screenshot({ path: shot.replace('.png', '_full.png'), fullPage: true }).catch(() => {});

const info = await page.evaluate(() => {
  const cs = el => el ? getComputedStyle(el) : null;
  const pick = (s, props) => s ? Object.fromEntries(props.map(p => [p, s[p]])) : null;
  const props = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'border', 'borderRadius', 'boxShadow', 'letterSpacing', 'lineHeight', 'backgroundImage'];
  const out = { title: document.title, url: location.href };
  out.body = pick(cs(document.body), props);
  out.html = pick(cs(document.documentElement), ['backgroundColor', 'fontFamily']);
  out.h1 = pick(cs(document.querySelector('h1')), props);
  out.h2 = pick(cs(document.querySelector('h2')), props);
  out.buttons = [...document.querySelectorAll('button, [role=button], a.btn, .button')].slice(0, 8).map(b => ({
    text: b.textContent.trim().slice(0, 60), tag: b.tagName, cls: (b.className || '').toString().slice(0, 80),
    style: pick(cs(b), props)
  }));
  out.inputs = [...document.querySelectorAll('input, textarea, [contenteditable]')].slice(0, 8).map(i => ({
    type: i.type || i.tagName, ph: i.placeholder, style: pick(cs(i), props)
  }));
  out.canvas = [...document.querySelectorAll('canvas, svg')].slice(0, 10).map(c => ({
    tag: c.tagName, w: c.width || c.getAttribute('width'), h: c.height || c.getAttribute('height'), cls: (c.className?.baseVal ?? c.className ?? '').toString().slice(0, 60)
  }));
  out.svgStrokes = [...document.querySelectorAll('svg path, svg line, svg circle, svg rect, svg ellipse')].slice(0, 25).map(p => ({
    tag: p.tagName, stroke: p.getAttribute('stroke') || cs(p)?.stroke, sw: p.getAttribute('stroke-width') || cs(p)?.strokeWidth,
    fill: p.getAttribute('fill') || cs(p)?.fill
  }));
  out.fonts = [...new Set([...document.querySelectorAll('*')].slice(0, 400).map(e => getComputedStyle(e).fontFamily))].slice(0, 15);
  out.text = document.body.innerText.slice(0, 2500);
  out.links = [...document.querySelectorAll('a')].slice(0, 20).map(a => ({ t: a.textContent.trim().slice(0, 50), h: a.href }));
  // collect all unique colors used
  const colors = new Set();
  [...document.querySelectorAll('*')].slice(0, 600).forEach(e => {
    const s = getComputedStyle(e);
    ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach(p => { if (s[p] && s[p] !== 'rgba(0, 0, 0, 0)' && s[p] !== 'none') colors.add(s[p]); });
  });
  out.allColors = [...colors].slice(0, 60);
  // CSS custom properties
  const root = getComputedStyle(document.documentElement);
  out.cssVars = [];
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) {
      if (rule.selectorText === ':root' && rule.style) for (const n of rule.style) if (n.startsWith('--')) out.cssVars.push(n + ':' + rule.style.getPropertyValue(n).trim());
    } } catch (e) {}
  }
  out.animations = [...document.querySelectorAll('*')].slice(0, 400).filter(e => getComputedStyle(e).animationName !== 'none' || getComputedStyle(e).transitionDuration !== '0s').slice(0, 12).map(e => ({
    tag: e.tagName, cls: (e.className?.baseVal ?? e.className ?? '').toString().slice(0, 50),
    anim: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration, trans: getComputedStyle(e).transitionDuration
  }));
  return out;
});
console.log(JSON.stringify(info, null, 1));

await page.close();
await browser.close();
