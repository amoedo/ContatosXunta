from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .artifacts import window_is_complete
from .site_data import load_annual_summaries


@dataclass(frozen=True)
class PruneResult:
    removed_windows: int
    removed_records: int


def detail_cutoff(as_of: date, detail_months: int) -> date:
    if detail_months < 1:
        raise ValueError("detail_months must be positive")
    month_index = as_of.year * 12 + as_of.month - detail_months
    return date(month_index // 12, month_index % 12 + 1, 1)


def prune_archived_windows(
    input_dir: Path,
    history_dir: Path,
    *,
    as_of: date,
    detail_months: int,
) -> PruneResult:
    archived_years = set(load_annual_summaries(history_dir))
    cutoff = detail_cutoff(as_of, detail_months)
    removed_windows = 0
    removed_records = 0
    for manifest_path in sorted(input_dir.glob("*/*.manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        organism_id = manifest.get("organism_id")
        start = date.fromisoformat(manifest.get("date_start", ""))
        end = date.fromisoformat(manifest.get("date_end", ""))
        if not isinstance(organism_id, int) or not window_is_complete(
            input_dir, organism_id, start, end
        ):
            raise ValueError(f"Incomplete or invalid window: {manifest_path}")
        if end >= cutoff or str(start.year) not in archived_years:
            continue
        records_path = manifest_path.with_name(
            manifest_path.name.removesuffix(".manifest.json") + ".json"
        )
        removed_records += manifest["record_count"]
        records_path.unlink()
        manifest_path.unlink()
        removed_windows += 1

    for organism_dir in input_dir.iterdir() if input_dir.exists() else ():
        if organism_dir.is_dir() and not any(organism_dir.iterdir()):
            organism_dir.rmdir()
    return PruneResult(removed_windows, removed_records)