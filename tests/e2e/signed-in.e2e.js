// End-to-end: the real pages (served by local Apache) signed in as different
// users, with Firebase Auth + Firestore pointed at LOCAL EMULATORS by an
// injected script. Nothing touches the upg-fids project.
// Needs: the app served at http://localhost/fids/ (XAMPP), Google Chrome, and
// emulators running — from tests/rules:
//   npx firebase emulators:start --only auth,firestore --project upg-fids --config firebase.test.json
// then: node tests/e2e/signed-in.e2e.js
const fs = require('fs');
const { spawn } = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost/fids/';
const PROJECT = 'upg-fids';           // what js/firebase-config.js says
const FS = 'http://127.0.0.1:8089', AUTH = 'http://127.0.0.1:9099';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const key = (e) => e.trim().toLowerCase().replace(/\./g, '_').replace(/@/g, '__');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // WITA date

async function j(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(url + ' ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : {};
}
const owner = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
function fsValue(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  throw new Error('type');
}
async function seed(path, data) {
  const fields = {}; for (const k in data) fields[k] = fsValue(data[k]);
  await j(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields }) });
}
async function readDoc(path) {
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: owner });
  return r.ok ? r.json() : null;
}
async function mkUser(email, verified, displayName) {
  const r = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }) });
  await j(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: owner, body: JSON.stringify({ localId: r.localId, emailVerified: verified, displayName }) });
}

const INJECT = `(() => {
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true,
    get() { return fb; },
    set(v) {
      fb = v;
      const init = v.initializeApp.bind(v);
      v.initializeApp = function () {
        const app = init.apply(null, arguments);
        try { v.auth().useEmulator('${AUTH}', { disableWarnings: true }); } catch (e) {}
        try { v.firestore().useEmulator('127.0.0.1', 8089); } catch (e) {}
        return app;
      };
    } });
  // Keep third-party geo lookups out of the test.
  const f = window.fetch;
  window.fetch = function (u) { if (/ipapi|ipify/.test(String(u))) return Promise.reject(new Error('blocked in test')); return f.apply(this, arguments); };
})();`;

async function browser(profile) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port,
    '--user-data-dir=' + process.env.TEMP + '/e2e_' + profile + '_' + Date.now(), 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); }
    catch (e) { await sleep(200); }
  }
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {}; const events = [];
  ws.addEventListener('message', (m) => { const x = JSON.parse(m.data); if (x.id && pending[x.id]) { pending[x.id](x); delete pending[x.id]; } else if (x.method) events.push(x); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  const evalv = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  return {
    events, evalv,
    async go(path, wait = 6000) { events.length = 0; await send('Page.navigate', { url: BASE + path }); await sleep(wait); },
    exceptions() { return events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text); },
    close() { ws.close(); proc.kill(); }
  };
}

async function waitUrl(b, re, ms) {
  for (let t = 0; t < ms; t += 500) { if (re.test((await b.evalv('location.href')) || '')) return true; await sleep(500); }
  return false;
}
// Signs in on login.html; login.html then forwards to ?next= (default
// index.html), so the page's own access checks run straight away.
async function signedInBrowser(email, next) {
  const b = await browser(email.replace(/\W/g, '_'));
  await b.go('login.html' + (next ? '?next=' + next : ''), 4000);
  const r = await b.evalv(`firebase.auth().signInWithEmailAndPassword(${JSON.stringify(email)}, 'secret123').then(() => 'ok', e => e.code)`);
  if (r !== 'ok') throw new Error('sign-in failed for ' + email + ': ' + r);
  await sleep(3000);
  return b;
}

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (cond || !detail ? '' : '  → ' + detail));
  if (!cond) failures++;
}

(async () => {
  // ── rules + data ──
  const rules = fs.readFileSync(require('path').join(__dirname, '../../firestore.rules'), 'utf8');
  await j(`${FS}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ content: rules }] } }) });
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

  const row = (n, t) => ({ nopen: n, iata_code: 'CGK', city: 'JAKARTA', time: today + ' ' + t + ':00', schedule: today + ' ' + t + ':00',
    estimate: '', actual: today + ' ' + t + ':05', reg: 'PK-AAA', type: 'B738', bay_id: '5', gate: '3', belt: '4', remark: 'Departed', pax: 150 });
  await seed('flights_cache/' + today, { arrivals: JSON.stringify([row('JT-100', '08:00')]), departures: JSON.stringify([row('JT-101', '09:00')]), updatedAt: new Date().toISOString() });
  // neighbours too, so index.html never falls back to the production GAS
  const shift = (n) => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  for (const d of [shift(-1), shift(1)]) await seed('flights_cache/' + d, { arrivals: JSON.stringify([row('JT-200', '10:00')]), departures: JSON.stringify([row('JT-201', '11:00')]), updatedAt: new Date().toISOString() });
  await seed('sync_status/heartbeat', { lastRun: new Date().toISOString() });
  await seed('site_config/maintenance', { enabled: false });
  await seed('allowed_users/' + key('friend.staff@gmail.com'), { email: 'friend.staff@gmail.com' });
  await seed('blocked_users/' + key('blocked.user@injourneyairports.id'), { email: 'blocked.user@injourneyairports.id' });
  // stored-XSS probe for admin.html (C-01): a user record whose fields carry markup
  await seed('user_logs/' + key('evil@gmail.com'), { uid: 'x', email: 'evil@gmail.com',
    name: '<img src=x onerror="window.__xss=1">', device: '<b id=inj>D</b>', browser: 'B', ip: '1', location: '<svg onload="window.__xss=2">' });

  await mkUser('staff.ops@injourneyairports.id', true, 'Staff Ops');
  await mkUser('someone@gmail.com', true, 'Stranger');
  await mkUser('friend.staff@gmail.com', true, 'Friend');
  await mkUser('blocked.user@injourneyairports.id', true, 'Blocked');
  await mkUser('new.staff@injourneyairports.id', false, 'Unverified');
  await mkUser('alimudinbasri@gmail.com', true, 'Admin');

  // ── scenarios ──
  console.log('domain user (@injourneyairports.id)');
  let b = await signedInBrowser('staff.ops@injourneyairports.id');
  await b.go('index.html', 9000);
  check('index.html stays open', (await b.evalv('location.pathname')).endsWith('/index.html'), await b.evalv('location.href'));
  check('page revealed', (await b.evalv('document.documentElement.style.visibility')) === 'visible');
  check('flights rendered from Firestore', (await b.evalv('document.body.innerText.includes("JT-100") || document.body.innerText.includes("JT 100")')) === true);
  check('online count hidden for non-admin', (await b.evalv('getComputedStyle(document.getElementById("onlineCount").parentElement).display')) === 'none');
  check('no uncaught exceptions', b.exceptions().length === 0, b.exceptions().join(' | '));
  const pres = await readDoc('presence/' + (await b.evalv('firebase.auth().currentUser.uid')));
  check('presence doc written (rules accept real client payload)', !!pres, 'missing');
  check('user_logs written', !!(await readDoc('user_logs/' + key('staff.ops@injourneyairports.id'))), 'missing');
  const url = await b.evalv('GasAuth.url("arrival","2026-09-24")');
  check('GAS URL carries idToken', /[?&]idToken=[^&]+/.test(url || ''), url);
  for (const p of ['otp.html', 'real_gate.html', 'real_belt.html', 'analytics.html', 'laporan.html']) {
    await b.go(p, 7000);
    check(p + ' opens without exceptions', (await b.evalv('location.pathname')).endsWith(p) && b.exceptions().length === 0, (await b.evalv('location.href')) + ' ' + b.exceptions().join(' | '));
  }
  await b.go('admin.html', 1000);
  check('admin.html refuses non-admin', await waitUrl(b, /login\.html|index\.html/, 15000), await b.evalv('location.href') + ' visible=' + await b.evalv('document.documentElement.style.visibility'));
  b.close();

  console.log('open redirect / javascript: in ?next= (C-02), signed in');
  b = await signedInBrowser('staff.ops@injourneyairports.id');
  await b.go('login.html?next=javascript:window.top.__pwn=1', 5000);
  check('javascript: next ignored -> index.html', (await b.evalv('location.pathname')).endsWith('/index.html') && (await b.evalv('window.__pwn')) === undefined, await b.evalv('location.href'));
  await b.go('login.html?next=https://example.com/', 5000);
  check('external next ignored -> index.html', (await b.evalv('location.href')).startsWith('http://localhost/fids/index.html'), await b.evalv('location.href'));
  await b.go('login.html?next=otp.html', 6000);
  check('same-app next honoured -> otp.html', (await b.evalv('location.pathname')).endsWith('/otp.html'), await b.evalv('location.href'));
  b.close();

  console.log('stranger (any other Google account)');
  b = await signedInBrowser('someone@gmail.com');
  check('sent to login.html?error=unauthorized', await waitUrl(b, /login\.html\?error=unauthorized/, 10000), await b.evalv('location.href'));
  check('error message visible', (await b.evalv('getComputedStyle(document.getElementById("error-msg")).display')) !== 'none');
  check('and signed out', (await b.evalv('firebase.auth().currentUser === null')) === true);
  check('no presence doc for stranger', !(await readDoc('user_logs/' + key('someone@gmail.com'))));
  b.close();

  console.log('allowlisted gmail account');
  b = await signedInBrowser('friend.staff@gmail.com');
  await b.go('index.html', 8000);
  check('index.html stays open', (await b.evalv('location.pathname')).endsWith('/index.html'), await b.evalv('location.href'));
  check('no uncaught exceptions', b.exceptions().length === 0, b.exceptions().join(' | '));
  b.close();

  console.log('blocked user');
  b = await signedInBrowser('blocked.user@injourneyairports.id');
  await b.go('index.html', 7000);
  check('sent to blocked.html', (await b.evalv('location.pathname')).endsWith('/blocked.html'), await b.evalv('location.href'));
  b.close();

  console.log('unverified email/password account on the allowed domain');
  b = await signedInBrowser('new.staff@injourneyairports.id');
  check('rejected', await waitUrl(b, /login\.html\?error=unauthorized/, 10000), await b.evalv('location.href'));
  check('and signed out', (await b.evalv('firebase.auth().currentUser === null')) === true);
  b.close();

  console.log('unverified account using a hardcoded admin address (H-03)');
  await mkUser('upg.pl@injourneyairports.id', false, 'Fake');
  b = await signedInBrowser('upg.pl@injourneyairports.id', 'admin.html');
  check('admin.html rejects it with the error message', await waitUrl(b, /login\.html\?error=unauthorized/, 10000), await b.evalv('location.href'));
  check('and signed out', (await b.evalv('firebase.auth().currentUser === null')) === true);
  b.close();

  console.log('primary admin');
  b = await signedInBrowser('alimudinbasri@gmail.com');
  await b.go('index.html', 8000);
  check('online count visible for admin', (await b.evalv('getComputedStyle(document.getElementById("onlineCount").parentElement).display')) !== 'none');
  check('online count is a number', /^\d+$/.test(await b.evalv('document.getElementById("onlineCount").textContent')), await b.evalv('document.getElementById("onlineCount").textContent'));
  await b.go('admin.html', 8000);
  check('admin.html opens', (await b.evalv('location.pathname')).endsWith('/admin.html'), await b.evalv('location.href'));
  check('activity table rendered', (await b.evalv('document.querySelectorAll("#activity-list tr").length')) > 1);
  check('XSS payload NOT executed', (await b.evalv('window.__xss === undefined && !document.getElementById("inj")')) === true, 'window.__xss=' + (await b.evalv('window.__xss')));
  check('XSS payload shown as text', (await b.evalv('document.getElementById("activity-list").innerText.includes("<img src=x")')) === true);
  await b.evalv('document.querySelector(\'[data-tab="allowed"]\').click()'); await sleep(2500);
  check('Allowed tab lists seeded entry', (await b.evalv('document.getElementById("allowed-list").innerText.includes("friend.staff@gmail.com")')) === true, await b.evalv('document.getElementById("allowed-list").innerText'));
  await b.evalv('document.getElementById("btn-import-allowed").click()'); await sleep(2500);
  check('import shows evil@gmail.com as an UNticked candidate', (await b.evalv('[...document.querySelectorAll(".allow-cand")].map(c=>c.value+":"+c.checked).join()')) === 'evil@gmail.com:false', await b.evalv('[...document.querySelectorAll(".allow-cand")].map(c=>c.value+":"+c.checked).join()'));
  await b.evalv('window.confirm = () => true; document.getElementById("allowed-email-input").value = "new.person@gmail.com"; document.getElementById("btn-add-allowed").click()'); await sleep(2500);
  check('admin can add an allowed email', !!(await readDoc('allowed_users/' + key('new.person@gmail.com'))));
  check('no uncaught exceptions on admin.html', b.exceptions().length === 0, b.exceptions().join(' | '));
  b.close();

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL E2E CHECKS PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
