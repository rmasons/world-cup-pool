// Pure pool-scoring engine — no React/UI imports. Extracted from the component so
// it can be unit-tested in isolation. The UI's `flag(team)` helper (emoji/code) is
// injected as a parameter so this stays display-agnostic; it defaults to identity.

// Empty stat line for a team
export const emptyStats = (t) => ({ t, gp:0, gf:0, ga:0, cy:0, cr:0, gw:0, gd:0, uw:0, og:0, bl:0, r32:0, r16:0, qf:0, sf:0, ch:0, elim:0, fo:0 });

// ---------------- POINT MATH ----------------
export function teamBasePoints(s) {
  return s.gw*3 + s.gd*1 + s.uw*3 + s.r32*3 + s.r16*5 + s.qf*5 + s.sf*10 + s.ch*20
       + s.og*5 + s.bl*5 + (s.fo ? 10 : 0);
}

export function computeAll(rosters, statsMap, tournamentOver, flag = (t) => t) {
  const teams = [];
  rosters.forEach(p => p.teams.forEach(t => teams.push(t)));
  const stats = teams.map(t => statsMap[t] || emptyStats(t));

  // Provisional end-of-tournament awards
  const played = stats.filter(s => s.gp > 0);
  const maxGF = played.length ? Math.max(...played.map(s => s.gf)) : null;
  const defElig = stats.filter(s => s.gp >= 3);
  const minGA = defElig.length ? Math.min(...defElig.map(s => s.ga)) : null;
  const cardPts = s => s.cy*1 + s.cr*2;
  const maxCards = played.length ? Math.max(...played.map(cardPts)) : null;
  const maxGA = played.length ? Math.max(...played.map(s => s.ga)) : null;

  const offenseLeaders = maxGF !== null && maxGF > 0 ? played.filter(s => s.gf === maxGF).map(s => s.t) : [];
  const defenseLeaders = minGA !== null ? defElig.filter(s => s.ga === minGA).map(s => s.t) : [];
  const cardLeaders = maxCards !== null && maxCards > 0 ? played.filter(s => cardPts(s) === maxCards).map(s => s.t) : [];
  const mostAllowed = maxGA !== null && maxGA > 0 ? played.filter(s => s.ga === maxGA).map(s => s.t) : [];

  // Last place: 0 match points (gw=gd=0), eliminated, worst goal differential — boosts the
  // partner. The multiplier only LOCKS once that team's group games are done (gp>=3 or
  // tournamentOver). A team sealed into 4th but still with a game to play shows it as brewing,
  // not locked, since its goal difference (and so the multiplier size) can still move.
  const settled = (t) => { const s = statsMap[t]; return tournamentOver || (s && s.gp >= 3); };
  let lastPlaceProv = null; // current worst among sealed, pointless teams (may still be brewing)
  const pointless = played.filter(s => s.gw === 0 && s.gd === 0 && s.elim);
  if (pointless.length) {
    const worstGD = Math.min(...pointless.map(s => s.gf - s.ga));
    if (worstGD < 0) {
      const worst = pointless.filter(s => s.gf - s.ga === worstGD);
      if (worst.length === 1) lastPlaceProv = { team: worst[0].t, gd: worstGD, mult: Math.max(1, Math.abs(worstGD)/2) };
    }
  }
  const lastPlace = lastPlaceProv && settled(lastPlaceProv.team) ? lastPlaceProv : null; // locked only when group is done

  const teamScore = {};
  stats.forEach(s => {
    let pts = teamBasePoints(s);
    if (tournamentOver) {
      if (offenseLeaders.includes(s.t)) pts += 10;
      if (defenseLeaders.includes(s.t)) pts += 10;
      if (cardLeaders.includes(s.t)) pts += 10;
    }
    teamScore[s.t] = pts;
  });

  // Multiplier a team GENERATES for its partner (largest only)
  const teamMult = {};
  stats.forEach(s => {
    let m = 1, label = null;
    const zeroGoals = s.gf === 0 && s.gp > 0 && (tournamentOver || (s.elim && s.gp >= 3));
    const mostAllow = mostAllowed.includes(s.t) && tournamentOver;
    if (zeroGoals && 1.5 > m) { m = 1.5; label = "Zero goals 1.5x"; }
    if (mostAllow && 1.5 > m) { m = 1.5; label = "Most allowed 1.5x"; }
    if (lastPlace && lastPlace.team === s.t && lastPlace.mult > m) { m = lastPlace.mult; label = `Last place ${lastPlace.mult}x`; }
    teamMult[s.t] = { m, label };
  });

  // Provisional multipliers (what's brewing even before they lock)
  const provMult = {};
  stats.forEach(s => {
    const flags = [];
    if (s.gf === 0 && s.gp > 0) flags.push("Zero goals so far");
    if (mostAllowed.includes(s.t)) flags.push("Most goals allowed so far");
    provMult[s.t] = flags;
  });

  // Short, human reason a team is generating a multiplier (locked label, else brewing flag)
  const multReason = (team) => {
    const locked = teamMult[team];
    if (locked && locked.m > 1 && locked.label) return locked.label.replace(/\s*[\d.]+x$/i, "").toLowerCase();
    // brewing: report whichever multiplier is largest, matching provGen's choice
    if (lastPlaceProv && lastPlaceProv.team === team && lastPlaceProv.mult >= 1.5) return "last place";
    const prov = provMult[team] || [];
    if (prov.some(f => /zero goals/i.test(f))) return "zero goals";
    if (prov.some(f => /most goals allowed/i.test(f))) return "most allowed";
    return "multiplier";
  };

  // Provisional multiplier a team generates for its partner at today's numbers: the locked
  // value if it has locked, otherwise the largest multiplier currently brewing. Drives the
  // projected-points breakdown, so a sealed-but-still-playing team's boost shows as brewing.
  const provGen = (team) => {
    const locked = teamMult[team]?.m || 1;
    if (locked > 1) return locked;
    const s = statsMap[team] || emptyStats(team);
    let m = 1;
    if (s.gf === 0 && s.gp > 0) m = Math.max(m, 1.5);
    if (mostAllowed.includes(team)) m = Math.max(m, 1.5);
    if (lastPlaceProv && lastPlaceProv.team === team) m = Math.max(m, lastPlaceProv.mult);
    return m;
  };

  const standings = rosters.map(p => {
    const [a, b] = p.teams;
    const sa = statsMap[a] || emptyStats(a);
    const sb = statsMap[b] || emptyStats(b);
    const multA = teamMult[b]?.m || 1; // partner's multiplier applies to this team
    const multB = teamMult[a]?.m || 1;
    const current = teamScore[a] + teamScore[b];
    const total = Math.round(teamScore[a]*multA + teamScore[b]*multB);

    // Projected: add provisional end-of-tournament awards if not over, with a breakdown
    let projected = total;
    const projDetail = [];
    if (!tournamentOver) {
      let pa = teamScore[a], pb = teamScore[b];
      const award = (team, name) => projDetail.push(`${flag(team)} ${name} +10`);
      if (offenseLeaders.includes(a)) { pa += 10; award(a, "Best Offense"); }
      if (defenseLeaders.includes(a)) { pa += 10; award(a, "Best Defense"); }
      if (cardLeaders.includes(a)) { pa += 10; award(a, "Most Cards"); }
      if (offenseLeaders.includes(b)) { pb += 10; award(b, "Best Offense"); }
      if (defenseLeaders.includes(b)) { pb += 10; award(b, "Best Defense"); }
      if (cardLeaders.includes(b)) { pb += 10; award(b, "Most Cards"); }
      // Provisional multipliers brewing (zero goals / most allowed / last place), shown as if
      // they locked today — the partner generates the boost applied to this team.
      const provA = provGen(b), provB = provGen(a);
      if (provA > 1) projDetail.push(`${flag(b)} ${multReason(b)} x${provA} boosts ${flag(a)} +${Math.round(pa * provA - pa)}`);
      if (provB > 1) projDetail.push(`${flag(a)} ${multReason(a)} x${provB} boosts ${flag(b)} +${Math.round(pb * provB - pb)}`);
      projected = Math.round(pa * provA + pb * provB);
    } else {
      if (multA > 1) projDetail.push(`${flag(b)} ${multReason(b)} x${multA} boosts ${flag(a)}`);
      if (multB > 1) projDetail.push(`${flag(a)} ${multReason(a)} x${multB} boosts ${flag(b)}`);
    }
    return { player: p.name, teams: [a, b], teamPts: [teamScore[a], teamScore[b]], mults: [teamMult[b], teamMult[a]], current, total, projected, projDetail, stats: [sa, sb] };
  }).sort((x, y) => y.total - x.total || y.projected - x.projected);

  return { standings, stats, awards: { offenseLeaders, maxGF, defenseLeaders, minGA, cardLeaders, maxCards, mostAllowed, maxGA, lastPlace, lastPlaceProv }, provMult, teamMult };
}
