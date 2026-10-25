"use client";

import { useEffect } from "react";
import { withBase } from "@/lib/demo/base";
import { useNavigate } from "@/lib/motion/nav";

// The Second Brain: a radial map of the public Operator OS repository and the ten playbook folders.
// The map itself is a self-contained page (public/brain-engine/) in a same-origin frame; it asks this shell to open
// a GTM OS surface or to go home by message, and only same-origin, same-site paths are followed.
export default function Brain() {
  const navigate = useNavigate();
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; href?: string } | null;
      if (!d || d.type !== "gtm-brain-nav" || typeof d.href !== "string") return;
      if (!d.href.startsWith("/") || d.href.startsWith("//")) return;
      navigate(d.href);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return (
    <div className="h-full">
      <h1 className="sr-only">Second Brain</h1>
      <iframe
        title="Second Brain: a radial map of the Operator OS skills, agents, hooks and memory, and the GTM OS surfaces. A searchable list is inside."
        src={withBase("/brain-engine/index.html")}
        className="block h-full w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
