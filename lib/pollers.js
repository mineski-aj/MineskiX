// lib/pollers.js — httpGet, pollGameAPI, swap-from-match-dashboard
const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const {
  GAME_API, POLL_MS,
  POSITIONS_FILE, MAX_EVENTS, MAX_POS_LOG,
} = require('./config');

// Same file the dashboard's Settings → "Game API" field reads/writes via
// /api/game-url — read fresh on every poll so an Apply in the dashboard
// takes effect on the very next tick, no restart needed. Falls back to
// config.json's game_api (the original hardcoded GAME_API) if the file is
// missing or empty, so a fresh install with no saved setting still works.
const GAME_URL_FILE = path.join(__dirname, '..', 'game_api_url.json');
const { readUrlForMode } = require('./apiMode');
function getGameApiUrl() {
  const url = readUrlForMode(GAME_URL_FILE, '').trim();
  return url || GAME_API;
}
const state      = require('./state');
const matchState = require('./matchState');
const { players } = require('./config');
const {
  applySwap,
  resetForNewGame,
  tickStats,
  tickFight,
  snapshotObjective,
  snapshotClash,
  saveFightsToDisk,
  savePositionsToDisk,
  saveEventsToDisk,
  buildPostgamePayload,
  writePostgame,
} = require('./game');
const { buildLeagueStats } = require('./feeds');
const { countItems, ITEM_NAMES, TIER3_ITEMS } = require('./items');
const { pollHrmReadings } = require('./hrmPoller');
const standingsState = require('./standingsState');

// ── HTTP GET (follows one redirect) ──────────────────────────────────────────
// A request that connects fine but then just stops sending data (upstream
// stalls mid-response) never fires 'error' on its own — only a timeout
// catches that. req.setTimeout() alone doesn't abort anything, it just
// emits 'timeout'; destroy() is what actually frees the socket.
//
// onError MUST be attached here, inside this function, on every request
// object created at every hop of the redirect chain — NOT by the caller
// chaining .on('error', ...) onto this function's return value. A prior
// version did exactly that and it crashed the whole process: following a
// redirect calls httpGet() again, creating a SECOND request object for
// the new URL, but the caller only ever holds a reference to the FIRST
// one (this function's return value). When the redirected request later
// timed out, its destroy()'d error had no listener at all — Node's
// default behavior for an unlistened 'error' event is to throw it,
// taking the whole server down. Threading onError through the recursion
// (instead of returning-then-chaining) guarantees whichever request
// object is actually live at the moment of an error has a listener on
// it, redirect or not.
const HTTP_GET_TIMEOUT_MS = 8000;
function httpGet(url, cb, onError) {
  const mod = url.startsWith("https://") ? https : http;
  const req = mod.get(url, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) && res.headers.location) {
      console.log(`[HTTP] Redirect ${res.statusCode} → ${res.headers.location}`);
      res.resume();
      httpGet(res.headers.location, cb, onError);
      return;
    }
    cb(res);
  });
  req.setTimeout(HTTP_GET_TIMEOUT_MS, () => {
    req.destroy(new Error(`Request timed out after ${HTTP_GET_TIMEOUT_MS}ms`));
  });
  if (onError) req.on("error", onError);
  return req;
}

// ── SWAP FROM MATCH DASHBOARD ─────────────────────────────────────────────────
// Camp swap is now driven by the match-dashboard's swapped flag instead of
// the external main API.
function applyDashboardSwap() {
  const swapped = !!matchState.get().swapped;
  applySwap(swapped);
}

// ── POST-INFO POLL ────────────────────────────────────────────────────────────
// A separate feed from the main Game API — the live sub-info feed has no
// orange/purple jungle-buff counts, but this one does (camp_list[].
// enemy_area_get). Polled independently and cached the same way
// state.lastGameData is, so /api/postinfo-proxy can serve it from memory
// instead of every browser tab triggering its own round-trip.
const POST_INFO_URL_FILE    = path.join(__dirname, '..', 'post_info_api_url.json');
const POST_INFO_API_DEFAULT = 'http://10.88.120.60:5001/api/post-info/';
function getPostInfoUrl() {
  const url = readUrlForMode(POST_INFO_URL_FILE, '').trim();
  return url || POST_INFO_API_DEFAULT;
}

function pollPostInfo() {
  if (pollPostInfo._inFlight) return;
  pollPostInfo._inFlight = true;
  httpGet(getPostInfoUrl(), (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try {
        if (res.statusCode === 200) state.lastPostInfoData = JSON.parse(body);
      } catch (e) {
        console.warn("[POSTINFO] Parse error:", e.message);
      } finally {
        pollPostInfo._inFlight = false;
      }
    });
  }, (e) => {
    console.warn("[POSTINFO] Unreachable:", e.message);
    pollPostInfo._inFlight = false;
  });
}
pollPostInfo._inFlight = false;

// tracks which battleid has had its first item snapshot — prevents cold-start spam
let _itemsInitBattleId = null;

// ── Kill event definitions (ascending priority = playback order) ──────────────
const KILL_MULTI_DEFS = [
  { key: 'first_blood',   video: 'firstblood.webm',  priority: 1 },
  { key: 'double_kill',   video: 'doublekill.webm',  priority: 2 },
  { key: 'triple_kill',   video: 'triplekill.webm',  priority: 3 },
  { key: 'quadra_kill',   video: 'maniac.webm',      priority: 4 },
  { key: 'penta_kill',    video: 'savage.webm',      priority: 5 },
];
const KILL_OBJ_DEFS = [
  { key: 'kill_lord',     video: 'lordslain.webm',   priority: 1 },
  { key: 'kill_tortoise', video: 'turtleslain.webm', priority: 1 },
];
const ALL_KILL_DEFS = [...KILL_MULTI_DEFS, ...KILL_OBJ_DEFS];

// ── Draft role assignment ─────────────────────────────────────────────────────
const ALL_DRAFT_ROLES = ['exp_laner', 'jungler', 'mid_laner', 'roamer', 'gold_laner'];

function assignDraftRoles(camp1, camp2) {
  const result = {};
  for (const camp of [camp1, camp2]) {
    if (!camp) continue;
    const seats = [];
    for (let s = 1; s <= 5; s++) {
      const seat = camp[`seat_${s}`];
      if (seat && !seat.judger && seat.roleid) seats.push(seat);
    }
    if (!seats.length) continue;

    const claimed = {};
    for (const seat of seats) {
      if (seat.role && ALL_DRAFT_ROLES.includes(seat.role)) {
        claimed[seat.role] = true;
        result[seat.roleid] = seat.role;
      }
    }

    const remaining = ALL_DRAFT_ROLES.filter(r => !claimed[r]);
    const allMissing = seats.every(s => !s.role || !ALL_DRAFT_ROLES.includes(s.role));

    if (allMissing) {
      seats.forEach((seat, idx) => { result[seat.roleid] = ALL_DRAFT_ROLES[idx]; });
    } else {
      for (let j = remaining.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [remaining[j], remaining[k]] = [remaining[k], remaining[j]];
      }
      let ri = 0;
      for (const seat of seats) {
        if (result[seat.roleid]) continue;
        result[seat.roleid] = remaining[ri++];
      }
    }
  }
  state.draftRoles = { battleid: state.currentBattleId, roles: result };
  console.log(`[DRAFT] Roles locked for battleid ${state.currentBattleId}:`,
    Object.entries(result).map(([id, r]) => `${id}=${r}`).join(', '));
}

// Per-video debounce: objective events (turtle/lord) can't fire more than once per 15s
// Multi-kill events use a shorter 3s window (a player can legitimately chain kills quickly)
const KILL_EVENT_DEBOUNCE_MS = { lord: 15000, turtle: 15000 };
const KILL_EVENT_DEBOUNCE_DEFAULT = 3000;
const killEventLastFired = {};

function broadcastKillEvent(video, priority, playerIdx, playerName, role, camp) {
  const now = Date.now();
  const debounceKey = video.replace('.webm', '');
  const debounceMs = KILL_EVENT_DEBOUNCE_MS[debounceKey] ?? KILL_EVENT_DEBOUNCE_DEFAULT;
  const lastFired = killEventLastFired[video] || 0;
  if (now - lastFired < debounceMs) {
    console.log(`[KILLEVENT] Debounced ${video} — fired ${now - lastFired}ms ago (min ${debounceMs}ms)`);
    return;
  }
  killEventLastFired[video] = now;
  const payload = JSON.stringify({ video, priority, playerIdx, playerName: playerName || null, role: role || null, camp: camp || null });
  state.overlayClients.forEach(c => { try { c.write(`event: killevent\ndata: ${payload}\n\n`); } catch {} });
}

// ── GAME API POLLER ───────────────────────────────────────────────────────────
// This runs on a raw setInterval (see bottom of file) that doesn't know or
// care whether the previous tick finished — without this guard, a single
// slow/stalled response (now bounded by httpGet's own timeout above, but
// even a normal slow response counts) would let ticks pile up on top of
// each other for as long as it stays slow. _inFlight makes each tick a
// no-op until the previous one has fully resolved (success, HTTP error, or
// timeout), instead of ever running two at once.
function pollGameAPI() {
  if (pollGameAPI._inFlight) {
    console.warn("[POLL] Skipping tick — previous poll still in flight");
    return;
  }
  pollGameAPI._inFlight = true;

  const gameApiUrl = getGameApiUrl();
  httpGet(gameApiUrl, (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try { // outer try/finally just resets _inFlight regardless of which
            // of this handler's several return points gets hit
      if (res.statusCode !== 200) {
        console.warn(`[POLL] HTTP ${res.statusCode} from ${gameApiUrl} — body: ${body.slice(0, 200)}`);
        return;
      }
      try {
        const json = JSON.parse(body);
        const data = json.data;
        if (!data) { console.warn("[POLL] No data field in response"); return; }

        // Cache the raw payload so /api/gamedata-proxy can serve it from
        // memory instead of every browser tab triggering its own live
        // round-trip to the upstream game API (was the main cause of
        // sluggish postgame board reveals — see mplfs.html's postgame
        // boards, which all hit that proxy).
        state.lastGameData = json;

        const apiState      = data.state;
        const battleid      = String(data.battleid || json.dataid || "");
        const game_time_s   = data.game_time || 0;
        const _mm = String(Math.floor(game_time_s / 60)).padStart(2, "0");
        const _ss = String(game_time_s % 60).padStart(2, "0");
        const game_time_fmt = `${_mm}:${_ss}`;
        const paused        = data.paused || data.banpick_paused || false;

        console.log(`[POLL] state=${apiState} battleid=${battleid} time=${game_time_fmt} paused=${paused}`);

        if (apiState && apiState !== pollGameAPI._lastLoggedState) {
          console.log(`[STATE CHANGE] → "${apiState}"`);
          pollGameAPI._lastLoggedState = apiState;
        }

        const prevState    = state.gameState.state;
        const prevBattleId = state.currentBattleId;

        if (battleid && battleid !== state.currentBattleId) {
          resetForNewGame(battleid);
          state.prevKillEventCounts = {};
          state.draftRoles = { battleid: null, roles: {} };
          for (const k in killEventLastFired) delete killEventLastFired[k];
        }

        if (prevState === "end" && apiState !== "end" && battleid !== prevBattleId) {
          state.positionLog    = [];
          state.posWriteCounter = 0;
          try { if (fs.existsSync(POSITIONS_FILE)) fs.unlinkSync(POSITIONS_FILE); } catch {}
          console.log("[POSITIONS] Flushed — new game started after end state");
        }

        const camps = data.camp_list || [];
        const campNames = {};
        const freshNames = {};
        const watchesNormal   = [1, 2, 3, 4, 5];
        const watchesReversed = [10, 9, 8, 7, 6];
        for (const camp of camps) {
          if (camp.campid === 1) {
            campNames.camp1 = camp.team_simple_name || "";
            if (!state.campTricodes.camp1 && camp.team_simple_name) state.campTricodes.camp1 = camp.team_simple_name.toUpperCase().trim();
            const watchNums = state.campSwapped ? watchesReversed : watchesNormal;
            for (let s = 1; s <= 5; s++) {
              const p = camp[`seat_${s}`];
              if (p && p.name) freshNames[watchNums[s - 1]] = p.name;
            }
          }
          if (camp.campid === 2) {
            campNames.camp2 = camp.team_simple_name || "";
            if (!state.campTricodes.camp2 && camp.team_simple_name) state.campTricodes.camp2 = camp.team_simple_name.toUpperCase().trim();
            const watchNums = state.campSwapped ? watchesNormal : watchesReversed;
            for (let s = 1; s <= 5; s++) {
              const p = camp[`seat_${s}`];
              if (p && p.name) freshNames[watchNums[s - 1]] = p.name;
            }
          }
        }
        if (Object.keys(freshNames).length > 0) state.playerNames = freshNames;
        state.gameState = { state: apiState, battleid, game_time_s, game_time_fmt, paused, campNames };

        // Lock draft roles once per battleid (runs in any apiState)
        if (state.draftRoles.battleid !== state.currentBattleId) {
          const _c1 = camps.find(c => c.campid === 1);
          const _c2 = camps.find(c => c.campid === 2);
          if (_c1 || _c2) assignDraftRoles(_c1, _c2);
        }

        if (apiState === "play") state.hasSeenPlay = true;
        if (apiState === "play" && !paused) {
          tickStats();

          const c1data    = camps.find(c => c.campid === 1) || {};
          const c2data    = camps.find(c => c.campid === 2) || {};
          const c1LordNow = c1data.kill_lord     || 0;
          const c2LordNow = c2data.kill_lord     || 0;
          const c1TurtNow = c1data.kill_tortoise || 0;
          const c2TurtNow = c2data.kill_tortoise || 0;
          const c1TowerNow = c1data.kill_tower || 0;
          const c2TowerNow = c2data.kill_tower || 0;
          const totalLord   = c1LordNow + c2LordNow;
          const totalTurtle = c1TurtNow + c2TurtNow;

          if (c1LordNow > state.prevC1Lord) {
            console.log(`[EVENT] LORD kill by camp1 at ${game_time_fmt}`);
            snapshotObjective("LORD", game_time_fmt);
            for (let i = 0; i < c1LordNow - state.prevC1Lord; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'lord', camp: 'camp1' });
            state.prevC1Lord = c1LordNow;
          }
          if (c2LordNow > state.prevC2Lord) {
            console.log(`[EVENT] LORD kill by camp2 at ${game_time_fmt}`);
            snapshotObjective("LORD", game_time_fmt);
            for (let i = 0; i < c2LordNow - state.prevC2Lord; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'lord', camp: 'camp2' });
            state.prevC2Lord = c2LordNow;
          }
          if (c1TurtNow > state.prevC1Turtle) {
            console.log(`[EVENT] TURTLE kill by camp1 at ${game_time_fmt}`);
            snapshotObjective("TURTLE", game_time_fmt);
            for (let i = 0; i < c1TurtNow - state.prevC1Turtle; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'turtle', camp: 'camp1' });
            state.prevC1Turtle = c1TurtNow;
          }
          if (c2TurtNow > state.prevC2Turtle) {
            console.log(`[EVENT] TURTLE kill by camp2 at ${game_time_fmt}`);
            snapshotObjective("TURTLE", game_time_fmt);
            for (let i = 0; i < c2TurtNow - state.prevC2Turtle; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'turtle', camp: 'camp2' });
            state.prevC2Turtle = c2TurtNow;
          }
          if (c1TowerNow > state.prevC1Tower) {
            console.log(`[EVENT] TOWER kill by camp1 at ${game_time_fmt}`);
            snapshotObjective("TOWER", game_time_fmt);
            for (let i = 0; i < c1TowerNow - state.prevC1Tower; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'tower', camp: 'camp1' });
            state.prevC1Tower = c1TowerNow;
          }
          if (c2TowerNow > state.prevC2Tower) {
            console.log(`[EVENT] TOWER kill by camp2 at ${game_time_fmt}`);
            snapshotObjective("TOWER", game_time_fmt);
            for (let i = 0; i < c2TowerNow - state.prevC2Tower; i++)
              state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'tower', camp: 'camp2' });
            state.prevC2Tower = c2TowerNow;
          }
          state.prevKillLord   = totalLord;
          state.prevKillTurtle = totalTurtle;

          for (const camp of camps) {
            const campKey = camp.campid === 1 ? 'camp1' : camp.campid === 2 ? 'camp2' : null;
            if (!campKey) continue;
            const watchNums = (campKey === 'camp1')
              ? (state.campSwapped ? [10, 9, 8, 7, 6] : [1, 2, 3, 4, 5])
              : (state.campSwapped ? [1, 2, 3, 4, 5]  : [10, 9, 8, 7, 6]);
            for (let s = 1; s <= 5; s++) {
              const seat = camp[`seat_${s}`];
              if (!seat) continue;
              const watch   = watchNums[s - 1];
              const statKey = `${campKey}-${s}`;
              const prev    = state.prevSeatKDA[statKey] || { kills: 0, assists: 0, deaths: 0 };
              const curK    = seat.kill_num   ?? 0;
              const curA    = seat.assist_num ?? 0;
              const curD    = seat.dead_num   ?? 0;
              for (let i = 0; i < curK - prev.kills;   i++)
                state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'kill',   slot: `slot${watch}`, camp: campKey, seat: s });
              for (let i = 0; i < curA - prev.assists; i++)
                state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'assist', slot: `slot${watch}`, camp: campKey, seat: s });
              for (let i = 0; i < curD - prev.deaths;  i++)
                state.gameEvents.push({ time_s: game_time_s, time_fmt: game_time_fmt, type: 'death',  slot: `slot${watch}`, camp: campKey, seat: s });
              state.prevSeatKDA[statKey] = { kills: curK, assists: curA, deaths: curD };

              const pid = `player${watch}`;
              const currItems = countItems(seat.equip_list);
              if (_itemsInitBattleId !== battleid) {
                // first poll for this battleid — silent snapshot to avoid logging pre-existing items
                state.prevItemCounts[pid] = currItems;
              } else {
                const prevItems = state.prevItemCounts[pid] || {};
                for (const [idStr, cnt] of Object.entries(currItems)) {
                  const added = cnt - (prevItems[idStr] || 0);
                  for (let n = 0; n < added; n++) {
                    if (!state.itemLog[pid]) state.itemLog[pid] = [];
                    const iid = Number(idStr);
                    state.itemLog[pid].push({ game_time_s, game_time_fmt, item_id: iid, item_name: ITEM_NAMES[iid] || null, is_tier3: TIER3_ITEMS.has(iid) });
                    console.log(`[ITEMS] ${pid} bought item ${idStr} at ${game_time_fmt}`);
                  }
                }
                state.prevItemCounts[pid] = currItems;
              }
            }
          }
          if (state.gameEvents.length > MAX_EVENTS) state.gameEvents.splice(0, state.gameEvents.length - MAX_EVENTS);
          _itemsInitBattleId = battleid; // mark first play poll done for this game

          // ── Kill events detection ─────────────────────────────────────────
          const objFiredThisPoll = new Set();
          for (const camp of camps) {
            if (camp.campid !== 1 && camp.campid !== 2) continue;
            const cid = camp.campid;

            // Wipeout: all 5 players on this camp dead simultaneously
            const allDead = [1,2,3,4,5].every(s => camp[`seat_${s}`] && camp[`seat_${s}`].dead === true);
            if (allDead && !state.prevKillEventCounts[`wipeout_${cid}`]) {
              broadcastKillEvent('wipedout.webm', 3, null, null);
            }
            state.prevKillEventCounts[`wipeout_${cid}`] = allDead;

            for (let s = 1; s <= 5; s++) {
              const seat = camp[`seat_${s}`];
              if (!seat || !seat.extra_param) continue;
              const ep       = seat.extra_param;
              const seatKey  = `${cid}_${s}`;
              const pidx     = cid === 1 ? s : s + 5;
              // Seat position doubles as role: seat_1 exp, seat_2 jungle,
              // seat_3 mid, seat_4 roam, seat_5 gold — same numbering as
              // ROLE_ICONS in overlay-core.js. campid 1 = blue, 2 = red.
              const roleNum  = s;
              const campName = cid === 1 ? 'blue' : 'red';

              if (!state.prevKillEventCounts[seatKey]) {
                // First poll for this seat — snapshot only, don't fire.
                // A refresh/restart mid-game will see already-nonzero stats
                // (e.g. first_blood already 1); those shouldn't replay as a
                // fresh event, only a later increase past this baseline should.
                state.prevKillEventCounts[seatKey] = {};
                ALL_KILL_DEFS.forEach(d => { state.prevKillEventCounts[seatKey][d.key] = ep[d.key] || 0; });
                continue;
              }

              const prev = state.prevKillEventCounts[seatKey];

              // Multi-kills: broadcast each in ascending priority order
              for (const def of KILL_MULTI_DEFS) {
                if ((ep[def.key] || 0) > (prev[def.key] || 0)) {
                  broadcastKillEvent(def.video, def.priority, pidx, seat.name || null, roleNum, campName);
                }
              }

              // Objective kills: fire once per poll (first player found gets credit)
              for (const def of KILL_OBJ_DEFS) {
                if ((ep[def.key] || 0) > (prev[def.key] || 0) && !objFiredThisPoll.has(def.key)) {
                  objFiredThisPoll.add(def.key);
                  broadcastKillEvent(def.video, def.priority, pidx, seat.name || null, roleNum, campName);
                }
              }

              ALL_KILL_DEFS.forEach(d => { prev[d.key] = ep[d.key] || 0; });
            }
          }

          const totalKills = camps.reduce((a, c) => a + (c.score || 0), 0);
          const killJump   = totalKills - state.prevTotalKills;
          if (killJump >= 3) {
            console.log(`[EVENT] CLASH detected at ${game_time_fmt} (kill jump: +${killJump})`);
            snapshotClash(game_time_fmt, killJump);
          }
          state.prevTotalKills = totalKills;
        }

        if (apiState === "play") {
          for (const camp of camps) {
            if (camp.campid !== 1 && camp.campid !== 2) continue;
            for (let s = 1; s <= 5; s++) {
              const seat = camp[`seat_${s}`];
              if (!seat || !seat.map_pos) continue;
              const ep = seat.extra_param || {};
              state.positionLog.push({
                game_time_s,
                camp: camp.campid,
                seat: s,
                x:           seat.map_pos.x,
                y:           seat.map_pos.y,
                gold:        seat.gold        ?? null,
                kill_num:    seat.kill_num    ?? null,
                dead_num:    seat.dead_num    ?? null,
                assist_num:  seat.assist_num  ?? null,
                kill_lord:   ep.kill_lord     ?? null,
                kill_tortoise: ep.kill_tortoise ?? null,
              });
            }
          }
          if (state.positionLog.length > MAX_POS_LOG) state.positionLog.splice(0, state.positionLog.length - MAX_POS_LOG);
          if (++state.posWriteCounter % 60 === 0) { savePositionsToDisk(); saveEventsToDisk(); }
        }

        if (apiState === "play") tickFight(camps, game_time_s, game_time_fmt);

        if (apiState === "end" && state.gameState.state !== "end") { savePositionsToDisk(); saveEventsToDisk(); }

        if (apiState === "end" && state.hasSeenPlay && battleid && battleid !== state.lastWrittenBattleId) {
          console.log(`[POSTGAME] Writing postgame for battleid=${battleid}`);
          state.postgamePlayerNames = { ...state.playerNames };
          state.bpmOnEnd = {};
          for (const pid of Object.keys(players)) {
            const r = state.readings[pid];
            state.bpmOnEnd[pid] = r.bpm !== null ? r.bpm : r.last_bpm;
          }
          try {
            const payload = buildPostgamePayload(data);
            writePostgame(payload);
            state.lastWrittenBattleId = battleid;
          } catch (e) {
            console.error("[POSTGAME] Failed to write:", e.message);
          }
        } else if (apiState === "end" && !state.hasSeenPlay) {
          console.log(`[POSTGAME] Skipping — server started at "end", waiting for a live game first`);
        }
        // else if apiState === "end" && battleid === lastWrittenBattleId: already written, silent

      } catch (e) {
        console.error("[POLL] Parse error:", e.message);
      }
      } finally {
        pollGameAPI._inFlight = false;
      }
    });
  }, (e) => {
    console.warn("[POLL] Game API unreachable:", e.message);
    pollGameAPI._inFlight = false;
  });
}

pollGameAPI._lastLoggedState = null;
pollGameAPI._inFlight = false;

// ── STANDINGS POLL ────────────────────────────────────────────────────────────
// Replaces manual stat entry on the Standings dashboard tab: MP/W-L/rank/move
// now come straight from this feed on a timer. The API has no concept of
// "playoffs secured"/"eliminated" — that stays purely a local, operator-set
// field (see html/standings-dashboard.html), so every tick preserves it by
// matching the incoming row to the existing team via tricode instead of
// overwriting the whole team object outright.
const STANDINGS_URL_FILE    = path.join(__dirname, '..', 'standings_api_url.json');
const STANDINGS_API_DEFAULT = 'http://10.88.120.60:5001/api/standing/';
function getStandingsApiUrl() {
  const url = readUrlForMode(STANDINGS_URL_FILE, '').trim();
  return url || STANDINGS_API_DEFAULT;
}

function normalizeStandingsMove(pos) {
  const p = String(pos || '').toLowerCase();
  return (p === 'up' || p === 'down') ? p : 'neutral';
}

function pollStandings() {
  if (pollStandings._inFlight) return;
  pollStandings._inFlight = true;
  httpGet(getStandingsApiUrl(), (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try {
        if (res.statusCode !== 200) {
          console.warn(`[STANDINGS] HTTP ${res.statusCode} from ${getStandingsApiUrl()}`);
          return;
        }
        const data = JSON.parse(body);
        const rows = Object.keys(data)
          .map((k) => data[k])
          .sort((a, b) => (a.RANK || 0) - (b.RANK || 0));

        const prevByTri = {};
        (standingsState.get().teams || []).forEach((t) => { prevByTri[t.tri] = t; });

        const teams = rows.map((row) => {
          const tri  = (row.TRICODE || '').toUpperCase().trim();
          const prev = prevByTri[tri];
          return {
            tri,
            move:   normalizeStandingsMove(row.POSITION),
            status: prev ? (prev.status || null) : null,
            mp:     row['MATCH POINT']  || 0,
            mwl:    row['MATCH W/L']    || '0-0',
            gwl:    row['GAME W/L']     || '0-0',
            ngw:    row.NET_GAME_WIN    || 0,
          };
        });

        /* Only broadcast when something actually changed — this fires every
           5s regardless of whether the standings API returned anything new,
           and standingsState.set() unconditionally re-broadcasts the WHOLE
           team list over the shared /overlay/events stream (event
           "standings"), which mplfs.html's Standings scene turns into a
           full innerHTML rebuild of every row (see buildStandings()) —
           tearing down and re-decoding all 8 team logos from scratch on
           every tick. That's what read as "flickering logos" in vMix. Most
           ticks have no real change, so skip the broadcast entirely then. */
        if (JSON.stringify(teams) !== JSON.stringify(standingsState.get().teams || [])) {
          standingsState.set({ teams });
        }
      } catch (e) {
        console.warn("[STANDINGS] Parse error:", e.message);
      } finally {
        pollStandings._inFlight = false;
      }
    });
  }, (e) => {
    console.warn("[STANDINGS] Unreachable:", e.message);
    pollStandings._inFlight = false;
  });
}
pollStandings._inFlight = false;

// ── START POLLERS ─────────────────────────────────────────────────────────────
setInterval(pollGameAPI,       POLL_MS);
setInterval(applyDashboardSwap, 1000);
setInterval(pollHrmReadings,   1000);
setInterval(pollPostInfo,      2000);
setInterval(pollStandings,     5000);
pollGameAPI();
applyDashboardSwap();
pollHrmReadings();
pollPostInfo();
pollStandings();

module.exports = { httpGet, pollGameAPI, applyDashboardSwap, pollStandings };
