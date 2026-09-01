/* ── [FEATURE: emblem-check] ──────────────────────────────────────
   RMC10 template — coordinates below are measured directly off
   rmc_emblem.png (775×284), player rows stacked top-to-bottom (see the
   CSS block in ingame.css for the full measurement notes).

   Slot 1-5 role resolution (seat_N isn't reliably lane-ordered) is
   handled by the shared getPlayerByRole() in overlay-core.js. */
const ECC_BG_W       = 775;
/* Measured directly off rmc_emblem.png's actual box borders (pixel-
   scanned each column's black-interior start row: 18/72/126/180/234 for
   the sub-emblem columns, same 54px step for main/hero) — NOT 284/5
   (56.8), which was a first-pass guess before the real art existed to
   measure against and left row 2-5 slightly misaligned inside their
   gold-bordered boxes. */
const ECC_ROW_STEP   = 54;

/* Home (left/blue) column X positions, row 1 — away mirrors each via
   x' = ECC_BG_W - x - width (see eccCardGeometry). */
const ECC_SUB_X    = [20, 62, 103]; // sub emblem 3, 2, 1 (left to right)
const ECC_SUB_Y    = 18;
const ECC_SUB_W    = 30;
const ECC_MAIN_X   = 143;
const ECC_MAIN_Y   = 13;
const ECC_MAIN_W   = 40;
const ECC_HERO_X   = 226;
const ECC_HERO_Y   = 14;
const ECC_HERO_W   = 38;

let eccShouldShow = false;
let eccOutTimer   = null;
const eccRefs     = {};

/* Dashboard Edit tab → Bottom Events · Emblem Check (emblemcheck_layout.json,
   routes/devapi.js's /api/emblemcheck-layout) — homeOffsetX/Y and
   awayOffsetX/Y shift every element on that side (hero, main/sub
   emblems) together, same model as Item Check's icLayout in
   overlay-itemcheck.js. */
let eccLayout = { homeOffsetX: 0, homeOffsetY: 0, awayOffsetX: 0, awayOffsetY: 0 };

function eccCardGeometry(side, slotIdx, layout) {
  const ox = side === 'home' ? layout.homeOffsetX : layout.awayOffsetX;
  const oy = side === 'home' ? layout.homeOffsetY : layout.awayOffsetY;
  const rowY = (slotIdx - 1) * ECC_ROW_STEP;
  const mirror = (x, w) => side === 'home' ? x : (ECC_BG_W - x - w);

  return {
    subLefts: ECC_SUB_X.map(x => mirror(x, ECC_SUB_W) + ox),
    subTop: ECC_SUB_Y + rowY + oy,
    mainLeft: mirror(ECC_MAIN_X, ECC_MAIN_W) + ox,
    mainTop: ECC_MAIN_Y + rowY + oy,
    heroLeft: mirror(ECC_HERO_X, ECC_HERO_W) + ox,
    heroTop: ECC_HERO_Y + rowY + oy,
  };
}

function eccBuildCard(i) {
  const side    = i <= 5 ? 'home' : 'away';
  const slotIdx = i <= 5 ? i : i - 5;
  const g = eccCardGeometry(side, slotIdx, eccLayout);

  const hero = document.createElement('img');
  hero.className = 'ecc-hero';
  hero.style.left = g.heroLeft + 'px';
  hero.style.top  = g.heroTop + 'px';
  hero.alt = '';
  hero.onerror = () => { hero.onerror = null; hero.removeAttribute('src'); };

  const mainRune = document.createElement('img');
  mainRune.className = 'ecc-mainrune';
  mainRune.style.left = g.mainLeft + 'px';
  mainRune.style.top  = g.mainTop + 'px';
  mainRune.alt = '';
  mainRune.onerror = () => { mainRune.onerror = null; mainRune.removeAttribute('src'); };

  const subRunes = g.subLefts.map(left => {
    const sub = document.createElement('img');
    sub.className = 'ecc-subrune';
    sub.style.left = left + 'px';
    sub.style.top  = g.subTop + 'px';
    sub.alt = '';
    sub.onerror = () => { sub.onerror = null; sub.removeAttribute('src'); };
    return sub;
  });

  eccRefs[i] = { side, slotIdx, hero, mainRune, subRunes };
  return [hero, mainRune, ...subRunes];
}

/* Re-applies eccLayout to every already-built card — called after a fresh
   fetch in eccAnimateIn() so a layout change saved from the dashboard
   takes effect the next time the panel shows, without rebuilding any
   elements (same pattern as icApplyLayout() in overlay-itemcheck.js). */
function eccApplyLayout() {
  for (let i = 1; i <= 10; i++) {
    const ref = eccRefs[i];
    if (!ref) continue;
    const g = eccCardGeometry(ref.side, ref.slotIdx, eccLayout);
    ref.hero.style.left = g.heroLeft + 'px';
    ref.hero.style.top  = g.heroTop + 'px';
    ref.mainRune.style.left = g.mainLeft + 'px';
    ref.mainRune.style.top  = g.mainTop + 'px';
    ref.subRunes.forEach((sub, s) => {
      sub.style.left = g.subLefts[s] + 'px';
      sub.style.top  = g.subTop + 'px';
    });
  }
}

function eccFetchLayout() {
  return fetch('/api/emblemcheck-layout', { cache: 'no-store' })
    .then(r => r.json())
    .then(layout => { eccLayout = layout; eccApplyLayout(); })
    .catch(() => {});
}

/* Called from dashboard.html's Bottom Events · Emblem Check panel while
   typing/dragging any of its four fields — same cross-frame-call pattern
   as icPreviewLayout() in overlay-itemcheck.js. Applies instantly for
   live preview without writing emblemcheck_layout.json; Save is what
   persists it. */
window.eccPreviewLayout = function(partial) {
  eccLayout = Object.assign({}, eccLayout, partial);
  eccApplyLayout();
};

/* rmc_emblem.png lives in the active project's own assets folder
   (projects/<id>/assets/Ingame/rmc_emblem.png), not a plain global
   /assets/ingame/ path — resolved fresh via the active project instead
   of a hardcoded project id, same "same file shape everywhere, just a
   different copy per active project" convention used elsewhere in this
   app. Falls back to the old global art if no project is active (or the
   lookup fails) so this never renders blank. */
function eccBgUrl() {
  return fetch('/api/projects', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(d => (d && d.active)
      ? `/projects/${encodeURIComponent(d.active)}/assets/Ingame/rmc_emblem.png`
      : 'assets/ingame/emblemback.png')
    .catch(() => 'assets/ingame/emblemback.png');
}

function eccBuildPanel() {
  const overlay = document.getElementById('emblem-check-overlay');
  if (!overlay) return;

  const bg = document.createElement('img');
  bg.className = 'ecc-bg';
  bg.alt = '';
  overlay.appendChild(bg);
  eccBgUrl().then(url => { bg.src = url; });

  for (let i = 1; i <= 10; i++) {
    eccBuildCard(i).forEach(el => overlay.appendChild(el));
  }
}
eccBuildPanel();

function eccRuneUrl(id) {
  return id ? `emblem/square_${id}_RUNES.png` : null;
}

function eccUpdate(data) {
  if (!eccShouldShow) return;
  for (let i = 1; i <= 10; i++) {
    const campId  = i <= 5 ? 1 : 2;
    const slotIdx = i <= 5 ? i : i - 5;
    const seat    = getPlayerByRole(data, campId, slotIdx);
    const ref     = eccRefs[i];
    if (!seat || !ref) continue;

    if (seat.heroid) ref.hero.src = `hero/HERO_${seat.heroid}_KOTAK.png`;
    else              ref.hero.removeAttribute('src');

    const mainUrl = eccRuneUrl(seat.rune_id);
    if (mainUrl) ref.mainRune.src = mainUrl;
    else         ref.mainRune.removeAttribute('src');

    const rm  = seat.rune_map || {};
    const subs = [
      seat.rune_map_1 || rm['1'],
      seat.rune_map_2 || rm['2'],
      seat.rune_map_3 || rm['3'],
    ];
    subs.forEach((id, s) => {
      const url = eccRuneUrl(id);
      if (url) ref.subRunes[s].src = url;
      else     ref.subRunes[s].removeAttribute('src');
    });
  }
}
registerPollHandler(eccUpdate);

async function eccAnimateIn() {
  eccShouldShow = true;
  clearTimeout(eccOutTimer);

  await eccFetchLayout();
  if (!eccShouldShow) return; /* hidden again while we were fetching layout */

  const clip    = document.getElementById('emblem-check-clip');
  const overlay = document.getElementById('emblem-check-overlay');
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('ecc-in');
  }));

  if (lastData) eccUpdate(lastData);
}

function eccAnimateOut() {
  eccShouldShow = false;
  const clip    = document.getElementById('emblem-check-clip');
  const overlay = document.getElementById('emblem-check-overlay');
  overlay.classList.remove('ecc-in');
  clearTimeout(eccOutTimer);
  eccOutTimer = setTimeout(() => {
    clip.style.display = 'none';
  }, 350);
  /* Resume any kill events that queued up while this panel was blocking
     them (see killEventsBlocked() in overlay-killevents.js). */
  playNextKillEvent();
}
