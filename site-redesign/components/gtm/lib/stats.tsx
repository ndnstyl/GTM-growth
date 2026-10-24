import React, { createContext, useContext, useMemo } from "react";
import type { GtmHomeData, Kind } from "../types";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export interface Stats {
  total: number;
  stages: number;
  /** "ten", from the data */
  stageWord: string;
  /** "Ten" */
  StageWord: string;
  kinds: Record<Kind, number>;
}

export function computeStats(data: GtmHomeData): Stats {
  const kinds = { agent: 0, playbook: 0, loop: 0, automation: 0 } as Record<Kind, number>;
  let total = 0;
  data.stages.forEach((s) =>
    s.items.forEach((i) => {
      kinds[i.kind] += 1;
      total += 1;
    }),
  );
  const n = data.stages.length;
  const w = WORDS[n] ?? String(n);
  return { total, stages: n, stageWord: w, StageWord: w.charAt(0).toUpperCase() + w.slice(1), kinds };
}

const Ctx = createContext<Stats | null>(null);

/** Every count and number-word on the page is read from here, which is read from the data file. */
export function StatsProvider({ data, children }: { data: GtmHomeData; children: React.ReactNode }) {
  const stats = useMemo(() => computeStats(data), [data]);
  return <Ctx.Provider value={stats}>{children}</Ctx.Provider>;
}

export function useStats(): Stats {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStats needs <StatsProvider> above it");
  return s;
}
