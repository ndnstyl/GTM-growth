// The demo feeds are build-time JSON. Importing them here puts the real tiles, stat rows and suggestions into the
// prerendered HTML, so the first paint is the real cockpit and hydration changes nothing on screen (no layout
// shift). The live fetch in lib/feeds.ts still runs for the five-minute refresh.
import type { Feeds } from "@/lib/feeds";
import meta from "@/public/data/meta.json";
import board from "@/public/data/board.json";
import kpi from "@/public/data/kpi.json";
import routines from "@/public/data/routines.json";
import initiatives from "@/public/data/initiatives.json";

export const STATIC_FEEDS = { meta, board, kpi, routines, initiatives } as unknown as Feeds;
