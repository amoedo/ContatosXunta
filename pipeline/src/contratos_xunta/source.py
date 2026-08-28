from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .models import SourcePage

BASE_URL = "https://www.contratosdegalicia.gal/api/v1/organismos/{organism_id}/contratosmenores/table"
DETAIL_URL = "https://www.contratosdegalicia.gal/licitacion?N={source_id}"
PAGE_SIZE = 100


def contract_detail_url(source_id: int) -> str:
    return DETAIL_URL.format(source_id=source_id)
COLUMNS = (
    ("id", True),
    ("publicado", True),
    ("objeto", True),
    ("importe", True),
    ("nif", True),
    ("adjudicatario", True),
    ("duracion", False),
)

JsonFetcher = Callable[[str], Any]


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 4
    initial_delay_seconds: float = 1.0
    backoff_factor: float = 2.0

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        if self.initial_delay_seconds < 0:
            raise ValueError("initial_delay_seconds cannot be negative")
        if self.backoff_factor < 1:
            raise ValueError("backoff_factor must be at least 1")


class RequestPacer:
    def __init__(self, minimum_interval_seconds: float = 0.25) -> None:
        self.minimum_interval_seconds = minimum_interval_seconds
        self._lock = threading.Lock()
        self._last_request_at: float | None = None

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            if self._last_request_at is not None:
                remaining = self.minimum_interval_seconds - (now - self._last_request_at)
                if remaining > 0:
                    time.sleep(remaining)
            self._last_request_at = time.monotonic()


REQUEST_PACER = RequestPacer()


def build_query(start: int, start_date: date, end_date: date, *, draw: int = 1, length: int = PAGE_SIZE) -> str:
    if start < 0:
        raise ValueError("start cannot be negative")
    if length < 1 or length > PAGE_SIZE:
        raise ValueError(f"length must be between 1 and {PAGE_SIZE}")
    if start_date > end_date:
        raise ValueError("start_date cannot be after end_date")

    params: list[tuple[str, str | int]] = [("draw", draw)]
    for index, (name, orderable) in enumerate(COLUMNS):
        prefix = f"columns[{index}]"
        params.extend(
            (
                (f"{prefix}[data]", name),
                (f"{prefix}[name]", name),
                (f"{prefix}[searchable]", "true"),
                (f"{prefix}[orderable]", str(orderable).lower()),
                (f"{prefix}[search][value]", ""),
                (f"{prefix}[search][regex]", "false"),
            )
        )
    params.extend(
        (
            ("order[0][column]", 0),
            ("order[0][dir]", "asc"),
            ("order[1][column]", 1),
            ("order[1][dir]", "asc"),
            ("start", start),
            ("length", length),
            ("search[value]", ""),
            ("search[regex]", "false"),
            ("datestart", start_date.isoformat()),
            ("dateend", end_date.isoformat()),
        )
    )
    return urlencode(params)


def build_url(organism_id: int, start: int, start_date: date, end_date: date, *, draw: int = 1, length: int = PAGE_SIZE) -> str:
    if organism_id <= 0:
        raise ValueError("organism_id must be positive")
    return f"{BASE_URL.format(organism_id=organism_id)}?{build_query(start, start_date, end_date, draw=draw, length=length)}"


def fetch_json_once(url: str) -> Any:
    REQUEST_PACER.wait()
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ContratosXunta/0.1 (+https://github.com/amoedo/ContatosXunta)",
        },
    )
    with urlopen(request, timeout=60) as response:
        content_type = response.headers.get_content_type()
        if content_type != "application/json":
            raise ValueError(f"Expected application/json, received {content_type}")
        return json.loads(response.read().decode("utf-8"))


def is_retryable(error: Exception) -> bool:
    if isinstance(error, HTTPError):
        return error.code in {408, 425, 429} or 500 <= error.code < 600
    return isinstance(error, (URLError, TimeoutError))


def fetch_with_retry(
    url: str,
    *,
    requester: JsonFetcher = fetch_json_once,
    policy: RetryPolicy = RetryPolicy(),
    sleeper: Callable[[float], None] = time.sleep,
) -> Any:
    for attempt in range(policy.max_attempts):
        try:
            return requester(url)
        except Exception as error:
            if not is_retryable(error) or attempt + 1 == policy.max_attempts:
                raise
            delay = policy.initial_delay_seconds * policy.backoff_factor**attempt
            sleeper(delay)
    raise RuntimeError("retry loop exited unexpectedly")


def fetch_json(url: str) -> Any:
    return fetch_with_retry(url)


def fetch_page(
    organism_id: int,
    start_date: date,
    end_date: date,
    *,
    start: int = 0,
    draw: int = 1,
    length: int = PAGE_SIZE,
    fetcher: JsonFetcher = fetch_json,
) -> SourcePage:
    url = build_url(organism_id, start, start_date, end_date, draw=draw, length=length)
    page = SourcePage.from_payload(fetcher(url))
    if page.draw != draw:
        raise ValueError(f"API returned draw {page.draw}, expected {draw}")
    return page
