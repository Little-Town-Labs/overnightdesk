import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[3]
sys.path.insert(0, str(ROOT / "infra" / "hermes-upgrade"))

from candidate import load_yaml, validate_profiles  # noqa: E402


class ProfileValidationTests(unittest.TestCase):
    def test_all_named_agents_have_valid_profiles_and_stubs(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")

        profiles = validate_profiles(ROOT, stubs)

        self.assertEqual(set(profiles), {"walter", "titus", "mitchel"})
        for profile in profiles.values():
            self.assertEqual(profile["state"]["mode"], "synthetic")
            self.assertTrue(profile["required_stubs"])

    def test_missing_stub_is_rejected(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        stubs["services"] = [item for item in stubs["services"] if item["name"] != "teams"]

        with self.assertRaisesRegex(ValueError, "teams"):
            validate_profiles(ROOT, stubs)

    def test_profile_cannot_use_production_state(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        profile_path = ROOT / "tenants" / "hermes-walter" / "qualification" / "profile.yaml"
        profile = load_yaml(profile_path)
        profile["state"]["mode"] = "production"

        with self.assertRaisesRegex(ValueError, "synthetic"):
            validate_profiles(ROOT, stubs, {"walter": profile})

    def test_profile_cannot_escape_its_source_root(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        profile_path = ROOT / "tenants" / "hermes-walter" / "qualification" / "profile.yaml"
        profile = load_yaml(profile_path)
        profile["required_paths"] = ["../hermes-titus/config/config.yaml"]

        with self.assertRaisesRegex(ValueError, "required_path"):
            validate_profiles(ROOT, stubs, {"walter": profile})

    def test_stub_catalog_rejects_nonlocal_endpoint(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        stubs["services"][0]["endpoint"] = "https://production.example.test"

        with self.assertRaisesRegex(ValueError, "endpoint"):
            validate_profiles(ROOT, stubs)

    def test_stub_catalog_rejects_external_dns_hidden_by_stub_name(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        stubs["services"][0]["endpoint"] = "http://hermes-stub-health.example.test:8080"

        with self.assertRaisesRegex(ValueError, "endpoint"):
            validate_profiles(ROOT, stubs)

    def test_stub_catalog_rejects_malformed_port(self):
        stubs = load_yaml(ROOT / "infra" / "hermes-upgrade" / "stubs" / "services.yaml")
        stubs["services"][0]["endpoint"] = "http://hermes-stub-health:not-a-port"

        with self.assertRaisesRegex(ValueError, "endpoint"):
            validate_profiles(ROOT, stubs)


if __name__ == "__main__":
    unittest.main()
