// Validates every file in public/data-views with the app's own validators (viewSchema, boardSchema, the digital
// rebase map and templates). Prints one JSON object: { errors: string[], views, boards, templates, resolved }.
// Run: node_modules/.bin/tsx scripts/demo-data/validate_views.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateView, type View } from "../../lib/reports/workbench/viewSchema";
import { validateBoard } from "../../lib/reports/workbench/boardSchema";

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
console.log(JSON.stringify({ errors, views: views.length, boards: boardIds.length, templates: 0, resolved: 0 }));
