from __future__ import annotations

from collections.abc import Callable
from datetime import date

from .models import SourcePage, SourceRow
from .source import PAGE_SIZE, fetch_page

PageFetcher = Callable[..., SourcePage]


class CountMismatchError(RuntimeError):
    """Raised when paginated rows do not reconcile with the API count."""


def collect_window(
    organism_id: int,
    start_date: date,
    end_date: date,
    *,
    page_fetcher: PageFetcher = fetch_page,
) -> list[SourceRow]:
    rows: list[SourceRow] = []
    seen_ids: set[int] = set()
    expected_count: int | None = None
    first_page_ids: tuple[int, ...] | None = None
    start = 0
    draw = 1

    while expected_count is None or len(rows) < expected_count:
        page = page_fetcher(
            organism_id,
            start_date,
            end_date,
            start=start,
            draw=draw,
            length=PAGE_SIZE,
        )
        if expected_count is None:
            expected_count = page.records_filtered
            first_page_ids = tuple(row.id for row in page.data)
        elif page.records_filtered != expected_count:
            raise CountMismatchError(
                f"recordsFiltered changed from {expected_count} to {page.records_filtered}"
            )
        if not page.data and len(rows) < expected_count:
            raise CountMismatchError("API returned an empty page before all rows were collected")

        for row in page.data:
            if row.id in seen_ids:
                raise CountMismatchError(f"Duplicate source id {row.id} across API pages")
            seen_ids.add(row.id)
            rows.append(row)

        start += len(page.data)
        draw += 1

    if len(rows) != expected_count:
        raise CountMismatchError(f"Collected {len(rows)} rows, expected {expected_count}")

    verification = page_fetcher(
        organism_id,
        start_date,
        end_date,
        start=0,
        draw=draw,
        length=PAGE_SIZE,
    )
    if verification.records_filtered != expected_count:
        raise CountMismatchError(
            f"recordsFiltered changed from {expected_count} to {verification.records_filtered} during verification"
        )
    if tuple(row.id for row in verification.data) != first_page_ids:
        raise CountMismatchError("First API page changed while the window was being collected")
    return rows
