// lib/hrmPoller.js — polls the external HRM Server for live BPM readings
const fs   = require("fs");
const path = require("path");
const state = require("./state");
const { players } = require("./config");

const HRM_URL_FILE = path.join(__dirname, "..", "hrm_api_url.json");
const { readUrlForMode } = require("./apiMode");

let _warnedNoUrl = false;

function getHrmUrl() {
  return readUrlForMode(HRM_URL_FILE, "").trim().replace(/\/$/, "");
}

function markAllDisconnected() {
  for (const pid of Object.keys(players)) {
    const r = state.readings[pid];
    if (r) r.status = "disconnected";
  }
}

async function pollHrmReadings() {
  const url = getHrmUrl();
  if (!url) {
    if (!_warnedNoUrl) {
      console.warn("[HRM] No HRM server URL configured — set it from the dashboard Settings tab");
      _warnedNoUrl = true;
    }
    return;
  }

  try {
    const r = await fetch(`${url}/readings`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const readings = await r.json();
    if (!Array.isArray(readings)) throw new Error("unexpected response shape");

    for (const reading of readings) {
      const pid = reading.slot;
      if (!pid || !state.readings[pid]) continue;
      state.readings[pid] = {
        ...state.readings[pid],
        name:      reading.name,
        team:      reading.team,
        role:      reading.role,
        slot:      reading.slot,
        bpm:       reading.bpm,
        last_bpm:  reading.last_bpm,
        status:    reading.status,
        last_seen: reading.last_seen,
      };
    }
  } catch (e) {
    console.warn("[HRM] Unreachable:", e.message);
    markAllDisconnected();
  }
}

module.exports = { pollHrmReadings };
