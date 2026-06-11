# 2026 World Cup Pool

Self-updating scoreboard for a 13-player World Cup pool. Originally built as a Claude
artifact (see `docs/WORLD-CUP-POOL-DOCS.md` for the full build history); now hosted on
Vercel with the AI data pipeline replaced by real sports data.

**Ownership note:** the frontend (`src/WorldCupPool.jsx`) is the original author's design
and scoring engine — visual changes are off-limits. The backend (`api/`, `lib/`) is the
hosting layer and is fair game.

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

All pool-point math still happens client-side in the original component (`computeAll`)
— the backend only reports facts, exactly the design principle of the original.

## Deploy

1. Push to GitHub, import in Vercel (framework: Vite — auto-detected). That's it.
2. Optional env vars: `ODDS_API_KEY` (the-odds-api.com free tier — win % chips on
   today's games), `POOL_ROSTERS` / `POOL_FORECAST` (JSON overrides for `lib/config.js`;
   redeploy to apply).

## Changing rosters

The in-app Pool Setup editor is display-only now (saves show the app's own "could not
save" message). Real changes happen in `lib/config.js` (edit + push) or the
`POOL_ROSTERS` env var (edit + redeploy). Spelling fixes are safe — stats are keyed by
whatever the config says, recomputed fresh every request.

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
- **Event detail shape** (cards / own goals in `details[]`) was verified against ESPN
  community docs but not against a live 2026 match (none had been played yet). Verify
  after the opener — own-goal raw details are logged to Vercel function logs (`[audit]`).
- **Own-goal attribution** (which team `details[].team` points at) must be confirmed
  against the tournament's first own goal — it's worth 5 pts, so it will be litigated.
- **Elimination logic** is pragmatic, not a full mathematical-elimination solver:
  knockout loss = out; 4th after group completion = out; 3rd-placers stay alive until
  the named R32 bracket excludes them. "First out" (+10) = earliest sealed fate under
  these rules; an exact tie awards nothing until the group rules on it.
- **Forecast** is a one-time, hand-written bookmaker-consensus snapshot in
  `lib/config.js` (no runtime AI). Live projections take over after the first matches.
- **Slovakia did not qualify** for the 2026 World Cup but is on Jordyn Kerr's roster
  per the draft sheet. Until corrected in `lib/config.js`, it scores zero and shows
  no fixtures.

## Local development

`npm run dev` serves the UI only — `/api` routes need `vercel dev` or a deploy.
The pipeline itself is plain node with no Vercel coupling:

```sh
node --input-type=module -e "import('./lib/pipeline.js').then(async m => console.log(JSON.stringify(await m.buildPool(), null, 1).slice(0, 2000)))"
```
