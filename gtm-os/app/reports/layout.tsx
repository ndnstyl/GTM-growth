// The root layout locks body to overflow-hidden for the cockpit's fixed
// viewport; report pages are DOCUMENTS and must scroll: the owner hit the cutoff
// live on the workbench boards (2026-08-28). This segment re-enables vertical
// scrolling for everything under /reports/.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
