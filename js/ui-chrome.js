// ============================================================
// UI CHROME — pieces of page furniture that every M-FIDS page
// shares. Load AFTER js/app-config.js and BEFORE any page's own
// inline <script>, same slot as app-config.js.
//
// Deliberately NOT included here:
//   tickClock() — looks near-identical across pages but is not.
//     analytics.html and index.html render the date in English
//     (analytics by explicit request — see about.html §12) while
//     real_gate/real_belt/laporan render it in Indonesian. Sharing
//     it would mean passing the day/month name arrays in, which is
//     most of the function body, so there is nothing left to win.
// ============================================================
var UIChrome = (function () {

  // ── Hamburger drawer nav ────────────────────────────────────
  // Markup contract (identical on all 8 pages):
  //   #navPanel    the drawer
  //   #navOverlay  the dark backdrop, click closes
  //   trigger      the burger button — #hamBtn everywhere except
  //                otp.html, which calls it #btnNav
  //
  // Exposes window.openNav / window.closeNav because some pages
  // call closeNav() from their own handlers (otp.html's Escape
  // handler also dismisses an option dropdown).
  function initNav(opts) {
    opts = opts || {};
    var trigger = document.getElementById(opts.triggerId || 'hamBtn');
    var overlay = document.getElementById('navOverlay');
    var panel   = document.getElementById('navPanel');

    function openNav() {
      if (panel)   panel.classList.add('show');
      if (overlay) overlay.classList.add('show');
    }
    function closeNav() {
      if (panel)   panel.classList.remove('show');
      if (overlay) overlay.classList.remove('show');
    }

    if (trigger) trigger.addEventListener('click', openNav);
    if (overlay) overlay.addEventListener('click', closeNav);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    window.openNav  = openNav;
    window.closeNav = closeNav;
    return { open: openNav, close: closeNav };
  }

  // ── Dark/light theme toggle ─────────────────────────────────
  // Markup contract: #themeToggle is the button; the light palette is
  // CSS-selected by :root[data-theme="light"] on every page.
  //
  // opts:
  //   storageKey   localStorage key — one per page, deliberately, so the
  //                pages remember their themes independently
  //   onChange     (theme) -> void, run after a *user* toggle only, not on
  //                the initial apply. analytics.html and laporan.html use
  //                it to redraw their canvases, which do not follow CSS
  //                variables on their own.
  //
  // The button shows the mode it is currently in: ☀️ in light, 🌙 in dark.
  // otp.html used to show these reversed and to stamp data-theme="dark"
  // instead of removing the attribute; both were brought in line with the
  // other five pages once confirmed unintentional. Keep all six identical —
  // if a page ever needs to differ, that is a product decision, not a
  // parameter to quietly add back here.
  function initTheme(opts) {
    opts = opts || {};
    var root = document.documentElement;
    var btn  = document.getElementById('themeToggle');
    if (!btn) return null;

    function applyTheme(t) {
      if (t === 'light') {
        root.setAttribute('data-theme', 'light');
        btn.textContent = '☀️';
      } else {
        root.removeAttribute('data-theme');
        btn.textContent = '🌙';
      }
    }

    var stored = null;
    try { stored = localStorage.getItem(opts.storageKey); } catch (e) {}
    applyTheme(stored || 'dark');

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(opts.storageKey, next); } catch (e) {}
      applyTheme(next);
      if (opts.onChange) opts.onChange(next);
    });

    return { apply: applyTheme };
  }

  return { initNav: initNav, initTheme: initTheme };
})();
