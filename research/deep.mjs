// Deep-dive colorfigures figure: find iframe/shadow content, svg strokes, interactive bits.
import { createRequire } from 'module';
const require = createRequire('/home/ANT/mllab/scripts/x.mjs');
const { chromium } = require('playwright-core');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto('https://colorfigures.vercel.app/#washer', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(9000);

const info = await page.evaluate(() => {
  const out = {};
  out.iframes = [...document.querySelectorAll('iframe')].map(f => ({ src: f.src, id: f.id, cls: f.className }));
  out.shadowHosts = [...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.tagName + '.' + e.className);
  out.objectEmbed = [...document.querySelectorAll('object, embed')].map(e => ({ tag: e.tagName, data: e.data || e.src }));
  // figure container?
  const main = document.querySelector('main, #app, .az-stage, [class*=stage], [class*=figure], [class*=fig]');
  out.mainHTML = main ? main.outerHTML.slice(0, 1500) : null;
  out.bodyChildren = [...document.body.children].map(e => e.tagName + ' ' + (e.id ? '#' + e.id : '') + ' ' + (e.className || '').toString().slice(0, 60));
  out.scripts = [...document.querySelectorAll('script[src]')].map(s => s.src).slice(0, 20);
  return out;
});
console.log(JSON.stringify(info, null, 1));

// check frames
for (const f of page.frames()) {
  console.log('FRAME:', f.url());
}
await page.close();
await browser.close();
