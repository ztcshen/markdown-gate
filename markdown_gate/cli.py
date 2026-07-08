from __future__ import annotations

import argparse
from pathlib import Path
import sys

from .classifier import classify_document
from .config import GateConfig, load_config
from .install import install_codex_hooks, install_global_codex_hooks
from .model import Document, ScanResult, Severity
from .report import render_json, render_text
from .scanner import scan_documents
from .waiver import apply_waivers


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "check":
            return run_check(args)
        if args.command == "classify":
            return run_classify(args)
        if args.command == "install-codex-hooks":
            return run_install_codex_hooks(args)
    except Exception as exc:  # noqa: BLE001 - CLI should return clean failures.
        print(f"markdown-gate: {exc}", file=sys.stderr)
        return 2

    parser.print_help()
    return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="markdown-gate",
        description="Check Markdown final-state hygiene before publication.",
    )
    subparsers = parser.add_subparsers(dest="command")

    check = subparsers.add_parser("check", help="scan Markdown files or stdin")
    add_common_args(check)
    check.add_argument("paths", nargs="*", help="Markdown files or directories")
    check.add_argument("--stdin", action="store_true", help="read one document from stdin")
    check.add_argument("--stdin-path", default="<stdin>", help="path label for stdin")
    check.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="output format",
    )
    check.add_argument(
        "--fail-on",
        default=None,
        help="minimum severity that fails the gate: error, warning, suggestion, never",
    )
    check.add_argument("--waiver-file", help="JSON waiver file")

    classify = subparsers.add_parser("classify", help="show detected document types")
    add_common_args(classify)
    classify.add_argument("paths", nargs="*", help="Markdown files or directories")
    classify.add_argument("--stdin", action="store_true", help="read one document from stdin")
    classify.add_argument("--stdin-path", default="<stdin>", help="path label for stdin")
    classify.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="output format",
    )

    install = subparsers.add_parser(
        "install-codex-hooks",
        help="write Codex hooks config for this repository or globally",
    )
    install.add_argument("--repo-root", default=".", help="repository root")
    install.add_argument(
        "--global",
        dest="global_install",
        action="store_true",
        help="write ~/.codex/hooks.json with absolute markdown-gate script paths",
    )
    install.add_argument(
        "--codex-home",
        default="~/.codex",
        help="Codex home for --global installs",
    )
    install.add_argument("--force", action="store_true", help="replace an existing file")

    return parser


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="optional TOML config")
    parser.add_argument("--type", dest="doc_type", help="explicit document type")


def run_check(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    fail_on = Severity.parse(args.fail_on) if args.fail_on else config.fail_on
    documents = load_documents(args, config)
    findings = scan_documents(documents, config)
    findings = apply_waivers(findings, args.waiver_file)
    result = ScanResult(documents=documents, findings=findings, fail_on=fail_on)

    output = render_json(result) if args.format == "json" else render_text(result)
    print(output)
    return 1 if result.failed else 0


def run_classify(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    documents = load_documents(args, config)
    if args.format == "json":
        import json

        print(
            json.dumps(
                [
                    {
                        "path": document.path,
                        "doc_type": document.doc_type,
                        "metadata": document.metadata,
                    }
                    for document in documents
                ],
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        for document in documents:
            print(f"{document.path}\t{document.doc_type}")
    return 0


def run_install_codex_hooks(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    if args.global_install:
        target = install_global_codex_hooks(
            Path(args.codex_home).expanduser(),
            source_root=repo_root,
            force=args.force,
        )
    else:
        target = install_codex_hooks(repo_root, force=args.force)
    print(f"installed Codex hooks: {target}")
    return 0


def load_documents(args: argparse.Namespace, config: GateConfig) -> list[Document]:
    documents: list[Document] = []

    if args.stdin:
        text = sys.stdin.read()
        doc_type, metadata, body = classify_document(
            args.stdin_path,
            text,
            config,
            explicit_type=args.doc_type,
        )
        documents.append(
            Document(path=args.stdin_path, text=body, doc_type=doc_type, metadata=metadata)
        )

    for path in expand_paths(args.paths):
        text = path.read_text(encoding="utf-8")
        doc_type, metadata, body = classify_document(
            str(path),
            text,
            config,
            explicit_type=args.doc_type,
        )
        documents.append(
            Document(path=str(path), text=body, doc_type=doc_type, metadata=metadata)
        )

    if not documents:
        raise ValueError("provide at least one Markdown path or --stdin")

    return documents


def expand_paths(values: list[str]) -> list[Path]:
    paths: list[Path] = []
    for value in values:
        path = Path(value)
        if path.is_dir():
            paths.extend(sorted(path.rglob("*.md")))
        elif path.suffix.lower() in {".md", ".markdown"}:
            paths.append(path)
        else:
            raise ValueError(f"not a Markdown file or directory: {value}")
    return paths


if __name__ == "__main__":
    raise SystemExit(main())
