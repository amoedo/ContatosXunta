from __future__ import annotations

import json
import re
from typing import Any

TAX_IDENTIFIER = re.compile(
    r"(?<![A-Z0-9])(?:[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]|[XYZ][0-9]{7}[A-Z]|[0-9]{8}[A-Z])(?![A-Z0-9])",
    re.IGNORECASE,
)
TAX_IDENTIFIER_REDACTION = "[identificador fiscal omitido]"


def redact_tax_identifiers(value: str) -> str:
    return TAX_IDENTIFIER.sub(TAX_IDENTIFIER_REDACTION, value)


def find_tax_identifiers(payload: Any) -> tuple[str, ...]:
    serialized = json.dumps(payload, ensure_ascii=False)
    return tuple(sorted(set(match.upper() for match in TAX_IDENTIFIER.findall(serialized))))


def assert_no_tax_identifiers(payload: Any) -> None:
    matches = find_tax_identifiers(payload)
    if matches:
        raise ValueError(f"Public payload contains likely tax identifiers: {', '.join(matches)}")
