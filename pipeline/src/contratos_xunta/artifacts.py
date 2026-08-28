from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .models import CanonicalRecord


def encode_json(payload: Any) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def write_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(content)
    os.replace(temporary, path)


def window_artifact_paths(
    output_dir: Path,
    organism_id: int,
    start_date: date,
    end_date: date,
) -> tuple[Path, Path]:
    stem = f"{start_date.isoformat()}_{end_date.isoformat()}"
    organism_dir = output_dir / str(organism_id)
    return organism_dir / f"{stem}.json", organism_dir / f"{stem}.manifest.json"


def window_is_complete(
    output_dir: Path,
    organism_id: int,
    start_date: date,
    end_date: date,
) -> bool:
    records_path, manifest_path = window_artifact_paths(
        output_dir, organism_id, start_date, end_date
    )
    try:
        records_content = records_path.read_bytes()
        records = json.loads(records_content)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return (
        isinstance(records, list)
        and isinstance(manifest, dict)
        and manifest.get("schema_version") == 1
        and manifest.get("organism_id") == organism_id
        and manifest.get("date_start") == start_date.isoformat()
        and manifest.get("date_end") == end_date.isoformat()
        and manifest.get("record_count") == len(records)
        and manifest.get("records_sha256") == hashlib.sha256(records_content).hexdigest()
        and manifest.get("complete") is True
    )


def write_window_artifacts(
    output_dir: Path,
    organism_id: int,
    start_date: date,
    end_date: date,
    records: list[CanonicalRecord],
) -> tuple[Path, Path]:
    records_path, manifest_path = window_artifact_paths(
        output_dir, organism_id, start_date, end_date
    )

    records_payload = [record.as_dict() for record in sorted(records, key=lambda item: item.record_id)]
    records_content = encode_json(records_payload)
    checksum = hashlib.sha256(records_content).hexdigest()
    manifest = {
        "schema_version": 1,
        "organism_id": organism_id,
        "date_start": start_date.isoformat(),
        "date_end": end_date.isoformat(),
        "date_boundaries": "inclusive",
        "record_count": len(records_payload),
        "records_sha256": checksum,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "complete": True,
    }

    write_atomic(records_path, records_content)
    write_atomic(manifest_path, encode_json(manifest))
    return records_path, manifest_path
