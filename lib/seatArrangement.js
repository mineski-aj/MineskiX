const fs = require('fs');
const path = require('path');

// Global (not project-scoped, matching game_api_url.json/post_info_api_url.json
// — the two feeds this actually reroutes) — one arrangement applies
// server-wide regardless of active project, same reasoning as API Mode.
//
// { camp1: [1,2,3,4,5], camp2: [1,2,3,4,5] } — a permutation per camp:
// arrangement.camp1[i] names which ORIGINAL seat_N feeds the (i+1)-th
// output seat. Identity (1,2,3,4,5) means "as the upstream API sends it".
const SEAT_ARRANGEMENT_FILE = path.join(__dirname, '..', 'seat_arrangement.json');
const IDENTITY = [1, 2, 3, 4, 5];
const DEFAULT_ARRANGEMENT = { camp1: IDENTITY.slice(), camp2: IDENTITY.slice() };

function isValidPerm(perm) {
  return Array.isArray(perm) && perm.length === 5 &&
    IDENTITY.every((n) => perm.includes(n)) &&
    perm.every((n) => IDENTITY.includes(n));
}

function isIdentityPerm(perm) {
  return Array.isArray(perm) && perm.every((n, i) => n === i + 1);
}

function isIdentityArrangement(arrangement) {
  return isIdentityPerm(arrangement.camp1) && isIdentityPerm(arrangement.camp2);
}

// Sanitizes anything read from disk (or posted by the dashboard) back to a
// guaranteed-valid { camp1, camp2 } shape — a malformed/hand-edited file
// falls back to identity per-camp rather than ever producing undefined
// seats downstream.
function sanitize(raw) {
  const camp1 = raw && isValidPerm(raw.camp1) ? raw.camp1 : IDENTITY.slice();
  const camp2 = raw && isValidPerm(raw.camp2) ? raw.camp2 : IDENTITY.slice();
  return { camp1, camp2 };
}

function readArrangement() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(SEAT_ARRANGEMENT_FILE, 'utf8')));
  } catch (e) {
    return { camp1: IDENTITY.slice(), camp2: IDENTITY.slice() };
  }
}

function writeArrangement(arrangement) {
  const clean = sanitize(arrangement);
  fs.writeFileSync(SEAT_ARRANGEMENT_FILE, JSON.stringify(clean));
  return clean;
}

// Returns a NEW object (shallow-copied at the payload/data/camp_list/camp
// levels only — seat objects themselves are never mutated, just
// re-pointed) with seat_1..seat_5 remapped per `arrangement`. Safe to call
// with the same `payload` repeatedly (e.g. once for the poller's cache,
// again later to re-derive after a config change) since the input is
// never touched — this is what lets a Raw copy and an Arranged copy of
// the same poll coexist without aliasing into each other.
function applyArrangement(payload, arrangement) {
  if (!payload || !payload.data || !Array.isArray(payload.data.camp_list)) return payload;
  if (isIdentityArrangement(arrangement)) return payload;
  const campList = payload.data.camp_list.map((camp) => {
    const key = camp.campid === 1 ? 'camp1' : camp.campid === 2 ? 'camp2' : null;
    const perm = key && arrangement[key];
    if (!perm || isIdentityPerm(perm)) return camp;
    const next = Object.assign({}, camp);
    for (let s = 1; s <= 5; s++) next[`seat_${s}`] = camp[`seat_${perm[s - 1]}`];
    return next;
  });
  return Object.assign({}, payload, { data: Object.assign({}, payload.data, { camp_list: campList }) });
}

module.exports = {
  DEFAULT_ARRANGEMENT,
  readArrangement,
  writeArrangement,
  applyArrangement,
  isIdentityArrangement,
  isValidPerm,
};
