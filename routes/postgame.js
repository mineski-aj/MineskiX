// routes/postgame.js — GET /postgame, GET /stats/league
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { buildLeagueStats } = require('../lib/feeds');

// GET /postgame — last completed game stats from file
router.get('/postgame', (req, res) => {
  const file = path.join(__dirname, '..', 'postgame.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "No postgame data yet" });
  }
  res.setHeader("Content-Type", "application/json");
  res.send(fs.readFileSync(file, "utf8"));
});

// GET /stats/league — current matchup + all-time league stats
router.get('/stats/league', (req, res) => {
  try {
    const payload = buildLeagueStats();
    res.json(payload);
  } catch (e) {
    console.error("[LEAGUE] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
