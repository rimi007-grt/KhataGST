from decimal import Decimal
from typing import Optional
from app.models.entry_reviewed import EntryReviewed
from app.models.user import SchemeEnum
from app.rules import RuleResult, RuleSeverity

def rule_r08_composition_scheme(
    entry: EntryReviewed,
    user_scheme: Optional[SchemeEnum],
    business_state: Optional[str]
) -> Optional[RuleResult]:
    """
    R08: COMPOSITION scheme: flag any entry charging separate tax (composition dealers
         do not charge tax on invoices) and flag inter-state outward supplies.
    Severity: WARNING
    """
    if user_scheme != SchemeEnum.COMPOSITION:
        return None

    cgst = Decimal(str(entry.cgst or 0))
    sgst = Decimal(str(entry.sgst or 0))
    igst = Decimal(str(entry.igst or 0))

    # 1. Composition dealers cannot charge separate tax on invoices
    if cgst > Decimal("0.00") or sgst > Decimal("0.00") or igst > Decimal("0.00"):
        return RuleResult(
            rule_id="R08",
            severity=RuleSeverity.WARNING,
            message_key="R08_SEPARATE_TAX"
        )

    # 2. Composition dealers cannot make inter-state outward supplies
    if entry.party_gstin and len(entry.party_gstin) >= 2 and business_state:
        party_state = entry.party_gstin[:2]
        if party_state != business_state:
            return RuleResult(
                rule_id="R08",
                severity=RuleSeverity.WARNING,
                message_key="R08_INTER_STATE"
            )

    return None

