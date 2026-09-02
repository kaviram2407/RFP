from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["services"]["api"] == "ok"
    assert data["services"]["database"] == "ok"
    assert data["services"]["redis"] == "ok"
