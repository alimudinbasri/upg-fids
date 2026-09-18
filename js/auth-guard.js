// Auth Guard — include this in every protected page (after js/app-config.js and firebase-config.js)
(function () {
  const LOGIN_PAGE = (function() {
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    return base + "login.html";
  })();

  const ADMIN_EMAILS = APP_CONFIG.adminEmails;

  // ── Splash screen: removed (September 2026) ─────────────────────────────────
  // An animated radar splash used to cover the page while auth resolved. It made
  // nothing faster — it only made the wait look deliberate — and its fade-out
  // added ~200ms on top of however long auth actually took. The page is still
  // hidden on the app background until auth is confirmed, so an unauthorised
  // visitor never sees content before being redirected; that hold is just blank
  // now instead of animated.

  document.documentElement.style.visibility = "hidden";
  document.documentElement.style.background  = "#0a1628";

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  function emailToKey(email) {
    return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__');
  }

  // Site-wide maintenance mode — checked independently of auth state (public
  // read), so it redirects even a not-yet-logged-in visitor straight to
  // maintenance.html instead of making them log in first for nothing.
  db.collection("site_config").doc("maintenance").get().then(function(doc) {
    if (doc.exists && doc.data().enabled) {
      const base = location.pathname.replace(/\/[^/]*$/, '/');
      window.location.replace(base + "maintenance.html");
    }
  }).catch(function() {});

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace(LOGIN_PAGE);
      return;
    }

    const emailKey = emailToKey(user.email);

    const blockedPromise = db.collection("blocked_users").doc(emailKey).get()
      .catch(function() { return { exists: false }; });

    const adminPromise = ADMIN_EMAILS.includes(user.email)
      ? Promise.resolve(true)
      : db.collection("admins").doc(emailKey).get()
          .then(function(doc) { return doc.exists; })
          .catch(function() { return false; });

    Promise.all([blockedPromise, adminPromise]).then(function(results) {
      const blockedDoc = results[0];
      const isAdmin    = results[1];

      if (blockedDoc.exists) {
        const base = location.pathname.replace(/\/[^/]*$/, '/');
        window.location.replace(base + "blocked.html");
        return;
      }

      document.documentElement.style.visibility = "visible";
      setupPage(user, isAdmin);
    });
  });

  function setupPage(user, isAdmin) {
    window.CURRENT_USER = user;
    window.IS_ADMIN     = isAdmin;
    window._db          = db;

    const pageName = location.pathname.split('/').pop() || 'index.html';

    db.collection("activity_logs").add({
      uid:       user.uid,
      email:     user.email,
      name:      user.displayName || user.email,
      page:      pageName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent,
      timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      referrer:  document.referrer || "direct",
      platform:  navigator.platform || ""
    }).catch(function() {});

    function parseBrowser(ua) {
      if (/Edg\//.test(ua))         return 'Edge';
      if (/OPR\/|Opera/.test(ua))   return 'Opera';
      if (/Chrome\//.test(ua))      return 'Chrome';
      if (/Firefox\//.test(ua))     return 'Firefox';
      if (/Safari\//.test(ua))      return 'Safari';
      return 'Unknown';
    }
    function parseDevice(ua) {
      if (/Mobile|Android|iPhone|iPod/.test(ua)) return 'Mobile';
      if (/Tablet|iPad/.test(ua))                return 'Tablet';
      return 'Desktop';
    }

    const ua      = navigator.userAgent;
    const browser = parseBrowser(ua);
    const device  = parseDevice(ua);
    var   geoData = { ip: '', location: '' };

    // User login record (one doc per email, upserted on each login)
    const userLogRef = db.collection("user_logs").doc(emailToKey(user.email));
    function updateUserLog() {
      userLogRef.set({
        uid:      user.uid,
        email:    user.email,
        name:     user.displayName || user.email,
        device:   device,
        browser:  browser,
        ip:       geoData.ip,
        location: geoData.location,
        loginAt:  user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime) : firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function() {});
    }

    // Presence — full write on page load; heartbeat only touches timestamps
    const presenceRef = db.collection("presence").doc(user.uid);
    function writePresenceFull() {
      presenceRef.set({
        uid:        user.uid,
        email:      user.email,
        name:       user.displayName || user.email,
        page:       pageName,
        lastSeen:   firebase.firestore.FieldValue.serverTimestamp(),
        lastSeenMs: Date.now(),
        userAgent:  ua,
        browser:    browser,
        device:     device,
        ip:         geoData.ip,
        location:   geoData.location,
        loginAt:    user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime) : null,
        isAdmin:    isAdmin
      }).catch(function() {});
    }
    writePresenceFull();
    updateUserLog();

    const heartbeat = setInterval(function() {
      presenceRef.set({ lastSeen: firebase.firestore.FieldValue.serverTimestamp(), lastSeenMs: Date.now() }, { merge: true }).catch(function() {});
    }, 60000);
    window.addEventListener("beforeunload", function() { clearInterval(heartbeat); });

    // Fetch IP + location once per day, cache in localStorage
    (function fetchGeo() {
      var cached = null;
      try {
        var raw = localStorage.getItem('_mfids_geo');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed.ts && Date.now() - parsed.ts < 86400000) cached = parsed;
        }
      } catch(e) {}

      if (cached) {
        geoData = { ip: cached.ip || '', location: cached.location || '' };
        writePresenceFull();
        updateUserLog();
        return;
      }

      fetch('https://ipapi.co/json/')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          geoData = { ip: d.ip || '', location: [d.city, d.country_name].filter(Boolean).join(', ') };
          try { localStorage.setItem('_mfids_geo', JSON.stringify({ ip: geoData.ip, location: geoData.location, ts: Date.now() })); } catch(e) {}
          writePresenceFull();
          updateUserLog();
        })
        .catch(function() {
          fetch('https://api.ipify.org?format=json')
            .then(function(r) { return r.json(); })
            .then(function(d) {
              geoData = { ip: d.ip || '', location: '' };
              try { localStorage.setItem('_mfids_geo', JSON.stringify({ ip: geoData.ip, location: '', ts: Date.now() })); } catch(e) {}
              writePresenceFull();
              updateUserLog();
            })
            .catch(function() {});
        });
    })();

    const nameEl = document.getElementById("nav-user-name");
    if (nameEl) nameEl.textContent = user.displayName || user.email;

    if (isAdmin) {
      const adminLink = document.getElementById("nav-admin-link");
      if (adminLink) adminLink.style.display = "flex";
      const aboutLink = document.getElementById("nav-about-link");
      if (aboutLink) aboutLink.style.display = "flex";

      // The WA report template (tags reference, template editor, reset/update
      // buttons) is shared/global config — only admins may edit it. Everyone
      // can still open WA Report and use Copy Text, so only elements marked
      // .wa-admin-only are gated here.
      document.querySelectorAll(".wa-admin-only").forEach(function(el) {
        el.style.display = "";
      });
    }

    db.collection("presence").onSnapshot(function(snap) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      const count = snap.docs.filter(function(d) {
        const data = d.data();
        const ms = data.lastSeenMs || (data.lastSeen && data.lastSeen.toDate
          ? data.lastSeen.toDate().getTime() : 0);
        return ms >= cutoff;
      }).length;
      const el = document.getElementById("onlineCount");
      if (el) el.textContent = count;
    }, function() {});

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", function() {
        const base = location.pathname.replace(/\/[^/]*$/, '/');
        firebase.auth().signOut().then(function() {
          location.replace(base + "login.html");
        });
      });
    }
  }

  // Prevent bfcache from serving a stale auth state after navigation
  window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
      window.location.reload();
    }
  });
})();
