/**
 * The released Rev1.1.4 Foundation Day 1 material.
 *
 * This is protected content. Keep the lesson, cue timing, cue copy, and neural
 * audio references byte-for-byte aligned with `origin/main` unless a future
 * controlled curriculum revision explicitly replaces them.
 */

export const DAY1_TITLE = "State Control" as const;
export const DAY1_PRACTICE_DURATION_SECONDS = 1_500 as const;
export const DAY1_TEST_DURATION_SECONDS = 90 as const;

export type Day1Phase =
  | "Physical Settling"
  | "Coherence"
  | "Single-Point Attention"
  | "Open Focus"
  | "Pure Observation"
  | "Return";

export type Day1CueMode = "guided" | "light" | "minimal";

export interface Day1Cue {
  readonly at: number;
  readonly phase: Day1Phase;
  readonly tone: boolean;
  readonly text: string;
  readonly audioUrl: string;
}

export interface Day1WorkbookPrompt {
  readonly id: string;
  readonly question: string;
}

export const DAY1_LESSON_PARAGRAPHS = Object.freeze([
  "Day 1 establishes the control layer for everything that follows. Today is not about forcing an unusual experience. It is about learning that your ordinary state of consciousness has adjustable controls. You can deliberately change muscular tension, breathing rhythm, emotional state, the width of attention, and how quickly you follow a thought.",
  "The first skill is observation without immediate reaction. During the physical settling phase, do not command the body to relax. Locate unnecessary contraction accurately, then allow a small release on the exhale. This distinction matters. Suppression says a sensation should not be present. Observation says the sensation is present and can be watched without becoming the whole of your experience.",
  "The second skill is coherence. You will place attention in the center of the chest, breathe slightly more slowly, and use one real memory to generate appreciation. Once the feeling appears, release the memory while trying to retain the state. You are beginning to separate the emotional state from the outside event that originally produced it.",
  "The third skill is deliberate narrow attention. You will count complete breath cycles from one to ten. Whenever attention is captured by planning, memory, sound, discomfort, or internal commentary, restart at one without frustration. Catching the distraction is not failure. That moment is the training repetition: attention was captured, awareness noticed the capture, and attention was deliberately returned.",
  "The fourth skill is open focus. Instead of concentrating on one object, you will become aware of volume and space: the volume inside the head, the space surrounding the head, the chest, abdomen, whole body, room, and auditory field. The purpose is to experience the difference between a flashlight-like attention beam and a broad field of awareness.",
  "The guided practice itself is exactly twenty-five minutes: three minutes of physical settling, five minutes of coherence, five minutes of single-point attention, ten minutes of open-focus spatial awareness, and two minutes of pure observation. Spoken cues occur at fixed points on the timeline. The periods between them are real silence. Put the phone face-down after the practice begins, but do not press the side button; QCTP will request permission to keep the screen awake so the iPhone does not suspend the sequencer.",
  "Day 1 passes when you complete the morning practice, notice at least one instance of attention being captured, and perform at least three eyes-open micro-entries during the day. You are not grading the session by vibrations, visions, boundary loss, or any dramatic event. You are grading it by intentional state change, attentional recovery, and the ability to widen awareness.",
] as const);

export const DAY1_LESSON_TEXT = DAY1_LESSON_PARAGRAPHS.join(" ");

export const DAY1_WORKBOOK_PROMPTS: readonly Day1WorkbookPrompt[] =
  Object.freeze([
    Object.freeze({
      id: "starting",
      question:
        "Starting state: tired, busy, calm, irritated, excited, or something else?",
    }),
    Object.freeze({
      id: "relax",
      question: "Physical relaxation before and after, 0–5. What changed?",
    }),
    Object.freeze({
      id: "coherence",
      question:
        "Coherence shift, 0–5. What memory most easily produced appreciation?",
    }),
    Object.freeze({
      id: "retain",
      question:
        "Could you retain the emotion after dropping the memory? Describe what happened.",
    }),
    Object.freeze({
      id: "count",
      question:
        "Longest breath count before distraction, and the most common distraction.",
    }),
    Object.freeze({
      id: "open",
      question:
        "Open-focus depth, 0–5. Did body boundaries, time sense, sounds, or internal narration change?",
    }),
    Object.freeze({
      id: "moment",
      question: "What was the most interesting moment of the session?",
    }),
    Object.freeze({
      id: "question",
      question:
        "What question do you now have? Record it without forcing an answer today.",
    }),
    Object.freeze({
      id: "micro",
      question:
        "How many daytime micro-entries did you complete, and what became noticeable?",
    }),
    Object.freeze({
      id: "evening",
      question:
        "What was the strongest emotional reaction today, and did you notice it before acting from it?",
    }),
  ]);

export const DAY1_MICRO_PRACTICE = Object.freeze([
  "Stop only when you are safely stationary and not using tools, machinery, a ladder, or a vehicle.",
  "Relax the gaze and notice the entire visual field, including the edges of peripheral vision.",
  "Notice one distant sound, one nearby sound, and then all sounds together.",
  "Feel one natural breath at the center of the chest.",
  "Notice the space between you and surrounding objects, then ask once: What was I not noticing five seconds ago? Resume normal activity.",
] as const);

export const DAY1_EVENING_PRACTICE = Object.freeze([
  "Three minutes: review the day without judgment. Where was attention captured? Where did you remember the practice?",
  "Four minutes: repeat chest-focused breathing and generate appreciation. Release the memory and retain the state.",
  "Two minutes: with the physical body still, imagine lifting the right hand, left hand, both feet, then gently rocking left and right. Do not physically move.",
  "One minute: release every technique, notice awareness, and record the evening workbook fields.",
] as const);

export const CHILL_BRIAN_CUE_URLS = Object.freeze({
  0: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=9684dfc3-d99c-4aa7-9444-d13b5a5516e8.wav",
  45: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=13fbdbb7-53c5-4ca2-861d-270e6ed7acbb.wav",
  105: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=a500eedd-bc71-41a0-838f-57a6034012e3.wav",
  180: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=3d8859a3-aa87-412c-aa54-6beaee6c4252.wav",
  240: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=41c50376-d3ac-4fd1-9c77-266bea2882aa.wav",
  330: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=c21421c6-088b-4675-b134-18d03010407c.wav",
  420: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=976b9ad4-12b7-42c7-93b2-1a167ed65d8f.wav",
  480: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=2400975e-dcbe-459a-bf1f-4acbf71d762c.wav",
  600: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=c7abb0a4-4442-4708-90ef-0b392b22fde4.wav",
  720: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=4c2ae975-51d4-43ae-8631-cdbcf18e795c.wav",
  780: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=f6edc6e9-27e8-4252-aa3c-e8f347442b9e.wav",
  840: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=caf4d766-984c-423a-b1dd-37b4afbd9185.wav",
  930: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=27b14973-61e5-412d-9b54-24a14c341d3f.wav",
  1020: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=17c3e06f-f494-46a9-a19f-811b3617178e.wav",
  1110: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=456f9df5-d447-4fdc-92f3-f6ff7920a071.wav",
  1200: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=1a2f04aa-8b0e-47bd-9d6f-400200e0d4d0.wav",
  1290: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=48364aa0-0408-4c3b-9ae7-b49b49921dd6.wav",
  1360: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=a1b075b8-7215-46bc-85d6-12b7e6c9baad.wav",
  1380: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=5fcdd74e-ad41-42d9-886d-9d76259060db.wav",
  1440: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=40b617a1-cbf3-4d5b-a725-bef4e1f85cd6.wav",
  1490: "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=baeeea90-39f9-442c-bbb5-a3511088923d.wav",
} as const);

export const CHILL_BRIAN_AUDIO = Object.freeze({
  voice: "Chill Brian",
  preview:
    "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=2a454c20-aa17-4b2c-81e0-ec50a7d461d8.wav",
  lesson:
    "https://resource2.heygen.ai/text_to_speech/a0071e4bb842413bbeb2819c6b1de7c8/d2f4f24783d04e22ab49ee8fdc3715e0/id=e6a0aff3-99f6-4f27-9303-1665a1a167b4.wav",
  cues: CHILL_BRIAN_CUE_URLS,
} as const);

// Absolute cue times are measured from the start of the 25-minute practice.
// Spoken cue duration does not extend the timeline.
export const DAY1_CUES: readonly Day1Cue[] = Object.freeze([
  Object.freeze({
    at: 0,
    phase: "Physical Settling",
    tone: true,
    text: "Sit upright with the feet supported and the hands relaxed. Close your eyes. Let the jaw, tongue, shoulders, chest, abdomen, hands, pelvis, legs, and feet release unnecessary tension. Do not force relaxation. Notice contraction and allow a small release on each exhale.",
    audioUrl: CHILL_BRIAN_CUE_URLS[0],
  }),
  Object.freeze({
    at: 45,
    phase: "Physical Settling",
    tone: false,
    text: "Continue the body scan quietly. When you find tension, feel it accurately instead of fighting it.",
    audioUrl: CHILL_BRIAN_CUE_URLS[45],
  }),
  Object.freeze({
    at: 105,
    phase: "Physical Settling",
    tone: false,
    text: "Let the body become slightly heavier and less ready to do something. Breathing remains easy and unforced.",
    audioUrl: CHILL_BRIAN_CUE_URLS[105],
  }),
  Object.freeze({
    at: 180,
    phase: "Coherence",
    tone: true,
    text: "Now bring attention to the center of the chest. Breathe a little more slowly and comfortably, as though the breath enters and leaves through the chest.",
    audioUrl: CHILL_BRIAN_CUE_URLS[180],
  }),
  Object.freeze({
    at: 240,
    phase: "Coherence",
    tone: false,
    text: "Recall one specific memory that produces genuine appreciation. Use the memory only long enough to generate the physical and emotional feeling.",
    audioUrl: CHILL_BRIAN_CUE_URLS[240],
  }),
  Object.freeze({
    at: 330,
    phase: "Coherence",
    tone: false,
    text: "Release the memory now and try to keep the feeling itself. If the feeling fades, briefly use the memory again, then let the story go.",
    audioUrl: CHILL_BRIAN_CUE_URLS[330],
  }),
  Object.freeze({
    at: 420,
    phase: "Coherence",
    tone: false,
    text: "Remain with the body signature of appreciation. Let the body learn the state without needing the memory to continue.",
    audioUrl: CHILL_BRIAN_CUE_URLS[420],
  }),
  Object.freeze({
    at: 480,
    phase: "Single-Point Attention",
    tone: true,
    text: "Release the emotional exercise. Bring attention to the sensation of breathing at the nostrils. Count complete breath cycles from one to ten. Whenever attention wanders, restart at one without frustration.",
    audioUrl: CHILL_BRIAN_CUE_URLS[480],
  }),
  Object.freeze({
    at: 600,
    phase: "Single-Point Attention",
    tone: false,
    text: "Continue counting. The training repetition is noticing that attention was captured and deliberately returning it.",
    audioUrl: CHILL_BRIAN_CUE_URLS[600],
  }),
  Object.freeze({
    at: 720,
    phase: "Single-Point Attention",
    tone: false,
    text: "For the final minute of this phase, notice whether there is a tiny interval between a thought beginning and your decision to continue it.",
    audioUrl: CHILL_BRIAN_CUE_URLS[720],
  }),
  Object.freeze({
    at: 780,
    phase: "Open Focus",
    tone: true,
    text: "Stop counting. Become aware of the three-dimensional volume inside the head, behind the forehead and eyes, and from ear to ear.",
    audioUrl: CHILL_BRIAN_CUE_URLS[780],
  }),
  Object.freeze({
    at: 840,
    phase: "Open Focus",
    tone: false,
    text: "Expand awareness to the space immediately surrounding the head. Do not create an object. Become aware of volume and space.",
    audioUrl: CHILL_BRIAN_CUE_URLS[840],
  }),
  Object.freeze({
    at: 930,
    phase: "Open Focus",
    tone: false,
    text: "Move awareness to the chest as a volume, then include the space around the chest.",
    audioUrl: CHILL_BRIAN_CUE_URLS[930],
  }),
  Object.freeze({
    at: 1020,
    phase: "Open Focus",
    tone: false,
    text: "Become aware of the abdomen and pelvis as one spatial region, then include the space surrounding them.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1020],
  }),
  Object.freeze({
    at: 1110,
    phase: "Open Focus",
    tone: false,
    text: "Feel the entire body simultaneously as one three-dimensional volume occupying space.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1110],
  }),
  Object.freeze({
    at: 1200,
    phase: "Open Focus",
    tone: false,
    text: "Expand awareness several inches, then one foot, then several feet around the body. Let awareness include the surrounding space instead of remaining only inside the head.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1200],
  }),
  Object.freeze({
    at: 1290,
    phase: "Open Focus",
    tone: false,
    text: "Become aware of the entire room at once. Avoid naming objects. Experience the volume of the room.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1290],
  }),
  Object.freeze({
    at: 1360,
    phase: "Open Focus",
    tone: false,
    text: "Notice the farthest sound, then the nearest sound, and then let all sounds exist inside one auditory field. Thoughts can also appear inside the larger field without being pushed away.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1360],
  }),
  Object.freeze({
    at: 1380,
    phase: "Pure Observation",
    tone: true,
    text: "Release every technique now. No breath control, counting, visualization, or effort. Simply notice thoughts, sounds, sensations, and breathing.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1380],
  }),
  Object.freeze({
    at: 1440,
    phase: "Pure Observation",
    tone: false,
    text: "Ask once, silently: What is aware of all of this? Do not answer in words. Rest as simple awareness.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1440],
  }),
  Object.freeze({
    at: 1490,
    phase: "Return",
    tone: true,
    text: "Take a slightly deeper breath. Feel the chair and your feet. Open your eyes slowly and retain a little of the spacious awareness as you return.",
    audioUrl: CHILL_BRIAN_CUE_URLS[1490],
  }),
]);

export const DAY1_LIGHT_CUE_TIMESTAMPS = Object.freeze([
  0, 105, 180, 330, 480, 600, 780, 930, 1110, 1290, 1380, 1440, 1490,
] as const);

export const DAY1_MINIMAL_CUE_TIMESTAMPS = Object.freeze([
  0, 180, 480, 780, 1380, 1490,
] as const);

const LIGHT_CUE_TIMESTAMPS = new Set<number>(DAY1_LIGHT_CUE_TIMESTAMPS);
const MINIMAL_CUE_TIMESTAMPS = new Set<number>(DAY1_MINIMAL_CUE_TIMESTAMPS);

export function getDay1Cues(mode: Day1CueMode = "guided"): readonly Day1Cue[] {
  if (mode === "guided") return DAY1_CUES;
  const timestamps =
    mode === "light" ? LIGHT_CUE_TIMESTAMPS : MINIMAL_CUE_TIMESTAMPS;
  return DAY1_CUES.filter((cue) => timestamps.has(cue.at));
}
