"use client";

// A synthetic live feed for the demo cockpit. Nothing here is data: it is a seeded script that makes
// the cockpit read as a feed, "arriving" on a gentle cadence. It only advances while the demo is on
// screen (useActiveInterval), never under reduced motion, and the same story plays on every visit.

import { useSyncExternalStore } from "react";
import { seeded } from "./index";

export type LiveEvent = { id: number; kind: "lead" | "appointment" | "consent" | "run" | "spend"; text: string; lead: boolean };

const SOURCES = ["Paid search", "Paid social", "Website form", "Referral", "Direct mail", "Events"];
const RUNS = ["Weekly report", "Spend sync", "Call SWOT", "Script set", "Consent check"];

const BASE_LEADS = 38;
let n = 0;
let leads = BASE_LEADS;
let current: LiveEvent | null = null;
let previous: LiveEvent | null = null;
const rand = seeded(20261024);
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

function nextEvent(): LiveEvent {
  const r = rand();
  const id = ++n;
  if (r < 0.46) return { id, kind: "lead", lead: true, text: `New lead · ${SOURCES[Math.floor(rand() * SOURCES.length)]}` };
  if (r < 0.64) return { id, kind: "appointment", lead: false, text: "Appointment set · Sales floor" };
  if (r < 0.78) return { id, kind: "consent", lead: false, text: "Consent logged · Capture" };
  if (r < 0.9) return { id, kind: "spend", lead: false, text: "Spend synced · Paid media" };
  return { id, kind: "run", lead: false, text: `Run finished · ${RUNS[Math.floor(rand() * RUNS.length)]}` };
}

/** Advance the script by one event. Called by the ticker on its gentle cadence. */
export function advanceLive(): void {
  previous = current;
  current = nextEvent();
  if (current.lead) leads += 1;
  emit();
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export const useLiveLeads = (): number => useSyncExternalStore(subscribe, () => leads, () => BASE_LEADS);
export const useLiveEvent = (): LiveEvent | null => useSyncExternalStore(subscribe, () => current, () => null);
export const useLivePrev = (): LiveEvent | null => useSyncExternalStore(subscribe, () => previous, () => null);
