// Validates translation completeness across locale files and data files.
// Reference locale: 'en'. Every other supported locale is checked against it.
// No deps; uses Node's built-in node:test runner.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SUPPORTED } = require('../js/i18n.js');
const ROOT = path.join(__dirname, '..');
const REF = 'en';

// --- helpers ---------------------------------------------------------------

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

// Flatten nested object to dot-keyed leaf paths: {a:{b:1}} -> ['a.b']
function leafKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...leafKeys(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

function getLeaf(obj, dotKey) {
  return dotKey.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Extract {placeholder} tokens, sorted and deduped.
function placeholders(str) {
  if (typeof str !== 'string') return [];
  const m = str.match(/\{[^}]+\}/g) || [];
  return [...new Set(m)].sort();
}

// Walk data JSON collecting every {en, ja}-shaped object with its path.
// A node is a "field" if it has the REF key and all values are strings.
function collectFields(obj, prefix = '') {
  const out = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const looksLikeField =
      keys.includes(REF) &&
      keys.every((k) => SUPPORTED.includes(k)) &&
      keys.every((k) => typeof obj[k] === 'string');
    if (looksLikeField) {
      out.push({ path: prefix, value: obj });
    } else {
      for (const [k, v] of Object.entries(obj)) {
        out.push(...collectFields(v, prefix ? `${prefix}.${k}` : k));
      }
    }
  }
  return out;
}

// --- 1. UI locale files exist and parse ------------------------------------

test('every supported locale has a parseable ui file', () => {
  for (const lang of SUPPORTED) {
    const rel = `i18n/ui.${lang}.json`;
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    assert.doesNotThrow(() => readJSON(rel), `unparseable ${rel}`);
  }
});

// --- 2. UI key parity vs reference -----------------------------------------

test('ui key sets match reference locale', () => {
  const refKeys = new Set(leafKeys(readJSON(`i18n/ui.${REF}.json`)));
  for (const lang of SUPPORTED.filter((l) => l !== REF)) {
    const keys = new Set(leafKeys(readJSON(`i18n/ui.${lang}.json`)));
    const missing = [...refKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !refKeys.has(k));
    assert.deepStrictEqual(
      { missing, extra },
      { missing: [], extra: [] },
      `ui.${lang}.json key mismatch vs ${REF}`
    );
  }
});

// --- 3. UI placeholder parity ----------------------------------------------

test('ui placeholders match reference per key', () => {
  const ref = readJSON(`i18n/ui.${REF}.json`);
  const refKeys = leafKeys(ref);
  for (const lang of SUPPORTED.filter((l) => l !== REF)) {
    const loc = readJSON(`i18n/ui.${lang}.json`);
    const mismatches = [];
    for (const key of refKeys) {
      const a = placeholders(getLeaf(ref, key));
      const b = placeholders(getLeaf(loc, key));
      if (a.join() !== b.join()) {
        mismatches.push({ key, [REF]: a, [lang]: b });
      }
    }
    assert.deepStrictEqual(mismatches, [], `placeholder mismatch in ui.${lang}.json`);
  }
});

// --- 4. UI strings non-empty -----------------------------------------------

test('no empty ui strings', () => {
  for (const lang of SUPPORTED) {
    const loc = readJSON(`i18n/ui.${lang}.json`);
    const empties = leafKeys(loc).filter((k) => {
      const v = getLeaf(loc, k);
      return typeof v === 'string' && v.trim() === '';
    });
    assert.deepStrictEqual(empties, [], `empty strings in ui.${lang}.json`);
  }
});

// --- 5. Data field locale parity -------------------------------------------
// Every {en, ja} field in data files must have all supported locales,
// all non-empty, with matching placeholders.

const DATA_FILES = ['data/factors.json', 'data/relationships.json', 'data/scenarios.json'];

test('data fields have all locales, non-empty, matching placeholders', () => {
  const problems = [];
  for (const file of DATA_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    const fields = collectFields(readJSON(file));
    for (const { path: p, value } of fields) {
      const where = `${file}:${p}`;
      for (const lang of SUPPORTED) {
        if (!(lang in value)) {
          problems.push(`${where} missing '${lang}'`);
        } else if (value[lang].trim() === '') {
          problems.push(`${where} '${lang}' is empty`);
        }
      }
      if (REF in value) {
        const refPh = placeholders(value[REF]);
        for (const lang of SUPPORTED.filter((l) => l !== REF && l in value)) {
          if (placeholders(value[lang]).join() !== refPh.join()) {
            problems.push(`${where} placeholder mismatch ${REF} vs ${lang}`);
          }
        }
      }
    }
  }
  assert.deepStrictEqual(problems, [], 'data field completeness problems');
});

// --- 6. All i18n.t() call sites use literal keys present in every locale ---
// Scans js/app.js for i18n.t('...') calls. Assumes: (a) keys are always
// string literals — dynamic calls (i18n.t(variable) or i18n.t(`...`)) are
// flagged as an error so they can't silently escape coverage; (b) i18n is
// never aliased (e.g. destructured as const { t } = i18n).

test('all i18n.t() call sites use literal keys present in every locale', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

  // Capture the argument span of every i18n.t(...) call (no nested parens
  // in any current call site; assumption documented here).
  const calls = [...src.matchAll(/i18n\.t\(([^)]+)\)/g)];
  assert.ok(calls.length > 0, 'no i18n.t() calls found in app.js — check the regex');

  // For each call, extract all quoted string literals from the argument span.
  // A call with no quoted strings at all is genuinely dynamic — fail loud so
  // it can't silently escape coverage. Ternaries with two literal branches
  // (e.g. condition ? 'key.a' : 'key.b') are handled: both keys are extracted.
  const allKeys = [];
  const dynamicCalls = [];
  for (const match of calls) {
    const literals = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    if (literals.length === 0) {
      dynamicCalls.push(match[0]);
    } else {
      allKeys.push(...literals);
    }
  }
  assert.deepStrictEqual(
    dynamicCalls,
    [],
    'dynamic i18n.t() call with no literal keys detected — add literal key or update this test'
  );

  // Assert every extracted key resolves in every locale.
  const problems = [];
  for (const lang of SUPPORTED) {
    const loc = readJSON(`i18n/ui.${lang}.json`);
    for (const key of allKeys) {
      if (getLeaf(loc, key) == null) {
        problems.push(`ui.${lang}.json missing key '${key}' (called in app.js)`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], 'i18n.t() call-site key completeness problems');
});
