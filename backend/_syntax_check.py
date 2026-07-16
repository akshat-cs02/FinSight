import ast, os, sys
base = r'C:\Users\aksha\Downloads\FinSight\backend'
files = [
  'app/api/admin.py','app/api/forex.py','app/api/ws.py','app/security.py','app/database.py','app/schemas.py',
  'app/training/train_xgboost.py','app/training/train_lstm.py',
  'app/services/reports_service.py','app/services/prediction_service.py',
  'app/services/backtesting_service.py','app/services/market_data_service.py',
  'app/services/portfolio_service.py','app/services/watchlist_service.py',
  'app/services/signal_service.py','app/main.py'
]
fail = 0
for f in files:
    p = os.path.join(base, f)
    try:
        ast.parse(open(p, encoding='utf-8').read())
        print('OK :', f)
    except Exception as e:
        print('FAIL:', f, e); fail+=1
sys.exit(fail)
