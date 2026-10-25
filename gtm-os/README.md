# GTM OS

A go-to-market operating system you can click through: the live demo at
[theinnovativenative.com/gtm-os](https://theinnovativenative.com/gtm-os/brain/), built as a static Next.js export.
Everything runs in the browser on synthetic data for a fictional company, Larkspur Home Services.

## What is in it

| Area | What a visitor sees |
|---|---|
| Second Brain | Every agent, skill, hook and note in [Operator OS](../README.md) as one radial map: orbit it, search it, open any file and read it. Built from this repository's own public content. |
| Command | The cockpit: key numbers, the one priority, ten stage cards, ask-the-data, calendar and loops. |
| Content Studio | Real reels with players, carousels and stat cards, the scripts behind them, the idea backlog and the crew stages. |
| Paid Media | Spend, clicks and campaigns by platform, plus QR codes and tracked URLs. |
| Capture & Speed | Lead capture, consent operations and speed to lead. |
| Sales Floor | Dials, connects, sets and coaching. |
| Attribution & BI | Funnel, cost against revenue, the marketing cost target and a pivot workbench, computed in the browser with DuckDB-WASM. |
| AI Ops | Health, runs and the AI seats that hold routine work. |

## Build

- `npm install`, then `npm run build` writes the static site to `out/`, served under `/gtm-os/`.
- `scripts/build-brain.mjs` builds the Second Brain from the repository root (Operator OS and the playbook folders).
- `scripts/build-studio.mjs` keeps the committed Content Studio data unless content engine sources are configured.
- Machine-specific paths, if any, go in an uncommitted `build.local.json` or environment variables; none are in the code.
- Every `/api/*` call is answered by the demo adapter in `lib/demo/`. The page makes no requests to other sites.

The Second Brain view is adapted from Rubric Second Brain by Jay E, RoboNuggets, under CC BY 4.0
(licence text in `public/brain-engine/LICENSE.txt`).
