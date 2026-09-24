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
    return (email || '').trim().toLowerCase().replace(/\./g, '_').replace(/@/g, '__');
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

  // Resolves with the signed-in user once the checks below have let them in.
  // GasAuth waits on it so a GAS request never goes out without a token.
  var resolveAuthReady;
  const authReady = new Promise(function(resolve) { resolveAuthReady = resolve; });

  // Signs out first: login.html bounces a signed-in visitor straight back to
  // index.html, so redirecting while still signed in would loop. signOut()
  // fires onAuthStateChanged(null), whose plain redirect to login.html would
  // win the race and drop the error message — hence the flag.
  var rejecting = false;
  function rejectAccess() {
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    rejecting = true;
    auth.signOut().finally(function() {
      window.location.replace(base + "login.html?error=unauthorized");
    });
  }

  // Who may use the app — mirrors isAllowed() in firestore.rules, which is
  // what actually protects the data. This copy only decides what to show:
  // a clear "no access" message instead of a page full of permission errors.
  //   verified email AND not blocked AND (allowed domain OR allowlisted OR admin)
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      if (!rejecting) window.location.replace(LOGIN_PAGE);
      return;
    }
    if (!user.email || !user.emailVerified) { rejectAccess(); return; }

    const email    = user.email.toLowerCase();
    const emailKey = emailToKey(email);
    const isHardcodedAdmin = ADMIN_EMAILS.includes(email);
    const inDomain = APP_CONFIG.allowedDomains.some(function(d) {
      return email.slice(-(d.length + 1)) === "@" + d;
    });

    // A failed read resolves to null ("unknown") rather than "no": the rules
    // still refuse the data to anyone who isn't allowed, so a transient error
    // here should not lock a legitimate user out of the page.
    function docExists(col) {
      return db.collection(col).doc(emailKey).get()
        .then(function(doc) { return doc.exists; })
        .catch(function() { return null; });
    }

    Promise.all([
      docExists("blocked_users"),
      isHardcodedAdmin ? Promise.resolve(true) : docExists("admins"),
      (inDomain || isHardcodedAdmin) ? Promise.resolve(false) : docExists("allowed_users")
    ]).then(function(results) {
      const blocked     = results[0];
      const isAdmin     = results[1] === true;
      const allowlisted = results[2];

      if (blocked === true) {
        const base = location.pathname.replace(/\/[^/]*$/, '/');
        window.location.replace(base + "blocked.html");
        return;
      }
      if (!inDomain && !isAdmin && allowlisted === false && results[1] === false) {
        rejectAccess();
        return;
      }

      document.documentElement.style.visibility = "visible";
      setupPage(user, isAdmin);
      resolveAuthReady(user);
    });
  });

  // Builds a GAS request URL carrying the caller's Firebase ID token, which
  // the Apps Script doGet() checks before answering (see apps-script/).
  // getIdToken() returns the cached token and only refreshes it near expiry.
  window.GasAuth = {
    url: function(action, date) {
      return authReady.then(function(user) { return user.getIdToken(); }).then(function(token) {
        return APP_CONFIG.gasUrl + "?action=" + encodeURIComponent(action) +
          "&date=" + encodeURIComponent(date) + "&idToken=" + encodeURIComponent(token);
      });
    }
  };

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
      expireAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    var   hasCachedGeo = false;

    // Check cached geoData synchronously before initial Firestore write to eliminate redundant writes
    try {
      var raw = localStorage.getItem('_mfids_geo');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.ts && Date.now() - parsed.ts < 86400000) {
          geoData = { ip: parsed.ip || '', location: parsed.location || '' };
          hasCachedGeo = true;
        }
      }
    } catch(e) {}

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

    // A hidden tab skips its beat and simply drops out of the online count;
    // the next visible beat brings it back. Wall-mounted boards stay visible.
    const heartbeat = setInterval(function() {
      if (document.visibilityState === "hidden") return;
      presenceRef.set({ lastSeen: firebase.firestore.FieldValue.serverTimestamp(), lastSeenMs: Date.now() }, { merge: true }).catch(function() {});
    }, APP_CONFIG.presenceHeartbeatMs);
    window.addEventListener("beforeunload", function() { clearInterval(heartbeat); });

    // Fetch IP + location only if not already cached
    if (!hasCachedGeo) {
      (function fetchGeo() {
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
    }

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

    // Online count — admins only. It used to be an onSnapshot on the whole
    // presence collection in every tab: each heartbeat was pushed to every
    // open tab (reads grew with users²) and every user could read every
    // other user's email and IP. Presence is now admin-read in the rules, and
    // this polls only the recently-seen docs.
    const onlineEl = document.getElementById("onlineCount");
    if (onlineEl && !isAdmin) {
      if (onlineEl.parentElement) onlineEl.parentElement.style.display = "none";
    } else if (onlineEl) {
      const refreshOnline = function() {
        db.collection("presence")
          .where("lastSeenMs", ">=", Date.now() - APP_CONFIG.onlineWindowMs)
          .get()
          .then(function(snap) { onlineEl.textContent = snap.size; })
          .catch(function() {});
      };
      refreshOnline();
      setInterval(function() {
        if (document.visibilityState !== "hidden") refreshOnline();
      }, APP_CONFIG.presenceHeartbeatMs);
    }

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
