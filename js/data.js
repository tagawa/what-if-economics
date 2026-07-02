class EconData {
  constructor() {
    this.factors = null;
    this.relationships = null;
    this.scenarios = null;
  }

  async load() {
    const [factors, relationships, scenarios] = await Promise.all([
      fetch('./data/factors.json').then(r => r.json()),
      fetch('./data/relationships.json').then(r => r.json()),
      fetch('./data/scenarios.json').then(r => r.json())
    ]);

    this.factors = factors.factors;
    this.relationships = relationships.relationships;
    this.scenarios = scenarios.scenarios;
  }

  getBaselineState() {
    const state = {};
    Object.keys(this.factors).forEach(factorId => {
      state[factorId] = 'neutral';
    });
    return state;
  }

  getFactorName(factorId) {
    return i18n.resolveField((this.factors[factorId] || {}).name) || factorId;
  }

  getFactorDescription(factorId) {
    return i18n.resolveField((this.factors[factorId] || {}).description) || '';
  }

  getFactorLabel(factorId, state) {
    const factor = this.factors[factorId];
    if (!factor) return i18n.t('factor.status_neutral');
    switch (state) {
      case 'low':  return i18n.resolveField(factor.low);
      case 'high': return i18n.resolveField(factor.high);
      // state is 'high' or 'low' here, never 'neutral' from callers
      case 'neutral':
      default: return i18n.t('factor.status_neutral');
    }
  }

  getScenarioName(scenarioId) {
    return i18n.resolveField((this.scenarios[scenarioId] || {}).name);
  }
}
