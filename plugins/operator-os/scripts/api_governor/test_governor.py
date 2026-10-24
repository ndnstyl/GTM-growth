"""Run: python3 -m unittest -v test_governor   (from this folder)"""
import json
import os
import tempfile
import unittest

import governor


class FakeClock:
    def __init__(self, t=1_800_000_000.0):
        self.t = t

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


def make(vendors, default_mode="enforce"):
    d = tempfile.mkdtemp()
    reg = os.path.join(d, "registry.json")
    with open(reg, "w", encoding="utf8") as f:
        json.dump({"version": 1, "default_mode": default_mode, "vendors": vendors}, f)
    clock = FakeClock()
    return governor.Governor(registry_path=reg, state_dir=os.path.join(d, "state"), clock=clock, sleep=clock.sleep), clock


ROW = {"mode": "enforce", "limit_window": "daily", "ceiling": 3, "source_url": "https://example.com/limits", "checked": "2026-01-01"}


class GovernorTests(unittest.TestCase):
    def test_empty_registry_refuses_unregistered_vendor(self):
        g, _ = make({})
        with self.assertRaises(governor.Refused) as cm:
            g.acquire("anything")
        self.assertEqual(cm.exception.reason, "NO_ENTRY")

    def test_budget_is_enforced_then_refused(self):
        g, _ = make({"v": ROW})
        for _ in range(3):
            g.acquire("v")
        with self.assertRaises(governor.Refused) as cm:
            g.acquire("v")
        self.assertEqual(cm.exception.reason, "BUDGET_SPENT")

    def test_window_rolls_over(self):
        g, clock = make({"v": ROW})
        for _ in range(3):
            g.acquire("v")
        clock.t += 86400
        self.assertEqual(g.acquire("v")["used"], 1)

    def test_observe_never_refuses_but_records(self):
        g, _ = make({"v": dict(ROW, mode="observe")})
        for _ in range(5):
            g.acquire("v")
        with open(os.path.join(g.state_dir, "incidents.jsonl"), encoding="utf8") as f:
            self.assertEqual(sum(1 for _ in f), 2)

    def test_cooldown_after_limit_hit(self):
        g, clock = make({"v": ROW})
        g.report_limit_hit("v", retry_after_s=60)
        with self.assertRaises(governor.Refused) as cm:
            g.acquire("v")
        self.assertEqual(cm.exception.reason, "COOLDOWN_ARMED")
        clock.t += 61
        g.acquire("v")

    def test_per_run_cap(self):
        g, _ = make({"v": dict(ROW, max_per_run=1)})
        g.acquire("v", run_id="r1")
        with self.assertRaises(governor.Refused) as cm:
            g.acquire("v", run_id="r1")
        self.assertEqual(cm.exception.reason, "RUN_BUDGET_SPENT")
        g.acquire("v", run_id="r2")

    def test_spacing_waits(self):
        g, clock = make({"v": dict(ROW, min_spacing_s=5)})
        g.acquire("v")
        before = clock.t
        g.acquire("v")
        self.assertGreaterEqual(clock.t - before, 5)

    def test_enforce_needs_a_documented_source(self):
        with self.assertRaises(governor.RegistryError):
            make({"v": {"mode": "enforce", "limit_window": "daily", "ceiling": 5}})

    def test_corrupt_state_refuses(self):
        g, _ = make({"v": ROW})
        g.acquire("v")
        with open(g._paths("v")[0], "w", encoding="utf8") as f:
            f.write("{not json")
        with self.assertRaises(governor.Refused) as cm:
            g.acquire("v")
        self.assertEqual(cm.exception.reason, "STATE_UNREADABLE")

    def test_missing_registry_is_a_named_error(self):
        with self.assertRaises(governor.RegistryError):
            governor.Governor(registry_path="/nonexistent/registry.json", state_dir=tempfile.mkdtemp())


if __name__ == "__main__":
    unittest.main()
