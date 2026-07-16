"""
Report endpoints — return downloadable PDFs and CSVs.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db, User
from app.security import get_current_user
from app.services import reports_service as rs

router = APIRouter()


@router.get("/portfolio/pdf")
def portfolio_pdf(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    pdf = rs.portfolio_pdf(db, int(current_user.id))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=portfolio_report.pdf"},
    )


@router.get("/portfolio/csv")
def portfolio_csv(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    csv_str = rs.portfolio_csv(db, int(current_user.id))
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=portfolio_report.csv"},
    )


@router.get("/stock/{symbol}/pdf")
def stock_pdf(symbol: str):
    try:
        pdf = rs.stock_pdf(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={symbol.upper()}_analysis.pdf"},
    )


@router.get("/stock/{symbol}/csv")
def stock_csv(symbol: str, period: str = "1y"):
    try:
        csv_str = rs.stock_csv(symbol.upper(), period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={symbol.upper()}_history.csv"},
    )
