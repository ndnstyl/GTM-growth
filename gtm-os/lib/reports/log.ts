// One place for reports/cockpit console output. Keeps the "[reports]"-prefixed
// honesty receipts (unavailable_feed, tile diagnostics, etc.) consistent and
// gives eslint one call site to allow instead of scattering per-line disables.

function format(msg: string): string {
  return msg.startsWith("[reports]") ? msg : `[reports] ${msg}`;
}

// Diagnostics stay silent unless a developer opts in with ?debug=1 or localStorage gtm-debug=1. Warnings and errors always print.
function verbose(): boolean {
  try {
    return typeof window !== "undefined" && (new URLSearchParams(window.location.search).has("debug") || window.localStorage.getItem("gtm-debug") === "1");
  } catch {
    return false;
  }
}

export const reportLog = {
  info(msg: string, ...args: unknown[]) {
    if (verbose()) console.info(format(msg), ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    console.warn(format(msg), ...args);
  },
  error(msg: string, ...args: unknown[]) {
    console.error(format(msg), ...args);
  },
};
