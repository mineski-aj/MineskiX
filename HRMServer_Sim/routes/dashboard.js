// routes/dashboard.js — root debug page, watch status at a glance
const express = require('express');
const router  = express.Router();
const state   = require('../state');

router.get('/', (req, res) => {
  const rows = Object.values(state.readings).map((p) => `
    <tr>
      <td>${p.slot}</td>
      <td>${p.name}</td>
      <td>${p.team}</td>
      <td style="color:#aaa;font-weight:bold">${p.role}</td>
      <td style="color:${p.status === "ok" ? "#1db954" : "#555"};font-size:20px;font-weight:bold">
        ${p.bpm !== null && p.bpm !== undefined ? p.bpm : "--"}
      </td>
      <td>
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.status === "ok" ? "#1db954" : "#e53935"};margin-right:6px;"></span>
        <span style="color:${p.status === "ok" ? "#1db954" : "#e53935"}">${p.status}</span>
      </td>
      <td style="color:#555;font-size:12px">${p.last_seen || "--"}</td>
    </tr>`).join("");

  res.setHeader("Content-Type", "text/html");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>HRM Server (SIMULATED)</title>
      <meta http-equiv="refresh" content="2">
      <style>
        body { background:#0f0f0f; color:#fff; font-family:sans-serif; padding:40px; }
        h1 { color:#e5b81d; }
        table { border-collapse:collapse; width:100%; max-width:760px; }
        th,td { padding:10px 14px; border-bottom:1px solid #222; font-size:14px; text-align:left; }
        th { color:#555; }
        .meta { color:#555; font-size:12px; margin-top:20px; }
        .banner { background:#3a2f00; color:#e5b81d; padding:10px 14px; border-radius:6px; margin-bottom:20px; font-size:13px; }
      </style>
    </head>
    <body>
      <h1>&#x1F493; HRM Server <span style="font-size:14px;color:#e5b81d">(SIMULATED)</span></h1>
      <div class="banner">This is fake data from HRMServer_Sim, not real watches — for testing overlay_server without hardware.</div>
      <table>
        <tr><th>Slot</th><th>Name</th><th>Team</th><th>Role</th><th>BPM</th><th>Status</th><th>Last Seen</th></tr>
        ${rows}
      </table>
      <div class="meta">
        Auto-refreshes every 2s &nbsp;|&nbsp; GET /readings for overlay_server &nbsp;|&nbsp; GET /bpm/log for raw history<br>
        POST /simulate/drop {player_id} &nbsp;|&nbsp; POST /simulate/restore {player_id} &nbsp;|&nbsp; POST /simulate/spike {player_id}
      </div>
    </body>
    </html>
  `);
});

module.exports = router;
