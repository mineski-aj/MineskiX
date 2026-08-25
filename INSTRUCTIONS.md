# MPL Overlay Server 2 — Instructions
**Version:** 2.0  
**Stack:** Node.js + Express  
**Port:** 3000

---

## Golden Rule

**Never remove existing routes, features, or functionality when making edits.**  
Only touch what is explicitly requested. Make the smallest possible change. When in doubt, add — don't replace.

---

## Running the Server

```bash
# First time only
npm install

# Start
node server.js

# Kill any stale process on the port first if needed
lsof -ti :3000 | xargs kill -9 2>/dev/null
node server.js
```

**HTML changes** — no restart needed. Files are served fresh on every request.  
**JS changes** — restart required.

---

## File Structure

```
overlay_server2/
│
├── server.js              ← Entry point. Wires everything together. ~70 lines.
├── config.json            ← API URLs (game_api, main_api). Edit this, not lib/config.js.
├── package.json
│
├── lib/                   ← Core logic (no routes here)
│   ├── config.js          ← Constants, config.json loading, players, CAMP_MAP
│   ├── state.js           ← All shared mutable state (one object, shared across modules)
│   ├── items.js           ← Item database (items.json loader, countItems)
│   ├── game.js            ← Fight tracking, stats, postgame builders, camp swap
│   ├── feeds.js           ← buildVmix, buildCampFeed, buildLeagueStats
│   └── pollers.js         ← pollGameAPI, pollH2H, setIntervals — starts on require
│
├── routes/                ← One file per feature group
│   ├── bpm.js             ← POST /bpm, GET /bpm, GET /bpm/log
│   ├── feed.js            ← GET /feed, /feed/vmix, /feed/order
│   ├── overlay.js         ← SSE + all /overlay/* + /meter/*
│   ├── led.js             ← All /led/*
│   ├── fights.js          ← GET /fights, /fights-static, /fights-overlay
│   ├── positions.js       ← GET /positions
│   ├── postgame.js        ← GET /postgame, /stats/league
│   ├── proxy.js           ← GET /proxy/*
│   ├── dashboard.js       ← GET / (server status page)
│   └── devapi.js          ← GET /api/sub-info/ (local test stub)
│
├── html/                  ← All overlay HTML files (served at /html/filename.html)
│   ├── mplfs.html         ← Combined overlay: post_hearts, post_richguy, post_itemline
│   ├── fights.html        ← Fight recap overlay (also served at /fights-overlay)
│   ├── ingame_camv1.html  ← In-game item + HP overlay
│   ├── mploverlay_v5.html ← In-game player overlay (single file)
│   ├── mploverlay_v6.html ← v5 + fight recap (single file, legacy)
│   ├── mploverlay_v7.html ← v6 refactored into split files (thin HTML shell only)
│   ├── mploverlay_v7.css  ← All CSS for v7
│   ├── heart_stopping_moment_v14.html ← BPM meter overlay
│   └── js/                ← v7 JavaScript modules (load order matters)
│       ├── overlay-core.js    ← [1] Constants, all state, utilities, poll engine
│       ├── overlay-lvl15.js   ← [2] Level 15 overlay
│       ├── overlay-items.js   ← [3] Item pickup overlay
│       ├── overlay-trinity.js ← [4] Trinity (3× T3 items) overlay
│       ├── overlay-swap.js    ← [5] Quick swap overlay
│       ├── overlay-conceal.js ← [6] Conceal/roaming boot overlay
│       ├── overlay-fights.js  ← [7] Fight recap panel
│       └── overlay-debug.js   ← [8] Debug UI, all build calls, poll handler, masterPoll start
│
├── assets/                ← Misc overlay image assets
├── hero/                  ← Hero icons: HERO_{id}_KOTAK.png
├── items/                 ← Item icons: {item_id}.png
├── role/                  ← Role icons: "GOLD LANER.png", "EXP LANER.png", etc.
├── logos/                 ← Team logos by tricode: RORA.png, FLCN.png, etc.
├── photos/                ← Player cutouts: KarlTzy_FRONT.png, etc.
├── fonts/                 ← Font files
├── richguy/               ← Richguy overlay assets
│
├── items.json             ← Item ID → name map. Edit this, not items.js.
├── postgame.json          ← Live pointer to last completed game
├── postgames/             ← Archived postgame JSON files
├── fights_live.json       ← Persisted fight log (restored on restart)
└── positions_live.json    ← Persisted position log (restored on restart)
```

---

## Accessing HTML Pages

All HTML files are in `html/` and served by `express.static`:

```
http://<server-ip>:3000/html/mplfs.html
http://<server-ip>:3000/html/fights.html
http://<server-ip>:3000/html/ingame_camv1.html
http://<server-ip>:3000/html/mploverlay_v5.html
http://<server-ip>:3000/html/heart_stopping_moment_v14.html
```

All asset folders (`hero/`, `items/`, `logos/`, etc.) are also served by `express.static` — no explicit routes needed.  
`ingame_camv1.html` and `mploverlay_v5.html` have `<base href="/">` so relative asset paths (`items/`, `assets/`) resolve from root correctly.

---

## All Routes

| Method | Route | File | Purpose |
|--------|-------|------|---------|
| POST | `/bpm` | routes/bpm.js | Receive BPM from Android watches |
| GET | `/bpm` | routes/bpm.js | Latest single BPM reading |
| GET | `/bpm/log` | routes/bpm.js | BPM history (`?limit=N`) |
| GET | `/feed` | routes/feed.js | Flat vmix-style BPM array |
| GET | `/feed/vmix` | routes/feed.js | Alias for `/feed` |
| GET | `/feed/order` | routes/feed.js | Camp-ordered feed with swap logic |
| GET | `/events` | routes/bpm.js | Per-player K/D/A + objective events |
| GET | `/positions` | routes/positions.js | Map position log (`?camp=&seat=&from=&to=`) |
| GET | `/postgame` | routes/postgame.js | Last completed game stats |
| GET | `/stats/league` | routes/postgame.js | All-time league stats + current matchup |
| GET | `/fights` | routes/fights.js | Completed fight recaps (`?last=N`) |
| GET | `/fights-static` | routes/fights.js | Serves fights.json for debug mode |
| GET | `/fights-overlay` | routes/fights.js | Serves html/fights.html |
| GET | `/overlay/events` | routes/overlay.js | SSE stream — all overlays connect here |
| GET | `/overlay/slot1–slot10` | routes/overlay.js | Show player BPM overlay |
| GET | `/overlay/hide` | routes/overlay.js | Hide player BPM overlay |
| GET | `/overlay/fights/show\|hide` | routes/overlay.js | Fight recap overlay control |
| GET | `/overlay/fights/pending` | routes/overlay.js | Poll fallback for fights.html |
| GET | `/overlay/post_hearts/show\|hide` | routes/overlay.js | Postgame hearts overlay |
| GET | `/overlay/post_richguy/show\|hide` | routes/overlay.js | Postgame richguy overlay |
| GET | `/overlay/post_itemline/show\|hide` | routes/overlay.js | Item timeline overlay |
| GET | `/overlay/post_itemline/itemin\|itemout` | routes/overlay.js | Item timeline animation triggers |
| GET | `/overlay/fs/hide` | routes/overlay.js | Hides ALL overlays on mplfs.html |
| GET | `/overlay/fs/debugoff` | routes/overlay.js | Hides debug bar on mplfs.html |
| GET | `/overlay/draftpredict/show\|hide` | routes/overlay.js | Draft predict overlay control |
| GET | `/overlay/draftpredict/poll` | routes/overlay.js | Poll fallback for draftpredict |
| GET | `/meter/show\|hide\|plus\|minus\|clear` | routes/overlay.js | BPM meter overlay control |
| GET | `/led/home\|swap` | routes/led.js | LED side assignment |
| GET | `/led/fightshow\|fighthide` | routes/led.js | LED fight damage display |
| GET | `/led/draftpredshow\|draftpredhide` | routes/led.js | LED draft predict display |
| GET | `/led/winshow\|winhide` | routes/led.js | LED win probability display |
| GET | `/led/healthshow\|healthhide` | routes/led.js | LED team HP bar display |
| GET | `/proxy/predictions` | routes/proxy.js | Proxy to draftpredict API |
| GET | `/proxy/richguy?host=X` | routes/proxy.js | Proxy to gold stats API (avoids CORS) |
| GET | `/` | routes/dashboard.js | Server status dashboard |
| GET | `/api/sub-info/` | routes/devapi.js | Local test stub (serves sub-info_sample.json) |

---

## SSE Architecture

All overlays connect to one shared SSE stream at `/overlay/events`.

| SSE Event | Listener |
|-----------|----------|
| `meter` | heart_stopping_moment_v14.html |
| `fights` | fights.html (+ 500ms poll fallback at `/overlay/fights/pending`) |
| `show` / `hide` | General player BPM overlays |
| `post_hearts` | mplfs.html — postgame BPM hearts |
| `post_richguy` | mplfs.html — richguy gold stats |
| `post_itemline` | mplfs.html — item timeline |
| `post_itemline_itemin/out` | mplfs.html — item animation triggers |
| `fs_hide` | mplfs.html — hides all three scenes simultaneously |
| `fs_debugoff` | mplfs.html — hides debug bar |
| `draftpredict` | draftpredict overlay (+ 300ms poll fallback) |
| `led_side` | LED overlay — home/swap |
| `led_fight` | LED overlay — fight damage |
| `led_draftpred` | LED overlay — draft predict |
| `led_win` | LED overlay — win probability |
| `led_health` | LED overlay — team HP |

---

## mploverlay_v7 — Split JS Architecture

### What goes where

| File | Contains |
|------|----------|
| `overlay-core.js` | All shared globals: `PLAYER_TOPS`, `TIER3_IDS`, `T3_RECIPES`, all `isPlaying*`/queue/prev* state, `isPlayingConceal`, `currentApiUrl`, `getApiUrl`, `fetchData`, `getPlayer`, `registerPollHandler`, `isAnyPlaying`, `playNextQueued`, `NAME_MAX_W`, `fitPlayerName`, `ROLE_ICONS`, `pollStatusEl`, `setPollStatus`, `masterPoll` function def, `slideOut`, `formatTime`, `normalizeId`, `keepAlive` |
| `overlay-lvl15.js` | `buildLvl15Overlay`, `resetLvl15`, `triggerLvl15` |
| `overlay-items.js` | `buildItemOverlay`, `resetItem`, `triggerItem` |
| `overlay-trinity.js` | `getTrinityPositions`, `buildTrinityOverlay`, `resetTrinity`, `triggerTrinity` |
| `overlay-swap.js` | `getSwapPositions`, `buildSwapOverlay`, `resetSwap`, `triggerSwap` |
| `overlay-conceal.js` | `initConcealRefs` IIFE, roaming boot constants, `resetConceal`, `triggerConceal`, `buildConcealDebugButtons` |
| `overlay-fights.js` | All fight-recap vars/functions, `setMode('live')`, `setInterval(pollAction, 500)` |
| `overlay-debug.js` | All `build*Overlay()` calls, all debug button loops, `trinityLabel`, unified `registerPollHandler(...)` call, `setInterval(masterPoll, 1000)`, `masterPoll()`, SSE listeners |

### Load order rule

**overlay-core.js must load first. overlay-debug.js must load last.**

`masterPoll()` is only started from `overlay-debug.js` — this guarantees every feature module has loaded before any poll fires and calls `triggerTrinity`, `triggerItem`, etc.

The HTML shell loads them in order:
```html
<script src="html/js/overlay-core.js"></script>
<script src="html/js/overlay-lvl15.js"></script>
<script src="html/js/overlay-items.js"></script>
<script src="html/js/overlay-trinity.js"></script>
<script src="html/js/overlay-swap.js"></script>
<script src="html/js/overlay-conceal.js"></script>
<script src="html/js/overlay-fights.js"></script>
<script src="html/js/overlay-debug.js"></script>
```

### How to add a new feature to v7

**1. Add CSS** — append to `mploverlay_v7.css`. Use absolute paths for any background images: `url('/assets/myimage.png')`, not `url('assets/myimage.png')` (the CSS file is in `html/`, not root).

**2. Add HTML** — add any static markup to `mploverlay_v7.html` inside `<div id="scene">`. Dynamically-built overlays (like item pickup) don't need static HTML.

**3. Create the feature JS file** — `html/js/overlay-myfeature.js`:

```js
/* ── [FEATURE: myfeature] ── */
function buildMyFeatureOverlay(i) {
  // Create DOM element, set refs
  // Always insertBefore conceal-overlay so z-order is consistent:
  document.getElementById('scene').insertBefore(el, document.getElementById('conceal-overlay'));
  myFeatureRefs[i] = { c: el, ... };
}

function resetMyFeature(i) { ... }

function triggerMyFeature(i, ...) {
  if (isPlayingMyFeature[i]) return;
  isPlayingMyFeature[i] = true;
  // ... animation ...
  // cleanup always calls:
  isPlayingMyFeature[i] = false;
  playNextQueued(i);
}
```

**4. Register state in `overlay-core.js`** — add your `isPlaying*` and queue objects near the other state vars:

```js
const isPlayingMyFeature = {};
const myFeatureQueue     = {};
const myFeatureRefs      = {};
```

**5. Wire into the queue system in `overlay-core.js`** — add to `isAnyPlaying()` and `playNextQueued()`:

```js
// in isAnyPlaying(i):
return !!(... || isPlayingMyFeature[i]);

// in playNextQueued(i):
} else if (myFeatureQueue[i] && !isPlayingMyFeature[i]) {
  const q = myFeatureQueue[i]; myFeatureQueue[i] = null;
  setTimeout(() => triggerMyFeature(i, q.heroId, ...), 300);
}
```

**6. Add poll detection in `overlay-debug.js`** — inside the `registerPollHandler(function(data) { ... })` block, add detection logic that calls `triggerMyFeature(...)` or queues to `myFeatureQueue[pidx]`.

**7. Add debug buttons in `overlay-debug.js`** — build DOM buttons and call `buildMyFeatureOverlay(i)` in a loop before the `registerPollHandler` call:

```js
for (let i = 1; i <= 10; i++) {
  buildMyFeatureOverlay(i);
  const btn = document.createElement('button');
  btn.className = 'debug-btn myfeature-debug-btn';
  btn.dataset.player = i;
  btn.textContent = `▶ P${i}`;
  btn.addEventListener('click', () => triggerMyFeature(i, ...));
  document.getElementById(i <= 5 ? 'myfeature-team-left' : 'myfeature-team-right').appendChild(btn);
}
```

**8. Add a debug tab** in `mploverlay_v7.html`:

```html
<!-- in #debug-tabs -->
<button class="tab-btn" data-tab="myfeature">MY FEATURE</button>

<!-- new tab-content div -->
<div id="tab-myfeature" class="tab-content">
  <div class="debug-team" id="myfeature-team-left"></div>
  <div class="debug-team" id="myfeature-team-right"></div>
</div>
```

**9. Add the script tag** in `mploverlay_v7.html` — insert it between `overlay-swap.js` and `overlay-conceal.js` (or wherever makes sense in the feature order), before `overlay-fights.js` and `overlay-debug.js`:

```html
<script src="html/js/overlay-myfeature.js"></script>
```

---

## Dashboard (`html/dashboard.html`)

The dashboard is the main control and editing interface, served at `http://<ip>:3000/html/dashboard.html`.

### Pages

| Tab | Purpose |
|-----|---------|
| **Control** | Live overlay controls — show/hide, feature toggles, kill event trigger |
| **Edit** | WYSIWYG position editor for overlay elements |
| **Settings** | Game API URL, debug controls |

### Edit Page — Overlay Position Editor

Allows visual drag-and-drop repositioning of overlay elements with live preview.

**How it works:**
- Loads the target overlay in a scaled iframe (1920×1080)
- All editable elements show a dashed blue outline
- Changes are applied live via an injected `<style id="sb-live-edit">` tag inside the iframe
- Saved positions are persisted to `overlay_styles.json` and auto-applied at runtime when the overlay loads

**Individual element controls:**
- **Click** an element button in the left panel, or click it directly in the iframe → selects it (blue outline), shows X / Y / Font Size inputs
- **Drag** the element in the iframe → repositions it live
- **Arrow keys** → 1px per tap; hold for continuous movement
- **Shift + arrow** → 10px per step
- **Cmd+Z / Ctrl+Z** → undo (up to 3 steps)
- **+/− buttons or number inputs** → fine-tune X, Y, font size

**Group editing:**
- **Click a group header button** (e.g. "Logos") in the left panel → selects the whole group (orange outline on all members)
- **Drag any group member** in the iframe → all members move together by the same delta
- **Arrow keys / Shift+arrow** → moves all group members simultaneously
- **X Offset / Y Offset inputs** in the left panel → show cumulative offset from `0` (resets to `0` each time the group is selected); type a value or use +/− to nudge
- Clicking an individual element button or a different group deselects the current group

**Saving and defaults:**

| Button | Behavior |
|--------|----------|
| **Save** | Persists current positions to server (`overlay_styles.json`) — affects the live overlay immediately |
| **Save as Default…** | Saves current positions to `localStorage` as the user default; requires confirmation (inline prompt, auto-dismisses after 6 s) |
| **Load Defaults** | Loads user-saved default if one exists, otherwise loads the hardcoded factory values; status bar reports which was loaded |

**API endpoints (routes/overlayStyles.js):**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/overlay-styles?file=<name>` | Fetch saved overrides for a file |
| POST | `/api/overlay-styles` | Save overrides `{ file, styles }` |

**Persistence file:** `overlay_styles.json` at project root.

**Runtime injection:** `html/js/overlay-scoreboard.js` fetches saved styles on load and injects them as a `<style id="sb-overrides">` tag — so positions are applied in production too, not just in the editor.

### How to add a new element to the Edit page

The editor is fully data-driven. Adding a new element requires two changes in `dashboard.html`:

**1. Add defaults to `SB_DEFAULTS`** (numeric px values, omit properties that don't apply):
```js
'#my-element': { left: 960, top: 50, fontSize: 24 },
```

**2. Add a display entry to `SB_ELEMENTS`:**
```js
{ group: 'My Group', id: '#my-element', name: 'My Element' },
```

All elements that share the same `group` string are automatically selectable and movable as a group — no extra code needed. The drag handler, left panel controls (individual and group), offset tracking, save/load, undo, and keyboard controls all pick them up automatically.

**Prerequisite:** The element must exist in the overlay's DOM when the iframe loads. If it doesn't exist yet, add it to the overlay HTML/JS and its base CSS first.

### How to add a new group to the Edit page

No code beyond the two steps above. Any elements with a new `group` string that doesn't exist yet will automatically get their own clickable group header button in the left panel the next time the Edit tab is opened. The header button selects all members; group offset inputs reset to `0` on each selection.

---

## How to Add a New Feature (Non-Destructive)

### New API route

1. Identify the closest existing route file (e.g. a new overlay control → `routes/overlay.js`, a new data endpoint → create `routes/myfeature.js`)
2. Add the route at the **bottom** of the file, before `module.exports`
3. If creating a new file, register it in `server.js` with `app.use(require('./routes/myfeature'))`
4. Never edit unrelated routes in the same file

**Template for a new route file:**
```js
const express = require('express');
const router  = express.Router();
const state   = require('../lib/state');

router.get('/my-new-route', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
```

**Register in server.js:**
```js
app.use(require('./routes/myfeature'));
```

### New SSE event

1. Add the trigger route in `routes/overlay.js`
2. Broadcast with: `state.overlayClients.forEach(c => { try { c.write('event: myevent\ndata: {"action":"show"}\n\n'); } catch {} })`
3. Listen in the HTML with: `source.addEventListener('myevent', e => { ... })`

### New static asset folder

Just drop the folder in the project root — `express.static` serves it automatically at `/<foldername>/<file>`. No code changes needed.

### New HTML page

1. Add the HTML file to `html/`
2. If it has relative asset paths (`items/`, `assets/`, etc.), add `<base href="/">` right after `<meta charset="UTF-8">` in the `<head>`
3. Access it at `http://<ip>:3000/html/yourpage.html`

### New shared state variable

Add it to `lib/state.js` in the exported object. All modules share the same instance automatically.

### New game logic (stats, events, tracking)

Add to `lib/game.js`. Export the function, import it in `lib/pollers.js` where it needs to be called.

---

## Key Behaviors — Do Not Break

| Behavior | Where |
|----------|-------|
| Camp swap logic — always use `state.activeCampMap`, never hardcode camp1 = watches 1–5 | lib/game.js `applySwap()` |
| Item tracking cold-start silent snapshot — first poll per battleid only populates `prevItemCounts`, doesn't log | lib/pollers.js `_itemsInitBattleId` |
| Fights persist to `fights_live.json` and restore on restart | lib/game.js `saveFightsToDisk()` |
| Position log only flushed when state leaves `"end"` with a new battleid — not on game start | lib/pollers.js |
| Postgame only written after seeing `"play"` state this session — prevents writing stale data on server restart | lib/pollers.js `state.hasSeenPlay` |
| Postgame recording window: **13:50–01:00 only** — test games outside this window are skipped | lib/game.js `writePostgame()` |
| SSE heartbeat every 15s keeps connections alive | routes/overlay.js |
| draftpredict uses hybrid delivery: SSE + poll fallback — do not remove either | routes/overlay.js |

---

## Shared State Reference (`lib/state.js`)

All modules import state with `const state = require('../lib/state')`. Key properties:

| Property | Type | Description |
|----------|------|-------------|
| `state.readings` | Object | Live BPM readings per player (player1–player10 + coaches) |
| `state.gameState` | Object | `{ state, battleid, game_time_s, game_time_fmt, paused, campNames }` |
| `state.campSwapped` | Boolean | Whether camp sides are swapped |
| `state.activeCampMap` | Object | `{ camp1: [{pid, watch}], camp2: [...] }` — authoritative mapping |
| `state.campTricodes` | Object | `{ camp1, camp2 }` — team codes |
| `state.fightLog` | Array | Completed fight recaps this game |
| `state.activeFight` | Object\|null | Currently tracked fight |
| `state.itemLog` | Object | `{ pid: [{game_time_s, item_id, ...}] }` |
| `state.positionLog` | Array | Map positions this game |
| `state.overlayClients` | Array | Active SSE response objects |
| `state.playerNames` | Object | `{ watchNum: playerName }` from game API |
| `state.stats` | Object | Per-player BPM stats accumulating during play |

---

## Config

Edit `config.json` to change API endpoints — no code change needed:

```json
{
  "game_api": "http://10.88.120.72:5001/api/sub-info/",
  "main_api": "https://theapi.dpdns.org/api/main/"
}
```

Restart the server after editing config.json.
