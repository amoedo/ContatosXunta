from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


class SourceSchemaError(ValueError):
    """Raised when the source API no longer matches its validated contract."""


@dataclass(frozen=True)
class SourceRow:
    id: int
    publicado: str
    objeto: str
    importe: float
    nif: str
    adjudicatario: str
    duracion: str

    @classmethod
    def from_payload(cls, payload: Any) -> SourceRow:
        if not isinstance(payload, dict):
            raise SourceSchemaError("API row must be an object")

        required = {"id", "publicado", "objeto", "importe", "nif", "adjudicatario", "duracion"}
        missing = required - payload.keys()
        if missing:
            raise SourceSchemaError(f"API row is missing fields: {', '.join(sorted(missing))}")
        if isinstance(payload["id"], bool) or not isinstance(payload["id"], int):
            raise SourceSchemaError("API row id must be an integer")
        if isinstance(payload["importe"], bool) or not isinstance(payload["importe"], (int, float)):
            raise SourceSchemaError("API row importe must be numeric")
        for field in ("publicado", "objeto", "nif", "adjudicatario", "duracion"):
            if not isinstance(payload[field], str):
                raise SourceSchemaError(f"API row {field} must be a string")

        try:
            datetime.strptime(payload["publicado"], "%d-%m-%Y")
        except ValueError as error:
            raise SourceSchemaError("API row publicado must use DD-MM-YYYY") from error

        return cls(
            id=payload["id"],
            publicado=payload["publicado"].strip(),
            objeto=payload["objeto"].strip(),
            importe=float(payload["importe"]),
            nif=payload["nif"].strip(),
            adjudicatario=payload["adjudicatario"].strip(),
            duracion=payload["duracion"].strip(),
        )


@dataclass(frozen=True)
class SourcePage:
    draw: int
    records_total: int
    records_filtered: int
    data: tuple[SourceRow, ...]

    @classmethod
    def from_payload(cls, payload: Any) -> SourcePage:
        if not isinstance(payload, dict):
            raise SourceSchemaError("API response must be an object")

        required = {"draw", "recordsTotal", "recordsFiltered", "data"}
        missing = required - payload.keys()
        if missing:
            raise SourceSchemaError(f"API response is missing fields: {', '.join(sorted(missing))}")
        for field in ("draw", "recordsTotal", "recordsFiltered"):
            if isinstance(payload[field], bool) or not isinstance(payload[field], int):
                raise SourceSchemaError(f"API response {field} must be an integer")
            if payload[field] < 0:
                raise SourceSchemaError(f"API response {field} cannot be negative")
        if not isinstance(payload["data"], list):
            raise SourceSchemaError("API response data must be an array")
        if len(payload["data"]) > payload["recordsFiltered"]:
            raise SourceSchemaError("API page contains more rows than recordsFiltered")

        return cls(
            draw=payload["draw"],
            records_total=payload["recordsTotal"],
            records_filtered=payload["recordsFiltered"],
            data=tuple(SourceRow.from_payload(row) for row in payload["data"]),
        )


@dataclass(frozen=True)
class CanonicalRecord:
    record_id: str
    source_id: int
    organism_id: int
    publication_date: str
    subject: str
    amount_eur: float
    vendor_name: str
    duration: str
    source_url: str

    def as_dict(self) -> dict[str, object]:
        return {
            "record_id": self.record_id,
            "source_id": self.source_id,
            "organism_id": self.organism_id,
            "publication_date": self.publication_date,
            "subject": self.subject,
            "amount_eur": self.amount_eur,
            "vendor_name": self.vendor_name,
            "duration": self.duration,
            "source_url": self.source_url,
        }
