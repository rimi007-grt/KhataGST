from app.models.user import SchemeEnum, LanguageEnum

def test_get_me_authenticated(client, auth_headers):
    headers, user = auth_headers()
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user.id
    assert data["email"] == user.email
    assert data["business_name"] == user.business_name
    assert data["gstin"] == user.gstin

def test_get_me_unauthenticated(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "UNAUTHORIZED"

def test_get_me_invalid_token(client):
    headers = {"Authorization": "Bearer not-a-valid-jwt-token"}
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "INVALID_TOKEN"

def test_patch_me_updates_profile(client, auth_headers):
    headers, user = auth_headers()
    update_payload = {
        "business_name": "Updated Sharma Traders LLP",
        "gstin": "27XYZAB1234C1Z9",
        "state_code": "27",
        "scheme": SchemeEnum.COMPOSITION.value,
        "language": LanguageEnum.hi.value
    }
    response = client.patch("/api/v1/me", headers=headers, json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["business_name"] == "Updated Sharma Traders LLP"
    assert data["gstin"] == "27XYZAB1234C1Z9"
    assert data["scheme"] == "COMPOSITION"
    assert data["language"] == "hi"

    # Verify persistent in subsequent GET /me
    get_res = client.get("/api/v1/me", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["business_name"] == "Updated Sharma Traders LLP"

