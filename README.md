# Contratos Xunta

[Galego](#galego) · [Castellano](#castellano) · [English](#english)

## Galego

Explorador estático dos contratos menores publicados pola Xunta de Galicia e as entidades do seu sector público.

O proxecto ten dúas partes independentes:

- `pipeline/`: inxestión, validación e saneamento en Python; almacenamento mensual reanudable; e compilación dos datos estáticos.
- `web/`: interface en Astro e React despregada como sitio estático en GitHub Pages.

A web inclúe vistas de resumo, adxudicatarios, organismos, importes, evolución das publicacións, explorador de contratos e metodoloxía. A navegación, o idioma e os filtros seleccionados consérvanse entre páxinas.

### Análise

O compilador xera `web/public/data/analysis.json` con ámbitos globais, anuais e por organismo. Inclúe series temporais, clasificacións de adxudicatarios e organismos, concentración do importe, percentís, tramos de importe, maiores contratos e alertas de posibles repeticións en períodos curtos.

Unha alerta de repetición agrupa polo menos tres publicacións do mesmo organismo e adxudicatario, cun obxecto equivalente tras normalizar maiúsculas, acentos e puntuación, dentro dunha xanela máxima de 30 días. Son pistas para investigar, non probas de fraccionamento nin de ningunha irregularidade. Cada alerta enlaza cunha vista do explorador cos contratos exactos segundo organismo, adxudicatario, obxecto normalizado e intervalo de datas.

As páxinas de análise permiten seleccionar un ano e calquera combinación de organismos e gardan ese ámbito na URL. Os ámbitos recentes con detalle recompóñense exactamente. Nos resumos anuais compactos, os totais e as series temporais seguen sendo exactos; os percentís combinados, os adxudicatarios únicos entre anos e as clasificacións construídas a partir de listas limitadas son estimacións.

Os adxudicatarios agrúpanse polo nome exacto publicado porque os artefactos públicos non conteñen identificadores fiscais. As variantes ortográficas poden aparecer separadas. A análise temporal usa datas de publicación e o mes natural en curso debe considerarse parcial.

### Datos e privacidade

A API de orixe inclúe identificadores fiscais. Só se procesan no límite de rede e nunca se escriben nos artefactos canónicos nin públicos. Os rexistros públicos conteñen o identificador do contrato na fonte, organismo, data de publicación, obxecto, importe, nome do adxudicatario, duración e ligazón oficial ao detalle.

Cada xanela temporal completada ten un manifesto co número de filas e unha suma SHA-256. Unha nova execución só omite a xanela cando os dous ficheiros son válidos; os lotes interrompidos ou danados descárganse de novo.

O compilador crea `web/public/data/explorer/manifest.json` e divide os rexistros recentes en partes por mes e ano. Por defecto, o detalle publicado en Pages limítase aos últimos 24 meses. Os rexistros canónicos anteriores e os resumos anuais publicados seguen contribuíndo á análise histórica.

O explorador conserva na URL o idioma, ano, mes, busca, organismo, categoría, páxina e filtros de alertas. A descarga CSV inclúe todos os rexistros que coinciden cos filtros activos e neutraliza as celas que unha folla de cálculo podería interpretar como fórmulas.

As datas corresponden á publicación, non necesariamente á execución. Non se infiren licitadores, competencia nin procedemento cando a fonte non ofrece eses campos.

### Instalación local

Requírese Python 3.11 ou posterior e Node.js 22.12 ou posterior.

```powershell
python -m pip install -e ".\pipeline[dev]"
Set-Location .\web
npm install
Set-Location ..
```

Actualizar o rexistro curado, inxerir un intervalo e compilar os datos:

```powershell
contratos-xunta discover-entities
contratos-xunta backfill-all --start-date 2026-01-01 --end-date 2026-12-31
contratos-xunta build-site-data
```

Para a operación habitual, a actualización móbil completa os meses históricos que falten e sobrescribe o mes actual e o anterior:

```powershell
contratos-xunta refresh-history --months 24
contratos-xunta build-site-data
```

Iniciar a web:

```powershell
Set-Location .\web
npm run dev
```

### Arquivos anuais

O workflow `Publish annual data release` acepta un ano natural pechado. Inxire o ano en xanelas mensuais reanudables, executa as probas e publica baixo a etiqueta `data-YYYY`:

- `contratos-xunta-YYYY.zip`: explorador local autocontido con datos comprimidos.
- `contratos-xunta-YYYY.zip.sha256`: suma de verificación do ZIP.

Descomprime o ZIP e abre `index.html` directamente nun navegador recente. Non require servidor web. As filas anuais detalladas permanecen na descarga; a rama principal só conserva `pipeline/data/history/YYYY.json`, un resumo analítico compacto e revisado para evitar datos fiscais.

Comandos locais equivalentes:

```powershell
$year = 2025
contratos-xunta backfill-all --start-date "$year-01-01" --end-date "$year-12-31" --output-dir ".\pipeline\data\annual\$year\windows"
contratos-xunta build-annual-package --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output-dir ".\pipeline\data\releases"
contratos-xunta build-annual-summary --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output ".\pipeline\data\history\$year.json"
```

### Validación

```powershell
python -m pytest pipeline/tests -q
Set-Location .\web
npm run check
npm run build
npm test
npm run test:e2e
```

O workflow semanal repara por defecto un histórico móbil de 24 meses, sobrescribe o mes actual e o anterior e confirma os cambios nas xanelas canónicas. Os datos xerados en `web/public/data` non se versionan: o workflow de Pages reconstrúeos antes de validar e despregar `web/dist`.

---

## Castellano

Explorador estático de los contratos menores publicados por la Xunta de Galicia y las entidades de su sector público.

El proyecto tiene dos partes independientes:

- `pipeline/`: ingestión, validación y saneamiento en Python; almacenamiento mensual reanudable; y compilación de los datos estáticos.
- `web/`: interfaz en Astro y React desplegada como sitio estático en GitHub Pages.

La web incluye vistas de resumen, adjudicatarios, organismos, importes, evolución de las publicaciones, explorador de contratos y metodología. La navegación, el idioma y los filtros seleccionados se conservan entre páginas.

### Análisis

El compilador genera `web/public/data/analysis.json` con ámbitos globales, anuales y por organismo. Incluye series temporales, clasificaciones de adjudicatarios y organismos, concentración del importe, percentiles, tramos de importe, mayores contratos y alertas de posibles repeticiones en periodos cortos.

Una alerta de repetición agrupa al menos tres publicaciones del mismo organismo y adjudicatario, con un objeto equivalente tras normalizar mayúsculas, acentos y puntuación, dentro de una ventana máxima de 30 días. Son pistas para investigar, no pruebas de fraccionamiento ni de ninguna irregularidad. Cada alerta enlaza con una vista del explorador con los contratos exactos según organismo, adjudicatario, objeto normalizado e intervalo de fechas.

Las páginas de análisis permiten seleccionar un año y cualquier combinación de organismos y guardan ese ámbito en la URL. Los ámbitos recientes con detalle se recomponen exactamente. En los resúmenes anuales compactos, los totales y las series temporales siguen siendo exactos; los percentiles combinados, los adjudicatarios únicos entre años y las clasificaciones construidas a partir de listas limitadas son estimaciones.

Los adjudicatarios se agrupan por el nombre exacto publicado porque los artefactos públicos no contienen identificadores fiscales. Las variantes ortográficas pueden aparecer separadas. El análisis temporal usa fechas de publicación y el mes natural en curso debe considerarse parcial.

### Datos y privacidad

La API de origen incluye identificadores fiscales. Solo se procesan en el límite de red y nunca se escriben en los artefactos canónicos ni públicos. Los registros públicos contienen el identificador del contrato en la fuente, organismo, fecha de publicación, objeto, importe, nombre del adjudicatario, duración y enlace oficial al detalle.

Cada ventana temporal completada tiene un manifiesto con el número de filas y una suma SHA-256. Una nueva ejecución solo omite la ventana cuando ambos archivos son válidos; los lotes interrumpidos o dañados se descargan de nuevo.

El compilador crea `web/public/data/explorer/manifest.json` y divide los registros recientes en partes por mes y año. Por defecto, el detalle publicado en Pages se limita a los últimos 24 meses. Los registros canónicos anteriores y los resúmenes anuales publicados siguen contribuyendo al análisis histórico.

El explorador conserva en la URL el idioma, año, mes, búsqueda, organismo, categoría, página y filtros de alertas. La descarga CSV incluye todos los registros que coinciden con los filtros activos y neutraliza las celdas que una hoja de cálculo podría interpretar como fórmulas.

Las fechas corresponden a la publicación, no necesariamente a la ejecución. No se infieren licitadores, competencia ni procedimiento cuando la fuente no ofrece esos campos.

### Instalación local

Se requiere Python 3.11 o posterior y Node.js 22.12 o posterior.

```powershell
python -m pip install -e ".\pipeline[dev]"
Set-Location .\web
npm install
Set-Location ..
```

Actualizar el registro curado, ingerir un intervalo y compilar los datos:

```powershell
contratos-xunta discover-entities
contratos-xunta backfill-all --start-date 2026-01-01 --end-date 2026-12-31
contratos-xunta build-site-data
```

Para la operación habitual, la actualización móvil completa los meses históricos que falten y sobrescribe el mes actual y el anterior:

```powershell
contratos-xunta refresh-history --months 24
contratos-xunta build-site-data
```

Iniciar la web:

```powershell
Set-Location .\web
npm run dev
```

### Archivos anuales

El workflow `Publish annual data release` acepta un año natural cerrado. Ingiere el año en ventanas mensuales reanudables, ejecuta las pruebas y publica bajo la etiqueta `data-YYYY`:

- `contratos-xunta-YYYY.zip`: explorador local autocontenido con datos comprimidos.
- `contratos-xunta-YYYY.zip.sha256`: suma de verificación del ZIP.

Descomprime el ZIP y abre `index.html` directamente en un navegador reciente. No requiere servidor web. Las filas anuales detalladas permanecen en la descarga; la rama principal solo conserva `pipeline/data/history/YYYY.json`, un resumen analítico compacto y revisado para evitar datos fiscales.

Comandos locales equivalentes:

```powershell
$year = 2025
contratos-xunta backfill-all --start-date "$year-01-01" --end-date "$year-12-31" --output-dir ".\pipeline\data\annual\$year\windows"
contratos-xunta build-annual-package --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output-dir ".\pipeline\data\releases"
contratos-xunta build-annual-summary --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output ".\pipeline\data\history\$year.json"
```

### Validación

```powershell
python -m pytest pipeline/tests -q
Set-Location .\web
npm run check
npm run build
npm test
npm run test:e2e
```

El workflow semanal repara por defecto un histórico móvil de 24 meses, sobrescribe el mes actual y el anterior y confirma los cambios en las ventanas canónicas. Los datos generados en `web/public/data` no se versionan: el workflow de Pages los reconstruye antes de validar y desplegar `web/dist`.

---

## English

Static explorer for minor contracts published by the Xunta de Galicia and its public-sector entities. The project has two independent parts:

- `pipeline/`: Python ingestion, validation, sanitization, resumable monthly storage, and static-data compilation.
- `web/`: Astro and React interface deployed as a static GitHub Pages site.

The interface is split into dedicated routes for the overview, awardees, organizations, amounts, publication evolution, contract explorer, and methodology. Navigation and language choice persist across pages and work under the GitHub Pages base path.

### Data and privacy

The source API includes tax identifiers. They are parsed only at the network boundary and are never written to canonical or public artifacts. Public records contain the contract source ID, organization, publication date, subject, amount, vendor name, duration, and the human-facing official contract detail URL.

Each completed date window has a manifest with its row count and SHA-256 checksum. A rerun skips a window only when both files validate, so interrupted or corrupted batches are fetched again.

The public compiler writes `web/public/data/explorer/manifest.json` and groups recent records into month-indexed parts within each year. Row-level Pages detail is bounded to the latest 24 publication months by default; older canonical rows and released annual summaries still contribute to historical analysis. Every part stays below the configured uncompressed byte ceiling and is described by its record count, date bounds, byte size, and SHA-256 checksum. The browser defaults to the latest month and appends its parts progressively; users can select another month or explicitly load the complete year.

Explorer URLs preserve the language, selected year and month, search, organization/category filters, and current page so a result view can be shared or restored. CSV downloads include all records matching the active period and filters only after that period's shards finish loading. The export uses an explicit public-field list and neutralizes formula-leading spreadsheet cells.

### Analysis

The compiler also writes `web/public/data/analysis.json`. It contains all-record, per-year, and composable per-organism scopes for monthly publication series, awardee rankings by amount and count, top-1/5/10 amount concentration, organization and institutional-category rankings, amount percentiles, amount bands, and the largest published contracts. The analysis pages can select any combination of organisms and a year, persist that scope in the URL, and carry it between routes. Recent detailed scopes are recomposed exactly. Released years use compact annual scopes; totals and time series remain exact, while combined percentiles, cross-year unique-vendor counts, and rankings assembled from bounded annual top lists are estimates.

Awardees are grouped by their exact published name because public artifacts do not contain tax identifiers. Spelling variants may therefore appear as separate names and are not silently merged. Temporal analysis is based on publication dates, and the current calendar month must be treated as partial until it closes.

The interface reports the curated organizational scope, validated publication-date coverage, privacy policy, and source limitations. Publication dates must not be interpreted as execution dates, and bidder competition or procedure details are not inferred when the source does not provide them.

Potential repetition alerts group at least three publications from the same organization to the same awardee, with an equivalent subject after case, accent, and punctuation normalization, inside a maximum 30-day window. These are investigative leads, not evidence of contract splitting or other wrongdoing. Each alert links to an explorer view containing the exact contracts selected by organization, awardee, normalized subject, and date range. Topic classification remains deferred until a Xunta-specific subject taxonomy is validated. Competition analysis remains unavailable because the source does not publish bidder counts or procedure fields.

### Local setup

Requires Python 3.11 or newer and Node.js 22.12 or newer.

```powershell
python -m pip install -e ".\pipeline[dev]"
Set-Location .\web
npm install
Set-Location ..
```

Refresh the curated organization registry and ingest a date range:

```powershell
contratos-xunta discover-entities
contratos-xunta backfill-all --start-date 2026-01-01 --end-date 2026-12-31
contratos-xunta build-site-data
```

For normal operation, use the rolling refresh command. It fills missing older calendar months resumably and overwrites the current and immediately previous month. Rechecking the recently closed month prevents publications after the final weekly run of that month from being missed permanently:

```powershell
contratos-xunta refresh-history --months 24
contratos-xunta build-site-data
```

The current checked-in local snapshot was initially materialized with an eight-month refresh and therefore covers publication dates from January through August 2026. This is not a source limit: a direct probe confirmed records in September 2024. Running the configured 24-month refresh backfills the missing earlier monthly windows without downloading already validated windows again.

### Annual archives

The `Publish annual data release` workflow accepts one closed calendar year. It discovers the current curated registry, ingests that year in resumable monthly windows, runs the pipeline tests, and publishes two release assets under the `data-YYYY` tag:

- `contratos-xunta-YYYY.zip`: a self-contained local explorer with embedded compressed data.
- `contratos-xunta-YYYY.zip.sha256`: a checksum for the downloaded ZIP.

Extract the ZIP and open `index.html` directly in a recent Edge, Chrome, or Firefox. It does not require a web server and provides month selection, free-text search, multiple-organization filtering, pagination, official contract links, and sanitized CSV export. The ZIP also contains a manifest with checksums for its embedded data and files.

Each successful annual run commits only `pipeline/data/history/YYYY.json`, a compact privacy-checked analytical summary used by Pages. Detailed annual rows remain in the downloadable release rather than the published site or main branch. Failed ingestion runs save their completed monthly windows in the Actions cache so a retry can resume.

Equivalent local commands are:

```powershell
$year = 2025
contratos-xunta backfill-all --start-date "$year-01-01" --end-date "$year-12-31" --output-dir ".\pipeline\data\annual\$year\windows"
contratos-xunta build-annual-package --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output-dir ".\pipeline\data\releases"
contratos-xunta build-annual-summary --year $year --input-dir ".\pipeline\data\annual\$year\windows" --output ".\pipeline\data\history\$year.json"
```

Start the site:

```powershell
Set-Location .\web
npm run dev
```

### Validation

```powershell
python -m pytest pipeline/tests -q
Set-Location .\web
npm run build
npm test
npm run test:e2e
```

The weekly refresh workflow repairs a rolling 24-month history by default, overwrites the current and immediately previous calendar month, rebuilds the bounded public explorer shards for validation, and commits changed canonical windows. Saved canonical windows are not deleted by the refresh command when they leave its repair range, but only the latest 24 publication months are emitted as Pages explorer shards. Generated `web/public/data` artifacts are not versioned; the Pages workflow rebuilds them from recent canonical detail and tracked annual summaries before validating and deploying `web/dist`. A manual workflow run can override the repair range.
