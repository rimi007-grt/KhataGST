from typing import Optional
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.user import SchemeEnum
from app.rules import RuleResult, RuleSeverity

def rule_r07_mandatory_fields(
    entry: EntryReviewed,
    user_scheme: Optional[SchemeEnum] = None,
    is_b2b: Optional[bool] = None
) -> Optional[RuleResult]:
    """
    R07: Missing mandatory fields for scheme (e.g. party GSTIN missing on B2B sales, invoice_no, date).
    Severity: WARNING
    """
    # Determine if B2B: explicitly flagged, or has party_gstin, or high-value sales (> 50k)
    b2b = is_b2b
    if b2b is None:
        b2b = bool(entry.party_gstin)

    if b2b:
        if not entry.party_gstin:
            return RuleResult(
                rule_id="R07",
                severity=RuleSeverity.WARNING,
                message_key="R07_MISSING_GSTIN"
            )

    if not entry.invoice_no:
        return RuleResult(
            rule_id="R07",
            severity=RuleSeverity.WARNING,
            message_key="R07_MISSING_INVOICE_NO"
        )

    if not entry.invoice_date:
        return RuleResult(
            rule_id="R07",
            severity=RuleSeverity.WARNING,
            message_key="R07_MISSING_DATE"
        )

    return None

