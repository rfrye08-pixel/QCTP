const APP_VERSION = '1.1.0';
const PRACTICE_TOTAL_SECONDS = 25 * 60;
const TEST_TOTAL_SECONDS = 90;

const MODULES = [
  'Attentional Control / Coherence',
  'Attentional Control / Open Awareness',
  'Gap Access',
  'Elevated Emotion / State Generation',
  'Intention / New Potentials',
  'Embodiment / State Interruption',
  'Energy Centers',
  'OBE Foundation / Focus 10',
  'OBE Induction / Separation',
  'Remote Viewing Foundation',
  'Advanced Remote Viewing',
  'Psionics Foundation',
  'Psionics Development',
  'Intuition / Dreams / Creative Reception',
  'Group Intention / Collective Practice',
  'Integration / Living in the Field'
];

const DAYS = Array.from({ length: 112 }, (_, i) => ({
  day: i + 1,
  week: Math.floor(i / 7) + 1,
  module: MODULES[Math.floor(i / 7)],
  authored: i === 0
}));

const DAY1_LESSON_PARAGRAPHS = [
  'Day 1 establishes the control layer for everything that follows. Today is not about forcing an unusual experience. It is about learning that your ordinary state of consciousness has adjustable controls. You can deliberately change muscular tension, breathing rhythm, emotional state, the width of attention, and how quickly you follow a thought.',
  'The first skill is observation without immediate reaction. During the physical settling phase, do not command the body to relax. Locate unnecessary contraction accurately, then allow a small release on the exhale. This distinction matters. Suppression says a sensation should not be present. Observation says the sensation is present and can be watched without becoming the whole of your experience.',
  'The second skill is coherence. You will place attention in the center of the chest, breathe slightly more slowly, and use one real memory to generate appreciation. Once the feeling appears, release the memory while trying to retain the state. You are beginning to separate the emotional state from the outside event that originally produced it.',
  'The third skill is deliberate narrow attention. You will count complete breath cycles from one to ten. Whenever attention is captured by planning, memory, sound, discomfort, or internal commentary, restart at one without frustration. Catching the distraction is not failure. That moment is the training repetition: attention was captured, awareness noticed the capture, and attention was deliberately returned.',
  'The fourth skill is open focus. Instead of concentrating on one object, you will become aware of volume and space: the volume inside the head, the space surrounding the head, the chest, abdomen, whole body, room, and auditory field. The purpose is to experience the difference between a flashlight-like attention beam and a broad field of awareness.',
  'The guided practice itself is exactly twenty-five minutes: three minutes of physical settling, five minutes of coherence, five minutes of single-point attention, ten minutes of open-focus spatial awareness, and two minutes of pure observation. Spoken cues occur at fixed points on the timeline. The periods between them are real silence. Put the phone face-down after the practice begins, but do not press the side button; QCTP will request permission to keep the screen awake so the iPhone does not suspend the sequencer.',
  'Day 1 passes when you complete the morning practice, notice at least one instance of attention being captured, and perform at least three eyes-open micro-entries during the day. You are not grading the session by vibrations, visions, boundary loss, or any dramatic event. You are grading it by intentional state change, attentional recovery, and the ability to widen awareness.'
];
const DAY1_LESSON = DAY1_LESSON_PARAGRAPHS.join(' ');

const DAY1_PROMPTS = [
  ['starting', 'Starting state: tired, busy, calm, irritated, excited, or something else?'],
  ['relax', 'Physical relaxation before and after, 0–5. What changed?'],
  ['coherence', 'Coherence shift, 0–5. What memory most easily produced appreciation?'],
  ['retain', 'Could you retain the emotion after dropping the memory? Describe what happened.'],
  ['count', 'Longest breath count before distraction, and the most common distraction.'],
  ['open', 'Open-focus depth, 0–5. Did body boundaries, time sense, sounds, or internal narration change?'],
  ['moment', 'What was the most interesting moment of the session?'],
  ['question', 'What question do you now have? Record it without forcing an answer today.'],
  ['micro', 'How many daytime micro-entries did you complete, and what became noticeable?'],
  ['evening', 'What was the strongest emotional reaction today, and did you notice it before acting from it?']
];

const DAY1_MICRO_PRACTICE = [
  'Stop only when you are safely stationary and not using tools, machinery, a ladder, or a vehicle.',
  'Relax the gaze and notice the entire visual field, including the edges of peripheral vision.',
  'Notice one distant sound, one nearby sound, and then all sounds together.',
  'Feel one natural breath at the center of the chest.',
  'Notice the space between you and surrounding objects, then ask once: What was I not noticing five seconds ago? Resume normal activity.'
];

const DAY1_EVENING = [
  'Three minutes: review the day without judgment. Where was attention captured? Where did you remember the practice?',
  'Four minutes: repeat chest-focused breathing and generate appreciation. Release the memory and retain the state.',
  'Two minutes: with the physical body still, imagine lifting the right hand, left hand, both feet, then gently rocking left and right. Do not physically move.',
  'One minute: release every technique, notice awareness, and record the evening workbook fields.'
];

// Absolute cue times are measured from the start of the 25-minute practice.
// Spoken cue duration does not extend the timeline; the next cue remains tied to its fixed timestamp.
const DAY1_CUES = [
  { at: 0, phase: 'Physical Settling', tone: true, text: 'Sit upright with the feet supported and the hands relaxed. Close your eyes. Let the jaw, tongue, shoulders, chest, abdomen, hands, pelvis, legs, and feet release unnecessary tension. Do not force relaxation. Notice contraction and allow a small release on each exhale.' },
  { at: 45, phase: 'Physical Settling', text: 'Continue the body scan quietly. When you find tension, feel it accurately instead of fighting it.' },
  { at: 105, phase: 'Physical Settling', text: 'Let the body become slightly heavier and less ready to do something. Breathing remains easy and unforced.' },
  { at: 180, phase: 'Coherence', tone: true, text: 'Now bring attention to the center of the chest. Breathe a little more slowly and comfortably, as though the breath enters and leaves through the chest.' },
  { at: 240, phase: 'Coherence', text: 'Recall one specific memory that produces genuine appreciation. Use the memory only long enough to generate the physical and emotional feeling.' },
  { at: 330, phase: 'Coherence', text: 'Release the memory now and try to keep the feeling itself. If the feeling fades, briefly use the memory again, then let the story go.' },
  { at: 420, phase: 'Coherence', text: 'Remain with the body signature of appreciation. Let the body learn the state without needing the memory to continue.' },
  { at: 480, phase: 'Single-Point Attention', tone: true, text: 'Release the emotional exercise. Bring attention to the sensation of breathing at the nostrils. Count complete breath cycles from one to ten. Whenever attention wanders, restart at one without frustration.' },
  { at: 600, phase: 'Single-Point Attention', text: 'Continue counting. The training repetition is noticing that attention was captured and deliberately returning it.' },
  { at: 720, phase: 'Single-Point Attention', text: 'For the final minute of this phase, notice whether there is a tiny interval between a thought beginning and your decision to continue it.' },
  { at: 780, phase: 'Open Focus', tone: true, text: 'Stop counting. Become aware of the three-dimensional volume inside the head, behind the forehead and eyes, and from ear to ear.' },
  { at: 840, phase: 'Open Focus', text: 'Expand awareness to the space immediately surrounding the head. Do not create an object. Become aware of volume and space.' },
  { at: 930, phase: 'Open Focus', text: 'Move awareness to the chest as a volume, then include the space around the chest.' },
  { at: 1020, phase: 'Open Focus', text: 'Become aware of the abdomen and pelvis as one spatial region, then include the space surrounding them.' },
  { at: 1110, phase: 'Open Focus', text: 'Feel the entire body simultaneously as one three-dimensional volume occupying space.' },
  { at: 1200, phase: 'Open Focus', text: 'Expand awareness several inches, then one foot, then several feet around the body. Let awareness include the surrounding space instead of remaining only inside the head.' },
  { at: 1290, phase: 'Open Focus', text: 'Become aware of the entire room at once. Avoid naming objects. Experience the volume of the room.' },
  { at: 1360, phase: 'Open Focus', text: 'Notice the farthest sound, then the nearest sound, and then let all sounds exist inside one auditory field. Thoughts can also appear inside the larger field without being pushed away.' },
  { at: 1380, phase: 'Pure Observation', tone: true, text: 'Release every technique now. No breath control, counting, visualization, or effort. Simply notice thoughts, sounds, sensations, and breathing.' },
  { at: 1440, phase: 'Pure Observation', text: 'Ask once, silently: What is aware of all of this? Do not answer in words. Rest as simple awareness.' },
  { at: 1490, phase: 'Return', tone: true, text: 'Take a slightly deeper breath. Feel the chair and your feet. Open your eyes slowly and retain a little of the spacious awareness as you return.' }
];

const LIGHT_CUE_TIMES = new Set([0, 105, 180, 330, 480, 600, 780, 930, 1110, 1290, 1380, 1440, 1490]);
const MINIMAL_CUE_TIMES = new Set([0, 180, 480, 780, 1380, 1490]);

const DEFAULT_STATE = {
  currentDay: 1,
  done: {},
  answers: {},
  logs: [],
  settings: {
    mode: 'guided',
    rate: 0.9,
    volume: 1,
    tone: 0.35,
    timing: false,
    voice: '',
    keepAwake: true
  },
  test: false
};

function loadState() {
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem('qctp-state') || 'null'); } catch (_) {}
  const s = structuredClone(DEFAULT_STATE);
  if (!parsed) return s;
  Object.assign(s, parsed);
  s.settings = { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) };
  s.done = parsed.done || {};
  s.answers = parsed.answers || {};
  s.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  s.currentDay = Math.min(112, Math.max(1, Number(parsed.currentDay) || 1));
  return s;
}

const state = loadState();
let view = 'today';
let runner = null;
let lessonPlaying = false;
let speechGeneration = 0;
let wakeLock = null;
let audioContext = null;
let wakeStatus = 'Not requested';

function save() { localStorage.setItem('qctp-state', JSON.stringify(state)); }
function cap(s) { return String(s).replace(/\b\w/g, c => c.toUpperCase()); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
function fmt(sec) { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function currentDay() { return DAYS[state.currentDay - 1]; }
function dayDone(day = state.currentDay) { return state.done[day] || {}; }
function allComponentsDone(day = state.currentDay) { const d = dayDone(day); return Boolean(d.morning && d.midday && d.evening); }

function nav() {
  const items = [['today', 'Today'], ['lesson', 'Lesson'], ['practice', 'Practice'], ['workbook', 'Workbook'], ['progress', 'Progress'], ['more', 'More']];
  const active = ['logs', 'settings'].includes(view) ? 'more' : view;
  return `<div class="nav"><div class="navin">${items.map(([k, n]) => `<button data-nav="${k}" class="${active === k ? 'active' : ''}">${n}</button>`).join('')}</div></div>`;
}

function header() {
  const d = currentDay();
  return `<div class="top"><div><div class="brand">QCTP</div><div class="version">Rev ${APP_VERSION}</div></div><div class="daypill">Day ${d.day} · Week ${d.week}</div></div>`;
}

function render() {
  const app = document.querySelector('#app');
  if (!app) return;
  app.innerHTML = `<main class="shell">${header()}${screen()}</main>${nav()}`;
  bind();
}

function screen() {
  const screens = {
    today: todayScreen,
    lesson: lessonScreen,
    practice: practiceScreen,
    workbook: workbookScreen,
    progress: progressScreen,
    more: moreScreen,
    logs: logsScreen,
    settings: settingsScreen
  };
  return (screens[view] || todayScreen)();
}

function componentRow(name, detail, done) {
  return `<div class="component"><div><b>${esc(name)}</b><div class="muted small">${esc(detail)}</div></div><span class="status ${done ? 'statusdone' : ''}">${done ? 'Complete' : 'Pending'}</span></div>`;
}

function todayScreen() {
  const d = currentDay();
  const done = dayDone(d.day);
  const installed = isStandalone();
  return `<section class="card hero">
    <div class="kicker">${esc(d.module)}</div>
    <h1>Day ${d.day}</h1>
    <p class="muted">${d.authored ? 'Fully authored and released.' : 'Curriculum slot reserved. Detailed training is not yet released in this build.'}</p>
    ${d.day === 1 ? `<div class="row"><div class="metric"><span class="muted">Lesson</span><b>~6 min</b></div><div class="metric"><span class="muted">Practice</span><b>25 min</b></div></div>
    <button class="bigbtn" id="begin">Begin Today</button>
    <p class="footerhint">One tap starts the detailed lesson, then automatically begins the timed meditation. Place the phone face-down after starting, but do not press the side button.</p>` : `<div class="safe">This day is intentionally not fabricated. The 112-day structure exists, but detailed content will be released under configuration control.</div>`}
  </section>

  <section class="card">
    <h2>Today’s components</h2>
    ${componentRow('Morning lesson + practice', 'Audio lesson followed by the exact timed meditation.', done.morning)}
    ${componentRow('Midday integration', 'Five eyes-open micro-entries while safely stationary.', done.midday)}
    ${componentRow('Evening practice', 'Ten-minute clearing, coherence, and motor-imagery foundation.', done.evening)}
  </section>

  ${d.day === 1 ? `<section class="card"><div class="kicker">Midday integration</div><h2>Five micro-entries</h2><ol class="instructionlist">${DAY1_MICRO_PRACTICE.map(x => `<li>${esc(x)}</li>`).join('')}</ol><button class="smallbtn markpart" data-part="midday">${done.midday ? 'Midday complete' : 'Mark midday complete'}</button></section>
  <section class="card"><div class="kicker">Evening · 10 minutes</div><h2>Day 1 closing practice</h2><ol class="instructionlist">${DAY1_EVENING.map(x => `<li>${esc(x)}</li>`).join('')}</ol><button class="smallbtn markpart" data-part="evening">${done.evening ? 'Evening complete' : 'Mark evening complete'}</button></section>` : ''}

  <section class="card installhint"><b>${installed ? 'Installed app mode active.' : 'Install on iPhone:'}</b> ${installed ? 'QCTP is running as a Home Screen app.' : 'Open this page in Safari, tap Share, then Add to Home Screen after the Day 1 test passes.'}</section>`;
}

function lessonScreen() {
  const d = currentDay();
  if (d.day !== 1) return `<section class="card"><div class="safe">This lesson is structurally reserved but not yet authored.</div></section>`;
  return `<section class="card"><div class="kicker">Day 1 lesson</div><h1>State Control</h1>${DAY1_LESSON_PARAGRAPHS.map(p => `<p class="lessonp">${esc(p)}</p>`).join('')}
  <div class="row"><button class="bigbtn secondary" id="speakLesson">${lessonPlaying ? 'Stop lesson' : 'Listen to lesson'}</button><button class="bigbtn secondary" id="skipLesson">Begin practice</button></div></section>`;
}

function practiceScreen() {
  const d = currentDay();
  if (d.day !== 1) return `<section class="card"><div class="safe">Guided practice for this day is not yet authored.</div></section>`;
  const total = state.test ? TEST_TOTAL_SECONDS : PRACTICE_TOTAL_SECONDS;
  const running = Boolean(runner);
  return `<section class="card practicecard"><div class="kicker">Guided Practice</div><h1>Day 1 · ${state.test ? '90-second verification' : '25 minutes'}</h1>
    <div class="cuebox"><div class="phase" id="phase">${running ? esc(runner.phase || 'Preparing') : 'Ready'}</div><div class="cue" id="cue">${running ? esc(runner.cue || 'Practice in progress.') : 'Tap Start. Put the phone face-down. Spoken cues will be separated by real silence.'}</div><div class="timer mono" id="timer">${running ? fmt(total - getElapsed()) : fmt(total)}</div></div>
    <div class="timeline"><div id="bar" style="width:${running ? Math.min(100, getElapsed() / total * 100) : 0}%"></div></div>
    <div class="controls"><button id="restart">Restart</button><button class="primarycontrol" id="play">${running ? (runner.paused ? 'Resume' : 'Pause') : 'Start'}</button><button id="endSession">End</button></div>
    <div class="modebar"><button class="smallbtn" id="mode">Guidance: ${cap(state.settings.mode)}</button><button class="smallbtn" id="test">Test mode: ${state.test ? 'ON' : 'OFF'}</button></div>
    <div class="screenstatus"><b>Screen-awake status:</b> <span id="wakeStatus">${esc(wakeStatus)}</span></div>
    <p class="footerhint">QCTP requests a screen wake lock when supported. Keep the app open and do not press the iPhone side button during system-voice sessions.</p>
  </section>`;
}

function workbookScreen() {
  if (state.currentDay !== 1) return `<section class="card"><div class="safe">Workbook prompts for this day are not yet authored.</div></section>`;
  const a = state.answers[1] || {};
  return `<section class="card"><div class="kicker">Day 1 Workbook</div><h1>Reflection & calibration</h1>${DAY1_PROMPTS.map(([id, q]) => `<div class="prompt"><label>${esc(q)}</label><textarea data-answer="${id}">${esc(a[id] || '')}</textarea></div>`).join('')}<button class="bigbtn" id="saveAnswers">Save workbook</button></section>`;
}

function progressScreen() {
  return `<section class="card"><div class="kicker">112-day curriculum</div><h1>Progress</h1><p class="muted">Course state advances by completed training components, not by the calendar. Missing a day does not skip content.</p>
    ${MODULES.map((m, i) => { const start = i * 7 + 1, end = start + 6, cur = state.currentDay; return `<div class="week ${cur > end ? 'done' : ''}"><b>Week ${i + 1}</b><div>${esc(m)}</div><div class="muted small">Days ${start}–${end}${i === 0 ? ' · Day 1 released' : ' · detailed days pending'}</div></div>`; }).join('')}
    <div class="row"><button class="smallbtn" id="export">Export JSON</button><label class="smallbtn filelabel">Import JSON<input id="import" type="file" accept="application/json"></label></div>
  </section>`;
}

function moreScreen() {
  return `<section class="card"><div class="kicker">More</div><h1>Tools & configuration</h1><button class="menurow" data-open="logs"><span>Explore / Logs</span><span>OBE, RV, psionics, dreams, reception</span></button><button class="menurow" data-open="settings"><span>Settings</span><span>Voice, guidance, wake lock, testing, data</span></button></section>`;
}

function logsScreen() {
  const types = ['OBE / Focus 10', 'Remote Viewing', 'Psionics', 'Dream / Synchronicity', 'Intuition / Reception'];
  return `<section class="card"><button class="backbtn" data-open="more">← More</button><div class="kicker">Explore / Logs</div><h1>Structured future modules</h1><p class="muted">These logs are available now even while advanced lessons remain under development.</p>${types.map((n, i) => `<div class="week"><b>${esc(n)}</b><textarea class="logtext" data-log="${i}" placeholder="Record conditions, impressions, feedback, measurements, or outcomes..."></textarea><button class="smallbtn addlog" data-log="${i}">Save entry</button></div>`).join('')}</section>`;
}

function settingsScreen() {
  const voices = getVoices();
  return `<section class="card"><button class="backbtn" data-open="more">← More</button><div class="kicker">Settings</div><h1>Audio & practice</h1>
    <label>Guidance mode<select id="setMode"><option value="guided">Guided</option><option value="light">Light Guidance</option><option value="minimal">Minimal</option></select></label>
    <label>System voice<select id="voice"><option value="">Device default</option>${voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}</select></label>
    <label>Speech rate <span class="rangevalue" id="rateValue">${state.settings.rate.toFixed(2)}×</span><input id="rate" type="range" min="0.70" max="1.15" step="0.01" value="${state.settings.rate}"></label>
    <label>Voice volume <span class="rangevalue" id="volValue">${Math.round(state.settings.volume * 100)}%</span><input id="vol" type="range" min="0" max="1" step="0.05" value="${state.settings.volume}"></label>
    <label>Tone volume <span class="rangevalue" id="toneValue">${Math.round(state.settings.tone * 100)}%</span><input id="tone" type="range" min="0" max="1" step="0.05" value="${state.settings.tone}"></label>
    <label class="checkrow"><input id="timing" type="checkbox" ${state.settings.timing ? 'checked' : ''}><span>Speak phase timing at major transitions</span></label>
    <label class="checkrow"><input id="keepAwake" type="checkbox" ${state.settings.keepAwake ? 'checked' : ''}><span>Keep screen awake during audio sessions when supported</span></label>
    <label class="checkrow"><input id="testSetting" type="checkbox" ${state.test ? 'checked' : ''}><span>Accelerated 90-second Day 1 verification mode</span></label>
    <div class="row"><button class="smallbtn" id="testAudio">Test voice + tone</button><button class="smallbtn danger" id="resetData">Reset local data</button></div>
    <div class="safe">Altered-state practices are never suitable while driving, operating machinery, using ladders, in water, or anywhere reduced ordinary task attention could create danger.</div>
  </section>`;
}

function bind() {
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigate(b.dataset.nav));
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => navigate(b.dataset.open));

  let el;
  if ((el = document.querySelector('#begin'))) el.onclick = beginToday;
  if ((el = document.querySelector('#speakLesson'))) el.onclick = () => lessonPlaying ? stopLesson() : playLesson(false);
  if ((el = document.querySelector('#skipLesson'))) el.onclick = () => { stopLesson(); navigate('practice'); setTimeout(() => startRunner(true), 250); };

  if ((el = document.querySelector('#play'))) el.onclick = toggleRunner;
  if ((el = document.querySelector('#restart'))) el.onclick = () => startRunner(true);
  if ((el = document.querySelector('#endSession'))) el.onclick = () => endRunnerByUser();
  if ((el = document.querySelector('#mode'))) el.onclick = cycleMode;
  if ((el = document.querySelector('#test'))) el.onclick = toggleTestMode;

  document.querySelectorAll('.markpart').forEach(b => b.onclick = () => markPart(b.dataset.part));

  if ((el = document.querySelector('#saveAnswers'))) el.onclick = saveAnswers;
  if ((el = document.querySelector('#export'))) el.onclick = exportData;
  if ((el = document.querySelector('#import'))) el.onchange = importData;

  document.querySelectorAll('.addlog').forEach(b => b.onclick = () => saveLog(b));

  if ((el = document.querySelector('#setMode'))) { el.value = state.settings.mode; el.onchange = () => { state.settings.mode = el.value; save(); }; }
  if ((el = document.querySelector('#voice'))) { el.value = state.settings.voice; el.onchange = () => { state.settings.voice = el.value; save(); }; }
  if ((el = document.querySelector('#rate'))) el.oninput = () => { state.settings.rate = Number(el.value); document.querySelector('#rateValue').textContent = `${state.settings.rate.toFixed(2)}×`; save(); };
  if ((el = document.querySelector('#vol'))) el.oninput = () => { state.settings.volume = Number(el.value); document.querySelector('#volValue').textContent = `${Math.round(state.settings.volume * 100)}%`; save(); };
  if ((el = document.querySelector('#tone'))) el.oninput = () => { state.settings.tone = Number(el.value); document.querySelector('#toneValue').textContent = `${Math.round(state.settings.tone * 100)}%`; save(); };
  if ((el = document.querySelector('#timing'))) el.onchange = () => { state.settings.timing = el.checked; save(); };
  if ((el = document.querySelector('#keepAwake'))) el.onchange = () => { state.settings.keepAwake = el.checked; save(); };
  if ((el = document.querySelector('#testSetting'))) el.onchange = () => { state.test = el.checked; save(); };
  if ((el = document.querySelector('#testAudio'))) el.onclick = testAudio;
  if ((el = document.querySelector('#resetData'))) el.onclick = resetData;
}

function navigate(next) {
  if (next !== 'practice' && runner) stopRunner(false);
  if (next !== 'lesson' && lessonPlaying) stopLesson();
  view = next;
  render();
}

async function beginToday() {
  await prepareAudioSession();
  view = 'lesson';
  render();
  playLesson(true);
}

async function prepareAudioSession() {
  ensureAudioContext();
  if (audioContext?.state === 'suspended') { try { await audioContext.resume(); } catch (_) {} }
  await requestWakeLock();
}

function getVoices() {
  return ('speechSynthesis' in window ? window.speechSynthesis.getVoices() : []).slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
}

function selectedVoice() {
  const voices = getVoices();
  return voices.find(v => v.name === state.settings.voice) || null;
}

function cancelSpeech() {
  speechGeneration += 1;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function speakQueue(chunks, done) {
  if (!('speechSynthesis' in window)) { done?.(); return; }
  cancelSpeech();
  const token = speechGeneration;
  let index = 0;
  const next = () => {
    if (token !== speechGeneration) return;
    if (index >= chunks.length) { done?.(); return; }
    const text = chunks[index++];
    const u = new SpeechSynthesisUtterance(text);
    u.rate = state.settings.rate;
    u.volume = state.settings.volume;
    const voice = selectedVoice();
    if (voice) u.voice = voice;
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
  };
  next();
}

function speakCue(text) {
  if (!text || !('speechSynthesis' in window)) return;
  cancelSpeech();
  const token = speechGeneration;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = state.settings.rate;
  u.volume = state.settings.volume;
  const voice = selectedVoice();
  if (voice) u.voice = voice;
  u.onerror = () => {};
  u.onend = () => { if (token !== speechGeneration) return; };
  window.speechSynthesis.speak(u);
}

function playLesson(autoStartPractice) {
  if (lessonPlaying) return;
  lessonPlaying = true;
  render();
  speakQueue(DAY1_LESSON_PARAGRAPHS, () => {
    lessonPlaying = false;
    if (autoStartPractice) {
      view = 'practice';
      render();
      setTimeout(() => startRunner(true), 600);
    } else {
      render();
    }
  });
}

function stopLesson() {
  lessonPlaying = false;
  cancelSpeech();
  releaseWakeLock();
  render();
}

function activeCues() {
  if (state.settings.mode === 'light') return DAY1_CUES.filter(c => LIGHT_CUE_TIMES.has(c.at));
  if (state.settings.mode === 'minimal') return DAY1_CUES.filter(c => MINIMAL_CUE_TIMES.has(c.at));
  return DAY1_CUES;
}

function scaledTime(at) {
  if (!runner) return at;
  return at * runner.scale;
}

function getElapsed() {
  if (!runner) return 0;
  if (runner.paused) return runner.elapsedBeforePause;
  return runner.elapsedBeforePause + (performance.now() - runner.startedAt) / 1000;
}

async function startRunner(restart = false) {
  stopRunner(false);
  await prepareAudioSession();
  const total = state.test ? TEST_TOTAL_SECONDS : PRACTICE_TOTAL_SECONDS;
  runner = {
    total,
    scale: total / PRACTICE_TOTAL_SECONDS,
    startedAt: performance.now(),
    elapsedBeforePause: 0,
    paused: false,
    fired: new Set(),
    interval: null,
    phase: 'Preparing',
    cue: 'The session is beginning.'
  };
  runner.interval = window.setInterval(tickRunner, 200);
  tickRunner();
  renderPracticeDynamic();
}

function tickRunner() {
  if (!runner || runner.paused) return;
  const elapsed = getElapsed();
  const cues = activeCues();
  const due = cues.filter(c => !runner.fired.has(c.at) && scaledTime(c.at) <= elapsed + 0.05);
  if (due.length) {
    due.forEach(c => runner.fired.add(c.at));
    fireCue(due[due.length - 1]);
  }
  updatePracticeClock(elapsed);
  if (elapsed >= runner.total) finishRunner();
}

function fireCue(cue) {
  if (!runner) return;
  runner.phase = cue.phase;
  runner.cue = cue.text;
  const phaseEl = document.querySelector('#phase');
  const cueEl = document.querySelector('#cue');
  if (phaseEl) phaseEl.textContent = cue.phase;
  if (cueEl) cueEl.textContent = cue.text;
  if (cue.tone) playTone();

  let spoken = cue.text;
  if (state.test) spoken = cue.tone ? cue.phase : '';
  if (state.settings.timing && cue.tone && !state.test) {
    const remaining = Math.max(0, PRACTICE_TOTAL_SECONDS - cue.at);
    spoken = `${cue.phase}. ${Math.ceil(remaining / 60)} minutes remain in the practice. ${cue.text}`;
  }
  if (spoken) speakCue(spoken);
}

function updatePracticeClock(elapsed = getElapsed()) {
  if (!runner) return;
  const timer = document.querySelector('#timer');
  const bar = document.querySelector('#bar');
  if (timer) timer.textContent = fmt(runner.total - elapsed);
  if (bar) bar.style.width = `${Math.min(100, elapsed / runner.total * 100)}%`;
}

function renderPracticeDynamic() {
  const play = document.querySelector('#play');
  const wake = document.querySelector('#wakeStatus');
  if (play && runner) play.textContent = runner.paused ? 'Resume' : 'Pause';
  if (wake) wake.textContent = wakeStatus;
  updatePracticeClock();
}

function toggleRunner() {
  if (!runner) { startRunner(true); return; }
  if (runner.paused) resumeRunner(); else pauseRunner();
}

async function pauseRunner() {
  if (!runner || runner.paused) return;
  runner.elapsedBeforePause = getElapsed();
  runner.paused = true;
  window.clearInterval(runner.interval);
  runner.interval = null;
  cancelSpeech();
  renderPracticeDynamic();
}

async function resumeRunner() {
  if (!runner || !runner.paused) return;
  await prepareAudioSession();
  runner.paused = false;
  runner.startedAt = performance.now();
  runner.interval = window.setInterval(tickRunner, 200);
  playTone();
  speakCue(`Resume ${runner.phase}.`);
  renderPracticeDynamic();
}

function stopRunner(release = true) {
  if (runner?.interval) window.clearInterval(runner.interval);
  runner = null;
  cancelSpeech();
  if (release) releaseWakeLock();
}

function endRunnerByUser() {
  if (!runner) return;
  const endedAt = getElapsed();
  stopRunner(true);
  view = 'practice';
  render();
  const cue = document.querySelector('#cue');
  const phase = document.querySelector('#phase');
  if (phase) phase.textContent = 'Ended';
  if (cue) cue.textContent = `Session ended at ${fmt(endedAt)}. It was not marked complete.`;
}

function finishRunner() {
  if (!runner) return;
  const wasTest = state.test;
  if (runner.interval) window.clearInterval(runner.interval);
  runner.interval = null;
  runner.paused = true;
  runner.elapsedBeforePause = runner.total;
  playTone();
  cancelSpeech();
  speakCue(wasTest ? 'Accelerated verification complete.' : 'Day 1 morning practice complete. Remain still for several seconds, then open the workbook when you are ready.');
  if (!wasTest) {
    state.done[1] = state.done[1] || {};
    state.done[1].morning = true;
    save();
  }
  const phase = document.querySelector('#phase');
  const cue = document.querySelector('#cue');
  const play = document.querySelector('#play');
  if (phase) phase.textContent = 'Complete';
  if (cue) cue.textContent = wasTest ? 'The 90-second sequencer verification completed.' : 'Day 1 morning practice completed and was saved.';
  if (play) play.textContent = 'Done';
  updatePracticeClock(runner.total);
  releaseWakeLock();
}

function cycleMode() {
  state.settings.mode = state.settings.mode === 'guided' ? 'light' : state.settings.mode === 'light' ? 'minimal' : 'guided';
  save();
  if (runner) startRunner(true); else render();
}

function toggleTestMode() {
  state.test = !state.test;
  save();
  if (runner) startRunner(true); else render();
}

function markPart(part) {
  state.done[state.currentDay] = state.done[state.currentDay] || {};
  state.done[state.currentDay][part] = true;
  if (allComponentsDone(state.currentDay) && state.currentDay < 112) state.currentDay += 1;
  save();
  render();
}

function saveAnswers() {
  state.answers[1] = state.answers[1] || {};
  document.querySelectorAll('[data-answer]').forEach(t => state.answers[1][t.dataset.answer] = t.value);
  save();
  const b = document.querySelector('#saveAnswers');
  if (b) b.textContent = 'Saved';
}

function saveLog(button) {
  const t = document.querySelector(`.logtext[data-log="${button.dataset.log}"]`);
  const names = ['OBE / Focus 10', 'Remote Viewing', 'Psionics', 'Dream / Synchronicity', 'Intuition / Reception'];
  if (!t || !t.value.trim()) return;
  state.logs.push({ type: names[Number(button.dataset.log)], day: state.currentDay, timestamp: new Date().toISOString(), text: t.value.trim() });
  t.value = '';
  save();
  button.textContent = 'Saved';
}

function exportData() {
  const payload = { schema: 'qctp-training-state-v1', appVersion: APP_VERSION, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `QCTP_training_data_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      const imported = parsed.state || parsed;
      Object.assign(state, imported);
      state.settings = { ...DEFAULT_STATE.settings, ...(imported.settings || {}) };
      save();
      render();
    } catch (_) {
      alert('That file is not valid QCTP JSON.');
    }
  };
  r.readAsText(f);
}

function resetData() {
  if (!confirm('Reset all QCTP progress, workbook answers, and logs stored on this device?')) return;
  localStorage.removeItem('qctp-state');
  location.reload();
}

function ensureAudioContext() {
  if (!audioContext) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) audioContext = new A();
  }
  return audioContext;
}

function playTone() {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 523.25;
    gain.gain.setValueAtTime(Math.max(0.0001, state.settings.tone * 0.12), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.68);
  } catch (_) {}
}

async function testAudio() {
  await prepareAudioSession();
  playTone();
  speakCue('QCTP audio test. The selected voice, speech rate, and transition tone are active.');
}

async function requestWakeLock() {
  if (!state.settings.keepAwake) { wakeStatus = 'Disabled in Settings'; updateWakeStatus(); return; }
  if (!('wakeLock' in navigator)) { wakeStatus = 'Not supported by this browser'; updateWakeStatus(); return; }
  try {
    if (!wakeLock || wakeLock.released) wakeLock = await navigator.wakeLock.request('screen');
    wakeStatus = 'Active';
    wakeLock.addEventListener('release', () => { wakeStatus = 'Released'; updateWakeStatus(); });
  } catch (err) {
    wakeStatus = `Unavailable: ${err.name || 'error'}`;
  }
  updateWakeStatus();
}

function updateWakeStatus() {
  const el = document.querySelector('#wakeStatus');
  if (el) el.textContent = wakeStatus;
}

async function releaseWakeLock() {
  if (wakeLock && !wakeLock.released) {
    try { await wakeLock.release(); } catch (_) {}
  }
  wakeLock = null;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
}

window.addEventListener('beforeunload', () => { cancelSpeech(); releaseWakeLock(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (runner || lessonPlaying)) requestWakeLock();
});
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { if (view === 'settings') render(); };
}

registerServiceWorker();
render();
