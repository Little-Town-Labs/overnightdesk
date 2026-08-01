from pathlib import Path
import os
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SecurityContractTests(unittest.TestCase):
    def test_runtime_projection_has_separate_host_and_container_readers(self):
        loader = (ROOT / "runtime" / "load-phase-config.sh").read_text(encoding="utf-8")
        runner = (ROOT / "runtime" / "run-container.sh").read_text(encoding="utf-8")
        service = (ROOT / "runtime" / "titus-meeting-filer.service").read_text(encoding="utf-8")

        self.assertIn('install -d -o root -g 10005 -m 0750 "$runtime_dir"', loader)
        self.assertIn('install -o root -g 10004 -m 0440', loader)
        self.assertIn('--user 10000:10000 --group-add 10004', runner)
        self.assertIn('test "$(stat -c %u:%g:%a "$runtime_dir")" = 0:10005:750', runner)
        self.assertIn('test "$(stat -c %u:%g:%a "$runtime")" = 0:10004:440', runner)
        self.assertIn("User=titus-meeting-filer", service)
        self.assertIn("Group=titus-meeting-filer", service)

    def test_deployment_uses_immutable_releases_and_previous_handle(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        self.assertIn("base=/opt/titus-meeting-filer", deploy)
        self.assertIn("releases=$base/releases", deploy)
        self.assertIn("previous_link=$base/previous", deploy)
        self.assertIn("release_image=$image_repo:$image_tag-$release_id", deploy)
        self.assertIn('docker tag "$release_image" "$image"', deploy)
        self.assertIn('bash "$release_dir/scripts/release-tree.sh" validate', deploy)
        self.assertNotIn('find "$base/source" -mindepth 1 -delete', deploy)
        self.assertNotIn('cp -a /tmp/titus-meeting-filer-deploy/. "$base/source/"', deploy)

    def test_rollback_restores_release_and_image_without_touching_state(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        self.assertIn('previous_target=$(readlink -f "$previous_link")', deploy)
        self.assertIn('docker tag "$previous_image" "$image"', deploy)
        self.assertIn("docker volume inspect titus-meeting-filer-data", deploy)
        self.assertNotIn("docker volume rm", deploy)

    def test_disabled_install_reloads_the_processor_without_filing_authority(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        install_disabled = deploy.split("install_disabled() {", 1)[1].split("\n}\n\ninitialize()", 1)[0]
        verify_disabled = deploy.split("verify_disabled() {", 1)[1].split("\n}\n\ndisable()", 1)[0]

        self.assertIn('rm -f -- "$marker"', install_disabled)
        self.assertIn("systemctl disable --now titus-meeting-filer.service", install_disabled)
        self.assertIn("systemctl is-active --quiet titus-meeting-processor.service", install_disabled)
        self.assertIn("/opt/titus-meeting-processor/bin/load-phase-config.sh", install_disabled)
        self.assertIn("systemctl restart titus-meeting-processor.service", install_disabled)
        self.assertIn("verify_disabled", install_disabled)
        self.assertIn("has(\"MEETING_FILING_ENABLED\") | not", verify_disabled)

    def test_enable_failure_invokes_fail_closed_disable(self):
        deploy = (ROOT / "scripts" / "deploy-aegis.sh").read_text(encoding="utf-8")
        enable = deploy.split("enable() {", 1)[1].split("\n}\n\nverify()", 1)[0]

        self.assertIn('if ! "${ssh_cmd[@]}" sudo bash -s -- "$marker"', enable)
        self.assertGreaterEqual(enable.count("disable || true"), 2)

    def test_initializer_creates_and_verifies_unknown_project_destination(self):
        initializer = (ROOT / "runtime" / "prepare-volumes.sh").read_text(encoding="utf-8")
        project_initializer = ROOT / "runtime" / "initialize-project-paths.sh"

        self.assertIn("titus-project-knowledge-data:/projects", initializer)
        self.assertIn("initialize-project-paths.sh:/initialize-project-paths.sh:ro", initializer)
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ)
            environment.update(
                MEETING_PROJECTS_ROOT=directory,
                MEETING_PROJECTS_UID=str(os.getuid()),
                MEETING_PROJECTS_GID=str(os.getgid()),
            )
            subprocess.run(["/bin/sh", project_initializer], env=environment, check=True)
            destination = Path(directory) / "00-inbox" / "meetings"
            self.assertTrue(destination.is_dir())
            self.assertEqual(destination.stat().st_mode & 0o777, 0o750)

        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            (Path(directory) / "00-inbox").symlink_to(outside, target_is_directory=True)
            environment = dict(os.environ)
            environment.update(
                MEETING_PROJECTS_ROOT=directory,
                MEETING_PROJECTS_UID=str(os.getuid()),
                MEETING_PROJECTS_GID=str(os.getgid()),
            )
            result = subprocess.run(["/bin/sh", project_initializer], env=environment, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(outside) / "meetings").exists())


if __name__ == "__main__":
    unittest.main()
