> **Note (June 2026):** This document describes the original Claude-artifact version of the app.
> The live Vercel deployment uses a fully stateless ESPN-based backend — no AI calls, no Redis,
> no `window.storage` shim beyond the thin read adapter in `src/main.jsx`. The scoring engine has
> since been extracted to `lib/scoring.js` (pure module, Vitest suite), and the **scoring rules in
> §4 have evolved**: group elimination now seals on mathematical head-to-head logic (a team can be
> out before the final matchday), the "first out" +10 goes to the first *pool* team eliminated
> (not the first team in the whole tournament), and the elim-keyed multipliers (last place / zero
> goals) only **lock** once a team's group games are complete — until then they show as *brewing*.
> See `README.md` and `lib/` for the authoritative current behavior. This file is kept for
> historical context.

# 2026 World Cup Pool — Build Documentation

A self-updating scoreboard website for a 16-player World Cup pool, originally built as a Claude artifact (single-file React app) and now being ported to Vercel. This document explains how the app was built, every significant decision made along the way, the complete scoring logic, and exactly what must change to run it outside the Claude platform.

**Companion file:** `world-cup-pool.jsx` — the complete application source (single React component, default export, inline styles, no build-specific dependencies beyond React).

---

## 1. What the app does

Each of 16 players drafted two national teams (32 teams total). A player's score is the combined points of their two teams under the pool's custom rules. The site displays, in page order: today's matches plus the next three (with pre-game win probabilities for today's games), three daily news stories and a recap of yesterday's results, a live scoreboard, projected final standings (preseason AI forecast before kickoff, rules-based projection after), each player's upcoming team schedules, per-category point breakdowns, and a roster editor. The tournament runs June 11 – July 19, 2026 (USA/Canada/Mexico).

All match data is fetched once daily by an AI call (Claude with web search) that returns structured JSON; all scoring math is computed deterministically in client-side JavaScript from that data. This split was deliberate: **the AI reports facts, the code applies rules.** The AI is never asked to compute pool points, which keeps scoring auditable and argument-proof.

---

## 2. Architecture overview

```
┌────────────────────────────────────────────────────────┐
│  React single-file app (world-cup-pool.jsx)            │
│                                                        │
│  UI sections ◄── computeAll(rosters, statsMap, over)   │  ← pure function, all scoring math
│                        ▲                               │
│                   statsMap (per-team raw stats)        │
│                        ▲                               │
│  runUpdate() ──► callClaude(prompt) ──► Anthropic API  │  ← web-search-enabled model calls
│       │                                  (JSON out)   │
│       ▼                                                │
│  Shared storage  ◄──► all visitors (read + write)      │  ← window.storage in artifact;
│  key: "wc26:pool"                                      │    replace on Vercel (see §8)
└────────────────────────────────────────────────────────┘
```

The app has three platform touchpoints that are Claude-artifact-specific and must be swapped for Vercel: `window.storage` (shared persistence), the keyless `fetch` to `https://api.anthropic.com/v1/messages` (the artifact environment proxies auth), and the implicit requirement that AI features run under a signed-in Claude user's quota. Everything else — all React code, scoring logic, styling, name matching — is portable as-is.

---

## 3. Data model

A single shared-storage key `"wc26:pool"` holds one JSON object (well under storage limits even at 32 teams):

```js
{
  rosters:        [{ name: "Jordyn Kerr", teams: ["Brazil", "Jordan"] }, ...],
  statsMap:       { "Brazil": { /* TeamStats */ }, ... },   // keyed by roster spelling
  teamFx:         { "Brazil": [{ d:"Jun 13", k:"7:00 PM CT", o:"Morocco", v:"Atlanta" }], ... },
  stories:        [{ h: "headline", s: "two-sentence summary" }, ...],  // exactly 3
  daySummary:     "2-3 sentence recap of yesterday's results",
  upGames:        [{ d, k, a, b, v, td, pa, pd, pb }, ...],  // ≤9; td:1 = today; pa/pd/pb = win% (today only)
  forecast:       { "Brazil": { t, st, gw, gd, uw }, ... } | null,      // preseason predictions
  forecastAt:     "6/10/2026, 8:14:02 PM" | null,
  lastUpdated:    "6/10/2026, 8:14:02 PM" | null,   // display stamp + change-detection token
  lastDay:        "2026-6-10" | null,                // local-date key gating the once-daily auto-update
  tournamentOver: boolean
}
```

A second key `"wc26:lock"` holds a `Date.now()` timestamp used as a 5-minute mutex for auto-updates (see §6).

**TeamStats** — the per-team record the AI fills in and the scoring engine consumes. Short keys keep AI responses compact:

```js
{
  t: "Brazil",   // team name, echoed EXACTLY as the roster spells it
  gp: 0,  // games played (final tournament only)
  gf: 0,  // goals for            ga: 0,  // goals against
  cy: 0,  // yellow cards          cr: 0,  // red cards
  gw: 0,  // group-stage wins      gd: 0,  // group-stage draws
  uw: 0,  // wins vs pre-tournament Top 10, any round
  og: 0,  // own goals scored by this team
  bl: 0,  // losses by 4+ goals
  r32: 0, r16: 0, qf: 0, sf: 0, ch: 0,   // 0/1 advancement flags (cumulative)
  elim: 0, // 1 once eliminated from the final tournament
  fo: 0    // 1 ONLY for the single first team mathematically eliminated
}
```

The pre-tournament Top 10 (per the pool's rules, official FIFA rankings of April 1, 2026) is hardcoded as `TOP10`: France, Spain, Argentina, England, Portugal, Brazil, Netherlands, Morocco, Belgium, Germany.

---

## 4. Scoring logic (the heart of the app)

All scoring lives in two pure functions in the source: `teamBasePoints(s)` and `computeAll(rosters, statsMap, tournamentOver)`. They implement the pool rulebook exactly as follows.

### 4.1 Banked team points — `teamBasePoints`

Points that count the moment they happen:

| Event | Field | Points |
|---|---|---|
| Group-stage win | `gw` | 3 each |
| Group-stage draw | `gd` | 1 each |
| Upset win (beat a Top-10 team, any round; Top-10 vs Top-10 counts) | `uw` | 3 each |
| Advance to Round of 32 | `r32` | +3 |
| Advance to Round of 16 | `r16` | +5 |
| Reach Quarter-finals | `qf` | +5 |
| Reach Semi-finals | `sf` | +10 |
| Win the World Cup | `ch` | +20 |
| Own goal scored by your team | `og` | 5 each |
| Blowout loss (lose by 4+) | `bl` | 5 each |
| First team mathematically eliminated | `fo` | +10 (one team in the whole tournament) |

```js
base = gw*3 + gd*1 + uw*3 + r32*3 + r16*5 + qf*5 + sf*10 + ch*20
     + og*5 + bl*5 + (fo ? 10 : 0)
```

Advancement is cumulative — a semi-finalist has `r32=r16=qf=sf=1` and banks 3+5+5+10 = 23 advancement points; a champion banks 43.

### 4.2 End-of-tournament awards (+10 each, ties pay all owners)

Computed in `computeAll` from current stats; **added to team scores only when `tournamentOver` is true**, but tracked provisionally throughout (shown in the "Season awards" panel and the Projected standings):

- **Best Offense** — highest `gf` among teams with `gp > 0`, and only if the max is above zero.
- **Best Defense** — lowest `ga` among teams with `gp >= 3` (the 3-game minimum is in the rules; before any team reaches 3 games the award shows "Needs 3+ games played").
- **Most Cards** — highest card points, where card points = `cy*1 + cr*2`, only if above zero.

Each is computed as a *list* of leaders so that ties award every tied team (and therefore every owner of a tied team).

### 4.3 Multipliers — applied to the OTHER team's final score

A team's misery boosts its partner. If a team triggers multiple multipliers, **only the largest applies** (per the rules). Implemented as `teamMult[team] = { m, label }`, the multiplier that team *generates for its partner*:

- **Zero Goals (×1.5)** — `gf === 0 && gp > 0`, locked only when that team's tournament is actually over (`elim` or `tournamentOver`), since a team could still score.
- **Most Allowed (×1.5)** — team has the highest `ga` in the pool; locked only at `tournamentOver`, since the lead can change.
- **Last Place (dynamic)** — the rules say: a team that finishes dead last (0 match points, worst goal differential) multiplies its partner's score by *half the worst team's negative goal differential*. Implemented as: among eliminated teams with `gw === 0 && gd === 0`, find the single worst (most negative) `gf - ga`; multiplier = `max(1, |GD| / 2)`. The `max(1, …)` floor is a deliberate interpretation call: a literal reading would let a −1 GD produce a ×0.5 multiplier that *punishes* the partner, which contradicts the rule's clear intent as a bonus. Ties for last place award nothing (a single "dead last" team must exist). This is the one place the code interprets rather than transcribes the rulebook — flagged here so the group can overrule it.

A player's **Total** = `round(scoreA × multFromB + scoreB × multFromA)`.

### 4.4 Live "Projected" standings

Shown next to Total and in its own section. Projection = what the score becomes **if everything locked at today's numbers**: banked points + provisional awards (+10s to current leaders) + provisional multipliers (zero-goals and most-allowed treated as if locked today, i.e. ×1.5 even before `elim`/`tournamentOver`). Each projection row carries a human-readable breakdown (`projDetail`) like `"🇶🇦 multiplier x1.5 boosts 🇩🇪 +18"`, plus ▲/▼ arrows showing rank movement vs. the live scoreboard. After `tournamentOver`, projections equal totals. This is strictly rules-based — it never predicts future matches.

### 4.5 Preseason forecast (before any `gp > 0`)

Before the first match, the Projected section instead shows an AI-generated forecast. For each team the AI predicts a most-likely run — `st` (furthest stage: GRP/R32/R16/QF/SF/F/CH, at most one CH across all teams), `gw`/`gd` (expected group results), `uw` (expected Top-10 upsets) — sourced from tournament-winner odds and expert picks via web search. The app converts each predicted run to pool points with the same rulebook:

```js
STAGE_PTS = { GRP: 0, R32: 3, R16: 8, QF: 13, SF: 23, F: 23, CH: 43 }  // cumulative advancement
forecastPts = gw*3 + gd*1 + uw*3 + STAGE_PTS[st]
```

(`F` = lost the final = same advancement points as SF, since the rules award nothing extra for *reaching* the final — only +20 for winning it.) Bonuses and multipliers are intentionally **not** forecast; they're the chaos layer. The forecast persists in storage, can be re-run, and the section automatically switches to live projections the moment any team has `gp > 0`.

---

## 5. The daily update pipeline — `runUpdate(auto)`

One function performs the whole morning ritual, in sequence:

**Call 1 — news + schedule + odds.** A single web-search call returns the 3 top stories, a recap of yesterday's results, and the `upGames` list: ALL of today's matches (`td:1`) followed by the next 3 future matches (`td:0`), max 9. For **today's matches only**, it also returns consensus pre-game implied win probabilities (`pa`/`pd`/`pb`, integer percents summing to ~100; `pd` omitted for knockout games). Odds were deliberately restricted to same-day matches because lines move — stale odds on future games would mislead — and rendered as percentages rather than moneylines for readability. Future games never show odds.

**Calls 2..n — results, batched.** Teams are fetched in **chunks of 8**. This was a hard-won fix: with `max_tokens: 1000` per call (a platform constraint of the original environment), a single 32-team reply truncated and silently dropped the tail of the list — discovered when four players' data went missing. Each batch prompt includes the previously saved stats as a baseline and asks for *cumulative* tournament totals, which makes every update self-healing: a missed day or a failed batch is fully recovered by the next successful run. The results fetch is **gated until June 11** — an earlier ungated run let the AI "find" results that didn't exist and mark Egypt eliminated before the tournament began (root cause of the reset feature, §7). The prompt now also hard-forbids counting qualifiers/friendlies/Nations League and forbids `elim=1` for a team that hasn't played.

**Calls n+1..m — fixtures, batched.** Same 8-team chunking. Runs **even before kickoff** (group fixtures are public) — an earlier over-broad kickoff gate wrongly blocked this. Eliminated teams are skipped entirely (efficiency: by the semis you're fetching 4 teams, not 32) and their stale fixture lists are cleared.

**Tournament-over detection.** Each results batch can report `over: 1`; once persisted, the daily auto-update permanently stops and final awards lock into Totals.

**Failure posture.** Every call is individually try/caught. A failed batch keeps its previous data and surfaces a visible status message ("Batch 3 failed — those teams show last saved data. Run Update now to retry."); a `hadError` flag prevents the success path from wiping error messages (an earlier stale-closure bug did exactly that). News failure keeps yesterday's stories. Nothing fails as a whole.

### Name matching — the most important reliability lesson

The single largest class of bugs was **string identity**: stats keyed by AI-spelled names not matching roster-spelled names ("Sweeden" vs "Sweden", "Curaçao" vs "Curacao", "Türkiye" vs "Turkey"). Three-layer defense, applied to results, fixtures, AND forecast:

1. **Prompt-side:** every fetch instructs the model to echo `t` *exactly* as written in the provided list, explicitly told not to correct spelling.
2. **Merge-side:** every returned record is mapped back to the requested roster name via `deburr` matching — Unicode-normalized, accent-stripped, case-insensitive, with exact-match preferred and substring containment as fallback — before being stored.
3. **Read-side:** every display lookup (`fxFor`, `fcFor`, flag lookup) tolerates the same variations.

`deburr(s) = s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase()`. Additionally, editing a team's spelling in Pool Setup **migrates** its saved stats/fixtures/forecast to the new key, so a mid-tournament correction loses nothing. Missing forecast entries render a red "no forecast — check spelling, then Re-run" chip rather than failing silently — silent failures were the original sin here.

---

## 6. Concurrency & freshness model

**Once-daily auto-update.** `lastDay` stores a local-date key (`"2026-6-10"`). On load (and on tab re-focus), if today ≥ KICKOFF, the tournament isn't over, and `lastDay !== todayKey()`, the client triggers `runUpdate(true)`. The *first visitor of the day* therefore refreshes the pool for everyone.

**The 5-minute lock.** Before an *auto* run executes, it checks `"wc26:lock"`; if another client wrote a timestamp within the last 5 minutes, it stands down. This prevents two friends opening the site at 7:00 AM from both burning API quota on identical updates. Manual "Update now" presses bypass the check (a human explicitly asked) but still write the lock.

**Live re-sync for open tabs.** A `visibilitychange` listener plus a 5-minute interval (active-tab only) re-reads shared storage; if `lastUpdated` differs from what this tab last saw, the newer data is applied in place. Guards: skipped while this device is mid-update, mid-forecast, or mid-roster-edit (`busyRef`), so background syncs never clobber in-flight work. Refs (`runUpdateRef`, `lastSeenRef`) keep the listeners bound once while always seeing fresh state. The focus handler can also *trigger* the morning update for a tab left open overnight.

**Write model.** Last-write-wins on the single storage key. Every mutation goes through `snapshot(overrides)` — current state plus explicit overrides — so a writer never accidentally persists a stale field (an early bug persisted a stale `tournamentOver` this way). Acceptable for a 16-person pool; see §8 for what to harden on a real backend.

---

## 7. Product decisions log (chronological, with reasoning)

**Single-file React, inline styles.** Maximum portability; no CSS files, no Tailwind dependency, no router. Google Fonts (Archivo Black / Barlow Condensed / IBM Plex Mono) injected via a `<link>` at runtime with system-font fallbacks, so the app degrades gracefully if fonts.googleapis.com is unreachable.

**Visual identity.** "Matchday program" aesthetic: striped pitch-green background (mowed-grass repeating gradient), chalk-white cards, a dark stadium-scoreboard standings table with amber numerals, host-nation tricolor band (USA/Canada/Mexico) across the top, story cards in the three hosts' colors, chalk center-circle motifs in the header. Top-3 scoreboard rows get 🥇🥈🥉 with colored edge bars; zebra striping; eliminated teams dimmed with an OUT chip.

**Flags.** `TEAM_DATA` maps ~120 plausible qualifiers to `[emoji, FIFA code]`. England/Scotland/Wales/Northern Ireland deliberately render as **text codes (ENG/SCO/WAL/NIR)** instead of emoji — their Unicode subdivision flags render as a plain black flag on Windows and some Android devices (a real user-reported bug). Unmapped names fall back to a generated 3-letter code rather than a meaningless ⚽ (also user-reported). Lookups are deburr-tolerant.

**AI reports facts; code computes points** (§1). Also: the model is told to give `CH` (predicted champion) to at most one team, preventing a forecast where three teams "win" the cup.

**Batching at 8 teams/call** (§5) — the capacity decision that made 16 players viable.

**Kickoff gating** — results fetch blocked before June 11; fixtures fetch allowed anytime (group fixtures are known). Both directions of this gate were bugs at some point: too open (phantom Egypt elimination), then too closed (schedules blocked pre-kickoff).

**Reset all match stats** — two-tap-confirm button in Pool Setup that zeroes `statsMap`/`teamFx`/`tournamentOver`/`lastDay` while preserving rosters and forecast. Built as the cure for the phantom-elimination incident; kept as the general bad-data escape hatch since the next update re-fetches everything from scratch (cumulative prompts make this safe).

**Roster editing with migration** — players can be renamed and team spellings corrected in place; saved data follows the rename (§5). Built when a player ("Jordan" → "Jordyn") needed renaming and again when misspelled teams broke the forecast.

**Passcode gate** — `POOL_CODE = "WC26FUN"`, case-insensitive, checked client-side before anything renders. Explicitly a *courtesy lock*, not security (the code ships in the client bundle); it keeps drive-by visitors from seeing names/standings and deters casual roster tampering. No persistence of the unlocked state (the artifact platform forbids localStorage; on Vercel you may add it — see §8). Re-entering a 7-character code per visit was judged acceptable.

**Signed-out graceful degradation** — if storage reads fail, a probe write distinguishes "no data yet" from "no storage access"; the latter shows an explanatory amber banner instead of a confusing empty pool. (On Vercel with your own backend, this whole limitation disappears — anonymous visitors can simply read.)

**Projections are receipts-first.** Both the live projection and the preseason forecast show *why* every number is what it is (per-team chips, banked-vs-projected, movement arrows, footnotes). Design principle: in a 16-person pool, every number will be litigated; the UI should win the argument before it starts.

---

## 8. Porting to Vercel — what must change

The React component ports cleanly into any Vite/Next.js app (`export default WorldCupPool`). Three platform seams to replace:

**1. Storage (`window.storage`) → your own shared store.** All persistence flows through four call sites: `storage.get("wc26:pool", true)`, `storage.set("wc26:pool", json, true)`, and the same pair for `"wc26:lock"` (plus one throwaway probe write you can delete). Replace with two tiny API routes backed by Vercel KV / Upstash Redis / a Postgres row — `GET /api/pool` and `PUT /api/pool` (same for `/api/lock`) — or keep the exact `get/set` signature with a small adapter:

```js
// drop-in replacement for the artifact storage API
window.storage = {
  get: async (key) => {
    const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error("missing");
    return { value: await r.text() };
  },
  set: async (key, value) => {
    await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { method: "PUT", body: value });
  },
};
```

This single change **removes the signed-in requirement for viewing entirely** — the biggest UX win of the port. Optional hardening: make the PUT route check a server-side secret or the pool code so random visitors can't write.

**2. The AI call (`callClaude`) → a serverless proxy holding your API key.** The artifact called `https://api.anthropic.com/v1/messages` with no key (platform-injected). On Vercel, **never put the key in client code** — create `/api/claude` that forwards the request with `process.env.ANTHROPIC_API_KEY` in an `x-api-key` header (plus `anthropic-version: 2023-06-01`), and point `callClaude` at it. Keep the request shape: `model` (the source pins `claude-sonnet-4-20250514`; substitute a current Sonnet-class model), `messages`, and `tools: [{ type: "web_search_20250305", name: "web_search" }]` — **web search is load-bearing**; without that tool the updates will hallucinate. You may also now raise `max_tokens` above 1000 (an artifact-era constraint) — though keep the 8-team batching anyway, as it also improves search quality per call. Costs land on your API account: roughly 9–10 search-enabled calls per daily update at 32 alive teams, shrinking as teams are eliminated. Consider rate-limiting the route.

**3. Now-optional artifact constraints.** `localStorage` was forbidden in artifacts; on Vercel you may use it to remember the passcode unlock per device (`localStorage.setItem("wc26:unlocked","1")`). The lock + first-visitor auto-update model still works fine, but a Vercel Cron job hitting an `/api/update` route at a fixed hour is strictly better — updates happen even if nobody visits, and you can drop the lock entirely. The probe-write/`storageBlocked` banner logic (§7) becomes dead code once storage is public — safe to remove.

**Sanity checklist after port:** rosters load anonymously in an incognito window; `Update now` works and persists; two tabs sync within 5 minutes; passcode gate appears first; pre-June-11 update fetches schedules but not results; a bogus team spelling shows the red forecast chip rather than vanishing.

---

## 9. Known limitations & honest caveats

Data accuracy is bounded by web search: the AI occasionally misreads a stat line, which is why the reset button, cumulative self-healing prompts, visible error states, and manual re-run all exist — the system is built to be *correctable*, not infallible. The passcode is obfuscation, not auth. Storage writes are last-write-wins with no merge (fine at this scale; the busy-guard prevents the most likely conflict). Win probabilities are consensus implied odds for entertainment — the on-page footnote says exactly that. The Last Place multiplier floors at ×1 by interpretation (§4.3). `todayKey()` uses each visitor's local date, so "first visitor of the day" follows local midnight — harmless for a single-timezone friend group; a Vercel cron makes it moot.

---

*Built conversationally with Claude, June 2026. The companion `world-cup-pool.jsx` is the complete, current source — every behavior described above is implemented there, and section references in code comments line up with this document.*
