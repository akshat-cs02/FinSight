import sqlite3
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

new_hash = pwd_context.hash("admin123")

conn = sqlite3.connect('C:/Users/aksha/Downloads/FinSight/backend/data/tickerscope.db')
c = conn.cursor()
c.execute("UPDATE users SET hashed_password=? WHERE email='tickerscope@gmail.com'", (new_hash,))
conn.commit()
print("Updated rows:", c.rowcount)

# Verify
c.execute("SELECT hashed_password FROM users WHERE email='tickerscope@gmail.com'")
row = c.fetchone()
result = pwd_context.verify("admin123", row[0])
print("Verify after update:", result)
conn.close()
