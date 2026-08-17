(() => {
  'use strict';

  const HOTFIX_VERSION = '1.1.2';
  const NEURAL_VOICES = [
    {
      id: 'soothing-sage',
      name: 'Soothing Sage',
      description: 'Grounded, calm male guide',
      url: 'https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/1735bcc2f02f421c9ddd910dcb16da79/id=a3f015a4-9a55-43fd-8e61-fa99041cfb07.wav'
    },
    {
      id: 'affable-aaron',
      name: 'Affable Aaron',
      description: 'Warm, friendly male guide',
      url: 'https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/184c9014f94142ae949363089aaf53dd/id=4ad426f6-ad9f-4f18-9136-c27dceedd12c.wav'
    },
    {
      id: 'mellow-michael',
      name: 'Mellow Michael',
      description: 'Slow, low-key male guide',
      url: 'https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/13be37a20b2448b7ad9db1a8669e5569/id=6d41bed9-239f-49c0-968f-aa3cd60bff85.wav'
    },
    {
      id: 'chill-brian',
      name: 'Chill Brian',
      description: 'Relaxed, conversational male guide',
      url: 'https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=2a454c20-aa17-4b2c-81e0-ec50a7d461d8.wav'
    },
    {
      id: 'calm-eva',
      name: 'Calm Eva',
      description: 'Clear, calm female guide',
      url: 'https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/18afa718c6c84c5a9312e922dfe3e6da/id=92d2c3a0-e58d-4d05-9460-574754a66090.wav'
    }
  ];

  state.settings.neuralVoice = typeof state.settings.neuralVoice === 'string' ? state.settings.neuralVoice : '';

  const previousHeader = header;
  header = function headerRev112() {
    return previousHeader().replace(/Rev\s+1\.1\.1/, `Rev ${HOTFIX_VERSION}`);
  };

  const previousSettingsScreen = settingsScreen;
  settingsScreen = function settingsScreenRev112() {
    const selected = NEURAL_VOICES.find(voice => voice.id === state.settings.neuralVoice);
    const auditionHtml = `<div class="neural-panel">
      <div class="kicker">Neural narration replacement</div>
      <h2>Choose the actual QCTP guide</h2>
      <p class="lessonp">The browser's system voices are rejected. These five previews use the same QCTP script and neural narration. Listen through your headphones, then select the one that sounds most genuinely conversational. After selection, the Day 1 lesson and meditation cues will be rendered as fixed audio in that voice.</p>
      <div class="neural-status">Selected: <b>${selected ? esc(selected.name) : 'None yet'}</b></div>
      ${NEURAL_VOICES.map(voice => `<div class="neural-card ${voice.id === state.settings.neuralVoice ? 'selected' : ''}">
        <div><b>${esc(voice.name)}</b><div class="muted">${esc(voice.description)}</div></div>
        <audio class="neural-audio" controls preload="none" src="${voice.url}"></audio>
        <button class="smallbtn neural-choose" data-neural="${voice.id}">${voice.id === state.settings.neuralVoice ? 'Selected' : 'Use this voice'}</button>
      </div>`).join('')}
      <div class="safe">This screen is for choosing the neural production voice. The current Day 1 player still uses the rejected system speech until the selected voice's lesson and cue files are rendered and integrated.</div>
    </div>`;

    return previousSettingsScreen()
      .replace('<h1>Audio & practice</h1>', `<h1>Audio & practice</h1>${auditionHtml}`)
      .replace('System voice', 'System voice fallback')
      .replace('Test voice + tone', 'Test system voice + tone');
  };

  const previousBind = bind;
  bind = function bindRev112() {
    previousBind();

    document.querySelectorAll('.neural-audio').forEach(player => {
      player.addEventListener('play', () => {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        document.querySelectorAll('.neural-audio').forEach(other => {
          if (other !== player) other.pause();
        });
      });
    });

    document.querySelectorAll('.neural-choose').forEach(button => {
      button.onclick = event => {
        state.settings.neuralVoice = event.currentTarget.dataset.neural;
        save();
        render();
      };
    });
  };

  const style = document.createElement('style');
  style.textContent = `
    .neural-panel{margin:18px 0 24px;padding:16px;border:1px solid #38507a;border-radius:16px;background:#0b1320}
    .neural-status{padding:10px 12px;margin:12px 0;border-radius:12px;background:#111b2b}
    .neural-card{padding:14px;margin:10px 0;border:1px solid var(--line);border-radius:14px;background:#0c1119}
    .neural-card.selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
    .neural-audio{display:block;width:100%;margin:10px 0;color-scheme:dark}
    .neural-card .smallbtn{width:100%}
  `;
  document.head.appendChild(style);

  save();
  render();
})();
