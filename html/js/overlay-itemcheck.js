/* ── [FEATURE: item-check] ──────────────────────────────────────
   Coordinates below are measured directly off
   assets/ingame/ingameitemback3.png (980×284, RMC10 template — the
   "ITEM BUILD" title/logo is baked into the art, so there's no more
   separate sliding label banner above the panel). Every row (items,
   portrait, gold number) shares the exact same 5-row grid (row top
   pitch ~53.5px, each cell 40×40 content inside its own 42px gold-
   bordered box), unlike the old back2.png art where the gold column
   used its own independent vertical rhythm.
   Row tops (content, +1px inset from each box's own border): 12, 66,
     119, 173, 226.
   Home items (index 0→5, closest→furthest from center, pitch 47 =
     40px + 7px gap, nearest-to-farthest box borders 244→12): 245, 199,
     153, 107, 60, 13.
   Away items (index 0→5, mirrored, box borders 694→968): 695, 741,
     787, 833, 880, 927.
   Portrait (40×40): home x=375, away x=564 (the box directly beside
     each side's static "$" glyph).
   Gold number: home x=287 w=59 (the gap between the item grid and the
     "$" glyph), away x=634 w=59 (mirrored gap, "$" glyph to item grid) —
     per row design, gold sits on the OUTER side of "$", portrait on the
     INNER (center) side, same both teams. */
const IC_ROW_TOPS       = [12, 66, 119, 173, 226];
const IC_HOME_ITEM_X    = [245, 199, 153, 107, 60, 13]; /* index 0 = closest to center */
const IC_AWAY_ITEM_X    = [695, 741, 787, 833, 880, 927];
const IC_HOME_PORTRAIT_X = 375;
const IC_AWAY_PORTRAIT_X = 564;
const IC_HOME_GOLD_X     = 287;
const IC_AWAY_GOLD_X     = 634;

/* Dashboard Edit tab → Item Check Layout (itemcheck_layout.json,
   routes/devapi.js's /api/itemcheck-layout) — home/awayOffsetX/Y shift
   every element on that side together, so the whole blue/red half can
   be nudged in one edit; goldFontSize is shared across all 10 gold-
   number rows (there's only one control for "the gold number" font
   size, not one per player — see icApplyLayout()). Defaults here match
   the server's fallback; icAnimateIn() fetches the real saved values
   fresh every time the panel is shown (same pattern as Credit Reel's
   speed/style tunables). */
let icLayout = { goldFontSize: 30, homeOffsetX: 0, homeOffsetY: 0, awayOffsetX: 0, awayOffsetY: 0 };

function icRowGeometry(side, seatIdx, layout) {
  const ox = side === 'home' ? layout.homeOffsetX : layout.awayOffsetX;
  const oy = side === 'home' ? layout.homeOffsetY : layout.awayOffsetY;
  return {
    top:      IC_ROW_TOPS[seatIdx] + oy,
    portraitX: (side === 'home' ? IC_HOME_PORTRAIT_X : IC_AWAY_PORTRAIT_X) + ox,
    itemXs:    (side === 'home' ? IC_HOME_ITEM_X : IC_AWAY_ITEM_X).map(x => x + ox),
    goldX:     (side === 'home' ? IC_HOME_GOLD_X : IC_AWAY_GOLD_X) + ox,
  };
}

let icShouldShow = false;
let icOutTimer   = null;
const icRefs     = {};

function icFormatGold(g) {
  return ((g || 0) / 1000).toFixed(1) + 'K';
}

function icBuildRow(i) {
  const side    = i <= 5 ? 'home' : 'away';
  const seatIdx = i <= 5 ? i - 1 : i - 6;
  const g = icRowGeometry(side, seatIdx, icLayout);

  const portrait = document.createElement('img');
  portrait.className = 'ic-portrait';
  portrait.style.left = g.portraitX + 'px';
  portrait.style.top  = g.top + 'px';
  portrait.alt = '';
  portrait.onerror = () => { portrait.onerror = null; portrait.removeAttribute('src'); };

  const gold = document.createElement('div');
  gold.className = 'ic-gold';
  gold.style.left = g.goldX + 'px';
  gold.style.top  = g.top + 'px';

  const text = document.createElement('span');
  text.className = 'ic-gold-text';
  text.style.fontSize = icLayout.goldFontSize + 'px';
  text.textContent = '0.0K';
  gold.appendChild(text);

  const items = [];
  for (let s = 0; s < 6; s++) {
    const item = document.createElement('img');
    item.className = 'ic-item-slot';
    item.style.left = g.itemXs[s] + 'px';
    item.style.top  = g.top + 'px';
    item.alt = '';
    item.onerror = () => { item.onerror = null; item.src = 'items/99999.png'; };
    items.push(item);
  }

  icRefs[i] = { portrait, gold, goldText: text, items };
  return [portrait, gold, ...items];
}

/* Re-applies icLayout to every already-built row — called after a fresh
   fetch in icAnimateIn() so a layout change (side offsets / gold font
   size) saved from the dashboard takes effect the next time the panel
   shows, without rebuilding any elements. goldFontSize is applied to
   every row's gold text identically — it's one shared control, not a
   per-player one. */
function icApplyLayout() {
  for (let i = 1; i <= 10; i++) {
    const ref = icRefs[i];
    if (!ref) continue;
    const side    = i <= 5 ? 'home' : 'away';
    const seatIdx = i <= 5 ? i - 1 : i - 6;
    const g = icRowGeometry(side, seatIdx, icLayout);
    ref.portrait.style.left = g.portraitX + 'px';
    ref.portrait.style.top  = g.top + 'px';
    ref.gold.style.left = g.goldX + 'px';
    ref.gold.style.top  = g.top + 'px';
    ref.goldText.style.fontSize = icLayout.goldFontSize + 'px';
    ref.items.forEach((item, s) => {
      item.style.left = g.itemXs[s] + 'px';
      item.style.top  = g.top + 'px';
    });
  }
}

function icFetchLayout() {
  return fetch('/api/itemcheck-layout', { cache: 'no-store' })
    .then(r => r.json())
    .then(layout => { icLayout = layout; icApplyLayout(); })
    .catch(() => {});
}

/* Called from dashboard.html's Item Check Layout panel while
   typing/dragging any of its five fields — same cross-frame-call
   pattern as sidecheckSetNameFontCeiling() in overlay-sidecheck-
   core.js. Applies instantly for live preview without writing
   itemcheck_layout.json; Save is what persists it. */
window.icPreviewLayout = function(partial) {
  icLayout = Object.assign({}, icLayout, partial);
  icApplyLayout();
};

function icBuildPanel() {
  const overlay = document.getElementById('item-check-overlay');
  if (!overlay) return;

  const bg = document.createElement('img');
  bg.className = 'ic-bg';
  bg.src = '/assets/ingame/ingameitemback3.png';
  bg.alt = '';
  overlay.appendChild(bg);

  for (let i = 1; i <= 10; i++) {
    icBuildRow(i).forEach(el => overlay.appendChild(el));
  }
}
icBuildPanel();

function icUpdate(data) {
  if (!icShouldShow) return;
  for (let i = 1; i <= 10; i++) {
    const r   = getPlayer(data, i);
    const ref = icRefs[i];
    if (!r || !r.player || !ref) continue;

    const heroId = r.player.heroid;
    if (heroId) ref.portrait.src = `hero/HERO_${heroId}_KOTAK.png`;
    else        ref.portrait.removeAttribute('src');

    ref.goldText.textContent = icFormatGold(r.player.gold);

    for (let s = 0; s < 6; s++) {
      const id = r.equipIds[s] || '99999';
      ref.items[s].src = `items/${id}.png`;
    }
  }
}
registerPollHandler(icUpdate);

/* Waits for every <img> under `overlay` to finish loading (or errors, or
   maxWaitMs elapses) — same shape as Fullscreen.html's preloadMedia(). On a
   freshly-reloaded page none of the ~60 item/portrait icons are cached
   yet, so setting all their src at once and immediately starting the
   slide-in transition let the burst of first-time image decodes stall
   the main thread right on the transition's opening frames, making it
   look like it "pops in" partway instead of sliding from the start.
   Once every icon is cached (every show after the first), there's
   nothing to wait on and this resolves immediately. */
function icPreloadImages(overlay, maxWaitMs) {
  const els = overlay.querySelectorAll('img');
  return Promise.all(Array.from(els).map(el => new Promise(resolve => {
    if (!el.getAttribute('src') || el.complete) return resolve();
    el.addEventListener('load', resolve, { once: true });
    el.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, maxWaitMs);
  })));
}

async function icAnimateIn() {
  icShouldShow = true;
  clearTimeout(icOutTimer);
  const clip    = document.getElementById('item-check-clip');
  const overlay = document.getElementById('item-check-overlay');

  await icFetchLayout();
  if (!icShouldShow) return; /* hidden again while we were fetching layout */

  if (lastData) icUpdate(lastData);
  await icPreloadImages(overlay, 900);
  if (!icShouldShow) return; /* hidden again while we were preloading */

  clip.style.display = 'block';
  /* Double rAF (same technique as slideOut() in overlay-core.js) so the
     browser commits a full style+layout+paint pass at the base rule's
     translateY(284px) before .ic-in changes it — going from display:none
     straight to the "in" transform in the same tick can otherwise skip
     the transition entirely. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('ic-in');
  }));
}

function icAnimateOut() {
  icShouldShow = false;
  const clip    = document.getElementById('item-check-clip');
  const overlay = document.getElementById('item-check-overlay');
  /* Just remove .ic-in — the transition lives on the base rule, so this
     animates back to it smoothly instead of snapping instantly with
     nothing left to transition (that was the earlier "stall" bug). */
  overlay.classList.remove('ic-in');
  clearTimeout(icOutTimer);
  icOutTimer = setTimeout(() => {
    clip.style.display = 'none';
  }, 350);
  /* Resume any kill events that queued up while this panel was blocking
     them (see killEventsBlocked() in overlay-killevents.js). */
  playNextKillEvent();
}
