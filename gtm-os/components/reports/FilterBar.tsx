"use client";

export type DatePreset =
  | "yesterday"
  | "wtd"
  | "mtd"
  | "last7"
  | "last28"
  | "mom"
  | "ytd";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "wtd", label: "Week to date" },
  { key: "mtd", label: "Month to date" },
  { key: "last7", label: "Last 7 days" },
  { key: "last28", label: "Last 28 days" },
  { key: "mom", label: "Month over month" },
  { key: "ytd", label: "Year to date" },
];

export type FilterState = {
  preset: DatePreset;
  company?: string;
  market?: string;
  platform?: string;
  channel?: string;
  source?: string;
};

export function FilterBar({
  value,
  onChange,
  options,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  options: Partial<Record<"company" | "market" | "platform" | "channel" | "source", string[]>>;
}) {
  const dims: { key: keyof FilterState; label: string }[] = [
    { key: "company", label: "Company" },
    { key: "market", label: "Market" },
    { key: "platform", label: "Platform" },
    { key: "channel", label: "Channel" },
    { key: "source", label: "Source" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-1 rounded-md bg-secondary p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange({ ...value, preset: p.key })}
            aria-pressed={value.preset === p.key}
            className={
              "rounded px-2.5 py-1.5 text-[12px] font-medium " +
              (value.preset === p.key
                ? "bg-primary text-primary-foreground"
                : "text-[var(--ink2)] hover:text-foreground")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        {dims.map(({ key, label }) => {
          const opts = options[key as keyof typeof options];
          if (!opts || opts.length === 0) return null;
          return (
            <select
              key={key}
              value={(value[key] as string) ?? ""}
              onChange={(e) =>
                onChange({ ...value, [key]: e.target.value || undefined })
              }
              aria-label={label}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
            >
              <option value="">{label}: all</option>
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          );
        })}
      </div>
    </div>
  );
}
