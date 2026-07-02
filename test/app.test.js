const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { CORE_FACTORS, scenarioFitsBeginnerMode } = require('../js/app.js');
const scenarios = require('../data/scenarios.json').scenarios;

describe('scenarioFitsBeginnerMode', () => {

  test('true when every triggered factor is a core factor', () => {
    assert.equal(scenarioFitsBeginnerMode({ changes: { interest_rate: 1 } }, CORE_FACTORS), true);
  });

  test('false when a triggered factor is not a core factor', () => {
    assert.equal(scenarioFitsBeginnerMode({ changes: { exchange_rate: -1 } }, CORE_FACTORS), false);
  });

  test('false when any one of several triggers is non-core', () => {
    assert.equal(scenarioFitsBeginnerMode({ changes: { inflation: 1, stock_market: -1 } }, CORE_FACTORS), false);
  });

  // Locks in the user-facing outcome: Beginner Mode drops exactly the scenarios
  // whose trigger factor has no card in the 5-factor grid.
  test('shipped scenarios: Beginner Mode hides exactly the hidden-trigger scenarios', () => {
    const hidden = Object.keys(scenarios)
      .filter(id => !scenarioFitsBeginnerMode(scenarios[id], CORE_FACTORS))
      .sort();
    assert.deepEqual(hidden, ['confidence_boost', 'currency_crisis', 'market_crash']);
  });
});
