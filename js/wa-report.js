// ============================================================
// WA REPORT — the WhatsApp-report subsystem shared by index.html,
// otp.html, real_gate.html and real_belt.html. Load AFTER
// js/app-config.js and BEFORE the page's own inline <script>.
//
// Each page keeps two things of its own, because they ARE the page:
//   getDefaultTemplate()  the report layout for that page
//   buildTagData()        -> { data, blocks } for that report
// Everything else — the toast, the template engine, the Firestore
// load/save/legacy-migration dance, the modal, the clipboard copy —
// lives here.
//
// Template syntax handled by renderTemplate():
//   {tag}                      substituted from data
//   [[BLOCK]] … [[/BLOCK]]     repeated once per row in blocks.BLOCK,
//                              {tag} inside resolving against the row
//                              first, then falling back to data
//
// IMPORTANT for callers: expose the API through *function declarations*,
// never `var x = api.close`. Pages wire listeners with bare references
// (addEventListener('click', closeWaReportModal)) from an init function
// that runs before this module's config object is built, so only a
// hoisted function declaration is a valid reference at wiring time.
// ============================================================
var WaReport = (function () {

  // ── Toast ───────────────────────────────────────────────────
  function showToast(msg) {
    var t = document.getElementById('waSaveToast');
    if (!t) return;
    t.textContent = msg || '✓ Saved to database';
    var isError = msg && (msg.startsWith('✗') || msg.startsWith('⚠'));
    t.style.background = isError ? '#d32f2f' : '#00c853';
    t.style.color = '#fff';
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () { t.classList.remove('show'); }, isError ? 4000 : 2500);
  }

  // ── Template engine ─────────────────────────────────────────
  function renderTemplate(tmpl, data, blocks) {
    var withBlocks = String(tmpl || '').replace(/\[\[(\w+)\]\]\n?([\s\S]*?)\n?\[\[\/\1\]\]/g, function (_, name, inner) {
      var rows = (blocks && blocks[name]) || [];
      return rows.map(function (row) {
        return inner.replace(/\{([a-zA-Z0-9_%]+)\}/g, function (m, key) {
          if (Object.prototype.hasOwnProperty.call(row, key)) return String(row[key]);
          if (Object.prototype.hasOwnProperty.call(data, key)) return String(data[key]);
          return m;
        });
      }).join('\n');
    });
    return withBlocks.replace(/\{([a-zA-Z0-9_%]+)\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]) : m;
    });
  }

  // ── Per-page instance ───────────────────────────────────────
  // cfg:
  //   pageId              wa_settings document id ('index' | 'otp' | …)
  //   getDefaultTemplate  () -> string
  //   buildTagData        () -> { data, blocks }
  //   hasData             () -> boolean   guard before opening the modal
  //   onNoData            () -> void      what to say when hasData() is false
  //   legacy              { startMarker, endMarker, endSuffix }
  //                       markers used to slice the body out of the default
  //                       template when migrating old {opening, closing} docs
  //   onStatus            (msg, isError) -> void | null
  //                       page-level status line; index.html/otp.html have
  //                       none and pass null
  //   copiedLabel         button text after a successful copy
  //   copyBlockedLabel    button text when the clipboard API refused | null
  //   copyFallbackLabel   text to restore if the button had none
  function create(cfg) {
    var saveTimer = null;

    function docRef() {
      return window._db ? window._db.collection('wa_settings').doc(cfg.pageId) : null;
    }
    function status(msg, isError) {
      if (cfg.onStatus) cfg.onStatus(msg, isError);
    }

    function saveNow() {
      if (!window._db) { showToast('⚠ Not connected to database'); return; }
      clearTimeout(saveTimer);
      docRef().set({
        template: (document.getElementById('waTemplateText') || {}).value || ''
      }, { merge: true }).then(function () {
        showToast('✓ Saved to database');
      }).catch(function (err) {
        showToast('✗ Save failed: ' + (err.message || err.code || err));
        console.error('[waSave] Firestore error:', err);
      });
    }

    function save() {
      if (!window._db) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 800);
    }

    // Migrate a legacy { opening, closing } doc into the single-template
    // format by splicing the page's own default body between them.
    function migrateLegacy(opening, closing) {
      var def = cfg.getDefaultTemplate();
      var start = def.indexOf(cfg.legacy.startMarker);
      var end = def.lastIndexOf(cfg.legacy.endMarker) + cfg.legacy.endSuffix.length;
      var body = def.slice(start, end);
      return [(opening || '').trim(), '', body, '', (closing || '').trim()].join('\n');
    }

    function generate() {
      var output = document.getElementById('waReportText');
      var template = document.getElementById('waTemplateText');
      if (!output) return;
      var tmpl = template ? template.value : cfg.getDefaultTemplate();
      var built = cfg.buildTagData();
      output.value = renderTemplate(tmpl, built.data, built.blocks);
    }

    function open() {
      if (!cfg.hasData()) { cfg.onNoData(); return; }
      var template = document.getElementById('waTemplateText');
      var modal = document.getElementById('waReportModal');

      function applyAndShow(tmpl) {
        if (template) template.value = tmpl;
        generate();
        if (modal) modal.classList.add('show');
      }

      var ref = docRef();
      if (!ref) { applyAndShow(cfg.getDefaultTemplate()); return; }

      ref.get().then(function (doc) {
        var d = doc.exists ? doc.data() : {};
        if (d.template) { applyAndShow(d.template); return; }
        if (d.opening || d.closing) {
          var migrated = migrateLegacy(d.opening, d.closing);
          applyAndShow(migrated);
          ref.set({ template: migrated }, { merge: true }).catch(function () {});
          return;
        }
        applyAndShow(cfg.getDefaultTemplate());
      }).catch(function () { applyAndShow(cfg.getDefaultTemplate()); });
    }

    function close() {
      var modal = document.getElementById('waReportModal');
      if (modal) modal.classList.remove('show');
    }

    function copy() {
      var output = document.getElementById('waReportText');
      var btn = document.getElementById('btnCopyWaReport');
      if (!output) return Promise.resolve();
      generate();
      var text = output.value || '';
      if (!text.trim()) { status('WA Report masih kosong.', true); return Promise.resolve(); }
      var oldText = btn ? btn.textContent : '';

      function selectFallback() { output.focus(); output.select(); }
      function restore(label, delay) {
        if (!btn) return;
        btn.textContent = label;
        setTimeout(function () {
          btn.textContent = oldText || cfg.copyFallbackLabel;
          btn.disabled = false;
        }, delay);
      }

      var writing = (navigator.clipboard && navigator.clipboard.writeText)
        ? navigator.clipboard.writeText(text)
        : new Promise(function (resolve, reject) {
            try { selectFallback(); document.execCommand('copy'); resolve(); }
            catch (e) { reject(e); }
          });

      return writing.then(function () {
        if (btn) { btn.disabled = true; restore(cfg.copiedLabel, 1400); }
        status('WA Report copied. Paste it in WhatsApp.');
      }).catch(function () {
        selectFallback();
        if (btn && cfg.copyBlockedLabel) restore(cfg.copyBlockedLabel, 1400);
        status('Text selected. Press Copy from phone menu, then paste in WhatsApp.', true);
      });
    }

    return {
      open: open, close: close, generate: generate, copy: copy,
      save: save, saveNow: saveNow, migrateLegacy: migrateLegacy
    };
  }

  return { create: create, showToast: showToast, renderTemplate: renderTemplate };
})();
