import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from local_qualify import run  # noqa: E402


class RuntimeModeTests(unittest.TestCase):
    def test_runtime_mode_does_not_promote_when_docker_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            old_path = os.environ.get("PATH")
            os.environ["PATH"] = "/nonexistent"
            try:
                code, _, report = run(
                    ROOT,
                    ROOT / "releases" / "hermes" / "0.19.0.yaml",
                    "runtime",
                    Path(directory) / "report.json",
                )
            finally:
                if old_path is None:
                    os.environ.pop("PATH", None)
                else:
                    os.environ["PATH"] = old_path

        self.assertEqual(code, 2)
        self.assertEqual(report["overall_status"], "not_run")
        self.assertEqual(report["promotion"], "blocked")
        self.assertIn(
            {"name": "runtime_smoke", "status": "not_run", "reason_code": "docker_unavailable"},
            report["gates"],
        )
        self.assertEqual(report["cleanup"]["status"], "passed")


if __name__ == "__main__":
    unittest.main()
