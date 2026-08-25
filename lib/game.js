// lib/game.js — game logic: fight tracking, stats, postgame, swap
const fs   = require("fs");
const path = require("path");

const {
  players, ROLE_DISPLAY, CAMP_MAP,
  POSTGAME_DIR, POSITIONS_FILE, EVENTS_FILE, FIGHTS_FILE,
  MAX_FIGHTS, FIGHT_GAP_S, MAX_EVENTS,
} = require('./config');
const state      = require('./state');
const matchState = require('./matchState');
const { ITEM_NAMES, TIER3_ITEMS, countItems } = require('./items');

// ── CAMP SWAP ─────────────────────────────────────────────────────────────────
function applySwap(swapped) {
  if (swapped === state.campSwapped) return;
  state.campSwapped = swapped;
  if (swapped) {
    state.activeCampMap = { camp1: [...CAMP_MAP.camp2], camp2: [...CAMP_MAP.camp1] };
    console.log("[CAMP] Sides swapped — watch10-6 = camp1, watch1-5 = camp2");
  } else {
    state.activeCampMap = { camp1: [...CAMP_MAP.camp1], camp2: [...CAMP_MAP.camp2] };
    console.log("[CAMP] Sides normal — watch1-5 = camp1, watch10-6 = camp2");
  }
}

// ── EXTRACT SEAT STATS ────────────────────────────────────────────────────────
function extractSeatStats(seat) {
  const ep = seat.extra_param || {};
  const hr = (seat.hit_rate || []).filter(sk => sk.skillid && sk.skillid !== "0" && sk.skill_name !== "Unknown");
  return {
    dmg_out:     seat.total_damage     ?? 0,
    dmg_in:      seat.total_hurt       ?? 0,
    gold:        seat.gold             ?? 0,
    kills:       seat.kill_num         ?? 0,
    deaths:      seat.dead_num         ?? 0,
    assists:     seat.assist_num       ?? 0,
    heal_self:   seat.total_heal       ?? 0,
    heal_other:  seat.total_heal_other ?? 0,
    control_ms:  seat.control_time_ms  ?? 0,
    skills:      hr.reduce((s, sk) => s + (sk.cast_times || 0), 0),
    hit_rate:    hr,
    multi_kills: {
      double: ep.double_kill || 0,
      triple: ep.triple_kill || 0,
      quadra: ep.quadra_kill || 0,
      penta:  ep.penta_kill  || 0,
    },
  };
}

// ── COMPUTE SKILLS DELTA ─────────────────────────────────────────────────────
function computeSkillsDelta(finalHR, baseHR) {
  const result = [];
  for (const fsk of (finalHR || [])) {
    const bsk   = (baseHR || []).find(s => s.skillid === fsk.skillid) || { cast_times: 0, hit_times: 0 };
    const casts = Math.max(0, (fsk.cast_times || 0) - (bsk.cast_times || 0));
    const hits  = Math.max(0, (fsk.hit_times  || 0) - (bsk.hit_times  || 0));
    result.push({
      skill_name: fsk.skill_name,
      casts,
      hits,
      hit_pct: casts > 0 ? Math.round((hits / casts) * 100) : 0,
    });
  }
  return result;
}

// ── CLASH BPM (sourced from the fight recorder — state.fightLog) ────────────────
// Each closed fight in fightLog already carries a per-player avg_bpm + how
// many bpm_ticks it was averaged from (see closeFight). Aggregating those
// across every fight this game gives a game-long "BPM during fights" figure
// without re-polling anything — same underlying samples, just rolled up.
function weightedBpmAvg(entries) {
  let sum = 0, n = 0;
  for (const e of entries) {
    if (e && e.bpm_samples > 0 && e.avg_bpm !== null && e.avg_bpm !== undefined) {
      sum += e.avg_bpm * e.bpm_samples;
      n += e.bpm_samples;
    }
  }
  return n > 0 ? Math.round(sum / n) : null;
}

function campSeatForPid(pid) {
  for (const [campKey, entries] of Object.entries(state.activeCampMap)) {
    const idx = entries.findIndex(e => e.pid === pid);
    if (idx !== -1) return { camp: campKey === 'camp1' ? 1 : 2, seat: idx + 1 };
  }
  return null;
}

function deriveClashBpm(pid) {
  const loc = campSeatForPid(pid);
  if (!loc) return null;
  const entries = state.fightLog
    .map(fight => fight.players.find(p => p.camp === loc.camp && p.seat === loc.seat))
    .filter(Boolean);
  return weightedBpmAvg(entries);
}

// ── DERIVE STATS FOR ONE PLAYER ───────────────────────────────────────────────
function deriveStats(pid) {
  const s   = state.stats[pid];
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const avg_bpm      = avg(s.bpm_samples);
  const peak_bpm     = s.bpm_samples.length ? Math.max(...s.bpm_samples) : null;
  const pct_above_120 = s.ticks_total > 0
    ? Math.round((s.ticks_above_120 / s.ticks_total) * 100) + "%"
    : null;
  const avg_bpm_at_objectives  = avg(s.objective_bpm_samples);
  const peak_bpm_at_objectives = s.objective_bpm_samples.length
    ? Math.max(...s.objective_bpm_samples)
    : null;
  const avg_clash_bpm = deriveClashBpm(pid);

  return { avg_bpm, peak_bpm, pct_above_120, avg_bpm_at_objectives, peak_bpm_at_objectives, avg_clash_bpm };
}

// ── TICK STATS ────────────────────────────────────────────────────────────────
function tickStats() {
  for (const pid of Object.keys(players)) {
    const r = state.readings[pid];
    if (r.bpm === null || r.status !== "ok") continue;
    state.stats[pid].bpm_samples.push(r.bpm);
    state.stats[pid].ticks_total++;
    if (r.bpm > 120) state.stats[pid].ticks_above_120++;
  }
}

// ── SNAPSHOT OBJECTIVE ────────────────────────────────────────────────────────
function snapshotObjective(type, game_time_fmt) {
  console.log(`[OBJECTIVE] ${type} kill at ${game_time_fmt}`);
  for (const pid of Object.keys(players)) {
    const r = state.readings[pid];
    if (r.bpm !== null && r.status === "ok") {
      state.stats[pid].objective_bpm_samples.push(r.bpm);
    }
  }
}

// ── SNAPSHOT CLASH ────────────────────────────────────────────────────────────
function snapshotClash(game_time_fmt, kill_jump) {
  const avg = (pids) => {
    const vals = pids
      .map(({ pid }) => state.readings[pid])
      .filter(r => r.bpm !== null && r.status === "ok")
      .map(r => r.bpm);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  state.clashSnapshots.push({
    game_time:  game_time_fmt,
    kill_jump,
    camp1_avg_bpm: avg(state.activeCampMap.camp1),
    camp2_avg_bpm: avg(state.activeCampMap.camp2),
  });
}

// ── BUILD CLASH SUMMARY ───────────────────────────────────────────────────────
// A "clash" here is a real recorded fight (state.fightLog, from the fight
// recorder — see tickFight/closeFight), not the old kill-jump heuristic:
// every fight already carries each player's avg_bpm + sample count, so this
// just rolls those up per camp and across the whole game.
function buildClashSummary() {
  const fights = state.fightLog;
  if (!fights.length) {
    return { clash_count: null, camp1_avg_bpm_in_clashes: null, camp2_avg_bpm_in_clashes: null, clashes: [] };
  }

  const campAvgForFight = (fight, camp) => weightedBpmAvg(fight.players.filter(p => p.camp === camp));
  const campAvgOverall  = (camp) => weightedBpmAvg(fights.flatMap(f => f.players.filter(p => p.camp === camp)));

  const clashes = fights.map(f => ({
    fight_id:      f.id,
    game_time:     f.start_time_fmt,
    duration_s:    f.duration_s,
    camp1_avg_bpm: campAvgForFight(f, 1),
    camp2_avg_bpm: campAvgForFight(f, 2),
  }));

  return {
    clash_count:              fights.length,
    camp1_avg_bpm_in_clashes: campAvgOverall(1),
    camp2_avg_bpm_in_clashes: campAvgOverall(2),
    clashes,
  };
}

// ── TICK FIGHT ────────────────────────────────────────────────────────────────
function tickFight(camps, game_time_s, game_time_fmt) {
  const now = {};
  for (const camp of camps) {
    if (camp.campid !== 1 && camp.campid !== 2) continue;
    for (let s = 1; s <= 5; s++) {
      const seat = camp[`seat_${s}`];
      if (!seat) continue;
      const key = `${camp.campid}-${s}`;
      const heroArr = Array.isArray(seat.hero_name) ? seat.hero_name : null;
      now[key] = {
        campid:  camp.campid,
        seat:    s,
        name:    seat.name || null,
        hero:    heroArr ? (heroArr[0] || null) : (seat.hero_name || null),
        hero_id: seat.hero_id ?? seat.heroid ?? (heroArr ? (heroArr[1] || null) : null) ?? null,
        stats:   extractSeatStats(seat),
      };
    }
  }

  let anyActivity = false;
  for (const [key, p] of Object.entries(now)) {
    const prev = state.lastPlayerSnap[key];
    if (prev && p.stats.dmg_out > prev.stats.dmg_out) { anyActivity = true; break; }
  }

  if (anyActivity) {
    if (!state.activeFight) {
      state.activeFight = {
        id:             ++state.fightIdSeq,
        start_time_s:   game_time_s,
        start_time_fmt: game_time_fmt,
        last_active_s:  game_time_s,
        baseline:       JSON.parse(JSON.stringify(state.lastPlayerSnap)),
        bpm_ticks:      {},
      };
      console.log(`[FIGHT] Started — id=${state.activeFight.id} at ${game_time_fmt}`);
    } else {
      state.activeFight.last_active_s = game_time_s;
    }
  }

  if (state.activeFight) {
    for (const [campKey, entries] of Object.entries(state.activeCampMap)) {
      const campid = campKey === 'camp1' ? 1 : 2;
      entries.forEach(({ pid }, i) => {
        const seat = i + 1;
        const r    = state.readings[pid];
        if (r && r.status === 'ok' && r.bpm !== null) {
          const key = `${campid}-${seat}`;
          if (!state.activeFight.bpm_ticks[key]) state.activeFight.bpm_ticks[key] = [];
          state.activeFight.bpm_ticks[key].push(r.bpm);
        }
      });
    }
  }

  if (state.activeFight && (game_time_s - state.activeFight.last_active_s) >= FIGHT_GAP_S) {
    closeFight(state.activeFight, now);
    state.activeFight = null;
  }

  state.lastPlayerSnap = now;
}

// ── CLOSE FIGHT ───────────────────────────────────────────────────────────────
function closeFight(fight, finalSnap) {
  const end_time_s   = fight.last_active_s;
  const em           = String(Math.floor(end_time_s / 60)).padStart(2, "0");
  const es           = String(end_time_s % 60).padStart(2, "0");
  const end_time_fmt = `${em}:${es}`;
  const duration_s   = Math.max(1, end_time_s - fight.start_time_s);

  if (duration_s < 5) {
    console.log(`[FIGHT] Discarded — id=${fight.id} dur=${duration_s}s (skirmish)`);
    return;
  }

  const playerList = [];
  for (const [key, p] of Object.entries(finalSnap)) {
    const base = fight.baseline[key];
    if (!base) continue;
    const b = base.stats;
    const mk_f = p.stats.multi_kills || {};
    const mk_b = b.multi_kills || {};
    playerList.push({
      camp:        p.campid,
      seat:        p.seat,
      name:        p.name,
      hero:        p.hero,
      hero_id:     p.hero_id ?? null,
      dmg_dealt:   Math.max(0, p.stats.dmg_out    - (b.dmg_out    || 0)),
      dmg_rcvd:    Math.max(0, p.stats.dmg_in     - (b.dmg_in     || 0)),
      gold_earned: Math.max(0, p.stats.gold       - (b.gold       || 0)),
      kills:       Math.max(0, p.stats.kills      - (b.kills      || 0)),
      deaths:      Math.max(0, p.stats.deaths     - (b.deaths     || 0)),
      assists:     Math.max(0, p.stats.assists    - (b.assists    || 0)),
      skills_used: Math.max(0, p.stats.skills     - (b.skills     || 0)),
      heal_self:   Math.max(0, p.stats.heal_self  - (b.heal_self  || 0)),
      heal_other:  Math.max(0, p.stats.heal_other - (b.heal_other || 0)),
      control_ms:  Math.max(0, p.stats.control_ms - (b.control_ms || 0)),
      multi_kills: {
        double: Math.max(0, (mk_f.double || 0) - (mk_b.double || 0)),
        triple: Math.max(0, (mk_f.triple || 0) - (mk_b.triple || 0)),
        quadra: Math.max(0, (mk_f.quadra || 0) - (mk_b.quadra || 0)),
        penta:  Math.max(0, (mk_f.penta  || 0) - (mk_b.penta  || 0)),
      },
      skills_detail: computeSkillsDelta(p.stats.hit_rate, b.hit_rate),
    });
  }
  playerList.sort((a, b) => a.camp - b.camp || a.seat - b.seat);

  const avgArr = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  for (const p of playerList) {
    const ticks     = (fight.bpm_ticks || {})[ `${p.camp}-${p.seat}` ] || [];
    p.avg_bpm      = avgArr(ticks);
    p.peak_bpm     = ticks.length ? Math.max(...ticks) : null;
    p.bpm_samples  = ticks.length;
  }

  const c1p     = playerList.filter(p => p.camp === 1);
  const c2p     = playerList.filter(p => p.camp === 2);
  const sum     = (arr, f) => arr.reduce((t, p) => t + p[f], 0);
  const c1_kills  = sum(c1p, 'kills'),     c2_kills   = sum(c2p, 'kills');
  const c1_deaths = sum(c1p, 'deaths'),    c2_deaths  = sum(c2p, 'deaths');
  const c1_dmg    = sum(c1p, 'dmg_dealt'), c2_dmg     = sum(c2p, 'dmg_dealt');
  const c1_rcvd   = sum(c1p, 'dmg_rcvd'), c2_rcvd    = sum(c2p, 'dmg_rcvd');
  const c1_cc_s   = Math.round(sum(c1p, 'control_ms') / 1000);
  const c2_cc_s   = Math.round(sum(c2p, 'control_ms') / 1000);
  const total_kills = c1_kills + c2_kills;

  for (const p of playerList) {
    const teamDmg   = p.camp === 1 ? c1_dmg   : c2_dmg;
    const teamKills = p.camp === 1 ? c1_kills  : c2_kills;
    p.dmg_share          = teamDmg   > 0 ? Math.round((p.dmg_dealt / teamDmg)   * 100) : 0;
    p.kill_participation = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
    p.dps                = Math.round(p.dmg_dealt / duration_s);
    p.control_s          = +(p.control_ms / 1000).toFixed(1);
    p.survived           = p.deaths === 0;
  }

  const winning_camp = c1_kills  > c2_kills  ? 1 : c2_kills  > c1_kills  ? 2 : null;
  const mvp          = playerList.reduce((a, p) => (!a || p.dmg_dealt  > a.dmg_dealt)  ? p : a, null);
  const top_absorber = playerList.reduce((a, p) => (!a || p.dmg_rcvd   > a.dmg_rcvd)   ? p : a, null);
  const most_kills   = playerList.reduce((a, p) => (!a || p.kills      > a.kills)      ? p : a, null);
  const top_healer   = playerList.reduce((a, p) => (!a || (p.heal_self + p.heal_other) > (a.heal_self + a.heal_other)) ? p : a, null);

  const recap = {
    id:             fight.id,
    start_time_s:   fight.start_time_s,
    start_time_fmt: fight.start_time_fmt,
    end_time_s,
    end_time_fmt,
    duration_s,
    summary: {
      total_kills,
      camp1_kills:     c1_kills,
      camp2_kills:     c2_kills,
      camp1_deaths:    c1_deaths,
      camp2_deaths:    c2_deaths,
      camp1_dmg:       c1_dmg,
      camp2_dmg:       c2_dmg,
      camp1_dmg_rcvd:  c1_rcvd,
      camp2_dmg_rcvd:  c2_rcvd,
      camp1_cc_s:      c1_cc_s,
      camp2_cc_s:      c2_cc_s,
      dominant_camp:   c1_dmg   > c2_dmg   ? 1 : c2_dmg   > c1_dmg   ? 2 : null,
      winning_camp,
      damage_ratio:    c2_dmg   > 0        ? +(c1_dmg / c2_dmg).toFixed(2) : null,
      mvp: mvp && mvp.dmg_dealt > 0
        ? { name: mvp.name, hero: mvp.hero, camp: mvp.camp, dmg_dealt: mvp.dmg_dealt, dps: mvp.dps }
        : null,
      top_damage_absorber: top_absorber && top_absorber.dmg_rcvd > 0
        ? { name: top_absorber.name, hero: top_absorber.hero, camp: top_absorber.camp, dmg_rcvd: top_absorber.dmg_rcvd }
        : null,
      top_killer: most_kills && most_kills.kills > 0
        ? { name: most_kills.name, hero: most_kills.hero, camp: most_kills.camp, kills: most_kills.kills }
        : null,
      top_healer: top_healer && (top_healer.heal_self + top_healer.heal_other) > 0
        ? { name: top_healer.name, hero: top_healer.hero, camp: top_healer.camp, heal_self: top_healer.heal_self, heal_other: top_healer.heal_other }
        : null,
    },
    players: playerList,
  };

  state.fightLog.push(recap);
  if (state.fightLog.length > MAX_FIGHTS) state.fightLog.splice(0, state.fightLog.length - MAX_FIGHTS);
  saveFightsToDisk();
  console.log(`[FIGHT] Closed — id=${fight.id} dur=${duration_s}s kills=${total_kills} winner=${winning_camp ? 'camp' + winning_camp : 'draw'}`);
}

// ── FIGHT PERSISTENCE ─────────────────────────────────────────────────────────
function saveFightsToDisk() {
  try {
    fs.writeFileSync(FIGHTS_FILE, JSON.stringify({ battleid: state.currentBattleId, fights: state.fightLog }));
  } catch (e) {
    console.warn("[FIGHTS] Could not save to disk:", e.message);
  }
}

// ── POSITION PERSISTENCE ──────────────────────────────────────────────────────
function savePositionsToDisk() {
  try {
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify({ battleid: state.currentBattleId, positions: state.positionLog }));
  } catch (e) {
    console.warn("[POSITIONS] Could not save to disk:", e.message);
  }
}

// ── EVENT PERSISTENCE ──────────────────────────────────────────────────────────
function saveEventsToDisk() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify({ battleid: state.currentBattleId, events: state.gameEvents }));
  } catch (e) {
    console.warn("[EVENTS] Could not save to disk:", e.message);
  }
}

// ── RESET FOR NEW GAME ────────────────────────────────────────────────────────
function resetForNewGame(battleid) {
  state.stats            = state.freshPlayerStats();
  state.prevKillLord     = 0;
  state.prevKillTurtle   = 0;
  state.clashSnapshots   = [];
  state.prevTotalKills   = 0;
  state.gameEvents       = [];
  state.activeFight      = null;
  state.fightLog         = [];
  saveFightsToDisk();
  state.lastPlayerSnap   = {};
  state.prevSeatKDA      = {};
  state.itemLog          = {};
  state.prevItemCounts   = {};
  state.prevC1Lord       = 0; state.prevC2Lord   = 0;
  state.prevC1Turtle     = 0; state.prevC2Turtle = 0;
  state.prevC1Tower      = 0; state.prevC2Tower  = 0;
  state.currentBattleId  = battleid;
  state.gameStartTime    = new Date().toISOString();
  console.log(`[GAME] New game detected — battleid=${battleid}`);
}

// ── HIGHLIGHTS BUILDER ────────────────────────────────────────────────────────
function buildHighlights(nameSource) {
  let candidates = [];
  for (const [campKey, entries] of Object.entries(state.activeCampMap)) {
    entries.forEach(({ pid, watch }, i) => {
      const d = deriveStats(pid);
      candidates.push({
        camp:                  campKey,
        player:                `player${i + 1}`,
        player_name:           nameSource[watch] || null,
        slot:                  `slot${watch}`,
        name:                  `watch${watch}`,
        role:                  ROLE_DISPLAY[players[pid].role] || players[pid].role,
        avg_bpm:                  d.avg_bpm,
        peak_bpm:                 d.peak_bpm,
        pct_above_120:            d.pct_above_120,
        avg_bpm_at_objectives:    d.avg_bpm_at_objectives,
        peak_bpm_at_objectives:   d.peak_bpm_at_objectives,
        avg_clash_bpm:            d.avg_clash_bpm,
      });
    });
  }

  const withAvg   = candidates.filter(c => c.avg_bpm !== null);
  const withPeak  = candidates.filter(c => c.peak_bpm !== null);
  const withObj   = candidates.filter(c => c.avg_bpm_at_objectives !== null);
  const withPeakObj = candidates.filter(c => c.peak_bpm_at_objectives !== null);
  const withClash = candidates.filter(c => c.avg_clash_bpm !== null);

  const pick = (arr, fn) => arr.length ? arr.reduce(fn) : null;

  const lowest_avg_bpm              = pick(withAvg,     (a, b) => a.avg_bpm < b.avg_bpm ? a : b);
  const highest_avg_bpm             = pick(withAvg,     (a, b) => a.avg_bpm > b.avg_bpm ? a : b);
  const highest_peak_bpm            = pick(withPeak,    (a, b) => a.peak_bpm > b.peak_bpm ? a : b);
  const lowest_avg_at_objectives    = pick(withObj,     (a, b) => a.avg_bpm_at_objectives < b.avg_bpm_at_objectives ? a : b);
  const highest_peak_at_objectives  = pick(withPeakObj, (a, b) => a.peak_bpm_at_objectives > b.peak_bpm_at_objectives ? a : b);
  const lowest_avg_clash_bpm        = pick(withClash,   (a, b) => a.avg_clash_bpm < b.avg_clash_bpm ? a : b);
  const highest_avg_clash_bpm       = pick(withClash,   (a, b) => a.avg_clash_bpm > b.avg_clash_bpm ? a : b);

  return {
    lowest_avg_bpm, highest_avg_bpm, highest_peak_bpm,
    lowest_avg_at_objectives, highest_peak_at_objectives,
    lowest_avg_clash_bpm, highest_avg_clash_bpm,
  };
}

// ── RTF → JSON PARSER ─────────────────────────────────────────────────────────
function parseRtfToJson(rtfPath) {
  let s = fs.readFileSync(rtfPath, 'utf8');
  s = s.replace(/\\uc0\s*/g, '');
  s = s.replace(/\\u(-?\d+)\s?/g, (_, n) => {
    const cp = parseInt(n);
    return String.fromCodePoint(cp < 0 ? cp + 65536 : cp);
  });
  s = s.replace(/\\\{/g, '\x01');
  s = s.replace(/\\\}/g, '\x02');
  let prev;
  do { prev = s; s = s.replace(/\{[^{}]*\}/g, ''); } while (s !== prev);
  s = s.replace(/\\[a-zA-Z]+\*?(-?\d+)?\s?/g, '');
  s = s.replace(/\\\n/g, '').replace(/\\/g, '');
  s = s.replace(/\x01/g, '{').replace(/\x02/g, '}');
  s = s.trim();
  return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
}

// ── POSTGAME BUILDERS ─────────────────────────────────────────────────────────
function buildPostgamePayload(data) {
  const campResult = {};
  for (const [campKey, entries] of Object.entries(state.activeCampMap)) {
    const gameCampId = campKey === 'camp1' ? 1 : 2;
    campResult[campKey] = entries.map(({ pid, watch }, i) => {
      const d = deriveStats(pid);
      const heroId = state.lastPlayerSnap[`${gameCampId}-${i + 1}`]?.hero_id ?? null;
      return {
        [`player${i + 1}`]: {
          slot:                    `slot${watch}`,
          name:                    `watch${watch}`,
          player_name:             state.postgamePlayerNames[watch] || state.playerNames[watch] || null,
          role:                    ROLE_DISPLAY[players[pid].role] || players[pid].role,
          hero_id:                 heroId,
          avg_bpm:                 d.avg_bpm,
          peak_bpm:                d.peak_bpm,
          pct_above_120:           d.pct_above_120,
          avg_bpm_at_objectives:   d.avg_bpm_at_objectives,
          peak_bpm_at_objectives:  d.peak_bpm_at_objectives,
          avg_clash_bpm:           d.avg_clash_bpm,
          bpm_on_end:              state.bpmOnEnd[pid] || null,
          item_timeline:           state.itemLog[pid] || [],
        },
      };
    });
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  return {
    battleid:        state.currentBattleId,
    date:            dateStr,
    game_start_time: state.gameStartTime,
    game_end_time:   now.toISOString(),
    game_duration:   state.gameState.game_time_fmt || null,
    camp1_tricode:   state.campTricodes.camp1,
    camp2_tricode:   state.campTricodes.camp2,
    camp1: {
      tricode: state.campTricodes.camp1,
      players: campResult.camp1,
    },
    camp2: {
      tricode: state.campTricodes.camp2,
      players: campResult.camp2,
    },
    highlights:      buildHighlights(state.postgamePlayerNames),
    clashes:         buildClashSummary(),
  };
}

function buildHomeAwayPayload(payload) {
  const ms = matchState.get();

  // Same convention as the live overlays (overlay-scoreboard.js, Draft.html):
  // camp1 (the live game's blue/campid1 side) is home unless the match board's
  // Swap Sides toggle is on.
  const homeIscamp1 = !ms.swapped;
  const homeCamp = homeIscamp1 ? payload.camp1 : payload.camp2;
  const awayCamp = homeIscamp1 ? payload.camp2 : payload.camp1;

  const buildTeam = (teamInfo, campObj) => {
    const lineup = (teamInfo && teamInfo.lineup) || [];
    const campPlayers = (campObj && campObj.players) || [];

    const playerList = lineup.map((entry, i) => {
      const statsObj = campPlayers[i] ? Object.values(campPlayers[i])[0] : null;
      return {
        [`player${i + 1}`]: {
          player_name:             entry.ign || null,
          role:                    entry.role || null,
          avg_bpm:                 statsObj ? statsObj.avg_bpm               : null,
          peak_bpm:                statsObj ? statsObj.peak_bpm              : null,
          pct_above_120:           statsObj ? statsObj.pct_above_120         : null,
          avg_bpm_at_objectives:   statsObj ? statsObj.avg_bpm_at_objectives : null,
          peak_bpm_at_objectives:  statsObj ? statsObj.peak_bpm_at_objectives: null,
          avg_clash_bpm:           statsObj ? statsObj.avg_clash_bpm         : null,
          bpm_on_end:              statsObj ? statsObj.bpm_on_end            : null,
        }
      };
    });

    return {
      tricode:   (teamInfo && teamInfo.short || "").toUpperCase().trim(),
      camp_code: (teamInfo && teamInfo.teamId) || null,
      camp_name: (teamInfo && teamInfo.name) || null,
      players:   playerList,
    };
  };

  return {
    battleid:        payload.battleid,
    date:            payload.date,
    game_start_time: payload.game_start_time,
    game_end_time:   payload.game_end_time,
    game_duration:   payload.game_duration,
    home: buildTeam(ms.home, homeCamp),
    away: buildTeam(ms.away, awayCamp),
    highlights:      payload.highlights,
    clashes:         payload.clashes,
  };
}

function writePostgame(payload) {
  const liveJson = JSON.stringify(payload, null, 2);

  fs.writeFileSync(path.join(__dirname, "..", "postgame.json"), liveJson);
  console.log(`[POSTGAME] postgame.json updated`);

  if (!matchState.get().official) {
    console.log(`[POSTGAME] Archive skipped — Official Match not checked`);
    return;
  }

  const archivePayload = buildHomeAwayPayload(payload);
  const archiveJson = JSON.stringify(archivePayload, null, 2);
  const date = payload.date || "unknown";
  const base = `postgame_${state.currentBattleId}_${date}`;

  let filename = `${base}.json`;
  let counter  = 2;
  while (fs.existsSync(path.join(POSTGAME_DIR, filename))) {
    filename = `${base}_${counter}.json`;
    counter++;
  }

  fs.writeFileSync(path.join(POSTGAME_DIR, filename), archiveJson);
  console.log(`[POSTGAME] Archive written — ${filename}`);
}

// ── RESTORE FROM DISK ON MODULE LOAD ─────────────────────────────────────────
if (fs.existsSync(FIGHTS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(FIGHTS_FILE, "utf8"));
    if (saved.battleid && Array.isArray(saved.fights) && saved.fights.length > 0) {
      state.fightLog        = saved.fights;
      state.fightIdSeq      = Math.max(...saved.fights.map(f => f.id), 0);
      state.currentBattleId = saved.battleid;
      console.log(`[FIGHTS] Restored ${state.fightLog.length} fights from disk (battleid=${state.currentBattleId})`);
    }
  } catch (e) {
    console.warn("[FIGHTS] Could not restore from disk:", e.message);
  }
}

if (fs.existsSync(POSITIONS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf8"));
    if (saved.battleid && Array.isArray(saved.positions) && saved.positions.length > 0) {
      state.positionLog     = saved.positions;
      state.currentBattleId = saved.battleid;
      console.log(`[POSITIONS] Restored ${state.positionLog.length} positions from disk (battleid=${state.currentBattleId})`);
    }
  } catch (e) {
    console.warn("[POSITIONS] Could not restore from disk:", e.message);
  }
}

if (fs.existsSync(EVENTS_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    // Only restore if it matches the battleid we just restored from
    // POSITIONS_FILE (or there was no position history to set one) —
    // otherwise a leftover events file from an older game could get
    // paired with a newer game's positions.
    if (saved.battleid && Array.isArray(saved.events) && saved.events.length > 0 &&
        (!state.currentBattleId || saved.battleid === state.currentBattleId)) {
      state.gameEvents = saved.events;
      console.log(`[EVENTS] Restored ${state.gameEvents.length} events from disk (battleid=${saved.battleid})`);
    }
  } catch (e) {
    console.warn("[EVENTS] Could not restore from disk:", e.message);
  }
}

module.exports = {
  applySwap,
  deriveStats,
  tickStats,
  snapshotObjective,
  snapshotClash,
  buildClashSummary,
  buildHighlights,
  extractSeatStats,
  computeSkillsDelta,
  tickFight,
  closeFight,
  resetForNewGame,
  saveFightsToDisk,
  savePositionsToDisk,
  saveEventsToDisk,
  buildPostgamePayload,
  buildHomeAwayPayload,
  writePostgame,
  parseRtfToJson,
};
