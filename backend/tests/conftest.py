import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.api.deps import get_db
from app.main import app
from app.core.security import hash_password, create_access_token
from app.models import (
    User, SchemeEnum, LanguageEnum,
    Document, ExtractedEntry, EntryReviewed,
    ValidationResult, RateTable, SystemSetting, AuditLog
)
from app.seed_data import seed_db

@pytest.fixture(scope="function")
def db_session():
    """Create fresh in-memory database for every test function for total isolation."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSessionLocal()
    seed_db(session)
    try:
        yield session
    finally:
        session.close()
        test_engine.dispose()

@pytest.fixture(scope="function")
def client(db_session):
    """Override get_db dependency with test database session."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def create_user(db_session):
    def _create_user(
        email="trader@example.com",
        password="securepassword123",
        business_name="M/S Sharma Traders",
        gstin="27ABCDE1234F1Z5",
        state_code="27",
        scheme=SchemeEnum.REGULAR,
        language=LanguageEnum.en
    ):
        user = User(
            email=email.lower().strip(),
            password_hash=hash_password(password),
            business_name=business_name,
            gstin=gstin,
            state_code=state_code,
            scheme=scheme,
            language=language
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user
    return _create_user

@pytest.fixture
def auth_headers(create_user):
    def _auth_headers(user=None):
        if user is None:
            user = create_user()
        token = create_access_token(subject=user.id)
        return {"Authorization": f"Bearer {token}"}, user
    return _auth_headers
