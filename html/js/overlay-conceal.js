/* ── [FEATURE: conceal-overlay] roaming-boot category "eventer" ──
   Fires once per camp (home = player 4, away = player 9 — the
   roamer's slot) when that camp's blessing_gold crosses 1000, i.e.
   the roam spell tier fully activates. Same evt-clip/evt-card shell
   and fip-time/evt-item-box layout as first-item-priority: label on
   top, time activated bottom-left, category icon bottom-right. */
const CONCEAL_SLOT = { left: 4, right: 9 }; /* which per-player evt slot each side borrows */

function buildConcealOverlay(side) {
  const i    = CONCEAL_SLOT[side];
  const home = side === 'left';
  const pos  = home ? i - 1 : i - 6;

  const clip = document.createElement('div');
  clip.className = home ? 'evt-clip' : 'evt-clip away';
  clip.id = `conceal-evt-${side}`;
  clip.style.left = (home ? EVT_LEFT_HOME : EVT_LEFT_AWAY) + 'px';
  clip.style.top  = EVT_TOPS[pos] + 'px';

  const card = document.createElement('div');
  card.className = 'evt-card';

  const bg = document.createElement('img');
  bg.className = 'evt-bg';
  bg.src = 'assets/ingame/eventerback.png';
  bg.alt = '';

  const label = document.createElement('span');
  label.className = 'evt-label';
  label.textContent = 'CONCEAL ACTIVATED';

  const time = document.createElement('div');
  time.className = 'fip-time';
  const timeNum = document.createElement('span');
  timeNum.className = 'fip-time-num';
  timeNum.textContent = '--:--';
  const timeUnit = document.createElement('span');
  timeUnit.className = 'fip-time-unit';
  timeUnit.textContent = 'MIN';
  time.appendChild(timeNum);
  time.appendChild(timeUnit);

  const itemBox = document.createElement('div');
  itemBox.className = 'evt-item-box';
  itemBox.style.left = '109px';
  const itemIcon = document.createElement('img');
  itemIcon.className = 'evt-item-icon';
  itemIcon.alt = '';
  const sheen = document.createElement('div');
  sheen.className = 'evt-sheen';
  itemBox.appendChild(itemIcon);
  itemBox.appendChild(sheen);

  card.appendChild(bg);
  card.appendChild(label);
  card.appendChild(time);
  card.appendChild(itemBox);
  clip.appendChild(card);
  document.getElementById('scene').insertBefore(clip, document.getElementById('player-ui-overlay'));

  concealRefs[side] = { clip, label, timeNum, itemIcon, sheen };
}

['left', 'right'].forEach(buildConcealOverlay);

const ROAMING_BOOT_CATS = {
  conceal:   new Set(['1511','3511','3521','3531','3541','3551','3561','3571']),
  encourage: new Set(['1512','3512','3522','3532','3542','3552','3562','3572']),
  favor:     new Set(['1513','3513','3523','3533','3543','3553','3563','3573']),
  direhit:   new Set(['1514','3514','3524','3534','3544','3554','3564','3574']),
};
const CONCEAL_CAT_LABEL = { conceal: 'CONCEAL', encourage: 'ENCOURAGE', favor: 'FAVOR', direhit: 'DIRE HIT' };
const CONCEAL_CAT_IMG   = { conceal: 'assets/conceal.webp', encourage: 'assets/encourage.webp', favor: 'assets/favor.webp', direhit: 'assets/direhit.webp' };

function detectRoamingBootCat(itemId) {
  for (const [cat, ids] of Object.entries(ROAMING_BOOT_CATS)) {
    if (ids.has(String(itemId))) return cat;
  }
  return null;
}

function getCampRoamingCategory(camp) {
  const SEAT_KEYS = ['seat_1','seat_2','seat_3','seat_4','seat_5'];
  for (const key of SEAT_KEYS) {
    const seat = camp[key];
    if (!seat) continue;
    for (const item of (seat.equip_list || []).slice(0, 6)) {
      const cat = detectRoamingBootCat(item.value);
      if (cat) return cat;
    }
  }
  const rtMap = { conceal: 'conceal', encourage: 'encourage', favor: 'favor', direhit: 'direhit', 'dire hit': 'direhit' };
  for (const key of SEAT_KEYS) {
    const seat = camp[key];
    if (!seat || !seat.roaming_type) continue;
    const cat = rtMap[seat.roaming_type.toLowerCase()];
    if (cat) return cat;
  }
  return 'conceal';
}

function resetConceal(side) {
  const { clip, sheen } = concealRefs[side];
  clip.classList.remove('evt-in');
  sheen.classList.remove('sweep');
}

function triggerConceal(category, side, timeStr) {
  if (side === undefined) side = 'left';
  if (isPlayingConceal[side]) return;
  isPlayingConceal[side] = true;
  const btnId = side === 'right' ? 'conceal-trigger-btn-r' : 'conceal-trigger-btn';
  const btn   = document.getElementById(btnId);
  if (btn) btn.disabled = true;
  const { clip, label, timeNum, itemIcon, sheen } = concealRefs[side];

  let outerGuard;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(outerGuard);
    resetConceal(side);
    clip.style.display     = 'none';
    isPlayingConceal[side] = false;
    if (btn) btn.disabled = false;
    playNextQueued(side === 'left' ? 4 : 9);
  };
  outerGuard = setTimeout(cleanup, 3500);

  label.textContent   = `${CONCEAL_CAT_LABEL[category] || 'CONCEAL'} ACTIVATED`;
  timeNum.textContent = timeStr || '--:--';
  itemIcon.src         = CONCEAL_CAT_IMG[category] || '';
  resetConceal(side);
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clip.classList.add('evt-in');
  }));

  setTimeout(() => { sheen.classList.add('sweep'); }, 400);

  setTimeout(() => {
    clip.classList.remove('evt-in');
    setTimeout(cleanup, 350);
  }, 2400);
}

function buildConcealDebugButtons(playerIdx, side) {
  const triggerId = side === 'right' ? 'conceal-trigger-btn-r' : 'conceal-trigger-btn';
  const rowId     = side === 'right' ? 'conceal-cat-row-r'     : 'conceal-cat-row';

  document.getElementById(triggerId).addEventListener('click', async () => {
    let timeStr = '--:--';
    try {
      const data   = lastData || await fetchData();
      const campId = side === 'left' ? 1 : 2;
      const camp   = (data.camp_list || []).find(c => c.campid === campId);
      timeStr = formatTime(data.game_time || 0);
      if (camp) { triggerConceal(getCampRoamingCategory(camp), side, timeStr); return; }
    } catch(e) {}
    triggerConceal('conceal', side, timeStr);
  });

  const row = document.getElementById(rowId);
  ['conceal','encourage','favor','direhit'].forEach(cat => {
    const b = document.createElement('button');
    b.className = 'debug-btn'; b.textContent = CONCEAL_CAT_LABEL[cat];
    b.addEventListener('click', async () => {
      let timeStr = '--:--';
      try {
        const data = lastData || await fetchData();
        timeStr = formatTime(data.game_time || 0);
      } catch(e) {}
      triggerConceal(cat, side, timeStr);
    });
    row.appendChild(b);
  });
}
