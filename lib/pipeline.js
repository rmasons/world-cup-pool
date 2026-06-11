// The whole pool, computed fresh from live data — stateless by design.
// ESPN's season query returns the complete tournament every time, so there is
// nothing to persist: a "missed day" cannot exist, and bad data heals itself
// on the next request.
import { fetchSeason, fetchStandings } from "./espn.js";
import { computeStatsMap } from "./stats.js";
import { buildContent, ctDateKey, ctStamp } from "./news.js";
import { attachOdds } from "./odds.js";
import { ROSTERS, FORECAST, FORECAST_AT } from "./config.js";

export async function buildPool() {
  const rosterTeams = [...new Set(ROSTERS.flatMap((p) => p.teams))];
  const [matches, standings] = await Promise.all([fetchSeason(), fetchStandings()]);
  const { statsMap, tournamentOver, firstOut } = computeStatsMap(rosterTeams, matches, standings);
  const { stories, daySummary, upGames, teamFx } = buildContent(matches, rosterTeams, statsMap);
  const upWithOdds = await attachOdds(upGames);

  // Audit trail for the contested calls lands in Vercel function logs.
  if (firstOut) console.log(`[audit] first-out: ${firstOut}`);
  const ownGoals = matches.filter((m) => m.rawDetails.some((d) => d.ownGoal));
  if (ownGoals.length) console.log(`[audit] own-goal matches: ${JSON.stringify(ownGoals.map((m) => ({ id: m.id, details: m.rawDetails.filter((d) => d.ownGoal) })))}`);

  return {
    rosters: ROSTERS,
    statsMap,
    teamFx,
    stories,
    daySummary,
    upGames: upWithOdds,
    forecast: FORECAST,
    forecastAt: FORECAST_AT,
    lastUpdated: ctStamp(),
    lastDay: ctDateKey(),
    tournamentOver,
  };
}
