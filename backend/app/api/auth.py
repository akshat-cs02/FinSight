"""
Authentication endpoints
"""

import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import User, get_db
from app.schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.security import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, get_current_user
)
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    existing_username = db.query(User).filter(User.username == request.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Create new user
    try:
        new_user = User(
            username=request.username,
            email=request.email,
            hashed_password=hash_password(request.password),
            first_name=request.first_name,
            last_name=request.last_name,
            is_active=True,
            subscription_tier="free"
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        logger.info(f"✅ New user registered: {new_user.email}")
        return UserResponse.from_orm(new_user)

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Registration failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    User login endpoint
    """
    user = db.query(User).filter(User.email == request.email).first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create tokens
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.id})

    logger.info(f"✅ User logged in: {user.email}")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    User logout endpoint
    """
    logger.info(f"✅ User logged out: {current_user.email}")
    return {"message": "Successfully logged out"}

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token: str):
    """
    Refresh access token
    """
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        # Create new access token
        access_token = create_access_token(data={"sub": user_id})

        return TokenResponse(
            access_token=access_token,
            refresh_token=token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    except Exception as e:
        logger.error(f"Token refresh failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current user information
    """
    return UserResponse.from_orm(current_user)

@router.post("/forgot-password")
async def forgot_password(email: str, db: Session = Depends(get_db)):
    """
    Request password reset
    """
    user = db.query(User).filter(User.email == email).first()

    if not user:
        # Don't reveal if email exists for security
        return {"message": "If email exists, reset link will be sent"}

    # TODO: Implement email sending logic
    logger.info(f"Password reset requested for: {email}")
    return {"message": "Password reset link sent to email"}

@router.post("/reset-password")
async def reset_password(token: str, new_password: str, db: Session = Depends(get_db)):
    """
    Reset password with token
    """
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.hashed_password = hash_password(new_password)
        db.commit()

        logger.info(f"Password reset for user: {user.email}")
        return {"message": "Password reset successfully"}

    except Exception as e:
        logger.error(f"Password reset failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token"
        )
