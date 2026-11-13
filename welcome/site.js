/* =========================================================
Weaver — welcome/site.js
Marketing-site behaviour: stuck nav, current-page marker,
staged scroll reveals, live footer year. No dependencies.
========================================================= */
(function () {
  'use strict';

  /* ---- nav gains a border + deeper background once scrolled ---- */
  var nav = document.querySelector('nav');
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('is-stuck', window.scrollY > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- mark the current page in the nav ---- */
  var here = (location.pathname.split('/').pop() || 'index.html')
    .replace(/\.html$/, '') || 'index';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var target = (a.getAttribute('href') || '').replace(/\.html$/, '').replace(/^\.\//, '');
    if (target === here || (here === 'index' && (target === '' || target === '/'))) {
      a.classList.add('is-current');
      a.setAttribute('aria-current', 'page');
    }
  });

  /* ---- staged reveals; degrades to fully visible ---- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(function (n) { n.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var siblings = Array.prototype.slice.call(
          (el.parentElement || document).querySelectorAll(':scope > .reveal')
        );
        var i = Math.max(0, siblings.indexOf(el));
        el.style.transitionDelay = Math.min(i, 5) * 90 + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---- gentle hero parallax (transform only, no layout thrash) ---- */
  var hero = document.querySelector('.hero .wrap');
  if (hero && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = Math.min(window.scrollY, 520);
        hero.style.transform = 'translate3d(0,' + (y * 0.14) + 'px,0)';
        hero.style.opacity = String(Math.max(0, 1 - y / 620));
      });
    }, { passive: true });
  }

  /* ---- live copyright year ---- */
  document.querySelectorAll('[data-year]').forEach(function (n) {
    n.textContent = String(new Date().getFullYear());
  });
})();
