/**
 * Multi-factor scenario guard (zero-install).
 *
 * architecture.md "Known bugs": applyScenario calls adjustFactor once per
 * changes entry, and each call resets unrelated factors to neutral, so only
 * the last entry's effects survive. Any scenario with >1 changes entry is
 * therefore silently wrong until applyScenario is fixed.
 *
 * This test makes that a loud CI failure the moment someone authors one.
 * Remove it once applyScenario computes a combined target state.
 *
 * Place at: test/scenario-single-change.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('no scenario has more than one changes entry', () => {
  const file = path.join(__dirname, '..', 'data', 'scenarios.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const scenarios = parsed.scenarios || {};

  const offenders = Object.keys(scenarios)
    .map(function (id) {
      const count = Object.keys(scenarios[id].changes || {}).length;
      return { id: id, count: count };
    })
    .filter(function (s) { return s.count > 1; })
    .map(function (s) { return s.id + ' (' + s.count + ' entries)'; });

  assert.strictEqual(
    offenders.length,
    0,
    '\nMulti-factor scenarios are silently broken until applyScenario is fixed.\n' +
    'See architecture.md "Known bugs". Either fix applyScenario to apply a\n' +
    'combined target state, or split these into single-factor scenarios:\n\n  ' +
    offenders.join('\n  ') + '\n'
  );
});
