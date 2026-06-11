// Pre-game win probabilities for TODAY's matches only, from The-Odds-API h2h
// markets (free tier; ~1 credit per daily call). Entirely optional: if the key
// is missing or the call fails, games simply render without odds — exactly how
// the frontend already displays future games.
import { deburr } from "./teams.js";

const SPORT = "soccer_fifa_world_cup";

export async function attachOdds(upGames) {
  const key = process.env.ODDS_API_KEY;
  const todays = upGames.filter((g) => g.td === 1);
  if (!key || !todays.length) return upGames;

  let events;
  try {
    const r = await fetch(`https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=us&markets=h2h&oddsFormat=decimal&apiKey=${key}`);
    if (!r.ok) throw new Error(`odds api ${r.status}`);
    events = await r.json();
    // Quota-exceeded and error bodies arrive as 200 + JSON object — without
    // this check they'd throw below, outside the catch, and 502 the whole pool.
    if (!Array.isArray(events)) throw new Error("odds api: non-array response");
  } catch {
    return upGames; // odds are decorative — never fail the update over them
  }

  return upGames.map((g) => {
    if (g.td !== 1) return strip(g);
    const ev = events.find((e) =>
      (sameTeam(e.home_team, g.a) && sameTeam(e.away_team, g.b)) ||
      (sameTeam(e.home_team, g.b) && sameTeam(e.away_team, g.a))
    );
    if (!ev) return strip(g);

    // Average implied probabilities across bookmakers, normalized to ~100.
    const sums = { a: [], d: [], b: [] };
    for (const bk of ev.bookmakers || []) {
      const mkt = bk.markets?.find((m) => m.key === "h2h");
      if (!mkt) continue;
      for (const o of mkt.outcomes) {
        const p = 1 / o.price;
        if (sameTeam(o.name, g.a)) sums.a.push(p);
        else if (sameTeam(o.name, g.b)) sums.b.push(p);
        else sums.d.push(p); // "Draw"
      }
    }
    const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    let pa = avg(sums.a), pd = avg(sums.d), pb = avg(sums.b);
    const total = pa + pd + pb;
    if (!total) return strip(g);
    pa = Math.round((pa / total) * 100); pd = Math.round((pd / total) * 100); pb = Math.round((pb / total) * 100);
    const knockout = g._stage && g._stage !== "GROUP"; // rules: no draw probability where a draw can't stand
    return knockout ? { ...strip(g), pa, pb } : { ...strip(g), pa, pd, pb };
  });
}

const strip = ({ _id, _stage, ...g }) => g; // internal fields never reach storage

// The-Odds-API spellings that diverge from ours (verified against the live feed
// on June 10, 2026 — these four are the only mismatches among all 48 teams).
const ALIASES = {
  "usa": "united states",
  "czech republic": "czechia",
  "bosnia & herzegovina": "bosnia and herzegovina",
  "turkey": "turkiye",
};
const norm = (x) => { const d = deburr(x); return ALIASES[d] || d; };
const sameTeam = (x, y) => {
  const a = norm(x), b = norm(y);
  return a === b || a.includes(b) || b.includes(a);
};
