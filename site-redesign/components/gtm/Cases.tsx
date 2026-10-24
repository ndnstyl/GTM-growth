import React from "react";
import { Reveal, TiltCard, CountUp } from "./Primitives";
import { useDialogs } from "./Dialogs";
import { Arrow } from "./Icons";
import { Accent, SectionLabel } from "./TextFx";
import type { CaseStudy } from "./types";

const firstSentence = (t: string) => (t.match(/^[^.]+\./) || [t])[0];

export default function Cases({ cases }: { cases: CaseStudy[] }) {
  const dialogs = useDialogs();
  return (
    <section id="cases" className="g-section" tabIndex={-1} aria-labelledby="g-cases-h">
      <div className="g-wrap">
        <Reveal className="g-sec-head">
          <SectionLabel>Case studies</SectionLabel>
          <h2 id="g-cases-h">
            Four systems that stopped <Accent>guessing.</Accent>
          </h2>
          <p className="g-lede">Open a case for the challenge, what was built and the result.</p>
        </Reveal>
        <ul className="g-cases" role="list">
          {cases.map((c, i) => (
            <li key={c.id}>
              <Reveal i={i} className="g-case-cell">
                <TiltCard className="g-case">
                  <span className="g-tag">
                    {c.tag.split(" · ").map((part, k) => (
                      <span key={k} className="g-tag-part">
                        {part}
                      </span>
                    ))}
                  </span>
                  <span className="g-metric">
                    <b>
                      <CountUp to={c.a} />
                      {" to "}
                      <CountUp to={c.b} />
                    </b>
                    <i>{c.unit}</i>
                  </span>
                  <span className="g-mdesc g-muted">{c.metric}</span>
                  <h3 id={`g-cs-${c.id}`}>{c.title}</h3>
                  <p className="g-case-move">
                    <span className="g-micro">The move</span>
                    {firstSentence(c.built)}
                  </p>
                  <button
                    type="button"
                    id={`g-cm-${c.id}`}
                    className="g-more g-stretch"
                    aria-haspopup="dialog"
                    aria-labelledby={`g-cm-${c.id} g-cs-${c.id}`}
                    onClick={(e) => dialogs.open("case", { index: i }, e.currentTarget)}
                  >
                    Read the case <Arrow />
                  </button>
                </TiltCard>
              </Reveal>
            </li>
          ))}
        </ul>
        <p className="g-cases-note g-muted">
          All case studies are anonymized. Metrics are ranges or blended figures at the industry and system level. Anonymized artifacts can be shown on a call.
        </p>
      </div>
    </section>
  );
}
