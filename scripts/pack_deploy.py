#!/usr/bin/env python3
"""
Build the deploy tarball for GCE upload.

Uses gzip level 1 (fast; Vite dist is mostly already-compressed assets).
numpy aggregates file sizes for a quick pre-pack summary in CI logs.
"""
from __future__ import annotations

import argparse
import sys
import tarfile
from pathlib import Path

import numpy as np

COMPRESSLEVEL = int(__import__("os").environ.get("DEPLOY_PACK_GZIP_LEVEL", "1"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Create deploy.tar.gz from a directory")
    parser.add_argument("source", type=Path, help="Directory to pack (e.g. dist)")
    parser.add_argument("output", type=Path, help="Output .tar.gz path")
    args = parser.parse_args()

    src = args.source.resolve()
    if not src.is_dir():
        print(f"pack_deploy: source is not a directory: {src}", file=sys.stderr)
        return 1

    files = [p for p in src.rglob("*") if p.is_file()]
    if files:
        sizes = np.fromiter((p.stat().st_size for p in files), dtype=np.uint64, count=len(files))
        total_mb = float(sizes.sum()) / (1024 * 1024)
        print(f"pack_deploy: {len(files)} files, {total_mb:.2f} MiB (uncompressed)", file=sys.stderr)

    out = args.output.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    with tarfile.open(out, mode="w:gz", compresslevel=COMPRESSLEVEL) as tf:
        tf.add(src, arcname=".")

    out_mb = out.stat().st_size / (1024 * 1024)
    print(f"pack_deploy: wrote {out} ({out_mb:.2f} MiB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
