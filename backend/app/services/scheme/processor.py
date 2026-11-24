from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.user import User, SchemeEnum
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.setting import SystemSetting
from app.models.rate_table import RateTable

@dataclass
class SchemeProcessedData:
    scheme: str
    period: Optional[str]
    user_id: int
    business_name: str
    gstin: str
    state_code: str
    has_unverified_rate: bool = False
    rate_table_version: str = "2026-11-23-v1"
    # REGULAR / QRMP sections
    b2b_entries: List[Dict[str, Any]] = field(default_factory=list)
    b2c_summary: List[Dict[str, Any]] = field(default_factory=list)
    purchases_itc: List[Dict[str, Any]] = field(default_factory=list)
    tax_summary: Dict[str, Any] = field(default_factory=dict)
    # COMPOSITION sections
    turnover_summary: Dict[str, Any] = field(default_factory=dict)
    composition_tax_payable: Dict[str, Any] = field(default_factory=dict)


class BaseSchemeProcessor:
    def process(self, db: Session, user: User, entries: List[EntryReviewed], period: Optional[str]) -> SchemeProcessedData:
        raise NotImplementedError


class RegularQrmpSchemeProcessor(BaseSchemeProcessor):
    def process(self, db: Session, user: User, entries: List[EntryReviewed], period: Optional[str]) -> SchemeProcessedData:
        b2b: List[Dict[str, Any]] = []
        b2c_raw: List[EntryReviewed] = []
        purchases: List[Dict[str, Any]] = []

        outward_taxable = Decimal("0.00")
        outward_cgst = Decimal("0.00")
        outward_sgst = Decimal("0.00")
        outward_igst = Decimal("0.00")

        inward_taxable = Decimal("0.00")
        itc_cgst = Decimal("0.00")
        itc_sgst = Decimal("0.00")
        itc_igst = Decimal("0.00")

        has_unverified = False
        rate_rows = {r.hsn_or_category: r.verified for r in db.query(RateTable).all()}

        for e in entries:
            # Check rate table unverified
            if e.hsn_or_category and e.hsn_or_category in rate_rows and not rate_rows[e.hsn_or_category]:
                has_unverified = True

            taxable = Decimal(str(e.taxable_value or 0))
            cgst = Decimal(str(e.cgst or 0))
            sgst = Decimal(str(e.sgst or 0))
            igst = Decimal(str(e.igst or 0))
            total = Decimal(str(e.total or 0))
            rate = Decimal(str(e.tax_rate or 0))

            if e.entry_type == EntryTypeEnum.SALES:
                outward_taxable += taxable
                outward_cgst += cgst
                outward_sgst += sgst
                outward_igst += igst

                entry_dict = {
                    "invoice_no": e.invoice_no,
                    "invoice_date": str(e.invoice_date) if e.invoice_date else "",
                    "party_name": e.party_name or "",
                    "party_gstin": e.party_gstin or "",
                    "state_code": e.party_gstin[:2] if e.party_gstin and len(e.party_gstin) >= 2 else "",
                    "hsn_or_category": e.hsn_or_category or "",
                    "description": e.description or "",
                    "taxable_value": float(taxable),
                    "tax_rate": float(rate),
                    "cgst": float(cgst),
                    "sgst": float(sgst),
                    "igst": float(igst),
                    "total": float(total)
                }

                if e.party_gstin and e.party_gstin.strip():
                    b2b.append(entry_dict)
                else:
                    b2c_raw.append(e)

            elif e.entry_type == EntryTypeEnum.PURCHASE:
                inward_taxable += taxable
                itc_cgst += cgst
                itc_sgst += sgst
                itc_igst += igst

                purchases.append({
                    "invoice_no": e.invoice_no,
                    "invoice_date": str(e.invoice_date) if e.invoice_date else "",
                    "supplier_name": e.party_name or "",
                    "supplier_gstin": e.party_gstin or "",
                    "hsn_or_category": e.hsn_or_category or "",
                    "description": e.description or "",
                    "taxable_value": float(taxable),
                    "tax_rate": float(rate),
                    "cgst": float(cgst),
                    "sgst": float(sgst),
                    "igst": float(igst),
                    "total": float(total)
                })

        # Group B2C by rate
        b2c_by_rate: Dict[float, Dict[str, Any]] = {}
        for b in b2c_raw:
            r = float(b.tax_rate or 0)
            if r not in b2c_by_rate:
                b2c_by_rate[r] = {
                    "tax_rate": r,
                    "taxable_value": Decimal("0.00"),
                    "cgst": Decimal("0.00"),
                    "sgst": Decimal("0.00"),
                    "igst": Decimal("0.00"),
                    "total": Decimal("0.00")
                }
            b2c_by_rate[r]["taxable_value"] += Decimal(str(b.taxable_value or 0))
            b2c_by_rate[r]["cgst"] += Decimal(str(b.cgst or 0))
            b2c_by_rate[r]["sgst"] += Decimal(str(b.sgst or 0))
            b2c_by_rate[r]["igst"] += Decimal(str(b.igst or 0))
            b2c_by_rate[r]["total"] += Decimal(str(b.total or 0))

        b2c_summary = [
            {
                "tax_rate": r_data["tax_rate"],
                "taxable_value": float(r_data["taxable_value"]),
                "cgst": float(r_data["cgst"]),
                "sgst": float(r_data["sgst"]),
                "igst": float(r_data["igst"]),
                "total": float(r_data["total"])
            }
            for _, r_data in sorted(b2c_by_rate.items())
        ]

        # Calculate tax summary
        total_outward_tax = outward_cgst + outward_sgst + outward_igst
        total_itc = itc_cgst + itc_sgst + itc_igst
        net_cgst = max(Decimal("0.00"), outward_cgst - itc_cgst)
        net_sgst = max(Decimal("0.00"), outward_sgst - itc_sgst)
        net_igst = max(Decimal("0.00"), outward_igst - itc_igst)
        net_payable = net_cgst + net_sgst + net_igst

        tax_summary = {
            "outward_taxable_value": float(outward_taxable),
            "outward_cgst": float(outward_cgst),
            "outward_sgst": float(outward_sgst),
            "outward_igst": float(outward_igst),
            "total_outward_tax": float(total_outward_tax),
            "inward_taxable_value": float(inward_taxable),
            "itc_cgst": float(itc_cgst),
            "itc_sgst": float(itc_sgst),
            "itc_igst": float(itc_igst),
            "total_itc": float(total_itc),
            "net_payable_cgst": float(net_cgst),
            "net_payable_sgst": float(net_sgst),
            "net_payable_igst": float(net_igst),
            "net_tax_payable": float(net_payable)
        }

        scheme_str = getattr(user.scheme, "value", str(user.scheme))
        return SchemeProcessedData(
            scheme=scheme_str,
            period=period,
            user_id=user.id,
            business_name=user.business_name or "My Business",
            gstin=user.gstin or "",
            state_code=user.state_code or "",
            has_unverified_rate=has_unverified,
            b2b_entries=b2b,
            b2c_summary=b2c_summary,
            purchases_itc=purchases,
            tax_summary=tax_summary
        )


class CompositionSchemeProcessor(BaseSchemeProcessor):
    def process(self, db: Session, user: User, entries: List[EntryReviewed], period: Optional[str]) -> SchemeProcessedData:
        total_turnover = Decimal("0.00")
        total_gross = Decimal("0.00")
        total_purchases = Decimal("0.00")
        sales_count = 0
        purchase_count = 0

        for e in entries:
            taxable = Decimal(str(e.taxable_value or 0))
            total = Decimal(str(e.total or 0))
            if e.entry_type == EntryTypeEnum.SALES:
                total_turnover += taxable
                total_gross += total
                sales_count += 1
            elif e.entry_type == EntryTypeEnum.PURCHASE:
                total_purchases += taxable
                purchase_count += 1

        # Fetch composition rate from settings
        setting = db.query(SystemSetting).filter(SystemSetting.key == "composition_tax_rate_trader").first()
        comp_rate = Decimal(str(setting.value)) if setting else Decimal("1.00")
        is_unverified = not setting.verified if setting else True

        tax_payable = (total_turnover * comp_rate) / Decimal("100.00")
        cgst_portion = tax_payable / Decimal("2.00")
        sgst_portion = tax_payable / Decimal("2.00")

        turnover_summary = {
            "total_sales_turnover": float(total_turnover),
            "total_gross_invoiced": float(total_gross),
            "total_purchases_value": float(total_purchases),
            "sales_transactions_count": sales_count,
            "purchase_transactions_count": purchase_count
        }

        tax_payable_dict = {
            "composition_rate_percent": float(comp_rate),
            "rate_verified": not is_unverified,
            "total_turnover": float(total_turnover),
            "tax_payable_total": float(tax_payable),
            "cgst_payable": float(cgst_portion),
            "sgst_payable": float(sgst_portion)
        }

        scheme_str = getattr(user.scheme, "value", str(user.scheme))
        return SchemeProcessedData(
            scheme=scheme_str,
            period=period,
            user_id=user.id,
            business_name=user.business_name or "My Business",
            gstin=user.gstin or "",
            state_code=user.state_code or "",
            has_unverified_rate=is_unverified,
            turnover_summary=turnover_summary,
            composition_tax_payable=tax_payable_dict
        )


def get_scheme_processor(scheme: SchemeEnum) -> BaseSchemeProcessor:
    if scheme == SchemeEnum.COMPOSITION:
        return CompositionSchemeProcessor()
    return RegularQrmpSchemeProcessor()

