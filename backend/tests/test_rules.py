import datetime
from decimal import Decimal
import pytest
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.user import SchemeEnum
from app.rules import RuleSeverity, RuleResult
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


# ==============================================================================
# R01: GSTIN Format, State Code, and Checksum Digit
# ==============================================================================

def test_r01_valid_gstin():
    # Valid GSTINs with correct ISO 7064 checksum digits
    res1 = rule_r01_gstin("19AAPCS8731C1Z0")
    assert res1 is None

    res2 = rule_r01_gstin("08AKOCX6349P1ZL")
    assert res2 is None

    res3 = rule_r01_gstin("20QXOCC9424D1Z5")
    assert res3 is None


def test_r01_invalid_length_and_regex():
    res_short = rule_r01_gstin("19AAPCS8731C1Z")
    assert res_short is not None
    assert res_short.severity == RuleSeverity.BLOCKING
    assert res_short.rule_id == "R01"

    res_chars = rule_r01_gstin("19AAPCS8731C1Z#")
    assert res_chars is not None
    assert res_chars.severity == RuleSeverity.BLOCKING


def test_r01_invalid_state_code():
    # State code 00 is invalid
    res_zero_state = rule_r01_gstin("00AAPCS8731C1Z0")
    assert res_zero_state is not None
    assert res_zero_state.severity == RuleSeverity.BLOCKING
    assert "STATE" in res_zero_state.message_key

    # State code 98 is invalid (valid: 01-38, 97, 99)
    res_98_state = rule_r01_gstin("98AAPCS8731C1Z0")
    assert res_98_state is not None
    assert res_98_state.severity == RuleSeverity.BLOCKING


def test_r01_invalid_checksum():
    # 19AAPCS8731C1Z0 has checksum '0'. Passing '1' should fail
    res_bad_check = rule_r01_gstin("19AAPCS8731C1Z1")
    assert res_bad_check is not None
    assert res_bad_check.severity == RuleSeverity.BLOCKING
    assert "CHECKSUM" in res_bad_check.message_key


# ==============================================================================
# R02: Tax Arithmetic (Tolerance Rs 1) & Total Check
# ==============================================================================

def test_r02_tax_arithmetic_valid():
    entry = EntryReviewed(
        taxable_value=Decimal("1000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        igst=Decimal("0.00"),
        total=Decimal("1180.00"),
    )
    assert rule_r02_tax_arithmetic(entry) is None


def test_r02_tax_arithmetic_with_rounding_tolerance():
    # 0.50 difference is within Rs 1 tolerance
    entry = EntryReviewed(
        taxable_value=Decimal("1000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("90.25"),
        sgst=Decimal("90.25"),
        igst=Decimal("0.00"),
        total=Decimal("1180.50"),
    )
    assert rule_r02_tax_arithmetic(entry) is None


def test_r02_tax_mismatch_exceeding_tolerance():
    # Expected tax = 180, actual = 100 + 100 = 200 (diff = 20 > 1.0)
    entry = EntryReviewed(
        taxable_value=Decimal("1000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("100.00"),
        sgst=Decimal("100.00"),
        igst=Decimal("0.00"),
        total=Decimal("1200.00"),
    )
    res = rule_r02_tax_arithmetic(entry)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert res.rule_id == "R02"
    assert "TAX_MISMATCH" in res.message_key


def test_r02_total_mismatch():
    # Tax math is correct (180), but total is 1300 instead of 1180
    entry = EntryReviewed(
        taxable_value=Decimal("1000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        igst=Decimal("0.00"),
        total=Decimal("1300.00"),
    )
    res = rule_r02_tax_arithmetic(entry)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert "TOTAL_MISMATCH" in res.message_key


# ==============================================================================
# R03: Place of Supply (Intra-state CGST+SGST vs Inter-state IGST)
# ==============================================================================

def test_r03_valid_intra_state():
    entry = EntryReviewed(
        party_gstin="19AAPCS8731C1Z0",  # State 19
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        igst=Decimal("0.00"),
    )
    business_state = "19"
    assert rule_r03_place_of_supply(entry, business_state) is None


def test_r03_invalid_intra_state_charging_igst():
    entry = EntryReviewed(
        party_gstin="19AAPCS8731C1Z0",  # State 19
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("180.00"),  # Error: same state cannot charge IGST
    )
    business_state = "19"
    res = rule_r03_place_of_supply(entry, business_state)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert res.rule_id == "R03"
    assert "INTRA_STATE_IGST" in res.message_key


def test_r03_valid_inter_state():
    entry = EntryReviewed(
        party_gstin="08AKOCX6349P1ZL",  # State 08 (Rajasthan)
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("180.00"),
    )
    business_state = "19"  # West Bengal
    assert rule_r03_place_of_supply(entry, business_state) is None


def test_r03_invalid_inter_state_charging_cgst_sgst():
    entry = EntryReviewed(
        party_gstin="08AKOCX6349P1ZL",  # State 08
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        igst=Decimal("0.00"),
    )
    business_state = "19"
    res = rule_r03_place_of_supply(entry, business_state)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert "INTER_STATE_CGST_SGST" in res.message_key


# ==============================================================================
# R04: Rate vs HSN Table Lookup
# ==============================================================================

def test_r04_rate_match_verified():
    rate_table_rows = [
        {
            "hsn_or_category": "1101",
            "rate": Decimal("5.00"),
            "effective_from": datetime.date(2017, 7, 1),
            "effective_to": None,
            "verified": True,
        }
    ]
    entry = EntryReviewed(
        hsn_or_category="1101",
        tax_rate=Decimal("5.00"),
        invoice_date=datetime.date(2025, 11, 1),
    )
    assert rule_r04_rate_vs_hsn(entry, rate_table_rows) is None


def test_r04_rate_mismatch():
    rate_table_rows = [
        {
            "hsn_or_category": "1905",
            "rate": Decimal("18.00"),
            "effective_from": datetime.date(2017, 7, 1),
            "effective_to": None,
            "verified": True,
        }
    ]
    entry = EntryReviewed(
        hsn_or_category="1905",
        tax_rate=Decimal("12.00"),  # Expected 18%
        invoice_date=datetime.date(2025, 11, 1),
    )
    res = rule_r04_rate_vs_hsn(entry, rate_table_rows)
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert res.rule_id == "R04"
    assert "RATE_MISMATCH" in res.message_key


def test_r04_rate_unverified_warning():
    rate_table_rows = [
        {
            "hsn_or_category": "4820",
            "rate": Decimal("12.00"),
            "effective_from": datetime.date(2017, 7, 1),
            "effective_to": None,
            "verified": False,  # Unverified seed
        }
    ]
    entry = EntryReviewed(
        hsn_or_category="4820",
        tax_rate=Decimal("12.00"),
        invoice_date=datetime.date(2025, 11, 1),
    )
    res = rule_r04_rate_vs_hsn(entry, rate_table_rows)
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert "UNVERIFIED" in res.message_key


# ==============================================================================
# R05: Duplicate Invoice Check
# ==============================================================================

def test_r05_no_duplicate():
    existing_entries = [
        EntryReviewed(
            id=1,
            party_gstin="19AAPCS8731C1Z0",
            invoice_no="INV-001",
            invoice_date=datetime.date(2025, 11, 1),
            party_name="Party A",
            total=Decimal("1000.00"),
        )
    ]
    current_entry = EntryReviewed(
        id=2,
        party_gstin="19AAPCS8731C1Z0",
        invoice_no="INV-002",
        invoice_date=datetime.date(2025, 11, 2),
        party_name="Party A",
        total=Decimal("1500.00"),
    )
    assert rule_r05_duplicate(current_entry, existing_entries) is None


def test_r05_duplicate_by_gstin_and_invoice_no():
    existing_entries = [
        EntryReviewed(
            id=1,
            party_gstin="19AAPCS8731C1Z0",
            invoice_no="INV-001",
            invoice_date=datetime.date(2025, 11, 1),
            party_name="Party A",
            total=Decimal("1000.00"),
        )
    ]
    current_entry = EntryReviewed(
        id=2,
        party_gstin="19AAPCS8731C1Z0",
        invoice_no="INV-001",  # Same invoice_no and GSTIN
        invoice_date=datetime.date(2025, 11, 1),
        party_name="Party A",
        total=Decimal("1000.00"),
    )
    res = rule_r05_duplicate(current_entry, existing_entries)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert res.rule_id == "R05"
    assert "DUPLICATE_INVOICE_NO" in res.message_key


def test_r05_duplicate_by_date_party_and_total():
    existing_entries = [
        EntryReviewed(
            id=1,
            party_gstin=None,
            invoice_no="BILL-1",
            invoice_date=datetime.date(2025, 11, 1),
            party_name="Retail Customer",
            total=Decimal("500.00"),
        )
    ]
    current_entry = EntryReviewed(
        id=2,
        party_gstin=None,
        invoice_no="BILL-2",
        invoice_date=datetime.date(2025, 11, 1),
        party_name="Retail Customer",
        total=Decimal("500.00"),
    )
    res = rule_r05_duplicate(current_entry, existing_entries)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert "DUPLICATE_TRANSACTION" in res.message_key


# ==============================================================================
# R06: Invoice Date Check
# ==============================================================================

def test_r06_valid_date_in_period():
    entry = EntryReviewed(invoice_date=datetime.date(2025, 11, 15))
    period = "2025-11"
    today = datetime.date(2025, 11, 20)
    assert rule_r06_date(entry, period=period, current_date=today) is None


def test_r06_future_date():
    today = datetime.date(2025, 11, 20)
    entry = EntryReviewed(invoice_date=datetime.date(2025, 11, 25))
    res = rule_r06_date(entry, period="2025-11", current_date=today)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert res.rule_id == "R06"
    assert "FUTURE_DATE" in res.message_key


def test_r06_outside_return_period():
    entry = EntryReviewed(invoice_date=datetime.date(2025, 10, 31))
    period = "2025-11"
    today = datetime.date(2025, 11, 20)
    res = rule_r06_date(entry, period=period, current_date=today)
    assert res is not None
    assert res.severity == RuleSeverity.BLOCKING
    assert "OUTSIDE_PERIOD" in res.message_key


# ==============================================================================
# R07: Missing Mandatory Fields for Scheme / B2B
# ==============================================================================

def test_r07_valid_b2b():
    entry = EntryReviewed(
        entry_type=EntryTypeEnum.SALES,
        party_name="Cipla Ltd",
        party_gstin="08AKOCX6349P1ZL",
        invoice_no="INV-100",
        invoice_date=datetime.date(2025, 11, 1),
        taxable_value=Decimal("5000.00"),
    )
    assert rule_r07_mandatory_fields(entry, user_scheme=SchemeEnum.REGULAR) is None


def test_r07_missing_mandatory_party_gstin_on_b2b():
    entry = EntryReviewed(
        entry_type=EntryTypeEnum.SALES,
        party_name="Large Enterprise Ltd",
        party_gstin=None,  # Missing on high value or B2B sales
        invoice_no="INV-101",
        invoice_date=datetime.date(2025, 11, 1),
        taxable_value=Decimal("100000.00"),
    )
    res = rule_r07_mandatory_fields(entry, user_scheme=SchemeEnum.REGULAR, is_b2b=True)
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert res.rule_id == "R07"
    assert "MISSING_GSTIN" in res.message_key


# ==============================================================================
# R08: Composition Scheme Check
# ==============================================================================

def test_r08_composition_clean_entry():
    entry = EntryReviewed(
        party_gstin="19AAPCS8731C1Z0",
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("0.00"),
        total=Decimal("1000.00"),
    )
    business_state = "19"
    assert rule_r08_composition_scheme(entry, user_scheme=SchemeEnum.COMPOSITION, business_state=business_state) is None


def test_r08_composition_charging_separate_tax():
    entry = EntryReviewed(
        party_gstin="19AAPCS8731C1Z0",
        cgst=Decimal("25.00"),
        sgst=Decimal("25.00"),
        igst=Decimal("0.00"),
        total=Decimal("1050.00"),
    )
    business_state = "19"
    res = rule_r08_composition_scheme(entry, user_scheme=SchemeEnum.COMPOSITION, business_state=business_state)
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert res.rule_id == "R08"
    assert "SEPARATE_TAX" in res.message_key


def test_r08_composition_interstate_outward_supply():
    entry = EntryReviewed(
        party_gstin="08AKOCX6349P1ZL",  # Inter-state
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("0.00"),
        total=Decimal("1000.00"),
    )
    business_state = "19"
    res = rule_r08_composition_scheme(entry, user_scheme=SchemeEnum.COMPOSITION, business_state=business_state)
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert "INTER_STATE" in res.message_key


# ==============================================================================
# R09: Outliers, Zero, and Negative Values (INFO)
# ==============================================================================

def test_r09_valid_normal_values():
    entry = EntryReviewed(
        taxable_value=Decimal("500.00"),
        total=Decimal("590.00"),
        tax_rate=Decimal("18.00"),
    )
    assert rule_r09_outliers(entry) is None


def test_r09_negative_or_zero_value():
    entry_zero = EntryReviewed(
        taxable_value=Decimal("0.00"),
        total=Decimal("0.00"),
        tax_rate=Decimal("18.00"),
    )
    res = rule_r09_outliers(entry_zero)
    assert res is not None
    assert res.severity == RuleSeverity.INFO
    assert res.rule_id == "R09"
    assert "ZERO_OR_NEGATIVE" in res.message_key


def test_r09_absurd_outlier_amount():
    entry_outlier = EntryReviewed(
        taxable_value=Decimal("5000000.00"),  # 50 Lakhs for micro-business
        total=Decimal("5900000.00"),
        tax_rate=Decimal("18.00"),
    )
    res = rule_r09_outliers(entry_outlier)
    assert res is not None
    assert res.severity == RuleSeverity.INFO
    assert "OUTLIER_AMOUNT" in res.message_key


# ==============================================================================
# R10: Cumulative Turnover Nearing Scheme Limit
# ==============================================================================

def test_r10_turnover_safe():
    cumulative_sales = Decimal("5000000.00")  # 50 Lakhs
    limit = Decimal("15000000.00")  # 1.5 Cr
    assert rule_r10_turnover_limit(cumulative_sales, limit, scheme_name="COMPOSITION") is None


def test_r10_turnover_nearing_limit():
    cumulative_sales = Decimal("14000000.00")  # 1.4 Cr (>= 90% of 1.5 Cr limit)
    limit = Decimal("15000000.00")
    res = rule_r10_turnover_limit(cumulative_sales, limit, scheme_name="COMPOSITION")
    assert res is not None
    assert res.severity == RuleSeverity.WARNING
    assert res.rule_id == "R10"
    assert "NEARING_LIMIT" in res.message_key

