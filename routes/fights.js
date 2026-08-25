// routes/fights.js — GET /fights, /fights-static, /fights-overlay
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const state   = require('../lib/state');

// GET /fights-static — fights.json (for debug mode)
router.get('/fights-static', (req, res) => {
  const file = path.join(__dirname, '..', 'fights.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "fights.json not found" });
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "fights.json parse failed: " + e.message });
  }
});

// GET /fights-overlay — fight recap overlay HTML
router.get('/fights-overlay', (req, res) => {
  const file = path.join(__dirname, '..', 'html', 'fights.html');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "fights.html not found" });
  }
  res.setHeader("Content-Type", "text/html");
  res.send(fs.readFileSync(file, "utf8"));
});

// GET /fights?last=N
router.get('/fights', (req, res) => {
  const last   = req.query.last ? parseInt(req.query.last) : null;
  const list   = last ? state.fightLog.slice(-last) : [...state.fightLog];

  const active = state.activeFight ? {
    id:              state.activeFight.id,
    start_time_s:    state.activeFight.start_time_s,
    start_time_fmt:  state.activeFight.start_time_fmt,
    last_active_s:   state.activeFight.last_active_s,
    duration_so_far: state.gameState.game_time_s - state.activeFight.start_time_s,
  } : null;

  res.json({
    game:         { state: state.gameState.state, battleid: state.gameState.battleid, game_time: state.gameState.game_time_fmt },
    active_fight: active,
    count:        list.length,
    fights:       list,
  });
});

module.exports = router;
