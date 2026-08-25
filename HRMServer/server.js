// server.js — HRM Server entry point
const express = require('express');
const { PORT } = require('./config');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  next();
});

app.use(require('./routes/bpm'));
app.use(require('./routes/readings'));
app.use(require('./routes/dashboard'));

app.listen(PORT, '0.0.0.0', () => {
  console.log("================================================");
  console.log(`  HRM Server running on :${PORT}`);
  console.log(`  Dashboard  → http://localhost:${PORT}/`);
  console.log(`  Readings   → http://localhost:${PORT}/readings`);
  console.log(`  Latest BPM → http://localhost:${PORT}/bpm`);
  console.log(`  BPM Log    → http://localhost:${PORT}/bpm/log`);
  console.log(`  Ingest     → POST http://localhost:${PORT}/bpm  { player_id, bpm }`);
  console.log("================================================");
});
