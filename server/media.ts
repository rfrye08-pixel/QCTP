import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";

import { AppError } from "./errors.js";

export interface UploadedAudio {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

export interface MediaProbeResult {
  readonly detectedMimeType: string;
  readonly extension: string;
  readonly durationMs: number;
}

export interface MediaProbe {
  probe(file: UploadedAudio): Promise<MediaProbeResult>;
}

const declaredMimeExtensions = new Map<string, ReadonlySet<string>>([
  ["audio/aac", new Set(["aac"])],
  ["audio/flac", new Set(["flac"])],
  ["audio/mp4", new Set(["m4a", "mp4"])],
  ["audio/x-m4a", new Set(["m4a", "mp4"])],
  ["audio/mpeg", new Set(["mp3", "mp2", "mp1", "mpga"])],
  ["audio/mp3", new Set(["mp3"])],
  ["audio/ogg", new Set(["ogg", "oga", "opus"])],
  ["audio/opus", new Set(["opus", "ogg"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/x-wav", new Set(["wav"])],
  ["audio/webm", new Set(["webm"])],
]);

const detectedMimeExtensions = new Map<string, ReadonlySet<string>>([
  ["audio/aac", new Set(["aac"])],
  ["audio/flac", new Set(["flac"])],
  ["audio/mp4", new Set(["m4a", "mp4"])],
  ["video/mp4", new Set(["m4a", "mp4"])],
  ["audio/mpeg", new Set(["mp3", "mp2", "mp1", "mpga"])],
  ["audio/ogg", new Set(["ogg", "oga", "opus"])],
  ["audio/opus", new Set(["opus", "ogg"])],
  ["audio/vnd.wave", new Set(["wav"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/webm", new Set(["webm"])],
  ["video/webm", new Set(["webm"])],
]);

const normalizeMimeType = (mimeType: string): string =>
  mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

const setsOverlap = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean => [...left].some((value) => right.has(value));

export class ValidatingMediaProbe implements MediaProbe {
  readonly #maxBytes: number;
  readonly #maxDurationMs: number;

  constructor(options: { maxBytes: number; maxDurationMs: number }) {
    this.#maxBytes = options.maxBytes;
    this.#maxDurationMs = options.maxDurationMs;
  }

  async probe(file: UploadedAudio): Promise<MediaProbeResult> {
    if (file.size > this.#maxBytes || file.buffer.byteLength > this.#maxBytes) {
      throw new AppError({
        code: "AUDIO_SIZE_LIMIT",
        message: "The audio file exceeds the upload size limit.",
        status: 413,
      });
    }

    const declaredMimeType = normalizeMimeType(file.mimetype);
    const declaredExtensions = declaredMimeExtensions.get(declaredMimeType);
    if (declaredExtensions === undefined) {
      throw new AppError({
        code: "AUDIO_TYPE_UNSUPPORTED",
        message: "The declared audio type is not supported.",
        status: 415,
      });
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    const detectedExtensions =
      detected === undefined
        ? undefined
        : detectedMimeExtensions.get(detected.mime);
    if (detected === undefined || detectedExtensions === undefined) {
      throw new AppError({
        code: "AUDIO_TYPE_UNSUPPORTED",
        message: "The uploaded file is not a supported audio format.",
        status: 415,
      });
    }

    if (
      !declaredExtensions.has(detected.ext) &&
      !setsOverlap(declaredExtensions, detectedExtensions)
    ) {
      throw new AppError({
        code: "AUDIO_SIGNATURE_MISMATCH",
        message: "The audio signature does not match its declared type.",
        status: 415,
      });
    }

    let durationSeconds: number | undefined;
    try {
      const metadata = await parseBuffer(
        file.buffer,
        { mimeType: detected.mime, size: file.size },
        { duration: true, skipCovers: true },
      );
      durationSeconds = metadata.format.duration;
    } catch (error: unknown) {
      throw new AppError({
        code: "AUDIO_METADATA_INVALID",
        message: "The audio metadata could not be validated.",
        status: 422,
        cause: error,
      });
    }

    if (
      durationSeconds === undefined ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new AppError({
        code: "AUDIO_METADATA_INVALID",
        message: "The audio duration could not be validated.",
        status: 422,
      });
    }

    const durationMs = Math.ceil(durationSeconds * 1_000);
    if (durationMs > this.#maxDurationMs) {
      throw new AppError({
        code: "AUDIO_DURATION_LIMIT",
        message: "The audio exceeds the transcription duration limit.",
        status: 413,
        details: { maxDurationMs: this.#maxDurationMs },
      });
    }

    return {
      detectedMimeType: detected.mime,
      extension: detected.ext,
      durationMs,
    };
  }
}
