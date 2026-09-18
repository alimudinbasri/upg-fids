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

  return { initNav: initNav };
})();
