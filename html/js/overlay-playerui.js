/* ── [FEATURE: player-ui] ─────────────────────────────────────────
   Coordinates below are measured directly off
   assets/ingame/ui/uiblue.png / uired.png (180×89 each) — see the
   CSS block in mploverlay_v7.css for the full measurement notes.
   5 cards per side, stacked downward with no gap. */
const PUI_TOPS       = [348, 437, 526, 615, 704];
const PUI_NAME_MAX_W = 122;

const puiRefs = {};

function puiFormatGold(g) {
  return ((g || 0) / 1000).toFixed(1) + 'K';
}

function puiFitName(el) {
  el.style.fontSize = '15px';
  if (el.scrollWidth <= PUI_NAME_MAX_W) return;
  let lo = 8, hi = 15;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= PUI_NAME_MAX_W) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}

function puiBuildCard(i) {
  const side    = i <= 5 ? 'home' : 'away';
  const seatIdx = i <= 5 ? i - 1 : i - 6;
  const top     = PUI_TOPS[seatIdx];

  const card = document.createElement('div');
  card.className = 'pui-card pui-' + side;
  card.style.top = top + 'px';

  const emblem = document.createElement('img');
  emblem.className = 'pui-emblem';
  emblem.alt = '';
  card.appendChild(emblem);

  const ulti = document.createElement('div');
  ulti.className = 'pui-ulti';
  const ultiLocked = document.createElement('div');
  ultiLocked.className = 'pui-ulti-locked';
  const ultiPie = document.createElement('div');
  ultiPie.className = 'pui-ulti-pie';
  const ultiReady = document.createElement('div');
  ultiReady.className = 'pui-ulti-ready';
  ulti.appendChild(ultiLocked);
  ulti.appendChild(ultiPie);
  ulti.appendChild(ultiReady);
  card.appendChild(ulti);

  const bg = document.createElement('img');
  bg.className = 'pui-bg';
  bg.src = side === 'home' ? 'assets/ingame/ui/uiblue.png' : 'assets/ingame/ui/uired.png';
  bg.alt = '';
  card.appendChild(bg);

  const level = document.createElement('div');
  level.className = 'pui-level';
  card.appendChild(level);

  const nameOuter = document.createElement('div');
  nameOuter.className = 'pui-name';
  const nameInner = document.createElement('span');
  nameOuter.appendChild(nameInner);
  card.appendChild(nameOuter);

  const kda = document.createElement('div');
  kda.className = 'pui-kda';
  card.appendChild(kda);

  const goldRow = document.createElement('div');
  goldRow.className = 'pui-gold';
  const goldIcon = document.createElement('img');
  goldIcon.className = 'pui-gold-icon';
  goldIcon.src = side === 'home' ? 'assets/ingame/ui/uigold.png' : 'assets/ingame/ui/uigoldred.png';
  goldIcon.alt = '';
  const goldText = document.createElement('span');
  goldRow.appendChild(goldIcon);
  goldRow.appendChild(goldText);
  card.appendChild(goldRow);

  puiRefs[i] = { level, nameInner, kda, goldText, emblem, ultiLocked, ultiPie, ultiReady };
  return card;
}

/* Ultimate cooldown max, per player index — captured the first time
   major_left_time is seen going from 0 (or unknown) to a nonzero value,
   or jumping to a higher value than the current max (covers a poll tick
   landing exactly on 0 getting missed). If the overlay starts up already
   mid-cooldown, with no 0-baseline ever observed, the FIRST nonzero
   reading we see is assumed to be the max per the same rule. */
const puiUltiState = {};

function puiUltiColor(i) {
  return i <= 5 ? '#1E64FF' : '#FF3232';
}

function puiUpdateUlti(i, ref, p) {
  const level = p.level || 0;
  const mlt   = p.major_left_time;
  const st    = puiUltiState[i] || (puiUltiState[i] = { prev: null, max: null });

  if (mlt != null) {
    if (mlt > 0 && (st.prev === 0 || st.prev == null || mlt > (st.max || 0))) {
      st.max = mlt;
    }
    st.prev = mlt;
  }

  const isLocked = level < 4;
  const isTiming = !isLocked && mlt > 0;
  const isReady  = !isLocked && !isTiming;

  ref.ultiLocked.classList.toggle('on', isLocked);
  ref.ultiPie.classList.toggle('on', isTiming);
  ref.ultiReady.classList.toggle('on', isReady);

  if (isTiming) {
    const max = st.max || mlt;
    const pct = max > 0 ? Math.min(1, Math.max(0, (max - mlt) / max)) : 0;
    const deg = pct * 360;
    ref.ultiPie.style.background =
      `conic-gradient(${puiUltiColor(i)} 0deg ${deg}deg, #4a4a4a ${deg}deg 360deg)`;
  }
}

function puiBuildPanel() {
  const overlay = document.getElementById('player-ui-overlay');
  if (!overlay) return;
  for (let i = 1; i <= 10; i++) overlay.appendChild(puiBuildCard(i));
}
puiBuildPanel();

/* ── Show/hide with animation — cards slide in from off-screen, home
   side from the left, away side from the right (reversed to hide).
   The overlay container itself is always rendered; only the per-card
   transform (driven by the .pui-hidden class on the parent, see
   mploverlay_v7.css) moves them on/off canvas. Base CSS state (no
   class) is SHOWN, so this defaults on with no flash before the fetch
   below resolves — .pui-hidden is only added once we're told to hide. */
let puiShouldShow = true;

function puiSetShown(shown) {
  puiShouldShow = shown;
  const overlay = document.getElementById('player-ui-overlay');
  if (overlay) overlay.classList.toggle('pui-hidden', !shown);
}

/* Called from overlay-debug.js's SSE 'playerui' handler. */
function puiHandleToggle(shown) {
  puiSetShown(shown);
  if (shown && lastData) puiUpdate(lastData);
}

/* Apply real server-side shown/hidden state on load, so a (re)loaded
   overlay restores instead of guessing (see checkOverlays.playerui). */
fetch('/overlay/check-overlays').then(r => r.json()).then(d => {
  puiSetShown(!(d && d.playerui === false));
}).catch(() => puiSetShown(true));

function puiUpdate(data) {
  if (!puiShouldShow) return;
  for (let i = 1; i <= 10; i++) {
    const r   = getPlayer(data, i);
    const ref = puiRefs[i];
    if (!r || !r.player || !ref) continue;
    const p = r.player;

    ref.level.textContent = p.level != null ? p.level : '';
    puiUpdateUlti(i, ref, p);

    ref.nameInner.textContent = (p.name || '').toUpperCase();
    puiFitName(ref.nameInner);

    ref.kda.textContent = `${p.kill_num || 0}/${p.dead_num || 0}/${p.assist_num || 0}`;
    ref.goldText.textContent = puiFormatGold(p.gold);

    const emblemUrl = eccRuneUrl(p.rune_map_3 || (p.rune_map || {})['3']);
    if (emblemUrl) ref.emblem.src = emblemUrl;
    else            ref.emblem.removeAttribute('src');
  }
}
registerPollHandler(puiUpdate);
