import { SettleGate } from "@/components/shell/SettleGate";
import { Workbench } from "@/components/reports/workbench/Workbench";

// the interactive workbench route, additive beside 127's tabs.
export default function WorkbenchPage() {
  return (
    <SettleGate pad="p-6" skeleton={560}>
      <Workbench />
    </SettleGate>
  );
}
