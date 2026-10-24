#!/usr/bin/env python3
"""Build the Operator OS docs site (plain HTML and CSS, no framework) into docs/site/.

Reads the plugin itself, so the agent, skill and hook pages cannot drift from what ships:
  agents/*.md and skills/*/SKILL.md  -> frontmatter (name, description, model, effort, tools)
  hooks/hooks.json                   -> which hook fires when, on which tools
  docs/examples/*/                   -> the seven case-study kits
  rules/, systems/                   -> counts

Run from anywhere:  python3 docs/build_docs.py
Exit 0 = built. Any agent, skill or hook that has no group or no 'why' line is a loud error (exit 1),
so a new component can never ship undocumented.
"""
import html
import json
import os
import re
import shutil
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, "plugins", "operator-os")
OUT = os.path.join(ROOT, "docs", "site")
REPO = "ndnstyl/GTM-growth"  # working home; change here once the public home is decided
REPO_URL = "https://github.com/" + REPO
CALL_URL = "https://theinnovativenative.com/#book"
SITE_URL = "https://theinnovativenative.com"
INSTALL_CMD = "claude plugin marketplace add %s && claude plugin install operator-os@operator-os" % REPO
PAGES_URL = "https://theinnovativenative.com/operator-os/"
ONE_LINER = ("Operator OS is a Claude Code plugin: AI agents, skills and enforcement hooks for operators "
             "running growth marketing and GTM, with a vault that remembers.")
ASSETS = os.path.join(ROOT, "docs", "assets")

errors = []


def img_size(rel):
    """Width and height of a PNG, GIF or lossy WebP under docs/assets, read from the header (no imaging library)."""
    p = os.path.join(ASSETS, rel)
    with open(p, "rb") as f:
        b = f.read(40)
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    if b[:3] == b"GIF":
        return struct.unpack("<HH", b[6:10])
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP" and b[12:16] == b"VP8 ":
        w, h = struct.unpack("<HH", b[26:30])
        return w & 0x3FFF, h & 0x3FFF
    errors.append("cannot read the image size of " + rel)
    return 0, 0


def img(rel, alt, cls="shot", loading="lazy", extra=""):
    w, h = img_size(rel)
    return '<img class="%s" src="assets/%s" alt="%s" width="%d" height="%d" loading="%s"%s>' % (
        cls, rel, html.escape(alt, quote=True), w, h, loading, extra)


def inline_svg(fname, cls):
    """Inline an architecture SVG so the page's theme variables drive its colours."""
    t = open(os.path.join(ASSETS, fname), encoding="utf8").read()
    t = re.sub(r"^<svg ", '<svg class="%s" preserveAspectRatio="xMidYMid meet" ' % cls, t.strip(), count=1)
    return t


# ---------------------------------------------------------------- reading the plugin

def parse_frontmatter(path):
    text = open(path, encoding="utf8").read()
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        errors.append("no frontmatter: " + path)
        return {}, text
    fm, body = {}, m.group(2)
    lines = m.group(1).split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        km = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
        if not km:
            i += 1
            continue
        key, val = km.group(1), km.group(2).strip().replace(" \u2014 ", ", ").replace("\u2014", "-")
        if val in ("|", ">", "|-", ">-"):
            block = []
            i += 1
            while i < len(lines) and (lines[i].startswith(" ") or lines[i] == ""):
                block.append(lines[i].strip())
                i += 1
            fm[key] = " ".join(b for b in block if b).replace(" \u2014 ", ", ").replace("\u2014", "-")
            continue
        if val == "":
            items = []
            i += 1
            while i < len(lines) and lines[i].lstrip().startswith("- "):
                items.append(lines[i].lstrip()[2:].strip().strip('"'))
                i += 1
            fm[key] = items
            continue
        fm[key] = val.strip('"').strip("'")
        i += 1
    return fm, body


def load_agents():
    out = []
    d = os.path.join(PLUGIN, "agents")
    for f in sorted(os.listdir(d)):
        if f.endswith(".md"):
            fm, _ = parse_frontmatter(os.path.join(d, f))
            fm.setdefault("name", f[:-3])
            out.append(fm)
    return out


def load_skills():
    out = []
    d = os.path.join(PLUGIN, "skills")
    for n in sorted(os.listdir(d)):
        p = os.path.join(d, n, "SKILL.md")
        if os.path.isfile(p):
            fm, _ = parse_frontmatter(p)
            fm.setdefault("name", n)
            out.append(fm)
    return out


def load_hooks():
    data = json.load(open(os.path.join(PLUGIN, "hooks", "hooks.json")))["hooks"]
    reg = []
    for event, groups in data.items():
        for g in groups:
            for h in g["hooks"]:
                cmd = h["command"]
                script = os.path.basename(cmd.strip('"'))
                reg.append({"event": event, "matcher": g.get("matcher") or "", "script": script})
    return reg


def count_files(sub, suffix):
    d = os.path.join(PLUGIN, sub)
    return len([f for f in os.listdir(d) if f.endswith(suffix)])


# ---------------------------------------------------------------- curated copy

AGENT_GROUPS = [
    ("Plan and decide", ["orchestrator", "growth-marketing-lead", "ui-ux-engineer"]),
    ("Build", ["implementer", "jr-data-engineer", "react-motion-engineer", "web-designer", "viz-designer",
               "marketing-analyst", "paid-media-operator"]),
    ("Check (read-only, highest effort)", ["reviewer", "sr-data-engineer", "opsec", "corpus-pruner-sr"]),
    ("Keep the record clean", ["ci-committer", "ci-verifier", "deployer", "corpus-pruner"]),
    ("Research", ["researcher"]),
    ("Video edit crew", ["edit-transcriber", "edit-researcher", "edit-screen", "edit-editor", "edit-animator",
                         "edit-sound", "edit-finisher"]),
]

SKILL_GROUPS = [
    ("Run the work", ["goal", "triage", "progress", "handoff", "safe-undo", "task-observer", "workflow-forensics"]),
    ("Think before building", ["grill", "grill-me", "plan-convergence", "diagnose", "diagnosing-bugs", "tdd",
                               "codebase-design", "init-deep", "karpathy-guidelines"]),
    ("Memory and the vault", ["init-vault", "install-rules", "ingest", "distill", "lint", "synthesize"]),
    ("Trust and compliance", ["data-classification", "compliance-audit", "vibe-security", "contract-reviewer",
                              "docs-drift-check"]),
    ("Build and ship", ["frontend-design", "n8n-build", "bi-workbench", "site-speed", "mcp-client"]),
    ("Voice and copy", ["your-voice", "brand-voice-generator", "burst", "email-draft"]),
    ("Grow the harness", ["skill-creator", "writing-great-skills", "writing-for-agents", "skill-token-audit"]),
    ("Integration builder (printing press)", ["printing-press", "printing-press-amend", "printing-press-import",
                                              "printing-press-output-review", "printing-press-polish",
                                              "printing-press-publish", "printing-press-reprint",
                                              "printing-press-retro", "printing-press-score"]),
]

# why each hook exists, in plain words: the failure it prevents
HOOK_WHY = {
    "startup-load.sh": "A session that starts with half its parts missing looks fine and then misbehaves. This prints one line at the start saying which optional pieces (vault, remote vault, local model) are configured, and loads your constitution.",
    "vault-recall-prompt.sh": "Memory that depends on the assistant remembering to look fails quietly. This searches your vault on every prompt and puts the best matches in front of the assistant before it answers.",
    "checkpoint-before-change.sh": "A local change should never need a permission slog, but it should always be undoable. Before a file in a governed path is changed, the current bytes are copied aside so the change can be reverted.",
    "block-duplicate-spec-number.sh": "Two spec folders with the same number make every reference ambiguous. This refuses the write that would create the second one.",
    "block-local-zone-read.sh": "Raw sensitive files should be read only by a model on your own machine. This walls a local-only folder off from the cloud session; the sanctioned on-device path is exempt.",
    "block-off-trunk-commit.sh": "Finished work that lands on a stray branch is finished work nobody sees. This refuses a commit that is not on trunk or a spec branch. Set OPERATOR_TRUNK_BRANCH_RX to allow your own branch names, or OPERATOR_TRUNK_GRACE=1 for a one-time commit.",
    "block-blind-grep.sh": "In some shells a recursive search silently skips ignored folders and reports zero hits, which reads as proof of absence. This blocks the blind search and points to one that sees everything.",
    "block-detached-process.sh": "A server an agent starts in the background and walks away from can run for days with no owner. This refuses detached launches unless they are marked and stopped.",
    "block-local-path-disclosure.sh": "A path on your machine means nothing to the reader and exposes how your machine is laid out. This refuses outbound text (mail drafts, posts, messages) that names one.",
    "conflict-check.sh": "Two agents editing the same file at once overwrite each other. This checks declared file ownership before an edit.",
    "block-sensitive-write.sh": "A stray write to a credentials file or a key store is the quietest way to lock yourself out or leak a secret. This refuses writes to env files, key folders and similar paths.",
    "block-silent-failure.sh": "Code that swallows its own errors is how a job reports success while doing nothing. This refuses new swallowed exceptions, unchecked exit codes and hidden errors at write time and quotes the rule.",
    "block-sensitive-mcp.sh": "Some connected-tool calls cannot be undone: sending a message, editing a live workflow. This holds those until you approve.",
    "governance-egress-guard.sh": "Secrets leak through outbound payloads. This inspects what is about to leave (web fetches, connected tools, shell) and warns loudly and logs it. It warns; it does not block.",
    "vault-recall-inject.sh": "A delegated agent starts with none of your memory. This attaches the most relevant vault notes to every delegation so the agent does not rediscover a rule you already ruled.",
    "block-destructive.sh": "The commands that cost the most are few and known: recursive deletes, history rewrites on a shared tree, secret exfiltration, mass database changes, pipe-to-shell. This blocks them.",
    "platform-write-gate.sh": "An agent should prepare a change to your CRM, ad account or inbox, never apply it. This gates any call that writes outside your machine behind your approval. The registry ships empty; you add your platforms.",
    "block-ingress-drift.sh": "Every new hostname, hosting project or tunnel is a future audit finding. This refuses a write that mints a public name you have not registered. The registry ships empty.",
    "warehouse-first-gate.sh": "A figure added up by hand in a terminal changes between runs. This stops ad hoc summing of governed datasets and points to the one query that defines the number. Off until you configure it.",
    "auto-lint.sh": "Style drift is cheaper to fix the moment it happens. After a JavaScript or TypeScript edit it runs your linter.",
    "type-check.sh": "A type error found at edit time costs seconds; found at deploy it costs an afternoon. After an edit it type-checks the nearest project and reports without blocking.",
    "memory-index-cap-guard.sh": "The vault index is loaded whole and truncated past a size cap, which fails silently. This warns the moment an edit pushes the index toward the cap.",
    "audit-log.sh": "Autonomous work you cannot see is work you cannot trust. Every tool call is appended to a local record you can read later.",
    "inject-untrusted-warning.sh": "Web pages, emails and tool results can carry instructions aimed at the assistant. This marks external content as untrusted data, not as orders.",
    "precompact-save.sh": "Context compaction forgets. Before it runs, a snapshot of the repository state is written so the thread can be picked up.",
    "session-log.sh": "A record of each session, one file per session however many turns it took.",
    "token-budget.sh": "A long task needs a spending ceiling stated up front. This tracks token use against the budget at the end of each turn.",
    "scrub-secrets-on-stop.sh": "Session transcripts are a verbatim log, including anything secret that was printed. This finds live secrets in them and reports; with one setting it redacts them.",
    "execute-now-stop-gate.sh": "A reply that ends 'want me to draft it?' hands the work back to you. This refuses to end a turn on an offer unless it names a real blocker that sits on you.",
    "vault-push-on-stop.sh": "A note that exists on one machine only is one disk failure from gone. If you keep a canonical vault elsewhere, this pushes and verifies every vault write before the turn ends.",
    "outcome-capture.sh": "Without a record of how each delegated agent did, you cannot tune the seats. One outcome line is written per agent run.",
    "unslop-stop-gate.sh": "Optional. Refuses a final message that carries the most obvious machine-written tells. It costs a regenerated message per block, so it ships unregistered.",
    "name-the-thing-stop-gate.sh": "Optional. Refuses a final message that points at work by ticket, task or phase number instead of saying what the thing is. Ships unregistered.",
    "pre-commit-secret-scan.sh": "Optional git hook. Blocks a commit that contains a secret pattern, using the same pattern list as the egress guard.",
}

OPTIONAL_HOOKS = ["unslop-stop-gate.sh", "name-the-thing-stop-gate.sh", "pre-commit-secret-scan.sh"]

EVENT_LABEL = {
    "SessionStart": "When a session starts",
    "UserPromptSubmit": "When you send a prompt",
    "PreToolUse": "Before a tool runs (can block)",
    "PostToolUse": "After a tool runs",
    "PreCompact": "Before the context is compacted",
    "Stop": "When a turn ends",
    "SubagentStop": "When a delegated agent finishes",
}
EVENT_ORDER = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact", "Stop", "SubagentStop"]

OUTCOMES = [
    ("Spend proven",
     "Every dollar is tied to a number you can recompute, and no agent can move your money on its own.",
     [("A rate and cost governor in front of every vendor call", "architecture.html"),
      ("A write gate: the agent stages a change to an ad platform, you apply it", "hooks.html"),
      ("A rule that research, report and a senior tie-out must agree before a number counts", "review-loop.html"),
      ("A paid-media seat that stages every change and never pushes one", "agents.html")]),
    ("Every lead answered",
     "Contact with customers is designed, reviewed and registered before it ships, so a lead is never lost to a loose end.",
     [("A review seat that must pass any new automated customer contact", "agents.html"),
      ("A consent-evidence rule: nothing reads as tampered unless it was", "architecture.html"),
      ("A rule that new lead sources enter through one registered door", "hooks.html"),
      ("Sensitive records handed only to a model on your own machine", "skills.html")]),
    ("Numbers trusted",
     "One definition per number, a counting basis printed beside it, and a different seat checking the work.",
     [("The accuracy hierarchy: prove the inputs, compute, then tie out from a different pull", "review-loop.html"),
      ("A gate against hand-summed figures in a terminal", "hooks.html"),
      ("A docs-drift check that tests a document's claims against the code", "skills.html"),
      ("A vault where every count carries how it was counted", "vault.html")]),
    ("Compliance defensible",
     "Data is classified before it is touched, every action leaves a record, and a gap assessment is a skill, not a project.",
     [("Four data tiers and a routing table for which tool may see which tier", "architecture.html"),
      ("A compliance audit skill that maps controls to the frameworks that apply", "skills.html"),
      ("A local-only zone the cloud session cannot read", "hooks.html"),
      ("An audit trail of every tool call and a secret scrubber for transcripts", "hooks.html")]),
    ("Nothing failing quietly",
     "A job that can fail without telling you is treated as unfinished. Every failure path ends in an error, a visible refusal or an alert.",
     [("A write-time hook that refuses swallowed errors and hidden exit codes", "hooks.html"),
      ("A rule that every wait has a deadline and every long task states a budget", "architecture.html"),
      ("A hook that refuses detached processes nobody supervises", "hooks.html"),
      ("A rule that a lookup which finds nothing says so, instead of returning empty", "architecture.html")]),
]

DOCTRINE = [
    ("Loud failure", "Anything that can break ends in an error, a visible refusal or an alert row. A silent success is a bug."),
    ("Review loop", "One seat builds, a different seat checks, the check is bounded, and a halt is a valid ending."),
    ("Leak gate", "Nothing sensitive leaves on a prose rule alone: a local-only wall, an egress watch, a secret scan, a path-disclosure block."),
    ("Name the thing", "You never receive a ticket number. Every reference says what the thing is, in plain English."),
    ("Execute now", "If it can be done now, it is done now. The only reason to stop is a blocker that sits on you."),
]

SHOTS = (
    "<figure>" + img("screens/gtm-paid-media.png", "GTM OS Paid Media report: spend, clicks, a 28 day trend and campaigns by spend, for a fictional company") + "<figcaption>Paid Media: spend, clicks, a 28 day trend and campaigns by spend.</figcaption></figure>"
    "<figure>" + img("screens/gtm-content-studio.png", "GTM OS Content Studio: ideas moving from scripted to ready") + "<figcaption>Content Studio: ideas moving from scripted to ready.</figcaption></figure>"
)

START_STEPS = [
    ("Install the plugin", "One command. It adds the agents, skills, hooks and system packs. Open a project and one status line says which optional parts are configured.", "tutorial-install.html"),
    ("Install the rules", "Ask for the install-rules skill so the doctrine lives in your project.", "install.html#rules"),
    ("Make your vault", "Copy the starter vault, or run the init-vault skill, and set the vault variable.", "tutorial-vault.html"),
    ("Read the example", "Open the fictional company's vault and follow one rule from its raw source to its card.", "vault.html#example"),
    ("Run the loop", "Build with one seat, check with another, and stop after three rounds.", "tutorial-review-loop.html"),
    ("Add your own hook", "Block a mistake only you know about, and prove it with a test.", "tutorial-hook.html"),
    ("Give it a goal", "Run the goal skill with a plain outcome and watch the gates hold.", "skills.html#goal"),
]

STORY = [
    ("The assistant asked too many questions",
     "Early on, the assistant asked permission on every write. The answer was not more rules; it was one approval per goal, keyed to the tool call and not to words in a command. That is the first case study."),
    ("A job sat 'running' for an hour",
     "A recording-analysis job waited for a signal that would never come. Both machines idled. The existing rule against silent failure covered pipelines only, so waiting was uncovered. The fix was a rule for every component and a hook that enforces it at write time."),
    ("The knowledge base could not say what it did not know",
     "A search that finds nothing looks like a search that found nothing relevant. The retrieval case study turned that into a ladder and a loud miss."),
    ("Finished work sat uncommitted",
     "Backups were doing the job of history. A trunk, tagged releases and two seats that keep it current and green replaced that habit."),
    ("Notes named like database rows",
     "Seventeen hundred notes were findable only by someone who knew the key. Renaming for a human came with a checkpoint, aliases, rewritten links and an automatic rollback."),
    ("Health checks that only notified",
     "A check that tells you it is red and fixes nothing is a pager, not a system. The last case study binds deterministic remedies to signals, each with a precondition, a lock, a verify and a reversal."),
]


# ---------------------------------------------------------------- markdown (small, enough for the kits)

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", lambda m: "<code>%s</code>" % m.group(1), s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?![*\w])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def md(text):
    out, lines, i = [], text.split("\n"), 0
    para = []

    def flush():
        if para:
            out.append("<p>%s</p>" % inline(" ".join(para)))
            para.clear()

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush()
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(code)))
            i += 1
            continue
        hm = re.match(r"^(#{1,4})\s+(.*)$", line)
        if hm:
            flush()
            lvl = min(len(hm.group(1)) + 1, 4)
            out.append("<h%d>%s</h%d>" % (lvl, inline(hm.group(2)), lvl))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1]):
            flush()
            head = [c.strip() for c in line.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            t = ["<div class=\"tablewrap\"><table><thead><tr>"]
            t += ["<th>%s</th>" % inline(c) for c in head]
            t.append("</tr></thead><tbody>")
            for r in rows:
                t.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in r) + "</tr>")
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue
        if re.match(r"^\s*([-*]|\d+\.)\s+", line):
            flush()
            ordered = bool(re.match(r"^\s*\d+\.", line))
            items = []
            while i < len(lines) and re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % inline(x) for x in items), tag))
            continue
        if line.startswith(">"):
            flush()
            q = []
            while i < len(lines) and lines[i].startswith(">"):
                q.append(lines[i][1:].strip())
                i += 1
            out.append("<blockquote>%s</blockquote>" % inline(" ".join(q)))
            continue
        if line.strip() == "---" or line.strip() == "":
            flush()
            i += 1
            continue
        para.append(line.strip())
        i += 1
    flush()
    return "\n".join(out)


# ---------------------------------------------------------------- page shell

NAV = [("index.html", "Home"), ("architecture.html", "Architecture"), ("install.html", "Install"),
       ("tutorials.html", "Tutorials"), ("agents.html", "Agents"), ("skills.html", "Skills"), ("hooks.html", "Hooks"), ("vault.html", "Vault"),
       ("review-loop.html", "Review loop"), ("case-studies.html", "Case studies"),
       ("how-it-was-built.html", "How it was built")]

CSS = """
:root{--bg:#f5f6fb;--panel:#ffffff;--ink:#0b0c1a;--mute:#4a4e6b;--line:#d5d8e8;--line-strong:#6b6f8e;--acc:#00606f;--acc2:#a1008f;--btn:#00e5ff;--btn-ink:#06101f;--soft:#e2f6fa;--code:#eceef7;--glow1:rgba(0,229,255,.16);--glow2:rgba(255,61,245,.10);--shadow:0 10px 30px rgba(11,12,26,.08);--serif:Fraunces,"Iowan Old Style","Palatino Linotype",Georgia,serif;--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0b0c1a;--panel:#14162c;--ink:#f4f5fb;--mute:#aeb2cc;--line:#2b2e52;--line-strong:#7b7fa8;--acc:#00e5ff;--acc2:#ff7bf7;--soft:#0d2236;--code:#0f1124;--glow1:rgba(0,229,255,.16);--glow2:rgba(255,61,245,.12);--shadow:0 12px 36px rgba(0,0,0,.45)}}
:root[data-theme="dark"]{--bg:#0b0c1a;--panel:#14162c;--ink:#f4f5fb;--mute:#aeb2cc;--line:#2b2e52;--line-strong:#7b7fa8;--acc:#00e5ff;--acc2:#ff7bf7;--soft:#0d2236;--code:#0f1124;--glow1:rgba(0,229,255,.16);--glow2:rgba(255,61,245,.12);--shadow:0 12px 36px rgba(0,0,0,.45)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);background-image:radial-gradient(60rem 28rem at 10% -8%,var(--glow1),transparent 70%),radial-gradient(50rem 26rem at 100% 0,var(--glow2),transparent 70%);background-repeat:no-repeat;color:var(--ink);font:17px/1.65 var(--sans)}
a{color:var(--acc);text-underline-offset:3px}
a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--acc);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:-999px;top:8px;background:var(--btn);color:var(--btn-ink);padding:8px 14px;border-radius:8px;z-index:9}
.skip:focus{left:8px}
header.site{border-bottom:1px solid var(--line);background:var(--panel)}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 18px;padding:12px 0 6px}
.brand{font:600 21px var(--serif);color:var(--ink);text-decoration:none;margin-right:10px;letter-spacing:.2px}
.brand b{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:600}
nav.main{display:flex;flex-wrap:wrap;gap:0 16px;order:3;flex-basis:100%;margin-top:-4px}
nav.main a{color:var(--mute);text-decoration:none;font-size:15px;padding:6px 0;border-bottom:2px solid transparent}
nav.main a:hover,nav.main a.on{color:var(--ink);border-bottom-color:var(--acc)}
.tools{display:flex;gap:8px;align-items:center;margin-left:auto}
.theme{font:600 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink);background:transparent;border:1.5px solid var(--line-strong);border-radius:999px;padding:7px 14px;cursor:pointer;min-height:36px}
.theme:hover{border-color:var(--acc)}
.bookbtn{font-size:14px;padding:8px 16px;min-height:36px}
main{padding:40px 0 70px}
h1{font:400 clamp(32px,6vw,56px)/1.1 var(--serif);margin:0 0 16px;letter-spacing:-.5px}
h1 em,.grad{font-style:italic;background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font:400 clamp(24px,3.6vw,34px)/1.2 var(--serif);margin:52px 0 14px}
h3{font:600 19px/1.3 var(--sans);margin:26px 0 8px}
h4{font-size:16px;margin:18px 0 6px}
.eyebrow{display:inline-block;font:500 12px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--acc);border:1px solid var(--line-strong);border-radius:999px;padding:6px 14px;margin-bottom:18px}
p.lede{font-size:clamp(18px,2.4vw,22px);color:var(--mute);max-width:44em}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 22px;min-height:44px;border-radius:10px;background:var(--btn);color:var(--btn-ink);font-weight:700;text-decoration:none;border:1.5px solid var(--btn)}
.btn:hover{filter:brightness(1.07)}
.btn.alt{background:transparent;color:var(--ink);border-color:var(--line-strong)}
.btn.alt:hover{border-color:var(--acc);filter:none}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px;box-shadow:var(--shadow)}
.card h3{margin-top:0}
.card ul{margin:8px 0 0;padding-left:20px;color:var(--mute);font-size:15px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.stat{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center}
.stat b{display:block;font:400 40px/1.1 var(--serif);color:var(--acc);font-variant-numeric:tabular-nums}
.stat span{font-size:14px;color:var(--mute)}
img.diagram,img.shot{width:100%;height:auto;border:1px solid var(--line);border-radius:14px;background:var(--panel);display:block;box-shadow:var(--shadow)}
figure{margin:20px 0}
figcaption{font-size:14px;color:var(--mute);margin-top:8px}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
code{background:var(--code);padding:1px 6px;border-radius:5px;font:0.88em var(--mono)}
pre{background:var(--code);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;font-size:15px}
pre code{background:none;padding:0}
.see{border-left:4px solid var(--acc2);background:var(--panel);border-radius:0 12px 12px 0;padding:10px 18px;margin:14px 0;border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.see b.lbl{display:block;font:600 12px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--acc2);margin-bottom:4px}
.see pre{margin:8px 0;white-space:pre-wrap;word-break:break-word}
.tablewrap{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left;vertical-align:top}
th{color:var(--mute);font:600 12px var(--mono);letter-spacing:.1em;text-transform:uppercase}
blockquote{margin:14px 0;padding:6px 16px;border-left:4px solid var(--acc);color:var(--mute)}
.tag{display:inline-block;font:500 12px var(--mono);border:1px solid var(--line-strong);border-radius:999px;padding:1px 10px;margin-right:6px;color:var(--mute)}
.tag.opus{border-color:var(--acc);color:var(--acc)}
details{margin-top:8px}
summary{cursor:pointer;color:var(--acc);font-size:14px}
.item{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:10px 0}
.item h3{margin:0 0 4px;font-size:17px}
.item p{margin:6px 0 0;color:var(--mute);font-size:15px}
.filter{width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid var(--line-strong);background:var(--panel);color:var(--ink);font:16px var(--sans);margin:8px 0 4px}
ol.steps{counter-reset:s;list-style:none;padding:0}
ol.steps li{counter-increment:s;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px 14px 62px;margin:10px 0;position:relative}
ol.steps li:before{content:counter(s);position:absolute;left:16px;top:12px;width:32px;height:32px;border-radius:50%;background:var(--btn);color:var(--btn-ink);text-align:center;line-height:32px;font-weight:700}
footer.site{border-top:1px solid var(--line);padding:26px 0;color:var(--mute);font-size:14px;background:var(--panel)}
@media (max-width:600px){body{font-size:16px}main{padding-top:24px}.wrap{padding:0 16px}.shots{grid-template-columns:1fr}.bar{gap:4px 12px}.brand{font-size:19px}.bookbtn{padding:6px 14px}.eyebrow{letter-spacing:.08em}nav.main a{font-size:15px;padding:9px 0}table.stack thead{display:none}table.stack tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}table.stack td{display:block;border:0;padding:2px 0}table.stack td:nth-child(2){color:var(--mute);font-size:13px}code{word-break:break-word}}
@media (min-width:601px){td:first-child{min-width:200px}}
@media (prefers-reduced-motion:no-preference){.btn,.theme,.card{transition:filter .15s,border-color .15s}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
main:focus{outline:none}
.menu{display:none;font:600 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink);background:transparent;border:1.5px solid var(--line-strong);border-radius:999px;padding:7px 14px;cursor:pointer;min-height:36px}
.card h2{font:600 19px/1.3 var(--sans);margin:0 0 8px}
h2.sub{font:600 19px/1.3 var(--sans);margin:26px 0 8px}
.cmd{position:relative}
.cmd pre.wrap{white-space:pre-wrap;word-break:break-all;padding-right:84px}
.cmd .copy{position:absolute;top:10px;right:10px;font:600 12px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--btn-ink);background:var(--btn);border:0;border-radius:8px;padding:8px 12px;min-height:36px;cursor:pointer}
footer.site a{display:inline-block;padding:6px 0}
.dg-narrow{display:none}
.dg-wide,.dg-narrow{width:100%;height:auto;border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.diagram-wrap{--d-bg:#ffffff;--d-ink:#0b0c1a;--d-mute:#4a4e6b;--d-panel:#f5f6fb;--d-card:#eceef7;--d-edge:#b9bdd6;--d-band:#e2f6fa;--d-acc:#00606f;--d-acc2:#a1008f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .diagram-wrap{--d-bg:#0b0c1a;--d-ink:#f4f5fb;--d-mute:#aeb2cc;--d-panel:#14162c;--d-card:#1b1e3a;--d-edge:#3a3d63;--d-band:#0d2236;--d-acc:#00e5ff;--d-acc2:#ff7bf7}}
:root[data-theme="dark"] .diagram-wrap{--d-bg:#0b0c1a;--d-ink:#f4f5fb;--d-mute:#aeb2cc;--d-panel:#14162c;--d-card:#1b1e3a;--d-edge:#3a3d63;--d-band:#0d2236;--d-acc:#00e5ff;--d-acc2:#ff7bf7}
.diagram-text{margin:12px 0 0;color:var(--mute);font-size:16px}
.rule{height:2px;border:0;background:linear-gradient(90deg,#00e5ff,#ff3df5);margin:22px 0 0;opacity:.9}
.stat{box-shadow:inset 0 3px 0 #00e5ff}
video.shot{width:100%;height:auto;background:#0b0c1a}
.excerpt{color:var(--mute);font-size:15px}
.card code{overflow-wrap:anywhere}
body{min-height:100vh;display:flex;flex-direction:column}main{flex:1}
.cmd .copy{top:50%;transform:translateY(-50%)}
.cmd pre.wrap{min-height:56px}
pre{white-space:pre-wrap;word-break:break-word}
@media (max-width:420px){.eyebrow .opt{display:none}}
@media (min-width:901px){
.grid.g5{grid-template-columns:repeat(6,minmax(0,1fr))}.grid.g5>.card{grid-column:span 2}.grid.g5>.card:nth-child(n+4){grid-column:span 3}
.grid.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.g2>.card:last-child:nth-child(odd){grid-column:1/-1}}
@media (max-width:720px){.js nav.main{display:none;margin-top:4px}.js nav.main.open{display:flex;flex-direction:column;gap:0;padding-bottom:8px}.js .menu{display:inline-flex;align-items:center}.dg-wide{display:none}.dg-narrow{display:block}.bookbtn{display:inline-flex!important;padding:6px 14px}}
"""


FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b0c1a'/%3E"
           "%3Ccircle cx='32' cy='32' r='15' fill='none' stroke='%2300e5ff' stroke-width='7'/%3E%3Ccircle cx='47' cy='17' r='5' fill='%23ff3df5'/%3E%3C/svg%3E")


def structured_data(fname, title, desc, body):
    url = PAGES_URL + ("" if fname == "index.html" else fname)
    person = {"@type": "Person", "@id": SITE_URL + "#mike-soto", "name": "Mike Soto", "jobTitle": "Fractional Chief AI Officer",
              "worksFor": {"@type": "Organization", "name": "The Innovative Native", "url": SITE_URL}, "url": SITE_URL,
              "sameAs": [SITE_URL, "https://www.linkedin.com/in/michael-soto-7134ba158"]}
    graph = [
        {"@type": "SoftwareApplication", "@id": PAGES_URL + "#app", "name": "Operator OS",
         "applicationCategory": "DeveloperApplication", "operatingSystem": "Claude Code",
         "description": ONE_LINER, "license": "https://opensource.org/licenses/MIT", "installUrl": REPO_URL,
         "url": PAGES_URL, "author": person, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        {"@type": "WebSite", "@id": PAGES_URL + "#site", "name": "Operator OS", "url": PAGES_URL, "publisher": person},
    ]
    if fname != "index.html":
        graph.append({"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Operator OS", "item": PAGES_URL},
            {"@type": "ListItem", "position": 2, "name": title, "item": url}]})
    if fname.startswith("tutorial-"):
        steps = re.findall(r"<h2>(Step \d+\. [^<]+)</h2>", body)
        if steps:
            graph.append({"@type": "HowTo", "name": title, "description": desc, "url": url,
                          "step": [{"@type": "HowToStep", "position": i + 1, "name": re.sub(r"^Step \d+\. ", "", t), "url": url}
                                   for i, t in enumerate(steps)]})
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, separators=(",", ":"))


def page(fname, title, body, desc=""):
    desc = desc or title
    parent = "tutorials.html" if fname.startswith("tutorial-") else ("case-studies.html" if fname.startswith("case-0") else "")
    nav = "".join('<a href="%s"%s>%s</a>' % (h, ' class="on" aria-current="page"' if h == fname else (' class="on" aria-current="true"' if h == parent else ""), html.escape(t)) for h, t in NAV)
    url = PAGES_URL + ("" if fname == "index.html" else fname)
    ogimg = PAGES_URL + "assets/screens/walkthrough-poster.png"
    full_title = title if fname == "index.html" else "%s | Operator OS" % title
    robots = '<meta name="robots" content="noindex">' if fname == "404.html" else '<link rel="canonical" href="%s">' % url
    counter = {"pre": 0, "tbl": 0}

    def label_pre(m):
        counter["pre"] += 1
        return '<pre tabindex="0" role="region" aria-label="Code or command %d">' % counter["pre"]

    def label_tbl(m):
        counter["tbl"] += 1
        return '<div class="tablewrap" tabindex="0" role="region" aria-label="Table %d, scrolls sideways">' % counter["tbl"]

    body = re.sub(r"<pre>", label_pre, body)
    body = re.sub(r'<div class="tablewrap">', label_tbl, body)
    doc = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0b0c1a" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f5f6fb" media="(prefers-color-scheme: light)">
<title>%(full_title)s</title>
<meta name="description" content="%(desc)s">
%(robots)s
<link rel="icon" href="%(favicon)s">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Operator OS">
<meta property="og:title" content="%(full_title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="%(ogimg)s">
<meta property="og:image:alt" content="The GTM OS cockpit, a video poster frame">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(full_title)s">
<meta name="twitter:description" content="%(desc)s">
<meta name="twitter:image" content="%(ogimg)s">
<link rel="preload" href="assets/fonts/inter-normal-2.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
<script type="application/ld+json">%(ld)s</script>
<script>try{var t=localStorage.getItem("oos-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}document.documentElement.className="js"</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap"><div class="bar"><a class="brand" href="index.html">Operator <b>OS</b></a><nav class="main" id="mainnav" aria-label="Main">%(nav)s</nav><div class="tools"><button class="menu" id="menu" type="button" aria-expanded="false" aria-controls="mainnav">Menu</button><button class="theme" id="theme" type="button">Theme</button><a class="btn bookbtn" href="%(call)s">Book a call</a></div></div></div></header>
<main id="main" tabindex="-1"><div class="wrap">
%(body)s
</div></main>
<footer class="site"><div class="wrap">Operator OS is MIT licensed. Built by Mike Soto, fractional Chief AI Officer, The Innovative Native. <a href="%(site)s">theinnovativenative.com</a> &middot; <a href="%(call)s">Book a call</a> &middot; <a href="%(repo)s">Source</a></div></footer>
<script>(function(){var b=document.getElementById("theme"),r=document.documentElement;function cur(){return r.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}function lab(){var d=cur()==="dark";b.textContent=d?"Light":"Dark";b.setAttribute("aria-label",d?"Switch to light theme":"Switch to dark theme")}lab();b.addEventListener("click",function(){var n=cur()==="dark"?"light":"dark";r.setAttribute("data-theme",n);try{localStorage.setItem("oos-theme",n)}catch(e){}lab()});
var m=document.getElementById("menu"),nv=document.getElementById("mainnav");function setMenu(o){nv.classList.toggle("open",o);m.setAttribute("aria-expanded",o?"true":"false")}m.addEventListener("click",function(){setMenu(!nv.classList.contains("open"))});document.addEventListener("pointerdown",function(e){if(nv.classList.contains("open")&&!nv.contains(e.target)&&!m.contains(e.target))setMenu(false)});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&nv.classList.contains("open")){setMenu(false);m.focus()}});
document.querySelectorAll("button.copy").forEach(function(c){c.addEventListener("click",function(){var t=document.getElementById(c.getAttribute("data-target")).textContent,s=document.getElementById("copystatus");function ok(){c.textContent="Copied";s.textContent="Copied to clipboard";setTimeout(function(){c.textContent="Copy";s.textContent=""},2000)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,function(){s.textContent="Copy failed, select the command and copy it by hand"})}else{s.textContent="Copy is not available here, select the command and copy it by hand"}})})})();</script>
<div class="sr" id="copystatus" role="status" aria-live="polite"></div>
</body>
</html>
""" % {"title": html.escape(title), "full_title": html.escape(full_title), "robots": robots, "desc": html.escape(desc, quote=True), "nav": nav, "body": body,
       "site": SITE_URL, "call": CALL_URL, "repo": REPO_URL, "url": url, "ogimg": ogimg, "favicon": FAVICON,
       "ld": structured_data(fname, title, desc, body).replace("</", "<\\/")}
    open(os.path.join(OUT, fname), "w", encoding="utf8").write(doc)
    SITEMAP.append(url)


def cmdblock(cmd, ident):
    return ('<div class="cmd"><pre class="wrap"><code id="%s">%s</code></pre>'
            '<button class="copy" type="button" aria-label="Copy the command" data-target="%s">Copy</button></div>' % (ident, html.escape(cmd), ident))


SITEMAP = []


def book_block():
    return ('<h2 id="book">Book a call</h2><p>I work as a fractional Chief AI Officer for businesses that run growth marketing, AI and AI compliance on systems like this one. '
            'If you want it working against your own numbers, tell me what you need proven first. We start there.</p>'
            '<div class="cta"><a class="btn" href="%s">Book a call</a><a class="btn alt" href="%s">theinnovativenative.com</a></div>'
            % (CALL_URL, SITE_URL))


# ---------------------------------------------------------------- pages

def short(desc, n=210):
    d = re.sub(r"`[^`]*`", "", desc or "")
    d = re.sub(r"\s+", " ", d.strip())
    d = re.sub(r"\s*TRIGGERS.*$", "", d) if len(d) > n else d
    if len(d) <= n:
        return d
    cut = d[:n]
    m = re.search(r"^(.*[.!?])\s", cut)
    return (m.group(1) if m and len(m.group(1)) > 80 else cut.rsplit(" ", 1)[0] + "...")


def build_home(C):
    cards = []
    for head, line, proofs in OUTCOMES:
        lis = "".join('<li><a href="%s">%s</a></li>' % (h, html.escape(t)) for t, h in proofs)
        cards.append('<div class="card"><h3>%s</h3><p>%s</p><ul>%s</ul></div>' % (html.escape(head), html.escape(line), lis))
    stats = "".join('<div class="stat"><b>%s</b><span>%s</span></div>' % (n, l) for n, l in [
        (C["agents"], "agents"), (C["skills"], "skills"), (C["hooks"], "enforcement hooks"),
        (C["rules"], "rules"), (C["packs"], "system packs"), (C["cases"], "worked case studies")])
    doctrine = "".join('<div class="card"><h3>%s</h3><p>%s</p></div>' % (html.escape(a), html.escape(b)) for a, b in DOCTRINE)
    steps = "".join('<li><strong><a href="%s">%s</a></strong><br>%s</li>' % (h, html.escape(a), html.escape(b))
                    for a, b, h in START_STEPS)
    body = """
<p class="eyebrow">Open source &middot; MIT<span class="opt"> &middot; for people who run a business</span></p>
<h1>Run the business.<br><em>Let the system keep the promises.</em></h1>
<p class="lede">Operator OS is an open-source AI operating system for people who run a business. It is built so your spend is proven, every lead is answered, your numbers hold up, your compliance is defensible, and nothing fails quietly.</p>
<p>It installs as a Claude Code plugin: AI agents, skills and enforcement hooks for operators running growth marketing and GTM, with a vault that remembers. Use it for GTM automation that stays inside your rules: paid media staged for your approval, lead follow-up that passes a review seat, and reporting whose numbers are recomputed before they count.</p>
<div class="cta"><a class="btn" href="install.html">Install in one command</a><a class="btn alt" href="tutorials.html">Start a tutorial</a><a class="btn alt" href="#book">Book a call</a></div>
<figure>%(hero)s<figcaption>What the harness runs underneath: the GTM OS cockpit, shown here on a fictional company. <a href="https://theinnovativenative.com/gtm-os/">Open the live demo.</a></figcaption></figure>
<h2>What you get</h2>
<div class="grid g5">%(cards)s</div>
<h2>Then look underneath</h2>
<p>Every outcome above is held in place by something you can read. Nothing here is a slogan; each line links to the part that does the work.</p>
<div class="stats">%(stats)s</div>
<div class="diagram-wrap" style="margin-top:16px">%(dg_wide)s%(dg_narrow)s
<p class="diagram-text">You state a goal and read a result. A band of 31 hooks and gates wraps the session. Your systems sit behind the gates and a vault remembers. <a href="architecture.html">Open the full diagram.</a></p></div>
<h2>See it</h2>
<figure><video class="shot" controls playsinline preload="metadata" width="1280" height="720" poster="assets/screens/walkthrough-poster.webp" aria-label="A 25 second walkthrough: the GTM OS cockpit, paid media, content studio, the architecture, a hook, and the install line"><source src="assets/walkthrough.mp4" type="video/mp4"></video><figcaption>A 25 second walkthrough. Press play; it does not start by itself.</figcaption></figure>
<p>Real screens from the public GTM OS demo, a working surface built on this harness with a fictional company in it.</p>
<div class="shots">%(shots)s</div>
<h2>Start here</h2>
<ol class="steps">%(steps)s</ol>
<h2>The operating doctrine in brief</h2>
<div class="grid g5">%(doctrine)s</div>
%(book)s
""" % {"cards": "".join(cards), "stats": stats, "steps": steps, "shots": SHOTS, "doctrine": doctrine, "book": book_block(),
       "hero": img("screens/gtm-command.webp", "The GTM OS Command cockpit: key numbers, a priority line, stage cards and an Ask the data panel, on a fictional company", loading="eager", extra=' fetchpriority="high"'),
       "dg_wide": inline_svg("architecture.svg", "dg-wide"), "dg_narrow": inline_svg("architecture-mobile.svg", "dg-narrow")}
    page("index.html", "Operator OS: a Claude Code plugin for growth and GTM operators", body, ONE_LINER)


def build_architecture(C):
    body = """
<h1>Architecture</h1>
<p class="lede">One session, wrapped in enforcement, with memory underneath. The assistant never touches your real systems except through a gate.</p>
<div class="diagram-wrap">%(dg_wide)s%(dg_narrow)s</div>
<h2>The layers, outside in</h2>
<h3>You</h3>
<p>You state a goal and read a result. You hold the keys: every approval that moves money, sends a message or changes a live platform is yours.</p>
<h3>The enforcement band (%(hooks)s hooks)</h3>
<p>Hooks run on tool calls and turn endings. They are code, not instructions: a rule written only as prose can be talked around, a hook cannot. See <a href="hooks.html">every hook and why it exists</a>.</p>
<h3>Rules (%(rules)s)</h3>
<p>The doctrine in plain markdown: loud failure, execute now, plain English, data tiers, the opsec gate, the accuracy hierarchy, the ingress rule, consent evidence and more. A plugin cannot ship rules directly, so the install-rules skill copies them into your project.</p>
<h3>Skills (%(skills)s)</h3>
<p>Methods you invoke by name: <a href="skills.html">goal, grill, diagnose, distill, ingest, handoff, compliance audit and the rest</a>.</p>
<h3>Agents (%(agents)s)</h3>
<p>Specialist seats, each pinned to a model tier and an effort level, each with a stated way its work is checked. Builders build. Reviewers read and never edit. See <a href="agents.html">every agent</a> and <a href="review-loop.html">the review loop</a>.</p>
<h3>System packs (%(packs)s)</h3>
<p>A pack ties a domain to its skills, agents, gates and memory. The goal skill reads the registry, picks the pack, and runs the work to the first protected gate.</p>
<h3>The gates that ship empty</h3>
<p>Three gates are installed but start with no rows, because only you know your platforms: the platform-write registry, the ingress registry and the api governor's vendor registry. Until you add a row they allow every write except minting an approval, and say so once. Add a row and the gate becomes real.</p>
<h3>The vault</h3>
<p>Plain markdown, an index that loads every session, templates, and tools to search, lint, rename and push it. See <a href="vault.html">the vault method</a>.</p>
<h2>Optional services: configured, or one clear line</h2>
<p>Nothing crashes when a piece is missing. Each hook that depends on something prints a single "not configured" line.</p>
<div class="tablewrap"><table><thead><tr><th>Needs</th><th>Set</th><th>If unset</th></tr></thead><tbody>
<tr><td>a vault folder</td><td><code>OPERATOR_VAULT</code></td><td>recall hooks say "not configured"; the init-vault skill creates one</td></tr>
<tr><td>a vault on another machine</td><td><code>OPERATOR_VAULT_REMOTE</code></td><td>the push hook says "not configured"</td></tr>
<tr><td>an on-device model</td><td><code>OPERATOR_LOCAL_LLM_URL</code>, <code>OPERATOR_LOCAL_LLM_MODEL</code></td><td>the local-ask script exits with "not configured"; nothing goes to a cloud model</td></tr>
<tr><td>a reranker for recall</td><td><code>OPERATOR_RERANK_URL</code></td><td>keyword order is used</td></tr>
<tr><td><code>jq</code>, <code>python3</code></td><td>install them</td><td>the hook skips itself and says so</td></tr>
</tbody></table></div>
<h2>Data tiers and what may see them</h2>
<p>The data-handling rule sorts everything into four tiers and says which AI tool may touch each. The short form: regulated and confidential data never enters a consumer chat window, and the on-device lane exists for work over raw records.</p>
<div class="tablewrap"><table><thead><tr><th>Tier</th><th>What</th><th>Consumer chat apps</th><th>Commercial API</th><th>Governed pipeline</th></tr></thead><tbody>
<tr><td>T0</td><td>privileged or regulated</td><td>never</td><td>never, unless under a signed agreement</td><td>the only path</td></tr>
<tr><td>T1</td><td>confidential: your prompts, pricing, contact records, credentials</td><td>never</td><td>if the processor is registered and no-train</td><td>preferred</td></tr>
<tr><td>T2</td><td>internal</td><td>avoid; strip identifiers</td><td>allowed</td><td>allowed</td></tr>
<tr><td>T3</td><td>public</td><td>allowed</td><td>allowed</td><td>allowed</td></tr>
</tbody></table></div>
%(book)s
""" % dict(C, book=book_block(), dg_wide=inline_svg("architecture.svg", "dg-wide"), dg_narrow=inline_svg("architecture-mobile.svg", "dg-narrow"))
    page("architecture.html", "Architecture", body, "How the pieces of Operator OS fit: session, rules, skills, agents, hooks, gates and the vault.")


def build_install(C):
    body = """
<h1>Install in one command</h1>
<p class="lede">Operator OS is a Claude Code plugin. One command adds the agents, skills, hooks and system packs to every project you open.</p>
%(cmdblock)s
<p>You need Claude Code, <code>jq</code> and <code>python3</code>. If <code>jq</code> is missing, each hook skips itself and says so, so nothing breaks; install it to turn the hooks on.</p>
<h2>Then set up your project</h2>
<ol class="steps">%(steps)s</ol>
<h2>Optional: the constitution</h2>
<p>The plugin ships a short template. Copy it to <code>.specify/memory/constitution.md</code> and fill in who you are. Delete any clause you will not enforce.</p>
<h2>Commits and branches</h2>
<p>One hook, <code>block-off-trunk-commit.sh</code>, refuses a <code>git commit</code> unless the branch is <code>main</code> or a <code>spec/NNN-</code> worktree branch. If your team works on feature branches, set <code>OPERATOR_TRUNK_BRANCH_RX</code> to a regular expression of the branch names you allow, for example <code>^(main|feature/.+)$</code>. For a one-time commit on any other branch, set <code>OPERATOR_TRUNK_GRACE=1</code> for that command or create the file <code>.operator/TRUNK_GRACE</code>; every grace use is logged.</p>
<h2>Turn on the gates that ship empty</h2>
<p>The platform-write gate, the ingress registry and the api governor each start with no rows. They allow everything until you add your platforms. The <a href="%(repo)s/blob/main/docs/platform-write-gate.md">platform-write gate guide</a> shows the first row.</p>
<h2>Optional hooks</h2>
<p>Three hooks ship but are not registered, because each has a cost you should choose. The unslop and name-the-thing gates refuse a final message, which costs a regenerated message. The pre-commit secret scan is a git hook:</p>
<pre><code>ln -s &lt;plugin&gt;/hooks/pre-commit-secret-scan.sh .git/hooks/pre-commit</code></pre>
<h2>Check the package</h2>
<pre><code>claude plugin validate .
claude plugin validate plugins/operator-os --strict</code></pre>
<p>Hook state and receipts land in your project under <code>.operator/</code>. Add it to <code>.gitignore</code>.</p>
%(book)s
""" % {"cmdblock": cmdblock(INSTALL_CMD, "install-cmd"), "repo": REPO_URL, "book": book_block(),
       "steps": "".join('<li%s><strong><a href="%s">%s</a></strong><br>%s</li>' % (' id="rules"' if h.endswith("#rules") else "", h, html.escape(a), html.escape(b)) for a, b, h in START_STEPS)}
    page("install.html", "Install", body, "Install Operator OS as a Claude Code plugin in one command, then set up rules, vault and gates.")


def tools_note(fm):
    allowed = fm.get("tools") or []
    denied = fm.get("disallowedTools") or []
    if isinstance(allowed, str):
        allowed = [allowed]
    if isinstance(denied, str):
        denied = [denied]
    if any(t in ("Write", "Edit") for t in denied):
        return "read-only"
    if any(t.startswith("Write") or t.startswith("Edit") for t in allowed) or not allowed:
        return "can edit"
    if allowed:
        return "read-only"
    return "limited tools"


def build_agents(agents):
    by = {a["name"]: a for a in agents}
    seen, secs = set(), []
    for title, names in AGENT_GROUPS:
        items = []
        for n in names:
            a = by.get(n)
            if not a:
                errors.append("agent group names a missing agent: " + n)
                continue
            seen.add(n)
            model = a.get("model", "inherit")
            items.append('<div class="item" data-q="%s"><h3 id="%s">%s</h3><span class="tag %s">%s</span><span class="tag">effort: %s</span><span class="tag">%s</span><p>%s</p><details><summary>Full description</summary><p>%s</p></details></div>' % (
                html.escape((n + " " + a.get("description", "")).lower(), quote=True), n, n, "opus" if model == "opus" else "", model,
                a.get("effort", "default"), tools_note(a), html.escape(short(a.get("description", ""))),
                html.escape(re.sub(r"\s+", " ", a.get("description", "")))))
        secs.append("<h2>%s</h2>%s" % (html.escape(title), "".join(items)))
    for n in by:
        if n not in seen:
            errors.append("agent has no group in build_docs.py: " + n)
    body = """
<h1>Agents (%d)</h1>
<p class="lede">Specialist seats, each pinned to a model tier and an effort level. Builders run on cheaper tiers; the seats that check run on the strongest tier, read-only, and send defects back down.</p>
<p>Every agent below is listed with its model tier, effort and whether it can edit files, straight from the agent's own definition.</p>
<input class="filter" id="q" type="search" placeholder="Filter agents" aria-label="Filter agents">
<div id="list">%s</div>
<script>
(function(){var q=document.getElementById('q');q.addEventListener('input',function(){var v=q.value.toLowerCase();
document.querySelectorAll('#list .item').forEach(function(e){e.style.display=e.getAttribute('data-q').indexOf(v)>-1?'':'none';});});})();
</script>
%s""" % (len(agents), "".join(secs), book_block())
    page("agents.html", "Agents", body, "Every Operator OS agent: planners, builders, read-only checkers and a video edit crew, with what each one is for.")


def build_skills(skills):
    by = {s["name"]: s for s in skills}
    seen, secs = set(), []
    for title, names in SKILL_GROUPS:
        items = []
        for n in names:
            s = by.get(n)
            if not s:
                errors.append("skill group names a missing skill: " + n)
                continue
            seen.add(n)
            full = re.sub(r"\s+", " ", s.get("description", ""))
            items.append('<div class="item" data-q="%s"><h3 id="%s">%s</h3><p>%s</p><details><summary>Full description</summary><p>%s</p></details></div>' % (
                html.escape((n + " " + full).lower(), quote=True), n, n, html.escape(short(s.get("description", ""))), html.escape(full)))
        secs.append("<h2>%s</h2>%s" % (html.escape(title), "".join(items)))
    for n in by:
        if n not in seen:
            errors.append("skill has no group in build_docs.py: " + n)
    body = """
<h1>Skills (%d)</h1>
<p class="lede">Methods you invoke by name. Each one is a folder with a SKILL.md, loaded only when needed so it costs nothing until used.</p>
<p>Every skill below is listed with what it does and when it runs. Skills adapted from other authors keep their licences and credits in the repository's notices file.</p>
<input class="filter" id="q" type="search" placeholder="Filter skills" aria-label="Filter skills">
<div id="list">%s</div>
<script>
(function(){var q=document.getElementById('q');q.addEventListener('input',function(){var v=q.value.toLowerCase();
document.querySelectorAll('#list .item').forEach(function(e){e.style.display=e.getAttribute('data-q').indexOf(v)>-1?'':'none';});});})();
</script>
%s""" % (len(skills), "".join(secs), book_block())
    page("skills.html", "Skills", body, "Every Operator OS skill: methods for planning, memory, compliance, building, voice and integrations, with what each one is for.")


def build_hooks(reg):
    scripts_dir = os.path.join(PLUGIN, "hooks")
    present = {f for f in os.listdir(scripts_dir) if f.endswith(".sh")} | {"token-budget.sh"}
    registered = {r["script"] for r in reg}
    for s in sorted(registered | set(OPTIONAL_HOOKS)):
        if s not in HOOK_WHY:
            errors.append("hook has no 'why' line in build_docs.py: " + s)
    for s in registered:
        if s not in present:
            errors.append("hooks.json registers a missing script: " + s)
    secs = []
    for ev in EVENT_ORDER:
        rows = [r for r in reg if r["event"] == ev]
        if not rows:
            continue
        trs = "".join("<tr><td><code>%s</code></td><td>%s</td><td>%s</td></tr>" % (
            r["script"], html.escape(r["matcher"] or "all"), html.escape(HOOK_WHY.get(r["script"], ""))) for r in rows)
        secs.append('<h2>%s</h2><div class="tablewrap"><table class="stack"><thead><tr><th>Hook</th><th>On</th><th>Why it exists</th></tr></thead><tbody>%s</tbody></table></div>' % (EVENT_LABEL[ev], trs))
    opt = "".join("<tr><td><code>%s</code></td><td>%s</td></tr>" % (s, html.escape(HOOK_WHY[s])) for s in OPTIONAL_HOOKS)
    body = """
<h1>Hooks (%d registered)</h1>
<p class="lede">Anything that must happen is a hook, not an instruction. A rule in a prose file can be talked around; a hook that exits non-zero cannot.</p>
<p>Each hook below names the failure it prevents. Hooks that depend on a service you have not configured print one "not configured" line instead of failing. Hooks that block do so with the rule quoted back, so the assistant learns why.</p>
%s
<h2>Shipped but not registered</h2>
<p>Opt in from your own settings.</p>
<div class="tablewrap"><table class="stack"><thead><tr><th>Hook</th><th>Why it is optional</th></tr></thead><tbody>%s</tbody></table></div>
%s""" % (len(reg), "".join(secs), opt, book_block())
    page("hooks.html", "Hooks", body, "Every enforcement hook in Operator OS and the failure each one prevents.")


def build_vault():
    body = """
<h1>The vault method</h1>
<p class="lede">A folder of plain markdown that remembers what you decided, so the assistant does not ask you the same question twice and you never lose a hard-won rule to a closed session.</p>
<h2>The layout</h2>
<div class="tablewrap"><table><thead><tr><th>Folder</th><th>Holds</th></tr></thead><tbody>
<tr><td><code>00-BOARD</code></td><td>the status record: board, north star, queue, one card per piece of work</td></tr>
<tr><td><code>10-PROJECTS</code></td><td>work with an end</td></tr>
<tr><td><code>20-AREAS</code></td><td>responsibilities that never end</td></tr>
<tr><td><code>30-KNOWLEDGE</code></td><td>what you learned: concepts, references, people</td></tr>
<tr><td><code>40-SOPS</code></td><td>how someone else runs it, in three parts: by hand, what the assistant does, what is being built</td></tr>
<tr><td><code>90-ARCHIVE</code></td><td>retired notes</td></tr>
<tr><td><code>raw/</code></td><td>sources exactly as they arrived, never edited</td></tr>
<tr><td><code>MEMORY.md</code></td><td>the index: one line per note, small enough to load into every session</td></tr>
</tbody></table></div>
<h2>The contract that keeps it searchable</h2>
<ul>
<li>Every note has a <code>description</code> (one declarative sentence) and a <code>type</code> (feedback, project, reference, user, learning, source or sop).</li>
<li>Titles are sentences a person would say. A hard rule is a title that states the rule.</li>
<li>Every note is linked from the index or a folder map. A note nobody links to does not exist.</li>
<li>A fact that goes stale carries a <code>refresh_due</code> date.</li>
<li>A count carries how it was counted.</li>
</ul>
<h2>The loop</h2>
<ol class="steps">
<li><strong>Capture the moment.</strong> The distill skill pulls corrections, decisions and diagnosed bugs out of the conversation as they happen, not at the end of a long session.</li>
<li><strong>Keep the source.</strong> The raw excerpt goes in <code>raw/</code>; the note cites it. A note without provenance is an opinion.</li>
<li><strong>Recall before work.</strong> Hooks search the vault on each prompt and on each delegation, so a delegated agent starts with the rules you already ruled.</li>
<li><strong>Lint.</strong> A deterministic script checks the index size, broken links, orphans, frontmatter, duplicate names and stale dates. Zero broken and zero orphans is the bar.</li>
</ol>
<h2>The tools</h2>
<p>Search (keyword ranking, with an optional reranker), lint, reachability, rename with link rewriting, frontmatter refactor, commit, push-and-verify to another machine, and index expiry. All in the plugin's scripts folder, all standard-library Python.</p>
<h2 id="example">The example vault</h2>
<p>The repository carries a fictional company, Harbor and Pine Home Services: about two dozen notes plus the index, log and schema, showing the method in motion. Follow one rule from its raw source to the note that states it to the card that records its effect. Every company, person and number in it is invented. It passes its own lint with zero warnings.</p>
<p><a class="btn" href="%(repo)s/tree/main/examples/example-vault">Open the example vault</a> <a class="btn alt" href="%(repo)s/tree/main/starter-vault">Open the starter vault</a></p>
%(book)s
""" % {"repo": REPO_URL, "book": book_block()}
    page("vault.html", "The vault method", body, "The vault method: folders, frontmatter contract, capture and recall loop, with a starter and a fictional example.")


def build_review():
    body = """
<h1>The review loop</h1>
<p class="lede">The seat that builds never grades its own work. A different seat checks it, the check is bounded, and a halt is a valid ending. That is how a number gets trusted.</p>
<h2>Writer is not verifier</h2>
<p>Reading back what you just wrote is not verification; it shares every blind spot of the writer. So the harness separates the seats. Junior and builder seats produce. Senior and reviewer seats are read-only: they cannot edit, so they cannot quietly fix what they should have sent back.</p>
<h2>Three verdicts</h2>
<div class="grid">
<div class="card"><h3>Pass</h3><p>The work meets the spec and every check reproduced.</p></div>
<div class="card"><h3>Pass with conditions</h3><p>It can proceed; the named conditions must be closed.</p></div>
<div class="card"><h3>Block</h3><p>It goes back down with the failing items named. The reviewer never edits the work.</p></div>
</div>
<h2>The accuracy hierarchy</h2>
<p>For anything that produces a number someone will act on, three levels, each gated by the one above:</p>
<ol class="steps">
<li><strong>Research.</strong> Pulls and proves the inputs: control totals present, no empty window, schema unchanged. It never computes the result.</li>
<li><strong>Report.</strong> Computes from proven inputs only, then recomputes one figure a second way and shows both.</li>
<li><strong>Senior.</strong> Ties out from a different pull than the one the writer used and signs the day. Only this seat may call work done.</li>
</ol>
<p>A matrix of named checks is the artifact that says "done": every row passes, or the work is incomplete. Nothing rounds to done.</p>
<h2>Bounded, and loud at the end</h2>
<p>The loop has a stopping rule, not a clean-round target. Three rounds, then it halts and reports with the matrix attached. A halt is a valid exit. A widened tolerance, a dropped check or "close enough" is not.</p>
<h2>Before the build: plan convergence</h2>
<p>For a high-stakes plan, the plan-convergence skill dispatches two or three independent reviewers in parallel, each through a different lens (feasibility, risk, completeness). Only high-severity findings block. The plan is revised and re-reviewed until no high-severity finding is open or three rounds are spent. If the cap hits with findings open, they are reported to you, not shipped.</p>
<h2>Checkers sample, builders fix</h2>
<p>The strongest tier is spent on checking, not on building. A checker spot-checks, sends defects back to the builder seat, and does not redo the build. The maximum-effort setting is reserved for authentication, payments, consent, migrations and platform writes.</p>
<p>See the agents that fill these seats on <a href="agents.html">the agents page</a>, and the loop applied in <a href="case-studies.html">the case studies</a>.</p>
%s""" % book_block()
    page("review-loop.html", "The review loop", body, "How Operator OS separates builders from checkers, with verdicts, a bounded loop and a halt that is a valid ending.")


def build_cases(root):
    cases = []
    ex = os.path.join(ROOT, "docs", "examples")
    for d in sorted(os.listdir(ex)):
        p = os.path.join(ex, d)
        if not os.path.isdir(p):
            continue
        spec = open(os.path.join(p, "spec.md"), encoding="utf8").read()
        plan = open(os.path.join(p, "plan-and-tasks.md"), encoding="utf8").read()
        title = re.sub(r"\s*\(case study.*$", "", re.match(r"#\s+(.*)", spec).group(1))
        pm = re.search(r"## (?:The problem in one paragraph|What is wrong)\s+(.*?)\n\n", spec, re.S)
        problem = pm.group(1).strip() if pm else ""
        cases.append((d, title, problem, spec, plan))
    rules = {"01-harness-autonomy": "One approval per goal, keyed on the tool's invocation, not on words in a command.",
             "02-api-rate-governor": "One registry and one gate in front of every vendor call, budgets set well under the vendor's number.",
             "03-loud-failure": "Every failure path ends in an error, a visible refusal or an alert row; every wait has a deadline.",
             "04-retrieval-trust": "A knowledge ladder and the loud miss: a search that finds nothing says so.",
             "05-version-control-and-ci": "A trunk, tagged releases, and two seats that keep it current and green.",
             "06-vault-naming": "Rename for a human, with a checkpoint, aliases, rewritten links and an automatic rollback gate.",
             "07-self-healing": "Deterministic remedies bound to health signals, each with preconditions, a lock, a verify and a reversal."}
    cards = []
    for d, title, problem, spec, plan in cases:
        fn = "case-%s.html" % d
        words = re.sub(r"\s+", " ", problem).split(" ")
        excerpt = " ".join(words[:40]) + ("..." if len(words) > 40 else "")
        cards.append('<div class="card"><h2><a href="%s">%s</a></h2><p><strong>The rule it produced:</strong> %s</p><p class="excerpt">%s</p><p><a href="%s">Read the kit</a></p></div>' % (
            fn, html.escape(title.replace(" (case study: Harbor & Pine Home Services)", "")), html.escape(rules.get(d, "")), inline(excerpt), fn))
        body = """
<p><a href="case-studies.html">All case studies</a></p>
<h1>%s</h1>
<p class="lede">A worked example. Every company, person and number in it is invented; the failure pattern and the rule it produced are real.</p>
<h2>Spec</h2>%s
<h2>Plan and tasks</h2>%s
%s""" % (html.escape(title), md(spec.split("\n", 1)[1]), md(plan.split("\n", 1)[1] if plan.startswith("#") else plan), book_block())
        page(fn, title, body, short(problem, 155) or title)
        if d not in rules:
            errors.append("case study has no rule line in build_docs.py: " + d)
    body = """
<h1>Case studies (%d)</h1>
<p class="lede">Seven spec kits, rewritten around an invented company so you can see how the harness's own rules were produced and what a good kit looks like.</p>
<p>The company is fictional: Harbor and Pine Home Services, forty employees, two metro areas, a small call center, a CRM, three ad platforms and an owner who runs the business with AI agents. How to read a kit: start with the problem paragraph, skim the stories, then read the requirements and the success criteria. Every story has an independent test and every failure path has a named end.</p>
<div class="grid g2">%s</div>
%s""" % (len(cases), "".join(cards), book_block())
    page("case-studies.html", "Case studies", body, "Seven worked spec kits about autonomy, rate governance, loud failure, retrieval trust, version control, vault naming and self-healing.")
    return len(cases)


def build_story():
    items = "".join('<h2 class="sub">%s</h2><p>%s</p>' % (html.escape(a), html.escape(b)) for a, b in STORY)
    body = """
<h1>How it was built</h1>
<p class="lede">Operator OS was not designed on a whiteboard. Each part exists because something went wrong, and the fix was written down as a rule and then enforced in code.</p>
<p>The pattern was always the same. Something failed in real use. The first fix was an instruction. The instruction was ignored once, so it became a hook. The hook needed a way to prove it worked, so it got a test that plants the violation. The lesson went into the vault so the next session started knowing it.</p>
%s
<h2>What the pattern taught</h2>
<ul>
<li><strong>Hooks beat instructions.</strong> Anything that must happen is enforced by code that exits non-zero.</li>
<li><strong>Fork the work.</strong> Complex jobs run in isolated agent contexts so one failure does not poison the main thread.</li>
<li><strong>Numbers need a basis.</strong> Agents get a count and how it was counted, not a feeling.</li>
<li><strong>Plan once on a strong model, execute on cheap ones, check by sampling.</strong> The tier of each seat is written in its definition, not decided per task.</li>
</ul>
<p>The <a href="case-studies.html">case studies</a> carry those lessons, retold around an invented company with invented numbers, so nothing real travels with them.</p>
%s""" % (items, book_block())
    page("how-it-was-built.html", "How it was built", body, "How Operator OS grew from real failures into enforced rules.")


# ---------------------------------------------------------------- tutorials

def see(body, label="What you should see"):
    return '<div class="see"><b class="lbl">%s</b>%s</div>' % (label, body)


def fig(src, alt, cap):
    return '<figure><img class="shot" src="assets/screens/%s" alt="%s" loading="lazy"><figcaption>%s</figcaption></figure>' % (
        src, html.escape(alt, quote=True), html.escape(cap))


TUTORIALS = [
    ("tutorial-install.html", "Install in two minutes", "Two minutes", "Add the plugin and see the status line that proves it loaded.",
     """
<p class="lede">By the end you have Operator OS loaded in a project and one status line telling you which parts are configured. Nothing else is required to start.</p>
<h2>Before you start</h2>
<p>You need Claude Code, <code>jq</code> and <code>python3</code>. Check all three:</p>
<pre><code>claude --version
jq --version
python3 --version</code></pre>
""" + see("<p>Three version numbers. If <code>jq</code> says <em>command not found</em>, install it (on a Mac: <code>brew install jq</code>). Without it the plugin still loads, but each hook skips itself and says so.</p>") + """
<h2>Step 1. Add the plugin</h2>
%(installcmd)s
""" + see("<p>Two confirmations: the marketplace was added, then <code>operator-os</code> was installed. Run <code>claude plugin list</code> and <code>operator-os</code> is in the list.</p>") + """
<h2>Step 2. Open a project and check the status line</h2>
<p>Go to any project folder and start Claude Code:</p>
<pre><code>cd ~/my-business-project
claude</code></pre>
<p>Then ask it, in your own words, what the status line says. The status line is handed to the assistant when the session starts, so asking is the reliable check:</p>
<pre><code>What does the operator-os status line say?</code></pre>
""" + see("<p>An answer that starts with <code>operator-os status:</code>. It names each optional part and says <em>ok</em> or <em>not configured</em>, with the one thing to do about it. You can also see it in the session transcript view. When you have a constitution file, a longer <code>STARTUP:</code> block comes first and the status line follows it.</p><pre><code>operator-os status: jq=ok python3=ok git=ok | vault: not configured (no folder at ...; run /operator-os:init-vault) | vault remote: not configured (...) | local model lane: not configured (...) | rules: not installed (run /operator-os:install-rules)</code></pre><p>That is the design: a missing piece says so once, in plain words, instead of failing later.</p>") + """
<h2>Step 3. Install the rules</h2>
<p>A plugin cannot ship rule files, so one skill copies them into your project. Type this in the session:</p>
<pre><code>/operator-os:install-rules</code></pre>
""" + see("<p>Eighteen lines beginning <code>copied:</code>, then <code>install-rules: 18 copied, 0 skipped.</code> The files now sit in <code>.claude/rules/</code> and load on the next session. Run it twice and the second run says <code>0 copied, 18 skipped</code>: it never overwrites your edits.</p>") + """
<h2>Step 4. Confirm</h2>
<p>Quit, start Claude Code again, and ask the same question: <em>What does the operator-os status line say?</em> The answer now ends with <code>rules: installed</code>.</p>
<h2>If something is off</h2>
<ul>
<li><strong>No status line in the answer.</strong> Run <code>claude plugin list</code>. If <code>operator-os</code> is missing, repeat step 1.</li>
<li><strong>Every hook says "jq not installed".</strong> Install <code>jq</code>, restart.</li>
</ul>
<p>Next: <a href="tutorial-vault.html">set up the starter vault</a>.</p>
"""),
    ("tutorial-vault.html", "Set up the starter vault", "Ten minutes", "Create the memory folder, capture one rule from a real correction, and find it again.",
     """
<p class="lede">The vault is plain markdown that the assistant reads at the start of every session. By the end you have one, with a first rule captured from something you corrected, and you have found it again by search.</p>
<h2>Step 1. Create it</h2>
<p>The starter vault, the example vault and the search and lint scripts live in the repository, not in your project, so start by cloning it. Keep it anywhere; you only need it for this tutorial.</p>
<pre><code>git clone https://github.com/ndnstyl/GTM-growth
cd GTM-growth</code></pre>
<p>Then either copy the full starter (all folders and templates) or let the plugin make a minimal one.</p>
<pre><code>cp -R starter-vault ~/operator-vault
export OPERATOR_VAULT=~/operator-vault</code></pre>
<p>Or, inside a session, <code>/operator-os:init-vault</code>, then run <code>export OPERATOR_VAULT=&lt;the path init-vault printed&gt;</code> in the shell you will use for steps 2 and 4, because the lint and search commands read that variable. Add the <code>export</code> line to your shell profile so it sticks.</p>
""" + see("<p>With <code>init-vault</code> you get four lines beginning <code>created:</code> (<code>MEMORY.md</code>, <code>log.md</code>, <code>_WIKI-SCHEMA.md</code>, a learning template) and <code>init-vault: vault ready at ...</code>. With the copy, <code>ls ~/operator-vault</code> shows <code>00-BOARD</code>, <code>10-PROJECTS</code>, <code>20-AREAS</code>, <code>30-KNOWLEDGE</code>, <code>40-SOPS</code>, <code>90-ARCHIVE</code>, <code>raw</code>, <code>templates</code> and the index <code>MEMORY.md</code>.</p>") + """
<h2>Step 2. Check it is healthy</h2>
<pre><code>python3 plugins/operator-os/scripts/memory/vault-lint.py</code></pre>
""" + see("<p>A short report ending in zeros for links into 90-ARCHIVE and ambiguous archive links, and <code>Read-only run; nothing was modified.</code> (A line for stub notes appears only once the vault holds notes.) Lint only reads. It never rewrites a note.</p>") + """
<h2>Step 3. Capture a rule from a real correction</h2>
<p>The next time you correct the assistant, say so in a sentence, then run:</p>
<pre><code>/operator-os:distill</code></pre>
<p>Open Claude Code in your own project (it finds the vault through <code>OPERATOR_VAULT</code>, wherever you are) and try a made-up correction: <em>"When you report weekly spend, always say how it was counted."</em> The skill writes the exact words into <code>raw/</code>, writes one note whose title is a sentence, and files a hook line for it in the folder's map.</p>
""" + see("<p>A new file in <code>raw/</code> with your words, one new note in <code>30-KNOWLEDGE/</code> that cites it as <code>[[raw/...]]</code>, and a hook line for it in the folder's <code>_map.md</code>. A line in <code>MEMORY.md</code> appears only when the rule must load before any search runs.</p>") + """
<h2>Step 4. Find it again</h2>
<p>Back in the <code>GTM-growth</code> folder:</p>
<pre><code>python3 plugins/operator-os/scripts/memory/vault-search.py "weekly spend counted" --snippets</code></pre>
""" + see("<p>A ranked list with the new note first and a short snippet under each result. A search that finds nothing prints <code>0 results (honest no-hit, try different terms or grep)</code>, never an empty page. That sentence is deliberate: silence would read as proof of absence.</p>") + """
<h2>Step 5. Read a vault that has been used</h2>
<p>The <a href="%(repo)s/tree/main/examples/example-vault">example vault</a> is a fictional home-services company. From the <code>GTM-growth</code> folder, point at it and search:</p>
<pre><code>OPERATOR_VAULT=examples/example-vault python3 plugins/operator-os/scripts/memory/vault-search.py "weekly cap spend" --snippets</code></pre>
""" + see("<p>The rule <em>Ad Spend Over the Weekly Cap Needs the Owner's Yes</em> first, then the raw excerpt it came from, then the campaign card that cites it, with the related pause rule further down. That chain, source to rule to consequence, is the whole method.</p>") + """
<p>Next: <a href="tutorial-review-loop.html">run the builder and reviewer loop</a>.</p>
"""),
    ("tutorial-review-loop.html", "Run the builder and reviewer loop", "Fifteen minutes", "Build a small change with one seat, check it with another, and send defects back.",
     """
<p class="lede">The seat that builds never grades its own work. By the end you have run one real change through a builder and a read-only reviewer, and you know how the loop ends.</p>
<h2>Before you start</h2>
<p>Use a real task in a project that has a test or a build command: a validation rule, a small report script, a copy fix. Start from a clean tree so the change is easy to undo:</p>
<pre><code>git status</code></pre>
""" + see("<p><code>nothing to commit, working tree clean</code>. If it is not clean, commit your own work first, by explicit file names, so the loop's change stands alone.</p>") + """
<h2>Step 1. Ask the builder</h2>
<p>State the outcome, the file, and how you will know it works.</p>
<pre><code>Use the implementer agent to add a check to src/signup.js that rejects an empty
phone number with a clear message. Run the tests when done and report what changed.</code></pre>
""" + see("<p>The implementer reads the file, edits it, runs your tests, and reports a short list: files changed, tests run, result. It runs on a mid-tier model at medium effort by design: scoped edits do not need deep thinking.</p>") + """
<h2>Step 2. Ask a different seat to check it</h2>
<pre><code>Use the reviewer agent to review the diff from git diff. Rank findings by severity,
with file and line and a one-sentence fix for each. End with one verdict: Pass,
Pass with conditions, or Block.</code></pre>
""" + see("<p>Findings ranked worst first, each as <em>file:line, then one sentence</em>. No preamble and no restating the diff. If you open <code>plugins/operator-os/agents/reviewer.md</code> you will see why it cannot quietly fix things: <code>Write</code> and <code>Edit</code> are listed under <code>disallowedTools</code>. It runs at the highest effort because checking is where the strong model is spent.</p>") + """
<h2>Step 3. Read the verdict</h2>
<p>A review ends in one of three words.</p>
<div class="tablewrap"><table><thead><tr><th>Verdict</th><th>What happens next</th></tr></thead><tbody>
<tr><td>Pass</td><td>Merge it.</td></tr>
<tr><td>Pass with conditions</td><td>Proceed once the named conditions are closed.</td></tr>
<tr><td>Block</td><td>It goes back to the builder with the failing items named.</td></tr>
</tbody></table></div>
<h2>Step 4. Send defects back down</h2>
<pre><code>Use the implementer agent to fix only these findings: 1 and 2. Do not change anything else.
Then run the tests again.</code></pre>
<p>Then ask the reviewer again. Each pass is a round.</p>
""" + see("<p>The second review has fewer findings, and none of the ones you fixed. If the reviewer finds new problems in code you did not touch, that is the loop working: a fresh pair of eyes.</p>") + """
<h2>Step 5. Know when to stop</h2>
<p>The loop has a stopping rule, not a clean-round target. <strong>Three rounds, then halt.</strong> If findings are still open after round three, stop, and read the matrix of what passed and what did not. A halt is a valid ending. Widening the tolerance, dropping a check or calling it close enough is not.</p>
<h2>Why this shape</h2>
<p>Reading back what you just wrote shares every blind spot of the writer. A reviewer that cannot edit has to send the work back, which is what makes the check real. See <a href="review-loop.html">the review loop</a> for the three-level accuracy hierarchy used when the output is a number someone will act on.</p>
<p>Next: <a href="tutorial-hook.html">add a hook that blocks a mistake</a>.</p>
"""),
    ("tutorial-hook.html", "Add a hook that blocks a mistake", "Ten minutes", "Write a small hook, wire it in, test it by planting the mistake.",
     """
<p class="lede">A rule written as prose can be talked around. A hook cannot. By the end you have a hook that refuses to let the assistant edit your price list, a test that proves it, and the habit that goes with both.</p>
<h2>How a hook works in one paragraph</h2>
<p>Before a tool runs, Claude Code hands your script a JSON description of the call on standard input. Exit <code>0</code> and the call goes ahead. Exit <code>2</code> and the call is blocked, and whatever you printed to standard error is sent back to the assistant so it can change course. The plugin ships many of these; see <a href="hooks.html">every hook and why it exists</a>. This one covers something only you know: which file is yours.</p>
<h2>Step 1. Write the hook</h2>
<pre><code>mkdir -p .claude/hooks
cat &gt; .claude/hooks/protect-price-list.sh &lt;&lt;'EOF'
#!/bin/bash
command -v jq &gt;/dev/null 2&gt;&amp;1 || { echo "protect-price-list: jq not installed, hook skipped" &gt;&amp;2; exit 0; }
path=$(jq -r '.tool_input.file_path // empty')
case "$path" in
  */pricing/price-list.csv)
    echo "BLOCKED: the price list is the owner's to change. Stage the proposed change in pricing/proposed-changes.md and stop." &gt;&amp;2
    exit 2 ;;
esac
exit 0
EOF
chmod +x .claude/hooks/protect-price-list.sh</code></pre>
<p>Notice what the message does: it says what was refused, why, and what to do instead. A bare "denied" teaches the assistant nothing.</p>
<h2>Step 2. Wire it in</h2>
<p>Put this in <code>.claude/settings.json</code> in your project (merge it if the file exists):</p>
<pre><code>{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\\"$CLAUDE_PROJECT_DIR\\"/.claude/hooks/protect-price-list.sh", "timeout": 5 }
        ]
      }
    ]
  }
}</code></pre>
<h2>Step 3. Test it by planting the mistake</h2>
<p>A hook you have not seen fail is a hook you do not know works. Write a test that feeds it a violation and a harmless call:</p>
<pre><code>cat &gt; .claude/hooks/test-protect-price-list.sh &lt;&lt;'EOF'
#!/bin/bash
here="$(cd "$(dirname "$0")" &amp;&amp; pwd)"
bad='{"tool_name":"Edit","tool_input":{"file_path":"/work/pricing/price-list.csv"}}'
ok='{"tool_name":"Edit","tool_input":{"file_path":"/work/notes/today.md"}}'
echo "$bad" | "$here/protect-price-list.sh" 2&gt;/dev/null; [ $? -eq 2 ] || { echo "FAIL: violation was not blocked"; exit 1; }
echo "$ok"  | "$here/protect-price-list.sh" 2&gt;/dev/null; [ $? -eq 0 ] || { echo "FAIL: harmless edit was blocked"; exit 1; }
echo "PASS: blocks the price list, allows everything else"
EOF
chmod +x .claude/hooks/test-protect-price-list.sh
.claude/hooks/test-protect-price-list.sh</code></pre>
""" + see("<pre><code>PASS: blocks the price list, allows everything else</code></pre><p>Feed it the bad call by hand to see the message the assistant will get:</p><pre><code>echo '{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/work/pricing/price-list.csv\"}}' | .claude/hooks/protect-price-list.sh; echo \"exit $?\"\nBLOCKED: the price list is the owner's to change. Stage the proposed change in pricing/proposed-changes.md and stop.\nexit 2</code></pre>") + """
<h2>Step 4. Try it for real</h2>
<p>Start a session and ask: <em>"Raise every price in pricing/price-list.csv by 5 percent."</em></p>
""" + see("<p>The edit does not happen. The assistant reports the blocked message and writes its proposal to <code>pricing/proposed-changes.md</code> instead. The decision stays with you, and the refusal is in the audit trail.</p>") + """
<h2>The three habits</h2>
<ul>
<li><strong>Fail loud.</strong> If a dependency such as <code>jq</code> is missing, say so on standard error. Never skip in silence.</li>
<li><strong>Tell the assistant what to do instead.</strong> The message is the whole interface.</li>
<li><strong>Plant the violation.</strong> Every hook gets a test that proves it blocks the thing it exists to block.</li>
</ul>
<p>For more patterns, read the shipped ones in <code>plugins/operator-os/hooks/</code>, each with a header that says why it exists, and the <a href="hooks.html">hooks page</a>.</p>
<p>Next: <a href="architecture.html">see how the pieces fit</a>, or <a href="#book">talk to me about wiring this to your own numbers</a>.</p>
"""),
]


def build_tutorials():
    cards = []
    for fname, title, mins, blurb, _ in TUTORIALS:
        cards.append('<div class="card"><h2><a href="%s">%s</a></h2><p>%s</p><span class="tag">%s</span></div>' % (
            fname, html.escape(title), html.escape(blurb), html.escape(mins)))
    body = """
<h1>Tutorials</h1>
<p class="lede">Four short walk-throughs. Each has the exact commands and tells you what you should see, so you know it worked before you move on.</p>
<p>Fastest first win: install, then the hook tutorial; about ten minutes together.</p>
<div class="grid g2">%s</div>
%s""" % ("".join(cards), book_block())
    page("tutorials.html", "Tutorials", body, "Four tutorials: install in two minutes, set up the starter vault, run the builder and reviewer loop, add a hook that blocks a mistake.")
    for i, (fname, title, mins, blurb, content) in enumerate(TUTORIALS):
        content = content.replace("%(repo)s", REPO_URL).replace("%(installcmd)s", cmdblock(INSTALL_CMD, "install-cmd-t"))
        body = '<p class="eyebrow">Tutorial %d of %d &middot; %s</p><h1>%s</h1>%s%s' % (
            i + 1, len(TUTORIALS), html.escape(mins), html.escape(title), content, book_block())
        page(fname, title, body, blurb)


def write_extras():
    pages = sorted(set(SITEMAP))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += ["<url><loc>%s</loc></url>" % u for u in pages] + ["</urlset>"]
    open(os.path.join(OUT, "sitemap.xml"), "w").write("\n".join(sm) + "\n")
    bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]
    rb = "User-agent: *\nAllow: /\n\n" + "".join("User-agent: %s\nAllow: /\n\n" % b for b in bots) + "Sitemap: %ssitemap.xml\n" % PAGES_URL
    open(os.path.join(OUT, "robots.txt"), "w").write(rb)
    lines = ["# Operator OS", "", "> " + ONE_LINER, ""]
    for fname, t in NAV:
        lines.append("- [%s](%s%s)" % (t, PAGES_URL, "" if fname == "index.html" else fname))
    lines += ["", "Source: " + REPO_URL, ""]
    open(os.path.join(OUT, "llms.txt"), "w").write("\n".join(lines))
    nf = ('<h1>That page is not here</h1><p class="lede">Try the <a href="%s">home page</a>, the '
          '<a href="%sinstall.html">install steps</a> or the <a href="%stutorials.html">tutorials</a>.</p>' % (PAGES_URL, PAGES_URL, PAGES_URL))
    keep = list(SITEMAP)
    page("404.html", "Page not found", nf, "This page does not exist. Go to the Operator OS home page, install steps or tutorials.")
    SITEMAP[:] = keep


def main():
    agents, skills, reg = load_agents(), load_skills(), load_hooks()
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, "assets"), exist_ok=True)
    for f in ("architecture.svg", "architecture-mobile.svg"):
        shutil.copyfile(os.path.join(ASSETS, f), os.path.join(OUT, "assets", f))
    for wf in ("walkthrough.mp4",):
        if os.path.isfile(os.path.join(ASSETS, wf)):
            shutil.copyfile(os.path.join(ASSETS, wf), os.path.join(OUT, "assets", wf))
    shots = os.path.join(ASSETS, "screens")
    if os.path.isdir(shots):
        shutil.copytree(shots, os.path.join(OUT, "assets", "screens"), dirs_exist_ok=True)
    fonts = os.path.join(ASSETS, "fonts")
    shutil.copytree(fonts, os.path.join(OUT, "assets", "fonts"), ignore=shutil.ignore_patterns("*.css"))
    fonts_css = open(os.path.join(fonts, "fonts.css"), encoding="utf8").read()
    open(os.path.join(OUT, "style.css"), "w").write(fonts_css + CSS.strip() + "\n")
    packs = len([f for f in os.listdir(os.path.join(PLUGIN, "systems")) if f.endswith(".yaml") and f != "registry.yaml"])
    C = {"agents": len(agents), "skills": len(skills), "hooks": len(reg), "rules": count_files("rules", ".md"), "packs": packs}
    build_agents(agents)
    build_skills(skills)
    build_hooks(reg)
    C["cases"] = build_cases(ROOT)
    build_home(C)
    build_architecture(C)
    build_install(C)
    build_vault()
    build_review()
    build_story()
    build_tutorials()
    write_extras()
    if errors:
        for e in errors:
            sys.stderr.write("build_docs: ERROR " + e + "\n")
        sys.exit(1)
    print("build_docs: wrote %d pages to %s (%s)" % (len([f for f in os.listdir(OUT) if f.endswith(".html")]), OUT, C))


if __name__ == "__main__":
    main()
