"""Parquet writing and the feed manifest.

Parquet files are written with snappy (the most widely supported codec in DuckDB-WASM), plain
dictionary encoding and no wall-clock metadata, so a re-run is byte-identical.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from common import OUT_REPORTS, sha256_file, ts_iso, write_json

S = pa.string()
I64 = pa.int64()
F64 = pa.float64()
B = pa.bool_()
D32 = pa.date32()
TS = pa.timestamp("us")


def arr(values, typ):
    """Build an arrow array; None / NaN become nulls for numeric types."""
    if isinstance(values, np.ndarray):
        if typ in (F64,) and values.dtype.kind == "f":
            return pa.array(values, type=typ, mask=np.isnan(values))
        return pa.array(values, type=typ)
    return pa.array(values, type=typ)


def table(cols: dict, schema: list[tuple[str, pa.DataType]]) -> pa.Table:
    arrays = []
    n = None
    for name, typ in schema:
        if name not in cols:
            raise KeyError(f"column {name} missing from builder (have {sorted(cols)})")
        a = arr(cols[name], typ)
        if n is None:
            n = len(a)
        elif len(a) != n:
            raise ValueError(f"column {name} has {len(a)} rows, expected {n}")
        arrays.append(a)
    extra = set(cols) - {n for n, _ in schema}
    if extra:
        raise KeyError(f"builder produced columns not in the schema: {sorted(extra)}")
    return pa.Table.from_arrays(arrays, schema=pa.schema(schema))


class FeedWriter:
    def __init__(self, root: Path = OUT_REPORTS):
        self.root = root
        self.files: dict[str, dict] = {}

    def write(self, name: str, tbl: pa.Table, *, manifest: bool = False, status: str = "published") -> None:
        path = self.root / f"{name}.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(tbl, path, compression="snappy", use_dictionary=True, data_page_version="1.0",
                       row_group_size=65536, write_statistics=True)
        conf = {}
        if "confidence" in tbl.column_names:
            conf = dict(Counter(tbl.column("confidence").to_pylist()))
            conf = {str(k): v for k, v in conf.items() if k is not None}
        self.files[name] = {
            "rows": tbl.num_rows, "status": status, "confidence_summary": conf, "manifest": manifest,
            "path": path, "bytes": path.stat().st_size,
        }

    def write_manifest(self, end: date) -> None:
        files = {}
        for name, f in sorted(self.files.items()):
            if not f["manifest"]:
                continue
            files[name] = {
                "rows": f["rows"], "status": f["status"], "confidence_summary": f["confidence_summary"],
                "sha256": sha256_file(f["path"]),
            }
        write_json(self.root / "_manifest.json", {
            "producer": "gtm-os demo build (synthetic data)",
            "as_of": ts_iso(date.fromordinal(end.toordinal() + 1), 6, 25),
            "files": files,
        })

    def total_bytes(self) -> int:
        return sum(f["bytes"] for f in self.files.values())
