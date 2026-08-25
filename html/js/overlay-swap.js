/* ── Quick swap "eventer" overlay ── */
const SWAP_OLD_LEFT = 31;
const SWAP_NEW_LEFT = 79; /* phase 1 position; slides to centered (55) in phase 2 */

function buildSwapOverlay(i) {
  const side = i <= 5 ? 'home' : 'away';
  const pos  = i <= 5 ? i - 1 : i - 6;

  const clip = document.createElement('div');
  clip.className = side === 'away' ? 'evt-clip away' : 'evt-clip';
  clip.id = `swap-evt-${i}`;
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
  label.textContent = 'QUICK SWAP';

  const oldBox = document.createElement('div');
  oldBox.className = 'evt-item-box swap-old';
  oldBox.style.left = `${SWAP_OLD_LEFT}px`;
  const oldIcon = document.createElement('img');
  oldIcon.className = 'evt-item-icon dimmed'; /* the item being replaced — 20% darker */
  oldIcon.alt = '';
  oldBox.appendChild(oldIcon);

  const newBox = document.createElement('div');
  newBox.className = 'evt-item-box swap-new';
  newBox.style.left = `${SWAP_NEW_LEFT}px`;
  const newIcon = document.createElement('img');
  newIcon.className = 'evt-item-icon';
  newIcon.alt = '';
  const sheen = document.createElement('div');
  sheen.className = 'evt-sheen';
  newBox.appendChild(newIcon);
  newBox.appendChild(sheen);

  const arrowColor = side === 'home' ? '#005bff' : '#e80b00';
  const swapIcon = document.createElement('div');
  swapIcon.className = 'evt-swap-icon';
  swapIcon.innerHTML = `
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <path d="M 6.4 13.7 A 15 15 0 0 1 32.3 11.4 L 31.6 16.9 L 26.6 15.4 A 8 8 0 0 0 12.8 16.6 Z" fill="${arrowColor}"/>
      <path d="M 33.6 26.3 A 15 15 0 0 1 7.7 28.6 L 8.4 23.1 L 13.5 24.6 A 8 8 0 0 0 27.3 23.4 Z" fill="${arrowColor}"/>
    </svg>`;

  card.appendChild(bg);
  card.appendChild(label);
  card.appendChild(oldBox);
  card.appendChild(newBox);
  card.appendChild(swapIcon);
  clip.appendChild(card);
  document.getElementById('scene').insertBefore(clip, document.getElementById('player-ui-overlay'));

  swapRefs[i] = { clip, oldBox, oldIcon, newBox, newIcon, sheen, swapIcon };
}

function resetSwap(i) {
  const { clip, oldBox, newBox, sheen, swapIcon } = swapRefs[i];
  clip.classList.remove('evt-in');
  oldBox.classList.remove('swap-out');
  newBox.classList.remove('swap-center');
  sheen.classList.remove('sweep');
  swapIcon.classList.remove('swap-out');
}

function triggerSwap(i, soldId, boughtId) {
  if (isPlayingSwap[i]) return;
  isPlayingSwap[i] = true;
  const btn = document.querySelector(`.swap-debug-btn[data-player="${i}"]`);
  if (btn) btn.disabled = true;
  const { clip, oldBox, oldIcon, newBox, newIcon, sheen, swapIcon } = swapRefs[i];

  let outerGuard;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(outerGuard);
    resetSwap(i);
    clip.style.display = 'none';
    isPlayingSwap[i]    = false;
    if (btn) btn.disabled = false;
    playNextQueued(i);
  };
  outerGuard = setTimeout(cleanup, 4000);

  oldIcon.src = soldId   ? `Items/${soldId}.png`   : '';
  newIcon.src = boughtId ? `Items/${boughtId}.png` : '';
  resetSwap(i);
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clip.classList.add('evt-in');
  }));

  /* phase 2 (was 1100ms into the hold, shortened by 650ms): sold item
     swaps out, bought item recenters, swap icon clears out of its way */
  setTimeout(() => {
    oldBox.classList.add('swap-out');
    newBox.classList.add('swap-center');
    swapIcon.classList.add('swap-out');
  }, 450);

  setTimeout(() => { sheen.classList.add('sweep'); }, 850);

  setTimeout(() => {
    clip.classList.remove('evt-in');
    setTimeout(cleanup, 350);
  }, 2250);
}
