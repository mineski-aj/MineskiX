// simulate.js — generates fake BPM data for every player/coach slot on an
// interval, as if watches were POSTing to /bpm continuously.
//
// player1-5 are pinned to a HIGH band (100+) and player6-10 to a LOW band
// (60-90), with a gap between them, specifically so a camp swap is obvious
// at a glance: whichever band (high or low numbers) shows up on a given
// side/camp should visibly swap when you flip "Swap Sides" on the match
// board. Bands never overlap even during a spike, so it stays readable.
const state = require('./state');
const { players } = require('./config');

const BANDS = {
  high: { min: 105, max: 140, spikeMin: 141, spikeMax: 165 }, // player1-5
  low:  { min: 60,  max: 90,  spikeMin: 91,  spikeMax: 100 }, // player6-10
};

function bandFor(pid) {
  const n = parseInt(pid.replace('player', ''), 10);
  if (!isNaN(n) && n >= 1 && n <= 5) return BANDS.high;
  if (!isNaN(n) && n >= 6 && n <= 10) return BANDS.low;
  return BANDS.low; // coaches — not part of the camp swap, band doesn't matter
}

const SPIKE_CHANCE       = 0.04; // per-tick chance of a short spike (team fight etc)
const NEW_TARGET_CHANCE  = 0.08; // per-tick chance of drifting to a new normal target within the band

const targets = {};
for (const pid of Object.keys(players)) {
  const b = bandFor(pid);
  targets[pid] = b.min + Math.random() * (b.max - b.min);
}

function step(pid) {
  if (state.dropped[pid]) {
    state.readings[pid].status = "disconnected";
    return;
  }

  const b = bandFor(pid);
  if (Math.random() < SPIKE_CHANCE) {
    targets[pid] = b.spikeMin + Math.random() * (b.spikeMax - b.spikeMin);
  } else if (Math.random() < NEW_TARGET_CHANCE) {
    targets[pid] = b.min + Math.random() * (b.max - b.min);
  }

  const r = state.readings[pid];
  const current = r.bpm != null ? r.bpm : targets[pid];
  const next = Math.round(current + (targets[pid] - current) * 0.25 + (Math.random() * 4 - 2));

  r.bpm       = Math.max(50, Math.min(190, next));
  r.last_bpm  = r.bpm;
  r.status    = "ok";
  r.last_seen = new Date().toISOString();
}

function tick() {
  for (const pid of Object.keys(players)) step(pid);
}

function start(intervalMs = 1000) {
  tick();
  return setInterval(tick, intervalMs);
}

function drop(pid) { if (pid in players) state.dropped[pid] = true; }
function restore(pid) { if (pid in players) delete state.dropped[pid]; }
function spike(pid) { if (pid in players) { const b = bandFor(pid); targets[pid] = b.spikeMin + Math.random() * (b.spikeMax - b.spikeMin); } }

module.exports = { start, drop, restore, spike };
