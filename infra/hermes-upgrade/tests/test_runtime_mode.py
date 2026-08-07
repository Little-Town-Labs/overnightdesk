import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from local_qualify import _runtime_smoke, run  # noqa: E402


class RuntimeModeTests(unittest.TestCase):
    @patch("local_qualify.subprocess.run")
    @patch("local_qualify.shutil.which", return_value="/usr/bin/docker")
    def test_runtime_smoke_mounts_synthetic_state(self, _which, subprocess_run):
        expected_image_id = "sha256:expected"
        subprocess_run.side_effect = [
            type("Completed", (), {"returncode": 0, "stdout": expected_image_id + "\n"})(),
            type("Completed", (), {"returncode": 0, "stdout": "Hermes Agent v0.19.0"})(),
        ]

        with tempfile.TemporaryDirectory() as directory:
            status, reason = _runtime_smoke(
                "overnightdesk/hermes-agent:0.19.0-coder",
                expected_image_id,
                Path(directory),
            )

        self.assertEqual((status, reason), ("passed", "candidate_version_verified"))
        version_command = subprocess_run.call_args_list[1].args[0]
        self.assertIn("--volume", version_command)
        self.assertIn(f"{directory}:/opt/data:rw", version_command)

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
