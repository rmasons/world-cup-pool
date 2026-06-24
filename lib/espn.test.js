import { describe, it, expect } from "vitest";
import { tallies } from "./espn.js";

// The contested call (worth +5 pts, will be litigated): for an own goal, ESPN's
// `d.team` is the BENEFITING team, but the pool credits the `og` to the CONCEDING
// team (the one whose player put it in their own net), read from athletesInvolved.
// See lib/espn.js — verified June 23 against live USA-Paraguay / Qatar-Switzerland.
describe("tallies — own-goal attribution", () => {
  const comp = (details) => ({
    competitors: [
      { team: { id: "1" }, homeAway: "home" }, // benefiting team in the OG below
      { team: { id: "2" }, homeAway: "away" }, // conceding team in the OG below
    ],
    details,
  });

  it("credits the own goal to the CONCEDING team, not the benefiting team", () => {
    const t = tallies(comp([
      { ownGoal: true, team: { id: "1" }, athletesInvolved: [{ team: { id: "2" } }] },
    ]));
    expect(t["2"].og).toBe(1); // conceding team earns the +5 chaos bonus
    expect(t["1"].og).toBe(0); // benefiting team (ESPN's d.team) gets nothing
  });

  it("attributes yellow and red cards to the carded player's team (d.team)", () => {
    const t = tallies(comp([
      { yellowCard: true, team: { id: "1" } },
      { redCard: true, team: { id: "2" } },
    ]));
    expect(t["1"]).toMatchObject({ cy: 1, cr: 0, og: 0 });
    expect(t["2"]).toMatchObject({ cy: 0, cr: 1, og: 0 });
  });

  it("does not crash or mis-credit when athletesInvolved is missing", () => {
    const t = tallies(comp([{ ownGoal: true, team: { id: "1" } }]));
    expect(t["1"].og).toBe(0);
    expect(t["2"].og).toBe(0);
  });

  it("tallies multiple events across both teams in one match", () => {
    const t = tallies(comp([
      { ownGoal: true, team: { id: "1" }, athletesInvolved: [{ team: { id: "2" } }] },
      { ownGoal: true, team: { id: "2" }, athletesInvolved: [{ team: { id: "1" } }] },
      { yellowCard: true, team: { id: "1" } },
    ]));
    expect(t["1"]).toMatchObject({ cy: 1, og: 1 }); // team 1 conceded the second OG
    expect(t["2"]).toMatchObject({ cy: 0, og: 1 }); // team 2 conceded the first OG
  });
});
