import React, { useEffect } from "react";
import Head from "next/head";
import { Reveal } from "./Primitives";
import { Accent, SectionLabel } from "./TextFx";
import { useStats } from "./lib/stats";
import type { CaseStudy } from "./types";

export interface QA {
  q: string;
  a: string;
}

/** The questions a buyer or an answer engine asks first, answered in the first sentence. Facts come from the data file. */
export function buildFaq(stats: { total: number; stageWord: string; kinds: { agent: number; playbook: number; loop: number; automation: number } }, cases: CaseStudy[]): QA[] {
  const c = (id: string) => cases.find((x) => x.id === id);
  const c1 = c("c1");
  const c2 = c("c2");
  return [
    {
      q: "What does a fractional CAIO do?",
      a: "A fractional chief AI officer owns the AI strategy for your growth, part time, so you get a senior owner without a full-time hire. I decide what to automate and what to leave alone, set the rules for how AI touches lead and customer data, give every AI system an owner, a check and an alarm, and read the numbers to see whether it paid.",
    },
    {
      q: "How is this different from an agency?",
      a: `An agency sells you hours or a deliverable. I take the seat that owns the systems under your go-to-market, and I am on the hook for what they do. The work is the same stack I run in production: ${stats.total} systems across ${stats.stageWord} stages. You get the runbooks, the alarms and the reasons in writing, so your team can run it without me.`,
    },
    {
      q: "What is a GTM system?",
      a: `A GTM system is the working machinery behind go-to-market: the parts that find buyers, answer them fast and prove the spend. Mine is ${stats.total} systems across ${stats.stageWord} stages, first touch to final report: ${stats.kinds.agent} agents, ${stats.kinds.playbook} playbooks, ${stats.kinds.loop} scheduled loops and ${stats.kinds.automation} always-on systems.`,
    },
    {
      q: "What do the first 30 days look like?",
      a: "I map where your pipeline really comes from and where the money leaks, then prove the data before I build anything on it. After that I build the highest-leak systems first and write the runbook as I go. Each week I read the numbers and propose the next move, and a person on your side approves every live change.",
    },
    {
      q: "Who is this for?",
      a: `Leaders whose reporting looks fine while the outcomes quietly decay, especially in legal, professional services, SaaS and other high-constraint work. In one case ${c1 ? `cost per intake-qualified case improved ${c1.a} to ${c1.b} percent` : "cost per qualified case improved"}, and in another ${c2 ? `marketing efficiency rose an estimated ${c2.a} to ${c2.b} percent at flat spend` : "efficiency rose at flat spend"}. Both are anonymized case studies on this page.`,
    },
    {
      q: "Is the AI compliance work legal advice?",
      a: "No. I give the operating direction: which rules touch how you use AI with lead and customer data, what each system must do to stay inside them, and the record that proves it did. Your counsel rules on the law. I make sure the stack does what the decision says.",
    },
    {
      q: "What does it cost to start?",
      a: "It is scoped on a call. There is no price list, because the first build depends on which stages are leaking in your business. Book thirty minutes and I will tell you what I would build first and what it would take.",
    },
  ];
}

const faqId = (q: string) => "faq-" + q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export default function Faq({ cases }: { cases: CaseStudy[] }) {
  const stats = useStats();
  const items = buildFaq(stats, cases);
  // a link to #faq-<question> opens that answer
  useEffect(() => {
    const open = () => {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <section className="g-section g-faq" id="faq" aria-labelledby="g-faq-h">
      <Head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      </Head>
      <div className="g-wrap g-faq-wrap">
        <Reveal className="g-sec-head">
          <SectionLabel>Questions</SectionLabel>
          <h2 id="g-faq-h">
            Questions, <Accent>answered first.</Accent>
          </h2>
          <p className="g-lede">The short answers. The long ones are on a call, and in the <a href="/blog">writing</a>.</p>
        </Reveal>
        <div className="g-faq-list">
          {items.map((i) => (
            <details key={i.q} id={faqId(i.q)} className="g-faq-item">
              <summary>{i.q}</summary>
              <p>{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
