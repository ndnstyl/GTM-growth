"use client";

import { Timer } from "lucide-react";
import { Panel } from "./Panel";
import { useMounted } from "@/lib/motion";
import { RoutinesFeed, Job } from "@/lib/feeds";

type Status = "FIRED" | "NEXT" | "QUEUED" | "ON" | "LOOP" | "FAIL" | "STALE";
type RoutineRow = { time: string; name: string; status: Status; mins: number; title?: string };

// How old this snapshot may be before a red badge is downgraded to STALE.
// An always-on job is healthy when SOMETHING is answering on its port, whether
// or not the scheduler is the one holding the process. 2026-08-24: the nightly job read
// FAIL for weeks while port 11434 was listening the whole time, because
// local model.app owns that port and the scheduler therefore held no pid. "the scheduler has no
// pid" and "the service is down" are different claims. A panel that reports the
// first as the second trains everyone to ignore it, which is exactly what makes
// the next real outage invisible.
function serviceUp(job: Job, feed: RoutinesFeed): boolean | null {
  if (job.pid) return true;
  const port = job.serves_port;
  if (port == null) return null;
  const svc = feed.services?.find((s) => s.port === port);
  return svc ? svc.listening : null;
}

const clock12 = (h: string, m: string) => `${(parseInt(h) % 12) || 12}:${m} ${parseInt(h) >= 12 ? "PM" : "AM"}`;

function deriveRows(feed: RoutinesFeed, mounted: boolean): RoutineRow[] {
  // The prerender has no demo clock; until mount use the demo day's morning (where the shifted clock starts), so
  // the first paint and hydration agree and no row changes after mount.
  const now = new Date();
  const nowM = mounted ? now.getHours() * 60 + now.getMinutes() : 9 * 60;
  const rows: RoutineRow[] = [];

  for (const j of feed.jobs) {
    const name = j.label.replace(/^com\.[a-z]+\./, "");
    if (j.schedule === "always on") {
      const up = serviceUp(j, feed);
      if (up === true) {
        rows.push({
          time: "",
          name,
          status: "ON",
          mins: 9999,
          title: j.pid
            ? "Running"
            : "Answering, run by another process",
        });
      } else if (up === false) {
        rows.push({ time: "", name, status: "FAIL", mins: -1, title: "Not answering" });
      } else {
        // No pid and no port to check. Cannot prove up, cannot prove down , 
        // never silently green.
        rows.push({ time: "", name, status: "FAIL", mins: -1, title: "Cannot tell whether it is running" });
      }
      continue;
    }
    if (j.last_exit && j.last_exit !== 0) {
      rows.push({
        time: "",
        name,
        status: "FAIL",
        mins: -1,
        title: `Last run failed (exit code ${j.last_exit})`,
      });
      continue;
    }
    if ((j as { late?: boolean }).late) { rows.push({ time: j.schedule.match(/(\d{2}):(\d{2})/) ? clock12(...(j.schedule.match(/(\d{2}):(\d{2})/) as RegExpMatchArray).slice(1, 3) as [string, string]) : "", name, status: "STALE", mins: 9996, title: "Has not fired in two days: a platform credential is waiting on its quarterly rotation" }); continue; }
    if (j.schedule.startsWith("every")) { rows.push({ time: j.schedule.replace("every ", ""), name, status: "LOOP", mins: 9998 }); continue; }
    const m = j.schedule.match(/(\d{2}):(\d{2})/);
    if (!m) { rows.push({ time: "", name, status: "QUEUED", mins: 9997 }); continue; }
    const t = parseInt(m[1]) * 60 + parseInt(m[2]);
    rows.push({ time: clock12(m[1], m[2]), name, status: t <= nowM ? "FIRED" : "QUEUED", mins: t });
  }

  const upcoming = rows.filter((r) => r.status === "QUEUED" && r.mins < 1440).sort((a, b) => a.mins - b.mins)[0];
  if (upcoming) upcoming.status = "NEXT";
  // the ruling 2026-08-28: green/healthy at the top, red at the bottom
  // (was FAIL-first). ON > NEXT > QUEUED > LOOP > FIRED > STALE > FAIL.
  const rank = (s: Status) =>
    s === "ON" ? 0 : s === "NEXT" ? 1 : s === "QUEUED" ? 2 : s === "LOOP" ? 3 : s === "FIRED" ? 4 : s === "STALE" ? 5 : 6;
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || a.mins - b.mins);
}

const STATUS_STYLE: Record<Status, string> = {
  FAIL: "bg-[var(--crit)]/15 text-[var(--crit)] font-bold",
  STALE: "text-[var(--ink2)]",
  NEXT: "bg-primary text-primary-foreground font-bold",
  FIRED: "text-[var(--ink2)]",
  QUEUED: "text-[var(--ink2)]",
  ON: "text-[var(--good)]",
  LOOP: "text-[var(--ink2)]",
};
const STATUS_WORD: Record<Status, string> = { FAIL: "Failed", STALE: "Late", NEXT: "Next", FIRED: "Ran", QUEUED: "Later", ON: "Up", LOOP: "Repeats" };

export function Routines({ routines }: { routines: RoutinesFeed | null }) {
  const mounted = useMounted();
  if (!routines)
    return (
      <Panel icon={<Timer size={13} />} title="Loops">
        <div className="py-1 text-[13px] text-muted-foreground">The loop list is unavailable right now.</div>
      </Panel>
    );
  const rows = deriveRows(routines, mounted);
  const fired = rows.filter((r) => r.status === "FIRED").length;
    const scanned = "demo snapshot";
  return (
    <Panel
      icon={<Timer size={13} />}
      title="Loops"
      // Sizing is now weight-driven instead of a
      // hardcoded flex-1; the default weight lives in DEFAULT_WEIGHTS.
      action={<span title={routines.built_at ?? undefined}>{fired} of {rows.length} ran today · {scanned}</span>}
    >
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="g-fade border-b border-border/70 last:border-b-0" style={{ ["--i" as string]: Math.min(i, 12) }}>
              <td className="tick w-[64px] py-[5px] pr-2 text-muted-foreground">{r.time}</td>
              <td className="max-w-0 truncate py-[5px] pr-2 font-medium" title={r.title}>{r.name}</td>
              <td className="w-[72px] py-[5px] text-right">
                <span
                  title={r.title}
                  className={`rounded px-1.5 py-[1px] text-[11px] ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_WORD[r.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
