/**
 * Simple state manager for text states
 */
class EconState {
  constructor(initialState) {
    this.current = Object.assign({}, initialState);
    this.baseline = Object.assign({}, initialState);
    this.listeners = {};
  }

  get(factorId) {
    return this.current[factorId] || 'neutral';
  }

  set(factorId, state) {
    const oldState = this.current[factorId];
    this.current[factorId] = state;
    
    // Notify listeners
    if (this.listeners[factorId]) {
      this.listeners[factorId].forEach(callback => callback(state, oldState));
    }
  }

  onChange(factorId, callback) {
    if (!this.listeners[factorId]) this.listeners[factorId] = [];
    this.listeners[factorId].push(callback);
  }

  reset() {
    Object.keys(this.current).forEach(factorId => {
      const oldState = this.current[factorId];
      this.current[factorId] = 'neutral';
      if (this.listeners[factorId]) {
        this.listeners[factorId].forEach(callback =>
          callback('neutral', oldState)
        );
      }
    });
  }

  // Simple localStorage
  savePreference(key, value) {
    try {
      localStorage.setItem(`econripple_${key}`, JSON.stringify(value));
    } catch (e) {}
  }

  getPreference(key, defaultValue) {
    try {
      const stored = localStorage.getItem(`econripple_${key}`);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
}

if (typeof module !== 'undefined') module.exports = EconState;
