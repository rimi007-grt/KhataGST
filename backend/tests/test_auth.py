from app.models.user import SchemeEnum, LanguageEnum

def test_register_success(client):
    payload = {
        "email": "owner@khatagst.test",
        "password": "Password123!",
        "business_name": "Rastogi General Store",
        "gstin": "27AAPFU0939F1ZV",
        "state_code": "27",
        "scheme": SchemeEnum.REGULAR.value,
        "language": LanguageEnum.hi.value
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "owner@khatagst.test"
    assert data["user"]["business_name"] == "Rastogi General Store"
    assert data["user"]["gstin"] == "27AAPFU0939F1ZV"
    assert data["user"]["state_code"] == "27"
    assert data["user"]["scheme"] == "REGULAR"
    assert data["user"]["language"] == "hi"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

def test_register_duplicate_email(client, create_user):
    create_user(email="duplicate@khatagst.test")
    payload = {
        "email": "duplicate@khatagst.test",
        "password": "Password123!"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409
    data = response.json()
    assert data["code"] == "EMAIL_EXISTS"
    assert "already exists" in data["message"]

def test_register_validation_error_short_password(client):
    payload = {
        "email": "invalid@khatagst.test",
        "password": "123"  # < 6 chars
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "VALIDATION_ERROR"
    assert "details" in data

def test_login_success(client, create_user):
    create_user(email="login@khatagst.test", password="correct_password")
    payload = {
        "email": "login@khatagst.test",
        "password": "correct_password"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "login@khatagst.test"

def test_login_wrong_password(client, create_user):
    create_user(email="wrongpass@khatagst.test", password="correct_password")
    payload = {
        "email": "wrongpass@khatagst.test",
        "password": "wrong_password"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "INVALID_CREDENTIALS"

def test_login_nonexistent_user(client):
    payload = {
        "email": "nobody@khatagst.test",
        "password": "anypassword"
    }
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "INVALID_CREDENTIALS"

