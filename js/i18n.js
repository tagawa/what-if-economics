function detect() {
  const SUPPORTED = ['en', 'ja'];
  const DEFAULT = 'en';
  // URL param takes priority: enables sharing, QA, and locked-down devices.
  const urlParam = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('lang')
    : null;
  if (urlParam && SUPPORTED.includes(urlParam)) {
    if (typeof document !== 'undefined') document.documentElement.lang = urlParam;
    return urlParam;
  }
  const stored = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' && localStorage.getItem('lang');
  if (stored && SUPPORTED.includes(stored)) {
    if (typeof document !== 'undefined') document.documentElement.lang = stored;
    return stored;
  }
  const navLangs = typeof navigator !== 'undefined'
    ? (navigator.languages != null ? navigator.languages : (navigator.language ? [navigator.language] : []))
    : [];
  for (const l of navLangs) {
    const tag = l.split('-')[0];
    if (SUPPORTED.includes(tag)) {
      if (typeof document !== 'undefined') document.documentElement.lang = tag;
      return tag;
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = DEFAULT;
  return DEFAULT;
}

// allStrings: { [langTag]: { [key]: string } } — seeds multiple langs into cache.
// Singleton path passes null; factory/test path passes the full map.
function createI18n(allStrings, lang) {
  const SUPPORTED = ['en', 'ja'];
  const DEFAULT = 'en';
  const LANG_LABELS = { en: 'EN', ja: '日本語' };
  let currentLang = lang != null ? lang : DEFAULT;
  const cache = {};

  if (allStrings != null) {
    Object.keys(allStrings).forEach(function(tag) { cache[tag] = allStrings[tag]; });
  }

  function _get(obj, dotKey) {
    return dotKey.split('.').reduce(function(o, k) { return o != null ? o[k] : undefined; }, obj);
  }

  function t(key) {
    const cur = _get(cache[currentLang], key);
    if (cur != null) return cur;
    const en = _get(cache[DEFAULT], key);
    if (en != null) return en;
    return key;
  }

  function resolveField(obj) {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return '';
    if (obj[currentLang] != null) return obj[currentLang];
    if (obj[DEFAULT] != null) return obj[DEFAULT];
    return '';
  }

  function _loadLang(tag) {
    if (cache[tag] != null) return Promise.resolve(cache[tag]);
    return fetch('i18n/ui.' + tag + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) { cache[tag] = data; return data; });
  }

  function init() {
    return _loadLang(currentLang).catch(function() {
      if (currentLang !== DEFAULT) {
        currentLang = DEFAULT;
        if (typeof document !== 'undefined') document.documentElement.lang = DEFAULT;
        return _loadLang(DEFAULT);
      }
      throw new Error('[i18n] Failed to load default locale');
    });
  }

  function preload(tag) {
    _loadLang(tag).catch(function() {}); // silent — fetches on demand if offline at init
  }

  function setLang(tag) {
    if (!SUPPORTED.includes(tag)) return Promise.resolve();
    return _loadLang(tag).then(function() {
      currentLang = tag;
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem('lang', tag);
      if (typeof document !== 'undefined') document.documentElement.lang = tag;
    });
  }

  function isReady() {
    return cache[currentLang] != null;
  }

  return {
    get currentLang() { return currentLang; },
    SUPPORTED: SUPPORTED,
    LANG_LABELS: LANG_LABELS,
    t: t,
    resolveField: resolveField,
    init: init,
    preload: preload,
    setLang: setLang,
    isReady: isReady,
  };
}

const i18n = createI18n(null, detect());

if (typeof module !== 'undefined') module.exports = { createI18n, SUPPORTED: ['en', 'ja'] };
if (typeof window !== 'undefined') window.i18n = i18n;
