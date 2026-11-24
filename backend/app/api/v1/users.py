from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.core.logging import logger, mask_gstin
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(tags=["users"])

@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user business profile"
)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)

@router.patch(
    "/me",
    response_model=UserOut,
    summary="Update business profile (GSTIN, state, scheme, language)"
)
def update_me(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        if field == "gstin" and value:
            value = value.strip().upper()
            logger.info(f"Updating user {current_user.id} GSTIN to {mask_gstin(value)}")
        elif field == "state_code" and value:
            value = value.strip()
        setattr(current_user, field, value)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)

