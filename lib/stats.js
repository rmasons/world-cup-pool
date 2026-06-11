// Deterministic TeamStats computation from normalized match data.
// Produces exactly the per-team record the frontend's scoring engine
// (teamBasePoints / computeAll) consumes — same short keys, same semantics.
// The frontend still does ALL pool-point math; this only reports facts.
import { espnLookup, isTop10 } from "./teams.js";

const emptyStats = (t) => ({ t, gp: 0, gf: 0, ga: 0, cy: 0, cr: 0, gw: 0, gd: 0, uw: 0, og: 0, bl: 0, r32: 0, r16: 0, qf: 0, sf: 0, ch: 0, elim: 0, fo: 0 });

const KO_STAGES = ["R32", "R16", "QF", "SF", "FINAL"]; // THIRD handled separately

// Elimination is tracked for ALL 48 teams (the "first out" +10 must be the first
// in the whole tournament, not just among pool teams). Pragmatic rules, documented
// in the README for the group to overrule:
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

  // Group 4th places, sealed at the group's final whistle
  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  for (const g of standings) {
    const teams = g.entries.map((e) => e.team);
    const ours = groupMatches.filter((m) => teams.includes(m.home.name) && teams.includes(m.away.name));
    if (ours.length < 6 || !ours.every((m) => m.completed)) continue;
    const sealTime = ours.map((m) => m.dateUTC).sort().at(-1);
    const fourth = g.entries.find((e) => e.rank === 4) || g.entries[3];
    if (fourth && !seals.has(fourth.team)) seals.set(fourth.team, sealTime);
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

  // First team mathematically eliminated in the whole tournament (single team only;
  // a tie for "first" awards nothing until the group rules on it).
  let firstOut = null;
  if (seals.size) {
    const earliest = [...seals.values()].sort()[0];
    const tied = [...seals.entries()].filter(([, when]) => when === earliest);
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

  // Advancement flags: appearing in a round means you reached it (cumulative).
  const flagFor = { R32: "r32", R16: "r16", QF: "qf", SF: "sf" };
  for (const m of matches) {
    const f = flagFor[m.stage];
    for (const sideTeam of [m.home.name, m.away.name]) {
      const roster = lookup.toRoster(sideTeam);
      if (!roster) continue;
      const s = statsMap[roster];
      if (f) { s[f] = 1; if (f !== "r32") s.r32 = 1; if (f === "qf" || f === "sf") s.r16 = 1; if (f === "sf") s.qf = 1; }
      if (m.stage === "THIRD" || m.stage === "FINAL") { s.r32 = 1; s.r16 = 1; s.qf = 1; s.sf = 1; }
      if (m.stage === "FINAL" && m.completed) {
        const me = m.home.name === sideTeam ? m.home : m.away;
        if (me.winner) s.ch = 1;
      }
    }
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
