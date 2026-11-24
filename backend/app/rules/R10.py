from decimal import Decimal
from typing import Optional
from app.rules import RuleResult, RuleSeverity

def rule_r10_turnover_limit(
    cumulative_sales: Decimal,
    scheme_limit: Decimal,
    scheme_name: str = "COMPOSITION"
) -> Optional[RuleResult]:
    """
    R10: Turnover vs scheme limit: warn when cumulative turnover nears the scheme limit
         (default warning threshold is >= 90% of scheme limit).
    Severity: WARNING
    """
    if scheme_limit <= Decimal("0.00"):
        return None

    ratio = cumulative_sales / scheme_limit
    if ratio >= Decimal("0.90"):
        pct = round(float(ratio * 100), 1)
        return RuleResult(
            rule_id="R10",
            severity=RuleSeverity.WARNING,
            message_key="R10_NEARING_LIMIT",
            message_params={
                "turnover": float(cumulative_sales),
                "limit": float(scheme_limit),
                "pct": pct,
                "scheme": scheme_name
            }
        )

    return None

