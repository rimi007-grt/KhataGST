from decimal import Decimal
from typing import Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

def rule_r02_tax_arithmetic(entry: EntryReviewed) -> Optional[RuleResult]:
    """
    R02: Tax arithmetic: cgst+sgst+igst == taxable_value * rate / 100 (tolerance Rs 1.00);
         total == taxable_value + taxes (tolerance Rs 1.00).
    Severity: BLOCKING
    """
    if entry.taxable_value is None:
        return None

    taxable = Decimal(str(entry.taxable_value))
    rate = Decimal(str(entry.tax_rate or 0))
    cgst = Decimal(str(entry.cgst or 0))
    sgst = Decimal(str(entry.sgst or 0))
    igst = Decimal(str(entry.igst or 0))
    total = Decimal(str(entry.total or 0))

    expected_tax = (taxable * rate) / Decimal("100")
    actual_tax = cgst + sgst + igst

    if abs(expected_tax - actual_tax) > Decimal("1.00"):
        return RuleResult(
            rule_id="R02",
            severity=RuleSeverity.BLOCKING,
            message_key="R02_TAX_MISMATCH",
            message_params={"expected": float(expected_tax), "actual": float(actual_tax)}
        )

    expected_total = taxable + actual_tax
    if entry.total is not None and abs(expected_total - total) > Decimal("1.00"):
        return RuleResult(
            rule_id="R02",
            severity=RuleSeverity.BLOCKING,
            message_key="R02_TOTAL_MISMATCH",
            message_params={"expected": float(expected_total), "actual": float(total)}
        )

    return None

