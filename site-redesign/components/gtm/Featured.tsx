import { Accent, SectionLabel } from "./TextFx";
import React from "react";
import { Reveal, TiltCard } from "./Primitives";
import { useDialogs } from "./Dialogs";
import { SceneSeal, SceneCockpit } from "./SceneArt";
import { Arrow } from "./Icons";

export interface Feature {
  id: "consent" | "echo";
  label: string;
  title: string;
  card: string;
  dialog: string;
  points: string[];
  link: { href: string; label: string };
}

export const FEATURES: Feature[] = [
  {
    id: "consent",
    label: "Capture and consent",
    title: "The Outside Consent Register",
    card: "Consents recorded, sealed and reconciled every night, retrievable on request.",
    dialog: "Consents and opt-outs recorded with their exact wording, sealed, reconciled every night and retrievable on request.",
    points: [
      "Consents and opt-outs recorded with their exact wording",
      "Each entry sealed, so a change is never silent",
      "Reconciled against vendor records every night",
      "Any record retrievable on request",
    ],
    link: { href: "/guides/outside-consent-register", label: "Get the free field guide" },
  },
  {
    id: "echo",
    label: "Reporting cockpit",
    title: "ECHO OS",
    card: "The cockpit behind the GTM OS demo above. One screen that shows what needs you and answers from your own records, source attached.",
    dialog: "The AI cockpit I run a business from. GTM OS at the top of this page is its go-to-market demo on sample data.",
    points: [
      "Shows what needs you and answers from your own records, source attached",
      "Says plainly when it does not know",
      "Pivot, filter and drill into your own numbers",
    ],
    link: { href: "/echo-os", label: "Join early access" },
  },
];

export default function Featured() {
  const dialogs = useDialogs();
  return (
    <>
      <Reveal className="g-sub-head">
        <SectionLabel>Featured systems</SectionLabel>
        <h3 id="g-feat-h">
          Two you can <Accent>open today.</Accent>
        </h3>
      </Reveal>
      <div className="g-feat">
        {FEATURES.map((f, i) => (
          <Reveal key={f.id} i={i} className="g-feat-cell">
            <TiltCard className="g-featcard">
              <div className="g-scene g-dotgrid" aria-hidden="true">
                {f.id === "consent" ? <SceneSeal /> : <SceneCockpit />}
              </div>
              <span className="g-label">{f.label}</span>
              <h3 id={`g-ft-${f.id}`}>{f.title}</h3>
              <p className="g-muted">{f.card}</p>
              <button
                type="button"
                id={`g-fo-${f.id}`}
                className="g-more g-stretch"
                aria-haspopup="dialog"
                aria-labelledby={`g-fo-${f.id} g-ft-${f.id}`}
                onClick={(e) => dialogs.open("feat", { id: f.id }, e.currentTarget)}
              >
                Open <Arrow />
              </button>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </>
  );
}
