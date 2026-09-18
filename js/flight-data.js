// ============================================================
// FLIGHT DATA — the multi-day flight-fetching layer shared by
// analytics.html and laporan.html. Both need whole date ranges,
// so both read Firestore flights_cache first and fall back to a
// live AIS/GAS call per missing day. Load AFTER js/app-config.js.
//
// The single-day pages (index/otp/real_gate/real_belt) do NOT use
// this: they fetch only today, straight from GAS, with their own
// error UI and retry. Folding them in here would mean carrying
// four more sets of options for no shared code.
//
// Read order per day, unchanged from what this replaces:
//   in-memory dayCache -> Firestore flights_cache/{date}
//   -> live GAS fetch -> (on error) localStorage -> []
//
// What each page supplies:
//   buildFlight(row, type, dateStr)  its own row shape. analytics
//     builds the full record (times, delay, pax, category …);
//     laporan builds only date/type/flightNo/gate/belt because
//     that is all its report needs. This is the one genuinely
//     page-specific piece.
//   lsPrefix   localStorage key prefix, one per page so the two
//     pages' day caches never collide
//   onDayLoaded(flights)  optional side-effect per fetched day.
//     analytics collects the route and bay vocabularies for its
//     filter dropdowns here; laporan has no equivalent.
// ============================================================
var FlightData = (function () {

  // ── Row helpers ─────────────────────────────────────────────
  function fmt(v, def) {
    def = def === undefined ? '' : def;
    var s = String(v === null || v === undefined ? '' : v).trim();
    return s === '' || s === '-' ? def : s;
  }

  function first(obj, keys, def) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj ? obj[keys[i]] : undefined;
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return def === undefined ? '' : def;
  }

  // Named jsonp() for historical reasons only — it has used a plain
  // fetch() since the JSONP outage (74e6e4e). The GAS endpoint hangs
  // when a `callback` parameter is present, so never add one.
  function gasFetch(gasUrl, action, date) {
    return new Promise(function (resolve, reject) {
      var tid = setTimeout(function () { reject(new Error('Timeout: ' + action + ' ' + date)); }, 20000);
      fetch(gasUrl + '?action=' + action + '&date=' + encodeURIComponent(date), { cache: 'no-store' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function (data) { clearTimeout(tid); resolve(data); })
        .catch(function (err) { clearTimeout(tid); reject(new Error('Fetch error: ' + action + ' ' + date + ' - ' + err.message)); });
    });
  }

  function extractRows(data) {
    if (Array.isArray(data)) return data;
    if (data && data.data && Array.isArray(data.data)) return data.data;
    if (data && typeof data === 'object') {
      var keys = ['rows', 'flights', 'result', 'records'];
      for (var i = 0; i < keys.length; i++) if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    return [];
  }

  // flights_cache stores arrivals/departures as JSON *strings*, not as
  // native Firestore arrays. Anything else is treated as a cache miss.
  function toRowArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      try { var parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
    }
    return [];
  }

  function dateRangeList(fromStr, toStr) {
    var out = [], d = new Date(fromStr + 'T00:00:00'), end = new Date(toStr + 'T00:00:00');
    while (d <= end) {
      out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  // window._db is set by js/auth-guard.js once login is confirmed, which
  // happens after this script runs — poll for it rather than initializing
  // Firebase a second time.
  // timeoutMs is optional. Without it this waits forever, which is what the
  // multi-day pages want — they have nothing to show until login completes.
  // index.html passes one: it can still fall back to a live GAS fetch, so
  // hanging here would turn a recoverable situation into a blank page.
  function waitForDb(timeoutMs) {
    return new Promise(function (resolve) {
      if (window._db) { resolve(window._db); return; }
      var iv = setInterval(function () {
        if (window._db) { clearInterval(iv); resolve(window._db); }
      }, 50);
      if (timeoutMs) {
        setTimeout(function () { clearInterval(iv); resolve(window._db || null); }, timeoutMs);
      }
    });
  }

  // ── Reading flights_cache directly ──────────────────────────────────────
  // One document per date holding BOTH directions, so a day costs one read.
  // Returns raw AIS rows — each page normalizes them its own way — or null
  // when the day is not cached, so the caller can fall back to a live fetch.
  function readDayDoc(dateStr, timeoutMs) {
    return waitForDb(timeoutMs).then(function (db) {
      if (!db) return null;
      return db.collection('flights_cache').doc(dateStr).get().then(function (doc) {
        if (!doc.exists) return null;
        var d = doc.data() || {};
        var arrivals = toRowArray(d.arrivals);
        var departures = toRowArray(d.departures);
        if (!arrivals.length && !departures.length) return null;
        return { arrivals: arrivals, departures: departures, updatedAt: d.updatedAt || null };
      });
    }).catch(function (err) {
      console.warn('flights_cache read failed for', dateStr, err);
      return null;
    });
  }

  // The sync skips rewriting unchanged days, so flights_cache.updatedAt stops
  // moving during quiet periods and cannot answer "is the sync alive?". That
  // question has its own tiny document, written on every run.
  function readSyncHeartbeat(timeoutMs) {
    return waitForDb(timeoutMs).then(function (db) {
      if (!db) return null;
      return db.collection('sync_status').doc('heartbeat').get().then(function (doc) {
        return doc.exists ? (doc.data() || null) : null;
      });
    }).catch(function () { return null; });
  }

  // Infinity when there is no usable heartbeat — callers treat that as "dead".
  function heartbeatAgeMs(hb) {
    if (!hb || !hb.lastRun) return Infinity;
    var t = Date.parse(hb.lastRun);
    return isNaN(t) ? Infinity : Math.max(0, Date.now() - t);
  }

  // ── Per-page instance ───────────────────────────────────────
  function create(cfg) {
    var gasUrl = cfg.gasUrl || APP_CONFIG.gasUrl;
    var dayCache = {};

    function parseCacheDoc(data, dateStr) {
      if (!data) return null;
      var arrRaw = toRowArray(data.arrivals);
      var depRaw = toRowArray(data.departures);
      if (!arrRaw.length && !depRaw.length) return null;
      var keep = function (f) { return f.flightNo && f.flightNo !== '-'; };
      var arrRows = arrRaw.map(function (r) { return cfg.buildFlight(r, 'ARR', dateStr); }).filter(keep);
      var depRows = depRaw.map(function (r) { return cfg.buildFlight(r, 'DEP', dateStr); }).filter(keep);
      return arrRows.concat(depRows);
    }

    function fromCache(dateStr) {
      return waitForDb().then(function (db) {
        return db.collection('flights_cache').doc(dateStr).get();
      }).then(function (doc) {
        return doc.exists ? parseCacheDoc(doc.data(), dateStr) : null;
      }).catch(function (err) {
        console.warn('flights_cache read failed for', dateStr, err);
        return null;
      });
    }

    function fromLive(dateStr) {
      return Promise.all([gasFetch(gasUrl, 'arrival', dateStr), gasFetch(gasUrl, 'departure', dateStr)])
        .then(function (results) {
          var keep = function (f) { return f.flightNo && f.flightNo !== '-'; };
          var arrRows = extractRows(results[0]).map(function (r) { return cfg.buildFlight(r, 'ARR', dateStr); }).filter(keep);
          var depRows = extractRows(results[1]).map(function (r) { return cfg.buildFlight(r, 'DEP', dateStr); }).filter(keep);
          return arrRows.concat(depRows);
        });
    }

    function loadFromLS(dateStr) {
      try {
        var raw = localStorage.getItem(cfg.lsPrefix + dateStr);
        if (!raw) return null;
        return JSON.parse(raw).flights;
      } catch (e) { return null; }
    }

    function saveToLS(dateStr, flights) {
      try {
        localStorage.setItem(cfg.lsPrefix + dateStr, JSON.stringify({ flights: flights, ts: Date.now() }));
      } catch (e) {}
    }

    // stats is an optional per-call { cache, live } counter object. It is
    // deliberately passed in rather than held here, so an abandoned load
    // (e.g. "All data" dropped in favour of "Today") cannot corrupt the
    // counters of the load actually on screen.
    function fetchDay(dateStr, stats) {
      if (dayCache[dateStr]) return Promise.resolve(dayCache[dateStr]);
      return fromCache(dateStr).then(function (cached) {
        if (cached && cached.length) { if (stats) stats.cache++; return cached; }
        if (stats) stats.live++;
        return fromLive(dateStr);
      }).catch(function (err) {
        console.warn('Failed to fetch flights for', dateStr, err);
        return loadFromLS(dateStr) || [];
      }).then(function (dayFlights) {
        if (cfg.onDayLoaded) cfg.onDayLoaded(dayFlights);
        dayCache[dateStr] = dayFlights;
        saveToLS(dateStr, dayFlights);
        return dayFlights;
      });
    }

    // opts: { stats, onProgress(done, total, partial) }
    function fetchDays(dateList, opts) {
      opts = opts || {};
      var CONCURRENCY = 6, out = [], i = 0, done = 0;
      function next() {
        if (i >= dateList.length) return Promise.resolve(out);
        var batch = dateList.slice(i, i + CONCURRENCY); i += CONCURRENCY;
        return Promise.all(batch.map(function (d) { return fetchDay(d, opts.stats); })).then(function (results) {
          results.forEach(function (r) { out = out.concat(r); });
          done += batch.length;
          if (opts.onProgress) opts.onProgress(done, dateList.length, out);
          return next();
        });
      }
      return next();
    }

    return {
      fetchDay: fetchDay,
      fetchDays: fetchDays,
      fromCache: fromCache,
      fromLive: fromLive,
      parseCacheDoc: parseCacheDoc,
      loadFromLS: loadFromLS,
      saveToLS: saveToLS,
      gasFetch: function (action, date) { return gasFetch(gasUrl, action, date); }
    };
  }

  return {
    create: create,
    fmt: fmt, first: first, extractRows: extractRows, toRowArray: toRowArray,
    dateRangeList: dateRangeList, waitForDb: waitForDb,
    readDayDoc: readDayDoc, readSyncHeartbeat: readSyncHeartbeat,
    heartbeatAgeMs: heartbeatAgeMs
  };
})();
