// Serves the original viewer's /api/* calls from static JSON, so the Second Brain needs no server.
// Every request stays on this origin. Anything the public demo does not offer answers a named error, never silence.
(function () {
  const script = document.currentScript;
  const BASE = new URL('../demo/brain/', script ? script.src : location.href).href;
  const realFetch = window.fetch.bind(window);
  const cache = {};
  const load = (name) => cache[name] || (cache[name] = realFetch(BASE + name).then((r) => {
    if (!r.ok) { delete cache[name]; throw new Error(name + ' answered HTTP ' + r.status); }
    return r.json();
  }));
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });

  // port of the original filename search: every token must hit; whole-word and prefix hits rank higher
  function scoreOf(toks, name, rel, desc) {
    const stem = name.replace(/\.[a-z0-9]+$/i, '');
    const wordHit = (hay, s) => new RegExp('(^|[^a-z0-9])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(hay);
    let total = 0;
    for (const s of toks) {
      let sc = -1;
      if (name === s || stem === s) sc = 100;
      else if (name.startsWith(s)) sc = wordHit(stem, s) ? 85 : 80;
      else if (name.includes(s)) sc = wordHit(stem, s) ? 65 : 60;
      else if (rel.includes(s)) sc = 30;
      else if (desc && desc.includes(s)) sc = 15;
      if (sc < 0) return -1;
      total += sc;
    }
    return total / toks.length;
  }

  async function handle(u) {
    const p = u.pathname;
    if (p === '/api/graph') return json(await load('graph.json'));
    if (p === '/api/expand') {
      const rel = (u.searchParams.get('path') || '').replace(/\\/g, '/');
      const tree = await load('tree.json');
      if (!Object.prototype.hasOwnProperty.call(tree, rel)) return json({ error: 'Unknown folder' }, 404);
      return json({ path: rel, nodes: tree[rel], secretCount: 0 });
    }
    if (p === '/api/search') {
      const q = u.searchParams.get('q') || '';
      const toks = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!toks.length) return json({ q, results: [], secretCount: 0, truncated: false });
      const idx = await load('search.json');
      const scored = [];
      for (const x of idx) {
        const sc = scoreOf(toks, x.name.toLowerCase(), x.path.toLowerCase(), x.desc ? x.desc.toLowerCase() : '');
        if (sc >= 0) scored.push({ x, sc: sc - (x.type === 'dir' ? 3 : 0) - Math.min(6, x.path.split('/').length) });
      }
      scored.sort((a, b) => b.sc - a.sc);
      const results = scored.slice(0, 120).map((e) => e.x);
      return json({ q, results, secretCount: 0, truncated: results.length === 120 });
    }
    if (p === '/api/file') {
      const rel = u.searchParams.get('path') || '';
      if (!rel || rel.includes('..')) return json({ error: 'Not found' }, 404);
      const r = await realFetch(BASE + 'files/' + rel.split('/').map(encodeURIComponent).join('/') + '.txt');
      if (!r.ok) return json({ error: 'Not found' }, 404);
      const content = await r.text();
      const m = /\.[A-Za-z0-9]+$/.exec(rel);
      return json({ content, ext: m ? m[0].toLowerCase() : '', size: content.length });
    }
    if (p === '/api/lens') return json({ path: u.searchParams.get('path') || '', admitted: true });
    if (p === '/api/automations') return json({ ok: true, entries: [], reconcile: null });
    return json({ error: 'Not available in the public demo: ' + p }, 404);
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') !== 0) return realFetch(input, init);
    return handle(new URL(url, location.origin)).catch((e) => json({ error: String((e && e.message) || e) }, 500));
  };
})();
