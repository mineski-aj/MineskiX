/* ── [FEATURE: objective-spawn] ──
   Full-canvas video that plays the instant the Lord or Turtle jungle
   timer actually counts down to spawn. Lord and Turtle share one
   full-screen video element (they never spawn in the same instant in a
   real game) and are queued the same way kill events are if they ever
   do land in the same poll tick.

   Guard — must NOT fire just because a poll reads tortoise_left_time/
   lord_left_time as 0. Both fields sit at 0 before their timer has
   started (e.g. the moment the overlay is opened mid-game), so a plain
   "== 0" check would fire immediately on load. Only fire on an actual
   POSITIVE → 0 transition observed between two polls — i.e. the timer
   was seen ticking down, not just resting at zero. This also makes each
   feature naturally re-armed for every subsequent spawn (spawns happen
   more than once per match): once the timer counts back up for the next
   cycle, the next 1→0 transition fires again on its own. */

var objSpawnPlaying = false;
var objSpawnQueue = []; /* { kind: 'lord'|'turtle', video } */

var objSpawnOverlayEl = document.getElementById('objective-spawn-overlay');
var objSpawnVideoEl   = document.getElementById('objective-spawn-video');

var OBJ_SPAWN_VIDEO = { lord: 'lordspawn.webm', turtle: 'turtlespawn.webm' };

/* Turtle-specific permanent disable, once true for the rest of the match:
   - 8:00 game time: the turtle has fully transformed into the Lord.
   - any turtle kill landing after the 6:00 mark: game rule is that's the
     last turtle of the match, so no further turtle spawns are coming
     even though 8:00 hasn't hit yet. */
var TURTLE_TRANSFORM_GAME_TIME = 480; /* 8:00 */
var TURTLE_LAST_KILL_GAME_TIME = 360; /* 6:00 */

/* The very first Lord of the match is a turtle→Lord transform, not a
   normal lord_left_time countdown — and per the user, lord_left_time
   does not reliably show a countdown for this specific transform, so we
   schedule it ourselves off game_time instead of trusting that field:
   - turtle killed inside the 6:00-8:00 window: Lord arrives exactly
     120 game-seconds after that kill.
   - turtle survives untouched to 8:00: it auto-transforms 5 game-seconds
     later, i.e. always exactly at 8:05 (480+5=485), regardless of which
     poll tick actually noticed the 8:00 crossing.
   Once this first, internally-scheduled Lord spawn fires, lord_left_time
   is trusted normally again for every later Lord respawn this match. */
var LORD_AFTER_WINDOW_KILL_DELAY   = 120;
var LORD_NATURAL_TRANSFORM_TARGET  = TURTLE_TRANSFORM_GAME_TIME + 5; /* 8:05, fixed */

var prevTortoiseLeft      = null;
var prevLordLeft          = null;
var prevKillTortoiseTotal = null;
var turtleDisabledForMatch = false;
var pendingLordGameTime   = null; /* scheduled game_time for the first (transform) Lord spawn */
var firstLordHandled      = false; /* once true, resume trusting lord_left_time's own countdown */
var objSpawnHasPolled     = false; /* true after the first poll this page load has ever seen */

function objSpawnPlayNext() {
  if (objSpawnPlaying || objSpawnQueue.length === 0) return;
  objSpawnPlaying = true;
  var entry = objSpawnQueue.shift();
  objSpawnVideoEl.src = 'assets/ingame/' + entry.video;
  objSpawnOverlayEl.style.display = 'block';
  objSpawnVideoEl.play().catch(function() {
    objSpawnOverlayEl.style.display = 'none';
    objSpawnPlaying = false;
    objSpawnPlayNext();
  });
}

objSpawnVideoEl.addEventListener('ended', function() {
  objSpawnOverlayEl.style.display = 'none';
  objSpawnPlaying = false;
  objSpawnPlayNext();
});
/* safety net: if the video stalls or errors, don't get stuck showing it forever */
objSpawnVideoEl.addEventListener('error', function() {
  objSpawnOverlayEl.style.display = 'none';
  objSpawnPlaying = false;
  objSpawnPlayNext();
});

function objSpawnEnqueue(kind) {
  if (!featureEnabled.objectivespawn) return;
  if (objSpawnQueue.some(function(e) { return e.kind === kind; })) return;
  objSpawnQueue.push({ kind: kind, video: OBJ_SPAWN_VIDEO[kind] });
  objSpawnPlayNext();
}

function objSpawnUpdate(data) {
  var gameTime = data.game_time;
  if (typeof gameTime !== 'number') return;

  /* Refresh guard — if this page load's very first poll already reads a
     game_time past the turtle→Lord transform point, that transform
     happened before we ever started watching; schedule nothing for it
     (see Rule 2 below) and go straight to trusting lord_left_time's own
     countdown for the NEXT respawn, same as after a real transform. This
     was firing lordspawn.webm immediately on refresh for any ongoing
     game already past ~8:00, since gameTime >= pendingLordGameTime
     (just-scheduled 8:05 target) was already true on that very first
     poll — the fix is only ever scheduling that target when the crossing
     was actually OBSERVED between two polls, not just read once cold. */
  var isFirstPoll = !objSpawnHasPolled;
  objSpawnHasPolled = true;

  if (!turtleDisabledForMatch) {
    if (gameTime >= TURTLE_TRANSFORM_GAME_TIME) {
      turtleDisabledForMatch = true;
      if (isFirstPoll) {
        firstLordHandled = true;
      } else if (!firstLordHandled && pendingLordGameTime == null) {
        /* Rule 2 — survived untouched to 8:00: fixed 8:05 target, not
           gameTime+5, so a late-detected crossing (poll skipped a beat)
           doesn't push the transform later than it actually happened. */
        pendingLordGameTime = LORD_NATURAL_TRANSFORM_TARGET;
      }
    } else {
      var c1 = (data.camp_list || []).find(function(c) { return c.campid === 1; });
      var c2 = (data.camp_list || []).find(function(c) { return c.campid === 2; });
      var killTortoiseTotal = (c1 && c1.kill_tortoise || 0) + (c2 && c2.kill_tortoise || 0);
      if (prevKillTortoiseTotal != null && killTortoiseTotal > prevKillTortoiseTotal && gameTime > TURTLE_LAST_KILL_GAME_TIME) {
        turtleDisabledForMatch = true;
        /* Rule 1 — killed inside the 6:00-8:00 window: Lord arrives
           exactly 120 game-seconds after THIS kill, so it's relative to
           the current gameTime, unlike Rule 2's fixed target above. */
        if (!firstLordHandled && pendingLordGameTime == null) {
          pendingLordGameTime = gameTime + LORD_AFTER_WINDOW_KILL_DELAY;
        }
      }
      prevKillTortoiseTotal = killTortoiseTotal;
    }
  }

  var tortoiseLeft = data.tortoise_left_time;
  if (!turtleDisabledForMatch && typeof tortoiseLeft === 'number') {
    if (prevTortoiseLeft != null && prevTortoiseLeft > 0 && tortoiseLeft <= 0) {
      objSpawnEnqueue('turtle');
    }
    prevTortoiseLeft = tortoiseLeft;
  }

  if (pendingLordGameTime != null && gameTime >= pendingLordGameTime) {
    objSpawnEnqueue('lord');
    pendingLordGameTime = null;
    firstLordHandled = true;
  }

  /* Normal lord_left_time countdown edge-detection — only trusted once
     the first (transform) Lord spawn above has already been handled;
     before that, per the user, this field doesn't reliably count down. */
  var lordLeft = data.lord_left_time;
  if (firstLordHandled && typeof lordLeft === 'number') {
    if (prevLordLeft != null && prevLordLeft > 0 && lordLeft <= 0) {
      objSpawnEnqueue('lord');
    }
    prevLordLeft = lordLeft;
  }
}
registerPollHandler(objSpawnUpdate);
