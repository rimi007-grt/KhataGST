from decimal import Decimal
from typing import Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

MICRO_OUTLIER_THRESHOLD = Decimal("1000000.00")  # 10 Lakhs single invoice for micro-business

def rule_r09_outliers(entry: EntryReviewed) -> Optional[RuleResult]:
    """
    R09: Negative or zero values, absurd outliers (INFO).
    Severity: INFO
    """
    taxable = Decimal(str(entry.taxable_value)) if entry.taxable_value is not None else None
    total = Decimal(str(entry.total)) if entry.total is not None else None

    if (taxable is not None and taxable <= Decimal("0.00")) or (total is not None and total <= Decimal("0.00")):
        return RuleResult(
            rule_id="R09",
            severity=RuleSeverity.INFO,
            message_key="R09_ZERO_OR_NEGATIVE"
        )

    if taxable is not None and taxable > MICRO_OUTLIER_THRESHOLD:
        return RuleResult(
            rule_id="R09",
            severity=RuleSeverity.INFO,
            message_key="R09_OUTLIER_AMOUNT",
            message_params={"amount": float(taxable)}
        )

    return None

