import json
from pathlib import Path
from typing import Any, Dict

I18N_DIR = Path(__file__).resolve().parent

with open(I18N_DIR / "en.json", "r", encoding="utf-8") as f:
    EN_MESSAGES: Dict[str, str] = json.load(f)

with open(I18N_DIR / "hi.json", "r", encoding="utf-8") as f:
    HI_MESSAGES: Dict[str, str] = json.load(f)

STATE_NAMES_EN_TO_HI = {
    "Jammu & Kashmir": "जम्मू और कश्मीर",
    "Himachal Pradesh": "हिमाचल प्रदेश",
    "Punjab": "पंजाब",
    "Chandigarh": "चंडीगढ़",
    "Uttarakhand": "उत्तराखंड",
    "Haryana": "हरियाणा",
    "Delhi": "दिल्ली",
    "Rajasthan": "राजस्थान",
    "Uttar Pradesh": "उत्तर प्रदेश",
    "Bihar": "बिहार",
    "Sikkim": "सिक्किम",
    "Arunachal Pradesh": "अरुणाचल प्रदेश",
    "Nagaland": "नागालैंड",
    "Manipur": "मणिपुर",
    "Mizoram": "मिजोरम",
    "Tripura": "त्रिपुरा",
    "Meghalaya": "मेघालय",
    "Assam": "असम",
    "West Bengal": "पश्चिम बंगाल",
    "Jharkhand": "झारखंड",
    "Odisha": "ओडिशा",
    "Chhattisgarh": "छत्तीसगढ़",
    "Madhya Pradesh": "मध्य प्रदेश",
    "Gujarat": "गुजरात",
    "Daman & Diu": "दमन और दीव",
    "Dadra & Nagar Haveli": "दादरा और नगर हवेली",
    "Maharashtra": "महाराष्ट्र",
    "Andhra Pradesh": "आंध्र प्रदेश",
    "Karnataka": "कर्नाटक",
    "Goa": "गोवा",
    "Lakshadweep": "लक्षद्वीप",
    "Kerala": "केरल",
    "Tamil Nadu": "तमिलनाडु",
    "Puducherry": "पुडुचेरी",
    "Andaman & Nicobar Islands": "अंडमान और निकोबार",
    "Telangana": "तेलंगाना",
    "Ladakh": "लद्दाख",
    "Other Territory": "अन्य क्षेत्र",
    "Centre Jurisdiction": "केंद्रीय अधिकार क्षेत्र"
}

def translate(key: str, lang: str = "en", params: Dict[str, Any] = None) -> str:
    params = dict(params or {})
    catalog = HI_MESSAGES if lang == "hi" else EN_MESSAGES
    if lang == "hi":
        for k, v in list(params.items()):
            if isinstance(v, str) and v in STATE_NAMES_EN_TO_HI:
                params[k] = STATE_NAMES_EN_TO_HI[v]

    template = catalog.get(key, EN_MESSAGES.get(key, key))
    try:
        return template.format(**params)
    except Exception:
        return template

