import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).parents[3]


class ComposeHarnessTests(unittest.TestCase):
    def test_runtime_harness_is_internal_and_hardened(self):
        compose = yaml.safe_load(
            (ROOT / "infra/hermes-upgrade/runtime-compose.yaml").read_text()
        )

        self.assertTrue(compose["networks"]["hermes_internal"]["internal"])
        self.assertEqual(
            set(compose["services"]), {"stubs", "walter", "titus", "mitchel"}
        )
        for service in compose["services"].values():
            self.assertEqual(service["read_only"], True)
            self.assertIn("ALL", service["cap_drop"])
            self.assertIn("no-new-privileges:true", service["security_opt"])
            self.assertNotIn("ports", service)

        for agent in ("walter", "titus", "mitchel"):
            self.assertEqual(compose["services"][agent]["pull_policy"], "never")

        for agent in ("walter", "titus", "mitchel"):
            environment = compose["services"][agent]["environment"]
            self.assertEqual(environment["HERMES_DELIVERY_MODE"], "disabled")
            self.assertEqual(environment["HERMES_APPROVALS_MODE"], "manual")
            self.assertEqual(environment["HERMES_APPROVALS_CRON_MODE"], "deny")


if __name__ == "__main__":
    unittest.main()
