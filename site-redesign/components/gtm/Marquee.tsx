import React from "react";
import { useInView } from "./lib/useReveal";

const CAPS = [
  "Market researched",
  "Offers tested",
  "On-brand reels",
  "Media bought",
  "Consent sealed",
  "Calls and chats answered in seconds",
  "Calls scored",
  "Spend reconciled",
  "One screen",
  "Nothing fails quietly",
];

export default function Marquee() {
  const ref = useInView<HTMLDivElement>();
  return (
    <div className="g-marquee g-marquee-edge" ref={ref} role="group" aria-label="What the work covers">
      <div className="g-track">
        <ul className="g-run" role="list">
          {CAPS.map((c) => (
            <li className="g-mq" key={c}>
              {c}
            </li>
          ))}
        </ul>
        <ul className="g-run" aria-hidden="true">
          {CAPS.map((c) => (
            <li className="g-mq" key={c}>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
