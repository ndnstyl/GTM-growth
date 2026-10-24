// One-click export of the current slice. The CSV opens
// with a header block that carries every on-screen qualifier: the period, the filters, the
// four clocks, the data-through date, the confidence, and every withheld cell's reason.
// A withheld cell carries its reason text in place of the value in the body too.

export const CLOCKS: readonly string[] = Object.freeze([
  "leads and sets count by lead entry date",
  "issues, demos and sales count by appointment date",
  "cancels count by contract month",
  "spend counts by spend date",
]);

export const ATTRIBUTION = "from our database";

export type SliceColumn = { key: string; label: string };

export type SliceExport = {
  title: string;
  period: string; // plain text, e.g. "2026-10 (month to date)"
  filters: Record<string, string | undefined>;
  metric?: string; // the picked metric's plain label, when the panel re-bases
  dataThrough: string;
  confidence: string;
  columns: SliceColumn[];
  // rendered cell text per row; a null cell is a withheld cell and must have a reason
  rows: Record<string, string | null>[];
  withheld: { where: string; reason: string }[];
  notes?: string[];
};

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildSliceCsv(x: SliceExport): string {
  const lines: string[] = [];
  lines.push(`# ${x.title}`);
  lines.push(`# period: ${x.period}`);
  const filters = Object.entries(x.filters).filter(([, v]) => v !== undefined && v !== "");
  lines.push(`# filters: ${filters.length ? filters.map(([k, v]) => `${k} = ${v}`).join("; ") : "none"}`);
  if (x.metric) lines.push(`# metric: ${x.metric}`);
  for (const c of CLOCKS) lines.push(`# clock: ${c}`);
  lines.push(`# data through: ${x.dataThrough}`);
  lines.push(`# confidence: ${x.confidence}`);
  if (x.withheld.length) {
    for (const w of x.withheld) lines.push(`# withheld: ${w.where}: ${w.reason}`);
  } else {
    lines.push("# withheld: none");
  }
  for (const n of x.notes ?? []) lines.push(`# note: ${n}`);
  lines.push(`# source: ${ATTRIBUTION}`);
  lines.push(x.columns.map((c) => csvCell(c.label)).join(","));
  for (const r of x.rows) {
    lines.push(
      x.columns
        .map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) {
            const w = x.withheld.find((h) => h.where.includes(c.label));
            return csvCell(w ? w.reason : "withheld: no value and no reason published (a defect, report it)");
          }
          return csvCell(String(v));
        })
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function csvFilename(stem: string, period: string): string {
  const safe = `${stem}-${period}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safe}.csv`;
}
