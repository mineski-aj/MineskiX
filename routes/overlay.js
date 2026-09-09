// routes/overlay.js — SSE + all /overlay/* + /meter/*
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const state   = require('../lib/state');
const matchState = require('../lib/matchState');

// Local state for draftpredict commands
const _draftpredictCmds = [];

// GET /api/player-photos — basenames with both FRONT and VICTORY photos available
const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
let _playerPhotoNames = null;
router.get('/api/player-photos', (req, res) => {
  if (!_playerPhotoNames) {
    try {
      const front = fs.readdirSync(path.join(PHOTOS_DIR, 'FRONT'))
        .filter(f => f.endsWith('_FRONT_resized.png'))
        .map(f => f.slice(0, -'_FRONT_resized.png'.length));
      const victorySet = new Set(
        fs.readdirSync(path.join(PHOTOS_DIR, 'VICTORY'))
          .filter(f => f.endsWith('_VICTORY_resized.png'))
          .map(f => f.slice(0, -'_VICTORY_resized.png'.length))
      );
      _playerPhotoNames = front.filter(n => victorySet.has(n));
    } catch (e) {
      _playerPhotoNames = [];
    }
  }
  res.set({ 'Cache-Control': 'no-store' }).json({ names: _playerPhotoNames });
});

// GET /overlay/force-reload — hard-reload every open overlay page (Fullscreen.html,
// ENTVC.html, DraftIndex.html, Draft.html, LowerThirds.html, ingame.html) at
// once, so production browser sources don't need to be refreshed by hand
// after a dashboard Edit-tab save or any other change. Reuses the exact
// 'reload' SSE event routes/overlayStyles.js already broadcasts after a
// style save — every overlay page already listens for it, so no client-side
// changes were needed to wire this up. See dashboard.html's Settings page
// ("Overlay Pages" section) for the button that calls this.
router.get('/overlay/force-reload', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: reload\ndata: {}\n\n'); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, clients: state.overlayClients.length });
});

// GET /overlay/draft-photo-mode — current player-photo source ('live' | 'random')
router.get('/overlay/draft-photo-mode', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json({ mode: state.draftPhotoMode });
});

// GET /overlay/draft-photo-mode/:mode — set mode, broadcast to connected overlays
router.get('/overlay/draft-photo-mode/:mode', (req, res) => {
  const mode = req.params.mode;
  if (mode !== 'live' && mode !== 'random') {
    return res.status(400).json({ ok: false, error: 'unknown mode' });
  }
  state.draftPhotoMode = mode;
  const payload = JSON.stringify({ mode });
  state.overlayClients.forEach(c => { try { c.write(`event: draftphotomode\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, mode });
});

// SSE heartbeat
setInterval(() => {
  state.overlayClients.forEach(c => { try { c.write(': heartbeat\n\n'); } catch {} });
}, 15000);

// GET /overlay/events — SSE stream
router.get('/overlay/events', (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.writeHead(200);
  res.write(': connected\n\n');
  state.overlayClients.push(res);
  req.on("close", () => {
    const i = state.overlayClients.indexOf(res);
    if (i !== -1) state.overlayClients.splice(i, 1);
  });
});

// GET /meter/show|hide|plus|minus|clear
router.get('/meter/:cmd', (req, res) => {
  const cmd = req.params.cmd;
  if (["show", "hide", "plus", "minus", "clear"].includes(cmd)) {
    state.overlayClients.forEach(c => { try { c.write(`event: meter\ndata: {"cmd":"${cmd}"}\n\n`); } catch {} });
    res.set({ "Cache-Control": "no-store" }).json({ ok: true, cmd });
  } else {
    res.status(404).json({ error: "unknown meter command" });
  }
});

// GET /api/draft-roles — returns server-locked player→role assignments for current battleid
router.get('/api/draft-roles', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.draftRoles);
});

// GET /overlay/draftindex-state — current shown/hidden state, so a
// freshly (re)loaded DraftIndex.html can restore instead of guessing.
router.get('/overlay/draftindex-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json({ active: state.draftIndexActive });
});

// GET /overlay/draftindex/show
router.get('/overlay/draftindex/show', (req, res) => {
  state.draftIndexActive = true;
  state.overlayClients.forEach(c => { try { c.write('event: draftindex\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/draftindex/hide
router.get('/overlay/draftindex/hide', (req, res) => {
  state.draftIndexActive = false;
  state.overlayClients.forEach(c => { try { c.write('event: draftindex\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/draft-state — current shown/hidden state, so a
// freshly (re)loaded Draft.html can restore instead of guessing.
router.get('/overlay/draft-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json({ active: state.draftActive });
});

// GET /overlay/draft/show
router.get('/overlay/draft/show', (req, res) => {
  state.draftActive = true;
  state.overlayClients.forEach(c => { try { c.write('event: draft\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/draft/hide
router.get('/overlay/draft/hide', (req, res) => {
  state.draftActive = false;
  state.overlayClients.forEach(c => { try { c.write('event: draft\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/draftrealme-state — current shown/hidden state for
// Draft-realme.html, the realme-skinned pick/ban overlay (own bespoke
// boolean, independent of the regular Draft Overlay's draftActive).
router.get('/overlay/draftrealme-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json({ active: state.draftRealmeActive });
});

// GET /overlay/draftrealme/show
router.get('/overlay/draftrealme/show', (req, res) => {
  state.draftRealmeActive = true;
  state.overlayClients.forEach(c => { try { c.write('event: draftrealme\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/draftrealme/hide
router.get('/overlay/draftrealme/hide', (req, res) => {
  state.draftRealmeActive = false;
  state.overlayClients.forEach(c => { try { c.write('event: draftrealme\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/fights/show
router.get('/overlay/fights/show', (req, res) => {
  state.fightsPendingAction = { action: "show", ts: Date.now() };
  state.overlayClients.forEach(c => { try { c.write('event: fights\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/fights/hide
router.get('/overlay/fights/hide', (req, res) => {
  state.fightsPendingAction = { action: "hide", ts: Date.now() };
  state.overlayClients.forEach(c => { try { c.write('event: fights\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/check-overlays — current shown/hidden state of the
// sliding "check" overlays, so the dashboard toggle can restore its
// position on load instead of guessing.
router.get('/overlay/check-overlays', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.checkOverlays);
});

// GET /overlay/itemcheck/show
router.get('/overlay/itemcheck/show', (req, res) => {
  state.checkOverlays.itemcheck = true;
  state.overlayClients.forEach(c => { try { c.write('event: itemcheck\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/itemcheck/hide
router.get('/overlay/itemcheck/hide', (req, res) => {
  state.checkOverlays.itemcheck = false;
  state.overlayClients.forEach(c => { try { c.write('event: itemcheck\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/emblemcheck/show
router.get('/overlay/emblemcheck/show', (req, res) => {
  state.checkOverlays.emblemcheck = true;
  state.overlayClients.forEach(c => { try { c.write('event: emblemcheck\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/emblemcheck/hide
router.get('/overlay/emblemcheck/hide', (req, res) => {
  state.checkOverlays.emblemcheck = false;
  state.overlayClients.forEach(c => { try { c.write('event: emblemcheck\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/golddiffcheck/show
router.get('/overlay/golddiffcheck/show', (req, res) => {
  state.checkOverlays.golddiffcheck = true;
  state.overlayClients.forEach(c => { try { c.write('event: golddiffcheck\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/golddiffcheck/hide
router.get('/overlay/golddiffcheck/hide', (req, res) => {
  state.checkOverlays.golddiffcheck = false;
  state.overlayClients.forEach(c => { try { c.write('event: golddiffcheck\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/scoreboard/show
router.get('/overlay/scoreboard/show', (req, res) => {
  state.checkOverlays.scoreboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: scoreboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/scoreboard/hide
router.get('/overlay/scoreboard/hide', (req, res) => {
  state.checkOverlays.scoreboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: scoreboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/playerui/show
router.get('/overlay/playerui/show', (req, res) => {
  state.checkOverlays.playerui = true;
  state.overlayClients.forEach(c => { try { c.write('event: playerui\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/playerui/hide
router.get('/overlay/playerui/hide', (req, res) => {
  state.checkOverlays.playerui = false;
  state.overlayClients.forEach(c => { try { c.write('event: playerui\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/draftrecap/show
router.get('/overlay/draftrecap/show', (req, res) => {
  state.checkOverlays.draftrecap = true;
  state.overlayClients.forEach(c => { try { c.write('event: draftrecap\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/draftrecap/hide
router.get('/overlay/draftrecap/hide', (req, res) => {
  state.checkOverlays.draftrecap = false;
  state.overlayClients.forEach(c => { try { c.write('event: draftrecap\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/draftstats/test — Control-tab manual test trigger for the
// Draft Stats pick reveal (Draft.html). Fixed placeholder values, Player 1
// of BOTH sides at once (campid 1 and 2, seat_1) — fires two separate
// events so each side's card animates independently but simultaneously.
router.get('/overlay/draftstats/test', (req, res) => {
  [1, 2].forEach((campid) => {
    const payload = JSON.stringify({ campid, seatIdx: 0, pick: 27, contention: 64, winrate: 58 });
    state.overlayClients.forEach(c => { try { c.write(`event: draftstats\ndata: ${payload}\n\n`); } catch {} });
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/draftstats/test-debut — same as above, but a pick count of 0
// so Draft.html plays the "DEBUT PICK!" reveal instead of the normal
// PICK/CONTENTION RATE/WIN RATE one (see startDraftStats()'s isDebut check).
router.get('/overlay/draftstats/test-debut', (req, res) => {
  [1, 2].forEach((campid) => {
    const payload = JSON.stringify({ campid, seatIdx: 0, pick: 0, contention: 0, winrate: 0 });
    state.overlayClients.forEach(c => { try { c.write(`event: draftstats\ndata: ${payload}\n\n`); } catch {} });
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/draftstats/test-buff/:status — same as /test above, but also
// carries a buffStatus (NERF/BUFF/ADJUST) so Draft.html's corner badge pops
// in once the reveal finishes sliding out (see showBuffBadge()).
router.get('/overlay/draftstats/test-buff/:status', (req, res) => {
  const status = String(req.params.status || '').toUpperCase();
  if (!['NERF', 'BUFF', 'ADJUST'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'status must be nerf, buff, or adjust' });
  }
  [1, 2].forEach((campid) => {
    const payload = JSON.stringify({ campid, seatIdx: 0, pick: 27, contention: 64, winrate: 58, buffStatus: status });
    state.overlayClients.forEach(c => { try { c.write(`event: draftstats\ndata: ${payload}\n\n`); } catch {} });
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, status });
});

// GET /overlay/draftstats/test-swap/:status — simulates a Final Changes
// seat swap: Draft.html's showBadgeOnly() pops the corner badge directly,
// skipping the PICK/CONTENTION RATE/WIN RATE (or DEBUT PICK) reveal
// entirely (see the draftStatsAllowed gate in poll() / onBannerIn()).
router.get('/overlay/draftstats/test-swap/:status', (req, res) => {
  const status = String(req.params.status || '').toUpperCase();
  if (!['NERF', 'BUFF', 'ADJUST'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'status must be nerf, buff, or adjust' });
  }
  [1, 2].forEach((campid) => {
    const payload = JSON.stringify({ campid, seatIdx: 0, swapOnly: true, buffStatus: status });
    state.overlayClients.forEach(c => { try { c.write(`event: draftstats\ndata: ${payload}\n\n`); } catch {} });
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, status });
});

// GET /overlay/hrm-state — current per-player heart-rate meter on/off
// state (ingame_red.html / ingame_blue.html), so any page (dashboard,
// ingame overlays on a different browser/machine, vMix) can poll the
// same source of truth instead of relying on each browser's own
// localStorage, which never syncs across separate machines.
router.get('/overlay/hrm-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.hrmOff);
});

// GET /overlay/hrm/:slot/show — turn the BPM meter back on (LIVE) for one player
router.get('/overlay/hrm/:slot/show', (req, res) => {
  const slot = req.params.slot;
  if (!(slot in state.hrmOff)) return res.status(400).json({ ok: false, error: 'unknown slot' });
  state.hrmOff[slot] = false;
  const payload = JSON.stringify({ slot, isOff: false });
  state.overlayClients.forEach(c => { try { c.write(`event: hrm\ndata: ${payload}\n\n`); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, slot, isOff: false });
});

// GET /overlay/hrm/:slot/hide — turn the BPM meter off (swap to KDA + Gold) for one player
router.get('/overlay/hrm/:slot/hide', (req, res) => {
  const slot = req.params.slot;
  if (!(slot in state.hrmOff)) return res.status(400).json({ ok: false, error: 'unknown slot' });
  state.hrmOff[slot] = true;
  const payload = JSON.stringify({ slot, isOff: true });
  state.overlayClients.forEach(c => { try { c.write(`event: hrm\ndata: ${payload}\n\n`); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, slot, isOff: true });
});

// "Side *check" ranking panels (exp, damage taken, and future ones)
// all broadcast over ONE shared SSE event — 'sidecheck' — with a
// `check` field identifying which panel, instead of a separate named
// event per panel. Keeps the client down to one listener and keeps
// adding a new side-check down to one array entry.
const SIDE_CHECK_KEYS = ['sideexpcheck', 'sidetakencheck', 'sidedamagecheck', 'sidegoldcheck'];
SIDE_CHECK_KEYS.forEach((key) => {
  router.get(`/overlay/${key}/show`, (req, res) => {
    state.checkOverlays[key] = true;
    const payload = JSON.stringify({ check: key, action: 'show' });
    state.overlayClients.forEach(c => { try { c.write(`event: sidecheck\ndata: ${payload}\n\n`); } catch {} });
    res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
  });

  router.get(`/overlay/${key}/hide`, (req, res) => {
    state.checkOverlays[key] = false;
    const payload = JSON.stringify({ check: key, action: 'hide' });
    state.overlayClients.forEach(c => { try { c.write(`event: sidecheck\ndata: ${payload}\n\n`); } catch {} });
    res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
  });
});

// GET /overlay/sideoverlays/hide — universal hide for every "side *check"
// ranking panel at once (side EXP/taken/damage/gold). Reuses the same
// shared 'sidecheck' SSE event each panel already listens for, so no
// client-side changes were needed to wire this up.
router.get('/overlay/sideoverlays/hide', (req, res) => {
  SIDE_CHECK_KEYS.forEach((key) => {
    state.checkOverlays[key] = false;
    const payload = JSON.stringify({ check: key, action: 'hide' });
    state.overlayClients.forEach(c => { try { c.write(`event: sidecheck\ndata: ${payload}\n\n`); } catch {} });
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/bottomoverlays/hide — universal hide for every "bottom"
// panel at once (item check, emblem check, gold-diff check, fight
// recap). Reuses the same named SSE events each panel already listens
// for, so no client-side changes were needed to wire this up.
router.get('/overlay/bottomoverlays/hide', (req, res) => {
  state.checkOverlays.itemcheck     = false;
  state.checkOverlays.emblemcheck   = false;
  state.checkOverlays.golddiffcheck = false;
  state.fightsPendingAction = { action: "hide", ts: Date.now() };
  state.overlayClients.forEach(c => {
    try {
      c.write('event: itemcheck\ndata: {"action":"hide"}\n\n');
      c.write('event: emblemcheck\ndata: {"action":"hide"}\n\n');
      c.write('event: golddiffcheck\ndata: {"action":"hide"}\n\n');
      c.write('event: fights\ndata: {"action":"hide"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/fights/pending
router.get('/overlay/fights/pending', (req, res) => {
  const p = state.fightsPendingAction;
  state.fightsPendingAction = null;
  res.set({ "Cache-Control": "no-store" }).json(p || { action: null });
});

// GET /overlay/post_hearts/show
router.get('/overlay/post_hearts/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'hearts';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_hearts\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_hearts/hide
router.get('/overlay/post_hearts/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_hearts\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_richguy/show
router.get('/overlay/post_richguy/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'richguy';
  state.overlayClients.forEach(c => { try { c.write('event: post_richguy\ndata: {"action":"show","data":{}}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_richguy/hide
router.get('/overlay/post_richguy/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_richguy\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/waiting_tvc/show
router.get('/overlay/waiting_tvc/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'waiting';
  state.overlayClients.forEach(c => { try { c.write('event: waiting_tvc\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/waiting_tvc/hide
router.get('/overlay/waiting_tvc/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: waiting_tvc\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/waiting_lobby/show
router.get('/overlay/waiting_lobby/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'lobby';
  state.overlayClients.forEach(c => { try { c.write('event: waiting_lobby\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/waiting_lobby/hide
router.get('/overlay/waiting_lobby/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: waiting_lobby\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_hexagon/show
router.get('/overlay/team_hexagon/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'hexagon';
  state.overlayClients.forEach(c => { try { c.write('event: team_hexagon\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_hexagon/hide
router.get('/overlay/team_hexagon/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_hexagon\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/highlights/show
router.get('/overlay/highlights/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'highlights';
  state.overlayClients.forEach(c => { try { c.write('event: highlights\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/highlights/hide
router.get('/overlay/highlights/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: highlights\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/mvp/show
router.get('/overlay/mvp/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mvp';
  state.overlayClients.forEach(c => { try { c.write('event: mvp\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/mvp/hide
router.get('/overlay/mvp/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: mvp\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/credits/show
router.get('/overlay/credits/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'credits';
  state.overlayClients.forEach(c => { try { c.write('event: credits\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/credits/hide
router.get('/overlay/credits/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: credits\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/final_team/show
router.get('/overlay/final_team/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'finalteam';
  state.overlayClients.forEach(c => { try { c.write('event: final_team\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/final_team/hide
router.get('/overlay/final_team/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: final_team\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_lineup_blue/show
router.get('/overlay/team_lineup_blue/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'lineupblue';
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_blue\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_lineup_blue/hide
router.get('/overlay/team_lineup_blue/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_blue\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_lineup_red/show
router.get('/overlay/team_lineup_red/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'lineupred';
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_red\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_lineup_red/hide
router.get('/overlay/team_lineup_red/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_red\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/herolineup/show
router.get('/overlay/herolineup/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'herolineup';
  state.overlayClients.forEach(c => { try { c.write('event: herolineup\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/herolineup/hide
router.get('/overlay/herolineup/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: herolineup\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/today_schedule/show
// Pressing Show again while the scene is ALREADY live doesn't re-trigger
// the whole scene — it cycles a "currently being talked about" highlight
// through each match row instead (grows 1.15x), one row per press, then
// back to nothing. Match count (2 vs 3) follows the same isDay2 rule as
// Fullscreen.html's msToMatchRows, so the cycle length matches whatever's
// actually on screen.
router.get('/overlay/today_schedule/show', (req, res) => {
  if (state.fullscreenScene.activeFeature === 'schedule') {
    const ms = matchState.get();
    const maxMatches = (ms.day || 1) === 2 ? 3 : 2;
    const cur  = state.fullscreenScene.scheduleHighlight || 0;
    const next = cur >= maxMatches ? 0 : cur + 1;
    state.fullscreenScene.scheduleHighlight = next;
    state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: ' + JSON.stringify({ action: 'highlight', match: next }) + '\n\n'); } catch {} });
    return res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "highlight", match: next });
  }
  state.fullscreenScene.activeFeature = 'schedule';
  state.fullscreenScene.scheduleHighlight = 0;
  state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/today_schedule/hide
router.get('/overlay/today_schedule/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.fullscreenScene.scheduleHighlight = 0;
  state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/tomorrow_schedule/show
router.get('/overlay/tomorrow_schedule/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'tomorrow';
  state.overlayClients.forEach(c => { try { c.write('event: tomorrow_schedule\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/tomorrow_schedule/hide
router.get('/overlay/tomorrow_schedule/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: tomorrow_schedule\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/standings/show
router.get('/overlay/standings/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'standings';
  state.overlayClients.forEach(c => { try { c.write('event: standings\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/standings/hide
router.get('/overlay/standings/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: standings\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/fs/debugoff
router.get('/overlay/fs/debugoff', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: fs_debugoff\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/matchboard/show
router.get('/overlay/matchboard/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: matchboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/matchboard/hide
router.get('/overlay/matchboard/hide', (req, res) => {
  state.fullscreenScene.matchboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: matchboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/middleboard/show
router.get('/overlay/middleboard/show', (req, res) => {
  state.fullscreenScene.middleboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: middleboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/middleboard/hide
router.get('/overlay/middleboard/hide', (req, res) => {
  state.fullscreenScene.middleboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: middleboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/fs/hide
router.get('/overlay/fs/hide', (req, res) => {
  state.fullscreenScene = { matchboard: false, middleboard: false, activeFeature: null, scheduleHighlight: 0 };
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"hide"}\n\n');
      c.write('event: middleboard\ndata: {"action":"hide"}\n\n');
      c.write('event: fs_hide\ndata: {}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/fullscreen-scene — current fullscreen display state for restore-on-load
router.get('/overlay/fullscreen-scene', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.fullscreenScene);
});

// GET /overlay/post_itemline/itemin
router.get('/overlay/post_itemline/itemin', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline_itemin\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/post_itemline/itemout
router.get('/overlay/post_itemline/itemout', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline_itemout\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/post_itemline/show
router.get('/overlay/post_itemline/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'itemline';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_itemline\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_itemline/hide
router.get('/overlay/post_itemline/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_emblems/show
router.get('/overlay/post_emblems/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'emblems';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_emblems\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_emblems/hide
router.get('/overlay/post_emblems/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_emblems\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_items/show
router.get('/overlay/post_items/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'items';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_items\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_items/hide
router.get('/overlay/post_items/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_items\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_stats/show
router.get('/overlay/post_stats/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'stats';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_stats\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_stats/hide
router.get('/overlay/post_stats/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_stats\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/consolidated_post/show
router.get('/overlay/consolidated_post/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'consolidated_post';
  // Deliberately do NOT also broadcast a standalone 'matchboard' event here.
  // Fullscreen.html has its own independent 'matchboard' SSE listener (for the
  // Control tab's standalone Matchboard toggle) that calls showMatchBoard()
  // directly with no idea cp-compact is about to be applied — broadcasting
  // it here raced against showConsolidatedPost()'s own properly-sequenced
  // internal showMatchBoard() call, so the board would animate in at its
  // normal (non-compact) position first, then jump 36px once
  // showConsolidatedPost() finally added cp-compact. The dashboard's own
  // Matchboard toggle indicator still stays in sync without this broadcast:
  // it refetches the full /overlay/fullscreen-scene snapshot (which includes
  // this matchboard flag) off the 'consolidated_post' event alone.
  state.overlayClients.forEach(c => {
    try {
      c.write('event: consolidated_post\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/consolidated_post/hide
router.get('/overlay/consolidated_post/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: consolidated_post\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/consolidated_post_2/show
router.get('/overlay/consolidated_post_2/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'consolidated_post_2';
  // Same reasoning as consolidated_post/show above: no standalone
  // 'matchboard' broadcast — showConsolidatedPost2() sequences the
  // cp-compact class itself before its own showMatchBoard() call.
  state.overlayClients.forEach(c => {
    try { c.write('event: consolidated_post_2\ndata: {"action":"show"}\n\n'); } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/consolidated_post_2/hide
router.get('/overlay/consolidated_post_2/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: consolidated_post_2\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post4key/show
router.get('/overlay/post4key/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'post4key';
  // Same reasoning as consolidated_post/show above: no standalone
  // 'matchboard' broadcast — Fullscreen.html's own transitionTo() already
  // calls showMatchBoard() internally, and the dashboard's Matchboard
  // toggle stays in sync via the /overlay/fullscreen-scene refetch triggered
  // off the 'post4key' event alone.
  state.overlayClients.forEach(c => {
    try { c.write('event: post4key\ndata: {"action":"show"}\n\n'); } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post4key/hide
router.get('/overlay/post4key/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post4key\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/draftpredict/show|hide|poll
router.get('/overlay/draftpredict/:cmd', (req, res) => {
  const cmd = req.params.cmd;
  res.set({ "Cache-Control": "no-store" });
  if (cmd === "show" || cmd === "hide") {
    _draftpredictCmds.push(cmd);
    state.overlayClients.forEach(c => { try { c.write(`event: draftpredict\ndata: {"cmd":"${cmd}"}\n\n`); } catch {} });
    res.json({ ok: true });
  } else if (cmd === "poll") {
    const cmds = _draftpredictCmds.splice(0);
    res.json({ commands: cmds });
  } else {
    res.status(404).json({});
  }
});

// GET /overlay/debugoff — hide debug bars on all overlays
router.get('/overlay/debugoff', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: debugoff\ndata: {}\n\n'); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true });
});

// GET /overlay/features — return current feature toggle states
router.get('/overlay/features', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.featureToggles);
});

// GET /overlay/feature/:feature/enable|disable
const VALID_FEATURES = ['killevents','items','trinity','swap','lvl15','conceal','fights','objectivespawn','debugphotos','draftstats'];
router.get('/overlay/feature/:feature/:action', (req, res) => {
  const { feature, action } = req.params;
  if (!VALID_FEATURES.includes(feature) || !['enable','disable'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'unknown feature or action' });
  }
  const enabled = action === 'enable';
  state.featureToggles[feature] = enabled;
  const payload = JSON.stringify({ feature, enabled });
  state.overlayClients.forEach(c => { try { c.write(`event: featuretoggle\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, feature, enabled });
});

// GET /overlay/killevent — broadcast a kill event video to all overlays
const KILL_EVENT_PRIORITIES = {
  'firstblood.webm': 1, 'doublekill.webm': 2, 'triplekill.webm': 3,
  'maniac.webm': 4, 'savage.webm': 5,
  'lordslain.webm': 1, 'turtleslain.webm': 1, 'wipedout.webm': 3,
};
router.get('/overlay/killevent', (req, res) => {
  const video = req.query.video;
  if (!video || !KILL_EVENT_PRIORITIES[video]) {
    return res.status(400).json({ ok: false, error: 'unknown video' });
  }
  const priority = KILL_EVENT_PRIORITIES[video];
  const playerName = req.query.playerName ? String(req.query.playerName) : null;
  const roleNum = parseInt(req.query.role, 10);
  const role = roleNum >= 1 && roleNum <= 5 ? roleNum : null;
  const camp = req.query.camp === 'red' || req.query.camp === 'blue' ? req.query.camp : null;
  const payload = JSON.stringify({ video, priority, playerIdx: null, playerName, role, camp });
  state.overlayClients.forEach(c => { try { c.write(`event: killevent\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, video, playerName, role, camp });
});

// Map Selection tag (html/LowerThirds.html) — sequential per-game reveal.
// Each "show" call does ONE of, in priority order:
//   1. If an already-revealed game is still waiting on its winner, and
//      the winner has since been picked — reveal just that game's win
//      banner (phase 3) and stop there.
//   2. Otherwise, reveal the next game's side+map recap (phases 1-2),
//      gated on toss winner + side + map being picked (the winner is
//      NOT required — it can be left open). If that game's winner
//      already happens to be known at reveal time, its win banner is
//      included in the same reveal instead of requiring an extra press.
// "hide" clears everything at once and resets both counters so the
// next show cycle starts back at game 1.
const mapSelectionState = require('../lib/mapSelectionState');

router.get('/overlay/mapselecttag-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.mapSelectTag);
});

router.get('/overlay/mapselecttag/show', (req, res) => {
  const ms  = mapSelectionState.get();
  const tag = state.mapSelectTag;

  // Priority 1 — catch up a pending win for an already-revealed game.
  if (tag.revealedWins < tag.revealedGames) {
    const idx = tag.revealedWins;
    const pending = ms.games[idx];
    if (pending && pending.winner) {
      tag.revealedWins = idx + 1;
      const payload = JSON.stringify({ action: 'showWinner', gameIndex: idx, game: pending, match: ms.match, home: ms.home, away: ms.away });
      state.overlayClients.forEach(c => { try { c.write(`event: mapselecttag\ndata: ${payload}\n\n`); } catch {} });
      return res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, action: 'showWinner', gameIndex: idx });
    }
  }

  // Priority 2 — reveal the next new game's side + map.
  const nextIdx = tag.revealedGames;
  const game = ms.games[nextIdx];
  const ready = game && game.tossWinner && game.tossSide && game.map;
  if (nextIdx >= ms.maxGames || !ready) {
    return res.set({ 'Cache-Control': 'no-store' }).json({
      ok: false, blocked: true,
      reason: (nextIdx >= ms.maxGames) ? 'All games in this series are already revealed.' : `Game ${nextIdx + 1}'s team and map selection isn't complete yet.`,
    });
  }
  tag.revealedGames = nextIdx + 1;
  if (game.winner) tag.revealedWins = tag.revealedGames; // winner already known — include it in this same reveal
  const payload = JSON.stringify({ action: 'show', gameIndex: nextIdx, game: game, match: ms.match, home: ms.home, away: ms.away });
  state.overlayClients.forEach(c => { try { c.write(`event: mapselecttag\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, action: 'show', gameIndex: nextIdx });
});

router.get('/overlay/mapselecttag/hide', (req, res) => {
  state.mapSelectTag.revealedGames = 0;
  state.mapSelectTag.revealedWins  = 0;
  state.overlayClients.forEach(c => { try { c.write('event: mapselecttag\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, action: 'hide' });
});

// GET/POST /overlay/:slot — generic show/hide slot handler (must be LAST)
router.all('/overlay/:slot', (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const slot = req.params.slot.replace(/\/+$/, '');
  if (slot === "hide") {
    state.overlayClients.forEach(c => { try { c.write('event: hide\ndata: {}\n\n'); } catch {} });
  } else {
    const msg = `event: show\ndata: ${JSON.stringify({ slot })}\n\n`;
    state.overlayClients.forEach(c => { try { c.write(msg); } catch {} });
  }
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: slot === "hide" ? "hide" : "show", slot });
});

module.exports = router;
