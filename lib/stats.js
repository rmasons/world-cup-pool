// Deterministic TeamStats computation from normalized match data.
// Produces exactly the per-team record the frontend's scoring engine
// (teamBasePoints / computeAll) consumes — same short keys, same semantics.
// The frontend still does ALL pool-point math; this only reports facts.
import { espnLookup, isTop10 } from "./teams.js";

const emptyStats = (t) => ({ t, gp: 0, gf: 0, ga: 0, cy: 0, cr: 0, gw: 0, gd: 0, uw: 0, og: 0, bl: 0, r32: 0, r16: 0, qf: 0, sf: 0, ch: 0, elim: 0, fo: 0 });

const KO_STAGES = ["R32", "R16", "QF", "SF", "FINAL"]; // THIRD handled separately

// Elimination is tracked for ALL 48 teams so every team's fate is known, but the
// "first out" +10 is a pool award — it goes to the first POOL team eliminated (see
// firstOut below). Pragmatic rules, documented in the README for the group to overrule:
//  - knockout: you're out when you lose a knockout match (semifinal losers are out
//    of the title race; the third-place game changes nothing)
//  - groups: you're out when your group completes all 6 matches and you finish 4th
//    (3rd place stays alive until the R32 bracket says otherwise — best-third math
//    is not guessed at)
//  - a 3rd-place team is out once the R32 bracket is fully named and they're not in it
function eliminationSeals(matches, standings) {
  const seals = new Map(); // teamName(ESPN) -> ISO time their fate was sealed

  // Knockout losses
  for (const m of matches) {
    if (!m.completed || !KO_STAGES.includes(m.stage)) continue;
    const loser = m.home.winner ? m.away : m.away.winner ? m.home : null;
    if (loser && !seals.has(loser.name)) seals.set(loser.name, m.dateUTC);
  }

  // Group eliminations. A team is out the moment it's mathematically locked into 4th — no
  // best-third math needed, since 4th never advances. With FIFA's head-to-head as the first
  // group tiebreaker, this can happen before the final whistle: a rival is guaranteed to
  // finish above us if its current points already exceed our ceiling, OR it merely ties our
  // ceiling but has already beaten us head-to-head (a result we can no longer undo). Once 3
  // rivals are guaranteed above us, we're 4th. We walk each group's completed matches in
  // order so the seal time is the match that actually clinched it, which keeps "first out"
  // honest across groups whose teams clinch elimination on different days.
  const GROUP_GAMES = 3;
  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  for (const g of standings) {
    const teams = g.entries.map((e) => e.team);
    const ours = groupMatches
      .filter((m) => m.completed && teams.includes(m.home.name) && teams.includes(m.away.name))
      .sort((a, b) => (a.dateUTC || "").localeCompare(b.dateUTC || ""));
    const pts = Object.fromEntries(teams.map((t) => [t, 0]));
    const played = Object.fromEntries(teams.map((t) => [t, 0]));
    const beatenBy = Object.fromEntries(teams.map((t) => [t, new Set()])); // t -> rivals who beat t
    for (const m of ours) {
      const { name: hn, winner: hw } = m.home;
      const { name: an, winner: aw } = m.away;
      played[hn] += 1; played[an] += 1;
      pts[hn] += hw ? 3 : aw ? 0 : 1;
      pts[an] += aw ? 3 : hw ? 0 : 1;
      if (hw) beatenBy[an].add(hn);
      else if (aw) beatenBy[hn].add(an);
      for (const X of teams) {
        if (seals.has(X)) continue;
        const maxX = pts[X] + 3 * (GROUP_GAMES - played[X]);
        const guaranteedAbove = teams.filter((Y) =>
          Y !== X && (pts[Y] > maxX || (pts[Y] === maxX && beatenBy[X].has(Y)))
        ).length;
        if (guaranteedAbove >= 3) seals.set(X, m.dateUTC);
      }
    }
    // Fallback: a 4th-place finish that hinges on tiebreakers among level teams is sealed at
    // the group's final whistle, using ESPN's official ranking which already applies them.
    if (ours.length >= 6) {
      const sealTime = ours.map((m) => m.dateUTC).sort().at(-1);
      const fourth = g.entries.find((e) => e.rank === 4) || g.entries[3];
      if (fourth && !seals.has(fourth.team)) seals.set(fourth.team, sealTime);
    }
  }

  // 3rd places left out once the full R32 field is known
  const r32 = matches.filter((m) => m.stage === "R32");
  const r32Named = r32.length === 16 && r32.every((m) => !/TBD|TBA|Winner|Runner/i.test(m.home.name + m.away.name));
  if (r32Named) {
    const inR32 = new Set(r32.flatMap((m) => [m.home.name, m.away.name]));
    const allGroupsDone = standings.every((g) => g.entries.every((e) => e.played >= 3));
    if (allGroupsDone) {
      const sealTime = groupMatches.filter((m) => m.completed).map((m) => m.dateUTC).sort().at(-1) || null;
      for (const g of standings) {
        for (const e of g.entries) {
          if (!inR32.has(e.team) && !seals.has(e.team) && sealTime) seals.set(e.team, sealTime);
        }
      }
    }
  }
  return seals;
}

export function computeStatsMap(rosterTeams, matches, standings) {
  const lookup = espnLookup(rosterTeams);
  const statsMap = {};
  for (const t of rosterTeams) statsMap[t] = emptyStats(t);

  const seals = eliminationSeals(matches, standings);

  // First POOL team mathematically eliminated (single team only; a tie for "first" awards
  // nothing until the group rules on it). Non-pool teams may seal earlier, but the +10 is a
  // pool award — it goes to whoever owns the first of THEIR teams to go out.
  let firstOut = null;
  const poolSeals = [...seals.entries()].filter(([name]) => lookup.toRoster(name));
  if (poolSeals.length) {
    const earliest = poolSeals.map(([, when]) => when).sort()[0];
    const tied = poolSeals.filter(([, when]) => when === earliest);
    if (tied.length === 1) firstOut = tied[0][0];
  }

  const final = matches.find((m) => m.stage === "FINAL");
  const tournamentOver = Boolean(final && final.completed);

  for (const m of matches) {
    if (!m.completed) continue;
    for (const [mine, theirs] of [[m.home, m.away], [m.away, m.home]]) {
      const roster = lookup.toRoster(mine.name);
      if (!roster) continue;
      const s = statsMap[roster];
      s.gp += 1;
      s.gf += mine.score ?? 0;
      s.ga += theirs.score ?? 0;
      if (m.stage === "GROUP") {
        if (mine.winner) s.gw += 1;
        else if (!theirs.winner) s.gd += 1;
      }
      if (mine.winner && isTop10(theirs.name)) s.uw += 1;
      if ((theirs.score ?? 0) - (mine.score ?? 0) >= 4) s.bl += 1;
      const tal = m.tallies[mine.id];
      if (tal) { s.cy += tal.cy; s.cr += tal.cr; s.og += tal.og; }
    }
  }

  // Advancement flags. NEVER from appearance in a future fixture — ESPN
  // publishes *projected* knockout pairings with real team names before the
  // bracket exists (caught live: Austria/Argentina credited with R32 on June
  // 10). A round counts as reached only when earned:
  //  (a) the team played a completed match in that round, or
  //  (b) they won the completed match of the previous round (pays the
  //      advancement as soon as it's clinched, before they play it), or
  //  (c) for the R32: their group is fully completed and they ranked top-2 —
  //      or, once ALL groups are done (real bracket), they're named in it
  //      (covers the best-third qualifiers).
  const flagFor = { R32: "r32", R16: "r16", QF: "qf", SF: "sf" };
  const ORDER = ["r32", "r16", "qf", "sf"];
  const setThrough = (s, upTo) => { for (const f of ORDER) { s[f] = 1; if (f === upTo) break; } };

  for (const m of matches) {
    if (!m.completed) continue;
    for (const sideTeam of [m.home.name, m.away.name]) {
      const roster = lookup.toRoster(sideTeam);
      if (!roster) continue;
      const s = statsMap[roster];
      if (flagFor[m.stage]) setThrough(s, flagFor[m.stage]);
      if (m.stage === "THIRD" || m.stage === "FINAL") setThrough(s, "sf");
      if (m.stage === "FINAL") {
        const me = m.home.name === sideTeam ? m.home : m.away;
        if (me.winner) s.ch = 1;
      }
    }
    const winner = m.home.winner ? m.home : m.away.winner ? m.away : null;
    const wRoster = winner && lookup.toRoster(winner.name);
    if (wRoster) {
      const s = statsMap[wRoster];
      if (m.stage === "R32") setThrough(s, "r16");
      else if (m.stage === "R16") setThrough(s, "qf");
      else if (m.stage === "QF") setThrough(s, "sf");
    }
  }

  // (c) R32 qualification out of the groups
  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const r32Fixtures = matches.filter((m) => m.stage === "R32");
  const allGroupsDone = standings.length > 0 && standings.every((g) => g.entries.every((e) => e.played >= 3));
  for (const g of standings) {
    const teams = g.entries.map((e) => e.team);
    const ours = groupMatches.filter((m) => teams.includes(m.home.name) && teams.includes(m.away.name));
    if (ours.length < 6 || !ours.every((m) => m.completed)) continue;
    g.entries.forEach((e, idx) => {
      const roster = lookup.toRoster(e.team);
      if (!roster) return;
      const rank = e.rank ?? idx + 1;
      const namedInBracket = r32Fixtures.some((m) => m.home.name === e.team || m.away.name === e.team);
      if (rank <= 2 || (allGroupsDone && namedInBracket)) statsMap[roster].r32 = 1;
    });
  }

  for (const [espnName, ] of seals) {
    const roster = lookup.toRoster(espnName);
    if (roster) statsMap[roster].elim = 1;
  }
  if (tournamentOver) {
    // Everyone but the champion is out once the final is played.
    for (const t of rosterTeams) if (!statsMap[t].ch) statsMap[t].elim = 1;
  }
  if (firstOut) {
    const roster = lookup.toRoster(firstOut);
    if (roster) statsMap[roster].fo = 1;
  }

  return { statsMap, tournamentOver, firstOut };
}
