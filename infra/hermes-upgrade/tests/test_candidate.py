import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from candidate import ValidationError, load_yaml, validate_candidate  # noqa: E402


class CandidateValidationTests(unittest.TestCase):
    def setUp(self):
        self.candidate = ROOT / "releases" / "hermes" / "0.19.0.yaml"

    def test_accepts_current_baseline_candidate(self):
        result = validate_candidate(self.candidate)

        self.assertEqual(result["candidate_id"], "hermes-0.19.0-2026-07-20")
        self.assertEqual(result["agents"], ["walter", "titus", "mitchel"])
        self.assertEqual(result["policy"]["approvals_mode"], "manual")

    def test_rejects_broader_approval_policy(self):
        data = load_yaml(self.candidate)
        data["policy"]["approvals_mode"] = "smart"

        with self.assertRaisesRegex(ValidationError, "approvals_mode"):
            validate_candidate(data)

    def test_rejects_missing_immutable_image_identity(self):
        data = load_yaml(self.candidate)
        data["upstream"]["oci_index"] = "nousresearch/hermes-agent:latest"

        with self.assertRaisesRegex(ValidationError, "oci_index"):
            validate_candidate(data)

    def test_rejects_incomplete_agent_set(self):
        data = load_yaml(self.candidate)
        data["agents"] = ["walter", "titus"]

        with self.assertRaisesRegex(ValidationError, "agents"):
            validate_candidate(data)


if __name__ == "__main__":
    unittest.main()
