"""Command line entry point. Run from the backend folder:

    python -m app.cli init-db
    python -m app.cli run <path-to-raw-log> [--max-lines N] [--name NAME]
    python -m app.cli import-artifacts [--dir DIR] [--name NAME]
"""
import argparse
from itertools import islice
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import models
from app.db.models import SourceKind
from app.db.session import init_db, new_session
from app.services import runs as run_service


def _head_copy(source: Path, max_lines: int) -> Path:
    """Copy the first ``max_lines`` lines into the uploads folder (for a quick trial run)."""
    uploads = get_settings().uploads_dir
    uploads.mkdir(parents=True, exist_ok=True)
    destination = uploads / f"{uuid4().hex}_head{max_lines}_{source.name}"
    with open(source, "rb") as src, open(destination, "wb") as dst:
        dst.writelines(islice(src, max_lines))
    return destination


def _execute(name: str, kind: SourceKind, path: Path) -> int:
    with new_session() as session:
        run = run_service.create_run(session, name, kind, path)
    run_service.execute_run(run.id)
    with new_session() as session:
        run = session.get(models.PipelineRun, run.id)
        if run.status != models.RunStatus.COMPLETED.value:
            print(f"Run {run.id} failed: {run.error}")
            return 1
        print(f"Run {run.id} completed: {run.total_rows:,} rows, {run.n_templates:,} templates, "
              f"{run.n_anomalies:,} anomalies, {run.n_incidents:,} incidents")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("init-db", help="create the database tables")

    run = commands.add_parser("run", help="run the full pipeline on a raw log file")
    run.add_argument("path", type=Path)
    run.add_argument("--max-lines", type=int, help="only process the first N lines of the file")
    run.add_argument("--name")

    imp = commands.add_parser("import-artifacts", help="load precomputed experiment outputs")
    imp.add_argument("--dir", type=Path, help="defaults to the configured artifacts_dir")
    imp.add_argument("--name")

    args = parser.parse_args()
    configure_logging()
    init_db()

    if args.command == "init-db":
        print(f"Database ready at {get_settings().database_url}")
        return 0
    if args.command == "run":
        path = args.path.resolve()
        if not path.is_file():
            parser.error(f"file not found: {path}")
        kind = SourceKind.FILE
        if args.max_lines:
            path, kind = _head_copy(path, args.max_lines), SourceKind.UPLOAD
        return _execute(args.name or path.name, kind, path)

    directory = (args.dir or get_settings().artifacts_dir).resolve()
    if not directory.is_dir():
        parser.error(f"directory not found: {directory}")
    return _execute(args.name or directory.name, SourceKind.ARTIFACTS, directory)


if __name__ == "__main__":
    raise SystemExit(main())
