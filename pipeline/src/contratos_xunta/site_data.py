from __future__ import annotations

import json
import hashlib
import shutil
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .artifacts import encode_json, window_is_complete, write_atomic
from .privacy import assert_no_tax_identifiers
from .registry import Entity
from .source import contract_detail_url

PUBLIC_RECORD_FIELDS = {
    "record_id",
    "source_id",
    "organism_id",
    "publication_date",
    "subject",
    "amount_eur",
    "vendor_name",
    "duration",
    "source_url",
}
DEFAULT_SHARD_BYTES = 750_000
ANALYSIS_RANKING_LIMIT = 100
AMOUNT_BANDS = (
    ("0-500", 0, 500),
    ("500-2000", 500, 2_000),
    ("2000-5000", 2_000, 5_000),
    ("5000-10000", 5_000, 10_000),
    ("10000-15000", 10_000, 15_000),
    ("15000+", 15_000, None),
)


def encode_explorer_shard(year: int, records: list[dict[str, Any]]) -> bytes:
    return encode_json({"schema_version": 1, "year": year, "records": records})


def partition_explorer_records(
    year: int,
    records: list[dict[str, Any]],
    max_shard_bytes: int,
) -> list[tuple[list[dict[str, Any]], bytes]]:
    shards: list[tuple[list[dict[str, Any]], bytes]] = []
    cursor = 0
    while cursor < len(records):
        best_end = cursor
        best_content = b""
        step = 1
        first_too_large = len(records) + 1

        while cursor + step <= len(records):
            candidate_end = cursor + step
            content = encode_explorer_shard(year, records[cursor:candidate_end])
            if len(content) > max_shard_bytes:
                first_too_large = candidate_end
                break
            best_end = candidate_end
            best_content = content
            if candidate_end == len(records):
                break
            step *= 2

        if best_end == cursor:
            content = encode_explorer_shard(year, records[cursor : cursor + 1])
            if len(content) > max_shard_bytes:
                raise ValueError(
                    f"Record cannot fit within {max_shard_bytes} byte shard budget"
                )
            best_end = cursor + 1
            best_content = content

        upper = min(first_too_large - 1, len(records))
        lower = best_end + 1
        while lower <= upper:
            candidate_end = (lower + upper) // 2
            content = encode_explorer_shard(year, records[cursor:candidate_end])
            if len(content) <= max_shard_bytes:
                best_end = candidate_end
                best_content = content
                lower = candidate_end + 1
            else:
                upper = candidate_end - 1

        shards.append((records[cursor:best_end], best_content))
        cursor = best_end
    return shards


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def rank_records(
    records: list[dict[str, Any]], key_field: str, label_field: str
) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for record in records:
        label = str(record[label_field]).strip()
        if not label:
            continue
        key = str(record[key_field]) if key_field != label_field else label
        item = grouped.setdefault(
            key,
            {"id": key, "name": label, "record_count": 0, "total_amount_eur": 0.0},
        )
        item["record_count"] += 1
        item["total_amount_eur"] += record["amount_eur"]
    return sorted(
        (
            {
                **item,
                "total_amount_eur": round(item["total_amount_eur"], 2),
                "mean_amount_eur": round(item["total_amount_eur"] / item["record_count"], 2),
            }
            for item in grouped.values()
        ),
        key=lambda item: (-item["total_amount_eur"], -item["record_count"], item["name"]),
    )


def build_analysis_scope(
    records: list[dict[str, Any]], *, include_composition: bool = False
) -> dict[str, Any]:
    amounts = [float(record["amount_eur"]) for record in records]
    total_amount = sum(amounts)
    monthly: dict[str, dict[str, float | int | str]] = {}
    yearly: dict[str, dict[str, float | int | str]] = {}
    for record in records:
        for buckets, key in (
            (monthly, record["publication_date"][:7]),
            (yearly, record["publication_date"][:4]),
        ):
            point = buckets.setdefault(key, {"key": key, "record_count": 0, "total_amount_eur": 0.0})
            point["record_count"] += 1
            point["total_amount_eur"] += record["amount_eur"]

    def series(buckets: dict[str, dict[str, float | int | str]]) -> list[dict[str, Any]]:
        return [
            {**buckets[key], "total_amount_eur": round(float(buckets[key]["total_amount_eur"]), 2)}
            for key in sorted(buckets)
        ]

    vendors = rank_records(records, "vendor_name", "vendor_name")
    organisms = rank_records(records, "organism_id", "organism_name")
    categories = rank_records(records, "category", "category")
    amount_band_counts = Counter()
    for amount in amounts:
        for label, start, end in AMOUNT_BANDS:
            if amount >= start and (end is None or amount < end):
                amount_band_counts[label] += 1
                break

    def concentration(limit: int) -> float:
        if total_amount <= 0:
            return 0.0
        return round(sum(item["total_amount_eur"] for item in vendors[:limit]) / total_amount, 4)

    scope = {
        "summary": {
            "record_count": len(records),
            "total_amount_eur": round(total_amount, 2),
            "mean_amount_eur": round(total_amount / len(records), 2) if records else 0.0,
            "median_amount_eur": round(percentile(amounts, 0.5), 2),
            "unique_vendor_names": len(vendors),
            "active_organism_count": len(organisms),
        },
        "timeseries": {"monthly": series(monthly), "yearly": series(yearly)},
        "vendors": {
            "ranking_limit": ANALYSIS_RANKING_LIMIT,
            "ranking_by_amount": vendors[:ANALYSIS_RANKING_LIMIT],
            "ranking_by_count": sorted(
                vendors,
                key=lambda item: (-item["record_count"], -item["total_amount_eur"], item["name"]),
            )[:ANALYSIS_RANKING_LIMIT],
            "concentration": {
                "top1_share": concentration(1),
                "top5_share": concentration(5),
                "top10_share": concentration(10),
            },
        },
        "organisms": organisms,
        "categories": categories,
        "amounts": {
            "percentiles": {
                key: round(percentile(amounts, fraction), 2)
                for key, fraction in (("p10", 0.1), ("p25", 0.25), ("p50", 0.5), ("p75", 0.75), ("p90", 0.9), ("p95", 0.95))
            },
            "minimum_eur": round(min(amounts), 2) if amounts else 0.0,
            "maximum_eur": round(max(amounts), 2) if amounts else 0.0,
            "bands": [
                {"band": label, "record_count": amount_band_counts[label]}
                for label, _, _ in AMOUNT_BANDS
            ],
            "largest_contracts": records[:20] if not records else sorted(
                records,
                key=lambda record: (-record["amount_eur"], record["record_id"]),
            )[:20],
        },
    }
    if include_composition:
        scope["composition"] = {
            "amount_values_eur": amounts,
            "vendors": vendors,
        }
    return scope


def load_complete_records(input_dir: Path) -> tuple[list[dict[str, Any]], int]:
    records_by_id: dict[str, dict[str, Any]] = {}
    window_count = 0
    for manifest_path in sorted(input_dir.glob("*/*.manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        organism_id = manifest.get("organism_id")
        start_date = date.fromisoformat(manifest.get("date_start", ""))
        end_date = date.fromisoformat(manifest.get("date_end", ""))
        if not isinstance(organism_id, int) or not window_is_complete(
            input_dir, organism_id, start_date, end_date
        ):
            raise ValueError(f"Incomplete or invalid window: {manifest_path}")

        records_path = manifest_path.with_name(
            manifest_path.name.removesuffix(".manifest.json") + ".json"
        )
        payload = json.loads(records_path.read_text(encoding="utf-8"))
        for record in payload:
            if not isinstance(record, dict) or set(record) != PUBLIC_RECORD_FIELDS:
                raise ValueError(f"Unexpected public record schema in {records_path}")
            record_id = record["record_id"]
            if not isinstance(record_id, str):
                raise ValueError(f"Invalid record_id in {records_path}")
            record = {
                **record,
                "source_url": contract_detail_url(record["source_id"]),
            }
            existing = records_by_id.get(record_id)
            if existing is not None and existing != record:
                raise ValueError(f"Conflicting duplicate record {record_id}")
            records_by_id[record_id] = record
        window_count += 1
    return list(records_by_id.values()), window_count


def build_site_data(
    input_dir: Path,
    output_dir: Path,
    entities: list[Entity],
    *,
    max_shard_bytes: int = DEFAULT_SHARD_BYTES,
) -> tuple[Path, Path]:
    if max_shard_bytes < 1_000:
        raise ValueError("max_shard_bytes must be at least 1000")

    records, window_count = load_complete_records(input_dir)
    entities_by_id = {entity.organism_id: entity for entity in entities}
    unknown_ids = {record["organism_id"] for record in records} - entities_by_id.keys()
    if unknown_ids:
        raise ValueError(f"Records reference unknown organisms: {sorted(unknown_ids)}")

    totals: dict[int, dict[str, float | int]] = defaultdict(
        lambda: {"record_count": 0, "total_amount_eur": 0.0}
    )
    for record in records:
        organism_id = record["organism_id"]
        totals[organism_id]["record_count"] += 1
        totals[organism_id]["total_amount_eur"] += record["amount_eur"]

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    publication_dates = [record["publication_date"] for record in records]
    dashboard = {
        "schema_version": 1,
        "generated_at": generated_at,
        "window_count": window_count,
        "record_count": len(records),
        "total_amount_eur": round(sum(record["amount_eur"] for record in records), 2),
        "organism_count": len(entities),
        "active_organism_count": len(totals),
        "earliest_publication_date": min(publication_dates, default=None),
        "latest_publication_date": max(publication_dates, default=None),
        "organisms": [
            {
                **entity.as_dict(),
                "record_count": totals[entity.organism_id]["record_count"],
                "total_amount_eur": round(totals[entity.organism_id]["total_amount_eur"], 2),
            }
            for entity in entities
        ],
    }

    public_records = [
        {
            **record,
            "organism_name": entities_by_id[record["organism_id"]].name,
            "category": entities_by_id[record["organism_id"]].category,
        }
        for record in sorted(
        records,
        key=lambda record: (record["publication_date"], record["source_id"]),
        reverse=True,
        )
    ]
    records_by_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    records_by_organism: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in public_records:
        records_by_year[record["publication_date"][:4]].append(record)
        records_by_organism[record["organism_id"]].append(record)

    shard_payloads: list[tuple[Path, bytes]] = []
    years: list[dict[str, Any]] = []
    for year in sorted(records_by_year, reverse=True):
        year_records = records_by_year[year]
        year_shards: list[dict[str, Any]] = []
        month_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for record in year_records:
            month_records[record["publication_date"][:7]].append(record)
        months: list[dict[str, Any]] = []
        for month in sorted(month_records, reverse=True):
            records_for_month = month_records[month]
            month_shards: list[dict[str, Any]] = []
            for current_records, content in partition_explorer_records(
                int(year), records_for_month, max_shard_bytes
            ):
                shard_index = len(month_shards) + 1
                relative_path = (
                    Path("explorer") / year / month / f"part-{shard_index:04d}.json"
                )
                shard_payloads.append((relative_path, content))
                shard = {
                    "path": relative_path.as_posix(),
                    "record_count": len(current_records),
                    "byte_size": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "date_start": min(item["publication_date"] for item in current_records),
                    "date_end": max(item["publication_date"] for item in current_records),
                }
                month_shards.append(shard)
                year_shards.append(shard)
            months.append(
                {
                    "month": month,
                    "record_count": len(records_for_month),
                    "total_amount_eur": round(
                        sum(record["amount_eur"] for record in records_for_month), 2
                    ),
                    "shards": month_shards,
                }
            )
        years.append(
            {
                "year": int(year),
                "record_count": len(year_records),
                "total_amount_eur": round(
                    sum(record["amount_eur"] for record in year_records), 2
                ),
                "shards": year_shards,
                "months": months,
            }
        )

    explorer_manifest = {
        "schema_version": 1,
        "generated_at": generated_at,
        "total_available": len(records),
        "max_shard_bytes": max_shard_bytes,
        "years": years,
    }
    analysis = {
        "schema_version": 1,
        "generated_at": generated_at,
        "grouping_note": "Awardees are grouped by exact published name; no tax identifier matching is used.",
        "all": build_analysis_scope(public_records),
        "years": {
            year: build_analysis_scope(year_records)
            for year, year_records in sorted(records_by_year.items(), reverse=True)
        },
        "organism_scopes": {
            str(organism_id): {
                "organism_id": organism_id,
                "name": entities_by_id[organism_id].name,
                "category": entities_by_id[organism_id].category,
                "all": build_analysis_scope(
                    organism_records, include_composition=True
                ),
                "years": {
                    year: build_analysis_scope(
                        year_records, include_composition=True
                    )
                    for year, year_records in sorted(
                        (
                            (year, [
                                record
                                for record in organism_records
                                if record["publication_date"].startswith(f"{year}-")
                            ])
                            for year in {
                                record["publication_date"][:4]
                                for record in organism_records
                            }
                        ),
                        reverse=True,
                    )
                },
            }
            for organism_id, organism_records in sorted(records_by_organism.items())
        },
    }

    assert_no_tax_identifiers(dashboard)
    assert_no_tax_identifiers(explorer_manifest)
    assert_no_tax_identifiers(analysis)
    for _, content in shard_payloads:
        assert_no_tax_identifiers(json.loads(content))

    dashboard_path = output_dir / "dashboard.json"
    analysis_path = output_dir / "analysis.json"
    explorer_dir = output_dir / "explorer"
    explorer_manifest_path = explorer_dir / "manifest.json"
    if explorer_dir.exists():
        shutil.rmtree(explorer_dir)
    legacy_contracts_path = output_dir / "contracts.json"
    if legacy_contracts_path.exists():
        legacy_contracts_path.unlink()
    write_atomic(dashboard_path, encode_json(dashboard))
    write_atomic(analysis_path, encode_json(analysis))
    for relative_path, content in shard_payloads:
        write_atomic(output_dir / relative_path, content)
    write_atomic(explorer_manifest_path, encode_json(explorer_manifest))
    return dashboard_path, explorer_manifest_path
