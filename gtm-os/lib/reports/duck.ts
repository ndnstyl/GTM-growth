// DuckDB-WASM singleton, bundled locally (no CDN). Assets ship from public/duckdb/ and are served
// at /gtm-os/duckdb/*.wasm and *.worker.js: same origin, no external fetch.
"use client";

import * as duckdb from "@duckdb/duckdb-wasm";
import { BASE } from "@/lib/demo/base";

export type ManifestFile = {
  rows: number;
  status: string;
  confidence_summary: Record<string, number>;
  sha256: string;
};
export type Manifest = {
  producer: string;
  as_of: string;
  files: Record<string, ManifestFile>;
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
const registered = new Set<string>();

async function initDb(): Promise<duckdb.AsyncDuckDB> {
  const bundle = {
    mainModule: `${BASE}/duckdb/duckdb-eh.wasm?v=2`,
    // ?v=2: a new cache key, so Cloudflare serves the worker with the current security policy (it allows WebAssembly)
    mainWorker: `${BASE}/duckdb/duckdb-browser-eh.worker.js?v=2`,
  };
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  // the parquet extension from extensions.duckdb.org on the first
  // read_parquet: an external fetch the runtime capture caught live. The
  // extension is vendored under public/duckdb-ext (same version path layout);
  // install+load here makes it database-wide before any feed registers.
  const init = await db.connect();
  try {
    await init.query(`SET custom_extension_repository = '${window.location.origin}${BASE}/duckdb-ext'`);
    await init.query("SET autoinstall_extension_repository = 'custom'");
    await init.query("INSTALL parquet; LOAD parquet");
  } finally {
    await init.close();
  }
  return db;
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = getDb().then((db) => db.connect());
  }
  return connPromise;
}

export async function loadManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch("/data/reports/_manifest.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Manifest;
  } catch {
    return null;
  }
}

export async function registerParquet(name: string, url: string): Promise<boolean> {
  if (registered.has(name)) return true;
  const db = await getDb();
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return false;
    const buf = new Uint8Array(await resp.arrayBuffer());
    await db.registerFileBuffer(`${name}.parquet`, buf);
    const conn = await getConn();
    await conn.query(
      `CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet('${name}.parquet')`
    );
    registered.add(name);
    return true;
  } catch {
    return false;
  }
}

// Arrow hands back BigInt for DuckDB's 64-bit integers (count(*), cents);
// JSON.stringify throws on BigInt, so every value is normalized here, once.
// DuckDB's SUM over int64 yields HUGEINT/DECIMAL, which Arrow hands back as a
// 4-word Uint32Array (little-endian 128-bit two's complement) or a bigint.
function int128ToNumber(words: ArrayLike<number>): number {
  const B32 = BigInt(32);
  let v = BigInt(0);
  for (let i = 3; i >= 0; i--) v = (v << B32) | BigInt(words[i] >>> 0);
  const two127 = BigInt(1) << BigInt(127);
  if (v >= two127) v -= two127 * BigInt(2);
  return Number(v);
}

/** The engine runs in a worker with the real clock; the demo's "today" is the shifted one, so every
 *  current_date in a report query becomes that day as a literal. */
function anchorToday(sql: string): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return sql.replace(/\bcurrent_date\b/gi, `DATE '${iso}'`);
}

function plain(v: unknown): unknown {
  if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const a = v as unknown as ArrayLike<number>;
    return a.length === 4 ? int128ToNumber(a) : Array.from(a);
  }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof (o as { toJSON?: unknown }).toJSON === "function") return plain((o as { toJSON: () => unknown }).toJSON());
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = plain(o[k]);
    return out;
  }
  return v;
}

// Arrow returns DATE as epoch milliseconds and TIMESTAMP as epoch micros or
// a Date; the page wants ISO strings, decided from the result schema so an
// integer column is never mistaken for a date.
function dateFormatters(result: { schema: { fields: { name: string; type: unknown }[] } }) {
  const fmt: Record<string, (v: unknown) => unknown> = {};
  for (const f of result.schema.fields) {
    const t = String(f.type);
    if (t.startsWith("Date")) {
      fmt[f.name] = (v) => {
        if (v == null) return null;
        const d = v instanceof Date ? v : new Date(typeof v === "bigint" ? Number(v) : (v as number));
        return isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
      };
    } else if (t.startsWith("Decimal")) {
      const m = /Decimal<(\d+),\s*(\d+)>/.exec(t) || /scale[^\d]*(\d+)/i.exec(t);
      const scale = m ? Number(m[2] ?? m[1]) : 0;
      fmt[f.name] = (v) => {
        if (v == null) return null;
        const n = typeof v === "number" ? v : Number(String(v));
        return isNaN(n) ? v : n / Math.pow(10, scale);
      };
    } else if (t.startsWith("Timestamp")) {
      // apache-arrow's row.toJSON() already converts any Timestamp unit to
      // epoch milliseconds, so the value is never divided here.
      fmt[f.name] = (v) => {
        if (v == null) return null;
        if (v instanceof Date) return v.toISOString();
        const n = typeof v === "bigint" ? Number(v) : (v as number);
        const d = new Date(n);
        return isNaN(d.getTime()) ? v : d.toISOString();
      };
    }
  }
  return fmt;
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConn();
  const result = await conn.query(anchorToday(sql));
  const fmt = dateFormatters(result as unknown as { schema: { fields: { name: string; type: unknown }[] } });
  return result.toArray().map((row) => {
    const o = plain(row.toJSON()) as Record<string, unknown>;
    for (const k of Object.keys(fmt)) if (k in o) o[k] = fmt[k](o[k]);
    return o as T;
  });
}

