/* ── [FEATURE: sidegold-check] ─────────────────────────────────────
   Ranks all 10 players by total gold earned. See
   overlay-sidecheck-core.js for the shared panel/animation logic and
   the .sidecheck-* CSS block in mploverlay_v7.css for layout notes.
   Uses its own background (sidestatbackgold.png, already has a title
   baked into the art) instead of the shared sidestatback.png, so no
   headerText — the other side-check panels keep the plain background
   + text header combo. */
const sgcPanel = createSideCheck({
  clipId:     'sidegold-check-clip',
  overlayId:  'sidegold-check-overlay',
  bgSrc:      'assets/ingame/sidestatbackgold.png',
  statField:  'gold',
  formatStat: seat => sidecheckFormatK(seat && seat.gold),
});

function sgcAnimateIn()  { sgcPanel.animateIn(); }
function sgcAnimateOut() { sgcPanel.animateOut(); }
