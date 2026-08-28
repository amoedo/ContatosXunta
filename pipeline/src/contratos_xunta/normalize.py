from __future__ import annotations

from datetime import datetime

from .models import CanonicalRecord, SourceRow
from .privacy import redact_tax_identifiers
from .source import contract_detail_url


def canonicalize_row(row: SourceRow, organism_id: int) -> CanonicalRecord:
    publication_date = datetime.strptime(row.publicado, "%d-%m-%Y").date().isoformat()
    return CanonicalRecord(
        record_id=f"{organism_id}:{row.id}",
        source_id=row.id,
        organism_id=organism_id,
        publication_date=publication_date,
        subject=redact_tax_identifiers(row.objeto),
        amount_eur=row.importe,
        vendor_name=redact_tax_identifiers(row.adjudicatario),
        duration=redact_tax_identifiers(row.duracion),
        source_url=contract_detail_url(row.id),
    )
