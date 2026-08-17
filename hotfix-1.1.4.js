(() => {
  'use strict';

  const HOTFIX_VERSION = '1.1.4';
  const MEDIA = window.QCTP_NEURAL_AUDIO;
  if (!MEDIA) return;

  const testPlayer = new Audio();
  let testToken = 0;

  const TEST_AUDIO = new Map([
    [0, MEDIA.cues[105]],
    [180, MEDIA.cues[180]],
    [480, MEDIA.cues[600]],
    [780, MEDIA.cues[930]],
    [1110, MEDIA.cues[1110]],
    [1380, MEDIA.cues[1490]]
  ]);

  function stopTestAudio() {
    testToken += 1;
    testPlayer.onended = null;
    testPlayer.onerror = null;
    testPlayer.pause();
    try { testPlayer.currentTime = 0; } catch (_) {}
  }

  async function playTestAudio(url) {
    if (!url) return;
    const token = ++testToken;
    testPlayer.pause();
    testPlayer.src = url;
    testPlayer.volume = Math.max(0, Math.min(1, Number(state.settings.volume) || 1));
    testPlayer.onerror = () => {
      if (token !== testToken) return;
      const cue = document.querySelector('#cue');
      if (cue) cue.textContent = 'The audible test marker could not load. Real-mode narration is unaffected.';
    };
    try { await testPlayer.play(); } catch (_) {
      const cue = document.querySelector('#cue');
      if (cue) cue.textContent = 'Tap Play once to authorize the audible test on this device.';
    }
  }

  const priorHeader = header;
  header = function headerRev114() {
    return priorHeader().replace(/Rev\s+1\.1\.3/, `Rev ${HOTFIX_VERSION}`);
  };

  const priorSettingsScreen = settingsScreen;
  settingsScreen = function settingsScreenRev114() {
    return priorSettingsScreen()
      .replace('Accelerated 90-second sequencer test mode', 'Accelerated 90-second audible sequencer test')
      .replace('The current neural files require an internet connection.', 'The current neural files require an internet connection. The accelerated test is optional; normal Day 1 playback is the authoritative path.');
  };

  const priorFireCue = fireCue;
  fireCue = function fireCueRev114(cue) {
    if (!state.test) {
      priorFireCue(cue);
      return;
    }

    if (!runner) return;
    runner.phase = cue.phase;
    runner.cue = cue.text;
    const phase = document.querySelector('#phase');
    const text = document.querySelector('#cue');
    if (phase) phase.textContent = cue.phase;
    if (text) text.textContent = cue.text;
    if (cue.tone) playTone();
    cancelSpeech();

    const url = TEST_AUDIO.get(cue.at);
    if (url) void playTestAudio(url);
  };

  const priorStopRunner = stopRunner;
  stopRunner = function stopRunnerRev114(release = true) {
    stopTestAudio();
    priorStopRunner(release);
  };

  const priorFinishRunner = finishRunner;
  finishRunner = function finishRunnerRev114() {
    stopTestAudio();
    priorFinishRunner();
  };

  cancelSpeech();
  save();
  render();
})();
