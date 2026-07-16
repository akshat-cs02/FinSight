import sqlite3
conn = sqlite3.connect('C:/Users/aksha/Downloads/FinSight/backend/data/finsight.db')
c = conn.cursor()
c.execute("SELECT id, email, hashed_password FROM users WHERE email='finsight@gmail.com'")
row = c.fetchone()
if row:
    print("ID:", row[0])
    print("Email:", row[1])
    print("Hash:", row[2][:50] + "...")
    
    # Try to verify
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    try:
        result = pwd_context.verify("admin123", row[2])
        print("Verify result:", result)
    except Exception as e:
        print("Verify error:", e)
else:
    print("User not found")
conn.close()
