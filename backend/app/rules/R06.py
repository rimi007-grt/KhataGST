import datetime
from typing import Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

def rule_r06_date(
    entry: EntryReviewed,
    period: Optional[str] = None,
    current_date: Optional[datetime.date] = None
) -> Optional[RuleResult]:
    """
    R06: Date: invalid, future date, or outside the selected return period.
    Severity: BLOCKING
    """
    if not entry.invoice_date:
        return None

    today = current_date or datetime.date.today()
    if entry.invoice_date > today:
        return RuleResult(
            rule_id="R06",
            severity=RuleSeverity.BLOCKING,
            message_key="R06_FUTURE_DATE",
            message_params={"invoice_date": str(entry.invoice_date), "current_date": str(today)}
        )

    if period:
        # Expected format YYYY-MM
        try:
            year, month = map(int, period.split("-"))
            if entry.invoice_date.year != year or entry.invoice_date.month != month:
                return RuleResult(
                    rule_id="R06",
                    severity=RuleSeverity.BLOCKING,
                    message_key="R06_OUTSIDE_PERIOD",
                    message_params={"invoice_date": str(entry.invoice_date), "period": period}
                )
        except ValueError:
            pass

    return None

