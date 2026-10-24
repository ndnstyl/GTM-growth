"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { QrCode, Download, Plus } from "lucide-react";
import { PageFrame, Card, Chip, Loading } from "@/components/apps/ui";
import { useFixture } from "@/lib/demo/useFixture";
import { lsGet, lsSet } from "@/lib/demo/base";

type Row = { id: string; name: string; url: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_content?: string; created: string; scans_30d: number; market: string; status: "live" | "paused" };
type Reg = { rows: Row[]; sources: string[]; mediums: string[] };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function buildUrl(base: string, p: { source: string; medium: string; campaign: string; content: string }): string | null {
  try {
    const u = new URL(base);
    if (p.source) u.searchParams.set("utm_source", slug(p.source));
    if (p.medium) u.searchParams.set("utm_medium", slug(p.medium));
    if (p.campaign) u.searchParams.set("utm_campaign", slug(p.campaign));
    if (p.content) u.searchParams.set("utm_content", slug(p.content));
    return u.toString();
  } catch {
    return null;
  }
}

function qrSvg(text: string, size = 220): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 8);
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${((c + 4) * cell).toFixed(2)} ${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0b0c1a"/></svg>`;
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function QrPage() {
  const reg = useFixture<Reg>("/demo/qr/registry.json");
  const [form, setForm] = useState({ name: "", base: "https://example.com/offer", source: "", medium: "", campaign: "", content: "", market: "" });
  const [mine, setMine] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the visitor's saved rows once after mount; reading storage during render would break hydration.
  useEffect(() => { setMine(lsGet<Row[]>("qr-mine", [])); }, []);

  const url = useMemo(() => buildUrl(form.base, form), [form]);
  const svg = useMemo(() => (url ? qrSvg(url) : null), [url]);
  const rows = [...mine, ...(reg.data?.rows ?? [])].filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const sources = reg.data?.sources ?? ["flyer", "direct-mail", "yard-sign", "event", "tv"];
  const mediums = reg.data?.mediums ?? ["print", "offline", "qr"];
  const ready = !!url && form.name.trim().length > 1 && !!form.source && !!form.medium && !!form.campaign;

  const register = () => {
    if (!ready || !url) return;
    const row: Row = { id: "mine-" + Date.now().toString(36), name: form.name.trim(), url, utm_source: slug(form.source), utm_medium: slug(form.medium), utm_campaign: slug(form.campaign), utm_content: slug(form.content), created: new Date().toISOString().slice(0, 10), scans_30d: 0, market: form.market || "all", status: "live" };
    const next = [row, ...mine];
    setMine(next);
    lsSet("qr-mine", next);
    setNote(`Registered "${row.name}". Saved in this browser only.`);
  };

  const downloadPng = () => {
    if (!svg) return;
    const img = new Image();
    const blobUrl = URL.createObjectURL(new Blob([qrSvg(url!, 1024)], { type: "image/svg+xml" }));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1024;
      c.getContext("2d")!.drawImage(img, 0, 0, 1024, 1024);
      c.toBlob((b) => { if (b) download(`${slug(form.name) || "qr"}.png`, b); URL.revokeObjectURL(blobUrl); });
    };
    img.src = blobUrl;
  };

  const field = (label: string, key: keyof typeof form, ph = "") => (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      {label}
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] font-normal text-foreground" />
    </label>
  );
  const pick = (label: string, key: "source" | "medium", opts: string[]) => (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      {label}
      <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] font-normal text-foreground">
        <option value="">Choose...</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <PageFrame title="QR & tracked URLs" subtitle="Build a tracked link and a print-ready QR, and register it, in one step." actions={<QrCode size={18} className="text-primary" />}>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card title="Build">
          <div className="grid gap-3 md:grid-cols-2">
            {field("Name", "name", "Fall mailer, driveway")}
            {field("Destination", "base", "https://example.com/offer")}
            {pick("Source", "source", sources)}
            {pick("Medium", "medium", mediums)}
            {field("Campaign", "campaign", "fall-driveway")}
            {field("Content (optional)", "content", "postcard-a")}
            {field("Market (optional)", "market", "Harborview")}
          </div>
          <div className="mt-3 break-all rounded-md bg-secondary px-3 py-2 font-mono text-[11px]">{url ?? "Enter a full destination URL, including https://"}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={register} disabled={!ready} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground disabled:opacity-40"><Plus size={13} /> Register</button>
            <button onClick={() => svg && download(`${slug(form.name) || "qr"}.svg`, new Blob([qrSvg(url!, 1024)], { type: "image/svg+xml" }))} disabled={!svg} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"><Download size={13} /> SVG</button>
            <button onClick={downloadPng} disabled={!svg} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"><Download size={13} /> PNG</button>
          </div>
          {note ? <p role="status" className="mt-2 text-[12px] text-[var(--good)]">{note}</p> : null}
        </Card>
        <Card title="Preview">
          {svg ? <div className="mx-auto w-[220px] overflow-hidden rounded-lg bg-white p-0" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="text-[12px] text-muted-foreground">The QR appears when the destination is a valid URL.</p>}
        </Card>
      </div>

      <Card title="Registry" right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter registry" className="w-40 rounded-md border border-border bg-background px-2 py-1 text-[11.5px]" />}>
        {reg.loading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Name</th><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Medium</th><th className="py-1 pr-3">Campaign</th><th className="py-1 pr-3">Market</th><th className="py-1 pr-3 text-right">Scans 30d</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Created</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="max-w-[240px] truncate py-1.5 pr-3 font-medium" title={r.url}>{r.name}</td>
                    <td className="py-1.5 pr-3">{r.utm_source}</td><td className="py-1.5 pr-3">{r.utm_medium}</td><td className="py-1.5 pr-3">{r.utm_campaign}</td><td className="py-1.5 pr-3">{r.market}</td>
                    <td className="tick py-1.5 pr-3 text-right font-semibold">{r.scans_30d.toLocaleString()}</td>
                    <td className="py-1.5 pr-3"><Chip tone={r.status === "live" ? "text-[var(--good)]" : "text-muted-foreground"}>{r.status}</Chip></td>
                    <td className="tick py-1.5 pr-3 text-muted-foreground">{r.created}</td>
                  </tr>
                ))}
                {rows.length === 0 ? <tr><td colSpan={8} className="py-3 text-muted-foreground">No rows match.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageFrame>
  );
}
