// routes/match.js — match state API + SSE
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const router     = express.Router();
const matchState = require('../lib/matchState');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function getPassword() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).dashboard_password || '';
  } catch (e) {
    return '';
  }
}

function auth(req, res, next) {
  var body  = req.body || {};
  var token = body.token || req.headers['x-dashboard-token'];
  if (!token || token !== getPassword()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Public — overlays read this
router.get('/match/state', function (req, res) {
  console.log('[match] GET /match/state hit');
  try {
    var data = matchState.get();
    console.log('[match] state:', JSON.stringify(data));
    res.json(data);
  } catch (e) {
    console.error('[match] error in GET /match/state:', e);
    res.status(500).json({ error: e.message });
  }
});

// SSE — overlays subscribe for live updates
router.get('/match/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  matchState.addClient(res);
  req.on('close', function () { matchState.removeClient(res); });
});

// Protected — dashboard writes here
router.post('/match/state', auth, function (req, res) {
  var body = req.body || {};
  delete body.token;
  matchState.set(body);
  res.json({ ok: true, state: matchState.get() });
});

// Auth check only
router.post('/match/auth', function (req, res) {
  var body  = req.body || {};
  var token = body.token;
  if (!token || token !== getPassword()) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});

module.exports = router;
