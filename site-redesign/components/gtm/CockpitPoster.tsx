import React from "react";

/**
 * A still of the GTM OS screen, drawn in the page's own theme tokens (works in dark and light, no image file).
 * It is the frame's resting state: while the live demo loads, when it is offline, and for reduced motion.
 * Shapes only, no figures, so nothing here can read as a real number.
 */
export default function CockpitPoster() {
  const nav = [0, 1, 2, 3, 4, 5, 6, 7];
  const kpis = [0, 1, 2, 3];
  const rows = [0, 1, 2, 3, 4];
  const dots = Array.from({ length: 10 }, (_, i) => i);
  const spark = (i: number) => {
    const p = [
      "0,26 14,20 28,24 42,12 56,16 70,6 84,10",
      "0,18 14,22 28,14 42,18 56,8 70,14 84,4",
      "0,24 14,16 28,20 42,10 56,14 70,8 84,6",
      "0,20 14,24 28,12 42,16 56,10 70,12 84,2",
    ];
    return p[i % 4];
  };
  return (
    <svg className="g-poster" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="1600" height="1000" className="p-bg" />
      {/* sidebar */}
      <rect x="0" y="0" width="230" height="1000" className="p-side" />
      <rect x="32" y="34" width="34" height="34" rx="9" className="p-accent" />
      <rect x="78" y="44" width="96" height="14" rx="7" className="p-line" />
      {nav.map((i) => (
        <g key={i} transform={`translate(28 ${120 + i * 64})`}>
          <rect width="174" height="44" rx="12" className={i === 0 ? "p-sel" : "p-ghost"} />
          <circle cx="24" cy="22" r="7" className={i === 0 ? "p-accent" : "p-dim"} />
          <rect x="44" y="15" width={70 + ((i * 17) % 40)} height="12" rx="6" className={i === 0 ? "p-text" : "p-dim"} />
        </g>
      ))}
      {/* top bar */}
      <rect x="262" y="30" width="420" height="44" rx="22" className="p-card" />
      <rect x="290" y="46" width="150" height="12" rx="6" className="p-dim" />
      <circle cx="1530" cy="52" r="22" className="p-card" />
      <rect x="1360" y="40" width="140" height="24" rx="12" className="p-card" />
      {/* kpi row */}
      {kpis.map((i) => (
        <g key={i} transform={`translate(${262 + i * 332} 110)`}>
          <rect width="308" height="170" rx="22" className="p-card" />
          <rect x="26" y="26" width="110" height="12" rx="6" className="p-dim" />
          <rect x="26" y="62" width={120 + i * 14} height="34" rx="10" className="p-text" />
          <polyline points={spark(i)} transform="translate(26 112) scale(2.4 1.6)" className={i % 2 ? "p-lm" : "p-lc"} />
        </g>
      ))}
      {/* main chart */}
      <g transform="translate(262 312)">
        <rect width="880" height="400" rx="26" className="p-card" />
        <rect x="32" y="30" width="190" height="14" rx="7" className="p-text" />
        <rect x="32" y="56" width="120" height="10" rx="5" className="p-dim" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="32" x2="848" y1={110 + i * 74} y2={110 + i * 74} className="p-grid" />
        ))}
        <path d="M32 330 C 140 300, 200 250, 300 262 S 480 190, 560 210 S 740 120, 848 140 L848 332 L32 332Z" className="p-area" />
        <path d="M32 330 C 140 300, 200 250, 300 262 S 480 190, 560 210 S 740 120, 848 140" className="p-lc p-thick" />
        <path d="M32 300 C 150 320, 220 280, 320 292 S 500 250, 590 262 S 740 230, 848 214" className="p-lm p-thick" />
      </g>
      {/* ten-stage rail */}
      <g transform="translate(1170 312)">
        <rect width="406" height="400" rx="26" className="p-card" />
        <rect x="28" y="30" width="150" height="14" rx="7" className="p-text" />
        <line x1="44" x2="362" y1="120" y2="120" className="p-grid" />
        {dots.map((i) => (
          <circle key={i} cx={44 + i * 35.3} cy="120" r={i < 6 ? 9 : 7} className={i < 6 ? "p-accent" : "p-dim"} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(28 ${170 + i * 44})`}>
            <rect width="350" height="32" rx="10" className="p-ghost" />
            <rect x="14" y="10" width={120 + ((i * 29) % 90)} height="12" rx="6" className="p-dim" />
            <circle cx="326" cy="16" r="6" className={i % 2 ? "p-mark" : "p-accent"} />
          </g>
        ))}
      </g>
      {/* table */}
      <g transform="translate(262 740)">
        <rect width="1314" height="230" rx="26" className="p-card" />
        {rows.map((i) => (
          <g key={i} transform={`translate(32 ${26 + i * 40})`}>
            <rect width="1250" height="30" rx="9" className={i === 1 ? "p-sel" : "p-ghost"} />
            <circle cx="20" cy="15" r="6" className={i % 3 === 0 ? "p-mark" : "p-accent"} />
            <rect x="44" y="9" width={200 + ((i * 53) % 120)} height="12" rx="6" className="p-dim" />
            <rect x="760" y="9" width="120" height="12" rx="6" className="p-dim" />
            <rect x="1060" y="9" width="150" height="12" rx="6" className="p-text" />
          </g>
        ))}
      </g>
    </svg>
  );
}
