// routes/redbull.js — Red Bull Wings Cup project: match-board data + show/hide for the 21 graphics.
// Only the redbull project's pages/dashboard mode call any of this.
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const rb      = require('../lib/redbull');

// Writes use the same dashboard password as the standard Match Board (config.json → dashboard_password).
function auth(req, res, next) {
  var pw = '';
  try { pw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')).dashboard_password || ''; } catch (e) {}
  var body = req.body || {};
  var token = body.token || req.headers['x-dashboard-token'];
  if (!token || token !== pw) return res.status(401).json({ error: 'Unauthorized' });
  delete body.token;
  next();
}

const nostore = { 'Cache-Control': 'no-store' };

// Match-board data (the dashboard's Red Bull Match Board tab writes here).
router.get('/rb/state', (req, res) => res.set(nostore).json(rb.get()));
router.post('/rb/state', auth, (req, res) => {
  rb.set(req.body || {});
  res.set(nostore).json({ ok: true, state: rb.get() });
});
router.post('/rb/timer', auth, (req, res) => {
  const b = req.body || {};
  if (b.action === 'start') rb.startTimer();
  else if (b.action === 'pause') rb.pauseTimer();
  else if (b.action === 'set') rb.setTimerRemaining(b.seconds);
  else return res.status(400).json({ error: 'action must be start|pause|set' });
  res.set(nostore).json({ ok: true, state: rb.get() });
});

// What's live right now (restore-on-load for pages, indicator state for the dashboard).
router.get('/overlay/rb/state', (req, res) => res.set(nostore).json(rb.liveState()));
router.get('/overlay/rb/hide',  (req, res) => res.set(nostore).json({ ok: true, live: rb.hideAll() }));

// /overlay/<key>/show|hide — one pair per graphic, key = rb_<name>.
Object.keys(rb.GRAPHICS).forEach((key) => {
  router.get('/overlay/' + key + '/show', (req, res) => res.set(nostore).json({ ok: true, action: 'show', live: rb.show(key) }));
  router.get('/overlay/' + key + '/hide', (req, res) => res.set(nostore).json({ ok: true, action: 'hide', live: rb.hide(key) }));
});

module.exports = router;
