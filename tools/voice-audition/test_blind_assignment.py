#!/usr/bin/env python3
"""Regression tests for replaying a blind assignment without public disclosure."""
from __future__ import annotations

import json
import pathlib
import tempfile
import unittest
from types import SimpleNamespace

from build_rev3_voice_audition import resolve_route_assignment


class BlindAssignmentTests(unittest.TestCase):
    def test_private_mapping_replays_label_order(self) -> None:
        routes = [SimpleNamespace(route_id=value) for value in ("R1", "R2", "R3")]
        reveal = {
            "schema": "qctp-rev3-blind-natural-voice-route-reveal-v1",
            "release_authority": "ZERO_RELEASE",
            "samples": [
                {"sample_code": "A", "route_id": "R2"},
                {"sample_code": "B", "route_id": "R3"},
                {"sample_code": "C", "route_id": "R1"},
            ],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            mapping_path = pathlib.Path(temp_dir) / "route-reveal.json"
            mapping_path.write_text(json.dumps(reveal), encoding="utf-8")
            assigned, provenance = resolve_route_assignment(
                routes, blind_seed=None, private_mapping_input=mapping_path
            )

        self.assertEqual([route.route_id for route in assigned], ["R2", "R3", "R1"])
        self.assertEqual(provenance["algorithm"], "CONTROLLED_PRIVATE_MAPPING_REPLAY")
        self.assertRegex(provenance["input_commitment_sha256"], r"^[0-9a-f]{64}$")

    def test_private_mapping_fails_closed_on_route_set_drift(self) -> None:
        routes = [SimpleNamespace(route_id=value) for value in ("R1", "R2", "R3")]
        reveal = {
            "schema": "qctp-rev3-blind-natural-voice-route-reveal-v1",
            "release_authority": "ZERO_RELEASE",
            "samples": [
                {"sample_code": "A", "route_id": "R1"},
                {"sample_code": "B", "route_id": "R2"},
                {"sample_code": "C", "route_id": "OLD_ROUTE"},
            ],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            mapping_path = pathlib.Path(temp_dir) / "route-reveal.json"
            mapping_path.write_text(json.dumps(reveal), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "does not match the current route set"):
                resolve_route_assignment(
                    routes, blind_seed=None, private_mapping_input=mapping_path
                )


if __name__ == "__main__":
    unittest.main()
