from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.health import router as health_router
from app.api.v1.documents import router as documents_router
from app.api.v1.entries import router as entries_router
from app.api.v1.validation import router as validation_router
from app.api.v1.export import router as export_router
from app.api.v1.dashboard import router as dashboard_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(health_router)
api_router.include_router(documents_router)
api_router.include_router(entries_router)
api_router.include_router(validation_router)
api_router.include_router(export_router)
api_router.include_router(dashboard_router)
