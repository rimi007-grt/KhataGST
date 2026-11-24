from decimal import Decimal
from typing import Any, List, Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

def rule_r04_rate_vs_hsn(
    entry: EntryReviewed,
    rate_table_rows: List[Any],
    emit_unverified_warning: bool = True
) -> Optional[RuleResult]:
    """
    R04: Rate vs HSN/category: compare against rate_table valid on invoice_date;
         WARNING if mismatch or if rate_table row is unverified.
    Severity: WARNING
    """
    if not entry.hsn_or_category or entry.tax_rate is None or not entry.invoice_date:
        return None

    hsn_clean = str(entry.hsn_or_category).strip()
    rate_val = Decimal(str(entry.tax_rate))
    inv_date = entry.invoice_date

    matching_row = None
    for row in rate_table_rows:
        row_hsn = row["hsn_or_category"] if isinstance(row, dict) else row.hsn_or_category
        # Match prefix or exact HSN
        if hsn_clean == row_hsn or hsn_clean.startswith(row_hsn) or row_hsn.startswith(hsn_clean):
            eff_from = row["effective_from"] if isinstance(row, dict) else row.effective_from
            eff_to = row.get("effective_to") if isinstance(row, dict) else row.effective_to
            if eff_from <= inv_date and (eff_to is None or inv_date <= eff_to):
                matching_row = row
                break

    if not matching_row:
        return RuleResult(
            rule_id="R04",
            severity=RuleSeverity.WARNING,
            message_key="R04_HSN_NOT_FOUND",
            message_params={"hsn": hsn_clean}
        )

    expected_rate = Decimal(str(matching_row["rate"] if isinstance(matching_row, dict) else matching_row.rate))
    verified = matching_row["verified"] if isinstance(matching_row, dict) else matching_row.verified

    if abs(rate_val - expected_rate) > Decimal("0.01"):
        return RuleResult(
            rule_id="R04",
            severity=RuleSeverity.WARNING,
            message_key="R04_RATE_MISMATCH",
            message_params={"actual": float(rate_val), "expected": float(expected_rate), "hsn": hsn_clean}
        )

    if not verified and emit_unverified_warning:
        return RuleResult(
            rule_id="R04",
            severity=RuleSeverity.WARNING,
            message_key="R04_UNVERIFIED_RATE",
            message_params={"actual": float(rate_val), "hsn": hsn_clean}
        )

    return None

