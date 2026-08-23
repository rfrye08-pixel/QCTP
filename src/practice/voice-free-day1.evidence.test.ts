import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getVoiceFreeManifestUrl,
  VOICE_FREE_DAY1_PHASES,
  VOICE_FREE_SUPPORT_MODES,
} from "./voice-free-day1";

interface VoiceFreeManifest {
  schema: string;
  release_authority: string;
  phases: Array<{
    id: string;
    start_seconds: number;
    end_seconds: number;
    marker_at_start: boolean;
  }>;
  assets: Array<{ path: string; sha256: string; duration_seconds: number }>;
  runtime_contract: {
    narration_used: boolean;
    completion_mode: string;
    early_end_completion_credit: boolean;
    shortened_test_completion_credit: boolean;
  };
}

const manifest = JSON.parse(
  readFileSync(
    resolve("public/audio/day1-source-rev0/voice-free-manifest.json"),
    "utf8",
  ),
) as VoiceFreeManifest;

describe("Rev3 P0 Voice-Free controlled media contract", () => {
  it("matches the exact six-phase runtime definition", () => {
    expect(
      manifest.phases.map((phase) => ({
        id: phase.id,
        start_seconds: phase.start_seconds,
        end_seconds: phase.end_seconds,
        marker_at_start: phase.marker_at_start,
      })),
    ).toEqual(
      VOICE_FREE_DAY1_PHASES.map((phase) => ({
        id: phase.id,
        start_seconds: phase.startSeconds,
        end_seconds: phase.endSeconds,
        marker_at_start: phase.markerAtStart,
      })),
    );
    expect(
      manifest.phases.filter((phase) => phase.marker_at_start),
    ).toHaveLength(5);
  });

  it("aligns every runtime support filename and checksum with the clean manifest", () => {
    const runtimeAssets = Object.values(VOICE_FREE_SUPPORT_MODES).map(
      (asset) => ({
        path: asset.fileName,
        sha256: asset.sha256,
      }),
    );
    expect(
      manifest.assets.map((asset) => ({
        path: asset.path,
        sha256: asset.sha256,
      })),
    ).toEqual(runtimeAssets);
    expect(
      manifest.assets.every((asset) => asset.duration_seconds === 1_500),
    ).toBe(true);
    expect(getVoiceFreeManifestUrl()).toMatch(
      /audio\/day1-source-rev0\/voice-free-manifest\.json$/,
    );
  });

  it("cannot promote rejected narration, test runs, or early exits", () => {
    expect(manifest.schema).toBe("qctp-rev3-voice-free-day1-media-v1");
    expect(manifest.release_authority).toBe("ZERO_RELEASE");
    expect(manifest.runtime_contract).toMatchObject({
      narration_used: false,
      completion_mode: "VOICE_FREE_FALLBACK",
      early_end_completion_credit: false,
      shortened_test_completion_credit: false,
    });
  });
});
