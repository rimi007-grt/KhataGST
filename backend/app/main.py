from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings, validate_startup_config
from app.core.logging import logger
from app.core.database import SessionLocal, init_db_with_retry, Base, engine
from app.seed_data import seed_db
from app.api.v1.api import api_router
from app.api.v1.health import health_check

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Fail fast if required configuration is missing or invalid
    validate_startup_config()

    # 2. Verify database connection with retry to handle cold starts
    init_db_with_retry(max_retries=5, delay_seconds=1.5)

    # 3. Seed database placeholders if needed
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        seed_db(db)
        db.close()
    except Exception as e:
        logger.warning(f"Database seed on startup skipped or failed: {e}")
    yield
    # Shutdown

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Deterministic GST validation and extraction assistant for micro-businesses.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - strict origin enforcement
cors_origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Root-level health check endpoint (no sensitive information)
@app.get("/health", tags=["health"], summary="Root health check")
def root_health():
    return health_check()

# API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Consistent error handling shape: {code, message, details}
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = jsonable_encoder(exc.errors())
    first_msg = "Request validation failed"
    if errors and len(errors) > 0:
        err = errors[0]
        field = err.get("loc", [""])[-1]
        msg = err.get("msg", "")
        if field and field != "body":
            first_msg = f"{field}: {msg}"
        else:
            first_msg = msg

    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": first_msg,
            "details": errors
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        content = {
            "code": exc.detail.get("code", "ERROR"),
            "message": exc.detail.get("message", "An error occurred"),
            "details": exc.detail.get("details")
        }
    else:
        content = {
            "code": "HTTP_ERROR",
            "message": str(exc.detail),
            "details": None
        }
    return JSONResponse(
        status_code=exc.status_code,
        content=content
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected server error occurred",
            "details": None
        }
    )
