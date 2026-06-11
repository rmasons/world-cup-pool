import React, { useState, useEffect, useRef } from "react";

// Date key like "2026-6-11" for once-a-day staleness checks. Computed in
// Central Time to match the server's lastDay stamp (lib/news.js ctDateKey) —
// using the viewer's local date made every tab east of CT see "yesterday's"
// data after its own midnight and re-fire the update on every refresh cycle.
const todayKey = () => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const KICKOFF = new Date(2026, 5, 11); // June 11, 2026

// Kickoff display in the viewer's own timezone. The server still ships its
// pre-formatted CT strings (d/k) as a fallback for payloads stored before the
// iso field existed.
const localKickDate = (g) => (g.iso ? new Date(g.iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : g.d);
const localKickTime = (g) => (g.iso ? new Date(g.iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : g.k);
const isLocalToday = (g) => (g.iso ? new Date(g.iso).toDateString() === new Date().toDateString() : !!g.td);
const POOL_CODE = "WC26FUN"; // entry passcode (case-insensitive)

// ---------------- SCORING CONSTANTS ----------------
const TOP10 = ["France","Spain","Argentina","England","Portugal","Brazil","Netherlands","Morocco","Belgium","Germany"];

// Team display: [flag emoji, FIFA code]. UK nations get null emoji because their
// subdivision flags render as a plain black flag on many devices — codes are reliable.
const TEAM_DATA = {
  "United States":["🇺🇸","USA"],"USA":["🇺🇸","USA"],"Canada":["🇨🇦","CAN"],"Mexico":["🇲🇽","MEX"],
  "France":["🇫🇷","FRA"],"Spain":["🇪🇸","ESP"],"Argentina":["🇦🇷","ARG"],"England":[null,"ENG"],
  "Portugal":["🇵🇹","POR"],"Brazil":["🇧🇷","BRA"],"Netherlands":["🇳🇱","NED"],"Morocco":["🇲🇦","MAR"],
  "Belgium":["🇧🇪","BEL"],"Germany":["🇩🇪","GER"],"Italy":["🇮🇹","ITA"],"Croatia":["🇭🇷","CRO"],
  "Uruguay":["🇺🇾","URU"],"Colombia":["🇨🇴","COL"],"Japan":["🇯🇵","JPN"],"South Korea":["🇰🇷","KOR"],
  "Korea Republic":["🇰🇷","KOR"],"Senegal":["🇸🇳","SEN"],"Switzerland":["🇨🇭","SUI"],"Denmark":["🇩🇰","DEN"],
  "Austria":["🇦🇹","AUT"],"Australia":["🇦🇺","AUS"],"Ecuador":["🇪🇨","ECU"],"Turkiye":["🇹🇷","TUR"],
  "Turkey":["🇹🇷","TUR"],"Iran":["🇮🇷","IRN"],"Algeria":["🇩🇿","ALG"],"Egypt":["🇪🇬","EGY"],
  "Nigeria":["🇳🇬","NGA"],"Ghana":["🇬🇭","GHA"],"Ivory Coast":["🇨🇮","CIV"],"Cote d'Ivoire":["🇨🇮","CIV"],
  "Cameroon":["🇨🇲","CMR"],"Tunisia":["🇹🇳","TUN"],"South Africa":["🇿🇦","RSA"],"Saudi Arabia":["🇸🇦","KSA"],
  "Qatar":["🇶🇦","QAT"],"Uzbekistan":["🇺🇿","UZB"],"Jordan":["🇯🇴","JOR"],"Iraq":["🇮🇶","IRQ"],
  "Paraguay":["🇵🇾","PAR"],"Peru":["🇵🇪","PER"],"Chile":["🇨🇱","CHI"],"Venezuela":["🇻🇪","VEN"],
  "Bolivia":["🇧🇴","BOL"],"Panama":["🇵🇦","PAN"],"Costa Rica":["🇨🇷","CRC"],"Honduras":["🇭🇳","HON"],
  "Jamaica":["🇯🇲","JAM"],"Curacao":["🇨🇼","CUW"],"Haiti":["🇭🇹","HAI"],"Suriname":["🇸🇷","SUR"],
  "El Salvador":["🇸🇻","SLV"],"Guatemala":["🇬🇹","GUA"],"Trinidad and Tobago":["🇹🇹","TRI"],
  "Poland":["🇵🇱","POL"],"Ukraine":["🇺🇦","UKR"],"Scotland":[null,"SCO"],"Wales":[null,"WAL"],
  "Northern Ireland":[null,"NIR"],"Norway":["🇳🇴","NOR"],"Sweden":["🇸🇪","SWE"],"Serbia":["🇷🇸","SRB"],
  "Greece":["🇬🇷","GRE"],"Czechia":["🇨🇿","CZE"],"Czech Republic":["🇨🇿","CZE"],"Hungary":["🇭🇺","HUN"],
  "Romania":["🇷🇴","ROU"],"Slovakia":["🇸🇰","SVK"],"Slovenia":["🇸🇮","SVN"],"Albania":["🇦🇱","ALB"],
  "North Macedonia":["🇲🇰","MKD"],"Georgia":["🇬🇪","GEO"],"Ireland":["🇮🇪","IRL"],"Kosovo":["🇽🇰","KOS"],
  "Bosnia and Herzegovina":["🇧🇦","BIH"],"Finland":["🇫🇮","FIN"],"Iceland":["🇮🇸","ISL"],"Israel":["🇮🇱","ISR"],
  "Montenegro":["🇲🇪","MNE"],"Moldova":["🇲🇩","MDA"],"Bulgaria":["🇧🇬","BUL"],"Luxembourg":["🇱🇺","LUX"],
  "New Zealand":["🇳🇿","NZL"],"Cape Verde":["🇨🇻","CPV"],"Mali":["🇲🇱","MLI"],"Burkina Faso":["🇧🇫","BFA"],
  "DR Congo":["🇨🇩","COD"],"Gabon":["🇬🇦","GAB"],"Zambia":["🇿🇲","ZAM"],"Benin":["🇧🇯","BEN"],
  "Angola":["🇦🇴","ANG"],"Mozambique":["🇲🇿","MOZ"],"Madagascar":["🇲🇬","MAD"],"Equatorial Guinea":["🇬🇶","EQG"],
  "Tanzania":["🇹🇿","TAN"],"Uganda":["🇺🇬","UGA"],"Guinea":["🇬🇳","GUI"],"Gambia":["🇬🇲","GAM"],
  "Libya":["🇱🇾","LBY"],"Togo":["🇹🇬","TOG"],"Zimbabwe":["🇿🇼","ZIM"],"Namibia":["🇳🇦","NAM"],
  "United Arab Emirates":["🇦🇪","UAE"],"UAE":["🇦🇪","UAE"],"China":["🇨🇳","CHN"],"Indonesia":["🇮🇩","IDN"],
  "Oman":["🇴🇲","OMA"],"Bahrain":["🇧🇭","BHR"],"Kuwait":["🇰🇼","KUW"],"North Korea":["🇰🇵","PRK"],
  "Vietnam":["🇻🇳","VIE"],"Thailand":["🇹🇭","THA"],"India":["🇮🇳","IND"],"Kazakhstan":["🇰🇿","KAZ"],
  "Armenia":["🇦🇲","ARM"],"Azerbaijan":["🇦🇿","AZE"],"Fiji":["🇫🇯","FIJ"],"Tahiti":["🇵🇫","TAH"],
  "New Caledonia":["🇳🇨","NCL"],"Papua New Guinea":["🇵🇬","PNG"],"Russia":["🇷🇺","RUS"],
};
// Accent- and case-insensitive lookup so "Curaçao", "curacao", "Türkiye" all match
const deburr = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const TEAM_LOOKUP = {};
Object.keys(TEAM_DATA).forEach(k => { TEAM_LOOKUP[deburr(k)] = TEAM_DATA[k]; });
const teamEntry = (t) => TEAM_LOOKUP[deburr(t)];
// Returns the flag emoji, or a FIFA-style 3-letter code when no reliable emoji exists
const flag = (t) => {
  const e = teamEntry(t);
  if (e && e[0]) return e[0];
  if (e) return e[1];
  const letters = String(t || "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "⚽";
};

// Host nation tricolor band (USA · Canada · Mexico)
const HOST_BAND = ["#B22234", "#FAFAF7", "#D80621", "#FAFAF7", "#006847"];
const STORY_COLORS = ["#B22234", "#0A3161", "#006847"];

// Preseason forecast: cumulative pool points for a predicted finish, per the rules
const STAGE_PTS = { GRP: 0, R32: 3, R16: 8, QF: 13, SF: 23, F: 23, CH: 43 };
const STAGE_LABEL = { GRP: "Group exit", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", F: "Final", CH: "🏆 Champion" };
const forecastTeamPts = (f) => (f.gw || 0) * 3 + (f.gd || 0) * 1 + (f.uw || 0) * 3 + (STAGE_PTS[f.st] ?? 0);

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow+Condensed:ital,wght@0,500;0,700;1,700&family=IBM+Plex+Mono:wght@500;700&display=swap";

const C = {
  pitch: "#1E7A3C",
  pitchDark: "#14582B",
  chalk: "#FAFAF7",
  board: "#101820",
  boardLine: "#1F2B36",
  amber: "#FFD23F",
  red: "#D7263D",
  ink: "#13231A",
  inkSoft: "#3D5947",
};

const fontDisplay = "'Archivo Black', 'Arial Black', sans-serif";
const fontCond = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const fontMono = "'IBM Plex Mono', 'Courier New', monospace";

// Empty stat line for a team
const emptyStats = (t) => ({ t, gp:0, gf:0, ga:0, cy:0, cr:0, gw:0, gd:0, uw:0, og:0, bl:0, r32:0, r16:0, qf:0, sf:0, ch:0, elim:0, fo:0 });

// ---------------- POINT MATH ----------------
function teamBasePoints(s) {
  return s.gw*3 + s.gd*1 + s.uw*3 + s.r32*3 + s.r16*5 + s.qf*5 + s.sf*10 + s.ch*20
       + s.og*5 + s.bl*5 + (s.fo ? 10 : 0);
}

function computeAll(rosters, statsMap, tournamentOver) {
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

  // Last place: 0 match points (gw=gd=0) and worst goal differential
  let lastPlace = null;
  const pointless = played.filter(s => s.gw === 0 && s.gd === 0 && s.elim);
  if (pointless.length) {
    const worstGD = Math.min(...pointless.map(s => s.gf - s.ga));
    if (worstGD < 0) {
      const worst = pointless.filter(s => s.gf - s.ga === worstGD);
      if (worst.length === 1) lastPlace = { team: worst[0].t, gd: worstGD, mult: Math.max(1, Math.abs(worstGD)/2) };
    }
  }

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
    const zeroGoals = s.gf === 0 && s.gp > 0 && (tournamentOver || s.elim);
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

  const standings = rosters.map(p => {
    const provMultOf = (s, mostAllowedList) => (s.gf === 0 && s.gp > 0) || mostAllowedList.includes(s.t);
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
      // Provisional multipliers brewing (zero goals / most allowed), shown as if they locked today
      let provA = multA, provB = multB;
      if (provA === 1 && (provMultOf(statsMap[b] || emptyStats(b), mostAllowed))) provA = 1.5;
      if (provB === 1 && (provMultOf(statsMap[a] || emptyStats(a), mostAllowed))) provB = 1.5;
      if (provA > 1) projDetail.push(`${flag(b)} multiplier x${provA} boosts ${flag(a)} +${Math.round(pa * provA - pa)}`);
      if (provB > 1) projDetail.push(`${flag(a)} multiplier x${provB} boosts ${flag(b)} +${Math.round(pb * provB - pb)}`);
      projected = Math.round(pa * provA + pb * provB);
    } else {
      if (multA > 1) projDetail.push(`${flag(b)} multiplier x${multA} on ${flag(a)}`);
      if (multB > 1) projDetail.push(`${flag(a)} multiplier x${multB} on ${flag(b)}`);
    }
    return { player: p.name, teams: [a, b], teamPts: [teamScore[a], teamScore[b]], mults: [teamMult[b], teamMult[a]], current, total, projected, projDetail, stats: [sa, sb] };
  }).sort((x, y) => y.total - x.total || y.projected - x.projected);

  return { standings, stats, awards: { offenseLeaders, maxGF, defenseLeaders, minGA, cardLeaders, maxCards, mostAllowed, maxGA, lastPlace }, provMult, teamMult };
}

// ---------------- API HELPERS ----------------
// Data fetching now lives server-side (/api/update pulls from a sports data API
// on a daily cron). The client only triggers the update and re-reads the pool.

// ---------------- UI BITS ----------------
const SectionTitle = ({ children, light }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "0 0 14px" }}>
    <div style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${light ? C.chalk : C.ink}`, flexShrink: 0 }} />
    <h2 style={{ fontFamily: fontDisplay, fontSize: "clamp(20px, 3vw, 26px)", letterSpacing: 1, textTransform: "uppercase", color: light ? C.chalk : C.ink, margin: 0 }}>{children}</h2>
    <div style={{ flex: 1, height: 3, background: light ? "rgba(250,250,247,.6)" : C.ink }} />
  </div>
);

const Tag = ({ children, color = C.amber, dark }) => (
  <span style={{ fontFamily: fontCond, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, background: color, color: dark ? C.chalk : C.board, padding: "2px 8px", borderRadius: 3, display: "inline-block" }}>{children}</span>
);

// ---------------- MAIN APP ----------------
export default function WorldCupPool() {
  const [rosters, setRosters] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [stories, setStories] = useState([]);
  const [daySummary, setDaySummary] = useState("");
  const [upGames, setUpGames] = useState([]);
  const [teamFx, setTeamFx] = useState({});
  const [forecast, setForecast] = useState(null);
  const [forecastAt, setForecastAt] = useState(null);
  const [forecasting, setForecasting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastDay, setLastDay] = useState(null);
  const [pendingAuto, setPendingAuto] = useState(false);
  const autoRan = useRef(false);
  const [tournamentOver, setTournamentOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);

  // Apply a saved pool object to state (used by initial load and live re-sync)
  const applyPool = (d) => {
    setRosters(d.rosters || []);
    setStatsMap(d.statsMap || {});
    setStories(d.stories || []);
    setDaySummary(d.daySummary || "");
    setUpGames(d.upGames || []);
    setTeamFx(d.teamFx || {});
    setForecast(d.forecast || null);
    setForecastAt(d.forecastAt || null);
    setLastUpdated(d.lastUpdated || null);
    setLastDay(d.lastDay || null);
    setTournamentOver(!!d.tournamentOver);
  };

  // Load shared pool data
  useEffect(() => {
    (async () => {
      let savedDay = null;
      try {
        const r = await window.storage.get("wc26:pool", true);
        if (r) {
          const d = JSON.parse(r.value);
          applyPool(d);
          savedDay = d.lastDay || null;
          if (d.tournamentOver) savedDay = todayKey(); // stop auto-updating after the final
        }
      } catch (e) {
        // Could be "no data yet" or "no storage access (signed out)". Probe with a harmless write to tell them apart.
        try { await window.storage.set("wc26:probe", "1"); }
        catch (e2) { setStorageBlocked(true); }
      }
      // Auto-update once per day: first visitor after kickoff with stale data triggers it
      if (new Date() >= KICKOFF && savedDay !== todayKey()) setPendingAuto(true);
      setLoading(false);
    })();
  }, []);

  // ---- Preseason forecast: seeded once before kickoff from bookmaker consensus ----
  // (set server-side; this just re-reads the stored forecast so the buttons stay honest)
  const runForecast = async () => {
    setForecasting(true);
    setStatus("Refreshing the preseason forecast…");
    try {
      const r = await window.storage.get("wc26:pool", true);
      if (r) {
        const d = JSON.parse(r.value);
        if (d.forecast) {
          setForecast(d.forecast); setForecastAt(d.forecastAt || null);
          setStatus("");
        } else {
          setStatus("The preseason forecast is set once before kickoff — live projections take over after the first matches.");
        }
      }
    } catch (e) { setStatus("Could not refresh the forecast — try again."); }
    setForecasting(false);
  };

  // Roster management lives in lib/config.js now (edit + push) — the in-app
  // Pool Setup editor was removed since the backend is read-only anyway.

  // ---- Morning update ----
  // The whole pipeline (results, events, fixtures, standings, news, odds) runs
  // server-side in /api/update on a daily cron. This triggers it on demand and
  // applies the fresh pool. Auto runs are idempotent — the server no-ops if the
  // pool is already fresh today, so the old 5-minute lock is unnecessary.
  const runUpdate = async (auto = false) => {
    setUpdating(true); setStatus(auto ? "Good morning — pulling today's stories and results automatically…" : "Fetching today's World Cup results…");
    let hadError = false;
    try {
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: auto ? 1 : 0 }),
      });
      if (!res.ok) throw new Error(`update failed (${res.status})`);
      const d = await res.json();
      if (d && d.pool) applyPool(d.pool);
    } catch (e) {
      hadError = true;
      setStatus("Update failed — showing last saved data. Run Update now to retry.");
    }
    setUpdating(false);
    if (!hadError) setStatus("");
  };

  const { standings, awards, provMult } = computeAll(rosters, statsMap, tournamentOver);

  // Refs so the background sync always sees current state without re-binding listeners
  const busyRef = useRef(false);
  busyRef.current = updating || forecasting;
  const runUpdateRef = useRef(null);
  runUpdateRef.current = runUpdate;
  const lastSeenRef = useRef(null);
  lastSeenRef.current = lastUpdated;

  // Live re-sync: when the tab regains focus, and every 5 minutes while open,
  // pull the latest shared data so everyone sees the current version after any update
  useEffect(() => {
    const refresh = async () => {
      if (busyRef.current) return; // don't clobber an in-progress update or roster edit on this device
      try {
        const r = await window.storage.get("wc26:pool", true);
        if (!r) return;
        const d = JSON.parse(r.value);
        // Apply only strictly NEWER data — /api/pool is CDN-cached up to 15
        // minutes, so "different" can mean older than what this tab already
        // has right after a manual update. (lastUpdated is a CT wall-clock
        // string; both sides parse with the same offset, so ordering holds.)
        const seen = Date.parse(lastSeenRef.current) || 0;
        const got = Date.parse(d.lastUpdated) || 0;
        if (got > seen) applyPool(d); // someone else updated — sync it in
        // New day and nobody has updated yet? This open tab can be the morning trigger.
        if (new Date() >= KICKOFF && !d.tournamentOver && (d.lastDay || null) !== todayKey()) runUpdateRef.current(true);
      } catch (e) { /* signed-out or transient — try again next cycle */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); };
  }, []);
  // Deduped team stats for team-level panels (handles two players sharing a team)
  const uniqueTeamStats = [];
  { const seen = new Set(); standings.flatMap(r => r.stats).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); uniqueTeamStats.push(s); } }); }
  // Spelling-tolerant fixture lookup (accent/case/partial), mirroring the forecast's
  const fxFor = (t) => teamFx[t]
    || teamFx[Object.keys(teamFx).find(k => deburr(k) === deburr(t))]
    || teamFx[Object.keys(teamFx).find(k => deburr(k).includes(deburr(t)) || deburr(t).includes(deburr(k)))]
    || [];

  // Auto-run the daily update for the first visitor of the day
  useEffect(() => {
    if (!loading && pendingAuto && !autoRan.current) {
      autoRan.current = true;
      runUpdate(true);
    }
  }, [loading, pendingAuto]);

  // ---------------- RENDER ----------------
  const tryUnlock = () => {
    if (codeInput.trim().toUpperCase() === POOL_CODE.toUpperCase()) { setUnlocked(true); setCodeError(false); }
    else setCodeError(true);
  };

  if (!unlocked) {
    return (
      <div style={{ minHeight: "100vh", background: C.pitch, fontFamily: fontCond, display: "flex", alignItems: "center", justifyContent: "center", padding: "5vw",
        backgroundImage: `repeating-linear-gradient(90deg, ${C.pitch} 0px, ${C.pitch} 120px, ${C.pitchDark} 120px, ${C.pitchDark} 240px)` }}>
        <div style={{ background: C.chalk, borderRadius: 12, padding: "34px 30px", maxWidth: 420, width: "100%", boxShadow: "0 8px 0 rgba(0,0,0,.3)", textAlign: "center", borderTop: `8px solid ${C.amber}` }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🔒⚽</div>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 24, textTransform: "uppercase", color: C.ink, margin: "0 0 6px", letterSpacing: 1 }}>World Cup Pool</h1>
          <div style={{ fontSize: 17, color: C.inkSoft, marginBottom: 18 }}>Players only. Enter the pool code to see the standings.</div>
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value); setCodeError(false); }}
            onKeyDown={e => { if (e.key === "Enter") tryUnlock(); }}
            placeholder="Pool code"
            autoFocus
            style={{ fontFamily: fontMono, fontSize: 19, fontWeight: 700, textTransform: "uppercase", textAlign: "center", letterSpacing: 3, padding: "12px 14px", border: `2.5px solid ${codeError ? C.red : C.ink}`, borderRadius: 6, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
          />
          {codeError && <div style={{ color: C.red, fontFamily: fontMono, fontSize: 13, marginBottom: 10 }}>Wrong code — ask the group chat.</div>}
          <button onClick={tryUnlock}
            style={{ fontFamily: fontDisplay, textTransform: "uppercase", fontSize: 15, letterSpacing: 1, background: C.amber, color: C.board, border: "none", padding: "13px 24px", borderRadius: 6, cursor: "pointer", width: "100%", boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>
            Enter the stadium
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.pitch, fontFamily: fontCond, color: C.ink,
      backgroundImage: `repeating-linear-gradient(90deg, ${C.pitch} 0px, ${C.pitch} 120px, ${C.pitchDark} 120px, ${C.pitchDark} 240px)` }}>

      {/* ---------- HOST BAND + HEADER ---------- */}
      <div style={{ display: "flex", height: 8 }}>
        {HOST_BAND.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
      </div>
      <header style={{ borderBottom: `4px solid ${C.chalk}`, padding: "30px 5vw 24px", color: C.chalk, position: "relative", overflow: "hidden" }}>
        {/* chalk center-circle motif */}
        <div style={{ position: "absolute", right: "-90px", top: "-110px", width: 320, height: 320, borderRadius: "50%", border: "3px solid rgba(250,250,247,.25)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: "10px", top: "-10px", width: 120, height: 120, borderRadius: "50%", border: "3px solid rgba(250,250,247,.18)", pointerEvents: "none" }} />
        <div style={{ fontFamily: fontCond, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", fontSize: 14, opacity: .95 }}>
          🇺🇸 United States · 🇨🇦 Canada · 🇲🇽 Mexico — June 11 to July 19, 2026
        </div>
        <h1 style={{ fontFamily: fontDisplay, fontSize: "clamp(36px, 7vw, 68px)", lineHeight: 1.02, margin: "8px 0 4px", textTransform: "uppercase", textShadow: "3px 3px 0 rgba(0,0,0,.3)" }}>
          🏆 The World Cup Pool
        </h1>
        <div style={{ fontSize: 19, fontWeight: 500, opacity: .95 }}>48 teams. Two per friend. One trophy's worth of bragging rights.</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
          <button onClick={() => runUpdate(false)} disabled={updating}
            style={{ fontFamily: fontDisplay, textTransform: "uppercase", fontSize: 14, letterSpacing: 1, background: updating ? "#9a8a3a" : C.amber, color: C.board, border: "none", padding: "13px 24px", borderRadius: 6, cursor: updating ? "wait" : "pointer", boxShadow: "0 4px 0 rgba(0,0,0,.3)" }}>
            {updating ? "Updating…" : "⟳ Update now"}
          </button>
          <span style={{ fontFamily: fontMono, fontSize: 13, opacity: .9 }}>
            {lastUpdated ? `Last updated ${lastUpdated} · auto-refreshes daily on first visit` : "Updates automatically each day once the tournament kicks off June 11"}
          </span>
        </div>
        {status && <div style={{ marginTop: 10, fontFamily: fontMono, fontSize: 13, background: "rgba(0,0,0,.35)", display: "inline-block", padding: "6px 10px", borderRadius: 4 }}>{status}</div>}
        {storageBlocked && (
          <div style={{ marginTop: 12, background: "rgba(0,0,0,.45)", borderLeft: `5px solid ${C.amber}`, padding: "12px 16px", borderRadius: 6, fontSize: 16, lineHeight: 1.5, maxWidth: 720 }}>
            ⚠️ <b>Live pool data can't load in this browser session.</b> The site is fine — saved standings just require being signed in to a free Claude account on this device. Sign in and reload to see the pool, or ask the group chat for today's screenshot.
          </div>
        )}
      </header>

      {loading ? (
        <div style={{ padding: "60px 5vw", color: C.chalk, fontFamily: fontMono }}>Loading the pool…</div>
      ) : (
      <main style={{ padding: "34px 5vw 60px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ---------- UPCOMING GAMES ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>On the schedule</SectionTitle>
          {upGames.length === 0 ? (
            <div style={{ background: "rgba(0,0,0,.25)", color: C.chalk, padding: "16px 20px", borderRadius: 8, fontSize: 17 }}>
              The day's matches and the next three on the calendar will appear here after the first update.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {upGames.map((g, i) => { const td = isLocalToday(g); return (
                <div key={i} style={{ background: td ? C.board : "rgba(16,24,32,.82)", borderRadius: 8, padding: "12px 14px", border: td ? `2px solid ${C.amber}` : `1px solid ${C.boardLine}`, boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    {td ? <Tag>Today</Tag> : <span style={{ fontFamily: fontMono, fontSize: 12.5, color: "#8fa3b5", fontWeight: 700 }}>{localKickDate(g)}</span>}
                    <span style={{ fontFamily: fontMono, fontSize: 12.5, color: td ? C.amber : "#8fa3b5" }}>{localKickTime(g)}</span>
                  </div>
                  <div style={{ fontFamily: fontCond, fontWeight: 700, fontSize: 18.5, color: C.chalk, lineHeight: 1.35 }}>
                    {flag(g.a)} {g.a}
                    <span style={{ color: "#6c8094", fontFamily: fontMono, fontSize: 13, margin: "0 6px" }}>vs</span>
                    {flag(g.b)} {g.b}
                  </div>
                  {g.v && <div style={{ fontFamily: fontMono, fontSize: 12, color: "#7f93a5", marginTop: 6 }}>📍 {g.v}</div>}
                  {g.td && (g.pa || g.pb) ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", background: "#2a3845" }}>
                        <div style={{ width: `${g.pa || 0}%`, background: C.amber }} />
                        {g.pd ? <div style={{ width: `${g.pd}%`, background: "#56687a" }} /> : null}
                        <div style={{ width: `${g.pb || 0}%`, background: "#3E92CC" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: fontMono, fontSize: 11.5, marginTop: 4 }}>
                        <span style={{ color: C.amber }}>{g.a} {g.pa}%</span>
                        {g.pd ? <span style={{ color: "#8fa3b5" }}>Draw {g.pd}%</span> : null}
                        <span style={{ color: "#7FB7E3" }}>{g.b} {g.pb}%</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ); })}
            </div>
          )}
          {upGames.some(g => g.td && (g.pa || g.pb)) && (
            <div style={{ marginTop: 10, fontFamily: fontMono, fontSize: 11.5, color: "rgba(250,250,247,.7)" }}>
              Win chances are consensus pregame probabilities from published odds, refreshed each morning — for bragging-rights forecasting only.
            </div>
          )}
        </section>

        {/* ---------- TOP STORIES ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>Today's top stories</SectionTitle>
          {stories.length === 0 ? (
            <div style={{ background: "rgba(0,0,0,.25)", color: C.chalk, padding: "18px 20px", borderRadius: 6, fontSize: 17 }}>
              No stories yet. Hit <b>Run morning update</b> and three fresh World Cup headlines will land here every day.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
              {stories.map((st, i) => (
                <article key={i} style={{ background: C.chalk, borderRadius: 8, padding: "18px 20px", borderTop: `8px solid ${STORY_COLORS[i % 3]}`, boxShadow: "0 5px 0 rgba(0,0,0,.22)" }}>
                  <div style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 12, color: STORY_COLORS[i % 3], marginBottom: 8, letterSpacing: 1 }}>● STORY {i + 1}</div>
                  <h3 style={{ fontFamily: fontDisplay, fontSize: 18, lineHeight: 1.3, margin: "0 0 10px", color: C.ink }}>{st.h}</h3>
                  <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: C.inkSoft, fontWeight: 500 }}>{st.s}</p>
                </article>
              ))}
            </div>
          )}
          {daySummary && (
            <div style={{ marginTop: 16, background: "rgba(0,0,0,.4)", color: C.chalk, padding: "16px 20px", borderRadius: 8, fontSize: 17.5, lineHeight: 1.55, borderLeft: `5px solid ${C.amber}` }}>
              <Tag>⚽ Yesterday on the pitch</Tag>
              <div style={{ marginTop: 10 }}>{daySummary}</div>
            </div>
          )}
        </section>

        {/* ---------- SCOREBOARD ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>Scoreboard</SectionTitle>
          <div style={{ background: C.board, borderRadius: 10, padding: "18px 0 8px", boxShadow: "0 6px 0 rgba(0,0,0,.3)", overflowX: "auto", border: `2px solid rgba(255,210,63,.35)` }}>
            {standings.length === 0 ? (
              <div style={{ color: C.amber, fontFamily: fontMono, padding: "10px 24px 18px", fontSize: 15 }}>
                Awaiting the draft. Rosters are set in the pool config — check back shortly.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr style={{ color: "#8fa3b5", fontFamily: fontCond, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, fontSize: 13.5, textAlign: "left" }}>
                    <th style={{ padding: "4px 18px" }}>Pos</th>
                    <th style={{ padding: "4px 8px" }}>Player</th>
                    <th style={{ padding: "4px 8px" }}>Teams · pts</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Total</th>
                    <th style={{ padding: "4px 18px 4px 8px", textAlign: "right" }}>Projected*</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    const medalColor = i === 0 ? C.amber : i === 1 ? "#C8D2DC" : i === 2 ? "#D98E4A" : "#5d7186";
                    return (
                    <tr key={row.player} style={{ borderTop: `1px solid ${C.boardLine}`, background: i === 0 ? "rgba(255,210,63,.10)" : i % 2 ? "rgba(255,255,255,.025)" : "transparent" }}>
                      <td style={{ padding: "16px 18px", fontFamily: fontMono, fontWeight: 700, fontSize: 22, color: medalColor, whiteSpace: "nowrap", borderLeft: `5px solid ${i < 3 ? medalColor : "transparent"}` }}>
                        {medal || i + 1}
                      </td>
                      <td style={{ padding: "16px 8px", fontFamily: fontDisplay, fontSize: 19, color: C.chalk, textTransform: "uppercase", letterSpacing: .5 }}>{row.player}</td>
                      <td style={{ padding: "16px 8px" }}>
                        {row.teams.map((t, j) => (
                          <div key={t} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: j === 0 ? 6 : 0, opacity: row.stats[j].elim ? .55 : 1 }}>
                            <span style={{ fontSize: 20 }}>{flag(t)}</span>
                            <span style={{ color: "#E7EDF2", fontSize: 17, fontWeight: 700 }}>{t}</span>
                            <span style={{ fontFamily: fontMono, color: C.amber, fontSize: 15 }}>{row.teamPts[j]}</span>
                            {row.mults[j]?.label && <Tag color={C.red} dark>{row.mults[j].label}</Tag>}
                            {row.stats[j].elim ? <span style={{ color: "#8fa3b5", fontSize: 12, fontFamily: fontMono, border: "1px solid #44566a", borderRadius: 3, padding: "0 5px" }}>OUT</span> : null}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: "16px 8px", textAlign: "right", fontFamily: fontMono, fontWeight: 700, fontSize: 32, color: i === 0 ? C.amber : "#FFE48A" }}>{row.total}</td>
                      <td style={{ padding: "16px 18px 16px 8px", textAlign: "right", fontFamily: fontMono, fontSize: 18, color: "#9fb2c2" }}>{row.projected}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            )}
            <div style={{ color: "#7f93a5", fontFamily: fontMono, fontSize: 12, padding: "10px 18px" }}>
              * Projected adds end-of-tournament awards and multipliers as if they locked today. Total counts only banked points{tournamentOver ? " — tournament complete, awards included." : "."}
            </div>
          </div>
        </section>

        {/* ---------- PROJECTED STANDINGS ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>Projected final standings</SectionTitle>
          {standings.length === 0 ? (
            <div style={{ background: "rgba(0,0,0,.25)", color: C.chalk, padding: "16px 20px", borderRadius: 8, fontSize: 17 }}>
              Once the rosters are in, this section forecasts how everyone finishes — first from preseason predictions, then from live results.
            </div>
          ) : !standings.some(r => r.stats.some(s => s.gp > 0)) ? (
            /* ----- PRESEASON MODE: no matches played yet ----- */
            !forecast ? (
              <div style={{ background: C.chalk, borderRadius: 10, padding: "22px 24px", boxShadow: "0 6px 0 rgba(0,0,0,.25)" }}>
                <div style={{ fontSize: 17.5, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>
                  No matches yet — but we can call it early. The forecast searches tournament odds and expert predictions for all {standings.length * 2 >= 32 ? "32" : "your"} teams, predicts each one's run, converts it to pool points using your scoring rules, and ranks the players.
                </div>
                <button onClick={runForecast} disabled={forecasting}
                  style={{ fontFamily: fontDisplay, textTransform: "uppercase", fontSize: 14, letterSpacing: 1, background: forecasting ? "#9a8a3a" : C.amber, color: C.board, border: "none", padding: "13px 24px", borderRadius: 6, cursor: forecasting ? "wait" : "pointer", boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>
                  {forecasting ? "Forecasting…" : "🔮 Generate preseason forecast"}
                </button>
              </div>
            ) : (() => {
              const fcFor = (t) => forecast[t]
                || forecast[Object.keys(forecast).find(k => deburr(k) === deburr(t))]
                || forecast[Object.keys(forecast).find(k => deburr(k).includes(deburr(t)) || deburr(t).includes(deburr(k)))];
              const rows = standings.map(r => {
                const fa = fcFor(r.teams[0]), fb = fcFor(r.teams[1]);
                const pa = fa ? forecastTeamPts(fa) : null, pb = fb ? forecastTeamPts(fb) : null;
                return { ...r, f: [fa, fb], fPts: [pa, pb], fTotal: (pa || 0) + (pb || 0) };
              }).sort((x, y) => y.fTotal - x.fTotal);
              return (
                <div style={{ background: C.chalk, borderRadius: 10, padding: "6px 0", boxShadow: "0 6px 0 rgba(0,0,0,.25)" }}>
                  <div style={{ padding: "12px 20px 4px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <Tag>🔮 Preseason forecast</Tag>
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.inkSoft }}>Generated {forecastAt} · switches to live projections at first kickoff</span>
                    <button onClick={runForecast} disabled={forecasting} style={{ marginLeft: "auto", fontFamily: fontCond, fontWeight: 700, fontSize: 13, background: "none", border: `1.5px solid ${C.ink}`, color: C.ink, borderRadius: 4, padding: "4px 10px", cursor: forecasting ? "wait" : "pointer" }}>
                      {forecasting ? "Refreshing…" : "Re-run"}
                    </button>
                  </div>
                  {rows.map((row, i) => (
                    <div key={row.player} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: "1px solid #e3e0d4", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 19, color: C.ink, minWidth: 28 }}>{i + 1}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 16, textTransform: "uppercase", color: C.ink, minWidth: 130 }}>{row.player}</span>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                        {row.teams.map((t, j) => (
                          <span key={t} style={{ fontFamily: fontMono, fontSize: 12, background: !row.f[j] ? "#FBE9E9" : row.f[j]?.st === "CH" ? "#FFF3C9" : "#EFEBDD", color: !row.f[j] ? C.red : C.inkSoft, borderRadius: 4, padding: "3px 8px", border: `1px solid ${!row.f[j] ? "#E8B8B8" : "#ddd8c8"}` }}>
                            {flag(t)} {row.f[j] ? `${STAGE_LABEL[row.f[j].st] || "TBD"} · ${row.fPts[j]} pts` : "no forecast — check spelling, then Re-run"}
                          </span>
                        ))}
                      </span>
                      <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 24, color: i === 0 ? "#9a7b00" : C.ink, minWidth: 56, textAlign: "right" }}>{row.fTotal}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: fontMono, fontSize: 12, color: C.inkSoft, padding: "10px 20px", borderTop: "1px solid #e3e0d4", lineHeight: 1.6 }}>
                    Predicted runs come from tournament odds and expert picks, scored with this pool's rules (group results, upsets, advancement). Bonuses and multipliers aren't predicted — they're the chaos that makes the forecast wrong. Screenshot it now, argue about it in July.
                  </div>
                </div>
              );
            })()
          ) : (() => {
            const proj = [...standings].sort((x, y) => y.projected - x.projected || y.total - x.total);
            const anyPending = proj.some(r => r.projDetail && r.projDetail.length);
            return (
              <div style={{ background: C.chalk, borderRadius: 10, padding: "6px 0", boxShadow: "0 6px 0 rgba(0,0,0,.25)" }}>
                {proj.map((row, i) => {
                  const liveRank = standings.findIndex(s => s.player === row.player);
                  const move = liveRank - i;
                  const arrow = move > 0 ? `▲${move}` : move < 0 ? `▼${Math.abs(move)}` : "—";
                  const arrowColor = move > 0 ? "#1B7A3D" : move < 0 ? C.red : "#9a9a90";
                  return (
                    <div key={row.player} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: i ? "1px solid #e3e0d4" : "none", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 19, color: C.ink, minWidth: 28 }}>{i + 1}</span>
                      <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 13, color: arrowColor, minWidth: 34 }} title="Movement vs live scoreboard">{arrow}</span>
                      <span style={{ fontFamily: fontDisplay, fontSize: 16, textTransform: "uppercase", color: C.ink, minWidth: 130 }}>{row.player}</span>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                        {(row.projDetail || []).map((d, k) => (
                          <span key={k} style={{ fontFamily: fontMono, fontSize: 12, background: "#EFEBDD", color: C.inkSoft, borderRadius: 4, padding: "3px 8px", border: "1px solid #ddd8c8" }}>{d}</span>
                        ))}
                      </span>
                      <span style={{ fontFamily: fontMono, fontSize: 14, color: "#9a9a90" }}>{row.total} banked</span>
                      <span style={{ fontFamily: fontMono, fontWeight: 700, fontSize: 24, color: row.projected > row.total ? "#1B7A3D" : C.ink, minWidth: 56, textAlign: "right" }}>{row.projected}</span>
                    </div>
                  );
                })}
                <div style={{ fontFamily: fontMono, fontSize: 12, color: C.inkSoft, padding: "10px 20px", borderTop: "1px solid #e3e0d4", lineHeight: 1.6 }}>
                  {anyPending
                    ? "Projection = banked points + season awards (Best Offense/Defense/Most Cards, +10 each) and multipliers as if they locked at today's numbers. These swing daily until the final whistle — ▲▼ shows movement vs the live scoreboard."
                    : "No season awards or multipliers in play yet — projections currently match the live scoreboard. They'll diverge once goals, cards, and eliminations pile up."}
                </div>
              </div>
            );
          })()}
        </section>

        {/* ---------- PLAYER SCHEDULES ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>Your teams this week</SectionTitle>
          {standings.length === 0 ? (
            <div style={{ background: "rgba(0,0,0,.25)", color: C.chalk, padding: "16px 20px", borderRadius: 8, fontSize: 17 }}>
              Once the draft is in, each player gets their teams' upcoming match schedule here.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {standings.map(row => (
                <div key={row.player} style={{ background: C.chalk, borderRadius: 8, padding: "16px 18px", boxShadow: "0 5px 0 rgba(0,0,0,.22)", borderTop: `4px solid ${C.pitchDark}` }}>
                  <h3 style={{ fontFamily: fontDisplay, fontSize: 16, textTransform: "uppercase", margin: "0 0 10px", color: C.ink, letterSpacing: .5 }}>{row.player}</h3>
                  {row.teams.map((t, j) => {
                    const matches = fxFor(t);
                    const out = row.stats[j].elim;
                    return (
                      <div key={t} style={{ padding: "8px 0", borderTop: "1px solid #e3e0d4" }}>
                        <div style={{ fontFamily: fontCond, fontWeight: 700, fontSize: 17, color: out ? "#9a9a90" : C.ink }}>
                          {flag(t)} {t} {out && <span style={{ fontFamily: fontMono, fontSize: 11, color: C.red, border: `1px solid ${C.red}`, borderRadius: 3, padding: "0 5px", marginLeft: 4 }}>OUT</span>}
                        </div>
                        {out ? (
                          <div style={{ fontSize: 14.5, color: "#9a9a90", marginTop: 2 }}>Tournament over — points are banked.</div>
                        ) : matches.length === 0 ? (
                          <div style={{ fontSize: 14.5, color: C.inkSoft, marginTop: 2 }}>No schedule loaded yet — tap Update now to fetch it.</div>
                        ) : matches.map((m, k) => (
                          <div key={k} style={{ display: "flex", gap: 8, fontSize: 15.5, color: C.inkSoft, marginTop: 3, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: fontMono, fontSize: 12.5, fontWeight: 700, color: C.pitchDark, minWidth: 52 }}>{localKickDate(m)}</span>
                            <span style={{ fontWeight: 600 }}>vs {flag(m.o)} {m.o}</span>
                            <span style={{ fontFamily: fontMono, fontSize: 12.5 }}>{localKickTime(m)}{m.v ? ` · ${m.v}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- CATEGORY PANELS ---------- */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle light>Point categories</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>

            {/* Match points */}
            <Panel title="Match points" sub="Group W 3 · Draw 1 · Upset W 3 (any round)">
              {standings.length === 0 ? <Empty /> : standings.map(r => (
                <Row key={r.player} label={r.player}>
                  {r.stats.map(s => `${flag(s.t)} ${s.gw}W ${s.gd}D ${s.uw} upset${s.uw === 1 ? "" : "s"}`).join("  ·  ")}
                </Row>
              ))}
            </Panel>

            {/* Knockout progress */}
            <Panel title="Knockout run" sub="R32 +3 · R16 +5 · QF +5 · SF +10 · Champion +20">
              {standings.length === 0 ? <Empty /> : uniqueTeamStats.map(s => (
                <Row key={s.t} label={`${flag(s.t)} ${s.t}`}>
                  {s.ch ? "🏆 CHAMPION" : s.sf ? "Semi-finals" : s.qf ? "Quarter-finals" : s.r16 ? "Round of 16" : s.r32 ? "Round of 32" : s.elim ? "Eliminated" : "Group stage"}
                </Row>
              ))}
            </Panel>

            {/* Chaos bonuses */}
            <Panel title="Chaos bonuses" sub="Own goal +5 each · Blowout loss (4+) +5 each · First out +10">
              {standings.length === 0 ? <Empty /> : (() => {
                const lines = uniqueTeamStats.filter(s => s.og || s.bl || s.fo);
                return lines.length === 0 ? <Empty text="Nothing chaotic yet. Give it time." /> :
                  lines.map(s => (
                    <Row key={s.t} label={`${flag(s.t)} ${s.t}`}>
                      {[s.og ? `${s.og} own goal${s.og>1?"s":""}` : null, s.bl ? `${s.bl} blowout loss${s.bl>1?"es":""}` : null, s.fo ? "FIRST OUT" : null].filter(Boolean).join(" · ")}
                    </Row>
                  ));
              })()}
            </Panel>

            {/* Season awards */}
            <Panel title="Season awards (provisional)" sub="Best offense +10 · Best defense +10 · Most cards +10 — locked at final whistle">
              <Row label="Offense">{awards.offenseLeaders.length ? `${awards.offenseLeaders.map(t => `${flag(t)} ${t}`).join(", ")} — ${awards.maxGF} goals` : "No goals logged yet"}</Row>
              <Row label="Defense">{awards.defenseLeaders.length ? `${awards.defenseLeaders.map(t => `${flag(t)} ${t}`).join(", ")} — ${awards.minGA} allowed (3+ games)` : "Needs 3+ games played"}</Row>
              <Row label="Cards">{awards.cardLeaders.length ? `${awards.cardLeaders.map(t => `${flag(t)} ${t}`).join(", ")} — ${awards.maxCards} card pts` : "Clean sheets so far"}</Row>
            </Panel>

            {/* Multiplier watch */}
            <Panel title="Multiplier watch" sub="Zero goals 1.5x · Most allowed 1.5x · Last place ½ × worst GD — boosts your OTHER team">
              {standings.length === 0 ? <Empty /> : (() => {
                const flagged = uniqueTeamStats.filter(s => (provMult[s.t] || []).length);
                const lp = awards.lastPlace;
                return (
                  <>
                    {flagged.length === 0 && !lp && <Empty text="No multipliers brewing yet." />}
                    {flagged.map(s => <Row key={s.t} label={`${flag(s.t)} ${s.t}`}>{provMult[s.t].join(" · ")}</Row>)}
                    {lp && <Row label={`${flag(lp.team)} ${lp.team}`}>Last place locked — partner team x{lp.mult}</Row>}
                  </>
                );
              })()}
            </Panel>

            {/* Top 10 reference */}
            <Panel title="Upset targets" sub="Beat any of these for +3, any round">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {TOP10.map(t => <Tag key={t} color="#EFEBDD">{flag(t)} {t}</Tag>)}
              </div>
            </Panel>
          </div>
        </section>

        <footer style={{ marginTop: 40, color: "rgba(250,250,247,.7)", fontFamily: fontMono, fontSize: 12, textAlign: "center" }}>
          Auto-updates daily when the first person checks in · Points only count once banked · Settle disputes over a beverage
        </footer>
      </main>
      )}
    </div>
  );
}

// ---- small panel components ----
function Panel({ title, sub, children }) {
  return (
    <div style={{ background: C.chalk, borderRadius: 8, padding: "18px 20px", boxShadow: "0 5px 0 rgba(0,0,0,.22)", borderTop: `4px solid ${C.amber}` }}>
      <h3 style={{ fontFamily: fontDisplay, fontSize: 17, textTransform: "uppercase", margin: "0 0 3px", color: C.ink, letterSpacing: .5 }}>{title}</h3>
      <div style={{ fontFamily: fontMono, fontSize: 12.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.55 }}>{sub}</div>
      {children}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid #e3e0d4", fontSize: 16.5, fontWeight: 500, alignItems: "baseline", flexWrap: "wrap" }}>
      <b style={{ minWidth: 110, fontFamily: fontCond, fontWeight: 700, color: C.ink }}>{label}</b>
      <span style={{ color: C.inkSoft, flex: 1 }}>{children}</span>
    </div>
  );
}
function Empty({ text = "Waiting on the draft." }) {
  return <div style={{ fontFamily: fontMono, fontSize: 13, color: C.inkSoft, padding: "6px 0" }}>{text}</div>;
}

