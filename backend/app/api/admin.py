"""
Admin panel endpoints
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import (
    get_db, User, AuditLog, Portfolio, Prediction
)
from app.schemas import UserManagementResponse, AuditLogResponse, SystemStats
from app.security import get_current_admin

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/users", response_model=List[UserManagementResponse])
async def list_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all users (admin only)
    """
    try:
        users = db.query(User).all()
        return [UserManagementResponse.from_orm(u) for u in users]

    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list users"
        )

@router.get("/users/{user_id}", response_model=UserManagementResponse)
async def get_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get user details
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return UserManagementResponse.from_orm(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get user"
        )

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a user
    """
    try:
        if user_id == current_admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account"
            )

        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Delete user's portfolios and data
        db.query(Portfolio).filter(Portfolio.user_id == user_id).delete()
        db.delete(user)
        db.commit()

        logger.info(f"Deleted user {user_id}")

        return {"message": "User deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user"
        )

@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Toggle user active status
    """
    try:
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.is_active = not user.is_active
        db.commit()

        logger.info(f"Toggled active status for user {user_id}")

        return {
            "user_id": user_id,
            "is_active": user.is_active
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error toggling user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle user status"
        )

@router.post("/models/retrain")
async def retrain_models(
    symbols: List[str] = None,
    current_admin: User = Depends(get_current_admin)
):
    """
    Trigger model retraining
    """
    try:
        # TODO: Implement actual retraining logic
        logger.info(f"Retraining models for symbols: {symbols}")

        return {
            "message": "Model retraining started",
            "symbols": symbols or "all",
            "status": "training"
        }

    except Exception as e:
        logger.error(f"Error retraining models: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrain models"
        )

@router.get("/logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    limit: int = 100,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get audit logs
    """
    try:
        logs = db.query(AuditLog).order_by(
            AuditLog.created_at.desc()
        ).limit(limit).all()

        return [AuditLogResponse.from_orm(l) for l in logs]

    except Exception as e:
        logger.error(f"Error fetching logs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch logs"
        )

@router.get("/stats", response_model=SystemStats)
async def get_system_stats(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get system statistics
    """
    try:
        total_users = db.query(User).count()
        active_users = db.query(User).filter(User.is_active == True).count()
        total_portfolios = db.query(Portfolio).count()
        total_predictions = db.query(Prediction).count()

        return SystemStats(
            total_users=total_users,
            active_users=active_users,
            total_portfolios=total_portfolios,
            total_predictions=total_predictions,
            model_accuracy=0.72,
            last_data_update=datetime.now(timezone.utc)
        )

    except Exception as e:
        logger.error(f"Error getting system stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get statistics"
        )

from datetime import datetime, timezone
