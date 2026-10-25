// Builds the public demo brain: the data behind the Second Brain surface.
//
// DATA RULE: only public content goes in. Sources are the Operator OS repo (agents, skills, hooks, rules, system
// packs, starter vault, example vault, docs) and the ten GTM playbook folders. Nothing from any private workspace.
// Every API the original viewer called becomes a static file under public/demo/brain/:
//   graph.json   what /api/graph returned (nodes, links, md links, departments, layers)
//   tree.json    what /api/expand returned, for every folder at once
//   search.json  the flat index the page searches client-side
//   files/<repo path>.txt   what /api/file returned, one text file per repo file
//
// Loud failure: a missing source folder stops the build (exit 2) unless BRAIN_USE_COMMITTED=1 says to keep the
// data already committed. Nothing falls back silently.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { where } from "./local-paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const OUT = path.join(APP, "public", "demo", "brain");
// In the public repository the app sits in gtm-os/ beside Operator OS and the playbook folders, so the default is the repo root.
const ROOT = path.resolve(APP, "..");
const OP = where("operatorOsDir", "OPERATOR_OS_DIR", ROOT);
const GTM = where("gtmGrowthDir", "GTM_GROWTH_DIR", ROOT);

function stop(msg) {
  console.error("build-brain: " + msg);
  process.exit(2);
}

for (const [what, p] of [["Operator OS repo", OP], ["GTM playbook repo", GTM]]) {
  if (!fs.existsSync(p)) {
    if (process.env.BRAIN_USE_COMMITTED === "1" && fs.existsSync(path.join(OUT, "graph.json"))) {
      console.log(`build-brain: ${what} not found at ${p}; keeping the committed data (BRAIN_USE_COMMITTED=1)`);
      process.exit(0);
    }
    stop(`the ${what} is missing at ${p}. Set OPERATOR_OS_DIR / GTM_GROWTH_DIR, or set BRAIN_USE_COMMITTED=1 to keep the committed data. The build is refused.`);
  }
}

// ---------------------------------------------------------------- configuration

const DEPTS = [
  { key: "market-research", label: "Market Research", color: "#00e5ff", icon: "book", folder: "01-market-research" },
  { key: "positioning-offer", label: "Positioning & Offer", color: "#b78bff", icon: "pen", folder: "02-positioning-and-offer" },
  { key: "content-engine", label: "Content Engine", color: "#ff3df5", icon: "visual", folder: "03-content-engine" },
  { key: "paid-media", label: "Paid Media", color: "#4ac3ff", icon: "pulse", folder: "04-paid-media" },
  { key: "capture-consent", label: "Capture & Consent", color: "#33d6a0", icon: "lock", folder: "05-capture-and-consent" },
  { key: "speed-to-lead", label: "Speed to Lead", color: "#f0b34a", icon: "clock", folder: "06-speed-to-lead" },
  { key: "sales-floor", label: "Sales Floor", color: "#ff7a9c", icon: "people", folder: "07-sales-floor" },
  { key: "attribution-cost", label: "Attribution & Cost", color: "#e8ff5a", icon: "data", folder: "08-attribution-and-cost" },
  { key: "reporting-cockpit", label: "Reporting Cockpit", color: "#7c8cff", icon: "api", folder: "09-reporting-cockpit" },
  { key: "reliability", label: "Reliability", color: "#ff9d5c", icon: "build", folder: "10-reliability" },
];
const DEPT_KEYS = new Set(DEPTS.map((d) => d.key));

const LAYERS = [
  { key: "A", label: "Applications", color: "#ff3df5", shape: "hex", blurb: "The GTM OS surfaces: the cockpit, studio, boards and tools you work in" },
  { key: "R", label: "Routines", color: "#f0b34a", shape: "ringdot", blurb: "Hooks that fire on their own and the loops that run on a schedule" },
  { key: "M", label: "Memory", color: "#8f94ff", shape: "chip", blurb: "Rules, system packs, the example vault and the playbook, clustered by stage" },
  { key: "S", label: "Skills", color: "#00e5ff", shape: "diamond", blurb: "Skills and agents the harness can run on demand" },
];

const SKILL_DEPT = {
  "bi-workbench": "reporting-cockpit", "mcp-client": "reporting-cockpit", "progress": "reporting-cockpit",
  "task-observer": "reporting-cockpit", "printing-press": "reporting-cockpit", "printing-press-amend": "reporting-cockpit",
  "printing-press-import": "reporting-cockpit", "printing-press-output-review": "reporting-cockpit",
  "printing-press-polish": "reporting-cockpit", "printing-press-publish": "reporting-cockpit",
  "printing-press-reprint": "reporting-cockpit", "printing-press-retro": "reporting-cockpit",
  "printing-press-score": "reporting-cockpit",
  "brand-voice-generator": "positioning-offer", "your-voice": "positioning-offer", "grill": "positioning-offer",
  "grill-me": "positioning-offer", "triage": "positioning-offer",
  "burst": "content-engine", "email-draft": "content-engine", "frontend-design": "content-engine",
  "writing-for-agents": "content-engine", "writing-great-skills": "content-engine", "skill-creator": "content-engine",
  "site-speed": "paid-media",
  "data-classification": "capture-consent", "compliance-audit": "capture-consent", "vibe-security": "capture-consent",
  "handoff": "capture-consent",
  "n8n-build": "speed-to-lead", "goal": "speed-to-lead",
  "contract-reviewer": "sales-floor",
  "ingest": "market-research", "synthesize": "market-research", "distill": "market-research", "init-vault": "market-research",
  "init-deep": "market-research",
  "lint": "attribution-cost", "docs-drift-check": "attribution-cost",
  "tdd": "reliability", "diagnose": "reliability", "diagnosing-bugs": "reliability", "workflow-forensics": "reliability",
  "safe-undo": "reliability", "karpathy-guidelines": "reliability", "codebase-design": "reliability",
  "plan-convergence": "reliability", "skill-token-audit": "reliability", "install-rules": "reliability",
};
const AGENT_DEPT = {
  "growth-marketing-lead": "positioning-offer", "paid-media-operator": "paid-media", "marketing-analyst": "attribution-cost",
  "jr-data-engineer": "attribution-cost", "sr-data-engineer": "attribution-cost", "viz-designer": "reporting-cockpit",
  "web-designer": "content-engine", "ui-ux-engineer": "content-engine", "react-motion-engineer": "content-engine",
  "edit-animator": "content-engine", "edit-editor": "content-engine", "edit-finisher": "content-engine",
  "edit-researcher": "content-engine", "edit-screen": "content-engine", "edit-sound": "content-engine",
  "edit-transcriber": "content-engine", "opsec": "capture-consent", "researcher": "market-research",
  "orchestrator": "reporting-cockpit", "implementer": "reliability", "reviewer": "reliability", "deployer": "reliability",
  "ci-committer": "reliability", "ci-verifier": "reliability", "corpus-pruner": "reliability", "corpus-pruner-sr": "reliability",
};
const RULE_DEPT = {
  "agent-protocol": "reliability", "bi-accuracy-hierarchy": "attribution-cost", "consent-evidence": "capture-consent",
  "data-handling": "capture-consent", "execute-now": "reliability", "handoff-sop": "reporting-cockpit",
  "hosted-db-rules": "reliability", "ingress": "reliability", "learning-capture": "market-research",
  "loud-failure": "reliability", "n8n-rules": "speed-to-lead", "name-the-thing": "content-engine",
  "opsec-gate": "capture-consent", "prompt-engineering": "content-engine", "security": "reliability",
  "tech-stack": "reporting-cockpit", "unslop-comms": "content-engine", "warehouse-first": "attribution-cost",
};
const SYSTEM_DEPT = {
  "market-research": "market-research", "data-analytics": "attribution-cost", "revenue-operations": "sales-floor",
  "security-compliance": "capture-consent", "site-performance": "paid-media", "system-design": "reliability",
  "uiux-web-design": "content-engine", "visual-design": "content-engine",
};
// hooks that fire a script, by the stage they protect (default: reliability)
const HOOK_DEPT = {
  "platform-write-gate": "paid-media", "block-ingress-drift": "capture-consent", "governance-egress-guard": "capture-consent",
  "block-sensitive-mcp": "capture-consent", "block-sensitive-write": "capture-consent", "pre-commit-secret-scan": "capture-consent",
  "scrub-secrets-on-stop": "capture-consent", "block-local-path-disclosure": "capture-consent",
  "block-local-zone-read": "capture-consent", "unslop-stop-gate": "content-engine", "name-the-thing-stop-gate": "content-engine",
  "warehouse-first-gate": "attribution-cost", "vault-recall-inject": "market-research", "vault-recall-prompt": "market-research",
  "vault-push-on-stop": "market-research", "outcome-capture": "reporting-cockpit", "session-log": "reporting-cockpit",
  "audit-log": "reporting-cockpit", "startup-load": "reporting-cockpit", "execute-now-stop-gate": "speed-to-lead",
};

const APPS = [
  { slug: "cockpit", label: "Command cockpit", href: "/", desc: "The daily cockpit: priority, numbers, calendar, chat and the ten-stage map.", links: ["bi-workbench", "progress"] },
  { slug: "exec", label: "Executive readout", href: "/reports/exec/", desc: "Revenue over ad spend and unit costs on one page.", links: ["bi-workbench"] },
  { slug: "studio", label: "Content Studio", href: "/studio/", desc: "Ideas to scripts to finished cuts, with the crew that builds them.", links: ["brand-voice-generator", "your-voice", "burst", "email-draft"] },
  { slug: "paid", label: "Paid media report", href: "/reports/#paid_media", desc: "Spend, pacing and results by platform, market and placement.", links: ["site-speed", "bi-workbench"] },
  { slug: "qr", label: "QR and tracked URLs", href: "/qr/", desc: "Build and register every offline link.", links: ["frontend-design"] },
  { slug: "consent", label: "Consent operations", href: "/capture/", desc: "Exceptions and per-person consent timelines.", links: ["compliance-audit", "data-classification"] },
  { slug: "frontdoor", label: "AI front door", href: "/reports/workbench/?board=board-ai-accuracy", desc: "Answer accuracy, speed and gaps for the AI that answers first.", links: ["n8n-build", "vibe-security"] },
  { slug: "connect", label: "Connect rates", href: "/reports/#call_center", desc: "Connect rate by rep and day from the call log.", links: ["bi-workbench"] },
  { slug: "mer", label: "MER board", href: "/reports/workbench/?board=board-mer", desc: "Revenue over ad spend, with its tie-out.", links: ["bi-workbench"] },
  { slug: "costtarget", label: "Marketing cost target", href: "/reports/workbench/?board=board-efficiency-target", desc: "Marketing cost against its target.", links: ["bi-workbench"] },
  { slug: "loops", label: "Loops and runs", href: "/ops/", desc: "Scheduled loops, playbooks and run history.", links: ["n8n-build", "workflow-forensics", "diagnose"] },
  { slug: "health", label: "Feed and job health", href: "/reports/#health", desc: "Whether every feed and job is fresh.", links: ["workflow-forensics"] },
];

const TEXT_EXT = new Set([".md", ".yaml", ".yml", ".json", ".sh", ".py", ".txt", ".toml"]);
const MAX_BYTES = 400 * 1024;
const SKIP_NAMES = new Set([".DS_Store", ".gitkeep", "node_modules", ".git"]);

// ---------------------------------------------------------------- helpers

const rd = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const posix = (p) => p.split(path.sep).join("/");

function walk(rootAbs, relBase) {
  const out = [];
  (function rec(abs, rel) {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_NAMES.has(ent.name)) continue;
      const a = path.join(abs, ent.name);
      const r = rel ? rel + "/" + ent.name : ent.name;
      if (ent.isDirectory()) rec(a, r);
      else if (ent.isFile()) out.push({ rel: r, abs: a, size: fs.statSync(a).size });
    }
  })(rootAbs, relBase);
  return out;
}

function parseFrontmatter(txt) {
  const m = /^---\n([\s\S]*?)\n---/.exec(txt);
  if (!m) return {};
  const lines = m[1].split("\n");
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const k = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!k) continue;
    let v = k[2].trim();
    if (v === "|" || v === ">" || v === "" || v === ">-" || v === "|-") {
      const buf = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === "")) buf.push(lines[++i].trim());
      v = buf.join(" ").replace(/\s+/g, " ").trim();
    }
    v = v.replace(/^["']|["']$/g, "");
    fm[k[1]] = v;
  }
  return fm;
}

function plainDesc(s, max = 230) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  const orig = t;
  t = t.replace(/\s*TRIGGERS?\b.*$/i, "").replace(/\s*Use (this skill )?when\b.*$/i, "").trim();
  if (!t) t = orig.split(/(?<=\.)\s/)[0]; // a description that opens with the trigger keeps its first sentence
  if (t.length > max) {
    const cut = t.slice(0, max);
    const dot = cut.lastIndexOf(". ");
    t = dot > 80 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "") + "...";
  }
  return t;
}

function leadComment(txt) {
  const out = [];
  for (const line of txt.split("\n").slice(0, 14)) {
    if (/^#!/.test(line)) continue;
    const m = /^\s*#\s?(.*)$/.exec(line);
    if (m) {
      if (/^(shellcheck|-\*-|set -)/.test(m[1])) continue;
      if (m[1].trim()) out.push(m[1].trim());
      else if (out.length) break;
    } else if (out.length) break;
    else if (/^\s*("""|''')/.test(line)) {
      const dm = /("""|''')([\s\S]*?)(\1|$)/.exec(txt);
      if (dm) return plainDesc(dm[2].split("\n").filter(Boolean)[0] || "", 200);
    }
  }
  return plainDesc(out.join(" ").replace(/^[^A-Za-z]+/, ""), 200);
}

function stem(name) { return name.replace(/\.[^.]+$/, ""); }
const topOf = (rel) => (rel.includes("/") ? rel.split("/")[0] : "(root)");
const extOf = (rel) => (path.extname(rel) || "").toLowerCase();

// ---------------------------------------------------------------- gather files

const files = new Map(); // rel -> { rel, abs, size }
function take(list) { for (const f of list) if (TEXT_EXT.has(extOf(f.rel)) && f.size <= MAX_BYTES) files.set(f.rel, f); }

const OPR = (rel) => path.join(OP, rel);
for (const dir of ["plugins/operator-os", "starter-vault", "examples"]) take(walk(OPR(dir), dir));
// docs: the text files, not the built site or its media
take(walk(OPR("docs"), "docs").filter((f) => !/^docs\/(site|assets)\//.test(f.rel)));
for (const d of DEPTS) {
  const p = path.join(GTM, d.folder);
  if (!exists(p)) stop(`playbook folder missing: ${p}`);
  take(walk(p, d.folder));
}
for (const rel of ["README.md", "NOTICE.md", "GTM-PLAYBOOK.md"]) {
  const p = path.join(GTM, rel);
  if (exists(p)) files.set(rel, { rel, abs: p, size: fs.statSync(p).size, forceText: true });
}
// the repo copy wins for content (it is what the GitHub link shows)
for (const f of files.values()) {
  const g = path.join(GTM, f.rel);
  f.gh = exists(g);
  if (f.gh) { f.abs = g; f.size = fs.statSync(g).size; }
}
if (files.size < 100) stop(`only ${files.size} public files found; the sources look wrong`);

// The leak gate keeps one product name out of the demo bundle. The public playbook names it in two lines, so markdown
// is passed through a small, logged redaction: lines that link to its page are dropped, the bare name becomes GTM OS.
let redacted = 0;
function redact(rel, t) {
  if (extOf(rel) !== ".md") return t;
  const lines = t.split("\n");
  const kept = lines.filter((l) => !/echo-os/i.test(l));
  redacted += lines.length - kept.length;
  return kept.join("\n").replace(/\bECHO OS\b/g, () => (redacted++, "GTM OS"));
}
const textOf = new Map();
for (const f of files.values()) textOf.set(f.rel, redact(f.rel, rd(f.abs)));

// ---------------------------------------------------------------- hooks.json: which scripts fire on what

const HOOKS_DIR = "plugins/operator-os/hooks";
const hookEvents = new Map(); // file -> [{event, matcher}]
{
  const hj = JSON.parse(textOf.get(HOOKS_DIR + "/hooks.json"));
  for (const [event, groups] of Object.entries(hj.hooks || {})) {
    for (const g of groups) for (const h of g.hooks || []) {
      const m = /hooks\/([A-Za-z0-9_.-]+)/.exec(h.command || "");
      if (!m) continue;
      if (!hookEvents.has(m[1])) hookEvents.set(m[1], []);
      hookEvents.get(m[1]).push({ event, matcher: g.matcher || "" });
    }
  }
}

// ---------------------------------------------------------------- department of a file

function deptOfPath(rel) {
  let m;
  if ((m = /^(\d\d-[a-z-]+)\//.exec(rel))) { const d = DEPTS.find((x) => x.folder === m[1]); if (d) return d.key; }
  if ((m = /^plugins\/operator-os\/skills\/([^/]+)/.exec(rel))) return SKILL_DEPT[m[1]] || "reliability";
  if ((m = /^plugins\/operator-os\/agents\/([^/]+)\.md$/.exec(rel))) return AGENT_DEPT[m[1]] || "reliability";
  if ((m = /^plugins\/operator-os\/rules\/([^/]+)\.md$/.exec(rel))) return RULE_DEPT[m[1]] || "reliability";
  if ((m = /^plugins\/operator-os\/systems\/([^/]+)\.yaml$/.exec(rel))) return SYSTEM_DEPT[m[1]] || "reporting-cockpit";
  if ((m = /^plugins\/operator-os\/hooks\/([^/.]+)/.exec(rel))) return HOOK_DEPT[m[1]] || "reliability";
  if (rel.startsWith("plugins/operator-os/scripts")) return "reliability";
  if (rel.startsWith("plugins/operator-os/specify")) return "reliability";
  if (rel.startsWith("docs")) return "reporting-cockpit";
  if (rel.startsWith("examples/example-vault/")) {
    const r = rel.slice("examples/example-vault/".length);
    if (r.startsWith("20-AREAS/call-center")) return "speed-to-lead";
    if (r.startsWith("20-AREAS/marketing")) return "paid-media";
    if (r.startsWith("40-SOPS")) return /Missed Call/i.test(r) ? "speed-to-lead" : "paid-media";
    if (r.startsWith("10-PROJECTS")) return /Metro/i.test(r) ? "positioning-offer" : "sales-floor";
    if (r.startsWith("raw")) return "market-research";
    if (r.startsWith("00-BOARD")) return "reporting-cockpit";
    if (/Dashboard|Count|Basis/i.test(r)) return "attribution-cost";
    if (/Loud Failure|Silent/i.test(r)) return "reliability";
    if (/Customers Hear|Plain Words/i.test(r)) return "content-engine";
    if (/Booked Job|Phone Number/i.test(r)) return "speed-to-lead";
    if (/Spend|Cap/i.test(r)) return "paid-media";
    if (/Vendor Terms/i.test(r)) return "sales-floor";
    return "reporting-cockpit";
  }
  if (rel.startsWith("starter-vault")) return "reporting-cockpit";
  return "reporting-cockpit";
}

// ---------------------------------------------------------------- directory model

const dirs = new Map(); // rel -> { rel, name, childFiles:[rel], childDirs:[rel], bytes, files, mdFiles }
function ensureDir(rel) {
  if (!dirs.has(rel)) dirs.set(rel, { rel, name: rel.split("/").pop(), childFiles: [], childDirs: [], bytes: 0, files: 0, mdFiles: 0 });
  return dirs.get(rel);
}
for (const f of files.values()) {
  const parts = f.rel.split("/");
  let parent = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const rel = parts.slice(0, i + 1).join("/");
    const d = ensureDir(rel);
    if (parent) { const pd = ensureDir(parent); if (!pd.childDirs.includes(rel)) pd.childDirs.push(rel); }
    d.bytes += f.size; d.files++; if (extOf(f.rel) === ".md") d.mdFiles++;
    parent = rel;
  }
  if (parent) ensureDir(parent).childFiles.push(f.rel);
}

// ---------------------------------------------------------------- node factories

const fileNode = (f, layer) => ({
  id: f.rel, type: "file", layer, label: path.basename(f.rel), dept: deptOfPath(f.rel), access: "both",
  size: f.size, ext: extOf(f.rel), path: f.rel, top: topOf(f.rel), gh: !!f.gh,
});
function dirNode(rel, layer) {
  const d = dirs.get(rel);
  const n = {
    id: rel, type: "dir", layer, label: d.name, folded: true, dept: deptOfPath(rel + "/"), access: "both",
    size: d.bytes, files: d.files, mdFiles: d.mdFiles, path: rel, top: topOf(rel), gh: exists(path.join(GTM, rel)),
  };
  if (d.childFiles.includes(rel + "/SKILL.md")) n.skillMd = rel + "/SKILL.md";
  return n;
}
const layerOfPath = (rel) => (/^plugins\/operator-os\/(skills|agents)\//.test(rel) ? "S" : "M");

// ---------------------------------------------------------------- graph

const nodes = [];
const push = (n) => (nodes.push(n), n);
const links = [];
const ROUTER = "operator-os";

push({ id: ROUTER, type: "router", layer: "M", label: "Operator OS", dept: "reporting-cockpit", access: "both", size: files.get("README.md")?.size || 0, path: "README.md", gh: true,
  desc: "The harness at the center. Agents, skills, hooks, rules and a memory vault, all loaded from one plugin." });
for (const d of DEPTS) push({ id: "hub:" + d.key, type: "hub", hubKind: "dept", layer: "M", label: d.label, dept: d.key, access: "both" });
for (const l of LAYERS) if (l.key !== "M") push({ id: "lhub:" + l.key, type: "hub", hubKind: "layer", layer: l.key, label: l.label, dept: null, access: "both" });

// Skills ring: one folded node per skill folder, one file node per agent
const SK = "plugins/operator-os/skills/";
const skillNames = [];
for (const rel of dirs.get("plugins/operator-os/skills").childDirs.sort()) {
  const n = dirNode(rel, "S");
  const name = rel.slice(SK.length);
  skillNames.push(name);
  const md = textOf.get(rel + "/SKILL.md");
  if (md) { const fm = parseFrontmatter(md); n.desc = plainDesc(fm.description); }
  push(n);
}
for (const rel of dirs.get("plugins/operator-os/agents").childFiles.sort()) {
  const n = fileNode(files.get(rel), "S");
  const fm = parseFrontmatter(textOf.get(rel));
  n.desc = plainDesc(fm.description);
  n.kind = "agent";
  push(n);
}

// Routines ring: hook scripts that fire on an event, and the demo loops
for (const [file, evs] of [...hookEvents.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const rel = HOOKS_DIR + "/" + file;
  const f = files.get(rel);
  if (!f) continue;
  const ev = [...new Set(evs.map((e) => e.event))].join(", ");
  push({
    id: "hook:" + stem(file), type: "routine", layer: "R", label: stem(file), dept: null, access: "both",
    schedule: ev, runner: "hook", desc: leadComment(textOf.get(rel)) || "A hook script that runs on " + ev + ".",
    path: rel, gh: !!f.gh, hookDept: deptOfPath(rel),
  });
}
const loopFeed = JSON.parse(rd(path.join(APP, "public", "data", "routines.json")));
for (const j of loopFeed.jobs || []) {
  const slug = String(j.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  push({ id: "loop:" + slug, type: "routine", layer: "R", label: j.label, dept: null, access: "both", schedule: "daily " + j.schedule, runner: "loop",
    desc: "A demo loop in the sample company. It runs on a schedule with no one pressing a button." });
}

// Applications ring: the GTM OS surfaces
for (const a of APPS) {
  const ids = a.links.map((s) => SK + s).filter((id) => dirs.has(id));
  push({ id: "app:" + a.slug, type: "app", layer: "A", label: a.label, dept: null, access: "both", status: "live", kind: "surface", desc: a.desc, href: a.href, links: ids });
}

// Memory ring: rules, system packs, vault notes, playbook, plus four folded folders
const FOLD = ["plugins/operator-os/hooks", "plugins/operator-os/scripts", "plugins/operator-os/specify", "docs"];
const foldedSet = new Set(FOLD);
const inFolded = (rel) => FOLD.some((d) => rel.startsWith(d + "/"));
for (const rel of FOLD) push(dirNode(rel, "M"));
for (const f of [...files.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
  if (layerOfPath(f.rel) === "S") continue;
  if (inFolded(f.rel)) continue;
  if (/^plugins\/operator-os\/skills\//.test(f.rel)) continue;
  push(fileNode(f, "M"));
}
// the skills layer files sit under skills/<name>/..., reachable by expanding the skill node

// links: structure
for (const d of DEPTS) links.push({ s: ROUTER, t: "hub:" + d.key, k: "route" });
for (const l of LAYERS) if (l.key !== "M") links.push({ s: ROUTER, t: "lhub:" + l.key, k: "route" });
const nodeIds = new Set(nodes.map((n) => n.id));
for (const n of nodes) {
  if (n.type === "file" || n.type === "dir") {
    if (n.layer === "S") links.push({ s: n.id, t: "lhub:S", k: "spoke" });
    else links.push({ s: n.id, t: "hub:" + n.dept, k: "spoke" });
  }
  if (n.type === "app") links.push({ s: n.id, t: "lhub:A", k: "spoke" });
  if (n.type === "routine") links.push({ s: n.id, t: "lhub:R", k: "spoke" });
}
for (const n of nodes) if (n.type === "app") for (const t of n.links) if (nodeIds.has(t)) links.push({ s: n.id, t, k: "wire" });
// a hook routine wires to the rule it enforces, when the names match (loud-failure hook <-> loud-failure rule)
for (const n of nodes) if (n.type === "routine" && n.runner === "hook") {
  for (const r of Object.keys(RULE_DEPT)) {
    const id = "plugins/operator-os/rules/" + r + ".md";
    if (nodeIds.has(id) && (n.label.includes(r) || n.label.replace(/^block-|-gate$|-stop-gate$/g, "") === r)) links.push({ s: n.id, t: id, k: "wire" });
  }
}

// ---------------------------------------------------------------- markdown links between files

const mdLinks = [];
{
  const seen = new Set();
  const add = (a, b) => {
    if (a === b || !files.has(a) || !files.has(b)) return;
    const k = a < b ? a + "|" + b : b + "|" + a;
    if (seen.has(k)) return;
    seen.add(k); mdLinks.push([a, b]);
  };
  const byStem = new Map();
  for (const f of files.values()) if (extOf(f.rel) === ".md") {
    const s = stem(path.basename(f.rel)).toLowerCase();
    if (!byStem.has(s)) byStem.set(s, []);
    byStem.get(s).push(f.rel);
  }
  const norm = (p) => { const o = []; for (const s of p.split("/")) { if (s === "..") o.pop(); else if (s && s !== ".") o.push(s); } return o.join("/"); };
  const skillMd = new Map(skillNames.map((s) => [s, SK + s + "/SKILL.md"]));
  for (const f of files.values()) {
    if (extOf(f.rel) !== ".md") continue;
    const t = textOf.get(f.rel);
    const base = f.rel.split("/").slice(0, -1).join("/");
    for (const m of t.matchAll(/\]\(([^)\s]+?)(?:#[^)]*)?\)/g)) {
      const h = m[1];
      if (/^[a-z]+:/i.test(h) || h.startsWith("#") || h.startsWith("/")) continue;
      let dec = h; try { dec = decodeURIComponent(h); } catch { /* keep raw */ }
      add(f.rel, norm((base ? base + "/" : "") + dec));
    }
    if (/^(examples|starter-vault)\//.test(f.rel)) {
      for (const m of t.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
        const hit = (byStem.get(m[1].trim().toLowerCase()) || []).find((p) => /^(examples|starter-vault)\//.test(p));
        if (hit) add(f.rel, hit);
      }
    }
    // a skill named with a slash or backticks in agents, rules and other skills
    const mySkill = (/^plugins\/operator-os\/skills\/([^/]+)\//.exec(f.rel) || [])[1];
    for (const [name, target] of skillMd) {
      if (name === mySkill || name.length < 4) continue;
      const re = new RegExp("(?:^|[\\s(`])/" + name.replace(/[-]/g, "\\-") + "(?![\\w-])|`" + name.replace(/[-]/g, "\\-") + "`");
      if (re.test(t)) add(f.rel, target);
    }
  }
}

// ---------------------------------------------------------------- expand tree, search index, file bodies

const tree = {};
for (const [rel, d] of dirs) {
  const out = [];
  for (const cf of d.childFiles) out.push(fileNode(files.get(cf), layerOfPath(cf)));
  for (const cd of d.childDirs) out.push(dirNode(cd, layerOfPath(cd + "/")));
  tree[rel] = out;
}
// a skill's children keep the skills layer (layerOfPath already says S for skills/ and agents/)

const searchIndex = [];
for (const f of files.values()) {
  searchIndex.push({ path: f.rel, name: path.basename(f.rel), type: "file", ext: extOf(f.rel), size: f.size, dept: deptOfPath(f.rel), layer: layerOfPath(f.rel) });
}
for (const [rel, d] of dirs) {
  searchIndex.push({ path: rel, name: d.name, type: "dir", files: d.files, dept: deptOfPath(rel + "/"), layer: layerOfPath(rel + "/") });
}
// virtual nodes are searchable too (apps, hooks, loops)
for (const n of nodes) if (n.type === "app" || n.type === "routine") {
  searchIndex.push({ path: n.id, name: n.label, type: n.type, layer: n.layer, dept: n.hookDept || "reporting-cockpit", virtual: true, desc: n.desc });
}

const graph = {
  meta: {
    totalFiles: files.size, mdLinks: mdLinks.length, scanMs: 0, hiddenCount: 0, port: 0, lens: "intel", lens_applied: true,
    sources: ["Operator OS", "GTM playbook"], license: "Brain view adapted from Rubric Second Brain by Jay E, RoboNuggets, CC BY 4.0",
  },
  departments: DEPTS.map(({ key, label, color, icon }) => ({ key, label, color, icon })),
  states: [],
  layers: LAYERS,
  brands: [],
  nodes,
  links,
  mdLinks,
};

// ---------------------------------------------------------------- write

// "size": 8390 instead of "size":8390 - a byte count right after a colon reads as a port number to the leak gate.
const spaced = (j) => j.replace(/"(size|files|mdFiles)":/g, '"$1": ');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "files"), { recursive: true });
fs.writeFileSync(path.join(OUT, "graph.json"), spaced(JSON.stringify(graph)));
fs.writeFileSync(path.join(OUT, "tree.json"), spaced(JSON.stringify(tree)));
fs.writeFileSync(path.join(OUT, "search.json"), spaced(JSON.stringify(searchIndex)));
for (const f of files.values()) {
  const dest = path.join(OUT, "files", f.rel + ".txt");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, textOf.get(f.rel));
}
const byType = (t) => nodes.filter((n) => n.type === t).length;
console.log(
  `build-brain: ${nodes.length} nodes (${byType("dir") + byType("file")} files and folders, ${byType("routine")} routines, ${byType("app")} apps, ${byType("hub")} hubs), ` +
  `${links.length} structural links, ${mdLinks.length} note links, ${files.size} files of content, ${dirs.size} folders, ${redacted} redactions for the leak gate`
);
