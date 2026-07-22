#!/usr/bin/env python3
"""Reconcile the deployment-owned Open WebUI persona model presentation."""

import argparse
import json
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlparse


REQUIRED_MODEL_COLUMNS = {
    "id",
    "user_id",
    "base_model_id",
    "name",
    "params",
    "meta",
    "is_active",
    "created_at",
    "updated_at",
}
REQUIRED_GRANT_COLUMNS = {
    "resource_type",
    "resource_id",
    "principal_type",
    "principal_id",
    "permission",
    "created_at",
}


def validate_config(raw):
    if not isinstance(raw, dict) or set(raw) != {
        "modelId",
        "name",
        "profileImageUrl",
    }:
        raise ValueError("invalid persona model config")
    if raw["modelId"] != "hermes-agent":
        raise ValueError("invalid persona model config")
    if raw["name"] not in {"Titus", "Walter"}:
        raise ValueError("invalid persona model config")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9 -]{0,79}", raw["name"]):
        raise ValueError("invalid persona model config")
    expected_path = f"/api/agent-identity/{raw['name'].lower()}/logo"
    parsed = urlparse(raw["profileImageUrl"])
    if (
        parsed.scheme != "https"
        or parsed.hostname != "www.overnightdesk.com"
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path != expected_path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("invalid persona model config")
    return raw


def table_columns(connection, table):
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def require_schema(connection):
    if not REQUIRED_MODEL_COLUMNS.issubset(table_columns(connection, "model")):
        raise RuntimeError("incompatible Open WebUI model schema")
    if not REQUIRED_GRANT_COLUMNS.issubset(
        table_columns(connection, "access_grant")
    ):
        raise RuntimeError("incompatible Open WebUI access grant schema")
    user_columns = table_columns(connection, "user")
    if not {"id", "role", "created_at"}.issubset(user_columns):
        raise RuntimeError("incompatible Open WebUI user schema")


def choose_owner(connection):
    row = connection.execute(
        "SELECT id FROM user ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at, id LIMIT 1"
    ).fetchone()
    if row is None:
        raise RuntimeError("Open WebUI persona model requires an existing user")
    return row[0]


def verify(database_path, raw_config):
    config = validate_config(raw_config)
    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        require_schema(connection)
        row = connection.execute(
            "SELECT base_model_id, name, meta, is_active FROM model WHERE id = ?",
            (config["modelId"],),
        ).fetchone()
        if row is None:
            raise RuntimeError("Open WebUI persona model is absent")
        try:
            meta = json.loads(row[2])
        except (TypeError, json.JSONDecodeError) as error:
            raise RuntimeError("invalid existing Open WebUI model JSON") from error
        if (
            row[0] is not None
            or row[1] != config["name"]
            or not isinstance(meta, dict)
            or meta.get("profile_image_url") != config["profileImageUrl"]
            or row[3] != 1
        ):
            raise RuntimeError("Open WebUI persona model does not match config")
        grants = connection.execute(
            "SELECT permission, COUNT(*) FROM access_grant WHERE resource_type = 'model' "
            "AND resource_id = ? AND principal_type = 'user' AND principal_id = '*' "
            "AND permission IN ('read', 'write') GROUP BY permission",
            (config["modelId"],),
        ).fetchall()
        if grants != [("read", 1)]:
            raise RuntimeError("Open WebUI persona model grant is invalid")
    finally:
        connection.close()


def reconcile(database_path, raw_config):
    config = validate_config(raw_config)
    connection = sqlite3.connect(database_path, timeout=20)
    try:
        connection.execute("PRAGMA busy_timeout=20000")
        connection.execute("BEGIN IMMEDIATE")
        require_schema(connection)
        now = int(time.time())
        existing = connection.execute(
            "SELECT user_id, base_model_id, name, params, meta, is_active, created_at "
            "FROM model WHERE id = ?",
            (config["modelId"],),
        ).fetchone()
        changed = False
        if existing is None:
            owner_id = choose_owner(connection)
            meta = {"profile_image_url": config["profileImageUrl"]}
            connection.execute(
                "INSERT INTO model(id, user_id, base_model_id, name, params, meta, is_active, created_at, updated_at) "
                "VALUES (?, ?, NULL, ?, '{}', ?, 1, ?, ?)",
                (config["modelId"], owner_id, config["name"], json.dumps(meta), now, now),
            )
            changed = True
        else:
            try:
                meta = json.loads(existing[4])
                json.loads(existing[3])
            except (TypeError, json.JSONDecodeError) as error:
                raise RuntimeError("invalid existing Open WebUI model JSON") from error
            if not isinstance(meta, dict):
                raise RuntimeError("invalid existing Open WebUI model metadata")
            desired_meta = {**meta, "profile_image_url": config["profileImageUrl"]}
            if (
                existing[1] is not None
                or existing[2] != config["name"]
                or desired_meta != meta
                or existing[5] != 1
            ):
                connection.execute(
                    "UPDATE model SET base_model_id = NULL, name = ?, meta = ?, is_active = 1, updated_at = ? WHERE id = ?",
                    (
                        config["name"],
                        json.dumps(desired_meta, separators=(",", ":"), sort_keys=True),
                        now,
                        config["modelId"],
                    ),
                )
                changed = True

        removed = connection.execute(
            "DELETE FROM access_grant WHERE resource_type = 'model' AND resource_id = ? "
            "AND principal_type = 'user' AND principal_id = '*' AND permission = 'write'",
            (config["modelId"],),
        ).rowcount
        inserted = connection.execute(
            "INSERT OR IGNORE INTO access_grant(resource_type, resource_id, principal_type, principal_id, permission, created_at) "
            "VALUES ('model', ?, 'user', '*', 'read', ?)",
            (config["modelId"], now),
        ).rowcount
        connection.commit()
        return "updated" if changed or removed or inserted else "unchanged"
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if not args.database.is_file() or args.database.stat().st_size == 0:
        print("persona_model=deferred")
        return
    config = json.loads(args.config.read_text(encoding="utf-8"))
    if args.verify:
        verify(args.database, config)
        print("persona_model=verified")
    else:
        print(f"persona_model={reconcile(args.database, config)}")


if __name__ == "__main__":
    main()
