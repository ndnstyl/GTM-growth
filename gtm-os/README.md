# GTM OS

A go-to-market operating system as a static Next.js export. Eight areas (Command, Research & Offer, Content Studio, Paid Media,
Capture & Speed, Sales Floor, Attribution & BI, AI Ops) over ten go-to-market stages, all on synthetic data for a fictional
company.

- `npm run build` writes the static site to `out/`, served at `/gtm-os/`.
- Every `/api/*` call is answered by the demo adapter in `lib/demo/` (fixtures, timer-simulated runs, localStorage state).
- Fixture shapes are listed in `DEMO-CONTRACT.md`.
- The only network traffic is same-origin static files plus OpenFreeMap tiles on the map.
