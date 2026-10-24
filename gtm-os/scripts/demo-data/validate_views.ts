// Validates every file in public/data-views with the app's own validators (viewSchema, boardSchema, the digital
// rebase map and templates). Prints one JSON object: { errors: string[], views, boards, templates, resolved }.
// Run: node_modules/.bin/tsx scripts/demo-data/validate_views.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateView, type View } from "../../lib/reports/workbench/viewSchema";
import { validateBoard } from "../../lib/reports/workbench/boardSchema";
import { checkRebaseMap, resolveTemplate, type RebaseMap, type DigitalTemplate } from "../../lib/reports/digital/rebase";
import { PICKER_METRICS } from "../../lib/reports/digital/picker";

const root = join(__dirname, "..", "..", "public", "data-views");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const errors: string[] = [];
const views: View[] = [];

for (const id of read("index.json") as string[]) {
  const r = validateView(read(`${id}.json`));
  if (r.ok) views.push(r.view);
  else errors.push(`view ${id}: ${r.errors.join("; ")}`);
}
const boardIds = read("boards-index.json") as string[];
for (const id of boardIds) {
  const r = validateBoard(read(`${id}.json`), views);
  if (!r.ok) errors.push(`board ${id}: ${r.errors.join("; ")}`);
}
const map = read("digital/rebase_map.json") as RebaseMap;
for (const e of checkRebaseMap(map)) errors.push(`rebase map: ${e}`);
const tIds = read("digital/index.json") as string[];
let resolved = 0;
for (const tid of tIds) {
  const t = read(`digital/${tid}.json`) as DigitalTemplate;
  for (const m of PICKER_METRICS) {
    const r = resolveTemplate(t, m.key, map);
    if (r.kind === "invalid") errors.push(`digital template ${tid} x ${m.key}: ${r.errors.join("; ")}`);
    else resolved++;
  }
}
console.log(JSON.stringify({ errors, views: views.length, boards: boardIds.length, templates: tIds.length, resolved }));
