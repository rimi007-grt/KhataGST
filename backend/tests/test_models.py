from app.core.logging import mask_gstin
from app.models.rate_table import RateTable
from app.models.setting import SystemSetting
from app.models.document import Document, DocTypeEnum
from app.models.extracted_entry import ExtractedEntry
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum, EntrySourceEnum
from app.models.validation_result import ValidationResult, SeverityEnum

def test_mask_gstin():
    assert mask_gstin("27AAAAA0000A1Z5") == "27**********1Z5"
    assert mask_gstin("07ABCDE1234F1Z8") == "07**********1Z8"
    assert mask_gstin("1234") == "****"
    assert mask_gstin("") == ""
    assert mask_gstin(None) == ""

def test_seeded_data_loaded_with_unverified_flag(db_session):
    # Non-negotiable Principle 5 & Data Grounding Addendum:
    # Rate table rows have verified CBIC notifications while keeping draft rows flagged (verified=False)
    rates = db_session.query(RateTable).all()
    assert len(rates) >= 4
    # P2.14: Draft rows remain unverified
    assert any(rate.verified is False for rate in rates)

    settings = db_session.query(SystemSetting).all()
    assert len(settings) >= 3
    for s in settings:
        assert s.verified is False
        assert "PLACEHOLDER" in s.source_ref

    from app.models.deadline import Deadline
    deadlines = db_session.query(Deadline).all()
    assert len(deadlines) >= 3
    for d in deadlines:
        assert d.verified is False

def test_document_and_entry_relationships(db_session, create_user):
    user = create_user()
    doc = Document(
        user_id=user.id,
        file_path="uploads/test_doc.jpg",
        mime="image/jpeg",
        sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        doc_type=DocTypeEnum.SALES
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    assert doc.id is not None
    assert doc.user.id == user.id

    extracted = ExtractedEntry(
        document_id=doc.id,
        line_no=1,
        invoice_no="INV-001",
        party_name="Acme Corp",
        taxable_value=1000.0,
        tax_rate=18.0,
        cgst=90.0,
        sgst=90.0,
        total=1180.0,
        extraction_provider="mock",
        extraction_model_version="mock-v1"
    )
    db_session.add(extracted)
    db_session.commit()
    db_session.refresh(extracted)
    assert extracted.id is not None
    assert extracted.document.id == doc.id

    reviewed = EntryReviewed(
        extracted_entry_id=extracted.id,
        user_id=user.id,
        invoice_no="INV-001",
        party_name="Acme Corp",
        taxable_value=1000.0,
        tax_rate=18.0,
        cgst=90.0,
        sgst=90.0,
        total=1180.0,
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.EXTRACTED_EDITED
    )
    db_session.add(reviewed)
    db_session.commit()
    db_session.refresh(reviewed)
    assert reviewed.id is not None
    assert reviewed.user.id == user.id

    val_res = ValidationResult(
        entry_id=reviewed.id,
        rule_id="R01",
        severity=SeverityEnum.BLOCKING,
        message_key="ERR_GSTIN_INVALID",
        message_params={"gstin": "INVALID"}
    )
    db_session.add(val_res)
    db_session.commit()
    db_session.refresh(val_res)
    assert val_res.id is not None
    assert val_res.entry.id == reviewed.id

