/**
 * Fathom event-name pin (zero-install).
 *
 * Fathom event names cannot be renamed after creation, so a refactor that
 * "tidies" a name (e.g. 'Adjusted a factor' -> 'Adjusted factor') silently
 * forks the event forever on the dashboard. This gate asserts every event
 * name the app sends still appears verbatim in js/app.js.
 *
 * Update EVENT_NAMES below ONLY as part of a deliberate, coordinated Fathom
 * dashboard change — never to make a green build out of an accidental rename.
 *
 * Two events are dynamic: a fixed prefix concatenated with a runtime value
 * (scenario id, locale). The pinned string is the prefix.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_JS = path.join(__dirname, '..', 'js', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

const EVENT_NAMES = [
  'Adjusted a factor',
  'Applied scenario: ',       // + scenario id
  'Enabled beginner mode',
  'Exited beginner mode',
  'Reset factors',
  'Switched language: ',      // + locale
  'Opened notes',
];

test('every Fathom event name appears verbatim in js/app.js', () => {
  const missing = EVENT_NAMES.filter(name => !src.includes(name));
  assert.deepEqual(
    missing,
    [],
    '\nFathom event names missing from js/app.js (renamed by accident?):\n  ' +
      missing.join('\n  ') + '\n'
  );
});

// Anti-vacuum tripwire: the pin is meaningless if the tracking wiring is gone.
test('js/app.js still wires Fathom tracking', () => {
  assert.ok(src.includes('trackEvent'), 'expected a window.fathom.trackEvent call in app.js');
  assert.equal(
    EVENT_NAMES.length,
    7,
    'Pinned event count changed. This is NOT a build breakage: if you deliberately ' +
      'added or removed a Fathom event, update this count (and EVENT_NAMES) on purpose.'
  );
});
