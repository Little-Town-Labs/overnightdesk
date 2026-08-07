import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from candidate import load_yaml, validate_profiles  # noqa: E402
from stubs.server import create_server, exercise_profiles  # noqa: E402


class StubServerTests(unittest.TestCase):
    def test_allowed_and_denied_operations_are_deterministic(self):
        server = create_server()
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/v1/operation"
            request = urllib.request.Request(
                url,
                data=b'{"operation":"health.read"}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(b'"delivery": "disabled"', response.read())

            denied = urllib.request.Request(
                url,
                data=b'{"operation":"teams.send"}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as context:
                urllib.request.urlopen(denied)
            self.assertEqual(context.exception.code, 403)
            self.assertIn(b'"delivery_attempted": false', context.exception.read())
            context.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_all_profiles_exercise_allowed_and_denied_contracts(self):
        stubs = load_yaml(ROOT / "infra/hermes-upgrade/stubs/services.yaml")
        profiles = validate_profiles(ROOT, stubs)

        results = exercise_profiles(profiles)

        self.assertEqual(
            results,
            {
                "walter": ("passed", "stub_operations_verified"),
                "titus": ("passed", "stub_operations_verified"),
                "mitchel": ("passed", "stub_operations_verified"),
            },
        )


if __name__ == "__main__":
    unittest.main()
