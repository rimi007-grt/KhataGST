import datetime
from typing import Any, Dict
from app.services.scheme.processor import SchemeProcessedData

def build_json_export(data: SchemeProcessedData) -> Dict[str, Any]:
    header = {
        "status": "DRAFT: review before filing",
        "business_name": data.business_name,
        "gstin": data.gstin,
        "state_code": data.state_code,
        "scheme": data.scheme,
        "period": data.period,
        "generated_at": datetime.datetime.now().isoformat(),
        "rate_table_version": data.rate_table_version,
        "has_unverified_rate": data.has_unverified_rate
    }

    if data.scheme in ["REGULAR", "QRMP"]:
        return {
            "header": header,
            "b2b": data.b2b_entries,
            "b2c_summary": data.b2c_summary,
            "purchases": data.purchases_itc,
            "tax_summary": data.tax_summary
        }
    else:
        return {
            "header": header,
            "turnover_summary": data.turnover_summary,
            "composition_tax_payable": data.composition_tax_payable
        }

