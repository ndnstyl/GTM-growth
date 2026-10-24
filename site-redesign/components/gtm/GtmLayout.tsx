import React, { useEffect } from "react";
import Head from "next/head";
import { DialogProvider } from "./Dialogs";
import GtmHeader from "./Header";
import GtmFooter from "./Footer";
import { fontVars } from "./fonts";
import { useMotionFlag } from "./lib/useMotion";
import { cx } from "./lib/cx";

const SITE = "https://theinnovativenative.com";
const TITLE = "Mike Soto | Fractional CAIO and CTO for go-to-market and AI";
const DESC = "Fractional CAIO and CTO focused on go-to-market: AI systems that find buyers, answer them fast and prove the spend.";

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
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESC} />
        <meta name="twitter:image" content={`${SITE}/images/gtm/og-share.png`} />
      </Head>
      <DialogProvider>
        <div className={cx("gtm-root", "g-page", "g-themed", fontVars)}>
          <a className="g-skip" href="#main">
            Skip to content
          </a>
          <GtmHeader home />
          <main id="main" tabIndex={-1}>{children}</main>
          <GtmFooter nested />
          {dialogs}
        </div>
      </DialogProvider>
    </>
  );
}
