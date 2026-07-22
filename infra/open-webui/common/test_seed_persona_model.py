import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("seed_persona_model.py")
SPEC = importlib.util.spec_from_file_location("seed_persona_model", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SeedPersonaModelTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.tempdir.name) / "webui.db"
        self.connection = sqlite3.connect(self.database_path)
        self.connection.executescript(
            """
            CREATE TABLE user (
              id TEXT PRIMARY KEY,
              role TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );
            CREATE TABLE model (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              base_model_id TEXT,
              name TEXT NOT NULL,
              params TEXT NOT NULL,
              meta TEXT NOT NULL,
              is_active INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE access_grant (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              resource_type TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              principal_type TEXT NOT NULL,
              principal_id TEXT NOT NULL,
              permission TEXT NOT NULL,
              created_at INTEGER,
              UNIQUE(resource_type, resource_id, principal_type, principal_id, permission)
            );
            INSERT INTO user(id, role, created_at) VALUES ('owner-1', 'admin', 1);
            """
        )
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        self.tempdir.cleanup()

    def config(self, name="Titus"):
        return {
            "modelId": "hermes-agent",
            "name": name,
            "profileImageUrl": (
                "https://www.overnightdesk.com/api/agent-identity/"
                f"{name.lower()}/logo"
            ),
        }

    def test_creates_one_public_read_only_persona_override(self):
        self.assertEqual(
            MODULE.reconcile(self.database_path, self.config()), "updated"
        )
        model = self.connection.execute(
            "SELECT id, user_id, base_model_id, name, meta, is_active FROM model"
        ).fetchone()
        self.assertEqual(model[:4], ("hermes-agent", "owner-1", None, "Titus"))
        self.assertEqual(json.loads(model[4])["profile_image_url"], self.config()["profileImageUrl"])
        self.assertEqual(model[5], 1)
        grants = self.connection.execute(
            "SELECT resource_type, resource_id, principal_type, principal_id, permission "
            "FROM access_grant"
        ).fetchall()
        self.assertEqual(grants, [("model", "hermes-agent", "user", "*", "read")])
        self.assertIsNone(MODULE.verify(self.database_path, self.config()))

    def test_is_idempotent_and_preserves_chats_and_unrelated_model_metadata(self):
        self.connection.execute("CREATE TABLE chat (id TEXT PRIMARY KEY, title TEXT)")
        self.connection.execute("INSERT INTO chat VALUES ('chat-1', 'Keep me')")
        self.connection.execute(
            "INSERT INTO model VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "hermes-agent",
                "owner-1",
                "old-base",
                "Old name",
                '{"temperature":0.2}',
                '{"keep":"yes","profile_image_url":"old"}',
                0,
                1,
                1,
            ),
        )
        self.connection.execute(
            "INSERT INTO access_grant(resource_type, resource_id, principal_type, principal_id, permission, created_at) "
            "VALUES ('model', 'hermes-agent', 'user', '*', 'write', 1)"
        )
        self.connection.commit()

        self.assertEqual(MODULE.reconcile(self.database_path, self.config()), "updated")
        self.assertEqual(MODULE.reconcile(self.database_path, self.config()), "unchanged")
        row = self.connection.execute(
            "SELECT params, meta FROM model WHERE id = 'hermes-agent'"
        ).fetchone()
        self.assertEqual(json.loads(row[0]), {"temperature": 0.2})
        self.assertEqual(json.loads(row[1])["keep"], "yes")
        self.assertEqual(
            self.connection.execute("SELECT title FROM chat").fetchone()[0], "Keep me"
        )
        permissions = self.connection.execute(
            "SELECT permission FROM access_grant WHERE resource_id = 'hermes-agent'"
        ).fetchall()
        self.assertEqual(permissions, [("read",)])

    def test_fails_closed_for_wrong_schema_or_unsafe_config(self):
        self.connection.execute("DROP TABLE access_grant")
        self.connection.commit()
        with self.assertRaisesRegex(RuntimeError, "schema"):
            MODULE.reconcile(self.database_path, self.config())
        with self.assertRaisesRegex(ValueError, "config"):
            MODULE.validate_config({**self.config(), "name": "Titus\nInjected"})


if __name__ == "__main__":
    unittest.main()
