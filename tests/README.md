# Tests

Both suites run against **local emulators only**. They never touch the
`upg-fids` project. Nothing in `tests/` is deployed (`firebase.json` ignores it).

Requirements: Node 18+, Java 11+ (a portable JRE works; put its `bin` on `PATH`).

## Firestore rules — `tests/rules`

```
cd tests/rules
npm install
npm test
```

15 tests, covering who may read flight data (allowed domain / allowlist /
admin, verified email, not blocked), field validation on user-written
documents, privilege escalation, and the allowlist/blocklist editors.
Run this before every `firebase deploy --only firestore:rules`.

## Signed-in pages — `tests/e2e`

Drives the real pages in headless Chrome as different users, with Firebase
Auth and Firestore redirected to the emulators by an injected script.

1. Serve the app at `http://localhost/fids/` (XAMPP).
2. From `tests/rules`:
   `npx firebase emulators:start --only auth,firestore --project upg-fids --config firebase.test.json`
3. In another shell: `node tests/e2e/signed-in.e2e.js`
