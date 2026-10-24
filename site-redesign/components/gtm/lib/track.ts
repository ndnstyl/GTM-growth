/**
 * Booking events, sent only after the visitor has pressed Accept in the cookie notice. Decline, or no answer, sends
 * nothing: the tags themselves are not even loaded (see the loader in pages/_document.tsx).
 */
export function trackBooking(step: "open" | "load_calendar" | "scheduled"): void {
  try {
    if (typeof window === "undefined" || localStorage.getItem("tin_analytics_consent") !== "accepted") return;
    const w = window as any;
    const utm: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((v, k) => {
      if (/^(utm_|gclid$|fbclid$|msclkid$)/.test(k)) utm[k] = v;
    });
    (w.dataLayer = w.dataLayer || []).push({ event: "book_call", booking_step: step, ...utm });
    // a direct GA4 event too, so the booking is counted without any tag-manager trigger being configured
    if (typeof w.gtag === "function") w.gtag("event", "book_call", { booking_step: step, ...utm });
    if (typeof w.fbq === "function") {
      if (step === "scheduled") w.fbq("track", "Schedule");
      else w.fbq("trackCustom", "BookCall", { step });
    }
  } catch (e) {
    /* storage unavailable: no consent can be read, so nothing is sent */
  }
}
