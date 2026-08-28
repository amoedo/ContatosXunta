from __future__ import annotations

import base64
import calendar
import gzip
import hashlib
import json
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .artifacts import encode_json, window_is_complete, write_atomic
from .privacy import assert_no_tax_identifiers
from .registry import Entity
from .site_data import build_analysis_scope, load_complete_records


HTML_TEMPLATE = r"""<!doctype html>
<html lang="gl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Contratos Xunta __YEAR__</title>
  <style>
    :root{--ink:#17231f;--paper:#f4f1e9;--panel:#fffdf8;--green:#174d3f;--blue:#176b87;--coral:#c9563f;--line:#cfd4cc;--muted:#64716b}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font-family:Bahnschrift,"Aptos Narrow",sans-serif;letter-spacing:0}
    body:before{content:"";position:fixed;inset:0;z-index:-1;opacity:.35;background:repeating-linear-gradient(90deg,transparent 0 39px,#dfe3dc 40px)}
    header{background:var(--green);color:white;padding:28px max(20px,calc((100% - 1220px)/2));display:flex;align-items:end;justify-content:space-between;gap:24px}
    .eyebrow{margin:0 0 5px;text-transform:uppercase;font-size:.75rem;font-weight:700}.title{margin:0;font:700 clamp(2rem,5vw,4.8rem)/.95 Cambria,Georgia,serif}.header-note{max-width:360px;margin:0;color:#d6e4df;line-height:1.45}
    main{width:min(1220px,calc(100% - 40px));margin:0 auto 60px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-top:0;background:var(--panel)}
    .metric{padding:20px;border-right:1px solid var(--line)}.metric:last-child{border:0}.metric span{display:block;color:var(--muted);font-size:.78rem;text-transform:uppercase}.metric strong{font:700 1.7rem Cambria,Georgia,serif}
    .toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 210px 270px auto;gap:12px;align-items:end;padding:24px 0 18px}.field>span,.organisms>summary span{display:block;margin-bottom:6px;color:var(--muted);font-size:.78rem;text-transform:uppercase;font-weight:700}
    input,select,button,summary{font:inherit}input,select,.organisms>summary{width:100%;height:43px;border:1px solid #aeb7b0;background:var(--panel);padding:0 12px;border-radius:4px;color:var(--ink)}
    button{height:43px;border:0;border-radius:4px;padding:0 17px;background:var(--blue);color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}
    .organisms{position:relative}.organisms>summary{position:relative;list-style:none;display:flex;align-items:center;cursor:pointer}.organisms>summary span{position:absolute;left:0;top:-24px;margin:0}.organisms>summary b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.organisms>summary::-webkit-details-marker{display:none}.organism-menu{position:absolute;z-index:5;top:49px;width:min(430px,90vw);max-height:330px;overflow:auto;background:var(--panel);border:1px solid var(--line);box-shadow:0 12px 30px #17231f2b;padding:9px}
    .organism-menu button{width:100%;height:34px;margin-bottom:5px;background:transparent;color:var(--blue);text-align:left}.organism-menu label{display:flex;gap:9px;align-items:start;padding:8px;border-top:1px solid #e7e9e4}.organism-menu input{width:16px;height:16px;margin:2px 0 0}
    .status{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:0 0 10px;color:var(--muted)}.status strong{color:var(--ink)}
    .table-wrap{overflow:auto;border:1px solid var(--line);background:var(--panel)}table{width:100%;border-collapse:collapse;min-width:900px}th{position:sticky;top:0;background:#e8eee9;text-align:left;text-transform:uppercase;font-size:.72rem;color:#53625b}th,td{padding:12px 14px;border-bottom:1px solid #e0e4de;vertical-align:top}td:nth-child(1){width:34%}td:nth-child(5),th:nth-child(5){text-align:right;white-space:nowrap}td small{display:block;color:var(--muted);margin-top:4px}td a{color:var(--blue);font-weight:700;text-decoration:none}.source{white-space:nowrap}.source:hover{text-decoration:underline}
    .pagination{display:flex;justify-content:center;align-items:center;gap:14px;padding:18px}.pagination button{width:42px;padding:0}.empty{padding:55px 20px;text-align:center;color:var(--muted)}footer{border-top:1px solid var(--line);padding:22px max(20px,calc((100% - 1220px)/2));color:var(--muted);font-size:.85rem}
    @media(max-width:800px){header{display:block}.header-note{margin-top:14px}.metrics{grid-template-columns:1fr}.metric{border-right:0;border-bottom:1px solid var(--line)}.toolbar{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}.toolbar>button{grid-column:1/-1}main{width:min(100% - 24px,1220px)}}
  </style>
</head>
<body>
  <header><div><p class="eyebrow">Arquivo anual descargable</p><h1 class="title">Contratos Xunta __YEAR__</h1></div><p class="header-note">Explorador local dos contratos menores publicados. Os datos están dentro deste ficheiro e non precisan conexión, agás para abrir a fonte oficial.</p></header>
  <main>
    <section class="metrics" aria-label="Resumo"><div class="metric"><span>Contratos</span><strong id="record-count">...</strong></div><div class="metric"><span>Importe publicado</span><strong id="total-amount">...</strong></div><div class="metric"><span>Organismos activos</span><strong id="organism-count">...</strong></div></section>
    <section class="toolbar" aria-label="Filtros">
      <label class="field search"><span>Buscar</span><input id="search" type="search" placeholder="Obxecto, adxudicatario ou organismo"></label>
      <label class="field"><span>Mes</span><select id="month"><option value="">Todo o ano</option></select></label>
      <details class="organisms"><summary><span>Organismos</span><b id="organism-label">Todos os organismos</b></summary><div class="organism-menu" id="organisms"><button type="button" id="clear-organisms">Mostrar todos</button></div></details>
      <button type="button" id="download" disabled>Descargar CSV</button>
    </section>
    <p class="status"><span><strong id="result-count">0</strong> resultados</span><span id="page-status"></span></p>
    <div class="table-wrap"><table><thead><tr><th>Obxecto</th><th>Adxudicatario</th><th>Organismo</th><th>Data</th><th>Importe</th><th>Fonte</th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty">Preparando o arquivo...</div></div>
    <nav class="pagination" aria-label="Paxinación"><button id="previous" aria-label="Páxina anterior">&larr;</button><span id="pagination-label"></span><button id="next" aria-label="Páxina seguinte">&rarr;</button></nav>
  </main>
  <footer>Datos sanitizados da Plataforma de Contratos Públicos de Galicia. Os nomes agrúpanse exactamente como foron publicados; non se inclúen identificadores fiscais.</footer>
  <script id="archive-data" type="text/plain">__DATA_BASE64__</script>
  <script>
    const state={records:[],filtered:[],page:1,pageSize:50,organisms:new Set()};
    const byId=id=>document.getElementById(id);const number=value=>new Intl.NumberFormat('es-ES').format(value);const euro=value=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value);
    const escapeCsv=value=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
    function applyFilters(){const query=byId('search').value.trim().toLocaleLowerCase('gl');const month=byId('month').value;state.filtered=state.records.filter(record=>(!month||record.publication_date.startsWith(month))&&(!state.organisms.size||state.organisms.has(String(record.organism_id)))&&(!query||[record.subject,record.vendor_name,record.organism_name].some(value=>value.toLocaleLowerCase('gl').includes(query))));state.page=1;render()}
    function render(){const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));state.page=Math.min(state.page,pages);const start=(state.page-1)*state.pageSize;const rows=state.filtered.slice(start,start+state.pageSize);const body=byId('rows');body.replaceChildren(...rows.map(record=>{const row=document.createElement('tr');for(const value of [record.subject||'—',record.vendor_name||'—',record.organism_name,record.publication_date,euro(record.amount_eur)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}const source=document.createElement('td');const link=document.createElement('a');link.className='source';link.href=record.source_url;link.target='_blank';link.rel='noreferrer';link.textContent='Abrir ↗';source.append(link);row.append(source);return row}));byId('empty').hidden=rows.length>0;byId('empty').textContent=state.records.length?'Non hai resultados para estes filtros.':'O arquivo non contén contratos.';byId('result-count').textContent=number(state.filtered.length);byId('page-status').textContent=rows.length?`${number(start+1)}–${number(start+rows.length)} de ${number(state.filtered.length)}`:'';byId('pagination-label').textContent=`Páxina ${state.page} de ${pages}`;byId('previous').disabled=state.page===1;byId('next').disabled=state.page===pages;byId('download').disabled=!state.filtered.length}
    function renderOrganisms(organisms){const host=byId('organisms');for(const organism of organisms){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=organism.organism_id;const text=document.createElement('span');text.textContent=organism.name;input.addEventListener('change',()=>{input.checked?state.organisms.add(input.value):state.organisms.delete(input.value);byId('organism-label').textContent=state.organisms.size?`${state.organisms.size} seleccionados`:'Todos os organismos';applyFilters()});label.append(input,text);host.append(label)}}
    async function load(){try{const encoded=byId('archive-data').textContent.trim();const compressed=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));const data=await new Response(stream).json();state.records=data.records;state.filtered=data.records;byId('record-count').textContent=number(data.record_count);byId('total-amount').textContent=euro(data.total_amount_eur);byId('organism-count').textContent=number(data.organisms.length);for(const month of [...new Set(data.records.map(record=>record.publication_date.slice(0,7)))].sort()){const option=document.createElement('option');option.value=month;option.textContent=month;byId('month').append(option)}renderOrganisms(data.organisms);render()}catch(error){byId('empty').textContent='Non foi posible abrir os datos. Usa unha versión recente de Edge, Chrome ou Firefox.';console.error(error)}}
    byId('search').addEventListener('input',applyFilters);byId('month').addEventListener('change',applyFilters);byId('clear-organisms').addEventListener('click',()=>{state.organisms.clear();document.querySelectorAll('#organisms input').forEach(input=>input.checked=false);byId('organism-label').textContent='Todos os organismos';applyFilters()});byId('previous').addEventListener('click',()=>{state.page--;render()});byId('next').addEventListener('click',()=>{state.page++;render()});byId('download').addEventListener('click',()=>{const fields=['publication_date','subject','vendor_name','organism_name','amount_eur','source_url'];const csv=['Data,Obxecto,Adxudicatario,Organismo,Importe,Fonte',...state.filtered.map(record=>fields.map(field=>escapeCsv(record[field])).join(','))].join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download='contratos-xunta-__YEAR__.csv';link.click();URL.revokeObjectURL(link.href)});load();
  </script>
</body>
</html>
"""


def _validate_annual_coverage(input_dir: Path, year: int, entities: list[Entity]) -> int:
    window_count = 0
    missing: list[str] = []
    for entity in entities:
        for month in range(1, 13):
            start = date(year, month, 1)
            end = date(year, month, calendar.monthrange(year, month)[1])
            if window_is_complete(input_dir, entity.organism_id, start, end):
                window_count += 1
            else:
                missing.append(f"{entity.organism_id}:{year}-{month:02d}")
    if missing:
        preview = ", ".join(missing[:10])
        suffix = f" and {len(missing) - 10} more" if len(missing) > 10 else ""
        raise ValueError(f"Annual coverage is incomplete: {preview}{suffix}")
    return window_count


def _enrich_records(
    records: list[dict[str, Any]], year: int, entities: list[Entity]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    entities_by_id = {entity.organism_id: entity for entity in entities}
    annual_records = [record for record in records if record["publication_date"].startswith(f"{year}-")]
    unknown_ids = {record["organism_id"] for record in annual_records} - entities_by_id.keys()
    if unknown_ids:
        raise ValueError(f"Records reference unknown organisms: {sorted(unknown_ids)}")
    enriched = [
        {
            **record,
            "organism_name": entities_by_id[record["organism_id"]].name,
            "category": entities_by_id[record["organism_id"]].category,
        }
        for record in sorted(
            annual_records,
            key=lambda item: (item["publication_date"], item["source_id"]),
            reverse=True,
        )
    ]
    active_ids = {record["organism_id"] for record in enriched}
    organisms = [
        entity.as_dict() for entity in entities if entity.organism_id in active_ids
    ]
    return enriched, organisms


def build_annual_package(
    input_dir: Path,
    output_dir: Path,
    entities: list[Entity],
    year: int,
) -> tuple[Path, Path]:
    current_year = date.today().year
    if year < 2000 or year >= current_year:
        raise ValueError(f"year must be a closed calendar year between 2000 and {current_year - 1}")
    window_count = _validate_annual_coverage(input_dir, year, entities)
    records, _ = load_complete_records(input_dir)
    enriched, organisms = _enrich_records(records, year, entities)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "schema_version": 1,
        "year": year,
        "generated_at": generated_at,
        "window_count": window_count,
        "record_count": len(enriched),
        "total_amount_eur": round(sum(record["amount_eur"] for record in enriched), 2),
        "organisms": organisms,
        "records": enriched,
    }
    assert_no_tax_identifiers(payload)
    payload_bytes = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    encoded_payload = base64.b64encode(gzip.compress(payload_bytes, compresslevel=9, mtime=0)).decode("ascii")
    index_bytes = HTML_TEMPLATE.replace("__YEAR__", str(year)).replace(
        "__DATA_BASE64__", encoded_payload
    ).encode("utf-8")
    readme_bytes = (
        f"Contratos Xunta {year}\n"
        "=====================\n\n"
        "Open index.html in a recent web browser. No local server is required.\n"
        "The explorer works offline; official source links require internet access.\n\n"
        "The data excludes tax identifiers and groups awardees by exact published name.\n"
    ).encode("utf-8")
    manifest = {
        "schema_version": 1,
        "year": year,
        "generated_at": generated_at,
        "record_count": len(enriched),
        "window_count": window_count,
        "records_sha256": hashlib.sha256(payload_bytes).hexdigest(),
        "index_sha256": hashlib.sha256(index_bytes).hexdigest(),
        "readme_sha256": hashlib.sha256(readme_bytes).hexdigest(),
    }
    manifest_bytes = encode_json(manifest)
    assert_no_tax_identifiers(manifest)

    output_dir.mkdir(parents=True, exist_ok=True)
    package_path = output_dir / f"contratos-xunta-{year}.zip"
    temporary_path = package_path.with_suffix(".zip.tmp")
    if temporary_path.exists():
        temporary_path.unlink()
    with zipfile.ZipFile(
        temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        archive.writestr("index.html", index_bytes)
        archive.writestr("README.txt", readme_bytes)
        archive.writestr("manifest.json", manifest_bytes)
    temporary_path.replace(package_path)
    checksum = hashlib.sha256(package_path.read_bytes()).hexdigest()
    checksum_path = package_path.with_suffix(".zip.sha256")
    write_atomic(checksum_path, f"{checksum}  {package_path.name}\n".encode("ascii"))
    return package_path, checksum_path


def build_annual_summary(
    input_dir: Path,
    output_path: Path,
    entities: list[Entity],
    year: int,
) -> Path:
    current_year = date.today().year
    if year < 2000 or year >= current_year:
        raise ValueError(f"year must be a closed calendar year between 2000 and {current_year - 1}")
    window_count = _validate_annual_coverage(input_dir, year, entities)
    records, _ = load_complete_records(input_dir)
    enriched, _ = _enrich_records(records, year, entities)
    records_by_organism: dict[int, list[dict[str, Any]]] = {}
    for record in enriched:
        records_by_organism.setdefault(record["organism_id"], []).append(record)
    entities_by_id = {entity.organism_id: entity for entity in entities}
    summary = {
        "schema_version": 1,
        "year": year,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "window_count": window_count,
        "earliest_publication_date": min(
            (record["publication_date"] for record in enriched), default=None
        ),
        "latest_publication_date": max(
            (record["publication_date"] for record in enriched), default=None
        ),
        "grouping_note": "Awardees are grouped by exact published name; no tax identifier matching is used.",
        "all": build_analysis_scope(enriched),
        "organism_scopes": {
            str(organism_id): {
                "organism_id": organism_id,
                "name": entities_by_id[organism_id].name,
                "category": entities_by_id[organism_id].category,
                "scope": build_analysis_scope(organism_records),
            }
            for organism_id, organism_records in sorted(records_by_organism.items())
        },
    }
    assert_no_tax_identifiers(summary)
    write_atomic(output_path, encode_json(summary))
    return output_path