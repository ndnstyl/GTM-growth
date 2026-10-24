import React, { useEffect, useRef } from "react";
import { BrandIcon, BRAND_NAMES, type BrandId } from "./BrandIcons";

type Node = { id: string; label: string; brand?: BrandId; glyph?: "n8n" | "crm" };

const INNER: Node[] = [
  { id: "claude", label: BRAND_NAMES.claude, brand: "claude" },
  { id: "n8n", label: "n8n", glyph: "n8n" },
  { id: "crm", label: "CRM", glyph: "crm" },
];
const OUTER: Node[] = [
  { id: "elevenlabs", label: BRAND_NAMES.elevenlabs, brand: "elevenlabs" },
  { id: "gmail", label: BRAND_NAMES.gmail, brand: "gmail" },
  { id: "linkedin", label: BRAND_NAMES.linkedin, brand: "linkedin" },
  { id: "facebook", label: BRAND_NAMES.facebook, brand: "facebook" },
  { id: "googleads", label: BRAND_NAMES.googleads, brand: "googleads" },
];

function Glyph({ kind }: { kind: "n8n" | "crm" }) {
  return kind === "n8n" ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="19" cy="6" r="2.4" />
      <circle cx="19" cy="18" r="2.4" />
      <path d="M7.2 11l9.6-4M7.2 13l9.6 4" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.6 2-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3" />
    </svg>
  );
}

function Ring({ nodes, cls, radius }: { nodes: Node[]; cls: string; radius: string }) {
  return (
    <div className={`g-orbit ${cls}`} style={{ ["--r" as string]: radius } as React.CSSProperties}>
      {nodes.map((n, i) => {
        const a = (360 / nodes.length) * i;
        return (
          <div key={n.id} className="g-orb-arm" style={{ ["--a" as string]: `${a}deg`, ["--k" as string]: i } as React.CSSProperties}>
            <span className="g-orb-line" />
            <span className="g-orb-pulse" />
            <span className="g-orb-node" title={n.label}>
              <span className="g-orb-ink">{n.brand ? <BrandIcon id={n.brand} size={20} /> : <Glyph kind={n.glyph!} />}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The tool stack on slow concentric orbits around the GTM OS core. A line runs from the core to each node and a pulse
 * travels out along it in turn. Rotation, pulse and line are transform and opacity only, run only while on screen, and
 * stop under reduced motion, where the nodes simply sit at their angles.
 */
export default function IntegrationMap() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => el.classList.toggle("on", es[0].isIntersecting), { rootMargin: "60px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const all = [...INNER, ...OUTER];
  return (
    <div className="g-map-int" ref={ref} role="group" aria-label="The tools around GTM OS">
      <ul className="g-sr">
        {all.map((n) => (
          <li key={n.id}>{n.label}</li>
        ))}
      </ul>
      <div className="g-orbits" aria-hidden="true">
        <span className="g-ring-path g-ring-path--1" />
        <span className="g-ring-path g-ring-path--2" />
        <Ring nodes={INNER} cls="g-orbit--1" radius="27" />
        <Ring nodes={OUTER} cls="g-orbit--2" radius="43" />
        <div className="g-core">
          <span>GTM OS</span>
        </div>
      </div>
    </div>
  );
}
