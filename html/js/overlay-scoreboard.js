/* ── [FEATURE: scoreboard] — always-on ingame scoreboard overlay ── */

(function buildScoreboard() {
  var overlay = document.createElement('div');
  overlay.id = 'scoreboard-overlay';

  var bg = document.createElement('img');
  bg.id  = 'scoreboard-bg';
  bg.src = 'assets/ingame/ingamepng2.png';
  bg.alt = '';
  overlay.appendChild(bg);

  var gt = document.createElement('div');
  gt.id          = 'scoreboard-gametime';
  gt.textContent = '00:00';
  overlay.appendChild(gt);

  var k1 = document.createElement('div');
  k1.id = 'scoreboard-kills-c1';
  var k1v = document.createElement('span'); k1v.className = 'sb-kval'; k1v.textContent = '0';
  k1.appendChild(k1v);
  overlay.appendChild(k1);

  var k2 = document.createElement('div');
  k2.id = 'scoreboard-kills-c2';
  var k2v = document.createElement('span'); k2v.className = 'sb-kval'; k2v.textContent = '0';
  k2.appendChild(k2v);
  overlay.appendChild(k2);

  var t1 = document.createElement('div');
  t1.id          = 'scoreboard-tricode-c1';
  t1.textContent = '';
  overlay.appendChild(t1);

  var t2 = document.createElement('div');
  t2.id          = 'scoreboard-tricode-c2';
  t2.textContent = '';
  overlay.appendChild(t2);

  var g1 = document.createElement('div');
  g1.id          = 'scoreboard-gold-c1';
  g1.textContent = '';
  overlay.appendChild(g1);

  var g2 = document.createElement('div');
  g2.id          = 'scoreboard-gold-c2';
  g2.textContent = '';
  overlay.appendChild(g2);

  var tw1 = document.createElement('div');
  tw1.id          = 'scoreboard-tower-c1';
  tw1.textContent = '0';
  overlay.appendChild(tw1);

  var lo1 = document.createElement('div');
  lo1.id          = 'scoreboard-lord-c1';
  lo1.textContent = '0';
  overlay.appendChild(lo1);

  var tu1 = document.createElement('div');
  tu1.id          = 'scoreboard-turtle-c1';
  tu1.textContent = '0';
  overlay.appendChild(tu1);

  var tw2 = document.createElement('div');
  tw2.id          = 'scoreboard-tower-c2';
  tw2.textContent = '0';
  overlay.appendChild(tw2);

  var lo2 = document.createElement('div');
  lo2.id          = 'scoreboard-lord-c2';
  lo2.textContent = '0';
  overlay.appendChild(lo2);

  var tu2 = document.createElement('div');
  tu2.id          = 'scoreboard-turtle-c2';
  tu2.textContent = '0';
  overlay.appendChild(tu2);

  /* Icon + amount span, not plain text — see sbUpdateGoldLead below,
     which only ever writes to the .sb-goldlead-amount span so the icon
     (ingameitemgold.png) survives every update instead of being wiped by
     a textContent overwrite. */
  function buildGoldLeadEl(id) {
    var el = document.createElement('div');
    el.id = id;
    var icon = document.createElement('img');
    icon.className = 'sb-goldlead-icon';
    icon.src = 'assets/ingame/ingameitemgold.png';
    icon.alt = '';
    var amount = document.createElement('span');
    amount.className = 'sb-goldlead-amount';
    el.appendChild(icon);
    el.appendChild(amount);
    return el;
  }
  var gl1 = buildGoldLeadEl('sb-goldlead-c1');
  overlay.appendChild(gl1);

  var gl2 = buildGoldLeadEl('sb-goldlead-c2');
  overlay.appendChild(gl2);

  var ms1 = document.createElement('div');
  ms1.id = 'sb-score-c1';
  overlay.appendChild(ms1);

  var ms2 = document.createElement('div');
  ms2.id = 'sb-score-c2';
  overlay.appendChild(ms2);

  /* Match info box — regular season / week-day / match-game, pulled from
     the match board (/match/state), sits just left of the sponsor loop. */
  var mi = document.createElement('div');
  mi.id = 'sb-matchinfo';
  var miLabel = document.createElement('div');
  miLabel.id = 'sb-mi-label';
  miLabel.textContent = 'REGULAR SEASON';
  var miWeek = document.createElement('div');
  miWeek.id = 'sb-mi-week';
  var miMatch = document.createElement('div');
  miMatch.id = 'sb-mi-match';
  mi.appendChild(miLabel);
  mi.appendChild(miWeek);
  mi.appendChild(miMatch);
  overlay.appendChild(mi);

  /* Patch + casters — transparent, sit directly on the scoreboard art.
     Patch comes from the match board; casters render as
     "<mic icon> CASTER1 | CASTER2 | CASTER3". */
  var miPatch = document.createElement('div');
  miPatch.id = 'sb-mi-patch';
  miPatch.innerHTML = '<span class="sb-mi-patch-text"></span>';
  overlay.appendChild(miPatch);

  var miCasters = document.createElement('div');
  miCasters.id = 'sb-mi-casters';
  miCasters.innerHTML = '<svg class="sb-mi-mic" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">' +
    '<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>' +
    '<path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11z"/>' +
    '</svg><span class="sb-mi-casters-text"></span>';
  overlay.appendChild(miCasters);

  /* Map box — background art + logo + map name, pulled from the match
     board (/match/state). Map name shrinks to fit via sbFitText since
     "Expanding Rivers" runs much longer than "Flying Cloud". */
  var mapBox = document.createElement('div');
  mapBox.id = 'sb-map';
  var mapLogo = document.createElement('div');
  mapLogo.id = 'sb-map-logo';
  var mapLogoImg = document.createElement('img');
  mapLogoImg.id  = 'sb-map-logo-img';
  mapLogoImg.alt = '';
  mapLogo.appendChild(mapLogoImg);
  var mapName = document.createElement('div');
  mapName.id = 'sb-map-name';
  mapName.innerHTML = '<span class="sb-map-name-text"></span>';
  mapBox.appendChild(mapLogo);
  mapBox.appendChild(mapName);
  overlay.appendChild(mapBox);

  var sbSponBox = document.createElement('div');
  sbSponBox.id = 'sb-sponsor-loop';
  var sbSponImg = document.createElement('img');
  sbSponImg.id  = 'sb-sponsor-img';
  sbSponBox.appendChild(sbSponImg);
  overlay.appendChild(sbSponBox);

  /* Team logo containers — fallback circle shown until img loads */
  var logo1 = document.createElement('div');
  logo1.id = 'sb-logo-c1';
  var logo1fb = document.createElement('div'); logo1fb.className = 'sb-logo-fallback';
  var logo1img = document.createElement('img'); logo1img.className = 'sb-logo-img'; logo1img.alt = '';
  logo1img.style.display = 'none';
  logo1img.onload  = function() { this.style.display = 'block'; logo1fb.style.display = 'none'; };
  logo1img.onerror = function() { this.style.display = 'none';  logo1fb.style.display = ''; };
  logo1.appendChild(logo1fb); logo1.appendChild(logo1img);
  overlay.appendChild(logo1);

  var logo2 = document.createElement('div');
  logo2.id = 'sb-logo-c2';
  var logo2fb = document.createElement('div'); logo2fb.className = 'sb-logo-fallback';
  var logo2img = document.createElement('img'); logo2img.className = 'sb-logo-img'; logo2img.alt = '';
  logo2img.style.display = 'none';
  logo2img.onload  = function() { this.style.display = 'block'; logo2fb.style.display = 'none'; };
  logo2img.onerror = function() { this.style.display = 'none';  logo2fb.style.display = ''; };
  logo2.appendChild(logo2fb); logo2.appendChild(logo2img);
  overlay.appendChild(logo2);

  /* Insert as first child of scene — always behind every other feature */
  var scene = document.getElementById('scene');
  scene.insertBefore(overlay, scene.firstChild);
})();

/* ── Scoreboard show/hide with animation (slide only, no fade) ── */
function sbHandleToggle(shown) {
  var el = document.getElementById('scoreboard-overlay');
  if (!el) return;
  if (shown) {
    el.style.transition = 'transform 0.5s ease-out';
    el.classList.add('sb-on');
  } else {
    el.style.transition = 'transform 0.35s ease-in';
    el.classList.remove('sb-on');
  }
}

/* Apply real server-side shown/hidden state on load, so a (re)loaded
   overlay restores instead of guessing (see checkOverlays.scoreboard). */
fetch('/overlay/check-overlays').then(function(r) { return r.json(); }).then(function(d) {
  sbHandleToggle(!(d && d.scoreboard === false));
}).catch(function() { sbHandleToggle(true); });

function formatGold(g) {
  if (g < 1000) return String(g);
  return (g / 1000).toFixed(1) + 'k';
}

/* ── Local timer (smooth game clock) ── */
var _sb = {
  running:    false,
  startMs:    0,       // Date.now() at last sync point
  offsetSec:  0,       // game_time seconds at last sync point
  frozenSec:  0,       // display value when paused
  prevApi:    -1,      // last seen api game_time
  sameCount:  0,       // consecutive polls with identical api time
  syncTick:   0,       // polls since last drift-sync
  PAUSE_AT:   2,       // same-time polls before pausing local timer
  SYNC_EVERY: 10,      // drift-check every N polls
  DRIFT_MAX:  2,       // seconds of allowed drift before snap
};

function _sbNow() {
  if (!_sb.running) return _sb.frozenSec;
  return _sb.offsetSec + (Date.now() - _sb.startMs) / 1000;
}

function _sbSetAt(sec) {
  _sb.offsetSec = sec;
  _sb.startMs   = Date.now();
}

/* 100ms tick — only redraws when the displayed second changes */
var _sbLastSec = -1;
setInterval(function() {
  var sec = Math.floor(_sbNow());
  if (sec < 0) sec = 0;
  if (sec === _sbLastSec) return;
  _sbLastSec = sec;
  var el = document.getElementById('scoreboard-gametime');
  if (el) el.textContent = formatTime(sec);
}, 100);

registerPollHandler(function(data) {
  var k1 = document.getElementById('scoreboard-kills-c1');
  var k2 = document.getElementById('scoreboard-kills-c2');

  var apiSec = data.game_time || 0;

  if (apiSec === 0) {
    /* Game not started / ended — reset */
    if (_sb.running || _sb.frozenSec > 0) {
      _sb.running = false; _sb.frozenSec = 0;
      _sb.prevApi = -1;    _sb.sameCount = 0;
    }
  } else if (!_sb.running && _sb.frozenSec === 0) {
    /* First positive time seen — start local timer */
    _sbSetAt(apiSec);
    _sb.running = true; _sb.frozenSec = apiSec;
    _sb.prevApi = apiSec; _sb.sameCount = 0;
  } else if (apiSec === _sb.prevApi) {
    /* Time not advancing — count toward pause */
    _sb.sameCount++;
    if (_sb.sameCount >= _sb.PAUSE_AT && _sb.running) {
      _sb.frozenSec = Math.round(_sbNow());
      _sb.running   = false;
    }
  } else {
    /* Time advanced */
    if (!_sb.running) {
      /* Resume from pause */
      _sbSetAt(apiSec);
      _sb.running = true;
    } else {
      /* Drift-sync check every SYNC_EVERY polls */
      _sb.syncTick++;
      if (_sb.syncTick >= _sb.SYNC_EVERY) {
        _sb.syncTick = 0;
        if (Math.abs(Math.floor(_sbNow()) - apiSec) > _sb.DRIFT_MAX) {
          _sbSetAt(apiSec);
        }
      }
    }
    _sb.sameCount = 0;
    _sb.prevApi   = apiSec;
    _sb.frozenSec = apiSec;
  }

  var camps = data.camp_list || [];
  var c1 = camps.find(function(c) { return c.campid === 1; });
  var c2 = camps.find(function(c) { return c.campid === 2; });

  sbUpdateKill('scoreboard-kills-c1', c1 ? (c1.score != null ? c1.score : 0) : 0);
  sbUpdateKill('scoreboard-kills-c2', c2 ? (c2.score != null ? c2.score : 0) : 0);

  var t1 = document.getElementById('scoreboard-tricode-c1');
  var t2 = document.getElementById('scoreboard-tricode-c2');
  if (t1 && c1) {
    var name1 = c1.team_simple_name || '';
    if (name1) t1.textContent = name1.toUpperCase();
  }
  if (t2 && c2) {
    var name2 = c2.team_simple_name || '';
    if (name2) t2.textContent = name2.toUpperCase();
  }

  /* Team logos — only reload when team name changes */
  var li1 = document.getElementById('sb-logo-c1');
  var li2 = document.getElementById('sb-logo-c2');
  if (li1) {
    var limg1  = li1.querySelector('.sb-logo-img');
    var lname1 = c1 ? (c1.team_simple_name || '').toUpperCase() : '';
    if (limg1 && lname1 && limg1.dataset.team !== lname1) {
      limg1.dataset.team    = lname1;
      limg1.style.display   = 'none';
      limg1.src             = '/logos/' + lname1 + '.png';
    }
  }
  if (li2) {
    var limg2  = li2.querySelector('.sb-logo-img');
    var lname2 = c2 ? (c2.team_simple_name || '').toUpperCase() : '';
    if (limg2 && lname2 && limg2.dataset.team !== lname2) {
      limg2.dataset.team    = lname2;
      limg2.style.display   = 'none';
      limg2.src             = '/logos/' + lname2 + '.png';
    }
  }

  var tw1 = document.getElementById('scoreboard-tower-c1');
  var lo1 = document.getElementById('scoreboard-lord-c1');
  var tu1 = document.getElementById('scoreboard-turtle-c1');
  var tw1 = document.getElementById('scoreboard-tower-c1');
  var lo1 = document.getElementById('scoreboard-lord-c1');
  var tu1 = document.getElementById('scoreboard-turtle-c1');
  var tw2 = document.getElementById('scoreboard-tower-c2');
  var lo2 = document.getElementById('scoreboard-lord-c2');
  var tu2 = document.getElementById('scoreboard-turtle-c2');
  if (c1) {
    if (tw1) tw1.textContent = c1.kill_tower    != null ? c1.kill_tower    : 0;
    if (lo1) lo1.textContent = c1.kill_lord     != null ? c1.kill_lord     : 0;
    if (tu1) tu1.textContent = c1.kill_tortoise != null ? c1.kill_tortoise : 0;
  }
  if (c2) {
    if (tw2) tw2.textContent = c2.kill_tower    != null ? c2.kill_tower    : 0;
    if (lo2) lo2.textContent = c2.kill_lord     != null ? c2.kill_lord     : 0;
    if (tu2) tu2.textContent = c2.kill_tortoise != null ? c2.kill_tortoise : 0;
  }

  var g1 = document.getElementById('scoreboard-gold-c1');
  var g2 = document.getElementById('scoreboard-gold-c2');
  var total1 = 0, total2 = 0;
  if (c1) { for (var s = 1; s <= 5; s++) { var seat = c1['seat_' + s]; if (seat) total1 += seat.gold || 0; } }
  if (c2) { for (var s = 1; s <= 5; s++) { var seat = c2['seat_' + s]; if (seat) total2 += seat.gold || 0; } }
  if (g1) g1.textContent = c1 ? formatGold(total1) : '';
  if (g2) g2.textContent = c2 ? formatGold(total2) : '';
  sbUpdateGoldLead(total1, total2);
});

/* ── Kill score flip animation ── */
var _sbKillVals = {};

function sbUpdateKill(id, newVal) {
  newVal = String(newVal);
  if (_sbKillVals[id] === newVal) return;
  _sbKillVals[id] = newVal;

  var container = document.getElementById(id);
  if (!container) return;

  /* purge any stale spans left over from backgrounded-tab missed animationends */
  var all = container.querySelectorAll('.sb-kval');
  var current = all[all.length - 1] || null;
  for (var i = 0; i < all.length - 1; i++) {
    if (all[i].parentNode) all[i].parentNode.removeChild(all[i]);
  }
  if (!current) return;

  /* entering digit — behind the exiting one */
  var next = document.createElement('span');
  next.className = 'sb-kval';
  next.style.zIndex = '1';
  next.style.animation = 'sb-k-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
  next.textContent = newVal;
  container.appendChild(next);

  /* exiting digit — stays on top while it falls */
  current.style.zIndex = '2';
  current.style.animation = 'sb-k-out 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
  var removed = false;
  function removeOld() {
    if (removed) return;
    removed = true;
    if (current.parentNode) current.parentNode.removeChild(current);
  }
  current.addEventListener('animationend', removeOld, { once: true });
  setTimeout(removeOld, 400);
}

/* ── Gold lead indicator ── */
var _glSide = null;

function sbUpdateGoldLead(total1, total2) {
  var el1 = document.getElementById('sb-goldlead-c1');
  var el2 = document.getElementById('sb-goldlead-c2');
  if (!el1 || !el2) return;
  var amt1 = el1.querySelector('.sb-goldlead-amount');
  var amt2 = el2.querySelector('.sb-goldlead-amount');

  var diff    = total1 - total2;
  var newSide = diff > 0 ? 'c1' : diff < 0 ? 'c2' : null;
  var amount  = '+' + formatGold(Math.abs(diff));

  if (newSide === null) {
    var hideSide = _glSide;
    _glSide = null;
    if (hideSide) {
      var hideEl = hideSide === 'c1' ? el1 : el2;
      hideEl.style.animation = 'sb-gl-out-' + hideSide + ' 0.3s ease-in forwards';
    }
    return;
  }

  var newEl  = newSide === 'c1' ? el1  : el2;
  var newAmt = newSide === 'c1' ? amt1 : amt2;

  if (newSide === _glSide) {
    if (newAmt) newAmt.textContent = amount;
    return;
  }

  var oldSide = _glSide;
  var oldEl   = oldSide === 'c1' ? el1 : oldSide === 'c2' ? el2 : null;
  _glSide = newSide;

  if (oldEl) {
    oldEl.style.animation = 'sb-gl-out-' + oldSide + ' 0.3s ease-in forwards';
    setTimeout(function() {
      oldEl.style.animation = 'none';
      if (newAmt) newAmt.textContent = amount;
      newEl.style.animation = 'sb-gl-in-' + newSide + ' 0.4s ease-out forwards';
    }, 320);
  } else {
    if (newAmt) newAmt.textContent = amount;
    newEl.style.animation = 'sb-gl-in-' + newSide + ' 0.4s ease-out forwards';
  }
}

/* ── Shrink-to-fit text (binary search font-size) — used by the
   patch/casters boxes below since their content length varies a lot. ── */
function sbFitText(el, maxWidth, maxPx) {
  maxPx = maxPx || 13;
  el.style.fontSize = maxPx + 'px';
  if (el.scrollWidth <= maxWidth) return;
  var lo = 6, hi = maxPx;
  while (hi - lo > 0.5) {
    var mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= maxWidth) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}

/* Patch/caster box text-fit budget — NOT a plain CSS font-size, because
   sbFitText() above sets an inline font-size on the text span every poll
   tick, and an inline style always beats an inherited value no matter how
   the inherited value was set (even via !important on the box), so a
   blanket CSS override on #sb-mi-patch/#sb-mi-casters would never actually
   reach .sb-mi-patch-text/.sb-mi-casters-text. Same reasoning as
   .sidecheck-name's SIDECHECK_NAME_FONT_CEILING (see dashboard.html) — the
   Edit tab's saved fontSize/width become the ceiling sbFitText starts
   from, not a fixed size, so it can still shrink further for long
   strings instead of overflowing. The width offsets below (20/38px)
   reproduce the original hardcoded 113/241 maxWidth values exactly at the
   default 133/279 box widths, then scale proportionally from there. */
var SB_MI_WIDTH_OFFSET = { patch: 20, casters: 38 };
var SB_MI_FIT_CONFIG = {
  patch:   { maxWidth: 113, maxPx: 13 },
  casters: { maxWidth: 241, maxPx: 13 },
};
function sbMiTextBudget(which, containerWidth) {
  return Math.max(10, containerWidth - (SB_MI_WIDTH_OFFSET[which] || 0));
}
function sbRefitMi() {
  var miPatchTxt   = document.querySelector('#sb-mi-patch .sb-mi-patch-text');
  var miCastersTxt = document.querySelector('#sb-mi-casters .sb-mi-casters-text');
  if (miPatchTxt)   sbFitText(miPatchTxt,   SB_MI_FIT_CONFIG.patch.maxWidth,   SB_MI_FIT_CONFIG.patch.maxPx);
  if (miCastersTxt) sbFitText(miCastersTxt, SB_MI_FIT_CONFIG.casters.maxWidth, SB_MI_FIT_CONFIG.casters.maxPx);
}
/* Called from the Edit tab (dashboard.html's applyToEditIframe, cross-
   frame) and from loadSbOverrides below (real page load) whenever the
   saved width/fontSize for one of these two boxes changes. */
window.sbSetMiFit = function(which, opts) {
  var cfg = SB_MI_FIT_CONFIG[which];
  if (!cfg || !opts) return;
  if (opts.width    !== undefined) cfg.maxWidth = sbMiTextBudget(which, opts.width);
  if (opts.fontSize !== undefined) cfg.maxPx    = opts.fontSize;
  sbRefitMi();
};

/* ── Match score bars ── */
function sbRenderBars(container, total, scored, fromRight) {
  container.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var bar = document.createElement('div');
    bar.className = 'sb-score-bar';
    var filled = fromRight ? (i >= total - scored) : (i < scored);
    if (filled) bar.classList.add('filled');
    container.appendChild(bar);
  }
}

function sbPollMatchState() {
  fetch('/match/state', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(s) {
      var maxWins = Math.ceil(parseInt((s.series || 'BO3').replace('BO', '')) / 2);
      var home    = s.home || s.teamA;
      var away    = s.away || s.teamB;
      var swapped = s.swapped !== undefined ? s.swapped : (s.blueTeam === 'B');
      var c1Team  = swapped ? away : home;
      var c2Team  = swapped ? home : away;
      sbRenderBars(document.getElementById('sb-score-c1'), maxWins, c1Team.score, true);
      sbRenderBars(document.getElementById('sb-score-c2'), maxWins, c2Team.score, false);

      var miWeek  = document.getElementById('sb-mi-week');
      var miMatch = document.getElementById('sb-mi-match');
      if (miWeek)  miWeek.textContent  = 'WEEK '  + (s.week  != null ? s.week  : 1) + ' - DAY '  + (s.day   != null ? s.day   : 1);
      if (miMatch) miMatch.textContent = 'MATCH ' + (s.match != null ? s.match : 1) + ' - GAME ' + (s.game  != null ? s.game  : 1);

      /* maxWidth/maxPx come from SB_MI_FIT_CONFIG (see sbFitText above) —
         driven by the saved Patch Box/Caster Box width+fontSize, not
         hardcoded, so an Edit-tab resize actually changes what fits. */
      var miPatchTxt   = document.querySelector('#sb-mi-patch .sb-mi-patch-text');
      var miCastersTxt = document.querySelector('#sb-mi-casters .sb-mi-casters-text');
      if (miPatchTxt) {
        miPatchTxt.textContent = s.patch || '';
        sbFitText(miPatchTxt, SB_MI_FIT_CONFIG.patch.maxWidth, SB_MI_FIT_CONFIG.patch.maxPx);
      }
      if (miCastersTxt) {
        miCastersTxt.textContent = (s.casters || []).filter(Boolean).join(' | ').toUpperCase();
        sbFitText(miCastersTxt, SB_MI_FIT_CONFIG.casters.maxWidth, SB_MI_FIT_CONFIG.casters.maxPx);
      }

      var mapVal     = s.map || 'Broken Walls';
      var mapNameTxt = document.querySelector('#sb-map-name .sb-map-name-text');
      var mapLogoImg = document.getElementById('sb-map-logo-img');
      if (mapNameTxt) {
        mapNameTxt.textContent = mapVal.toUpperCase();
        sbFitText(mapNameTxt, 169, 26);
      }
      if (mapLogoImg && mapLogoImg.dataset.map !== mapVal) {
        mapLogoImg.dataset.map = mapVal;
        mapLogoImg.src = '/maps/' + encodeURIComponent(mapVal) + '.png';
      }
    })
    .catch(function() {});
}

sbPollMatchState();
setInterval(sbPollMatchState, 3000);

/* ── Sponsor loop ── */
(function() {
  var SPONSORS = [];
  var idx = 0;

  function runLoop() {
    var img = document.getElementById('sb-sponsor-img');
    (function next() {
      var s = SPONSORS[idx];
      img.className = '';
      img.src = s.src;
      void img.offsetWidth;
      img.classList.add('sb-spon-in');

      function onIn(ev) {
        if (ev.propertyName !== 'transform') return;
        img.removeEventListener('transitionend', onIn);
        setTimeout(function() {
          img.classList.remove('sb-spon-in');
          img.classList.add('sb-spon-out');
          function onOut(ev) {
            if (ev.propertyName !== 'transform') return;
            img.removeEventListener('transitionend', onOut);
            idx = (idx + 1) % SPONSORS.length;
            next();
          }
          img.addEventListener('transitionend', onOut);
        }, s.dur);
      }
      img.addEventListener('transitionend', onIn);
    })();
  }

  fetch('/api/sponsors?ingame=1')
    .then(function(r) { return r.json(); })
    .then(function(list) {
      if (!list || !list.length) return;
      SPONSORS = list;
      runLoop();
    })
    .catch(function() {});
})();

/* ── Load saved position/style overrides from dashboard editor ── */
(function loadSbOverrides() {
  fetch('/api/overlay-styles?file=mploverlay_v7')
    .then(function(r) { return r.json(); })
    .then(function(styles) {
      if (!styles || !Object.keys(styles).length) return;
      /* Seed SB_MI_FIT_CONFIG from the saved Patch Box/Caster Box
         width+fontSize (see sbFitText above for why these two skip the
         blanket !important path below). */
      ['patch', 'casters'].forEach(function(which) {
        var props = styles[which === 'patch' ? '#sb-mi-patch' : '#sb-mi-casters'];
        if (!props) return;
        var opts = {};
        if (props.width    !== undefined) opts.width    = parseFloat(props.width);
        if (props.fontSize !== undefined) opts.fontSize = parseFloat(props.fontSize);
        if (opts.width !== undefined || opts.fontSize !== undefined) window.sbSetMiFit(which, opts);
      });
      var css = Object.keys(styles).map(function(sel) {
        var props = styles[sel];
        /* .sidecheck-name's saved font-size (only — left/top go through
           the normal path below) is read directly by
           overlay-sidecheck-core.js (SIDECHECK_NAME_FONT_CEILING) instead
           of being injected as a blanket override here — a `!important`
           rule would always win over that script's own inline font-size
           assignment, permanently defeating its shrink-to-fit-the-box
           protection for long names. See the SIDECHECK_DEFAULTS comment
           in dashboard.html for the full reasoning. #sb-mi-patch/
           #sb-mi-casters' saved font-size is excluded the same way and
           for the same reason (see SB_MI_FIT_CONFIG above) — their width
           is NOT excluded, since it's still a real CSS box dimension on
           top of also feeding the fit budget. */
        var skipFontSize = (sel === '.sidecheck-name' || sel === '#sb-mi-patch' || sel === '#sb-mi-casters');
        var decls = Object.keys(props).filter(function(prop) {
          return !(skipFontSize && prop === 'fontSize');
        }).map(function(prop) {
          var cssProp = prop === 'fontSize' ? 'font-size' : prop;
          return cssProp + ':' + props[prop] + ' !important';
        }).join(';');
        return sel + '{' + decls + '}';
      }).join('\n');
      var style = document.createElement('style');
      style.id = 'sb-overrides';
      style.textContent = css;
      document.head.appendChild(style);
    })
    .catch(function() {});
})();
