from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from collections.abc import Callable

from .artifacts import window_is_complete, write_window_artifacts
from .crawler import CountMismatchError, PageFetcher, collect_window
from .normalize import canonicalize_row
from .registry import Entity
from .source import fetch_page


@dataclass(frozen=True)
class BackfillResult:
    fetched_windows: int
    skipped_windows: int
    record_count: int


@dataclass(frozen=True)
class RegistryBackfillResult:
    organisms: int
    fetched_windows: int
    skipped_windows: int
    record_count: int


def monthly_windows(start_date: date, end_date: date) -> tuple[tuple[date, date], ...]:
    if start_date > end_date:
        raise ValueError("start_date cannot be after end_date")

    windows: list[tuple[date, date]] = []
    window_start = start_date
    while window_start <= end_date:
        if window_start.month == 12:
            next_month = date(window_start.year + 1, 1, 1)
        else:
            next_month = date(window_start.year, window_start.month + 1, 1)
        window_end = min(next_month - timedelta(days=1), end_date)
        windows.append((window_start, window_end))
        window_start = next_month
    return tuple(windows)


def rolling_history_windows(
    reference_date: date, months: int
) -> tuple[tuple[date, date] | None, tuple[date, date]]:
    if months < 1:
        raise ValueError("months must be positive")

    current_start = reference_date.replace(day=1)
    current_end = monthly_windows(current_start, date(reference_date.year + (reference_date.month == 12), reference_date.month % 12 + 1, 1) - timedelta(days=1))[0][1]
    start_month_index = reference_date.year * 12 + reference_date.month - months
    history_start = date(start_month_index // 12, start_month_index % 12 + 1, 1)
    refresh_start = current_start
    if months > 1:
        previous_month_index = reference_date.year * 12 + reference_date.month - 2
        refresh_start = date(
            previous_month_index // 12,
            previous_month_index % 12 + 1,
            1,
        )
    complete_history = None
    if history_start < refresh_start:
        complete_history = (history_start, refresh_start - timedelta(days=1))
    return complete_history, (refresh_start, current_end)


def collect_consistent_window(
    organism_id: int,
    start_date: date,
    end_date: date,
    *,
    page_fetcher: PageFetcher = fetch_page,
    max_attempts: int = 3,
) -> list:
    if max_attempts < 1:
        raise ValueError("max_attempts must be positive")
    for attempt in range(max_attempts):
        try:
            return collect_window(
                organism_id,
                start_date,
                end_date,
                page_fetcher=page_fetcher,
            )
        except CountMismatchError:
            if attempt + 1 == max_attempts:
                raise
    raise RuntimeError("consistency retry loop exited unexpectedly")


def backfill_range(
    organism_id: int,
    start_date: date,
    end_date: date,
    output_dir: Path,
    *,
    page_fetcher: PageFetcher = fetch_page,
    overwrite: bool = False,
) -> BackfillResult:
    fetched_windows = 0
    skipped_windows = 0
    record_count = 0

    for window_start, window_end in monthly_windows(start_date, end_date):
        if not overwrite and window_is_complete(
            output_dir, organism_id, window_start, window_end
        ):
            skipped_windows += 1
            continue

        rows = collect_consistent_window(
            organism_id,
            window_start,
            window_end,
            page_fetcher=page_fetcher,
        )
        records = [canonicalize_row(row, organism_id) for row in rows]
        write_window_artifacts(
            output_dir,
            organism_id,
            window_start,
            window_end,
            records,
        )
        fetched_windows += 1
        record_count += len(records)

    return BackfillResult(
        fetched_windows=fetched_windows,
        skipped_windows=skipped_windows,
        record_count=record_count,
    )


def backfill_registry(
    entities: list[Entity],
    start_date: date,
    end_date: date,
    output_dir: Path,
    *,
    page_fetcher: PageFetcher = fetch_page,
    overwrite: bool = False,
    report: Callable[[Entity, BackfillResult], None] | None = None,
) -> RegistryBackfillResult:
    fetched_windows = 0
    skipped_windows = 0
    record_count = 0

    for entity in entities:
        result = backfill_range(
            entity.organism_id,
            start_date,
            end_date,
            output_dir,
            page_fetcher=page_fetcher,
            overwrite=overwrite,
        )
        fetched_windows += result.fetched_windows
        skipped_windows += result.skipped_windows
        record_count += result.record_count
        if report is not None:
            report(entity, result)

    return RegistryBackfillResult(
        organisms=len(entities),
        fetched_windows=fetched_windows,
        skipped_windows=skipped_windows,
        record_count=record_count,
    )
