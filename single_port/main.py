# -*- coding: utf-8 -*-
"""C Learning OS 单端口服务：FastAPI API + 已构建前端 + 随包 SQLite 数据库。

启动后会：
1. 若 data/app.db 不存在，则用 seed.db 初始化（首次启动即带完整题库）；
2. 挂载 /assets 静态资源，其余路径回退到 index.html（支持前端路由刷新）。

用法：
    python main.py            # 默认 8000 端口
    PORT=8080 python main.py
"""
import os
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
DATA.mkdir(exist_ok=True)
DB = DATA / "app.db"

if not DB.exists() and (BASE / "seed.db").exists():
    shutil.copyfile(BASE / "seed.db", DB)

os.environ.setdefault("DATABASE_URL", f"sqlite:///{DB.as_posix()}")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.routers import ai, auth, exams, game, learning, practice, questions  # noqa: E402

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragma(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=15000")
        cur.close()


app = FastAPI(title="C Learning OS", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, learning, practice, exams, game, ai, questions):
    app.include_router(module.router)


@app.on_event("startup")
def _startup():
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "C Learning OS", "db": "sqlite"}


STATIC = BASE / "static"
if (STATIC / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if full_path:
        target = (STATIC / full_path).resolve()
        if str(target).startswith(str(STATIC.resolve())) and target.is_file():
            return FileResponse(target)
    return FileResponse(STATIC / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
