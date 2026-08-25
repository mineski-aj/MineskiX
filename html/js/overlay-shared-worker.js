// html/js/overlay-shared-worker.js — ONE real EventSource('/overlay/events')
// for the entire browser, shared across every tab/window of this origin via
// the SharedWorker mechanism (the browser guarantees only one instance of
// this script ever runs per origin, no matter how many pages connect to
// it). Every overlay page that used to open its own persistent EventSource
// now talks to this worker instead (see overlay-sse-shim.js) — so opening
// N overlay pages costs 1 real connection total, not N.
//
// Why this exists: the browser caps concurrent connections to one host at
// ~6 (plain HTTP/1.1, no HTTP/2 here). Every page holding its own
// EventSource permanently occupies one of those slots for as long as it's
// open; a handful of overlay tabs/browser-sources open at once was enough
// to exhaust the pool and hang the browser (see CLAUDE.md's "Dashboard
// architecture" section for the incident this followed). Consolidating
// connections *within* one page (the dashboard's own relay) only helps
// that one page — it doesn't help when SEPARATE pages/tabs are open
// simultaneously, since the connection pool is shared across the whole
// browser, not per-tab. A SharedWorker is the fix that actually reaches
// across tabs: no matter how many overlay pages are open, there is only
// ever one real EventSource for the whole browser.
//
// KNOWN_EVENTS must list every named SSE event any overlay page listens
// for — EventSource requires an explicit addEventListener(name, ...) per
// named event (there's no generic "any named event" API), so this list
// has to be kept in sync with whatever routes/overlay.js (and friends)
// actually broadcast. Extend this list, not each page's own code, when a
// new named event is introduced anywhere in the system.
//
// IMPORTANT: also bump OVERLAY_WORKER_VERSION in overlay-sse-shim.js
// whenever this list (or any other logic here) changes — a tab that's
// been open since before the change is still running the OLD worker
// instance (SharedWorkers persist per exact script URL across reloads)
// and will silently never learn the new event otherwise.
const KNOWN_EVENTS = [
  'consolidated_post', 'consolidated_post_2', 'credits', 'debugoff', 'draft', 'draftindex', 'draftphotomode',
  'draftpredict', 'draftrecap', 'draftstats', 'emblemcheck', 'featuretoggle', 'fights', 'final_team', 'fs_debugoff', 'fs_hide',
  'golddiffcheck', 'highlights', 'hrm', 'itemcheck', 'killevent', 'led_draftpred',
  'led_fight', 'led_health', 'led_side', 'led_win', 'mapselection', 'mapselecttag',
  'match', 'matchboard', 'meter', 'middleboard', 'mvp', 'playerboard', 'playerui',
  'post_emblems', 'post_hearts', 'post_itemline', 'post_itemline_itemin',
  'post4key', 'post_itemline_itemout', 'post_items', 'post_richguy', 'post_stats', 'reload',
  'scoreboard', 'sidecheck', 'standings', 'stylepatch', 'team_hexagon', 'team_lineup_blue',
  'team_lineup_red', 'today_schedule', 'tomorrow_schedule', 'waiting_lobby',
  'waiting_tvc',
];

const ports = [];
let es = null;
let connected = false;

function broadcast(msg) {
  // Belt-and-suspenders alongside the explicit 'disconnect' message: a tab
  // that closed WITHOUT running its unload handler (crash, force-quit)
  // still leaves a dead port here; prune anything that actually throws.
  for (let i = ports.length - 1; i >= 0; i--) {
    try { ports[i].postMessage(msg); }
    catch (e) { ports.splice(i, 1); }
  }
}

function ensureConnection() {
  if (es) return;
  es = new EventSource('/overlay/events');
  es.onopen = () => { connected = true; broadcast({ type: 'sse-status', ok: true }); };
  es.onerror = () => { connected = false; broadcast({ type: 'sse-status', ok: false }); };
  KNOWN_EVENTS.forEach((name) => {
    es.addEventListener(name, (e) => broadcast({ type: 'sse-event', event: name, data: e.data }));
  });
}

self.onconnect = (connectEvent) => {
  const port = connectEvent.ports[0];
  ports.push(port);
  ensureConnection();
  // A page connecting after the worker/EventSource already exists needs
  // its current status immediately, not just on the next change.
  port.postMessage({ type: 'sse-status', ok: connected });
  // MessagePort has no native "the owning page closed" event on the worker
  // side — a page/tab closing without saying anything would leave a dead
  // port sitting in `ports` forever (harmless per-message, since posts to
  // it are try/catch'd below, but it'd accumulate over a long session with
  // many tabs opened/closed). The shim sends this explicitly on unload.
  port.onmessage = (e) => {
    if (e.data && e.data.type === 'disconnect') {
      const i = ports.indexOf(port);
      if (i !== -1) ports.splice(i, 1);
    }
  };
  port.start();
};
