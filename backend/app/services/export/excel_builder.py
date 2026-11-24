import datetime
import io
from typing import Any, Dict, List
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from app.services.scheme.processor import SchemeProcessedData

HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="1F4E79")
ALERT_FONT = Font(name="Calibri", size=12, bold=True, color="C00000")
BOLD_FONT = Font(name="Calibri", size=11, bold=True)
REGULAR_FONT = Font(name="Calibri", size=11)
BORDER_THIN = Border(
    left=Side(style="thin", color="D9D9D9"),
    right=Side(style="thin", color="D9D9D9"),
    top=Side(style="thin", color="D9D9D9"),
    bottom=Side(style="thin", color="D9D9D9")
)

def apply_sheet_autofit(ws):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            if "\n" in val_str:
                val_str = max(val_str.split("\n"), key=len)
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

def build_excel_workbook(data: SchemeProcessedData) -> bytes:
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    # 1. Header Sheet
    ws_header = wb.create_sheet(title="Header")
    ws_header.views.sheetView[0].showGridLines = True

    ws_header.cell(row=1, column=1, value="DRAFT: review before filing").font = ALERT_FONT
    ws_header.cell(row=3, column=1, value="KhataGST Tax Summary Export").font = TITLE_FONT
    
    meta = [
        ("Business Name", data.business_name),
        ("GSTIN", data.gstin),
        ("State Code", data.state_code),
        ("GST Scheme", data.scheme),
        ("Return Period", data.period or "All Available Entries"),
        ("Generated Date", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        ("Rate Table Version", data.rate_table_version),
    ]

    for r_idx, (lbl, val) in enumerate(meta, start=5):
        c_lbl = ws_header.cell(row=r_idx, column=1, value=lbl)
        c_lbl.font = BOLD_FONT
        c_val = ws_header.cell(row=r_idx, column=2, value=val)
        c_val.font = REGULAR_FONT

    if data.has_unverified_rate:
        alert_row = len(meta) + 6
        ws_header.cell(
            row=alert_row, column=1,
            value="WARNING: Unverified draft rates or limits were used in this export. Review against official CBIC notifications before filing."
        ).font = ALERT_FONT

    apply_sheet_autofit(ws_header)

    # 2. Scheme-Specific Sheets
    if data.scheme in ["REGULAR", "QRMP"]:
        # Sheet 2: B2B
        ws_b2b = wb.create_sheet(title="B2B")
        ws_b2b.views.sheetView[0].showGridLines = True
        b2b_cols = [
            "Invoice No", "Invoice Date", "Recipient GSTIN", "Recipient Name", "State Code",
            "HSN/SAC", "Description", "Taxable Value (Rs)", "Tax Rate (%)", "CGST (Rs)",
            "SGST (Rs)", "IGST (Rs)", "Total Value (Rs)"
        ]
        for c_idx, col_name in enumerate(b2b_cols, start=1):
            cell = ws_b2b.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        for r_idx, item in enumerate(data.b2b_entries, start=2):
            row_vals = [
                item["invoice_no"], item["invoice_date"], item["party_gstin"], item["party_name"],
                item["state_code"], item["hsn_or_category"], item["description"], item["taxable_value"],
                item["tax_rate"], item["cgst"], item["sgst"], item["igst"], item["total"]
            ]
            for c_idx, val in enumerate(row_vals, start=1):
                cell = ws_b2b.cell(row=r_idx, column=c_idx, value=val)
                cell.font = REGULAR_FONT
                cell.border = BORDER_THIN
                if c_idx in [8, 9, 10, 11, 12, 13] and isinstance(val, (int, float)):
                    cell.number_format = "#,##0.00"
        apply_sheet_autofit(ws_b2b)

        # Sheet 3: B2C Summary
        ws_b2c = wb.create_sheet(title="B2C Summary")
        ws_b2c.views.sheetView[0].showGridLines = True
        b2c_cols = [
            "Tax Rate (%)", "Total Taxable Value (Rs)", "CGST (Rs)", "SGST (Rs)", "IGST (Rs)", "Total Value (Rs)"
        ]
        for c_idx, col_name in enumerate(b2c_cols, start=1):
            cell = ws_b2c.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        for r_idx, item in enumerate(data.b2c_summary, start=2):
            row_vals = [
                item["tax_rate"], item["taxable_value"], item["cgst"], item["sgst"], item["igst"], item["total"]
            ]
            for c_idx, val in enumerate(row_vals, start=1):
                cell = ws_b2c.cell(row=r_idx, column=c_idx, value=val)
                cell.font = REGULAR_FONT
                cell.border = BORDER_THIN
                if isinstance(val, (int, float)):
                    cell.number_format = "#,##0.00"
        apply_sheet_autofit(ws_b2c)

        # Sheet 4: Purchases (ITC)
        ws_purchases = wb.create_sheet(title="Purchases")
        ws_purchases.views.sheetView[0].showGridLines = True
        purch_cols = [
            "Invoice No", "Invoice Date", "Supplier GSTIN", "Supplier Name", "HSN/SAC",
            "Description", "Taxable Value (Rs)", "Tax Rate (%)", "CGST (Rs)", "SGST (Rs)",
            "IGST (Rs)", "Total Value (Rs)"
        ]
        for c_idx, col_name in enumerate(purch_cols, start=1):
            cell = ws_purchases.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        for r_idx, item in enumerate(data.purchases_itc, start=2):
            row_vals = [
                item["invoice_no"], item["invoice_date"], item["supplier_gstin"], item["supplier_name"],
                item["hsn_or_category"], item["description"], item["taxable_value"], item["tax_rate"],
                item["cgst"], item["sgst"], item["igst"], item["total"]
            ]
            for c_idx, val in enumerate(row_vals, start=1):
                cell = ws_purchases.cell(row=r_idx, column=c_idx, value=val)
                cell.font = REGULAR_FONT
                cell.border = BORDER_THIN
                if c_idx in [7, 8, 9, 10, 11, 12] and isinstance(val, (int, float)):
                    cell.number_format = "#,##0.00"
        apply_sheet_autofit(ws_purchases)

        # Sheet 5: Tax Summary
        ws_tax = wb.create_sheet(title="Tax Summary")
        ws_tax.views.sheetView[0].showGridLines = True
        tax_cols = ["Description", "Taxable Value (Rs)", "CGST (Rs)", "SGST (Rs)", "IGST (Rs)", "Total Tax (Rs)"]
        for c_idx, col_name in enumerate(tax_cols, start=1):
            cell = ws_tax.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        ts = data.tax_summary
        tax_rows = [
            ("Outward Supplies (Tax Liability)", ts.get("outward_taxable_value", 0), ts.get("outward_cgst", 0), ts.get("outward_sgst", 0), ts.get("outward_igst", 0), ts.get("total_outward_tax", 0)),
            ("Inward Supplies (ITC Available)", ts.get("inward_taxable_value", 0), ts.get("itc_cgst", 0), ts.get("itc_sgst", 0), ts.get("itc_igst", 0), ts.get("total_itc", 0)),
            ("Net Tax Payable in Cash", "-", ts.get("net_payable_cgst", 0), ts.get("net_payable_sgst", 0), ts.get("net_payable_igst", 0), ts.get("net_tax_payable", 0))
        ]
        for r_idx, row_data in enumerate(tax_rows, start=2):
            for c_idx, val in enumerate(row_data, start=1):
                cell = ws_tax.cell(row=r_idx, column=c_idx, value=val)
                cell.font = BOLD_FONT if r_idx == 4 else REGULAR_FONT
                cell.border = BORDER_THIN
                if isinstance(val, (int, float)):
                    cell.number_format = "#,##0.00"
        apply_sheet_autofit(ws_tax)

    else:
        # COMPOSITION Scheme Sheets
        # Sheet 2: Turnover Summary
        ws_turnover = wb.create_sheet(title="Turnover Summary")
        ws_turnover.views.sheetView[0].showGridLines = True
        t_cols = ["Turnover Category", "Amount (Rs)"]
        for c_idx, col_name in enumerate(t_cols, start=1):
            cell = ws_turnover.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        t_data = data.turnover_summary
        t_rows = [
            ("Total Sales Turnover (Taxable)", t_data.get("total_sales_turnover", 0)),
            ("Total Gross Invoiced Value", t_data.get("total_gross_invoiced", 0)),
            ("Total Inward Purchases Value", t_data.get("total_purchases_value", 0)),
            ("Total Number of Sales Invoices", t_data.get("sales_transactions_count", 0)),
            ("Total Number of Purchase Bills", t_data.get("purchase_transactions_count", 0))
        ]
        for r_idx, (cat, val) in enumerate(t_rows, start=2):
            c_cat = ws_turnover.cell(row=r_idx, column=1, value=cat)
            c_cat.font = REGULAR_FONT
            c_cat.border = BORDER_THIN
            c_val = ws_turnover.cell(row=r_idx, column=2, value=val)
            c_val.font = BOLD_FONT if r_idx == 2 else REGULAR_FONT
            c_val.border = BORDER_THIN
            if isinstance(val, (int, float)) and r_idx <= 4:
                c_val.number_format = "#,##0.00"
        apply_sheet_autofit(ws_turnover)

        # Sheet 3: Tax Payable
        ws_comp_tax = wb.create_sheet(title="Tax Payable")
        ws_comp_tax.views.sheetView[0].showGridLines = True
        tp_cols = ["Tax Element", "Amount / Detail"]
        for c_idx, col_name in enumerate(tp_cols, start=1):
            cell = ws_comp_tax.cell(row=1, column=c_idx, value=col_name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT

        cp = data.composition_tax_payable
        rate_status = "Verified official rate" if cp.get("rate_verified") else "DRAFT / UNVERIFIED (Check official notification)"
        tp_rows = [
            ("Applicable Composition Scheme Rate", f"{cp.get('composition_rate_percent', 1.0)}%"),
            ("Rate Verification Status", rate_status),
            ("Total Applicable Turnover (Rs)", cp.get("total_turnover", 0)),
            ("CGST Portion Payable (Rs)", cp.get("cgst_payable", 0)),
            ("SGST Portion Payable (Rs)", cp.get("sgst_payable", 0)),
            ("Total Composition Tax Payable (Rs)", cp.get("tax_payable_total", 0))
        ]
        for r_idx, (el, val) in enumerate(tp_rows, start=2):
            c_el = ws_comp_tax.cell(row=r_idx, column=1, value=el)
            c_el.font = REGULAR_FONT
            c_el.border = BORDER_THIN
            c_val = ws_comp_tax.cell(row=r_idx, column=2, value=val)
            c_val.font = BOLD_FONT if r_idx == 7 else REGULAR_FONT
            c_val.border = BORDER_THIN
            if isinstance(val, (int, float)):
                c_val.number_format = "#,##0.00"
        apply_sheet_autofit(ws_comp_tax)

    # Save to BytesIO buffer
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

