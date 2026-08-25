// lib/config.js — constants, config.json loading, players, CAMP_MAP
const fs   = require("fs");
const path = require("path");

const PORT         = Number(process.env.PORT) || 3000;
const POLL_MS      = 1000;
const POSTGAME_DIR   = path.join(__dirname, "..", "postgames");
const POSITIONS_FILE = path.join(__dirname, "..", "positions_live.json");
const EVENTS_FILE     = path.join(__dirname, "..", "events_live.json");
const FIGHTS_FILE    = path.join(__dirname, "..", "fights_live.json");
const CONFIG_PATH    = path.join(__dirname, "..", "config.json");

if (!fs.existsSync(CONFIG_PATH)) {
  console.error("[CONFIG] config.json not found. Creating default...");
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    game_api: "http://10.88.120.72:5001/api/sub-info/",
    main_api: "http://10.88.120.72:5001/api/main/"
  }, null, 2));
}
const config   = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const GAME_API = config.game_api;
const MAIN_API = config.main_api || config.h2h_api || "http://10.88.120.72:5001/api/main/";
console.log(`[CONFIG] game_api = ${GAME_API}`);
console.log(`[CONFIG] main_api = ${MAIN_API}`);

if (!fs.existsSync(POSTGAME_DIR)) fs.mkdirSync(POSTGAME_DIR);

// ── PLAYERS ───────────────────────────────────────────────────────────────────
const players = {
  player1:  { name: "Player 1",  team: "team1", slot: "player1",  role: "EXP"    },
  player2:  { name: "Player 2",  team: "team1", slot: "player2",  role: "JUNGLE" },
  player3:  { name: "Player 3",  team: "team1", slot: "player3",  role: "MID"    },
  player4:  { name: "Player 4",  team: "team1", slot: "player4",  role: "ROAM"   },
  player5:  { name: "Player 5",  team: "team1", slot: "player5",  role: "GOLD"   },
  player6:  { name: "Player 6",  team: "team2", slot: "player6",  role: "GOLD"   },
  player7:  { name: "Player 7",  team: "team2", slot: "player7",  role: "ROAM"   },
  player8:  { name: "Player 8",  team: "team2", slot: "player8",  role: "MID"    },
  player9:  { name: "Player 9",  team: "team2", slot: "player9",  role: "JUNGLE" },
  player10: { name: "Player 10", team: "team2", slot: "player10", role: "EXP"    },
  coach_home1: { name: "Home Coach 1", team: "team1", slot: "coach_home1", role: "COACH" },
  coach_home2: { name: "Home Coach 2", team: "team1", slot: "coach_home2", role: "COACH" },
  coach_away1: { name: "Away Coach 1", team: "team2", slot: "coach_away1", role: "COACH" },
  coach_away2: { name: "Away Coach 2", team: "team2", slot: "coach_away2", role: "COACH" },
};

// ── ROLE DISPLAY NAMES ────────────────────────────────────────────────────────
const ROLE_DISPLAY = {
  "EXP":    "EXP LANER",
  "JUNGLE": "JUNGLER",
  "MID":    "MID LANER",
  "ROAM":   "ROAMER",
  "GOLD":   "GOLD LANER",
};

// ── CAMP ORDER ────────────────────────────────────────────────────────────────
const CAMP_MAP = {
  camp1: [
    { pid: "player1",  watch: 1  },
    { pid: "player2",  watch: 2  },
    { pid: "player3",  watch: 3  },
    { pid: "player4",  watch: 4  },
    { pid: "player5",  watch: 5  },
  ],
  camp2: [
    { pid: "player10", watch: 10 },
    { pid: "player9",  watch: 9  },
    { pid: "player8",  watch: 8  },
    { pid: "player7",  watch: 7  },
    { pid: "player6",  watch: 6  },
  ],
};

// watch number → { campid, seat } — static reverse of CAMP_MAP
const WATCH_TO_CAMP_SEAT = {};
for (const [campKey, entries] of Object.entries(CAMP_MAP)) {
  const campid = campKey === 'camp1' ? 1 : 2;
  entries.forEach(({ watch }, i) => { WATCH_TO_CAMP_SEAT[watch] = { campid, seat: i + 1 }; });
}

const MAX_EVENTS = 500;
const MAX_POS_LOG = 50000;
const MAX_FIGHTS  = 100;
const FIGHT_GAP_S = 3;
const ROLE_ORDER  = ['EXP LANER', 'JUNGLER', 'MID LANER', 'ROAMER', 'GOLD LANER'];

module.exports = {
  PORT, POLL_MS,
  POSTGAME_DIR, POSITIONS_FILE, EVENTS_FILE, FIGHTS_FILE, CONFIG_PATH,
  GAME_API, MAIN_API,
  players, ROLE_DISPLAY, CAMP_MAP, WATCH_TO_CAMP_SEAT,
  MAX_EVENTS, MAX_POS_LOG, MAX_FIGHTS, FIGHT_GAP_S, ROLE_ORDER,
};
