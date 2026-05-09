from datetime import datetime, timezone

import pytest

from src.db import (
    INSTRUCTION_GRADE,
    PROVENANCE_VALUES,
    _validate_provenance,
    _vector_literal,
    _ensure_utc,
)
from src.server import _iso, _row_to_payload


def test_provenance_values_complete():
    assert PROVENANCE_VALUES == {
        "observed",
        "inferred",
        "confirmed",
        "imported",
        "generated",
    }
    assert INSTRUCTION_GRADE == {"observed", "confirmed"}
    assert INSTRUCTION_GRADE.issubset(PROVENANCE_VALUES)


@pytest.mark.parametrize("value", sorted(PROVENANCE_VALUES))
def test_validate_provenance_accepts_known(value):
    _validate_provenance(value)


def test_validate_provenance_rejects_unknown():
    with pytest.raises(ValueError, match="invalid provenance"):
        _validate_provenance("trustworthy")


def test_vector_literal_format():
    assert _vector_literal([1.0, 2.5, -3.25]) == "[1.000000,2.500000,-3.250000]"


def test_vector_literal_coerces_ints():
    # pgvector accepts numeric inputs; we accept any iterable of numbers.
    assert _vector_literal([1, 2, 3]) == "[1.000000,2.000000,3.000000]"


def test_ensure_utc_naive_becomes_utc():
    naive = datetime(2026, 1, 1, 12, 0, 0)
    assert _ensure_utc(naive).tzinfo == timezone.utc


def test_ensure_utc_preserves_aware():
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert _ensure_utc(aware) is aware


def test_iso_handles_none():
    assert _iso(None) is None


def test_iso_handles_naive_datetime_as_utc():
    out = _iso(datetime(2026, 1, 1, 12, 0, 0))
    assert out is not None
    assert out.endswith("+00:00")


def test_row_to_payload_full_round_trip():
    row = {
        "id": 7,
        "category": "decision",
        "content": "use Postgres",
        "tags": ["arch"],
        "is_active": True,
        "provenance": "confirmed",
        "source": "meeting-2026-05-09",
        "runtime": "hermes-agent",
        "reasoning_model": "anthropic/claude-opus-4.7",
        "channel": "cli",
        "task_id": "task-42",
        "confidence": 0.9,
        "user_confirmed_at": datetime(2026, 5, 9, 18, 0, 0, tzinfo=timezone.utc),
        "supersedes_id": None,
        "created_at": datetime(2026, 5, 9, 18, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 5, 9, 18, 0, 0, tzinfo=timezone.utc),
        "similarity": 0.87654321,
    }
    payload = _row_to_payload(row, include_similarity=True)
    assert payload["id"] == 7
    assert payload["provenance"] == "confirmed"
    assert payload["task_id"] == "task-42"
    assert payload["confidence"] == 0.9
    assert payload["similarity"] == 0.8765
    assert payload["user_confirmed_at"].endswith("+00:00")


def test_row_to_payload_handles_minimal_row():
    row = {"id": 1, "category": "env", "tags": None}
    payload = _row_to_payload(row)
    assert payload["id"] == 1
    assert payload["tags"] == []
    assert payload["provenance"] is None
    assert "similarity" not in payload  # not requested
