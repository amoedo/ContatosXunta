from __future__ import annotations

import json
import hashlib
import re
import shutil
import unicodedata
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
DEFAULT_DETAIL_MONTHS = 24
ANALYSIS_RANKING_LIMIT = 100
REPEAT_CLUSTER_LIMIT = 50
REPEAT_EVIDENCE_LIMIT = 20
REPEAT_MIN_RECORDS = 3
REPEAT_WINDOW_DAYS = 30
SIGNAL_CLUSTER_LIMIT = 50
SIGNAL_EVIDENCE_LIMIT = 20
SIGNAL_NEAR_FRACTION = 0.05
SIGNAL_WINDOW_DAYS = 30
SIGNAL_REFERENCES = (
    {"id": "supplies-services", "net_amount_eur": 15_000, "published_reference_eur": 18_150},
    {"id": "works", "net_amount_eur": 40_000, "published_reference_eur": 48_400},
)
AMOUNT_BANDS = (
    ("0-500", 0, 500),
    ("500-2000", 500, 2_000),
    ("2000-5000", 2_000, 5_000),
    ("5000-10000", 5_000, 10_000),
    ("10000-15000", 10_000, 15_000),
    ("15000+", 15_000, None),
)


def normalize_pattern_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    unaccented = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", unaccented).split())


def contract_excerpt(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "record_id": record["record_id"],
        "publication_date": record["publication_date"],
        "subject": record["subject"],
        "vendor_name": record["vendor_name"],
        "organism_name": record["organism_name"],
        "amount_eur": record["amount_eur"],
        "source_url": record["source_url"],
    }


def find_contract_signals(records: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(
        records,
        key=lambda item: (item["publication_date"], item["record_id"]),
    )
    grouped: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for record in ordered:
        vendor_name = str(record["vendor_name"]).strip()
        if vendor_name:
            grouped[(record["organism_id"], vendor_name)].append(record)

    candidates: list[dict[str, Any]] = []
    reference_summaries: list[dict[str, Any]] = []
    for reference in SIGNAL_REFERENCES:
        reference_eur = float(reference["published_reference_eur"])
        near_start = reference_eur * (1 - SIGNAL_NEAR_FRACTION)
        near_records = [
            record
            for record in ordered
            if near_start <= float(record["amount_eur"]) < reference_eur
        ]
        over_records = [
            record for record in ordered if float(record["amount_eur"]) >= reference_eur
        ]
        reference_summaries.append(
            {
                **reference,
                "near_minimum_eur": round(near_start, 2),
                "near_record_count": len(near_records),
                "at_or_above_record_count": len(over_records),
                "near_contracts": [
                    contract_excerpt(record)
                    for record in sorted(
                        near_records,
                        key=lambda item: (-item["amount_eur"], item["record_id"]),
                    )[:SIGNAL_EVIDENCE_LIMIT]
                ],
                "at_or_above_contracts": [
                    contract_excerpt(record)
                    for record in sorted(
                        over_records,
                        key=lambda item: (-item["amount_eur"], item["record_id"]),
                    )[:SIGNAL_EVIDENCE_LIMIT]
                ],
            }
        )

        for (organism_id, vendor_name), group in grouped.items():
            eligible = [
                record for record in group if float(record["amount_eur"]) < reference_eur
            ]
            if len(eligible) < 2:
                continue
            dates = [date.fromisoformat(item["publication_date"]) for item in eligible]
            left = 0
            best: list[dict[str, Any]] = []
            best_score: tuple[int, int, int, float, float] | None = None
            for right, right_date in enumerate(dates):
                while (right_date - dates[left]).days > SIGNAL_WINDOW_DAYS:
                    left += 1
                window = eligible[left : right + 1]
                if len(window) < 2:
                    continue
                total = sum(float(item["amount_eur"]) for item in window)
                near_gap = min(reference_eur - float(item["amount_eur"]) for item in window)
                if total < reference_eur:
                    continue
                normalized_subjects = {
                    normalize_pattern_text(str(item["subject"])) for item in window
                }
                same_subject = len(normalized_subjects) == 1
                has_near_reference = near_gap <= reference_eur * SIGNAL_NEAR_FRACTION
                score = (
                    int(same_subject),
                    int(has_near_reference),
                    len(window),
                    -near_gap,
                    total,
                )
                if best_score is None or score > best_score:
                    best = window
                    best_score = score
            if not best:
                continue

            amounts = [float(item["amount_eur"]) for item in best]
            normalized_subjects = {
                normalize_pattern_text(str(item["subject"])) for item in best
            }
            date_start = best[0]["publication_date"]
            date_end = best[-1]["publication_date"]
            candidate_key = "\0".join(
                [
                    str(reference["id"]),
                    str(organism_id),
                    vendor_name,
                    *(str(item["record_id"]) for item in best),
                ]
            )
            candidates.append(
                {
                    "id": hashlib.sha256(candidate_key.encode("utf-8")).hexdigest()[:16],
                    "reference_id": reference["id"],
                    "reference_eur": reference["published_reference_eur"],
                    "organism_id": organism_id,
                    "organism_name": best[0]["organism_name"],
                    "vendor_name": vendor_name,
                    "record_count": len(best),
                    "date_start": date_start,
                    "date_end": date_end,
                    "window_days": (
                        date.fromisoformat(date_end) - date.fromisoformat(date_start)
                    ).days,
                    "total_amount_eur": round(sum(amounts), 2),
                    "minimum_amount_eur": round(min(amounts), 2),
                    "maximum_amount_eur": round(max(amounts), 2),
                    "has_near_reference": (
                        reference_eur - max(amounts)
                        <= reference_eur * SIGNAL_NEAR_FRACTION
                    ),
                    "same_normalized_subject": len(normalized_subjects) == 1,
                    "contracts": [
                        contract_excerpt(item) for item in best[:SIGNAL_EVIDENCE_LIMIT]
                    ],
                }
            )

    return {
        "assumed_vat_rate": 0.21,
        "near_fraction": SIGNAL_NEAR_FRACTION,
        "window_days": SIGNAL_WINDOW_DAYS,
        "analyzed_record_count": len(records),
        "scope_record_count": len(records),
        "references": reference_summaries,
        "tranching_candidates": sorted(
            candidates,
            key=lambda item: (
                -int(item["same_normalized_subject"]),
                -int(item["has_near_reference"]),
                -(item["maximum_amount_eur"] / item["reference_eur"]),
                -item["total_amount_eur"],
                item["window_days"],
                item["id"],
            ),
        )[:SIGNAL_CLUSTER_LIMIT],
    }


def merge_contract_signals(scopes: list[dict[str, Any]]) -> dict[str, Any]:
    signals = [
        scope.get("patterns", {}).get("contract_signals")
        for scope in scopes
    ]
    available = [signal for signal in signals if isinstance(signal, dict)]
    if not available:
        return find_contract_signals([])

    candidates_by_id: dict[str, dict[str, Any]] = {}
    references_by_id: dict[str, dict[str, Any]] = {}
    for signal in available:
        for candidate in signal.get("tranching_candidates", []):
            candidates_by_id[candidate["id"]] = candidate
        for reference in signal.get("references", []):
            reference_id = reference["id"]
            merged = references_by_id.setdefault(
                reference_id,
                {
                    **reference,
                    "near_record_count": 0,
                    "at_or_above_record_count": 0,
                    "near_contracts": [],
                    "at_or_above_contracts": [],
                },
            )
            merged["near_record_count"] += reference["near_record_count"]
            merged["at_or_above_record_count"] += reference["at_or_above_record_count"]
            merged["near_contracts"].extend(reference["near_contracts"])
            merged["at_or_above_contracts"].extend(reference["at_or_above_contracts"])

    def bounded_contracts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unique = {item["record_id"]: item for item in items}
        return sorted(
            unique.values(),
            key=lambda item: (-item["amount_eur"], item["record_id"]),
        )[:SIGNAL_EVIDENCE_LIMIT]

    references = []
    for configured in SIGNAL_REFERENCES:
        reference = references_by_id.get(str(configured["id"]))
        if reference is None:
            reference = {
                **configured,
                "near_minimum_eur": round(
                    float(configured["published_reference_eur"])
                    * (1 - SIGNAL_NEAR_FRACTION),
                    2,
                ),
                "near_record_count": 0,
                "at_or_above_record_count": 0,
                "near_contracts": [],
                "at_or_above_contracts": [],
            }
        else:
            reference["near_contracts"] = bounded_contracts(reference["near_contracts"])
            reference["at_or_above_contracts"] = bounded_contracts(
                reference["at_or_above_contracts"]
            )
        references.append(reference)

    return {
        "assumed_vat_rate": 0.21,
        "near_fraction": SIGNAL_NEAR_FRACTION,
        "window_days": SIGNAL_WINDOW_DAYS,
        "analyzed_record_count": sum(
            int(signal.get("analyzed_record_count", 0)) for signal in available
        ),
        "scope_record_count": sum(
            int(scope.get("summary", {}).get("record_count", 0)) for scope in scopes
        ),
        "references": references,
        "tranching_candidates": sorted(
            candidates_by_id.values(),
            key=lambda item: (
                -int(item["same_normalized_subject"]),
                -int(item.get("has_near_reference", False)),
                -(item["maximum_amount_eur"] / item["reference_eur"]),
                -item["total_amount_eur"],
                item["window_days"],
                item["id"],
            ),
        )[:SIGNAL_CLUSTER_LIMIT],
    }


def find_repeat_clusters(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        normalized_subject = normalize_pattern_text(str(record["subject"]))
        vendor_name = str(record["vendor_name"]).strip()
        if normalized_subject and vendor_name:
            grouped[(record["organism_id"], vendor_name, normalized_subject)].append(record)

    clusters: list[dict[str, Any]] = []
    for (organism_id, vendor_name, normalized_subject), group in grouped.items():
        if len(group) < REPEAT_MIN_RECORDS:
            continue
        ordered = sorted(group, key=lambda item: (item["publication_date"], item["record_id"]))
        dates = [date.fromisoformat(item["publication_date"]) for item in ordered]
        left = 0
        best: list[dict[str, Any]] = []
        best_total = 0.0
        for right, right_date in enumerate(dates):
            while (right_date - dates[left]).days > REPEAT_WINDOW_DAYS:
                left += 1
            candidate = ordered[left : right + 1]
            candidate_total = sum(float(item["amount_eur"]) for item in candidate)
            if len(candidate) > len(best) or (
                len(candidate) == len(best) and candidate_total > best_total
            ):
                best = candidate
                best_total = candidate_total
        if len(best) < REPEAT_MIN_RECORDS:
            continue

        amounts = [float(item["amount_eur"]) for item in best]
        date_start = best[0]["publication_date"]
        date_end = best[-1]["publication_date"]
        group_key = f"{organism_id}\0{vendor_name}\0{normalized_subject}"
        clusters.append(
            {
                "id": hashlib.sha256(group_key.encode("utf-8")).hexdigest()[:16],
                "organism_id": organism_id,
                "organism_name": best[0]["organism_name"],
                "vendor_name": vendor_name,
                "subject": best[0]["subject"],
                "normalized_subject": normalized_subject,
                "record_count": len(best),
                "date_start": date_start,
                "date_end": date_end,
                "window_days": max(
                    1, (date.fromisoformat(date_end) - date.fromisoformat(date_start)).days
                ),
                "total_amount_eur": round(best_total, 2),
                "minimum_amount_eur": round(min(amounts), 2),
                "maximum_amount_eur": round(max(amounts), 2),
                "contracts": [
                    {
                        "record_id": item["record_id"],
                        "publication_date": item["publication_date"],
                        "subject": item["subject"],
                        "vendor_name": item["vendor_name"],
                        "organism_name": item["organism_name"],
                        "amount_eur": item["amount_eur"],
                        "source_url": item["source_url"],
                    }
                    for item in best[:REPEAT_EVIDENCE_LIMIT]
                ],
            }
        )
    return sorted(
        clusters,
        key=lambda item: (
            -item["record_count"],
            item["window_days"],
            -item["total_amount_eur"],
            item["id"],
        ),
    )[:REPEAT_CLUSTER_LIMIT]


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
        "patterns": {
            "window_days": REPEAT_WINDOW_DAYS,
            "minimum_records": REPEAT_MIN_RECORDS,
            "repeat_clusters": find_repeat_clusters(records),
            "contract_signals": find_contract_signals(records),
        },
    }
    if include_composition:
        scope["composition"] = {
            "amount_values_eur": amounts,
            "vendors": vendors,
        }
    return scope


def combine_compact_analysis_scopes(scopes: list[dict[str, Any]]) -> dict[str, Any]:
    if not scopes:
        return build_analysis_scope([])
    if len(scopes) == 1:
        return scopes[0]

    def merge_rankings(groups: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for items in groups:
            for item in items:
                current = merged.setdefault(
                    item["id"],
                    {
                        "id": item["id"],
                        "name": item["name"],
                        "record_count": 0,
                        "total_amount_eur": 0.0,
                    },
                )
                current["record_count"] += item["record_count"]
                current["total_amount_eur"] += item["total_amount_eur"]
        return [
            {
                **item,
                "total_amount_eur": round(item["total_amount_eur"], 2),
                "mean_amount_eur": round(
                    item["total_amount_eur"] / item["record_count"], 2
                ),
            }
            for item in merged.values()
        ]

    def unique_vendor_ranking(scope: dict[str, Any]) -> list[dict[str, Any]]:
        by_id = {
            item["id"]: item
            for ranking in (
                scope["vendors"]["ranking_by_amount"],
                scope["vendors"]["ranking_by_count"],
            )
            for item in ranking
        }
        return list(by_id.values())

    def merge_series(name: str) -> list[dict[str, Any]]:
        points: dict[str, dict[str, Any]] = {}
        for scope in scopes:
            for item in scope["timeseries"][name]:
                point = points.setdefault(
                    item["key"],
                    {"key": item["key"], "record_count": 0, "total_amount_eur": 0.0},
                )
                point["record_count"] += item["record_count"]
                point["total_amount_eur"] += item["total_amount_eur"]
        return [
            {**points[key], "total_amount_eur": round(points[key]["total_amount_eur"], 2)}
            for key in sorted(points)
        ]

    record_count = sum(scope["summary"]["record_count"] for scope in scopes)
    total_amount = round(
        sum(scope["summary"]["total_amount_eur"] for scope in scopes), 2
    )
    vendors = sorted(
        merge_rankings([unique_vendor_ranking(scope) for scope in scopes]),
        key=lambda item: (-item["total_amount_eur"], -item["record_count"], item["name"]),
    )
    vendors_by_count = sorted(
        vendors,
        key=lambda item: (-item["record_count"], -item["total_amount_eur"], item["name"]),
    )
    organisms = sorted(
        merge_rankings([scope["organisms"] for scope in scopes]),
        key=lambda item: (-item["total_amount_eur"], -item["record_count"], item["name"]),
    )
    categories = sorted(
        merge_rankings([scope["categories"] for scope in scopes]),
        key=lambda item: (-item["total_amount_eur"], -item["record_count"], item["name"]),
    )
    weights = [scope["summary"]["record_count"] for scope in scopes]

    def weighted(values: list[float]) -> float:
        return round(
            sum(value * weight for value, weight in zip(values, weights, strict=True))
            / record_count,
            2,
        ) if record_count else 0.0

    def concentration(limit: int) -> float:
        return round(
            sum(item["total_amount_eur"] for item in vendors[:limit]) / total_amount, 4
        ) if total_amount else 0.0

    band_counts = Counter()
    for scope in scopes:
        for item in scope["amounts"]["bands"]:
            band_counts[item["band"]] += item["record_count"]
    largest_contracts = sorted(
        (
            item
            for scope in scopes
            for item in scope["amounts"]["largest_contracts"]
        ),
        key=lambda item: (-item["amount_eur"], item["record_id"]),
    )[:20]
    repeat_clusters_by_id: dict[str, dict[str, Any]] = {}
    for scope in scopes:
        for cluster in scope.get("patterns", {}).get("repeat_clusters", []):
            current = repeat_clusters_by_id.get(cluster["id"])
            if current is None or (
                cluster["record_count"],
                -cluster["window_days"],
                cluster["total_amount_eur"],
            ) > (
                current["record_count"],
                -current["window_days"],
                current["total_amount_eur"],
            ):
                repeat_clusters_by_id[cluster["id"]] = cluster
    repeat_clusters = sorted(
        repeat_clusters_by_id.values(),
        key=lambda item: (
            -item["record_count"],
            item["window_days"],
            -item["total_amount_eur"],
            item["id"],
        ),
    )[:REPEAT_CLUSTER_LIMIT]
    ranking_limit = max(scope["vendors"]["ranking_limit"] for scope in scopes)
    return {
        "summary": {
            "record_count": record_count,
            "total_amount_eur": total_amount,
            "mean_amount_eur": round(total_amount / record_count, 2) if record_count else 0.0,
            "median_amount_eur": weighted(
                [scope["summary"]["median_amount_eur"] for scope in scopes]
            ),
            "unique_vendor_names": sum(
                scope["summary"]["unique_vendor_names"] for scope in scopes
            ),
            "active_organism_count": len(organisms),
        },
        "timeseries": {"monthly": merge_series("monthly"), "yearly": merge_series("yearly")},
        "vendors": {
            "ranking_limit": ranking_limit,
            "ranking_by_amount": vendors[:ranking_limit],
            "ranking_by_count": vendors_by_count[:ranking_limit],
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
                key: weighted([scope["amounts"]["percentiles"][key] for scope in scopes])
                for key in ("p10", "p25", "p50", "p75", "p90", "p95")
            },
            "minimum_eur": min(scope["amounts"]["minimum_eur"] for scope in scopes),
            "maximum_eur": max(scope["amounts"]["maximum_eur"] for scope in scopes),
            "bands": [
                {"band": label, "record_count": band_counts[label]}
                for label, _, _ in AMOUNT_BANDS
            ],
            "largest_contracts": largest_contracts,
        },
        "patterns": {
            "window_days": REPEAT_WINDOW_DAYS,
            "minimum_records": REPEAT_MIN_RECORDS,
            "repeat_clusters": repeat_clusters,
            "contract_signals": merge_contract_signals(scopes),
        },
    }


def load_annual_summaries(history_dir: Path | None) -> dict[str, dict[str, Any]]:
    if history_dir is None or not history_dir.exists():
        return {}
    summaries: dict[str, dict[str, Any]] = {}
    for path in sorted(history_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        year = str(payload.get("year"))
        if payload.get("schema_version") != 1 or path.stem != year:
            raise ValueError(f"Invalid annual summary: {path}")
        if not isinstance(payload.get("all"), dict) or not isinstance(
            payload.get("organism_scopes"), dict
        ):
            raise ValueError(f"Invalid annual summary schema: {path}")
        assert_no_tax_identifiers(payload)
        summaries[year] = payload
    return summaries


def count_windows_by_year(input_dir: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    for manifest_path in input_dir.glob("*/*.manifest.json"):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        counts[str(manifest.get("date_start", ""))[:4]] += 1
    return counts


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


def retain_recent_months(
    records: list[dict[str, Any]], detail_months: int
) -> list[dict[str, Any]]:
    if detail_months < 1:
        raise ValueError("detail_months must be positive")
    if not records:
        return []
    latest = max(record["publication_date"][:7] for record in records)
    latest_year, latest_month = (int(part) for part in latest.split("-"))
    cutoff_index = latest_year * 12 + latest_month - detail_months
    return [
        record
        for record in records
        if int(record["publication_date"][:4]) * 12
        + int(record["publication_date"][5:7])
        - 1
        >= cutoff_index
    ]


def build_site_data(
    input_dir: Path,
    output_dir: Path,
    entities: list[Entity],
    *,
    max_shard_bytes: int = DEFAULT_SHARD_BYTES,
    detail_months: int = DEFAULT_DETAIL_MONTHS,
    history_dir: Path | None = None,
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
    explorer_records = retain_recent_months(public_records, detail_months)
    records_by_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    explorer_records_by_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    records_by_organism: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in public_records:
        records_by_year[record["publication_date"][:4]].append(record)
        records_by_organism[record["organism_id"]].append(record)
    for record in explorer_records:
        explorer_records_by_year[record["publication_date"][:4]].append(record)

    shard_payloads: list[tuple[Path, bytes]] = []
    years: list[dict[str, Any]] = []
    for year in sorted(explorer_records_by_year, reverse=True):
        year_records = explorer_records_by_year[year]
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
        "total_available": len(explorer_records),
        "historical_total": len(records),
        "detail_months": detail_months,
        "max_shard_bytes": max_shard_bytes,
        "years": years,
    }
    annual_summaries = load_annual_summaries(history_dir)
    summarized_years = set(annual_summaries)
    current_analysis_records = [
        record
        for record in public_records
        if record["publication_date"][:4] not in summarized_years
    ]
    current_records_by_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    current_records_by_organism: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in current_analysis_records:
        current_records_by_year[record["publication_date"][:4]].append(record)
        current_records_by_organism[record["organism_id"]].append(record)

    analysis_years = {
        year: build_analysis_scope(year_records)
        for year, year_records in sorted(current_records_by_year.items(), reverse=True)
    }
    analysis_years.update(
        {year: summary["all"] for year, summary in annual_summaries.items()}
    )
    organism_years: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    organism_metadata: dict[str, tuple[str, str]] = {}
    for organism_id, organism_records in current_records_by_organism.items():
        entity = entities_by_id[organism_id]
        organism_metadata[str(organism_id)] = (entity.name, entity.category)
        for year in {record["publication_date"][:4] for record in organism_records}:
            organism_years[str(organism_id)][year] = build_analysis_scope(
                [
                    record
                    for record in organism_records
                    if record["publication_date"].startswith(f"{year}-")
                ],
                include_composition=True,
            )
    for year, summary in annual_summaries.items():
        for organism_id, organism_summary in summary["organism_scopes"].items():
            organism_metadata[organism_id] = (
                organism_summary["name"], organism_summary["category"]
            )
            organism_years[organism_id][year] = organism_summary["scope"]

    analysis = {
        "schema_version": 1,
        "generated_at": generated_at,
        "grouping_note": "Awardees are grouped by exact published name; no tax identifier matching is used.",
        "aggregation_note": "Released years use compact annual summaries; combined percentiles and cross-year unique vendor counts are estimates.",
        "all": combine_compact_analysis_scopes(list(analysis_years.values())),
        "years": dict(sorted(analysis_years.items(), reverse=True)),
        "organism_scopes": {
            str(organism_id): {
                "organism_id": organism_id,
                "name": organism_metadata[str(organism_id)][0],
                "category": organism_metadata[str(organism_id)][1],
                "all": combine_compact_analysis_scopes(list(year_scopes.values())),
                "years": dict(sorted(year_scopes.items(), reverse=True)),
            }
            for organism_id, year_scopes in sorted(
                ((int(key), value) for key, value in organism_years.items())
            )
        },
    }

    historical_dates = [
        value
        for summary in annual_summaries.values()
        for value in (
            summary.get("earliest_publication_date"),
            summary.get("latest_publication_date"),
        )
        if value
    ]
    analysis_publication_dates = [
        record["publication_date"] for record in current_analysis_records
    ] + historical_dates
    dashboard["record_count"] = analysis["all"]["summary"]["record_count"]
    dashboard["total_amount_eur"] = analysis["all"]["summary"]["total_amount_eur"]
    canonical_window_counts = count_windows_by_year(input_dir)
    dashboard["window_count"] = sum(
        summary["window_count"] for summary in annual_summaries.values()
    ) + sum(
        count
        for year, count in canonical_window_counts.items()
        if year not in summarized_years
    )
    dashboard["earliest_publication_date"] = min(analysis_publication_dates, default=None)
    dashboard["latest_publication_date"] = max(analysis_publication_dates, default=None)
    dashboard["active_organism_count"] = len(analysis["organism_scopes"])
    dashboard["organisms"] = [
        {
            **entity.as_dict(),
            "record_count": analysis["organism_scopes"].get(
                str(entity.organism_id), {"all": {"summary": {"record_count": 0}}}
            )["all"]["summary"]["record_count"],
            "total_amount_eur": analysis["organism_scopes"].get(
                str(entity.organism_id), {"all": {"summary": {"total_amount_eur": 0.0}}}
            )["all"]["summary"]["total_amount_eur"],
        }
        for entity in entities
    ]
    explorer_manifest["historical_total"] = dashboard["record_count"]

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
