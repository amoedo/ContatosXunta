from __future__ import annotations

import json
import hashlib
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse

import pytest

from contratos_xunta.artifacts import window_is_complete, write_window_artifacts
from contratos_xunta.backfill import (
    backfill_range,
    backfill_registry,
    collect_consistent_window,
    monthly_windows,
    rolling_history_windows,
)
from contratos_xunta.crawler import CountMismatchError, collect_window
from contratos_xunta.models import SourcePage, SourceRow, SourceSchemaError
from contratos_xunta.normalize import canonicalize_row
from contratos_xunta.privacy import assert_no_tax_identifiers
from contratos_xunta.registry import Entity, load_registry, parse_entities
from contratos_xunta.site_data import build_site_data, partition_explorer_records
from contratos_xunta.source import RetryPolicy, build_url, fetch_with_retry

FIXTURES = Path(__file__).parent / "fixtures" / "source"


def load_page(name: str) -> SourcePage:
    return SourcePage.from_payload(json.loads((FIXTURES / name).read_text(encoding="utf-8")))


def test_build_url_uses_complete_datatables_contract() -> None:
    url = build_url(291, 100, date(2026, 1, 1), date(2026, 1, 31), draw=2)
    query = parse_qs(urlparse(url).query, keep_blank_values=True)

    assert query["draw"] == ["2"]
    assert query["start"] == ["100"]
    assert query["length"] == ["100"]
    assert query["datestart"] == ["2026-01-01"]
    assert query["dateend"] == ["2026-01-31"]
    assert query["order[0][column]"] == ["0"]
    assert query["order[0][dir]"] == ["asc"]
    assert query["order[1][column]"] == ["1"]
    assert query["order[1][dir]"] == ["asc"]
    assert query["columns[6][data]"] == ["duracion"]
    assert query["columns[6][orderable]"] == ["false"]
    assert "total" not in query
    assert "_" not in query


def test_collect_window_reconciles_pages() -> None:
    pages = [load_page("page-0.json"), load_page("page-2.json"), load_page("page-0.json")]
    calls: list[tuple[int, int]] = []

    def fake_fetcher(*args: object, start: int, draw: int, **kwargs: object) -> SourcePage:
        calls.append((start, draw))
        return pages.pop(0)

    rows = collect_window(291, date(2026, 1, 1), date(2026, 1, 31), page_fetcher=fake_fetcher)

    assert [row.id for row in rows] == [1920375, 1920376, 1920693]
    assert calls == [(0, 1), (2, 2), (0, 3)]


def test_collect_window_rejects_count_changes() -> None:
    first = load_page("page-0.json")
    changed = SourcePage(draw=2, records_total=461, records_filtered=4, data=())
    pages = [first, changed]

    with pytest.raises(CountMismatchError, match="changed"):
        collect_window(
            291,
            date(2026, 1, 1),
            date(2026, 1, 31),
            page_fetcher=lambda *args, **kwargs: pages.pop(0),
        )


def test_consistency_retry_discards_an_unstable_first_pass() -> None:
    first = load_page("page-0.json")
    final = load_page("page-2.json")
    repeated = SourcePage(
        draw=2,
        records_total=first.records_total,
        records_filtered=first.records_filtered,
        data=(first.data[0],),
    )
    pages = [first, repeated, first, final, first]

    rows = collect_consistent_window(
        291,
        date(2026, 1, 1),
        date(2026, 1, 31),
        page_fetcher=lambda *args, **kwargs: pages.pop(0),
    )

    assert [row.id for row in rows] == [1920375, 1920376, 1920693]
    assert pages == []


def test_schema_rejects_invalid_publication_date() -> None:
    payload = json.loads((FIXTURES / "page-0.json").read_text(encoding="utf-8"))
    payload["data"][0]["publicado"] = "2026-01-26"

    with pytest.raises(SourceSchemaError, match="DD-MM-YYYY"):
        SourcePage.from_payload(payload)


def test_canonical_record_excludes_tax_identifier() -> None:
    source = load_page("page-0.json").data[0]
    record = canonicalize_row(source, 291).as_dict()

    assert record["record_id"] == "291:1920375"
    assert record["publication_date"] == "2026-01-26"
    assert record["vendor_name"] == "PAPELERIA LEDOIRA, S.L."
    assert "nif" not in record


def test_canonical_record_redacts_identifiers_from_public_text() -> None:
    row = SourceRow(
        id=1,
        publicado="27-08-2026",
        objeto="Factura B27141159",
        importe=10.0,
        nif="B27141159",
        adjudicatario="B27141159",
        duracion="Ref. 12345678Z",
    )

    record = canonicalize_row(row, 513).as_dict()

    assert record["subject"] == "Factura [identificador fiscal omitido]"
    assert record["vendor_name"] == "[identificador fiscal omitido]"
    assert record["duration"] == "Ref. [identificador fiscal omitido]"
    assert_no_tax_identifiers(record)


def test_build_url_rejects_unsafe_page_size() -> None:
    with pytest.raises(ValueError, match="between 1 and 100"):
        build_url(291, 0, date(2026, 1, 1), date(2026, 1, 31), length=500)


def test_parse_curated_transparency_entities() -> None:
    html = (FIXTURES / "transparency.html").read_text(encoding="utf-8")

    entities = parse_entities(html)

    assert {entity.organism_id for entity in entities} == {11, 48, 291}
    presidencia = next(entity for entity in entities if entity.organism_id == 291)
    assert presidencia.category == "Consellerías"
    assert presidencia.profile_url.startswith("https://")


def test_write_window_artifacts_are_sanitized_and_checksummed(tmp_path: Path) -> None:
    records = [canonicalize_row(row, 291) for row in load_page("page-0.json").data]
    assert records[0].source_url == "https://www.contratosdegalicia.gal/licitacion?N=1920375"

    records_path, manifest_path = write_window_artifacts(
        tmp_path,
        291,
        date(2026, 1, 1),
        date(2026, 1, 31),
        records,
    )

    records_text = records_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert "nif" not in records_text.lower()
    assert "REDACTED" not in records_text
    assert manifest["record_count"] == 2
    assert manifest["complete"] is True
    assert len(manifest["records_sha256"]) == 64
    assert window_is_complete(tmp_path, 291, date(2026, 1, 1), date(2026, 1, 31))

    records_path.write_text("[]\n", encoding="utf-8")
    assert not window_is_complete(tmp_path, 291, date(2026, 1, 1), date(2026, 1, 31))


def test_monthly_windows_keep_inclusive_partial_boundaries() -> None:
    assert monthly_windows(date(2025, 12, 20), date(2026, 2, 3)) == (
        (date(2025, 12, 20), date(2025, 12, 31)),
        (date(2026, 1, 1), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 3)),
    )


def test_rolling_history_uses_complete_stable_calendar_months() -> None:
    assert rolling_history_windows(date(2026, 8, 27), 24) == (
        (date(2024, 9, 1), date(2026, 6, 30)),
        (date(2026, 7, 1), date(2026, 8, 31)),
    )
    assert rolling_history_windows(date(2026, 1, 5), 1) == (
        None,
        (date(2026, 1, 1), date(2026, 1, 31)),
    )
    with pytest.raises(ValueError, match="positive"):
        rolling_history_windows(date(2026, 8, 27), 0)


def test_backfill_range_resumes_from_complete_manifests(tmp_path: Path) -> None:
    source = load_page("page-0.json")
    page = SourcePage(
        draw=1,
        records_total=source.records_total,
        records_filtered=len(source.data),
        data=source.data,
    )
    calls: list[tuple[date, date]] = []

    def fake_fetcher(
        organism_id: int,
        start_date: date,
        end_date: date,
        **kwargs: object,
    ) -> SourcePage:
        calls.append((start_date, end_date))
        return page

    first = backfill_range(
        291,
        date(2026, 1, 15),
        date(2026, 2, 2),
        tmp_path,
        page_fetcher=fake_fetcher,
    )
    resumed = backfill_range(
        291,
        date(2026, 1, 15),
        date(2026, 2, 2),
        tmp_path,
        page_fetcher=lambda *args, **kwargs: pytest.fail("complete windows must be skipped"),
    )

    assert first.fetched_windows == 2
    assert first.record_count == 4
    assert resumed.skipped_windows == 2
    assert calls == [
        (date(2026, 1, 15), date(2026, 1, 31)),
        (date(2026, 1, 15), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 2)),
        (date(2026, 2, 1), date(2026, 2, 2)),
    ]


def test_fetch_with_retry_uses_bounded_exponential_backoff() -> None:
    attempts = 0
    delays: list[float] = []

    def requester(url: str) -> dict[str, bool]:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise URLError("temporary failure")
        return {"ok": True}

    result = fetch_with_retry(
        "https://example.test/api",
        requester=requester,
        policy=RetryPolicy(max_attempts=3, initial_delay_seconds=0.5),
        sleeper=delays.append,
    )

    assert result == {"ok": True}
    assert attempts == 3
    assert delays == [0.5, 1.0]


def test_fetch_with_retry_does_not_retry_permanent_http_errors() -> None:
    attempts = 0

    def requester(url: str) -> object:
        nonlocal attempts
        attempts += 1
        raise HTTPError(url, 404, "Not Found", {}, None)

    with pytest.raises(HTTPError):
        fetch_with_retry(
            "https://example.test/missing",
            requester=requester,
            sleeper=lambda delay: pytest.fail("permanent failures must not sleep"),
        )

    assert attempts == 1


def test_load_registry_and_backfill_all_resume(tmp_path: Path) -> None:
    registry_path = tmp_path / "entities.json"
    registry_path.write_text(
        json.dumps(
            {
                "entities": [
                    {
                        "organism_id": 11,
                        "name": "Primeiro",
                        "category": "Proba",
                        "profile_url": "https://example.test/11",
                    },
                    {
                        "organism_id": 48,
                        "name": "Segundo",
                        "category": "Proba",
                        "profile_url": "https://example.test/48",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    entities = load_registry(registry_path)
    empty_page = SourcePage(draw=1, records_total=0, records_filtered=0, data=())
    reports: list[tuple[Entity, int]] = []

    first = backfill_registry(
        entities,
        date(2026, 1, 1),
        date(2026, 1, 31),
        tmp_path / "windows",
        page_fetcher=lambda *args, **kwargs: empty_page,
        report=lambda entity, result: reports.append((entity, result.fetched_windows)),
    )
    resumed = backfill_registry(
        entities,
        date(2026, 1, 1),
        date(2026, 1, 31),
        tmp_path / "windows",
        page_fetcher=lambda *args, **kwargs: pytest.fail("completed registry must resume"),
    )

    assert [entity.organism_id for entity in entities] == [11, 48]
    assert first.organisms == 2
    assert first.fetched_windows == 2
    assert resumed.skipped_windows == 2
    assert [(entity.organism_id, count) for entity, count in reports] == [(11, 1), (48, 1)]


def test_build_site_data_emits_sanitized_aggregates(tmp_path: Path) -> None:
    windows = tmp_path / "windows"
    records = [canonicalize_row(row, 291) for row in load_page("page-0.json").data]
    write_window_artifacts(
        windows,
        291,
        date(2026, 1, 1),
        date(2026, 1, 31),
        records,
    )
    entity = Entity(291, "Presidencia", "Consellerías", "https://example.test/291")

    site_dir = tmp_path / "site"
    (site_dir / "contracts.json").parent.mkdir(parents=True)
    (site_dir / "contracts.json").write_text("legacy", encoding="utf-8")
    dashboard_path, manifest_path = build_site_data(
        windows, site_dir, [entity], max_shard_bytes=1_000
    )

    dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
    analysis_text = (site_dir / "analysis.json").read_text(encoding="utf-8")
    analysis = json.loads(analysis_text)
    manifest_text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_text)
    shards = manifest["years"][0]["shards"]
    assert dashboard["record_count"] == 2
    assert dashboard["active_organism_count"] == 1
    assert dashboard["organisms"][0]["record_count"] == 2
    assert manifest["total_available"] == 2
    assert manifest["years"][0]["record_count"] == 2
    assert manifest["years"][0]["months"][0]["month"] == "2026-01"
    assert manifest["years"][0]["months"][0]["record_count"] == 2
    assert shards
    scope = analysis["all"]
    expected_amount = round(sum(record.amount_eur for record in records), 2)
    assert scope["summary"]["record_count"] == len(records)
    assert scope["summary"]["total_amount_eur"] == expected_amount
    assert sum(point["record_count"] for point in scope["timeseries"]["monthly"]) == len(records)
    assert sum(item["record_count"] for item in scope["amounts"]["bands"]) == len(records)
    assert sum(item["record_count"] for item in scope["vendors"]["ranking_by_count"]) == len(records)
    assert analysis["years"]["2026"]["summary"] == scope["summary"]
    organism_scope = analysis["organism_scopes"]["291"]
    assert organism_scope["name"] == "Presidencia"
    assert organism_scope["all"]["summary"] == scope["summary"]
    assert organism_scope["years"]["2026"]["summary"] == scope["summary"]
    composition = organism_scope["all"]["composition"]
    assert len(composition["amount_values_eur"]) == len(records)
    assert sum(item["record_count"] for item in composition["vendors"]) == len(records)
    percentiles = scope["amounts"]["percentiles"]
    assert list(percentiles.values()) == sorted(percentiles.values())
    largest_amounts = [item["amount_eur"] for item in scope["amounts"]["largest_contracts"]]
    assert largest_amounts == sorted(largest_amounts, reverse=True)
    assert "nif" not in analysis_text.lower()
    assert not (site_dir / "contracts.json").exists()
    assert "nif" not in manifest_text.lower()
    for shard in shards:
        content = (site_dir / shard["path"]).read_bytes()
        assert len(content) == shard["byte_size"]
        assert len(content) <= manifest["max_shard_bytes"]
        assert hashlib.sha256(content).hexdigest() == shard["sha256"]
        payload = json.loads(content)
        assert all("/licitacion?N=" in item["source_url"] for item in payload["records"])


def test_explorer_partitioning_is_complete_bounded_and_maximal() -> None:
    records = [
        {"record_id": str(index), "subject": "x" * (20 + index)}
        for index in range(30)
    ]
    shards = partition_explorer_records(2026, records, 1_000)

    assert [record for shard, _ in shards for record in shard] == records
    assert all(len(content) <= 1_000 for _, content in shards)
    for index, (shard, _) in enumerate(shards[:-1]):
        next_record = shards[index + 1][0][0]
        combined = json.dumps(
            {"schema_version": 1, "year": 2026, "records": [*shard, next_record]},
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ).encode("utf-8") + b"\n"
        assert len(combined) > 1_000


@pytest.mark.parametrize("identifier", ["B15855703", "12345678Z", "X1234567L"])
def test_public_payload_rejects_tax_identifiers(identifier: str) -> None:
    with pytest.raises(ValueError, match="tax identifiers"):
        assert_no_tax_identifiers({"vendor_name": identifier})