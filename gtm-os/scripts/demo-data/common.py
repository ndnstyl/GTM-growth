"""Shared helpers for the GTM OS demo-data generator.

Everything here is pure and deterministic: no wall clock, no global random state.
Randomness comes only from `stream(seed, name)`, so the same (seed, end date) always
writes byte-identical files.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np

APP = Path(__file__).resolve().parents[2]  # .../gtm-os/app
PUBLIC = APP / "public"
OUT_DATA = PUBLIC / "data"
OUT_REPORTS = OUT_DATA / "reports"
OUT_VIEWS = PUBLIC / "data-views"
OUT_DEMO = PUBLIC / "demo"

COMPANY_NAME = "Northbeam Home Services"


def stream(seed: int, name: str) -> np.random.Generator:
    """An independent random stream per feed, so adding a feed never shifts another."""
    h = int.from_bytes(hashlib.sha256(f"{seed}:{name}".encode()).digest()[:8], "big")
    return np.random.default_rng(h)


def daterange(start: date, end: date) -> list[date]:
    n = (end - start).days + 1
    return [start + timedelta(days=i) for i in range(n)]


def iso(d: date) -> str:
    return d.isoformat()


def ts(d: date, hh: int = 6, mm: int = 30) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, 0)


def ts_iso(d: date, hh: int = 6, mm: int = 30) -> str:
    return ts(d, hh, mm).isoformat(timespec="seconds")


def split_int(total: int, weights) -> np.ndarray:
    """Split an integer into integer parts proportional to weights; parts sum to total exactly
    (largest remainder). Used so child rows always sum to their parent, to the cent."""
    w = np.asarray(weights, dtype=float)
    if total <= 0 or w.sum() <= 0:
        return np.zeros(len(w), dtype=np.int64)
    exact = total * w / w.sum()
    base = np.floor(exact).astype(np.int64)
    rem = int(total - base.sum())
    if rem > 0:
        order = np.argsort(-(exact - base), kind="stable")
        base[order[:rem]] += 1
    return base


def split_int_matrix(totals: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Row-wise split_int: totals shape (n,), weights shape (n, k) -> (n, k) ints summing to totals."""
    w = np.asarray(weights, dtype=float)
    ws = w.sum(axis=1, keepdims=True)
    ws[ws == 0] = 1.0
    exact = totals[:, None] * w / ws
    base = np.floor(exact).astype(np.int64)
    rem = (totals - base.sum(axis=1)).astype(np.int64)
    frac = exact - base
    order = np.argsort(-frac, axis=1, kind="stable")
    k = w.shape[1]
    rank = np.empty_like(order)
    rows = np.arange(len(totals))[:, None]
    rank[rows, order] = np.arange(k)[None, :]
    base += (rank < rem[:, None]).astype(np.int64)
    return base


def write_json(path: Path, obj, *, indent: int | None = 1) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, indent=indent, ensure_ascii=False, sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")
    return len(text) + 1


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.year * 12 + (d.month - 1) + n, 12)
    return date(y, m + 1, 1)


def need_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def clean_dir_files(p: Path, suffixes: tuple[str, ...]) -> int:
    """Remove previously generated files of the given suffixes under p (recursive). Returns count."""
    n = 0
    if not p.exists():
        return 0
    for f in sorted(p.rglob("*")):
        if f.is_file() and f.suffix in suffixes:
            f.unlink()
            n += 1
    return n


def env_flag(name: str) -> bool:
    return os.environ.get(name, "") not in ("", "0", "false")
