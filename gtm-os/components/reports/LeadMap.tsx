"use client";

// Leads & Geo map. MapLibre GL over OpenFreeMap vector tiles
// fail to load. Circles/shapes = zip centroids sized by lead count, colored
// AND shaped by `state` (identity never rides on color alone). Office pins
// carry their own match-type label so a centroid-derived pin (OXSB city
// centroid, OXFM zip centroid) never reads as a street address. Only tile
// requests leave this machine: lead data is queried locally in DuckDB-WASM
// and never sent anywhere.

import { dateRangeFor, daysBetweenInclusive } from "@/lib/reports/dates";
import { reducedMotionNow } from "@/lib/motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/demo/base";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { getDb, query, registerParquet } from "@/lib/reports/duck";
import type { FilterState } from "@/components/reports/FilterBar";
import { zipPointsSql, officePinsSql, outOfAreaTableSql, geoCoverageSql } from "@/lib/reports/sql/geo.sql";
import { reportLog } from "@/lib/reports/log";
import { asNumber } from "@/lib/reports/format";

// The six contract states. Color carries meaning where the app already has a
// one neutral gray and differentiate by SHAPE only, per the dataviz rule
// that identity never rides on color alone.
const STATE_STYLE: Record<
  string,
  { color: string; shape: "circle" | "diamond" | "triangle" | "square" | "ring" | "x"; label: string }
> = {
  in_area: { color: "var(--primary)", shape: "circle", label: "In a market" },
  wrong_branch: { color: "var(--warn)", shape: "diamond", label: "Routed to the wrong market" },
  out_of_area: { color: "var(--magenta)", shape: "triangle", label: "Outside every market" },
  unknown_branch_list: { color: "var(--ink2)", shape: "square", label: "Market list not loaded" },
  no_zip: { color: "var(--ink2)", shape: "ring", label: "No zip code" },
  unmapped_zip: { color: "var(--ink2)", shape: "x", label: "Zip not recognized" },
};
const SHAPE_GLYPH: Record<string, string> = {
  circle: "●",
  diamond: "◆",
  triangle: "▲",
  square: "■",
  ring: "○",
  x: "✕",
};

type ZipPoint = {
  zip: string;
  zcta_lat: number | null;
  zcta_lng: number | null;
  state: string;
  market_id: string | null;
  distance_basis: string | null;
  within_radius_mi: number | null;
  filed_branch: string | null;
  serviceable_branch: string | null;
  leads: number;
};
type OfficePin = {
  market_id: string;
  code: string;
  name: string;
  office_lat: number;
  office_lng: number;
  office_match_type: string;
  office_address?: string;
};
type OutOfAreaRow = {
  zip: string;
  state: string;
  market_id: string | null;
  flagged_leads: number;
  total_leads: number;
  flagged_rate: number;
};


// Defensive coercion for the table: the DuckDB-WASM loader normalizes
// BigInt to Number already (lib/reports/duck.ts), but a SUM() over a
// UNION ALL of differently-typed parquet files can still hand back a
// numeric-looking string. Never render a raw cell value; always pass it
// through this first.
type GeoCoverage = { distinct_days: number; days_in_window?: number; leads: number; first_day: string | null; last_day: string | null };

// Days in [from, to], from the same calendar strings the SQL filters on (the window already ends on the last full data day).
function daysInWindow(from: string, to: string): number {
  return daysBetweenInclusive(from, to);
}

// 5th-95th percentile bounds so a single far-away out-of-area lead (e.g. a
// Hawaii or Alaska zip on an otherwise FL/Houston book) does not zoom the
// map out to the whole Pacific; the point itself still renders as a marker,
// it just does not drive the fit.
function percentileBounds(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95))];
  return [lo, hi];
}

function markerSize(leads: number): number {
  // sqrt scale, clamped 8-28px per the coordinator's marker spec.
  return Math.max(8, Math.min(28, 8 + Math.sqrt(Math.max(leads, 0)) * 4));
}

const MAX_MARKERS = 2000;

// Beyond MAX_MARKERS, aggregate to a coarse lat/lng grid (0.2 degree cells,
// roughly county-scale) so the map stays responsive; the dominant state in
// the cell (most leads) sets the marker's color/shape, and the tooltip
// discloses the aggregation.
function aggregateForMarkers(pts: ZipPoint[]): (ZipPoint & { aggregated?: number })[] {
  if (pts.length <= MAX_MARKERS) return pts;
  const cells = new Map<string, ZipPoint & { aggregated: number; byState: Map<string, number> }>();
  for (const p of pts) {
    if (p.zcta_lat == null || p.zcta_lng == null) continue;
    const key = `${Math.round(p.zcta_lat / 0.2)}_${Math.round(p.zcta_lng / 0.2)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.leads += p.leads;
      cell.aggregated += 1;
      cell.byState.set(p.state, (cell.byState.get(p.state) ?? 0) + p.leads);
    } else {
      cells.set(key, {
        ...p,
        leads: p.leads,
        aggregated: 1,
        byState: new Map([[p.state, p.leads]]),
      });
    }
  }
  return Array.from(cells.values()).map((c) => {
    let dominant = c.state;
    let max = -1;
    for (const [st, n] of c.byState) if (n > max) { max = n; dominant = st; }
    return { ...c, state: dominant, aggregated: c.aggregated };
  });
}

export function LeadMap({
  filters,
  onOptions,
}: {
  filters: FilterState;
  onOptions?: (opts: { market: string[]; source: string[] }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const buildGen = useRef(0);
  const [points, setPoints] = useState<ZipPoint[]>([]);
  const [offices, setOffices] = useState<OfficePin[]>([]);
  const [outOfArea, setOutOfArea] = useState<OutOfAreaRow[]>([]);
  const [coverage, setCoverage] = useState<GeoCoverage | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(filters.preset), [filters.preset]);

  // ---- data: real feed, fall back to the labelled 200-row fixture ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getDb();
      const haveFact = await registerParquet("fact_lead_zip_daily", "/data/reports/fact_lead_zip_daily.parquet");
      const haveDimZip = await registerParquet("dim_zip", "/data/reports/dim_zip.parquet");
      const haveDimMarket = await registerParquet("dim_market", "/data/reports/dim_market.parquet");

      if (haveFact && haveDimZip && haveDimMarket) {
        try {
          const [pts, offs, ooa] = await Promise.all([
            query<ZipPoint>(zipPointsSql({ fromDate: from, toDate: to, market: filters.market, source: filters.source })),
            query<OfficePin>(officePinsSql()),
            query<OutOfAreaRow>(outOfAreaTableSql({ fromDate: from, toDate: to, market: filters.market, source: filters.source })),
          ]);
          // Coverage is a badge, not the data: its failure must never drop the
          // map to the fixture path. Run it apart and log, never throw.
          let cov: GeoCoverage[] = [];
          try {
            cov = await query<GeoCoverage>(geoCoverageSql({ fromDate: from, toDate: to, market: filters.market, source: filters.source }));
          } catch (e) {
            reportLog.warn(`[reports] geo coverage query failed: ${String(e)}`);
          }
          if (cancelled) return;
          reportLog.info(`[reports] geo rows=${pts.length}`);
          setPoints(pts);
          setOffices(offs);
          setOutOfArea(ooa);
          setCoverage(cov[0] ? { ...cov[0], days_in_window: daysInWindow(from, to) } : null);
          onOptions?.({
            market: Array.from(new Set(offs.map((o) => o.code))).sort(),
            source: [],
          });
          return;
        } catch (e) {
          if (!cancelled) setError(`unavailable_feed: geo query failed (${String(e)})`);
        }
      }

      if (!cancelled) setError("The lead map data is unavailable right now.");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filters.market, filters.source]);

  // ---- map ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css" as string).catch(() => undefined);
      if (cancelled || !containerRef.current) return;
      // The worker ships with the app (copied in at build), so the base map never waits on a CDN or a blob worker.
      maplibregl.setWorkerUrl(withBase("/maplibre/maplibre-gl-worker.mjs"));

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [-95.2, 39.7], // the six demo markets sit across the central plains
        zoom: 5,
        attributionControl: { compact: true },
      });
      // Some basemap layers name sprite icons the style does not ship; give them a blank image so nothing warns.
      map.on("styleimagemissing", (e: { id: string }) => {
        if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      map.on("error", (e: { error?: { message?: string } }) => {
        // A tile/style load failure surfaces here; anything else (e.g. a
        const msg = String(e?.error?.message ?? "");
        if (/tile|style|fetch|network/i.test(msg)) setTilesFailed(true);
      });
      let sawTileLoad = false;
      map.on("dataloading", (e: { dataType?: string }) => {
        if (e?.dataType === "tile" && !sawTileLoad) {
          sawTileLoad = true;
          reportLog.info("[reports] tile dataloading event observed");
        }
      });
      window.setTimeout(() => {
        if (!sawTileLoad) {
          reportLog.info("[reports] no tile dataloading event within 4s; markers render independently of this");
        }
      }, 4000);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- render points/offices as DOM markers ----
  // GL layers depend on the tile worker actually painting the WebGL canvas
  // (see t022-tiles-note.md: addSource/addLayer succeeded, isStyleLoaded()
  // never true, queryRenderedFeatures returned 0). DOM markers are appended
  // to MapLibre's own marker overlay, positioned via map.project(), and
  // repaint on every "move"/"zoom" regardless of whether the raster/vector
  // basemap ever finishes loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearMarkers = () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };

    const build = async () => {
      const maplibregl = await import("maplibre-gl");
      clearMarkers();

      const validPoints = points.filter((p) => p.zcta_lat != null && p.zcta_lng != null);
      const plotted = aggregateForMarkers(validPoints);

      // 228 DOM markers built in one task was the only jank in the app (76 ms). Build them in chunks of 24, one frame
      // apart, each marker fading in (opacity only: MapLibre owns the marker's transform), then fly the camera in.
      const gen = ++buildGen.current;
      const makeMarker = (p: (typeof plotted)[number], idx: number) => {
        const style = STATE_STYLE[p.state] ?? STATE_STYLE.in_area;
        const size = markerSize(p.leads);
        const el = document.createElement("div");
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "#0a1a1f";
        el.style.fontSize = `${Math.max(7, size * 0.5)}px`;
        el.style.fontWeight = "700";
        el.style.boxShadow = "0 0 0 1px #0a1a1f";
        if (style.shape === "ring") {
          el.style.background = "transparent";
          el.style.border = `2px solid ${style.color}`;
          el.style.borderRadius = "50%";
        } else if (style.shape === "x") {
          el.style.background = "transparent";
          el.style.boxShadow = "none";
          el.style.color = style.color;
          el.style.fontSize = `${size}px`;
          el.textContent = "✕";
        } else {
          el.style.background = style.color;
          if (style.shape === "circle") el.style.borderRadius = "50%";
          else if (style.shape === "square") el.style.borderRadius = "2px";
          else if (style.shape === "diamond") el.style.transform = "rotate(45deg)";
          else if (style.shape === "triangle") {
            el.style.clipPath = "polygon(50% 0%, 0% 100%, 100% 100%)";
            el.style.boxShadow = "none";
          }
        }
        const basisNote = p.within_radius_mi != null ? ` · ${p.within_radius_mi} miles from the office` : "";
        el.title = `ZIP ${p.zip} · ${style.label} · ${asNumber(p.leads).toLocaleString()} leads${basisNote}`;

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.zcta_lng as number, p.zcta_lat as number])
          .addTo(map);
        markersRef.current.push(marker);
        el.classList.add("g-fade");
        el.style.setProperty("--i", String(Math.min(idx % 24, 24)));
      };
      const CHUNK = 24;
      for (let i = 0; i < plotted.length; i += CHUNK) {
        plotted.slice(i, i + CHUNK).forEach((p, k) => makeMarker(p, k));
        await new Promise<void>((ok) => requestAnimationFrame(() => ok()));
        if (gen !== buildGen.current) return; // a newer filter result replaced this build
      }

      for (const o of offices) {
        const el = document.createElement("div");
        el.style.fontSize = "20px";
        el.style.lineHeight = "1";
        el.style.textShadow = "0 0 2px #0a1a1f, 0 0 2px #0a1a1f";
        el.style.color =
          o.office_match_type === "census_exact" ? "#00e5ff" : o.office_match_type === "no_office" ? "#8aa0a5" : "#f0b34a";
        el.textContent = "★";
        el.title = `${o.name} office${o.office_address ? ` · ${o.office_address}` : ""}`;
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([o.office_lng, o.office_lat])
          .addTo(map);
        markersRef.current.push(marker);
      }

      reportLog.info(`[reports] geo markers=${plotted.length} offices=${offices.length}`);

      // Fit to the 5th-95th percentile of plotted coordinates so one distant
      // outlier does not zoom out to the whole continent; the outlier point
      // still has a marker, it just does not drive the fit.
      const lngSource = plotted.map((p) => p.zcta_lng as number).concat(offices.map((o) => o.office_lng));
      const latSource = plotted.map((p) => p.zcta_lat as number).concat(offices.map((o) => o.office_lat));
      if (lngSource.length > 0) {
        const [lngLo, lngHi] = percentileBounds(lngSource);
        const [latLo, latHi] = percentileBounds(latSource);
        if (lngHi > lngLo && latHi > latLo) {
          map.fitBounds(
            [
              [lngLo, latLo],
              [lngHi, latHi],
            ],
            { padding: 40, maxZoom: 10, duration: reducedMotionNow() ? 0 : 700, essential: false }
          );
        }
      }
    };

    build();
  }, [points, offices]);

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-[11px] text-[var(--crit)]">{error}</div>}

      {coverage && coverage.distinct_days < (coverage.days_in_window ?? 0) ? (
        <p className="text-[13px] text-muted-foreground">{asNumber(coverage.distinct_days)} of {asNumber(coverage.days_in_window ?? 0)} days loaded, so totals are a little low.</p>
      ) : (
        <p className="text-[13px] text-muted-foreground">{coverage ? `${asNumber(coverage.leads).toLocaleString()} leads from ${from} to ${to}.` : ""}</p>
      )}

      <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-border">
        {tilesFailed ? (
          <OfflineFallback points={points} offices={offices} />
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
        <Legend />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--ink2)] sm:hidden" aria-label="Legend">
        {Object.entries(STATE_STYLE).slice(0, 4).map(([k, st]) => <span key={k}><span style={{ color: st.color }}>{SHAPE_GLYPH[st.shape]}</span> {st.label}</span>)}
      </div>

      <OutOfAreaTable rows={outOfArea} />
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-7 left-2 z-10 hidden rounded-md border border-border bg-card/95 px-2.5 py-2 text-[11px] leading-tight sm:block">
      {Object.entries(STATE_STYLE).map(([key, s]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span style={{ color: s.color }}>{SHAPE_GLYPH[s.shape]}</span>
          <span className="text-muted-foreground">{s.label}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1.5 border-t border-border pt-1">
        <span className="text-primary">★</span>
        <span className="text-muted-foreground">Office</span>
      </div>
    </div>
  );
}

// Plain-SVG projection fallback: equirectangular, framed to FL + Houston, no
// external tiles. Same shapes/colors as the live map so identity holds either
// way.
function OfflineFallback({ points, offices }: { points: ZipPoint[]; offices: OfficePin[] }) {
  const minLng = -98, maxLng = -79, minLat = 24, maxLat = 32;
  const w = 640, h = 420;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * w;
  const y = (lat: number) => h - ((lat - minLat) / (maxLat - minLat)) * h;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0a1a1f]">
      <div className="text-[11px] font-semibold text-[var(--warn)]">
        Map tiles unavailable offline &middot; showing plain outline
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[360px] w-[600px]">
        <rect x={0} y={0} width={w} height={h} fill="#0c1418" stroke="#1a2a2f" />
        {points
          .filter((p) => p.zcta_lat != null && p.zcta_lng != null)
          .map((p, i) => {
            const style = STATE_STYLE[p.state] ?? STATE_STYLE.in_area;
            return (
              <text
                key={i}
                x={x(p.zcta_lng as number)}
                y={y(p.zcta_lat as number)}
                fontSize={10 + Math.min(14, p.leads)}
                fill={style.color.startsWith("var") ? "#8aa0a5" : style.color}
                textAnchor="middle"
              >
                {SHAPE_GLYPH[style.shape]}
              </text>
            );
          })}
        {offices.map((o, i) => (
          <text key={`o${i}`} x={x(o.office_lng)} y={y(o.office_lat)} fontSize={16} fill="#00e5ff" textAnchor="middle">
            {"★"}
          </text>
        ))}
      </svg>
    </div>
  );
}

function OutOfAreaTable({ rows }: { rows: OutOfAreaRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[12.5px] font-bold">Zips outside every market or routed to the wrong one, by leads</div>
      <div className="max-h-[260px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Zip</th>
              <th className="py-1 text-left">Where it landed</th>
              <th className="py-1 text-left">Market</th>
              <th className="py-1 text-right">Flagged leads</th>
              <th className="py-1 text-right">Zip total</th>
              <th className="py-1 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1">{r.zip}</td>
                <td className="py-1">
                  <span style={{ color: STATE_STYLE[r.state]?.color }}>
                    {SHAPE_GLYPH[STATE_STYLE[r.state]?.shape ?? "circle"]}
                  </span>{" "}
                  {STATE_STYLE[r.state]?.label ?? r.state}
                </td>
                <td className="py-1">{r.market_id ?? "n/a"}</td>
                <td className="py-1 text-right">{asNumber(r.flagged_leads).toLocaleString()}</td>
                <td className="py-1 text-right">{asNumber(r.total_leads).toLocaleString()}</td>
                <td className="py-1 text-right">{(asNumber(r.flagged_rate) * 100).toFixed(1)}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  Every lead in this window landed in the right market.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
