/*!
 * swarm-auto-live.js — hands-free swarm exit for the Works page (MOBILE ONLY)
 * ===========================================================================
 * The Works page runs the same swarm rebuild takeover as the homepage. On
 * mobile, when the cursor agents finish the build, the engine parks on its
 * "Rebuilt by N agents in Xs" result state waiting for a "Go live" tap.
 * This script lets that result breathe for a beat, then taps the button so
 * the takeover fades out on its own — matching the homepage's mobile flow.
 *
 * On desktop (>768px) this script exits immediately: the takeover waits for
 * a manual "Go live" click, exactly like the homepage. No listeners, no
 * timers, nothing.
 *
 * A manual exit (Go live / ✕ / Esc) simply beats this script to it — every
 * step re-checks that the takeover is still alive before acting.
 */
(function () {
  'use strict';

  /* Mobile gate — desktop keeps the stock manual "Go live" behaviour. */
  try {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
  } catch (_) { return; }

  /* Mirror swarm-init.js mode logic: if the takeover will not boot this load,
     there is nothing to babysit (?swarm=off, reduced motion, hidden tab). */
  function swarmWillBoot() {
    try {
      var v = new URLSearchParams(location.search).get('swarm');
      if (v === 'off' || v === '0') return false;
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      } catch (_) {}
      if (v === 'once' || v === 'session') {
        try { if (sessionStorage.getItem('swarm:done') === '1') return false; } catch (_) {}
      }
      return true;
    } catch (_) { return true; }
  }

  if (!swarmWillBoot()) return;

  /* Wait for <swarm-rebuild> to appear (the engine appends it to <html>),
     then poll its shadow DOM until the build completes — the HUD's hidden
     "Go live" button becomes visible at that moment. Hold the result state
     for a beat, tap it, done. */
  var armObserver = new MutationObserver(function () {
    var host = document.querySelector('swarm-rebuild');
    if (host) { armObserver.disconnect(); armAutoGolive(host); }
  });
  if (document.querySelector('swarm-rebuild')) {
    armAutoGolive(document.querySelector('swarm-rebuild'));
  } else {
    armObserver.observe(document.documentElement, { childList: true });
  }

  function armAutoGolive(host) {
    var ticks = 0;
    var poll = setInterval(function () {
      if (++ticks > 2880) { clearInterval(poll); return; } // ~12 min hard stop
      var app = null;
      try { app = window.__swarmRebuild && window.__swarmRebuild.app; } catch (_) {}
      if (!host.isConnected || !app || app.dead) { clearInterval(poll); return; }
      var btn = null;
      try { btn = host.shadowRoot && host.shadowRoot.querySelector('[data-a="live"]'); } catch (_) {}
      if (!btn || btn.hidden) return; // build still running
      clearInterval(poll);
      setTimeout(function () {
        if (!host.isConnected || !btn.isConnected) return; // user exited first
        var live = null;
        try { live = window.__swarmRebuild && window.__swarmRebuild.app; } catch (_) {}
        if (!live || live.dead) return;
        try { btn.click(); } catch (_) {}
      }, 1900);
    }, 250);
  }
})();
