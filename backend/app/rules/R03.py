from decimal import Decimal
from typing import Optional
from app.models.entry_reviewed import EntryReviewed
from app.rules import RuleResult, RuleSeverity

STATE_CODE_TO_NAME = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman & Diu",
    "26": "Dadra & Nagar Haveli",
    "27": "Maharashtra",
    "28": "Andhra Pradesh",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

def get_state_name(code: str) -> str:
    clean = str(code).strip().zfill(2)
    return STATE_CODE_TO_NAME.get(clean, code)

def rule_r03_place_of_supply(entry: EntryReviewed, business_state: Optional[str]) -> Optional[RuleResult]:
    """
    R03: Intra-state vs Inter-state supply check:
         If party state == business state: CGST + SGST only (IGST must be 0).
         If party state != business state: IGST only (CGST & SGST must be 0).
    Uses full state names (e.g. Uttar Pradesh, Maharashtra) instead of numeric codes.
    Severity: BLOCKING
    """
    if not business_state or not entry.party_gstin or len(entry.party_gstin) < 2:
        return None

    party_code = entry.party_gstin[:2]
    business_code = str(business_state).strip().zfill(2)
    party_state_name = get_state_name(party_code)
    business_state_name = get_state_name(business_code)

    cgst = Decimal(str(entry.cgst or 0))
    sgst = Decimal(str(entry.sgst or 0))
    igst = Decimal(str(entry.igst or 0))

    if party_code == business_code:
        # Intra-state: cannot charge IGST
        if igst > Decimal("0.00"):
            return RuleResult(
                rule_id="R03",
                severity=RuleSeverity.BLOCKING,
                message_key="R03_INTRA_STATE_IGST",
                message_params={"state": business_state_name}
            )
    else:
        # Inter-state: cannot charge CGST or SGST
        if cgst > Decimal("0.00") or sgst > Decimal("0.00"):
            return RuleResult(
                rule_id="R03",
                severity=RuleSeverity.BLOCKING,
                message_key="R03_INTER_STATE_CGST_SGST",
                message_params={"business_state": business_state_name, "party_state": party_state_name}
            )

    return None

