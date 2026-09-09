import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:***REMOVED***@ep-misty-violet-ayqmhe0o-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Users table
cur.execute("SELECT id, username, email, first_name, is_admin, created_at FROM users ORDER BY id")
print("=== USERS ===")
for r in cur.fetchall():
    print(f"  ID={r[0]:>5} Username={r[1]:>15} Email={r[2]:>30} Name={r[3]} Admin={r[4]} Created={r[5]}")

# Paper accounts
cur.execute("SELECT user_id, balance, initial_balance, total_pnl, total_trades, wins, losses FROM paper_accounts ORDER BY user_id")
print("\n=== PAPER ACCOUNTS ===")
for r in cur.fetchall():
    print(f"  UserID={str(r[0]):>5} Bal=${r[1]:>10.2f} Init=${r[2]:>8.0f} PnL=${r[3]:>10.2f} Trades={r[4]} W={r[5]} L={r[6]}")

# Paper positions breakdown per user
cur.execute("""
    SELECT user_id, status, COUNT(*), MIN(entry_time), MAX(entry_time)
    FROM paper_positions
    GROUP BY user_id, status
    ORDER BY user_id, status
""")
print("\n=== PAPER POSITIONS (per user per status) ===")
for r in cur.fetchall():
    print(f"  UserID={str(r[0]):>5} Status={r[1]:>10} Count={r[2]} First={r[3]} Last={r[4]}")

# Check if user 0 positions overlap with user 24 positions (same signal_ids)
cur.execute("""
    SELECT p1.signal_id, p1.user_id as user_a, p2.user_id as user_b
    FROM paper_positions p1
    JOIN paper_positions p2 ON p1.signal_id = p2.signal_id AND p1.user_id != p2.user_id
    WHERE p1.signal_id IS NOT NULL
    LIMIT 10
""")
print("\n=== SHARED SIGNALS (same signal placed for multiple users) ===")
rows = cur.fetchall()
if rows:
    for r in rows:
        print(f"  SignalID={r[0]} UserA={r[1]} UserB={r[2]}")
else:
    print("  (none)")

conn.close()
