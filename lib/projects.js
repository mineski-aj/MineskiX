const fs = require('fs');
const path = require('path');

// Named per-show profiles: each has its own overlay picks (which OVERLAYS
// rows appear in the dashboard Control tab) and its own overlay_styles.json
// (Edit-tab position/size data). Live game data / API endpoints stay global
// — not part of this. One flag file (like lib/apiMode.js's api_mode.json)
// selects which project is "active" server-wide; stateless / fresh-read on
// every call, same as apiMode.js, so there's no in-memory cache to go stale.
const PROJECTS_DIR   = path.join(__dirname, '..', 'projects');
const ACTIVE_FILE    = path.join(__dirname, '..', 'active_project.json');

function projectDir(id) {
  return path.join(PROJECTS_DIR, id);
}

function readProjectMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir(id), 'project.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function listProjects() {
  let entries = [];
  try { entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch (e) { return []; }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => readProjectMeta(e.name))
    .filter(Boolean)
    .map((m) => ({ id: m.id, name: m.name, createdAt: m.createdAt }));
}

// Returns the active project id, or null. A stale active_project.json
// pointing at a since-deleted project resolves to null rather than error,
// so a missing/corrupt folder can't wedge the whole server into "no styles
// resolve" — it just falls back to the default/no-project state.
function getActiveProject() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); } catch (e) { return null; }
  const id = raw.active;
  if (!id) return null;
  return readProjectMeta(id) ? id : null;
}

function setActiveProject(id) {
  if (id !== null && !readProjectMeta(id)) {
    throw new Error(`No such project: ${id}`);
  }
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ active: id }));
  return id;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

// Slugifies `name` into an id, deduping against existing project folders
// (project-2, project-3, ...) and refusing to write into a folder that
// already exists but isn't a recognized Project (e.g. projects/realme/,
// unrelated realme-skin art assets already on disk) — never silently
// adopt/overwrite a folder this module didn't create.
function createProject(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Project name is required');

  const base = slugify(trimmed);
  let id = base;
  let n = 2;
  while (fs.existsSync(projectDir(id))) {
    if (!readProjectMeta(id)) {
      throw new Error(`A non-project folder already exists at projects/${id} — refusing to write into it`);
    }
    id = `${base}-${n++}`;
  }

  fs.mkdirSync(projectDir(id), { recursive: true });
  const meta = { id, name: trimmed, createdAt: Date.now() };
  fs.writeFileSync(path.join(projectDir(id), 'project.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(projectDir(id), 'overlay_styles.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(projectDir(id), 'enabled_overlays.json'), JSON.stringify({ enabled: null }));

  setActiveProject(id);
  return meta;
}

// The one function every per-project-scoped file consumer must route
// through — resolves `filename` to the active project's own copy, or the
// repo-root copy if no project is active. Never cache the result: the
// active project can change between any two calls. Used for
// overlay_styles.json, and (bottom-events layout tuning, kill-event
// settings) any other file that should follow "same file shape everywhere,
// just a different copy per active project."
function getProjectScopedFilePath(filename) {
  const active = getActiveProject();
  return active ? path.join(projectDir(active), filename) : path.join(__dirname, '..', filename);
}

// overlay_styles.json specifically — kept as its own name since it's the
// original/most-referenced call site; equivalent to
// getProjectScopedFilePath('overlay_styles.json').
function getStylesFilePath() {
  return getProjectScopedFilePath('overlay_styles.json');
}

function projectExists(id) {
  return !!readProjectMeta(id);
}

const MAX_ASSET_BYTES = 50 * 1024 * 1024;

// Filesystem-safe-ify a name for use as a path segment — strips path
// separators and NUL only, so human-readable names like "Fullscreen" or
// "EN TVC (Waiting TVC)" survive intact (spaces/parens are valid on
// disk); just enough to stop directory traversal or a broken path.
function sanitizeForPath(s) {
  return String(s || '').replace(/[\/\\\0]/g, '-').trim() || 'asset';
}

// `sub`, if given, nests a subfolder under the overlay's own asset folder
// (e.g. Kill Events' per-type video uploads living under
// assets/Ingame/KillEvents/ instead of flat in assets/Ingame/) — sanitized
// as its own path segment, not squashed into one with overlayName.
function assetDir(id, overlayName, sub) {
  const dir = path.join(projectDir(id), 'assets', sanitizeForPath(overlayName));
  return sub ? path.join(dir, sanitizeForPath(sub)) : dir;
}

function getEnabledOverlays(id) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectDir(id), 'enabled_overlays.json'), 'utf8'));
    return raw.enabled === undefined ? null : raw.enabled;
  } catch (e) {
    return null;
  }
}

function setEnabledOverlays(id, enabled) {
  if (!readProjectMeta(id)) throw new Error(`No such project: ${id}`);
  fs.writeFileSync(path.join(projectDir(id), 'enabled_overlays.json'), JSON.stringify({ enabled }));
  return enabled;
}

module.exports = {
  listProjects,
  getActiveProject,
  setActiveProject,
  createProject,
  getStylesFilePath,
  getProjectScopedFilePath,
  getEnabledOverlays,
  setEnabledOverlays,
  projectExists,
  sanitizeForPath,
  assetDir,
  MAX_ASSET_BYTES,
};
