// Firestore security rules tests — run with `npm test` in this folder.
// Uses the local emulator and a demo project id, so nothing here can reach
// the real upg-fids database.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  serverTimestamp, Timestamp
} = require('firebase/firestore');

let env;

// Same transformation as emailToKey() in js/auth-guard.js / admin.html / the rules
const key = (email) => email.trim().toLowerCase().replace(/\./g, '_').replace(/@/g, '__');

const USERS = {
  domain:      { uid: 'u-domain',  email: 'staff.ops@injourneyairports.id' },
  unverified:  { uid: 'u-unver',   email: 'new.staff@injourneyairports.id', verified: false },
  stranger:    { uid: 'u-strange', email: 'someone@yahoo.com' },
  allowlisted: { uid: 'u-allow',   email: 'friend.staff@yahoo.com' },
  gmail:       { uid: 'u-gmail',   email: 'any.person@gmail.com' },
  gmailUnver:  { uid: 'u-gunver',  email: 'fake.person@gmail.com', verified: false },
  blocked:     { uid: 'u-blocked', email: 'blocked.user@injourneyairports.id' },
  hardAdmin:   { uid: 'u-hadmin',  email: 'alimudinbasri@gmail.com' },
  fakeAdmin:   { uid: 'u-fake',    email: 'upg.pl@injourneyairports.id', verified: false },
  dynAdmin:    { uid: 'u-dadmin',  email: 'dyn.admin@outlook.com' },
  sync:        { uid: 'u-sync',    email: 'gas-sync@upg-fids.internal', verified: false }
};

function as(name) {
  const u = USERS[name];
  return env.authenticatedContext(u.uid, {
    email: u.email,
    email_verified: u.verified !== false
  }).firestore();
}
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-upg-fids',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8089
    }
  });
});

after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'flights_cache/2026-09-24'), { arrivals: '[]', departures: '[]', updatedAt: 'x' });
    await setDoc(doc(db, 'sync_status/heartbeat'), { lastRun: '2026-09-24T00:00:00Z' });
    await setDoc(doc(db, 'site_config/maintenance'), { enabled: false });
    await setDoc(doc(db, 'wa_settings/otp'), { template: 't' });
    await setDoc(doc(db, 'blocked_users/' + key(USERS.blocked.email)), { email: USERS.blocked.email });
    await setDoc(doc(db, 'allowed_users/' + key(USERS.allowlisted.email)), { email: USERS.allowlisted.email });
    await setDoc(doc(db, 'admins/' + key(USERS.dynAdmin.email)), { email: USERS.dynAdmin.email });
    await setDoc(doc(db, 'user_logs/' + key(USERS.domain.email)), { uid: USERS.domain.uid, email: USERS.domain.email });
    await setDoc(doc(db, 'presence/' + USERS.domain.uid), { uid: USERS.domain.uid, email: USERS.domain.email, lastSeenMs: Date.now() });
  });
});

const validPresence = (u) => ({
  uid: u.uid, email: u.email, name: 'Name', page: 'index.html',
  lastSeen: serverTimestamp(), lastSeenMs: Date.now(), userAgent: 'UA', browser: 'Chrome',
  device: 'Desktop', ip: '1.2.3.4', location: 'Makassar', loginAt: new Date(), isAdmin: false
});
const validUserLog = (u) => ({
  uid: u.uid, email: u.email, name: 'Name', device: 'Desktop', browser: 'Chrome',
  ip: '1.2.3.4', location: 'Makassar', loginAt: new Date()
});
const validActivity = (u) => ({
  uid: u.uid, email: u.email, name: 'Name', page: 'index.html', timestamp: serverTimestamp(),
  expireAt: new Date(), userAgent: 'UA', timezone: 'Asia/Makassar', referrer: 'direct', platform: 'Win32'
});

// ── Who may read flight data (C-03, H-01, H-03) ─────────────────────────────
test('flights_cache: only allowed, verified, unblocked accounts can read', async () => {
  const path_ = 'flights_cache/2026-09-24';
  await assertFails(getDoc(doc(anon(), path_)));
  await assertSucceeds(getDoc(doc(as('domain'), path_)));
  await assertFails(getDoc(doc(as('unverified'), path_)));   // self-registered, unverified
  await assertFails(getDoc(doc(as('stranger'), path_)));     // other domains need the allowlist
  await assertSucceeds(getDoc(doc(as('gmail'), path_)));     // any verified Gmail account (owner's decision)
  await assertFails(getDoc(doc(as('gmailUnver'), path_)));   // but not a self-registered, unverified one
  await assertSucceeds(getDoc(doc(as('allowlisted'), path_)));
  await assertFails(getDoc(doc(as('blocked'), path_)));      // block enforced server-side
  await assertSucceeds(getDoc(doc(as('hardAdmin'), path_)));
  await assertSucceeds(getDoc(doc(as('dynAdmin'), path_)));
  await assertFails(getDoc(doc(env.authenticatedContext('u-noemail', {}).firestore(), path_)));
});

test('flights_cache / sync_status: only the sync account writes', async () => {
  await assertFails(setDoc(doc(as('domain'), 'flights_cache/2026-09-25'), { arrivals: '[]' }));
  await assertFails(setDoc(doc(as('hardAdmin'), 'flights_cache/2026-09-25'), { arrivals: '[]' }));
  await assertSucceeds(setDoc(doc(as('sync'), 'flights_cache/2026-09-25'), { arrivals: '[]' }));
  await assertSucceeds(setDoc(doc(as('sync'), 'sync_status/heartbeat'), { lastRun: 'now' }));
  await assertFails(setDoc(doc(as('domain'), 'sync_status/heartbeat'), { lastRun: 'now' }));
});

test('sync_status/heartbeat is readable exactly when flights are (doGet access check)', async () => {
  for (const [name, ok] of [['domain', true], ['allowlisted', true], ['stranger', false], ['blocked', false], ['unverified', false]]) {
    const p = getDoc(doc(as(name), 'sync_status/heartbeat'));
    await (ok ? assertSucceeds(p) : assertFails(p));
  }
  await assertFails(getDoc(doc(anon(), 'sync_status/heartbeat')));
});

// ── Personal data (C-03) and stored-XSS vectors (C-01) ─────────────────────
test('user_logs: owner writes a well-formed record; only admins read', async () => {
  const u = USERS.domain;
  await assertSucceeds(setDoc(doc(as('domain'), 'user_logs/' + key(u.email)), validUserLog(u)));
  await assertFails(setDoc(doc(as('domain'), 'user_logs/' + key(u.email)), { ...validUserLog(u), extra: 'x' }));
  await assertFails(setDoc(doc(as('domain'), 'user_logs/' + key(u.email)), { ...validUserLog(u), name: 'x'.repeat(201) }));
  await assertFails(setDoc(doc(as('domain'), 'user_logs/' + key(u.email)), { ...validUserLog(u), name: 42 }));
  await assertFails(setDoc(doc(as('domain'), 'user_logs/' + key(USERS.allowlisted.email)), validUserLog(u)));
  await assertFails(setDoc(doc(as('stranger'), 'user_logs/' + key(USERS.stranger.email)), validUserLog(USERS.stranger)));
  await assertFails(getDocs(collection(as('domain'), 'user_logs')));
  await assertFails(getDoc(doc(as('domain'), 'user_logs/' + key(u.email))));
  await assertSucceeds(getDocs(collection(as('hardAdmin'), 'user_logs')));
  await assertSucceeds(getDocs(collection(as('dynAdmin'), 'user_logs')));
});

test('presence: own doc only, validated, admin-read; heartbeat merge works', async () => {
  const u = USERS.allowlisted;
  const db = as('allowlisted');
  await assertSucceeds(setDoc(doc(db, 'presence/' + u.uid), validPresence(u)));
  await assertSucceeds(setDoc(doc(db, 'presence/' + u.uid), { lastSeen: serverTimestamp(), lastSeenMs: Date.now() }, { merge: true }));
  await assertFails(setDoc(doc(db, 'presence/' + u.uid), { ...validPresence(u), evil: '<img>' }));
  await assertFails(setDoc(doc(db, 'presence/' + u.uid), { ...validPresence(u), location: 'x'.repeat(201) }));
  await assertFails(setDoc(doc(db, 'presence/' + u.uid), { ...validPresence(u), email: 'other@x.com' }));
  await assertFails(setDoc(doc(db, 'presence/' + USERS.domain.uid), validPresence(u)));
  await assertFails(setDoc(doc(as('blocked'), 'presence/' + USERS.blocked.uid), validPresence(USERS.blocked)));
  await assertFails(getDocs(collection(db, 'presence')));
  await assertSucceeds(getDocs(query(collection(as('hardAdmin'), 'presence'), where('lastSeenMs', '>=', 0))));
});

test('activity_logs: self-attributed, server-timestamped, admin-read', async () => {
  const u = USERS.domain;
  await assertSucceeds(addDoc(collection(as('domain'), 'activity_logs'), validActivity(u)));
  await assertFails(addDoc(collection(as('domain'), 'activity_logs'), { ...validActivity(u), timestamp: Timestamp.fromDate(new Date(2020, 0, 1)) }));
  await assertFails(addDoc(collection(as('domain'), 'activity_logs'), { ...validActivity(u), email: 'someone.else@injourneyairports.id' }));
  await assertFails(addDoc(collection(as('domain'), 'activity_logs'), { ...validActivity(u), extra: 1 }));
  await assertFails(addDoc(collection(as('stranger'), 'activity_logs'), validActivity(USERS.stranger)));
  await assertFails(getDocs(collection(as('domain'), 'activity_logs')));
  await assertSucceeds(getDocs(collection(as('hardAdmin'), 'activity_logs')));
});

// ── Privilege escalation ────────────────────────────────────────────────────
test('admins: unverified look-alike of a hardcoded admin gets nothing (H-03)', async () => {
  await assertFails(setDoc(doc(as('fakeAdmin'), 'admins/' + key('evil@gmail.com')), { email: 'evil@gmail.com' }));
  await assertFails(setDoc(doc(as('fakeAdmin'), 'site_config/maintenance'), { enabled: true }));
  await assertFails(getDocs(collection(as('fakeAdmin'), 'user_logs')));
});

test('admins: own doc readable, list and write restricted', async () => {
  await assertSucceeds(getDoc(doc(as('domain'), 'admins/' + key(USERS.domain.email))));
  await assertFails(getDoc(doc(as('domain'), 'admins/' + key(USERS.dynAdmin.email))));
  await assertFails(getDocs(collection(as('domain'), 'admins')));
  await assertSucceeds(getDocs(collection(as('dynAdmin'), 'admins')));
  await assertFails(setDoc(doc(as('domain'), 'admins/' + key(USERS.domain.email)), { email: USERS.domain.email }));
  await assertFails(setDoc(doc(as('dynAdmin'), 'admins/' + key('x@gmail.com')), { email: 'x@gmail.com' }));
  await assertSucceeds(setDoc(doc(as('hardAdmin'), 'admins/' + key('x@gmail.com')), { email: 'x@gmail.com' }));
});

test('admin_uids: cannot be used to self-escalate', async () => {
  await assertFails(setDoc(doc(as('domain'), 'admin_uids/' + USERS.domain.uid), { email: USERS.domain.email }));
  await assertSucceeds(setDoc(doc(as('dynAdmin'), 'admin_uids/' + USERS.dynAdmin.uid), { email: USERS.dynAdmin.email }));
  await assertFails(getDocs(collection(as('domain'), 'admin_uids')));
});

test('allowed_users: users cannot allowlist themselves; admins manage it', async () => {
  const s = USERS.stranger;
  const entry = (email, by) => ({ email, addedAt: serverTimestamp(), addedBy: by });
  await assertFails(setDoc(doc(as('stranger'), 'allowed_users/' + key(s.email)), entry(s.email, s.email)));
  await assertFails(setDoc(doc(as('domain'), 'allowed_users/' + key(s.email)), entry(s.email, USERS.domain.email)));
  await assertSucceeds(setDoc(doc(as('dynAdmin'), 'allowed_users/' + key(s.email)), entry(s.email, USERS.dynAdmin.email)));
  await assertFails(setDoc(doc(as('hardAdmin'), 'allowed_users/' + key('a@gmail.com')), entry('b@gmail.com', USERS.hardAdmin.email)));
  await assertFails(setDoc(doc(as('hardAdmin'), 'allowed_users/' + key('a@gmail.com')), entry('a@gmail.com', 'someone@else.com')));
  await assertSucceeds(getDoc(doc(as('allowlisted'), 'allowed_users/' + key(USERS.allowlisted.email))));
  await assertFails(getDocs(collection(as('allowlisted'), 'allowed_users')));
  await assertSucceeds(getDocs(collection(as('hardAdmin'), 'allowed_users')));
  await assertSucceeds(deleteDoc(doc(as('hardAdmin'), 'allowed_users/' + key(USERS.allowlisted.email))));
  // takes effect immediately
  await assertFails(getDoc(doc(as('allowlisted'), 'flights_cache/2026-09-24')));
});

test('blocked_users: own status readable, list/write admin-only, key must match email', async () => {
  await assertSucceeds(getDoc(doc(as('blocked'), 'blocked_users/' + key(USERS.blocked.email))));
  await assertSucceeds(getDoc(doc(as('domain'), 'blocked_users/' + key(USERS.domain.email))));
  await assertFails(getDoc(doc(as('domain'), 'blocked_users/' + key(USERS.blocked.email))));
  await assertFails(getDocs(collection(as('domain'), 'blocked_users')));
  await assertFails(deleteDoc(doc(as('blocked'), 'blocked_users/' + key(USERS.blocked.email))));
  const b = { email: 'x@gmail.com', blockedAt: serverTimestamp(), blockedBy: USERS.hardAdmin.email };
  await assertSucceeds(setDoc(doc(as('hardAdmin'), 'blocked_users/' + key('x@gmail.com')), b));
  await assertFails(setDoc(doc(as('hardAdmin'), 'blocked_users/' + key('y@gmail.com')), b));
  await assertFails(setDoc(doc(as('domain'), 'blocked_users/' + key('x@gmail.com')), b));
});

test('blocking an admin-allowed user takes effect at once', async () => {
  await assertSucceeds(getDoc(doc(as('allowlisted'), 'wa_settings/otp')));
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'blocked_users/' + key(USERS.allowlisted.email)), { email: USERS.allowlisted.email }));
  await assertFails(getDoc(doc(as('allowlisted'), 'wa_settings/otp')));
});

// ── Shared config ───────────────────────────────────────────────────────────
test('site_config: public read, admin write', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'site_config/maintenance')));
  await assertFails(setDoc(doc(as('domain'), 'site_config/maintenance'), { enabled: true }));
  await assertSucceeds(setDoc(doc(as('dynAdmin'), 'site_config/maintenance'), { enabled: true }));
});

test('wa_settings: allowed users read, admins write', async () => {
  await assertSucceeds(getDoc(doc(as('domain'), 'wa_settings/otp')));
  await assertFails(getDoc(doc(as('stranger'), 'wa_settings/otp')));
  await assertFails(setDoc(doc(as('domain'), 'wa_settings/otp'), { template: 'x' }));
  await assertSucceeds(setDoc(doc(as('hardAdmin'), 'wa_settings/otp'), { template: 'x' }));
});

test('unknown collections are denied by default', async () => {
  await assertFails(getDoc(doc(as('hardAdmin'), 'secrets/x')));
  await assertFails(setDoc(doc(as('hardAdmin'), 'secrets/x'), { a: 1 }));
});
