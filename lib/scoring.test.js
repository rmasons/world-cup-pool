import { describe, it, expect } from "vitest";
import { teamBasePoints, computeAll, emptyStats } from "./scoring.js";

// Build a stat line, overriding only the fields a test cares about.
const stat = (t, o = {}) => ({ ...emptyStats(t), ...o });

describe("teamBasePoints", () => {
  it("scores group results: win=3, draw=1", () => {
    expect(teamBasePoints(stat("X", { gw: 2, gd: 1 }))).toBe(2 * 3 + 1);
  });

  it("scores an upset win at +3", () => {
    expect(teamBasePoints(stat("X", { uw: 1 }))).toBe(3);
  });

  it("scores advancement: r32+3, r16+5, qf+5, sf+10, champion+20", () => {
    expect(teamBasePoints(stat("X", { r32: 1 }))).toBe(3);
    expect(teamBasePoints(stat("X", { r32: 1, r16: 1 }))).toBe(3 + 5);
    expect(teamBasePoints(stat("X", { r32: 1, r16: 1, qf: 1 }))).toBe(3 + 5 + 5);
    expect(teamBasePoints(stat("X", { r32: 1, r16: 1, qf: 1, sf: 1 }))).toBe(3 + 5 + 5 + 10);
    // Champion: every round flag set + ch
    expect(teamBasePoints(stat("X", { r32: 1, r16: 1, qf: 1, sf: 1, ch: 1 }))).toBe(3 + 5 + 5 + 10 + 20);
  });

  it("scores chaos: own goal +5, blowout loss +5 each, first out +10", () => {
    expect(teamBasePoints(stat("X", { og: 1 }))).toBe(5);
    // bl=2 blowout losses => 10
    expect(teamBasePoints(stat("X", { bl: 2 }))).toBe(10);
    expect(teamBasePoints(stat("X", { fo: 1 }))).toBe(10);
  });
});

describe("computeAll basics", () => {
  it("sums a player's two teams into current/total with no multipliers", () => {
    const rosters = [{ name: "Pat", teams: ["A", "B"] }];
    const statsMap = {
      A: stat("A", { gw: 1, gp: 1 }),       // 3
      B: stat("B", { gd: 1, gp: 1 }),       // 1
    };
    const { standings } = computeAll(rosters, statsMap, false);
    expect(standings[0].current).toBe(4);
    expect(standings[0].total).toBe(4);
  });

  it("injected flag appears in projDetail strings", () => {
    // P generates a brewing zero-goals multiplier that boosts partner Q
    const rosters = [{ name: "Pat", teams: ["P", "Q"] }];
    const statsMap = {
      P: stat("P", { gp: 2, gf: 0, ga: 1 }), // zero goals brewing
      Q: stat("Q", { gp: 2, gw: 1, gf: 3 }), // 3 pts
    };
    const flag = (t) => `<${t}>`;
    const { standings } = computeAll(rosters, statsMap, false, flag);
    const detail = standings[0].projDetail.join(" | ");
    expect(detail).toContain("<P>");
    expect(detail).toContain("<Q>");
  });
});

describe("last-place multiplier: brewing vs locked", () => {
  // A pointless, eliminated team with the worst negative GD generates a last-place
  // multiplier = max(1, |GD|/2) that boosts its PARTNER. It must NOT lock into the
  // partner's banked `total` until that team's group is done (gp>=3 or tournamentOver);
  // before then it only shows in `projected`.
  //
  // A second player (DECOY) holds two big-offense / best-defense / most-cards teams so
  // PARTNER never wins a season award — that keeps the last-place math isolated from the
  // +10 bonuses, which would otherwise inflate teamScore.
  const decoy = { name: "Dee", teams: ["DA", "DB"] };
  const decoyStats = {
    // huge offense + best defense + cards so the leaders are never PARTNER
    DA: stat("DA", { gp: 3, gf: 30, ga: 0, cy: 9 }),
    DB: stat("DB", { gp: 3, gf: 30, ga: 0, cy: 9 }),
  };
  const mkRosters = () => [{ name: "Pat", teams: ["LP", "PARTNER"] }, decoy];
  // LP: 0 match points, eliminated, GD = 0 - 6 = -6 => mult = max(1, 6/2) = 3.
  // PARTNER: gw=2 => base 6. gf=5/ga=1 keeps it off every award leaderboard vs the decoy.
  const lpStats = (gp) => ({
    ...decoyStats,
    LP: stat("LP", { gp, gf: 0, ga: 6, elim: 1 }),
    PARTNER: stat("PARTNER", { gp: 3, gw: 2, gf: 5, ga: 1 }),
  });
  const patRow = (standings) => standings.find((r) => r.player === "Pat");

  it("does NOT lock into partner's total while LP has gp<3 (only brewing in projected)", () => {
    const { standings, awards } = computeAll(mkRosters(), lpStats(2), false);
    const row = patRow(standings);
    // PARTNER base = 2*3 = 6. With no locked multiplier, total = LP(0) + PARTNER(6) = 6.
    expect(row.total).toBe(6);
    // Brewing only: lastPlace not locked, lastPlaceProv present with mult 3.
    expect(awards.lastPlace).toBeNull();
    expect(awards.lastPlaceProv).toMatchObject({ team: "LP", mult: 3 });
    // projected reflects the brewing x3 boost on PARTNER: 6 * 3 = 18.
    expect(row.projected).toBe(18);
  });

  it("locks into partner's total once LP reaches gp>=3", () => {
    const { standings, awards } = computeAll(mkRosters(), lpStats(3), false);
    const row = patRow(standings);
    expect(awards.lastPlace).toMatchObject({ team: "LP", mult: 3 });
    // Locked: PARTNER(6) * 3 = 18 banked into total.
    expect(row.total).toBe(18);
  });

  it("locks into partner's total when tournamentOver even if gp<3", () => {
    const { standings, awards } = computeAll(mkRosters(), lpStats(2), true);
    const row = patRow(standings);
    expect(awards.lastPlace).toMatchObject({ team: "LP", mult: 3 });
    expect(row.total).toBe(18);
  });

  it("last-place mult floors at 1 (max(1, |GD|/2)) — only the zero-goals lock boosts", () => {
    // LP GD = -1 => |GD|/2 = 0.5 => max(1, 0.5) = 1 (no last-place boost). But LP is
    // pointless+elim+gp>=3 with gf=0, so its zero-goals multiplier locks at 1.5x instead.
    const statsMap = {
      ...decoyStats,
      LP: stat("LP", { gp: 3, gf: 0, ga: 1, elim: 1 }),
      PARTNER: stat("PARTNER", { gp: 3, gw: 1, gf: 2 }), // base 3
    };
    const { standings, awards } = computeAll(mkRosters(), statsMap, false);
    expect(awards.lastPlaceProv.mult).toBe(1);
    // PARTNER base 3 boosted by LP's locked zero-goals 1.5x: 3 * 1.5 = 4.5 -> round 5
    expect(patRow(standings).total).toBe(5);
  });
});

describe("partner direction of the boost", () => {
  it("the generating team boosts the OTHER team, not itself", () => {
    const decoy = { name: "Dee", teams: ["DA", "DB"] };
    // LP generates last-place x4 (GD -8); it boosts PARTNER. LP's own score (0) is unaffected.
    const statsMap = {
      DA: stat("DA", { gp: 3, gf: 30, ga: 0, cy: 9 }),
      DB: stat("DB", { gp: 3, gf: 30, ga: 0, cy: 9 }),
      LP: stat("LP", { gp: 3, gf: 0, ga: 8, elim: 1 }), // mult 4, score 0
      PARTNER: stat("PARTNER", { gp: 3, gw: 3, gf: 9, ga: 2 }), // base 9
    };
    const rosters = [{ name: "Pat", teams: ["LP", "PARTNER"] }, decoy];
    const { standings } = computeAll(rosters, statsMap, false);
    const row = standings.find((r) => r.player === "Pat");
    // PARTNER boosted by LP's x4 => 9 * 4 = 36; LP unboosted (PARTNER mult is 1) => 0
    expect(row.total).toBe(36);
    expect(row.teamPts).toEqual([0, 9]);
  });
});
