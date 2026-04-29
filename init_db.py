"""
初期データ投入スクリプト
Run: python init_db.py
"""
from database import engine, SessionLocal
import models
from auth import hash_password
from datetime import datetime
from sqlalchemy import text

# ─── Schema Migration (safe ALTER TABLE for SQLite) ───────────────────────────
def migrate_columns():
    """Add any missing columns to existing tables without dropping data."""
    migrations = [
        # users table
        ("users", "is_hidden", "BOOLEAN DEFAULT 0"),
        # reports table
        ("reports", "ai_score", "INTEGER"),
        ("reports", "ai_score_details", "TEXT"),
        ("reports", "has_duplicate_warning", "BOOLEAN DEFAULT 0"),
        ("reports", "duplicate_warnings", "TEXT"),
        ("reports", "estimated_quantity", "VARCHAR"),
        ("reports", "comm_type", "VARCHAR"),
        ("reports", "comm_count", "VARCHAR"),
        ("reports", "comm_person1_name", "VARCHAR"),
        ("reports", "comm_person1_title", "VARCHAR"),
        ("reports", "comm_person2_name", "VARCHAR"),
        ("reports", "comm_person2_title", "VARCHAR"),
        # dealer_profiles table
        ("dealer_profiles", "invitation_code", "VARCHAR"),
        ("dealer_profiles", "invited_by", "INTEGER"),
    ]

    with engine.connect() as conn:
        for table, column, coltype in migrations:
            # Check if column already exists
            result = conn.execute(text(f"PRAGMA table_info({table})"))
            existing = [row[1] for row in result.fetchall()]
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                print(f"  ✔ Added column {table}.{column}")
            else:
                print(f"  · Column {table}.{column} already exists")
        conn.commit()

    # Create invitation_codes table if missing
    with engine.connect() as conn:
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='invitation_codes'"))
        if not result.fetchone():
            conn.execute(text("""
                CREATE TABLE invitation_codes (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    code VARCHAR NOT NULL UNIQUE,
                    created_by INTEGER REFERENCES users(id),
                    used_by INTEGER REFERENCES users(id),
                    expires_at DATETIME,
                    is_used BOOLEAN DEFAULT 0,
                    is_revoked BOOLEAN DEFAULT 0,
                    note VARCHAR,
                    used_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
            print("  ✔ Created table invitation_codes")
        else:
            print("  · Table invitation_codes already exists")


print("🔧 Running schema migration…")
#migrate_columns()
models.Base.metadata.create_all(bind=engine)  # ← テーブル作成
print("🔧 Running schema migration…")
migrate_columns()  # ← その後にマイグレーション

# ─── Create tables from models (idempotent) ───────────────────────────────────
models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ─── Platform Admin ───────────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "admin").first():
    admin = models.User(
        username="admin",
        email="admin@nakamura.com",
        password_hash=hash_password("admin123"),
        role="admin",
        language="zh",
    )
    db.add(admin)
    db.flush()
    emp = models.Employee(user_id=admin.id, name="管理员", department="管理部", review_level=3, can_review=True, can_view_all=True)
    db.add(emp)
    print("✅ Admin created: admin / admin123")

# ─── Super Admin (hidden) ─────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "v007").first():
    su = models.User(
        username="v007",
        email="v007@nakamura-internal.com",
        password_hash=hash_password("Admin168!"),
        role="super_admin",
        language="zh",
        is_hidden=True,
    )
    db.add(su)
    db.flush()
    emp = models.Employee(user_id=su.id, name="超级管理员", department="系统管理", review_level=3, can_review=True, can_view_all=True)
    db.add(emp)
    print("✅ Super admin created: v007 / Admin168! (hidden)")

# ─── Maintenance Account (hidden) ────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "aftersh").first():
    maint = models.User(
        username="aftersh",
        email="aftersh@nakamura-internal.com",
        password_hash=hash_password("tyugokush021!"),
        role="maintenance",
        language="zh",
        is_hidden=True,
    )
    db.add(maint)
    db.flush()
    emp = models.Employee(user_id=maint.id, name="システム保守", department="IT部", review_level=3, can_review=True, can_view_all=True)
    db.add(emp)
    print("✅ Maintenance created: aftersh / tyugokush021! (hidden)")

# ─── Level 1 Reviewer ─────────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "reviewer1").first():
    u = models.User(username="reviewer1", email="r1@nakamura.com", password_hash=hash_password("review123"), role="platform_staff", language="zh")
    db.add(u)
    db.flush()
    db.add(models.Employee(user_id=u.id, name="一级审核员", department="销售部", review_level=1, can_review=True, can_view_all=True))
    print("✅ L1 reviewer: reviewer1 / review123")

# ─── Level 2 Reviewer ─────────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "reviewer2").first():
    u = models.User(username="reviewer2", email="r2@nakamura.com", password_hash=hash_password("review123"), role="platform_staff", language="zh")
    db.add(u)
    db.flush()
    db.add(models.Employee(user_id=u.id, name="二级审核员", department="技术部", review_level=2, can_review=True, can_view_all=True))
    print("✅ L2 reviewer: reviewer2 / review123")

# ─── Level 3 Reviewer ─────────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "reviewer3").first():
    u = models.User(username="reviewer3", email="r3@nakamura.com", password_hash=hash_password("review123"), role="platform_staff", language="zh")
    db.add(u)
    db.flush()
    db.add(models.Employee(user_id=u.id, name="三级审核员", department="管理部", review_level=3, can_review=True, can_view_all=True))
    print("✅ L3 reviewer: reviewer3 / review123")

# ─── Demo Dealer ─────────────────────────────────────────────────────────────
if not db.query(models.User).filter(models.User.username == "dealer_demo").first():
    u = models.User(username="dealer_demo", email="dealer@demo.com", password_hash=hash_password("dealer123"), role="dealer", language="zh")
    db.add(u)
    db.flush()
    db.add(models.DealerProfile(user_id=u.id, company_name_cn="演示代理商有限公司", company_name_en="Demo Dealer Co., Ltd.", contact_name="张三", phone="021-12345678", email="dealer@demo.com"))
    print("✅ Demo dealer: dealer_demo / dealer123")

# ─── Product Categories ───────────────────────────────────────────────────────
cats = [
    ("精密加工", "Precision Machining", "精密加工"),
    ("数控机床", "CNC Machine Tools", "CNC工作機械"),
    ("工装夹具", "Fixtures & Tooling", "治具・工具"),
    ("测量检测", "Measurement & Inspection", "測定・検査"),
]
for cn, en, ja in cats:
    if not db.query(models.ProductCategory).filter(models.ProductCategory.name_cn == cn).first():
        db.add(models.ProductCategory(name_cn=cn, name_en=en, name_ja=ja))

db.commit()
db.close()

print("\n🎉 Database initialized successfully!")
print("\n─── Login Accounts ───────────────────────────────────────")
print("  Super Admin:     v007       / Admin168!        (hidden)")
print("  Maintenance:     aftersh    / tyugokush021!    (hidden)")
print("  Platform Admin:  admin      / admin123")
print("  L1 Reviewer:     reviewer1  / review123")
print("  L2 Reviewer:     reviewer2  / review123")
print("  L3 Reviewer:     reviewer3  / review123")
print("  Demo Dealer:     dealer_demo/ dealer123")
print("─────────────────────────────────────────────────────────")
print("\nStart server: uvicorn main:app --reload --port 9090")
