#!/usr/bin/env python3
"""Regression tests for immutable Day 1 audition-cue grounding."""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
GROUND = ROOT / "tools" / "voice-audition" / "ground_rev3_voice_audition_cues.py"
SCRIPT = ROOT / "tools" / "voice-audition" / "audition-script.rev0.json"
CHECKED_IN_EVIDENCE = ROOT / "tools" / "voice-audition" / "cue-grounding.rev0.json"


def run_grounding(script: pathlib.Path, output: pathlib.Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(GROUND),
            "--repository",
            str(ROOT),
            "--authority-ref",
            "origin/main",
            "--script",
            str(script),
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
    )


class CueGroundingTests(unittest.TestCase):
    def test_checked_in_evidence_reproduces_from_origin_main(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = pathlib.Path(directory) / "cue-grounding.json"
            result = run_grounding(SCRIPT, output)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(output.read_bytes(), CHECKED_IN_EVIDENCE.read_bytes())
            evidence = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(evidence["result"], "PASS")
            self.assertEqual(
                [cue["source_cue_id"] for cue in evidence["cues"]],
                [
                    "D1-A02-000",
                    "D1-A02-210",
                    "D1-A02-245",
                    "D1-A02-480",
                    "D1-A02-1440",
                    "D1-A02-1495",
                ],
            )
            self.assertTrue(all(cue["exact_text_match"] for cue in evidence["cues"]))
            self.assertTrue(all(cue["declared_hashes_match"] for cue in evidence["cues"]))

    def test_changed_audition_wording_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            temp = pathlib.Path(directory)
            changed_script = temp / "audition-script.json"
            document = json.loads(SCRIPT.read_text(encoding="utf-8"))
            document["segments"][0]["text"] += " Changed."
            changed_script.write_text(json.dumps(document), encoding="utf-8")
            result = run_grounding(changed_script, temp / "evidence.json")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("audition wording differs from controlled authority", result.stdout + result.stderr)
            self.assertFalse((temp / "evidence.json").exists())


if __name__ == "__main__":
    unittest.main()
