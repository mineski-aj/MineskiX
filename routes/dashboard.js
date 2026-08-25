// routes/dashboard.js — root redirect + BPM status page
const express = require('express');
const router  = express.Router();
const path    = require('path');
const state   = require('../lib/state');
const { buildVmix } = require('../lib/feeds');

// Root → serve dashboard.html
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../html/dashboard.html'));
});

// BPM heartbeat status (was previously at /)
router.get('/bpm/status', (req, res) => {
  const rows = buildVmix().map((p) => `
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
    </tr>`).join("");

  res.setHeader("Content-Type", "text/html");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>BPM Server</title>
      <meta http-equiv="refresh" content="2">
      <style>
        body { background:#0f0f0f; color:#fff; font-family:sans-serif; padding:40px; }
        h1 { color:#1db954; }
        table { border-collapse:collapse; width:100%; max-width:700px; }
        th,td { padding:10px 14px; border-bottom:1px solid #222; font-size:14px; text-align:left; }
        th { color:#555; }
        .meta { color:#555; font-size:12px; margin-top:20px; }
        .game-bar { background:#111; border:1px solid #222; border-radius:6px; padding:10px 16px; margin-bottom:24px; font-size:13px; color:#aaa; display:flex; gap:24px; }
        .game-bar span { color:#fff; font-weight:bold; }
      </style>
    </head>
    <body>
      <h1>&#x1F493; BPM Server</h1>
      <div class="game-bar">
        <div>State: <span id="gstate">${state.gameState.state}</span></div>
        <div>Game Time: <span>${state.gameState.game_time_fmt}</span></div>
        <div>Battle ID: <span>${state.gameState.battleid || "--"}</span></div>
      </div>
      <table>
        <tr><th>Slot</th><th>Name</th><th>Team</th><th>Role</th><th>BPM</th><th>Status</th></tr>
        ${rows}
      </table>
      <div class="meta">Auto-refreshes every 2s &nbsp;|&nbsp; GET /feed for JSON &nbsp;|&nbsp; GET /feed/order for camp stats &nbsp;|&nbsp; GET /postgame for last game</div>
    </body>
    </html>
  `);
});

module.exports = router;
