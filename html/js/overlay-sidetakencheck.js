/* ── [FEATURE: sidetaken-check] ────────────────────────────────────
   Ranks all 10 players by total damage taken. See
   overlay-sidecheck-core.js for the shared panel/animation logic and
   the .sidecheck-* CSS block in mploverlay_v7.css for layout notes. */
const stcPanel = createSideCheck({
  clipId:     'sidetaken-check-clip',
  overlayId:  'sidetaken-check-overlay',
  headerText: 'DAMAGE TAKEN',
  statField:  'total_hurt',
  formatStat: seat => sidecheckFormatK(seat && seat.total_hurt),
});

function stcAnimateIn()  { stcPanel.animateIn(); }
function stcAnimateOut() { stcPanel.animateOut(); }
