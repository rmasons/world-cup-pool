// One-time seed: rosters (from the pool's draft sheet) + the static preseason
// forecast (bookmaker-consensus, written by hand before kickoff — replaces the
// AI-generated forecast; live projections take over after the first matches).
//
// Usage: node scripts/seed.mjs            (reads UPSTASH_* from .env.local or env)
//        node scripts/seed.mjs --dry      (print the pool JSON, write nothing)
import { readFileSync, existsSync } from "node:fs";

// Load .env.local if present (no dotenv dependency)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ROSTERS = [
  { name: "Jared Bruns", teams: ["Spain", "DR Congo"] },
  { name: "Conner Gajan", teams: ["Portugal", "Uzbekistan"] },
  { name: "Kirsten Davis", teams: ["France", "Ecuador"] },
  { name: "Ellie Gajan", teams: ["Brazil", "Uruguay"] },
  { name: "Kelly Wilson", teams: ["England", "South Korea"] },
  { name: "Jordyn Kerr", teams: ["Austria", "Slovakia"] }, // ⚠ Slovakia did not qualify — confirm with the group
  { name: "Mason Russell", teams: ["Germany", "Canada"] },
  { name: "Jared Kerr", teams: ["Netherlands", "Norway"] },
  { name: "Brent Wilson", teams: ["United States", "Tunisia"] },
  { name: "Christian Griffith", teams: ["Argentina", "Haiti"] },
  { name: "Alyssa Griffith", teams: ["Belgium", "Croatia"] },
  { name: "Macie Haack", teams: ["Sweden", "Japan"] }, // draft sheet said "Sweeden" — corrected
  { name: "Chris Haack", teams: ["Ivory Coast", "Morocco"] },
];

// st: furthest stage (GRP/R32/R16/QF/SF/F/CH, one CH max), gw/gd: expected group
// results, uw: expected top-10 upsets. Bookmaker-consensus, entertainment only.
const FORECAST = {
  "Spain":         { t: "Spain",         st: "CH",  gw: 3, gd: 0, uw: 2 },
  "France":        { t: "France",        st: "F",   gw: 3, gd: 0, uw: 1 },
  "Argentina":     { t: "Argentina",     st: "SF",  gw: 3, gd: 0, uw: 1 },
  "England":       { t: "England",       st: "SF",  gw: 2, gd: 1, uw: 1 },
  "Brazil":        { t: "Brazil",        st: "QF",  gw: 2, gd: 1, uw: 1 },
  "Portugal":      { t: "Portugal",      st: "QF",  gw: 3, gd: 0, uw: 0 },
  "Germany":       { t: "Germany",       st: "QF",  gw: 2, gd: 1, uw: 0 },
  "Netherlands":   { t: "Netherlands",   st: "QF",  gw: 2, gd: 1, uw: 0 },
  "Morocco":       { t: "Morocco",       st: "R16", gw: 2, gd: 1, uw: 1 },
  "Belgium":       { t: "Belgium",       st: "R16", gw: 2, gd: 0, uw: 0 },
  "Uruguay":       { t: "Uruguay",       st: "R16", gw: 2, gd: 0, uw: 0 },
  "Croatia":       { t: "Croatia",       st: "R16", gw: 1, gd: 2, uw: 0 },
  "United States": { t: "United States", st: "R16", gw: 2, gd: 1, uw: 0 },
  "Japan":         { t: "Japan",         st: "R16", gw: 2, gd: 0, uw: 0 },
  "Norway":        { t: "Norway",        st: "R16", gw: 2, gd: 0, uw: 0 },
  "South Korea":   { t: "South Korea",   st: "R32", gw: 1, gd: 1, uw: 0 },
  "Ecuador":       { t: "Ecuador",       st: "R32", gw: 1, gd: 1, uw: 0 },
  "Canada":        { t: "Canada",        st: "R32", gw: 1, gd: 1, uw: 0 },
  "Austria":       { t: "Austria",       st: "R32", gw: 1, gd: 1, uw: 0 },
  "Sweden":        { t: "Sweden",        st: "R32", gw: 1, gd: 1, uw: 0 },
  "Ivory Coast":   { t: "Ivory Coast",   st: "R32", gw: 1, gd: 1, uw: 0 },
  "Uzbekistan":    { t: "Uzbekistan",    st: "GRP", gw: 0, gd: 1, uw: 0 },
  "Tunisia":       { t: "Tunisia",       st: "GRP", gw: 0, gd: 1, uw: 0 },
  "DR Congo":      { t: "DR Congo",      st: "GRP", gw: 0, gd: 1, uw: 0 },
  "Haiti":         { t: "Haiti",         st: "GRP", gw: 0, gd: 0, uw: 0 },
  "Slovakia":      { t: "Slovakia",      st: "GRP", gw: 0, gd: 0, uw: 0 }, // not in the tournament — see roster note
};

const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
const pool = {
  rosters: ROSTERS,
  statsMap: {},
  teamFx: {},
  stories: [],
  daySummary: "",
  upGames: [],
  forecast: FORECAST,
  forecastAt: stamp,
  lastUpdated: null,
  lastDay: null,
  tournamentOver: false,
};

if (process.argv.includes("--dry")) {
  console.log(JSON.stringify(pool, null, 2));
  process.exit(0);
}

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (set them in .env.local)");
  process.exit(1);
}

const existing = await fetch(`${URL_}/get/${encodeURIComponent("wc26:pool")}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
if (existing.result && !process.argv.includes("--force")) {
  console.error("wc26:pool already exists — re-run with --force to overwrite it.");
  process.exit(1);
}

const r = await fetch(`${URL_}/set/${encodeURIComponent("wc26:pool")}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify(pool),
});
console.log(r.ok ? "Seeded wc26:pool ✓ (13 players, 26 teams, preseason forecast)" : `Seed failed: ${r.status}`);
