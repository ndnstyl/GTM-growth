"use client";

import { useEffect, useState } from "react";
import { MediaPanel } from "@/components/cockpit/MediaPanel";
import { PageFrame } from "@/components/apps/ui";
import { Feeds, loadFeeds } from "@/lib/feeds";

export default function MediaPage() {
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  useEffect(() => { loadFeeds().then(setFeeds); }, []);
  return (
    <PageFrame title="Media calendar" subtitle="Every dated placement across TV, mail, social and events, with what it means for the call floor.">
      <div className="flex h-[75vh] min-h-[420px] flex-col"><MediaPanel media={feeds?.initiatives ?? null} /></div>
    </PageFrame>
  );
}
