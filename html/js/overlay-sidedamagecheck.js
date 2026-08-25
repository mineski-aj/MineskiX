/* ── [FEATURE: sidedamage-check] ───────────────────────────────────
   Ranks all 10 players by total damage dealt. See
   overlay-sidecheck-core.js for the shared panel/animation logic and
   the .sidecheck-* CSS block in mploverlay_v7.css for layout notes. */
const sdcPanel = createSideCheck({
  clipId:     'sidedamage-check-clip',
  overlayId:  'sidedamage-check-overlay',
  headerText: 'DAMAGE DEALT',
  statField:  'total_damage',
  formatStat: seat => sidecheckFormatK(seat && seat.total_damage),
});

function sdcAnimateIn()  { sdcPanel.animateIn(); }
function sdcAnimateOut() { sdcPanel.animateOut(); }
