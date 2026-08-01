from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SecurityContractTests(unittest.TestCase):
    def production_text(self):
        paths = [ROOT / "Dockerfile"]
        for directory in ("cmd", "internal", "runtime", "scripts"):
            for path in (ROOT / directory).rglob("*"):
                if (
                    path.is_file()
                    and not path.name.endswith("_test.go")
                    and path.name != "qualify.sh"
                    and "testfixture" not in path.parts
                ):
                    paths.append(path)
        return "\n".join(path.read_text(encoding="utf-8") for path in paths)

    def test_no_content_webhook_subscription_or_public_port_surface(self):
        text = self.production_text()
        forbidden = [
            r"/content(?:['\"? /]|$)",
            r"changeNotifications",
            r"subscriptions",
            r"(?m)^EXPOSE\s+",
            r"--publish(?:=|\s)",
            r"(?:^|\s)-p\s+[0-9]",
        ]
        for pattern in forbidden:
            self.assertIsNone(re.search(pattern, text, re.IGNORECASE), pattern)

    def test_no_secret_environment_or_cross_identity_projection(self):
        container_surface = "\n".join(
            path.read_text(encoding="utf-8") for path in [ROOT / "Dockerfile", ROOT / "runtime" / "run-container.sh"]
        )
        self.assertNotIn("--env ", container_surface)
        self.assertNotIn("--env-file", container_surface)
        self.assertNotIn("TEAMS_CLIENT_SECRET", container_surface)
        self.assertNotIn("TEAMS_CLIENT_ID", container_surface)
        self.assertNotIn("MSGRAPH_WEBHOOK_CLIENT_STATE\"", (ROOT / "Dockerfile").read_text(encoding="utf-8"))

    def test_private_identifiers_are_absent_from_safe_handoff_model(self):
        handoff = (ROOT / "internal" / "worker" / "handoff.go").read_text(encoding="utf-8")
        for field in ("ProviderArtifactID", "ProviderMeetingID", "DeltaLink", "OrganizerFingerprint"):
            self.assertNotIn(field, handoff)

    def test_deployment_uses_immutable_releases_and_previous_handle(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        self.assertIn("base=/opt/titus-meeting-processor", deploy)
        self.assertIn("releases=$base/releases", deploy)
        self.assertIn("previous_link=$base/previous", deploy)
        self.assertIn("ln -s", deploy)
        self.assertIn("--exclude='__pycache__/'", deploy)
        self.assertIn("--exclude='*.py[co]'", deploy)
        self.assertNotIn("cp -a /tmp/titus-meeting-processor-deploy/. /opt/titus-meeting-processor/source/", deploy)

    def test_deployment_revalidates_root_owned_nonwritable_release_before_build(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        promote = 'promote /tmp/titus-meeting-processor-deploy /opt/titus-meeting-processor/releases 0 0'
        validate = 'bash "$release_dir/scripts/release-tree.sh" validate "$release_dir" "$release_id" 0 0'
        self.assertIn(promote, deploy)
        self.assertIn(validate, deploy)
        self.assertLess(
            deploy.index(validate),
            deploy.index("previous_target="),
        )
        self.assertLess(
            deploy.index(validate),
            deploy.index('docker build --pull -t "$image" "$release_dir"'),
        )


if __name__ == "__main__":
    unittest.main()
