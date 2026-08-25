// server.js — Fake HRM Server entry point (SIMULATED, no real watches)
// Same /readings + /bpm contract as the real HRMServer, so overlay_server's
// hrm_api_url.json can point here unchanged. Drives continuous fake BPM data
// via simulate.js instead of waiting for real watches to POST /bpm.
const express = require('express');
const { PORT } = require('./config');
const simulate = require('./simulate');

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
app.use(require('./routes/simulate'));
app.use(require('./routes/dashboard'));

simulate.start(1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log("================================================");
  console.log(`  HRM Server (SIMULATED) running on :${PORT}`);
  console.log(`  Dashboard  → http://localhost:${PORT}/`);
  console.log(`  Readings   → http://localhost:${PORT}/readings`);
  console.log(`  Fake watch data is generating automatically — no real hardware needed.`);
  console.log(`  Drop a watch:    curl -X POST localhost:${PORT}/simulate/drop    -H 'Content-Type: application/json' -d '{"player_id":"player3"}'`);
  console.log(`  Restore it:      curl -X POST localhost:${PORT}/simulate/restore -H 'Content-Type: application/json' -d '{"player_id":"player3"}'`);
  console.log(`  Force a spike:   curl -X POST localhost:${PORT}/simulate/spike   -H 'Content-Type: application/json' -d '{"player_id":"player3"}'`);
  console.log("================================================");
});
