// routes/bpm.js — POST /bpm, GET /bpm, GET /bpm/log
const express = require('express');
const router  = express.Router();
const state   = require('../state');
const { MAX_LOG } = require('../config');

// POST /bpm — receive from Android watches
router.post('/bpm', (req, res) => {
  const data = req.body;
  const bpm  = data.bpm;
  const pid  = data.player_id || "player1";

  if (!bpm || typeof bpm !== "number") {
    return res.status(400).json({ error: "missing or invalid bpm" });
  }

  const now = new Date().toISOString();
  if (state.readings[pid]) {
    state.readings[pid].bpm       = bpm;
    state.readings[pid].last_bpm  = bpm;
    state.readings[pid].status    = "ok";
    state.readings[pid].last_seen = now;
  }

  state.log.push({ player_id: pid, bpm, time: new Date().toLocaleTimeString() });
  if (state.log.length > MAX_LOG) state.log.shift();

  console.log(`[BPM] player=${pid} bpm=${bpm}`);
  res.json({ ok: true });
});

// GET /bpm — latest single reading
router.get('/bpm', (req, res) => {
  const last = state.log[state.log.length - 1] || null;
  res.json(last || { bpm: null, message: "No data yet" });
});

// GET /bpm/log
router.get('/bpm/log', (req, res) => {
  const limit = parseInt(req.query.limit || "100");
  const slice = state.log.slice(-limit).reverse();
  res.json({ count: slice.length, readings: slice });
});

module.exports = router;
