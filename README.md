# Contratos Xunta

Static explorer for minor contracts published by the Xunta de Galicia and its public-sector entities. The project has two independent parts:

- `pipeline/`: Python ingestion, validation, sanitization, resumable monthly storage, and static-data compilation.
- `web/`: Astro and React interface deployed as a static GitHub Pages site.

The interface is split into dedicated routes for the overview, awardees, organizations, amounts, publication evolution, contract explorer, and methodology. Navigation and language choice persist across pages and work under the GitHub Pages base path.

## Data model and privacy

The source API includes tax identifiers. They are parsed only at the network boundary and are never written to canonical or public artifacts. Public records contain the contract source ID, organization, publication date, subject, amount, vendor name, duration, and the human-facing official contract detail URL.

Each completed date window has a manifest with its row count and SHA-256 checksum. A rerun skips a window only when both files validate, so interrupted or corrupted batches are fetched again.

The public compiler writes `web/public/data/explorer/manifest.json` and groups records into month-indexed parts within each year. Every part stays below the configured uncompressed byte ceiling and is described by its record count, date bounds, byte size, and SHA-256 checksum. The browser defaults to the latest month and appends its parts progressively; users can select another month or explicitly load the complete year.

Explorer URLs preserve the language, selected year and month, search, organization/category filters, and current page so a result view can be shared or restored. CSV downloads include all records matching the active period and filters only after that period's shards finish loading. The export uses an explicit public-field list and neutralizes formula-leading spreadsheet cells.

The compiler also writes `web/public/data/analysis.json`. It contains all-record, per-year, and composable per-organism scopes for monthly publication series, awardee rankings by amount and count, top-1/5/10 amount concentration, organization and institutional-category rankings, amount percentiles, amount bands, and the largest published contracts. The analysis pages can select any combination of organisms and a year, persist that scope in the URL, and carry it between routes. Browser rankings are bounded to 100 entries, while summary, percentiles, and concentration values are recalculated over the complete selected scope.

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

The weekly refresh workflow repairs a rolling 24-month history by default, overwrites the current and immediately previous calendar month, rebuilds the bounded public explorer shards for validation, and commits changed canonical windows. Older checked-in windows are retained indefinitely and remain part of the public build even after they fall outside the rolling repair range. Generated `web/public/data` artifacts are not versioned; the Pages workflow rebuilds them from canonical history before validating and deploying `web/dist`. A manual workflow run can override the history length.
