import React from "react";
import { Reveal, Expander, TiltCard } from "./Primitives";
import { useDialogs } from "./Dialogs";
import { useStats } from "./lib/stats";
import { SceneRoadmap, SceneLayers, SceneFolders } from "./SceneArt";

interface Svc {
  id: string;
  label: string;
  title: string;
  lead: string;
  scene: React.ReactNode;
  groups: Array<{ h: string; items: string[] }>;
}

const makeServices = (w: string): Svc[] => [
  {
    id: "caio",
    label: "Fractional",
    title: "Chief AI Officer",
    lead: "The owner of your AI strategy for growth: what to automate and what to leave alone, with the number that says it paid.",
    scene: <SceneRoadmap />,
    groups: [
      {
        h: "What is included",
        items: [
          "An AI roadmap tied to pipeline and revenue",
          "Decisions on which go-to-market work to automate first",
          "Rules for how AI is used with lead and customer data",
          "Training and runbooks so your team runs it",
        ],
      },
      { h: "How it runs", items: ["A standing read of the numbers and a short decision log", "Every AI system gets an owner, a check and an alarm"] },
      { h: "Outcomes", items: ["AI spend that ties to results", "Fewer tools bought on hope", "A team that can run what is built"] },
    ],
  },
  {
    id: "cto",
    label: "Fractional",
    title: "Chief Technology Officer",
    lead: "The technical owner of your go-to-market stack, so the data is trusted and nothing fails quietly.",
    scene: <SceneLayers />,
    groups: [
      {
        h: "What is included",
        items: [
          "Architecture for your CRM, tracking and data flow",
          "Tool and vendor decisions with the cost made plain",
          "Reliability: alarms, stall checks, data gates and a daily census of every job",
          "Custody of lead data and the consent record",
        ],
      },
      { h: "How it runs", items: ["A live view of what is healthy and what is not", "Changes shipped small and written down"] },
      { h: "Outcomes", items: ["Numbers that tie from ad to CRM", "No dependence on one builder", "Failures that announce themselves"] },
    ],
  },
  {
    id: "build",
    label: "Scoped",
    title: "GTM systems build",
    lead: `Pick the leakiest of the ${w} stages below and have them built and handed over running.`,
    scene: <SceneFolders />,
    groups: [
      {
        h: "What is included",
        items: [`A map of your ${w} stages and where money leaks`, "The highest-leak systems built first", "A written runbook and a team walkthrough"],
      },
      { h: "How it runs", items: ["Map, prove the data, build, hand over", "Each system runs on a schedule with alarms"] },
      { h: "Outcomes", items: ["Spend proven before it reaches the CRM", "Every lead answered and routed", "One screen for the numbers"] },
    ],
  },
];

export default function Services() {
  const dialogs = useDialogs();
  const { stageWord } = useStats();
  const SERVICES = makeServices(stageWord);
  return (
    <section id="services" className="g-section" tabIndex={-1} aria-labelledby="g-services-h">
      <div className="g-wrap">
        <Reveal className="g-sec-head">
          <span className="g-label">Services</span>
          <h2 id="g-services-h">
            One owner for the AI and tech behind <em className="g-accent">your growth.</em>
          </h2>
          <p className="g-lede">Two ways to have me on the hook for your go-to-market technology, and a scoped build when you need the systems first.</p>
        </Reveal>
        <div className="g-svc">
          {SERVICES.map((s, i) => (
            <Reveal key={s.id} i={i} className="g-svc-cell">
              <TiltCard className="g-svc-card" id={`g-svc-${s.id}`}>
                <div className="g-scene g-dotgrid" aria-hidden="true">
                  {s.scene}
                </div>
                <span className="g-label">{s.label}</span>
                <h3>{s.title}</h3>
                <p className="g-muted">{s.lead}</p>
                <Expander id={`g-xp-${s.id}`} closedLabel="See what is included" toggleClassName="g-xtoggle--end">
                  {s.groups.map((g) => (
                    <div key={g.h}>
                      <h4>{g.h}</h4>
                      <ul>
                        {g.items.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <button type="button" className="g-btn g-btn--primary" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
                    Book a Call
                  </button>
                </Expander>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
