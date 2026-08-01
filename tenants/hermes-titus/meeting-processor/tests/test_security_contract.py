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

    def test_only_exact_transcript_and_recording_content_routes(self):
        content_client = (ROOT / "internal" / "graph" / "content.go").read_text(encoding="utf-8")
        recording_client = (ROOT / "internal" / "graph" / "recording.go").read_text(encoding="utf-8")
        self.assertIn('"/transcripts/" + url.PathEscape(transcriptID) + "/content"', content_client)
        self.assertNotIn("recordings/", content_client.lower())
        self.assertIn('"/recordings/" + url.PathEscape(recordingID) + "/content"', recording_client)
        paths = []
        for directory in ("cmd", "internal", "runtime", "scripts"):
            for path in (ROOT / directory).rglob("*"):
                if (
                    path.is_file()
                    and path not in (ROOT / "internal" / "graph" / "content.go", ROOT / "internal" / "graph" / "recording.go")
                    and not path.name.endswith("_test.go")
                    and path.name != "qualify.sh"
                    and "testfixture" not in path.parts
                ):
                    paths.append(path)
        text = "\n".join(path.read_text(encoding="utf-8") for path in paths)
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

    def test_feature_035_install_and_rollback_preserve_feature_034_marker(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        deactivate_feature = deploy.split("deactivate_feature035() {", 1)[1].split("\n}\n\npromote()", 1)[0]
        install_disabled = deploy.split("install_disabled() {", 1)[1].split("\n}\n\ninitialize()", 1)[0]
        install_feature = deploy.split("install_feature035_disabled() {", 1)[1].split("\n}\n\ninitialize()", 1)[0]
        verify_feature = deploy.split("verify_feature035_disabled() {", 1)[1].split("\n}\n\nenable_content()", 1)[0]
        restore_brief_disabled = deploy.split("restore_brief_disabled() {", 1)[1].split("\n}\n\nenable_brief()", 1)[0]
        enable_brief = deploy.split("enable_brief() {", 1)[1].split("\n}\n\nverify_brief()", 1)[0]
        verify_brief = deploy.split("verify_brief() {", 1)[1].split("\n}\n\nretention_sweep()", 1)[0]
        disable_brief = deploy.split("disable_brief() {", 1)[1].split("\n}\n\nverify_disabled()", 1)[0]
        self.assertIn('rm -f -- "$brief_marker" "$filing_marker"', deactivate_feature)
        self.assertNotIn('rm -f -- "$content_marker"', deactivate_feature)
        self.assertIn("systemctl disable --now titus-meeting-analyzer.service titus-meeting-filer.service", deactivate_feature)
        self.assertIn("for unit in titus-meeting-analyzer.service titus-meeting-filer.service", deactivate_feature)
        self.assertIn('test "$(systemctl is-enabled "$unit" 2>/dev/null || true)" != enabled', deactivate_feature)
        self.assertIn("inactive|failed|unknown", deactivate_feature)
        self.assertIn("docker ps --filter name=^/hermes-titus-meeting-analyzer$", deactivate_feature)
        self.assertIn("--filter name=^/titus-meeting-filer$", deactivate_feature)
        self.assertIn("test -z", deactivate_feature)
        self.assertIn('(has("MEETING_BRIEF_ENABLED") | not) and (has("MEETING_FILING_ENABLED") | not)', deactivate_feature)
        self.assertIn('has("MEETING_REVIEW_ENABLED") | not', deactivate_feature)
        self.assertIn("systemctl restart hermes-email-intake@titus.service", deactivate_feature)
        self.assertLess(install_disabled.index('"$root/scripts/qualify.sh"'), install_disabled.index("deactivate_feature035"))
        self.assertLess(install_disabled.index("deactivate_feature035"), install_disabled.index("promote"))
        self.assertIn("verify_feature035_disabled", install_disabled)
        self.assertIn('"$root/../meeting-filer/scripts/deploy-aegis.sh" install-disabled', install_feature)
        self.assertIn('"$root/../meeting-filer/scripts/deploy-aegis.sh" initialize', install_feature)
        self.assertIn('test -e "$content_marker"; then verify_content; else verify_content_disabled', verify_feature)
        self.assertIn("titus-meeting-analyzer.service", verify_feature)
        self.assertIn("titus-meeting-filer.service", verify_feature)
        self.assertIn("hermes-titus.service", verify_feature)
        self.assertIn("hermes-email-intake@titus.service", verify_feature)
        self.assertIn('has("MEETING_REVIEW_ENABLED") | not', verify_feature)
        self.assertIn("systemctl restart hermes-email-intake@titus.service", enable_brief)
        self.assertIn('if ! "${ssh_cmd[@]}" sudo bash -s -- "$brief_marker"', enable_brief)
        self.assertGreaterEqual(enable_brief.count("restore_brief_disabled || true"), 2)
        self.assertIn('rm -f -- "$brief_marker" "$filing_marker"', restore_brief_disabled)
        self.assertIn("systemctl restart hermes-email-intake@titus.service", restore_brief_disabled)
        self.assertIn('.MEETING_REVIEW_ENABLED == "true"', verify_brief)
        self.assertIn("systemctl restart hermes-email-intake@titus.service", disable_brief)
        self.assertIn('test -e "$content_marker"; then verify_content; else verify_content_disabled', disable_brief)


if __name__ == "__main__":
    unittest.main()
