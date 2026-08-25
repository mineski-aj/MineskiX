// lib/state.js — all mutable state, initialized from config
const { players, CAMP_MAP } = require('./config');

function freshPlayerStats() {
  const s = {};
  for (const pid of Object.keys(players)) {
    s[pid] = {
      bpm_samples:           [],
      ticks_above_120:       0,
      ticks_total:           0,
      objective_bpm_samples: [],
    };
  }
  return s;
}

// Initialize readings from players
const readings = {};
for (const [pid, info] of Object.entries(players)) {
  readings[pid] = { ...info, bpm: null, last_bpm: null, status: "disconnected", last_seen: null };
}

const state = {
  readings,
  gameState: { state: "unknown", battleid: null, game_time_s: 0, game_time_fmt: "00:00", paused: false },
  campSwapped: false,
  activeCampMap: { camp1: [...CAMP_MAP.camp1], camp2: [...CAMP_MAP.camp2] },
  campTricodes: { camp1: null, camp2: null },
  playerNames: {},
  postgamePlayerNames: {},
  bpmOnEnd: {},
  stats: freshPlayerStats(),
  prevKillLord: 0, prevKillTurtle: 0,
  clashSnapshots: [], prevTotalKills: 0,
  activeFight: null, fightLog: [], fightIdSeq: 0, lastPlayerSnap: {},
  prevSeatKDA: {}, itemLog: {}, prevItemCounts: {},
  prevC1Lord: 0, prevC2Lord: 0, prevC1Turtle: 0, prevC2Turtle: 0,
  prevC1Tower: 0, prevC2Tower: 0,
  gameEvents: [], positionLog: [], posWriteCounter: 0,
  overlayClients: [], fightsPendingAction: null,
  // scheduleHighlight: 0 = no row highlighted; 1/2/3 = that Today's
  // Schedule match row is currently "grown" (see routes/overlay.js's
  // /overlay/today_schedule/show — pressing Show again while the scene
  // is already live cycles this instead of re-triggering the scene).
  mplfsScene: { matchboard: false, middleboard: false, playerboard: false, activeFeature: null, scheduleHighlight: 0 },
  // html/mpltag.html — Map Selection tag. revealedGames = how many games'
  // side+map recap blocks are on screen (0 = hidden), gated on toss
  // winner + side + map being picked (winner is NOT required). revealedWins
  // = how many of those already-revealed games have ALSO had their win
  // banner (phase 3) revealed — gated separately since the winner is
  // often decided after the block is first shown. Both reset to 0 on
  // hide. See routes/overlay.js for the two-priority /show logic.
  mapSelectTag: { revealedGames: 0, revealedWins: 0 },
  featureToggles: {
    killevents: true,
    items:      true,
    trinity:    true,
    swap:       true,
    lvl15:      true,
    conceal:    true,
    fights:     true,
    objectivespawn: true,
    debugphotos: false, // MPL Full Screen playerboard: off = live photos by name, on = random test photos
    draftstats: true, // Draft.html pick reveal: PICK / CONTENTION RATE / WIN RATE (blue side only for now)
  },
  prevKillEventCounts: {},
  // Whether each sliding "check" overlay (item/emblem/gold-diff, plus the
  // always-on scoreboard/player-ui panels) is currently shown — lets the
  // dashboard toggle reflect true state on reload instead of resetting to
  // a guess.
  checkOverlays: {
    scoreboard:      true,
    playerui:        true,
    itemcheck:       false,
    emblemcheck:     false,
    golddiffcheck:   false,
    sideexpcheck:    false,
    sidetakencheck:  false,
    sidedamagecheck: false,
    sidegoldcheck:   false,
    draftrecap:      false,
  },
  // ingame_red.html / ingame_blue.html per-player heart-rate meter:
  // true = OFF (swapped to KDA + Gold block), false = LIVE (BPM meter
  // shown). Server-side so every open page (dashboard, ingame_red,
  // ingame_blue, vMix) reflects the same on/off state — this used to
  // live only in each browser's own localStorage, which never syncs
  // across separate browsers/machines.
  hrmOff: {
    player1: false, player2: false, player3: false, player4: false, player5: false,
    player6: false, player7: false, player8: false, player9: false, player10: false,
  },
  draftRoles: { battleid: null, roles: {} },
  draftPhotoMode: 'live', // 'live' = match seat name to real photos, 'random' = test mode
  draftActive: true, // whether Draft.html (pick/ban overlay) is currently shown
  draftIndexActive: false, // whether the Draft Index overlay (DraftIndex.html) is currently shown
  currentBattleId: null, gameStartTime: null,
  lastWrittenBattleId: null, hasSeenPlay: false,
  freshPlayerStats,
};

module.exports = state;
