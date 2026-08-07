import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from local_qualify import unsafe_environment_values  # noqa: E402


class IsolationTests(unittest.TestCase):
    def test_clean_local_environment_is_allowed(self):
        self.assertEqual(unsafe_environment_values({"CI": "true", "HOME": "/tmp/test"}), [])

    def test_phase_path_is_rejected_without_printing_value(self):
        findings = unsafe_environment_values(
            {"HERMES_RUNTIME_FILE": "/run/phase/apps/hermes-titus/runtime.env"}
        )

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["name"], "HERMES_RUNTIME_FILE")
        self.assertNotIn("/run/phase", findings[0]["reason"])

    def test_realistic_secret_environment_is_rejected(self):
        findings = unsafe_environment_values({"AGENTMAIL_API_KEY": "real-looking-value"})

        self.assertEqual([item["name"] for item in findings], ["AGENTMAIL_API_KEY"])

    def test_placeholder_secret_environment_is_allowed(self):
        self.assertEqual(
            unsafe_environment_values({"AGENTMAIL_API_KEY": "local-placeholder"}), []
        )


if __name__ == "__main__":
    unittest.main()
