#!/usr/bin/env python3
"""Read-only ToolScout decision data quality audit.

Usage: python3 scripts/audit_decision_quality.py
       python3 scripts/audit_decision_quality.py --json
Exits 0 for an inspectable dataset; 1 for invalid structure or duplicate slugs.
No network, ranking changes, or production writes.
"""
import argparse
import collections
import json
import pathlib
import re
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "tools.json"
GENERIC_PRICE = re.compile(r"vary|verify|contact|custom|upon request|pricing on request", re.I)
CORE = ("slug", "name", "category", "description", "pricing", "features", "bestFor", "scores")
FIELDS_FOR_DECISION = ("pricingDetails", "integrations", "limitations", "strengths", "tradeoffs", "evidence")


def inspect(path=DATA):
    tools = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(tools, list):
        raise ValueError("Catalog must be a JSON array")
    slugs = collections.Counter(t.get("slug") for t in tools if isinstance(t, dict) and t.get("slug"))
    issues = []
    categories = collections.Counter()
    counters = collections.Counter()
    missing_field_counts = collections.Counter()
    rows = []
    today = date.today()
    for index, tool in enumerate(tools):
        if not isinstance(tool, dict):
            issues.append(f"Row {index}: not an object")
            continue
        slug = tool.get("slug") or f"row-{index}"
        categories[str(tool.get("category", "unknown"))] += 1
        review = tool.get("editorialReview") or {}
        if not review.get("summary"):
            counters["missing_editorial_reviews"] += 1
        elif review.get("verificationStatus") == "catalog_only":
            counters["catalog_only_editorial_reviews"] += 1
        elif review.get("sourceUrl") and review.get("handsOnTested") is not True:
            counters["sourced_editorial_reviews"] += 1
        else:
            counters["editorial_review_provenance_incomplete"] += 1
        if tool.get("categoryReviewRequired") is True:
            counters["category_review_required"] += 1
        missing_core = [k for k in CORE if not tool.get(k)]
        missing_decision = [k for k in FIELDS_FOR_DECISION if not tool.get(k)]
        missing_field_counts.update(missing_decision)
        if missing_core:
            issues.append(f"{slug}: missing core fields: {', '.join(missing_core)}")
        if missing_decision:
            counters["missing_decision_fields"] += 1
        if GENERIC_PRICE.search(str(tool.get("pricing", ""))):
            counters["generic_pricing"] += 1
        if (tool.get("aiIntegration") or {}).get("status") != "verified":
            counters["ai_integration_unverified"] += 1
        if tool.get("freePlanKnown") is not True:
            counters["free_plan_status_unverified"] += 1
        pairs = tool.get("integrations") or []
        if not isinstance(pairs, list):
            counters["invalid_integration_evidence"] += 1
        else:
            for pair in pairs:
                if not isinstance(pair, dict):
                    counters["invalid_integration_evidence"] += 1
                    continue
                if pair.get("status") == "verified":
                    source = str(pair.get("sourceUrl") or pair.get("source_url") or "")
                    verified_at = pair.get("verifiedAt") or pair.get("verified_at")
                    name = pair.get("product") or pair.get("tool") or pair.get("name")
                    try:
                        date.fromisoformat(verified_at)
                        valid_date = True
                    except (TypeError, ValueError):
                        valid_date = False
                    if not name or not source.startswith("https://") or not valid_date:
                        counters["invalid_integration_evidence"] += 1
                    else:
                        counters["verified_integration_pairs"] += 1
        if not tool.get("affiliateUrl"):
            counters["no_explicit_affiliate_url"] += 1
        if not tool.get("sourceUrl"):
            counters["missing_primary_source"] += 1
        age = None
        try:
            age = (today - date.fromisoformat(tool["lastVerified"])).days
            if age < 0:
                counters["future_verification_date"] += 1
            if age > 90:
                counters["verification_older_than_90_days"] += 1
        except (KeyError, TypeError, ValueError):
            counters["invalid_verification_date"] += 1
        rows.append({
            "slug": slug,
            "missing_core": missing_core,
            "missing_decision_fields": missing_decision,
            "verification_age_days": age,
            "ai_verified": (tool.get("aiIntegration") or {}).get("status") == "verified",
            "generic_pricing": bool(GENERIC_PRICE.search(str(tool.get("pricing", "")))),
        })
    duplicates = sorted(str(k) for k, n in slugs.items() if n > 1)
    if duplicates:
        issues.append("Duplicate slugs: " + ", ".join(duplicates))
    return {
        "catalog_count": len(tools),
        "categories": dict(sorted(categories.items())),
        "metrics": dict(sorted(counters.items())),
        "missing_field_counts": dict(sorted(missing_field_counts.items())),
        "invalid_structure": bool(duplicates) or any(not isinstance(t, dict) for t in tools),
        "issues": issues,
        "tools": rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Print machine-readable findings")
    args = parser.parse_args()
    try:
        report = inspect()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Catalog audit failed: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(f"ToolScout catalog: {report['catalog_count']} tools, {len(report['categories'])} categories")
        for key, count in report["metrics"].items():
            print(f"  {key}: {count}")
        for issue in report["issues"][:30]:
            print("  ISSUE:", issue)
        if len(report["issues"]) > 30:
            print(f"  ... {len(report['issues']) - 30} additional issues")
    return 1 if report["invalid_structure"] else 0


if __name__ == "__main__":
    sys.exit(main())
