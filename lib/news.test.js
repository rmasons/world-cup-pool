import { describe, it, expect } from "vitest";
import { buildContent } from "./news.js";

// A completed match in the shape fetchSeason produces (only the fields buildContent reads).
const completedMatch = (overrides = {}) => ({
  id: "1", dateUTC: "2026-06-12T18:00:00Z", stage: "GROUP", completed: true,
  home: { id: "h", name: "Brazil", score: 3, winner: true },
  away: { id: "a", name: "Serbia", score: 0, winner: false },
  venueCity: "Inglewood", tallies: {}, rawDetails: [], headline: null,
  ...overrides,
});

describe("buildContent — ESPN storyline in the stories", () => {
  it("uses the ESPN headline and carries the recap url when the feed has one", () => {
    const m = completedMatch({
      headline: {
        short: "Brazil thrash Serbia",
        description: "Brazil opened with a statement 3-0 win.",
        url: "https://www.espn.com/soccer/report/_/gameId/1",
      },
    });
    const { stories } = buildContent([m], [], {});
    expect(stories[0]).toEqual({
      h: "Brazil thrash Serbia",
      s: "Brazil opened with a statement 3-0 win.",
      url: "https://www.espn.com/soccer/report/_/gameId/1",
    });
  });

  it("falls back to the generated box-score story (no url) when ESPN has no headline", () => {
    const { stories } = buildContent([completedMatch({ headline: null })], [], {});
    expect(stories[0].url == null).toBe(true);
    expect(stories[0].h).toMatch(/Brazil/); // generated headline names the winner
  });
});
