import re
from typing import Optional
from app.rules import RuleResult, RuleSeverity

GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
VALID_STATE_CODES = {f"{i:02d}" for i in range(1, 39)} | {"97", "99"}
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def compute_gstin_checksum(gstin_14: str) -> str:
    total = 0
    for i, c in enumerate(gstin_14):
        val = CHARS.index(c)
        weight = 2 if (i % 2 == 1) else 1
        prod = val * weight
        total += (prod // 36) + (prod % 36)
    cd = (36 - (total % 36)) % 36
    return CHARS[cd]

def rule_r01_gstin(gstin: Optional[str]) -> Optional[RuleResult]:
    """
    R01: GSTIN format (15 chars, regex, valid state code) and ISO 7064 checksum digit.
    Severity: BLOCKING
    """
    if not gstin:
        return None
    
    val = gstin.strip().upper()
    if len(val) != 15 or not GSTIN_REGEX.match(val):
        return RuleResult(
            rule_id="R01",
            severity=RuleSeverity.BLOCKING,
            message_key="R01_INVALID_FORMAT"
        )

    state_code = val[:2]
    if state_code not in VALID_STATE_CODES:
        return RuleResult(
            rule_id="R01",
            severity=RuleSeverity.BLOCKING,
            message_key="R01_INVALID_STATE",
            message_params={"state_code": state_code}
        )

    expected_checksum = compute_gstin_checksum(val[:14])
    found_checksum = val[14]
    if expected_checksum != found_checksum:
        return RuleResult(
            rule_id="R01",
            severity=RuleSeverity.BLOCKING,
            message_key="R01_INVALID_CHECKSUM",
            message_params={"expected": expected_checksum, "found": found_checksum}
        )

    return None

