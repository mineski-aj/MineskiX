// routes/feed.js — GET /feed, GET /feed/vmix, GET /feed/order
const express = require('express');
const router  = express.Router();
const { buildVmix, buildCampFeed } = require('../lib/feeds');

// GET /feed and GET /feed/vmix — vmix-style flat array
router.get('/feed', (req, res) => {
  res.json(buildVmix());
});

router.get('/feed/vmix', (req, res) => {
  res.json(buildVmix());
});

// GET /feed/order — camp-ordered feed with live stats
router.get('/feed/order', (req, res) => {
  res.json(buildCampFeed());
});

module.exports = router;
