// ESPN public JSON adapter. Keyless, once-daily batch use.
// Everything downstream consumes the normalized shapes returned here, so if ESPN
// ever breaks mid-tournament, only this file changes (fallback: API-Football Pro).

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026";
const SEASON_RANGE = "20260611-20260719";

// ESPN labels every event with its round in `season.slug` — verified across all
// 104 events of the live 2026 feed (group-stage ×72, round-of-32 ×16,
// round-of-16 ×8, quarterfinals ×4, semifinals ×2, 3rd-place-match, final).
const SLUG_STAGE = {
  "group-stage": "GROUP",
  "round-of-32": "R32",
  "round-of-16": "R16",
  "quarterfinals": "QF",
  "semifinals": "SF",
  "3rd-place-match": "THIRD",
  "final": "FINAL",
};

// Date-based fallback only, for events missing a recognizable slug. CAUTION:
// the date is UTC, and late North American kickoffs roll past UTC midnight —
// e.g. the Jun 27 9pm CT group games land on Jun 28 UTC and would be called
// R32 here. The slug is authoritative; this only breaks ties ESPN won't label.
function stageOf(dateUTC) {
  const d = dateUTC.slice(0, 10); // YYYY-MM-DD
  if (d < "2026-06-28") return "GROUP";
  if (d < "2026-07-04") return "R32";
  if (d < "2026-07-08") return "R16";
  if (d < "2026-07-13") return "QF";
  if (d < "2026-07-17") return "SF";
  if (d < "2026-07-19") return "THIRD";
  return "FINAL";
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "wc26-pool-daily-update" } });
  if (!r.ok) throw new Error(`ESPN ${r.status} for ${url}`);
  return r.json();
}

// One side of a match. `winner` is ESPN's flag (true after shootouts too).
function side(comp, homeAway) {
  const c = comp.competitors.find((x) => x.homeAway === homeAway);
  return {
    id: c.team.id,
    name: c.team.displayName,
    score: c.score != null ? Number(c.score) : null,
    winner: c.winner === true,
  };
}

// Per-team event tallies from the details array (only present once played).
// NOTE: own-goal team attribution must be verified against the first real own
// goal of the tournament — raw details are kept in `rawDetails` for audit.
function tallies(comp) {
  const out = {}; // teamId -> { cy, cr, og }
  for (const c of comp.competitors) out[c.team.id] = { cy: 0, cr: 0, og: 0 };
  for (const d of comp.details || []) {
    const tid = d.team?.id;
    if (!tid || !out[tid]) continue;
    if (d.yellowCard) out[tid].cy += 1;
    if (d.redCard) out[tid].cr += 1;
    if (d.ownGoal) out[tid].og += 1;
  }
  return out;
}

export async function fetchSeason() {
  const sb = await getJSON(`${BASE}/scoreboard?dates=${SEASON_RANGE}&limit=300`);
  const matches = (sb.events || []).map((e) => {
    const comp = e.competitions[0];
    const state = e.status?.type?.state; // "pre" | "in" | "post"
    return {
      id: e.id,
      dateUTC: e.date,
      stage: SLUG_STAGE[e.season?.slug] || stageOf(e.date),
      completed: state === "post",
      home: side(comp, "home"),
      away: side(comp, "away"),
      venueCity: comp.venue?.address?.city || "",
      venueName: comp.venue?.fullName || "",
      tallies: state === "post" ? tallies(comp) : {},
      rawDetails: state === "post" ? comp.details || [] : [],
    };
  });
  matches.sort((a, b) => a.dateUTC.localeCompare(b.dateUTC));
  return matches;
}

export async function fetchStandings() {
  const d = await getJSON(STANDINGS);
  return (d.children || []).map((g) => ({
    group: g.name,
    entries: (g.standings?.entries || []).map((en) => {
      const stat = (n) => en.stats?.find((s) => s.name === n)?.value;
      return {
        team: en.team.displayName,
        teamId: en.team.id,
        played: stat("gamesPlayed") ?? 0,
        points: stat("points") ?? 0,
        gd: stat("pointDifferential") ?? 0,
        rank: stat("rank") ?? en.stats?.find((s) => s.name === "rank")?.value ?? null,
      };
    }),
  }));
}
