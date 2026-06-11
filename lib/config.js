// Pool configuration — the only true state in the system. Everything else is
// recomputed from live ESPN data on every (CDN-cached) request.
//
// To change a roster (e.g. the Slovakia question): edit here and push, OR set
// the POOL_ROSTERS / POOL_FORECAST env vars in Vercel to a JSON string and
// redeploy — env vars win over the defaults below.

const fromEnv = (key) => {
  const v = process.env[key];
  if (!v) return null;
  try { return JSON.parse(v); } catch { console.warn(`${key} is not valid JSON — using built-in default`); return null; }
};

export const ROSTERS = fromEnv("POOL_ROSTERS") || [
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

// Static preseason forecast, hand-written from bookmaker consensus before
// kickoff (no runtime AI). st: furthest stage (GRP/R32/R16/QF/SF/F/CH, one CH
// max), gw/gd: expected group results, uw: expected top-10 upsets. The app
// switches to live rules-based projections after the first matches.
export const FORECAST = fromEnv("POOL_FORECAST") || {
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

export const FORECAST_AT = "6/10/2026, 9:00:00 PM"; // when the consensus was taken
