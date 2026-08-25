// server.js — Express app entry point
const express = require('express');
const path    = require('path');

const { PORT } = require('./lib/config');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  next();
});

// Match state — inline so no router indirection
const fs         = require('fs');
const matchState = require('./lib/matchState');
const teamLineups = require('./lib/teamLineups');

function getMatchPassword() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).dashboard_password || ''; }
  catch (e) { return ''; }
}

app.get('/match/state', function (req, res) {
  console.log('[match] GET /match/state');
  res.json(matchState.get());
});

app.get('/match/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  matchState.addClient(res);
  req.on('close', function () { matchState.removeClient(res); });
});

app.post('/match/auth', function (req, res) {
  console.log('[match] POST /match/auth body:', req.body);
  var token = (req.body || {}).token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});

app.post('/match/state', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  delete body.token;
  matchState.set(body);
  res.json({ ok: true, state: matchState.get() });
});

// Waiting Screen TVC / Waiting Lobby countdown — server-authoritative so it
// keeps running (or stays paused) across overlay refreshes and reconnects.
app.post('/match/timer', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  if      (body.action === 'start') matchState.startTimer();
  else if (body.action === 'pause') matchState.pauseTimer();
  else if (body.action === 'set')   matchState.setTimerRemaining(body.seconds);
  else return res.status(400).json({ error: 'Unknown action' });
  res.json({ ok: true, state: matchState.get() });
});

// Standings state — same dashboard password as match state
const standingsState = require('./lib/standingsState');

app.get('/standings/state', function (req, res) {
  res.json(standingsState.get());
});

app.get('/standings/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  standingsState.addClient(res);
  req.on('close', function () { standingsState.removeClient(res); });
});

app.post('/standings/auth', function (req, res) {
  var token = (req.body || {}).token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});

app.post('/standings/state', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  delete body.token;
  standingsState.set(body);
  res.json({ ok: true, state: standingsState.get() });
});

// Map Selection state — coin toss / side / map / winner per game, own
// dashboard tab. Same dashboard password as match/standings state.
const mapSelectionState = require('./lib/mapSelectionState');

app.get('/mapselection/state', function (req, res) {
  res.json(mapSelectionState.get());
});

app.get('/mapselection/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  mapSelectionState.addClient(res);
  req.on('close', function () { mapSelectionState.removeClient(res); });
});

app.post('/mapselection/auth', function (req, res) {
  var token = (req.body || {}).token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});

app.post('/mapselection/action', function (req, res) {
  var body   = req.body || {};
  var token  = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  var action = body.action;
  var game   = body.game;
  switch (action) {
    case 'toss':   mapSelectionState.setToss(game, body.winner); break;
    case 'side':   mapSelectionState.setSide(game, body.side); break;
    case 'map':    mapSelectionState.setMap(game, body.map); break;
    case 'winner': mapSelectionState.setWinner(game, body.winner); break;
    case 'reopen': mapSelectionState.reopenGame(game); break;
    case 'resetGame': mapSelectionState.resetGame(game); break;
    case 'resetAll':  mapSelectionState.resetAll(); break;
    default: return res.status(400).json({ error: 'Unknown action' });
  }
  res.json({ ok: true, state: mapSelectionState.get() });
});

// Team roster — mainroster.json. Reads go through the existing static
// file serving (GET /mainroster.json, already no-cache'd below); this is
// just the write side, same dashboard password as match/standings state.
app.post('/api/roster', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  var data = body.data;
  if (!data || typeof data !== 'object' || !data.teams || !data.players) {
    return res.status(400).json({ error: 'Payload must include teams and players' });
  }
  try {
    fs.writeFileSync(path.join(__dirname, 'mainroster.json'), JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not write mainroster.json' });
  }
});

// Last-used per-team role assignment (bench swaps) — restored the next time
// that team is picked instead of resetting to mainroster.json's role-sorted
// default. Public read (the dashboard needs it right after picking a team),
// same dashboard password as match/standings state for the write.
app.get('/match/team-lineups', function (req, res) {
  res.json(teamLineups.getAll());
});

app.post('/match/team-lineups', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getMatchPassword()) return res.status(401).json({ error: 'Unauthorized' });
  teamLineups.set(body.teamId, body.lineup);
  res.json({ ok: true });
});

// Static assets — HTML files served fresh, other assets cached for 1 day
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  index: false,
  setHeaders: function(res, filePath) {
    const p = filePath.split(path.sep).join('/'); // normalize Windows backslashes for the checks below
    if (p.endsWith('.html') || p.endsWith('.css') || p.includes('/html/js/') || p.endsWith('mainroster.json') || p.includes('/logos/') || p.includes('/photos/TALENTS/')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Routes
app.use(require('./routes/feed'));
app.use(require('./routes/overlay'));
app.use(require('./routes/led'));
app.use(require('./routes/fights'));
app.use(require('./routes/positions'));
app.use(require('./routes/postgame'));
app.use(require('./routes/proxy'));
app.use(require('./routes/dashboard'));
app.use(require('./routes/overlayStyles'));
app.use(require('./routes/devapi'));

// Debug: log unmatched routes
app.use(function (req, res, next) {
  console.log('[404]', req.method, req.url);
  next();
});

// Start pollers (kicks off setInterval loops + initial polls)
require('./lib/pollers');

app.listen(PORT, '0.0.0.0', () => {
  console.log("================================================");
  console.log(`  Overlay Server running on :${PORT}`);
  console.log(`  Dashboard  → http://localhost:${PORT}/`);
  console.log(`  Feed       → http://localhost:${PORT}/feed`);
  console.log(`  Camp Feed  → http://localhost:${PORT}/feed/order`);
  console.log(`  Postgame   → http://localhost:${PORT}/postgame`);
  console.log(`  League     → http://localhost:${PORT}/stats/league`);
  console.log(`  Overlay    → GET  http://localhost:${PORT}/overlay/slot1  (show)`);
  console.log(`             → GET  http://localhost:${PORT}/overlay/hide   (hide)`);
  console.log(`  Fights OL  → GET  http://localhost:${PORT}/overlay/fights/show`);
  console.log(`             → GET  http://localhost:${PORT}/overlay/fights/hide`);
  console.log(`  Positions  → GET  http://localhost:${PORT}/positions`);
  console.log(`  Fights     → GET  http://localhost:${PORT}/fights`);
  console.log(`             →      ?last=N  for last N fights`);
  console.log(`             →      ?camp=1&seat=2&from=0&to=600`);
  console.log(`             →      camp 1|2  seat 1-5  from/to in seconds`);
  console.log(`  LED Side   → GET  http://localhost:${PORT}/led/home  (HOME)`);
  console.log(`             → GET  http://localhost:${PORT}/led/swap  (SWAP/AWAY)`);
  console.log(`  LED Health → GET  http://localhost:${PORT}/led/healthshow`);
  console.log(`             → GET  http://localhost:${PORT}/led/healthhide`);
  console.log(`  LED WinPct → GET  http://localhost:${PORT}/led/winshow`);
  console.log(`             → GET  http://localhost:${PORT}/led/winhide`);
  console.log(`  LED Fight  → GET  http://localhost:${PORT}/led/fightshow`);
  console.log(`             → GET  http://localhost:${PORT}/led/fighthide`);
  console.log(`  LED Draft  → GET  http://localhost:${PORT}/led/draftpredshow`);
  console.log(`             → GET  http://localhost:${PORT}/led/draftpredhide`);
  console.log(`  Match      → GET  http://localhost:${PORT}/match/state`);
  console.log(`             → POST http://localhost:${PORT}/match/state  (auth)`);
  console.log(`             → GET  http://localhost:${PORT}/match/events  (SSE)`);
  console.log(`  Timer      → POST http://localhost:${PORT}/match/timer  { action: start|pause|set, seconds }`);
  console.log(`  Lineups    → GET  http://localhost:${PORT}/match/team-lineups`);
  console.log(`             → POST http://localhost:${PORT}/match/team-lineups  (auth)`);
  console.log(`  MapSelect  → GET  http://localhost:${PORT}/mapselection/state`);
  console.log(`             → POST http://localhost:${PORT}/mapselection/action  (auth)`);
  console.log(`             → GET  http://localhost:${PORT}/mapselection/events  (SSE)`);
  console.log(`  Sponsors   → GET  http://localhost:${PORT}/api/sponsors`);
  console.log(`             → GET  http://localhost:${PORT}/api/sponsors-config`);
  console.log(`             → POST http://localhost:${PORT}/api/sponsors-config  (auth)`);
  console.log(`  Game API   → GET  http://localhost:${PORT}/api/game-url`);
  console.log(`             → POST http://localhost:${PORT}/api/game-url  { url }`)
  console.log("================================================");
});
