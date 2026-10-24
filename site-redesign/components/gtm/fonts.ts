import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time by next/font: no request to Google at runtime, preloaded, font-display swap.
// One weight each, no optical-size axis: the three above-the-fold faces come to about 100 KB instead of 220 KB.
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--g-font-fraunces",
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--g-font-inter",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
  variable: "--g-font-mono",
});

export const fontVars = `${fraunces.variable} ${inter.variable} ${mono.variable}`;
