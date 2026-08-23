import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VoiceFreePhasePlan } from "./VoiceFreePhasePlan";

afterEach(cleanup);

describe("VoiceFreePhasePlan controlled provenance", () => {
  it("shows phase-level source, synthesis-transition, and original QCTP badges", () => {
    const { container } = render(<VoiceFreePhasePlan />);

    const expected = {
      "foundation.day1.phase.baseline-observation": "QCTP_ORIGINAL",
      "foundation.day1.phase.bullard-contraction": "SOURCE_ENHANCED",
      "foundation.day1.transition.bullard-to-heartmath": "QCTP_SYNTHESIS",
      "foundation.day1.phase.pure-observation": "QCTP_ORIGINAL",
      "foundation.day1.phase.return": "QCTP_ORIGINAL",
    } as const;
    for (const [authorityKey, contentClass] of Object.entries(expected)) {
      expect(
        container.querySelector(`[data-content-authority="${authorityKey}"]`),
      ).toHaveAttribute("data-content-class", contentClass);
    }
  });
});
