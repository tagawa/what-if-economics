const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createI18n } = require('../js/i18n.js');

describe('i18n', () => {

  test('t() returns string for a present key', () => {
    const i18n = createI18n({ en: { factor: { status_neutral: 'No change' } } }, 'en');
    assert.equal(i18n.t('factor.status_neutral'), 'No change');
  });

  test('t() falls back to en when key missing in currentLang', () => {
    const i18n = createI18n({ en: { factor: { status_neutral: 'No change' } } }, 'ja');
    assert.equal(i18n.t('factor.status_neutral'), 'No change');
  });

  test('t() returns key string when key missing in both langs', () => {
    const i18n = createI18n({ en: {} }, 'en');
    assert.equal(i18n.t('missing.key'), 'missing.key');
  });

  test('resolveField() returns currentLang value when both langs present', () => {
    const i18n = createI18n({}, 'ja');
    assert.equal(i18n.resolveField({ en: 'Interest Rate', ja: '金利' }), '金利');
  });

  test('resolveField() falls back to en when currentLang key absent from object', () => {
    const i18n = createI18n({}, 'ja');
    assert.equal(i18n.resolveField({ en: 'Interest Rate' }), 'Interest Rate');
  });

  test('resolveField() returns empty string for undefined input', () => {
    const i18n = createI18n({}, 'en');
    assert.equal(i18n.resolveField(undefined), '');
  });

  test('resolveField() returns empty string for bare string input', () => {
    const i18n = createI18n({}, 'en');
    assert.equal(i18n.resolveField('bare string'), '');
  });

  test('setLang() updates currentLang (pre-seeded cache avoids fetch)', async () => {
    const i18n = createI18n({ en: { key: 'English' }, ja: { key: '日本語' } }, 'en');
    assert.equal(i18n.currentLang, 'en');
    await i18n.setLang('ja');
    assert.equal(i18n.currentLang, 'ja');
    assert.equal(i18n.t('key'), '日本語');
  });

  test('after setLang(), t() falls back to en for keys missing in new lang', async () => {
    const i18n = createI18n({ en: { en_only: 'English only', shared: 'en' }, ja: { shared: 'ja' } }, 'en');
    await i18n.setLang('ja');
    assert.equal(i18n.t('en_only'), 'English only'); // falls back to en
    assert.equal(i18n.t('shared'), 'ja');             // ja wins when present
  });

  test('split/join interpolation replaces single {name} placeholder', () => {
    const i18n = createI18n({ en: { factor: { btn_lower_title: 'Lower {name}' } } }, 'en');
    const result = i18n.t('factor.btn_lower_title').split('{name}').join('Interest Rate');
    assert.equal(result, 'Lower Interest Rate');
  });

  test('split/join interpolation replaces all occurrences of {name}', () => {
    const i18n = createI18n({ en: { test: { repeated: '{name} and {name}' } } }, 'en');
    const result = i18n.t('test.repeated').split('{name}').join('GDP');
    assert.equal(result, 'GDP and GDP');
  });

  test('isReady() returns false when no strings loaded', () => {
    const i18n = createI18n(null, 'en');
    assert.equal(i18n.isReady(), false);
  });

  test('isReady() returns true after factory seeds strings', () => {
    const i18n = createI18n({ en: { page: { title: 'Test' } } }, 'en');
    assert.equal(i18n.isReady(), true);
  });

});
