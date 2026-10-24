import React, { useEffect } from "react";
import Head from "next/head";
import { DialogProvider } from "./Dialogs";
import GtmHeader from "./Header";
import GtmFooter from "./Footer";
import { fontVars } from "./fonts";
import { useMotionFlag } from "./lib/useMotion";
import { cx } from "./lib/cx";

const SITE = "https://theinnovativenative.com";
const TITLE = "Fractional CAIO and CTO for GTM + AI | Mike Soto";
const DESC = "I own the AI and technology behind your go-to-market: the systems that find buyers, answer them fast and prove the spend.";

/** The one-page home: tokens, fonts, head tags, the shared dialog controller, header and footer. */
export default function GtmLayout({ children, dialogs }: { children: React.ReactNode; dialogs: React.ReactNode }) {
  useMotionFlag();
  useEffect(() => {
    document.body.classList.add("g-body");
    return () => document.body.classList.remove("g-body");
  }, []);
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESC} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${SITE}/`} />
        <link rel="icon" href="/images/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/images/favicon.png" />
        <meta name="theme-color" content="#0b0c1a" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="The Innovative Native" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:url" content={`${SITE}/`} />
        <meta property="og:image" content={`${SITE}/images/gtm/og-share.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Mike Soto, fractional CAIO and CTO for growth that runs on AI systems" />
        <meta property="og:locale" content="en_US" />
        <meta name="author" content="Mike Soto" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESC} />
        <meta name="twitter:image" content={`${SITE}/images/gtm/og-share.png`} />
        <meta name="twitter:image:alt" content="Mike Soto, fractional CAIO and CTO for growth that runs on AI systems" />
      </Head>
      <DialogProvider>
        <div className={cx("gtm-root", "g-page", "g-themed", fontVars)}>
          <div className="g-grain" aria-hidden="true" />
          <GtmHeader home />
          <main id="main" tabIndex={-1}>{children}</main>
          <GtmFooter nested />
          {dialogs}
        </div>
      </DialogProvider>
    </>
  );
}
