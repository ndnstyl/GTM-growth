// Seek an animated SVG to exact times in headless Chromium and screenshot each frame.
// usage: node render_frames.mjs <svg> <outdir> <fps> [stillTimes comma list]
// With stillTimes, writes only those stills (still-<t>.png); otherwise writes one full cycle at <fps>.
// SMIL is seeked with setCurrentTime and CSS animations with currentTime, both paused, so frames are exact.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_DIR || import.meta.url);
const { chromium } = require("playwright");

const [svgPath, outDir, fpsArg, stills] = process.argv.slice(2);
if (!svgPath || !outDir || !fpsArg) {
  console.error("usage: node render_frames.mjs <svg> <outdir> <fps> [stillTimes]");
  process.exit(2);
}
const svg = fs.readFileSync(svgPath, "utf8");
const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
const dur = svg.match(/dur="([\d.]+)s"/);
if (!m || !dur) throw new Error(`no viewBox or dur in ${svgPath}`);
const [w, h, total] = [Math.ceil(+m[1]), Math.ceil(+m[2]), +dur[1]];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#0d0e20">${svg}</body></html>`);
  const seek = async (t) =>
    page.evaluate((t) => {
      const s = document.querySelector("svg");
      s.pauseAnimations();
      s.setCurrentTime(t);
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
    }, t);
  const el = await page.$("svg");
  if (stills) {
    for (const t of stills.split(",").map(Number)) {
      await seek(t);
      await el.screenshot({ path: path.join(outDir, `still-${t}.png`) });
    }
  } else {
    const n = Math.round(total * +fpsArg);
    for (let i = 0; i < n; i++) {
      await seek(i / +fpsArg);
      await el.screenshot({ path: path.join(outDir, `f${String(i).padStart(4, "0")}.png`) });
    }
    console.log(`${n} frames, ${total}s cycle`);
  }
} finally {
  await browser.close();
}
