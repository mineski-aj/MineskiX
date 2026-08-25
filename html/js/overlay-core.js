/* ── overlay-core.js ── shared state, polling engine, utilities ── */

const DEFAULT_URL = 'https://theapi.dpdns.org/api/sub-info/';

/* Shared "eventer" badge slots (lvl15, first-item-priority, …) —
   70px box + 19px gap = 89px step, player 1..5. */
const EVT_TOPS      = [367, 456, 545, 634, 723];
const EVT_LEFT_HOME = 90;
const EVT_LEFT_AWAY = 1679; /* 1920 - 90 - 151 */

const TIER3_IDS = new Set([
  '2006','2008','2009','2011','2013','2014',
  '2106','2107','2108','2110','2112',
  '2207','2208','2212',
  '3001','3002','3003','3004','3005','3006','3007','3008','3009','3012','3013','3014','3015',
  '3101','3102','3103','3104','3105','3106','3108','3109','3110','3111','3112','3113',
  '3201','3202','3203','3204','3205','3206','3207','3208','3209','3210','3212',
]);

/* T3 item → recipe component IDs (from S17 Item Database.xlsx) */
const T3_RECIPES = {
  '2006': ['1006','1004','1002'],
  '2008': ['1007','1006'],
  '2009': ['1006','1002','1002'],
  '2011': ['1006','1004'],
  '2013': ['2002','1005','1205'],
  '2014': ['1008','1008'],
  '2106': ['2102','1103','2101'],
  '2107': ['1008','1205','1201'],
  '2108': ['1007','1104'],
  '2110': ['1104','2105','1101'],
  '2112': ['2101','1104','1102'],
  '2207': ['2206','1202','1202'],
  '2208': ['2201','1205','1008'],
  '2212': ['2201','1202','1203'],
  '3001': ['2001'],
  '3002': ['1004','2003','1001'],
  '3003': ['2001','1003','1003'],
  '3004': ['2103','1005','2002'],
  '3005': ['2003','1002'],
  '3006': ['2003','1003'],
  '3007': ['2004','2002'],
  '3008': ['2001','2001'],
  '3009': ['2004','1005','1002'],
  '3012': ['2005','1002'],
  '3013': ['2001','1006'],
  '3014': ['2001','1005','1003'],
  '3015': ['2004','1002','1002'],
  '3101': ['2101'],
  '3102': ['2101','2101','2101'],
  '3103': ['1105','2101','1201'],
  '3104': ['1105','2104','1101'],
  '3105': ['2104','1101','1201'],
  '3106': ['2103','1104','2101'],
  '3108': ['2101','2101'],
  '3109': ['1205','1205','1008'],
  '3110': ['2101','1104','1102'],
  '3111': ['2104','2101'],
  '3112': ['2101','1104','1201'],
  '3113': ['2105','1104','1104'],
  '3201': ['2202','2201','1203'],
  '3202': ['2201','2201','2201'],
  '3203': ['2205','2201'],
  '3204': ['1205','1205','1201'],
  '3205': ['2203','1201'],
  '3206': ['2204','1202','1203'],
  '3207': ['2201','1201','1202'],
  '3208': ['2201','1205','1202'],
  '3209': ['2201','2201','1202'],
  '3210': ['2203','1203','1204'],
  '3212': ['2206','2201'],
};

const isPlayingLvl    = {};
const isPlayingItem   = {};
const itemQueue       = {};
const isPlayingTrinity = {};
const trinityQueue    = {};
const trinityFired    = {};
const concealQueue    = {};
const lvl15Queue      = {};
const prevLevel       = {};
var prevEquipState    = {};
const prevBlessingGold = {};
const isPlayingSwap   = {};
const swapQueue       = {};
const prevTotalDamage = {};
const combatHistory   = {};
const swapRefs        = {};
var lastData       = null;
var selectedT3Cell = null;
const pollHandlers = [];
const lvl15Refs   = {};
const itemRefs    = {};
const trinityRefs = {};
const concealRefs = {};
const isPlayingConceal = { left: false, right: false };

/* ── Image preloading ── */
(function preloadItemImages() {
  const ids = new Set();
  Object.entries(T3_RECIPES).forEach(([t3id, recipes]) => {
    ids.add(t3id);
    recipes.forEach(id => ids.add(id));
  });
  ids.forEach(id => { const img = new Image(); img.src = `Items/${id}.png`; });
})();

var heroImagesPreloaded = false;
function preloadHeroImages(data) {
  if (heroImagesPreloaded) return;
  heroImagesPreloaded = true;
  for (let i = 1; i <= 10; i++) {
    const r = getPlayer(data, i);
    if (r?.player?.heroid) {
      const img = new Image();
      img.src = `hero/HERO_${r.player.heroid}_KOTAK.png`;
    }
  }
}

function formatTime(s) {
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function normalizeId(val) {
  if (val == null || val === '' || val === 0 || val === '0') return '99999';
  const s = String(val);
  if (s === '9999') return '99999';
  return s;
}
var currentApiUrl = localStorage.getItem('overlayApiUrl') || DEFAULT_URL;
function getApiUrl() { return currentApiUrl; }
async function fetchData() {
  const res  = await fetch(getApiUrl());
  const json = await res.json();
  return json.data;
}
function getPlayer(data, idx) {
  const campId  = idx <= 5 ? 1 : 2;
  const seatNum = idx <= 5 ? idx : idx - 5;
  const camp = data.camp_list?.find(c => c.campid === campId);
  if (!camp) return null;
  const player = camp[`seat_${seatNum}`];
  if (!player) return null;
  const equipIds = (player.equip_list || []).slice(0, 6).map(e => normalizeId(e?.value));
  return { player, equipIds };
}
/* seat_1..seat_5 are NOT guaranteed to be in lane order — confirmed
   against a live feed sample where seat_1 held the jungler and
   seat_2 held the exp laner. Slot 1-5 here is resolved by the seat's
   own `role` string instead, so slot 1 is always EXP, slot 5 is
   always GOLD, regardless of seat_N order. Falls back to plain
   seat_N when a feed leaves `role` blank (some do). */
const ROLE_ORDER = ['exp_laner', 'jungler', 'mid_laner', 'roamer', 'gold_laner'];
function getPlayerByRole(data, campId, slotIdx) {
  const camp = data.camp_list?.find(c => c.campid === campId);
  if (!camp) return null;
  const role = ROLE_ORDER[slotIdx - 1];
  for (let s = 1; s <= 5; s++) {
    const seat = camp[`seat_${s}`];
    if (seat && seat.role === role) return seat;
  }
  return camp[`seat_${slotIdx}`] || null;
}

function registerPollHandler(fn) { pollHandlers.push(fn); }
function setAllSlotTriggers(disabled) {
  document.querySelectorAll('.slot-trigger-btn').forEach(b => b.disabled = disabled);
}

function isAnyPlaying(i) {
  const side = i === 4 ? 'left' : i === 9 ? 'right' : null;
  return !!(isPlayingTrinity[i] || isPlayingSwap[i] || isPlayingItem[i] || isPlayingLvl[i] || (side && isPlayingConceal[side]));
}

function playNextQueued(i) {
  const side = i === 4 ? 'left' : i === 9 ? 'right' : null;
  if (trinityQueue[i] && !isPlayingTrinity[i]) {
    const q = trinityQueue[i]; trinityQueue[i] = null;
    setTimeout(() => triggerTrinity(i, q.t3ItemIds, q.label), 300);
  } else if (swapQueue[i] && !isPlayingSwap[i]) {
    const q = swapQueue[i]; swapQueue[i] = null;
    setTimeout(() => triggerSwap(i, q.soldId, q.boughtId), 300);
  } else if (itemQueue[i] && !isPlayingItem[i]) {
    const q = itemQueue[i]; itemQueue[i] = null;
    setTimeout(() => triggerItem(i, q.itemId, q.timeStr), 300);
  } else if (lvl15Queue[i] && !isPlayingLvl[i]) {
    const q = lvl15Queue[i]; lvl15Queue[i] = null;
    setTimeout(() => triggerLvl15(i, q.timeStr, q.heroId), 300);
  } else if (side && concealQueue[side] && !isPlayingConceal[side]) {
    const q = concealQueue[side]; concealQueue[side] = null;
    setTimeout(() => triggerConceal(q.cat, side, q.timeStr), 300);
  }
}


const ROLE_ICONS = {
  1: `role/${encodeURIComponent('EXP LANER')}.png`,
  2: `role/${encodeURIComponent('JUNGLER')}.png`,
  3: `role/${encodeURIComponent('MID LANER')}.png`,
  4: `role/${encodeURIComponent('ROAMER')}.png`,
  5: `role/${encodeURIComponent('GOLD LANER')}.png`,
};

/* ── Feature toggles (SSE-controlled from dashboard) ── */
const featureEnabled = {
  killevents: true,
  items:      true,
  trinity:    true,
  swap:       true,
  lvl15:      true,
  conceal:    true,
  fights:     true,
  objectivespawn: true,
};
fetch('/overlay/features').then(r => r.json()).then(d => {
  if (d && typeof d === 'object') Object.assign(featureEnabled, d);
}).catch(() => {});

const pollStatusEl = document.getElementById('poll-status');
function setPollStatus(state) {
  pollStatusEl.className = state || '';
  pollStatusEl.textContent = { live: '● LIVE', error: '● OFFLINE' }[state] || '● IDLE';
}

/* ── Universal poll loop ── */
var prevBattleId = null;
var isFetching   = false;

function resetGameState() {
  for (let i = 1; i <= 10; i++) {
    trinityFired[i]    = false;
    delete prevLevel[i];
    delete prevEquipState[i];
    delete itemQueue[i];
    delete trinityQueue[i];
    delete lvl15Queue[i];
    delete swapQueue[i];
    delete prevTotalDamage[i];
    if (combatHistory[i]) combatHistory[i] = [];
  }
  delete prevBlessingGold['left'];
  delete prevBlessingGold['right'];
  delete concealQueue['left'];
  delete concealQueue['right'];
}

async function masterPoll() {
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await fetchData();
    if (!data) { setPollStatus('error'); isFetching = false; return; }
    setPollStatus('live');
    const bid = data.battleid || data.roomname || null;
    if (bid && prevBattleId && bid !== prevBattleId) {
      window.location.reload();
      return;
    }
    if (bid) prevBattleId = bid;
    preloadHeroImages(data);
    lastData = data;
    pollHandlers.forEach(fn => { try { fn(data); } catch(e) {} });
  } catch(e) {
    setPollStatus('error');
  } finally {
    isFetching = false;
  }
}

(function keepAlive() { requestAnimationFrame(keepAlive); })();
