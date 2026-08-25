# overlay_server — instruction manual

MLBB (Mobile Legends: Bang Bang) esports broadcast overlay system. Each
overlay is a browser-source HTML page (OBS reads it), driven by live game
data and controlled from a central dashboard. This file is the onboarding
doc for a fresh `/clear`'d conversation — read it before touching anything.

## Running it

```
node server.js        # or: npm start
```
Default port 3000 (autoPort in `.claude/launch.json`). Dashboard is at
`/html/dashboard.html`; individual overlay pages are served under `/html/`.

**`routes/*.js` and `lib/*.js` are NOT hot-reloaded — a server restart is
required before those changes take effect.** `html/*.html` changes take
effect on the next page load with no restart needed, which is easy to
conflate since most day-to-day work is HTML/CSS/JS-in-`<script>` edits to
the overlay pages themselves. If you edit a route or a `lib/` file, say so
explicitly and confirm before restarting — this is usually a server the
user started from their own terminal (not one this session spawned), so
don't kill/relaunch it silently. Concretely bit us: editing a shared
`*_api_url.json` file's on-disk *shape* (see "API Mode" below) while the
old route code was still loaded meant the GET endpoints briefly served the
raw new shape (`{live,web,debug}`) instead of the `{url}` contract every
caller expected, until the restart actually happened.

## Map

- `server.js` — Express app entrypoint, mounts everything in `routes/`.
- `routes/*.js` — API endpoints (match state, positions, fights, overlay
  styles, dashboard data, etc).
- `html/mplfs.html` — the main scoreboard/scene overlay (this is the file
  that gets extended with new "scenes" — MVP Highlights, MVP Scene, Final
  Team, Waiting Lobby, Team Line-Up, Casters, Hosts, Standings...).
- `html/mpltag.html` — lower thirds and other "tag" overlays (small,
  self-contained broadcast graphics that sit on top of the main feed —
  e.g. Map Selection) as opposed to `mplfs.html`'s full-screen scenes.
  Same 1920x1080 transparent-canvas broadcast-overlay conventions as
  `mplfs.html` (see "Scene architecture" below), but each tag is much
  smaller and simpler than a full scene, and multiple tags can in
  principle be on screen at once since they don't share `mplfs.html`'s
  mutually-exclusive `activeFeature` slot. New tags get added here.
- `html/dashboard.html` — control panel: SHOW/HIDE/PREVIEW buttons per
  feature, plus the **Edit tab** (drag/resize/font-size editor for every
  overlay element, persisted to `overlay_styles.json` via
  `routes/overlayStyles.js`).
- `html/match-dashboard.html`, `html/map-selection-dashboard.html`,
  `html/standings-dashboard.html` — Match Board / Map Selection /
  Standings tabs, each a static always-mounted iframe inside
  `dashboard.html` (see "Dashboard architecture" below for why they
  share a connection budget and must use `html/js/relay-client.js`
  instead of their own `EventSource`, not just for these three but for
  any future tab of the same kind).
- `html/js/overlay-shared-worker.js` + `html/js/overlay-sse-shim.js` —
  the ONE real `/overlay/events` connection for the entire browser,
  shared across every overlay page via `SharedWorker` (see "Dashboard
  architecture" below). Every overlay page's own SSE connection
  (`dashboard.html`, `mplfs.html`, `ENTVC.html`, `mpltag.html`,
  `Draft.html`, `DraftIndex.html`, `mploverlay_v7.html`) goes through
  this — use `createOverlaySSE()` for any new page, never
  `new EventSource(...)` directly.
- `heromvp/`, `herohighlights/`, `hero/`, `items/`, `role/`, `logos/`,
  `emblem/`, `photos/`, `hires/` — image asset folders, one per asset type
  (see naming conventions below).
- `*.json` at repo root (`match_state.json`, `positions_live.json`,
  `overlay_styles.json`, `mainroster.json`, etc) — live state files the
  routes read/write; not meant to be hand-edited.
- `/Users/ajsarmiento/.claude/projects/-Users-ajsarmiento/memory/` — my
  cross-project memory. Check `reference_mlbb_api.md` for the live
  main-info API shape, and the `feedback_*` files for standing UI rules
  (animation timing, feature-toggle state, fetch caching) that apply here.

## Dashboard architecture — tabs, iframes, and the connection budget

`html/dashboard.html` is one page with several `.page` divs (Match
Board, Map Selection, Standings, Roster, Sponsors, Dynamic, Control,
Edit, Settings), switched by CSS class toggling on click — **not** by
navigating away, so most of them stay mounted (scripts still running)
for the entire life of the dashboard tab:

- **Always-mounted, by design** — Match Board (`match-dashboard.html`),
  Map Selection (`map-selection-dashboard.html`), Standings
  (`standings-dashboard.html`) each sit in a static `<iframe>` in the
  markup and are never torn down when you switch tabs, so their live
  state keeps syncing in the background.
- **Released on navigate-away** — the Control tab's `#preview-iframe`
  and the Edit tab's `#edit-iframe` show "whatever is currently
  selected/being edited", not a fixed thing, so their `src` resets to
  `about:blank` the moment you switch to a different top-level tab
  (the `tabBtns` click handler). Returning to Edit reloads the
  last-picked config automatically; returning to Control needs a fresh
  sidebar click.

**To actually unload an iframe (stop it running, not just hide it),
set `src = 'about:blank'`, never `src = ''`.** An empty string is not
"no document" — the browser resolves it relative to the current page
and the iframe silently loads the *parent page itself*, recursively.
This is a real, easy-to-miss bug: it renders identically (invisible,
since it's normally overlaid or covered anyway) but the parent page's
entire JS keeps running nested inside the iframe, doing whatever that
page does when loaded standalone. Always `about:blank`.

**Why this matters — the browser's per-host connection cap.** Plain
HTTP/1.1 (this server, no HTTP/2) caps a browser at ~6 concurrent
connections to one host. Every persistent `EventSource` an
always-mounted tab holds open permanently occupies one of those 6
slots for as long as the dashboard tab stays open. Add Control/Edit's
own connection on top and it's easy to hit the ceiling — when that
happens, the 7th+ request from that tab (including the tab's own
refresh) just queues forever with no error, which reads as "the whole
dashboard hangs, only fixable by closing and reopening the tab". This
actually happened: adding the Map Selection tab (a 4th always-mounted
SSE connection, plus a redundant 5th it briefly opened by mistake) ate
the safety margin that used to absorb Control+Edit's own connections,
and locked the dashboard up after a few tab switches.

**First fix tried (superseded, keep reading) — one shared connection
per backend channel, held by dashboard.html's own parent page, not by
each of its iframes.** `dashboard.html` opened 3 fixed `EventSource`
connections itself (`/match/events`, `/mapselection/events`,
`/standings/events`) and relayed data down to whichever iframe(s)
needed it via `postMessage` (`html/js/relay-client.js`'s
`connectRelay(...)` on the iframe side; `dashboard.html`'s
`relayCache`/`relayIframeIds`/`relaySend` on the parent side — these
still exist and still work, see below). This capped the
*always-mounted-within-the-dashboard-tab* connection count at a fixed
low number — **but it only helped connections inside one page.** It
did nothing for the case that actually matters most in production:
**vMix (or a normal browser) loading several SEPARATE overlay pages as
independent browser sources/tabs at once** — `mplfs.html`,
`ENTVC.html`, `mploverlay_v7.html`, `mpltag.html`, `Draft.html`, etc.
The 6-connections-per-host cap is shared across the **whole browser**,
not per-tab/per-source, so each of those pages still opened its own
`EventSource('/overlay/events')`, and opening even a handful of them
side by side reproduced the exact same hang — this is what actually
happened: dashboard.html open on the control PC plus a single
`mplfs.html` tab was enough to exhaust the pool.

**The real fix — a `SharedWorker` holding the ONE real connection for
the entire browser, no matter how many overlay pages are open.** A
`SharedWorker` is a browser feature where one script instance is
automatically shared across every tab/window of the same origin.
`html/js/overlay-shared-worker.js` is that script: it holds the single
real `EventSource('/overlay/events')` and rebroadcasts every named
event to every connected page over `postMessage`.
`html/js/overlay-sse-shim.js` is the client-side half —
`createOverlaySSE()` returns an object exposing the same subset of the
`EventSource` API every page already used (`addEventListener`,
`.onopen`, `.onerror`, `.close()`), backed by the worker instead of a
real connection, so **no page's existing `sse.addEventListener('foo',
fn)` call sites needed to change** — only the one line that used to
say `new EventSource('/overlay/events')` became
`createOverlaySSE()`. Migrated: `dashboard.html`, `mplfs.html`,
`ENTVC.html`, `mpltag.html`, `Draft.html`, `DraftIndex.html`, and
`html/js/overlay-debug.js` (mploverlay_v7.html's shared SSE block).
Verified live: opening all 7 of those simultaneously in one browser
produces exactly **one** `GET /overlay/events` request server-side,
regardless of how many are open.

**Not yet migrated — `html/fights.html` and
`html/heart_stopping_moment_v14.html`.** Both use non-standard
connection patterns (an explicit `host`/`baseUrl` variable instead of
same-origin, plus their own manual reconnect-on-error logic) that need
individual verification of same-origin assumptions before swapping in
the shim — deliberately deferred rather than migrated blind.

**dashboard.html's own internal relay (previous section) still
exists and composes with this cleanly** — `dashboardSSE` is now itself
a `createOverlaySSE()` shim instead of a raw `EventSource`, so its
`relayIframeIds`/`relaySend` system for Match Board/Map
Selection/Standings keeps working unchanged, just riding on the shared
worker's one connection instead of a dedicated one. Layer boundary:
the **SharedWorker** solves "how many real connections exist across
the whole browser" (always exactly 1 now); dashboard.html's **own
relay** solves a separate, narrower problem — fanning a single page's
one connection out to its own several always-mounted iframes via
`postMessage`, which the SharedWorker doesn't replace.

**If you add a brand-new overlay page that needs live SSE data, do
NOT give it its own `new EventSource(...)`.** Include
`html/js/overlay-sse-shim.js` and call `createOverlaySSE()` instead —
same for any NEW named event: add it to `KNOWN_EVENTS` in
`html/js/overlay-shared-worker.js` (EventSource requires an explicit
`addEventListener(name, ...)` per named event, so the worker has to
know every name up front; there's no generic "any event" API) or it
will silently never reach any page no matter how many
`addEventListener('yourNewEvent', ...)` calls exist client-side.

**Whenever you add a name to `KNOWN_EVENTS` (or otherwise change
`overlay-shared-worker.js`), you MUST also bump
`OVERLAY_WORKER_VERSION` in `html/js/overlay-sse-shim.js`.**
`SharedWorker`s are reused by exact script URL — a tab/OBS
browser-source that's been open since before your change is still
talking to the OLD worker instance in memory, which never learned
the new event name, no matter how many times that tab is refreshed
or how correct routes/overlay.js and the client listener are.
`OVERLAY_WORKER_VERSION` is a cache-busting query param
(`?v=N`) on the worker's URL specifically so a plain page reload is
enough to pick up a fresh worker — skip the bump and the only fix
left is closing every single tab/browser-source on the whole origin
at once. This exact bug shipped once (Post 4 Key's Control-tab
toggle and Edit-tab preview both looked completely broken — right
server route, right client code, stale worker) and cost a full extra
round trip to diagnose, so treat it as a required step, not an
afterthought, when adding a feature to this server.

**Before calling a new feature done, verify the Control-tab
toggle button AND the SSE round-trip actually work — not just that
the server route returns 200.** `curl`ing `/overlay/<key>/show` only
proves the route exists; it says nothing about whether a connected
mplfs.html tab actually reacts, because that hop goes through the
SharedWorker described above. Test it properly: load the page fresh
(a brand-new Playwright/browser context has no stale worker to hide
behind), click the real Control-tab toggle button, and confirm a
*separate* tab/page picks up the change — the Post 4 Key bug above
looked fine under `curl` and only showed up when someone actually
pressed the button in a real, already-open browser tab.

## ENTVC.html — the EN broadcast mirror of Waiting TVC/Lobby

`html/ENTVC.html` is a separate, mostly-duplicate copy of `mplfs.html`'s
Waiting Screen TVC, Waiting Lobby, Today's Schedule, Tomorrow's Schedule,
and Standings scenes, used for the English-language broadcast. It shares
`mplfs.html`'s scene architecture, `showSceneVideo`/SSE wiring, and
helpers like `msToMatchRows`/`buildTsMatches` almost byte-for-byte.

**Standing rule: any change to Waiting TVC content in `mplfs.html` — new
features, CSS/animation fixes, graphics swaps, tunable settings,
anything, including future updates not yet made — must be mirrored
into `ENTVC.html` too. Waiting Lobby is NOT covered by this rule —
despite ENTVC.html also having its own copy of that scene, edits to
Waiting Lobby stay mplfs.html-only unless the user separately asks for
ENTVC.html to be updated too (confirmed explicitly after the
Waiting Lobby `redcorner.webm` accent was mirrored in by mistake). The
other deliberate exception is EN Casters positioning: it uses its own
`ws-encasters`-prefixed selectors and its own dashboard Edit config
(`entvc_encasters`), independent of the regular Casters panel,
precisely so it CAN be positioned differently per broadcast — don't
fold it into the mirroring rule either.**

How the mirroring actually happens, two different ways depending on
what changed:
- **Position/size edits** (dashboard Edit tab drag/resize) — automatic,
  no extra work needed. Both files write to and read from the SAME
  `overlay_styles.json` bucket (`styleFile: 'mplfs'`) for any selector
  that exists identically in both files' DOM — see
  `routes/overlayStyles.js`. A selector that only exists in one file
  (like EN Casters' `ws-encasters-slot-*`) only ever affects that file.
- **Everything else** (new JS features, CSS/animation fixes, new
  tunable settings, structural HTML changes) — must be hand-ported to
  both files, since they're independent `<script>` blocks, not shared
  modules. When asked to change one, check whether the same code exists
  in the other and update both. For a new shared *tunable* value (not a
  position/size), follow the small-dedicated-JSON-file-and-route
  pattern already used for `credits_speed.json` (`/api/credits-speed`)
  — both files fetch the same endpoint fresh each time the scene is
  shown, so tuning it once (from either file's Edit panel) affects
  both.

## Working from pasted design-tool CSS

The user often pastes CSS blocks exported from a design tool (layer
names like `.Layer_10`, `.Rectangle_2_copy`, `.Triangle_1_copy_2`) to
spec out a new overlay element's placement. **Extract only `left`,
`top`, `width`, and `height` (the position/size) from each block —
ignore everything else in it**: `background-color`/`background-image`
values, `z-index`, border-radius, etc. are placeholder/export noise
from the design tool, not real styling intent (the actual background
is almost always a real asset the user names separately, e.g. "this
container's background is `mapselectblue.png`"; the placeholder fill
color in the pasted CSS is not that asset's color). Nesting matters
though: when the user says "inside this container, .Foo goes here",
`.Foo`'s `left`/`top` are relative to that parent container, not the
overall 1920x1080 canvas — build it as a positioned child, not another
absolute-to-canvas sibling.

## Scene architecture (how every overlay page is built)

Each "scene" (MVP Highlights, MVP Scene, Final Team, etc.) is one
full-screen container in `mplfs.html`:

```html
<div id="foo-page">
  ...scene's own elements, each absolutely positioned...
</div>
```
```css
#foo-page {
  position: absolute; top: 0; left: 0; width: 1920px; height: 1080px;
  display: none; overflow: hidden;
  background: transparent;   /* #scene-video shows through underneath */
  opacity: 0; transition: opacity 400ms ease;
}
#foo-page.foo-on { display: block; }
#foo-page.foo-visible { opacity: 1; }
```

Show/hide is a two-class dance (matches the 400ms CSS transition):

```js
async function showFooScene() {
  const dataPromise = fooFetchData();
  await transitionTo('foo');                 // hands off to shared bg video
  const data = await dataPromise;
  if (activeFeature !== 'foo') return;        // guard: superseded mid-await
  fooApply(data);
  await preloadMedia(fooPage.querySelectorAll('img, video'), 1500);
  if (activeFeature !== 'foo') return;
  showSceneVideo('foo');
  fooPage.classList.add('foo-on');
  void fooPage.offsetWidth;                   // force reflow before opacity
  fooPage.classList.add('foo-visible');
}
function hideFooScene() {
  activeFeature = null;
  fooPage.classList.remove('foo-visible');
  return new Promise(resolve => setTimeout(() => {
    fooPage.classList.remove('foo-on');
    hideSceneVideo();
    resolve();
  }, 420));
}
```

Never hide on `animationend` — use the `setTimeout` + `activeFeature`
guard pattern above (see memory: `feedback_overlay_animations.md`).

## The #1 rule: every element is independently editable

**Every visual piece — image, video, text — gets its own id/class, its
own absolute CSS position, and is never nested inside a shared
positioning wrapper**, so it can be dragged/resized on its own from the
dashboard Edit tab. Don't group a label with its value, or a background
video with the image in front of it, unless you explicitly want them to
move together.

To make a new element editable from the dashboard, THREE things must all
reference the exact same selector string — miss one and the row is dead
(this exact bug shipped once: `#mv-box`/`#mv-kda-col` etc. were registered
in `MV_ELEMENTS` but didn't exist in the DOM, so those Edit rows did
nothing):

1. **The DOM**, in `mplfs.html` — the real `id="..."` or `class="..."`.
2. **`..._DEFAULTS`** object, in `dashboard.html` — starting
   `{ left, top, width, height }` (add `fontSize` for text) keyed by that
   same CSS selector (`'#foo-el'` or `'.foo-el'`).
3. **`..._ELEMENTS`** array, in `dashboard.html` — `{ group, id, name }`
   where `id` is again that same selector, `name` is the human label shown
   in the Edit sidebar, and `group` is a heading string.

`group` is not cosmetic-only: selecting a group and nudging with arrow
keys moves every element sharing that `group` string together. Give an
element its own unique `group` value unless you *want* it tied to its
siblings (e.g. a title + subtitle that should always move as a pair is
fine to group; a background video and the photo drawn on top of it is
not).

Then wire the new config into `EDIT_CONFIGS` in `dashboard.html`:
```js
mplfs_foo: {
  label: 'Foo Scene · mplfs', file: 'mplfs.html', styleFile: 'mplfs',
  defaultsKey: 'sb_edit_defaults_mplfs_foo',
  elements: FOO_ELEMENTS, defaults: FOO_DEFAULTS,
  showFn: 'showFooScene',
},
```

## Adding a local debug SHOW/HIDE/PREVIEW card (inside `mplfs.html` itself)

`mplfs.html` has its own on-page debug bar (toggle with the `` ` ``
key) for testing a scene without touching the network — its buttons call
the local JS functions directly, bypassing SSE entirely:

```html
<div class="feature-card">
  <div class="feature-card-label">Foo Scene</div>
  <div class="feature-card-btns">
    <button class="dbg-btn show" onclick="showFooScene()">▶ SHOW</button>
    <button class="dbg-btn hide" onclick="hideFooScene()">■ HIDE</button>
    <button class="dbg-btn preview" id="preview-foo" onclick="toggleLocalPreview('foo', this)">◈ PREVIEW</button>
  </div>
</div>
```
Also add `'foo'` to `toggleLocalPreview`'s and `window.previewTrigger`'s
if-chains in `mplfs.html` so the preview button actually maps to
`showFooScene()`. **This card is local-only** — it does nothing for other
open tabs or OBS. For real remote control, see the next section.

Also check `dashboard.html`'s live-state-on-open logic (memory:
`feedback_feature_toggle_state.md`) if a card has an enable/disable
toggle — it must read real server state, never assume "Enabled".

## Live control (SSE) — wiring a feature into the real dashboard

This is the part that actually lets you click SHOW/HIDE in
`dashboard.html`'s **Control tab** and have every open `mplfs.html`
tab/OBS-browser-source react at once. It's a 6-layer chain and every
layer must use the exact same feature key (e.g. `'foo'`) or the chain
silently breaks at that link:

**1. Server route + broadcast — `routes/overlay.js`.** One `show` and one
`hide` route. Both flip `state.mplfsScene.activeFeature` (so a
freshly-loaded tab can restore it) and write an SSE event named after the
feature key to every connected client in `state.overlayClients`:
```js
router.get('/overlay/foo/show', (req, res) => {
  state.mplfsScene.activeFeature = 'foo';
  state.overlayClients.forEach(c => { try { c.write('event: foo\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/foo/hide', (req, res) => {
  state.mplfsScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: foo\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});
```
No new SSE endpoint needed — every scene shares the one persistent
connection at `GET /overlay/events` (`state.overlayClients`, heartbeat
every 15s). `GET /overlay/mplfs-scene` returns `state.mplfsScene` as-is;
you don't need to touch it unless the new feature needs extra fields
beyond `activeFeature`.

**2. Client SSE listener — `mplfs.html`'s `connectSSE()`.** Add a
listener for the same event name:
```js
sseSource.addEventListener('foo', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.action === 'show') {
    document.getElementById('config-bar').classList.remove('debug-open');
    setTimeout(showFooScene, 100);
  } else if (msg.action === 'hide') hideActiveFeature();
});
```

**3. Hide dispatch — `mplfs.html`'s `hideActiveFeature()`.** Add one line
so hiding "whatever is currently active" reaches your scene:
```js
if (prev === 'foo') return hideFooScene();
```

**4. Restore-on-load — `mplfs.html`'s `restoreScene()`.** Add one line so
a tab that (re)loads mid-broadcast comes up already showing the active
feature instead of blank:
```js
else if (scene.activeFeature === 'foo') showFooScene();
```

**5. Dashboard Control-tab button — `dashboard.html`'s `OVERLAYS` array**,
inside the `id: 'mplfs'` entry's `features` list. Adding this entry
generates the real SHOW/HIDE buttons on the Control tab, which just
`fetch()` the two routes from step 1:
```js
{ name: 'Foo Scene', show: '/overlay/foo/show', hide: '/overlay/foo/hide' },
```

**6. Dashboard "Showing" indicator — `dashboard.html`'s
`MPLFS_ACTIVE_FEATURE_MAP`.** A *separate* map from step 5 — easy to
forget because step 5 alone is enough to make SHOW/HIDE work, so nothing
looks broken. This map is what the Control-tab toggle button reads to
decide `'● Showing'` vs `'○ Hidden'`; the key is auto-extracted from the
show URL (`feat.show.split('/')[2]`), so it must match exactly:
```js
foo: 'foo',   // add alongside mvp: 'mvp', final_team: 'finalteam', etc.
```
Skip this and SHOW/HIDE both work fine, but the toggle button silently
never flips to "Showing" — no error, just a permanently-wrong indicator
(exactly what happened when Credit Reel first shipped).

If a feature only ever needs to be triggered from within `mplfs.html`
itself (no cross-tab/remote control), you can skip this whole section and
use only the local debug card above. If it needs to work from the real
dashboard on a different machine than the OBS tab, you need all 6 steps.

## Simpler show/hide — the checkOverlays pattern

Not every show/hide feature needs the full 6-layer mplfs-scene wiring
above — that's specifically for scenes that share mplfs.html's mutually
exclusive `activeFeature` slot. For a single independent on/off panel
(Draft.html's whole-scene toggle; mploverlay_v7.html's scoreboard,
player UI, item-check, emblem-check, gold-diff-check, and the four
side-*-checks), use this simpler pattern instead:

1. **Server state** — one boolean per key in `state.checkOverlays`
   (`lib/state.js`), regardless of which overlay page it belongs to.
2. **Server routes** — `GET /overlay/<key>/show` and `/hide` in
   `routes/overlay.js`, each flipping `state.checkOverlays[key]` and
   broadcasting a named SSE event (see itemcheck/emblemcheck/
   golddiffcheck for the pattern). The four side-*-check panels share
   ONE event name (`sidecheck`) with a `check` field naming the panel
   instead of one event per panel — do that when you have a family of
   near-identical panels, not for a one-off feature.
3. **Restore-on-load** — `GET /overlay/check-overlays` returns the
   whole `state.checkOverlays` object as-is; both the overlay page and
   the dashboard fetch it once on load instead of guessing.
4. **Client listener** — in the overlay's own JS (or
   `overlay-debug.js`'s shared SSE block for mploverlay_v7.html),
   `sse.addEventListener('<key>', ...)` toggling a CSS class that
   drives the animation.
5. **Dashboard control** — add `{ name, key }` to that overlay's
   `checkToggles` array in `dashboard.html`'s `OVERLAYS` entry. This
   auto-generates the toggle button AND both copy-route buttons next to
   it — no per-feature dashboard code needed. For a single whole-scene
   toggle with no "family" of panels, use the plain `show`/`hide` fields
   on the `OVERLAYS` entry instead (see `draft` and `draftindex`) — same
   copy-button behavior, just Show/Hide buttons instead of one on/off
   toggle.

**Default state matters for restore-on-load.** If a feature is normally
*on* (scoreboard, player UI, Draft's whole scene), default its CSS to
the SHOWN position with no modifier class, and only add a "hidden"
class once told to hide. Do it the other way around — CSS hidden by
default, "shown" class added once the restore-fetch resolves — and
every page load flashes blank for the length of that fetch. This bit
Draft.html and player-ui the first time they were wired up.

**A hide animation must clear the WHOLE box, not just one element in
it.** `#scoreboard-overlay` is a single 1920×1080 layer holding the top
HUD bar AND the map box (which sits as low as top:210px) AND the
sponsor loop — `translateY(-130px)` was tuned only for the top bar, so
the map box stayed on-screen after "hiding". The fix was
`translateY(-1080px)` — the layer's own full height, guaranteed to
clear everything inside it regardless of where any individual child
sits. When adding a new child element to an existing show/hide layer,
re-check that the hide transform still clears its lowest point — don't
assume the old offset still works.

### Universal "hide all in a group" buttons

To add a single button that hides several independent panels at once
(e.g. `Hide Bottom Overlays` for item-check/emblem-check/gold-diff-check
/fight-recap, `Hide Side Overlays` for all four side-*-checks): add ONE
new route in `routes/overlay.js` that flips every key's state and
re-broadcasts each panel's OWN existing event name/payload shape — do
NOT invent a new event for this. Zero client-side changes are needed,
since each panel already has a listener for its own event; the
"universal" button is purely a server-side fan-out. Wire it into the
dashboard via `extraActions` (auto-gets a copy button), not
`checkToggles` — that's for individual on/off state, this is a
fire-and-forget action with no "showing/hidden" indicator of its own.

### The dashboard must live-sync via SSE too — this is the part that bit us

`dashboard.html` keeps its own local cache of every toggle's state
(`featureStates`, `checkOverlayStates`, `mplfsSceneState`) so a button
can show "● Showing"/"○ Hidden" without re-fetching on every render. The
first version of this only updated that cache when the dashboard's OWN
button was clicked (an optimistic local flip on click) — so a universal
hide button, another dashboard tab, or a raw curl call would change the
real server state while the dashboard's indicator kept showing the
stale value forever, until a full page reload.

The fix: `dashboard.html` opens its own `EventSource('/overlay/events')`
(`dashboardSSE`, declared right after `toggleMplfsFeature`) and listens
for every toggle-relevant event, updating the cached state + button
straight from the SSE payload instead of from whichever button was
clicked. **Any new show/hide feature you add MUST get a matching
listener added to this same `dashboardSSE` block**, or its toggle button
will silently drift out of sync the exact same way — no error, it'll
just be wrong forever after the first change that didn't come from that
button. The click handlers (`toggleFeature`, `toggleCheckOverlay`,
`toggleMplfsFeature`) no longer flip local state at all — they only
fire the request and let the SSE echo-back update the UI.

## `mploverlay_v7.html` — modular per-feature files, two very different feature shapes

Unlike `mplfs.html` (one giant file/script), `mploverlay_v7.html` is a
thin HTML shell that loads one `<script>` per feature —
`overlay-lvl15.js`, `overlay-items.js`, `overlay-trinity.js`,
`overlay-swap.js`, `overlay-conceal.js`, `overlay-killevents.js`,
`overlay-objectivespawn.js`, `overlay-fights.js`, `overlay-itemcheck.js`,
`overlay-emblemcheck.js`, `overlay-golddiffcheck.js`,
`overlay-sidecheck-core.js` + 4 `overlay-side*check.js` variants,
`overlay-playerui.js` — plus two shared files every feature depends on:
`overlay-core.js` (state, the polling engine, item/role data tables) and
`overlay-debug.js` (the on-page debug bar, the one real SSE connection,
and — today — most features' actual auto-trigger *detection* logic, even
though each feature has its own file for everything else). New features
get their own new `.js` file, included as one more `<script>` tag in
`mploverlay_v7.html`.

There are **two unrelated feature shapes** here — figure out which one a
new feature is before wiring anything, since they don't share a
checklist:

**Shape 1 — a persistent on/off panel** (Item Check, Emblem Check,
Gold Diff Check, the four side-\*-checks, Scoreboard, Player UI). This is
just the **checkOverlays pattern** documented above, nothing new: a
`state.checkOverlays[key]` boolean, `/overlay/<key>/show|hide` routes, an
SSE listener in `overlay-debug.js`'s IIFE at the bottom, a `checkToggles`
entry in `dashboard.html`. The only `mploverlay_v7.html`-specific
convention is naming: each panel's build/animate functions share a
short prefix matching its abbreviation (`icBuildPanel`/`icAnimateIn`/
`icAnimateOut` for **i**tem**c**heck, `eccBuildPanel`/`eccAnimateIn`/
`eccAnimateOut` for **e**mblem-**c**heck-**c**heck, `gdcAnimateIn` for
**g**old**d**iff**c**heck, etc.) — follow it so a new panel's functions
are predictable from its abbreviation. The four side-checks additionally
share ONE SSE event (`sidecheck`, with a `check` field) via
`SIDE_CHECK_HANDLERS` in `overlay-debug.js` instead of one event each —
add your panel there, don't invent a new event.

**Shape 2 — an automatic per-player reactive effect** (Level 15, Item
Pickup, Trinity, Quick Swap, Conceal, Kill Events, Objective Spawn).
These aren't manually shown/hidden — they **fire on their own** when
`masterPoll()` (runs every 1s, `overlay-core.js`) notices something in
the live game-data poll, are individually **armable/disarmable** from
the dashboard (so a caster can turn off "Item Pickup" without turning
off the whole overlay), and are **queued** rather than dropped if
another effect is already animating for that same player. This is the
part of the file that's easy to half-wire, since it has more moving
parts than a simple show/hide toggle:

1. **Arm/disarm toggle** — add your feature's key to `VALID_FEATURES` in
   `routes/overlay.js` (`GET /overlay/feature/:feature/:action`, a single
   generic route shared by every feature — you do NOT add a new route),
   add its default to `featureEnabled` in `overlay-core.js`, and add
   `{ name, feature }` to `dashboard.html`'s `featureToggles` array (a
   flat "● Enabled"/toggle list, separate from `checkToggles`). **The SSE
   side is already generic and needs no new listener** —
   `overlay-debug.js`'s existing `sse.addEventListener('featuretoggle', ...)`
   updates `featureEnabled[d.feature]` for ANY key already present in that
   object, so skipping this step entirely (forgetting to add the
   `featureEnabled` default) is what actually breaks — the toggle button
   will exist and looks like it works, but the object it's writing into
   was never listening for that key.
2. **Detection logic** — a block inside `registerPollHandler(function(data)
   {...})` in `overlay-debug.js` (today, all features' detection lives in
   this one shared handler, not split per-file) that compares this poll's
   data against the previous poll's (`prevLevel`, `prevEquipState`,
   `prevTotalDamage`, `prevBlessingGold` — add your own `prevXxx` object
   for whatever you're diffing) and decides whether to fire, gated behind
   `featureEnabled.yourFeature`.
3. **The per-player trigger function itself** — follow
   `triggerLvl15(i, ...)` in `overlay-lvl15.js` as the reference shape
   exactly, it's the smallest complete example:
   - Guard re-entrancy: `if (isPlayingYourFeature[i]) return;` then set it
     `true`.
   - A `cleanup()` closure (guarded by a local `cleanedUp` flag so it only
     ever runs once) that resets the visual state, sets
     `isPlayingYourFeature[i] = false`, and **calls `playNextQueued(i)`**
     — skip this call and anything queued behind your effect for that
     player never fires, silently, forever.
   - A safety-net `setTimeout(cleanup, <a bit longer than the animation>)`
     alongside the normal animation-driven path to `cleanup()` — belt and
     suspenders in case the normal path never fires for some reason.
4. **Wire it into the shared mutual-exclusion system** — add
   `isPlayingYourFeature = {}` and `yourFeatureQueue = {}` (both
   per-player objects, alongside the existing `isPlayingTrinity`/
   `trinityQueue` etc. in `overlay-core.js`), add your feature to the
   OR-chain in `isAnyPlaying(i)`, and add an `else if` branch to
   `playNextQueued(i)` checking `yourFeatureQueue[i] && !isPlayingYourFeature[i]`.
   Miss this and your effect can visually stack on top of another one
   still playing for the same player instead of queueing politely behind
   it.
5. **Debug bar** — a `▶ Pn` button per player in `overlay-debug.js`'s
   loop (same shape as the existing Level 15/Item/Trinity/Swap loops),
   plus a `<div id="tab-yourfeature">`/`<button data-tab="yourfeature">`
   pair in `mploverlay_v7.html`'s debug area markup.
6. **Preview Tester** (`previewDebugTester: true` on the dashboard's
   `mploverlay7` entry) — the "Player / Feature / ▶ Test" widget calls
   `window.iframeTest(playerIdx, feature)`, which is its own manually
   maintained `if (feature === '...')` dispatch chain in
   `overlay-debug.js` — same silent-no-op risk as `previewTrigger`
   elsewhere in this codebase if you forget to add your feature's branch
   here too.
7. Sanity-check + syntax-validate + live-verify as usual (see the Master
   checklist below) — additionally confirm from a real poll tick (not
   just the debug button) that your feature actually fires, since the
   debug button bypasses `masterPoll()`'s detection logic entirely and
   proves nothing about step 2.

`killEventTrigger: true` (kill events' own dashboard video-picker +
manual trigger UI) and the "Kill Event Player Photo" Live/Random toggle
next to it are bespoke, one-off dashboard blocks built specifically for
kill events' fixed enumerable video list — not a reusable pattern to
copy for a different feature.

## Control-tab Preview — keep it fully isolated from real broadcast state

The Control tab's `#preview-iframe` lets you see a scene without
triggering it for real (OBS/vMix). Two different patterns exist,
depending on whether the overlay page is cheap enough to always keep
loaded:

- **`previewButton: true`** (per-feature, e.g. `mplfs.html`'s scenes, or
  overlay-level like `mpltag`) — the page is *already* sitting loaded in
  the iframe (selecting its sidebar row loads it, same as any other
  overlay). The "◈ Preview" button just calls
  `iw.contentWindow.previewTrigger(eventName, 'show'|'hide')` directly —
  no network round trip, no real SSE broadcast, purely local to that one
  loaded instance.
- **`deferredPreview: true`** (currently only `Draft Overlay`/
  `Draft.html`) — for a page heavy enough (lots of concurrent video
  decode/canvas work) that keeping it loaded in the iframe at all times
  would double GPU load whenever it's *also* genuinely live in vMix.
  `selectOverlay()` does **not** auto-load it — the iframe stays at
  `about:blank` (see above) with a "Preview disabled" placeholder until
  you press "◈ Preview", which loads the page fresh with `?preview=1`,
  waits for `onload`, then calls `previewTrigger(...)`; toggling off
  unloads it back to `about:blank` — GPU cost is zero unless you're
  actively looking at it. Its own real Show/Hide toggle (state-based,
  `● Showing`/`○ Hidden`) is completely decoupled from this — the iframe
  is never tied to the real broadcast state at all.

**Any overlay page loaded with `?preview=1` must actively decouple
itself from the real broadcast — reacting to real SSE the same way a
live instance would defeats the entire point.** Two failure modes we
hit, both worth checking for in any new preview-capable page:

1. **The preview instance auto-showing/hiding based on real state.**
   `Draft.html` checks `PREVIEW_ONLY = /[?&]preview=1(?:&|$)/.test(location.search)`
   and, when true, skips the real SSE listeners' show/hide calls AND the
   restore-on-load fetch entirely — visibility is driven *exclusively* by
   `window.previewTrigger(event, action)`, which every preview-capable
   page must expose (same contract mplfs.html already used: dispatch on
   `event`/`action` to the same internal show/hide functions the real SSE
   listener calls). `mplfs.html` has an equivalent existing flag,
   `isPreviewFrame` (`new URLSearchParams(location.search).get('preview') === '1'`,
   originally added for its SSE-leader-election exemption) — reuse it,
   don't add a second differently-named flag for the same check.
2. **A side effect inside the preview instance reaching the real
   server.** Any code that does more than a purely-local visual change —
   e.g. `mplfs.html`'s `syncBoard()`, which reports Matchboard/
   Middleboard/Playerboard visibility to the server so the dashboard
   stays accurate — must check `isPreviewFrame`/`PREVIEW_ONLY` and skip
   the real `fetch()` when true, or clicking Preview silently flips real
   broadcast state. This exact bug shipped: previewing any Post scene
   (Hearts/Emblem/Items/Stats/Timeline/4 Key) was firing the real
   `/overlay/matchboard/show` etc. routes, so a preview click changed
   what was actually live in vMix. If the preview still needs the
   dashboard to *see* the resulting state (e.g. to light up a related
   toggle), use `window.parent.postMessage({...}, window.location.origin)`
   instead of hitting the network — see `previewToggleRegistry` below for
   the receiving side.

**`previewTrigger`'s dispatch table must be kept in sync by hand — it's
just a chain of `if (event === '...')` calls, nothing enforces
completeness.** When adding a new feature that should be previewable,
add its branch here too, or Preview silently does nothing for it (no
error). This has shipped incomplete twice: Credit Reel, Post Stats,
Consolidated Post, and Consolidated Post 2 were all missing from
`mplfs.html`'s `previewTrigger` despite being fully wired for real
Show/Hide. **The external event name (derived from the route,
`feat.show.split('/')[2]`) often does NOT match the page's own internal
`activeFeature`/`transitionTo()` name** — e.g. the route is
`post_stats` but the internal name is `stats`; `final_team` vs
`finalteam`; `team_lineup_blue` vs `lineupblue`. Guessing gets this
wrong silently. The authoritative mapping is the page's own real SSE
listener (`sseSource.addEventListener('post_stats', ...)`) — always
check what event name and internal function *that* uses before adding a
`previewTrigger` branch, don't infer it from the dashboard route or the
internal name alone.

**Only one "◈ Preview" can be meaningfully active at a time — they all
drive the same iframe.** `dashboard.html`'s `buildPreviewToggleBtn(eventName)`
is the shared factory every trigger-only preview button goes through
(don't hand-roll another copy); `activePreviewOff` holds whichever
button's own "turn myself off" closure is currently active, and
activating a new one calls the previous one's `turnOff()` first — both
its button state and a real `previewTrigger(..., 'hide')` into the
iframe. Before this existed, each button tracked its own on/off state
independently, so previewing scene B while scene A's preview was still
"on" left A's button stuck active forever even though the iframe had
already moved on.

Separately, **`previewToggleRegistry`** exists for *passive* reflection —
a board getting shown as a side effect of another feature's own preview
(e.g. Post Hearts implicitly showing Matchboard/Middleboard/Playerboard,
reported to the dashboard via the `postMessage` in point 2 above) should
light up that board's own Preview button too, but must NOT go through
`activePreviewOff`'s exclusivity logic — an implied activation isn't a
"preview just this instead" request, and shouldn't turn off the scene
that's actually driving it. `buildPreviewToggleBtn` registers a passive
setter per `eventName`; the dashboard's `message` listener looks it up
and calls it directly.

Both `activePreviewOff` and `previewToggleRegistry` (and
`draftPreviewActive`, `mplfsLiveBadge`, `mapSelectTagBadge` — anything
holding a reference into the just-replaced `#control-panel-body`) get
reset to `null`/`{}` at the top of `buildControlBody()`, since
`body.innerHTML = ''` just destroyed whatever DOM they pointed at.
Forgetting this reset for a *new* piece of cross-render state is a silent
bug: the stale closure still runs, harmlessly touching a detached
element, but can also misfire a real network call using outdated context.

## API Mode — LIVE / WEB / DEBUG url sets (`lib/apiMode.js`)

The Settings page's 9 per-API URL fields (Game, Standings, Draft, Draft
Recap, HRM, Team Hexagon, MVP Highlights, Draft Index, Post-Info) each
store **three** independent values — `live`, `web`, `debug` — instead of
one flat URL, switched by a single global mode flag
(`api_mode.json`, `lib/apiMode.js`'s `getApiMode()`/`setApiMode()`).
Editing a field's Apply button always writes to whichever mode is
*currently active*; flipping modes (Settings page's 3-way segmented
control) is treated as dangerous on purpose — it changes every one of
those 9 endpoints server-wide, not just for the current dashboard tab —
and requires an explicit confirm dialog before it takes effect.

**Every one of the 9 backing JSON files (`game_api_url.json`,
`draft_api_url.json`, etc.) is read directly by MORE than just
`routes/devapi.js`.** `lib/pollers.js` (game/standings/post-info
pollers) and `lib/hrmPoller.js` (HRM poller) read these same files on
their own, independent of the GET routes. All reads/writes MUST go
through `lib/apiMode.js`'s `readUrlForMode(file, default)` /
`writeUrlForMode(file, url)` — never `fs.readFileSync` the raw file
directly and reach into `.url`, since the file's shape is
`{ live, web, debug }`, not a flat `{ url }`. If you add a NEW poller or
route that reads one of these files, use these helpers or it'll read the
wrong mode (or nothing) the moment someone flips the switch.

If you add a 4th mode (or rename one), update the `API_MODES` array in
`lib/apiMode.js` **and** the hardcoded `API_MODES` array + the 3
`.api-mode-seg-btn[data-mode="..."]` buttons in `dashboard.html` — these
are two independent, unenforced copies of the same list, matching the
existing `MPLFS_ACTIVE_FEATURE_MAP` precedent of "this codebase manually
mirrors small config tables between server and client rather than
sharing them."

## Video-heavy overlays — permanently-decoding media is a real, sustained cost

Full-resolution (1920×1080) 60fps VP9 loops that `autoplay`+`loop` and
are never explicitly paused are a genuine, sustained GPU/CPU cost for
as long as the page is open — not a one-time thing. This bit
`mplfs.html` twice:

1. **`#bg-video`** (`bgloop.webm`, the idle-state fallback background)
   had `autoplay` in its HTML tag and was never referenced again anywhere
   in the file — it played, full resolution, 100% of the broadcast's
   runtime, including whenever the overlay was doing nothing at all.
   Fixed by removing `autoplay` entirely; it now sits paused on its
   first decoded frame forever (a `<video>` without `autoplay` still
   renders its first frame once loaded, so this isn't a blank
   rectangle) — a deliberate call that idle doesn't need motion.
2. **`#scene-video-0`/`#scene-video-1`** (the two crossfading
   per-scene backgrounds — `bgloopsun2.webm`, `bgloopwaves2.webm`, etc.,
   picked per feature via `SCENE_VIDEO_SRC`) were only ever *faded to
   opacity 0* on hide (`hideSceneVideo()`), never `.pause()`d — so once
   any scene had been shown once during a broadcast, that layer kept
   decoding invisibly for the rest of the show. Fixed: `.pause()`
   ~400ms after removing the `sv-visible` class (matching its own CSS
   fade-out duration, same setTimeout-after-transition idiom as
   `hideDraftScene()` elsewhere), and `.play()` again whenever
   re-shown. The 400ms defer specifically avoids freezing the fade
   mid-transition; it's guarded against a fast re-show by checking the
   captured element's own class, not the shared `sceneVideoVisible` flag
   (which can belong to a different layer by the time the timeout fires).

**When centralizing "start this shared resource" logic across many
call sites, ordering relative to the OLD resource's own teardown
matters more than it looks.** `showSceneVideo(feature)` was moved into
`transitionToImpl()` so a scene's background starts the instant the
transition is requested, not after that scene's own data-fetch +
`preloadMedia()` (which can take 1.5s+). Putting the call at the *top*
of `transitionToImpl` looked right but broke every scene switch: the
outgoing scene's own hide function calls `hideSceneVideo()` on its own
deferred `setTimeout` (matching ITS fade-out), which reads the shared
`sceneVideoLayer`/`currentSceneVideoSrc` pointers — if the NEW scene's
`showSceneVideo()` already ran and swung those pointers to the new
layer, the outgoing scene's *delayed* hide ends up hiding the layer
that was just started. Fix: call the centralized `showSceneVideo()`
**after** `hideActiveFeature()` has been fully awaited, not before —
this still starts well before any data-fetch (the actual point), it
just correctly sequences after the previous scene's own teardown.

**A missing map entry is a silent no-op, not an error — audit by map
membership, not by guessing which features are exceptions.**
`SCENE_VIDEO_SRC` (the feature→background-file map) was missing
`timeline` (Post Timeline) — a genuine bug, since every other Post
sibling (`hearts`/`emblems`/`items`/`stats`) has an entry. It went
unnoticed for a long time because `#bg-video` used to still be visibly
looping underneath (see point 1) — freezing that exposed the gap.
`richguy` is legitimately absent (its own full-bleed art, deliberately
leaves whatever background was already playing untouched) — so the
correct guard in `transitionToImpl` is
`if (SCENE_VIDEO_SRC[newFeature]) showSceneVideo(newFeature);` (checks
actual map membership), **not** a hardcoded `if (newFeature !== 'timeline')`-
style exception list — hardcoding the one exception you happen to know
about is exactly what caused `timeline` to be missing in the first
place, and would just as easily miss the next one.

**Baking a mask into a real alpha channel offline beats computing it in
JS every frame, if the runtime environment actually decodes it.**
`Draft.html`'s hero-pick reveal used to do a manual per-pixel
`getImageData`/JS-loop/`putImageData` every video frame to combine a
luma-based matte mask with the hero video (no real alpha channel on
either source) — ~0.43ms/frame, non-trivial over a ~1s reveal × up to
10 picks. Replaced with: pre-bake the identical math into a real WebM
alpha channel once, offline —
```
ffmpeg -i in.webm -vf "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255-((77*r(X,Y)+150*g(X,Y)+29*b(X,Y))/256)'" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -lossless 1 out.webm
```
— then at runtime, pure GPU compositing: `drawImage(hero)` →
`globalCompositeOperation = 'destination-in'` → `drawImage(alphaMatte)`
→ reset. Measured ~86x cheaper (0.43ms → 0.005ms), verified pixel-exact
against the original JS formula. **Gotcha when verifying such an
asset:** `ffmpeg`'s *default* VP9 decoder silently ignores WebM's alpha
side-channel and reports a constant fully-opaque value — you must pass
`-c:v libvpx-vp9` explicitly on the decode/verification side (not just
the encode side) to actually read the baked alpha back out; otherwise a
correctly-encoded file looks broken. This technique doesn't generalize
to *every* masking case — a mask that needs to combine with the
target's own pre-existing alpha via something other than a straight
multiply (e.g. Draft.html's player-photo erase, which takes
`Math.min(ownAlpha, matteAlpha)`) doesn't map onto Porter-Duff
compositing operators and was deliberately left on the JS path.

## Data & assets

- Player/match data: `hlFetchMvp()` / `hlExtractPlayer()` hit the
  `game-mvp/view` API (repointable from Settings → `/api/highlights-url`);
  match/game number comes from `/match/state` instead.
- `campid`: `1` = blue/left/team1, `2` = red/right/team2 — same convention
  everywhere, including the main-info API (memory:
  `reference_mlbb_api.md`).
- Asset path conventions (all indexed by `heroid` or an id from the API,
  not hardcoded):
  - `/heromvp/MVP_<heroid>.png` — hero art for MVP Scene.
  - `/herohighlights/<heroid>heromvp.png` — hero art for MVP Highlights.
  - `/items/<id>.png`, `/role/<role>.png`, `/logos/<TRICODE>.png`,
    `/emblem/square_<id>_RUNES.png`.
  - Player signature photo: `hlPhotoUrl(name)`.
- Any `fetch()` of a JSON file that can change at runtime needs
  `{ cache: 'no-store' }` (memory: `feedback_fetch_cache.md`) — a hard
  browser refresh does NOT bypass fetch cache.

## Fonts & text fitting

- **Anton** (black, `#0a0a0a`) — big display numbers and titles: KDA/GPM/
  KP% values, "OF THE GAME", scene titles.
- **General Sans** — labels, player names, secondary text. Bold/700 for
  names, semibold/600 for small uppercase labels.
- Any text element that must never overflow its box uses a shrink-to-fit
  helper, e.g.:
  ```js
  function fooFitValue(el, maxSize, minSize) {
    let size = maxSize;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth && size > minSize) {
      el.style.fontSize = (--size) + 'px';
    }
  }
  ```
  Start `maxSize` near the box height for "maximized" display numbers
  (e.g. a 67px-tall box → ~64px Anton), and give it a sane `minSize` floor
  (~half of max) so worst-case long values don't disappear.

## Master checklist — adding any new feature (this is a moving target — use this every time, don't rely on memory)

This project is under continuous, incremental development across
`mplfs.html`, `mpltag.html` ("MPL L3"), and `Draft.html`. Every miss
below has actually shipped at least once and cost a real round trip to
diagnose, because each one is **silent** — no error, no crash, just a
button/preview/copy-icon that quietly does nothing or a "Showing"
indicator that's permanently wrong. Work through the checklist for
whichever file you're extending; don't skip steps because "it's a small
feature" — the small features are exactly the ones where a skipped step
goes unnoticed longest.

### A. New `mplfs.html` scene (full-screen, shares the `activeFeature` slot)

1. Copy the structure of an existing scene closest to what you need (MVP
   Scene is the most fully-featured reference) rather than starting blank.
2. CSS: `#foo-page` container + one absolutely-positioned rule per element,
   each with its own id/class — no shared wrapper unless intentional (see
   "The #1 rule" above).
3. HTML: the container div and its children, wired to the CSS above.
4. JS: fetch function → apply function (sets every element's
   src/textContent, calls fit-to-box helpers) → `showFooScene`/
   `hideFooScene` following the two-class transition pattern (see "Scene
   architecture" above).
5. **Background loop** — decide if this scene needs the shared crossfading
   ambient background (`showSceneVideo`/`SCENE_VIDEO_SRC`, see
   "Video-heavy overlays" above). If yes, add `foo: '/assets/bgloopXXX.webm'`
   to `SCENE_VIDEO_SRC` — check what a sibling scene of the same "family"
   uses (e.g. every Post scene currently uses `bgloopwaves2.webm`) rather
   than guessing. If no (the scene has its own full-bleed art, like
   `richguy`), do nothing — `transitionToImpl`'s
   `if (SCENE_VIDEO_SRC[newFeature])` guard already skips it correctly,
   just don't force an entry in "to be safe."
6. **Post-family boards** — if this is a Post-style scene meant to sit
   alongside Matchboard/Middleboard/Playerboard, add its key to
   `POST_FEATURES` in `transitionToImpl` and decide what it does to
   middle/player board (most Post scenes show both — the `else` branch;
   a few like `post4key`/`consolidated_post` special-case this — check
   whether yours needs a special case too, don't assume the default fits).
   If it's a normal full-screen scene (not Post-family), skip this — it
   goes through the `else` branch that hides all three boards, which is
   correct for a scene that covers the whole frame.
7. Dashboard Edit tab: add `FOO_DEFAULTS`, `FOO_ELEMENTS`, register in
   `EDIT_CONFIGS`.
8. Local debug card in `mplfs.html` (optional, for testing while you
   build — see "Adding a local debug SHOW/HIDE/PREVIEW card" above).
9. Live control wiring (needed for the real dashboard to trigger it
   remotely — see "Live control (SSE)" above): server show/hide routes in
   `routes/overlay.js` → SSE listener in `connectSSE()` → line in
   `hideActiveFeature()` → line in `restoreScene()` → button entry in
   `dashboard.html`'s `OVERLAYS[...].features` → line in
   `MPLFS_ACTIVE_FEATURE_MAP`. All six must use the exact same feature-key
   string. **The last one is the one that gets forgotten** — everything
   still shows/hides fine without it, only the Control-tab "Showing"
   indicator is silently wrong.
10. **Preview** — add a branch to `mplfs.html`'s `window.previewTrigger`
    for the SAME event name used in step 9's `connectSSE()` listener
    (verify it's the same string — see "Control-tab Preview" above for
    why the external route name and the internal `activeFeature` name
    often differ, e.g. `post_stats` vs `stats`). This is the single most
    commonly forgotten step of this whole checklist — Credit Reel, Post
    Stats, Consolidated Post, and Consolidated Post 2 all shipped with
    working real Show/Hide but a completely silent Preview button.
    **Everything else Preview-related is automatic** once step 9's
    `dashboard.html` feature entry exists with `show`/`hide` — the
    "◈ Preview" button, the show/hide copy-route buttons, and the
    Showing/Hidden toggle all come from the SAME `ov.features`/`feat`
    entry via `dashboard.html`'s generic renderer. Do not hand-write any
    of those; if one is missing, the feature entry is malformed, not
    missing a manual step.
11. New named SSE event → add it to `KNOWN_EVENTS` in
    `html/js/overlay-shared-worker.js` AND bump `OVERLAY_WORKER_VERSION`
    in `html/js/overlay-sse-shim.js` in the same change (see "Dashboard
    architecture" above). Skip the version bump and any tab/OBS
    browser-source already open keeps talking to the old worker forever,
    no matter how many times it's refreshed.
12. Sanity-check before calling it done: grep every id/class used in the new
    `FOO_ELEMENTS`/`FOO_DEFAULTS` against the actual `mplfs.html` markup —
    a mismatch is silent (no error, the Edit row just does nothing). Same
    goes for the feature-key string across all wiring spots in steps 9–10.
13. Validate JS syntax on every file you touched (a fresh `<script>` block
    that fails to parse breaks the whole page):
    ```
    node -e "
    const fs=require('fs');
    for (const f of ['html/mplfs.html','html/dashboard.html']) {
      const src = fs.readFileSync(f,'utf8');
      [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .forEach((m,i) => { try { new Function(m[1]); }
          catch(e){ console.log(f, i, e.message); } });
    }"
    ```
14. Verify live (see "Verifying changes with a real browser" above) —
    not just via `curl`, which only proves a route exists:
    - Click the real Control-tab toggle/Show button and confirm a
      *separate* tab/instance picks up the change over SSE.
    - Click "◈ Preview" and confirm the SAME scene shows **only** in the
      preview iframe, and confirm the real broadcast state (`curl
      /overlay/mplfs-scene`) did NOT change as a result.
    - If the scene touches boards (step 6), confirm the board copy of
      "shown" actually reflects reality afterward
      (`curl /overlay/mplfs-scene`) even after switching to a *different*
      scene — this is exactly the class of bug `syncBoard()` exists to
      prevent, and a new special-cased board branch is a new place it
      can be missed.
    - Click each copy-route button and confirm the copied text is the
      URL you expect.

### B. New `mpltag.html` tag ("MPL L3" — independent, no `activeFeature` slot)

Tags don't share `mplfs.html`'s mutual exclusion, so most use the
simpler **checkOverlays pattern** (see that section above) rather than
the 6-layer SSE wiring:

1. HTML/CSS for the tag, same "every element independently editable" rule.
2. Server: one boolean in `state.checkOverlays`, `GET /overlay/<key>/show`
   and `/hide` routes broadcasting a named SSE event.
3. Client listener in `mpltag.html` toggling a CSS class/animation.
4. Dashboard: add `{ name, key }` to the overlay's `checkToggles` array —
   this alone generates the toggle button and both copy-route buttons.
5. **If the tag needs its own real Show/Hide buttons instead of a single
   toggle** (because, like `mapselecttag`, repeated "Show" clicks do
   something other than a plain on/off — e.g. reveal one more item each
   time), use the plain `show`/`hide` fields on the `OVERLAYS` entry
   instead of `checkToggles`, plus a `mapSelectTagStatus`-style read-only
   pill if you need to show *what* state it's in beyond shown/hidden.
6. **Preview** — `mpltag.html` has its own separate `window.previewTrigger`
   (only handles `mapselecttag` today). Add a branch for your new tag's
   event name, and set `previewButton: true` on its `OVERLAYS` entry if
   you want a "◈ Preview" button at all (optional for tags — many don't
   need cross-tab preview since they're small and quick to check live).
   **`mpltag.html` has no preview-mode isolation flag at all** (unlike
   `mplfs.html`'s `isPreviewFrame` / `Draft.html`'s `PREVIEW_ONLY`) — if
   your new tag's show/hide logic does anything beyond local DOM/CSS
   changes (a `fetch()`, writing shared state, anything like
   `syncBoard()`), it WILL leak into real broadcast state when previewed
   unless you add that same guard yourself. Purely-local tags don't need
   it.
7. Syntax-check + live-verify exactly as in section A, steps 13–14.

### C. New `Draft.html`-style single whole-scene toggle

For a standalone on/off panel that isn't part of a "family" (like
`draft`, `draftindex`, or Draft.html's own `draftrecap` panel):

1. Server: a bespoke boolean (`state.draftActive`-style) or a
   `state.checkOverlays` entry — either works, see "Simpler show/hide"
   above for when to use which.
2. `GET /overlay/<key>/show` / `/hide` routes + a `GET /overlay/<key>-state`
   restore-on-load route if using the bespoke-boolean style.
3. Dashboard: plain `show`/`hide` fields on the `OVERLAYS` entry
   (`toggleShowHide: true` if you want the single SHOWING/HIDDEN pill
   instead of two separate buttons — see Draft Overlay's entry for the
   pattern, including its own `draftShowState`/`applyDraftShowBtn` cache
   and dedicated `dashboardSSE` listener, since a bespoke boolean isn't
   part of the flat `checkOverlays` map the generic `toggleCheckOverlay`
   loop already handles).
4. **If the page is heavy enough that having it live in vMix AND loaded
   in the Control-tab preview iframe simultaneously would double GPU
   load** (lots of concurrent video/canvas work — this was Draft.html's
   whole reason for existing as a special case), use
   `deferredPreview: true` instead of the normal always-loaded preview
   iframe (see "Control-tab Preview" above) — the iframe stays at
   `about:blank` until "◈ Preview" is explicitly pressed. Add
   `window.previewTrigger` AND the `PREVIEW_ONLY` guard (skip reacting to
   real SSE, skip the restore-on-load fetch) to the page itself — without
   both, a `deferredPreview` iframe will either do nothing when
   previewed, or silently mirror real broadcast state the moment it
   loads.
5. Syntax-check + live-verify exactly as in section A, steps 13–14,
   including confirming the iframe genuinely goes back to `about:blank`
   (not just visually hidden) when Preview is toggled off, if you used
   `deferredPreview`.

### D. New `mploverlay_v7.html` feature

First decide which of the two shapes it is (see the
"`mploverlay_v7.html`" section above — a persistent on/off panel vs. an
automatic per-player reactive effect; they use completely different
checklists, and guessing wrong wastes the whole implementation):

- **Persistent panel** → it's the checkOverlays pattern, same as section
  A/B above, plus this file's `icBuildPanel`/`icAnimateIn`-style naming
  convention and (if it's a side-\*-check) the shared `sidecheck` event.
- **Automatic reactive effect** → the 7-step checklist in the
  "`mploverlay_v7.html`" section above (arm/disarm toggle → detection
  logic in `overlay-debug.js`'s poll handler → the `triggerYourFeature`
  build/cleanup/safety-timeout shape → wiring into `isAnyPlaying`/
  `playNextQueued` → debug bar → `iframeTest` dispatch branch → verify
  from a real poll tick, not just the debug button).

In both cases: syntax-check + live-verify as in section A, steps 13–14.

## Verifying changes with a real browser, without a Playwright/puppeteer dependency

Headless Microsoft Edge (Chromium-based, already installed on this
Mac) driven over raw Chrome DevTools Protocol works well for this and
needs no new dependency — modern Node has native `fetch`/`WebSocket`:
```
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/path/to/scratch/profile --autoplay-policy=no-user-gesture-required about:blank &
```
Then from Node: `fetch('http://localhost:9222/json')` to get the page
target's `webSocketDebuggerUrl`, open a `WebSocket` to it, and send
`Page.navigate`/`Runtime.evaluate` commands. This was used repeatedly
this session to drive real interactions (click a real button, wait,
read DOM/JS state back) against the actual running dev server —
far more reliable than reasoning about timing from reading code alone,
and it's what caught the `showSceneVideo` ordering bug and the iframe
`about:blank` vs `''` bug, neither of which was obvious from the code.
`--headless=new` plus `--virtual-time-budget=N` (with `--dump-dom`) works
for short synchronous checks; for anything involving real video
playback or `setTimeout`-paced async work, use a real long-lived
process (`run_in_background`) and real `sleep`s instead — virtual time
does not advance video decode/playback consistently, which produces
confusing false negatives that look like a real bug.

**Never let a test touch real state that a live show depends on
without restoring it.** `state.mplfsScene`/`state.checkOverlays`/
`state.draftActive`/`api_mode.json`/the 9 `*_api_url.json` files are all
real, shared, persistent server state — hitting their real routes from
a test is fine (often necessary — see the Preview section's `syncBoard`
example, which could only be caught this way), but capture the
pre-test value first and restore it after (`curl .../fs/hide` to fully
reset `mplfs.html`'s scene state is the fastest full reset). Prefer an
isolated harness when the code under test doesn't strictly need the
real server: extract the actual `<script>` content from the real file
(`fs.readFileSync` + regex, not hand-retyped) into a scratch HTML page,
append one line exposing whatever internal functions/state the test
needs (`window.__test = {...}`), and drive it directly — this exercises
the literal shipped code with zero risk to shared state. `node --check
file.js` (parse-only, no execution) is safer than `node -e
"require(...)"` for a quick syntax check of a `lib/`/`routes/` file
that starts intervals/pollers at require-time (e.g. `lib/pollers.js`) —
`require`-ing it for real hangs the process on those timers.
