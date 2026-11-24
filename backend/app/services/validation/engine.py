from decimal import Decimal
import json
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.user import User, SchemeEnum
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.validation_result import ValidationResult, SeverityEnum
from app.models.rate_table import RateTable
from app.models.setting import SystemSetting
from app.i18n.translator import translate
from app.rules import RuleResult, RuleSeverity
from app.rules.R01 import rule_r01_gstin
from app.rules.R02 import rule_r02_tax_arithmetic
from app.rules.R03 import rule_r03_place_of_supply
from app.rules.R04 import rule_r04_rate_vs_hsn
from app.rules.R05 import rule_r05_duplicate
from app.rules.R06 import rule_r06_date
from app.rules.R07 import rule_r07_mandatory_fields
from app.rules.R08 import rule_r08_composition_scheme
from app.rules.R09 import rule_r09_outliers
from app.rules.R10 import rule_r10_turnover_limit
from app.schemas.validation import (
    ValidationResponse,
    ValidationResultOut,
    EntryValidationGroup,
    ValidationSummaryOut,
    ValidationCountsOut
)

def run_entry_rules(
    entry: EntryReviewed,
    user: User,
    all_user_entries: List[EntryReviewed],
    rate_table_rows: List[RateTable],
    period: Optional[str] = None
) -> List[RuleResult]:
    """Runs rules R01 through R09 on a single entry."""
    results: List[RuleResult] = []

    # R01: GSTIN Check
    if entry.party_gstin:
        r01 = rule_r01_gstin(entry.party_gstin)
        if r01:
            results.append(r01)

    # R02: Tax Arithmetic
    r02 = rule_r02_tax_arithmetic(entry)
    if r02:
        results.append(r02)

    # R03: Place of Supply
    r03 = rule_r03_place_of_supply(entry, user.state_code)
    if r03:
        results.append(r03)

    # R04: Rate vs HSN (P1.5: only real mismatches per entry; unverified table shown once at screen level)
    r04 = rule_r04_rate_vs_hsn(entry, rate_table_rows, emit_unverified_warning=False)
    if r04:
        results.append(r04)

    # R05: Duplicate Check
    r05 = rule_r05_duplicate(entry, all_user_entries)
    if r05:
        results.append(r05)

    # R06: Date Check
    r06 = rule_r06_date(entry, period=period)
    if r06:
        results.append(r06)

    # R07: Mandatory Fields
    r07 = rule_r07_mandatory_fields(entry, user_scheme=user.scheme)
    if r07:
        results.append(r07)

    # R08: Composition Scheme
    r08 = rule_r08_composition_scheme(entry, user_scheme=user.scheme, business_state=user.state_code)
    if r08:
        results.append(r08)

    # R09: Outliers, Zero, Negative
    r09 = rule_r09_outliers(entry)
    if r09:
        results.append(r09)

    return results


def validate_user_entries(
    db: Session,
    user: User,
    period: Optional[str] = None
) -> ValidationResponse:
    """
    Validates all reviewed entries for the user, persists results to validation_results,
    and returns a structured response grouped by entry and severity.
    """
    lang = getattr(user.language, "value", user.language) or "en"

    # 1. Fetch entries
    query = db.query(EntryReviewed).filter(EntryReviewed.user_id == user.id)
    all_user_entries = query.all()

    target_entries = all_user_entries
    if period:
        try:
            year, month = map(int, period.split("-"))
            target_entries = [
                e for e in all_user_entries
                if e.invoice_date and e.invoice_date.year == year and e.invoice_date.month == month
            ]
        except ValueError:
            pass

    # 2. Fetch reference data
    rate_table_rows = db.query(RateTable).all()

    # 3. Clear existing validation results for target entries
    target_ids = [e.id for e in target_entries]
    if target_ids:
        db.query(ValidationResult).filter(ValidationResult.entry_id.in_(target_ids)).delete(synchronize_session=False)
        db.commit()

    # 4. Run rules on each target entry
    total_blocking = 0
    total_warning = 0
    total_info = 0
    entry_groups: List[EntryValidationGroup] = []

    for entry in target_entries:
        rule_findings = run_entry_rules(entry, user, all_user_entries, rate_table_rows, period)
        entry_blocking = 0
        persisted_outs: List[ValidationResultOut] = []

        for f in rule_findings:
            sev_enum = SeverityEnum(f.severity.value)
            clean_params = json.loads(json.dumps(f.message_params, default=str)) if f.message_params else None
            vr = ValidationResult(
                entry_id=entry.id,
                rule_id=f.rule_id,
                severity=sev_enum,
                message_key=f.message_key,
                message_params=clean_params,
                rule_version="1.0"
            )
            db.add(vr)
            db.flush()

            if sev_enum == SeverityEnum.BLOCKING:
                total_blocking += 1
                entry_blocking += 1
            elif sev_enum == SeverityEnum.WARNING:
                total_warning += 1
            elif sev_enum == SeverityEnum.INFO:
                total_info += 1

            translated_msg = translate(f.message_key, lang=lang, params=f.message_params)
            persisted_outs.append(
                ValidationResultOut(
                    id=vr.id,
                    rule_id=f.rule_id,
                    severity=sev_enum,
                    message_key=f.message_key,
                    message_params=f.message_params,
                    message=translated_msg,
                    rule_version="1.0"
                )
            )

        entry_groups.append(
            EntryValidationGroup(
                entry_id=entry.id,
                invoice_no=entry.invoice_no,
                invoice_date=entry.invoice_date,
                party_name=entry.party_name,
                total=entry.total,
                has_blocking=entry_blocking > 0,
                results=persisted_outs
            )
        )

    # 5. Check R10 Turnover limit against settings
    cumulative_sales = sum(
        (e.taxable_value or Decimal("0.00"))
        for e in target_entries
        if e.entry_type == EntryTypeEnum.SALES
    )
    scheme_str = getattr(user.scheme, "value", str(user.scheme))
    setting_key = f"{scheme_str.lower()}_turnover_limit"
    setting_row = db.query(SystemSetting).filter(SystemSetting.key == setting_key).first()
    
    if setting_row and setting_row.value and cumulative_sales > Decimal("0.00"):
        r10 = rule_r10_turnover_limit(
            cumulative_sales=cumulative_sales,
            scheme_limit=Decimal(str(setting_row.value)),
            scheme_name=scheme_str
        )
        if r10 and target_entries:
            # Attach R10 warning to the latest entry
            target_entry = target_entries[-1]
            vr = ValidationResult(
                entry_id=target_entry.id,
                rule_id=r10.rule_id,
                severity=SeverityEnum(r10.severity.value),
                message_key=r10.message_key,
                message_params=r10.message_params,
                rule_version="1.0"
            )
            db.add(vr)
            total_warning += 1
            # Add to group output
            translated_msg = translate(r10.message_key, lang=lang, params=r10.message_params)
            for grp in entry_groups:
                if grp.entry_id == target_entry.id:
                    grp.results.append(
                        ValidationResultOut(
                            id=vr.id,
                            rule_id=r10.rule_id,
                            severity=SeverityEnum.WARNING,
                            message_key=r10.message_key,
                            message_params=r10.message_params,
                            message=translated_msg,
                            rule_version="1.0"
                        )
                    )
                    break

    db.commit()

    counts_obj = ValidationCountsOut(
        blocking=total_blocking,
        warning=total_warning,
        info=total_info
    )

    return ValidationResponse(
        period=period,
        total_entries=len(target_entries),
        blocking_count=total_blocking,
        warning_count=total_warning,
        info_count=total_info,
        counts=counts_obj,
        has_blocking_errors=total_blocking > 0,
        entries=entry_groups
    )


def get_validation_counts(
    db: Session,
    user: User,
    period: Optional[str] = None
) -> ValidationCountsOut:
    """
    Single source of truth returning {blocking, warning, info} validation counts per period.
    Delegates directly to validate_user_entries to prevent any double counting or stale data.
    """
    res = validate_user_entries(db, user, period=period)
    return ValidationCountsOut(
        blocking=res.blocking_count,
        warning=res.warning_count,
        info=res.info_count
    )


def get_validation_summary(
    db: Session,
    user: User,
    period: Optional[str] = None
) -> ValidationSummaryOut:
    """
    Returns summary counts of validation findings for user and period.
    Uses the exact same engine as validate_user_entries and get_validation_counts
    guaranteeing Review, Summary, and Export always show identical counts.
    """
    res = validate_user_entries(db, user, period=period)

    rate_row = db.query(RateTable).first()
    rate_version = "2023-10-01"
    has_unverified = db.query(RateTable).filter(RateTable.verified == False).first() is not None
    rates_ver = not has_unverified

    entries_with_blocking = {grp.entry_id for grp in res.entries if grp.has_blocking}
    valid_count = res.total_entries - len(entries_with_blocking)

    counts_obj = ValidationCountsOut(
        blocking=res.blocking_count,
        warning=res.warning_count,
        info=res.info_count
    )

    return ValidationSummaryOut(
        period=period,
        total_entries=res.total_entries,
        valid_entries=max(0, valid_count),
        blocking_count=res.blocking_count,
        warning_count=res.warning_count,
        info_count=res.info_count,
        counts=counts_obj,
        has_blocking_errors=res.blocking_count > 0,
        rate_table_version=rate_version,
        rates_verified=rates_ver
    )
