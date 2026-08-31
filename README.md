# Contratos Xunta

[Galego](#galego) · [Castellano](#castellano) · [English](#english)

## Galego

Explorador estático dos contratos menores publicados pola Xunta de Galicia e as entidades do seu sector público.

O proxecto ten dúas partes independentes:

- `pipeline/`: inxestión, validación e saneamento en Python; almacenamento mensual reanudable; e compilación dos datos estáticos.
- `web/`: interface en Astro e React despregada como sitio estático en GitHub Pages.

A web inclúe vistas de resumo, adxudicatarios, organismos, importes, evolución das publicacións, explorador de contratos e metodoloxía. A navegación, o idioma e os filtros seleccionados consérvanse na URL.

### Análise

O compilador xera `web/public/data/analysis.json` con ámbitos globais, anuais e por organismo. Inclúe series temporais, clasificacións de adxudicatarios e organismos, concentración do importe, e sinais de repetición e acumulación.

Unha alerta de repetición agrupa polo menos tres publicacións do mesmo organismo e adxudicatario, cun obxecto equivalente tras normalizar maiúsculas, acentos e puntuación, dentro dunha xanela temporal limitada.

Os sinais de acumulación agrupan dúas ou máis publicacións do mesmo organismo e adxudicatario nun máximo de 30 días cando cada importe está baixo unha referencia publicada (18.150 € ou 48.400 €) e a suma supera ese límite.

As páxinas de análise permiten seleccionar un ano e calquera combinación de organismos e gardan ese ámbito na URL. Os ámbitos recentes con detalle recompóñense exactamente. Nos resumos anuais, a cobertura e as sumas calcúlanse sobre a data de publicación, non sobre a data de execución.

Os adxudicatarios agrúpanse polo nome exacto publicado porque os artefactos públicos non conteñen identificadores fiscais. As variantes ortográficas poden aparecer separadas. A análise temporal segue o mesmo criterio que a fonte pública.

### Datos e privacidade

A API de orixe inclúe identificadores fiscais. Só se procesan no límite de rede e nunca se escriben nos artefactos canónicos nin públicos. Os rexistros públicos conteñen o identificador do contrato, o organismo, o adxudicatario, o importe, a data de publicación e os campos permitidos pola fonte.

Cada xanela temporal completada ten un manifesto co número de filas e unha suma SHA-256. Unha nova execución só omite a xanela cando os dous ficheiros son válidos; os lotes interrompidos ou danados recupéranse de novo.

O compilador crea `web/public/data/explorer/manifest.json` e divide os rexistros recentes en partes por mes e ano. Por defecto, o detalle publicado en Pages limítase aos últimos 24 meses. Os rexistros anuais completos publícanse como arquivos descargables autocontidos.

O explorador conserva na URL o idioma, ano, mes, busca, organismo, categoría, páxina e filtros de alertas. A descarga CSV inclúe todos os rexistros que coinciden cos filtros activos e neutraliza fórmulas para unha exportación segura.

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

Descomprime o ZIP e abre `index.html` directamente nun navegador recente. Non require servidor web. As filas anuais detalladas permanecen na descarga; a rama principal só conserva `pipeline/data/history/YYYY.json`.

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

O workflow semanal repara por defecto un histórico móbil de 24 meses, sobrescribe o mes actual e o anterior e confirma os cambios nas xanelas canónicas. Os datos xerados en `web/public/data` non se editan a man.

## Licenza

Este proxecto distribúese baixo a licenza MIT. Consulta [LICENSE](LICENSE) para os detalles.

## Contribucións

As contribucións son benvidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para as directrices.

---

## Castellano

Explorador estático de los contratos menores publicados por la Xunta de Galicia y las entidades de su sector público.

El proyecto tiene dos partes independientes:

- `pipeline/`: ingestión, validación y saneamiento en Python; almacenamiento mensual reanudable; y compilación de los datos estáticos.
- `web/`: interfaz en Astro y React desplegada como sitio estático en GitHub Pages.

La web incluye vistas de resumen, adjudicatarios, organismos, importes, evolución de las publicaciones, explorador de contratos y metodología. La navegación, el idioma y los filtros seleccionados se conservan en la URL.

### Análisis

El compilador genera `web/public/data/analysis.json` con ámbitos globales, anuales y por organismo. Incluye series temporales, clasificaciones de adjudicatarios y organismos, concentración del importe, y señales de repetición y acumulación.

Una alerta de repetición agrupa al menos tres publicaciones del mismo organismo y adjudicatario, con un objeto equivalente tras normalizar mayúsculas, acentos y puntuación, dentro de una ventana temporal limitada.

Las señales de acumulación agrupan dos o más publicaciones del mismo organismo y adjudicatario en un máximo de 30 días cuando cada importe está bajo una referencia publicada (18.150 € o 48.400 €) y la suma supera ese límite.

Las páginas de análisis permiten seleccionar un año y cualquier combinación de organismos y guardan ese ámbito en la URL. Los ámbitos recientes con detalle se recomponen exactamente. En los resúmenes anuales, la cobertura y las sumas se calculan sobre la fecha de publicación, no sobre la fecha de ejecución.

Los adjudicatarios se agrupan por el nombre exacto publicado porque los artefactos públicos no contienen identificadores fiscales. Las variantes ortográficas pueden aparecer separadas. El análisis temporal sigue el mismo criterio que la fuente pública.

### Datos y privacidad

La API de origen incluye identificadores fiscales. Solo se procesan en el límite de red y nunca se escriben en los artefactos canónicos ni públicos. Los registros públicos contienen el identificador del contrato, el organismo, el adjudicatario, el importe, la fecha de publicación y los campos permitidos por la fuente.

Cada ventana temporal completada tiene un manifiesto con el número de filas y una suma SHA-256. Una nueva ejecución solo omite la ventana cuando ambos archivos son válidos; los lotes interrumpidos o dañados se recuperan de nuevo.

El compilador crea `web/public/data/explorer/manifest.json` y divide los registros recientes en partes por mes y año. Por defecto, el detalle publicado en Pages se limita a los últimos 24 meses. Los registros anuales completos se publican como archivos descargables autocontenidos.

El explorador conserva en la URL el idioma, año, mes, búsqueda, organismo, categoría, página y filtros de alertas. La descarga CSV incluye todos los registros que coinciden con los filtros activos y neutraliza fórmulas para una exportación segura.

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

Descomprime el ZIP y abre `index.html` directamente en un navegador reciente. No requiere servidor web. Las filas anuales detalladas permanecen en la descarga; la rama principal solo conserva `pipeline/data/history/YYYY.json`.

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

El workflow semanal repara por defecto un histórico móvil de 24 meses, sobrescribe el mes actual y el anterior y confirma los cambios en las ventanas canónicas. Los datos generados en `web/public/data` no se editan a mano.

## Licencia

Este proyecto se distribuye bajo la licencia MIT. Consulta [LICENSE](LICENSE) para los detalles.

## Contribuciones

Las contribuciones son bienvenidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para las directrices.

---

## English

Static explorer for minor contracts published by the Xunta de Galicia and its public-sector entities.

The project has two independent parts:

- `pipeline/`: Python ingestion, validation, sanitization, resumable monthly storage, and static-data compilation.
- `web/`: Astro and React interface deployed as a static GitHub Pages site.

The interface is split into dedicated routes for the overview, awardees, organizations, amounts, publication evolution, contract explorer, and methodology. Navigation and language choice persist in the URL.

### Data and privacy

The source API includes tax identifiers. They are parsed only at the network boundary and are never written to canonical or public artifacts. Public records contain the contract source ID, organization, awardee, amount, publication date, and the fields allowed by the source.

Each completed date window has a manifest with its row count and SHA-256 checksum. A rerun skips a window only when both files validate, so interrupted or corrupted batches are fetched again.

The public compiler writes `web/public/data/explorer/manifest.json` and groups recent records into month-indexed parts within each year. Row-level Pages detail is bounded to the latest 24 publication months by default. Full annual records are published as self-contained downloadable archives.

Explorer URLs preserve the language, selected year and month, search, organization/category filters, and current page so a result view can be shared or restored. CSV downloads include all matching records and neutralize formulas for safe export.

### Analysis

The compiler also writes `web/public/data/analysis.json`. It contains all-record, per-year, and composable per-organism scopes for monthly publication series, awardee rankings by amount and count, organization rankings, concentration metrics, and repetition/accretion signals.

Awardees are grouped by their exact published name because public artifacts do not contain tax identifiers. Spelling variants may therefore appear as separate names and are not silently merged. The temporal analysis follows the same public-source naming rule.

The interface reports the curated organizational scope, validated publication-date coverage, privacy policy, and source limitations. Publication dates must not be interpreted as execution dates, and missing bidder/competition/procedure fields are never inferred.

Potential repetition alerts group at least three publications from the same organization to the same awardee, with an equivalent subject after case, accent, and punctuation normalization, inside a limited time window.

Cumulative signals group two or more publications from the same organization to the same awardee within 30 days when every amount is below a published reference (€18,150 or €48,400) and their sum exceeds that threshold.

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

For normal operation, use the rolling refresh command. It fills missing older calendar months resumably and overwrites the current and immediately previous month. Rechecking the recently closed months helps keep the bounded explorer consistent.

```powershell
contratos-xunta refresh-history --months 24
contratos-xunta build-site-data
```

The current checked-in local snapshot was initially materialized with an eight-month refresh and therefore covers publication dates from January through August 2026. This is not a source limit: a rolling refresh can extend the snapshot further.

### Annual archives

The `Publish annual data release` workflow accepts one closed calendar year. It discovers the current curated registry, ingests that year in resumable monthly windows, runs the pipeline tests, and publishes under the `data-YYYY` tag:

- `contratos-xunta-YYYY.zip`: a self-contained local explorer with embedded compressed data.
- `contratos-xunta-YYYY.zip.sha256`: a checksum for the downloaded ZIP.

Extract the ZIP and open `index.html` directly in a recent Edge, Chrome, or Firefox. It does not require a web server and provides month selection, free-text search, multiple-organization filtering, and analytics for the full annual archive.

Each successful annual run commits only `pipeline/data/history/YYYY.json`, a compact privacy-checked analytical summary used by Pages. Detailed annual rows remain in the downloadable release rather than the main branch.

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

The weekly refresh workflow repairs a rolling 24-month history by default, overwrites the current and immediately previous calendar month, rebuilds the bounded public explorer shards for validation, and confirms the canonical window outputs. Generated data under `web/public/data` is never edited manually.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the guidelines.
