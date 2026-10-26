// Sniff video.twimg.com URLs while a tweet page loads and its video plays.
// Usage: node sniff_video.mjs <tweet_url> <wait_seconds>
import { createRequire } from 'module';
const require = createRequire('/home/ANT/mllab/scripts/x.mjs');
const { chromium } = require('playwright-core');

const tweetUrl = process.argv[2];
const waitSec = parseInt(process.argv[3] || '25', 10);

const seen = new Set();
const hits = [];

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

function note(url, ctype) {
  if (!url) return;
  if (/video\.twimg\.com|\.m3u8|\.mp4|twimg.*video/i.test(url) && !seen.has(url)) {
    seen.add(url);
    hits.push({ url, ctype });
    console.log('HIT', (ctype || ''), url);
  }
}

page.on('request', r => note(r.url(), r.resourceType()));
page.on('response', async r => {
  const u = r.url();
  const ct = (r.headers()['content-type'] || '').toLowerCase();
  if (/video|mpegurl|mp4|octet-stream/.test(ct) || /video\.twimg\.com|\.m3u8|\.mp4/i.test(u)) {
    note(u, 'resp:' + ct);
  }
});

console.log('navigating:', tweetUrl);
await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);

// Try to trigger playback: click video elements / play buttons
try {
  const vids = await page.$$('video');
  console.log('video elements:', vids.length);
  for (const v of vids) {
    await v.evaluate(el => { el.muted = true; el.play().catch(() => {}); }).catch(() => {});
  }
  // click on tweet media area to autoplay
  const media = await page.$('[data-testid="videoComponent"], [data-testid="tweetPhoto"], article');
  if (media) await media.click().catch(() => {});
} catch (e) { console.log('play attempt err', e.message); }

// keep watching while video plays
await page.waitForTimeout(waitSec * 1000);

// Also inspect the DOM for video src and poster hints
const dom = await page.evaluate(() => {
  const out = { videos: [], imgs: [], title: document.title };
  document.querySelectorAll('video').forEach(v => {
    out.videos.push({ src: v.src, poster: v.poster, sources: [...v.querySelectorAll('source')].map(s => s.src) });
  });
  return out;
});
console.log('DOM:', JSON.stringify(dom, null, 2).slice(0, 3000));

console.log('--- ALL HITS ---');
for (const h of hits) console.log(h.url);

import fs from 'fs';
fs.writeFileSync(process.argv[4] || '/tmp/hits.json', JSON.stringify(hits, null, 2));
await page.close();
await browser.close();
