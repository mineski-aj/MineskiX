/* ── Level 15 "eventer" overlay ── */
function buildLvl15Overlay(i) {
  const side = i <= 5 ? 'home' : 'away';
  const pos  = i <= 5 ? i - 1 : i - 6;

  const clip = document.createElement('div');
  clip.className = side === 'away' ? 'evt-clip away' : 'evt-clip';
  clip.id = `lvl15-evt-${i}`;
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
  label.textContent = 'LEVEL 15 ACHIEVED IN';

  const value = document.createElement('span');
  value.className = 'evt-value';
  value.textContent = '--:--';

  card.appendChild(bg);
  card.appendChild(label);
  card.appendChild(value);
  clip.appendChild(card);
  document.getElementById('scene').insertBefore(clip, document.getElementById('player-ui-overlay'));

  lvl15Refs[i] = { clip, card, value };
}

function resetLvl15(i) {
  lvl15Refs[i].clip.classList.remove('evt-in');
}

function triggerLvl15(i, timeStr) {
  if (isPlayingLvl[i]) return;
  isPlayingLvl[i] = true;
  const btn = document.querySelector(`.debug-btn[data-player="${i}"]`);
  if (btn) btn.disabled = true;
  const { clip, value } = lvl15Refs[i];

  let outerGuard;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(outerGuard);
    resetLvl15(i);
    clip.style.display = 'none';
    isPlayingLvl[i]     = false;
    if (btn) btn.disabled = false;
    playNextQueued(i);
  };
  outerGuard = setTimeout(cleanup, 3500);

  value.textContent = `${timeStr || '--:--'} MIN`;
  resetLvl15(i);
  clip.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clip.classList.add('evt-in');
  }));

  setTimeout(() => {
    clip.classList.remove('evt-in');
    setTimeout(cleanup, 350);
  }, 2400);
}
