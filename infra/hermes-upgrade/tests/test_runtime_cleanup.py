import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
import sys

sys.path.insert(0, str(ROOT / "infra/hermes-upgrade"))

from candidate import load_yaml, validate_profiles  # noqa: E402
from local_qualify import _cleanup_synthetic_state, _create_synthetic_state  # noqa: E402


class RuntimeCleanupTests(unittest.TestCase):
    def test_concurrent_synthetic_runs_are_unique_and_cleanup_owned_state(self):
        profiles = validate_profiles(
            ROOT,
            load_yaml(ROOT / "infra/hermes-upgrade/stubs/services.yaml"),
        )
        with tempfile.TemporaryDirectory() as directory:
            first = _create_synthetic_state(Path(directory) / "run-one", profiles)
            second = _create_synthetic_state(Path(directory) / "run-two", profiles)

            self.assertNotEqual(first, second)
            self.assertTrue((first / "walter" / "state.json").is_file())
            self.assertTrue((second / "mitchel" / "state.json").is_file())

            self.assertEqual(_cleanup_synthetic_state(first)[0], "passed")
            self.assertTrue(second.exists())
            self.assertEqual(_cleanup_synthetic_state(second)[0], "passed")
            self.assertFalse(first.exists())
            self.assertFalse(second.exists())


if __name__ == "__main__":
    unittest.main()
