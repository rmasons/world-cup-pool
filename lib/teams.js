// Roster spellings are the single source of truth for every key in the pool data
// (the frontend looks stats up by exactly these strings). ESPN display names are
// mapped to roster spellings here, deterministically — this map replaces the old
// AI-era fuzzy-matching defense layers.

export const TOP10 = ["France", "Spain", "Argentina", "England", "Portugal", "Brazil", "Netherlands", "Morocco", "Belgium", "Germany"];

export const deburr = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Roster spelling -> ESPN displayName, only where they differ.
const ROSTER_TO_ESPN = {
  "DR Congo": "Congo DR",
};

// Build ESPN-name -> roster-name lookup for a given list of roster team names.
export function espnLookup(rosterTeams) {
  const map = new Map();
  for (const t of rosterTeams) {
    map.set(deburr(ROSTER_TO_ESPN[t] || t), t);
  }
  return {
    // Returns the roster spelling for an ESPN name, or null if not a pool team.
    toRoster(espnName) {
      return map.get(deburr(espnName)) || null;
    },
  };
}

export const isTop10 = (espnOrRosterName) => TOP10.some((t) => deburr(t) === deburr(espnOrRosterName));

// ESPN spellings that miss the frontend's flag table (TEAM_DATA) — normalize
// non-pool team names so flags render instead of bare letter codes.
const ESPN_TO_DISPLAY = {
  "Congo DR": "DR Congo",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
};
export const displayName = (espnName) => ESPN_TO_DISPLAY[espnName] || espnName;
