import React from "react";
import { Reveal } from "./Primitives";
import { SectionLabel } from "./TextFx";
import { cx } from "./lib/cx";
import { MagButton } from "./Hero";
import { Arrow } from "./Icons";
import { useDialogs } from "./Dialogs";
import { useInView } from "./lib/useReveal";

const A = "Somewhere in your go-to-market,";
const B = "money is leaking.";

export default function FinalCta() {
  const dialogs = useDialogs();
  const panel = useInView<HTMLDivElement>("0px");
  return (
    <section className="g-final" id="contact" aria-labelledby="g-final-h">
      <div className="g-wrap">
        <div className="g-panel g-surface" ref={panel}>
          <div className="g-ring" />
          <div className="g-ring g-ring--2" />
          <SectionLabel>Fractional CAIO and CTO</SectionLabel>
          <Reveal as="h2" id="g-final-h" className={cx("g-final-h")}>
            {A} <em className="g-accent">{B}</em>
          </Reveal>
          <p className="g-lede g-lede--center">One call. I put your go-to-market on the lift and name the first build.</p>
          <div className="g-cta-row">
            <MagButton primary onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
              Book a 30-minute call <Arrow />
            </MagButton>
          </div>
        </div>
      </div>
    </section>
  );
}
