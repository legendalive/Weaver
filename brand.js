/* =========================================================
Weaver — brand.js  (repo root)
Single source of truth for the freehand golden W.

WHY THIS FILE EXISTS
The old mark was a Great Vibes text glyph with
-webkit-background-clip:text and line-height:.85. Gradient-clip
only paints INSIDE the element box, and the script W's entry
swash + exit flourish overflow that box — so they were painted
transparent. That is the "truncated W". It appeared in five
separate documents plus every dynamically rendered logo.

THE FIX
A path-drawn calligraphic W (thick tapered downstrokes +
hairline connectors, entry swash, looping exit flourish) drawn
in its own viewBox. It can never clip, needs no webfont, is
crisp at every size, and is byte-identical to the favicon.

INSTALL — one line in any page that shows the mark:
  <script src="brand.js"></script>        (repo root pages)
  <script src="../brand.js"></script>     (admin/, welcome/)
Nothing else. No CSS edits, no module edits.
========================================================= */
(function () {
  'use strict';
  if (window.__weaverMark) return;
  window.__weaverMark = '1.0.0';

  var STAMP = '1';
  var SELECTOR = '.weaver-logo, .w, .brand b, .splash-logo';

  /* ---------- the mark ----------
     viewBox 0 0 128 88. Ink extents ≈ x 6.8–121.7, y 12.8–74.2,
     so every swash sits comfortably inside the frame.
     HAIR = entry swash → down 1 → valley → rise → middle arch
            → down 2 → valley → rise → looping exit flourish.
     B1/B2 = tapered copperplate blades over the two downstrokes. */
  var HAIR =
    'M8 74C14 56 21 33 32 24' +
    'C33 42 33 58 37 68' +
    'C42 77 51 70 56 46' +
    'C58 36 59 26 61 22' +
    'C63 18 66 20 66 26' +
    'C66.5 44 66.5 58 70 68' +
    'C75 77 84 70 90 48' +
    'C93 37 95 28 97 24' +
    'C103 15 112 12 118 17' +
    'C123 21 122 30 115 31' +
    'C110 32 106 28 105 24';
  var B1 =
    'M27 25C26.5 42 28.5 57 33 68' +
    'C35 73 39.5 72.5 39 67.5' +
    'C37 56 36.5 42 37 25' +
    'C37 20 27 20 27 25Z';
  var B2 =
    'M61 27C60.5 44 62.5 57 66 68' +
    'C68 73 72.5 72.5 72 67.5' +
    'C70 56 70.5 44 71 27' +
    'C71 22 61 22 61 27Z';

  /* One continuous ramp across the whole mark (userSpaceOnUse so
     the hairline and both blades share a single gradient). */
  function grad(id) {
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" ' +
      'x1="16" y1="10" x2="112" y2="78">' +
      '<stop offset="0" stop-color="#fff6da"/>' +
      '<stop offset=".4" stop-color="#f9d97e"/>' +
      '<stop offset=".7" stop-color="#eebc52"/>' +
      '<stop offset="1" stop-color="#e0a83c"/>' +
      '</linearGradient>';
  }

  var uid = 0;
  function markSVG() {
    var id = 'wvg' + (++uid);
    return '<svg class="wv-mark" viewBox="0 0 128 88" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      '<defs>' + grad(id) + '</defs>' +
      '<path class="wv-hair" d="' + HAIR + '" fill="none" stroke="url(#' + id + ')" ' +
        'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="wv-blade wv-blade-1" d="' + B1 + '" fill="url(#' + id + ')"/>' +
      '<path class="wv-blade wv-blade-2" d="' + B2 + '" fill="url(#' + id + ')"/>' +
      '</svg>';
  }

  /* Same paths, heavier hairline so it survives 16×16, on the
     charcoal rounded tile the app already uses. */
  function faviconSVG() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs>' + grad('wvf') + '</defs>' +
      '<rect width="64" height="64" rx="14" fill="#0b0b0c"/>' +
      '<rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#2b2b30"/>' +
      '<g transform="translate(5.1 13.5) scale(.42)">' +
      '<path d="' + HAIR + '" fill="none" stroke="url(#wvf)" stroke-width="6" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + B1 + '" fill="url(#wvf)"/>' +
      '<path d="' + B2 + '" fill="url(#wvf)"/>' +
      '</g></svg>';
  }

  /* ---------- styles ---------- */
  var CSS = [
    /* Pre-stamp fallback: if JS is slow/blocked the text W still
       must not clip. Solid gold, generous line box, real padding. */
    '.weaver-logo:not([data-wv-mark]),.w:not([data-wv-mark]){',
      'background:none!important;',
      '-webkit-background-clip:border-box!important;background-clip:border-box!important;',
      '-webkit-text-fill-color:#e6b455!important;color:#e6b455!important;',
      'line-height:1.4!important;padding:.02em .16em .12em!important;',
      'overflow:visible!important;filter:none!important;',
      'text-shadow:0 2px 10px rgba(240,192,84,.35);',
    '}',
    /* Stamped: a clean, non-clipping inline box. */
    '.weaver-logo[data-wv-mark],.w[data-wv-mark],.brand b[data-wv-mark],.splash-logo[data-wv-mark]{',
      'display:inline-flex!important;align-items:center!important;justify-content:center!important;',
      'background:none!important;',
      '-webkit-background-clip:border-box!important;background-clip:border-box!important;',
      '-webkit-text-fill-color:initial!important;color:inherit!important;',
      'line-height:1!important;padding:0!important;overflow:visible!important;',
      'filter:none!important;font-style:normal!important;text-shadow:none!important;',
      'flex:none;vertical-align:middle;',
    '}',
    'svg.wv-mark{display:block;height:.95em;width:auto;overflow:visible;',
      'filter:drop-shadow(0 .02em .08em rgba(240,192,84,.42));pointer-events:none;}',
    '.logo-sm svg.wv-mark{height:.88em;}',
    '.logo-md svg.wv-mark{height:.92em;}',
    '.logo-lg svg.wv-mark{height:.96em;filter:drop-shadow(0 .03em .1em rgba(240,192,84,.45));}',
    '.logo-xl svg.wv-mark{height:1em;filter:drop-shadow(0 .035em .12em rgba(240,192,84,.5));}',
    '.brand b[data-wv-mark]{margin-right:.06em;}',
    '.brand b[data-wv-mark] svg.wv-mark{height:1.04em;filter:drop-shadow(0 1px 5px rgba(224,164,60,.4));}',
    /* Freehand reveal on the two hero sizes only. Base state is
       fully drawn, so no animation support = still correct. */
    '@keyframes wv-ink{from{stroke-dasharray:340;stroke-dashoffset:340}',
      'to{stroke-dasharray:340;stroke-dashoffset:0}}',
    '@keyframes wv-fade{from{opacity:0}to{opacity:1}}',
    '.logo-lg .wv-hair,.logo-xl .wv-hair{animation:wv-ink 1.05s cubic-bezier(.4,0,.2,1) both;}',
    '.logo-lg .wv-blade-1,.logo-xl .wv-blade-1{animation:wv-fade .55s ease-out .2s both;}',
    '.logo-lg .wv-blade-2,.logo-xl .wv-blade-2{animation:wv-fade .55s ease-out .52s both;}',
    '@media (prefers-reduced-motion:reduce){',
      '.logo-lg .wv-hair,.logo-xl .wv-hair,',
      '.logo-lg .wv-blade,.logo-xl .wv-blade{animation:none!important;}',
    '}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('weaver-mark-style')) return;
    var s = document.createElement('style');
    s.id = 'weaver-mark-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- stamping ---------- */
  function stamp(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.getAttribute('data-wv-mark') === STAMP) return;
    /* Guard: only the single-letter brand mark, never unrelated
       content that happens to carry a generic class. */
    var txt = (el.textContent || '').replace(/\s+/g, '');
    if (txt && txt !== 'W') return;
    el.textContent = '';
    el.insertAdjacentHTML('afterbegin', markSVG());
    el.setAttribute('data-wv-mark', STAMP);
    el.setAttribute('aria-hidden', 'true');
  }

  function sweep() {
    var nodes;
    try { nodes = document.querySelectorAll(SELECTOR); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i++) stamp(nodes[i]);
  }

  /* ---------- favicon ---------- */
  var faviconDone = false;
  function setFavicon() {
    if (faviconDone || !document.head) return;
    faviconDone = true;
    var href = 'data:image/svg+xml,' + encodeURIComponent(faviconSVG());
    var old = document.querySelectorAll('link[rel~="icon"]');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = href;
    document.head.appendChild(link);
    if (!document.querySelector('meta[name="theme-color"]')) {
      var meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#0b0b0c';
      document.head.appendChild(meta);
    }
  }

  /* ---------- lifecycle ---------- */
  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; sweep(); });
  }

  injectCSS();
  setFavicon();
  sweep();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setFavicon();
      sweep();
    });
  }

  /* Idempotent: stamping mutates the DOM, which re-queues one
     sweep that finds nothing left to do, then stops. */
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) { queue(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* Small public surface for future pages / exports. */
  window.WeaverMark = {
    svg: markSVG,
    favicon: faviconSVG,
    dataUri: function () { return 'data:image/svg+xml,' + encodeURIComponent(faviconSVG()); },
    refresh: sweep
  };
})();
