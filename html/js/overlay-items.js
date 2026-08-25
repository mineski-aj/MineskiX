/* ── First item priority "eventer" overlay ── */
function buildItemOverlay(i) {
  const side = i <= 5 ? 'home' : 'away';
  const pos  = i <= 5 ? i - 1 : i - 6;

  const clip = document.createElement('div');
  clip.className = side === 'away' ? 'evt-clip away' : 'evt-clip';
  clip.id = `fip-evt-${i}`;
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
  label.textContent = 'FIRST ITEM PRIORITY';

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

  itemRefs[i] = { clip, timeNum, itemIcon, sheen };
}

function resetItem(i) {
  const { clip, sheen } = itemRefs[i];
  clip.classList.remove('evt-in');
  sheen.classList.remove('sweep');
}

function triggerItem(i, itemId, timeStr) {
  if (isPlayingItem[i]) return;
  isPlayingItem[i] = true;
  const btn = document.querySelector(`.item-debug-btn[data-player="${i}"]`);
  if (btn) btn.disabled = true;
  const { clip, timeNum, itemIcon, sheen } = itemRefs[i];

  let outerGuard;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(outerGuard);
    resetItem(i);
    clip.style.display = 'none';
    isPlayingItem[i]    = false;
    if (btn) btn.disabled = false;
    playNextQueued(i);
  };
  outerGuard = setTimeout(cleanup, 3500);

  timeNum.textContent = timeStr || '--:--';
  itemIcon.src = itemId ? `Items/${itemId}.png` : '';
  resetItem(i);
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clip.classList.add('evt-in');
  }));

  setTimeout(() => { sheen.classList.add('sweep'); }, 400); /* right after the slide-in settles */

  setTimeout(() => {
    clip.classList.remove('evt-in');
    setTimeout(cleanup, 350);
  }, 2400);
}
