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

/* Dashboard Edit tab → Kill Events (killevent_settings.json,
   /api/killevent-settings) — photoEnabled/nameEnabled/sponsorEnabled are
   on/off switches for whether the player photo/nametag/sponsor logo show
   at all; videoOverrides maps a default video filename (e.g.
   'firstblood.webm') to an uploaded replacement URL; disabledTypes lists
   filenames that should never play at all (see enqueueKillEvent below).
   Fetched once at load — real broadcast instances pick up a later change
   via the same 'reload' SSE broadcast every overlay_styles.json save
   already triggers (routes/projects.js's POST routes below broadcast it
   too), same as every other saved override in this app. */
var killEventSettings = { photoEnabled: true, nameEnabled: true, sponsorEnabled: true, videoOverrides: {}, disabledTypes: [] };
fetch('/api/killevent-settings', { cache: 'no-store' })
  .then(function(r) { return r.json(); })
  .then(function(s) { killEventSettings = s; })
  .catch(function() {});

/* Kill events sponsored by a specific brand — the sponsor logo only
   shows for these videos, popping in alongside the photo. */
var KILL_EVENT_SPONSOR_LOGO = {
  'doublekill.webm':  'assets/ingame/ingamesmart.png',
  'turtleslain.webm': 'assets/ingame/ingamesmart.png',
  'savage.webm':      'assets/ingame/ingamevisawhite.png',
};

var KILL_EVENT_FPS = 60;
/* Frame previewKillEventSponsor() below freezes its video at, for
   positioning the sponsor logo — well past the popup's entrance
   animation (KILL_POP_DELAY_MS + KILL_POP_ENTER_MS). Unrelated to real
   kill-event playback, which no longer pauses/resumes mid-video. */
var KILL_PREVIEW_FREEZE_FRAME = 75; // 1s + 15f

/* Pop timing — start delayed 300ms after the trigger, held up for 1.3s,
   then pops back down. KILL_POP_EXIT_MS must track the exit transition
   duration in ingame.css so the overlay hide (below) never cuts
   the pop-down transition short. */
var KILL_POP_DELAY_MS = 300;
var KILL_POP_HOLD_MS  = 1300;
var KILL_POP_EXIT_MS  = 300;

/* Must track #kill-event-photo-clip.ke-in #kill-event-photo's transition
   duration in ingame.css — the bounce fires right as the slide-up lands. */
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

function showKillEventPlayer(playerName, role, camp, sponsorLogo) {
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
    if (killEventSettings.photoEnabled) {
      killPhotoEl.style.visibility = ''; /* undo any previous missing-photo hide */
      killPhotoEl.src = killEventPhotoSrc(playerName);
      killPhotoClipEl.classList.add('ke-in');
    }
    if (killEventSettings.nameEnabled) {
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
      killNametagClipEl.classList.add('ke-in');
    }
    if (sponsorLogo && killEventSettings.sponsorEnabled) {
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
    }, KILL_POP_HOLD_MS);
  }, KILL_POP_DELAY_MS);

  killPopCycleEndsAt = Date.now() + KILL_POP_DELAY_MS + KILL_POP_HOLD_MS + KILL_POP_EXIT_MS;
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
  scheduleOverlayHide();
  killEventPlaying = false;
  killEventCurrent = null;
  playNextKillEvent();
});

/* safety net: if video stalls or errors, don't get stuck */
killVideoEl.addEventListener('error', function() {
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
   script loads first in ingame.html, since every call site below
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
  killVideoEl.src = killEventSettings.videoOverrides[entry.video] || ('assets/motion/' + entry.video);
  killOverlayEl.style.display = 'block';

  if (entry.playerName) showKillEventPlayer(entry.playerName, entry.role, entry.camp, KILL_EVENT_SPONSOR_LOGO[entry.video] || null);
  else hideKillEventPlayer();

  killVideoEl.play().catch(function() {
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
  if (killEventSettings.disabledTypes.indexOf(video) !== -1) return; /* this specific type turned off in Edit */
  /* deduplicate: don't queue if same video is already playing or already queued */
  if (killEventCurrent === video) return;
  if (killEventQueue.some(function(e) { return e.video === video; })) return;
  killEventQueue.push({ video: video, priority: priority, playerIdx: playerIdx || null, playerName: playerName || null, role: role || null, camp: camp || null });
  playNextKillEvent();
}

/* Forces a representative sponsored kill event into a frozen, held-open
   state — used only as the dashboard Edit tab's showFn for positioning
   the sponsor logo (see ingame_scoreboard_killevent in dashboard.html). A
   real kill event plays through in ~2s and auto-hides after ~1.3s, both
   of which make it useless to actually see and drag — this bypasses
   playNextKillEvent()/the queue entirely, plays the video only up to
   KILL_PREVIEW_FREEZE_FRAME and leaves it paused there instead of
   resuming, and shows the player popup + sponsor logo with no auto-hide
   timer. */
function previewKillEventSponsor() {
  var video = 'turtleslain.webm';
  clearKillTimers();
  killEventToken++;
  killEventCurrent = video;
  killOverlayEl.style.display = 'block';
  killVideoEl.src = killEventSettings.videoOverrides[video] || ('assets/motion/' + video);

  var freezeAt = KILL_PREVIEW_FREEZE_FRAME / KILL_EVENT_FPS;
  function holdFrame() {
    if (killVideoEl.currentTime < freezeAt) return;
    killVideoEl.pause();
    killVideoEl.removeEventListener('timeupdate', holdFrame);
  }
  killVideoEl.addEventListener('timeupdate', holdFrame);
  killVideoEl.play().catch(function() {});

  /* Same on/off checks showKillEventPlayer() uses for a real kill event —
     without these, this preview always showed everything regardless of
     the Player Photo / Player Name / Sponsor Logo toggles, which read as
     those toggles doing nothing (they DID apply to real kill events, just
     never to this iframe's own preview). */
  if (killEventSettings.photoEnabled) {
    killPhotoEl.style.visibility = '';
    killPhotoEl.src = killEventPhotoSrc('PREVIEW');
    killPhotoClipEl.classList.add('ke-in');
  }
  if (killEventSettings.nameEnabled) {
    killNametagBgEl.style.backgroundImage = 'url(' + killNametagBgSrc('blue') + ')';
    killNameEl.textContent = 'PREVIEW';
    killFitName(killNameEl);
    killRoleIconEl.removeAttribute('src');
    killRoleIconEl.style.display = 'none';
    killNametagClipEl.classList.add('ke-in');
  }
  if (killEventSettings.sponsorEnabled) {
    killSponsorLogoEl.src = KILL_EVENT_SPONSOR_LOGO[video];
    killSponsorLogoClipEl.classList.add('ke-in');
  }
}
