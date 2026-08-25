// state.js — all mutable state, initialized from config
const { players } = require('./config');

const readings = {};
for (const [pid, info] of Object.entries(players)) {
  readings[pid] = { ...info, bpm: null, last_bpm: null, status: "disconnected", last_seen: null };
}

const state = {
  readings,
  log: [],
  dropped: {}, // pid -> true while manually "unplugged" via /simulate/drop
};

module.exports = state;
