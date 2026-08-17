(() => {
  'use strict';

  const HOTFIX_VERSION = '1.1.1';
  const RATE_MIN = 0.75;
  const RATE_MAX = 1.40;
  const RATE_DEFAULT = 1.00;

  const validNumber = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
  };

  // Repair values corrupted by the Rev 1.1.0 shared-element event-handler bug.
  state.settings.rate = validNumber(state.settings.rate, RATE_MIN, RATE_MAX, RATE_DEFAULT);
  state.settings.volume = validNumber(state.settings.volume, 0, 1, 1);
  state.settings.tone = validNumber(state.settings.tone, 0, 1, 0.35);
  state.settings.mode = ['guided', 'light', 'minimal'].includes(state.settings.mode) ? state.settings.mode : 'guided';
  state.settings.voice = typeof state.settings.voice === 'string' ? state.settings.voice : '';

  function automaticNaturalVoice() {
    const voices = getVoices();
    if (!voices.length) return null;
    const preferredNames = ['Aaron', 'Nicky', 'Samantha', 'Ava', 'Allison', 'Susan', 'Tom', 'Alex', 'Daniel', 'Karen', 'Moira'];
    const score = voice => {
      const lang = String(voice.lang || '').toLowerCase();
      const name = String(voice.name || '');
      let value = 0;
      if (lang === 'en-us') value += 120;
      else if (lang.startsWith('en-us')) value += 115;
      else if (lang.startsWith('en-ca')) value += 95;
      else if (lang.startsWith('en-gb') || lang.startsWith('en-au') || lang.startsWith('en-ie')) value += 85;
      else if (lang.startsWith('en')) value += 70;
      if (voice.localService) value += 20;
      if (voice.default) value += 8;
      const preferredIndex = preferredNames.findIndex(candidate => name.toLowerCase().includes(candidate.toLowerCase()));
      if (preferredIndex >= 0) value += 60 - preferredIndex * 3;
      if (/compact|eloquence|novelty|whisper|bad news|bells|boing|bubbles|cellos|good news|organ|superstar|trinoids|zarvox/i.test(name)) value -= 100;
      return value;
    };
    return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  selectedVoice = function selectedVoiceRev111() {
    const voices = getVoices();
    if (state.settings.voice) {
      const selected = voices.find(voice => voice.name === state.settings.voice);
      if (selected) return selected;
    }
    return automaticNaturalVoice();
  };

  const originalHeader = header;
  header = function headerRev111() {
    return originalHeader().replace(/Rev\s+1\.1\.0/, `Rev ${HOTFIX_VERSION}`);
  };

  settingsScreen = function settingsScreenRev111() {
    const voices = getVoices();
    const automatic = automaticNaturalVoice();
    const automaticLabel = automatic ? `Automatic — ${automatic.name} · ${automatic.lang}` : 'Automatic — device default';
    return `<section class="card"><button class="backbtn" data-open="more">← More</button><div class="kicker">Settings</div><h1>Audio & practice</h1>
      <label>Guidance mode<select id="setMode"><option value="guided">Guided</option><option value="light">Light Guidance</option><option value="minimal">Minimal</option></select></label>
      <label>System voice<select id="voice"><option value="">${esc(automaticLabel)}</option>${voices.map(voice => `<option value="${esc(voice.name)}">${esc(voice.name)} · ${esc(voice.lang)}</option>`).join('')}</select></label>
      <p class="footerhint" style="text-align:left">Automatic prioritizes the most natural locally available English voice. Select another voice and use the audio test to compare.</p>
      <label>Speech rate <span class="rangevalue" id="rateValue">${state.settings.rate.toFixed(2)}×</span><input id="rate" type="range" min="${RATE_MIN}" max="${RATE_MAX}" step="0.01" value="${state.settings.rate}"></label>
      <label>Voice volume <span class="rangevalue" id="volValue">${Math.round(state.settings.volume * 100)}%</span><input id="vol" type="range" min="0" max="1" step="0.05" value="${state.settings.volume}"></label>
      <label>Tone volume <span class="rangevalue" id="toneValue">${Math.round(state.settings.tone * 100)}%</span><input id="tone" type="range" min="0" max="1" step="0.05" value="${state.settings.tone}"></label>
      <label class="checkrow"><input id="timing" type="checkbox" ${state.settings.timing ? 'checked' : ''}><span>Speak phase timing at major transitions</span></label>
      <label class="checkrow"><input id="keepAwake" type="checkbox" ${state.settings.keepAwake ? 'checked' : ''}><span>Keep screen awake during audio sessions when supported</span></label>
      <label class="checkrow"><input id="testSetting" type="checkbox" ${state.test ? 'checked' : ''}><span>Accelerated 90-second Day 1 verification mode</span></label>
      <div class="row"><button class="smallbtn" id="testAudio">Test voice + tone</button><button class="smallbtn danger" id="resetData">Reset local data</button></div>
      <div class="safe">Altered-state practices are never suitable while driving, operating machinery, using ladders, in water, or anywhere reduced ordinary task attention could create danger.</div>
    </section>`;
  };

  const originalBind = bind;
  bind = function bindRev111() {
    originalBind();

    const modeSelect = document.querySelector('#setMode');
    if (modeSelect) {
      modeSelect.value = state.settings.mode;
      modeSelect.onchange = event => { state.settings.mode = event.currentTarget.value; save(); };
    }

    const voiceSelect = document.querySelector('#voice');
    if (voiceSelect) {
      const voiceExists = [...voiceSelect.options].some(option => option.value === state.settings.voice);
      if (!voiceExists) state.settings.voice = '';
      voiceSelect.value = state.settings.voice;
      voiceSelect.onchange = event => {
        state.settings.voice = event.currentTarget.value;
        save();
        render();
      };
    }

    const rateInput = document.querySelector('#rate');
    if (rateInput) rateInput.oninput = event => {
      state.settings.rate = validNumber(event.currentTarget.value, RATE_MIN, RATE_MAX, RATE_DEFAULT);
      const output = document.querySelector('#rateValue');
      if (output) output.textContent = `${state.settings.rate.toFixed(2)}×`;
      save();
    };

    const volumeInput = document.querySelector('#vol');
    if (volumeInput) volumeInput.oninput = event => {
      state.settings.volume = validNumber(event.currentTarget.value, 0, 1, 1);
      const output = document.querySelector('#volValue');
      if (output) output.textContent = `${Math.round(state.settings.volume * 100)}%`;
      save();
    };

    const toneInput = document.querySelector('#tone');
    if (toneInput) toneInput.oninput = event => {
      state.settings.tone = validNumber(event.currentTarget.value, 0, 1, 0.35);
      const output = document.querySelector('#toneValue');
      if (output) output.textContent = `${Math.round(state.settings.tone * 100)}%`;
      save();
    };

    const timingInput = document.querySelector('#timing');
    if (timingInput) timingInput.onchange = event => { state.settings.timing = event.currentTarget.checked; save(); };

    const wakeInput = document.querySelector('#keepAwake');
    if (wakeInput) wakeInput.onchange = event => { state.settings.keepAwake = event.currentTarget.checked; save(); };

    const testInput = document.querySelector('#testSetting');
    if (testInput) testInput.onchange = event => { state.test = event.currentTarget.checked; save(); };
  };

  testAudio = async function testAudioRev111() {
    await prepareAudioSession();
    playTone();
    const voice = selectedVoice();
    const voiceName = voice?.name ? ` The active voice is ${voice.name}.` : '';
    window.setTimeout(() => speakCue(`This is the QCTP voice preview at ${state.settings.rate.toFixed(2)} times normal speed.${voiceName} Adjust the rate until this sounds clear and conversational.`), 220);
  };

  save();
  render();
})();
