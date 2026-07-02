/**
 * Tokens completeness gate (zero-install).
 *
 * architecture.md is the single source of truth for design tokens; the values
 * are hand-copied into css/gtk.css with no build step. This test asserts every
 * value in the Tokens tables actually appears in the CSS, catching copy drift.
 *
 * Forward direction only (tabled value -> CSS), matching the documented contract.
 * It does NOT assert the reverse (every CSS value is tabled).
 *
 * Anti-vacuum tripwires: fails loudly if the "## Tokens" section can't be found,
 * or if it parses fewer values than MIN_TOKENS, so a doc reformat can't silently
 * turn this into a no-op pass.
 *
 * Place at: test/tokens-completeness.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Tripwire: current tables hold ~51 value cells. If the parser ever returns
// far fewer, the tables changed shape and the gate is no longer reading them.
const MIN_TOKENS = 45;

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extract the "## Tokens" section (up to the next level-2 heading).
function extractTokensSection(md) {
  const lines = md.split('\n');
  const start = lines.findIndex(function (l) { return /^##\s+Tokens\b/.test(l.trim()); });
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // next level-2 heading (## X) but not level-3 (### X)
    if (/^##\s+/.test(lines[i]) && !/^###/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// Parse markdown table rows; value is the 2nd column, wrapped in backticks.
// Header/separator rows have no backticks and are skipped.
function parseTokenValues(section) {
  const out = [];
  section.split('\n').forEach(function (line) {
    if (!line.trim().startsWith('|')) return;
    const cells = line.split('|').map(function (c) { return c.trim(); });
    const name = cells[1];
    const valueCell = cells[2];
    if (!valueCell) return;
    const m = valueCell.match(/`([^`]+)`/);
    if (!m) return;
    out.push({ token: name, value: m[1] });
  });
  return out;
}

// Composite values (box-shadows) contain spaces: match whitespace-insensitively.
// Atomic values (hex, single dimensions): match with numeric boundaries so e.g.
// "6px" does not spuriously match inside "16px".
function valueInCss(value, css, cssNoWs) {
  if (/\s/.test(value)) {
    return cssNoWs.indexOf(value.replace(/\s+/g, '')) !== -1;
  }
  const re = new RegExp('(?<![0-9.])' + escapeRegex(value) + '(?![0-9a-z])', 'i');
  return re.test(css);
}

test('every Tokens-table value in architecture.md appears in css/gtk.css', () => {
  const docPath = firstExisting([
    path.join(__dirname, '..', 'docs', 'architecture.md'),
    path.join(__dirname, '..', 'architecture.md')
  ]);
  const cssPath = path.join(__dirname, '..', 'css', 'gtk.css');

  assert.ok(docPath, 'architecture.md not found at docs/ or repo root.');
  assert.ok(fs.existsSync(cssPath), 'css/gtk.css not found.');

  const md = fs.readFileSync(docPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const cssNoWs = css.replace(/\s+/g, '');

  const section = extractTokensSection(md);
  assert.ok(
    section,
    'Could not find the "## Tokens" section in architecture.md. Heading renamed ' +
    'or file moved? Without it this gate would pass vacuously.'
  );

  const values = parseTokenValues(section);
  assert.ok(
    values.length >= MIN_TOKENS,
    'Parsed only ' + values.length + ' token values (expected >= ' + MIN_TOKENS + '). ' +
    'The Tokens tables likely changed format and the parser is no longer reading ' +
    'them, which would cause a vacuous pass. Fix the parser or adjust MIN_TOKENS.'
  );

  const missing = values
    .filter(function (v) { return !valueInCss(v.value, css, cssNoWs); })
    .map(function (v) { return v.token + ' = ' + v.value; });

  assert.strictEqual(
    missing.length,
    0,
    '\nTabled token values missing from css/gtk.css:\n  ' + missing.join('\n  ') + '\n'
  );
});
