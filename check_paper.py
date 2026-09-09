import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:***REMOVED***@ep-misty-violet-ayqmhe0o-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()
cur.execute("SELECT user_id, balance, initial_balance, total_pnl, total_trades, wins, losses FROM paper_accounts ORDER BY user_id")
rows = cur.fetchall()
for r in rows:
    print(f"User={r[0]:>30} Bal=${r[1]:>10.2f} Init=${r[2]:>8.0f} PnL=${r[3]:>10.2f} Trades={r[4]} W={r[5]} L={r[6]}")
cur.execute("SELECT COUNT(*) FROM paper_accounts")
print(f"\nTotal accounts: {cur.fetchone()[0]}")
cur.execute("SELECT user_id, COUNT(*) as cnt, MIN(entry_time) as first, MAX(entry_time) as last FROM paper_positions GROUP BY user_id ORDER BY cnt DESC")
print("\nPositions per user:")
for r in cur.fetchall():
    print(f"User={r[0]:>30} Count={r[1]} First={r[2]} Last={r[3]}")
cur.execute("SELECT signal_id, COUNT(DISTINCT user_id) FROM paper_positions GROUP BY signal_id HAVING COUNT(DISTINCT user_id) > 1 ORDER BY COUNT(DISTINCT user_id) DESC LIMIT 5")
print("\nSignals shared across users:")
for r in cur.fetchall():
    print(f"SignalID={r[0]} Users={r[1]}")
conn.close()
