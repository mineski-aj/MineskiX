/* ── [FEATURE: sideexp-check] ─────────────────────────────────────
   Ranks all 10 players by total exp. See overlay-sidecheck-core.js
   for the shared panel/animation logic and the .sidecheck-* CSS
   block in mploverlay_v7.css for layout notes. */
const secPanel = createSideCheck({
  clipId:     'sideexp-check-clip',
  overlayId:  'sideexp-check-overlay',
  headerText: 'EXP LEVEL RANKING',
  statField:  'exp',
  formatStat: seat => 'LVL ' + ((seat && seat.level) || 1),
});

function secAnimateIn()  { secPanel.animateIn(); }
function secAnimateOut() { secPanel.animateOut(); }
