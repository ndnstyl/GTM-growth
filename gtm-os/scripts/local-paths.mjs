// Where the build finds its sources. Order: environment variable, then build.local.json (this machine only, never
// committed), then a path inside the repository. Nothing here names a machine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let local = {};
const file = path.join(APP, "build.local.json");
if (fs.existsSync(file)) {
  try { local = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error(`build: ${file} is not valid JSON (${e.message}). The build is refused.`); process.exit(2); }
}
export function where(key, envName, fallback) {
  return process.env[envName] || local[key] || fallback;
}
