---
name: bi-workbench
description: How data surfaces get built in a business operator's stack. The interactivity bar every reporting surface must clear (pivot, filter, drill, chart, saved views) and a browser-side wiring pattern (columnar files read by an in-browser SQL engine). USE BEFORE building or extending ANY report, dashboard, metric page or data view, before adding a data feed, and whenever a task says "report", "dashboard", "analytics", "slice", "pivot" or "make this interactive". A static page of rendered numbers FAILS review regardless of what the spec literally says.
---

# BI Workbench: interactive data surfaces

The ruling behind this skill: a rendered number you cannot interrogate is a screenshot, not business intelligence. A static executive page gets rejected the first time someone asks "what is in that number?" and nobody can answer.

## The bar (every reporting surface, no exceptions)

A surface is DONE only when the reader can, without an engineer:

1. **Pivot**: break any measure out by any dimension (rows by columns by measures).
2. **Filter and sort**: date presets and dimension filters on the same data.
3. **Drill**: from an aggregate to the rows behind it.
4. **Chart**: visualize the current slice.
5. **Save views**: name a slice and return to it.

Static cards are allowed ONLY as a summary layer sitting on top of an interactive surface, one click away from it. If a spec's requirements are satisfiable by a static page, the requirements are under-written: raise it, do not ship it.

## Reference stack (swap any part, keep the bar)

- **Engine:** an in-browser SQL engine such as DuckDB-WASM reading Parquet feeds, bundled with the app (zero CDN). Never a server round-trip for a slice.
- **Grids and tables:** a headless table library with grouping, expansion and virtualization (for example TanStack Table, MIT). Check before you buy: some grid products gate pivoting behind an enterprise licence. Confirm cross-tabs are in the edition you can afford before you start down that road.
- **Charts:** one chart library, exact-pinned, with its docs read from the installed package rather than a CDN.
- **Data honesty:** every number comes from the governed compute layer (views or metric functions in the warehouse) or a registered feed, never raw sensitive tiers and never hand entry. Honesty markers (a provisional band, platform presence, withheld-with-reason) TRAVEL WITH the data into every view. A zero where data is absent is a wrong number: render the reason.

## Wiring a new feed or view

Follow `references/feed-wiring.md`. The trap that costs the most time: **custom feeds are registered explicitly in code, never injected into a generated manifest.** The manifest builder regenerates that file and silently wipes injected entries.

Agents turn a plain-language request into a saved view using only the declared grammar. Follow `references/view-authoring.md`.

## Hard rules

1. Data flows: warehouse, then a governed export, then Parquet, then the in-browser engine, then the view. Editable grids write ONLY through named operator actions with a typed actor, never direct SQL from the browser.
2. The data tier that reaches a reporting app is capped (see the data-handling rule's tiers). The tier wall is upstream of this skill, not re-litigated in it.
3. Every derived measure declares its definition once (a measure expression in the source registry, or a warehouse metric function), never per-component copies. Two views must not be able to disagree.
4. Deploy through a script that runs the tests, and verify with a body-marker check, never a bare HTTP 200.
5. Scripted edits to any file assert their anchor before writing (`assert old in s`). An unasserted replace reports success while changing nothing.

## Review-gate rules

1. **Execute, never just read.** A reviewer gate on any data surface RUNS the generated SQL against the live feeds and checks the rendered claims row by row. Code-reading passes miss what execution catches.
2. **Probe the validator.** Hand every grammar or validator N instances it MUST refuse and count the acceptances.
3. **Exports are a second surface.** Enumerate every on-screen qualifier (filter state, month-to-date, withheld reasons, scoping title) and test the selector contract that carries them into the artifact. Verify with the produced file, not the code.
