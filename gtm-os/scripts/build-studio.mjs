// Builds the Content Studio data and media from the real content engine.
//   reels    : <content engine>/renders/*.mp4  (web copies: H.264 + WebM, poster frame)
//   scripts  : <reel samples>/*.json              (the reel scripts)
//   atoms    : <content engine>/atoms.jsonl       (ideas, carousels, stat cards)
//   posts    : the site's blog posts, released ones only (content/blog/release-schedule.json)
//   crew     : the stages described in content-engine/PLAN.md
// Output: public/demo/studio/{brands,ideas,library,scripts,crew}.json plus media/ and thumbs/.
// Every missing input fails loud with its path. Outputs are named by content hash, so a rebuild only
// re-renders what changed. Override locations with GTM_ENGINE, GTM_SAMPLES, GTM_SITE, GTM_PLAYWRIGHT, GTM_TODAY.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { where } from "./local-paths.mjs";

const ENGINE = where("contentEngineDir", "GTM_ENGINE", "");
const SAMPLES = where("reelSamplesDir", "GTM_SAMPLES", "");
const SITE = where("siteDir", "GTM_SITE", "");
const FONTS = where("reelFontsDir", "GTM_FONTS", "");
const PW = where("playwright", "GTM_PLAYWRIGHT", "playwright");
// The studio is built from the author's private content engine. Where those sources are not configured (a public
// clone), the committed studio data is kept as it is and the build says so; it never builds a half studio.
if (!ENGINE || !SAMPLES || !SITE) {
  if (existsSync(new URL("../public/demo/studio/library.json", import.meta.url).pathname)) {
    console.log("build-studio: content engine sources not configured; keeping the committed studio data.");
    process.exit(0);
  }
  console.error("build-studio: no content engine sources configured and no committed studio data. The build is refused.");
  process.exit(2);
}
const FFMPEG = process.env.GTM_FFMPEG ?? path.join(homedir(), ".local/bin/ffmpeg");
const LIVE = "https://theinnovativenative.com";
const TODAY = process.env.GTM_TODAY ?? new Date().toISOString().slice(0, 10);
const OUT = new URL("../public/demo/studio/", import.meta.url).pathname;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const need = (p, what) => {
  if (!existsSync(p)) { console.error(`build-studio: ${what} is missing at ${p}. The build is refused.`); process.exit(2); }
  return p;
};
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);
const iso = (p) => statSync(p).mtime.toISOString();
const noDash = (s) => String(s).replace(/[–—]/g, ", ");

for (const d of ["media", "thumbs"]) mkdirSync(path.join(OUT, d), { recursive: true });

// ---------- lanes ----------
const PLAN = readFileSync(need(path.join(ENGINE, "PLAN.md"), "the content engine plan"), "utf8");
for (const h of ["## The cycle", "## Hosts", "## Content atoms"]) {
  if (!PLAN.includes(h)) { console.error(`build-studio: PLAN.md no longer has the section "${h}". The build is refused.`); process.exit(2); }
}
const hostRows = PLAN.split("\n").filter((l) => /^\| Host \d|^\| Mike /.test(l)).map((l) => l.split("|").map((c) => c.trim()).filter(Boolean));
if (hostRows.length !== 5) { console.error(`build-studio: expected 5 host rows in PLAN.md, found ${hostRows.length}.`); process.exit(2); }
const LANE_IDS = ["speed", "economics", "compliance", "revops", "mike"];
const LANE_LABEL = {
  speed: "Host 1: speed to lead",
  economics: "Host 2: unit economics",
  compliance: "Host 3: AI operations and compliance",
  revops: "Host 4: RevOps and data",
  mike: "The operator (founder)",
};
const HOST_NAME_TO_LANE = { "Host 1": "speed", "Host 2": "economics", "Host 3": "compliance", "Host 4": "revops" };
const hosts = hostRows.map((r, i) => ({ id: LANE_IDS[i], name: LANE_LABEL[LANE_IDS[i]], beat: noDash(r[1]), lean: noDash(r[2]) }));
const PILLAR_LABEL = {
  "speed-to-lead": "Speed to lead", "unit-economics": "Unit economics", revops: "RevOps", "connected-data": "Connected data",
  "ai-compliance": "AI and compliance", "ai-cockpit": "AI cockpit", "gtm-systems": "GTM systems",
};
const PILLAR_HOST = { "speed-to-lead": "speed", "unit-economics": "economics", revops: "revops", "connected-data": "revops", "ai-compliance": "compliance", "ai-cockpit": "mike", "gtm-systems": "mike" };

// ---------- atoms ----------
const atomsPath = need(path.join(ENGINE, "atoms.jsonl"), "the atom store");
// The public demo's leak gate refuses some real-world names (vendors, places, court cases) that the atom store may cite.
// Atoms that mention one are left out of the demo; the count is printed so the omission is visible.
// terms the demo leaves out of the idea backlog come from the local build config, so the public code names none
const DENY_TERMS = where("studioDenyTerms", "GTM_STUDIO_DENY", "");
const DEMO_DENY = DENY_TERMS ? new RegExp(DENY_TERMS, "i") : /$^/;
const allAtoms = readFileSync(atomsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const atoms = allAtoms.filter((a) => !DEMO_DENY.test(JSON.stringify(a)));
const heldBack = allAtoms.length - atoms.length;
const atomsDay = iso(atomsPath).slice(0, 10);

// ---------- released posts ----------
const schedule = JSON.parse(readFileSync(need(path.join(SITE, "content/blog/release-schedule.json"), "the release schedule"), "utf8"));
const released = new Set(Object.entries(schedule).filter(([, d]) => d <= TODAY).map(([s]) => s));
const postsDir = need(path.join(SITE, "content/blog/posts"), "the blog posts");
const posts = [];
for (const slug of released) {
  const f = path.join(postsDir, slug + ".md");
  const txt = readFileSync(need(f, `released post ${slug}`), "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(txt)?.[1] ?? "";
  const get = (k) => new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m").exec(fm)?.[1];
  const title = get("title"), pillar = get("pillar");
  if (!title || !pillar) { console.error(`build-studio: post ${slug} has no title or pillar in its front matter.`); process.exit(2); }
  posts.push({ slug, title: noDash(title), pillar, date: schedule[slug] });
}
posts.sort((a, b) => a.slug.localeCompare(b.slug));
const pillarDates = {};
for (const p of Object.keys(PILLAR_LABEL)) {
  const f = path.join(SITE, "content/pillars", p + ".md");
  const d = existsSync(f) ? /^date:\s*"?([\d-]+)/m.exec(readFileSync(f, "utf8"))?.[1] : null;
  if (d) pillarDates[p] = d;
}
const linkFor = (target) => {
  if (!target) return null;
  if (target === "/gtm-os/") return { url: LIVE + target, label: "GTM OS live demo" };
  const hub = /^\/([a-z-]+)$/.exec(target)?.[1];
  if (hub && pillarDates[hub] && pillarDates[hub] <= TODAY) return { url: LIVE + target, label: PILLAR_LABEL[hub] + " guide" };
  const slug = /^\/blog\/([a-z0-9-]+)$/.exec(target)?.[1];
  if (slug && released.has(slug)) return { url: LIVE + target, label: "Read the post" };
  const when = slug ? schedule[slug] : null;
  return { url: null, label: when ? `Post lands ${when}` : "Post not released yet" };
};

// ---------- templates (real thumbnails) ----------
const W = 1080, H = 1350;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const bigNumber = (t) => {
  const m = /(\$?\d[\d,.]*\s?(?:%|x|percent|minutes?|hours?|seconds?|days?|times)?)/i.exec(t);
  const v = m?.[1].trim().replace(/\s?percent$/i, "%");
  return v && v.length <= 12 ? v : null;
};
const fit = (t, big, small) => (t.length > 150 ? small : t.length > 90 ? (big + small) / 2 : big);

const CSS = `
@font-face{font-family:F;src:url(file://${FONTS}/fraunces.woff2);font-weight:100 900}
@font-face{font-family:I;src:url(file://${FONTS}/inter.woff2);font-weight:100 900}
@font-face{font-family:M;src:url(file://${FONTS}/jetbrains-mono.woff2);font-weight:100 800}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;background:#0b0c1a;color:#f4f5fb;font-family:I,sans-serif;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(900px 700px at 15% 8%,rgba(0,229,255,.2),transparent 70%),radial-gradient(900px 800px at 95% 100%,rgba(255,61,245,.17),transparent 70%),#0b0c1a}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(120,130,200,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(120,130,200,.07) 1px,transparent 1px);background-size:54px 54px}
.pad{position:absolute;inset:0;padding:92px 84px 96px;display:flex;flex-direction:column}
.kick{font:600 30px M,monospace;letter-spacing:.14em;text-transform:uppercase;color:#00e5ff}
.kick.m{color:#ff3df5}
.main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px}
.h{font-family:F,serif;font-weight:800;line-height:1.08;letter-spacing:-.01em}
.p{font-family:I,sans-serif;font-weight:500;line-height:1.38;color:#c7cae6}
.num{font:900 230px/1 F,serif;color:#00e5ff;letter-spacing:-.02em}
.foot{display:flex;justify-content:space-between;align-items:center;font:500 25px M,monospace;color:#a3a7c7;letter-spacing:.06em}
.foot b{color:#f4f5fb;font-weight:600}
.src{font:500 27px M,monospace;color:#ff3df5;word-break:break-all}
.cta{display:inline-block;align-self:flex-start;background:#00e5ff;color:#04141c;font:800 38px I,sans-serif;padding:24px 38px;border-radius:18px}
`;
const page = (body) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body><div class="bg"></div><div class="grid"></div><div class="pad">${body}</div></body>`;
const foot = (right) => `<div class="foot"><span><b>THE INNOVATIVE NATIVE</b> &middot; GTM OS</span><span>${esc(right)}</span></div>`;

function carouselSlides(a) {
  const k = PILLAR_LABEL[a.pillar];
  const kindLabel = { myth: ["THE MYTH", "WHAT IS TRUE"], stat: ["THE NUMBER", "HOW TO READ IT"] }[a.kind] ?? ["THE POINT", "WHY IT MATTERS"];
  const n = bigNumber(a.text);
  const link = linkFor(a.cta_target);
  const total = 4;
  const s = [];
  s.push(page(`<div class="kick">${esc(k)}</div><div class="main"><div class="h" style="font-size:${fit(a.hook, 112, 80)}px">${esc(noDash(a.hook))}</div></div>${foot("1 / " + total + "  swipe")}`));
  s.push(page(`<div class="kick m">${kindLabel[0]}</div><div class="main">${a.kind === "stat" && n ? `<div class="num">${esc(n)}</div>` : ""}<div class="h" style="font-size:${a.kind === "stat" && n ? 52 : fit(a.text, 80, 58)}px">${esc(noDash(a.text))}</div></div>${foot("2 / " + total)}`));
  s.push(page(`<div class="kick">${kindLabel[1]}</div><div class="main"><div class="p" style="font-size:${fit(a.payoff, 58, 44)}px">${esc(noDash(a.payoff))}</div></div>${foot("3 / " + total)}`));
  const where = link?.url ? link.url.replace("https://", "") : "theinnovativenative.com";
  s.push(page(`<div class="kick m">${a.source_url ? "SOURCE" : "KEEP GOING"}</div><div class="main">${a.source_url ? `<div class="src">${esc(domain(a.source_url))}</div>` : ""}<div class="h" style="font-size:64px">${a.cta_target === "/gtm-os/" ? "See it running in the live demo" : "Read the full breakdown"}</div><div class="cta">${esc(where)}</div></div>${foot("4 / " + total)}`));
  return s;
}
const statCard = (a) => {
  const n = bigNumber(a.text);
  return page(`<div class="kick m">STAT &middot; ${esc(PILLAR_LABEL[a.pillar])}</div><div class="main">${n ? `<div class="num">${esc(n)}</div>` : ""}<div class="h" style="font-size:${n ? fit(a.text, 54, 44) : fit(a.text, 76, 56)}px">${esc(noDash(a.text))}</div><div class="src">${esc(domain(a.source_url))}</div></div>${foot(a.id)}`);
};
const postCover = (p) =>
  page(`<div class="kick">${esc(PILLAR_LABEL[p.pillar] ?? p.pillar)} &middot; ${esc(p.date)}</div><div class="main"><div class="h" style="font-size:${fit(p.title, 96, 70)}px">${esc(p.title)}</div></div>${foot("theinnovativenative.com/blog")}`);

// ---------- render jobs ----------
const jobs = []; // {file, html}
const queue = (name, html) => { const file = `${name}-${sha(html)}.jpg`; jobs.push({ file, html }); return `/demo/studio/thumbs/${file}`; };

const pickSpread = (list, n) => {
  const by = {};
  for (const a of list) (by[a.pillar] ??= []).push(a);
  const out = [];
  for (let i = 0; out.length < n; i++) {
    let any = false;
    for (const p of Object.keys(PILLAR_LABEL)) { const a = by[p]?.[i]; if (a && out.length < n) { out.push(a); any = true; } }
    if (!any) break;
  }
  return out;
};

const lib = [];
const stageNote = {
  draft: "Rendered from a content atom. It has not been through the source check yet.",
  review: "Rendered cut. It waits at the quality gate and for approval before anything posts.",
  approved: "Every number on it carries a source link that was opened. Ready for the script step.",
  posted: "Live on the site.",
};

// carousels
const carouselAtoms = pickSpread(atoms.filter((a) => a.format_fit.includes("carousel")), 12);
const carouselIds = new Set(carouselAtoms.map((a) => a.id));
for (const a of carouselAtoms) {
  const slides = carouselSlides(a).map((h, i) => queue(`${a.id}-s${i + 1}`, h));
  const stage = a.source_url ? "approved" : "draft";
  lib.push({
    id: "car-" + a.id, brand: "tin", host: a.host, pillar: a.pillar, title: noDash(a.hook), kind: "carousel", stage,
    duration_s: null, market: PILLAR_LABEL[a.pillar], created: atomsDay, channels: ["instagram", "linkedin"],
    note: stageNote[stage], thumb: slides[0], slides, atom: a.id,
    source: a.source_url ? { url: a.source_url, label: domain(a.source_url) } : null, link: linkFor(a.cta_target),
  });
}
// stat stills
const statAtoms = pickSpread(atoms.filter((a) => a.kind === "stat" && a.source_url && !carouselIds.has(a.id)), 12);
for (const a of statAtoms) {
  const t = queue(`${a.id}-stat`, statCard(a));
  lib.push({
    id: "stat-" + a.id, brand: "tin", host: a.host, pillar: a.pillar, title: noDash(a.hook), kind: "still", stage: "approved",
    duration_s: null, market: PILLAR_LABEL[a.pillar], created: atomsDay, channels: ["instagram", "linkedin", "reel stat card"],
    note: stageNote.approved + " " + noDash(a.payoff), thumb: t, slides: [t], atom: a.id,
    source: { url: a.source_url, label: domain(a.source_url) }, link: linkFor(a.cta_target),
  });
}
// released post covers
for (const p of posts) {
  const t = queue(`post-${p.slug}`, postCover(p));
  lib.push({
    id: "post-" + p.slug, brand: "tin", host: PILLAR_HOST[p.pillar] ?? "mike", pillar: p.pillar, title: p.title, kind: "still", stage: "posted",
    duration_s: null, market: PILLAR_LABEL[p.pillar] ?? p.pillar, created: p.date, channels: ["website"],
    note: `Released on the site on ${p.date}.`, thumb: t, slides: [t], source: null,
    link: { url: `${LIVE}/blog/${p.slug}`, label: "Read the post" },
  });
}

// ---------- reels ----------
const rendersDir = need(path.join(ENGINE, "renders"), "the renders folder");
const mp4s = readdirSync(rendersDir).filter((f) => f.endsWith(".mp4")).sort();
if (!mp4s.length) { console.error(`build-studio: no .mp4 renders in ${rendersDir}.`); process.exit(2); }
const ASPECTS = { "9x16": { label: "Reels 9:16", w: 540, h: 960 }, "1x1": { label: "Square 1:1", w: 720, h: 720 }, "16x9": { label: "Wide 16:9", w: 960, h: 540 } };
const groups = {};
for (const f of mp4s) {
  const m = /^(.*)-(9x16|1x1|16x9)\.mp4$/.exec(f);
  if (!m) { console.error(`build-studio: render ${f} does not end in -9x16, -1x1 or -16x9.`); process.exit(2); }
  (groups[m[1]] ??= {})[m[2]] = path.join(rendersDir, f);
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) { console.error(`build-studio: ${cmd} failed (${r.status}): ${r.stderr.slice(-600)}`); process.exit(3); }
  return r.stdout;
};
const probeSec = (f) => Number(run(FFMPEG.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const wanted = new Set();
const scriptsByRender = new Map();
const scriptFiles = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => f.endsWith(".json")).sort() : [];
const scriptSets = scriptFiles.map((f) => ({ file: f, j: JSON.parse(readFileSync(path.join(SAMPLES, f), "utf8")) }));
for (const s of scriptSets) scriptsByRender.set(s.j.id, s);
// a render is named after its script id, or after the tail of it (second-brain-speed-to-lead-sample renders as speed-to-lead-sample)
const scriptFor = (gid) => scriptsByRender.get(gid) ?? scriptSets.find((s) => String(s.j.id).endsWith("-" + gid));

for (const [gid, files] of Object.entries(groups)) {
  const aspects = [];
  for (const [asp, src] of Object.entries(files)) {
    const key = sha(`${statSync(src).size}:${statSync(src).mtimeMs}:v2`);
    const base = `${gid}-${asp}-${key}`;
    const mp4 = path.join(OUT, "media", base + ".mp4"), webm = path.join(OUT, "media", base + ".webm"), poster = path.join(OUT, "thumbs", base + ".jpg");
    const { w, h } = ASPECTS[asp];
    const vf = `scale=${w}:${h}:flags=lanczos,format=yuv420p`;
    if (!existsSync(mp4)) {
      for (const crf of [28, 31, 34, 37]) {
        run(FFMPEG, ["-y", "-v", "error", "-i", src, "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", mp4]);
        if (statSync(mp4).size < MAX_MEDIA_BYTES) break;
      }
    }
    if (!existsSync(webm)) {
      for (const crf of [36, 40, 44]) {
        run(FFMPEG, ["-y", "-v", "error", "-i", src, "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(crf), "-row-mt", "1", "-c:a", "libopus", "-b:a", "48k", webm]);
        if (statSync(webm).size < MAX_MEDIA_BYTES) break;
      }
    }
    for (const f of [mp4, webm]) if (statSync(f).size >= MAX_MEDIA_BYTES) { console.error(`build-studio: ${f} is over 4 MB.`); process.exit(3); }
    if (!existsSync(poster)) run(FFMPEG, ["-y", "-v", "error", "-ss", "2.1", "-i", src, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-q:v", "4", poster]);
    wanted.add(path.basename(mp4)); wanted.add(path.basename(webm)); wanted.add(path.basename(poster));
    aspects.push({ id: asp, label: ASPECTS[asp].label, w, h, mp4: `/demo/studio/media/${base}.mp4`, webm: `/demo/studio/media/${base}.webm`, poster: `/demo/studio/thumbs/${base}.jpg`, bytes: statSync(mp4).size + statSync(webm).size });
  }
  aspects.sort((a, b) => Object.keys(ASPECTS).indexOf(a.id) - Object.keys(ASPECTS).indexOf(b.id));
  // Tile image: centre crop of the 9:16 frame to 4:5 (the hook sits mid-frame).
  const src9 = files["9x16"] ?? Object.values(files)[0];
  const tileKey = sha(`${statSync(src9).size}:${statSync(src9).mtimeMs}:tile2`);
  const tile = path.join(OUT, "thumbs", `${gid}-tile-${tileKey}.jpg`);
  if (!existsSync(tile)) run(FFMPEG, ["-y", "-v", "error", "-ss", "2.1", "-i", src9, "-frames:v", "1", "-vf", "crop=iw:iw*5/4,scale=540:675", "-q:v", "4", tile]);
  wanted.add(path.basename(tile));
  const sc = scriptFor(gid);
  if (!sc) { console.error(`build-studio: render ${gid} has no script in ${SAMPLES}; a reel is never shown without its script.`); process.exit(2); }
  const lane = sc ? HOST_NAME_TO_LANE[sc.j.host?.name] ?? "speed" : "speed";
  const dur = sc ? Math.round((sc.j.hook.seconds + sc.j.beats.reduce((a, b) => a + b.seconds, 0) + (sc.j.stat?.seconds ?? 0) + sc.j.endCard.seconds) * 10) / 10 : Math.round(probeSec(Object.values(files)[0]) * 10) / 10;
  const when = iso(src9);
  lib.unshift({
    id: "reel-" + gid, brand: "tin", host: lane, pillar: gid.split("-").slice(0, 3).join("-") in PILLAR_LABEL ? gid.split("-").slice(0, 3).join("-") : "speed-to-lead",
    title: sc ? noDash(sc.j.hook.words) : gid, kind: "video", stage: "review", duration_s: dur, market: "Reel, three cuts", created: when.slice(0, 10),
    channels: ["instagram reels", "youtube shorts", "linkedin"], note: stageNote.review, thumb: `/demo/studio/thumbs/${path.basename(tile)}`,
    media: aspects, script: sc ? sc.j.id : null,
    source: sc?.j.stat ? { url: null, label: noDash(sc.j.stat.source).replace(/^Source:\s*/i, "") } : null, link: null, renderedAt: when,
  });
}

// ---------- scripts ----------
const scriptOut = scriptSets.map(({ j }) => {
  const lane = HOST_NAME_TO_LANE[j.host?.name] ?? "speed";
  const secs = j.hook.seconds + j.beats.reduce((a, b) => a + b.seconds, 0) + (j.stat?.seconds ?? 0) + j.endCard.seconds;
  const reel = lib.find((l) => l.script === j.id);
  const emph = (e) => (e ?? []).map((x) => ({ word: x.word, color: x.color }));
  return {
    id: j.id, brand: "tin", host: lane, created: reel?.created ?? atomsDay, seconds: Math.round(secs * 10) / 10, reel: reel?.id ?? null,
    hook: { words: noDash(j.hook.words), seconds: j.hook.seconds, emphasis: emph(j.hook.emphasis) },
    beats: j.beats.map((b) => ({ words: noDash(b.words), seconds: b.seconds, emphasis: emph(b.emphasis), callout: b.callout ? { label: noDash(b.callout.label), body: noDash(b.callout.body ?? "") } : null, capture: b.capture?.clip ?? null })),
    statAfter: j.statAfter ?? null,
    stat: j.stat ? { value: j.stat.value, label: noDash(j.stat.label), source: noDash(j.stat.source), seconds: j.stat.seconds } : null,
    endCard: { linkText: j.endCard.linkText, cta: noDash(j.endCard.cta), seconds: j.endCard.seconds },
  };
});

// ---------- ideas ----------
const ideas = atoms.map((a) => ({
  id: a.id, brand: "tin", host: a.host, pillar: a.pillar, kind: a.kind, text: noDash(a.text), hook: noDash(a.hook), payoff: noDash(a.payoff),
  formats: a.format_fit, source: a.source_url ? { url: a.source_url, label: domain(a.source_url) } : null,
  demo: a.demo_surface ? noDash(a.demo_surface) : null, link: linkFor(a.cta_target), created: atomsDay,
}));

// ---------- crew ----------
const seats = [
  { id: "plan", label: "Plan", outcome: "Picks the account, pillar, format and day part for the day. Skips holidays and days already filled; one post per account per day.", mode: "auto" },
  { id: "source", label: "Source check", outcome: "Seeds the next unused atom, then opens a fresh source for any statistic. A number with no opened source is dropped.", mode: "auto" },
  { id: "script", label: "Script", outcome: "Writes the hook, beats, kinetic words, call-outs and caption in the host's voice. Claims stay inside what GTM OS does on screen.", mode: "auto" },
  { id: "produce", label: "Produce", outcome: "Talking head take, then Remotion: fast cuts, kinetic captions, call-out cards, live screen captures, a stat card and an end card with the tracked link, in 9:16, 1:1 and 16:9.", mode: "review", note: "Host looks and voices are approved from a test reel first." },
  { id: "gate", label: "Quality gate", outcome: "Claim check, captions match audio, loudness, duration, end card link resolves. A failed check stops that post and raises an alert.", mode: "auto" },
  { id: "publish", label: "Publish", outcome: "Instagram Reels, YouTube Shorts and LinkedIn through the platform APIs, platform AI label set at upload, link carried as a tracked short link.", mode: "review", note: "Waits for the connected accounts." },
];
const cuts = Object.keys(groups).map((gid) => {
  const l = lib.find((x) => x.id === "reel-" + gid);
  return { id: "cut-" + gid, title: l.title, host: l.host, stage: "gate", progress: 67, updated: l.renderedAt };
});
const crewJobs = [];
for (const [gid, files] of Object.entries(groups)) {
  for (const [asp, src] of Object.entries(files)) {
    crewJobs.push({ id: `job-${gid}-${asp}`, seat: "produce", status: "done", started: iso(src), summary: `Rendered ${gid} as ${ASPECTS[asp].label}, ${(statSync(src).size / 1048576).toFixed(1)} MB master.` });
  }
}
for (const s of scriptSets) crewJobs.push({ id: "job-script-" + s.j.id, seat: "script", status: "done", started: iso(path.join(SAMPLES, s.file)), summary: `Reel script written: ${s.j.beats.length} beats, one stat with its source, one end card.` });
crewJobs.push({ id: "job-atoms", seat: "source", status: "done", started: iso(atomsPath), summary: `Atom store written: ${allAtoms.length} atoms, ${allAtoms.filter((a) => a.source_url).length} carry a source link.` });
crewJobs.sort((a, b) => b.started.localeCompare(a.started));
const crew = { seats, hosts, cuts, jobs: crewJobs, plan_day: iso(path.join(ENGINE, "PLAN.md")).slice(0, 10) };

// ---------- thumbnails ----------
const todo = jobs.filter((j) => !existsSync(path.join(OUT, "thumbs", j.file)));
for (const j of jobs) wanted.add(j.file);
if (todo.length) {
  const { chromium } = createRequire(import.meta.url)(need(PW, "the Playwright package"));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 0.5 });
  const pg = await ctx.newPage();
  const tmp = path.join(tmpdir(), "gtm-studio-render");
  mkdirSync(tmp, { recursive: true });
  for (const j of todo) {
    const f = path.join(tmp, "card.html");
    writeFileSync(f, j.html);
    await pg.goto("file://" + f);
    const fonts = await pg.evaluate(async () => (await Promise.all(["800 20px F", "500 20px I", "500 20px M"].map((f) => document.fonts.load(f)))).map((r) => r.length > 0));
    if (fonts.includes(false)) { console.error(`build-studio: a brand font did not load from ${FONTS}.`); process.exit(3); }
    await pg.screenshot({ path: path.join(OUT, "thumbs", j.file), type: "jpeg", quality: 80 });
  }
  await browser.close();
}

// ---------- write ----------
for (const d of ["media", "thumbs"]) {
  for (const f of readdirSync(path.join(OUT, d))) if (!wanted.has(f)) rmSync(path.join(OUT, d, f));
}
const w = (n, o) => writeFileSync(path.join(OUT, n), JSON.stringify(o, null, 1) + "\n");
w("brands.json", { brands: [{ id: "tin", label: "The Innovative Native" }], lanes: LANE_IDS.map((id) => ({ id, label: LANE_LABEL[id] })) });
w("ideas.json", { ideas });
w("library.json", { items: lib });
w("scripts.json", { sets: scriptOut });
w("crew.json", crew);
for (const f of ["elements.json", "run_steps.json"]) rmSync(path.join(OUT, f), { force: true });
const bytes = [...wanted].reduce((a, f) => a + statSync(path.join(OUT, f.endsWith(".jpg") ? "thumbs" : "media", f)).size, 0);
console.log(`build-studio: ${lib.length} library pieces (${lib.filter((l) => l.kind === "video").length} reels, ${lib.filter((l) => l.kind === "carousel").length} carousels, ${lib.filter((l) => l.kind === "still").length} stills), ${ideas.length} ideas (${heldBack} held back for the leak gate), ${scriptOut.length} scripts, ${(bytes / 1048576).toFixed(1)} MB media, ${todo.length} thumbnails rendered.`);
