# -*- coding: utf-8 -*-
"""把 C Learning OS 打包成「单端口」可发布版本（FastAPI + 静态前端 + SQLite）。

产物结构：
    build/single-port/
    ├── app/                后端代码
    ├── static/             前端构建产物
    ├── seed.db             内容种子库（章节/知识点/题库/试卷，不含用户数据）
    ├── main.py             单端口入口（API + 静态站点 + SPA 回退）
    ├── requirements.txt
    └── .env                运行配置（SECRET_KEY 随机生成）

用法：
    npm --prefix frontend run build          # 先构建前端
    python tools/build_single_port.py        # 再打包

默认从 backend/.env 里的 DATABASE_URL 读取源库并导出内容表；
也可用 --database-url 指定其它库。
"""
import argparse
import os
import re
import secrets
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"
SINGLE_PORT = ROOT / "single_port"

TABLES_ORDER = [
    "Chapter",
    "KnowledgePoint",
    "KnowledgeDependency",
    "Question",
    "QuestionOption",
    "ExamPaper",
    "ExamQuestion",
    "DailyTask",
    "Achievement",
]


def export_seed(target: Path, database_url: str | None) -> None:
    """把源库的内容表复制到 SQLite 种子库（不导出任何用户数据）。"""
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    if database_url:
        os.environ["DATABASE_URL"] = database_url

    from sqlalchemy import create_engine  # noqa: WPS433
    from sqlalchemy.orm import sessionmaker

    from app import models
    from app.database import Base, SessionLocal

    if target.exists():
        target.unlink()
    sqlite_engine = create_engine(f"sqlite:///{target.as_posix()}")
    Base.metadata.create_all(sqlite_engine)
    dest = sessionmaker(bind=sqlite_engine)()
    src = SessionLocal()
    total = 0
    try:
        for name in TABLES_ORDER:
            model = getattr(models, name)
            rows = src.query(model).all()
            for row in rows:
                data = {c.name: getattr(row, c.name) for c in model.__table__.columns}
                dest.add(model(**data))
            dest.commit()
            total += len(rows)
            print(f"  {model.__tablename__:<24} {len(rows):>5}")
    finally:
        src.close()
        dest.close()
    print(f"  共 {total} 行 → {target} ({target.stat().st_size // 1024} KB)")


def read_ai_env() -> list[str]:
    env_path = BACKEND / ".env"
    if not env_path.exists():
        return ["AI_PROVIDER=", "AI_API_KEY=", "AI_MODEL=", "AI_BASE_URL="]
    lines = env_path.read_text(encoding="utf-8").splitlines()
    picked = [ln.strip() for ln in lines
              if re.match(r"^(AI_PROVIDER|AI_API_KEY|AI_MODEL|AI_BASE_URL)=", ln.strip())]
    return picked or ["AI_PROVIDER=", "AI_API_KEY=", "AI_MODEL=", "AI_BASE_URL="]


def main() -> None:
    parser = argparse.ArgumentParser(description="打包 C Learning OS 单端口版本")
    parser.add_argument("--out", default=str(ROOT / "build" / "single-port"))
    parser.add_argument("--database-url", default=None,
                        help="源数据库连接串（默认读 backend/.env）")
    parser.add_argument("--skip-seed", action="store_true",
                        help="跳过种子库导出，沿用已有 seed.db")
    args = parser.parse_args()

    if not (FRONTEND_DIST / "index.html").exists():
        sys.exit("未找到 frontend/dist，请先执行：npm --prefix frontend run build")

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    print(f"输出目录：{out}")

    print("[1/4] 复制后端代码")
    shutil.copytree(BACKEND / "app", out / "app", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    print("[2/4] 复制前端产物")
    shutil.copytree(FRONTEND_DIST, out / "static", dirs_exist_ok=True)

    print("[3/4] 复制单端口入口")
    for name in ("main.py", "requirements.txt"):
        shutil.copyfile(SINGLE_PORT / name, out / name)

    if args.skip_seed and (out / "seed.db").exists():
        print("[4/4] 跳过种子库导出")
    else:
        print("[4/4] 导出内容种子库")
        export_seed(out / "seed.db", args.database_url)

    env_lines = [
        "DATABASE_URL=sqlite:///./data/app.db",
        f"SECRET_KEY={secrets.token_hex(32)}",
        "CORS_ORIGINS=*",
        *read_ai_env(),
        "",
    ]
    (out / ".env").write_text("\n".join(env_lines), encoding="utf-8")

    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1024 / 1024
    print(f"完成：{out}（{size:.1f} MB）")
    print("启动：cd build/single-port && pip install -r requirements.txt && python main.py")


if __name__ == "__main__":
    main()
