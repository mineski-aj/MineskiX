// lib/standingsState.js — standings state, persisted to standings_state.json
const fs   = require('fs');
const path = require('path');
const overlayState = require('./state');

const FILE = path.join(__dirname, '..', 'standings_state.json');

const DEFAULT = {
  teams: [
    { tri: 'TLPH', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'FLCN', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'ONIC', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'RORA', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'APBR', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'TWIS', move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'OMG',  move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
    { tri: 'TNC',  move: 'neutral', status: null, mp: 0, mwl: '0-0', gwl: '0-0', ngw: 0 },
  ],
};

let current = Object.assign({}, DEFAULT);

if (fs.existsSync(FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    current = loaded;
    for (const k of Object.keys(DEFAULT)) {
      if (!(k in current)) current[k] = DEFAULT[k];
    }
  } catch (e) {
    console.warn('[standings] Could not parse standings_state.json, using defaults');
  }
}

const sseClients = [];

function get() { return current; }

function set(patch) {
  current = deepMerge(current, patch);
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[standings] Could not write standings_state.json'); }
  broadcast();
}

function addClient(res) {
  sseClients.push(res);
  res.write(`data: ${JSON.stringify(current)}\n\n`);
}

function removeClient(res) {
  const i = sseClients.indexOf(res);
  if (i !== -1) sseClients.splice(i, 1);
}

function broadcast() {
  const json = JSON.stringify(current);
  sseClients.forEach(c => c.write(`data: ${json}\n\n`));
  // Also fan out over the shared /overlay/events stream (named "standings"
  // event) so pages don't need their own dedicated connection just for this.
  overlayState.overlayClients.forEach(c => { try { c.write(`event: standings\ndata: ${json}\n\n`); } catch {} });
}

function deepMerge(base, patch) {
  const out = Object.assign({}, base);
  for (const k of Object.keys(patch)) {
    if (patch[k] !== null && typeof patch[k] === 'object' && !Array.isArray(patch[k]) &&
        base[k]  !== null && typeof base[k]  === 'object') {
      out[k] = Object.assign({}, base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

module.exports = { get, set, addClient, removeClient };
