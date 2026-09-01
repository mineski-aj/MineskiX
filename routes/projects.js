// routes/projects.js — GET/POST /api/projects*
// Named per-show profiles (overlay picks + layout) — see lib/projects.js.
const express  = require('express');
const fs       = require('fs');
const multer   = require('multer');
const router   = express.Router();
const projects = require('../lib/projects');
const state    = require('../lib/state');

// POST /api/projects/:id/assets/:overlay — upload a replacement image/video
// for one Edit-tab element (see the `asset` override property, applied by
// every overlay page's own loadXOverrides() and by dashboard.html's
// applyToEditIframe()). Stored under projects/<id>/assets/<overlay>/,
// served for free by server.js's existing express.static over the repo
// root — no dedicated download route needed.
const ASSET_MIME_RE = /^(image\/(png|jpeg|webp|gif)|video\/(webm|mp4))$/;
const assetUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        var dir = projects.assetDir(req.params.id, req.params.overlay);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + projects.sanitizeForPath(file.originalname));
    },
  }),
  limits: { fileSize: projects.MAX_ASSET_BYTES },
  fileFilter: function (req, file, cb) {
    cb(null, ASSET_MIME_RE.test(file.mimetype));
  },
});

router.get('/api/projects', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json({
    projects: projects.listProjects(),
    active: projects.getActiveProject(),
  });
});

router.get('/api/projects/:id/enabled-overlays', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json({ enabled: projects.getEnabledOverlays(req.params.id) });
});

router.post('/api/projects', function (req, res) {
  var name = (req.body || {}).name;
  try {
    var meta = projects.createProject(name);
    res.json({ id: meta.id, name: meta.name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/projects/active', function (req, res) {
  var id = (req.body || {}).id;
  if (id === undefined) id = null;
  try {
    projects.setActiveProject(id);
    res.json({ ok: true, active: id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/api/projects/:id/enabled-overlays', function (req, res) {
  var enabled = (req.body || {}).enabled;
  if (enabled !== null && !Array.isArray(enabled)) {
    return res.status(400).json({ error: 'enabled must be an array or null' });
  }
  try {
    projects.setEnabledOverlays(req.params.id, enabled);
    res.json({ ok: true, enabled: enabled });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/projects/:id/assets/:overlay', function (req, res) {
  if (!projects.projectExists(req.params.id)) {
    return res.status(404).json({ error: 'No such project: ' + req.params.id });
  }
  assetUpload.single('file')(req, res, function (err) {
    if (err) {
      var msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 50MB limit'
        : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or unsupported file type (images: png/jpeg/webp/gif, video: webm/mp4)' });
    }
    var url = '/projects/' + encodeURIComponent(req.params.id) +
      '/assets/' + encodeURIComponent(projects.sanitizeForPath(req.params.overlay)) +
      '/' + encodeURIComponent(req.file.filename);
    res.json({ ok: true, url: url, filename: req.file.filename });
  });
});

// ── Kill Events: photo/name toggles + per-type video replacement ──────────
// killevent_settings.json (project-scoped, same lib/projects.js resolution
// as overlay_styles.json / the bottom-events layout files): { photoEnabled,
// nameEnabled, sponsorEnabled, videoOverrides: { "<default filename>.webm":
// "<uploaded url>" }, disabledTypes: [ "<default filename>.webm", ... ] }.
// Read by html/js/overlay-killevents.js on load.
const KILLEVENT_SETTINGS_FILE = 'killevent_settings.json';
const KILLEVENT_SETTINGS_DEFAULTS = { photoEnabled: true, nameEnabled: true, sponsorEnabled: true, videoOverrides: {}, disabledTypes: [] };
// Every default kill-event video filename a replacement can be uploaded
// for — kept in sync by hand with dashboard.html's KILL_EVENT_TYPES list
// (same "small hand-mirrored table" precedent as API_MODES elsewhere in
// this codebase), purely as a safety check against a nonsense :filename.
const KILLEVENT_FILENAMES = [
  'firstblood.webm', 'doublekill.webm', 'triplekill.webm', 'maniac.webm',
  'savage.webm', 'lordslain.webm', 'turtleslain.webm', 'wipedout.webm',
];

// Same 'reload' broadcast overlay_styles.json saves already trigger
// (routes/overlayStyles.js) — every real ingame.html instance/OBS browser
// source picks up a settings/video change without a manual refresh; the
// Edit tab's own preview iframe skips it (isPreviewFrame guard in
// overlay-debug.js), so this never disrupts an in-progress edit session.
function broadcastReload() {
  state.overlayClients.forEach(function (c) { try { c.write('event: reload\ndata: {}\n\n'); } catch (e) {} });
}

function readKillEventSettings() {
  try {
    var raw = JSON.parse(fs.readFileSync(projects.getProjectScopedFilePath(KILLEVENT_SETTINGS_FILE), 'utf8'));
    return {
      photoEnabled: raw.photoEnabled !== false,
      nameEnabled: raw.nameEnabled !== false,
      sponsorEnabled: raw.sponsorEnabled !== false,
      videoOverrides: raw.videoOverrides || {},
      disabledTypes: Array.isArray(raw.disabledTypes) ? raw.disabledTypes : [],
    };
  } catch (e) {
    return Object.assign({}, KILLEVENT_SETTINGS_DEFAULTS, { videoOverrides: {}, disabledTypes: [] });
  }
}

router.get('/api/killevent-settings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(readKillEventSettings());
});

router.post('/api/killevent-settings', function (req, res) {
  var b = req.body || {};
  if (b.disabledTypes !== undefined && !Array.isArray(b.disabledTypes)) {
    return res.status(400).json({ error: 'disabledTypes must be an array' });
  }
  var current = readKillEventSettings();
  var next = {
    photoEnabled: b.photoEnabled !== undefined ? !!b.photoEnabled : current.photoEnabled,
    nameEnabled: b.nameEnabled !== undefined ? !!b.nameEnabled : current.nameEnabled,
    sponsorEnabled: b.sponsorEnabled !== undefined ? !!b.sponsorEnabled : current.sponsorEnabled,
    videoOverrides: current.videoOverrides,
    disabledTypes: b.disabledTypes !== undefined
      ? b.disabledTypes.filter(function (f) { return KILLEVENT_FILENAMES.indexOf(f) !== -1; })
      : current.disabledTypes,
  };
  fs.writeFileSync(projects.getProjectScopedFilePath(KILLEVENT_SETTINGS_FILE), JSON.stringify(next));
  broadcastReload();
  res.json(Object.assign({ ok: true }, next));
});

var killVideoUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        var dir = projects.assetDir(req.params.id, 'Ingame', 'KillEvents');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + projects.sanitizeForPath(file.originalname));
    },
  }),
  limits: { fileSize: projects.MAX_ASSET_BYTES },
  fileFilter: function (req, file, cb) {
    cb(null, /^video\/(webm|mp4)$/.test(file.mimetype));
  },
});

router.post('/api/projects/:id/killevent-video/:filename', function (req, res) {
  if (!projects.projectExists(req.params.id)) {
    return res.status(404).json({ error: 'No such project: ' + req.params.id });
  }
  if (KILLEVENT_FILENAMES.indexOf(req.params.filename) === -1) {
    return res.status(400).json({ error: 'Unknown kill event type: ' + req.params.filename });
  }
  killVideoUpload.single('file')(req, res, function (err) {
    if (err) {
      var msg = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 50MB limit' : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or unsupported file type (video: webm/mp4)' });
    }
    var url = '/projects/' + encodeURIComponent(req.params.id) +
      '/assets/Ingame/KillEvents/' + encodeURIComponent(req.file.filename);
    var settings = readKillEventSettings();
    settings.videoOverrides[req.params.filename] = url;
    fs.writeFileSync(projects.getProjectScopedFilePath(KILLEVENT_SETTINGS_FILE), JSON.stringify(settings));
    broadcastReload();
    res.json({ ok: true, url: url });
  });
});

router.post('/api/projects/:id/killevent-video/:filename/reset', function (req, res) {
  if (!projects.projectExists(req.params.id)) {
    return res.status(404).json({ error: 'No such project: ' + req.params.id });
  }
  var settings = readKillEventSettings();
  delete settings.videoOverrides[req.params.filename];
  fs.writeFileSync(projects.getProjectScopedFilePath(KILLEVENT_SETTINGS_FILE), JSON.stringify(settings));
  broadcastReload();
  res.json({ ok: true });
});

module.exports = router;
