import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from reporting import (  # noqa: E402
    build_report,
    finalize_report,
    write_report,
)


class ReportingTests(unittest.TestCase):
    def test_source_report_has_all_agents_and_blocks_promotion(self):
        report = build_report(
            {"candidate_id": "candidate-1"}, "source", "x86_64", "run-1"
        )
        report["agents"] = [
            {"agent": name, "status": "passed", "reason_code": "profile_valid"}
            for name in ("walter", "titus", "mitchel")
        ]

        finalize_report(report)

        self.assertEqual(report["overall_status"], "passed")
        self.assertEqual(report["promotion"], "blocked")
        self.assertEqual(report["candidate"]["candidate_id"], "candidate-1")

    def test_runtime_report_cannot_be_eligible_with_a_failed_agent(self):
        report = build_report(
            {"candidate_id": "candidate-1"}, "runtime", "aarch64", "run-2"
        )
        report["agents"] = [
            {"agent": "walter", "status": "failed", "reason_code": "stub_missing"},
            {"agent": "titus", "status": "passed", "reason_code": "profile_valid"},
            {"agent": "mitchel", "status": "passed", "reason_code": "profile_valid"},
        ]

        finalize_report(report)

        self.assertEqual(report["overall_status"], "failed")
        self.assertEqual(report["promotion"], "blocked")

    def test_runtime_image_smoke_alone_cannot_authorize_promotion(self):
        report = build_report(
            {"candidate_id": "candidate-1"}, "runtime", "aarch64", "run-4"
        )
        report["agents"] = [
            {"agent": name, "status": "passed", "reason_code": "image_smoke"}
            for name in ("walter", "titus", "mitchel")
        ]
        report["gates"] = [
            {"name": "runtime_smoke", "status": "passed", "reason_code": "candidate_version_verified"},
            {"name": "runtime_profiles", "status": "not_run", "reason_code": "agent_runtime_qualification_pending"},
        ]

        finalize_report(report)

        self.assertEqual(report["overall_status"], "not_run")
        self.assertEqual(report["promotion"], "blocked")

    def test_failed_isolation_gate_is_failed_even_when_agents_are_not_run(self):
        report = build_report(
            {"candidate_id": "candidate-1"}, "source", "x86_64", "run-5"
        )
        report["agents"] = [
            {"agent": name, "status": "not_run", "reason_code": "local_isolation_failed"}
            for name in ("walter", "titus", "mitchel")
        ]
        report["gates"] = [
            {"name": "local_isolation", "status": "failed", "reason_code": "unsafe_environment"}
        ]

        finalize_report(report)

        self.assertEqual(report["overall_status"], "failed")
        self.assertEqual(report["promotion"], "blocked")

    def test_report_serialization_is_json(self):
        report = build_report({"candidate_id": "candidate-1"}, "source", "x86_64", "run-3")
        report["agents"] = [
            {"agent": name, "status": "passed", "reason_code": "profile_valid"}
            for name in ("walter", "titus", "mitchel")
        ]
        finalize_report(report)

        with tempfile.TemporaryDirectory() as directory:
            path = write_report(report, Path(directory) / "report.json")
            self.assertEqual(json.loads(path.read_text())["run_id"], "run-3")


if __name__ == "__main__":
    unittest.main()
