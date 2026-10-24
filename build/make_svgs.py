"""Render the GTM folder-walk animations as self-contained animated SVGs.

One arrow travels the go-to-market stage folders from first to last, dwelling on each one. As it lands,
the folder opens, turns cyan, and its items fade in underneath. One master file (the whole stack) plus one
file per kind (agents, skills, loops, automations), each in a wide and a phone layout.

Data: ../content/gtm.json (stages in order; each stage carries items tagged by kind).
Output: ../dist/svg/<name>.svg and <name>-mobile.svg. Pure SMIL + CSS, no script, so the files animate inside
an <img>, on GitHub, and in a browser tab. Every miss raises; nothing half-built is written.
"""
import html, json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "gtm.json"
OUT = HERE.parent / "dist" / "svg"

BG, CARD, LINE, DIM, TEXT, MUTED = "#12132a", "#1a1a2e", "#2a2c4a", "#3a3d63", "#f4f5fb", "#a3a7c7"
CYAN, MAGENTA = "#00e5ff", "#ff3df5"
FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

MOVE, DWELL, HOLD = 0.9, 1.5, 3.5  # seconds: travel between folders, pause on each, hold at the end


class BuildError(Exception):
    pass


def esc(s):
    return html.escape(str(s), quote=True)


def wrap(text, width):
    words, lines, cur = str(text).split(), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    if cur:
        lines.append(cur)
    return lines


def folder_path(w, h):
    tab_w, tab_h, r = w * 0.38, h * 0.16, 7
    return (f"M{r},{tab_h} L{r},{r} Q0,0 {r*2},0 L{tab_w - 8},0 Q{tab_w},0 {tab_w + 6},{tab_h * 0.6} "
            f"L{tab_w + 12},{tab_h} L{w - r},{tab_h} Q{w},{tab_h} {w},{tab_h + r} L{w},{h - r} Q{w},{h} {w - r},{h} "
            f"L{r},{h} Q0,{h} 0,{h - r} L0,{tab_h + r} Q0,{tab_h} {r},{tab_h} Z")


def timeline(n):
    """Arrival time of each folder, the cycle length, and the keyTimes for the arrow's motion."""
    arrive = [MOVE + i * (MOVE + DWELL) for i in range(n)]
    total = arrive[-1] + DWELL + HOLD
    return arrive, total


def build(stages, kind, title, subtitle, layout):
    n = len(stages)
    if n < 3:
        raise BuildError(f"{title}: need at least 3 stages, got {n}")
    wide = layout == "wide"
    if wide:
        cols, fw, fh, gx, gy = 5, 170, 118, 62, 250
        W = 130 + cols * fw + (cols - 1) * gx  # extra right margin carries the row drop
        top = 150
        # snake: even rows run left to right, odd rows right to left, so the arrow drops straight down at a row end
        pos = [(40 + ((i % cols) if (i // cols) % 2 == 0 else (cols - 1 - i % cols)) * (fw + gx), top + (i // cols) * gy)
               for i in range(n)]
        H = top + ((n - 1) // cols + 1) * gy + 30
        item_w, item_lines = 30, 4
    else:
        fw, fh = 92, 66
        W, top, gy = 420, 150, 150
        pos = [(28, top + i * gy) for i in range(n)]
        H = top + n * gy + 20
        item_w, item_lines = 30, 3

    arrive, total = timeline(n)
    # arrow anchor points: just above-left of each folder's tab
    pts = [(x + fw * 0.5, y - 26) if wide else (x + fw + 22, y + fh * 0.5) for x, y in pos]
    start = (pts[0][0] - (110 if wide else 0), pts[0][1] - (0 if wide else 56))
    path = [f"M{start[0]:.1f},{start[1]:.1f}"]
    for i, (px, py) in enumerate(pts):
        if wide and i > 0 and pos[i][1] != pos[i - 1][1]:
            (c1x, c1y), (c2x, c2y) = wrap_ctrl(pts[i - 1], (px, py), pos[i - 1][0], fw)
            path.append(f"C{c1x:.1f},{c1y:.1f} {c2x:.1f},{c2y:.1f} {px:.1f},{py:.1f}")
        else:
            path.append(f"L{px:.1f},{py:.1f}")
    d = " ".join(path)
    # keyPoints by segment count (each segment is equal in keyPoints space; SMIL paces by keyPoints, not length)
    seg = n  # start->p0 plus n-1 hops
    kp, kt = ["0"], ["0"]
    for i in range(n):
        k = (i + 1) / seg
        kp += [f"{k:.4f}", f"{k:.4f}"]
        kt += [f"{arrive[i] / total:.4f}", f"{min(arrive[i] + DWELL, total) / total:.4f}"]
    kp.append("1")
    kt.append("1")
    # the arrow must ride the path piecewise-linearly by segment, so rebuild the path as equal-length-free
    # segments: SMIL keyPoints are fractions of path LENGTH, so convert by measuring segments numerically.
    lengths = seg_lengths(start, pts, pos, wide)
    cum = [0.0]
    for L in lengths:
        cum.append(cum[-1] + L)
    tot_len = cum[-1]
    kp = ["0"]
    for i in range(n):
        f = cum[i + 1] / tot_len
        kp += [f"{f:.4f}", f"{f:.4f}"]
    kp.append("1")

    css, body = [], []
    css.append(f"text{{font-family:{FONT}}}"
               f".t{{fill:{TEXT};font-weight:700}} .m{{fill:{MUTED}}} .num{{fill:{MUTED};font-weight:700}}"
               f".fold{{fill:{CARD};stroke:{DIM};stroke-width:2}}")
    for i, (stage, (x, y)) in enumerate(zip(stages, pos)):
        on = arrive[i] / total * 100
        on2 = min(on + 2.5, 99.0)
        css.append(
            f"@keyframes f{i}{{0%,{on:.2f}%{{fill:{CARD};stroke:{DIM}}}{on2:.2f}%,97%{{fill:#0f3a4a;stroke:{CYAN}}}100%{{fill:{CARD};stroke:{DIM}}}}}"
            f"@keyframes o{i}{{0%,{on:.2f}%{{opacity:0;transform:translateY(6px)}}{on2:.2f}%,97%{{opacity:1;transform:translateY(0)}}100%{{opacity:0}}}}"
            f"@keyframes l{i}{{0%,{on:.2f}%{{transform:scaleY(1)}}{on2:.2f}%,97%{{transform:scaleY(.82) skewX(-8deg)}}100%{{transform:scaleY(1)}}}}"
            f"#F{i}{{animation:f{i} {total:.2f}s linear infinite}}"
            f"#O{i}{{animation:o{i} {total:.2f}s linear infinite;opacity:0}}"
            f"#L{i}{{animation:l{i} {total:.2f}s linear infinite;transform-origin:0px {fh}px;transform-box:fill-box}}")
        items = [it for it in stage["items"] if kind in (None, it["kind"])]
        count = len(items)
        g = [f'<g transform="translate({x},{y})">',
             f'<path id="F{i}" class="fold" d="{folder_path(fw, fh)}"/>',
             f'<rect id="L{i}" x="2" y="{fh * 0.34:.1f}" width="{fw - 4}" height="{fh * 0.66 - 2:.1f}" rx="6" fill="{BG}" opacity=".55"/>',
             f'<text class="num" x="{fw - 12}" y="{fh - 14}" text-anchor="end" font-size="{30 if wide else 22}">{i + 1:02d}</text>']
        if wide:
            tx, ty = 0, fh + 28
        else:
            tx, ty = fw + 54, 18
        name_lines = wrap(stage["name"], 22 if wide else 24)
        for j, ln in enumerate(name_lines[:2]):
            g.append(f'<text class="t" x="{tx}" y="{ty + j * 19}" font-size="16">{esc(ln)}</text>')
        ty += 19 * min(len(name_lines), 2) + 4
        detail = []
        if kind is None:
            detail = wrap(stage["outcome"], item_w)[:item_lines]
        else:
            for it in items[:item_lines]:
                detail.append("• " + it["name"])
            if count > item_lines:
                detail.append(f"+ {count - item_lines} more")
            if count == 0:
                detail.append("—")
        g.append(f'<g id="O{i}">')
        for j, ln in enumerate(detail):
            colour = CYAN if (kind and ln.startswith("+")) else MUTED
            g.append(f'<text x="{tx}" y="{ty + 4 + j * 18}" font-size="13" fill="{colour}">{esc(ln[:item_w + 6])}</text>')
        if kind is not None and count:
            g.append(f'<rect x="{fw - 46 if wide else -2}" y="{-14 if wide else fh + 6}" width="44" height="22" rx="11" fill="{MAGENTA}"/>'
                     f'<text x="{fw - 24 if wide else 20}" y="{2 if wide else fh + 22}" font-size="13" font-weight="700" text-anchor="middle" fill="#14051a">{count}</text>')
        g.append("</g></g>")
        body.append("".join(g))

    trail = (f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2" stroke-dasharray="4 8"/>'
             f'<path d="{d}" fill="none" stroke="{CYAN}" stroke-width="2.5" stroke-linecap="round" pathLength="1" '
             f'stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" dur="{total:.2f}s" '
             f'repeatCount="indefinite" calcMode="linear" keyTimes="{";".join(kt)}" values="{";".join(f"{1 - float(k):.4f}" for k in kp)}"/></path>')
    arrow = (f'<g><path d="M0,-11 L22,0 L0,11 L5,0 Z" fill="{CYAN}" stroke="{BG}" stroke-width="1.5"/>'
             f'<animateMotion dur="{total:.2f}s" repeatCount="indefinite" rotate="auto" calcMode="linear" '
             f'keyPoints="{";".join(kp)}" keyTimes="{";".join(kt)}" path="{d}"/></g>')
    head = (f'<text class="t" x="{40 if wide else 28}" y="58" font-size="{30 if wide else 24}">{esc(title)}</text>'
            + "".join(f'<text class="m" x="{40 if wide else 28}" y="{90 + k * 20}" font-size="15">{esc(s)}</text>'
                      for k, s in enumerate(wrap(subtitle, 110 if wide else 46)[:2])))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-label="{esc(title)}: {esc(", ".join(s["name"] for s in stages))}">'
           f'<title>{esc(title)}</title><style>{"".join(css)}</style>'
           f'<rect width="{W}" height="{H}" rx="18" fill="{BG}"/>'
           f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="17" fill="none" stroke="{CYAN}" stroke-opacity=".18"/>'
           f'{head}{trail}{"".join(body)}{arrow}</svg>')
    return svg


FW_WIDE = 170


def wrap_ctrl(prev, p, folder_x, fw):
    """Control points for the drop between rows: swing outside the row end, away from the folders."""
    out = 1 if folder_x > 400 else -1
    edge = prev[0] + out * (fw * 0.5 + 62)
    return (edge, prev[1] + 40), (edge, p[1] - 70)


def seg_lengths(start, pts, pos, wide):
    """Approximate each path segment's length (beziers sampled) so keyPoints land exactly on each folder."""
    out, prev = [], start
    for i, p in enumerate(pts):
        if wide and i > 0 and pos[i][1] != pos[i - 1][1]:
            c1, c2 = wrap_ctrl(prev, p, pos[i - 1][0], FW_WIDE)
            L, last = 0.0, prev
            for s in range(1, 201):
                t = s / 200
                x = (1 - t) ** 3 * prev[0] + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t ** 2 * c2[0] + t ** 3 * p[0]
                y = (1 - t) ** 3 * prev[1] + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t ** 2 * c2[1] + t ** 3 * p[1]
                L += ((x - last[0]) ** 2 + (y - last[1]) ** 2) ** 0.5
                last = (x, y)
            out.append(L)
        else:
            out.append(((p[0] - prev[0]) ** 2 + (p[1] - prev[1]) ** 2) ** 0.5)
        prev = p
    return out


def main():
    if not DATA.exists():
        raise BuildError(f"missing {DATA}")
    data = json.loads(DATA.read_text())
    stages = data["stages"]
    for s in stages:
        for k in ("name", "outcome", "items"):
            if k not in s:
                raise BuildError(f"stage {s.get('name', '?')} is missing {k}")
        for it in s["items"]:
            if it.get("kind") not in ("agent", "skill", "loop", "automation"):
                raise BuildError(f"item {it.get('name')} in {s['name']} has kind {it.get('kind')!r}")
    OUT.mkdir(parents=True, exist_ok=True)
    sets = [("gtm-stack", None, data["title"], data["subtitle"])]
    for kind, label in (("agent", "Agents"), ("skill", "Skills"), ("loop", "Loops"), ("automation", "Automations")):
        sets.append((f"gtm-{kind}s", kind, f"{label} across the GTM stack", data["kinds"][kind]))
    written = []
    for name, kind, title, sub in sets:
        for layout, suffix in (("wide", ""), ("mobile", "-mobile")):
            f = OUT / f"{name}{suffix}.svg"
            f.write_text(build(stages, kind, title, sub, layout))
            written.append(f)
    for f in written:
        print(f"{f}  {f.stat().st_size:,} bytes")


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        sys.exit(f"make_svgs: {e}")
