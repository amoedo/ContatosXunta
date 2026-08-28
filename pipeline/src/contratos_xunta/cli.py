from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from .annual_package import build_annual_package, build_annual_summary
from .artifacts import write_window_artifacts
from .backfill import BackfillResult, backfill_range, backfill_registry, rolling_history_windows
from .crawler import collect_window
from .normalize import canonicalize_row
from .registry import Entity, discover_entities, load_registry, write_registry
from .retention import prune_archived_windows
from .site_data import build_site_data


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("dates must use YYYY-MM-DD") from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline de contratos menores da Xunta")
    subparsers = parser.add_subparsers(dest="command", required=True)
    probe = subparsers.add_parser("probe-api", help="Consulta e valida unha xanela da API")
    probe.add_argument("--organism", type=int, required=True)
    probe.add_argument("--start-date", type=parse_date, required=True)
    probe.add_argument("--end-date", type=parse_date, required=True)

    discover = subparsers.add_parser(
        "discover-entities", help="Actualiza o rexistro de organismos desde Transparencia"
    )
    discover.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )

    backfill = subparsers.add_parser("backfill", help="Descarga e garda unha xanela completa")
    backfill.add_argument("--organism", type=int, required=True)
    backfill.add_argument("--start-date", type=parse_date, required=True)
    backfill.add_argument("--end-date", type=parse_date, required=True)
    backfill.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )

    backfill_range_parser = subparsers.add_parser(
        "backfill-range", help="Descarga un intervalo en xanelas mensuais retomables"
    )
    backfill_range_parser.add_argument("--organism", type=int, required=True)
    backfill_range_parser.add_argument("--start-date", type=parse_date, required=True)
    backfill_range_parser.add_argument("--end-date", type=parse_date, required=True)
    backfill_range_parser.add_argument("--overwrite", action="store_true")
    backfill_range_parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )

    backfill_all = subparsers.add_parser(
        "backfill-all", help="Descarga todos os organismos do rexistro"
    )
    backfill_all.add_argument("--start-date", type=parse_date, required=True)
    backfill_all.add_argument("--end-date", type=parse_date, required=True)
    backfill_all.add_argument("--overwrite", action="store_true")
    backfill_all.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )
    backfill_all.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )

    refresh_history = subparsers.add_parser(
        "refresh-history",
        help="Completa o histórico mensual e actualiza os dous meses máis recentes",
    )
    refresh_history.add_argument("--months", type=int, default=24)
    refresh_history.add_argument("--as-of", type=parse_date, default=date.today())
    refresh_history.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )
    refresh_history.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )

    site_data = subparsers.add_parser(
        "build-site-data", help="Xera os JSON sanitizados e limitados para Astro"
    )
    site_data.add_argument(
        "--input-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )
    site_data.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )
    site_data.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "web" / "public" / "data",
    )
    site_data.add_argument("--max-shard-bytes", type=int, default=750_000)
    site_data.add_argument("--detail-months", type=int, default=24)
    site_data.add_argument(
        "--history-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "history",
    )

    annual_package = subparsers.add_parser(
        "build-annual-package",
        help="Xera un ZIP anual cun explorador HTML local autocontido",
    )
    annual_package.add_argument("--year", type=int, required=True)
    annual_package.add_argument(
        "--input-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )
    annual_package.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )
    annual_package.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "releases",
    )

    annual_summary = subparsers.add_parser(
        "build-annual-summary",
        help="Xera un resumo analítico anual compacto para o histórico web",
    )
    annual_summary.add_argument("--year", type=int, required=True)
    annual_summary.add_argument(
        "--input-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )
    annual_summary.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "config" / "entities.json",
    )
    annual_summary.add_argument(
        "--output",
        type=Path,
        required=True,
    )

    prune_history = subparsers.add_parser(
        "prune-archived-history",
        help="Retira detalle antigo só cando existe un resumo anual validado",
    )
    prune_history.add_argument("--months", type=int, default=24)
    prune_history.add_argument("--as-of", type=parse_date, default=date.today())
    prune_history.add_argument(
        "--input-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "canonical" / "windows",
    )
    prune_history.add_argument(
        "--history-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "history",
    )
    return parser.parse_args()


def report_entity(entity: Entity, result: BackfillResult) -> None:
    print(
        f"[{entity.organism_id}] {entity.name}: fetched {result.fetched_windows}, "
        f"skipped {result.skipped_windows}, records {result.record_count}"
    )


def main() -> int:
    args = parse_args()
    if args.command == "probe-api":
        rows = collect_window(args.organism, args.start_date, args.end_date)
        payload = [canonicalize_row(row, args.organism).as_dict() for row in rows]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    if args.command == "discover-entities":
        entities = discover_entities()
        write_registry(args.output, entities)
        print(f"Wrote {len(entities)} entities to {args.output}")
        return 0
    if args.command == "backfill":
        rows = collect_window(args.organism, args.start_date, args.end_date)
        records = [canonicalize_row(row, args.organism) for row in rows]
        records_path, manifest_path = write_window_artifacts(
            args.output_dir,
            args.organism,
            args.start_date,
            args.end_date,
            records,
        )
        print(f"Wrote {len(records)} records to {records_path}")
        print(f"Wrote manifest to {manifest_path}")
        return 0
    if args.command == "backfill-range":
        result = backfill_range(
            args.organism,
            args.start_date,
            args.end_date,
            args.output_dir,
            overwrite=args.overwrite,
        )
        print(
            f"Fetched {result.fetched_windows} windows ({result.record_count} records); "
            f"skipped {result.skipped_windows} complete windows"
        )
        return 0
    if args.command == "backfill-all":
        entities = load_registry(args.registry)
        result = backfill_registry(
            entities,
            args.start_date,
            args.end_date,
            args.output_dir,
            overwrite=args.overwrite,
            report=report_entity,
        )
        print(
            f"Processed {result.organisms} organisms: fetched {result.fetched_windows} windows "
            f"({result.record_count} records); skipped {result.skipped_windows} complete windows"
        )
        return 0
    if args.command == "refresh-history":
        entities = load_registry(args.registry)
        complete_history, refresh_window = rolling_history_windows(args.as_of, args.months)
        if complete_history is not None:
            historical_result = backfill_registry(
                entities,
                *complete_history,
                args.output_dir,
                report=report_entity,
            )
            print(
                f"Historical months: fetched {historical_result.fetched_windows} windows "
                f"({historical_result.record_count} records); skipped "
                f"{historical_result.skipped_windows} complete windows"
            )
        current_result = backfill_registry(
            entities,
            *refresh_window,
            args.output_dir,
            overwrite=True,
            report=report_entity,
        )
        print(
            f"Recent months: refreshed {current_result.fetched_windows} windows "
            f"({current_result.record_count} records)"
        )
        return 0
    if args.command == "build-site-data":
        entities = load_registry(args.registry)
        dashboard_path, explorer_manifest_path = build_site_data(
            args.input_dir,
            args.output_dir,
            entities,
            max_shard_bytes=args.max_shard_bytes,
            detail_months=args.detail_months,
            history_dir=args.history_dir,
        )
        print(f"Wrote dashboard data to {dashboard_path}")
        print(f"Wrote explorer manifest to {explorer_manifest_path}")
        return 0
    if args.command == "build-annual-package":
        entities = load_registry(args.registry)
        package_path, checksum_path = build_annual_package(
            args.input_dir, args.output_dir, entities, args.year
        )
        print(f"Wrote annual package to {package_path}")
        print(f"Wrote SHA-256 checksum to {checksum_path}")
        return 0
    if args.command == "build-annual-summary":
        entities = load_registry(args.registry)
        summary_path = build_annual_summary(
            args.input_dir, args.output, entities, args.year
        )
        print(f"Wrote annual analysis summary to {summary_path}")
        return 0
    if args.command == "prune-archived-history":
        result = prune_archived_windows(
            args.input_dir,
            args.history_dir,
            as_of=args.as_of,
            detail_months=args.months,
        )
        print(
            f"Removed {result.removed_windows} archived windows "
            f"({result.removed_records} records)"
        )
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
