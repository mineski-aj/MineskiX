/* ── [FEATURE: side-check family — shared core] ────────────────────
   Factory shared by every "side *check" ranking panel (exp, damage
   taken, and future ones) so each one is just a config object
   instead of a re-copied ~150-line file. See the .sidecheck-* CSS
   block in mploverlay_v7.css for the full layout/measurement notes.

   createSideCheck({
     clipId, overlayId,      // ids of the two container divs already in the HTML
     headerText,             // Anton header title — omit to skip the header entirely
                             // (e.g. when bgSrc's own art already bakes in a title)
     bgSrc,                  // panel background image — defaults to sidestatback.png
     statField,              // seat property this panel ranks/fills by, e.g. 'exp'
     formatStat(seat),        // returns the display string for the stat text, e.g. 'LVL 15'
   })
   returns { animateIn, animateOut, update } — update is also
   auto-registered with registerPollHandler.

   All ten rows are ranked as ONE list across all 10 players (not
   per-team) — home rows stay blue, away rows stay red, but any row
   can land in any of the 10 slots. Each row is a persistent element
   keyed by (side, role), since role is stable for a seat all game
   while rank isn't — when a player's rank changes, their row slides
   (FLIP-animated) to its new slot instead of the panel rebuilding. */
const SIDECHECK_BAR_TOPS = [84, 134, 185, 235, 285, 336, 386, 436, 487, 537];
const SIDECHECK_PORTRAIT_OFFSET = 24; /* bar top → row top */
const SIDECHECK_NAME_MAX_W = 103;
const SIDECHECK_MOVE_MS = 500;

/* Shared "100.3K" (1 decimal) formatter — used by any side-check
   panel tracking a large raw stat (damage dealt, damage taken, etc). */
function sidecheckFormatK(v) {
  return ((v || 0) / 1000).toFixed(1) + 'K';
}

/* User-editable ceiling for the name shrink-to-fit search below (dashboard
   Edit tab: Side Events · mploverlay_v7 → Player Name → Player Name Size).
   A blanket `!important` CSS override (the normal mechanism every other
   editable property uses — see loadSbOverrides in overlay-scoreboard.js)
   would always beat this function's own inline font-size assignment and
   permanently break the shrink-on-overflow protection for long names — so
   this one property instead has dashboard.html's applyToEditIframe() call
   sidecheckSetNameFontCeiling() below directly (same cross-frame-call
   pattern as config.showFn), which updates the ceiling AND immediately
   re-fits every name on screen, so dragging the value still live-previews
   normally, just through the fit algorithm instead of around it. Real
   page loads (not the edit iframe) get the saved value from
   loadSidecheckNameFontSize()'s fetch below instead, since there's no
   dashboard connection to call into. */
let SIDECHECK_NAME_FONT_CEILING = 10;
(function loadSidecheckNameFontSize() {
  fetch('/api/overlay-styles?file=mploverlay_v7')
    .then(r => r.json())
    .then(styles => {
      const v = styles && styles['.sidecheck-name'] && styles['.sidecheck-name'].fontSize;
      const n = v && parseFloat(v);
      if (n) SIDECHECK_NAME_FONT_CEILING = n;
    })
    .catch(() => {});
})();

function sidecheckFitName(el) {
  const hi0 = SIDECHECK_NAME_FONT_CEILING;
  const lo0 = Math.max(5, hi0 * 0.7);
  el.style.fontSize = hi0 + 'px';
  if (el.scrollWidth <= SIDECHECK_NAME_MAX_W) return;
  let lo = lo0, hi = hi0;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= SIDECHECK_NAME_MAX_W) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}

/* Called from dashboard.html's applyToEditIframe() while dragging/typing
   the Player Name Size field — updates the ceiling every sidecheckFitName
   call uses, then immediately re-fits every name currently on screen
   (across all four side-check panels, since they share this one ceiling)
   so the change is visible right away instead of only after Save. */
window.sidecheckSetNameFontCeiling = function(v) {
  const n = parseFloat(v);
  if (!n) return;
  SIDECHECK_NAME_FONT_CEILING = n;
  document.querySelectorAll('.sidecheck-name-inner').forEach(sidecheckFitName);
};

function createSideCheck(opts) {
  let shouldShow = false;
  let outTimer   = null;
  const refs = { home: {}, away: {} }; /* keyed by slotIdx 1-5 */

  function buildRow(side, slotIdx) {
    /* Arbitrary starting slot (home 0-4, away 5-9) — the first real
       update re-sorts everything by the tracked stat anyway. */
    const initialRank = (side === 'home' ? 0 : 5) + (slotIdx - 1);
    const initialTop = SIDECHECK_BAR_TOPS[initialRank] - SIDECHECK_PORTRAIT_OFFSET;

    const row = document.createElement('div');
    row.className = 'sidecheck-row';
    row.style.top = initialTop + 'px';

    const portrait = document.createElement('img');
    portrait.className = 'sidecheck-portrait';
    portrait.alt = '';
    portrait.onerror = () => { portrait.onerror = null; portrait.removeAttribute('src'); };
    row.appendChild(portrait);

    const roleIcon = document.createElement('img');
    roleIcon.className = 'sidecheck-role-icon';
    roleIcon.alt = '';
    roleIcon.src = ROLE_ICONS[slotIdx];
    row.appendChild(roleIcon);

    const nameOuter = document.createElement('div');
    nameOuter.className = 'sidecheck-name';
    const nameInner = document.createElement('span');
    nameInner.className = 'sidecheck-name-inner';
    nameOuter.appendChild(nameInner);
    row.appendChild(nameOuter);

    const barTrack = document.createElement('div');
    barTrack.className = 'sidecheck-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'sidecheck-bar-fill ' + (side === 'home' ? 'sidecheck-bar-home' : 'sidecheck-bar-away');
    const statText = document.createElement('div');
    statText.className = 'sidecheck-stat-text';
    barTrack.appendChild(barFill);
    barTrack.appendChild(statText);
    row.appendChild(barTrack);

    refs[side][slotIdx] = { row, portrait, nameInner, barFill, statText, currentTop: initialTop };
    return row;
  }

  function buildPanel() {
    const overlay = document.getElementById(opts.overlayId);
    if (!overlay) return;

    const bg = document.createElement('img');
    bg.className = 'sidecheck-bg';
    bg.src = opts.bgSrc || 'assets/ingame/sidestatback.png';
    bg.alt = '';
    overlay.appendChild(bg);

    if (opts.headerText) {
      const header = document.createElement('div');
      header.className = 'sidecheck-header';
      header.textContent = opts.headerText;
      overlay.appendChild(header);
    }

    for (let slotIdx = 1; slotIdx <= 5; slotIdx++) {
      overlay.appendChild(buildRow('home', slotIdx));
      overlay.appendChild(buildRow('away', slotIdx));
    }
  }
  buildPanel();

  function moveRowTo(ref, newTop, instant) {
    const row = ref.row;
    if (ref.currentTop === newTop) return;
    const oldTop = ref.currentTop;
    ref.currentTop = newTop;
    if (instant) {
      /* Reveal case — snap straight to the correct slot with no
         transition, so the panel is already fully arranged the
         instant it becomes visible instead of visibly reshuffling
         as it slides in. */
      row.style.transition = 'none';
      row.style.transform = 'none';
      row.style.top = newTop + 'px';
      return;
    }
    row.style.transition = 'none';
    row.style.top = newTop + 'px';
    row.style.transform = `translateY(${oldTop - newTop}px)`;
    void row.offsetHeight; /* force reflow before re-enabling the transition */
    requestAnimationFrame(() => {
      row.style.transition = `transform ${SIDECHECK_MOVE_MS}ms ease`;
      row.style.transform = 'translateY(0)';
    });
  }

  function update(data, instant) {
    if (!shouldShow) return;

    const entries = [];
    for (let slotIdx = 1; slotIdx <= 5; slotIdx++) {
      entries.push({ side: 'home', slotIdx, seat: getPlayerByRole(data, 1, slotIdx) });
      entries.push({ side: 'away', slotIdx, seat: getPlayerByRole(data, 2, slotIdx) });
    }

    const statOf = e => (e.seat && e.seat[opts.statField]) || 0;
    const maxVal = entries.reduce((m, e) => Math.max(m, statOf(e)), 0);

    entries.sort((a, b) => {
      const d = statOf(b) - statOf(a);
      if (d !== 0) return d;
      if (a.side !== b.side) return a.side === 'home' ? -1 : 1;
      return a.slotIdx - b.slotIdx;
    });

    entries.forEach((entry, rank) => {
      const ref  = refs[entry.side][entry.slotIdx];
      const seat = entry.seat;
      if (!ref) return;

      moveRowTo(ref, SIDECHECK_BAR_TOPS[rank] - SIDECHECK_PORTRAIT_OFFSET, instant);

      if (seat && seat.heroid) ref.portrait.src = `hero/HERO_${seat.heroid}_KOTAK.png`;
      ref.nameInner.textContent = ((seat && seat.name) || '').toUpperCase();
      sidecheckFitName(ref.nameInner);
      ref.statText.textContent = opts.formatStat(seat);

      const val = statOf(entry);
      const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
      ref.barFill.style.width = pct + '%';
    });
  }
  registerPollHandler(update);

  function animateIn() {
    shouldShow = true;
    clearTimeout(outTimer);
    const clip    = document.getElementById(opts.clipId);
    const overlay = document.getElementById(opts.overlayId);
    /* Arrange everything instantly BEFORE the panel is shown/slides
       in, so there's no visible reshuffle once it's on screen. */
    if (lastData) update(lastData, true);
    clip.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('sidecheck-in');
    }));
  }

  function animateOut() {
    shouldShow = false;
    const clip    = document.getElementById(opts.clipId);
    const overlay = document.getElementById(opts.overlayId);
    overlay.classList.remove('sidecheck-in');
    clearTimeout(outTimer);
    outTimer = setTimeout(() => {
      clip.style.display = 'none';
    }, 350);
  }

  return { animateIn, animateOut, update };
}
