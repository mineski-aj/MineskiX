// lib/teamLineups.js — last-used role assignment per team, persisted to
// team_lineups.json. Keyed by teamId so the Match Dashboard can restore a
// bench swap the next time that team is picked, instead of resetting to
// mainroster.json's role-sorted default every time.
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'team_lineups.json');

let current = {};

if (fs.existsSync(FILE)) {
  try { current = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { console.warn('[match] Could not parse team_lineups.json, starting empty'); }
}

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[match] Could not write team_lineups.json'); }
}

function getAll() { return current; }

function set(teamId, lineup) {
  if (!teamId || !Array.isArray(lineup)) return;
  current[String(teamId)] = lineup;
  persist();
}

module.exports = { getAll, set };
