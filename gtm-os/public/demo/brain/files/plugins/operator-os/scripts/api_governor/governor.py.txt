"""API rate and cost governor: one registry, one acquire() in front of every vendor call.

Stdlib only, Python 3.9+. Every failure path is loud: a missing or malformed registry raises, an
unregistered vendor is refused (enforce) or recorded as an incident (observe), unreadable state refuses
rather than guessing. There is no fail-open read inside acquire().

Why it exists: a vendor API has a documented limit and a bill. Without a single place that counts calls
across every process, one runaway loop spends the day's quota (or the month's budget) in minutes, and a
429 in one script is invisible to the next one. The governor gives each vendor a daily, hourly or
monthly budget (`ceiling`), a minimum spacing between calls, a per-run cap, and a cooldown that every
process honours after a 429.

Usage:
    import governor
    g = governor.Governor()                       # registry.json beside this file, state under .operator/
    ticket = g.acquire("example_vendor", lane="nightly-pull", run_id="run-123")   # raises Refused when over
    resp = call_the_vendor()
    if resp.status == 429:
        g.report_limit_hit("example_vendor", retry_after_s=int(resp.headers.get("Retry-After", 60)))

Modes (per vendor): "observe" counts and records but never refuses (use it for the baseline days);
"enforce" refuses. A vendor with no registry row is refused in enforce mode and recorded in observe mode.
"""
import fcntl
import json
import os
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
REFUSAL_REASONS = ("NO_ENTRY", "BUDGET_SPENT", "RUN_BUDGET_SPENT", "COOLDOWN_ARMED", "STATE_UNREADABLE")


class RegistryError(Exception):
    """The registry is missing, unreadable or malformed. Nothing is allowed until it is fixed."""


class Refused(Exception):
    def __init__(self, vendor, reason, detail):
        super().__init__(f"{vendor}: {reason}: {detail}")
        self.vendor = vendor
        self.reason = reason
        self.detail = detail


def validate_row(row):
    problems = []
    if row.get("mode") not in ("observe", "enforce"):
        problems.append("mode must be 'observe' or 'enforce'")
    if row.get("limit_window") not in ("daily", "hourly", "monthly"):
        problems.append("limit_window must be 'daily', 'hourly' or 'monthly'")
    if row.get("mode") == "enforce":
        if not isinstance(row.get("ceiling"), int) or row["ceiling"] < 1:
            problems.append("an enforced vendor needs an integer ceiling >= 1 (the ratified budget per window)")
        if not row.get("source_url") or not row.get("checked"):
            problems.append("an enforced vendor needs source_url and checked (where the limit is documented, and when you read it)")
    if "min_spacing_s" in row and (not isinstance(row["min_spacing_s"], (int, float)) or row["min_spacing_s"] < 0):
        problems.append("min_spacing_s must be a non-negative number")
    return problems


def load_registry(path):
    if not os.path.isfile(path):
        raise RegistryError(f"registry missing at {path}; copy registry.json and add your vendors")
    try:
        with open(path, encoding="utf8") as f:
            reg = json.load(f)
    except (OSError, ValueError) as e:
        raise RegistryError(f"registry at {path} is unreadable or not JSON: {e}") from e
    vendors = reg.get("vendors")
    if not isinstance(vendors, dict):
        raise RegistryError(f"registry at {path} has no 'vendors' object")
    for name, row in vendors.items():
        problems = validate_row(row)
        if problems:
            raise RegistryError(f"vendor {name!r} is invalid: {'; '.join(problems)}")
    return reg


class Governor:
    def __init__(self, registry_path=None, state_dir=None, clock=time.time, sleep=time.sleep):
        self.registry_path = registry_path or os.environ.get("OPERATOR_API_REGISTRY") or os.path.join(HERE, "registry.json")
        project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
        self.state_dir = state_dir or os.path.join(project, ".operator", "api_governor")
        self.clock = clock
        self.sleep = sleep
        self.registry = load_registry(self.registry_path)
        os.makedirs(self.state_dir, exist_ok=True)

    # ---- time windows -------------------------------------------------------------------------
    def _window_key(self, row):
        tz = ZoneInfo(row["reset_tz"]) if row.get("reset_tz") else timezone.utc
        now = datetime.fromtimestamp(self.clock(), tz)
        window = row["limit_window"]
        if window == "hourly":
            return now.strftime("%Y-%m-%dT%H")
        if window == "monthly":
            return now.strftime("%Y-%m")
        return now.strftime("%Y-%m-%d")

    # ---- state (one JSON file per vendor, flock-guarded) ---------------------------------------
    def _paths(self, vendor):
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in vendor)
        base = os.path.join(self.state_dir, safe)
        return base + ".counters.json", base + ".lock"

    def _locked(self, vendor):
        _, lock_path = self._paths(vendor)
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        deadline = time.time() + 10
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return fd
            except BlockingIOError as e:
                if time.time() > deadline:
                    os.close(fd)
                    raise Refused(vendor, "STATE_UNREADABLE", f"could not take the lock {lock_path} in 10 seconds") from e
                time.sleep(0.05)

    def _read(self, vendor):
        path, _ = self._paths(vendor)
        if not os.path.isfile(path):
            return {"window": None, "count": 0, "runs": {}, "last_call": 0.0, "cooldown_until": 0.0}
        try:
            with open(path, encoding="utf8") as f:
                return json.load(f)
        except (OSError, ValueError) as e:
            raise Refused(vendor, "STATE_UNREADABLE", f"counters at {path} are unreadable: {e}") from e

    def _write(self, vendor, state):
        path, _ = self._paths(vendor)
        tmp = f"{path}.tmp.{os.getpid()}"
        with open(tmp, "w", encoding="utf8") as f:
            json.dump(state, f)
        os.replace(tmp, path)

    def _incident(self, vendor, kind, detail):
        row = {"ts": datetime.fromtimestamp(self.clock(), timezone.utc).isoformat(), "vendor": vendor, "kind": kind, "detail": detail}
        with open(os.path.join(self.state_dir, "incidents.jsonl"), "a", encoding="utf8") as f:
            f.write(json.dumps(row) + "\n")

    # ---- the one call ---------------------------------------------------------------------------
    def acquire(self, vendor, lane="default", run_id=None, cost=1):
        """Reserve `cost` calls. Returns a ticket dict, waits out spacing, or raises Refused."""
        row = self.registry["vendors"].get(vendor)
        if row is None:
            self._incident(vendor, "NO_ENTRY", f"lane {lane!r} called an unregistered vendor")
            if self.registry.get("default_mode", "enforce") == "enforce":
                raise Refused(vendor, "NO_ENTRY", "no registry row; add the vendor with its documented limit before calling it")
            return {"vendor": vendor, "lane": lane, "observed_only": True}
        enforce = row["mode"] == "enforce"
        fd = self._locked(vendor)
        try:
            state = self._read(vendor)
            now = self.clock()
            window = self._window_key(row)
            if state["window"] != window:
                state.update(window=window, count=0, runs={})
            if now < state.get("cooldown_until", 0):
                self._refuse_or_observe(vendor, enforce, "COOLDOWN_ARMED", f"a limit hit armed a cooldown for {int(state['cooldown_until'] - now)}s more")
            if state["count"] + cost > row.get("ceiling", float("inf")):
                self._refuse_or_observe(vendor, enforce, "BUDGET_SPENT", f"{state['count']} of {row['ceiling']} used this {row['limit_window']} window")
            if run_id and row.get("max_per_run") and state["runs"].get(run_id, 0) + cost > row["max_per_run"]:
                self._refuse_or_observe(vendor, enforce, "RUN_BUDGET_SPENT", f"run {run_id!r} reached max_per_run {row['max_per_run']}")
            wait = state.get("last_call", 0) + row.get("min_spacing_s", 0) - now
            if wait > 0:
                self.sleep(min(wait, 30))
            state["count"] += cost
            if run_id:
                state["runs"][run_id] = state["runs"].get(run_id, 0) + cost
            state["last_call"] = self.clock()
            self._write(vendor, state)
            return {"vendor": vendor, "lane": lane, "window": window, "used": state["count"], "ceiling": row.get("ceiling")}
        finally:
            os.close(fd)

    def _refuse_or_observe(self, vendor, enforce, reason, detail):
        self._incident(vendor, reason, detail + ("" if enforce else " (observe mode: allowed)"))
        if enforce:
            raise Refused(vendor, reason, detail)

    def report_limit_hit(self, vendor, retry_after_s=60):
        """Call after a 429 or quota error: every process refuses this vendor until the cooldown ends."""
        if vendor not in self.registry["vendors"]:
            raise Refused(vendor, "NO_ENTRY", "cannot arm a cooldown for an unregistered vendor")
        fd = self._locked(vendor)
        try:
            state = self._read(vendor)
            state["cooldown_until"] = max(state.get("cooldown_until", 0), self.clock() + max(1, int(retry_after_s)))
            self._write(vendor, state)
            self._incident(vendor, "LIMIT_HIT", f"cooldown armed for {int(retry_after_s)}s")
        finally:
            os.close(fd)

    def status(self):
        out = {}
        for vendor, row in self.registry["vendors"].items():
            state = self._read(vendor)
            out[vendor] = {"mode": row["mode"], "window": state["window"], "used": state["count"], "ceiling": row.get("ceiling")}
        return out


if __name__ == "__main__":
    import sys
    try:
        print(json.dumps(Governor().status(), indent=2))
    except (RegistryError, Refused) as e:
        print(f"api_governor: {e}", file=sys.stderr)
        sys.exit(2)
