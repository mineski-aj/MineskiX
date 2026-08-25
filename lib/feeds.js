// lib/feeds.js — buildVmix, buildCampFeed, buildLeagueStats, buildHighlights
const fs   = require("fs");
const path = require("path");

const { players, ROLE_DISPLAY, POSTGAME_DIR, ROLE_ORDER } = require('./config');
const state = require('./state');
const { deriveStats, buildClashSummary, buildHighlights } = require('./game');

// A disconnected watch reports no bpm — no simulated/frozen fallback.
function resolveBpm(r) {
  return r.status === "ok" ? r.bpm : null;
}

// ── BUILD VMIX ────────────────────────────────────────────────────────────────
function buildVmix() {
  return Object.values(state.readings).map((r) => ({
    bpm:    resolveBpm(r),
    name:   r.name,
    role:   r.role,
    slot:   r.slot,
    status: r.status,
    team:   r.team,
  }));
}

// ── BUILD CAMP FEED ───────────────────────────────────────────────────────────
function buildCampFeed() {
  const mapCamp = (entries, gameCampId) =>
    entries.map(({ pid, watch }, i) => {
      const r  = state.readings[pid];
      const d  = deriveStats(pid);
      const heroId = state.lastPlayerSnap[`${gameCampId}-${i + 1}`]?.hero_id ?? null;
      return {
        [`player${i + 1}`]: {
          slot:        `slot${watch}`,
          name:        `watch${watch}`,
          player_name: state.playerNames[watch] || null,
          role:        ROLE_DISPLAY[players[pid].role] || players[pid].role,
          hero_id:     heroId,
          bpm:         resolveBpm(r),
          status:      r.status,
          avg_bpm:                 d.avg_bpm,
          peak_bpm:                d.peak_bpm,
          pct_above_120:           d.pct_above_120,
          avg_bpm_at_objectives:   d.avg_bpm_at_objectives,
          peak_bpm_at_objectives:  d.peak_bpm_at_objectives,
          avg_clash_bpm:           d.avg_clash_bpm,
          item_timeline:           state.itemLog[pid] || [],
        },
      };
    });

  const r = state.readings;
  const coachBpm = (pid) => resolveBpm(r[pid]);

  return {
    game: {
      state:         state.gameState.state,
      game_time:     state.gameState.game_time_fmt,
      battleid:      state.gameState.battleid,
      camp_swapped:  state.campSwapped,
      camp1_tricode: (state.gameState.campNames && state.gameState.campNames.camp1) ? state.gameState.campNames.camp1.toUpperCase().trim() : state.campTricodes.camp1,
      camp2_tricode: (state.gameState.campNames && state.gameState.campNames.camp2) ? state.gameState.campNames.camp2.toUpperCase().trim() : state.campTricodes.camp2,
    },
    camp1: {
      tricode: state.campSwapped
        ? (state.gameState.campNames && state.gameState.campNames.camp2 ? state.gameState.campNames.camp2.toUpperCase().trim() : state.campTricodes.camp2)
        : (state.gameState.campNames && state.gameState.campNames.camp1 ? state.gameState.campNames.camp1.toUpperCase().trim() : state.campTricodes.camp1),
      players: mapCamp(state.activeCampMap.camp1, 1),
      coaches: state.campSwapped
        ? [
            { slot: "coach_away1", name: "Away Coach 1", role: "COACH", bpm: coachBpm("coach_away1"), status: r.coach_away1.status },
            { slot: "coach_away2", name: "Away Coach 2", role: "COACH", bpm: coachBpm("coach_away2"), status: r.coach_away2.status },
          ]
        : [
            { slot: "coach_home1", name: "Home Coach 1", role: "COACH", bpm: coachBpm("coach_home1"), status: r.coach_home1.status },
            { slot: "coach_home2", name: "Home Coach 2", role: "COACH", bpm: coachBpm("coach_home2"), status: r.coach_home2.status },
          ],
    },
    camp2: {
      tricode: state.campSwapped
        ? (state.gameState.campNames && state.gameState.campNames.camp1 ? state.gameState.campNames.camp1.toUpperCase().trim() : state.campTricodes.camp1)
        : (state.gameState.campNames && state.gameState.campNames.camp2 ? state.gameState.campNames.camp2.toUpperCase().trim() : state.campTricodes.camp2),
      players: mapCamp(state.activeCampMap.camp2, 2),
      coaches: state.campSwapped
        ? [
            { slot: "coach_home1", name: "Home Coach 1", role: "COACH", bpm: coachBpm("coach_home1"), status: r.coach_home1.status },
            { slot: "coach_home2", name: "Home Coach 2", role: "COACH", bpm: coachBpm("coach_home2"), status: r.coach_home2.status },
          ]
        : [
            { slot: "coach_away1", name: "Away Coach 1", role: "COACH", bpm: coachBpm("coach_away1"), status: r.coach_away1.status },
            { slot: "coach_away2", name: "Away Coach 2", role: "COACH", bpm: coachBpm("coach_away2"), status: r.coach_away2.status },
          ],
    },
    highlights: buildHighlights(state.playerNames),
    clashes:    buildClashSummary(),
  };
}

// ── LEAGUE STATS BUILDER ──────────────────────────────────────────────────────
function buildLeagueStats() {
  const files = fs.readdirSync(POSTGAME_DIR).filter(f => f.endsWith('.json'));

  const byBattle = {};
  for (const fname of files) {
    const match = fname.match(/^postgame_([^_]+(?:_[^_]+)*)_(\d{4}-\d{2}-\d{2})(?:_(\d+))?\.json$/);
    if (!match) continue;
    const battleid  = match[1];
    const iteration = match[3] ? parseInt(match[3]) : 1;
    if (!byBattle[battleid] || iteration > byBattle[battleid].iteration) {
      byBattle[battleid] = { fname, iteration };
    }
  }

  const games = [];
  for (const { fname } of Object.values(byBattle)) {
    try {
      const raw = fs.readFileSync(path.join(POSTGAME_DIR, fname), 'utf8');
      games.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`[LEAGUE] Could not parse ${fname}:`, e.message);
    }
  }

  const h2hData = buildLeagueStats._h2hCache || null;

  let currentMatchup = null;
  if (h2hData) {
    currentMatchup = { _team1: h2hData.team1, _team2: h2hData.team2, _pending: true };
  }

  const teamMap = {};

  for (const game of games) {
    for (const campKey of ['camp1', 'camp2', 'home', 'away']) {
      const campObj = game[campKey];
      if (!campObj || !campObj.players) continue;
      const tricode = campObj.tricode || campObj.camp_code || null;
      if (!tricode) continue;
      if (!teamMap[tricode]) teamMap[tricode] = {};

      const playerList = Array.isArray(campObj.players)
        ? campObj.players.map(p => typeof p === 'object' && !p.player_name ? Object.values(p)[0] : p)
        : [];
      for (const p of playerList) {
        if (!p || !p.player_name) continue;
        const name = p.player_name;
        if (!teamMap[tricode][name]) {
          teamMap[tricode][name] = {
            player_name:              name,
            role:                     p.role || null,
            games_played:             0,
            avg_bpm_samples:          [],
            peak_bpm_ever:            null,
            pct_above_120_samples:    [],
            avg_bpm_at_obj_samples:   [],
            peak_bpm_at_obj_ever:     null,
          };
        }
        const acc = teamMap[tricode][name];
        if (p.role) acc.role = p.role;
        if (p.avg_bpm !== null && p.avg_bpm !== undefined) {
          acc.games_played++;
          acc.avg_bpm_samples.push(p.avg_bpm);
        }
        if (p.peak_bpm !== null && p.peak_bpm !== undefined) {
          acc.peak_bpm_ever = acc.peak_bpm_ever === null ? p.peak_bpm : Math.max(acc.peak_bpm_ever, p.peak_bpm);
        }
        if (p.pct_above_120 !== null && p.pct_above_120 !== undefined) {
          const pct = parseInt(p.pct_above_120);
          if (!isNaN(pct)) acc.pct_above_120_samples.push(pct);
        }
        if (p.avg_bpm_at_objectives !== null && p.avg_bpm_at_objectives !== undefined) {
          acc.avg_bpm_at_obj_samples.push(p.avg_bpm_at_objectives);
        }
        if (p.peak_bpm_at_objectives !== null && p.peak_bpm_at_objectives !== undefined) {
          acc.peak_bpm_at_obj_ever = acc.peak_bpm_at_obj_ever === null
            ? p.peak_bpm_at_objectives
            : Math.max(acc.peak_bpm_at_obj_ever, p.peak_bpm_at_objectives);
        }
      }
    }
  }

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const teams = Object.entries(teamMap).map(([tricode, playerMap]) => {
    const sorted = Object.values(playerMap)
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map(acc => ({
        player_name:            acc.player_name,
        role:                   acc.role,
        games_played:           acc.games_played,
        avg_bpm:                avg(acc.avg_bpm_samples),
        peak_bpm_ever:          acc.peak_bpm_ever,
        avg_pct_above_120:      acc.pct_above_120_samples.length ? avg(acc.pct_above_120_samples) + "%" : null,
        avg_bpm_at_objectives:  avg(acc.avg_bpm_at_obj_samples),
        peak_bpm_at_objectives: acc.peak_bpm_at_obj_ever,
      }));
    return { tricode, players: sorted };
  });

  if (currentMatchup && currentMatchup._pending) {
    const t1 = currentMatchup._team1;
    const t2 = currentMatchup._team2;
    const buildMatchupTeam = (teamData) => {
      const tricode = ((teamData && teamData.tricode) || '').toUpperCase().trim();
      const teamLeague = teams.find(t => t.tricode === tricode);
      const leaguePlayers = teamLeague ? teamLeague.players : [];
      return {
        tricode,
        team_name: (teamData && (teamData.CAMP_NAME || teamData['TEAM NAME'])) || null,
        players: leaguePlayers.map(lp => ({
          player_name:            lp.player_name,
          role:                   lp.role,
          games_played:           lp.games_played,
          avg_bpm:                lp.avg_bpm,
          peak_bpm_ever:          lp.peak_bpm_ever,
          avg_pct_above_120:      lp.avg_pct_above_120,
          avg_bpm_at_objectives:  lp.avg_bpm_at_objectives,
          peak_bpm_at_objectives: lp.peak_bpm_at_objectives,
        })),
      };
    };
    currentMatchup = {
      home: buildMatchupTeam(t1),
      away: buildMatchupTeam(t2),
    };
  }

  return {
    current_matchup: currentMatchup || { error: "H2H data not yet available" },
    league_stats: {
      games_recorded: games.length,
      teams,
    },
  };
}

// Static property for H2H cache — set by pollers.js
buildLeagueStats._h2hCache = null;

module.exports = { buildVmix, buildCampFeed, buildLeagueStats };
