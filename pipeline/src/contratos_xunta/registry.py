from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen

TRANSPARENCY_URL = (
    "https://transparencia.xunta.gal/tema/"
    "informacion-economica-orzamentaria-e-estatistica/contratacion-publica/contratos-menores"
)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


@dataclass(frozen=True)
class Entity:
    organism_id: int
    name: str
    category: str
    profile_url: str

    def as_dict(self) -> dict[str, object]:
        return asdict(self)

    @classmethod
    def from_payload(cls, payload: Any) -> Entity:
        if not isinstance(payload, dict):
            raise ValueError("Registry entity must be an object")
        try:
            organism_id = payload["organism_id"]
            name = payload["name"]
            category = payload["category"]
            profile_url = payload["profile_url"]
        except KeyError as error:
            raise ValueError(f"Registry entity is missing {error.args[0]}") from error
        if isinstance(organism_id, bool) or not isinstance(organism_id, int) or organism_id <= 0:
            raise ValueError("Registry organism_id must be a positive integer")
        if not all(isinstance(value, str) and value.strip() for value in (name, category)):
            raise ValueError("Registry name and category must be non-empty strings")
        if not isinstance(profile_url, str) or not profile_url.startswith("https://"):
            raise ValueError("Registry profile_url must use HTTPS")
        return cls(organism_id, name.strip(), category.strip(), profile_url)


class TransparencyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entities: list[Entity] = []
        self._category = "Sen categoría"
        self._heading_tag: str | None = None
        self._heading_parts: list[str] = []
        self._profile_url: str | None = None
        self._link_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in {"h2", "h3", "h4"}:
            self._heading_tag = tag
            self._heading_parts = []
        if tag != "a":
            return
        href = attributes.get("href") or ""
        parsed = urlparse(href)
        query = parse_qs(parsed.query)
        if parsed.path.endswith("consultaOrganismo.jsp") and query.get("S") == ["CM"] and query.get("N"):
            self._profile_url = urljoin(TRANSPARENCY_URL, href).replace("http://", "https://", 1)
            self._link_parts = []

    def handle_data(self, data: str) -> None:
        if self._heading_tag:
            self._heading_parts.append(data)
        if self._profile_url:
            self._link_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == self._heading_tag:
            heading = clean_text("".join(self._heading_parts))
            if heading:
                self._category = heading
            self._heading_tag = None
            self._heading_parts = []
        if tag != "a" or not self._profile_url:
            return

        name = clean_text("".join(self._link_parts))
        query = parse_qs(urlparse(self._profile_url).query)
        try:
            organism_id = int(query["N"][0])
        except (KeyError, ValueError) as error:
            raise ValueError(f"Invalid organism profile URL: {self._profile_url}") from error
        if name:
            self.entities.append(
                Entity(
                    organism_id=organism_id,
                    name=name,
                    category=self._category,
                    profile_url=self._profile_url,
                )
            )
        self._profile_url = None
        self._link_parts = []


def parse_entities(html: str) -> list[Entity]:
    parser = TransparencyParser()
    parser.feed(html)
    entities_by_id: dict[int, Entity] = {}
    for entity in parser.entities:
        existing = entities_by_id.get(entity.organism_id)
        if existing and existing != entity:
            raise ValueError(f"Conflicting entries for organism {entity.organism_id}")
        entities_by_id[entity.organism_id] = entity
    if not entities_by_id:
        raise ValueError("No minor-contract organism links found on Transparency page")
    return sorted(entities_by_id.values(), key=lambda entity: (entity.category, entity.name))


def fetch_html(url: str = TRANSPARENCY_URL) -> str:
    request = Request(
        url,
        headers={"User-Agent": "ContratosXunta/0.1 (+https://github.com/amoedo/ContatosXunta)"},
    )
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def discover_entities() -> list[Entity]:
    return parse_entities(fetch_html())


def write_registry(path: Path, entities: list[Entity]) -> None:
    payload: dict[str, Any] = {
        "source_url": TRANSPARENCY_URL,
        "entities": [entity.as_dict() for entity in entities],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_registry(path: Path) -> list[Entity]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read registry {path}: {error}") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("entities"), list):
        raise ValueError("Registry must contain an entities array")

    entities = [Entity.from_payload(item) for item in payload["entities"]]
    organism_ids = [entity.organism_id for entity in entities]
    if len(organism_ids) != len(set(organism_ids)):
        raise ValueError("Registry contains duplicate organism IDs")
    if not entities:
        raise ValueError("Registry contains no entities")
    return entities
