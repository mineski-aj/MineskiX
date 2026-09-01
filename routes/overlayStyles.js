// routes/overlayStyles.js — GET/POST /api/overlay-styles
const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const state    = require('../lib/state');
const projects = require('../lib/projects');

function load() {
  try { return JSON.parse(fs.readFileSync(projects.getStylesFilePath(), 'utf8')); }
  catch (e) { return {}; }
}

router.get('/api/overlay-styles', function (req, res) {
  var file   = req.query.file || '';
  var styles = load();
  res.json(styles[file] || {});
});

router.post('/api/overlay-styles', function (req, res) {
  var body   = req.body || {};
  var file   = body.file;
  var styles = body.styles;
  if (!file || !styles) return res.status(400).json({ error: 'missing file or styles' });
  var all    = load();
  all[file]  = styles;
  fs.writeFileSync(projects.getStylesFilePath(), JSON.stringify(all, null, 2));
  /* Force every open overlay scene (Fullscreen.html, ingame.html,
     Draft.html, DraftIndex.html, ENTVC.html — anywhere the html is
     loaded) to hard-reload so this save's position/size overrides take
     effect immediately, instead of waiting for a manual refresh. Safe
     to do unattended: edits are never made while a scene is live. */
  state.overlayClients.forEach(function (c) { try { c.write('event: reload\ndata: {}\n\n'); } catch (e) {} });
  res.json({ ok: true });
});

// POST /api/overlay-nudge — targeted single-selector position patch used by
// the dashboard Control tab's quick nudge buttons (MVP Scene/Highlights
// photo+hero repositioning). Persists the same way the Edit tab's Save
// does, but broadcasts a lightweight 'stylepatch' event instead of
// 'reload' — Fullscreen.html applies it live via CSS injection with no page
// reload, since the primary feedback loop here is the dashboard's own
// live preview iframe and a reload-triggered flash on every click would
// defeat the point of a quick nudge button.
router.post('/api/overlay-nudge', function (req, res) {
  var body     = req.body || {};
  var file     = body.file;
  var selector = body.selector;
  var props    = body.props;
  if (!file || !selector || !props) return res.status(400).json({ error: 'missing file, selector, or props' });
  var all = load();
  if (!all[file]) all[file] = {};
  if (!all[file][selector]) all[file][selector] = {};
  Object.assign(all[file][selector], props);
  fs.writeFileSync(projects.getStylesFilePath(), JSON.stringify(all, null, 2));
  var payload = JSON.stringify({ file: file, selector: selector, props: props });
  state.overlayClients.forEach(function (c) { try { c.write('event: stylepatch\ndata: ' + payload + '\n\n'); } catch (e) {} });
  res.json({ ok: true });
});

module.exports = router;
