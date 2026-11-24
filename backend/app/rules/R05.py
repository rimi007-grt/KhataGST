from decimal import Decimal
from typing import List, Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

def rule_r05_duplicate(current_entry: EntryReviewed, existing_entries: List[EntryReviewed]) -> Optional[RuleResult]:
    """
    R05: Duplicate: same party_gstin + invoice_no (or same date + party + total) already exists.
    Severity: BLOCKING
    """
    cur_id = current_entry.id
    cur_gstin = (current_entry.party_gstin or "").strip().upper()
    cur_inv_no = (current_entry.invoice_no or "").strip().upper()
    cur_party_name = (current_entry.party_name or "").strip().upper()
    cur_date = current_entry.invoice_date
    cur_total = Decimal(str(current_entry.total or 0))

    for e in existing_entries:
        if cur_id is not None and e.id == cur_id:
            continue

        e_gstin = (e.party_gstin or "").strip().upper()
        e_inv_no = (e.invoice_no or "").strip().upper()

        # Primary check: party_gstin + invoice_no
        if cur_gstin and cur_inv_no and e_gstin == cur_gstin and e_inv_no == cur_inv_no:
            return RuleResult(
                rule_id="R05",
                severity=RuleSeverity.BLOCKING,
                message_key="R05_DUPLICATE_INVOICE_NO",
                message_params={"invoice_no": current_entry.invoice_no, "party_gstin": current_entry.party_gstin}
            )

        # Secondary check: date + party_name + total
        e_party_name = (e.party_name or "").strip().upper()
        e_total = Decimal(str(e.total or 0))
        if cur_date and e.invoice_date and cur_date == e.invoice_date:
            if cur_party_name and e_party_name and cur_party_name == e_party_name:
                if abs(cur_total - e_total) < Decimal("0.01"):
                    return RuleResult(
                        rule_id="R05",
                        severity=RuleSeverity.BLOCKING,
                        message_key="R05_DUPLICATE_TRANSACTION",
                        message_params={
                            "party_name": current_entry.party_name,
                            "invoice_date": str(cur_date),
                            "total": float(cur_total)
                        }
                    )

    return None

