const fs = require('fs');
const path = require('path');

// Global LIVE / WEB / DEBUG switch for every per-API URL setting (Settings
// page). One flag file, consulted by every *_api_url.json reader/writer
// below so flipping it changes what ALL overlay/poller code fetches from,
// without touching each individual URL.
const API_MODE_FILE = path.join(__dirname, '..', 'api_mode.json');
const API_MODES = ['live', 'web', 'debug'];

function getApiMode() {
  try {
    const raw = JSON.parse(fs.readFileSync(API_MODE_FILE, 'utf8'));
    return API_MODES.includes(raw.mode) ? raw.mode : 'live';
  } catch (e) {
    return 'live';
  }
}

function setApiMode(mode) {
  const m = API_MODES.includes(mode) ? mode : 'live';
  fs.writeFileSync(API_MODE_FILE, JSON.stringify({ mode: m }));
  return m;
}

// Reads a per-API url file (shape { live, web, debug }) and returns
// whichever the CURRENT global mode selects. Falls back to a legacy flat
// { url } — belt-and-suspenders for a file that somehow never got
// migrated — so a half-updated file still resolves to something sane
// instead of undefined.
function readUrlForMode(file, defaultUrl) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const mode = getApiMode();
  if (raw[mode] !== undefined) return raw[mode];
  if (raw.url !== undefined) return raw.url;
  return defaultUrl;
}

// Writes the value for the CURRENT global mode only — the other modes'
// values are left untouched. Any mode missing from the file (a legacy
// flat { url }, or a file that predates a newly-added mode like 'web') is
// seeded from the best available existing value first, so "the other
// sets" start as a duplicate rather than undefined — then the legacy flat
// key is dropped since the file is now fully in { live, web, debug } shape.
function writeUrlForMode(file, url) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const seed = raw.live !== undefined ? raw.live : (raw.url !== undefined ? raw.url : url);
  API_MODES.forEach((m) => { if (raw[m] === undefined) raw[m] = seed; });
  const mode = getApiMode();
  raw[mode] = url;
  delete raw.url;
  fs.writeFileSync(file, JSON.stringify(raw));
  return raw;
}

module.exports = { getApiMode, setApiMode, readUrlForMode, writeUrlForMode };
