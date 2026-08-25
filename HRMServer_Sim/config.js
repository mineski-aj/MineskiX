// config.js — port + player/watch roster
// Same roster as the real HRMServer/config.js — kept identical on purpose so
// overlay_server's hrmPoller (which matches on `slot`) doesn't need any
// changes to talk to this instead of the real thing.
const PORT     = Number(process.env.PORT) || 5055;
const MAX_LOG  = 1000;

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

module.exports = { PORT, MAX_LOG, players };
