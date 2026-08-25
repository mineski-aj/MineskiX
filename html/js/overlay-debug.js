/* ── Level 15 debug buttons ── */
for (let i = 1; i <= 10; i++) {
  buildLvl15Overlay(i);
  const btn = document.createElement('button');
  btn.className = 'debug-btn'; btn.dataset.player = i; btn.textContent = `▶ P${i}`;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const data    = lastData || await fetchData();
      const r       = getPlayer(data, i);
      const timeStr = r?.player?.level_eta || '--:--';
      const heroId  = r?.player?.heroid;
      triggerLvl15(i, timeStr, heroId);
    }
    catch { triggerLvl15(i, '--:--'); }
  });
  document.getElementById(i <= 5 ? 'team-left' : 'team-right').appendChild(btn);
}

/* ── T3 item browser ── */
var t3BrowserBuilt = false;
function buildT3Browser() {
  if (t3BrowserBuilt) return;
  t3BrowserBuilt = true;
  const browser = document.getElementById('t3-browser');
  const savedId = localStorage.getItem('selectedT3Id') || Object.keys(T3_RECIPES)[0];
  Object.keys(T3_RECIPES).forEach(id => {
    const cell = document.createElement('div');
    cell.className = 't3-cell';
    cell.dataset.id = id;
    const img = document.createElement('img');
    img.src = `Items/${id}.png`;
    img.onerror = () => { img.onerror = null; img.src = `Items/99999.png`; };
    const lbl = document.createElement('span');
    lbl.textContent = id;
    cell.appendChild(img);
    cell.appendChild(lbl);
    cell.addEventListener('click', () => {
      if (selectedT3Cell) selectedT3Cell.classList.remove('selected');
      selectedT3Cell = cell;
      cell.classList.add('selected');
      localStorage.setItem('selectedT3Id', id);
    });
    if (id === savedId) {
      cell.classList.add('selected');
      selectedT3Cell = cell;
    }
    browser.appendChild(cell);
  });
}

for (let i = 1; i <= 10; i++) {
  buildItemOverlay(i);
  const btn = document.createElement('button');
  btn.className = 'debug-btn item-debug-btn';
  btn.dataset.player = i;
  btn.textContent = `▶ P${i}`;
  (function(pi) {
    btn.addEventListener('click', async () => {
      const selId  = selectedT3Cell?.dataset.id || Object.keys(T3_RECIPES)[0];
      let timeStr  = '--:--';
      try {
        const data = lastData || await fetchData();
        timeStr = formatTime(data.game_time || 0);
      } catch(e) {}
      triggerItem(pi, selId, timeStr);
    });
  })(i);
  document.getElementById(i <= 5 ? 'item-team-left' : 'item-team-right').appendChild(btn);
}

/* ── Trinity debug buttons ── */
const MARKSMAN_TRINITY_IDS = new Set(['2006', '2008', '2009']);
function isMarksmanTrinity(t3ItemIds) {
  const s = new Set(t3ItemIds);
  return MARKSMAN_TRINITY_IDS.size === s.size && [...MARKSMAN_TRINITY_IDS].every(id => s.has(id));
}
function trinityLabel(seatNum, t3ItemIds) {
  return (seatNum === 5 && isMarksmanTrinity(t3ItemIds)) ? 'MARKSMAN TRINITY' : 'CORE ITEMS ACHIEVED';
}

const TRINITY_DEBUG_ITEMS = ['3001', '3101', '3201'];
for (let i = 1; i <= 10; i++) {
  buildTrinityOverlay(i);
  const btn = document.createElement('button');
  btn.className = 'debug-btn trinity-debug-btn';
  btn.dataset.player = i;
  btn.textContent = `▶ P${i}`;
  (function(pi) {
    btn.addEventListener('click', async () => {
      const seatNum = pi <= 5 ? pi : pi - 5;
      let items = [...TRINITY_DEBUG_ITEMS];
      try {
        const data = lastData || await fetchData();
        const r    = getPlayer(data, pi);
        if (r) {
          const actualT3 = r.equipIds.filter(id => TIER3_IDS.has(id));
          if (actualT3.length > 0) items = [...actualT3, ...TRINITY_DEBUG_ITEMS].slice(0, 3);
        }
      } catch(e) {}
      triggerTrinity(pi, items, trinityLabel(seatNum, items));
    });
  })(i);
  document.getElementById(i <= 5 ? 'trinity-team-left' : 'trinity-team-right').appendChild(btn);
}

/* Load game API URL from server */
fetch('/api/game-url').then(r => r.json()).then(d => {
  if (d.url) {
    currentApiUrl = d.url;
    localStorage.setItem('overlayApiUrl', d.url);
  }
  document.getElementById('api-url-display').textContent = currentApiUrl;
}).catch(() => {
  document.getElementById('api-url-display').textContent = currentApiUrl;
});

/* ── Debug panel toggle (backtick key) ── */
document.addEventListener('keydown', e => {
  if (e.key === '`') document.getElementById('debug-area').classList.toggle('visible');
});

/* ── Tab switching ── */
document.getElementById('debug-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('visible'));
  btn.classList.add('active');
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add('visible');
  if (btn.dataset.tab === 'items') buildT3Browser();
});

/* ── Conceal debug buttons ── */
buildConcealDebugButtons(4, 'left');
buildConcealDebugButtons(9, 'right');

/* ── Swap debug buttons ── */
const SWAP_DEBUG_BOUGHT = '3207';
for (let pi = 1; pi <= 10; pi++) {
  buildSwapOverlay(pi);
  (function(idx) {
    const btn = document.createElement('button');
    btn.className      = 'debug-btn swap-debug-btn';
    btn.dataset.player = idx;
    btn.textContent    = `▶ P${idx}`;
    btn.addEventListener('click', async () => {
      let soldId = '3001';
      try {
        const data = lastData || await fetchData();
        const r    = getPlayer(data, idx);
        if (r) {
          const t3s = r.equipIds.filter(id => TIER3_IDS.has(id));
          if (t3s.length > 0) soldId = t3s[0];
        }
      } catch(e) {}
      triggerSwap(idx, soldId, SWAP_DEBUG_BOUGHT);
    });
    const teamDiv = idx <= 5 ? 'swap-team-left' : 'swap-team-right';
    document.getElementById(teamDiv).appendChild(btn);
  })(pi);
}

/* ── iframe test entry point (called by dashboard preview tester) ── */
window.iframeTest = async function(playerIdx, feature) {
  try {
    const data = lastData || await fetchData();
    if (!data) return;
    const r = getPlayer(data, playerIdx);
    if (!r) return;
    const { player, equipIds } = r;
    const pName   = (player.name || '').toUpperCase();
    const seatNum = playerIdx <= 5 ? playerIdx : playerIdx - 5;
    const t3s     = equipIds.filter(id => TIER3_IDS.has(id));

    if (feature === 'lvl15') {
      triggerLvl15(playerIdx, formatTime(data.game_time || 0), player.heroid);
    } else if (feature === 'item') {
      const itemId = t3s.length > 0 ? t3s[0] : Object.keys(T3_RECIPES)[0];
      triggerItem(playerIdx, itemId, formatTime(data.game_time || 0));
    } else if (feature === 'trinity') {
      const items = t3s.length >= 3 ? t3s.slice(0, 3) : [...TRINITY_DEBUG_ITEMS];
      triggerTrinity(playerIdx, items, trinityLabel(seatNum, items));
    } else if (feature === 'swap') {
      const soldId = t3s.length > 0 ? t3s[0] : '3001';
      triggerSwap(playerIdx, soldId, SWAP_DEBUG_BOUGHT);
    } else if (feature === 'conceal') {
      const campId = playerIdx <= 5 ? 1 : 2;
      const side   = playerIdx <= 5 ? 'left' : 'right';
      const camp   = (data.camp_list || []).find(function(c) { return c.campid === campId; });
      triggerConceal(camp ? getCampRoamingCategory(camp) : 'default', side, formatTime(data.game_time || 0));
    }
  } catch(e) { console.warn('[iframeTest]', e); }
};

/* ── Unified poll handler ── */
registerPollHandler(function(data) {
  for (let pidx = 1; pidx <= 10; pidx++) {
    const result = getPlayer(data, pidx);
    if (!result) continue;
    const { player, equipIds } = result;
    const prev    = prevEquipState[pidx];
    const pName   = (player.name || '').toUpperCase();
    const seatNum = pidx <= 5 ? pidx : pidx - 5;

    const dmg = parseInt(player.total_damage) || 0;
    if (prevTotalDamage[pidx] !== undefined) {
      const delta = dmg - prevTotalDamage[pidx];
      if (!combatHistory[pidx]) combatHistory[pidx] = [];
      combatHistory[pidx].push(delta > 0 ? delta : 0);
      if (combatHistory[pidx].length > 3) combatHistory[pidx].shift();
    }
    prevTotalDamage[pidx] = dmg;

    if (prev) {
      const currentT3 = equipIds.filter(id => TIER3_IDS.has(id));
      const prevT3    = prev.filter(id => TIER3_IDS.has(id));

      if (featureEnabled.trinity && !trinityFired[pidx]) {
        if (currentT3.length === 3 && prevT3.length === 2) {
          trinityFired[pidx] = true;
          const lbl = trinityLabel(seatNum, currentT3);
          if (isAnyPlaying(pidx)) {
            trinityQueue[pidx] = { t3ItemIds: currentT3, label: lbl };
          } else {
            triggerTrinity(pidx, currentT3, lbl);
          }
        } else if (featureEnabled.items && currentT3.length === 1 && prevT3.length === 0) {
          for (let j = 0; j < 6; j++) {
            if (equipIds[j] !== prev[j] && TIER3_IDS.has(equipIds[j])) {
              const newItemId = equipIds[j];
              const timeStr   = formatTime(data.game_time || 0);
              if (isAnyPlaying(pidx)) {
                itemQueue[pidx] = { itemId: newItemId, timeStr };
              } else {
                triggerItem(pidx, newItemId, timeStr);
              }
              break;
            }
          }
        }
      }

      const soldT3   = prevT3.filter(id => !currentT3.includes(id));
      const boughtT3 = currentT3.filter(id => !prevT3.includes(id));
      if (featureEnabled.swap && soldT3.length === 1 && boughtT3.length === 1) {
        const inCombat = combatHistory[pidx] && combatHistory[pidx].some(d => d > 0);
        if (inCombat) {
          if (isAnyPlaying(pidx)) {
            swapQueue[pidx] = { soldId: soldT3[0], boughtId: boughtT3[0] };
          } else {
            triggerSwap(pidx, soldT3[0], boughtT3[0]);
          }
        }
      }
    }
    prevEquipState[pidx] = [...equipIds];
  }

  for (let pidx = 1; pidx <= 10; pidx++) {
    const result = getPlayer(data, pidx);
    if (!result) continue;
    const { player } = result;
    const lvl  = parseInt(player.level) || 0;
    const prev = prevLevel[pidx];
    if (featureEnabled.lvl15 && prev !== undefined && prev < 15 && lvl >= 15) {
      const timeStr = formatTime(data.game_time || 0);
      if (isAnyPlaying(pidx)) {
        lvl15Queue[pidx] = { timeStr, heroId: player.heroid };
      } else {
        triggerLvl15(pidx, timeStr, player.heroid);
      }
    }
    prevLevel[pidx] = lvl;
  }

  [{ campId: 1, side: 'left', playerIdx: 4 }, { campId: 2, side: 'right', playerIdx: 9 }].forEach(({ campId, side, playerIdx }) => {
    const camp = (data.camp_list || []).find(c => c.campid === campId);
    if (!camp) return;
    const bg   = camp.blessing_gold || 0;
    const prev = prevBlessingGold[side];
    if (featureEnabled.conceal && prev !== undefined && prev < 1000 && bg >= 1000) {
      const cat     = getCampRoamingCategory(camp);
      const timeStr = formatTime(data.game_time || 0);
      if (isAnyPlaying(playerIdx)) { concealQueue[side] = { cat, timeStr }; }
      else { triggerConceal(cat, side, timeStr); }
    }
    prevBlessingGold[side] = bg;
  });
});

/* ── Kill events debug buttons ── */
const KILL_DEBUG_BTNS = [
  { label: 'FIRST BLOOD',  video: 'firstblood.webm',  priority: 1 },
  { label: 'DOUBLE KILL',  video: 'doublekill.webm',  priority: 2 },
  { label: 'TRIPLE KILL',  video: 'triplekill.webm',  priority: 3 },
  { label: 'MANIAC',       video: 'maniac.webm',      priority: 4 },
  { label: 'SAVAGE',       video: 'savage.webm',      priority: 5 },
  { label: 'LORD SLAIN',   video: 'lordslain.webm',   priority: 1 },
  { label: 'TURTLE SLAIN', video: 'turtleslain.webm', priority: 1 },
  { label: 'WIPE OUT',     video: 'wipedout.webm',    priority: 3 },
];
const killBtnRow = document.getElementById('kill-event-btns');
KILL_DEBUG_BTNS.forEach(({ label, video, priority }) => {
  const btn = document.createElement('button');
  btn.className = 'debug-btn';
  btn.textContent = `▶ ${label}`;
  btn.addEventListener('click', () => enqueueKillEvent(video, priority, null, null));
  killBtnRow.appendChild(btn);
});

/* ── Objective spawn debug buttons ── */
const OBJ_SPAWN_DEBUG_BTNS = [
  { label: 'LORD SPAWN',   kind: 'lord'   },
  { label: 'TURTLE SPAWN', kind: 'turtle' },
];
const objSpawnBtnRow = document.getElementById('objectivespawn-btns');
OBJ_SPAWN_DEBUG_BTNS.forEach(({ label, kind }) => {
  const btn = document.createElement('button');
  btn.className = 'debug-btn';
  btn.textContent = `▶ ${label}`;
  btn.addEventListener('click', () => objSpawnEnqueue(kind));
  objSpawnBtnRow.appendChild(btn);
});

/* ── Start polling ── */
setInterval(masterPoll, 1000);
masterPoll();

/* ── SSE — fight show/hide (instant) + debugoff ── */
(function() {
  // Backed by the shared SharedWorker (html/js/overlay-shared-worker.js) —
  // this page opens zero real connections of its own now, so having
  // several overlay browser sources/tabs open at once no longer eats into
  // the browser's shared connection pool per page. mploverlay_v7.html must
  // load html/js/overlay-sse-shim.js before this file for createOverlaySSE
  // to exist.
  var sse = createOverlaySSE();

  /* Fired by routes/overlayStyles.js after any Edit-tab Save — force a
     hard reload so new position/size overrides apply immediately (see
     mplfs.html's connectSSE() for the identical pattern). */
  sse.addEventListener('reload', function() { window.location.reload(); });

  sse.addEventListener('fights', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (!featureEnabled.fights) return;
      if (d.action === 'show') {
        if (allFights.length) { debugIdx = allFights.length - 1; renderFight(allFights[debugIdx], feedData); }
        fightAnimateIn();
      }
      if (d.action === 'hide') fightAnimateOut();
    } catch {}
  });
  sse.addEventListener('killevent', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.video) enqueueKillEvent(d.video, d.priority, d.playerIdx, d.playerName, d.role, d.camp);
    } catch {}
  });
  sse.addEventListener('featuretoggle', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.feature in featureEnabled) featureEnabled[d.feature] = !!d.enabled;
    } catch {}
  });
  sse.addEventListener('scoreboard', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (typeof sbHandleToggle === 'function') sbHandleToggle(d.action === 'show');
    } catch {}
  });
  sse.addEventListener('playerui', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (typeof puiHandleToggle === 'function') puiHandleToggle(d.action === 'show');
    } catch {}
  });
  sse.addEventListener('debugoff', function() {
    var area = document.getElementById('debug-area');
    if (area) area.classList.remove('visible');
  });
  sse.addEventListener('itemcheck', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.action === 'show') icAnimateIn();
      if (d.action === 'hide') icAnimateOut();
    } catch {}
  });
  sse.addEventListener('emblemcheck', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.action === 'show') eccAnimateIn();
      if (d.action === 'hide') eccAnimateOut();
    } catch {}
  });
  sse.addEventListener('golddiffcheck', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.action === 'show') gdcAnimateIn();
      if (d.action === 'hide') gdcAnimateOut();
    } catch {}
  });
  /* Shared by every "side *check" ranking panel — one SSE event
     ('sidecheck') carries a `check` field naming which panel, instead
     of a dedicated event per panel. Add new side-checks here. */
  var SIDE_CHECK_HANDLERS = {
    sideexpcheck:    { in: function () { secAnimateIn(); }, out: function () { secAnimateOut(); } },
    sidetakencheck:  { in: function () { stcAnimateIn(); }, out: function () { stcAnimateOut(); } },
    sidedamagecheck: { in: function () { sdcAnimateIn(); }, out: function () { sdcAnimateOut(); } },
    sidegoldcheck:   { in: function () { sgcAnimateIn(); }, out: function () { sgcAnimateOut(); } },
  };
  sse.addEventListener('sidecheck', function(e) {
    try {
      var d = JSON.parse(e.data);
      var h = SIDE_CHECK_HANDLERS[d.check];
      if (!h) return;
      if (d.action === 'show') h.in();
      if (d.action === 'hide') h.out();
    } catch {}
  });
})();
