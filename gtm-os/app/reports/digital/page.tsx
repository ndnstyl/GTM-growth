import { SettleGate } from "@/components/shell/SettleGate";
import { DigitalBoard } from "@/components/reports/digital/DigitalBoard";

// the Digital Marketing board, its own route beside the reports shell and the
// workbench (the shell's tabs are untouched). Static export: the page is a client component
// tree that registers its feeds in the browser.
export default function DigitalMarketingPage() {
  return (
    <SettleGate pad="p-6" skeleton={560}>
      <DigitalBoard />
    </SettleGate>
  );
}
