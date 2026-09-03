"""Contracts for the locally built Buzz relay candidate image."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time
import unittest


BUZZ_ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = BUZZ_ROOT / "relay" / "Dockerfile"
POSTGRES_DOCKERFILE = BUZZ_ROOT / "postgres" / "Dockerfile"
UPSTREAM_IMAGE = (
    "ghcr.io/block/buzz@"
    "sha256:7d69b67fa4df5f42e7ca8b69db99e12ec8134c6b7353d1b446a9839c2e9fdc3f"
)
RUNTIME_IMAGE = (
    "cgr.dev/chainguard/wolfi-base@"
    "sha256:6289b37d936b7d4a3ff6d294f9317bcbf10188962e7ab60d8d869a559bffc902"
)
DOCKERFILE_FRONTEND = (
    "# syntax=docker/dockerfile:1.7@"
    "sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e"
)
POSTGRES_UPSTREAM_IMAGE = (
    "docker.io/library/postgres@"
    "sha256:f2924e77eb4939843396c157a86e5545f8b5d7568c35a80eca7dfdb3a0fe764b"
)


class RelayDockerfileContract(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(DOCKERFILE.is_file(), f"missing {DOCKERFILE}")
        self.text = DOCKERFILE.read_text(encoding="utf-8")

    def test_uses_immutable_exact_artifact_inputs(self) -> None:
        self.assertEqual(self.text.splitlines()[0], DOCKERFILE_FRONTEND)
        self.assertIn(f"ARG UPSTREAM_IMAGE={UPSTREAM_IMAGE}", self.text)
        self.assertIn(f"ARG RUNTIME_IMAGE={RUNTIME_IMAGE}", self.text)
        self.assertIn("ARG SOURCE_DATE_EPOCH=1788373530", self.text)
        self.assertNotIn(":latest", self.text)
        self.assertNotIn("cargo build", self.text)
        self.assertIn(
            'org.opencontainers.image.revision="0dbd036f5bff33e7ade75e7639f3218d424a6e73"',
            self.text,
        )

    def test_freezes_required_runtime_packages(self) -> None:
        for package in (
            "ca-certificates-bundle=20260611-r1",
            "curl=8.21.0-r3",
            "cyrus-sasl-heimdal-libs=2.1.28-r55",
            "gdbm=1.26-r6",
            "git=2.55.0-r5",
            "heimdal-libs=7.8.0-r52",
            "keyutils-libs=1.6.3-r40",
            "krb5-conf=1.0-r9",
            "krb5-libs=1.22.2-r3",
            "libbrotlicommon1=1.2.0-r4",
            "libbrotlidec1=1.2.0-r4",
            "libcom_err=1.47.4-r2",
            "libcurl-openssl4=8.21.0-r3",
            "libexpat1=2.8.4-r0",
            "libgcc=16.2.0-r1",
            "libidn2=2.3.8-r9",
            "libldap-2.6=2.6.14-r0",
            "libnghttp2-14=1.70.0-r3",
            "libpcre2-8-0=10.48-r0",
            "libpsl=0.23.3-r1",
            "libunistring=1.4.2-r3",
            "libverto=0.3.2-r8",
            "ncurses=6.6.20260829-r1",
            "ncurses-terminfo-base=6.6.20260829-r1",
            "nghttp3=1.18.0-r1",
            "ngtcp2=1.25.0-r2",
            "openssl=3.6.4-r1",
            "readline=8.3-r3",
            "sqlite-libs=3.53.4-r2",
        ):
            with self.subTest(package=package):
                self.assertIn(package, self.text)

    def test_removes_nondeterministic_runtime_cache(self) -> None:
        self.assertIn("rm -f /var/cache/ldconfig/aux-cache", self.text)

    def test_copies_only_relay_runtime_artifacts(self) -> None:
        copies = [
            line.strip()
            for line in self.text.splitlines()
            if line.strip().startswith("COPY --from=upstream")
        ]
        self.assertEqual(
            copies,
            [
                "COPY --from=upstream /usr/local/bin/buzz-relay /usr/local/bin/buzz-relay",
                "COPY --from=upstream /srv/buzz/web /srv/buzz/web",
            ],
        )

    def test_declares_non_root_runtime_and_exact_entrypoint(self) -> None:
        self.assertIn("USER 1000:1000", self.text)
        self.assertIn('ENTRYPOINT ["/usr/local/bin/buzz-relay"]', self.text)
        self.assertIn("install -d -o buzz -g buzz /var/lib/buzz /data/git", self.text)


class PostgresDockerfileContract(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(POSTGRES_DOCKERFILE.is_file(), f"missing {POSTGRES_DOCKERFILE}")
        self.text = POSTGRES_DOCKERFILE.read_text(encoding="utf-8")

    def test_patches_exact_arm64_upstream_without_major_version_change(self) -> None:
        self.assertEqual(self.text.splitlines()[0], DOCKERFILE_FRONTEND)
        self.assertIn(f"ARG UPSTREAM_IMAGE={POSTGRES_UPSTREAM_IMAGE}", self.text)
        self.assertIn("ARG SOURCE_DATE_EPOCH=1786643439", self.text)
        self.assertIn("libcrypto3=3.5.8-r0", self.text)
        self.assertIn("libssl3=3.5.8-r0", self.text)
        self.assertNotIn(":latest", self.text)
        self.assertNotIn("apk upgrade", self.text)

    def test_declares_exact_non_root_runtime_contract(self) -> None:
        self.assertIn("USER 70:70", self.text)
        self.assertIn('ENTRYPOINT ["docker-entrypoint.sh"]', self.text)
        self.assertIn('CMD ["postgres"]', self.text)


@unittest.skipUnless(
    os.environ.get("BUZZ_RELAY_CANDIDATE_IMAGE"),
    "set BUZZ_RELAY_CANDIDATE_IMAGE to run the local ARM64 image contract",
)
class RelayLocalImageContract(unittest.TestCase):
    image = os.environ.get("BUZZ_RELAY_CANDIDATE_IMAGE", "")

    @staticmethod
    def run_command(*argv: str) -> str:
        completed = subprocess.run(
            argv,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return completed.stdout.strip()

    def test_image_metadata_is_arm64_and_non_root(self) -> None:
        raw = self.run_command("docker", "image", "inspect", self.image)
        metadata = json.loads(raw)[0]
        self.assertEqual(metadata["Architecture"], "arm64")
        self.assertEqual(metadata["Config"]["User"], "1000:1000")
        self.assertEqual(
            metadata["Config"]["Entrypoint"], ["/usr/local/bin/buzz-relay"]
        )

    def test_runtime_works_with_read_only_root(self) -> None:
        output = self.run_command(
            "docker",
            "run",
            "--rm",
            "--platform",
            "linux/arm64",
            "--read-only",
            "--network",
            "none",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--tmpfs",
            "/data/git:uid=1000,gid=1000,mode=0700",
            "--entrypoint",
            "/bin/sh",
            self.image,
            "-c",
            "test $(id -u) -eq 1000"
            " && test -r /srv/buzz/web/index.html"
            " && test -w /data/git"
            " && git --version >/dev/null"
            " && curl --version >/dev/null"
            " && openssl version >/dev/null",
        )
        self.assertEqual(output, "")

    def test_relay_binary_is_byte_identical_to_upstream(self) -> None:
        def binary_digest(image: str) -> str:
            output = self.run_command(
                "docker",
                "run",
                "--rm",
                "--platform",
                "linux/arm64",
                "--entrypoint",
                "/bin/sh",
                image,
                "-c",
                "sha256sum /usr/local/bin/buzz-relay",
            )
            return output.split()[0]

        self.assertEqual(binary_digest(self.image), binary_digest(UPSTREAM_IMAGE))

    def test_relay_process_loads_config_before_isolated_dependency_failure(self) -> None:
        completed = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--platform",
                "linux/arm64",
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--tmpfs",
                "/data/git:uid=1000,gid=1000,mode=0700",
                "-e",
                "DATABASE_URL=postgres://buzz:synthetic@127.0.0.1:1/buzz",
                "-e",
                "REDIS_URL=redis://:synthetic@127.0.0.1:1",
                "-e",
                f"BUZZ_RELAY_PRIVATE_KEY={'1' * 64}",
                "-e",
                f"BUZZ_GIT_HOOK_HMAC_SECRET={'2' * 64}",
                "-e",
                "BUZZ_GIT_REPO_PATH=/data/git",
                "-e",
                "BUZZ_BIND_ADDR=127.0.0.1:3000",
                "-e",
                "BUZZ_HEALTH_PORT=8080",
                "-e",
                "BUZZ_METRICS_PORT=9102",
                "-e",
                "RUST_LOG=info",
                self.image,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
        output = completed.stdout + completed.stderr
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("Starting buzz-relay", output)
        self.assertIn("Config loaded", output)
        self.assertIn("DB connection failed", output)
        self.assertNotIn("error while loading shared libraries", output)


@unittest.skipUnless(
    os.environ.get("BUZZ_POSTGRES_CANDIDATE_IMAGE"),
    "set BUZZ_POSTGRES_CANDIDATE_IMAGE to run the local ARM64 image contract",
)
class PostgresLocalImageContract(unittest.TestCase):
    image = os.environ.get("BUZZ_POSTGRES_CANDIDATE_IMAGE", "")

    def test_hardened_empty_database_startup(self) -> None:
        name = f"buzz-postgres-contract-{os.getpid()}"
        subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-d",
                "--name",
                name,
                "--platform",
                "linux/arm64",
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--tmpfs",
                "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,uid=70,gid=70,mode=0700",
                "--tmpfs",
                "/var/run/postgresql:rw,noexec,nosuid,nodev,uid=70,gid=70,mode=0770",
                "-e",
                "POSTGRES_PASSWORD=synthetic-contract",
                "-e",
                "POSTGRES_DB=buzz",
                "-e",
                "PGDATA=/var/lib/postgresql/data/pgdata",
                self.image,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            for _ in range(40):
                query = subprocess.run(
                    [
                        "docker",
                        "exec",
                        name,
                        "psql",
                        "-U",
                        "postgres",
                        "-d",
                        "buzz",
                        "-tAc",
                        "select current_user",
                    ],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                if query.returncode == 0:
                    break
                time.sleep(0.25)
            else:
                logs = subprocess.run(
                    ["docker", "logs", name],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                ).stdout
                self.fail(f"PostgreSQL did not become ready:\n{logs}")

            identity = subprocess.run(
                ["docker", "exec", name, "id", "-u"],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            ).stdout.strip()
            self.assertEqual(identity, "70")
            self.assertEqual(query.stdout.strip(), "postgres")
        finally:
            subprocess.run(
                ["docker", "stop", "--timeout", "10", name],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )


if __name__ == "__main__":
    unittest.main()
