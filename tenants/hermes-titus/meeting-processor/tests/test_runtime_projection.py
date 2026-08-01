import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
LOADER = ROOT / "runtime" / "load-phase-config.sh"


class RuntimeProjectionTests(unittest.TestCase):
    def source(self):
        return {
            "MSGRAPH_CLIENT_ID": "22222222-2222-4222-8222-222222222222",
            "MSGRAPH_CLIENT_SECRET": "fixture-secret-with-safe-length",
            "MSGRAPH_ORGANIZER_USER_IDS": "33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444",
            "MSGRAPH_TENANT_ID": "11111111-1111-4111-8111-111111111111",
            "MSGRAPH_TEST_JOIN_URL": "https://teams.microsoft.com/l/meetup-join/fixture",
            "MSGRAPH_WEBHOOK_ACCEPTED_RESOURCES": "fixture",
            "MSGRAPH_WEBHOOK_CLIENT_STATE": "fixture-client-state-with-safe-length",
            "MSGRAPH_WEBHOOK_ENABLED": "false",
            "MSGRAPH_WEBHOOK_PORT": "8787",
        }

    def run_loader(self, source, content=False, marker_mode="444"):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        fixture = base / "phase.json"
        fixture.write_text(json.dumps(source), encoding="utf-8")
        core = base / "core.json"
        core.write_text(json.dumps({
            "AGENTMAIL_API_KEY": "a" * 32,
            "AGENTMAIL_EMAIL_ADDRESS": "titus@example.invalid",
            "AGENTMAIL_INBOX_ID": "inbox",
            "HERMES_DEFAULT_MODEL": "gpt-5.6-sol",
            "OPENROUTER_API_KEY": "o" * 32,
            "SECURITY_SERVICE_TOKEN": "s" * 32,
        }), encoding="utf-8")
        email = base / "email.json"
        email.write_text(json.dumps({"HERMES_API_KEY": "h" * 32, "HERMES_BASE_URL": "http://hermes-titus:8642"}), encoding="utf-8")
        token = base / "phase-token"
        token.write_text("fixture-phase-token-value-123456", encoding="utf-8")
        token.chmod(0o400)
        runtime = base / "runtime"
        marker = base / "content.enabled"
        if content:
            marker.write_bytes(b"")
        fake_bin = base / "bin"
        fake_bin.mkdir()
        self.write_executable(fake_bin / "id", "#!/bin/sh\ntest \"$1\" = -u && printf '0\\n'\n")
        self.write_executable(
            fake_bin / "stat",
            "#!/bin/sh\n"
            "if test \"$3\" = \"$CONTENT_MARKER\"; then case \"$2\" in %a) printf '%s\\n' \"$MARKER_MODE\";; %u) printf '0\\n';; %s) printf '0\\n';; *) exit 2;; esac; "
            "else case \"$2\" in %a) printf '400\\n';; %u) printf '10001\\n';; %s) printf '32\\n';; *) exit 2;; esac; fi\n",
        )
        self.write_executable(
            fake_bin / "phase",
            "#!/bin/sh\npath=\nwhile test $# -gt 0; do if test \"$1\" = --path; then path=$2; shift 2; else shift; fi; done\n"
            "case \"$path\" in /agents/hermes-titus/teamsmeetings) cat \"$PHASE_FIXTURE\";; /agents/hermes-titus/runtime) cat \"$PHASE_CORE_FIXTURE\";; /agents/hermes-email-intake/titus) cat \"$PHASE_EMAIL_FIXTURE\";; *) exit 4;; esac\n",
        )
        self.write_executable(
            fake_bin / "install",
            "#!/bin/sh\n"
            "mode=; directory=false; last=; previous=\n"
            "for arg in \"$@\"; do case \"$arg\" in -d) directory=true;; -m) previous=-m;; -o|-g) previous=skip;; *) if test \"$previous\" = -m; then mode=$arg; previous=; elif test \"$previous\" = skip; then previous=; else last=$arg; fi;; esac; done\n"
            "if $directory; then mkdir -p \"$last\"; chmod \"$mode\" \"$last\"; else eval \"set -- $*\"; src=; for arg in \"$@\"; do case \"$arg\" in -*) ;; root|10003|0440) ;; *) if test -z \"$src\"; then src=$arg; else dest=$arg; fi;; esac; done; cp \"$src\" \"$dest\"; chmod \"$mode\" \"$dest\"; fi\n",
        )
        environment = os.environ.copy()
        environment.update(
            {
                "PATH": f"{fake_bin}:{environment['PATH']}",
                "PHASE_BIN": str(fake_bin / "phase"),
                "PHASE_TOKEN_FILE": str(token),
                "PHASE_FIXTURE": str(fixture),
                "PHASE_CORE_FIXTURE": str(core),
                "PHASE_EMAIL_FIXTURE": str(email),
                "MEETING_PROCESSOR_RUNTIME_ROOT": str(runtime),
                "MEETING_PROCESSOR_CONTENT_MARKER": str(marker),
                "CONTENT_MARKER": str(marker),
                "MARKER_MODE": marker_mode,
            }
        )
        result = subprocess.run([str(LOADER)], env=environment, text=True, capture_output=True, check=False)
        return result, runtime / "runtime.json"

    @staticmethod
    def write_executable(path, body):
        path.write_text(body, encoding="utf-8")
        path.chmod(0o755)

    def test_projects_only_validated_worker_fields(self):
        result, output = self.run_loader(self.source())
        self.assertEqual(result.returncode, 0, result.stderr)
        projected = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(
            set(projected),
            {
                "MSGRAPH_TENANT_ID",
                "MSGRAPH_CLIENT_ID",
                "MSGRAPH_CLIENT_SECRET",
                "MSGRAPH_ORGANIZER_USER_IDS",
                "MSGRAPH_POLL_INTERVAL_SECONDS",
                "MSGRAPH_INITIAL_LOOKBACK_HOURS",
            },
        )
        self.assertEqual(projected["MSGRAPH_POLL_INTERVAL_SECONDS"], "300")
        self.assertEqual(projected["MSGRAPH_INITIAL_LOOKBACK_HOURS"], "168")
        self.assertEqual(output.stat().st_mode & 0o777, 0o440)
        self.assertNotIn("fixture-phase-token", result.stdout + result.stderr)

    def test_rejects_unknown_missing_enabled_and_duplicate_organizers(self):
        cases = []
        unknown = self.source()
        unknown["UNEXPECTED"] = "value"
        cases.append(unknown)
        missing = self.source()
        del missing["MSGRAPH_CLIENT_ID"]
        cases.append(missing)
        enabled = self.source()
        enabled["MSGRAPH_WEBHOOK_ENABLED"] = "true"
        cases.append(enabled)
        duplicate = self.source()
        duplicate["MSGRAPH_ORGANIZER_USER_IDS"] = "33333333-3333-4333-8333-333333333333,33333333-3333-4333-8333-333333333333"
        cases.append(duplicate)
        for source in cases:
            with self.subTest(keys=sorted(source)):
                result, output = self.run_loader(source)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())

    def test_content_marker_projects_only_fixed_content_fields(self):
        result, output = self.run_loader(self.source(), content=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        projected = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(projected["TRANSCRIPT_CONTENT_ENABLED"], "true")
        self.assertEqual(projected["SECURITYTEAM_BASE_URL"], "http://overnightdesk-securityteam:4700")
        self.assertEqual(projected["HERMES_BASE_URL"], "http://hermes-titus:8642")
        self.assertEqual(projected["TRANSCRIPT_MAX_BYTES"], "1000000")
        self.assertEqual(projected["SECURITYTEAM_MAX_RESPONSE_BYTES"], "1250000")
        self.assertEqual(projected["TITUS_MAX_OUTPUT_BYTES"], "65536")
        self.assertEqual(set(projected) - {
            "MSGRAPH_TENANT_ID", "MSGRAPH_CLIENT_ID", "MSGRAPH_CLIENT_SECRET",
            "MSGRAPH_ORGANIZER_USER_IDS", "MSGRAPH_POLL_INTERVAL_SECONDS",
            "MSGRAPH_INITIAL_LOOKBACK_HOURS",
        }, {
            "TRANSCRIPT_CONTENT_ENABLED", "SECURITYTEAM_BASE_URL", "SECURITY_SERVICE_TOKEN",
            "HERMES_BASE_URL", "HERMES_API_KEY", "TRANSCRIPT_MAX_BYTES",
            "SECURITYTEAM_MAX_RESPONSE_BYTES", "TITUS_MAX_OUTPUT_BYTES",
        })

    def test_rejects_malformed_content_marker(self):
        result, output = self.run_loader(self.source(), content=True, marker_mode="644")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
