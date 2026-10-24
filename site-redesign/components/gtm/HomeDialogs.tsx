import React, { useEffect, useRef, useState } from "react";
import { Dialog, Sheet, useDialogs } from "./Dialogs";
import CockpitFrame from "./CockpitFrame";
import { FEATURES } from "./Featured";
import type { GtmHomeData } from "./types";

const two = (n: number) => String(n + 1).padStart(2, "0");
const arrow = (c: string) => <span aria-hidden="true">{c}</span>;

function Payload<T>(): T | null {
  const { current } = useDialogs();
  return (current?.payload as T) ?? null;
}

function DemoBody() {
  const { close } = useDialogs();
  return (
    <Sheet
      label="GTM OS"
      className="g-sheet--xl"
      foot={
        <div className="g-foot-row g-foot-row--between">
          <span className="g-muted g-hint">Press Escape or use Close to leave the demo.</span>
          <button type="button" className="g-btn g-btn--ghost g-btn--sm" onClick={() => close()}>
            Close
          </button>
        </div>
      }
    >
      <h2 className="g-sr" id="g-demo-t">
        GTM OS live demo, full screen
      </h2>
      <CockpitFrame variant="dialog" start />
    </Sheet>
  );
}

function FolderBody({ data }: { data: GtmHomeData }) {
  const dialogs = useDialogs();
  const p = Payload<{ index: number }>();
  const N = data.stages.length;
  const [fi, setFi] = useState(p?.index ?? 0);
  const body = useRef<HTMLDivElement | null>(null);
  const s = data.stages[fi];
  useEffect(() => {
    const el = body.current?.closest(".g-sheet-body");
    if (el) el.scrollTop = 0;
  }, [fi]);
  return (
    <Sheet
      label={`${two(fi)} / ${s.items.length} systems`}
      foot={
        <div className="g-pager">
          <button type="button" className="g-btn g-btn--ghost g-btn--sm g-pager-prev" onClick={() => setFi((fi + N - 1) % N)}>
            {arrow("←")} Previous
          </button>
          <button type="button" className="g-btn g-btn--primary g-btn--sm g-pager-book" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a Call
          </button>
          <button type="button" className="g-btn g-btn--ghost g-btn--sm g-pager-next" onClick={() => setFi((fi + 1) % N)}>
            Next {arrow("→")}
          </button>
        </div>
      }
    >
      <div ref={body}>
        <h2 id="g-fo-t" className="g-sheet-title" aria-live="polite">
          {s.name}
        </h2>
        <p className="g-sub">{s.outcome}</p>
        <ul className="g-items">
          {s.items.map((it, k) => (
            <li key={`${fi}-${it.name}`} style={{ ["--k" as string]: k } as React.CSSProperties}>
              <span className="g-kind">{it.kind}</span>
              <b>{it.name}</b>
              <span className="g-o">{it.outcome}</span>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function FeatBody() {
  const dialogs = useDialogs();
  const p = Payload<{ id: string }>();
  const f = FEATURES.find((x) => x.id === p?.id) || FEATURES[0];
  return (
    <Sheet
      label={f.label}
      foot={
        <div className="g-foot-row">
          <a className="g-btn g-btn--ghost g-btn--sm" href={f.link.href}>
            {f.link.label}
          </a>
          <button type="button" className="g-btn g-btn--primary g-btn--sm" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a Call
          </button>
        </div>
      }
    >
      <h2 id="g-ft-t" className="g-sheet-title">
        {f.title}
      </h2>
      <p className="g-sub">{f.dialog}</p>
      <div className="g-blk">
        <h3>What it does</h3>
        <ul>
          {f.points.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function CaseBody({ data }: { data: GtmHomeData }) {
  const dialogs = useDialogs();
  const p = Payload<{ index: number }>();
  const c = data.cases[p?.index ?? 0];
  return (
    <Sheet
      label={c.tag}
      foot={
        <div className="g-foot-row">
          <button type="button" className="g-btn g-btn--primary g-btn--sm" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a Call
          </button>
        </div>
      }
    >
      <h2 id="g-cs-t" className="g-sheet-title">
        {c.title}
      </h2>
      <div className="g-blk">
        <h3>The challenge</h3>
        <p>{c.challenge}</p>
      </div>
      <div className="g-blk">
        <h3>The system built</h3>
        <p>{c.built}</p>
      </div>
      <div className="g-blk">
        <h3>The result</h3>
        <ul>
          {c.result.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

export default function HomeDialogs({ data }: { data: GtmHomeData }) {
  return (
    <>
      <Dialog name="gtmos" labelledBy="g-demo-t" className="g-d-xl">
        <DemoBody />
      </Dialog>
      <Dialog name="folder" labelledBy="g-fo-t">
        <FolderBody data={data} />
      </Dialog>
      <Dialog name="feat" labelledBy="g-ft-t">
        <FeatBody />
      </Dialog>
      <Dialog name="case" labelledBy="g-cs-t">
        <CaseBody data={data} />
      </Dialog>
    </>
  );
}
