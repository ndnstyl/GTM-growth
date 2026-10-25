// GTM OS chrome around the engine: toolbar, searchable list (the keyboard and screen reader route),
// full screen, attribution. Runs after skin.js has booted the engine.
(function () {
  const $ = (id) => document.getElementById(id);
  const BC = window.BrainCore;
  const el = (tag, attrs, html) => { const e = document.createElement(tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- toolbar (bottom centre) and attribution
  const bar = el('div', { id: 'brain-bar', role: 'toolbar', 'aria-label': 'Second Brain controls' });
  const mk = (id, label, extra) => { const b = el('button', Object.assign({ id, type: 'button', class: 'fab' }, extra || {})); b.innerHTML = label; return b; };
  const fabMenu = mk('fab-menu', '&#9776; Menu', { 'aria-expanded': 'false', 'aria-controls': 'brain-panel' });
  const fabLegend = mk('fab-legend', '&#9670; Legend', { 'aria-expanded': 'false', 'aria-controls': 'brain-legend' });
  const fabList = mk('fab-list', '&#8801; List', { 'aria-expanded': 'false', 'aria-controls': 'brain-list', 'aria-keyshortcuts': 'L' });
  const fabFull = mk('fab-full', '&#9974; Full screen', { 'aria-pressed': 'false' });
  bar.append(fabMenu, fabLegend, fabList, fabFull);
  const attr = el('div', { id: 'brain-attrib' },
    'Brain view adapted from Rubric Second Brain by <a href="https://skool.com/robonuggets" target="_blank" rel="noopener noreferrer">Jay E, RoboNuggets</a>, ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> ' +
    '<span aria-hidden="true">·</span> <a href="LICENSE.txt" target="_blank" rel="noopener">Licence text</a>');
  (document.getElementById('brain-main') || document.body).append(bar, attr);
  // Tab order follows the visual order: the toggle first, then the panel it opens
  const panelEl = $('brain-panel'), legendEl = $('brain-legend');
  if (legendEl) bar.after(legendEl);
  if (panelEl) bar.after(panelEl);

  const setOpen = (cls, btn, on) => { document.body.classList.toggle(cls, on); btn.setAttribute('aria-expanded', String(on)); };
  fabMenu.onclick = () => {
    const on = !document.body.classList.contains('menu-open');
    setOpen('menu-open', fabMenu, on);
    if (on) setTimeout(() => { const f = $('spin3') || document.querySelector('#brain-panel [data-sec="layout"] button'); if (f && !f.disabled) f.focus(); else if (f) $('chk-filelabels') && $('chk-filelabels').focus(); }, 0);
  };
  fabLegend.onclick = () => {
    const on = !document.body.classList.contains('legend-open');
    setOpen('legend-open', fabLegend, on);
    if (on) setTimeout(() => { const f = document.querySelector('#brain-legend .lg-row'); if (f) f.focus(); }, 0);
  };
  // Escape inside the menu or the legend closes it and hands focus back to its toggle
  const escClose = (box, cls, btn) => box && box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.body.classList.contains(cls)) return;
    e.stopPropagation(); setOpen(cls, btn, false); btn.focus();
  });
  escClose(panelEl, 'menu-open', fabMenu); escClose(legendEl, 'legend-open', fabLegend);

  // ---- full screen: the browser's own when the frame allows it, otherwise the standalone page in a new tab
  function inFull() { return !!document.fullscreenElement; }
  fabFull.onclick = async () => {
    try {
      if (inFull()) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen();
    } catch (e) {
      if (window.top !== window) { window.open(location.origin + '/gtm-os/brain/', '_blank', 'noopener'); BC.toast('Opened full size in a new tab'); }
      else BC.toast('Full screen is blocked by this browser');
    }
  };
  document.addEventListener('fullscreenchange', () => {
    fabFull.setAttribute('aria-pressed', String(inFull()));
    fabFull.innerHTML = inFull() ? '&#9974; Exit full screen' : '&#9974; Full screen';
  });

  // ---- back to the cockpit
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('#back-cockpit');
    if (!a) return;
    e.preventDefault();
    try { window.parent.postMessage({ type: 'gtm-brain-nav', href: '/' }, location.origin); } catch (x) { /* standalone */ }
  });

  // ---- ring controls in the menu: spin and file names
  const menuTimer = setInterval(() => {
    const S = BC.S, anchor = document.querySelector('#brain-panel [data-sec="layout"]');
    if (!S || !S.st || !anchor || $('spin3')) return;
    clearInterval(menuTimer);
    const w = el('div', { 'data-sec': 'ring' });
    w.innerHTML =
      '<div class="p-sub"><label for="spin3">Ring spin</label></div><div class="sl"><input type="range" min="0" max="100" id="spin3" aria-label="Ring spin speed"></div>' +
      '<label class="chk"><input type="checkbox" id="chk-filelabels"> File names</label>';
    anchor.before(w);
    const sl = w.querySelector('#spin3');
    sl.value = Math.round((S.st.spin || 0) * 100);
    if (S.reduced) { sl.disabled = true; sl.title = 'Your system asks for reduced motion, so the rings stay still'; }
    sl.oninput = () => { S.st.spin = sl.value / 100; try { localStorage.setItem('gtm-brain-v2-' + S.skin.key, JSON.stringify(S.st)); } catch (e) { } };
    const fl = w.querySelector('#chk-filelabels');
    fl.checked = S.st.fileLabels !== false;
    fl.onchange = () => { S.st.fileLabels = fl.checked; try { localStorage.setItem('gtm-brain-v2-' + S.skin.key, JSON.stringify(S.st)); } catch (e) { } };
  }, 250);

  // ---- the searchable list: every item the canvas can show, reachable by keyboard and screen reader
  const list = el('aside', { id: 'brain-list', 'aria-label': 'Searchable list of every item in the brain', hidden: '' });
  list.innerHTML =
    '<div class="bl-head"><h2 id="bl-title">All items</h2><button type="button" id="bl-close" class="act" aria-label="Close the list">Close</button></div>' +
    '<label for="bl-q" class="bl-lab">Filter by name, path or description</label>' +
    '<input id="bl-q" type="search" autocomplete="off" placeholder="skill, hook, agent, note...">' +
    '<div id="bl-count" class="bl-count" role="status" aria-live="polite"></div>' +
    '<div id="bl-body" tabindex="-1"></div>';
  document.body.appendChild(list);
  const LAYER_ORDER = [['S', 'Skills and agents'], ['R', 'Routines: hooks and loops'], ['M', 'Memory: rules, vault, playbook'], ['A', 'Applications: GTM OS surfaces']];
  let renderToken = 0;

  function row(x) {
    const kind = x.type === 'dir' ? (x.skillMd || /\/skills\/[^/]+$/.test(x.path || '') ? 'skill' : 'folder') : x.type === 'app' ? 'surface' : x.type === 'routine' ? (x.runner === 'loop' ? 'loop' : 'hook') : (x.kind === 'agent' || /\/agents\//.test(x.path || '') ? 'agent' : (x.ext || 'file').replace('.', ''));
    const where = x.virtual || x.type === 'app' || x.type === 'routine' ? '' : x.path;
    const label = x.name || x.label;
    return '<li><button type="button" class="bl-item" data-path="' + esc(x.id || x.path) + '"><span class="bl-name">' + esc(label) + (x.type === 'dir' ? '/' : '') + '</span>' +
      '<span class="bl-kind">' + esc(kind) + '</span>' + (where ? '<span class="bl-path">' + esc(where) + '</span>' : '') + '</button></li>';
  }

  async function render() {
    const my = ++renderToken;
    const q = $('bl-q').value.trim();
    const body = $('bl-body'), count = $('bl-count');
    let groups = [], total = 0;
    if (q) {
      const r = await fetch('/api/search?q=' + encodeURIComponent(q));
      const d = await r.json();
      if (my !== renderToken) return;
      const items = (d.results || []);
      total = items.length;
      groups = LAYER_ORDER.map(([k, t]) => [t, items.filter((x) => (x.layer || 'M') === k)]).filter((g) => g[1].length);
    } else {
      const S = BC.S;
      const items = S.nodes.filter((n) => (n.type === 'file' || n.type === 'dir' || n.type === 'app' || n.type === 'routine') && !n._lazyParent);
      total = items.length;
      groups = LAYER_ORDER.map(([k, t]) => [t, items.filter((n) => n.layer === k)]).filter((g) => g[1].length);
    }
    count.textContent = total + (total === 1 ? ' item' : ' items') + (q ? ' match "' + q + '"' : '');
    body.innerHTML = groups.length
      ? groups.map(([t, items]) => '<h3 class="bl-group">' + esc(t) + ' <span>' + items.length + '</span></h3><ul>' + items.map(row).join('') + '</ul>').join('')
      : '<p class="bl-none">Nothing matches. Try a skill name such as "tdd", or a hook such as "loud".</p>';
  }

  let listOpener = null;
  function openList() {
    listOpener = document.activeElement;
    list.hidden = false;
    setOpen('list-open', fabList, true);
    render().then(() => { $('bl-q').focus(); });
  }
  function closeList(restore) {
    list.hidden = true;
    setOpen('list-open', fabList, false);
    if (restore !== false) (listOpener && document.contains(listOpener) ? listOpener : fabList).focus();
  }
  fabList.onclick = () => (list.hidden ? openList() : closeList());
  $('bl-close').onclick = () => closeList();
  let t = null;
  $('bl-q').oninput = () => { clearTimeout(t); t = setTimeout(render, 140); };
  $('bl-body').addEventListener('click', async (e) => {
    const b = e.target.closest('.bl-item');
    if (!b) return;
    closeList(false);
    await BC.jumpTo(b.dataset.path);
    const card = $('brain-card');
    if (card && card.style.display !== 'none') { card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true }); }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeList(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.classList) {
      const items = [...list.querySelectorAll('.bl-item')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && (i >= 0 || e.target.id === 'bl-q') && items.length) { e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
      if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); if (i === 0) $('bl-q').focus(); else items[i - 1].focus(); }
    }
  });
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault(); list.hidden ? openList() : closeList();
    }
  });

  // the card is a region a screen reader can land on
  const card = $('brain-card');
  if (card) { card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Selected item'); card.setAttribute('aria-live', 'polite'); }

  // legend rows are buttons: Enter and Space work like a click
  const legend = $('brain-legend');
  if (legend) legend.addEventListener('keydown', (e) => {
    const row = e.target.closest && e.target.closest('.lg-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); const k = row.dataset.dept || row.dataset.layer; setTimeout(() => { const again = legend.querySelector('[data-dept="' + k + '"],[data-layer="' + k + '"]'); if (again) again.focus(); }, 0); }
  });
})();
