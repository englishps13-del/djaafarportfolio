/*! 
 * works-popup.js — "Do you want to see my works?" popup (MOBILE ONLY)
 * =====================================================================
 * Behaviour:
 *   1. On desktop (>768px) this script exits immediately: no DOM is built,
 *      no CSS is downloaded, no listeners are attached. The desktop version
 *      of the site is 100% untouched.
 *   2. On mobile the popup appears right after the homepage's main animation
 *      (the swarm rebuild takeover) has fully exited — detected by watching
 *      for the removal of the <swarm-rebuild> overlay host element.
 *   3. When the swarm's cursor agents finish the build, the engine parks on
 *      its "Rebuilt by N agents" result state. This script lets that result
 *      breathe for a moment, then taps the engine's own "Go live" button so
 *      the takeover fades out on its own and the popup follows — no tap
 *      required. A manual exit (Go live / ✕ / Esc) simply beats us to it and
 *      the popup appears right after the takeover ends either way.
 *   4. If the swarm takeover never runs (?swarm=off, reduced motion,
 *      background-tab bail-out, engine failure), a fallback timer shows the
 *      popup ~2s after the page is ready instead. When the swarm IS expected,
 *      the safety net only starts counting from window load AND stands down
 *      while a takeover exists — the popup can never preempt the animation.
 *   5. Shows on EVERY page load (the takeover replays every load too).
 *   6. The popup injects its own stylesheet (works-popup.css) on mobile only.
 *
 * Visual language: the swarm's own cursor-agent aesthetic — Bebas Neue
 * stencil typography, JetBrains Mono HUD labels, amber agent particles
 * (same palette as the engine's cursors), top-down build-in reveal.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Mobile gate — desktop is never touched in any way.                 *
   * ------------------------------------------------------------------ */
  var mobileMQ = '(max-width: 768px)';
  try {
    if (!window.matchMedia(mobileMQ).matches) return;
  } catch (_) { return; }

  /* Load the popup stylesheet (mobile only — desktop never fetches it).
     NOTE: this is unconditional because the stylesheet also styles the
     ".mobile-works-link" that the homepage injects into the Projects
     section intro on mobile. */
  try {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './works-popup.css';
    document.head.appendChild(css);
  } catch (_) {}

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

  /* ------------------------------------------------------------------ *
   *  Swarm takeover detection                                          *
   * ------------------------------------------------------------------ */
  // Mirrors swarm-init.js mode logic: decides whether the takeover engine
  // is going to run on this load, so the fallback timer can be tuned.
  function swarmWillBoot() {
    try {
      var v = new URLSearchParams(location.search).get('swarm');
      if (v === 'off' || v === '0') return false;
      if (reduceMotion) return false; // swarm-init refuses reduced motion
      if (v === 'once' || v === 'session') {
        try { if (sessionStorage.getItem('swarm:done') === '1') return false; } catch (_) {}
      }
      return true; // default mode = every load
    } catch (_) { return true; }
  }

  var revealed = false;
  var hostSeen = false;
  var appRef = null;   // reference to the swarm App instance (for HUD stats)
  var swarmStats = null;

  /* Hard guarantee: the question must NEVER overlap the takeover. While a
     <swarm-rebuild> host exists anywhere in the document, keep waiting. */
  function takeoverOnScreen() {
    try { return !!document.querySelector('swarm-rebuild'); } catch (_) { return false; }
  }

  /* Fallback path — the engine was never expected, or never showed up. */
  function reveal() {
    if (revealed || hostSeen || takeoverOnScreen()) return;
    revealed = true;
    showPopup();
  }

  /* Takeover path — the host element has left the DOM for good. */
  function revealForced() {
    if (revealed || takeoverOnScreen()) return;
    revealed = true;
    showPopup();
  }

  // Fallbacks only start counting once the tab is actually visible
  // (the swarm itself refuses to boot in hidden tabs — same courtesy here).
  function whenVisible(fn) {
    if (document.visibilityState === 'visible') return fn();
    var handler = function () {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', handler);
        fn();
      }
    };
    document.addEventListener('visibilitychange', handler);
  }

  function armFallback(delayMs) {
    whenVisible(function () {
      setTimeout(reveal, delayMs);
    });
  }

  if (swarmWillBoot()) {
    // Expected path: wait for the takeover to appear, run, and exit — the
    // popup then follows (see watchHost). No timer is racing the engine.
    //
    // Safety net for a silently dead engine only (404, boot error, hidden-tab
    // bail-out): it starts counting from WINDOW LOAD + 9s — the engine boots
    // after load, so the popup can never preempt the animation — and it
    // re-checks the DOM at fire time, standing down while a takeover exists.
    var fallbackArmed = false;
    function armLoadFallback() {
      if (fallbackArmed || hostSeen) return;
      fallbackArmed = true;
      whenVisible(function () { setTimeout(reveal, 9000); });
    }
    if (document.readyState === 'complete') armLoadFallback();
    else window.addEventListener('load', armLoadFallback, { once: true });

    /* Mobile hands-free exit: when the cursor agents finish the build, the
       engine parks on its "Rebuilt by N agents in Xs" result state waiting
       for a "Go live" tap. We let that result breathe for a beat, then tap
       the button so the takeover fades out and the question popup follows —
       no interaction required. A manual exit (Go live / ✕ / Esc) simply
       beats us to it and the popup still appears when the host is gone. */
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
          if (!host.isConnected || !btn.isConnected) return; // exited already
          var live = null;
          try { live = window.__swarmRebuild && window.__swarmRebuild.app; } catch (_) {}
          if (!live || live.dead) return;
          try { btn.click(); } catch (_) {}
        }, 1900);
      }, 250);
    }

    function watchHost(host) {
      hostSeen = true;
      try {
        appRef = (window.__swarmRebuild && window.__swarmRebuild.app) || appRef;
      } catch (_) {}
      armAutoGolive(host);
      var obs = new MutationObserver(function () {
        if (host.isConnected) return;
        obs.disconnect();
        // restart() ("Replay") removes the old host and immediately creates
        // a new one — don't fire the popup mid-restart.
        setTimeout(function () {
          var next = document.querySelector('swarm-rebuild');
          if (next) { watchHost(next); return; }
          captureSwarmStats();
          setTimeout(revealForced, 600); // small breath after the takeover exits
        }, 60);
      });
      obs.observe(document.documentElement, { childList: true });
    }

    // The engine appends <swarm-rebuild> to documentElement.
    var bootObserver = new MutationObserver(function () {
      var host = document.querySelector('swarm-rebuild');
      if (host) { bootObserver.disconnect(); watchHost(host); }
    });
    if (document.querySelector('swarm-rebuild')) {
      watchHost(document.querySelector('swarm-rebuild'));
    } else {
      bootObserver.observe(document.documentElement, { childList: true });
    }
  } else {
    // Swarm will not run — show the popup shortly after the page is ready.
    armFallback(2000);
  }

  // HUD-style stats lifted from the engine before it tears down.
  function captureSwarmStats() {
    try {
      var E = appRef && appRef.engine;
      if (!E) return;
      var agents = E.cursors ? E.cursors.filter(function (c) { return c.worked; }).length + (E.retired || 0) : 0;
      var layers = E.tasks ? E.tasks.length : 0;
      var secs = (E.endTime && E.startTime) ? ((E.endTime - E.startTime) / 1000).toFixed(1) : null;
      if (agents || layers) swarmStats = { agents: agents, layers: layers, secs: secs };
    } catch (_) { swarmStats = null; }
  }

  /* ------------------------------------------------------------------ *
   *  Amber agent particles (same palette as the swarm cursors)          *
   * ------------------------------------------------------------------ */
  var PARTICLE_COLORS = ['#DC9750', '#E7B06B', '#EBBE83', '#C9823B', '#D8A567', '#B4763B', '#F4F3F0'];
  var particleState = null;

  function startParticles(canvas) {
    if (reduceMotion || !canvas || !canvas.getContext) return;
    try {
      var ctx = canvas.getContext('2d');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w, h;

      // Pre-rendered glow sprites — cheap to draw, pretty on dark navy.
      var sprites = PARTICLE_COLORS.map(function (color) {
        var s = document.createElement('canvas');
        s.width = s.height = 32;
        var g = s.getContext('2d');
        var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, color);
        grad.addColorStop(0.35, color + 'B3'); // ~70% alpha
        grad.addColorStop(1, color + '00');
        g.fillStyle = grad;
        g.fillRect(0, 0, 32, 32);
        return s;
      });

      var COUNT = 42;
      var parts = [];
      function spawn(initial) {
        return {
          x: Math.random() * w,
          y: initial ? Math.random() * h : h + 12,
          v: 10 + Math.random() * 26,          // rise speed px/s
          sway: 6 + Math.random() * 16,        // horizontal sway amplitude
          freq: 0.15 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          size: 2.5 + Math.random() * 5.5,
          alpha: 0.25 + Math.random() * 0.5,
          sprite: sprites[(Math.random() * sprites.length) | 0]
        };
      }
      function resize() {
        w = canvas.clientWidth; h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      resize();
      for (var i = 0; i < COUNT; i++) parts.push(spawn(true));

      var raf = 0, last = performance.now(), t = 0, running = true;
      function frame(now) {
        if (!running) return;
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now; t += dt;
        ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          p.y -= p.v * dt;
          var x = p.x + Math.sin(t * p.freq * Math.PI * 2 + p.phase) * p.sway;
          var flicker = p.alpha * (0.75 + 0.25 * Math.sin(t * 2 + p.phase));
          if (p.y < -14) parts[i] = spawn(false);
          ctx.globalAlpha = Math.max(0, flicker);
          var s = p.size * 4;
          ctx.drawImage(p.sprite, x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      var onResize = function () { resize(); };
      window.addEventListener('resize', onResize, { passive: true });
      var onVis = function () {
        if (document.hidden) { running = false; cancelAnimationFrame(raf); }
        else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      };
      document.addEventListener('visibilitychange', onVis);

      particleState = {
        stop: function () {
          running = false;
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
          document.removeEventListener('visibilitychange', onVis);
        }
      };
    } catch (_) { particleState = null; }
  }

  /* ------------------------------------------------------------------ *
   *  The popup itself                                                   *
   * ------------------------------------------------------------------ */
  function showPopup() {
    var overlay = document.createElement('div');
    overlay.className = 'wp-overlay' + (reduceMotion ? ' wp-no-fx' : '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'wp-question');

    var statusText = swarmStats
      ? 'REBUILT BY ' + swarmStats.agents + ' AGENTS' + (swarmStats.secs ? ' IN ' + swarmStats.secs + 'S' : '') + ' — PAGE LIVE'
      : 'PORTFOLIO READY — PAGE LIVE';

    overlay.innerHTML =
      '<canvas class="wp-particles" aria-hidden="true"></canvas>' +
      '<div class="wp-panel" tabindex="-1">' +
        '<div class="wp-status wp-reveal"><span>' + statusText + '</span><span class="wp-caret" aria-hidden="true"></span></div>' +
        '<div class="wp-kicker wp-reveal d1">DO YOU WANT TO</div>' +
        '<h2 class="wp-question wp-reveal d2" id="wp-question">SEE MY WORKS?</h2>' +
        '<p class="wp-sub wp-reveal d3">23+ projects — websites, apps, games &amp; more.<br>Live previews on desktop &amp; phone.</p>' +
        '<div class="wp-actions">' +
          '<a class="wp-btn wp-btn-yes wp-reveal d4" id="wp-yes" href="./works.html">YES — SHOW ME&nbsp;&rarr;</a>' +
          '<button type="button" class="wp-btn wp-btn-no wp-reveal d5" id="wp-no">NOT NOW</button>' +
        '</div>' +
        '<div class="wp-esc">TAP OUTSIDE TO SKIP</div>' +
      '</div>';

    // Scroll lock while the question is on screen.
    var prevHtml = document.documentElement.style.overflow;
    var prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    document.body.appendChild(overlay);

    var yes = overlay.querySelector('#wp-yes');
    var no = overlay.querySelector('#wp-no');
    var panel = overlay.querySelector('.wp-panel');
    var prevFocus = document.activeElement;

    // Entrance (double-rAF so initial styles are committed first).
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('on'); });
    });

    startParticles(overlay.querySelector('.wp-particles'));

    try { panel.focus({ preventScroll: true }); } catch (_) { try { panel.focus(); } catch (_) {} }

    function close() {
      overlay.classList.remove('on');
      if (particleState) { particleState.stop(); particleState = null; }
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.documentElement.style.overflow = prevHtml;
        document.body.style.overflow = prevBody;
        try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (_) {}
      }, reduceMotion ? 30 : 430);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        // Tiny focus trap — the dialog only has two focusable controls.
        var list = [yes, no];
        var ix = list.indexOf(document.activeElement);
        e.preventDefault();
        var next = e.shiftKey ? (ix <= 0 ? list.length - 1 : ix - 1) : (ix === list.length - 1 ? 0 : ix + 1);
        list[next].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    no.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }
})();
