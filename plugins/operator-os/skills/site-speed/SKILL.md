---
name: site-speed
description: >
  The Site Performance executor. Audits and speeds up a built site (Next.js static export or
  dynamic) on each ship: Core Web Vitals via Lighthouse, large-file/waterfall detection, image
  compression to AVIF/WebP, bundle analysis, minification and caching checks. Reports NUMBERS,
  applies the auto-safe fixes, and surfaces the UX/visual-risk fixes for review. Never sacrifices
  the look for a score. TRIGGERS: /site-speed, "speed up the site", "lighthouse audit", "find
  large files", "compress images", "analyze bundle", "why is this page slow", "run the ship gate".
---

# site-speed, the Site Performance skill

Measurement-first. Every recommendation carries the metric, the tool that detected it, the fix,
and whether it is auto-safe or needs review. The knowledge layer is modeled on
`addyosmani/web-quality-skills` (install once: `npx skills add addyosmani/web-quality-skills`);
this skill adds the measurement layer that one lacks, so we report numbers, not vibes.

## Modes

| Invocation | Coverage | When |
|---|---|---|
| `/site-speed quick [dir]` | The cheap mechanical gate: total JS/CSS weight, single-file/large-asset scan, unoptimized-image scan, minify check. ~10s, no browser. | EACH SHIP, before any deploy. Wraps a site-speed check script of your own. |
| `/site-speed audit <url>` | Full Lighthouse run on a live URL: LCP/INP/CLS, opportunities ranked by ms saved. | After a deploy, or on a live page. |
| `/site-speed` (full) | quick + a build-time bundle analysis + image audit + the prioritized fix plan. | Deep optimization pass. |

`dir` defaults to the obvious build output: `~/echo/web/out`, `projects/website/out`, or the cwd `out/`.

## Toolchain (the tools this skill actually runs)
1. `@lhci/cli` (lhci), Lighthouse CI for LCP/INP/CLS + budget assertions (the measurement backbone).
2. `sharp`, programmatic re-encode to AVIF/WebP + responsive variants (keep originals as fallback).
3. `@next/bundle-analyzer` (`ANALYZE=true next build`) + `source-map-explorer`, find which module owns which bytes.
4. `next-image-export-optimizer`, the static-export image fix (next/image is a no-op under output:export).
5. PageSpeed Insights API, real-user field CWV when lab data is not enough.
Install on demand with `npx` so nothing is added to the project's runtime deps.

## Execution steps

### Step 1: Locate + measure (always)
- Find the build output dir. If none, build first (`npm run build`) but NEVER `next build` while a `next dev` is running (shared .next; see project memory).
- Run `scripts/site-speed-check.sh <dir>` for the mechanical gate. It reports: total JS, total CSS, the largest assets, any single asset over budget, and unoptimized images. This is the per-ship number set.
- For `audit <url>`: `npx lhci collect --url=<url>` (or `npx lighthouse <url> --output=json --quiet`) and parse LCP/INP/CLS + the `network-requests`/`resource-summary` audits for the waterfall + large files.

### Step 2: Classify findings (auto-safe vs review)
AUTO-SAFE (apply, keep originals, re-verify): re-encode images to AVIF/WebP via `sharp`; add intrinsic width/height to `<img>` (kills CLS); verify prod minification; set `Cache-Control: public,max-age=31536000,immutable` on hashed `_next/static`; adopt `next/font` (self-host + subset + preload). 
NEEDS REVIEW (surface, do NOT auto-apply, UX/visual risk): any `loading="lazy"` decision (NEVER lazy-load the LCP/hero image); dynamic-importing GSAP/three.js/animation (timing risk); srcset/markup changes; INP/long-task JS refactors. Per `feedback_echo_immersion_system`, do not strip the immersion/3D layer to chase a score.

### Step 3: Apply + report
- Apply the auto-safe fixes, re-run Step 1, show the before/after numbers.
- Return a ranked plan for the review-needed items: each with metric, detected-by, fix, estimated ms/bytes saved.
- Targets (fail/alert): LCP < 2.5s (alert 2.0), INP <= 200ms, CLS <= 0.1, and the byte budgets in `reference_performance_budget`.
- The 3 highest-ROI checks on a Next.js static-export site: (1) image format + static-export optimization (next/image is a no-op, biggest LCP win), (2) LCP-image preload + no lazy-load on the hero, (3) bundle weight on GSAP/three.js routes (dynamic-import off the critical path).

## Each-ship integration
`/site-speed quick` (i.e. a site-speed check script of your own) is wired into `scripts/deploy-preflight.sh` so the target site is gated before every deploy, and should be run before any static-hosting deploy too. A blown HARD budget exits non-zero and blocks the ship; a soft-budget warning prints but does not block. Site speed is checked on EACH SHIP.

## Anti-patterns
- Do not report a "vibe" ("looks fast"). Every claim is a number from a tool.
- Do not auto-apply a review-needed fix. Lazy-loading the hero, dynamic-importing the 3D scene, or rewriting JS for INP can break the experience; surface, do not ship.
- Do not chase a Lighthouse 100 by deleting the brand/immersion layer. Speed serves UX; it does not replace it.
- Do not add runtime deps to the project; run tools via `npx`.
- Do not `next build` while `next dev` runs.

## Example
```
User: /site-speed quick ~/echo/web/out
Claude: [runs scripts/site-speed-check.sh ~/echo/web/out]
        JS total 1.21MB (budget 1.5MB OK) · CSS 88KB OK
        Largest: hero-orb.png 1.26MB  <- unoptimized PNG, not AVIF/WebP (FAIL)
        Auto-safe fix available: sharp re-encode hero-orb -> AVIF (~85% smaller), keep PNG fallback.
        1 hard finding. Apply the auto-safe re-encode? (y) ...
```
