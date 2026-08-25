/* ── [FEATURE: fight-recap] ── */
var allFights  = [];
var debugIdx   = -1;
var feedData   = null;
var lastActionTs = 0;
var fightPollTimer = null;

var fightOverlay   = document.getElementById('fight-overlay');
var _fightOutTimer = null;
var _fightShouldShow = false;
var _pendingGold   = null;

function _fightCancelHide() {
  if (_fightOutTimer) { clearTimeout(_fightOutTimer); _fightOutTimer = null; }
}

/* When tab comes back to foreground, enforce show state */
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState !== 'visible') return;
  if (_fightShouldShow) {
    _fightCancelHide();
    fightOverlay.classList.remove('out');
    fightOverlay.style.opacity    = '1';
    fightOverlay.style.visibility = '';
    fightOverlay.style.display    = 'flex';
    fightOverlay.classList.add('in');
  }
});

function countUp(el, target, duration) {
  var start = performance.now();
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  (function frame(now) {
    var t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(ease(t) * target).toLocaleString();
    if (t < 1) requestAnimationFrame(frame);
  })(performance.now());
}

function triggerDeathAnimations() {
  if (!_fightShouldShow) return;
  fightOverlay.querySelectorAll('.player-row.dead .hero-wrap').forEach(function(wrap) {
    wrap.classList.remove('slash-active');
    void wrap.offsetWidth;
    wrap.classList.add('slash-active');
  });
}

function fightAnimateIn() {
  _fightShouldShow = true;
  _fightCancelHide();
  fightOverlay.style.display    = 'flex';
  fightOverlay.classList.remove('out');
  fightOverlay.style.opacity    = '';
  fightOverlay.style.visibility = '';
  void fightOverlay.offsetWidth;
  fightOverlay.classList.add('in');

  /* gold count starts with overlay */
  if (_pendingGold) {
    var c1El = document.getElementById('c1-gold');
    var c2El = document.getElementById('c2-gold');
    c1El.classList.remove('gold-hidden');
    c2El.classList.remove('gold-hidden');
    countUp(c1El, _pendingGold.c1, 900);
    countUp(c2El, _pendingGold.c2, 900);

    /* after count: labels + winner flash */
    var pg = _pendingGold;
    setTimeout(function() {
      if (!_fightShouldShow) return;
      fightOverlay.querySelectorAll('.gold-label').forEach(function(l) {
        l.classList.remove('gold-hidden');
      });
      if (pg.c1 !== pg.c2) {
        var winner = pg.c1 > pg.c2 ? 'c1' : 'c2';
        var winBlock = fightOverlay.querySelector('.gold-block.' + winner);
        if (winBlock) winBlock.classList.add('flash-winner');
      }
    }, 920);
  }

  /* death slash + shake after rows have faded in */
  setTimeout(triggerDeathAnimations, 820);
}

function fightAnimateOut() {
  _fightShouldShow = false;
  _fightCancelHide();
  fightOverlay.classList.remove('in');
  fightOverlay.classList.add('out');
  function doHide() {
    _fightOutTimer = null;
    fightOverlay.classList.remove('out');
    fightOverlay.style.opacity    = '0';
    fightOverlay.style.visibility = 'hidden';
    fightOverlay.style.display    = 'none';
  }
  if (fightOverlay.style.display === 'none') { doHide(); return; }
  /* No animationend — child animations bubble and cause false triggers.
     Just wait slightly longer than the 0.35s out animation. */
  _fightOutTimer = setTimeout(function() {
    if (_fightShouldShow) return; /* show fired while waiting — don't hide */
    doHide();
  }, 450);
}

function fmtDmg(n) {
  if (!n) return '0';
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function fmtDur(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ccBadge(control_s) {
  if (!control_s || control_s < 3) return '';
  const svg = `<svg width="18" height="18" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#7c3aed"/>
    <circle cx="10" cy="10" r="5.5" fill="none" stroke="#fff" stroke-width="1.3"/>
    <line x1="10" y1="10" x2="10" y2="6.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="10" y1="10" x2="12.8" y2="10" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
  return `<div class="cc-badge">${svg}<span class="cc-count">${Math.round(control_s)}s CC</span></div>`;
}

function killBadge(kills) {
  if (!kills || kills <= 0) return '';
  const svg = `<svg width="18" height="18" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#000"/>
    <g transform="rotate(45 10 10)" fill="#fff">
      <polygon points="10,2 11,6 10.5,12 9.5,12 9,6"/>
      <rect x="6.5" y="12" width="7" height="1.5" rx="0.5"/>
      <rect x="9.25" y="13.5" width="1.5" height="3" rx="0.5"/>
      <rect x="8.5" y="16.5" width="3" height="1.5" rx="0.75"/>
    </g>
  </svg>`;
  const count = kills > 1 ? `<span class="kill-count">x${kills}</span>` : '';
  return `<div class="kill-badge">${svg}${count}</div>`;
}

var _fightMc = document.createElement('canvas').getContext('2d');
var FIGHT_NAME_MAX_W = 76;

function calcNameSize(name) {
  _fightMc.font = `600 15px 'General Sans', system-ui, sans-serif`;
  var w = _fightMc.measureText(name).width;
  if (w <= FIGHT_NAME_MAX_W) return 15;
  return Math.max(7, Math.floor(15 * FIGHT_NAME_MAX_W / w));
}

function fightHeroImgUrl(id) {
  if (!id) return null;
  return `hero/HERO_${id}_KOTAK.png`;
}

function renderFight(fight, feed) {
  document.getElementById('fight-time').textContent = fight.start_time_fmt;
  document.getElementById('fight-dur').textContent  = fmtDur(fight.duration_s) + ' Fight Duration';

  var c1 = fight.players.filter(p => p.camp === 1).sort((a, b) => a.seat - b.seat);
  var c2 = fight.players.filter(p => p.camp === 2).sort((a, b) => a.seat - b.seat);
  var maxDmg = Math.max(1, ...fight.players.map(p => p.dmg_dealt));

  function rowHTML(p) {
    var bar      = Math.round((p.dmg_dealt / maxDmg) * 100);
    var imgUrl   = fightHeroImgUrl(p.hero_id);
    var inner    = imgUrl
      ? `<img class="hero-img" src="${imgUrl}" alt="${p.hero || ''}">`
      : `<div class="hero-placeholder">${(p.hero || '?').charAt(0)}</div>`;
    var heroEl   = `<div class="hero-wrap">${inner}</div>`;
    var name     = p.name || '—';
    var fontSize = calcNameSize(name);
    return `<div class="player-row${p.survived ? '' : ' dead'}">
      ${heroEl}
      <div class="p-name" style="font-size:${fontSize}px">${name}</div>
      <div class="badges">${ccBadge(p.control_s)}${killBadge(p.kills)}</div>
      <div class="dmg-area">
        <div class="dmg-bar-bg"><div class="dmg-bar-fill" style="width:${bar}%"></div></div>
        <div class="dmg-num">${fmtDmg(p.dmg_dealt)}</div>
        <div class="dmg-pct">${p.dmg_share}%</div>
      </div>
    </div>`;
  }

  document.getElementById('camp1').innerHTML = c1.map(rowHTML).join('');
  document.getElementById('camp2').innerHTML = c2.map(rowHTML).join('');

  var c1gold = c1.reduce((sum, p) => sum + (p.gold_earned || 0), 0);
  var c2gold = c2.reduce((sum, p) => sum + (p.gold_earned || 0), 0);
  _pendingGold = { c1: c1gold, c2: c2gold };

  var c1goldEl = document.getElementById('c1-gold');
  var c2goldEl = document.getElementById('c2-gold');
  c1goldEl.textContent = '0';
  c2goldEl.textContent = '0';
  [c1goldEl, c2goldEl].forEach(function(el) { el.classList.add('gold-hidden'); });
  fightOverlay.querySelectorAll('.gold-label').forEach(function(l) { l.classList.add('gold-hidden'); });
  fightOverlay.querySelectorAll('.gold-block').forEach(function(b) {
    b.classList.remove('flash-winner');
  });
}

async function fightPoll() {
  try {
    var [fightRes, feedRes] = await Promise.all([
      fetch('/fights?all=1'),
      fetch('/feed/order').catch(() => null),
    ]);
    var fightData = await fightRes.json();
    feedData  = feedRes ? await feedRes.json().catch(() => null) : null;
    allFights = fightData.fights || [];

    if (allFights.length) {
      debugIdx = allFights.length - 1;
    }
  } catch (e) {}
}

function setMode(m) {
  clearInterval(fightPollTimer);
  allFights = [];
  debugIdx  = -1;
  fightPoll();
  fightPollTimer = setInterval(fightPoll, 2000);
}

setMode('live');
