"use client";

import { NavLink } from "@/lib/motion/nav";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Routines } from "@/components/cockpit/Routines";
import { RunPanel, useRunState } from "@/components/cockpit/RunPanel";
import { PageFrame, Card } from "@/components/apps/ui";
import { Feeds, loadFeeds } from "@/lib/feeds";

export default function OpsPage() {
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [open, setOpen] = useState(false);
  const state = useRunState(true);
  useEffect(() => { loadFeeds().then(setFeeds); }, []);
  return (
    <PageFrame
      title="AI Ops"
      subtitle="The loops that run on their own, what they cost and what they saved."
      actions={<button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground"><Zap size={13} /> Run history</button>}
    >
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_320px]">
        <div className="flex max-h-[70vh] min-h-[320px] flex-col"><Routines routines={feeds?.routines ?? null} /></div>
        <Card title="Boards">
          <ul className="space-y-1.5 text-[12.5px]">
            <li><NavLink className="text-primary hover:underline" href={"/reports/#health"}>Health: feed and job freshness</NavLink></li>
          </ul>
        </Card>
      </div>
      <RunPanel open={open} onOpenChange={setOpen} state={state} />
    </PageFrame>
  );
}
