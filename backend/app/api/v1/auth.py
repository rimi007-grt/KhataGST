from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.logging import logger, mask_gstin
from app.core.rate_limit import rate_limit_auth
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new micro-business user",
    dependencies=[Depends(rate_limit_auth)]
)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    # Check if email is taken
    existing_user = db.query(User).filter(User.email == request.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_EXISTS", "message": "An account with this email already exists"}
        )

    masked = mask_gstin(request.gstin)
    logger.info(f"Registering user with email {request.email}, GSTIN {masked}")

    # Create new user
    user = User(
        email=request.email.lower().strip(),
        password_hash=hash_password(request.password),
        business_name=request.business_name,
        gstin=request.gstin.strip().upper() if request.gstin else None,
        state_code=request.state_code.strip() if request.state_code else None,
        scheme=request.scheme,
        language=request.language
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
    dependencies=[Depends(rate_limit_auth)]
)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email.lower().strip()).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}
        )

    logger.info(f"User {user.id} logged in successfully")
    access_token = create_access_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )

