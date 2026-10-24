export type NavItem = { label: string; href: string; desc?: string };
export type Area = { id: string; label: string; short: string; stage: string; blurb: string; items: NavItem[] };

export const AREAS: Area[] = [
  {
    id: "command", label: "Command", short: "Command", stage: "Reporting Cockpit",
    blurb: "The daily cockpit: priority, numbers, calendar, chat and the ten-stage map.",
    items: [
      { label: "Cockpit", href: "/", desc: "Priority, numbers, calendar, ask-anything chat" },
      { label: "Executive readout", href: "/reports/exec/", desc: "MER and unit costs in one page" },
    ],
  },
  {
    id: "content", label: "Content Studio", short: "Content", stage: "Content Engine",
    blurb: "Ideas to scripts to finished cuts, with the crew that builds them.",
    items: [
      { label: "Studio", href: "/studio/", desc: "Ideas, library, scripts, crew and one-click runs" },
    ],
  },
  {
    id: "paid", label: "Paid Media", short: "Paid", stage: "Paid Media",
    blurb: "Spend, pacing and results by platform, market and placement.",
    items: [
      { label: "Paid media", href: "/reports/#paid_media", desc: "Google, Meta and Microsoft by campaign" },
      { label: "QR & tracked URLs", href: "/qr/", desc: "Build and register every offline link" },
    ],
  },
  {
    id: "capture", label: "Capture & Speed", short: "Capture", stage: "Capture & Consent, Speed to Lead",
    blurb: "Leads in, consented, and answered fast.",
    items: [
      { label: "Consent operations", href: "/capture/", desc: "Exceptions and per-person timelines" },
      { label: "AI front door", href: "/reports/workbench/?board=board-ai-accuracy", desc: "Answer accuracy, speed and gaps" },
    ],
  },
  {
    id: "sales", label: "Sales Floor", short: "Sales", stage: "Sales Floor",
    blurb: "Dials, connects and set rate by rep, from the CRM call log.",
    items: [
      { label: "Connect rates", href: "/reports/#call_center", desc: "Connect rate by rep and day" },
    ],
  },
  {
    id: "attribution", label: "Attribution & BI", short: "BI", stage: "Attribution & Cost, Reporting Cockpit",
    blurb: "One number per question, from spend to sold revenue.",
    items: [
      { label: "Overview", href: "/reports/#overview", desc: "Funnel and spend facts" },
      { label: "Marketing cost target", href: "/reports/workbench/?board=board-efficiency-target", desc: "Marketing cost against its target" },
      { label: "MER board", href: "/reports/workbench/?board=board-mer", desc: "Revenue over ad spend" },
    ],
  },
  {
    id: "ops", label: "AI Ops", short: "AI Ops", stage: "Reliability",
    blurb: "The loops that run on their own and whether the data is fresh.",
    items: [
      { label: "Loops & runs", href: "/ops/", desc: "Scheduled loops, playbooks and run history" },
      { label: "Health", href: "/reports/#health", desc: "Feed and job freshness" },
    ],
  },
];

export function areaForStage(stageName: string): Area | undefined {
  const n = stageName.toLowerCase();
  const map: Record<string, string> = {
    "market research": "command",
    "positioning & offer": "command",
    "positioning and offer": "command",
    "content engine": "content",
    "paid media": "paid",
    "capture & consent": "capture",
    "capture and consent": "capture",
    "speed to lead": "capture",
    "sales floor": "sales",
    "attribution & cost": "attribution",
    "attribution and cost": "attribution",
    "reliability": "ops",
    "reporting cockpit": "command",
  };
  const id = map[n];
  return AREAS.find((a) => a.id === id);
}
