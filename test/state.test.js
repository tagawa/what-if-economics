const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const EconState = require('../js/state.js');

describe('EconState', () => {

  test('set() updates state', () => {
    const state = new EconState({ interest_rate: 'neutral' });
    state.set('interest_rate', 'high');
    assert.equal(state.get('interest_rate'), 'high');
  });

  test('set() fires onChange with correct (newState, oldState)', () => {
    const state = new EconState({ interest_rate: 'neutral' });
    let received = null;
    state.onChange('interest_rate', (newState, oldState) => {
      received = { newState, oldState };
    });
    state.set('interest_rate', 'high');
    assert.deepEqual(received, { newState: 'high', oldState: 'neutral' });
  });

  test('reset() fires onChange with correct oldState', () => {
    const state = new EconState({ interest_rate: 'neutral' });
    state.set('interest_rate', 'high'); // put factor in non-neutral state
    let received = null;
    state.onChange('interest_rate', (newState, oldState) => {
      received = { newState, oldState };
    });
    state.reset();
    // oldState must be 'high' (pre-reset value), not 'neutral'
    assert.deepEqual(received, { newState: 'neutral', oldState: 'high' });
  });

  test('onChange fires for registered factor only', () => {
    const state = new EconState({ interest_rate: 'neutral', inflation: 'neutral' });
    let callCount = 0;
    state.onChange('interest_rate', () => { callCount++; });
    state.set('inflation', 'high');     // different factor — must not fire
    assert.equal(callCount, 0);
    state.set('interest_rate', 'high'); // registered factor — must fire
    assert.equal(callCount, 1);
  });

  test.skip('reset() bug reproduction — pre-fix behaviour (DO NOT UN-SKIP)', () => {
    // Skipped intentionally. Asserts pre-fix behaviour; will FAIL against fixed code by design. Do not un-skip.
    // Identical to test 3 except expected oldState; diff them to see the bug.
    // Before the fix, reset() read this.current[factorId] after setting it to 'neutral',
    // so both callback args were 'neutral'. Test 3 above is the live regression guard.
    const state = new EconState({ interest_rate: 'neutral' });
    state.set('interest_rate', 'high');
    let received = null;
    state.onChange('interest_rate', (newState, oldState) => {
      received = { newState, oldState };
    });
    state.reset();
    assert.deepEqual(received, { newState: 'neutral', oldState: 'neutral' });
  });

});
