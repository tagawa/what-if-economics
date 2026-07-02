/**
 * Inline-script ES5 gate (zero-install).
 *
 * The boot-failure fallback in index.html must stay ES5: it runs in browsers
 * too old to parse the app's ES2017 syntax, so it is held to a STRICTER floor
 * than js/. The es2017-floor test scans js/ only and would NOT catch an arrow
 * function or `const` creeping into the inline script, which is exactly the
 * lifeline that must not break. This closes that gap.
 *
 * Scans every inline <script> (no src=) in index.html for non-ES5 syntax.
 *
 * LIMITATION: text scan, not a parser. Skips comment-only lines; a banned token
 * inside a string or a trailing comment could false-positive. Keep inline
 * scripts tiny and plain and it stays reliable.
 *
 * Place at: test/es5-inline.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ES5 ceiling for inline scripts: the ES2018+ bans plus the common ES2015
// syntax a developer might reach for by habit (arrow, const/let, template
// literals). `class` is intentionally omitted: telling the keyword apart from
// className / classList / the string "class" by regex is error-prone, and a
// class declaration in a tiny inline fallback is implausible.
const BANNED = [
  { name: 'arrow function ( => )           [ES2015]', re: /=>/ },
  { name: 'const / let declaration         [ES2015]', re: /\b(?:const|let)\s+[\w$]/ },
  { name: 'template literal ( ` )          [ES2015]', re: /`/ },
  { name: 'optional chaining ( ?. )        [ES2020]', re: /\?\.(?!\d)/ },
  { name: 'nullish coalescing ( ?? )       [ES2020]', re: /\?\?/ },
  { name: 'object spread/rest ( { ... } )  [ES2018]', re: /\{\s*\.\.\./ },
  { name: 'optional catch binding (catch{) [ES2019]', re: /catch\s*\{/ },
];

// Body of every inline <script> (one with no src attribute).
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // external script, not inline
    out.push(m[2]);
  }
  return out;
}

test('inline <script> blocks in index.html are ES5', () => {
  const htmlPath = firstExisting([path.join(__dirname, '..', 'index.html')]);
  assert.ok(htmlPath, 'index.html not found at repo root.');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = inlineScripts(html);

  // Anti-vacuum: index.html ships at least one inline script (the boot fallback).
  // Finding none means the extractor is broken and this gate is a silent no-op.
  assert.ok(
    scripts.length > 0,
    'No inline <script> blocks found in index.html. The boot fallback should be ' +
    'one; if extraction returns nothing, this gate is doing nothing. Check the regex.'
  );

  const violations = [];
  scripts.forEach(function (code, idx) {
    code.split('\n').forEach(function (line, i) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // comment-only line
      BANNED.forEach(function (rule) {
        if (rule.re.test(line)) {
          violations.push(
            'inline script #' + (idx + 1) + ', line ' + (i + 1) + '  ' + rule.name +
            '\n      ' + trimmed
          );
        }
      });
    });
  });

  assert.strictEqual(
    violations.length,
    0,
    '\nNon-ES5 syntax in an inline index.html <script> ' +
    '(must stay ES5 to run in legacy browsers):\n\n' + violations.join('\n\n') + '\n'
  );
});
