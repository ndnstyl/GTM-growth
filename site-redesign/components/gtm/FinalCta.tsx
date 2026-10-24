import React, { useEffect, useRef } from "react";
import { Reveal } from "./Primitives";
import { MagButton } from "./Hero";
import { Arrow } from "./Icons";
import { useDialogs } from "./Dialogs";
import { useInView } from "./lib/useReveal";

export default function FinalCta() {
  const dialogs = useDialogs();
  const panel = useInView<HTMLDivElement>("0px");
  const shine = useRef<HTMLElement | null>(null);

  // the one shimmer on the page plays once when the headline arrives, then holds
  useEffect(() => {
    const el = shine.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting) return;
        el.classList.add("go");
        io.disconnect();
      },
      { threshold: 0.8 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="g-final" aria-labelledby="g-final-h">
      <div className="g-wrap">
        <div className="g-panel g-dotgrid" ref={panel}>
          <div className="g-ring" />
          <div className="g-ring g-ring--2" />
          <span className="g-label">Fractional CAIO and CTO</span>
          <Reveal as="h2" id="g-final-h" className="g-final-h">
            Somewhere in your <span className="g-nb">go-to-market</span>, <em className="g-accent g-shiny" ref={shine}>money is leaking.</em>
          </Reveal>
          <p className="g-lede g-lede--center">One call. I put your go-to-market on the lift and name the first build.</p>
          <div className="g-cta-row">
            <MagButton primary bracket onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
              Book a 30-minute call <Arrow />
            </MagButton>
          </div>
        </div>
      </div>
    </section>
  );
}
