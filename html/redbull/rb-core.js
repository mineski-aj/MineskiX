// rb-core.js — shared client for the Red Bull project's overlay pages.
// Needs /html/js/overlay-sse-shim.js loaded first (createOverlaySSE).
// State comes ONLY from the Red Bull Match Board (GET /rb/state, live via the 'rbdata' SSE event).
(function () {
  var RB = window.RB = {};
  RB.preview = new URLSearchParams(location.search).get('preview') === '1';
  RB.state = null;
  RB.countries = {};            // iso2 -> { iso2, code, name }
  RB.serverOffset = 0;          // serverNow - Date.now(), for the countdown
  var listeners = [];

  /* ── Placeholder art (replace via Edit tab → upload, or drop real files in). No player photos in this project. ── */
  function svgUri(svg) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }
  RB.FC27 = svgUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 80"><circle cx="40" cy="40" r="34" fill="#fff"/>' +
    '<text x="40" y="36" font-family="Arial" font-weight="900" font-size="15" text-anchor="middle" fill="#0F0069">EA</text>' +
    '<text x="40" y="54" font-family="Arial" font-weight="700" font-size="9" text-anchor="middle" fill="#0F0069">SPORTS</text>' +
    '<text x="92" y="60" font-family="Arial Black,Arial" font-weight="900" font-style="italic" font-size="62" fill="#fff">FC27</text></svg>');
  RB.PS = svgUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90"><path d="M10 14 v40 l14 5 V22 c0-4 2-3 4 -2 l28 10 v-12 L24 8 c-8 -2 -14 2 -14 6z" fill="#fff"/>' +
    '<text x="70" y="42" font-family="Arial" font-weight="600" font-size="32" fill="#fff">PlayStation</text>' +
    '<text x="70" y="76" font-family="Arial" font-weight="800" font-size="19" letter-spacing="5" fill="#fff">TOURNAMENTS</text></svg>');
  RB.LOGO = '/projects/redbull/assets/brand/wingscuplogo.png';
  RB.FLAG = function (iso2) { return iso2 ? '/projects/redbull/assets/flags/' + iso2 + '.svg' : ''; };

  RB.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ── Players (index into the Match Board roster) ── */
  RB.player = function (i) {
    var p = (RB.state && RB.state.players && RB.state.players[i]) || null;
    if (!p) return { idx: i, empty: true, first: '', last: '', code: '', iso2: '', flag: '' };
    var c = RB.countries[p.country] || {};
    return {
      idx: i, empty: false, first: String(p.first || '').toUpperCase(), last: String(p.last || '').toUpperCase(),
      iso2: p.country || '', code: c.code || String(p.country || '').toUpperCase(), flag: RB.FLAG(p.country),
    };
  };
  RB.nameHTML = function (pl) {
    return '<span class="fn">' + RB.esc(pl.first) + '</span>&nbsp;<span class="ln">' + RB.esc(pl.last) + '</span>';
  };
  RB.fullName = function (pl) { return (pl.first + ' ' + pl.last).trim(); };
  RB.initialName = function (pl) { return pl.empty ? '' : ((pl.first ? pl.first[0] + '. ' : '') + pl.last); };

  /* ── Countdown ── */
  RB.timerRemaining = function () {
    var t = RB.state && RB.state.countdown && RB.state.countdown.timer;
    if (!t) return 0;
    if (t.running && t.endAt) return Math.max(0, Math.round((t.endAt - (Date.now() + RB.serverOffset)) / 1000));
    return t.remaining || 0;
  };
  RB.fmtTime = function (sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return h ? (z(h) + ':' + z(m) + ':' + z(s)) : (z(m) + ':' + z(s));
  };

  /* ── Text fitting (call only once the scene is display:block — see CLAUDE.md) ── */
  function fitMeasure(el, max, min) {
    var size = max;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth + 1 && size > min) { size -= 1; el.style.fontSize = size + 'px'; }
  }
  RB.fit = function (el, max, min) {
    if (!el) return;
    fitMeasure(el, max, min);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(function () { fitMeasure(el, max, min); });
  };
  // Any element with data-fit="max,min" inside root.
  RB.fitAll = function (root) {
    (root || document).querySelectorAll('[data-fit]').forEach(function (el) {
      var a = el.getAttribute('data-fit').split(',');
      RB.fit(el, parseFloat(a[0]), parseFloat(a[1] || a[0] * 0.5));
    });
  };

  /* ── Saved Edit-tab overrides (position/size/font-size/asset), same contract as the other overlay pages ── */
  RB.loadOverrides = function (styleFile) {
    return fetch('/api/overlay-styles?file=' + encodeURIComponent(styleFile), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (styles) {
        if (!styles || !Object.keys(styles).length) return;
        var css = Object.keys(styles).map(function (sel) {
          var d = Object.keys(styles[sel]).filter(function (p) { return p !== 'asset'; }).map(function (p) {
            return (p === 'fontSize' ? 'font-size' : p) + ':' + styles[sel][p] + ' !important';
          }).join(';');
          return sel + '{' + d + '}';
        }).join('\n');
        var st = document.createElement('style'); st.id = 'rb-overrides'; st.textContent = css; document.head.appendChild(st);
        Object.keys(styles).forEach(function (sel) {
          if (styles[sel].asset === undefined) return;
          try { document.querySelectorAll(sel).forEach(function (el) { if (el.tagName === 'IMG' || el.tagName === 'VIDEO') el.src = styles[sel].asset; }); } catch (e) {}
        });
      }).catch(function () {});
  };

  /* ── Data + SSE ── */
  RB.onData = function (fn) { listeners.push(fn); if (RB.state) { try { fn(RB.state); } catch (e) { console.error(e); } } };
  function setState(s) {
    RB.state = s;
    if (s && s.serverNow) RB.serverOffset = s.serverNow - Date.now();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
  }
  RB.refresh = function () {
    return fetch('/rb/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(setState).catch(function () {});
  };

  // Fills every <img class="rb-fc27|rb-ps|rb-logo"> that has no src yet.
  RB.paintBrand = function () {
    document.querySelectorAll('img.rb-logo:not([src])').forEach(function (i) { i.src = RB.LOGO; });
    document.querySelectorAll('img.rb-fc27:not([src])').forEach(function (i) { i.src = RB.FC27; });
    document.querySelectorAll('img.rb-ps:not([src])').forEach(function (i) { i.src = RB.PS; });
  };

  // Fonts load lazily on first use — fit measurements taken before that run against fallback glyphs.
  RB.fontsReady = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['700 20px "RB Cond"', '900 20px "RB Apotek"', '600 20px "RB Apotek"', '700 20px "RB Mono"', '800 20px "RB Mono"']
      .map(function (f) { return document.fonts.load(f).catch(function () {}); }));
  };

  RB.start = function (styleFile) {
    if (RB.preview) document.body.classList.add('rb-preview');
    RB.paintBrand();
    RB.sse = createOverlaySSE();
    RB.sse.addEventListener('rbdata', function (e) { try { setState(JSON.parse(e.data)); } catch (err) {} });
    RB.sse.addEventListener('reload', function () { if (!RB.preview) location.reload(); });
    RB.sse.onopen = function () { RB.refresh(); };
    return fetch('/projects/redbull/assets/countries.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (list) { list.forEach(function (c) { RB.countries[c.iso2] = c; }); })
      .catch(function () {})
      .then(function () { return Promise.all([RB.refresh(), RB.loadOverrides(styleFile), RB.fontsReady()]); });
  };
})();
