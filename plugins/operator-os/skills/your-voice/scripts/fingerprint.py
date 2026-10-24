#!/usr/bin/env python3
"""fingerprint.py: deterministic voice metrics for a corpus or a draft. No model call.

Usage:
  fingerprint.py --corpus DIR [--out baseline.json]       measure every .md/.txt file in DIR
  fingerprint.py --text FILE [--against baseline.json]    measure a draft; compare with a baseline
Exit codes: 0 ok (or within band), 1 draft outside the band on at least one metric, 2 usage or input error.
"""
import argparse
import json
import os
import re
import sys

BAND = 0.35  # a draft metric is "out" when it differs from the baseline by more than 35 percent (relative)
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
WORD = re.compile(r"[A-Za-z0-9'’-]+")
CONTRACTION = re.compile(r"\b\w+['’](?:s|t|re|ve|ll|d|m)\b", re.I)
FIRST_PERSON = re.compile(r"\bI\b")
BANLIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "hooks", "unslop-banlist.json")


class InputError(Exception):
    pass


def read_text(path):
    try:
        with open(path, encoding="utf8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError) as e:
        raise InputError(f"cannot read {path}: {e}") from e


def corpus_text(folder):
    if not os.path.isdir(folder):
        raise InputError(f"corpus folder {folder} does not exist")
    parts = []
    for root, _dirs, files in os.walk(folder):
        for name in sorted(files):
            if name.endswith((".md", ".txt")):
                parts.append(read_text(os.path.join(root, name)))
    if not parts:
        raise InputError(f"no .md or .txt files in {folder}; a fingerprint of nothing is not a baseline")
    return "\n\n".join(parts)


def metrics(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    sentences = [s for b in blocks for s in SENT_SPLIT.split(b) if s.strip()]
    lengths = [len(WORD.findall(s)) for s in sentences]
    words = sum(lengths)
    if not sentences or words == 0:
        raise InputError("no sentences found to measure")
    one_sentence_blocks = sum(1 for b in blocks if len(SENT_SPLIT.split(b)) == 1)
    per_k = 1000.0 / words
    return {
        "words": words,
        "sentences": len(sentences),
        "avg_sentence_words": round(words / len(sentences), 2),
        "pct_sentences_under_10_words": round(100.0 * sum(1 for n in lengths if n < 10) / len(sentences), 1),
        "pct_one_sentence_blocks": round(100.0 * one_sentence_blocks / len(blocks), 1),
        "first_person_per_1000": round(len(FIRST_PERSON.findall(text)) * per_k, 2),
        "contractions_per_1000": round(len(CONTRACTION.findall(text)) * per_k, 2),
        "em_dashes_per_1000": round((text.count("\u2014") + text.count("\u2013")) * per_k, 2),
    }


def banlist_hits(text):
    if not os.path.isfile(BANLIST):
        raise InputError(f"banlist missing at {BANLIST}; the plugin install is incomplete")
    with open(BANLIST, encoding="utf8") as f:
        patterns = json.load(f)["patterns"]
    hits = {}
    for name, spec in patterns.items():
        found = re.findall(spec["regex"], text, flags=re.I)
        if found:
            hits[name] = len(found)
    return hits


def compare(draft, base):
    out = []
    for key, base_value in base.items():
        if key in ("words", "sentences") or key not in draft:
            continue
        d = draft[key]
        if base_value == 0:
            out_of_band = d > 0 and key == "em_dashes_per_1000"
        else:
            out_of_band = abs(d - base_value) / abs(base_value) > BAND
        if out_of_band:
            out.append({"metric": key, "draft": d, "baseline": base_value})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus")
    ap.add_argument("--text")
    ap.add_argument("--against")
    ap.add_argument("--out")
    args = ap.parse_args()
    if bool(args.corpus) == bool(args.text):
        raise InputError("give exactly one of --corpus or --text")
    if args.corpus:
        result = metrics(corpus_text(args.corpus))
        print(json.dumps(result, indent=2))
        if args.out:
            with open(args.out, "w", encoding="utf8") as f:
                json.dump(result, f, indent=2)
        return 0
    text = read_text(args.text)
    result = {"metrics": metrics(text), "banlist_hits": banlist_hits(text)}
    verdict = "PASS" if not result["banlist_hits"] else "FAIL"
    if args.against:
        base = json.loads(read_text(args.against))
        result["out_of_band"] = compare(result["metrics"], base)
        if result["out_of_band"]:
            verdict = "FAIL"
    result["verdict"] = verdict
    print(json.dumps(result, indent=2))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InputError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)
