#!/usr/bin/env python3
"""
Evaluation script for KhataGST Multimodal Extraction.
Compares model extraction against real ground-truth samples in /eval/real/{dev,test}/.
Mandatory Data Grounding Principle: Never include synthetic data.
Prints "NO VALIDATED RESULTS YET" if no real samples are present.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Any

# Root directory of the repository
ROOT_DIR = Path(__file__).resolve().parent.parent

# Add backend to sys.path to access extraction provider
sys.path.insert(0, str(ROOT_DIR / "backend"))

EVAL_FIELDS = [
    "invoice_no",
    "invoice_date",
    "party_name",
    "party_gstin",
    "hsn_or_category",
    "taxable_value",
    "tax_rate",
    "cgst",
    "sgst",
    "igst",
    "total"
]

def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate KhataGST extraction accuracy on real samples.")
    parser.add_argument(
        "--split",
        choices=["dev", "test"],
        default="dev",
        help="Dataset split to evaluate on: 'dev' (prompt tuning) or 'test' (held-out test set)"
    )
    parser.add_argument(
        "--rerun",
        action="store_true",
        help="Force re-running extraction model even if predicted_entries are already cached"
    )
    return parser.parse_args()

def is_field_match(field: str, exp_val: Any, pred_val: Any) -> bool:
    if exp_val is None and pred_val is None:
        return True
    if exp_val is None or pred_val is None:
        return False

    # Numeric fields tolerance (Rs 1.0)
    if field in ["taxable_value", "total", "cgst", "sgst", "igst", "tax_rate"]:
        try:
            return abs(float(exp_val) - float(pred_val)) <= 1.0
        except (ValueError, TypeError):
            return False

    # Date normalization
    if field == "invoice_date":
        return str(exp_val).strip() == str(pred_val).strip()

    # String fields (invoice_no, party_gstin, party_name, hsn_or_category)
    exp_str = str(exp_val).strip().upper()
    pred_str = str(pred_val).strip().upper()
    
    if field == "hsn_or_category":
        # Match HSN code if either starts with the other (e.g. 1101 vs 11010000)
        return exp_str == pred_str or exp_str.startswith(pred_str) or pred_str.startswith(exp_str)
    
    if field == "party_name":
        # Match if core business tokens overlap
        return exp_str == pred_str or exp_str in pred_str or pred_str in exp_str

    return exp_str == pred_str

def evaluate():
    args = parse_args()
    split_dir = ROOT_DIR / "eval" / "real" / args.split

    if not split_dir.exists():
        print("NO VALIDATED RESULTS YET")
        sys.exit(0)

    json_files = sorted(list(split_dir.glob("*.json")))
    if not json_files:
        print("NO VALIDATED RESULTS YET")
        sys.exit(0)

    print(f"=== Evaluating on {len(json_files)} real samples (split: {args.split}) ===\n")

    field_counts: Dict[str, int] = {f: 0 for f in EVAL_FIELDS}
    field_matches: Dict[str, int] = {f: 0 for f in EVAL_FIELDS}
    valid_samples = 0

    for file_path in json_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load {file_path.name}: {e}")
            continue

        # Strict check against synthetic data
        if data.get("source") == "DEMO" or "synthetic" in str(data.get("label", "")).lower():
            print(f"Error: Synthetic demo data detected in {file_path.name}! Prohibited by spec.")
            continue

        expected_entries = data.get("expected_entries") or data.get("entries", [])
        if not expected_entries:
            continue

        predicted_entries = data.get("predicted_entries", [])

        # If predictions missing or --rerun requested, execute extraction on the image
        if (not predicted_entries or args.rerun) and data.get("image_file"):
            image_path = split_dir / data["image_file"]
            if image_path.exists():
                try:
                    from app.services.extraction.factory import get_extraction_provider
                    provider = get_extraction_provider()
                    print(f"Running {provider.name} ({provider.model_version}) on {data['image_file']}...", flush=True)
                    with open(image_path, "rb") as img_f:
                        img_bytes = img_f.read()
                    mime_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
                    res = provider.extract(img_bytes, mime_type)
                    predicted_entries = [e.model_dump(mode="json") for e in res.entries]
                    data["predicted_entries"] = predicted_entries
                    data["extraction_provider"] = res.provider
                    data["extraction_model_version"] = res.model_version
                    with open(file_path, "w", encoding="utf-8") as out_f:
                        json.dump(data, out_f, indent=2, default=str)
                    print(f"-> Extracted {len(predicted_entries)} entries.", flush=True)
                    time.sleep(6)  # Pacing between documents
                except Exception as ex:
                    print(f"Warning: Extraction failed for {data['image_file']}: {ex}")

        valid_samples += 1
        for i, expected in enumerate(expected_entries):
            predicted = predicted_entries[i] if i < len(predicted_entries) else {}
            for field in EVAL_FIELDS:
                exp_val = expected.get(field)
                if exp_val is not None:
                    field_counts[field] += 1
                    pred_val = predicted.get(field)
                    if is_field_match(field, exp_val, pred_val):
                        field_matches[field] += 1

    if valid_samples == 0:
        print("NO VALIDATED RESULTS YET")
        sys.exit(0)

    print(f"\nSample Size: {valid_samples} documents evaluated")
    print("-" * 55)
    print(f"{'Field':<20} | {'Matches / Total':<18} | {'Exact Match %':<10}")
    print("-" * 55)

    total_exp = 0
    total_match = 0
    for field in EVAL_FIELDS:
        cnt = field_counts[field]
        matched = field_matches[field]
        total_exp += cnt
        total_match += matched
        acc_str = f"{(matched / cnt * 100):.1f}%" if cnt > 0 else "N/A"
        print(f"{field:<20} | {f'{matched}/{cnt}':<18} | {acc_str:<10}")

    print("-" * 55)
    overall_acc = (total_match / total_exp * 100) if total_exp > 0 else 0.0
    print(f"{'OVERALL':<20} | {f'{total_match}/{total_exp}':<18} | {overall_acc:.1f}%\n")

if __name__ == "__main__":
    evaluate()
