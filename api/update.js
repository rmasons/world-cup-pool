// The daily update pipeline — server-side replacement for the artifact's
// AI-driven runUpdate(). Pulls real data from ESPN, computes TeamStats
// deterministically, generates the day's content, and persists the pool.
//
// Triggers:
//   GET  — Vercel Cron (guarded by CRON_SECRET when set). Treated as auto.
//   POST — the frontend's "Update now" button ({auto:1} from the morning
//          auto-trigger, {auto:0} from a human press).
// Auto runs no-op if the pool is already fresh today or the tournament is over.
import { kvGet, kvSet, kvConfigured } from "../lib/redis.js";
import { fetchSeason, fetchStandings } from "../lib/espn.js";
import { computeStatsMap } from "../lib/stats.js";
import { buildContent, ctDateKey, ctStamp } from "../lib/news.js";
import { attachOdds } from "../lib/odds.js";

export default async function handler(req, res) {
  if (!kvConfigured()) return res.status(500).json({ error: "storage not configured" });

  const isCron = req.method === "GET";
  if (isCron && process.env.CRON_SECRET) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
  } else if (req.method !== "POST" && !isCron) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  try {
    const prev = JSON.parse((await kvGet("wc26:pool")) || "{}");
    const auto = isCron || Boolean(req.body && req.body.auto);
    const today = ctDateKey();

    if (auto && (prev.tournamentOver || prev.lastDay === today)) {
      return res.status(200).json({ pool: prev, skipped: true });
    }

    // Soft throttle so a stuck client can't hammer ESPN: at most one run per 2 minutes.
    const lock = await kvGet("wc26:lock");
    if (lock && Date.now() - Number(JSON.parse(lock)) < 2 * 60 * 1000 && auto) {
      return res.status(200).json({ pool: prev, skipped: true });
    }
    await kvSet("wc26:lock", JSON.stringify(Date.now()));

    const rosters = prev.rosters || [];
    const rosterTeams = [...new Set(rosters.flatMap((p) => p.teams))];

    const [matches, standings] = await Promise.all([fetchSeason(), fetchStandings()]);
    const { statsMap, tournamentOver, firstOut } = computeStatsMap(rosterTeams, matches, standings);
    const { stories, daySummary, upGames, teamFx } = buildContent(matches, rosterTeams, statsMap);
    const upWithOdds = await attachOdds(upGames);

    const pool = {
      ...prev,
      rosters,
      statsMap,
      teamFx,
      stories,
      daySummary,
      upGames: upWithOdds,
      lastUpdated: ctStamp(),
      lastDay: today,
      tournamentOver,
    };
    await kvSet("wc26:pool", JSON.stringify(pool));
    // Audit trail for the contested calls (first-out, own goals) — not user-facing.
    await kvSet("wc26:audit", JSON.stringify({ at: ctStamp(), firstOut, completed: matches.filter((m) => m.completed).length }));

    return res.status(200).json({ pool });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
