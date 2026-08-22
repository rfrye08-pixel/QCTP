/**
 * Independent fingerprint fixture captured from the controlled Rev1.1.4
 * production sources on origin/main. Change only under a new curriculum
 * authority revision, never as part of an implementation refactor.
 */
export const DAY1_REV114_REGRESSION_FIXTURE = Object.freeze({
  sourceBlobs: Object.freeze({
    app: "a09de4a5fa4951f05c1427107656126c8f5c3c9a",
    neuralAudioMap: "f7e34cd3d54e8deaa60ec00bf9b3101bc987883c",
    hotfix113: "fbc7393a927c2847e3ad27952024c38bcc390468",
    hotfix114: "497f277c72d5cf0f2d54e6d666758c534e66c8f6",
  }),
  durationSeconds: 1_500,
  cueTimestamps: Object.freeze([
    0, 45, 105, 180, 240, 330, 420, 480, 600, 720, 780, 840, 930, 1_020, 1_110,
    1_200, 1_290, 1_360, 1_380, 1_440, 1_490,
  ]),
  toneTimestamps: Object.freeze([0, 180, 480, 780, 1_380, 1_490]),
  lessonParagraphsFNV1a32: "3188f797",
  cueCoreFNV1a32: "a94eaf72",
  chillBrianManifestFNV1a32: "a96b1218",
} as const);
