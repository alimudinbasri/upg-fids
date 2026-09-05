// Auth Guard — include this in every protected page (after firebase-config.js)
(function () {
  const LOGIN_PAGE = (function() {
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    return base + "login.html";
  })();

  const ADMIN_EMAILS = [
    "alimudinbasri@gmail.com",
    "alimudin.basri@injourneyairports.id",
    "upg.pl@injourneyairports.id"
  ];

  // ── SPLASH SCREEN ───────────────────────────────────────────────────────────
  var _splashStart = Date.now();

  function _injectSplash() {
    var st = document.createElement('style');
    st.textContent =
      '@keyframes mfids-ring{to{stroke-dashoffset:0}}' +
      '@keyframes mfids-fi{to{opacity:1}}' +
      '@keyframes mfids-rise{to{transform:translateY(0)}}' +
      '@keyframes mfids-sw{from{transform:translate(40px,40px) rotate(0deg)}to{transform:translate(40px,40px) rotate(360deg)}}' +
      '@keyframes mfids-blip{0%,85%,100%{opacity:1}90%{opacity:.2}}' +
      '@keyframes mfids-pr{0%{r:2;opacity:.8}100%{r:9;opacity:0}}' +
      '@keyframes mfids-dp{0%,80%,100%{opacity:.15;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}' +
      '#mfids-sp{position:fixed;inset:0;z-index:99999;background:#0a1628;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .45s ease;font-family:"Segoe UI",system-ui,sans-serif;}';
    document.head.appendChild(st);

    var sp = document.createElement('div');
    sp.id = 'mfids-sp';

    // ── Radar SVG icon ──
    sp.innerHTML =
      '<svg width="110" height="110" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="margin-bottom:4px">' +
        // outer ring (draw-on animation)
        '<circle cx="40" cy="40" r="34" fill="none" stroke="#00bcd4" stroke-width="1.2" stroke-dasharray="213.6" stroke-dashoffset="213.6" style="animation:mfids-ring 1.2s ease forwards .2s"/>' +
        '<circle cx="40" cy="40" r="34" fill="none" stroke="#00bcd4" stroke-width="5"   stroke-dasharray="213.6" stroke-dashoffset="213.6" opacity=".05" style="animation:mfids-ring 1.2s ease forwards .2s"/>' +
        // inner rings
        '<circle cx="40" cy="40" r="22" fill="none" stroke="#00bcd4" stroke-width=".6" opacity="0" style="animation:mfids-fi .4s ease forwards 1.2s"/>' +
        '<circle cx="40" cy="40" r="10" fill="none" stroke="#00bcd4" stroke-width=".4" opacity="0" style="animation:mfids-fi .4s ease forwards 1.4s"/>' +
        // cardinal tick marks
        '<line x1="40" y1="1"  x2="40" y2="8"  stroke="#00bcd4" stroke-width="2" stroke-linecap="round" opacity="0" style="animation:mfids-fi .3s ease forwards 1s"/>' +
        '<line x1="40" y1="72" x2="40" y2="79" stroke="#00bcd4" stroke-width="2" stroke-linecap="round" opacity="0" style="animation:mfids-fi .3s ease forwards 1.05s"/>' +
        '<line x1="1"  y1="40" x2="8"  y2="40" stroke="#00bcd4" stroke-width="2" stroke-linecap="round" opacity="0" style="animation:mfids-fi .3s ease forwards 1s"/>' +
        '<line x1="72" y1="40" x2="79" y2="40" stroke="#00bcd4" stroke-width="2" stroke-linecap="round" opacity="0" style="animation:mfids-fi .3s ease forwards 1.05s"/>' +
        // diagonal tick marks
        '<line x1="63" y1="17" x2="58" y2="22" stroke="#00bcd4" stroke-width=".8" opacity="0" style="animation:mfids-fi .3s ease forwards 1.2s"/>' +
        '<line x1="17" y1="63" x2="22" y2="58" stroke="#00bcd4" stroke-width=".8" opacity="0" style="animation:mfids-fi .3s ease forwards 1.2s"/>' +
        '<line x1="17" y1="17" x2="22" y2="22" stroke="#00bcd4" stroke-width=".8" opacity="0" style="animation:mfids-fi .3s ease forwards 1.25s"/>' +
        '<line x1="63" y1="63" x2="58" y2="58" stroke="#00bcd4" stroke-width=".8" opacity="0" style="animation:mfids-fi .3s ease forwards 1.25s"/>' +
        // radar sweep (rotating line from center)
        '<g style="animation:mfids-sw 5s linear 1.6s infinite">' +
          '<line x1="0" y1="0" x2="0" y2="-34" stroke="#00bcd4" stroke-width="1" opacity=".55"/>' +
        '</g>' +
        // flight path dashed diagonal
        '<line x1="17" y1="63" x2="57" y2="23" stroke="#00bcd4" stroke-width=".7" stroke-dasharray="2.5,3.5" opacity="0" style="animation:mfids-fi .5s ease forwards 1.4s"/>' +
        // aircraft marker at end of path
        '<g transform="translate(54,26) rotate(-45)" opacity="0" style="animation:mfids-fi .4s ease forwards 1.6s">' +
          '<polygon points="0,-5.5 -3,3 0,1.5 3,3" fill="#00bcd4"/>' +
        '</g>' +
        // blip pulse ring
        '<circle cx="20" cy="60" r="0" fill="none" stroke="#00bcd4" stroke-width=".6" opacity="0" style="animation:mfids-pr 2.5s ease-out 2s infinite"/>' +
        // blip dot
        '<circle cx="20" cy="60" r="2" fill="#00bcd4" opacity="0" style="animation:mfids-fi .3s ease forwards 1.8s,mfids-blip 2.5s 2s infinite"/>' +
        // center crosshair
        '<line x1="35" y1="40" x2="45" y2="40" stroke="#00bcd4" stroke-width=".7" opacity="0" style="animation:mfids-fi .3s ease forwards 1.4s"/>' +
        '<line x1="40" y1="35" x2="40" y2="45" stroke="#00bcd4" stroke-width=".7" opacity="0" style="animation:mfids-fi .3s ease forwards 1.4s"/>' +
        '<circle cx="40" cy="40" r="1.8" fill="#00bcd4" opacity="0" style="animation:mfids-fi .3s ease forwards 1.5s"/>' +
      '</svg>' +

      // ── Wordmark ──
      '<div style="text-align:center;opacity:0;transform:translateY(12px);animation:mfids-fi .6s ease forwards 1.1s,mfids-rise .6s ease forwards 1.1s">' +
        '<div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#eaf6ff;line-height:1">' +
          'M<span style="color:#00bcd4;font-weight:200;">—</span>FIDS' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 8px">' +
          '<div style="width:5px;height:5px;border-radius:50%;background:#00bcd4;flex-shrink:0"></div>' +
          '<div style="flex:1;height:1px;background:#0d3a5a"></div>' +
          '<div style="width:5px;height:5px;border-radius:50%;background:#00bcd4;flex-shrink:0"></div>' +
        '</div>' +
        '<div style="font-size:8px;font-weight:600;letter-spacing:3px;color:#1e4a64">MOBILE FLIGHT INFORMATION DISPLAY SYSTEM</div>' +
        '<div style="font-size:7.5px;letter-spacing:2px;color:#122e42;margin-top:3px">SULTAN HASANUDDIN INTERNATIONAL AIRPORT</div>' +
      '</div>' +

      // ── Loading dots ──
      '<div style="display:flex;gap:10px;margin-top:28px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#00bcd4;display:inline-block;animation:mfids-dp 1.4s ease-in-out 1.2s infinite;opacity:.15"></span>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#00bcd4;display:inline-block;animation:mfids-dp 1.4s ease-in-out 1.4s infinite;opacity:.15"></span>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#00bcd4;display:inline-block;animation:mfids-dp 1.4s ease-in-out 1.6s infinite;opacity:.15"></span>' +
      '</div>';

    document.body.appendChild(sp);
  }

  function _removeSplash() {
    var elapsed = Date.now() - _splashStart;
    var wait = Math.max(0, 1000 - elapsed);
    setTimeout(function() {
      var el = document.getElementById('mfids-sp');
      if (!el) return;
      el.style.opacity = '0';
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 460);
    }, wait);
  }
  // ────────────────────────────────────────────────────────────────────────────

  document.documentElement.style.visibility = "hidden";
  document.documentElement.style.background  = "#0a1628";
  _injectSplash();

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  function emailToKey(email) {
    return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__');
  }

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

      // Reveal page then fade out splash
      document.documentElement.style.visibility = "visible";
      _removeSplash();
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
