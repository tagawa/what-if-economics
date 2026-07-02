/**
 * Main EconRipple Application - Text States Only
 */

// The five factors shown in Beginner Mode. Single source of truth for both the
// factor grid (renderFactors) and the scenario filter (renderScenarios).
const CORE_FACTORS = ['interest_rate', 'inflation', 'unemployment', 'gdp_growth', 'government_spending'];

// A scenario belongs in Beginner Mode only if every factor it triggers is a core
// factor — otherwise it would change factors whose cards aren't shown, giving the
// user an effect with no visible cause.
function scenarioFitsBeginnerMode(scenario, coreFactors) {
  return Object.keys(scenario.changes).every(id => coreFactors.includes(id));
}

class EconRipple {
  constructor() {
    this.data = new EconData();
    this.state = null;
    this.isBeginnerMode = false;
    this.delays = { medium: 500 };
  }

  async init() {
    try {
      await Promise.all([i18n.init(), this.data.load()]);
      const otherLang = i18n.SUPPORTED.find(l => l !== i18n.currentLang);
      if (otherLang) i18n.preload(otherLang);

      this.state = new EconState(this.data.getBaselineState());

      this.isBeginnerMode = this.state.getPreference('beginnerMode', false);

      this.createUI();
    } catch (error) {
      console.error('Failed to load the app:', error);
      const HARDCODED_EN = {
        'error.heading': 'Failed to load the app',
        'error.btn_retry': 'Try Again',
        'error.body': 'Error: {message}'
      };
      const t = i18n.isReady() ? i18n.t.bind(i18n) : (k => HARDCODED_EN[k]);
      document.body.innerHTML = `
        <div style="text-align: center; padding: 50px; font-family: system-ui;">
          <h2 style="color: #dc2626;">${t('error.heading')}</h2>
          <p id="error-msg"></p>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer;">${t('error.btn_retry')}</button>
        </div>
      `;
      document.getElementById('error-msg').textContent =
        t('error.body').split('{message}').join(error.message);
    }
  }

  createUI() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }

    document.title = i18n.t('page.title');
    // Static English notes in index.html are retained as deliberate no-JS fallback; duplication with ui.en.json is accepted.
    document.getElementById('notes').innerHTML = i18n.t('notes.html'); // trusted first-party content

    const control = document.getElementById('control');
    control.innerHTML = `
      <button id="btn-beginner">${i18n.t(this.isBeginnerMode ? 'header.btn_beginner_exit' : 'header.btn_beginner')}</button>
      <button id="btn-reset">${i18n.t('header.btn_reset_all')}</button>
      <div id="lang-switcher" role="group" aria-label="${i18n.t('header.lang_switcher_label')}">
        ${i18n.SUPPORTED.map(lang => `
          <button data-lang="${lang}" aria-current="${lang === i18n.currentLang ? 'true' : 'false'}">${i18n.LANG_LABELS[lang]}</button>
        `).join('')}
      </div>
    `;

    this.renderFactors();
    this.renderScenarios();

    const hint = document.getElementById('factor-hint');
    if (hint) {
      if (this.state.getPreference('hintDismissed', false)) {
        hint.style.display = 'none';
      } else {
        hint.textContent = i18n.t('factor.hint');
      }
    }

    // Register onChange listeners once for all factors — not in renderFactors(),
    // which is called on every re-render and would accumulate duplicate listeners.
    Object.keys(this.data.factors).forEach(factorId => {
      this.state.onChange(factorId, (newState) => {
        this.updateDisplay(factorId, newState);
      });
    });

    // Header buttons — static, direct listeners
    document.getElementById('btn-beginner').addEventListener('click', () => this.toggleBeginnerMode());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());

    document.getElementById('lang-switcher').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-lang]');
      if (!btn) return;
      this.switchLang(btn.dataset.lang);
    });

    // Factor card delegation — one listener on #factors, survives innerHTML re-renders
    document.getElementById('factors').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('[data-factor]');
      if (!card) return;
      const factorId = card.dataset.factor;
      const action = btn.dataset.action;
      // Persist the hint-dismissed flag on the user's first +/- adjustment, so the
      // hint is hidden from next load on — but stays on screen this session (no shift).
      // Reset and scenarios deliberately do not set it.
      if (action === 'lower' || action === 'raise') {
        this.state.savePreference('hintDismissed', true);
      }
      if (action === 'lower') this.adjustFactor(factorId, 'low');
      else if (action === 'raise') this.adjustFactor(factorId, 'high');
      else if (action === 'reset') this.resetFactor(factorId);
    });

    // Scenario delegation — one listener on #scenarios
    document.getElementById('scenarios').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-scenario]');
      if (!btn) return;
      this.applyScenario(btn.dataset.scenario);
    });
  }

  renderFactors() {
    const container = document.getElementById('factors');
    const factorIds = Object.keys(this.data.factors);
    const visibleFactors = this.isBeginnerMode
      ? factorIds.filter(id => CORE_FACTORS.includes(id))
      : factorIds;

    container.innerHTML = visibleFactors.map(factorId => {
      const name = this.data.getFactorName(factorId);
      return `
        <div class="factor-card" data-factor="${factorId}">
          <h3>${name}</h3>
          <div class="factor-status neutral" id="status-${factorId}">
            <span class="status-icon" aria-hidden="true">●</span>
            <span class="status-text">${i18n.t('factor.status_neutral')}</span>
          </div>
          <div class="factor-controls">
            <button class="control-btn decrease-btn" data-action="lower" title="${i18n.t('factor.btn_lower_title').split('{name}').join(name)}">
              <span class="btn-icon">−</span>
              <span class="btn-text">${i18n.t('factor.btn_lower')}</span>
            </button>
            <button class="control-btn reset-btn" data-action="reset" title="${i18n.t('factor.btn_reset_title').split('{name}').join(name)}">
              <span class="btn-icon">●</span>
              <span class="btn-text">${i18n.t('factor.btn_reset')}</span>
            </button>
            <button class="control-btn increase-btn" data-action="raise" title="${i18n.t('factor.btn_raise_title').split('{name}').join(name)}">
              <span class="btn-icon">+</span>
              <span class="btn-text">${i18n.t('factor.btn_higher')}</span>
            </button>
          </div>
          <p class="factor-description">${this.data.getFactorDescription(factorId)}</p>
        </div>
      `;
    }).join('');

    // Repaint current state — preserves non-neutral factors after re-render (lang switch, beginner toggle)
    visibleFactors.forEach(id => this.updateDisplay(id, this.state.get(id)));
  }

  renderScenarios() {
    const container = document.getElementById('scenarios');
    // In Beginner Mode, drop scenarios whose trigger factor isn't shown in the grid.
    const scenarioIds = Object.keys(this.data.scenarios).filter(id =>
      !this.isBeginnerMode || scenarioFitsBeginnerMode(this.data.scenarios[id], CORE_FACTORS)
    );
    container.innerHTML = `
      <h3>${i18n.t('scenarios.heading')}</h3>
      ${scenarioIds.map(id => `
        <button data-scenario="${id}">${this.data.getScenarioName(id)}</button>
      `).join('')}
    `;
  }

  adjustFactor(factorId, newState) {
    // Set the factor to the new state
    this.state.set(factorId, newState);

    // Announce the user's own adjustment immediately.
    this.announce(this.data.getFactorName(factorId) + ': ' + this.data.getFactorLabel(factorId, newState));

    // Get relationships and reset unaffected factors
    const relationships = this.data.relationships[factorId] || {};
    const affectedFactors = new Set(Object.keys(relationships));
    affectedFactors.add(factorId);

    // Reset unaffected factors to neutral
    Object.keys(this.data.factors).forEach(otherFactorId => {
      if (!affectedFactors.has(otherFactorId)) {
        this.state.set(otherFactorId, 'neutral');
      }
    });

    // Apply effects to related factors
    Object.entries(relationships).forEach(([targetFactorId, relationship]) => {
      setTimeout(() => {
        let targetState;

        if (newState === 'neutral') {
          targetState = 'neutral';
        } else {
          // Apply relationship direction
          if (relationship.direction === 'positive') {
            targetState = newState; // Same direction
          } else {
            targetState = newState === 'high' ? 'low' : 'high'; // Opposite direction
          }
        }

        this.state.set(targetFactorId, targetState);
        this.animateCard(targetFactorId);
      }, this.delays.medium);
    });

    // After the ripple settles, announce the resulting related changes.
    // Registered after the per-target timers at the same delay, so state has settled.
    if (Object.keys(relationships).length > 0) {
      const self = this;
      setTimeout(function () {
        const summary = Object.keys(relationships)
          .map(function (id) {
            return self.data.getFactorName(id) + ': ' + self.data.getFactorLabel(id, self.state.get(id));
          })
          .join(', ');
        self.announce(summary);
      }, this.delays.medium);
    }
  }

  updateDisplay(factorId, state) {
    const statusElement = document.getElementById(`status-${factorId}`);
    if (!statusElement) return;

    const icon = statusElement.querySelector('.status-icon');
    const text = statusElement.querySelector('.status-text');

    // Remove existing classes
    statusElement.classList.remove('neutral', 'increase', 'decrease');

    // Update display based on state
    switch(state) {
      case 'high':
        // state is 'high' or 'low' here, never 'neutral'
        icon.textContent = '↑';
        text.textContent = this.data.getFactorLabel(factorId, 'high');
        statusElement.classList.add('increase');
        break;
      case 'low':
        icon.textContent = '↓';
        text.textContent = this.data.getFactorLabel(factorId, 'low');
        statusElement.classList.add('decrease');
        break;
      case 'neutral':
      default:
        icon.textContent = '●';
        text.textContent = i18n.t('factor.status_neutral');
        statusElement.classList.add('neutral');
        break;
    }
  }

  animateCard(factorId) {
    const card = document.querySelector(`[data-factor="${factorId}"]`);
    if (!card) return;

    card.classList.remove('pulse');
    setTimeout(() => card.classList.add('pulse'), 10);
    setTimeout(() => card.classList.remove('pulse'), 600);
  }

  announce(message) {
    const region = document.getElementById('a11y-live');
    if (!region) return;
    // Clear first so a repeated identical message still re-announces.
    region.textContent = '';
    setTimeout(function () { region.textContent = message; }, 50);
  }

  applyScenario(scenarioId) {
    const scenario = this.data.scenarios[scenarioId];
    if (!scenario) return;

    this.reset();

    setTimeout(() => {
      Object.entries(scenario.changes).forEach(([factorId, change]) => {
        const newState = change > 0 ? 'high' : 'low';
        this.adjustFactor(factorId, newState);
      });
    }, 300);
  }

  reset() {
    this.state.reset();

    document.querySelectorAll('.factor-card').forEach(card => {
      card.classList.remove('pulse');
    });
  }

  resetFactor(factorId) {
    this.state.set(factorId, 'neutral');
    const card = document.querySelector(`[data-factor="${factorId}"]`);
    if (card) card.classList.remove('pulse');

    const relationships = this.data.relationships[factorId] || {};
    Object.keys(relationships).forEach(targetFactorId => {
      this.state.set(targetFactorId, 'neutral');
      const targetCard = document.querySelector(`[data-factor="${targetFactorId}"]`);
      if (targetCard) targetCard.classList.remove('pulse');
    });
  }

  toggleBeginnerMode() {
    this.isBeginnerMode = !this.isBeginnerMode;
    this.state.savePreference('beginnerMode', this.isBeginnerMode);
    this.renderFactors();

    const button = document.getElementById('btn-beginner');
    if (button) {
      button.textContent = i18n.t(this.isBeginnerMode ? 'header.btn_beginner_exit' : 'header.btn_beginner');
    }
  }

  async switchLang(lang) {
    if (lang === i18n.currentLang) return;
    try {
      await i18n.setLang(lang);
      this.rerenderAll();
    } catch (err) {
      console.warn('[i18n] language switch failed', err);
      // previously loaded language still functional; aria-current on buttons unchanged
    }
  }

  rerenderAll() {
    document.title = i18n.t('page.title');
    document.getElementById('notes').innerHTML = i18n.t('notes.html'); // trusted first-party content
    const beginnerBtn = document.getElementById('btn-beginner');
    if (beginnerBtn) {
      beginnerBtn.textContent = i18n.t(this.isBeginnerMode ? 'header.btn_beginner_exit' : 'header.btn_beginner');
    }
    i18n.SUPPORTED.forEach(lang => {
      const btn = document.querySelector('#lang-switcher [data-lang="' + lang + '"]');
      if (btn) btn.setAttribute('aria-current', lang === i18n.currentLang ? 'true' : 'false');
    });
    this.renderFactors();
    this.renderScenarios();

    const hint = document.getElementById('factor-hint');
    if (hint && hint.style.display !== 'none') {
      hint.textContent = i18n.t('factor.hint');
    }
  }
}

// In Node (tests) export the pure helpers; in the browser bootstrap the app.
if (typeof module !== 'undefined') {
  module.exports = { CORE_FACTORS, scenarioFitsBeginnerMode };
} else {
  const app = new EconRipple();
  document.addEventListener('DOMContentLoaded', () => app.init());
}
