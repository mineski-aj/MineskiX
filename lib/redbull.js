// lib/redbull.js — Red Bull Wings Cup project state (projects/redbull/redbull_state.json).
// Entirely separate from lib/matchState.js: the Red Bull project has no API and
// takes every value from its own Match Board tab in the dashboard. Nothing in
// here is read by any other project's overlays.
const fs   = require('fs');
const path = require('path');
const overlayState = require('./state');

const FILE = path.join(__dirname, '..', 'projects', 'redbull', 'redbull_state.json');

// Graphic keys. `scene` = full-screen/layout graphics on redbull-fullscreen.html
// (one at a time, shares the looping background); `super` = lower thirds /
// gameplay frame on redbull-supers.html (one at a time, transparent canvas);
// `wipe` = one-shot transition (plays, then clears itself).
const GRAPHICS = {
  rb_countdown:    { kind: 'scene', code: '101',  name: 'Countdown' },
  rb_holding:      { kind: 'scene', code: '102',  name: 'Holding Page' },
  rb_schedule:     { kind: 'scene', code: '106',  name: 'Days Schedule' },
  rb_matchid:      { kind: 'scene', code: '103a', name: 'Match ID' },
  rb_matchresults: { kind: 'scene', code: '103b', name: 'Match Results' },
  rb_top16:        { kind: 'scene', code: '104a', name: 'Top 16' },
  rb_top8:         { kind: 'scene', code: '104b', name: 'Top 8' },
  rb_top4:         { kind: 'scene', code: '104c', name: 'Top 4' },
  rb_bracket:      { kind: 'scene', code: '105',  name: 'Tournament Bracket' },
  rb_leaderboard:  { kind: 'scene', code: '108',  name: 'Leaderboard' },
  rb_winner:       { kind: 'scene', code: '110',  name: 'Winner' },
  rb_split2:       { kind: 'scene', code: '107a', name: '2-Way Split' },
  rb_split3:       { kind: 'scene', code: '107b', name: '3-Way Split' },
  rb_pip:          { kind: 'scene', code: '107b', name: 'Picture in Picture' },
  rb_lbracket:     { kind: 'scene', code: '109',  name: 'L-Bracket' },
  rb_wipe:         { kind: 'wipe',  code: '401',  name: 'Wipe' },
  rb_super_single: { kind: 'super', code: '201a', name: 'Super Single' },
  rb_super_double: { kind: 'super', code: '201b', name: 'Super Double' },
  rb_super_triple: { kind: 'super', code: '201c', name: 'Super Triple' },
  rb_super_free:   { kind: 'super', code: '202',  name: 'Super Free Text' },
  rb_vs_super:     { kind: 'super', code: '203',  name: 'VS Super' },
  rb_ingame:       { kind: 'super', code: 'Frame', name: 'Player In-Game' },
};

const CODES = ['af','al','at','dk','hr','cz','es','se','no','fi','bg','br','it','ca','cm','is'];
const FIRST = ['Jesper','Matěj','Joel','Colby','Mika','Luca','Noah','Ivan','Leo','Aksel','Dani','Oskar','Tomas','Emil','Ravi','Sami'];
const LAST  = ['Tjäder','Švancer','Magnusson','Stevenson','Berg','Rossi','Novak','Petrov','Silva','Hansen','Marin','Lund','Kral','Dahl','Patel','Aho'];

function defaultState() {
  // 16 roster slots (the event is a 16-player bracket): Top 16/8/4, schedule, leaderboard etc. pick from these. No player photos.
  const players = Array.from({ length: 16 }, (_, i) => ({ first: FIRST[i], last: LAST[i], country: CODES[i] }));
  const row = (a, b, time) => ({ a, b, time });
  const lb  = (p) => ({ p, gp: 0, w: 0, l: 0, d: 0, gd: 0 });
  return {
    event: { title: 'RED BULL WINGS CUP', stage: '' },
    players,
    countdown: { label: 'SHOW BEGINS IN', timer: { running: false, endAt: null, remaining: 120 } },
    holding:   { title: 'WE WILL BE RIGHT BACK', sub: 'RED BULL WINGS CUP' },
    schedule:  {
      title: 'DAYS SCHEDULE', sub: 'RED BULL WINGS CUP',
      rows: [row(0,1,'09:00'),row(2,3,'10:30'),row(4,5,'12:00'),row(6,7,'13:00'),row(8,9,'15:00'),row(10,11,'16:45'),row(12,13,'17:30'),row(14,15,'18:45')],
    },
    match:   { p1: 0, p2: 1, score1: 0, score2: 0 },
    top16:   Array.from({ length: 16 }, (_, i) => i),
    top8:    [0, 1, 2, 3, 4, 5, 6, 7],
    top4:    [0, 1, 2, 3],
    // 16-player bracket, two 8-player leagues. Per league: r16 (8 slots, "Round of 16") -> qf (4) -> sf (2) -> f (1, league winner);
    // the two league winners meet in the Grand Final -> `winner` (-1 = not decided yet). Values are roster indexes, -1 = empty.
    bracket: {
      uniLabel: 'UNIVERSITY LEAGUE WINNER', openLabel: 'OPEN LEAGUE WINNER',
      uni:  { r16: [0, 1, 2, 3, 4, 5, 6, 7],      qf: Array(4).fill(-1), sf: Array(2).fill(-1), f: [-1] },
      open: { r16: [8, 9, 10, 11, 12, 13, 14, 15], qf: Array(4).fill(-1), sf: Array(2).fill(-1), f: [-1] },
      winner: -1,
    },
    leaderboard: {
      title: 'LEADERBOARD', sub: 'RED BULL WINGS CUP',
      groupA: [0,1,2,3].map(lb), groupB: [4,5,6,7].map(lb),
    },
    winner:  { p: 0, sub: 'CHAMPIONSHIP WINNER' },
    layouts: {
      split2: ['TITLE LEFT SCREEN', 'TITLE RIGHT SCREEN'],
      split3: ['TITLE TOP SCREEN', 'TITLE LEFT SCREEN', 'TITLE RIGHT SCREEN'],
      pip:    'TITLE LEFT SCREEN',
    },
    supers: {
      single: { p: 0, role: 'PLAYER 1' },
      double: { a: 0, b: 1 },
      triple: { a: 0, b: 1, c: 2 },
      free:   { headline: 'HEADLINE GOES HERE', sub: 'Supporting line goes here.' },
    },
  };
}

let current = defaultState();
try {
  const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  current = deepMerge(defaultState(), loaded);
  // Migrate state saved by the old 32-player/photo version.
  if (!loaded.bracket || !loaded.bracket.uni) current.bracket = defaultState().bracket;
  current.players = current.players.slice(0, 16).map(({ first, last, country }) => ({ first, last, country }));
  while (current.players.length < 16) current.players.push({ first: '', last: '', country: CODES[current.players.length] });
} catch (e) { /* first run — defaults */ }

// Which graphics are live. scene/super are exclusive within their own slot.
const live = { scene: null, super: null, wipeSeq: 0 };

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[redbull] could not write redbull_state.json'); }
}

function computeRemaining(t) {
  if (!t) return 0;
  if (t.running && t.endAt) return Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
  return t.remaining != null ? t.remaining : 0;
}

function snapshot() {
  const t = current.countdown.timer;
  const snap = JSON.parse(JSON.stringify(current));
  snap.countdown.timer = { running: !!t.running, endAt: t.endAt || null, remaining: computeRemaining(t) };
  snap.serverNow = Date.now();
  return snap;
}

function emit(name, payload) {
  const msg = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  overlayState.overlayClients.forEach(c => { try { c.write(msg); } catch (e) {} });
}

function broadcastData() { emit('rbdata', snapshot()); }

// Arrays replace wholesale; plain objects merge key-by-key (recursively).
function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = Object.assign({}, base);
  for (const k of Object.keys(patch)) {
    const b = base && base[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b)) ? deepMerge(b, patch[k]) : patch[k];
  }
  return out;
}

function get() { return snapshot(); }
function set(patch) { current = deepMerge(current, patch); persist(); broadcastData(); }

function startTimer() {
  const t = current.countdown.timer;
  if (t.running) return;
  const remaining = t.remaining != null ? t.remaining : 0;
  current.countdown.timer = { running: true, endAt: Date.now() + remaining * 1000, remaining };
  persist(); broadcastData();
}
function pauseTimer() {
  const t = current.countdown.timer;
  if (!t.running) return;
  current.countdown.timer = { running: false, endAt: null, remaining: computeRemaining(t) };
  persist(); broadcastData();
}
function setTimerRemaining(seconds) {
  seconds = Math.max(0, Math.round(Number(seconds)) || 0);
  const t = current.countdown.timer;
  current.countdown.timer = t.running
    ? { running: true, endAt: Date.now() + seconds * 1000, remaining: seconds }
    : { running: false, endAt: null, remaining: seconds };
  persist(); broadcastData();
}

function liveState() { return { scene: live.scene, super: live.super, wipeSeq: live.wipeSeq }; }

function show(key) {
  const g = GRAPHICS[key];
  if (!g) return null;
  if (g.kind === 'scene') live.scene = key;
  else if (g.kind === 'super') live.super = key;
  else if (g.kind === 'wipe') live.wipeSeq++;
  emit('redbull', { action: 'show', key, kind: g.kind, live: liveState() });
  return liveState();
}
function hide(key) {
  const g = GRAPHICS[key];
  if (!g) return null;
  if (g.kind === 'scene' && live.scene === key) live.scene = null;
  if (g.kind === 'super' && live.super === key) live.super = null;
  emit('redbull', { action: 'hide', key, kind: g.kind, live: liveState() });
  return liveState();
}
function hideAll() {
  live.scene = null; live.super = null;
  emit('redbull', { action: 'hideall', key: null, live: liveState() });
  return liveState();
}

module.exports = { GRAPHICS, get, set, startTimer, pauseTimer, setTimerRemaining, show, hide, hideAll, liveState };
