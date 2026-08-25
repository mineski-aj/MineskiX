// routes/proxy.js — GET /proxy/*
const express = require('express');
const router  = express.Router();

// GET /proxy/predictions — proxy to draftpredict API
router.get('/proxy/predictions', async (req, res) => {
  const qs = req.url.slice('/proxy/predictions'.length); // preserve ?authKey=...
  const upstream = `https://r3z8c353h3.ap-southeast-1.awsapprunner.com/api/live/predictions${qs}`;
  try {
    const r    = await fetch(upstream);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /proxy/richguy?host=theapi.dpdns.org — server-side proxy to avoid CORS
router.get('/proxy/richguy', async (req, res) => {
  const host = req.query.host || "theapi.dpdns.org";
  try {
    const upstream = await fetch(`http://${host}/api/gold_vs_gold_sector`);
    const data = await upstream.json();
    res.set("Access-Control-Allow-Origin", "*").json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
