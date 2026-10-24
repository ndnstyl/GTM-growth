import React from "react";

/** Two-colour line schematics, one per card. Theme tokens only. Decorative: the card text carries the meaning. */
const W = 240;
const H = 112;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg className="g-scene-svg" viewBox={`0 0 ${W} ${H}`} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Roadmap: a route climbing through four decisions to a target. */
export function SceneRoadmap() {
  return (
    <Frame>
      <path d="M16 92h208" className="s-dim" strokeDasharray="2 6" />
      <path d="M22 84C54 84 52 64 82 62S116 76 140 52 188 40 214 22" className="s-a s-glow" />
      {[
        [22, 84],
        [82, 62],
        [140, 52],
        [190, 38],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6" className="s-fill" />
          <circle cx={x} cy={y} r="6" className="s-a" />
        </g>
      ))}
      <path d="M214 22V8m0 0l14 5-14 5" className="s-m s-glow" />
      <rect x="64" y="94" width="36" height="6" rx="3" className="s-dim" />
      <rect x="122" y="94" width="52" height="6" rx="3" className="s-dim" />
    </Frame>
  );
}

/** Technology: stacked layers behind a data gate. */
export function SceneLayers() {
  return (
    <Frame>
      <path d="M92 74l54-18 54 18-54 18z" className="s-dim" />
      <path d="M92 58l54-18 54 18-54 18z" className="s-fill s-a" />
      <path d="M92 42l54-18 54 18-54 18z" className="s-fill s-a s-glow" />
      <path d="M92 42v32M200 42v32" className="s-dim" />
      <path d="M40 22v30M40 70v22" className="s-m s-glow" />
      <path d="M30 52h20" className="s-m" />
      <path d="M12 61h26m12 0h24" className="s-a" strokeDasharray="3 5" />
      <path d="M70 61l6-4v8z" className="s-a" />
    </Frame>
  );
}

/** Build: ten folders, the leaky ones lit. */
export function SceneFolders() {
  const lit = new Set([2, 5, 8]);
  return (
    <Frame>
      {Array.from({ length: 10 }, (_, i) => {
        const x = 18 + (i % 5) * 44;
        const y = 16 + Math.floor(i / 5) * 46;
        const on = lit.has(i);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M0 6a4 4 0 014-4h10l5 6h15a4 4 0 014 4v18a4 4 0 01-4 4H4a4 4 0 01-4-4z" className={on ? "s-fill s-m s-glow" : "s-dim"} />
            {on ? <path d="M19 38v10M27 38v6" className="s-m" strokeDasharray="1 4" /> : null}
          </g>
        );
      })}
    </Frame>
  );
}

/** Consent: a record with a seal and a chain link. */
export function SceneSeal() {
  return (
    <Frame>
      <rect x="62" y="12" width="96" height="88" rx="10" className="s-fill s-dim" />
      <path d="M78 34h56M78 48h44M78 62h50" className="s-dim" />
      <circle cx="148" cy="78" r="22" className="s-fill s-a s-glow" />
      <path d="M138 78l7 7 13-15" className="s-a" />
      <path d="M176 30h22a10 10 0 010 20h-8M196 50h-22a10 10 0 010-20" className="s-m" transform="translate(6 12) scale(.9)" />
      <path d="M14 56h36" className="s-dim" strokeDasharray="2 6" />
    </Frame>
  );
}

/** Reporting: one screen, the numbers on it. */
export function SceneCockpit() {
  return (
    <Frame>
      <rect x="40" y="10" width="160" height="82" rx="10" className="s-fill s-dim" />
      <path d="M92 92v10m-18 0h52" className="s-dim" />
      <rect x="54" y="24" width="30" height="20" rx="4" className="s-a" />
      <rect x="92" y="24" width="30" height="20" rx="4" className="s-a" />
      <rect x="130" y="24" width="56" height="20" rx="4" className="s-m" />
      <path d="M54 80l22-16 20 8 24-18 22 6 22-14" className="s-a s-glow" />
      <circle cx="186" cy="60" r="3.5" className="s-m s-fill" />
    </Frame>
  );
}
