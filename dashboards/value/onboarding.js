/* ==========================================================================
   Octopus Deploy Dashboard — Onboarding Wizard & Value Calculator
   
   Presents a step-by-step wizard to capture "before automation" context.
   Answers are stored in localStorage and used to turn raw deployment
   metrics into executive-friendly value narratives.
   
   If no answers are stored, the dashboard falls back to the generic
   metric-driven view.
   ========================================================================== */

const Onboarding = (() => {

  const STORAGE_KEY = 'octopus_dashboard_onboarding';

  // ---- Question definitions ----

  const QUESTIONS = [
    {
      id: 'deployEffort',
      number: 1,
      title: 'Deployment Effort',
      question: 'Before adopting automated deployments, how much active engineer time did a typical production deployment require?',
      icon: 'fa-solid fa-clock',
      options: [
        { value: 'under15',   label: '< 15 minutes',   minutes: 7.5   },
        { value: '15to60',    label: '15–60 minutes',   minutes: 37.5  },
        { value: '1to3hr',    label: '1–3 hours',       minutes: 120   },
        { value: 'halfday',   label: 'Half day',        minutes: 240   },
        { value: 'multiday',  label: 'Multi-day effort', minutes: 960  },
      ],
      insight: 'Multiplied against total deployments to calculate engineering hours saved.',
    },
    {
      id: 'peopleInvolved',
      number: 2,
      title: 'People Involved',
      question: 'How many people were typically required to safely perform a production deployment?',
      icon: 'fa-solid fa-users',
      options: [
        { value: '1',      label: '1 person',          headcount: 1  },
        { value: '2',      label: '2 people',          headcount: 2  },
        { value: '3to5',   label: '3–5 people',        headcount: 4  },
        { value: '6to10',  label: '6–10 people',       headcount: 8  },
        { value: 'cross',  label: 'Cross-team event',  headcount: 15 },
      ],
      insight: 'Turns time saved into salary cost and coordination overhead removed.',
    },
    {
      id: 'failureRecovery',
      number: 3,
      title: 'Failure Recovery',
      question: 'If a deployment failed, how long did recovery typically take?',
      icon: 'fa-solid fa-triangle-exclamation',
      options: [
        { value: 'minutes',   label: 'Minutes',           hours: 0.083  },
        { value: 'under1hr',  label: '< 1 hour',          hours: 0.5    },
        { value: '1to4hr',    label: '1–4 hours',         hours: 2.5    },
        { value: 'sameday',   label: 'Same day',          hours: 8      },
        { value: 'multiday',  label: 'Multi-day incident', hours: 48    },
      ],
      insight: 'Multiplied against failure rate to quantify incident impact reduction.',
    },
    {
      id: 'releaseCadence',
      number: 4,
      title: 'Release Cadence',
      question: 'What best described your release cadence before automated deployments?',
      icon: 'fa-solid fa-calendar-days',
      options: [
        { value: 'ondemand',  label: 'On demand',                   deploysPerMonth: 20  },
        { value: 'daily',     label: 'Daily',                       deploysPerMonth: 20  },
        { value: 'weekly',    label: 'Weekly',                      deploysPerMonth: 4   },
        { value: 'monthly',   label: 'Monthly',                     deploysPerMonth: 1   },
        { value: 'scheduled', label: 'Scheduled release windows',   deploysPerMonth: 0.5 },
      ],
      insight: 'Compared with current frequency to show delivery capacity increase.',
    },
    {
      id: 'releaseHesitation',
      number: 5,
      title: 'Release Confidence',
      question: 'How often were deployments delayed due to risk or coordination concerns?',
      icon: 'fa-solid fa-shield-halved',
      options: [
        { value: 'never',       label: 'Never',         confidenceScore: 100 },
        { value: 'occasionally', label: 'Occasionally', confidenceScore: 80  },
        { value: 'regularly',   label: 'Regularly',     confidenceScore: 50  },
        { value: 'frequently',  label: 'Frequently',    confidenceScore: 25  },
        { value: 'always',      label: 'Almost always', confidenceScore: 5   },
      ],
      insight: 'Combined with current success rate to build a confidence / maturity narrative.',
    },
    {
      id: 'afterHours',
      number: 6,
      title: 'After-Hours Work',
      question: 'Did production deployments typically require after-hours or weekend work?',
      icon: 'fa-solid fa-moon',
      options: [
        { value: 'never',    label: 'Never',         pct: 0   },
        { value: 'sometimes', label: 'Sometimes',    pct: 0.25 },
        { value: 'most',     label: 'Most releases', pct: 0.75 },
        { value: 'every',    label: 'Every release',  pct: 1.0  },
      ],
      insight: 'Converts to operational burden and quality-of-life improvement.',
    },
    {
      id: 'approvalFriction',
      number: 7,
      title: 'Approval Friction',
      question: 'Was there a waiting period between "ready to release" and "allowed to release"?',
      icon: 'fa-solid fa-hourglass-half',
      options: [
        { value: 'none',      label: 'No wait',                  waitHours: 0    },
        { value: 'under1hr',  label: '< 1 hour',                 waitHours: 0.5  },
        { value: 'sameday',   label: 'Same day',                 waitHours: 4    },
        { value: 'days',      label: 'Days',                     waitHours: 48   },
        { value: 'windows',   label: 'Scheduled change windows', waitHours: 168  },
      ],
      insight: 'Converts into lead-time improvement and business responsiveness.',
    },
  ];

  // ---- State ----
  let _currentStep = 0;
  let _answers = {};
  let _modalEl = null;
  let _onComplete = null;

  // ---- localStorage ----

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function save(answers) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function hasAnswers() {
    const data = load();
    return data !== null && Object.keys(data).length > 0;
  }

  function getAnswers() {
    return load() || {};
  }

  // ---- Modal Wizard UI ----

  function open(onComplete) {
    _onComplete = onComplete;
    _answers = load() || {};
    _currentStep = 0;
    _createModal();
    _renderStep();
    // Animate in
    requestAnimationFrame(() => {
      _modalEl.classList.add('visible');
    });
  }

  function close() {
    if (_modalEl) {
      _modalEl.classList.remove('visible');
      setTimeout(() => {
        _modalEl.remove();
        _modalEl = null;
      }, 300);
    }
  }

  function _createModal() {
    // Remove existing if any
    const existing = document.getElementById('onboarding-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-modal';
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-header">
          <div class="onboarding-progress"></div>
          <button class="onboarding-close" title="Skip for now">&times;</button>
        </div>
        <div class="onboarding-body"></div>
        <div class="onboarding-footer"></div>
      </div>
    `;

    // Close on overlay click or X button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _handleSkip();
    });
    overlay.querySelector('.onboarding-close').addEventListener('click', _handleSkip);

    document.body.appendChild(overlay);
    _modalEl = overlay;
  }

  function _renderStep() {
    if (!_modalEl) return;

    if (_currentStep >= QUESTIONS.length) {
      _renderComplete();
      return;
    }

    const q = QUESTIONS[_currentStep];
    const body = _modalEl.querySelector('.onboarding-body');
    const footer = _modalEl.querySelector('.onboarding-footer');
    const progress = _modalEl.querySelector('.onboarding-progress');

    // Progress dots
    progress.innerHTML = QUESTIONS.map((_, i) => {
      const cls = i < _currentStep ? 'done' : i === _currentStep ? 'active' : '';
      return `<div class="progress-dot ${cls}"></div>`;
    }).join('');

    // Question body
    const selectedValue = _answers[q.id] || null;

    body.innerHTML = `
      <div class="onboarding-question" data-step="${_currentStep}">
        <div class="onboarding-icon"><i class="${q.icon}"></i></div>
        <div class="onboarding-step-label">Question ${q.number} of ${QUESTIONS.length}</div>
        <h2 class="onboarding-title">${q.title}</h2>
        <p class="onboarding-text">${q.question}</p>
        <div class="onboarding-options">
          ${q.options.map(opt => `
            <button class="onboarding-option ${selectedValue === opt.value ? 'selected' : ''}" data-value="${opt.value}">
              <span class="option-radio ${selectedValue === opt.value ? 'checked' : ''}"></span>
              <span class="option-label">${opt.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="onboarding-insight">
          <i class="fa-solid fa-lightbulb"></i>
          ${q.insight}
        </div>
      </div>
    `;

    // Option click handlers
    body.querySelectorAll('.onboarding-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        _answers[q.id] = value;
        // Update visual state
        body.querySelectorAll('.onboarding-option').forEach(b => b.classList.remove('selected'));
        body.querySelectorAll('.option-radio').forEach(r => r.classList.remove('checked'));
        btn.classList.add('selected');
        btn.querySelector('.option-radio').classList.add('checked');
        // Auto-advance after a short delay
        setTimeout(() => {
          _currentStep++;
          _renderStep();
        }, 300);
      });
    });

    // Footer
    footer.innerHTML = `
      <div class="onboarding-footer-left">
        ${_currentStep > 0 ? `<button class="btn btn-secondary btn-sm onb-back"><i class="fa-solid fa-arrow-left"></i> Back</button>` : ''}
      </div>
      <div class="onboarding-footer-right">
        <button class="btn btn-secondary btn-sm onb-skip">Skip for now</button>
        ${selectedValue ? `<button class="btn btn-loud btn-sm onb-next">Next <i class="fa-solid fa-arrow-right"></i></button>` : ''}
      </div>
    `;

    // Footer handlers
    const backBtn = footer.querySelector('.onb-back');
    const skipBtn = footer.querySelector('.onb-skip');
    const nextBtn = footer.querySelector('.onb-next');

    if (backBtn) backBtn.addEventListener('click', () => { _currentStep--; _renderStep(); });
    if (skipBtn) skipBtn.addEventListener('click', _handleSkip);
    if (nextBtn) nextBtn.addEventListener('click', () => { _currentStep++; _renderStep(); });
  }

  function _renderComplete() {
    const body = _modalEl.querySelector('.onboarding-body');
    const footer = _modalEl.querySelector('.onboarding-footer');
    const progress = _modalEl.querySelector('.onboarding-progress');

    progress.innerHTML = QUESTIONS.map(() => `<div class="progress-dot done"></div>`).join('');

    const answeredCount = Object.keys(_answers).length;

    body.innerHTML = `
      <div class="onboarding-complete">
        <div class="onboarding-icon success"><i class="fa-solid fa-check-circle"></i></div>
        <h2 class="onboarding-title">You're all set!</h2>
        <p class="onboarding-text">
          ${answeredCount === QUESTIONS.length 
            ? 'All questions answered. Your dashboard will now show personalised value metrics based on your organisation\'s context.'
            : `${answeredCount} of ${QUESTIONS.length} questions answered. You can update your answers anytime from Settings.`
          }
        </p>
        <div class="onboarding-value-preview">
          <div class="value-preview-item">
            <i class="fa-solid fa-coins"></i>
            <span>Engineering cost savings</span>
          </div>
          <div class="value-preview-item">
            <i class="fa-solid fa-bolt"></i>
            <span>Delivery throughput gains</span>
          </div>
          <div class="value-preview-item">
            <i class="fa-solid fa-shield-halved"></i>
            <span>Risk & incident reduction</span>
          </div>
          <div class="value-preview-item">
            <i class="fa-solid fa-heart"></i>
            <span>Quality of life improvements</span>
          </div>
        </div>
      </div>
    `;

    footer.innerHTML = `
      <div class="onboarding-footer-left">
        <button class="btn btn-secondary btn-sm onb-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
      </div>
      <div class="onboarding-footer-right">
        <button class="btn btn-loud btn-sm onb-done"><i class="fa-solid fa-rocket"></i> Show my dashboard</button>
      </div>
    `;

    footer.querySelector('.onb-back').addEventListener('click', () => { _currentStep--; _renderStep(); });
    footer.querySelector('.onb-done').addEventListener('click', () => {
      save(_answers);
      close();
      if (_onComplete) _onComplete(_answers);
    });
  }

  function _handleSkip() {
    // Save whatever we have so far (even partial)
    if (Object.keys(_answers).length > 0) {
      save(_answers);
    }
    close();
    if (_onComplete) _onComplete(Object.keys(_answers).length > 0 ? _answers : null);
  }

  // ---- Value Calculator ----

  /**
   * Takes raw API metrics + onboarding answers and returns executive-friendly
   * value calculations.
   * 
   * @param {Object} metrics - from DashboardData.getSummary()
   * @param {Object} answers - from Onboarding.getAnswers()  (may be partial)
   * @returns {Object|null} - value calculations, or null if no answers
   */
  function calculateValue(metrics, answers) {
    if (!answers || Object.keys(answers).length === 0) return null;

    const kpi = metrics.kpi;
    const totalDeploys = kpi.totalDeployments || 0;
    const successRate = (kpi.successRate || 0) / 100;
    const failedDeploys = metrics.failedCount || 0;
    const currentFreqPerDay = parseFloat(kpi.deployFrequency) || 0;
    const currentFreqPerMonth = currentFreqPerDay * 30;

    // Average hourly rate assumption (can be configurable later)
    const HOURLY_RATE = 85; // USD, blended engineering rate

    // Look up numeric values from answers
    const effort = _lookupOption('deployEffort', answers.deployEffort);
    const people = _lookupOption('peopleInvolved', answers.peopleInvolved);
    const recovery = _lookupOption('failureRecovery', answers.failureRecovery);
    const cadence = _lookupOption('releaseCadence', answers.releaseCadence);
    const hesitation = _lookupOption('releaseHesitation', answers.releaseHesitation);
    const afterHrs = _lookupOption('afterHours', answers.afterHours);
    const approval = _lookupOption('approvalFriction', answers.approvalFriction);

    const value = {};

    // 1. Engineering Time Saved
    if (effort && people) {
      const minutesPerDeploy = effort.minutes || 0;
      const heads = people.headcount || 1;
      // Assume automated deploys take ~2 minutes of human time (click deploy + verify)
      const savedMinutesPerDeploy = Math.max(0, minutesPerDeploy - 2);
      const totalHoursSaved = (totalDeploys * savedMinutesPerDeploy * heads) / 60;
      const costSaved = totalHoursSaved * HOURLY_RATE;

      value.engineeringHoursSaved = Math.round(totalHoursSaved);
      value.engineeringCostSaved = Math.round(costSaved);
      value.hoursPerDeploy = minutesPerDeploy;
      value.peoplePerDeploy = heads;
      value.hourlyRate = HOURLY_RATE;

      // Working days equivalent (8hr days)
      value.workingDaysSaved = Math.round(totalHoursSaved / 8);
    }

    // 2. Incident Impact Reduction
    if (recovery) {
      const recoveryHoursBefore = recovery.hours || 0;
      // Assume automated rollback / recovery is ~10 minutes
      const recoveryHoursNow = 0.17;
      const hoursAvoided = failedDeploys * (recoveryHoursBefore - recoveryHoursNow);
      value.incidentHoursAvoided = Math.round(Math.max(0, hoursAvoided));
      value.incidentCostAvoided = Math.round(Math.max(0, hoursAvoided) * HOURLY_RATE * (people?.headcount || 2));
      value.recoveryTimeBefore = recoveryHoursBefore;
    }

    // 3. Delivery Throughput Increase
    if (cadence) {
      const oldFreqPerMonth = cadence.deploysPerMonth || 1;
      const throughputMultiplier = currentFreqPerMonth > 0 && oldFreqPerMonth > 0
        ? currentFreqPerMonth / oldFreqPerMonth
        : 0;
      value.throughputMultiplier = Math.round(throughputMultiplier * 10) / 10;
      value.oldCadenceLabel = _lookupOption('releaseCadence', answers.releaseCadence)?.label || '';
      value.currentDeploysPerMonth = Math.round(currentFreqPerMonth);
      value.oldDeploysPerMonth = oldFreqPerMonth;
    }

    // 4. Release Confidence / Maturity
    if (hesitation) {
      const oldConfidence = hesitation.confidenceScore || 50;
      // Current confidence: derived from success rate
      const currentConfidence = Math.round(successRate * 100);
      value.confidenceBefore = oldConfidence;
      value.confidenceNow = currentConfidence;
      value.confidenceImprovement = Math.max(0, currentConfidence - oldConfidence);
    }

    // 5. After-Hours Burden Removed
    if (afterHrs && effort) {
      const afterHoursPct = afterHrs.pct || 0;
      const minutesPerDeploy = effort.minutes || 0;
      const afterHoursRemoved = (totalDeploys * afterHoursPct * minutesPerDeploy) / 60;
      value.afterHoursRemoved = Math.round(afterHoursRemoved);
      value.afterHoursPctBefore = Math.round(afterHoursPct * 100);
    }

    // 6. Lead Time Improvement
    if (approval) {
      const waitBefore = approval.waitHours || 0;
      // With automation, assume < 5 minutes approval/trigger time
      value.leadTimeReduction = Math.round(Math.max(0, waitBefore - 0.083));
      value.waitBefore = waitBefore;
      value.waitBeforeLabel = approval.label || '';
    }

    // 7. Aggregate "headline" value
    value.totalCostSaved = (value.engineeringCostSaved || 0) + (value.incidentCostAvoided || 0);
    value.hasData = Object.keys(value).length > 3; // Has at least some real calcs

    return value;
  }

  function _lookupOption(questionId, answerValue) {
    if (!answerValue) return null;
    const q = QUESTIONS.find(q => q.id === questionId);
    if (!q) return null;
    return q.options.find(o => o.value === answerValue) || null;
  }

  // ---- Public API ----

  return {
    QUESTIONS,
    open,
    close,
    hasAnswers,
    getAnswers,
    save,
    clear,
    calculateValue,
  };

})();
