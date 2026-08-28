# Contratos Xunta

Static explorer for minor contracts published by the Xunta de Galicia and its public-sector entities. The project has two independent parts:

- `pipeline/`: Python ingestion, validation, sanitization, resumable monthly storage, and static-data compilation.
- `web/`: Astro and React interface deployed as a static GitHub Pages site.

The interface is split into dedicated routes for the overview, awardees, organizations, amounts, publication evolution, contract explorer, and methodology. Navigation and language choice persist across pages and work under the GitHub Pages base path.

## Data model and privacy

The source API includes tax identifiers. They are parsed only at the network boundary and are never written to canonical or public artifacts. Public records contain the contract source ID, organization, publication date, subject, amount, vendor name, duration, and the human-facing official contract detail URL.

Each completed date window has a manifest with its row count and SHA-256 checksum. A rerun skips a window only when both files validate, so interrupted or corrupted batches are fetched again.

The public compiler writes `web/public/data/explorer/manifest.json` and groups recent records into month-indexed parts within each year. Row-level Pages detail is bounded to the latest 24 publication months by default; older canonical rows and released annual summaries still contribute to historical analysis. Every part stays below the configured uncompressed byte ceiling and is described by its record count, date bounds, byte size, and SHA-256 checksum. The browser defaults to the latest month and appends its parts progressively; users can select another month or explicitly load the complete year.

Explorer URLs preserve the language, selected year and month, search, organization/category filters, and current page so a result view can be shared or restored. CSV downloads include all records matching the active period and filters only after that period's shards finish loading. The export uses an explicit public-field list and neutralizes formula-leading spreadsheet cells.

The compiler also writes `web/public/data/analysis.json`. It contains all-record, per-year, and composable per-organism scopes for monthly publication series, awardee rankings by amount and count, top-1/5/10 amount concentration, organization and institutional-category rankings, amount percentiles, amount bands, and the largest published contracts. The analysis pages can select any combination of organisms and a year, persist that scope in the URL, and carry it between routes. Recent detailed scopes are recomposed exactly. Released years use compact annual scopes; totals and time series remain exact, while combined percentiles, cross-year unique-vendor counts, and rankings assembled from bounded annual top lists are estimates.

Awardees are grouped by their exact published name because public artifacts do not contain tax identifiers. Spelling variants may therefore appear as separate names and are not silently merged. Temporal analysis is based on publication dates, and the current calendar month must be treated as partial until it closes.

The interface reports the curated organizational scope, validated publication-date coverage, privacy policy, and source limitations. Publication dates must not be interpreted as execution dates, and bidder competition or procedure details are not inferred when the source does not provide them.

Topic classification and pattern alerts from the Concello de Vigo project are intentionally deferred until a Xunta-specific subject taxonomy is validated and multiple historical periods are available. Competition analysis remains unavailable because the source does not publish bidder counts or procedure fields.

## Local setup

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

## Annual archives

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

## Validation

```powershell
python -m pytest pipeline/tests -q
Set-Location .\web
npm run build
npm test
npm run test:e2e
```

The weekly refresh workflow repairs a rolling 24-month history by default, overwrites the current and immediately previous calendar month, rebuilds the bounded public explorer shards for validation, and commits changed canonical windows. Saved canonical windows are not deleted by the refresh command when they leave its repair range, but only the latest 24 publication months are emitted as Pages explorer shards. Generated `web/public/data` artifacts are not versioned; the Pages workflow rebuilds them from recent canonical detail and tracked annual summaries before validating and deploying `web/dist`. A manual workflow run can override the repair range.
