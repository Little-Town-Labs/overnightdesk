from __future__ import annotations

import importlib.util
import sqlite3
import sys
import types
import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]


class FakeKanban:
    DEFAULT_BOARD = "default"

    def __init__(self) -> None:
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            """
            CREATE TABLE tasks (
              id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT,
              status TEXT, priority INTEGER, created_by TEXT,
              idempotency_key TEXT, result TEXT,
              created_at INTEGER DEFAULT (unixepoch())
            );
            """
        )
        self.counter = 0
        self.fail_completion = False
        self.completed_from: list[str] = []

    def init_db(self, board=None):
        return None

    def connect(self, board=None):
        return self.conn

    def create_task(self, conn, **kwargs):
        existing = conn.execute(
            "SELECT id FROM tasks WHERE idempotency_key=? AND status!='archived'",
            (kwargs["idempotency_key"],),
        ).fetchone()
        if existing:
            return existing["id"]
        self.counter += 1
        task_id = f"t_{self.counter}"
        conn.execute(
            """INSERT INTO tasks(id,title,body,assignee,status,priority,created_by,idempotency_key)
               VALUES(?,?,?,?,?,?,?,?)""",
            (
                task_id,
                kwargs["title"],
                kwargs["body"],
                kwargs.get("assignee"),
                "triage" if kwargs.get("triage") else "ready",
                kwargs["priority"],
                kwargs["created_by"],
                kwargs["idempotency_key"],
            ),
        )
        conn.commit()
        return task_id

    def complete_task(self, conn, task_id, **kwargs):
        if self.fail_completion:
            return False
        row = conn.execute(
            "SELECT status FROM tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if row:
            self.completed_from.append(row["status"])
        changed = conn.execute(
            """UPDATE tasks SET status='done',result=?
               WHERE id=? AND status IN ('running','ready','blocked')""",
            (kwargs.get("result"), task_id),
        ).rowcount
        conn.commit()
        return bool(changed)


def load_api(fake: FakeKanban):
    hermes = types.ModuleType("hermes_cli")
    hermes.kanban_db = fake
    sys.modules["hermes_cli"] = hermes
    path = ROOT / "plugins/platform_task_intake/dashboard/plugin_api.py"
    spec = importlib.util.spec_from_file_location("platform_task_intake_api", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class IntakeAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.fake = FakeKanban()
        self.api = load_api(self.fake)

    @staticmethod
    def response_json(response):
        if hasattr(response, "body"):
            import json

            return json.loads(response.body)
        return response

    def payload(self):
        return {
            "title": "CI failed",
            "body": "Safe bounded evidence",
            "priority": 70,
            "idempotency_key": "guardian:github:repo:action:1",
            "source": {
                "service": "overnightdesk-production-guardian",
                "signal_key": "github:repo:action:1",
                "url": "https://github.com/example/actions/1",
            },
        }

    def test_create_forces_unassigned_triage_and_is_idempotent(self):
        first_response = self.api.create_task(
            self.api.CreateTask.model_validate(self.payload())
        )
        self.assertEqual(first_response.status_code, 201)
        first = self.response_json(first_response)
        self.assertEqual(first["status"], "triage")
        self.assertIsNone(first["assignee"])
        second = self.api.create_task(
            self.api.CreateTask.model_validate(self.payload())
        )
        self.assertEqual(first["task_id"], second["task_id"])
        row = self.fake.conn.execute("SELECT * FROM tasks").fetchone()
        self.assertIsNone(row["assignee"])
        self.assertEqual(row["status"], "triage")
        self.assertEqual(
            row["created_by"], "overnightdesk-production-guardian"
        )

    def test_rejects_execution_authority_fields(self):
        for field, value in (
            ("assignee", "platform_code_worker"),
            ("model_override", "gpt-5.6-luna"),
            ("provider_override", "openai-codex"),
            ("skills", ["aegis-ssh"]),
            ("workspace_path", "/opt/data"),
            ("status", "ready"),
            ("board", "other"),
        ):
            payload = self.payload()
            payload[field] = value
            with self.assertRaises(ValidationError, msg=field):
                self.api.CreateTask.model_validate(payload)
        self.assertEqual(
            self.fake.conn.execute("SELECT count(*) FROM tasks").fetchone()[0],
            0,
        )

    def test_resolve_only_guardian_owned_task(self):
        created = self.response_json(
            self.api.create_task(self.api.CreateTask.model_validate(self.payload()))
        )
        resolved = self.api.resolve_task(
            self.api.ResolveTask.model_validate({
                "idempotency_key": self.payload()["idempotency_key"],
                "resolution": "Upstream run superseded",
            })
        )
        self.assertEqual(resolved["task_id"], created["task_id"])
        row = self.fake.conn.execute(
            "SELECT status,assignee FROM tasks WHERE id=?",
            (created["task_id"],),
        ).fetchone()
        self.assertEqual(row["status"], "done")
        self.assertIsNone(row["assignee"])
        self.assertEqual(self.fake.completed_from, ["blocked"])
        again = self.api.resolve_task(
            self.api.ResolveTask.model_validate({
                "idempotency_key": self.payload()["idempotency_key"],
                "resolution": "Upstream run superseded",
            })
        )
        self.assertTrue(again["resolved"])
        self.fake.conn.execute(
            """INSERT INTO tasks(
              id,title,body,assignee,status,priority,created_by,idempotency_key,result
            ) VALUES(
              't_other','x','x',NULL,'triage',1,'human','guardian:other',NULL)"""
        )
        self.fake.conn.commit()
        with self.assertRaises(HTTPException) as denied:
            self.api.resolve_task(self.api.ResolveTask.model_validate({
                "idempotency_key": "guardian:other",
                "resolution": "try",
            }))
        self.assertEqual(denied.exception.status_code, 404)

    def test_resolve_fails_closed_for_assigned_guardian_task(self):
        created = self.response_json(
            self.api.create_task(self.api.CreateTask.model_validate(self.payload()))
        )
        self.fake.conn.execute(
            "UPDATE tasks SET assignee='platform_code_worker' WHERE id=?",
            (created["task_id"],),
        )
        self.fake.conn.commit()

        with self.assertRaises(HTTPException) as denied:
            self.api.resolve_task(
                self.api.ResolveTask.model_validate({
                    "idempotency_key": self.payload()["idempotency_key"],
                    "resolution": "Upstream run superseded",
                })
            )
        self.assertEqual(denied.exception.status_code, 409)
        row = self.fake.conn.execute(
            "SELECT status,assignee FROM tasks WHERE id=?",
            (created["task_id"],),
        ).fetchone()
        self.assertEqual(row["status"], "triage")
        self.assertEqual(row["assignee"], "platform_code_worker")

    def test_failed_completion_leaves_non_runnable_retry_state(self):
        created = self.response_json(
            self.api.create_task(self.api.CreateTask.model_validate(self.payload()))
        )
        request = self.api.ResolveTask.model_validate({
            "idempotency_key": self.payload()["idempotency_key"],
            "resolution": "Upstream run superseded",
        })
        self.fake.fail_completion = True
        with self.assertRaises(HTTPException) as denied:
            self.api.resolve_task(request)
        self.assertEqual(denied.exception.status_code, 409)
        row = self.fake.conn.execute(
            "SELECT status FROM tasks WHERE id=?",
            (created["task_id"],),
        ).fetchone()
        self.assertEqual(row["status"], "blocked")

        self.fake.fail_completion = False
        retried = self.api.resolve_task(request)
        self.assertTrue(retried["resolved"])

    def test_resolve_fails_closed_for_running_guardian_task(self):
        created = self.response_json(
            self.api.create_task(self.api.CreateTask.model_validate(self.payload()))
        )
        self.fake.conn.execute(
            "UPDATE tasks SET status='running' WHERE id=?",
            (created["task_id"],),
        )
        self.fake.conn.commit()

        with self.assertRaises(HTTPException) as denied:
            self.api.resolve_task(
                self.api.ResolveTask.model_validate({
                    "idempotency_key": self.payload()["idempotency_key"],
                    "resolution": "Upstream run superseded",
                })
            )
        self.assertEqual(denied.exception.status_code, 409)
        row = self.fake.conn.execute(
            "SELECT status FROM tasks WHERE id=?",
            (created["task_id"],),
        ).fetchone()
        self.assertEqual(row["status"], "running")


class AuthProviderTests(unittest.TestCase):
    def test_strength_and_constant_time_provider(self):
        auth = types.ModuleType("hermes_cli.dashboard_auth")

        class Provider:
            pass

        class Principal:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        auth.DashboardAuthProvider = Provider
        auth.LoginStart = object
        auth.Session = object
        auth.TokenPrincipal = Principal
        sys.modules["hermes_cli.dashboard_auth"] = auth
        path = (
            ROOT
            / "plugins/dashboard_auth/platform_task_intake/__init__.py"
        )
        spec = importlib.util.spec_from_file_location("platform_intake_auth", path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(module)
        self.assertIsNotNone(module.assess_secret_strength("short"))
        secret = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"
        self.assertIsNone(module.assess_secret_strength(secret))
        provider = module.PlatformTaskIntakeSecretProvider(secret=secret)
        self.assertIsNone(provider.verify_token(token="wrong"))
        principal = provider.verify_token(token=secret)
        self.assertEqual(principal.principal, "production-guardian")


class PublicIngressTests(unittest.TestCase):
    def test_exact_intake_routes_are_denied_by_public_nginx(self):
        config = (ROOT.parent / "nginx" / "walter-hermes.conf").read_text()
        for route in (
            "/api/plugins/platform-task-intake/tasks",
            "/api/plugins/platform-task-intake/resolve",
        ):
            self.assertIn(f"location = {route} {{ return 404; }}", config)

    def test_deployment_is_phase_backed_and_rollback_safe(self):
        script = (
            ROOT / "deploy-walter-intake.sh"
        ).read_text(encoding="utf-8")
        for required in (
            '"$phase_bin" secrets export',
            "--path \"$phase_path\"",
            "WALTER_INTAKE_TOKEN",
            'test("^[A-Za-z0-9_-]{43,128}$")',
            "PLATFORM_TASK_INTAKE_TOKEN",
            "--approve-walter-restart",
            "rollback_container",
            "restore_previous",
            "activation_cleanup",
            "migrate_profile.py",
            "hermes-email-intake@walter.service",
            "-m unittest discover -s /workspace/infra/hermes-coder/tests -v",
            '"$profile_migration" apply',
            '"$profile_migration" rollback',
            "docker rename \"$runtime\" \"$rollback_container\"",
            "docker exec \"$runtime\"",
            "verify_profile_route",
            "/opt/data/profiles/platform_code_worker/config.yaml",
            'model.get("default") == "gpt-5.6-sol"',
            'delegation.get("model") == "gpt-5.6-luna"',
            "location = /api/plugins/platform-task-intake/tasks { return 404; }",
            "location = /api/plugins/platform-task-intake/resolve { return 404; }",
        ):
            self.assertIn(required, script)
        for forbidden in (
            "docker rm -f",
            "docker system prune",
            "phase secrets export --format dotenv",
        ):
            self.assertNotIn(forbidden, script)
        self.assertLess(
            script.index('if ! docker start "$runtime"'),
            script.index('install -o root -g root -m 0644 "$nginx_source"'),
        )
        success_block = script[
            script.index("activation_succeeded=true"):
            script.index('fail "candidate Walter failed verification')
        ]
        self.assertLess(
            success_block.index("trap - EXIT INT TERM"),
            success_block.index("return"),
        )
        self.assertIn('find "$work_dir" -type f -delete', success_block)

    def test_deployment_consumes_the_pinned_020_candidate(self):
        script = (
            ROOT / "deploy-walter-intake.sh"
        ).read_text(encoding="utf-8")
        manifest = (
            ROOT.parent.parent
            / "releases/hermes/0.20.0-local-2026-08-07.yaml"
        ).read_text(encoding="utf-8")
        candidate_image = "overnightdesk/hermes-agent:0.20.0-coder"
        candidate_image_id = (
            "sha256:3633de9efda759325a6d3a0757dcae476a71526b539e6d435abf1aa2f7d9c2e3"
        )
        self.assertIn(
            f"candidate_image={candidate_image}",
            script,
        )
        self.assertIn("candidate_version=0.20.0", script)
        self.assertIn("candidate_architecture=arm64", script)
        self.assertIn(f"candidate_image_id={candidate_image_id}", script)
        self.assertIn(f"reference: {candidate_image}", manifest)
        self.assertIn(f"image_id: {candidate_image_id}", manifest)
        self.assertIn("docker image inspect --format '{{.Id}}'", script)
        self.assertIn("docker image inspect --format '{{.Architecture}}'", script)
        self.assertIn("candidate image identity mismatch", script)
        self.assertIn("candidate image architecture mismatch", script)
        self.assertIn("candidate Hermes version mismatch", script)
        self.assertNotIn("docker build --pull=false", script)
        self.assertNotIn("0.19.0-coder-intake-candidate", script)


if __name__ == "__main__":
    unittest.main()
