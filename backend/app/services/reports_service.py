"""
PDF and CSV report generation.
"""
import io
import csv
from datetime import datetime, timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from sqlalchemy.orm import Session

from app.services import portfolio_service as ps
from app.services import market_data_service as mds
from app.services import indicators_service as ind_svc


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Heading1"], fontSize=22, textColor=colors.HexColor("#1e40af"), spaceAfter=12),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontSize=14, textColor=colors.HexColor("#111827"), spaceBefore=12, spaceAfter=6),
        "body": base["BodyText"],
        "meta": ParagraphStyle("Meta", parent=base["Normal"], fontSize=9, textColor=colors.grey),
    }


def _section_table(rows):
    t = Table(rows, hAlign="LEFT", colWidths=[5 * cm, 8 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
    ]))
    return t


# ============ PORTFOLIO PDF ============
def portfolio_pdf(db: Session, user_id: int = None) -> bytes:
    summary = ps.get_summary(db, user_id)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="FinSight Portfolio Report")
    s = _styles()
    story = []

    story.append(Paragraph("FinSight – Portfolio Report", s["title"]))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", s["meta"]))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Summary", s["h2"]))
    story.append(_section_table([
        ["Metric", "Value"],
        ["Total Invested", f"${summary['total_invested']:.2f}"],
        ["Current Value", f"${summary['total_value']:.2f}"],
        ["Total Gain/Loss", f"${summary['total_gain_loss']:.2f}"],
        ["Total Return %", f"{summary['total_gain_loss_percent']:.2f}%"],
        ["Today's P/L", f"${summary['today_profit_loss']:.2f}"],
        ["Holdings", str(summary["holdings_count"])],
    ]))

    if summary["holdings"]:
        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph("Holdings", s["h2"]))
        rows = [["Symbol", "Qty", "Buy Price", "Current", "Value", "P/L", "P/L %"]]
        for h in summary["holdings"]:
            rows.append([
                h["symbol"], f"{h['quantity']:.2f}", f"${h['purchase_price']:.2f}",
                f"${h['current_price']:.2f}", f"${h['current_value']:.2f}",
                f"${h['gain_loss']:.2f}", f"{h['gain_loss_percent']:.2f}%",
            ])
        t = Table(rows, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10b981")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        story.append(t)

    if summary["allocation"]:
        story.append(Spacer(1, 0.5 * cm))
        story.append(Paragraph("Asset Allocation", s["h2"]))
        rows = [["Symbol", "Value", "% of Portfolio"]]
        for a in summary["allocation"]:
            rows.append([a["symbol"], f"${a['value']:.2f}", f"{a['percentage']:.2f}%"])
        story.append(_section_table(rows))

    doc.build(story)
    return buf.getvalue()


def portfolio_csv(db: Session, user_id: int = None) -> str:
    summary = ps.get_summary(db, user_id)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Symbol", "Quantity", "Purchase Price", "Current Price", "Invested", "Current Value", "Gain/Loss", "Gain/Loss %"])
    for h in summary["holdings"]:
        w.writerow([
            h["symbol"], h["quantity"], h["purchase_price"], h["current_price"],
            h["invested"], h["current_value"], h["gain_loss"], h["gain_loss_percent"],
        ])
    w.writerow([])
    w.writerow(["TOTAL", "", "", "", summary["total_invested"], summary["total_value"], summary["total_gain_loss"], summary["total_gain_loss_percent"]])
    return out.getvalue()


# ============ STOCK ANALYSIS PDF ============
def stock_pdf(symbol: str) -> bytes:
    quote = mds.get_stock_quote(symbol)
    try:
        indicators = ind_svc.calculate_indicators(symbol, "6mo")
    except Exception:
        indicators = None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=f"FinSight – {symbol}")
    s = _styles()
    story = []

    story.append(Paragraph(f"FinSight – {symbol} Analysis", s["title"]))
    story.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", s["meta"]))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Quote", s["h2"]))
    story.append(_section_table([
        ["Field", "Value"],
        ["Symbol", quote["symbol"]],
        ["Name", quote.get("name", "")],
        ["Price", f"${quote['price']:.2f} {quote.get('currency','USD')}"],
        ["Change", f"${quote['change']:.2f} ({quote['change_percent']:.2f}%)"],
        ["Open / High / Low", f"${quote['open']:.2f} / ${quote['high']:.2f} / ${quote['low']:.2f}"],
        ["Volume", f"{quote['volume']:,}"],
        ["52w High / Low", f"{quote.get('fifty_two_week_high','-')} / {quote.get('fifty_two_week_low','-')}"],
        ["Market Cap", f"{quote.get('market_cap','-')}"],
        ["P/E", f"{quote.get('pe_ratio','-')}"],
    ]))

    if indicators:
        story.append(Spacer(1, 0.4 * cm))
        story.append(Paragraph("Technical Indicators", s["h2"]))
        lat = indicators["latest"]
        story.append(_section_table([
            ["Indicator", "Value"],
            ["Signal", indicators["signal"]],
            ["RSI (14)", f"{lat.get('rsi_14', '-')}"],
            ["SMA 20 / 50 / 200", f"{lat.get('sma_20')} / {lat.get('sma_50')} / {lat.get('sma_200')}"],
            ["EMA 12 / 26", f"{lat.get('ema_12')} / {lat.get('ema_26')}"],
            ["MACD / Signal", f"{lat.get('macd')} / {lat.get('macd_signal')}"],
            ["Bollinger U / M / L", f"{lat.get('bollinger_upper')} / {lat.get('bollinger_middle')} / {lat.get('bollinger_lower')}"],
        ]))

    doc.build(story)
    return buf.getvalue()


def stock_csv(symbol: str, period: str = "1y") -> str:
    hist = mds.get_historical_data(symbol, period)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Open", "High", "Low", "Close", "Volume"])
    for d in hist["data"]:
        w.writerow([d["date"], d["open"], d["high"], d["low"], d["close"], d["volume"]])
    return out.getvalue()
