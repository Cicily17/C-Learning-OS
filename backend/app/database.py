import os

# 当前运行环境的应用控制策略会拦截 SQLAlchemy 2.x 的 C 扩展 DLL，
# 因此使用 1.4 的纯 Python 实现。此设置必须在 import sqlalchemy 之前生效。
os.environ.setdefault("SQLALCHEMY_NO_CEXTENSIONS", "1")

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
