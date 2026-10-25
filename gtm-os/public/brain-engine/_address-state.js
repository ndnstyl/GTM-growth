/* the address-state resolution the browser renders and the tests assert.
 *
 * WHY THIS FILE EXISTS AT ALL. `_core.js` is `window.BrainCore = (function(){…})()` and
 * exports only `{boot, S, expandDir, …}`; `colorOf`, `pass`, `groupKeyOf` and
 * `rebuildLegend` are private to that closure and need `window`/`document`. So any
 * `node --test` of the legend or the colour rules necessarily tests a REIMPLEMENTATION,
 * and stays green while the shipped legend is wrong. The adversarial review of this
 * feature's kit caught exactly that (found in review). Every rule that decides
 * what an unaddressed note looks like therefore lives here, in one requireable place
 * that the browser loads as a plain script and the tests load with require().
 *
 * Pure. No DOM, no fs, no network, no module-level state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AddressState = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A node counts toward a department or state row only if it is a vault-ish file or
  // folder in the Memory layer. Apps, routines, agents and skills carry no address.
  function isAddressable(n) {
    return !!n && (n.type === 'file' || n.type === 'dir') && n.layer !== 'S';
  }

  // The state of a node. `state` is stamped by scan.js; the `dept` fallback keeps an
  // older payload (a server that has not restarted yet) rendering correctly rather than
  // silently dropping every unaddressed node out of its own group.
  function stateOf(n) {
    if (!n) return null;
    if (n.state !== undefined && n.state !== null) return n.state;
    if (n.type === 'hub' && n.hubKind === 'state') return n.stateKey || n.dept || null;
    if (n.dept === 'unresolved') return 'unresolved';
    return null;
  }

  function isState(n) { return stateOf(n) !== null; }

  /* Palette shape: { dept: {key: hex}, state: {key: hex} }.
   *
   * Returns the colour for a node whose colour is decided by its address, or null when
   * the caller's earlier branches (router, agent, layer, access mode, folder view, _fhub)
   * own it. Returning null rather than a grey is deliberate: the anonymous
   * `|| '#8fa3ad'` fallback this replaces is what made several hundred unaddressed notes
   * render as anonymous dots with no legend row, which is the defect this feature fixes.
   * A caller that gets null must fall through to its own branch, never to a grey.
   */
  function addressColor(n, palette) {
    if (!n || !palette) return null;
    const st = stateOf(n);
    if (st) return (palette.state && palette.state[st]) || null;
    if (n.dept && palette.dept && palette.dept[n.dept]) return palette.dept[n.dept];
    return null;
  }

  /* Grouping. State nodes key as 'S:<state>', never 'D:<dept>'.
   *
   * The prefix matters beyond tidiness: three call sites in the shipped renderer read
   * anchors without testing the prefix (the deck-arc loop, the rings sector pool, and
   * applyColors). Keeping states on their own prefix is what lets those sites be fixed
   * by an explicit skip rather than by guessing which anchors are departments.
   */
  function groupKeyOf(n, view) {
    if (view === 'context') {
      if (n.type === 'app' || n.type === 'agent') return 'L:A';
      if (n.type === 'routine') return 'L:R';
      if (n.layer === 'S') return 'L:S';
      const st = stateOf(n);
      if (st) return 'S:' + st;
      return 'D:' + (n.dept || 'business');
    }
    if (n.type === 'app' || n.type === 'routine' || n.type === 'agent') return 'F:(system)';
    return 'F:' + (n.top || '(root)');
  }

  function isStateAnchorKey(key) { return typeof key === 'string' && key.indexOf('S:') === 0; }
  function isDeptAnchorKey(key) { return typeof key === 'string' && key.indexOf('D:') === 0; }

  /* The filter. A hidden state hides its nodes AND its hub; a hub must follow the state
   * toggle, not the department toggle, or hiding the group leaves its hub on the canvas.
   */
  function passesState(n, stateToggles) {
    const st = stateOf(n);
    if (!st) return true;
    return !stateToggles || stateToggles[st] !== false;
  }

  /* Legend counts, over the SAME visible set the canvas draws, so the number under the
   * swatch cannot drift from the number of dots. `brandOn` and `deptOn` are injected so
   * the caller keeps ownership of the other axes.
   */
  function legendCounts(visible, cfg, opts) {
    const o = opts || {};
    const brandOn = o.brandOn || (() => true);
    const out = { dept: {}, state: {} };
    for (const d of (cfg.departments || [])) out.dept[d.key] = 0;
    for (const s of (cfg.states || [])) out.state[s.key] = 0;
    for (const n of visible || []) {
      if (!isAddressable(n) || !brandOn(n)) continue;
      const st = stateOf(n);
      if (st) { if (st in out.state) out.state[st] += 1; }
      else if (n.dept && n.dept in out.dept) out.dept[n.dept] += 1;
    }
    return out;
  }

  /* The tooltip and inspector line. Never returns an empty string: a blank department
   * line is how the state read as a rendering glitch in the first place.
   */
  const REASONS = {
    'no-dept-key': 'no dept key, and no folder rule or filename keyword matched',
    'folder-defers': 'its folder cannot decide a department on its own',
    'unruled-value-then-no-match': 'its dept value is not one of the eight ruled departments',
  };

  function addressLabel(n, cfg) {
    const st = stateOf(n);
    if (st) {
      const row = (cfg.states || []).find(s => s.key === st);
      const label = (row && row.label) || st;
      const why = REASONS[n.reason] || (row && row.hint) || '';
      return why ? label + ' · ' + why : label;
    }
    const d = (cfg.departments || []).find(x => x.key === n.dept);
    return (d && d.label) || '';
  }

  return {
    isAddressable, stateOf, isState, addressColor, groupKeyOf,
    isStateAnchorKey, isDeptAnchorKey, passesState, legendCounts, addressLabel, REASONS,
  };
});
