// routes/positions.js — GET /positions
const express = require('express');
const router  = express.Router();
const state   = require('../lib/state');

router.get('/positions', (req, res) => {
  const campFilter = req.query.camp !== undefined ? parseInt(req.query.camp) : null;
  const seatFilter = req.query.seat !== undefined ? parseInt(req.query.seat) : null;
  const from       = parseInt(req.query.from ?? "0");
  const to         = parseInt(req.query.to   ?? "99999");

  const filtered = state.positionLog.filter(p =>
    p.game_time_s >= from &&
    p.game_time_s <= to &&
    (campFilter === null || p.camp === campFilter) &&
    (seatFilter === null || p.seat === seatFilter)
  );

  res.json({
    game:      { state: state.gameState.state, battleid: state.gameState.battleid, game_time: state.gameState.game_time_fmt },
    from,
    to,
    count:     filtered.length,
    positions: filtered,
  });
});

// GET /events — per-player K/D/A + objective events
router.get('/events', (req, res) => {
  const since    = parseInt(req.query.since || "0");
  const filtered = since > 0 ? state.gameEvents.filter(e => e.time_s >= since) : [...state.gameEvents];
  res.json({
    game:   { state: state.gameState.state, battleid: state.gameState.battleid },
    events: filtered,
  });
});

module.exports = router;
