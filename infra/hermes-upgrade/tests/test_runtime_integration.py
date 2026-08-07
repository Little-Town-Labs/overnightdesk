import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
CANDIDATE = ROOT / "releases/hermes/0.19.0.yaml"


def docker_candidate_available() -> bool:
    if os.environ.get("HERMES_RUN_DOCKER_TESTS") != "1":
        return False
    docker = shutil.which("docker")
    if not docker:
        return False
    compose = subprocess.run(
        [docker, "compose", "version"], capture_output=True, check=False
    )
    if compose.returncode != 0:
        return False
    image = "overnightdesk/hermes-agent:0.19.0-coder"
    inspected = subprocess.run(
        [docker, "image", "inspect", image], capture_output=True, check=False
    )
    return inspected.returncode == 0


@unittest.skipUnless(
    docker_candidate_available(),
    "set HERMES_RUN_DOCKER_TESTS=1 with Docker and the candidate image to run",
)
class RuntimeIntegrationTests(unittest.TestCase):
    def test_candidate_runtime_profiles_pass_in_isolated_compose_harness(self):
        report = Path("/tmp/hermes-runtime-integration-report.json")
        result = subprocess.run(
            [
                str(ROOT / "infra/hermes-upgrade/local-qualify.sh"),
                "--candidate",
                str(CANDIDATE),
                "--mode",
                "runtime",
                "--report",
                str(report),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(report.read_text())
        self.assertEqual(payload["overall_status"], "passed")
        self.assertEqual(payload["promotion"], "eligible_for_aegis_staging")
        self.assertEqual(payload["gates"][-1]["reason_code"], "runtime_profiles_verified")


if __name__ == "__main__":
    unittest.main()
