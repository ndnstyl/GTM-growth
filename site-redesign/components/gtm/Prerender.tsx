import React from "react";
import { FEATURES } from "./Featured";
import type { GtmHomeData } from "./types";

/**
 * Every word that a visitor reaches only by opening something (a stage dialog, a feature dialog, a case dialog, the
 * booking sheet) is also present in the page's HTML at build time, here, so a crawler or an answer engine that never
 * clicks still reads all of it. It is the same text the dialogs show, visually hidden and aria-hidden so a screen reader
 * hears each thing once, through the dialog. It uses paragraphs and strong text, never headings, so the page's heading
 * tree stays the one a visitor sees.
 */
export default function Prerender({ data }: { data: GtmHomeData }) {
  return (
    <div className="g-prerender" aria-hidden="true">
      {data.stages.map((s) => (
        <section key={s.name}>
          <p>
            <strong>{s.name}</strong> {s.outcome}
          </p>
          <ul>
            {s.items.map((i) => (
              <li key={i.name}>
                {i.name} ({i.kind}): {i.outcome}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {FEATURES.map((f) => (
        <section key={f.id}>
          <p>
            <strong>{f.title}</strong> {f.dialog}
          </p>
          <ul>
            {f.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
      {data.cases.map((c) => (
        <section key={c.id}>
          <p>
            <strong>{c.title}</strong> ({c.tag}). {c.metric}: {c.a} to {c.b} {c.unit}.
          </p>
          <p>The challenge: {c.challenge}</p>
          <p>The system built: {c.built}</p>
          <ul>
            {c.result.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <p>
          <strong>Book a call.</strong> Thirty minutes on your go-to-market. Pick a time on the calendar, in a new tab or loaded on this page.
        </p>
      </section>
    </div>
  );
}
