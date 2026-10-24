import React, { useRef, useState } from "react";
import { Expander } from "./Primitives";
import { cx } from "./lib/cx";
import type { GtmHomeData, Kind } from "./types";

type Tab = "stack" | Kind;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "stack", label: "The whole stack" },
  { id: "agent", label: "Agents" },
  { id: "playbook", label: "Playbooks" },
  { id: "loop", label: "Loops" },
  { id: "automation", label: "Automations" },
];
const PLURAL: Record<Kind, string> = { agent: "agents", playbook: "playbooks", loop: "loops", automation: "automations" };
const two = (n: number) => String(n + 1).padStart(2, "0");

/**
 * The stack by kind of system, rendered as real text in the page's theme (no image, so it follows light and dark,
 * reads aloud, and cannot 404). Each stage lists up to three systems of the chosen kind and how many more.
 */
export default function StackMap({ data }: { data: GtmHomeData }) {
  const [tab, setTab] = useState<Tab>("stack");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (i: number) => {
    const n = (i + TABS.length) % TABS.length;
    setTab(TABS[n].id);
    refs.current[n]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 };
    if (e.key in map) {
      e.preventDefault();
      select(map[e.key]);
    }
  };

  const caption = (t: Tab) => (t === "stack" ? "No garage queens: every one of these is built and running, in whole or in part." : data.kinds[t]);

  return (
    <>
      <Expander id="g-xp-stack" closedLabel="See the stack by kind of system" toggleClassName="g-xtoggle--lone" lazy>
        <div className="g-tabs" role="tablist" aria-label="Kinds of system">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`g-t-${t.id}`}
              aria-controls={`g-p-${t.id}`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className="g-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {TABS.map((t) => (
          <div key={t.id} role="tabpanel" id={`g-p-${t.id}`} aria-labelledby={`g-t-${t.id}`} className="g-tabpanel" hidden={tab !== t.id}>
            <p className="g-tabcap g-muted">{caption(t.id)}</p>
            <ol className="g-map">
              {data.stages.map((s, i) => {
                const items = t.id === "stack" ? s.items : s.items.filter((x) => x.kind === t.id);
                const shown = items.slice(0, 3);
                const rest = items.length - shown.length;
                const mix = (Object.keys(data.kinds) as Kind[])
                  .map((k) => [k, s.items.filter((x) => x.kind === k).length] as const)
                  .filter(([, n]) => n > 0);
                return (
                  <li key={s.name} className={cx("g-map-card", items.length === 0 && "is-empty")}>
                    <div className="g-map-top">
                      <span className="g-num">{two(i)}</span>
                      <h3>{s.name}</h3>
                    </div>
                    {t.id === "stack" ? (
                      <p className="g-map-mix">{mix.map(([k, n]) => `${n} ${n === 1 ? k : PLURAL[k]}`).join(", ")}</p>
                    ) : null}
                    {items.length ? (
                      <ul>
                        {shown.map((x) => (
                          <li key={x.name}>{x.name}</li>
                        ))}
                        {rest > 0 ? <li className="g-map-more">+{rest} more</li> : null}
                      </ul>
                    ) : (
                      <p className="g-map-none">No {t.id === "stack" ? "systems" : PLURAL[t.id]} in this stage.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </Expander>
    </>
  );
}
