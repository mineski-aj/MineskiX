// routes/devapi.js — GET /api/sub-info/
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const state   = require('../lib/state');
const { getApiMode, setApiMode, readUrlForMode, writeUrlForMode } = require('../lib/apiMode');

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

// Sponsor logos + categorization — logos live in /sponsors/, categorization
// (grouping, per-category loop duration, display order) is edited from the
// dashboard's Sponsors tab and persisted to sponsors_config.json.
const SPONSORS_DIR         = path.join(__dirname, '..', 'sponsors');
const SPONSORS_CONFIG_FILE = path.join(__dirname, '..', 'sponsors_config.json');
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
    return fs.readdirSync(SPONSORS_DIR).filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f));
  } catch (e) {
    return [];
  }
}

function readSponsorsConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(SPONSORS_CONFIG_FILE, 'utf8'));
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
    fs.writeFileSync(SPONSORS_CONFIG_FILE, JSON.stringify({ categories: data.categories, hiddenInIngame }, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not write sponsors_config.json' });
  }
});

// Credit Reel content — plain text, edited from the dashboard's Edit tab
// (or by hand-editing this file / pasting into the textarea) and rendered
// by mplfs.html's crParseText(). GET to read, POST { text } to update.
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

// Item Check panel layout tuning (mploverlay_v7's item-check panel) —
// goldGap is the vertical space between gold-amount rows (px added on top
// of each row's own 31px height); homeOffsetX/Y and awayOffsetY/Y shift
// every element on that side (portraits, items, gold) together, so the
// whole blue/red half can be nudged in one edit instead of repositioning
// each row by hand. GET to read, POST the full object to update.
const ITEMCHECK_LAYOUT_FILE = path.join(__dirname, '..', 'itemcheck_layout.json');
const ITEMCHECK_LAYOUT_DEFAULTS = { goldGap: 26, homeOffsetX: 0, homeOffsetY: 0, awayOffsetX: 0, awayOffsetY: 0 };

router.get('/api/itemcheck-layout', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(JSON.parse(fs.readFileSync(ITEMCHECK_LAYOUT_FILE, 'utf8')));
  } catch (e) {
    res.set('Cache-Control', 'no-store').json(ITEMCHECK_LAYOUT_DEFAULTS);
  }
});

router.post('/api/itemcheck-layout', (req, res) => {
  const b = req.body || {};
  const clampNum = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || d));
  const layout = {
    goldGap:     clampNum(b.goldGap,     26, 0,    200),
    homeOffsetX: clampNum(b.homeOffsetX, 0,  -400, 400),
    homeOffsetY: clampNum(b.homeOffsetY, 0,  -400, 400),
    awayOffsetX: clampNum(b.awayOffsetX, 0,  -400, 400),
    awayOffsetY: clampNum(b.awayOffsetY, 0,  -400, 400),
  };
  fs.writeFileSync(ITEMCHECK_LAYOUT_FILE, JSON.stringify(layout));
  res.json({ ok: true, ...layout });
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
// polls every second (state.lastGameData), so every mplfs.html board reads
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
// requirements on whatever machine renders mplfs.html).
router.get('/api/gamedata-proxy', async (req, res) => {
  if (state.lastGameData && req.query.fresh !== '1') {
    return res.set('Cache-Control', 'no-store').json(state.lastGameData);
  }
  try {
    const gameUrl = readUrlForMode(GAME_URL_FILE, '').trim();
    if (!gameUrl) return res.status(404).json({ error: 'no game URL configured' });
    const r = await fetch(gameUrl);
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Post-Info API base URL — GET to read, POST { url } to update. Separate
// feed from the main Game API: the live sub-info feed has no orange/purple
// jungle-buff counts, but this one does, in camp_list[].enemy_area_get
// (an array of per-time-window deltas — sum them for a running total, see
// mplfs.html's fetchCmbData/fetchMiddleBoardData).
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
router.get('/api/postinfo-proxy', async (req, res) => {
  if (state.lastPostInfoData) {
    return res.set('Cache-Control', 'no-store').json(state.lastPostInfoData);
  }
  try {
    const url = readUrlForMode(POST_INFO_URL_FILE, POST_INFO_URL_DEFAULT).trim();
    if (!url) return res.status(404).json({ error: 'no post-info URL configured' });
    // Same reasoning as /api/lineuprate-data below — an unreachable upstream
    // (e.g. the game-client PC off the network) would otherwise hang this
    // request indefinitely. mplfs.html's middleboard polls this every 3s
    // whenever visible, uncached, with no dedup across tabs, so a hung
    // upstream here piles up hung connections fast once a few overlay tabs
    // are open — fail fast instead.
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
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
