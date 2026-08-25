// routes/readings.js — GET /readings, the contract overlay_server polls
const express = require('express');
const router  = express.Router();
const state   = require('../state');

router.get('/readings', (req, res) => {
  res.set('Cache-Control', 'no-store').json(Object.values(state.readings));
});

module.exports = router;
