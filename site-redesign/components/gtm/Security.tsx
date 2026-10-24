import React from "react";
import { Reveal } from "./Primitives";
import { Accent, SectionLabel } from "./TextFx";
import { useDialogs } from "./Dialogs";
import { MagButton } from "./Hero";

const D = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Large thin-line icons. Each path is drawn in (stroke-dash) once when its cell arrives; static under reduced motion. */
const ICONS: Record<string, React.ReactNode> = {
  private: (
    <>
      <rect x="10" y="22" width="28" height="20" rx="3" pathLength={1} />
      <path d="M16 22v-6a8 8 0 0116 0v6" pathLength={1} />
      <circle cx="24" cy="32" r="2.5" pathLength={1} />
    </>
  ),
  classified: (
    <>
      <path d="M8 14h32M8 24h32M8 34h32" pathLength={1} />
      <path d="M14 10v8M26 20v8M20 30v8" pathLength={1} />
    </>
  ),
  consent: (
    <>
      <path d="M12 6h18l8 8v28H12z" pathLength={1} />
      <path d="M30 6v8h8M17 24h14M17 30h9" pathLength={1} />
      <circle cx="33" cy="36" r="5" pathLength={1} />
      <path d="M30.5 36l2 2 3.5-4" pathLength={1} />
    </>
  ),
  health: (
    <>
      <path d="M4 26h10l4-12 7 22 5-14 3 4h11" pathLength={1} />
    </>
  ),
  meter: (
    <>
      <path d="M8 34a16 16 0 1132 0" pathLength={1} />
      <path d="M24 34l8-10" pathLength={1} />
      <circle cx="24" cy="34" r="2" pathLength={1} />
      <path d="M12 22l2 1.4M24 14v3M36 22l-2 1.4" pathLength={1} />
    </>
  ),
  approve: (
    <>
      <path d="M10 26l6 6 12-14" pathLength={1} />
      <rect x="6" y="8" width="36" height="32" rx="4" pathLength={1} />
      <path d="M32 8v6h10" pathLength={1} />
    </>
  ),
};

const CELLS: Array<{ id: keyof typeof ICONS; title: string; text: string }> = [
  { id: "private", title: "Private where it counts", text: "Recorded sales calls are transcribed and scored on private machines, and confidential data never goes into a consumer AI tool." },
  { id: "classified", title: "Classified before AI touches it", text: "A playbook decides which data may go to which AI tool, and anything untiered is handled as confidential." },
  { id: "consent", title: "A consent record you hold", text: "Consents and opt-outs are kept with their exact wording, sealed, reconciled every night and retrievable on request." },
  { id: "health", title: "Nothing fails quietly", text: "A second machine checks every scheduled job, and a failure stays red until it is fixed." },
  { id: "meter", title: "AI on a meter", text: "What each AI workload costs is metered, and unusual calls and chats are flagged for review every day." },
  { id: "approve", title: "Agents draft, a person decides", text: "AI seats recommend and stage changes. A person applies every live change." },
];

/** Security and control, by design: six plain statements of how the work is built. No certifications are claimed. */
export default function Security() {
  const dialogs = useDialogs();
  return (
    <section className="g-section g-secure" id="control" aria-labelledby="g-secure-h">
      <div className="g-wrap">
        <Reveal className="g-secure-head">
          <SectionLabel>Guardrails</SectionLabel>
          <h2 id="g-secure-h">
            Security and control, <Accent>by design.</Accent>
          </h2>
          <p className="g-lede g-lede--center">This is how I build, whatever the tool. Six rules, each one something the stack does today.</p>
          <p className="g-fineprint">AI compliance here means operating direction: the decisions that keep your systems inside the rules as the rules change. It is not legal counsel and not legal advice.</p>
        </Reveal>
        <ul className="g-secure-grid">
          {CELLS.map((c, i) => (
            <Reveal as="li" key={c.id} i={i % 3} className="g-secure-cell">
              <svg className="g-secure-ico" viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...D}>
                {ICONS[c.id]}
              </svg>
              <h3>{c.title}</h3>
              <p className="g-muted">{c.text}</p>
            </Reveal>
          ))}
        </ul>
        <div className="g-cta-row g-cta-row--after">
          <MagButton primary onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a Call
          </MagButton>
          <MagButton onClick={(e) => dialogs.open("gtmos", null, e.currentTarget)}>See the live demo</MagButton>
        </div>
      </div>
    </section>
  );
}
