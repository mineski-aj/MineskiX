// Regenerates html/redbull/rb-dashboard-config.js (Red Bull dashboard mode: overlay list + Edit-tab
// element registry) FROM the real overlay pages, so Edit defaults can never drift from the actual CSS.
//   node projects/redbull/tools/gen-dashboard-config.js
// Edit the SCENES/SUPERS tables below to add/rename editable elements, then re-run.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(root, 'html', f), 'utf8');

const LOGO='Logo', FC='FC27 Mark', PS='PlayStation Mark';
// [id, human name, 'block' => position only (children are fixed-size)]
const SCENES = [
  { key: 'rb_countdown', code: '101', name: 'Countdown', fn: 'rbEdit_countdown', els: [['cd-logo',LOGO],['cd-label','Label Plate'],['cd-time','Time Plate'],['cd-fc27',FC],['cd-ps',PS]] },
  { key: 'rb_holding', code: '102', name: 'Holding Page', fn: 'rbEdit_holding', els: [['hp-logo',LOGO],['hp-title','Headline Plate'],['hp-sub','Sub-line Plate'],['hp-fc27',FC],['hp-ps',PS]] },
  { key: 'rb_schedule', code: '106', name: 'Days Schedule', fn: 'rbEdit_schedule', els: [['sc-title','Title Plate'],['sc-sub','Sub Plate'],['sc-logo',LOGO],['sc-tab','Matches Tab'],['sc-rows','Match Rows (block)','block'],['sc-fc27',FC],['sc-ps',PS]] },
  { key: 'rb_matchid', code: '103a', name: 'Match ID', fn: 'rbEdit_matchid', els: [['mi-logo',LOGO],['mi-bar-l','Name Bar (Left)'],['mi-vs','VS'],['mi-bar-r','Name Bar (Right)'],['mi-fc27',FC],['mi-ps',PS]] },
  { key: 'rb_matchresults', code: '103b', name: 'Match Results', fn: 'rbEdit_matchresults', els: [['mr-logo',LOGO],['mr-name-l','Name Plate (Left)'],['mr-score','Score'],['mr-name-r','Name Plate (Right)'],['mr-chip-l','Country Chip (Left)'],['mr-chip-r','Country Chip (Right)'],['mr-fc27',FC],['mr-ps',PS]] },
  { key: 'rb_top16', code: '104a', name: 'Top 16', fn: 'rbEdit_top16', els: [['t16-logo',LOGO],['t16-grid','Player Grid (block)','block'],['t16-fc27',FC],['t16-ps',PS]] },
  { key: 'rb_top8', code: '104b', name: 'Top 8', fn: 'rbEdit_top8', els: [['t8-logo',LOGO],['t8-grid','Player Grid (block)','block'],['t8-fc27',FC],['t8-ps',PS]] },
  { key: 'rb_top4', code: '104c', name: 'Top 4', fn: 'rbEdit_top4', els: [['t4-logo',LOGO],['t4-grid','Player Row (block)','block'],['t4-fc27',FC],['t4-ps',PS]] },
  { key: 'rb_bracket', code: '105', name: 'Tournament Bracket', fn: 'rbEdit_bracket', els: [['br-logo',LOGO],['br-boxes','Bracket Boxes (block)','block'],['br-tag-uni','Top League Tag'],['br-tag-open','Bottom League Tag'],['br-r16-lbl','Round of 16 Label (block)','block'],['br-qf-uni','Quarter Final Label (Top)'],['br-qf-open','Quarter Final Label (Bottom)'],['br-sf-uni','Semi Final Label (Top)'],['br-sf-open','Semi Final Label (Bottom)'],['br-gf','Grand Final Label'],['br-win','Winner Box'],['br-fc27',FC],['br-ps',PS]] },
  { key: 'rb_leaderboard', code: '108', name: 'Leaderboard', fn: 'rbEdit_leaderboard', els: [['lb-logo',LOGO],['lb-title','Title Plate'],['lb-sub','Sub Plate'],['lb-heads','Column Heads (block)','block'],['lb-tabA','Group A Tab'],['lb-tabB','Group B Tab'],['lb-rowsA','Group A Rows (block)','block'],['lb-rowsB','Group B Rows (block)','block'],['lb-fc27',FC],['lb-ps',PS]] },
  { key: 'rb_winner', code: '110', name: 'Winner', fn: 'rbEdit_winner', els: [['wn-logo',LOGO],['wn-name','Name Plate'],['wn-sub','Sub Plate'],['wn-fc27',FC],['wn-ps',PS]] },
  { key: 'rb_split2', code: '107a', name: '2-Way Split', fn: 'rbEdit_split2', els: [['s2-logo',LOGO],['s2-feed-l','Feed Window (Left)'],['s2-feed-r','Feed Window (Right)'],['s2-title-l','Title Plate (Left)'],['s2-title-r','Title Plate (Right)'],['s2-fc27',FC],['s2-ps',PS]] },
  { key: 'rb_split3', code: '107b', name: '3-Way Split', fn: 'rbEdit_split3', els: [['s3-logo',LOGO],['s3-feed-t','Feed Window (Top)'],['s3-feed-l','Feed Window (Left)'],['s3-feed-r','Feed Window (Right)'],['s3-title-t','Title Plate (Top)'],['s3-title-l','Title Plate (Left)'],['s3-title-r','Title Plate (Right)'],['s3-fc27',FC],['s3-ps',PS]] },
  { key: 'rb_pip', code: '107b', name: 'Picture in Picture', fn: 'rbEdit_pip', els: [['pp-logo',LOGO],['pp-feed-main','Feed Window (Main)'],['pp-feed-inset','Feed Window (Inset)'],['pp-title','Title Plate'],['pp-fc27',FC],['pp-ps',PS]] },
  { key: 'rb_lbracket', code: '109', name: 'L-Bracket', fn: 'rbEdit_lbracket', els: [['lbk-logo',LOGO],['lbk-feed','Feed Window'],['lbk-name-1','Name Plate (Top)'],['lbk-vs','VS Chip'],['lbk-name-2','Name Plate (Bottom)'],['lbk-fc27',FC],['lbk-ps',PS]] },
];
const SUPERS = [
  { key: 'rb_super_single', code: '201a', name: 'Super Single', fn: 'rbEdit_super_single', els: [['ss-logo',LOGO],['ss-name','Name Plate'],['ss-ctry','Country Plate'],['ss-role','Role Plate']] },
  { key: 'rb_super_double', code: '201b', name: 'Super Double', fn: 'rbEdit_super_double', els: [['sd-c1','Country Plate (Left)'],['sd-n1','Name Plate (Left)'],['sd-logo',LOGO],['sd-n2','Name Plate (Right)'],['sd-c2','Country Plate (Right)']] },
  { key: 'rb_super_triple', code: '201c', name: 'Super Triple', fn: 'rbEdit_super_triple', els: [['st-logo',LOGO],['st-n1','Name Plate 1'],['st-n2','Name Plate 2'],['st-n3','Name Plate 3'],['st-c1','Country Chip 1'],['st-c2','Country Chip 2'],['st-c3','Country Chip 3']] },
  { key: 'rb_super_free', code: '202', name: 'Super Free Text', fn: 'rbEdit_super_free', els: [['sf-logo',LOGO],['sf-head','Headline Plate'],['sf-sub','Sub-line Plate']] },
  { key: 'rb_vs_super', code: '203', name: 'VS Super', fn: 'rbEdit_vs_super', els: [['sv-c1','Country Plate (Left)'],['sv-n1','Name Plate (Left)'],['sv-s1','Score (Left)'],['sv-logo',LOGO],['sv-s2','Score (Right)'],['sv-n2','Name Plate (Right)'],['sv-c2','Country Plate (Right)'],['sv-brand','Brand Plate'],['sv-fc27',FC],['sv-ps',PS]] },
  { key: 'rb_ingame', code: 'Frame', name: 'Player In-Game', fn: 'rbEdit_ingame', els: [['ig-box-l','Cam Box (Left)'],['ig-box-r','Cam Box (Right)'],['ig-name-l','Name Tab (Left)'],['ig-ctry-l','Country Tab (Left)'],['ig-ctry-r','Country Tab (Right)'],['ig-name-r','Name Tab (Right)']] },
];

function parseCss(html) {
  const rules = {};
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].forEach((m) => {
    m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
      sel.split(',').forEach((s) => { s = s.trim(); if (/^[#.][\w-]+$/.test(s)) rules[s] = Object.assign(rules[s] || {}, decls(body)); });
    });
  });
  return rules;
}
function decls(body) { const o = {}; body.split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }); return o; }
const px = (v) => (v && /^-?[\d.]+(px)?$/.test(v) ? parseFloat(v) : undefined);

function build(file, list, styleFile) {
  const html = read(file), css = parseCss(html), cfgs = {};
  list.forEach((sc) => {
    const elements = [], defaults = {};
    sc.els.forEach(([id, name, mode]) => {
      const tag = html.match(new RegExp('<\\w+[^>]*\\bid="' + id + '"[^>]*>'));
      if (!tag) throw new Error(file + ': missing #' + id);
      const cls = ((tag[0].match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
      const inline = decls((tag[0].match(/style="([^"]*)"/) || [])[1] || '');
      let d = {};
      cls.forEach((c) => Object.assign(d, css['.' + c] || {}));
      Object.assign(d, css['#' + id] || {}, inline);
      const out = { left: px(d.left), top: px(d.top) };
      if (out.left === undefined || out.top === undefined) throw new Error(file + ': #' + id + ' has no left/top');
      if (mode !== 'block') { out.width = px(d.width); out.height = px(d.height); }
      const fs_ = px(d['font-size']); if (fs_ !== undefined && mode !== 'block' && !/img|rb-logo|rb-photo|rb-fc27|rb-ps|rb-feed/.test(cls.join(' '))) out.fontSize = fs_;
      Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
      defaults['#' + id] = out;
      elements.push({ group: name, id: '#' + id, name });
    });
    cfgs[sc.key] = { label: sc.name + ' · ' + (styleFile === 'redbull_fullscreen' ? 'Full Screen' : 'Supers'), file, styleFile,
      defaultsKey: 'sb_edit_defaults_' + sc.key, elements, defaults, showFn: sc.fn };
  });
  return cfgs;
}

const edit = Object.assign({}, build('redbull-fullscreen.html', SCENES, 'redbull_fullscreen'), build('redbull-supers.html', SUPERS, 'redbull_supers'));

const features = (list) => list.map((s) => ({ name: s.code + ' · ' + s.name, show: '/overlay/' + s.key + '/show', hide: '/overlay/' + s.key + '/hide' }));
const overlays = [
  { id: 'rb_fullscreen', name: 'Wings Cup · Full Screen', file: 'redbull-fullscreen.html', globalHide: '/overlay/rb/hide',
    features: features(SCENES).concat([{ name: '401 · Wipe', show: '/overlay/rb_wipe/show', hide: '/overlay/rb_wipe/hide', realButtons: true }]) },
  { id: 'rb_supers', name: 'Wings Cup · Supers', file: 'redbull-supers.html', globalHide: '/overlay/rb/hide', features: features(SUPERS) },
];

const out = `// AUTO-GENERATED by projects/redbull/tools/gen-dashboard-config.js — do not hand-edit; re-run the generator.
// Red Bull dashboard mode: only active when the server's active project is "redbull". Other projects never see any of this.
(function () {
  var rbMode = false;
  try {   // synchronous on purpose: dashboard.html builds its overlay list at load, before any fetch could resolve
    var x = new XMLHttpRequest(); x.open('GET', '/api/projects', false); x.send();
    rbMode = JSON.parse(x.responseText).active === 'redbull';
  } catch (e) {}
  window.RB_MODE = rbMode;
  window.RB_DASH = {
    overlays: ${JSON.stringify(overlays, null, 2)},
    edit: ${JSON.stringify(edit, null, 2)},
    hiddenTabs: ['arrangement', 'mapselection', 'standings', 'dynamic', 'roster', 'sponsors'],
    matchBoardSrc: '/html/redbull-match-dashboard.html'
  };
})();
`;
fs.writeFileSync(path.join(root, 'html', 'redbull', 'rb-dashboard-config.js'), out);
console.log('wrote rb-dashboard-config.js —', Object.keys(edit).length, 'edit configs,', overlays.reduce((n, o) => n + o.features.length, 0), 'features');
