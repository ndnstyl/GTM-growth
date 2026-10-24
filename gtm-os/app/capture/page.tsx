"use client";

import { NavLink } from "@/lib/motion/nav";

import { ConsentOpsPanel } from "@/components/cockpit/ConsentOpsPanel";
import { PageFrame, Card } from "@/components/apps/ui";

export default function CapturePage() {
  return (
    <PageFrame title="Capture & Consent" subtitle="Every consent sealed with its exact wording; exceptions and per-person timelines in one queue.">
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_320px]">
        <div className="flex max-h-[70vh] min-h-[320px] flex-col"><ConsentOpsPanel /></div>
        <div className="space-y-3">
          <Card title="Related">
            <ul className="space-y-1.5 text-[12.5px]">
              <li><NavLink className="text-primary hover:underline" href={"/reports/workbench/?board=board-ai-accuracy"}>AI front door: answer accuracy and speed</NavLink></li>
              <li><NavLink className="text-primary hover:underline" href={"/reports/#call_center"}>Sales floor: connect rates</NavLink></li>
            </ul>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
