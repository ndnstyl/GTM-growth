import React from "react";

export const Arrow = () => (
  <span className="g-arr" aria-hidden="true">
    &rarr;
  </span>
);

export const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const ExternalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

export const SrOnly = ({ children }: { children: React.ReactNode }) => <span className="g-sr">{children}</span>;
