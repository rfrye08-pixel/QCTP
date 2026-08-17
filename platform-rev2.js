(() => {
  'use strict';

  const PLATFORM_VERSION = '2.0.0-alpha.1';
  const REG_MODULES = [
    'Learn to See',
    'Circle, Vesica, and Polarity',
    'Flower and Nested Geometry',
    'Cuboctahedron and Metatron Structures',
    'Perspective and Mirror Reflections',
    'Number Origins and Mathematical Constants',
    'The Quadrivium',
    'Sound, Rhythm, and Harmonic Geometry',
    'Mirror of Consciousness',
    '24 Precepts in Daily Life',
    'Auto-Dictation and Creative Reception',
    'Personal Codex Synthesis'
  ];

  const REG01_STEPS = [
    'Enter the studio state: sit upright, take three coherence breaths, soften the gaze, and observe the blank page as a field.',
    'Mark one center point. Set one compass radius and do not change it during the construction.',
    'Draw one circle slowly. Draw horizontal and vertical diameters through its center.',
    'Place the compass point on the first circle boundary and draw a second equal circle through the original center.',
    'Identify both centers, the two circle intersections, their shared chord, the overlap, and any visible construction error.',
    'Repeat the construction once on a second sheet, deliberately improving precision and reducing unnecessary body tension.',
    'Record only visible or measurable observations before adding meaning or symbolism.',
    'Complete five minutes of uninterrupted auto-dictation, then preserve the raw entry without editing it.',
    'Underline one useful sentence, choose one practical application, photograph the construction, and save the session.'
  ];

  const REG01_PROMPT = 'What did the act of constructing reveal that looking at a finished image would not have revealed?';

  function platformDefaults() {
    return {
      schema: 'qctp-platform-state-v2',
      paths: {
        foundation: { active: true },
        grant: { active: true, currentModule: 1, completedModules: [] }
      },
      reg01: {
        startedAt: null,
        completedAt: null,
        steps: {},
        observation: '',
        interpretation: '',
        autoDictation: '',
        integrationAction: '',
        photo: '',
        preceptComplete: false
      },
      codex: [],
      mirrorEntries: [],
      studioSessions: [],
      labProtocols: []
    };
  }

  const defaults = platformDefaults();
  state.platform = state.platform && typeof state.platform === 'object' ? state.platform : defaults;
  state.platform.paths = { ...defaults.paths, ...(state.platform.paths || {}) };
  state.platform.paths.foundation = { ...defaults.paths.foundation, ...(state.platform.paths.foundation || {}) };
  state.platform.paths.grant = { ...defaults.paths.grant, ...(state.platform.paths.grant || {}) };
  state.platform.reg01 = { ...defaults.reg01, ...(state.platform.reg01 || {}) };
  state.platform.reg01.steps = state.platform.reg01.steps || {};
  state.platform.codex = Array.isArray(state.platform.codex) ? state.platform.codex : [];
  state.platform.mirrorEntries = Array.isArray(state.platform.mirrorEntries) ? state.platform.mirrorEntries : [];
  state.platform.studioSessions = Array.isArray(state.platform.studioSessions) ? state.platform.studioSessions : [];
  state.platform.labProtocols = Array.isArray(state.platform.labProtocols) ? state.platform.labProtocols : [];
  save();

  let dictationTimer = null;
  let dictationRemaining = 0;
  let dictationRunning = false;

  function studioComplete() {
    const r = state.platform.reg01;
    return Boolean(r.completedAt);
  }

  function studioReadiness() {
    const r = state.platform.reg01;
    const checked = REG01_STEPS.filter((_, index) => r.steps[index]).length;
    const textReady = r.observation.trim() && r.autoDictation.trim() && r.integrationAction.trim();
    return { checked, ready: checked === REG01_STEPS.length && Boolean(textReady) };
  }

  function entryId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const priorHeader = header;
  header = function headerRev2Preview() {
    return priorHeader().replace(/Rev\s+[0-9.]+/, `Platform ${PLATFORM_VERSION}`);
  };

  nav = function platformNav() {
    const items = [
      ['today', 'Today'],
      ['paths', 'Paths'],
      ['practice', 'Practice'],
      ['studio', 'Studio'],
      ['more', 'More']
    ];
    const moreViews = new Set(['lesson', 'workbook', 'progress', 'logs', 'settings', 'lab', 'codex', 'mirror']);
    const active = moreViews.has(view) ? 'more' : view;
    return `<div class="nav"><div class="navin platformnav">${items.map(([key, label]) => `<button data-nav="${key}" class="${active === key ? 'active' : ''}">${label}</button>`).join('')}</div></div>`;
  };

  const priorScreen = screen;
  screen = function platformScreen() {
    if (view === 'paths') return pathsScreenRev2();
    if (view === 'studio') return studioScreenRev2();
    if (view === 'lab') return labScreenRev2();
    if (view === 'codex') return codexScreenRev2();
    if (view === 'mirror') return mirrorScreenRev2();
    return priorScreen();
  };

  const priorTodayScreen = todayScreen;
  todayScreen = function todayScreenRev2() {
    const r = state.platform.reg01;
    const status = studioComplete() ? 'Complete' : r.startedAt ? 'In progress' : 'Ready';
    return `${priorTodayScreen()}
      <section class="card platform-card">
        <div class="kicker">QCTP Platform Rev2</div>
        <h2>More than meditation</h2>
        <p class="lessonp">The Foundation Path remains your primary daily progression. QCTP now also contains source tracks, hands-on studio work, controlled experiments, a searchable Codex, mirror work, and longitudinal insights.</p>
        <div class="platform-loop">Learn <span>→</span> Practice <span>→</span> Create <span>→</span> Experiment <span>→</span> Record <span>→</span> Reflect <span>→</span> Integrate</div>
        <button class="smallbtn" data-open="paths">Open Paths</button>
      </section>
      <section class="card platform-card">
        <div class="kicker">Secondary studio assignment</div>
        <h2>Robert Edward Grant · REG-01</h2>
        <p class="lessonp"><b>Learn to See.</b> Construct two equal intersecting circles by hand, separate observation from interpretation, complete an auto-dictation entry, and capture the result in your Codex.</p>
        <div class="component"><div><b>Status</b><div class="muted small">35-minute eyes-open studio session</div></div><span class="status ${studioComplete() ? 'statusdone' : ''}">${status}</span></div>
        <button class="bigbtn secondary" data-open="studio">${r.startedAt && !r.completedAt ? 'Continue REG-01' : studioComplete() ? 'Review REG-01' : 'Begin REG-01'}</button>
      </section>`;
  };

  moreScreen = function moreScreenRev2() {
    const cards = [
      ['lesson', 'Foundation Lesson', 'Read or replay the current released lesson.'],
      ['workbook', 'Workbook', 'Daily calibration, reflection, and integration fields.'],
      ['progress', 'Foundation Progress', 'The controlled 112-day completion-based path.'],
      ['lab', 'Lab', 'Blind protocols, OBE, remote viewing, psionics, dreams, and experiments.'],
      ['codex', 'Codex', 'Searchable personal record of practice, geometry, dreams, and insights.'],
      ['mirror', 'Mirror / Insights', 'Structured self-reflection and future longitudinal pattern analysis.'],
      ['logs', 'Legacy Structured Logs', 'Existing Rev1 exploration records.'],
      ['settings', 'Settings', 'Audio, guidance, wake-lock, and local controls.']
    ];
    return `<section class="card"><div class="kicker">Platform surfaces</div><h1>More</h1><p class="muted">Rev2 preview is isolated from the released app. New surfaces are available here without changing the verified Day 1 sequence.</p>${cards.map(([target, title, description]) => `<button class="surface-link" data-open="${target}"><span><b>${title}</b><small>${description}</small></span><span>›</span></button>`).join('')}</section>`;
  };

  function pathsScreenRev2() {
    const grant = state.platform.paths.grant;
    return `<section class="card"><div class="kicker">Paths</div><h1>Training architecture</h1><p class="lessonp">One primary Foundation Path can run beside source-specific and skill-specific paths. Progress follows completed work, never the calendar alone.</p></section>
      <section class="card path-card active-path"><div class="path-head"><div><div class="kicker">Primary path</div><h2>112-Day Foundation</h2></div><span class="status">Day ${state.currentDay}</span></div><p class="lessonp">Attention, coherence, Gap, elevated emotion, intention, embodiment, energy centers, OBE, remote viewing, psionics, dreams, group practice, and living in the field.</p><button class="smallbtn" data-open="today">Return to Today</button></section>
      <section class="card path-card"><div class="path-head"><div><div class="kicker">Source track</div><h2>Robert Edward Grant</h2></div><span class="status ${studioComplete() ? 'statusdone' : ''}">Module ${grant.currentModule} / 12</span></div><p class="lessonp">Geometry, number, the Quadrivium, harmonics, mirror-consciousness, precepts, auto-dictation, symbolic patterning, and polymathic synthesis.</p>${REG_MODULES.map((name, index) => {
        const number = index + 1;
        const done = grant.completedModules.includes(number);
        const current = number === grant.currentModule;
        return `<div class="module-row ${current ? 'current' : ''}"><span>${String(number).padStart(2, '0')}</span><div><b>${name}</b><small>${number === 1 ? 'Released in this preview' : 'Controlled module reserved'}</small></div><span class="status ${done ? 'statusdone' : ''}">${done ? 'Complete' : current ? 'Current' : 'Reserved'}</span></div>`;
      }).join('')}<button class="bigbtn secondary" data-open="studio">Open Grant Studio</button></section>
      <section class="card"><div class="kicker">Other source tracks</div><h2>Integrated, not siloed</h2><div class="tag-cloud">${['Theresa Bullard','Joe Dispenza','HeartMath','Lynne McTaggart','Monroe / Buhlman','Controlled Remote Viewing','Psionics methods'].map(x => `<span class="tag">${x}</span>`).join('')}</div></section>`;
  }

  function geometryDiagram() {
    return `<svg class="geometry-diagram" viewBox="0 0 600 360" role="img" aria-label="Two equal intersecting circles with horizontal and vertical axes"><rect width="600" height="360" rx="18" fill="#09101a"/><line x1="60" y1="180" x2="540" y2="180" stroke="#5e7393" stroke-width="2"/><line x1="240" y1="40" x2="240" y2="320" stroke="#5e7393" stroke-width="2"/><circle cx="240" cy="180" r="120" fill="none" stroke="#87a9ff" stroke-width="4"/><circle cx="360" cy="180" r="120" fill="none" stroke="#7fd7ba" stroke-width="4"/><circle cx="240" cy="180" r="5" fill="#87a9ff"/><circle cx="360" cy="180" r="5" fill="#7fd7ba"/><circle cx="300" cy="76" r="5" fill="#f2c879"/><circle cx="300" cy="284" r="5" fill="#f2c879"/><text x="226" y="205" fill="#b8c7dd" font-size="18">A</text><text x="370" y="205" fill="#b8c7dd" font-size="18">B</text><text x="315" y="66" fill="#f2c879" font-size="16">intersection</text><text x="315" y="306" fill="#f2c879" font-size="16">intersection</text></svg>`;
  }

  function studioScreenRev2() {
    const r = state.platform.reg01;
    const readiness = studioReadiness();
    const timerLabel = dictationRunning || dictationRemaining ? formatStudioTimer(dictationRemaining) : '5:00';
    return `<section class="card"><div class="kicker">Geometry Studio · REG-01-A</div><h1>Learn to See</h1><p class="lessonp">This is an original QCTP exercise inspired by Grant's public geometry-learning framework. The objective is construction, attention, and observation—not reproducing a paid course lesson.</p><div class="row"><div class="metric"><span class="muted">Duration</span><b>35 min</b></div><div class="metric"><span class="muted">Mode</span><b>Eyes open</b></div></div><div class="safe">Use this only while seated at a safe desk or work surface. Do not combine it with driving, cutting, machinery, ladders, or other shop operations.</div></section>
      <section class="card"><div class="kicker">Reference construction</div><h2>Two equal circles</h2>${geometryDiagram()}<p class="footerhint">Keep one compass radius unchanged. The second center lies on the first circle's boundary, so each circle passes through the other's center.</p></section>
      <section class="card"><div class="kicker">Session sequence</div><h2>Complete in order</h2>${REG01_STEPS.map((step, index) => `<label class="studio-step ${r.steps[index] ? 'done' : ''}"><input type="checkbox" data-reg-step="${index}" ${r.steps[index] ? 'checked' : ''}><span><b>${index + 1}</b>${step}</span></label>`).join('')}<div class="progress-note">${readiness.checked} of ${REG01_STEPS.length} phases marked complete.</div></section>
      <section class="card"><div class="kicker">Raw observation</div><h2>Describe before interpreting</h2><p class="muted">Record visible, measurable, or bodily facts only: symmetry, line quality, spacing, intersections, error, body tension, and attention changes.</p><textarea id="regObservation" placeholder="Raw observations only...">${esc(r.observation)}</textarea><div class="kicker interpretation-kicker">Interpretation — separate record</div><textarea id="regInterpretation" placeholder="Meaning, symbolism, hypotheses, or associations belong here...">${esc(r.interpretation)}</textarea></section>
      <section class="card"><div class="kicker">Auto-dictation</div><h2>${REG01_PROMPT}</h2><div class="dictation-clock" id="dictationClock">${timerLabel}</div><div class="row"><button class="smallbtn" id="dictationStart">${dictationRunning ? 'Pause' : dictationRemaining ? 'Resume' : 'Start 5 minutes'}</button><button class="smallbtn" id="dictationReset">Reset</button></div><textarea id="regAuto" placeholder="Write continuously. Do not edit during the timed capture...">${esc(r.autoDictation)}</textarea></section>
      <section class="card"><div class="kicker">Artifact capture</div><h2>Construction record</h2>${r.photo ? `<img class="artifact-photo" src="${r.photo}" alt="Saved REG-01 geometry construction"><button class="smallbtn danger" id="removeRegPhoto">Remove photo</button>` : `<label class="upload-box">Photograph or choose the construction<input id="regPhoto" type="file" accept="image/*" capture="environment"></label>`}<p class="footerhint" id="photoStatus">Images are compressed locally before storage.</p></section>
      <section class="card"><div class="kicker">Integration</div><h2>Carry one result into life</h2><p class="lessonp"><b>QCTP precept:</b> Observe before interpreting.</p><textarea id="regAction" placeholder="One practical application for today...">${esc(r.integrationAction)}</textarea><label class="checkrow"><input id="regPrecept" type="checkbox" ${r.preceptComplete ? 'checked' : ''}><span>I practiced observing before interpreting in at least one real situation.</span></label><div class="row"><button class="smallbtn" id="saveReg01">Save progress</button><button class="bigbtn" id="completeReg01">${studioComplete() ? 'REG-01 Complete' : 'Complete REG-01'}</button></div><p class="footerhint" id="regStatus">${studioComplete() ? `Completed ${new Date(r.completedAt).toLocaleString()}` : readiness.ready ? 'Required session fields are ready for completion.' : 'Finish all phases and required writing before completion.'}</p></section>`;
  }

  function labScreenRev2() {
    const categories = [
      ['OBE / Focus 10', 'State depth, body sleep, hypnagogia, movement, separation, and target checks.'],
      ['Remote Viewing', 'Blind targets, raw descriptors, AOL separation, sketches, feedback, and calibration.'],
      ['Psionics', 'Construct stability, sender/receiver trials, psychometry, and RNG protocols.'],
      ['Dreams / Synchronicity', 'Incubation questions, dream recall, repeated symbols, and later outcomes.'],
      ['Intuition / Reception', 'Prompt, first impression, action taken, and feedback.']
    ];
    return `<section class="card"><div class="kicker">Lab</div><h1>Controlled personal experiments</h1><p class="lessonp">The Lab turns experiences into repeatable protocols. Define the target, method, duration, and scoring before seeing results. Preserve raw data before interpretation.</p><div class="safe">Full blind-target and scoring tools are scheduled for a later Rev2 deliverable. Existing structured logs remain available now.</div>${categories.map(([name, description]) => `<div class="week"><b>${name}</b><div class="muted">${description}</div></div>`).join('')}<button class="bigbtn secondary" data-open="logs">Open Existing Structured Logs</button></section>`;
  }

  function codexScreenRev2() {
    const entries = state.platform.codex.slice().reverse();
    const legacyCount = Array.isArray(state.logs) ? state.logs.length : 0;
    return `<section class="card"><div class="kicker">Codex</div><h1>Your working body of knowledge</h1><p class="lessonp">The Codex preserves geometry, auto-dictation, dreams, experiments, source notes, interpretations, and later revisions. Raw entries are never silently replaced by reflections.</p><div class="row"><div class="metric"><span class="muted">Rev2 entries</span><b>${entries.length}</b></div><div class="metric"><span class="muted">Legacy logs</span><b>${legacyCount}</b></div></div></section>${entries.length ? entries.map(entry => `<section class="card codex-entry"><div class="kicker">${esc(entry.type)}</div><h2>${esc(entry.title)}</h2><div class="muted small">${new Date(entry.timestamp).toLocaleString()}</div>${entry.photo ? `<img class="artifact-photo" src="${entry.photo}" alt="Codex artifact">` : ''}<h3>Raw observation</h3><p class="entry-text">${esc(entry.observation || entry.raw || '').replace(/\n/g, '<br>')}</p>${entry.interpretation ? `<h3>Interpretation</h3><p class="entry-text">${esc(entry.interpretation).replace(/\n/g, '<br>')}</p>` : ''}${entry.action ? `<h3>Integration action</h3><p class="entry-text">${esc(entry.action)}</p>` : ''}</section>`).join('') : `<section class="card"><div class="safe">No Rev2 Codex entries yet. Completing REG-01 creates the first geometry and auto-dictation record.</div></section>`}`;
  }

  function mirrorScreenRev2() {
    const entries = state.platform.mirrorEntries.slice().reverse();
    return `<section class="card"><div class="kicker">Mirror / Insights</div><h1>Observe the observer</h1><p class="lessonp">Capture the event and immediate reaction first. Interpretation remains provisional. The future AI Mirror will cite the underlying entries rather than overwrite them.</p><label>Event<textarea id="mirrorEvent" placeholder="What happened, in observable terms?"></textarea></label><label>Immediate emotion or body state<textarea id="mirrorEmotion" placeholder="Emotion, body contraction, urge, or energy shift..."></textarea></label><label>Judgment or story<textarea id="mirrorJudgment" placeholder="What did your mind immediately conclude?"></textarea></label><label>Quality admired or rejected<textarea id="mirrorQuality" placeholder="What quality in the other person or situation stands out?"></textarea></label><label>Possible self-reflection<textarea id="mirrorReflection" placeholder="Where might this quality or pattern exist in you, perhaps in a different form?"></textarea></label><label>Alternative interpretation<textarea id="mirrorAlternative" placeholder="What else could be true?"></textarea></label><label>Chosen action<textarea id="mirrorAction" placeholder="One response that aligns with your intended state..."></textarea></label><button class="bigbtn" id="saveMirror">Save Mirror Entry</button><p class="footerhint" id="mirrorStatus">Raw event, reaction, and interpretation are stored as distinct fields.</p></section>${entries.slice(0, 5).map(entry => `<section class="card"><div class="kicker">Mirror entry</div><div class="muted small">${new Date(entry.timestamp).toLocaleString()}</div><h3>Event</h3><p class="entry-text">${esc(entry.event)}</p><h3>Reflection</h3><p class="entry-text">${esc(entry.reflection || 'Not yet interpreted')}</p><h3>Action</h3><p class="entry-text">${esc(entry.action || 'No action recorded')}</p></section>`).join('')}`;
  }

  function formatStudioTimer(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function updateDictationClock() {
    const clock = document.querySelector('#dictationClock');
    if (clock) clock.textContent = formatStudioTimer(dictationRemaining);
    const button = document.querySelector('#dictationStart');
    if (button) button.textContent = dictationRunning ? 'Pause' : dictationRemaining ? 'Resume' : 'Start 5 minutes';
  }

  function startDictationTimer() {
    if (dictationRunning) {
      window.clearInterval(dictationTimer);
      dictationTimer = null;
      dictationRunning = false;
      updateDictationClock();
      return;
    }
    if (!dictationRemaining) dictationRemaining = 300;
    dictationRunning = true;
    const started = Date.now();
    const startingRemaining = dictationRemaining;
    dictationTimer = window.setInterval(() => {
      dictationRemaining = Math.max(0, startingRemaining - (Date.now() - started) / 1000);
      updateDictationClock();
      if (dictationRemaining <= 0) {
        window.clearInterval(dictationTimer);
        dictationTimer = null;
        dictationRunning = false;
        playTone();
        updateDictationClock();
      }
    }, 250);
    updateDictationClock();
  }

  function resetDictationTimer() {
    if (dictationTimer) window.clearInterval(dictationTimer);
    dictationTimer = null;
    dictationRunning = false;
    dictationRemaining = 0;
    updateDictationClock();
  }

  function saveRegFields() {
    const r = state.platform.reg01;
    const observation = document.querySelector('#regObservation');
    const interpretation = document.querySelector('#regInterpretation');
    const auto = document.querySelector('#regAuto');
    const action = document.querySelector('#regAction');
    const precept = document.querySelector('#regPrecept');
    if (observation) r.observation = observation.value;
    if (interpretation) r.interpretation = interpretation.value;
    if (auto) r.autoDictation = auto.value;
    if (action) r.integrationAction = action.value;
    if (precept) r.preceptComplete = precept.checked;
    r.startedAt = r.startedAt || new Date().toISOString();
    save();
  }

  function completeReg01() {
    saveRegFields();
    const readiness = studioReadiness();
    const status = document.querySelector('#regStatus');
    if (!readiness.ready) {
      if (status) status.textContent = `Completion held: ${readiness.checked}/${REG01_STEPS.length} phases marked, and raw observation, auto-dictation, and integration action are required.`;
      return;
    }
    const r = state.platform.reg01;
    r.completedAt = r.completedAt || new Date().toISOString();
    if (!state.platform.paths.grant.completedModules.includes(1)) state.platform.paths.grant.completedModules.push(1);
    state.platform.paths.grant.currentModule = Math.max(2, state.platform.paths.grant.currentModule);
    const existing = state.platform.codex.find(entry => entry.sourceId === 'REG-01-A');
    const record = {
      id: existing?.id || entryId('codex'),
      sourceId: 'REG-01-A',
      type: 'Geometry Studio',
      title: 'Learn to See — Two Equal Circles',
      timestamp: r.completedAt,
      observation: r.observation,
      interpretation: r.interpretation,
      raw: r.autoDictation,
      action: r.integrationAction,
      photo: r.photo
    };
    if (existing) Object.assign(existing, record);
    else state.platform.codex.push(record);
    save();
    render();
  }

  async function compressPhoto(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    const max = 1200;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  const priorBind = bind;
  bind = function bindRev2() {
    priorBind();

    document.querySelectorAll('[data-reg-step]').forEach(input => {
      input.onchange = event => {
        state.platform.reg01.steps[event.currentTarget.dataset.regStep] = event.currentTarget.checked;
        state.platform.reg01.startedAt = state.platform.reg01.startedAt || new Date().toISOString();
        save();
        event.currentTarget.closest('.studio-step')?.classList.toggle('done', event.currentTarget.checked);
      };
    });

    const saveButton = document.querySelector('#saveReg01');
    if (saveButton) saveButton.onclick = () => { saveRegFields(); saveButton.textContent = 'Saved'; };
    const completeButton = document.querySelector('#completeReg01');
    if (completeButton) completeButton.onclick = completeReg01;
    const startButton = document.querySelector('#dictationStart');
    if (startButton) startButton.onclick = startDictationTimer;
    const resetButton = document.querySelector('#dictationReset');
    if (resetButton) resetButton.onclick = resetDictationTimer;

    const photoInput = document.querySelector('#regPhoto');
    if (photoInput) photoInput.onchange = async event => {
      const status = document.querySelector('#photoStatus');
      try {
        if (status) status.textContent = 'Compressing image locally...';
        state.platform.reg01.photo = await compressPhoto(event.currentTarget.files?.[0]);
        state.platform.reg01.startedAt = state.platform.reg01.startedAt || new Date().toISOString();
        save();
        render();
      } catch (error) {
        if (status) status.textContent = error?.message || 'Photo could not be stored.';
      }
    };
    const removePhoto = document.querySelector('#removeRegPhoto');
    if (removePhoto) removePhoto.onclick = () => { state.platform.reg01.photo = ''; save(); render(); };

    const mirrorSave = document.querySelector('#saveMirror');
    if (mirrorSave) mirrorSave.onclick = () => {
      const get = id => document.querySelector(id)?.value.trim() || '';
      const entry = {
        id: entryId('mirror'),
        timestamp: new Date().toISOString(),
        event: get('#mirrorEvent'),
        emotion: get('#mirrorEmotion'),
        judgment: get('#mirrorJudgment'),
        quality: get('#mirrorQuality'),
        reflection: get('#mirrorReflection'),
        alternative: get('#mirrorAlternative'),
        action: get('#mirrorAction')
      };
      const status = document.querySelector('#mirrorStatus');
      if (!entry.event || !entry.emotion) {
        if (status) status.textContent = 'Event and immediate emotion/body state are required.';
        return;
      }
      state.platform.mirrorEntries.push(entry);
      state.platform.codex.push({
        id: entryId('codex'),
        sourceId: entry.id,
        type: 'Mirror Journal',
        title: entry.quality ? `Mirror — ${entry.quality}` : 'Mirror Entry',
        timestamp: entry.timestamp,
        observation: `${entry.event}\n\nImmediate state: ${entry.emotion}\n\nJudgment/story: ${entry.judgment}`,
        interpretation: `${entry.reflection}\n\nAlternative: ${entry.alternative}`,
        action: entry.action
      });
      save();
      render();
    };
  };

  const style = document.createElement('style');
  style.textContent = `
    .platformnav{grid-template-columns:repeat(5,1fr)}
    .platform-card{border-color:#304b72}
    .platform-loop{padding:12px;margin:12px 0;border:1px solid var(--line);border-radius:14px;background:#0b121c;color:#cbd8ea;line-height:1.8;font-size:13px;text-align:center}.platform-loop span{color:var(--accent);padding:0 3px}
    .surface-link{width:100%;display:flex;align-items:center;justify-content:space-between;text-align:left;padding:15px 12px;margin:8px 0;border:1px solid var(--line);border-radius:14px;background:#0d131d;color:var(--text)}.surface-link span:first-child{display:flex;flex-direction:column;gap:3px}.surface-link small{color:var(--muted);font-size:12px;font-weight:400}
    .path-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.path-head h2{margin:4px 0}.active-path{border-color:#3c648e}
    .module-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}.module-row>span:first-child{font-variant-numeric:tabular-nums;color:var(--muted)}.module-row div{display:flex;flex-direction:column}.module-row small{color:var(--muted);margin-top:3px}.module-row.current{background:#111b29;margin:0 -8px;padding:11px 8px;border-radius:10px}.tag-cloud{display:flex;flex-wrap:wrap;gap:8px}.tag-cloud .tag{margin:0}
    .geometry-diagram{width:100%;height:auto;border:1px solid var(--line);border-radius:16px;margin:8px 0 4px}
    .studio-step{display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-top:1px solid var(--line);line-height:1.45}.studio-step input{width:22px;height:22px;flex:0 0 auto;margin:2px 0}.studio-step span{display:grid;grid-template-columns:30px 1fr;gap:8px}.studio-step span b{color:var(--accent)}.studio-step.done{color:#a9b8c9}.studio-step.done span{opacity:.75}.progress-note{margin-top:12px;color:var(--muted);font-size:13px}
    .interpretation-kicker{margin-top:18px}.dictation-clock{font-size:48px;font-variant-numeric:tabular-nums;text-align:center;padding:15px;color:var(--accent)}
    .upload-box{display:block;padding:24px;border:1px dashed #4b607e;border-radius:16px;text-align:center;color:var(--muted);background:#0c121b}.upload-box input{margin-top:12px}.artifact-photo{display:block;width:100%;height:auto;max-height:520px;object-fit:contain;border-radius:14px;border:1px solid var(--line);margin:12px 0;background:#06090d}
    .codex-entry h3{margin-bottom:5px}.entry-text{line-height:1.55;color:#d8e0e9;white-space:normal}
  `;
  document.head.appendChild(style);

  save();
  render();
})();
