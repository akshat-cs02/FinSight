"""
Portfolio management endpoints
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db, User, Portfolio, PortfolioStock
from app.schemas import (
    PortfolioResponse, PortfolioStockResponse, PortfolioStockRequest,
    AssetAllocation
)
from app.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[PortfolioResponse])
async def get_portfolios(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all portfolios for current user
    """
    try:
        portfolios = db.query(Portfolio).filter(
            Portfolio.user_id == int(current_user.id)
        ).all()

        result = []
        for portfolio in portfolios:
            stocks = db.query(PortfolioStock).filter(
                PortfolioStock.portfolio_id == portfolio.id
            ).all()

            result.append(PortfolioResponse(
                id=portfolio.id,
                name=portfolio.name,
                initial_investment=portfolio.initial_investment,
                current_value=portfolio.current_value,
                total_gain_loss=portfolio.total_gain_loss,
                total_gain_loss_percent=portfolio.total_gain_loss_percent,
                stocks=[PortfolioStockResponse.from_orm(s) for s in stocks],
                created_at=portfolio.created_at
            ))

        return result

    except Exception as e:
        logger.error(f"Error fetching portfolios: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch portfolios"
        )

@router.get("/{portfolio_id}", response_model=PortfolioResponse)
async def get_portfolio(
    portfolio_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get specific portfolio
    """
    try:
        portfolio = db.query(Portfolio).filter(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == int(current_user.id)
        ).first()

        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found"
            )

        stocks = db.query(PortfolioStock).filter(
            PortfolioStock.portfolio_id == portfolio.id
        ).all()

        return PortfolioResponse(
            id=portfolio.id,
            name=portfolio.name,
            initial_investment=portfolio.initial_investment,
            current_value=portfolio.current_value,
            total_gain_loss=portfolio.total_gain_loss,
            total_gain_loss_percent=portfolio.total_gain_loss_percent,
            stocks=[PortfolioStockResponse.from_orm(s) for s in stocks],
            created_at=portfolio.created_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching portfolio: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch portfolio"
        )

@router.post("/", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    name: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create new portfolio
    """
    try:
        new_portfolio = Portfolio(
            user_id=int(current_user.id),
            name=name,
            is_default=False
        )
        db.add(new_portfolio)
        db.commit()
        db.refresh(new_portfolio)

        logger.info(f"Created portfolio for user {int(current_user.id)}")

        return PortfolioResponse(
            id=new_portfolio.id,
            name=new_portfolio.name,
            initial_investment=0,
            current_value=0,
            total_gain_loss=0,
            total_gain_loss_percent=0,
            stocks=[],
            created_at=new_portfolio.created_at
        )

    except Exception as e:
        db.rollback()
        logger.error(f"Error creating portfolio: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create portfolio"
        )

@router.post("/{portfolio_id}/add", response_model=PortfolioStockResponse, status_code=status.HTTP_201_CREATED)
async def add_stock(
    portfolio_id: int,
    request: PortfolioStockRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Add stock to portfolio
    """
    try:
        # Verify portfolio ownership
        portfolio = db.query(Portfolio).filter(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == int(current_user.id)
        ).first()

        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found"
            )

        new_stock = PortfolioStock(
            portfolio_id=portfolio_id,
            symbol=request.symbol.upper(),
            quantity=request.quantity,
            purchase_price=request.purchase_price,
            purchase_date=request.purchase_date,
            notes=request.notes
        )

        db.add(new_stock)
        db.commit()
        db.refresh(new_stock)

        logger.info(f"Added stock {request.symbol} to portfolio {portfolio_id}")

        return PortfolioStockResponse.from_orm(new_stock)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding stock: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add stock"
        )

@router.delete("/{portfolio_id}/remove/{stock_id}")
async def remove_stock(
    portfolio_id: int,
    stock_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove stock from portfolio
    """
    try:
        # Verify portfolio ownership
        portfolio = db.query(Portfolio).filter(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == int(current_user.id)
        ).first()

        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found"
            )

        stock = db.query(PortfolioStock).filter(
            PortfolioStock.id == stock_id,
            PortfolioStock.portfolio_id == portfolio_id
        ).first()

        if not stock:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stock not found in portfolio"
            )

        db.delete(stock)
        db.commit()

        logger.info(f"Removed stock {stock_id} from portfolio {portfolio_id}")

        return {"message": "Stock removed successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing stock: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove stock"
        )

@router.get("/{portfolio_id}/performance")
async def get_portfolio_performance(
    portfolio_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get portfolio performance analytics
    """
    try:
        portfolio = db.query(Portfolio).filter(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == int(current_user.id)
        ).first()

        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found"
            )

        return {
            "total_value": portfolio.current_value,
            "total_invested": portfolio.initial_investment,
            "total_gain_loss": portfolio.total_gain_loss,
            "total_gain_loss_percent": portfolio.total_gain_loss_percent,
            "best_performer": None,
            "worst_performer": None,
            "roi": portfolio.total_gain_loss_percent
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting portfolio performance: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get performance data"
        )

@router.get("/{portfolio_id}/allocation", response_model=List[AssetAllocation])
async def get_asset_allocation(
    portfolio_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get asset allocation breakdown
    """
    try:
        portfolio = db.query(Portfolio).filter(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == int(current_user.id)
        ).first()

        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found"
            )

        stocks = db.query(PortfolioStock).filter(
            PortfolioStock.portfolio_id == portfolio_id
        ).all()

        allocation = []
        total_value = sum(s.current_value or (s.quantity * s.purchase_price) for s in stocks) or 1

        for stock in stocks:
            value = stock.current_value or (stock.quantity * stock.purchase_price)
            allocation.append(AssetAllocation(
                symbol=stock.symbol,
                value=value,
                percentage=(value / total_value) * 100
            ))

        return allocation

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting allocation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get allocation data"
        )
