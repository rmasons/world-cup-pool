// Deterministic content generation from match data — replaces the AI's
// news/recap/schedule job. Tone is box-score, facts are never invented.
import { espnLookup, isTop10, displayName } from "./teams.js";

const CT = "America/Chicago";

export const ctDateKey = (d = new Date()) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: CT, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`; // matches the frontend's todayKey() shape
};

export const ctStamp = (d = new Date()) => d.toLocaleString("en-US", { timeZone: CT });

const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: CT, month: "short", day: "numeric" }); // "Jun 12"
const kickoff = (iso) => `${new Date(iso).toLocaleTimeString("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" })} CT`; // "2:00 PM CT"
const onCTDay = (iso, key) => ctDateKey(new Date(iso)) === key;

const scoreline = (m) => `${m.home.name} ${m.home.score}-${m.away.score} ${m.away.name}`;

function storyFor(m, poolTeams) {
  const winner = m.home.winner ? m.home : m.away.winner ? m.away : null;
  const loser = winner ? (winner === m.home ? m.away : m.home) : null;
  const diff = Math.abs((m.home.score ?? 0) - (m.away.score ?? 0));
  let h;
  if (winner && isTop10(loser.name) && !isTop10(winner.name)) h = `Upset: ${winner.name} take down ${loser.name}`;
  else if (winner && diff >= 4) h = `${winner.name} run riot against ${loser.name}`;
  else if (winner && diff >= 3) h = `${winner.name} cruise past ${loser.name}`;
  else if (!winner) h = `${m.home.name} and ${m.away.name} share the points`;
  else h = `${winner.name} edge ${loser.name}`;
  const where = m.venueCity ? ` in ${m.venueCity}` : "";
  const s = `${scoreline(m)}${where}. ${winner ? `${winner.name} take the result` : "Honors even"}${poolTeams.has(m.home.name) || poolTeams.has(m.away.name) ? " — pool points on the move." : "."}`;
  return { h, s };
}

// Interest ranking: upsets, then blowouts, then pool-team involvement, then recency.
function rankMatches(ms, poolTeams) {
  const score = (m) => {
    const winner = m.home.winner ? m.home : m.away.winner ? m.away : null;
    const loser = winner === m.home ? m.away : m.home;
    let n = 0;
    if (winner && isTop10(loser.name) && !isTop10(winner.name)) n += 100;
    n += Math.abs((m.home.score ?? 0) - (m.away.score ?? 0)) * 10;
    if (poolTeams.has(m.home.name)) n += 5;
    if (poolTeams.has(m.away.name)) n += 5;
    return n;
  };
  return [...ms].sort((a, b) => score(b) - score(a));
}

export function buildContent(matches, rosterTeams, statsMap) {
  const lookup = espnLookup(rosterTeams);
  const poolTeams = new Set(matches.flatMap((m) => [m.home.name, m.away.name]).filter((n) => lookup.toRoster(n)));

  const todayKeyCT = ctDateKey();
  const yesterdayKeyCT = ctDateKey(new Date(Date.now() - 24 * 3600 * 1000));
  const completed = matches.filter((m) => m.completed);
  const yesterdays = completed.filter((m) => onCTDay(m.dateUTC, yesterdayKeyCT));
  const recent = yesterdays.length ? yesterdays : completed.slice(-6); // fall back to most recent results

  // --- stories (exactly 3) + daily recap ---
  let stories, daySummary;
  if (recent.length) {
    const ranked = rankMatches(recent, poolTeams);
    stories = ranked.slice(0, 3).map((m) => storyFor(m, poolTeams));
    const lines = ranked.slice(0, 3).map(scoreline);
    daySummary = `${yesterdays.length ? "Yesterday" : "Most recently"} at the World Cup: ${lines.join("; ")}.` +
      (recent.length > 3 ? ` ${recent.length - 3} more result${recent.length - 3 > 1 ? "s" : ""} in the books.` : "");
  } else {
    // Pre-tournament / no results yet: preview the next fixtures instead.
    const next = matches.filter((m) => !m.completed).slice(0, 3);
    stories = next.map((m) => ({
      h: `${m.home.name} meet ${m.away.name}${m.venueCity ? ` in ${m.venueCity}` : ""}`,
      s: `${shortDate(m.dateUTC)}, ${kickoff(m.dateUTC)}${m.venueName ? ` at ${m.venueName}` : ""}. ${poolTeams.has(m.home.name) || poolTeams.has(m.away.name) ? "Pool points at stake." : "One to watch."}`,
    }));
    while (stories.length < 3) stories.push({ h: "The 2026 World Cup is here", s: "48 teams, 104 matches, three host nations. The pool scoreboard updates every morning." });
    daySummary = "No completed matches yet — the tournament kicks off June 11 with hosts Mexico facing South Africa.";
  }

  // --- upcoming games: ALL of today's, then the next 3 future ones, max 9 ---
  const todays = matches.filter((m) => !m.completed && onCTDay(m.dateUTC, todayKeyCT));
  const future = matches.filter((m) => !m.completed && ctDateKey(new Date(m.dateUTC)) !== todayKeyCT && new Date(m.dateUTC) > new Date());
  const upGames = [
    ...todays.map((m) => ({ iso: m.dateUTC, d: shortDate(m.dateUTC), k: kickoff(m.dateUTC), a: lookup.toRoster(m.home.name) || displayName(m.home.name), b: lookup.toRoster(m.away.name) || displayName(m.away.name), v: m.venueCity, td: 1, _id: m.id, _stage: m.stage })),
    ...future.slice(0, 3).map((m) => ({ iso: m.dateUTC, d: shortDate(m.dateUTC), k: kickoff(m.dateUTC), a: lookup.toRoster(m.home.name) || displayName(m.home.name), b: lookup.toRoster(m.away.name) || displayName(m.away.name), v: m.venueCity, td: 0 })),
  ].slice(0, 9);

  // --- per-team upcoming schedule (skip eliminated teams, clear their lists) ---
  const teamFx = {};
  for (const t of rosterTeams) {
    if (statsMap[t]?.elim) { teamFx[t] = []; continue; }
    teamFx[t] = matches
      .filter((m) => !m.completed && (lookup.toRoster(m.home.name) === t || lookup.toRoster(m.away.name) === t))
      .slice(0, 2)
      .map((m) => ({
        iso: m.dateUTC,
        d: shortDate(m.dateUTC),
        k: kickoff(m.dateUTC),
        o: lookup.toRoster(m.home.name) === t ? (lookup.toRoster(m.away.name) || displayName(m.away.name)) : (lookup.toRoster(m.home.name) || displayName(m.home.name)),
        v: m.venueCity,
      }));
  }

  return { stories, daySummary, upGames, teamFx };
}
