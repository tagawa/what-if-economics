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

// Decide the initial Beginner Mode state at load. A ?pagename=beginner URL forces it on for
// that visit (shareable link); otherwise honour the saved preference. The URL never
// overwrites the stored preference — it only wins for the current load.
function resolveInitialBeginnerMode(pagenameValue, savedPref) {
  if (pagenameValue === 'beginner') return true;
  return savedPref;
}

// Keep the URL query string in sync with Beginner Mode: set/unset pagename=beginner while
// preserving any other params (e.g. ?lang). Returns '' rather than a bare '?' when empty.
// The param is `pagename` so Fathom logs the state change as a /?pagename=beginner pageview
// — Fathom reads a pageview's query string from location, not from trackPageview() args.
function buildBeginnerSearch(currentSearch, beginnerOn) {
  const params = new URLSearchParams(currentSearch);
  if (beginnerOn) params.set('pagename', 'beginner');
  else params.delete('pagename');
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

// Which factor cards are rendered right now. Beginner Mode shows only the core
// five; the full view shows everything.
function visibleFactorIds(allFactorIds, isBeginnerMode, coreFactors) {
  return isBeginnerMode ? allFactorIds.filter(id => coreFactors.includes(id)) : allFactorIds;
}

// Direction mapping for one edge. Mirrors adjustFactor's branch exactly:
// anything that is not literally 'positive' is treated as negative, so a typo
// in the data inverts the economics rather than throwing.
function rippleTargetState(sourceState, direction) {
  if (sourceState === 'neutral') return 'neutral';
  if (direction === 'positive') return sourceState;
  return sourceState === 'high' ? 'low' : 'high';
}

// Which segment of the three-part control is selected for a given factor state.
// The names are the data-action values already in the markup, so the existing
// #factors click delegation needs no change. An unrecognised state selects the
// middle segment rather than leaving the radiogroup with nothing checked, which
// mirrors the `default` arm of the switch this replaced and is also the only
// valid ARIA outcome.
function segmentForState(state) {
  if (state === 'high') return 'raise';
  if (state === 'low') return 'lower';
  return 'reset';
}

// Wrapping index for arrow-key focus movement. Written with the extra + count
// because JS's % keeps the sign of the dividend: (0 + -1) % 3 is -1, not 2.
function nextSegmentIndex(current, step, count) {
  return (current + step + count) % count;
}

// Structured description of one adjustment: what the user changed, and which
// visible factors move as a result. Pure and i18n-free (callers resolve the
// display strings), so the panel and the live region are built from one model
// and cannot drift. Effects are filtered to visibleIds here, which is the single
// place the Beginner Mode parity invariant is enforced.
function buildRippleModel(sourceId, sourceState, relationships, visibleIds) {
  const edges = relationships[sourceId] || {};
  const effects = Object.keys(edges)
    .filter(id => visibleIds.includes(id))
    .map(id => ({
      id: id,
      state: rippleTargetState(sourceState, edges[id].direction),
      explanation: edges[id].explanation
    }));
  return { cause: { id: sourceId, state: sourceState }, effects: effects };
}

// Live-region string for a ripple. Trivial, but kept as a named function because
// it is what the parity invariant in docs/architecture.md is documented against.
function buildRippleSummary(effects, describe) {
  return effects.map(describe).join(', ');
}

class EconRipple {
  constructor() {
    this.data = new EconData();
    this.state = null;
    this.isBeginnerMode = false;
    this.hasTrackedAdjust = false; // fire "Adjusted a factor" only once per page load
    this.lastCause = null; // {id, state} of the last adjustment; null means the panel is empty
    this.delays = { medium: 500 };
  }

  // Fathom loads via defer and may be blocked; never let a missing global throw.
  track(name) {
    if (window.fathom) window.fathom.trackEvent(name);
  }

  async init() {
    try {
      await Promise.all([i18n.init(), this.data.load()]);
      const otherLang = i18n.SUPPORTED.find(l => l !== i18n.currentLang);
      if (otherLang) i18n.preload(otherLang);

      this.state = new EconState(this.data.getBaselineState());

      // ?pagename=beginner (shareable link) wins for this load; otherwise the saved preference.
      // The URL is NOT persisted — this must not route through toggleBeginnerMode(), which
      // owns the Enabled/Exited beginner mode events (those mean user action only).
      const savedBeginner = this.state.getPreference('beginnerMode', false);
      const urlPagename = new URLSearchParams(location.search).get('pagename');
      this.isBeginnerMode = resolveInitialBeginnerMode(urlPagename, savedBeginner);

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
    this.refreshRipple();

    // Register onChange listeners once for all factors — not in renderFactors(),
    // which is called on every re-render and would accumulate duplicate listeners.
    Object.keys(this.data.factors).forEach(factorId => {
      this.state.onChange(factorId, (newState) => {
        this.updateDisplay(factorId, newState);
      });
    });

    // Header buttons — static, direct listeners
    document.getElementById('btn-beginner').addEventListener('click', () => this.toggleBeginnerMode());
    document.getElementById('btn-reset').addEventListener('click', () => {
      this.reset();
      this.track('Reset factors');
    });

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
      if (action === 'lower' || action === 'raise') {
        // Coarse engagement signal: first DIRECT factor click per load. Lives here, not in
        // adjustFactor(), which applyScenario() also calls — that would misattribute scenarios.
        if (!this.hasTrackedAdjust) {
          this.hasTrackedAdjust = true;
          this.track('Adjusted a factor');
        }
      }
      if (action === 'lower') this.adjustFactor(factorId, 'low');
      else if (action === 'raise') this.adjustFactor(factorId, 'high');
      else if (action === 'reset') this.resetFactor(factorId);
    });

    // Arrow keys move focus between segments; they do NOT select. Committing here
    // would fire a full ripple, a 500ms timer cascade and an announcement on every
    // keypress, so arrowing across three segments would run three complete ripples.
    // Space and Enter commit, and they need no code: these are real <button>
    // elements, so the browser fires a click for them and the delegation above
    // handles it. Adding a commit path here would double-fire.
    document.getElementById('factors').addEventListener('keydown', (e) => {
      const btn = e.target.closest('button[role="radio"]');
      if (!btn) return;
      let step = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step = -1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step = 1;
      if (!step) return;
      e.preventDefault(); // otherwise Arrow Up/Down scrolls the page as well

      const group = btn.closest('[role="radiogroup"]');
      if (!group) return;
      const segs = Array.prototype.slice.call(group.querySelectorAll('button[role="radio"]'));
      const next = segs[nextSegmentIndex(segs.indexOf(btn), step, segs.length)];
      // Move the roving tabindex with focus, so a later Tab out and back returns
      // here rather than to the selected segment.
      segs.forEach(s => s.setAttribute('tabindex', '-1'));
      next.setAttribute('tabindex', '0');
      next.focus();
    });

    // Scenario delegation — one listener on #scenarios
    document.getElementById('scenarios').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-scenario]');
      if (!btn) return;
      this.applyScenario(btn.dataset.scenario);
      this.track('Applied scenario: ' + btn.dataset.scenario); // detailed: scenario ID
    });

    // Notes is a <details>; the toggle event fires on open and close — track opens only.
    document.getElementById('notes').addEventListener('toggle', (e) => {
      if (e.target.open) this.track('Opened notes');
    });
  }

  renderFactors() {
    const container = document.getElementById('factors');
    const factorIds = Object.keys(this.data.factors);
    const visibleFactors = visibleFactorIds(factorIds, this.isBeginnerMode, CORE_FACTORS);

    container.innerHTML = visibleFactors.map(factorId => {
      const name = this.data.getFactorName(factorId);
      // The label is visually hidden, not removed: the glyph carries the meaning on
      // screen, and the text remains the button's accessible name, so a screen
      // reader still announces "Lower Interest Rate". Deleting the span would leave
      // the accessible name as a bare arrow character.
      //
      // seg() takes RESOLVED strings, never key names. A helper that took a key
      // name and looked it up internally reads as tidier and breaks
      // test/i18n-completeness.test.js, which scans call sites for literal string
      // arguments and fails loudly on a variable key. Worse than the red gate is
      // what a merely-skipped call would cost: these six keys are exactly the ones
      // guarding that the JA locale has a label for every segment.
      const seg = (action, title, label, glyph) => `
            <button class="segment segment-${action}" role="radio" aria-checked="false" tabindex="-1"
                    data-action="${action}" title="${title}">
              <span class="segment-icon" aria-hidden="true">${glyph}</span><span class="visually-hidden">${label}</span>
            </button>`;
      return `
        <div class="factor-card" data-factor="${factorId}">
          <h3>${name}</h3>
          <div class="segmented" role="radiogroup" aria-label="${name}" id="segments-${factorId}">${
            seg('lower', i18n.t('factor.btn_lower_title').split('{name}').join(name), i18n.t('factor.btn_lower'), '↓')}${
            seg('reset', i18n.t('factor.btn_reset_title').split('{name}').join(name), i18n.t('factor.status_neutral'), '●')}${
            seg('raise', i18n.t('factor.btn_raise_title').split('{name}').join(name), i18n.t('factor.btn_higher'), '↑')}
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

  // Rebuild the panel from the last adjustment. Called on adjust, reset, language
  // switch and Beginner Mode toggle, so the panel always reflects the current
  // locale and the currently visible factor set.
  refreshRipple() {
    if (!this.lastCause) {
      this.renderRippleCompensated(null);
      return;
    }
    const visible = visibleFactorIds(Object.keys(this.data.factors), this.isBeginnerMode, CORE_FACTORS);
    this.renderRippleCompensated(buildRippleModel(this.lastCause.id, this.lastCause.state, this.data.relationships, visible));
  }

  // Safari implements no scroll anchoring on any platform, so a panel that grows
  // above the user's scroll position shifts everything below it under their finger,
  // 500 ms after their tap. Measure across the render and absorb the difference.
  //
  // getBoundingClientRect() returns the STUCK position, not the flow position: a
  // sticky panel pinned at top:0 always reports rect.top === 0 however far the page
  // has scrolled. That is why the stuck test is rect.top <= 0 and not a document
  // offset — any condition phrased in document coordinates gets implemented with
  // this same call and silently inverts.
  renderRippleCompensated(model) {
    const panel = document.getElementById('ripple');
    if (!panel) {
      this.renderRipple(model);
      return;
    }
    const before = panel.getBoundingClientRect();
    // Branch on the computed position, not on window.innerWidth: the 768px
    // breakpoint then lives only in the stylesheet and cannot drift. Substring
    // match because old iOS reports '-webkit-sticky' as the computed value.
    const isSticky = getComputedStyle(panel).position.indexOf('sticky') !== -1;
    // Never OR these: rect.bottom <= 0 implies rect.top <= 0, so a disjunction
    // collapses to the sticky test and would compensate a desktop panel that is
    // still half on screen.
    const compensate = isSticky ? before.top <= 0 : before.bottom <= 0;
    const heightBefore = before.height;

    this.renderRipple(model);

    if (!compensate) return; // growth is on screen, and the growth is the feedback
    const delta = panel.getBoundingClientRect().height - heightBefore;
    if (delta) window.scrollBy(0, delta);
  }

  // The panel is the app's answer to "what follows?". Effect rows use
  // getFactorLabel(), the same accessor the live region uses, so the panel reads
  // in exactly the words the screen reader announces.
  renderRipple(model) {
    const panel = document.getElementById('ripple');
    if (!panel) return;

    if (!model) {
      panel.className = 'ripple-empty';
      panel.textContent = i18n.t('ripple.empty');
      return;
    }

    // The key ternary sits inside the t() call and its only string literals are the
    // two keys: the i18n-completeness gate reads every quoted string in the argument
    // span as a key, so the 'high' comparison has to be hoisted out of it.
    const raised = model.cause.state === 'high';
    const cause = i18n.t(raised ? 'ripple.cause_high' : 'ripple.cause_low')
      .split('{name}').join(this.data.getFactorName(model.cause.id));

    // innerHTML with first-party data only: factor names and explanations come
    // from our own JSON, the same trust level as renderFactors() above.
    const rows = model.effects.map(effect => {
      const dirClass = effect.state === 'high' ? 'increase' : 'decrease';
      const glyph = effect.state === 'high' ? '↑' : '↓';
      return `
        <li class="ripple-effect ${dirClass}">
          <span class="ripple-dir" aria-hidden="true">${glyph}</span>
          <span class="ripple-factor">${this.data.getFactorName(effect.id)}: ${this.data.getFactorLabel(effect.id, effect.state)}</span>
          <span class="ripple-why">${i18n.resolveField(effect.explanation)}</span>
        </li>
      `;
    }).join('');

    panel.className = 'ripple-filled';
    panel.innerHTML =
      `<p class="ripple-cause">${cause}</p>` +
      (rows ? `<ul class="ripple-effects">${rows}</ul>` : '');
  }

  adjustFactor(factorId, newState) {
    // Set the factor to the new state
    this.state.set(factorId, newState);
    this.lastCause = { id: factorId, state: newState };

    // Announce the user's own adjustment immediately. No visibility filter needed:
    // this card is always rendered — the user clicked it, or applyScenario triggered
    // it and scenarioFitsBeginnerMode already guarantees a core factor.
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
    // Runs unconditionally, not only when relationships exist, so a factor with
    // no outgoing edges still clears the panel to a cause-only state.
    const self = this;
    setTimeout(function () {
      const visible = visibleFactorIds(Object.keys(self.data.factors), self.isBeginnerMode, CORE_FACTORS);
      self.refreshRipple();
      const model = buildRippleModel(factorId, newState, self.data.relationships, visible);
      const summary = buildRippleSummary(model.effects, function (e) {
        return self.data.getFactorName(e.id) + ': ' + self.data.getFactorLabel(e.id, e.state);
      });
      // Empty when every ripple target is hidden in Beginner Mode; announcing '' is noise.
      if (summary) self.announce(summary);
    }, this.delays.medium);
  }

  // The selected segment is the factor's state: no separate badge to keep in
  // sync. Also applies the card tint, which is the at-a-glance scanning layer
  // the colour budget is spent on; before this slice the .factor-card.increase
  // rules existed in CSS but nothing ever added the class.
  updateDisplay(factorId, state) {
    const group = document.getElementById(`segments-${factorId}`);
    if (!group) return;

    const card = document.querySelector(`[data-factor="${factorId}"]`);
    if (card) {
      card.classList.remove('increase', 'decrease');
      if (state === 'high') card.classList.add('increase');
      else if (state === 'low') card.classList.add('decrease');
    }

    const selected = segmentForState(state);
    group.querySelectorAll('button[data-action]').forEach(function (btn) {
      const on = btn.dataset.action === selected;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      // Roving tabindex: exactly one segment per group is tab-reachable, and it
      // is the selected one, so Tab lands on the current value rather than the
      // first segment. Written as add/remove, not classList.toggle(cls, force),
      // whose second argument is unreliable below the browser floor here.
      btn.setAttribute('tabindex', on ? '0' : '-1');
      if (on) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
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

    this.lastCause = null;
    this.refreshRipple();

    document.querySelectorAll('.factor-card').forEach(card => {
      card.classList.remove('pulse');
    });
  }

  resetFactor(factorId) {
    // Always clear, never conditionally on lastCause.id === factorId. resetFactor
    // neutralises this factor AND all its relationship targets, any of which may be
    // a row in the current panel, so a panel left standing would describe factors
    // whose cards have just gone neutral.
    this.lastCause = null;
    this.refreshRipple();

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
    this.track(this.isBeginnerMode ? 'Enabled beginner mode' : 'Exited beginner mode');

    // Mirror the toggle in the URL (shareable state) and, on enable, log a
    // /?pagename=beginner pageview so in-app activations join shared-link arrivals in the
    // same Pages row. replaceState (not push) so the back button isn't polluted.
    const search = buildBeginnerSearch(location.search, this.isBeginnerMode);
    history.replaceState(null, '', location.pathname + search + location.hash);
    if (this.isBeginnerMode && window.fathom) window.fathom.trackPageview({ url: location.href });

    this.renderFactors();
    this.renderScenarios(); // Beginner Mode filters scenarios too; without this the panel goes stale
    this.refreshRipple(); // visible factor set changed, so the effect list must be re-filtered

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
      this.track('Switched language: ' + lang);
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
    this.refreshRipple();
  }
}

// In Node (tests) export the pure helpers; in the browser bootstrap the app.
if (typeof module !== 'undefined') {
  module.exports = { CORE_FACTORS, scenarioFitsBeginnerMode, resolveInitialBeginnerMode, buildBeginnerSearch, visibleFactorIds, buildRippleSummary, rippleTargetState, buildRippleModel, segmentForState, nextSegmentIndex };
} else {
  const app = new EconRipple();
  document.addEventListener('DOMContentLoaded', () => app.init());
}
