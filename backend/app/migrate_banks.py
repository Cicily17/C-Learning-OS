# -*- coding: utf-8 -*-
"""题库分类迁移：为 questions 增加 banks_json 列并为存量题目打标签。幂等可重复执行。"""
import json

from sqlalchemy import text

from .database import SessionLocal, engine
from . import models
from .question_banks import classify_banks


def ensure_column():
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(questions)")).fetchall()} \
            if engine.dialect.name == "sqlite" else \
            {r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='questions'"
            )).fetchall()}
        if "banks_json" not in cols:
            conn.execute(text("ALTER TABLE questions ADD COLUMN banks_json TEXT DEFAULT '[]'"))
            print("已添加 questions.banks_json 列")


def run():
    ensure_column()
    db = SessionLocal()
    updated = 0
    for q in db.query(models.Question).all():
        banks = classify_banks(q.question_type, q.difficulty, q.tags_json)
        db.execute(
            text("UPDATE questions SET banks_json=:b WHERE id=:id"),
            {"b": json.dumps(banks, ensure_ascii=False), "id": q.id},
        )
        updated += 1
    db.commit()
    db.close()
    print(f"已为 {updated} 道题目打上题库标签")
    show_stats()


def show_stats():
    from collections import Counter
    db = SessionLocal()
    c = Counter()
    for q in db.query(models.Question).filter(models.Question.status == "active").all():
        try:
            for b in json.loads(q.banks_json or "[]"):
                c[b] += 1
        except (ValueError, TypeError):
            pass
    db.close()
    print("各题库题量：", dict(c))


if __name__ == "__main__":
    run()
