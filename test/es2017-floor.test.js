/**
 * ES2017 syntax-floor guard (zero-install).
 *
 * Scans js/ for ES2018+ syntax that the no-build-step app must not use.
 * Runs under the existing `node --test`; no dependency, no new script.
 *
 * LIMITATION: this is a text scan, not a parser. It can be fooled if a
 * banned pattern appears inside a string literal or an inline trailing
 * comment. Comment-only lines are skipped. Keep app code clean and it is
 * reliable for catching accidental re-introduction.
 *
 * Place at: test/es2017-floor.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '..', 'js');

const BANNED = [
  { name: 'optional chaining ( ?. )        [ES2020]', re: /\?\.(?!\d)/ },
  { name: 'nullish coalescing ( ?? )       [ES2020]', re: /\?\?/ },
  { name: 'object spread/rest ( { ... } )  [ES2018]', re: /\{\s*\.\.\./ },
  { name: 'optional catch binding (catch{) [ES2019]', re: /catch\s*\{/ },
  { name: 'regex lookbehind / named group ( (?< ) [ES2018]', re: /\(\?</ },
];

// Non-recursive by design: js/ is flat today. Revisit (readdirSync recursive) if js/ gains subdirs.
function jsFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f));
}

test('js/ uses no syntax newer than ES2017', () => {
  const violations = [];

  for (const file of jsFiles(JS_DIR)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*')) return; // skip comment-only lines
      for (const rule of BANNED) {
        if (rule.re.test(line)) {
          violations.push(
            path.basename(file) + ':' + (i + 1) + '  ' + rule.name + '\n      ' + code
          );
        }
      }
    });
  }

  assert.strictEqual(
    violations.length,
    0,
    '\nES2017 floor violations found:\n\n' + violations.join('\n\n') + '\n'
  );
});
