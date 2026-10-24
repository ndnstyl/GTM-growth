"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/lib/feeds";

export function CardDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {card ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-9 text-[15px] leading-snug break-words">{card.title}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-[var(--ink2)]">{card.description}</p>
            <div className="grid grid-cols-[100px_1fr] items-baseline gap-x-3 gap-y-1 text-[12.5px]">
              <b className="font-semibold text-muted-foreground">status</b>
              <span>{card.status}</span>
              <b className="font-semibold text-muted-foreground">priority</b>
              <span>{card.priority_raw || card.priority}</span>
              <b className="font-semibold text-muted-foreground">stage</b>
              <span>{card.domain}</span>
              <b className="font-semibold text-muted-foreground">owner</b>
              <span className={card.owner ? "" : "font-bold text-[var(--crit)]"}>{card.owner || "Unassigned"}</span>
              <b className="font-semibold text-muted-foreground">due</b>
              <span>{card.due ?? ""}</span>
              <b className="font-semibold text-muted-foreground">blocked on</b>
              <span>{card.blocked_on || "nothing"}</span>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
