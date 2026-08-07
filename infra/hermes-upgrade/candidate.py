#!/usr/bin/env python3
"""Validation for release candidates and named Hermes qualification profiles."""

from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

EXPECTED_AGENTS = ["walter", "titus", "mitchel"]
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
OCI_SHA256_RE = re.compile(r"@sha256:[0-9a-f]{64}$")
LOCAL_STUB_HOST_RE = re.compile(r"^hermes-stub-[a-z0-9-]+$")


class ValidationError(ValueError):
    """Raised when a candidate or qualification contract is unsafe."""


def load_yaml(source: Path | str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, dict):
        return copy.deepcopy(source)

    path = Path(source)
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ValidationError(f"cannot load manifest: {path.name}") from exc
    if not isinstance(value, dict):
        raise ValidationError(f"manifest must be a mapping: {path.name}")
    return value


def _missing(data: dict[str, Any], *keys: str) -> bool:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return True
        current = current[key]
    return current in (None, "", [])


def validate_candidate(source: Path | str | dict[str, Any]) -> dict[str, Any]:
    data = load_yaml(source)
    errors: list[str] = []

    if data.get("schema_version") != 1:
        errors.append("schema_version")
    if _missing(data, "candidate_id"):
        errors.append("candidate_id")

    for key in ("tag", "version", "source_commit", "oci_index", "arm64_child"):
        if _missing(data, "upstream", key):
            errors.append(f"upstream.{key}")
    upstream = data.get("upstream") or {}
    if upstream.get("oci_index") and not OCI_SHA256_RE.search(upstream["oci_index"]):
        errors.append("upstream.oci_index")
    if upstream.get("arm64_child") and not SHA256_RE.fullmatch(upstream["arm64_child"]):
        errors.append("upstream.arm64_child")
    if upstream.get("source_commit") and not re.fullmatch(r"[0-9a-f]{40}", upstream["source_commit"]):
        errors.append("upstream.source_commit")

    for key in ("reference", "architecture", "image_id"):
        if _missing(data, "derived", key):
            errors.append(f"derived.{key}")
    derived = data.get("derived") or {}
    if derived.get("architecture") != "linux/arm64":
        errors.append("derived.architecture")
    if derived.get("image_id") and not SHA256_RE.fullmatch(derived["image_id"]):
        errors.append("derived.image_id")

    policy = data.get("policy") or {}
    if policy.get("approvals_mode") != "manual":
        errors.append("policy.approvals_mode")
    if policy.get("cron_mode") != "deny":
        errors.append("policy.cron_mode")

    if data.get("agents") != EXPECTED_AGENTS:
        errors.append("agents")

    if errors:
        raise ValidationError("invalid candidate fields: " + ", ".join(errors))
    return data


def validate_profile(root: Path, profile_source: Path | str | dict[str, Any], stub_names: set[str]) -> dict[str, Any]:
    profile = load_yaml(profile_source)
    agent = profile.get("agent")
    errors: list[str] = []

    if profile.get("schema_version") != 1:
        errors.append("schema_version")
    if agent not in EXPECTED_AGENTS:
        errors.append("agent")
    if (profile.get("state") or {}).get("mode") != "synthetic":
        errors.append("state.mode=synthetic")

    source = profile.get("source")
    if not isinstance(source, str) or not source:
        errors.append("source")
    else:
        source_root = (root / source).resolve()
        if not source_root.is_relative_to(root.resolve()):
            errors.append("source.outside_repository")
        elif not source_root.is_dir():
            errors.append("source.exists")
        for required in profile.get("required_paths") or []:
            required_path = (source_root / required).resolve()
            if not required_path.is_relative_to(source_root) or not required_path.exists():
                errors.append(f"required_path:{required}")

    missing_stubs = sorted(set(profile.get("required_stubs") or []) - stub_names)
    if missing_stubs:
        errors.append("required_stubs:" + ",".join(missing_stubs))
    if not profile.get("allowed_operations"):
        errors.append("allowed_operations")
    if not profile.get("denied_operations"):
        errors.append("denied_operations")

    if errors:
        raise ValidationError(f"invalid {agent or 'unknown'} profile: " + ", ".join(errors))
    return profile


def validate_profiles(
    root: Path,
    stubs_source: Path | str | dict[str, Any],
    overrides: dict[str, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    stubs = load_yaml(stubs_source)
    if stubs.get("schema_version") != 1 or stubs.get("mode") != "deterministic":
        raise ValidationError("stub catalog must be deterministic schema 1")
    if stubs.get("delivery") != "disabled":
        raise ValidationError("stub catalog delivery must be disabled")
    stub_names: set[str] = set()
    for item in stubs.get("services") or []:
        if not isinstance(item, dict) or not item.get("name"):
            raise ValidationError("stub catalog contains an invalid service")
        name = item["name"]
        if name in stub_names:
            raise ValidationError(f"stub catalog duplicate service: {name}")
        stub_names.add(name)
        try:
            parsed = urlparse(str(item.get("endpoint", "")))
            port = parsed.port
        except ValueError as exc:
            raise ValidationError(f"stub endpoint is not local: {name}") from exc
        if (
            parsed.scheme != "http"
            or not parsed.hostname
            or not LOCAL_STUB_HOST_RE.fullmatch(parsed.hostname)
            or port != 8080
            or parsed.path not in ("", "/")
        ):
            raise ValidationError(f"stub endpoint is not local: {name}")

    validated: dict[str, dict[str, Any]] = {}
    for agent in EXPECTED_AGENTS:
        profile_path = root / "tenants" / f"hermes-{agent}" / "qualification" / "profile.yaml"
        source: Path | dict[str, Any] = (overrides or {}).get(agent, profile_path)
        profile = validate_profile(root, source, stub_names)
        if profile["agent"] != agent:
            raise ValidationError(f"profile identity mismatch: {agent}")
        validated[agent] = profile
    return validated
