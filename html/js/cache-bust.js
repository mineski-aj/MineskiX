/* Forces every <img> (existing markup + anything JS assigns afterward) to
   re-fetch on each page load instead of serving a stale disk-cached copy.
   Talent/roster/logo PNGs get swapped on disk under the same filename mid-show,
   so a plain reload isn't enough to guarantee the new file actually loads. */
(function () {
  var CACHE_BUST = Date.now();
  var IMG_EXT_RE = /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i;
  var HAS_V_RE = /[?&]v=\d+($|&)/;

  function withBust(value) {
    if (typeof value !== 'string' || !IMG_EXT_RE.test(value) || HAS_V_RE.test(value)) return value;
    return value + (value.indexOf('?') === -1 ? '?' : '&') + 'v=' + CACHE_BUST;
  }

  var proto = window.HTMLImageElement && window.HTMLImageElement.prototype;
  var desc = proto && Object.getOwnPropertyDescriptor(proto, 'src');
  if (proto && desc && desc.configurable) {
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () { return desc.get.call(this); },
      set: function (value) { desc.set.call(this, withBust(value)); }
    });
  }

  function bustImg(img) {
    var raw = img.getAttribute('src');
    if (raw && IMG_EXT_RE.test(raw) && !HAS_V_RE.test(raw)) img.src = raw;
  }
  function bustAll(root) {
    var imgs = root.querySelectorAll ? root.querySelectorAll('img[src]') : [];
    for (var i = 0; i < imgs.length; i++) bustImg(imgs[i]);
  }

  // Scenes here mostly render via innerHTML template strings (carousels,
  // dashboards rebuilding a panel every few seconds), which sets the src
  // attribute directly and skips the property setter above entirely — so a
  // MutationObserver is needed to catch images added that way, not just at load.
  function bustExisting() {
    bustAll(document);
    new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var n = 0; n < added.length; n++) {
          var node = added[n];
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IMG') bustImg(node);
          else bustAll(node);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bustExisting);
  } else {
    bustExisting();
  }
})();
