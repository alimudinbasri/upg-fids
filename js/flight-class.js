// ============================================================
// FLIGHT CLASSIFICATION — domestic/international rules shared by
// analytics.html, real_gate.html and real_belt.html.
// Load AFTER js/app-config.js.
//
// gateMeta/beltMeta in app-config.js are the single source of truth
// for which gates and belts are INT and which are DOM; everything
// here derives from them.
//
// ── NOT shared: index.html ──────────────────────────────────
// index.html classifies with its own isIntlFlight(), which is a
// genuinely different rule, not a stale copy:
//   * it reads only flight_category and category, not all seven
//     AIS scope fields;
//   * it matches them exactly ('INT' / 'INTERNATIONAL') instead of
//     by substring regex.
// Probed across 340 category×gate combinations, the two rules
// disagree on 70 of them. Neither is strictly better:
//   - index MISSES real values the regex catches, e.g. "INTL" and
//     "International Flight" fall through to the gate instead;
//   - the regex has FALSE POSITIVES index does not, because /INT/
//     matches "PO(INT)" and /DOM/ matches "(DOM)INICA".
// Unifying them would silently change the domestic/international
// counts on the main FIDS board and in the WhatsApp report ops
// sends out, in a direction nobody has confirmed is correct. That
// is a product decision about what the AIS feed actually emits,
// not a refactoring one. See about.html §13.
// ============================================================
var FlightClass = (function () {

  // The seven fields the AIS feed has been seen to carry a scope in,
  // in priority order — the first non-empty one wins.
  var SCOPE_FIELDS = ['flight_category', 'flight_type', 'category', 'dom_int',
                      'service_type', 'scope', 'domestic_international'];

  function cleanText(value) { return String(value || '').trim(); }

  // Coerce any scope-ish string to INT/DOM, defaulting to DOM.
  function normalizeScope(value) {
    var text = String(value || '').toUpperCase();
    if (text.indexOf('INT') >= 0) return 'INT';
    if (text.indexOf('DOM') >= 0) return 'DOM';
    return 'DOM';
  }

  // A gate/belt's own fixed scope: 'INT', 'DOM', or 'ANY' when it has
  // none (unknown id, or the NO GATE / NO BELT placeholder).
  function gateScope(gate) {
    var status = String((APP_CONFIG.gateMeta[gate] || {}).status || '').toUpperCase();
    if (gate === 'NO GATE') return 'ANY';
    if (status.indexOf('INT') >= 0) return 'INT';
    if (status.indexOf('DOM') >= 0) return 'DOM';
    return 'ANY';
  }

  function beltScope(belt) {
    var status = String((APP_CONFIG.beltMeta[belt] || {}).status || '').toUpperCase();
    if (belt === 'NO BELT') return 'ANY';
    if (status.indexOf('INT') >= 0) return 'INT';
    if (status.indexOf('DOM') >= 0) return 'DOM';
    return 'ANY';
  }

  // Classify a RAW AIS row at load time: trust the feed's own scope
  // field if it has one, otherwise infer from the assigned gate/belt.
  function detectCategory(row, gateOrBelt, scopeFn) {
    var source = SCOPE_FIELDS.map(function (f) { return cleanText(row[f]); }).filter(Boolean)[0] || '';
    if (/INT|INTERNATIONAL/i.test(source)) return 'INT';
    if (/DOM|DOMESTIC/i.test(source)) return 'DOM';
    return scopeFn(gateOrBelt) === 'INT' ? 'INT' : 'DOM';
  }

  // Classify an ALREADY-BUILT flight for report totals, using its
  // *current* gate/belt first — the same source of truth the per-gate
  // and per-belt breakdowns use. The stored flight_category is only a
  // fallback for placements that carry no fixed scope (NO GATE/NO BELT),
  // because it was set once at load time and can since have drifted:
  // drag-and-drop, or a raw AIS gate value that changed on refresh.
  // Without this the aggregate disagreed with the breakdown — the bug
  // fixed in 05541e1.
  function classifyForReport(flight, gateOrBelt, scopeFn) {
    var scope = scopeFn(gateOrBelt);
    if (scope === 'INT' || scope === 'DOM') return scope;
    return normalizeScope(flight.flight_category);
  }

  return {
    SCOPE_FIELDS: SCOPE_FIELDS,
    cleanText: cleanText,
    normalizeScope: normalizeScope,
    gateScope: gateScope,
    beltScope: beltScope,
    detectCategory: detectCategory,
    classifyForReport: classifyForReport
  };
})();
