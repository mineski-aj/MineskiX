/* ── [FEATURE: kill-events] ── */

var killEventPlaying = false;
var killEventCurrent = null; /* video filename currently playing */
const killEventQueue = []; /* each entry: { src, priority, playerIdx, playerName, role } */

const killOverlayEl     = document.getElementById('kill-event-overlay');
const killVideoEl       = document.getElementById('kill-event-video');
const killPhotoClipEl   = document.getElementById('kill-event-photo-clip');
const killPhotoEl       = document.getElementById('kill-event-photo');
const killNametagClipEl = document.getElementById('kill-event-nametag-clip');
const killNametagBgEl   = document.getElementById('kill-event-nametag-text');
const killNameEl        = document.getElementById('kill-event-name');
const killRoleIconEl    = document.getElementById('kill-event-role-icon');
const killSponsorLogoClipEl  = document.getElementById('kill-event-sponsor-logo-clip');
const killSponsorLogoEl      = document.getElementById('kill-event-sponsor-logo');

/* Never show a broken-image icon if a player's signature photo is
   missing — just leave that spot transparent instead. Reset to visible
   before each new src assignment in showKillEventPlayer() below. */
killPhotoEl.onerror = function() {
  killPhotoEl.style.visibility = 'hidden';
};

/* Kill events sponsored by a specific brand — the sponsor logo only
   shows for these videos, popping in alongside the photo. */
var KILL_EVENT_SPONSOR_LOGO = {
  'doublekill.webm':  'assets/ingame/ingamesmart.png',
  'turtleslain.webm': 'assets/ingame/ingamesmart.png',
  'savage.webm':      'assets/ingame/ingamevisawhite.png',
};

/* ── Timeline pause (all kill events) ──
   Replaces the earlier slow-motion-middle-third trial: instead of riding
   playbackRate, the video just pauses outright once it reaches a fixed
   point in its OWN timeline, holds there for pauseMs, then resumes at
   normal speed. The player-photo popup's hold time is extended by the
   same pauseMs so it doesn't retreat while the video is sitting paused.

   Pause points are specified as atFrame — a frame COUNT (every asset
   here is 60fps, so e.g. 1s+15f = frame 75), not a seconds value. A
   seconds-based threshold is checked against currentTime on the
   'timeupdate' event, which only fires on the browser's own coarse
   schedule — a rendering hiccup elsewhere on the page can delay that
   check running until well past the intended instant, landing the pause
   on a visibly later frame than intended. requestVideoFrameCallback
   (used below when supported — Chrome/Edge; falls back to timeupdate
   otherwise, e.g. Firefox/Safari) instead fires once per actually
   decoded/presented video frame with that frame's own exact mediaTime,
   so the pause always lands on the intended frame regardless of what
   else is happening on the page. Same atFrame/pauseMs for every video
   for now (shortest asset — Double/Triple Kill at 2.124s — still leaves
   ~0.87s after resume, so frame 75 is safe across the board); split any
   one of these out with its own values once someone wants a different
   feel for it. */
var KILL_EVENT_FPS = 60;
var KILL_EVENT_PAUSE = {
  'firstblood.webm':  { atFrame: 75, pauseMs: 750 }, // 1s + 15f
  'doublekill.webm':  { atFrame: 75, pauseMs: 750 },
  'triplekill.webm':  { atFrame: 75, pauseMs: 750 },
  'maniac.webm':      { atFrame: 75, pauseMs: 750 },
  'savage.webm':      { atFrame: 75, pauseMs: 750 },
  'lordslain.webm':   { atFrame: 75, pauseMs: 750 },
  'turtleslain.webm': { atFrame: 75, pauseMs: 750 },
  'wipedout.webm':    { atFrame: 75, pauseMs: 750 },
};
var killPauseArmed  = false; /* true until the current video's pause point has fired once */
var killPauseRvfcId = null;  /* pending requestVideoFrameCallback handle, if in use */
var KILL_EVENT_HAS_RVFC = typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype;

function killClearPause() {
  killPauseArmed = false;
  if (killPauseRvfcId !== null && killVideoEl.cancelVideoFrameCallback) {
    killVideoEl.cancelVideoFrameCallback(killPauseRvfcId);
  }
  killPauseRvfcId = null;
}

function killResumeAfterPause(cfg) {
  killVideoEl.pause();
  var token = killEventToken;
  setTimeout(function() {
    /* Guard against a since-superseded video (queue moved on while this
       was pending) — only resume if it's still the same playback. */
    if (killEventToken === token) killVideoEl.play().catch(function() {});
  }, cfg.pauseMs);
}

/* Re-arms itself every frame (via the callback's own recursive request)
   until the target frame is reached, then pauses. */
function killArmFramePause() {
  killPauseRvfcId = killVideoEl.requestVideoFrameCallback(function(now, metadata) {
    killPauseRvfcId = null;
    if (!killPauseArmed) return;
    var cfg = KILL_EVENT_PAUSE[killEventCurrent];
    if (!cfg) return;
    if (Math.round(metadata.mediaTime * KILL_EVENT_FPS) < cfg.atFrame) {
      killArmFramePause();
      return;
    }
    killPauseArmed = false;
    killResumeAfterPause(cfg);
  });
}

/* Fallback for browsers without requestVideoFrameCallback — same frame
   count, converted to seconds against currentTime instead. Less precise
   under a hiccup (see the comment above), but a graceful degradation
   rather than a hard requirement. */
killVideoEl.addEventListener('timeupdate', function() {
  if (KILL_EVENT_HAS_RVFC) return; /* handled by killArmFramePause instead */
  if (!killPauseArmed) return;
  var cfg = KILL_EVENT_PAUSE[killEventCurrent];
  if (!cfg || killVideoEl.currentTime < cfg.atFrame / KILL_EVENT_FPS) return;
  killPauseArmed = false;
  killResumeAfterPause(cfg);
});

/* Pop timing — start delayed 300ms after the trigger, held up for 1.3s,
   then pops back down. KILL_POP_EXIT_MS must track the exit transition
   duration in mploverlay_v7.css so the overlay hide (below) never cuts
   the pop-down transition short. */
var KILL_POP_DELAY_MS = 300;
var KILL_POP_HOLD_MS  = 1300;
var KILL_POP_EXIT_MS  = 300;

/* Must track #kill-event-photo-clip.ke-in #kill-event-photo's transition
   duration in mploverlay_v7.css — the bounce fires right as the slide-up lands. */
var KILL_POP_ENTER_MS = 480;

/* Rectangle_3 (name text box) is 151px wide — leave a small margin so
   shrink-to-fit text never touches the plate art's edges. */
var KILL_NAME_MAX_W = 139;

var killShowTimer      = null; /* pending: about to pop in */
var killBounceTimer    = null; /* pending: about to play the settle bounce */
var killHoldTimer      = null; /* pending: about to pop back out */
var killPopCycleEndsAt = 0;    /* Date.now() timestamp when the pop-down transition finishes */
var killEventToken      = 0;   /* bumped each time a new video starts, to void stale deferred hides */

function killEventPhotoSrc(playerName) {
  return 'photos/SIGNATURE/' + encodeURIComponent(playerName) + '_SIGNATURE_resized.png';
}

function killNametagBgSrc(camp) {
  return 'assets/ingame/kill' + (camp === 'red' ? 'red' : 'blue') + 'back.png';
}

/* Shrink-to-fit text (binary search font-size) — same approach as
   sbFitText/eccFitName/etc. elsewhere, so a long IGN never overflows
   Rectangle_3's 151×30 box. */
function killFitNameMeasure(el) {
  el.style.fontSize = '16px';
  if (el.scrollWidth <= KILL_NAME_MAX_W) return;
  var lo = 8, hi = 16;
  while (hi - lo > 0.5) {
    var mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= KILL_NAME_MAX_W) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}
function killFitName(el) {
  killFitNameMeasure(el);
  /* General Sans loads async (font-display:block) — if a kill event fires
     before it's ready, the fit above measures against fallback-font glyphs
     and can under-size the text. Re-measure once the real face is in. */
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(function() { killFitNameMeasure(el); });
  }
}

function clearKillTimers() {
  if (killShowTimer)   { clearTimeout(killShowTimer);   killShowTimer   = null; }
  if (killBounceTimer) { clearTimeout(killBounceTimer); killBounceTimer = null; }
  if (killHoldTimer)   { clearTimeout(killHoldTimer);   killHoldTimer   = null; }
  killPhotoEl.classList.remove('ke-bounce');
}

/* Instantly hides a still-visible popup piece (no animated slide-out) by
   disabling its transition for one frame. Used when a new kill event
   supersedes one that's still on screen — without this, the OLD player's
   photo/name plays its normal ~300ms exit slide before the new one pops
   in, which reads as "the wrong player briefly shows" when kill events
   fire in quick succession (e.g. rapid-fire testing from the dashboard). */
function killSnapHide(clipEl, innerEl) {
  innerEl.style.transition = 'none';
  clipEl.classList.remove('ke-in');
  void innerEl.offsetWidth;
  innerEl.style.transition = '';
}

function showKillEventPlayer(playerName, role, camp, sponsorLogo, extraHoldMs) {
  extraHoldMs = extraHoldMs || 0;
  clearKillTimers();
  /* If a previous popup is still up, snap it away instantly instead of
     letting it slide out — the new photo/name/role only get swapped in
     once the old one is fully gone, so we never swap the image mid-slide
     (see killSnapHide above for why this must be instant, not animated). */
  killSnapHide(killPhotoClipEl, killPhotoEl);
  killSnapHide(killNametagClipEl, killNametagBgEl);
  killSnapHide(killSponsorLogoClipEl, killSponsorLogoEl);

  killShowTimer = setTimeout(function() {
    killShowTimer = null;
    killPhotoEl.style.visibility = ''; /* undo any previous missing-photo hide */
    killPhotoEl.src = killEventPhotoSrc(playerName);
    killNametagBgEl.style.backgroundImage = 'url(' + killNametagBgSrc(camp) + ')';
    killNameEl.textContent = playerName;
    killFitName(killNameEl);
    if (role && ROLE_ICONS[role]) {
      killRoleIconEl.src = ROLE_ICONS[role];
      killRoleIconEl.style.display = '';
    } else {
      killRoleIconEl.removeAttribute('src');
      killRoleIconEl.style.display = 'none';
    }
    killPhotoClipEl.classList.add('ke-in');
    killNametagClipEl.classList.add('ke-in');
    if (sponsorLogo) {
      killSponsorLogoEl.src = sponsorLogo;
      killSponsorLogoClipEl.classList.add('ke-in');
    }
    killBounceTimer = setTimeout(function() {
      killBounceTimer = null;
      killPhotoEl.classList.remove('ke-bounce');
      void killPhotoEl.offsetWidth;
      killPhotoEl.classList.add('ke-bounce');
    }, KILL_POP_ENTER_MS);
    killHoldTimer = setTimeout(function() {
      killHoldTimer = null;
      killPhotoClipEl.classList.remove('ke-in');
      killNametagClipEl.classList.remove('ke-in');
      killSponsorLogoClipEl.classList.remove('ke-in');
    }, KILL_POP_HOLD_MS + extraHoldMs);
  }, KILL_POP_DELAY_MS);

  killPopCycleEndsAt = Date.now() + KILL_POP_DELAY_MS + KILL_POP_HOLD_MS + extraHoldMs + KILL_POP_EXIT_MS;
}

function hideKillEventPlayer() {
  clearKillTimers();
  killPhotoClipEl.classList.remove('ke-in');
  killNametagClipEl.classList.remove('ke-in');
  killSponsorLogoClipEl.classList.remove('ke-in');
  killPopCycleEndsAt = 0;
}

/* Defers hiding #kill-event-overlay until the player popup (if any) has
   fully finished its pop-down transition, instead of yanking it away
   mid-animation the instant the video ends. Guarded by a token so a
   stale deferred hide can never clobber a video that started after it. */
function scheduleOverlayHide() {
  var token     = killEventToken;
  var remaining = killPopCycleEndsAt - Date.now();
  function finish() {
    if (killEventToken === token) killOverlayEl.style.display = 'none';
  }
  if (remaining > 0) setTimeout(finish, remaining);
  else finish();
}

killVideoEl.addEventListener('ended', function() {
  killClearPause();
  scheduleOverlayHide();
  killEventPlaying = false;
  killEventCurrent = null;
  playNextKillEvent();
});

/* safety net: if video stalls or errors, don't get stuck */
killVideoEl.addEventListener('error', function() {
  killClearPause();
  scheduleOverlayHide();
  hideKillEventPlayer();
  killEventPlaying = false;
  killEventCurrent = null;
  playNextKillEvent();
});

/* Item Check / Emblem Check / Gold Diff Check each cover a big chunk of
   the screen — a kill event popping in on top of (or getting covered by)
   one of those reads as broken. icShouldShow/eccShouldShow/gdcShouldShow
   are declared in overlay-itemcheck.js/overlay-emblemcheck.js/
   overlay-golddiffcheck.js — safe to reference here even though this
   script loads first in mploverlay_v7.html, since every call site below
   only runs from an event handler fired well after all scripts have
   finished their top-level execution. */
function killEventsBlocked() {
  return icShouldShow || eccShouldShow || gdcShouldShow;
}

function playNextKillEvent() {
  if (killEventPlaying || killEventQueue.length === 0) return;
  if (killEventsBlocked()) return; /* stays queued — resumes via the blocking overlay's AnimateOut */
  killEventPlaying = true;
  killEventToken++;
  var entry = killEventQueue.shift();
  killEventCurrent = entry.video;
  killClearPause();
  killVideoEl.src = 'assets/motion/' + entry.video;
  killOverlayEl.style.display = 'block';

  var pauseCfg = KILL_EVENT_PAUSE[entry.video];
  killPauseArmed = !!pauseCfg;
  if (killPauseArmed && KILL_EVENT_HAS_RVFC) killArmFramePause();
  if (entry.playerName) showKillEventPlayer(entry.playerName, entry.role, entry.camp, KILL_EVENT_SPONSOR_LOGO[entry.video] || null, pauseCfg ? pauseCfg.pauseMs : 0);
  else hideKillEventPlayer();

  killVideoEl.play().catch(function() {
    killClearPause();
    scheduleOverlayHide();
    hideKillEventPlayer();
    killEventPlaying = false;
    playNextKillEvent();
  });
}

/* receive kill event trigger from dashboard preview postMessage */
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'killevent') {
    enqueueKillEvent(e.data.video, e.data.priority || 1, null, null, null, null);
  }
});

function enqueueKillEvent(video, priority, playerIdx, playerName, role, camp) {
  if (!featureEnabled.killevents) return;
  /* deduplicate: don't queue if same video is already playing or already queued */
  if (killEventCurrent === video) return;
  if (killEventQueue.some(function(e) { return e.video === video; })) return;
  killEventQueue.push({ video: video, priority: priority, playerIdx: playerIdx || null, playerName: playerName || null, role: role || null, camp: camp || null });
  playNextKillEvent();
}

/* Forces a representative sponsored kill event into a frozen, held-open
   state — used only as the dashboard Edit tab's showFn for positioning
   the sponsor logo (see mploverlay_v7_killevent in dashboard.html). A
   real kill event plays through in ~2s and auto-hides after ~1.3s, both
   of which make it useless to actually see and drag — this bypasses
   playNextKillEvent()/the queue entirely, plays the video only up to its
   normal KILL_EVENT_PAUSE freeze point and leaves it paused there
   instead of resuming, and shows the player popup + sponsor logo with no
   auto-hide timer. */
function previewKillEventSponsor() {
  var video = 'turtleslain.webm';
  clearKillTimers();
  killEventToken++;
  killPauseArmed = false;
  killEventCurrent = video;
  killOverlayEl.style.display = 'block';
  killVideoEl.src = 'assets/motion/' + video;

  var freezeAt = ((KILL_EVENT_PAUSE[video] || {}).atFrame || 75) / KILL_EVENT_FPS;
  function holdFrame() {
    if (killVideoEl.currentTime < freezeAt) return;
    killVideoEl.pause();
    killVideoEl.removeEventListener('timeupdate', holdFrame);
  }
  killVideoEl.addEventListener('timeupdate', holdFrame);
  killVideoEl.play().catch(function() {});

  killPhotoEl.style.visibility = '';
  killPhotoEl.src = killEventPhotoSrc('PREVIEW');
  killNametagBgEl.style.backgroundImage = 'url(' + killNametagBgSrc('blue') + ')';
  killNameEl.textContent = 'PREVIEW';
  killFitName(killNameEl);
  killRoleIconEl.removeAttribute('src');
  killRoleIconEl.style.display = 'none';
  killPhotoClipEl.classList.add('ke-in');
  killNametagClipEl.classList.add('ke-in');
  killSponsorLogoEl.src = KILL_EVENT_SPONSOR_LOGO[video];
  killSponsorLogoClipEl.classList.add('ke-in');
}
