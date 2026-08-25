/* ── [FEATURE: emblem-check] ──────────────────────────────────────
   Coordinates below are measured directly off
   assets/ingame/emblemback.png (1920×286) — see the CSS block in
   mploverlay_v7.css for the full measurement notes.

   Slot 1-5 role resolution (seat_N isn't reliably lane-ordered) is
   handled by the shared getPlayerByRole() in overlay-core.js. */
const ECC_STEP         = 160.5;
const ECC_HOME_FIRST_X = 27;
const ECC_AWAY_FIRST_X = 1749;
const ECC_NAME_MAX_W   = 105;

let eccShouldShow = false;
let eccOutTimer   = null;
const eccRefs     = {};

function eccFitName(el) {
  el.style.fontSize = '13px';
  if (el.scrollWidth <= ECC_NAME_MAX_W) return;
  let lo = 8, hi = 13;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= ECC_NAME_MAX_W) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}

function eccBuildCard(i) {
  const side    = i <= 5 ? 'home' : 'away';
  const slotIdx = i <= 5 ? i : i - 5;
  const left    = side === 'home'
    ? ECC_HOME_FIRST_X + (slotIdx - 1) * ECC_STEP
    : ECC_AWAY_FIRST_X - (slotIdx - 1) * ECC_STEP;

  const portrait = document.createElement('img');
  portrait.className = 'ecc-portrait';
  portrait.style.left = left + 'px';
  portrait.style.top  = '29px';
  portrait.alt = '';
  portrait.onerror = () => { portrait.onerror = null; portrait.removeAttribute('src'); };

  const roleIcon = document.createElement('img');
  roleIcon.className = 'ecc-role-icon';
  /* Sits near the card's own inner edge in the banner row — home
     close to the portrait's left edge (left+6), away mirrored,
     close to the portrait's right edge (left+127). */
  roleIcon.style.left = (side === 'home' ? left + 6 : left + 127) + 'px';
  roleIcon.style.top  = '118px';
  roleIcon.alt = '';
  roleIcon.src = ROLE_ICONS[slotIdx];

  const nameOuter = document.createElement('div');
  nameOuter.className = 'ecc-name ' + (side === 'home' ? 'ecc-name-home' : 'ecc-name-away');
  nameOuter.style.left = (side === 'home' ? left + 33 : left) + 'px';
  nameOuter.style.top  = '118px';
  const nameInner = document.createElement('span');
  nameOuter.appendChild(nameInner);

  const mainRune = document.createElement('img');
  mainRune.className = 'ecc-mainrune';
  mainRune.style.left = (left + 50) + 'px';
  mainRune.style.top  = '160px';
  mainRune.alt = '';
  mainRune.onerror = () => { mainRune.onerror = null; mainRune.removeAttribute('src'); };

  const SUB_X = [8, 55, 102];
  const subRunes = SUB_X.map(x => {
    const sub = document.createElement('img');
    sub.className = 'ecc-subrune';
    sub.style.left = (left + x) + 'px';
    sub.style.top  = '223px';
    sub.alt = '';
    sub.onerror = () => { sub.onerror = null; sub.removeAttribute('src'); };
    return sub;
  });

  eccRefs[i] = { portrait, nameInner, mainRune, subRunes };
  return [portrait, roleIcon, nameOuter, mainRune, ...subRunes];
}

function eccBuildPanel() {
  const overlay = document.getElementById('emblem-check-overlay');
  if (!overlay) return;

  const bg = document.createElement('img');
  bg.className = 'ecc-bg';
  bg.src = 'assets/ingame/emblemback.png';
  bg.alt = '';
  overlay.appendChild(bg);

  const middle = document.createElement('img');
  middle.className = 'ecc-middle';
  middle.src = 'assets/ingame/emblemmiddle.png';
  middle.alt = '';
  overlay.appendChild(middle);
  eccRefs.middle = middle;

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

    if (seat.heroid) ref.portrait.src = `posthero/${seat.heroid}_POST_HERO.png`;
    else              ref.portrait.removeAttribute('src');

    ref.nameInner.textContent = (seat.name || '').toUpperCase();
    eccFitName(ref.nameInner);

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

function eccAnimateIn() {
  eccShouldShow = true;
  clearTimeout(eccOutTimer);
  const clip    = document.getElementById('emblem-check-clip');
  const overlay = document.getElementById('emblem-check-overlay');
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('ecc-in');
  }));

  if (lastData) eccUpdate(lastData);

  setTimeout(() => {
    if (!eccShouldShow) return;
    eccRefs.middle.classList.remove('ecc-bounce');
    void eccRefs.middle.offsetWidth;
    eccRefs.middle.classList.add('ecc-bounce');
  }, 350);
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
