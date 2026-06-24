# 2026 World Cup Pool

Self-updating scoreboard for a 13-player World Cup pool. Originally built as a Claude
artifact (see `docs/WORLD-CUP-POOL-DOCS.md` for the full build history); now hosted on
Vercel with the AI data pipeline replaced by real sports data.

## Architecture — stateless on purpose

There is no database. ESPN's season query returns the complete tournament every time,
and the stats computation is deterministic, so the pool is recomputed from live data
on every request and cached at Vercel's CDN. A "missed update" cannot exist; bad data
heals itself on the next request.

```
browser ─► window.storage shim (src/main.jsx)
              ├─ reads  ─► GET  /api/pool    (CDN-cached 15 min + SWR)
              └─ writes ─► rejected (config is code — see below)
"Update now" button ─────► POST /api/update  (same computation, never cached)
                                  │
                                  ▼
                          lib/pipeline.js
                            ├─ lib/espn.js   — ESPN public JSON (results, events, fixtures, standings)
                            ├─ lib/stats.js  — deterministic TeamStats from match data
                            ├─ lib/news.js   — auto-generated stories/recap/schedules
                            ├─ lib/odds.js   — The-Odds-API win probabilities (optional)
                            └─ lib/config.js — rosters + preseason forecast (the only true state)
```

All pool-point math runs client-side in `lib/scoring.js` (`computeAll` / `teamBasePoints`,
imported by the component) — the backend only reports facts, exactly the design principle of
the original. The scoring engine is a pure, UI-free module (it takes `flag` as an injected
parameter) with a Vitest suite covering the rulebook and edge cases — run it with `npm test`.

## Deploy

1. Push to GitHub, import in Vercel (framework: Vite — auto-detected). That's it.
2. Optional env vars: `ODDS_API_KEY` (the-odds-api.com free tier — win % chips on
   today's games), `POOL_ROSTERS` / `POOL_FORECAST` (JSON overrides for `lib/config.js`;
   redeploy to apply).

## Changing rosters

The in-app Pool Setup editor has been removed — config is code. Changes happen in
`lib/config.js` (edit + push) or the `POOL_ROSTERS` env var (edit + redeploy).
Spelling fixes are safe — stats are keyed by whatever the config says, recomputed
fresh every request.

## Post-deploy sanity checklist

- [ ] Site loads in an incognito window (no sign-in of any kind)
- [ ] Passcode gate appears first; code unlocks it
- [ ] Standings show all 13 players with flags
- [ ] "Update now" completes and stamps "Last updated"
- [ ] Schedules section lists each team's next group games
- [ ] After the first matchday: scores, recap, and stories reflect real results

## Decisions & honest caveats (read before arguing about points)

- **ESPN's API is unofficial.** Keyless and stable for years, but no SLA. The CDN cache
  keeps our request rate trivial. If it breaks, swap `lib/espn.js` for an API-Football
  Pro adapter ($19/mo) — everything downstream is vendor-neutral.
- **Event detail shape** (cards / own goals in `details[]`) is parsed from ESPN's match
  detail feed, with own-goal raw details logged to Vercel function logs (`[audit]`). The
  group stage is now underway, so this runs against live 2026 data rather than community docs.
- **Own-goal attribution** (which team `details[].team` points at) has been corrected in the
  ESPN detail parsing — it's worth 5 pts, so still worth a spot-check against any contested
  own goal.
- **Elimination logic** is pragmatic, not a full mathematical-elimination solver:
  knockout loss = out; a team is out as soon as it's mathematically locked into 4th
  (3 group rivals guaranteed above it on points or head-to-head — which can happen
  before the final matchday); 3rd-placers stay alive until the named R32 bracket
  excludes them. "First out" (+10) = the earliest-sealed **pool** team (non-pool teams
  can go out first, but the award is the first of a player's own teams to fall); an
  exact tie between two pool teams awards nothing until the group rules on it.
- **Forecast** is a one-time, hand-written bookmaker-consensus snapshot in
  `lib/config.js` (no runtime AI). Live projections take over after the first matches.

## Local development

`npm run dev` serves the UI only — `/api` routes need `vercel dev` or a deploy.
`npm test` runs the Vitest suite for the scoring (`lib/scoring.js`) and elimination
(`lib/stats.js`) engines. The pipeline itself is plain node with no Vercel coupling:

```sh
node --input-type=module -e "import('./lib/pipeline.js').then(async m => console.log(JSON.stringify(await m.buildPool(), null, 1).slice(0, 2000)))"
```
