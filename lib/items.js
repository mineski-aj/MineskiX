// lib/items.js — items.json loading, countItems, ITEM_NAMES, TIER3_ITEMS
const fs   = require("fs");
const path = require("path");

const ITEMS_PATH = path.join(__dirname, "..", "items.json");
let ITEM_NAMES   = {};
let TIER3_ITEMS  = new Set();

function loadItems() {
  try {
    const raw = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8"));
    ITEM_NAMES  = Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), v]));
    TIER3_ITEMS = new Set(Object.keys(ITEM_NAMES).map(Number));
    console.log(`[ITEMS] Loaded ${TIER3_ITEMS.size} tier-3 items from items.json`);
  } catch (e) {
    console.warn("[ITEMS] Could not load items.json:", e.message);
  }
}
loadItems();

function countItems(equipList) {
  const c = {};
  for (const it of (equipList || []))
    if (it.value && it.value !== 9999) c[it.value] = (c[it.value] || 0) + 1;
  return c;
}

module.exports = { ITEM_NAMES, TIER3_ITEMS, loadItems, countItems };
