(() => {
  'use strict';

  const HOTFIX_VERSION = '1.1.3';
  const MEDIA = window.QCTP_NEURAL_AUDIO;
  if (!MEDIA) return;

  state.settings.neuralVoice = 'chill-brian';
  state.settings.neuralEnabled = true;

  const neuralPlayer = new Audio();
  let neuralRole = 'idle';
  let neuralToken = 0;
  let pausedNeuralTime = null;
  let preloaders = [];
  let silentUrl = null;

  function silentWavUrl() {
    if (silentUrl) return silentUrl;
    const rate = 8000;
    const samples = rate * 2;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples * 2, true);
    silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    return silentUrl;
  }

  function setVolume() {
    neuralPlayer.volume = Math.max(0, Math.min(1, Number(state.settings.volume) || 1));
  }

  function stopNeural(reset = true) {
    neuralToken += 1;
    neuralPlayer.onended = null;
    neuralPlayer.onerror = null;
    neuralPlayer.pause();
    if (reset) { try { neuralPlayer.currentTime = 0; } catch (_) {} }
    neuralRole = 'idle';
    pausedNeuralTime = null;
  }

  async function playNeural(url, role, options = {}) {
    const token = ++neuralToken;
    neuralPlayer.onended = null;
    neuralPlayer.onerror = null;
    neuralPlayer.pause();
    neuralPlayer.loop = Boolean(options.loop);
    neuralPlayer.src = url;
    setVolume();
    neuralRole = role;
    neuralPlayer.onended = () => { if (token === neuralToken) options.onended?.(); };
    neuralPlayer.onerror = () => {
      if (token !== neuralToken) return;
      const cue = document.querySelector('#cue');
      if (cue) cue.textContent = 'Chill Brian audio could not load. Check the connection, then restart this section.';
      if (runner && !runner.paused) pauseRunner();
      options.onerror?.();
    };
    try {
      await neuralPlayer.play();
      return true;
    } catch (_) {
      const cue = document.querySelector('#cue');
      if (cue) cue.textContent = 'Tap Play once to authorize neural audio on this device.';
      options.onerror?.();
      return false;
    }
  }

  function playSilenceKeeper() {
    if (runner && !runner.paused) playNeural(silentWavUrl(), 'silence', { loop: true });
  }

  function preloadNeural() {
    if (preloaders.length) return;
    preloaders = [MEDIA.lesson, MEDIA.preview, ...Object.values(MEDIA.cues)].map(url => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio.load();
      return audio;
    });
  }

  const priorHeader = header;
  header = function headerRev113() {
    return priorHeader().replace(/Rev\s+1\.1\.2/, `Rev ${HOTFIX_VERSION}`);
  };

  settingsScreen = function settingsScreenRev113() {
    return `<section class="card"><button class="backbtn" data-open="more">← More</button><div class="kicker">Settings</div><h1>Audio & practice</h1>
      <div class="neural-panel"><div class="kicker">Production guide selected</div><h2>Chill Brian</h2><p class="lessonp">Day 1 now uses fixed Chill Brian neural narration for the lesson and every meditation cue. Safari system speech is disabled during the released session.</p><button class="bigbtn secondary" id="testAudio">Test Chill Brian + tone</button></div>
      <label>Guidance mode<select id="setMode"><option value="guided">Guided</option><option value="light">Light Guidance</option><option value="minimal">Minimal</option></select></label>
      <label>Guide volume <span class="rangevalue" id="volValue">${Math.round(state.settings.volume * 100)}%</span><input id="vol" type="range" min="0" max="1" step="0.05" value="${state.settings.volume}"></label>
      <label>Tone volume <span class="rangevalue" id="toneValue">${Math.round(state.settings.tone * 100)}%</span><input id="tone" type="range" min="0" max="1" step="0.05" value="${state.settings.tone}"></label>
      <label class="checkrow"><input id="keepAwake" type="checkbox" ${state.settings.keepAwake ? 'checked' : ''}><span>Keep screen awake during audio sessions when supported</span></label>
      <label class="checkrow"><input id="testSetting" type="checkbox" ${state.test ? 'checked' : ''}><span>Accelerated 90-second sequencer test mode</span></label>
      <div class="row"><button class="smallbtn" id="preloadAudio">Preload Day 1 audio</button><button class="smallbtn danger" id="resetData">Reset local data</button></div>
      <div class="safe">The current neural files require an internet connection. Never begin altered-state practice while driving, operating machinery, using ladders, in water, or anywhere reduced ordinary attention could create danger.</div>
    </section>`;
  };

  const priorBind = bind;
  bind = function bindRev113() {
    priorBind();
    const mode = document.querySelector('#setMode');
    if (mode) { mode.value = state.settings.mode; mode.onchange = e => { state.settings.mode = e.currentTarget.value; save(); }; }
    const volume = document.querySelector('#vol');
    if (volume) volume.oninput = e => {
      state.settings.volume = Number(e.currentTarget.value); setVolume();
      document.querySelector('#volValue').textContent = `${Math.round(state.settings.volume * 100)}%`; save();
    };
    const tone = document.querySelector('#tone');
    if (tone) tone.oninput = e => {
      state.settings.tone = Number(e.currentTarget.value);
      document.querySelector('#toneValue').textContent = `${Math.round(state.settings.tone * 100)}%`; save();
    };
    const wake = document.querySelector('#keepAwake');
    if (wake) wake.onchange = e => { state.settings.keepAwake = e.currentTarget.checked; save(); };
    const test = document.querySelector('#testSetting');
    if (test) test.onchange = e => { state.test = e.currentTarget.checked; save(); };
    const preload = document.querySelector('#preloadAudio');
    if (preload) preload.onclick = () => { preloadNeural(); preload.textContent = 'Preloading started'; };
  };

  testAudio = async function testAudioRev113() {
    cancelSpeech(); preloadNeural(); await prepareAudioSession(); playTone();
    window.setTimeout(() => playNeural(MEDIA.preview, 'preview'), 250);
  };

  beginToday = function beginTodayRev113() {
    cancelSpeech(); preloadNeural(); ensureAudioContext(); void requestWakeLock();
    view = 'lesson'; render(); playLesson(true);
  };

  playLesson = function playLessonRev113(autoStartPractice) {
    if (lessonPlaying) return;
    cancelSpeech(); preloadNeural(); lessonPlaying = true; render();
    playNeural(MEDIA.lesson, 'lesson', {
      onended: () => {
        lessonPlaying = false;
        if (autoStartPractice) { view = 'practice'; render(); window.setTimeout(() => startRunner(true), 300); }
        else render();
      },
      onerror: () => { lessonPlaying = false; render(); }
    });
  };

  stopLesson = function stopLessonRev113() {
    lessonPlaying = false;
    if (neuralRole === 'lesson' || neuralRole === 'preview') stopNeural();
    cancelSpeech(); releaseWakeLock(); render();
  };

  fireCue = function fireCueRev113(cue) {
    if (!runner) return;
    runner.phase = cue.phase; runner.cue = cue.text;
    const phase = document.querySelector('#phase'); const text = document.querySelector('#cue');
    if (phase) phase.textContent = cue.phase; if (text) text.textContent = cue.text;
    if (cue.tone) playTone(); cancelSpeech();
    if (state.test) return;
    const url = MEDIA.cues[cue.at];
    if (url) playNeural(url, 'cue', { onended: () => { if (runner && !runner.paused) playSilenceKeeper(); } });
  };

  const priorStartRunner = startRunner;
  startRunner = async function startRunnerRev113(restart = false) {
    stopNeural(); cancelSpeech(); preloadNeural(); await priorStartRunner(restart);
    if (runner && neuralRole !== 'cue') playSilenceKeeper();
  };

  pauseRunner = async function pauseRunnerRev113() {
    if (!runner || runner.paused) return;
    runner.elapsedBeforePause = getElapsed(); runner.paused = true;
    window.clearInterval(runner.interval); runner.interval = null;
    pausedNeuralTime = neuralRole === 'cue' && !neuralPlayer.paused ? neuralPlayer.currentTime : null;
    neuralPlayer.pause(); cancelSpeech(); renderPracticeDynamic();
  };

  resumeRunner = async function resumeRunnerRev113() {
    if (!runner || !runner.paused) return;
    await prepareAudioSession(); runner.paused = false; runner.startedAt = performance.now();
    runner.interval = window.setInterval(tickRunner, 200); playTone();
    if (pausedNeuralTime !== null && neuralRole === 'cue') {
      try { neuralPlayer.currentTime = pausedNeuralTime; await neuralPlayer.play(); } catch (_) { playSilenceKeeper(); }
      pausedNeuralTime = null;
    } else playSilenceKeeper();
    renderPracticeDynamic();
  };

  stopRunner = function stopRunnerRev113(release = true) {
    if (runner?.interval) window.clearInterval(runner.interval);
    runner = null; stopNeural(); cancelSpeech(); if (release) releaseWakeLock();
  };

  finishRunner = function finishRunnerRev113() {
    if (!runner) return;
    const wasTest = state.test;
    if (runner.interval) window.clearInterval(runner.interval);
    runner.interval = null; runner.paused = true; runner.elapsedBeforePause = runner.total;
    stopNeural(); cancelSpeech(); playTone();
    if (!wasTest) { state.done[1] = state.done[1] || {}; state.done[1].morning = true; save(); }
    const phase = document.querySelector('#phase'); const cue = document.querySelector('#cue'); const play = document.querySelector('#play');
    if (phase) phase.textContent = 'Complete';
    if (cue) cue.textContent = wasTest ? 'The 90-second sequencer verification completed.' : 'Day 1 morning practice completed and was saved.';
    if (play) play.textContent = 'Done';
    updatePracticeClock(runner.total); releaseWakeLock();
  };

  const style = document.createElement('style');
  style.textContent = '.neural-panel{margin:12px 0 20px;padding:16px;border:1px solid #38507a;border-radius:16px;background:#0b1320}.neural-panel h2{margin:5px 0 8px}';
  document.head.appendChild(style);

  cancelSpeech(); preloadNeural(); save(); render();
})();
