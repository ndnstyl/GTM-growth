// One place for reports/cockpit console output. Keeps the "[reports]"-prefixed
// honesty receipts (unavailable_feed, tile diagnostics, etc.) consistent and
// gives eslint one call site to allow instead of scattering per-line disables.

function format(msg: string): string {
  return msg.startsWith("[reports]") ? msg : `[reports] ${msg}`;
}

export const reportLog = {
  info(msg: string, ...args: unknown[]) {
    console.info(format(msg), ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    console.warn(format(msg), ...args);
  },
  error(msg: string, ...args: unknown[]) {
    console.error(format(msg), ...args);
  },
};
