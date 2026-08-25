/* ── Trinity (core items / marksman trinity) "eventer" overlay ── */
const TRINITY_ITEM_LEFTS = [7, 55, 103]; /* measured off eventtrinityguide.png */

function buildTrinityOverlay(i) {
  const side = i <= 5 ? 'home' : 'away';
  const pos  = i <= 5 ? i - 1 : i - 6;

  const clip = document.createElement('div');
  clip.className = side === 'away' ? 'evt-clip away' : 'evt-clip';
  clip.id = `trinity-evt-${i}`;
  clip.style.left = (side === 'home' ? EVT_LEFT_HOME : EVT_LEFT_AWAY) + 'px';
  clip.style.top  = EVT_TOPS[pos] + 'px';

  const card = document.createElement('div');
  card.className = 'evt-card';

  const bg = document.createElement('img');
  bg.className = 'evt-bg';
  bg.src = 'assets/ingame/eventerback.png';
  bg.alt = '';

  const label = document.createElement('span');
  label.className = 'evt-label';
  label.textContent = 'CORE ITEMS ACHIEVED';

  card.appendChild(bg);
  card.appendChild(label);

  const items = TRINITY_ITEM_LEFTS.map(left => {
    const itemBox = document.createElement('div');
    itemBox.className = 'evt-item-box';
    itemBox.style.left = `${left}px`;
    const itemIcon = document.createElement('img');
    itemIcon.className = 'evt-item-icon';
    itemIcon.alt = '';
    const sheen = document.createElement('div');
    sheen.className = 'evt-sheen';
    itemBox.appendChild(itemIcon);
    itemBox.appendChild(sheen);
    card.appendChild(itemBox);
    return { itemIcon, sheen };
  });

  clip.appendChild(card);
  document.getElementById('scene').insertBefore(clip, document.getElementById('player-ui-overlay'));

  trinityRefs[i] = { clip, label, items };
}

function resetTrinity(i) {
  const { clip, items } = trinityRefs[i];
  clip.classList.remove('evt-in');
  items.forEach(({ sheen }) => sheen.classList.remove('sweep'));
}

function triggerTrinity(i, t3ItemIds, label) {
  if (isPlayingTrinity[i]) return;
  isPlayingTrinity[i] = true;
  const btn = document.querySelector(`.trinity-debug-btn[data-player="${i}"]`);
  if (btn) btn.disabled = true;
  const { clip, label: labelEl, items } = trinityRefs[i];

  let outerGuard;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(outerGuard);
    resetTrinity(i);
    clip.style.display  = 'none';
    isPlayingTrinity[i]  = false;
    if (btn) btn.disabled = false;
    playNextQueued(i);
  };
  outerGuard = setTimeout(cleanup, 3500);

  const isMarksman = label === 'MARKSMAN TRINITY';
  labelEl.textContent = label || 'CORE ITEMS ACHIEVED';
  labelEl.classList.toggle('big', isMarksman);
  items.forEach(({ itemIcon }, idx) => {
    itemIcon.src = t3ItemIds[idx] ? `Items/${t3ItemIds[idx]}.png` : '';
  });
  resetTrinity(i);
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clip.classList.add('evt-in');
  }));

  items.forEach(({ sheen }, idx) => {
    setTimeout(() => { sheen.classList.add('sweep'); }, 400 + idx * 120);
  });

  setTimeout(() => {
    clip.classList.remove('evt-in');
    setTimeout(cleanup, 350);
  }, 2400);
}
