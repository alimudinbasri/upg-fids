/**
 * Access check for the "FIDS - AirportsOne" web app (doGet).
 *
 * Until this is in place the web app answers anyone on the internet: no
 * login, no allowlist, no block list — and every anonymous call spends this
 * project's UrlFetch and runtime quota, which the 2-minute sync also needs.
 *
 * How it decides: the browser sends its Firebase ID token as ?idToken=
 * (js/auth-guard.js → GasAuth.url). This script asks Firestore for
 * sync_status/heartbeat USING THAT TOKEN. Firestore answers 200 only if
 * isAllowed() in firestore.rules passes — verified email, not blocked, and
 * allowed domain / allowlist / admin. So the rules stay the single
 * definition of "who may see flight data", for the app and for this script.
 *
 * A verdict is cached per token for 5 minutes (1 minute for a refusal), so
 * a normal page costs one extra UrlFetch per 5 minutes, and a newly blocked
 * user loses access here within 5 minutes.
 *
 * INSTALL
 *   1. Add this file to the Apps Script project.
 *   2. Make the first lines of doGet(e):
 *
 *        function doGet(e) {
 *          if (!requireAllowedCaller_(e)) return unauthorizedResponse_();
 *          ... existing code ...
 *
 *   3. Deploy → Manage deployments → edit the EXISTING deployment → New
 *      version (keeps the /exec URL in js/app-config.js unchanged).
 *
 * CHECK BEFORE DEPLOYING
 *   If syncFlightsToFirestore() / syncOneDate_() fetch data by calling this
 *   web app's own /exec URL through UrlFetchApp, those calls carry no token
 *   and will now be refused. They must call the data function directly
 *   (e.g. the function doGet() uses internally) instead of the URL.
 */

var FIREBASE_PROJECT_ID_ = 'upg-fids';

function requireAllowedCaller_(e) {
  var token = e && e.parameter && e.parameter.idToken;
  if (!token || token.length > 4096) return false;

  var cache = CacheService.getScriptCache();
  var key = 'idt_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var cached = cache.get(key);
  if (cached !== null) return cached === '1';

  var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID_ +
    '/databases/(default)/documents/sync_status/heartbeat?mask.fieldPaths=lastRun';
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  } catch (err) {
    // Network trouble reaching Firestore: refuse, but don't cache it.
    console.warn('requireAllowedCaller_: ' + err);
    return false;
  }

  var code = res.getResponseCode();
  var allowed = code === 200;
  // Cache only definite answers. A 429/5xx says nothing about the caller.
  if (code === 200 || code === 401 || code === 403) {
    cache.put(key, allowed ? '1' : '0', allowed ? 300 : 60);
  }
  return allowed;
}

function unauthorizedResponse_() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, message: 'unauthorized' }))
    .setMimeType(ContentService.MimeType.JSON);
}
