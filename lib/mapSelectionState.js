// lib/mapSelectionState.js — per-game map-selection state (toss winner, side
// choice, map, game winner), persisted to map_selection.json.
//
// Team names/series/score are NOT duplicated here — get() merges them live
// from lib/matchState.js so this module never goes stale relative to the
// Match Board tab. Side/map/score picks made here are pushed back into
// matchState so the rest of the system (scoreboard, ingame overlays,
// Draft.html) stays driven by the same `swapped`/`map`/`score` fields it
// already reads.
const fs   = require('fs');
const path = require('path');
const matchState = require('./matchState');
const overlayState = require('./state');

const FILE = path.join(__dirname, '..', 'map_selection.json');
const MAX_SUPPORTED_GAMES = 7; // covers BO1/BO3/BO5/BO7

function emptyGame(n) {
  return {
    game: n,
    tossWinner: null, // 'home' | 'away'
    tossSide:   null, // 'blue' | 'red' — side picked BY the toss winner
    homeSide:   null, // derived: 'blue' | 'red'
    awaySide:   null, // derived: 'blue' | 'red'
    map:        null,
    winner:     null, // 'home' | 'away'
    locked:     false,
  };
}

const DEFAULT = {
  games: Array.from({ length: MAX_SUPPORTED_GAMES }, (_, i) => emptyGame(i + 1)),
};

let current = { games: DEFAULT.games.map(g => Object.assign({}, g)) };

if (fs.existsSync(FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(loaded.games)) {
      current.games = Array.from({ length: MAX_SUPPORTED_GAMES }, (_, i) =>
        Object.assign(emptyGame(i + 1), loaded.games[i] || {}));
    }
  } catch (e) {
    console.warn('[mapselection] Could not parse map_selection.json, using defaults');
  }
}

const sseClients = [];

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[mapselection] Could not write map_selection.json'); }
}

function seriesLength(series) {
  return parseInt(String(series || 'BO5').replace('BO', ''), 10) || 5;
}

function findGame(gameNum) {
  const n = parseInt(gameNum, 10);
  if (!n || n < 1 || n > MAX_SUPPORTED_GAMES) return null;
  return current.games[n - 1];
}

function snapshot() {
  const ms = matchState.get();
  const maxGames   = Math.min(seriesLength(ms.series), MAX_SUPPORTED_GAMES);
  const winsNeeded = Math.ceil(maxGames / 2);
  const games = current.games.slice(0, maxGames);

  let homeWins = 0, awayWins = 0;
  games.forEach(function (g) {
    if (g.winner === 'home') homeWins++;
    else if (g.winner === 'away') awayWins++;
  });

  const seriesComplete = homeWins >= winsNeeded || awayWins >= winsNeeded;
  const seriesWinner   = homeWins >= winsNeeded ? 'home' : (awayWins >= winsNeeded ? 'away' : null);

  let currentGame = null;
  if (!seriesComplete) {
    const idx = games.findIndex(function (g) { return !g.locked; });
    currentGame = idx === -1 ? null : games[idx].game;
  }

  return {
    home: { teamId: ms.home.teamId, name: ms.home.name, short: ms.home.short, score: ms.home.score },
    away: { teamId: ms.away.teamId, name: ms.away.name, short: ms.away.short, score: ms.away.score },
    match: ms.match,
    series: ms.series,
    swapped: !!ms.swapped,
    maxGames: maxGames,
    winsNeeded: winsNeeded,
    currentGame: currentGame,
    seriesComplete: seriesComplete,
    seriesWinner: seriesWinner,
    homeWins: homeWins,
    awayWins: awayWins,
    games: games,
  };
}

function get() { return snapshot(); }

function syncScoreToMatchState() {
  const maxGames = Math.min(seriesLength(matchState.get().series), MAX_SUPPORTED_GAMES);
  let homeWins = 0, awayWins = 0;
  current.games.slice(0, maxGames).forEach(function (g) {
    if (g.winner === 'home') homeWins++;
    else if (g.winner === 'away') awayWins++;
  });
  const game = Math.min(homeWins + awayWins + 1, maxGames);
  matchState.set({ home: { score: homeWins }, away: { score: awayWins }, game: game });
}

function setToss(gameNum, winner) {
  const g = findGame(gameNum);
  if (!g) return;
  g.tossWinner = (winner === 'home' || winner === 'away') ? winner : null;
  g.tossSide = null; g.homeSide = null; g.awaySide = null;
  persist();
  broadcast();
}

function setSide(gameNum, side) {
  const g = findGame(gameNum);
  if (!g || !g.tossWinner) return;
  if (side !== 'blue' && side !== 'red') return;
  g.tossSide = side;
  if (g.tossWinner === 'home') {
    g.homeSide = side; g.awaySide = (side === 'blue') ? 'red' : 'blue';
  } else {
    g.awaySide = side; g.homeSide = (side === 'blue') ? 'red' : 'blue';
  }
  persist();
  const swapped = (g.tossWinner === 'home' && side === 'red') || (g.tossWinner === 'away' && side === 'blue');
  matchState.set({ swapped: swapped });
  broadcast();
}

function setMap(gameNum, map) {
  const g = findGame(gameNum);
  if (!g) return;
  g.map = (typeof map === 'string' && map) ? map : null;
  persist();
  if (g.map) matchState.set({ map: g.map });
  broadcast();
}

function setWinner(gameNum, winner) {
  const g = findGame(gameNum);
  if (!g) return;
  g.winner = (winner === 'home' || winner === 'away') ? winner : null;
  g.locked = !!g.winner;
  persist();
  syncScoreToMatchState();
  broadcast();
}

function reopenGame(gameNum) {
  const g = findGame(gameNum);
  if (!g) return;
  g.winner = null;
  g.locked = false;
  persist();
  syncScoreToMatchState();
  broadcast();
}

function resetGame(gameNum) {
  const n = parseInt(gameNum, 10);
  const g = findGame(gameNum);
  if (!g) return;
  Object.assign(g, emptyGame(n));
  persist();
  syncScoreToMatchState();
  broadcast();
}

function resetAll() {
  current = { games: DEFAULT.games.map(g => Object.assign({}, g)) };
  persist();
  syncScoreToMatchState();
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
  sseClients.forEach(function (c) { try { c.write(`data: ${json}\n\n`); } catch (e) {} });
  // Also fan out over the shared /overlay/events stream (named "mapselection"
  // event) so pages don't need their own dedicated connection just for this
  // — same pattern matchState/standingsState already use.
  overlayState.overlayClients.forEach(function (c) { try { c.write(`event: mapselection\ndata: ${json}\n\n`); } catch (e) {} });
}

module.exports = {
  get, setToss, setSide, setMap, setWinner, reopenGame, resetGame, resetAll,
  addClient, removeClient,
};
