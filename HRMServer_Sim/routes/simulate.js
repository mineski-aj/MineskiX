// routes/simulate.js — controls for the fake watch simulator, for testing
// edge cases (a watch dropping mid-game, a BPM spike) without real hardware.
const express = require('express');
const router  = express.Router();
const sim     = require('../simulate');
const state   = require('../state');

router.post('/simulate/drop', (req, res) => {
  const pid = req.body.player_id;
  if (!pid) return res.status(400).json({ error: "player_id required" });
  sim.drop(pid);
  res.json({ ok: true, dropped: pid });
});

router.post('/simulate/restore', (req, res) => {
  const pid = req.body.player_id;
  if (!pid) return res.status(400).json({ error: "player_id required" });
  sim.restore(pid);
  res.json({ ok: true, restored: pid });
});

router.post('/simulate/spike', (req, res) => {
  const pid = req.body.player_id;
  if (!pid) return res.status(400).json({ error: "player_id required" });
  sim.spike(pid);
  res.json({ ok: true, spiked: pid });
});

router.get('/simulate/status', (req, res) => {
  res.json({ dropped: Object.keys(state.dropped) });
});

module.exports = router;
