/* ── [FEATURE: item-check] ──────────────────────────────────────
   Coordinates below are measured directly off
   assets/ingame/ingameitemback2.png (887×282) — see the CSS block
   in mploverlay_v7.css for the full measurement notes. */
const IC_ROW_TOPS       = [8, 64, 120, 176, 232];
const IC_GOLD_TOP_FIRST = 25;   /* first row's gold top; rest follow gap-based pitch */
const IC_GOLD_HEIGHT    = 31;
const IC_HOME_ITEM_X    = [223, 180, 137, 94, 51, 8]; /* index 0 = closest to portrait */
const IC_AWAY_ITEM_X    = [624, 667, 710, 753, 796, 839];
const IC_HOME_PORTRAIT_X = 326;
const IC_AWAY_PORTRAIT_X = 521;
const IC_HOME_GOLD_X     = 262;
const IC_AWAY_GOLD_X     = 561;
/* .ic-bg sits 42px down inside #item-check-overlay (the label banner
   rides above it) — every row coordinate above is relative to the bg
   image itself, so add this offset when positioning row elements. */
const IC_BG_TOP_OFFSET  = 42;

/* Dashboard Edit tab → Item Check Layout (itemcheck_layout.json,
   routes/devapi.js's /api/itemcheck-layout) — goldGap is the space
   between gold rows (added to IC_GOLD_HEIGHT for the row-to-row pitch);
   home/awayOffsetX/Y shift every element on that side together, so the
   whole blue/red half can be nudged in one edit. Defaults here match
   the server's fallback; icAnimateIn() fetches the real saved values
   fresh every time the panel is shown (same pattern as Credit Reel's
   speed/style tunables). */
let icLayout = { goldGap: 26, homeOffsetX: 0, homeOffsetY: 0, awayOffsetX: 0, awayOffsetY: 0 };

function icRowGeometry(side, seatIdx, layout) {
  const ox = side === 'home' ? layout.homeOffsetX : layout.awayOffsetX;
  const oy = side === 'home' ? layout.homeOffsetY : layout.awayOffsetY;
  return {
    top:      IC_ROW_TOPS[seatIdx] + IC_BG_TOP_OFFSET + oy,
    goldTop:  IC_GOLD_TOP_FIRST + seatIdx * (IC_GOLD_HEIGHT + layout.goldGap) + IC_BG_TOP_OFFSET + oy,
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
  gold.style.top  = g.goldTop + 'px';

  const text = document.createElement('span');
  text.className = 'ic-gold-text';
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
   fetch in icAnimateIn() so a layout change (gold gap / side offsets)
   saved from the dashboard takes effect the next time the panel shows,
   without rebuilding any elements. */
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
    ref.gold.style.top  = g.goldTop + 'px';
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
  bg.src = '/assets/ingame/ingameitemback2.png';
  bg.alt = '';
  overlay.appendChild(bg);

  /* Banner riding above the panel, same slide, same bounce+sheen
     flourish pattern as golddiff-check's .gdc-smart chip. */
  const label = document.createElement('div');
  label.className = 'ic-label';
  label.id = 'ic-label';

  const labelImg = document.createElement('img');
  labelImg.className = 'ic-label-img';
  labelImg.src = '/assets/ingame/ingameitemlabel.png';
  labelImg.alt = '';
  label.appendChild(labelImg);

  const labelSheen = document.createElement('div');
  labelSheen.className = 'ic-label-sheen';
  label.appendChild(labelSheen);

  overlay.appendChild(label);
  icRefs.label = label;

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
   maxWaitMs elapses) — same shape as mplfs.html's preloadMedia(). On a
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
     translateY(324px) before .ic-in changes it — going from display:none
     straight to the "in" transform in the same tick can otherwise skip
     the transition entirely. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('ic-in');
  }));

  /* Bounce + sheen flourish on the label banner once the 350ms slide-in
     finishes — same pattern as golddiff-check's gdcPlaySmartFlourish(). */
  setTimeout(() => {
    if (!icShouldShow) return;
    icRefs.label.classList.remove('ic-bounce-play', 'ic-sheen-play');
    void icRefs.label.offsetWidth;
    icRefs.label.classList.add('ic-bounce-play', 'ic-sheen-play');
  }, 350);
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
