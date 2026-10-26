// Inkbench dev server: static files + /api/chat proxy to Meta Model API (keeps key server-side)
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  (fs.existsSync(path.join(ROOT,'.env')) ? fs.readFileSync(path.join(ROOT,'.env'),'utf8') : '')
    .split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];})
);
const API_BASE = env.LLM_API_BASE || 'https://api.meta.ai/v1';
const API_KEY = env.LLM_API_KEY || process.env.LLM_API_KEY || '';
const MODEL = env.LLM_MODEL || 'muse-spark-1.3';
const PORT = +(env.PORT || process.env.PORT || 4173);

const MIME = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};

http.createServer(async (req,res)=>{
  const u = url.parse(req.url, true);
  if (u.pathname === '/api/chat' && req.method === 'POST') {
    let body=''; req.on('data',c=>body+=c); await new Promise(r=>req.on('end',r));
    try {
      const { messages, json } = JSON.parse(body);
      const r = await fetch(`${API_BASE}/chat/completions`, {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 8192, ...(json ? { response_format: { type:'json_object' } } : {}) })
      });
      const txt = await r.text();
      res.writeHead(r.status, {'Content-Type':'application/json'}); res.end(txt);
    } catch(e){ res.writeHead(500); res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  // static
  let fp = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (u.pathname.startsWith('/vendor/three/')) fp = path.join(ROOT,'node_modules/three', u.pathname.slice(13));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404')}else{res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d)} });
}).listen(PORT, ()=>console.log(`inkbench on http://localhost:${PORT}`))
  .on('error', (e) => {
    if (e.code === 'EADDRINUSE'){ console.error(`port ${PORT} in use — set PORT=<n> or free it`); process.exit(1); }
    throw e;
  });
