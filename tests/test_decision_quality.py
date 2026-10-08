#!/usr/bin/env python3
"""Regression tests for the read-only decision data audit.

Run: python3 -m unittest discover -s tests -p 'test_decision_quality.py'
"""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "audit_decision_quality", ROOT / "scripts" / "audit_decision_quality.py"
)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def fixture(**overrides):
    row = {
        "slug": "sample-tool",
        "name": "Sample",
        "category": "crm",
        "description": "Example only",
        "pricing": "Free",
        "features": ["contact management"],
        "bestFor": ["small business"],
        "scores": {"price": 8},
        "sourceUrl": "https://example.com/",
        "lastVerified": "2026-10-01",
        "aiIntegration": None,
    }
    row.update(overrides)
    return row


class DecisionQualityAuditTests(unittest.TestCase):
    def inspect_rows(self, rows):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "tools.json"
            path.write_text(json.dumps(rows), encoding="utf-8")
            return audit.inspect(path)

    def test_catalog_is_inspectable_when_unverified(self):
        result = self.inspect_rows([fixture()])
        self.assertEqual(result["catalog_count"], 1)
        self.assertEqual(result["metrics"]["ai_integration_unverified"], 1)
        self.assertFalse(result["invalid_structure"])

    def test_duplicate_slugs_are_invalid(self):
        result = self.inspect_rows([fixture(), fixture()])
        self.assertTrue(result["invalid_structure"])
        self.assertTrue(any("Duplicate slugs" in issue for issue in result["issues"]))

    def test_generic_price_and_missing_evidence_are_reported(self):
        result = self.inspect_rows([fixture(pricing="Paid tiers vary")])
        self.assertEqual(result["metrics"]["generic_pricing"], 1)
        self.assertEqual(result["metrics"]["missing_decision_fields"], 1)

    def test_null_verification_date_does_not_crash(self):
        result = self.inspect_rows([fixture(lastVerified=None)])
        self.assertEqual(result["metrics"]["invalid_verification_date"], 1)

    def test_non_object_row_is_invalid(self):
        result = self.inspect_rows([fixture(), None])
        self.assertTrue(result["invalid_structure"])


if __name__ == "__main__":
    unittest.main()
