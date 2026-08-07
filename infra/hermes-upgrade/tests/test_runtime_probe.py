import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
PROBE = ROOT / "infra/hermes-upgrade/runtime_probe.py"


class RuntimeProbeTests(unittest.TestCase):
    def test_probe_rejects_delivery_enabled_environment_before_startup(self):
        environment = dict(os.environ)
        environment.update(
            {
                "HERMES_AGENT_NAME": "walter",
                "HERMES_DELIVERY_MODE": "enabled",
                "HERMES_APPROVALS_MODE": "manual",
                "HERMES_APPROVALS_CRON_MODE": "deny",
            }
        )
        result = subprocess.run(
            [sys.executable, str(PROBE)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 3)

    def test_probe_is_syntax_valid(self):
        result = subprocess.run(
            [sys.executable, "-m", "py_compile", str(PROBE)],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
