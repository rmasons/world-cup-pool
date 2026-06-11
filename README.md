# 2026 World Cup Pool

Self-updating scoreboard for a 13-player World Cup pool. Originally built as a Claude
artifact (see `docs/WORLD-CUP-POOL-DOCS.md` for the full build history); now hosted on
Vercel with the AI data pipeline replaced by real sports data.

**Ownership note:** the frontend (`src/WorldCupPool.jsx`) is the original author's design
and scoring engine — visual changes are off-limits. The backend (`api/`, `lib/`) is the
hosting layer and is fair game.

## Architecture

```
Vercel Cron (11:00 UTC / 6 AM CT daily) ─► GET /api/update
"Update now" button in the app ──────────► POST /api/update
                                              │ lib/espn.js    — ESPN public JSON (results, events, fixtures, standings)
                                              │ lib/stats.js   — deterministic TeamStats from match data
                                              │ lib/news.js    — auto-generated stories/recap/schedules
                                              │ lib/odds.js    — The-Odds-API win probabilities (optional)
                                              ▼
                                        Upstash Redis ◄── GET/PUT /api/kv ◄── window.storage shim (src/main.jsx)
```

All pool-point math still happens client-side in the original component (`computeAll`)
— the backend only reports facts, exactly the design principle of the original.

## Deploy from scratch

1. Push this repo to GitHub, import it in Vercel (framework: Vite — auto-detected).
2. Vercel Marketplace → add **Upstash for Redis** (free tier). This injects
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
3. Optional env vars (Project → Settings → Environment Variables): `ODDS_API_KEY`
   (the-odds-api.com free tier — win % chips on today's games), `CRON_SECRET`
   (locks the cron endpoint), `POOL_CODE` (write-gate, defaults to WC26FUN).
4. Seed the data: copy `.env.example` → `.env.local`, paste the two Upstash values,
   run `node scripts/seed.mjs` (idempotent; `--force` to overwrite, `--dry` to preview).
5. Visit the site, enter the pool code, press **Update now** once.

## Post-deploy sanity checklist

- [ ] Site loads in an incognito window (no sign-in of any kind)
- [ ] Passcode gate appears first; code unlocks it
- [ ] Standings show all 13 players with flags
- [ ] "Update now" completes and stamps "Last updated"
- [ ] Schedules section lists each team's next group games
- [ ] After the first matchday: scores, recap, and stories reflect real results

## Decisions & honest caveats (read before arguing about points)

- **ESPN's API is unofficial.** It's keyless, stable for years, and our once-daily batch
  is the gentlest possible use, but there's no SLA. If it breaks, swap `lib/espn.js`
  for an API-Football Pro adapter ($19/mo) — everything downstream is vendor-neutral.
- **Event detail shape** (cards / own goals in `details[]`) was verified against ESPN
  community docs but not against a live 2026 match (none had been played yet). Verify
  after the opener; raw details land in the `wc26:audit` Redis key.
- **Own-goal attribution** (which team `details[].team` points at for an own goal) must
  be confirmed against the tournament's first own goal — it's worth 5 pts to the
  scoring team's owner, so it will be litigated.
- **Elimination logic** is pragmatic, not a full mathematical-elimination solver:
  knockout loss = out; 4th after group completion = out; 3rd-placers stay alive until
  the named R32 bracket excludes them. "First out" (+10) = earliest sealed fate under
  these rules; an exact tie awards nothing until the group rules on it.
- **Forecast** is a one-time, hand-written bookmaker-consensus seed (no runtime AI).
  The Re-run button re-reads it; live projections take over after the first matches.
- **Slovakia did not qualify** for the 2026 World Cup but is on Jordyn Kerr's roster
  per the draft sheet. Until corrected (Pool Setup handles renames with full data
  migration), it scores zero and shows no fixtures.

## Local development

`npm run dev` serves the UI only — `/api` routes need `vercel dev` (or just deploy;
the pipeline is read-only against ESPN and idempotent against Redis).
`node scripts/seed.mjs --dry` prints the seed pool. The update pipeline can be
dry-run locally with plain node — see `lib/` modules; they have no Vercel coupling.
