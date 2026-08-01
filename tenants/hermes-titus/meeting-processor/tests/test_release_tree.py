import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "release-tree.sh"


class ReleaseTreeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="titus-release-tree-")
        self.addCleanup(self._cleanup)
        self.root = Path(self.temporary.name)
        self.upload = self.root / "upload"
        self.releases = self.root / "releases"
        self.handles = self.root / "handles"
        self.state = self.root / "titus-meeting-processor-data"
        self.build_marker = self.root / "docker-build-called"
        self.upload.mkdir()
        self.releases.mkdir()
        self.handles.mkdir()
        self.state.mkdir()
        (self.upload / "runtime").mkdir()
        (self.upload / "runtime" / "run-container.sh").write_text("#!/bin/sh\n", encoding="utf-8")
        (self.upload / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
        (self.handles / "source").symlink_to("release-before")
        (self.handles / "previous").symlink_to("release-older")
        (self.state / "state.json").write_text("retained-state\n", encoding="utf-8")
        self.expected_sentinels = self._sentinels()

    def _cleanup(self):
        for path in self.root.rglob("*") if self.root.exists() else ():
            if path.is_dir() and not path.is_symlink():
                path.chmod(0o700)
            elif path.exists() and not path.is_symlink():
                path.chmod(0o600)
        self.temporary.cleanup()

    def _sentinels(self):
        return (
            os.readlink(self.handles / "source"),
            os.readlink(self.handles / "previous"),
            (self.state / "state.json").read_bytes(),
            self.build_marker.exists(),
        )

    def _run(self, *arguments, expected_success=True):
        completed = subprocess.run(
            ["bash", str(HELPER), *map(str, arguments)],
            text=True,
            capture_output=True,
            check=False,
        )
        if expected_success and completed.returncode != 0:
            self.fail(f"release helper failed: {completed.stderr}")
        if not expected_success and completed.returncode == 0:
            self.fail("release helper unexpectedly accepted an invalid tree")
        return completed

    def _promote(self):
        completed = self._run("promote", self.upload, self.releases, os.getuid(), os.getgid())
        release = Path(completed.stdout.strip())
        self.assertEqual(release.parent, self.releases)
        self.assertRegex(release.name, r"^[0-9a-f]{64}$")
        return release

    def _assert_rejected_without_side_effects(self, release, owner_uid=None):
        completed = self._run(
            "validate",
            release,
            release.name,
            os.getuid() if owner_uid is None else owner_uid,
            os.getgid(),
            expected_success=False,
        )
        self.assertEqual(self._sentinels(), self.expected_sentinels)
        return completed

    def test_promotes_valid_tree_as_owned_nonwritable_regular_content(self):
        release = self._promote()
        for path in [release, *release.rglob("*")]:
            info = path.lstat()
            self.assertTrue(path.is_dir() or path.is_file())
            self.assertEqual(info.st_uid, os.getuid())
            self.assertEqual(info.st_gid, os.getgid())
            self.assertEqual(stat.S_IMODE(info.st_mode) & 0o222, 0)
        self.assertEqual(self._sentinels(), self.expected_sentinels)

    def test_rejects_content_altered_existing_release_without_side_effects(self):
        release = self._promote()
        dockerfile = release / "Dockerfile"
        dockerfile.chmod(0o600)
        dockerfile.write_text("FROM changed\n", encoding="utf-8")
        dockerfile.chmod(0o400)
        self._assert_rejected_without_side_effects(release)

    def test_rejects_writable_existing_release_without_side_effects(self):
        release = self._promote()
        (release / "Dockerfile").chmod(0o600)
        self._assert_rejected_without_side_effects(release)

    def test_rejects_wrong_owner_existing_release_without_side_effects(self):
        release = self._promote()
        self._assert_rejected_without_side_effects(release, owner_uid=os.getuid() + 1)

    def test_rejects_unsupported_existing_entry_without_side_effects(self):
        release = self._promote()
        release.chmod(0o700)
        os.mkfifo(release / "unsupported-fifo", 0o444)
        release.chmod(0o500)
        completed = self._assert_rejected_without_side_effects(release)
        self.assertIn("release type, ownership, or mode is invalid", completed.stderr)


if __name__ == "__main__":
    unittest.main()
