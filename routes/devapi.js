// routes/devapi.js — GET /api/sub-info/
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const state   = require('../lib/state');
const projects = require('../lib/projects');
const { getApiMode, setApiMode, readUrlForMode, writeUrlForMode } = require('../lib/apiMode');
const seatArrangement = require('../lib/seatArrangement');

// LIVE/DEBUG API mode — Settings page's "dangerous debug button". Every
// per-API URL setting below stores BOTH a live and a debug value; this
// flips which one every reader (these routes, lib/pollers.js, lib/hrmPoller.js)
// resolves to. See lib/apiMode.js.
router.get('/api/api-mode', (req, res) => {
  res.json({ mode: getApiMode() });
});

router.post('/api/api-mode', (req, res) => {
  const mode = setApiMode((req.body || {}).mode);
  res.json({ ok: true, mode });
});

router.get('/api/sub-info', (req, res) => {
  const samplePath = path.join(__dirname, '..', 'sub-info_sample.json');
  try {
    const data = fs.readFileSync(samplePath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (e) {
    res.status(500).json({ error: "sub-info_sample.json not found" });
  }
});

// Also handle trailing slash variant
router.get('/api/sub-info/', (req, res) => {
  const samplePath = path.join(__dirname, '..', 'sub-info_sample.json');
  try {
    const data = fs.readFileSync(samplePath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (e) {
    res.status(500).json({ error: "sub-info_sample.json not found" });
  }
});

// Sponsor logos + categorization — each project has its own logo folder and
// categorization (grouping, per-category loop duration, display order),
// resolved fresh on every call via lib/projects.js (same "same file shape
// everywhere, just a different copy per active project" pattern as
// overlay_styles.json / killevent_settings.json — never cache these paths,
// the active project can change between any two calls). Falls back to the
// repo-root copies when no project is active. The actual logo files at
// whatever this resolves to are served by server.js's dedicated
// `/sponsors/:filename` route (needed because, unlike project asset
// uploads, sponsor logo URLs must stay `/sponsors/<file>` for every
// existing consumer — /api/sponsors' playlist, sponsors-dashboard.html —
// rather than embedding the project id in the URL).
function sponsorsDir()        { return projects.getProjectScopedFilePath('sponsors'); }
function sponsorsConfigFile() { return projects.getProjectScopedFilePath('sponsors_config.json'); }
const CONFIG_FILE          = path.join(__dirname, '..', 'config.json');

function getDashboardPassword() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).dashboard_password || '';
  } catch (e) {
    return '';
  }
}

function readSponsorFiles() {
  try {
    return fs.readdirSync(sponsorsDir()).filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));
  } catch (e) {
    return [];
  }
}

function readSponsorsConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(sponsorsConfigFile(), 'utf8'));
    if (data && Array.isArray(data.categories)) {
      return { categories: data.categories, hiddenInIngame: Array.isArray(data.hiddenInIngame) ? data.hiddenInIngame : [] };
    }
  } catch (e) {}
  return { categories: [], hiddenInIngame: [] };
}

// Public — overlays read this for the ordered, timed play list
// (category order → each category's logo order, dur in ms). The always-on
// ingame scoreboard overlay (overlay-scoreboard.js) passes ?ingame=1 to
// additionally drop any logo toggled "hide in in-game loop" on the
// dashboard's Sponsors tab — every other loop (Waiting Lobby, Waiting
// Screen TVC, Today's/Tomorrow's Schedule, Draft, Credit Reel) still
// shows it, only this call filters it out.
router.get('/api/sponsors', (req, res) => {
  const files  = new Set(readSponsorFiles());
  const config = readSponsorsConfig();
  const hidden = req.query.ingame ? new Set(config.hiddenInIngame) : null;
  const sponsors = [];
  config.categories.forEach(cat => {
    const dur = Math.max(0.5, Number(cat.duration) || 3) * 1000;
    (cat.logos || []).forEach(f => {
      if (!files.has(f)) return;
      if (hidden && hidden.has(f)) return;
      sponsors.push({ src: '/sponsors/' + encodeURIComponent(f), dur, category: cat.name });
    });
  });
  res.set('Cache-Control', 'no-store').json(sponsors);
});

// Dashboard Sponsors tab — categorization + every available logo file
// (so the UI can show unassigned logos alongside categorized ones).
router.get('/api/sponsors-config', (req, res) => {
  const config = readSponsorsConfig();
  res.set('Cache-Control', 'no-store').json({
    categories: config.categories,
    hiddenInIngame: config.hiddenInIngame,
    availableFiles: readSponsorFiles(),
  });
});

router.post('/api/sponsors-config', (req, res) => {
  const body  = req.body || {};
  const token = body.token;
  if (!token || token !== getDashboardPassword()) return res.status(401).json({ error: 'Unauthorized' });
  const data = body.data;
  if (!data || !Array.isArray(data.categories)) {
    return res.status(400).json({ error: 'Payload must include a categories array' });
  }
  const hiddenInIngame = Array.isArray(data.hiddenInIngame) ? data.hiddenInIngame.filter(f => typeof f === 'string') : [];
  try {
    fs.writeFileSync(sponsorsConfigFile(), JSON.stringify({ categories: data.categories, hiddenInIngame }, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not write sponsors_config.json' });
  }
});

// Credit Reel content — plain text, edited from the dashboard's Edit tab
// (or by hand-editing this file / pasting into the textarea) and rendered
// by Fullscreen.html's crParseText(). GET to read, POST { text } to update.
const CREDITS_TEXT_FILE = path.join(__dirname, '..', 'credits_reel.txt');

router.get('/api/credits-text', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').type('text/plain').send(fs.readFileSync(CREDITS_TEXT_FILE, 'utf8'));
  } catch (e) {
    res.set('Cache-Control', 'no-store').type('text/plain').send('');
  }
});

router.post('/api/credits-text', (req, res) => {
  const text = (req.body || {}).text || '';
  fs.writeFileSync(CREDITS_TEXT_FILE, text);
  res.json({ ok: true });
});

// Credit Reel scroll speed, in px/sec — GET to read, POST { speed } to update
const CREDITS_SPEED_FILE = path.join(__dirname, '..', 'credits_speed.json');

router.get('/api/credits-speed', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(CREDITS_SPEED_FILE, 'utf8')));
  } catch (e) {
    res.set('Cache-Control', 'no-store').json({ speed: 90 });
  }
});

router.post('/api/credits-speed', (req, res) => {
  const speed = Math.max(10, Math.min(1000, Number((req.body || {}).speed) || 90));
  fs.writeFileSync(CREDITS_SPEED_FILE, JSON.stringify({ speed }));
  res.json({ ok: true, speed });
});

// MVP Scene player pick — GET to read, POST { roleid } to update. The
// caster picks who's MVP from the dashboard's MVP player-select dropdown
// (built from /api/gamedata-proxy's current seat list), storing a roleid
// (globally unique per seat, unlike name) rather than the MVP scene
// pulling from a separate MVP-designated API. Fullscreen.html's
// showMvpScene looks this roleid up in that same live feed.
const MVP_SELECTION_FILE = path.join(__dirname, '..', 'mvp_selection.json');

router.get('/api/mvp-selection', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(MVP_SELECTION_FILE, 'utf8')));
  } catch (e) {
    res.set('Cache-Control', 'no-store').json({ roleid: null });
  }
});

router.post('/api/mvp-selection', (req, res) => {
  const raw = (req.body || {}).roleid;
  const roleid = (raw === null || raw === undefined || raw === '') ? null : Number(raw);
  fs.writeFileSync(MVP_SELECTION_FILE, JSON.stringify({ roleid }));
  res.json({ ok: true, roleid });
});

// Credit Reel font sizes, in px — GET to read, POST { headingSize, bodySize } to update
const CREDITS_STYLE_FILE = path.join(__dirname, '..', 'credits_style.json');

router.get('/api/credits-style', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(CREDITS_STYLE_FILE, 'utf8')));
  } catch (e) {
    res.set('Cache-Control', 'no-store').json({ headingSize: 40, bodySize: 24 });
  }
});

router.post('/api/credits-style', (req, res) => {
  const headingSize = Math.max(8, Math.min(200, Number((req.body || {}).headingSize) || 40));
  const bodySize     = Math.max(8, Math.min(200, Number((req.body || {}).bodySize) || 24));
  fs.writeFileSync(CREDITS_STYLE_FILE, JSON.stringify({ headingSize, bodySize }));
  res.json({ ok: true, headingSize, bodySize });
});

// Bottom-events layout tuning (ingame.html's Item Check / Gold Diff Check /
// Emblem Check panels) — all three are built the same way (shared CSS
// classes reused per row/card, JS-computed positions from fixed
// constants), so instead of exposing 10 individually-draggable boxes each,
// they share this "a few offsets shift the whole side together" model:
// homeOffsetX/Y and awayOffsetX/Y shift every element on that side
// (portraits, bars/items/runes, text) together. Item Check additionally
// has goldFontSize — one shared font size for every gold-amount row
// (not per-player) since they're all "similar" elements. Same file
// shape/route shape for all three — one factory instead of three
// hand-copied GET/POST pairs. Project-scoped like overlay_styles.json
// (lib/projects.js's getProjectScopedFilePath): each project gets its own
// copy, root files are the no-project-active default.
function registerLayoutRoutes(filename, apiPath, fieldSpecs) {
  router.get(apiPath, (req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(projects.getProjectScopedFilePath(filename), 'utf8')));
    } catch (e) {
      const defaults = {};
      Object.keys(fieldSpecs).forEach((k) => { defaults[k] = fieldSpecs[k].default; });
      res.set('Cache-Control', 'no-store').json(defaults);
    }
  });
  router.post(apiPath, (req, res) => {
    const b = req.body || {};
    const clampNum = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || d));
    const layout = {};
    Object.keys(fieldSpecs).forEach((k) => {
      const spec = fieldSpecs[k];
      layout[k] = clampNum(b[k], spec.default, spec.min, spec.max);
    });
    fs.writeFileSync(projects.getProjectScopedFilePath(filename), JSON.stringify(layout));
    /* Same 'reload' broadcast overlay_styles.json saves already trigger
       (routes/overlayStyles.js) — so every other open ingame.html
       instance/OBS browser source picks up the change too, not just
       this dashboard's own live preview (which already updates instantly
       via icPreviewLayout/gdcPreviewLayout/eccPreviewLayout while
       dragging, with no reload needed for that part). */
    state.overlayClients.forEach((c) => { try { c.write('event: reload\ndata: {}\n\n'); } catch (e) {} });
    res.json({ ok: true, ...layout });
  });
}

const SIDE_OFFSET_FIELDS = {
  homeOffsetX: { default: 0, min: -400, max: 400 },
  homeOffsetY: { default: 0, min: -400, max: 400 },
  awayOffsetX: { default: 0, min: -400, max: 400 },
  awayOffsetY: { default: 0, min: -400, max: 400 },
};

registerLayoutRoutes('itemcheck_layout.json', '/api/itemcheck-layout', {
  goldFontSize: { default: 30, min: 10, max: 60 },
  ...SIDE_OFFSET_FIELDS,
});
registerLayoutRoutes('golddiffcheck_layout.json', '/api/golddiffcheck-layout', SIDE_OFFSET_FIELDS);
registerLayoutRoutes('emblemcheck_layout.json', '/api/emblemcheck-layout', SIDE_OFFSET_FIELDS);

// Dashboard Control tab — which Fullscreen features the user has archived
// (moved out of the main "Features" list into the collapsible "Archived"
// section, purely to declutter the panel for a show that doesn't need
// them — the routes/scenes themselves stay fully intact either way).
// Project-scoped like overlay_styles.json — each project gets its own
// archived set, root file is the no-project-active default. Keyed by the
// same feature-key every other Fullscreen toggle uses (feat.show.split('/')[2]).
const FULLSCREEN_ARCHIVED_FILE = 'fullscreen_archived_features.json';

router.get('/api/fullscreen-archived-features', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(projects.getProjectScopedFilePath(FULLSCREEN_ARCHIVED_FILE), 'utf8')));
  } catch (e) {
    res.set('Cache-Control', 'no-store').json({ keys: [] });
  }
});

router.post('/api/fullscreen-archived-features', (req, res) => {
  const keys = Array.isArray((req.body || {}).keys) ? req.body.keys.filter((k) => typeof k === 'string') : [];
  fs.writeFileSync(projects.getProjectScopedFilePath(FULLSCREEN_ARCHIVED_FILE), JSON.stringify({ keys }));
  res.json({ ok: true, keys });
});

// Game API base URL — GET to read, POST { url } to update
const GAME_URL_FILE = path.join(__dirname, '..', 'game_api_url.json');

router.get('/api/game-url', (req, res) => {
  res.json({ url: readUrlForMode(GAME_URL_FILE, '') });
});

router.post('/api/game-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim().replace(/\/$/, '');
  writeUrlForMode(GAME_URL_FILE, url);
  res.json({ ok: true, url });
});

// Standings API base URL — GET to read, POST { url } to update. Read fresh
// on every tick by lib/pollers.js's pollStandings(), same as GAME_URL_FILE.
const STANDINGS_URL_FILE    = path.join(__dirname, '..', 'standings_api_url.json');
const STANDINGS_API_DEFAULT = 'http://10.88.120.60:5001/api/standing/';

router.get('/api/standings-url', (req, res) => {
  res.json({ url: readUrlForMode(STANDINGS_URL_FILE, STANDINGS_API_DEFAULT) });
});

router.post('/api/standings-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(STANDINGS_URL_FILE, url);
  res.json({ ok: true, url });
});

// Player photo manifest — returns available filenames per pose for client-side lookup
const PHOTOS_DIR = path.join(__dirname, '..', 'photos');

// GET /api/signature-photos — player names (igns) with a SIGNATURE cutout
// available in photos/SIGNATURE/, e.g. for the kill-event photo popup.
// Filename convention: <ign>_SIGNATURE_resized.png
router.get('/api/signature-photos', (req, res) => {
  try {
    const names = fs.readdirSync(path.join(PHOTOS_DIR, 'SIGNATURE'))
      .filter(f => f.endsWith('_SIGNATURE_resized.png'))
      .map(f => f.slice(0, -'_SIGNATURE_resized.png'.length));
    res.set('Cache-Control', 'no-store').json({ names });
  } catch (e) {
    res.status(500).json({ names: [] });
  }
});

router.get('/api/photo-manifest', (req, res) => {
  try {
    const poses = ['VICTORY', 'DEFEAT'];
    const manifest = {};
    for (const pose of poses) {
      const dir = path.join(PHOTOS_DIR, pose);
      try {
        manifest[pose] = fs.readdirSync(dir).filter(f => /\.png$/i.test(f));
      } catch { manifest[pose] = []; }
    }
    res.set('Cache-Control', 'no-store').json(manifest);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dynamic content — GET to read, POST { ph_ticker, en_ticker, ph_headline, en_headline, match_headline } to update
const DYNAMIC_FILE = path.join(__dirname, '..', 'dynamic_content.json');
const DYNAMIC_DEFAULTS = { ph_ticker: '', en_ticker: '', ph_headline: '', en_headline: '', match_headline: '' };

router.get('/api/dynamic-content', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(DYNAMIC_FILE, 'utf8')));
  } catch {
    res.set('Cache-Control', 'no-store').json(DYNAMIC_DEFAULTS);
  }
});

router.post('/api/dynamic-content', (req, res) => {
  const b = req.body || {};
  const data = {
    ph_ticker:      String(b.ph_ticker      || ''),
    en_ticker:      String(b.en_ticker      || ''),
    ph_headline:    String(b.ph_headline    || ''),
    en_headline:    String(b.en_headline    || ''),
    match_headline: String(b.match_headline || ''),
  };
  fs.writeFileSync(DYNAMIC_FILE, JSON.stringify(data, null, 2));
  res.set('Cache-Control', 'no-store').json({ ok: true, data });
});

// vMix Data Sources needs the JSON root to be an array of row objects (it
// binds title fields to columns of a table) — a bare object like the
// editor's own /api/dynamic-content is treated as an invalid/unreadable
// feed. Same underlying file, just wrapped in a one-row array for vMix.
router.get('/api/dynamic-content/vmix', (req, res) => {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DYNAMIC_FILE, 'utf8'));
  } catch {
    data = DYNAMIC_DEFAULTS;
  }
  res.set('Cache-Control', 'no-store').json([data]);
});

// Server-side proxy — serves the game API payload lib/pollers.js already
// polls every second (state.lastGameData), so every Fullscreen.html board reads
// an in-memory cache instead of each one triggering its own live round-trip
// to the upstream game API. Falls back to a direct fetch only if the poller
// hasn't landed a payload yet (e.g. right at server startup).
//
// ?fresh=1 skips state.lastGameData and always does a live fetch to the
// upstream game API right then — for boards that need the API's current
// value at the exact moment they read it (Player Board, Post Emblems, Post
// Items, Post Stats) rather than whatever the once-a-second poll last
// caught. Still goes through this server, not the browser, so it works the
// same everywhere the cached path already works (no new CORS/reachability
// requirements on whatever machine renders Fullscreen.html).
//
// ?raw=1 skips the dashboard's saved seat arrangement (see
// lib/seatArrangement.js) and returns seat_1..5 exactly as the upstream
// sends them — used by the Arrangement tab's own live preview, which
// needs a stable, un-rearranged baseline to drag from regardless of
// whatever's currently applied. Combinable with ?fresh=1.
router.get('/api/gamedata-proxy', async (req, res) => {
  const raw = req.query.raw === '1';
  if (state.lastGameData && req.query.fresh !== '1') {
    return res.set('Cache-Control', 'no-store').json(raw ? state.lastGameDataRaw : state.lastGameData);
  }
  try {
    const gameUrl = readUrlForMode(GAME_URL_FILE, '').trim();
    if (!gameUrl) return res.status(404).json({ error: 'no game URL configured' });
    // Same reasoning as /api/postinfo-proxy / /api/lineuprate-data below —
    // an unreachable upstream would otherwise hang this request (and every
    // caller waiting on it — including the dashboard's own MVP player
    // picker) indefinitely, piling up hung browser connections to this
    // server's own host until the ~6-per-host cap is exhausted and
    // everything else on the dashboard queues forever. Fail fast instead.
    const r = await fetch(gameUrl, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(raw ? data : seatArrangement.applyArrangement(data, seatArrangement.readArrangement()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Post-Info API base URL — GET to read, POST { url } to update. Separate
// feed from the main Game API: the live sub-info feed has no orange/purple
// jungle-buff counts, but this one does, in camp_list[].enemy_area_get
// (an array of per-time-window deltas — sum them for a running total, see
// Fullscreen.html's fetchCmbData/fetchMiddleBoardData).
const POST_INFO_URL_FILE    = path.join(__dirname, '..', 'post_info_api_url.json');
const POST_INFO_URL_DEFAULT = 'http://10.88.120.60:5001/api/post-info/';

router.get('/api/post-info-url', (req, res) => {
  res.json({ url: readUrlForMode(POST_INFO_URL_FILE, POST_INFO_URL_DEFAULT) });
});

router.post('/api/post-info-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(POST_INFO_URL_FILE, url);
  res.json({ ok: true, url });
});

// Server-side proxy — serves the post-info payload lib/pollers.js polls
// (state.lastPostInfoData), same caching pattern as /api/gamedata-proxy.
// ?raw=1 — see /api/gamedata-proxy's own comment; same deal here.
router.get('/api/postinfo-proxy', async (req, res) => {
  const raw = req.query.raw === '1';
  if (state.lastPostInfoData) {
    return res.set('Cache-Control', 'no-store').json(raw ? state.lastPostInfoDataRaw : state.lastPostInfoData);
  }
  try {
    const url = readUrlForMode(POST_INFO_URL_FILE, POST_INFO_URL_DEFAULT).trim();
    if (!url) return res.status(404).json({ error: 'no post-info URL configured' });
    // Same reasoning as /api/lineuprate-data below — an unreachable upstream
    // (e.g. the game-client PC off the network) would otherwise hang this
    // request indefinitely. Fullscreen.html's middleboard polls this every 3s
    // whenever visible, uncached, with no dedup across tabs, so a hung
    // upstream here piles up hung connections fast once a few overlay tabs
    // are open — fail fast instead.
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(raw ? data : seatArrangement.applyArrangement(data, seatArrangement.readArrangement()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Dashboard "Arrangement" tab — lets the user reorder seat_1..seat_5 per
// camp for both /api/gamedata-proxy and /api/postinfo-proxy, without
// restarting any overlay. GET returns the saved arrangement (always a
// valid { camp1, camp2 } permutation pair — see lib/seatArrangement.js).
// POST validates + saves it, THEN re-derives state.lastGameData/
// lastPostInfoData from the untouched Raw copies right away (instead of
// waiting for the next 1s poll tick) and broadcasts it over SSE so
// ingame.html's masterPoll (which reads the upstream Game API directly,
// not through this proxy — see overlay-core.js's getPlayer()) picks up
// the same change live, no reload needed either.
router.get('/api/seat-arrangement', (req, res) => {
  res.set('Cache-Control', 'no-store').json(seatArrangement.readArrangement());
});

router.post('/api/seat-arrangement', (req, res) => {
  const body = req.body || {};
  const token = body.token || req.headers['x-dashboard-token'];
  if (!token || token !== getDashboardPassword()) return res.status(401).json({ error: 'Unauthorized' });
  if (!seatArrangement.isValidPerm(body.camp1) || !seatArrangement.isValidPerm(body.camp2)) {
    return res.status(400).json({ error: 'camp1/camp2 must each be a permutation of [1,2,3,4,5]' });
  }
  const before = seatArrangement.readArrangement();
  const changed = JSON.stringify(before) !== JSON.stringify({ camp1: body.camp1, camp2: body.camp2 });
  const saved = seatArrangement.writeArrangement(body);
  if (state.lastGameDataRaw) state.lastGameData = seatArrangement.applyArrangement(state.lastGameDataRaw, saved);
  if (state.lastPostInfoDataRaw) state.lastPostInfoData = seatArrangement.applyArrangement(state.lastPostInfoDataRaw, saved);
  // Only broadcast (and thus only make ingame.html reset its Level 15/Item/
  // Trinity/Swap baselines — see resetReactiveBaselines() in
  // overlay-core.js) when the arrangement actually changed. Re-saving the
  // same order shouldn't cost every open ingame.html tab a ~1s "blind"
  // window for no reason.
  if (changed) {
    state.overlayClients.forEach((c) => { try { c.write(`event: seat_arrangement\ndata: ${JSON.stringify(saved)}\n\n`); } catch (e) {} });
  }
  res.json({ ok: true, ...saved });
});

// HRM Server (heartrate ingestion) base URL — GET to read, POST { url } to update
const HRM_URL_FILE    = path.join(__dirname, '..', 'hrm_api_url.json');
const HRM_URL_DEFAULT = 'http://<HRM-SERVER-IP>:5055';

router.get('/api/hrm-url', (req, res) => {
  res.json({ url: readUrlForMode(HRM_URL_FILE, HRM_URL_DEFAULT) });
});

router.post('/api/hrm-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim().replace(/\/$/, '');
  writeUrlForMode(HRM_URL_FILE, url);
  res.json({ ok: true, url });
});

// Team Head to Head (Team Hexagon) API base URL — GET to read, POST { url } to update
const HEXAGON_URL_FILE    = path.join(__dirname, '..', 'hexagon_api_url.json');
const HEXAGON_URL_DEFAULT = 'https://theapi.dpdns.org/api/teamh2h/';

router.get('/api/hexagon-url', (req, res) => {
  res.json({ url: readUrlForMode(HEXAGON_URL_FILE, HEXAGON_URL_DEFAULT) });
});

router.post('/api/hexagon-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(HEXAGON_URL_FILE, url);
  res.json({ ok: true, url });
});

// Server-side proxy — fetches the Team Head to Head API and returns JSON, avoids browser CORS issues
router.get('/api/hexagon-data', async (req, res) => {
  try {
    const url = readUrlForMode(HEXAGON_URL_FILE, HEXAGON_URL_DEFAULT).trim();
    // Same reasoning as /api/lineuprate-data below — fail fast instead of
    // hanging indefinitely on an unreachable upstream.
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// MVP Highlights (game-mvp/view) API base URL — GET to read, POST { url } to update
const HIGHLIGHTS_URL_FILE    = path.join(__dirname, '..', 'highlights_api_url.json');
const HIGHLIGHTS_URL_DEFAULT = 'https://theapi.dpdns.org/api/game-mvp/view/';

router.get('/api/highlights-url', (req, res) => {
  res.json({ url: readUrlForMode(HIGHLIGHTS_URL_FILE, HIGHLIGHTS_URL_DEFAULT) });
});

router.post('/api/highlights-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(HIGHLIGHTS_URL_FILE, url);
  res.json({ ok: true, url });
});

// Server-side proxy — fetches the MVP Highlights API and returns JSON, avoids browser CORS issues
router.get('/api/highlights-data', async (req, res) => {
  try {
    const url = readUrlForMode(HIGHLIGHTS_URL_FILE, HIGHLIGHTS_URL_DEFAULT).trim();
    // Same reasoning as /api/lineuprate-data below — fail fast instead of
    // hanging indefinitely on an unreachable upstream.
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Draft Index (Line-Up Rate) API base URL — GET to read, POST { url } to update
const LINEUPRATE_URL_FILE    = path.join(__dirname, '..', 'lineuprate_api_url.json');
const LINEUPRATE_URL_DEFAULT = 'https://theapi.dpdns.org/api/line-up-rate/';

router.get('/api/lineuprate-url', (req, res) => {
  res.json({ url: readUrlForMode(LINEUPRATE_URL_FILE, LINEUPRATE_URL_DEFAULT) });
});

router.post('/api/lineuprate-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(LINEUPRATE_URL_FILE, url);
  res.json({ ok: true, url });
});

// Server-side proxy — fetches the Draft Index (Line-Up Rate) API and returns JSON, avoids browser CORS issues
router.get('/api/lineuprate-data', async (req, res) => {
  try {
    const url = readUrlForMode(LINEUPRATE_URL_FILE, LINEUPRATE_URL_DEFAULT).trim();
    // Upstream has hung/errored for extended periods before (Cloudflare 530s
    // seen against theapi.dpdns.org) — a plain fetch() with no timeout would
    // leave this request (and every client awaiting it, e.g. DraftIndex.html's
    // Phase 2 reveal) hanging indefinitely instead of failing fast.
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Draft (pick/ban) API base URL — GET to read, POST { url } to update.
// Separate from /api/game-url: Draft.html polls this dedicated endpoint
// (draft-info-only format) instead of the general game-data feed.
const DRAFT_URL_FILE    = path.join(__dirname, '..', 'draft_api_url.json');
const DRAFT_URL_DEFAULT = 'https://theapi.dpdns.org/sql/draft-info-only/';

router.get('/api/draft-url', (req, res) => {
  res.json({ url: readUrlForMode(DRAFT_URL_FILE, DRAFT_URL_DEFAULT) });
});

router.post('/api/draft-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(DRAFT_URL_FILE, url);
  res.json({ ok: true, url });
});

// Draft Recap API base URL — GET to read, POST { url } to update. Draft.html's
// Draft Recap panel (previous-draft format) polls this dedicated endpoint,
// separate from the live draft-info-only feed above.
const DRAFT_RECAP_URL_FILE    = path.join(__dirname, '..', 'draft_recap_api_url.json');
const DRAFT_RECAP_URL_DEFAULT = 'https://theapi.dpdns.org/api/previous-draft/';

router.get('/api/draft-recap-url', (req, res) => {
  res.json({ url: readUrlForMode(DRAFT_RECAP_URL_FILE, DRAFT_RECAP_URL_DEFAULT) });
});

router.post('/api/draft-recap-url', (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  writeUrlForMode(DRAFT_RECAP_URL_FILE, url);
  res.json({ ok: true, url });
});

module.exports = router;
