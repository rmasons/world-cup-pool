import { describe, it, expect } from "vitest";
import { computeStatsMap } from "./stats.js";

// --- fixture helpers --------------------------------------------------------
// Match shape consumed by computeStatsMap:
//   { completed, stage, dateUTC, home:{name,score,winner,id}, away:{...}, tallies:{} }
// lib/teams.js espnLookup identity-maps any roster name that already matches.

let _id = 0;
const side = (name, score, winner) => ({ name, score, winner, id: `${name}-${++_id}` });

// A completed GROUP match where `hName` beats `aName` by the given scoreline.
const groupWin = (hName, aName, hs, as, dateUTC) => ({
  completed: true,
  stage: "GROUP",
  dateUTC,
  home: side(hName, hs, hs > as),
  away: side(aName, as, as > hs),
  tallies: {},
});

const groupDraw = (hName, aName, s, dateUTC) => ({
  completed: true,
  stage: "GROUP",
  dateUTC,
  home: side(hName, s, false),
  away: side(aName, s, false),
  tallies: {},
});

// standings: [{ entries: [{ team, rank, played }] }]
const group = (teams, played = 2) => ({
  entries: teams.map((team, i) => ({ team, rank: i + 1, played })),
});

describe("computeStatsMap — head-to-head pre-final-whistle elimination", () => {
  it("seals X as elim once 3 rivals are guaranteed above it via H2H, before the final whistle", () => {
    // Group of 4: X, P, Q, R. X loses to P and Q (X=0, played 2, ceiling = 3).
    // R races to 6 by beating Q and P. P and Q sit level with X's ceiling (3) but both
    // beat X head-to-head, so all three are guaranteed above X => X sealed 4th (elim).
    const matches = [
      groupWin("P", "X", 1, 0, "2026-06-12T00:00:00Z"), // P beats X
      groupWin("Q", "X", 1, 0, "2026-06-12T03:00:00Z"), // Q beats X
      groupWin("R", "Q", 1, 0, "2026-06-15T00:00:00Z"), // R beats Q
      groupWin("R", "P", 1, 0, "2026-06-15T03:00:00Z"), // R beats P -> clinches X's elim
    ];
    const standings = [group(["R", "P", "Q", "X"], 2)];
    const rosterTeams = ["X"]; // only X is a pool team

    const { statsMap } = computeStatsMap(rosterTeams, matches, standings);
    expect(statsMap.X.elim).toBe(1);
    expect(statsMap.X.gp).toBe(2);
    expect(statsMap.X.gf).toBe(0);
  });
});

describe("computeStatsMap — firstOut", () => {
  it("awards firstOut to the earliest-sealed POOL team, ignoring an earlier-sealed UNOWNED team", () => {
    // UNOWNED team U is sealed elim earlier than pool team Y, but firstOut is a POOL award,
    // so it must go to Y (the first of OUR teams out), not U.
    // Group A (U): U loses to A1 and A2 early; A3 high -> U sealed on 06-12.
    // Group B (Y): Y loses to B1 and B2 later; B3 high -> Y sealed on 06-16.
    const matches = [
      // Group A — U eliminated early (06-12)
      groupWin("A1", "U", 1, 0, "2026-06-11T00:00:00Z"),
      groupWin("A2", "U", 1, 0, "2026-06-11T03:00:00Z"),
      groupWin("A3", "A2", 1, 0, "2026-06-12T00:00:00Z"),
      groupWin("A3", "A1", 1, 0, "2026-06-12T03:00:00Z"),
      // Group B — Y eliminated later (06-16)
      groupWin("B1", "Y", 1, 0, "2026-06-15T00:00:00Z"),
      groupWin("B2", "Y", 1, 0, "2026-06-15T03:00:00Z"),
      groupWin("B3", "B2", 1, 0, "2026-06-16T00:00:00Z"),
      groupWin("B3", "B1", 1, 0, "2026-06-16T03:00:00Z"),
    ];
    const standings = [
      group(["A3", "A1", "A2", "U"], 2),
      group(["B3", "B1", "B2", "Y"], 2),
    ];
    const rosterTeams = ["Y"]; // U is NOT a pool team

    const { statsMap, firstOut } = computeStatsMap(rosterTeams, matches, standings);
    expect(firstOut).toBe("Y");
    expect(statsMap.Y.fo).toBe(1);
    expect(statsMap.Y.elim).toBe(1);
  });

  it("returns firstOut null when two pool teams are sealed at the identical timestamp", () => {
    // Two pool teams (X in group A, Y in group B) both clinch elimination on the very same
    // clinching-match timestamp -> a tie for 'first' awards nothing.
    const T = "2026-06-12T03:00:00Z";
    const matches = [
      // Group A — X sealed; clinching match at T
      groupWin("A1", "X", 1, 0, "2026-06-11T00:00:00Z"),
      groupWin("A2", "X", 1, 0, "2026-06-11T03:00:00Z"),
      groupWin("A3", "A2", 1, 0, "2026-06-12T00:00:00Z"),
      groupWin("A3", "A1", 1, 0, T),
      // Group B — Y sealed; clinching match also at T
      groupWin("B1", "Y", 1, 0, "2026-06-11T00:00:00Z"),
      groupWin("B2", "Y", 1, 0, "2026-06-11T03:00:00Z"),
      groupWin("B3", "B2", 1, 0, "2026-06-12T00:00:00Z"),
      groupWin("B3", "B1", 1, 0, T),
    ];
    const standings = [
      group(["A3", "A1", "A2", "X"], 2),
      group(["B3", "B1", "B2", "Y"], 2),
    ];
    const rosterTeams = ["X", "Y"];

    const { statsMap, firstOut } = computeStatsMap(rosterTeams, matches, standings);
    expect(statsMap.X.elim).toBe(1);
    expect(statsMap.Y.elim).toBe(1);
    expect(firstOut).toBeNull();
    expect(statsMap.X.fo).toBe(0);
    expect(statsMap.Y.fo).toBe(0);
  });
});

describe("computeStatsMap — basic tallies", () => {
  it("counts group win, draw, goals for/against", () => {
    const matches = [
      groupWin("Z", "W", 2, 1, "2026-06-11T00:00:00Z"), // Z win
      groupDraw("Z", "V", 0, "2026-06-12T00:00:00Z"),   // Z draw 0-0
    ];
    const standings = [group(["Z", "W", "V"], 2)];
    const { statsMap } = computeStatsMap(["Z"], matches, standings);
    expect(statsMap.Z.gw).toBe(1);
    expect(statsMap.Z.gd).toBe(1);
    expect(statsMap.Z.gf).toBe(2);
    expect(statsMap.Z.ga).toBe(1);
    expect(statsMap.Z.gp).toBe(2);
  });
});
