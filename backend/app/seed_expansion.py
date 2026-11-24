# -*- coding: utf-8 -*-
"""将扩充题库写入数据库：幂等，按 question_id 去重，可重复执行。"""
import json

from .database import SessionLocal
from . import models
from .expansion_data import EXPANSION_QUESTIONS


def seed_expansion():
    db = SessionLocal()
    added = 0
    try:
        chapters = {c.code: c.id for c in db.query(models.Chapter).all()}
        kps = {k.code: k.id for k in db.query(models.KnowledgePoint).all()}
        # 按「题干 + 代码」内容指纹去重，保证重复执行不会复制题目
        existing_fingerprints = {
            (q.question_content, q.code_content or "") for q in db.query(models.Question).all()
        }
        max_no = 0
        for q in db.query(models.Question).filter(models.Question.question_id.like("EX%")).all():
            try:
                max_no = max(max_no, int(q.question_id[2:]))
            except ValueError:
                pass

        for ch_code, kp_code, qtype, diff, content, code, options, answer, explanation, tags in EXPANSION_QUESTIONS:
            fingerprint = (content, code or "")
            if fingerprint in existing_fingerprints:
                continue
            existing_fingerprints.add(fingerprint)
            qid = f"EX{max_no + 1:04d}"
            ch_id = chapters.get(ch_code)
            kp_id = kps.get(kp_code)
            if not ch_id or not kp_id:
                print(f"跳过：找不到章节/知识点 {ch_code}/{kp_code}")
                continue
            max_no += 1
            db.add(models.Question(
                question_id=qid, chapter_id=ch_id, knowledge_point_id=kp_id,
                question_type=qtype, difficulty=diff, question_content=content,
                code_content=code or "", options_json=options or "[]",
                correct_answer=answer, explanation=explanation,
                score=3 if diff == "困难" else (2 if qtype in ("编程题", "程序阅读题", "找错题", "代码补全题") else 1),
                tags_json=json.dumps(tags, ensure_ascii=False),
                source_type="preset", status="active",
            ))
            added += 1
        db.commit()
        print(f"扩充完成：新增 {added} 道题，题库现共 {db.query(models.Question).count()} 道。")
    finally:
        db.close()


if __name__ == "__main__":
    seed_expansion()
