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
AMBER, GREEN = "#ffb547", "#3ee08f"
SOFT = "#c9cce8"
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
        cols, fw, fh, gx, gy = 5, 170, 118, 62, 292
        W = 130 + cols * fw + (cols - 1) * gx  # extra right margin carries the row drop
        top = header(title, subtitle, '', CYAN, 0, 1, True)[1] + 34
        # snake: even rows run left to right, odd rows right to left, so the arrow drops straight down at a row end
        pos = [(40 + ((i % cols) if (i // cols) % 2 == 0 else (cols - 1 - i % cols)) * (fw + gx), top + (i // cols) * gy)
               for i in range(n)]
        H = top + ((n - 1) // cols + 1) * gy + 30
        item_w, item_lines = 23, 5
    else:
        fw, fh = 92, 66
        W, gy = 420, 150
        top = header(title, subtitle, '', CYAN, 0, 1, False)[1] + 14
        pos = [(28, top + i * gy) for i in range(n)]
        H = top + n * gy + 20
        item_w, item_lines = 30, 4

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

    css, body, anim = [], [], []
    css.append(f"text{{font-family:{FONT}}}"
               f".t{{fill:{TEXT};font-weight:700}} .m{{fill:{MUTED}}} .num{{fill:{MUTED};font-weight:700}}"
               f".fold{{fill:#0f3a4a;stroke:{CYAN};stroke-width:2}}"
               f"@media (prefers-reduced-motion:reduce){{.arw,.trl{{display:none}}}}")
    for i, (stage, (x, y)) in enumerate(zip(stages, pos)):
        on = arrive[i] / total * 100
        on2 = min(on + 2.5, 99.0)
        anim.append(
            f"@keyframes f{i}{{0%,{on:.2f}%{{fill:{CARD};stroke:{DIM}}}{on2:.2f}%,97%{{fill:#0f3a4a;stroke:{CYAN}}}100%{{fill:{CARD};stroke:{DIM}}}}}"
            f"@keyframes o{i}{{0%,{on:.2f}%{{opacity:0;transform:translateY(6px)}}{on2:.2f}%,97%{{opacity:1;transform:translateY(0)}}100%{{opacity:0}}}}"
            f"@keyframes l{i}{{0%,{on:.2f}%{{transform:scaleY(1)}}{on2:.2f}%,97%{{transform:scaleY(.82) skewX(-8deg)}}100%{{transform:scaleY(1)}}}}"
            f"#F{i}{{animation:f{i} {total:.2f}s linear infinite}}"
            f"#O{i}{{animation:o{i} {total:.2f}s linear infinite}}"
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
            detail = wrap(stage["outcome"], item_w)
            if len(detail) > item_lines:
                raise BuildError(f"{stage['name']}: outcome needs {len(detail)} lines, room for {item_lines}")
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
            g.append(f'<text x="{tx}" y="{ty + 4 + j * 18}" font-size="13" fill="{colour}">{esc(ln)}</text>')
        if kind is not None and count:
            g.append(f'<rect x="{fw - 46 if wide else -2}" y="{-14 if wide else fh + 6}" width="44" height="22" rx="11" fill="{MAGENTA}"/>'
                     f'<text x="{fw - 24 if wide else 20}" y="{2 if wide else fh + 22}" font-size="13" font-weight="700" text-anchor="middle" fill="#14051a">{count}</text>')
        g.append("</g></g>")
        body.append("".join(g))

    trail = (f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2" stroke-dasharray="4 8"/>'
             f'<path class="trl" d="{d}" fill="none" stroke="{CYAN}" stroke-width="2.5" stroke-linecap="round" pathLength="1" '
             f'stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" dur="{total:.2f}s" '
             f'repeatCount="indefinite" calcMode="linear" keyTimes="{";".join(kt)}" values="{";".join(f"{1 - float(k):.4f}" for k in kp)}"/></path>')
    arrow = (f'<g class="arw"><path d="M0,-11 L22,0 L0,11 L5,0 Z" fill="{CYAN}" stroke="{BG}" stroke-width="1.5"/>'
             f'<animateMotion dur="{total:.2f}s" repeatCount="indefinite" rotate="auto" calcMode="linear" '
             f'keyPoints="{";".join(kp)}" keyTimes="{";".join(kt)}" path="{d}"/></g>')
    head = header(title, subtitle, 'ALL TEN FOLDERS', CYAN, W, total, wide)[0]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-label="{esc(title)}: {esc(", ".join(s["name"] for s in stages))}">'
           f'<title>{esc(title)}</title><style>{"".join(css)}@media (prefers-reduced-motion:no-preference){{{"".join(anim)}}}</style>'
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


# ---------------------------------------------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------------------------------------------
def mix(a, b, t):
    """Blend hex colour a over b at strength t (0..1)."""
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * t + y * (1 - t)):02x}" for x, y in zip(pa, pb))


def header(title, sub, eyebrow, accent, W, T, wide):
    """Eyebrow, title and subtitle. Returns (svg, y where content may start). The breathing accent bar is also the
    cycle-length marker the frame tool reads (dur)."""
    x = 40 if wide else 28
    tl = wrap(title, 60 if wide else 22)
    sl = wrap(sub, 118 if wide else 46)
    fs, lh = (30, 36) if wide else (24, 30)
    out = [f'<rect x="0" y="0" width="{W}" height="4" fill="{accent}"><animate attributeName="opacity" '
           f'values="1;.45;1" dur="{T:.2f}s" repeatCount="indefinite"/></rect>',
           f'<text x="{x}" y="38" font-size="12.5" font-weight="700" letter-spacing="2" fill="{accent}">{esc(eyebrow)}</text>']
    y = 38 + 12 + fs
    for ln in tl:
        out.append(f'<text class="t" x="{x}" y="{y}" font-size="{fs}">{esc(ln)}</text>')
        y += lh
    y -= lh - 24
    for ln in sl:
        out.append(f'<text class="m" x="{x}" y="{y}" font-size="15">{esc(ln)}</text>')
        y += 21
    return "".join(out), y + 18


def kf(name, t_on, T, off, on, rise=0.4):
    """Keyframes: off until t_on, ease to on, hold to 94 percent, return to off by the end of the cycle."""
    a = t_on / T * 100
    b = a + rise / T * 100
    if b >= 93:
        raise BuildError(f"{name}: lights too late in the cycle ({b:.1f}%)")
    return f"@keyframes {name}{{0%,{a:.2f}%{{{off}}}{b:.2f}%,94%{{{on}}}100%{{{off}}}}}"


def window_kf(name, t_on, T, span=0.7):
    """Opacity 0 -> 1 -> 0 around t_on (the cursor or marker that visits an item)."""
    a, b = (t_on - 0.12) / T * 100, (t_on + span) / T * 100
    a = max(a, 0.0)
    return (f"@keyframes {name}{{0%,{a:.2f}%{{opacity:0}}{a + 0.4:.2f}%,{b:.2f}%{{opacity:1}}"
            f"{b + 0.5:.2f}%,100%{{opacity:0}}}}")


def svg_doc(W, H, title, label, accent, css, anim, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            f'aria-label="{esc(label)}"><title>{esc(title)}</title>'
            f'<style>text{{font-family:{FONT}}}.t{{fill:{TEXT};font-weight:700}}.m{{fill:{MUTED}}}{css}'
            f'@media (prefers-reduced-motion:no-preference){{{anim}}}</style>'
            f'<rect width="{W}" height="{H}" rx="18" fill="{BG}"/>'
            f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="17" fill="none" stroke="{accent}" stroke-opacity=".22"/>'
            f'{body}</svg>')


def kind_items(stages, kind):
    out = [(si, s["name"], it["name"]) for si, s in enumerate(stages) for it in s["items"] if it["kind"] == kind]
    if not out:
        raise BuildError(f"no {kind} items")
    return out


def lines_svg(lines, x, y, size, lh, cls="", fill=None, weight=None):
    a = f' class="{cls}"' if cls else ""
    f = f' fill="{fill}"' if fill else ""
    w = f' font-weight="{weight}"' if weight else ""
    return "".join(f'<text{a}{f}{w} x="{x}" y="{y + j * lh}" font-size="{size}">{esc(l)}</text>' for j, l in enumerate(lines))


# ---------------------------------------------------------------------------------------------------------------
# AGENTS: seat chart. Each agent is a seat; seats come online one by one.
# ---------------------------------------------------------------------------------------------------------------
def build_agents(stages, title, sub, layout):
    items = kind_items(stages, "agent")
    wide = layout == "wide"
    W = 1200 if wide else 420
    cols = 4 if wide else 1
    cw, gx, gy, x0 = (270, 20, 18, 30) if wide else (364, 0, 14, 28)
    names = [wrap(n, 19 if wide else 30) for _, _, n in items]
    ml = max(len(n) for n in names)
    ch = 52 + (ml - 1) * 21 + 22
    step = 0.55
    ton = [0.7 + i * step for i in range(len(items))]
    T = ton[-1] + 0.4 + 4.5
    hd, top = header(title, sub, "AGENTS  /  SEAT CHART", CYAN, W, T, wide)
    rows = -(-len(items) // cols)
    H = top + rows * (ch + gy) + 14
    lit_fill, lit_stroke = mix(CYAN, CARD, .17), CYAN
    anim, body = [], []
    for i, ((si, stg, nm), nl) in enumerate(zip(items, names)):
        r, c = divmod(i, cols)
        x, y = x0 + c * (cw + gx), top + r * (ch + gy)
        cy = ch / 2
        head_y, sh_y = cy - 16, cy + 10
        glyph = lambda col, fill: (f'<circle cx="32" cy="{head_y}" r="8" fill="{fill}" stroke="{col}" stroke-width="2"/>'
                                   f'<path d="M17,{sh_y} a15,15 0 0 1 30,0 Z" fill="{fill}" stroke="{col}" stroke-width="2" stroke-linejoin="round"/>')
        dim = (f'<rect width="{cw}" height="{ch}" rx="12" fill="{CARD}" stroke="{DIM}" stroke-width="2"/>'
               + glyph(MUTED, "none")
               + f'<text x="32" y="{sh_y + 18}" font-size="10.5" font-weight="700" letter-spacing="1" text-anchor="middle" fill="{MUTED}"></text>'
               + lines_svg([stg], 66, 26, 12.5, 0, fill=MUTED)
               + lines_svg(nl, 66, 52, 17, 21, fill=MUTED, weight=700))
        lit = (f'<g id="{layout[0]}a{i}">'
               f'<rect width="{cw}" height="{ch}" rx="12" fill="{lit_fill}" stroke="{lit_stroke}" stroke-width="2"/>'
               + glyph(CYAN, CYAN)
               + f'<text x="32" y="{sh_y + 18}" font-size="10.5" font-weight="700" letter-spacing="1" text-anchor="middle" fill="{CYAN}">ONLINE</text>'
               + lines_svg([stg], 66, 26, 12.5, 0, fill=SOFT)
               + lines_svg(nl, 66, 52, 17, 21, fill=TEXT, weight=700) + '</g>')
        body.append(f'<g class="c" transform="translate({x},{y})">{dim}{lit}</g>')
        anim.append(kf(f"{layout[0]}ak{i}", ton[i], T, "opacity:0", "opacity:1")
                    + f"#{layout[0]}a{i}{{animation:{layout[0]}ak{i} {T:.2f}s linear infinite}}")
    return svg_doc(W, H, title, f"{title}: " + ", ".join(n for _, _, n in items), CYAN, "", "".join(anim), hd + "".join(body))


# ---------------------------------------------------------------------------------------------------------------
# SKILLS: playbook shelf. Spines stand on a shelf per stage; a cursor passes and each spine fans out into a card.
# ---------------------------------------------------------------------------------------------------------------
def build_skills(stages, title, sub, layout):
    items = kind_items(stages, "skill")
    wide = layout == "wide"
    W = 1200 if wide else 420
    groups = []
    for si, stg, nm in items:
        if not groups or groups[-1][0] != si:
            groups.append((si, stg, []))
        groups[-1][2].append(nm)
    if wide:
        cols, cw, gx, cx0, wr = 4, 222, 14, 250, 19
    else:
        cols, cw, gx, cx0, wr = 2, 176, 12, 28, 16
    allw = [wrap(n, wr) for _, _, ns in groups for n in ns]
    ml = max(len(n) for n in allw)
    ch = 46 + (ml - 1) * 20 + 20
    rgap = 32
    step = 0.6
    n_all = len(items)
    ton = [0.8 + i * step for i in range(n_all)]
    T = ton[-1] + 0.6 + 4.5
    hd, top = header(title, sub, "SKILLS  /  PLAYBOOK SHELF", MAGENTA, W, T, wide)
    y = top + 12
    tint, body, anim = mix(MAGENTA, CARD, .16), [], []
    k = 0
    for si, stg, ns in groups:
        rows = -(-len(ns) // cols)
        if wide:
            body.append(lines_svg(wrap(stg, 17), 40, y + 34, 17, 21, cls="t")
                        + f'<text x="40" y="{y + 34 + 21 * len(wrap(stg, 17)) + 2}" font-size="13" fill="{MAGENTA}">{len(ns)} playbook{"s" if len(ns) > 1 else ""}</text>')
            ry0 = y
        else:
            body.append(f'<text class="t" x="28" y="{y + 16}" font-size="15">{esc(stg)}</text>'
                        f'<text x="{W - 28}" y="{y + 16}" font-size="13" text-anchor="end" fill="{MAGENTA}">{len(ns)} playbook{"s" if len(ns) > 1 else ""}</text>')
            ry0 = y + 24
        for r in range(rows):
            ry = ry0 + r * (ch + rgap)
            sub_ns = ns[r * cols:(r + 1) * cols]
            bw = len(sub_ns) * cw + (len(sub_ns) - 1) * gx
            body.append(f'<rect x="{cx0 - 6}" y="{ry + ch + 2}" width="{bw + 12}" height="8" rx="4" fill="{mix(MAGENTA, BG, .38)}"/>')
            for j, nm in enumerate(sub_ns):
                x = cx0 + j * (cw + gx)
                nl = wrap(nm, wr)
                p = f"{layout[0]}s{k}"
                spine = f'<rect x="{x}" y="{ry}" width="12" height="{ch}" rx="3" fill="{MAGENTA}"/>'
                card = (f'<g id="{p}"><rect x="{x + 12}" y="{ry}" width="{cw - 12}" height="{ch}" rx="8" fill="{tint}" stroke="{MAGENTA}" stroke-opacity=".7" stroke-width="1.5"/>'
                        f'<text x="{x + 26}" y="{ry + 22}" font-size="10.5" font-weight="700" letter-spacing="1.5" fill="{MAGENTA}">PLAYBOOK</text>'
                        + lines_svg(nl, x + 26, ry + 46, 16.5 if wide else 15, 20, fill=TEXT, weight=700) + '</g>')
                ccx = x + cw / 2
                cur = (f'<g id="{p}c" opacity="0"><path d="M{ccx - 8},{ry - 22} L{ccx + 8},{ry - 22} L{ccx},{ry - 8} Z" fill="{MAGENTA}"/>'
                       f'<circle cx="{ccx}" cy="{ry - 28}" r="3" fill="{MAGENTA}"/></g>')
                body.append(f'<g class="c">{spine}{card}</g>{cur}')
                anim.append(kf(f"{p}k", ton[k], T, "opacity:0;transform:rotate(-16deg) scaleX(.06)", "opacity:1;transform:none", rise=0.55)
                            + f"#{p}{{animation:{p}k {T:.2f}s linear infinite;transform-box:fill-box;transform-origin:0% 100%}}"
                            + window_kf(f"{p}w", ton[k], T) + f"#{p}c{{animation:{p}w {T:.2f}s linear infinite}}")
                k += 1
        y = ry0 + rows * (ch + rgap) + (4 if wide else 6)
    H = y + 10
    return svg_doc(W, H, title, f"{title}: " + ", ".join(n for _, _, n in items), MAGENTA, "", "".join(anim), hd + "".join(body))


# ---------------------------------------------------------------------------------------------------------------
# LOOPS: cadence clock. A ring split into stage arcs, one slot per loop; a sweep hand lights each as it passes.
# ---------------------------------------------------------------------------------------------------------------
def arc(cx, cy, R, a0, a1):
    import math
    pt = lambda a: (cx + R * math.sin(math.radians(a)), cy - R * math.cos(math.radians(a)))
    (x0, y0), (x1, y1) = pt(a0), pt(a1)
    return f"M{x0:.2f},{y0:.2f} A{R},{R} 0 {1 if a1 - a0 > 180 else 0} 1 {x1:.2f},{y1:.2f}"


def build_loops(stages, title, sub, layout):
    import math
    items = kind_items(stages, "loop")
    wide = layout == "wide"
    W = 1200 if wide else 420
    groups = []
    for si, stg, nm in items:
        if not groups or groups[-1][0] != si:
            groups.append((si, stg, []))
        groups[-1][2].append(nm)
    GAP = 0.9
    slots = len(items) + GAP * len(groups)
    deg = 360 / slots
    R = 185 if wide else 138
    sweep, hold = 20.0, 5.0
    T = sweep + hold
    hd, top = header(title, sub, "LOOPS  /  CADENCE CLOCK", AMBER, W, T, wide)
    wr = 34 if wide else 44
    lh, fs = 18, 14.5

    # list layout: blocks of (header, rows)
    blocks = []
    for si, stg, ns in groups:
        blocks.append((si, stg, [wrap(n, wr) for n in ns], ns))
    def bh(b):
        return 30 + sum(len(l) * lh + 7 for l in b[2]) + 8
    if wide:
        total_h = sum(bh(b) for b in blocks)
        colx = [570, 885]
        cols_blocks, acc, ci = [[], []], 0, 0
        for b in blocks:
            if ci == 0 and acc + bh(b) / 2 > total_h / 2 and acc > 0:
                ci = 1
            cols_blocks[ci].append(b)
            acc += bh(b)
        list_h = max(sum(bh(b) for b in cb) for cb in cols_blocks)
        clock_h = 2 * R + 90
        avail = max(list_h, clock_h)
        cx, cy = 270, top + avail / 2 + 6
        list_top = top + 6
        H = top + avail + 24
    else:
        cx, cy = 210, top + R + 52
        list_top = cy + R + 56
        colx = [28]
        cols_blocks = [blocks]
        H = list_top + sum(bh(b) for b in blocks) + 10

    tint = mix(AMBER, CARD, .14)
    ring, lit, labels, anim, lst = [], [], [], [], []
    ang = GAP / 2 * deg
    idx = 0
    item_ang = {}
    for si, stg, ns in groups:
        a_start = ang - GAP / 2 * deg * 0 
        for j, nm in enumerate(ns):
            a0, a1 = ang, ang + deg
            item_ang[idx] = a0
            ring.append(f'<path d="{arc(cx, cy, R, a0 + 0.8, a1 - 0.8)}" fill="none" stroke="{DIM}" stroke-width="12"/>')
            p = f"{layout[0]}l{idx}"
            lit.append(f'<path id="{p}t" d="{arc(cx, cy, R, a0 + 0.8, a1 - 0.8)}" fill="none" stroke="{AMBER}" stroke-width="12"/>')
            ton = a0 / 360 * sweep + 0.05
            anim.append(kf(f"{p}k", ton, T, "opacity:0", "opacity:1", rise=0.3)
                        + f"#{p}t,#{p}r{{animation:{p}k {T:.2f}s linear infinite}}")
            idx += 1
            ang = a1
        mid = (item_ang[idx - len(ns)] + ang) / 2
        lx, ly = cx + (R + 28) * math.sin(math.radians(mid)), cy - (R + 28) * math.cos(math.radians(mid))
        labels.append(f'<text x="{lx:.1f}" y="{ly + 4.5:.1f}" font-size="13" font-weight="700" text-anchor="middle" fill="{AMBER}">{si + 1:02d}</text>')
        ang += GAP * deg

    # lists
    idx = 0
    for ci, cb in enumerate(cols_blocks):
        y = list_top
        for si, stg, nls, ns in cb:
            lst.append(f'<text x="{colx[ci]}" y="{y + 18}" font-size="15" font-weight="700" fill="{AMBER}">{si + 1:02d}  {esc(stg)}</text>')
            lst.append(f'<line x1="{colx[ci]}" y1="{y + 26}" x2="{colx[ci] + (270 if wide else 364)}" y2="{y + 26}" stroke="{LINE}"/>')
            y += 30
            for nl in nls:
                p = f"{layout[0]}l{idx}"
                yy = y + 15
                dim = (f'<circle cx="{colx[ci] + 5}" cy="{yy - 5}" r="4" fill="none" stroke="{MUTED}" stroke-width="1.5"/>'
                       + lines_svg(nl, colx[ci] + 20, yy, fs, lh, fill=MUTED))
                litg = (f'<g id="{p}r"><circle cx="{colx[ci] + 5}" cy="{yy - 5}" r="4.5" fill="{AMBER}"/>'
                        + lines_svg(nl, colx[ci] + 20, yy, fs, lh, fill=TEXT) + '</g>')
                lst.append(f'<g class="c">{dim}{litg}</g>')
                y += len(nl) * lh + 7
                idx += 1
            y += 8

    # sweep hand: a symmetric invisible circle gives the group a centred box, so it rotates about the clock centre
    hand = (f'<g id="{layout[0]}hand" style="transform-box:fill-box;transform-origin:50% 50%">'
            f'<circle cx="{cx}" cy="{cy}" r="{R + 8}" fill="none"/>'
            f'<path d="M{cx},{cy} L{cx},{cy - R - 8} A{R + 8},{R + 8} 0 0 0 {cx - (R + 8) * math.sin(math.radians(34)):.2f},{cy - (R + 8) * math.cos(math.radians(34)):.2f} Z" fill="{AMBER}" fill-opacity=".14"/>'
            f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy - R - 12}" stroke="{AMBER}" stroke-width="3" stroke-linecap="round"/>'
            f'<circle cx="{cx}" cy="{cy - R - 12}" r="5.5" fill="{AMBER}"/></g>')
    s_pct = sweep / T * 100
    anim.append(f"@keyframes {layout[0]}hk{{0%{{transform:rotate(0deg)}}{s_pct:.2f}%,100%{{transform:rotate(360deg)}}}}"
                f"#{layout[0]}hand{{animation:{layout[0]}hk {T:.2f}s linear infinite}}")
    center = (f'<text x="{cx}" y="{cy + 4}" font-size="{58 if wide else 46}" font-weight="800" text-anchor="middle" fill="{AMBER}">{len(items)}</text>'
              f'<text x="{cx}" y="{cy + 30}" font-size="14" text-anchor="middle" fill="{SOFT}">loops on a schedule</text>'
              f'<text x="{cx}" y="{cy + 50}" font-size="13" text-anchor="middle" fill="{MUTED}">no one presses a button</text>'
              f'<circle cx="{cx}" cy="{cy}" r="{R - 18}" fill="none" stroke="{LINE}" stroke-dasharray="2 7"/>')
    body = hd + "".join(ring) + "".join(lit) + "".join(labels) + hand + center + "".join(lst)
    return svg_doc(W, H, title, f"{title}: " + ", ".join(n for _, _, n in items), AMBER, "", "".join(anim), body)


# ---------------------------------------------------------------------------------------------------------------
# AUTOMATIONS: always-on pipeline. Systems are nodes on a flowing line; a pulse travels through and each goes live.
# ---------------------------------------------------------------------------------------------------------------
def build_automations(stages, title, sub, layout):
    items = kind_items(stages, "automation")
    wide = layout == "wide"
    W = 1200 if wide else 420
    n = len(items)
    wr = 16 if wide else 27
    names = [wrap(nm, wr) for _, _, nm in items]
    ml = max(len(x) for x in names)
    ch = 50 + (ml - 1) * 20 + 36
    pre = layout[0] + "p"
    lit_fill = mix(GREEN, CARD, .16)
    per = 5
    D = 3.6 if wide else n * 0.5
    t0 = 0.6
    css = (f"@keyframes {pre}flow{{to{{stroke-dashoffset:-16}}}}"
           f"@keyframes {pre}blink{{0%,100%{{opacity:1}}50%{{opacity:.25}}}}")
    anim_extra = (f".{pre}line{{animation:{pre}flow .8s linear infinite}}.{pre}dot{{animation:{pre}blink 1.6s ease-in-out infinite}}")
    anim, body, cards = [], [], []
    if wide:
        cw, gx, x0 = 184, 48, 28
        hd0, top = header(title, sub, "", GREEN, W, 1, True)
        top += 16
        rg = 74
        ys = [top, top + ch + rg]
        H = ys[1] + ch + 30
        xe = x0 + per * cw + (per - 1) * gx
        span = xe - x0
        t1 = t0 + D + 1.0
        T = t1 + D + 4.5
        hd, _ = header(title, sub, "AUTOMATIONS  /  ALWAYS-ON PIPELINE", GREEN, W, T, True)
        pos, tl = [], []
        for i in range(n):
            r, c = divmod(i, per)
            x = x0 + (c if r == 0 else per - 1 - c) * (cw + gx)
            pos.append((x, ys[r]))
            if r == 0:
                tl.append(t0 + (x - x0) / span * D)
            else:
                tl.append(t1 + (xe - (x + cw)) / span * D)
        # lines under the cards
        for r in range(2):
            yc = ys[r] + ch / 2
            d = f"M{x0},{yc} H{xe}" if r == 0 else f"M{xe},{yc} H{x0}"
            body.append(f'<path d="{d}" stroke="{LINE}" stroke-width="3" fill="none"/>'
                        f'<path class="{pre}line" d="{d}" stroke="{GREEN}" stroke-opacity=".55" stroke-width="3" fill="none" stroke-dasharray="8 8"/>')
        yc1, yc2 = ys[0] + ch / 2, ys[1] + ch / 2
        body.append(f'<path d="M{xe},{yc1} H{xe + 34} V{yc2} H{xe + 8}" stroke="{LINE}" stroke-width="3" fill="none"/>'
                    f'<path class="{pre}line" d="M{xe},{yc1} H{xe + 34} V{yc2} H{xe + 8}" stroke="{GREEN}" stroke-opacity=".55" stroke-width="3" fill="none" stroke-dasharray="8 8"/>'
                    f'<path d="M{xe + 11},{yc2 - 7} L{xe + 1},{yc2} L{xe + 11},{yc2 + 7} Z" fill="{GREEN}"/>')
        # pulses (drawn under the cards so they travel "through" each node)
        for r, (ts, sign) in enumerate(((t0, 1), (t1, -1))):
            yc = ys[r] + ch / 2
            sx = x0 if r == 0 else xe
            a, b = ts / T * 100, (ts + D) / T * 100
            anim.append(f"@keyframes {pre}pk{r}{{0%,{a:.2f}%{{opacity:0;transform:translateX(0)}}{a + .3:.2f}%{{opacity:1}}"
                        f"{b:.2f}%{{opacity:1;transform:translateX({sign * span}px)}}{b + .3:.2f}%,100%{{opacity:0;transform:translateX({sign * span}px)}}}}"
                        f"#{pre}pulse{r}{{animation:{pre}pk{r} {T:.2f}s linear infinite}}")
            body.append(f'<g id="{pre}pulse{r}" opacity="0"><circle cx="{sx}" cy="{yc}" r="13" fill="{GREEN}" fill-opacity=".25"/>'
                        f'<circle cx="{sx}" cy="{yc}" r="6" fill="{GREEN}"/></g>')
        cx_off = lambda i: pos[i]
    else:
        cw, x0, gap = 308, 84, 30
        hd0, top = header(title, sub, "", GREEN, W, 1, False)
        top += 8
        T = t0 + D + 4.5
        hd, _ = header(title, sub, "AUTOMATIONS  /  ALWAYS-ON PIPELINE", GREEN, W, T, False)
        pos = [(x0, top + i * (ch + gap)) for i in range(n)]
        H = pos[-1][1] + ch + 28
        lx = 44
        yfirst, ylast = pos[0][1] + ch / 2, pos[-1][1] + ch / 2
        span = ylast - yfirst
        tl = [t0 + (pos[i][1] + ch / 2 - yfirst) / span * D - 0.05 for i in range(n)]
        d = f"M{lx},{yfirst - 24} V{ylast + 24}"
        body.append(f'<path d="{d}" stroke="{LINE}" stroke-width="3" fill="none"/>'
                    f'<path class="{pre}line" d="{d}" stroke="{GREEN}" stroke-opacity=".55" stroke-width="3" fill="none" stroke-dasharray="8 8"/>')
        a, b = t0 / T * 100, (t0 + D) / T * 100
        anim.append(f"@keyframes {pre}pk0{{0%,{a:.2f}%{{opacity:0;transform:translateY(0)}}{a + .3:.2f}%{{opacity:1}}"
                    f"{b:.2f}%{{opacity:1;transform:translateY({span}px)}}{b + .3:.2f}%,100%{{opacity:0;transform:translateY({span}px)}}}}"
                    f"#{pre}pulse0{{animation:{pre}pk0 {T:.2f}s linear infinite}}")
        body.append(f'<g id="{pre}pulse0" opacity="0"><circle cx="{lx}" cy="{yfirst}" r="13" fill="{GREEN}" fill-opacity=".25"/>'
                    f'<circle cx="{lx}" cy="{yfirst}" r="6" fill="{GREEN}"/></g>')
    for i, ((si, stg, nm), nl) in enumerate(zip(items, names)):
        x, y = pos[i]
        p = f"{pre}{i}"
        nx = 18
        ypill = 24
        dim = (f'<rect width="{cw}" height="{ch}" rx="12" fill="{CARD}" stroke="{DIM}" stroke-width="2"/>'
               f'<circle cx="{nx + 4}" cy="{ypill - 4}" r="4" fill="{MUTED}"/>'
               f'<text x="{nx + 14}" y="{ypill}" font-size="11" font-weight="700" letter-spacing="1.5" fill="{MUTED}"></text>'
               + lines_svg(nl, nx, 52, 17, 20, fill=MUTED, weight=700)
               + lines_svg([stg], nx, ch - 14, 12.5, 0, fill=MUTED))
        litg = (f'<g id="{p}"><rect width="{cw}" height="{ch}" rx="12" fill="{lit_fill}" stroke="{GREEN}" stroke-width="2"/>'
                f'<circle class="{pre}dot" cx="{nx + 4}" cy="{ypill - 4}" r="4.5" fill="{GREEN}"/>'
                f'<text x="{nx + 14}" y="{ypill}" font-size="11" font-weight="700" letter-spacing="1.5" fill="{GREEN}">LIVE</text>'
                + lines_svg(nl, nx, 52, 17, 20, fill=TEXT, weight=700)
                + lines_svg([stg], nx, ch - 14, 12.5, 0, fill=SOFT) + '</g>')
        cards.append(f'<g class="c" transform="translate({x},{y})">{dim}{litg}</g>')
        anim.append(kf(f"{p}k", tl[i], T, "opacity:0", "opacity:1", rise=0.3)
                    + f"#{p}{{animation:{p}k {T:.2f}s linear infinite}}")
        if not wide:
            yc = y + ch / 2
            cards.append(f'<circle cx="44" cy="{yc}" r="9" fill="{BG}" stroke="{DIM}" stroke-width="3"/>'
                         f'<circle id="{p}n" cx="44" cy="{yc}" r="9" fill="{GREEN}" stroke="{GREEN}" stroke-width="3"/>')
            anim.append(f"#{p}n{{animation:{p}k {T:.2f}s linear infinite}}")
            cards.append(f'<line x1="53" y1="{yc}" x2="{x}" y2="{yc}" stroke="{GREEN}" stroke-opacity=".5" stroke-width="2"/>')
    body_s = hd + "".join(body) + "".join(cards)
    return svg_doc(W, H, title, f"{title}: " + ", ".join(nm for _, _, nm in items), GREEN, css, "".join(anim) + anim_extra, body_s)


BUILDERS = {"agent": build_agents, "skill": build_skills, "loop": build_loops, "automation": build_automations}


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
            svg = build(stages, kind, title, sub, layout) if kind is None else BUILDERS[kind](stages, title, sub, layout)
            if "\u2014" in svg or "&mdash;" in svg:
                raise BuildError(f"{f.name}: em dash in output")
            f.write_text(svg)
            written.append(f)
    for f in written:
        print(f"{f}  {f.stat().st_size:,} bytes")


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        sys.exit(f"make_svgs: {e}")
