// lib/matchState.js — match state, persisted to match_state.json
const fs   = require('fs');
const path = require('path');
const overlayState = require('./state');

const FILE = path.join(__dirname, '..', 'match_state.json');

const DEFAULT = {
  home:     { teamId: '', name: 'Home Team', short: 'HME', score: 0, lineup: [], coach: '' },
  away:     { teamId: '', name: 'Away Team', short: 'AWY', score: 0, lineup: [], coach: '' },
  series:   'BO5',
  game:     1,
  match:    1,
  swapped:  false,
  official: false,
  week:     1,
  day:      1,
  patch:    'Decisive Battle 420',
  map:      'Broken Walls',
  hosts:    ['None', 'None', 'None'],
  casters:  ['None', 'None', 'None'],
  enCasters: ['None', 'None', 'None'],
  countdownLabel: 'SHOW STARTS IN',
  goodbyeLabel:   'SEE YOU TOMORROW',
  // Server-authoritative countdown (Waiting Screen TVC + Waiting Lobby share
  // this). `endAt` is an absolute epoch-ms timestamp, so it survives both a
  // page refresh and a server restart while running; `remaining` (seconds)
  // is the source of truth only while paused.
  timer: { running: false, endAt: null, remaining: 30 * 60 + 30 },
  todayMatches: [
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', score1: 0, score2: 0, vsDisplay: 'VS', time: '2:30 PM', star: false, matchType: 'regular' },
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', score1: 0, score2: 0, vsDisplay: 'VS', time: '5:00 PM', star: false, matchType: 'regular' },
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', score1: 0, score2: 0, vsDisplay: 'VS', time: '7:30 PM', star: false, matchType: 'regular' },
  ],
  tomorrowMatches: [
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', vsDisplay: 'VS', time: '2:30 PM', star: false, matchType: 'regular' },
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', vsDisplay: 'VS', time: '5:00 PM', star: false, matchType: 'regular' },
    { team1Id: '', team1Name: '', team1Short: '', team2Id: '', team2Name: '', team2Short: '', vsDisplay: 'VS', time: '7:30 PM', star: false, matchType: 'regular' },
  ],
};

let current = Object.assign({}, DEFAULT);

if (fs.existsSync(FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Migrate old teamA/teamB/blueTeam format
    if (loaded.teamA && !loaded.home) {
      current = {
        home:    Object.assign({ teamId: '', lineup: [] }, loaded.teamA),
        away:    Object.assign({ teamId: '', lineup: [] }, loaded.teamB || { name: 'Away Team', short: 'AWY', score: 0 }),
        series:  loaded.series  || DEFAULT.series,
        game:    loaded.game    || DEFAULT.game,
        swapped: loaded.blueTeam === 'B',
      };
    } else {
      current = loaded;
    }
    // Migrate the old flat countdownDuration (client-computed, restarted on
    // every show) into the new server-authoritative timer.
    if (!current.timer && typeof current.countdownDuration === 'number') {
      current.timer = { running: false, endAt: null, remaining: current.countdownDuration };
    }
    delete current.countdownDuration;
    // Migrate: coach field added to home/away after some match_state.json
    // files were already saved without it.
    if (current.home && !('coach' in current.home)) current.home.coach = '';
    if (current.away && !('coach' in current.away)) current.away.coach = '';
    // Fill in any fields added to DEFAULT that aren't in the saved file
    for (const k of Object.keys(DEFAULT)) {
      if (!(k in current)) current[k] = DEFAULT[k];
    }
  } catch (e) {
    console.warn('[match] Could not parse match_state.json, using defaults');
  }
}

const sseClients = [];

// Live remaining seconds: computed from the absolute endAt while running so
// it stays correct across refreshes/restarts, or the frozen value while paused.
function computeRemaining(timer) {
  if (!timer) return DEFAULT.timer.remaining;
  if (timer.running && timer.endAt) return Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
  return (timer.remaining != null) ? timer.remaining : DEFAULT.timer.remaining;
}

function snapshot() {
  const timer = current.timer || DEFAULT.timer;
  return Object.assign({}, current, {
    timer: { running: !!timer.running, endAt: timer.endAt || null, remaining: computeRemaining(timer) },
    serverNow: Date.now(),
  });
}

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[match] Could not write match_state.json'); }
}

function get() { return snapshot(); }

function set(patch) {
  current = deepMerge(current, patch);
  persist();
  broadcast();
}

function startTimer() {
  const t = current.timer || Object.assign({}, DEFAULT.timer);
  if (t.running) return;
  const remaining = (t.remaining != null) ? t.remaining : DEFAULT.timer.remaining;
  current.timer = { running: true, endAt: Date.now() + remaining * 1000, remaining };
  persist();
  broadcast();
}

function pauseTimer() {
  const t = current.timer;
  if (!t || !t.running) return;
  current.timer = { running: false, endAt: null, remaining: computeRemaining(t) };
  persist();
  broadcast();
}

function setTimerRemaining(seconds) {
  seconds = Math.max(0, Math.round(Number(seconds)) || 0);
  const t = current.timer || Object.assign({}, DEFAULT.timer);
  current.timer = t.running
    ? { running: true, endAt: Date.now() + seconds * 1000, remaining: seconds }
    : { running: false, endAt: null, remaining: seconds };
  persist();
  broadcast();
}

function addClient(res) {
  sseClients.push(res);
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
}

function removeClient(res) {
  const i = sseClients.indexOf(res);
  if (i !== -1) sseClients.splice(i, 1);
}

function broadcast() {
  const json = JSON.stringify(snapshot());
  sseClients.forEach(c => c.write(`data: ${json}\n\n`));
  // Also fan out over the shared /overlay/events stream (named "match" event)
  // so pages don't need their own dedicated connection just for this.
  overlayState.overlayClients.forEach(c => { try { c.write(`event: match\ndata: ${json}\n\n`); } catch {} });
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

module.exports = { get, set, addClient, removeClient, startTimer, pauseTimer, setTimerRemaining };
