import json
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import game_service, models, question_banks, question_generator, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/practice", tags=["practice"])


def normalize(answer: str) -> str:
    return "".join(str(answer).split()).upper().replace("，", ",").replace("、", ",")


def is_correct(user_answer: str, correct_answer: str) -> bool:
    u = normalize(user_answer)
    c = normalize(correct_answer)
    if not u:
        return False
    if c in ("正确", "对", "TRUE", "T", "Y", "YES", "A"):
        return u in ("正确", "对", "TRUE", "T", "Y", "YES", "A")
    if c in ("错误", "错", "FALSE", "F", "N", "NO", "B"):
        return u in ("错误", "错", "FALSE", "F", "N", "NO", "B")
    if "," in c:
        return set(u.split(",")) == set(c.split(","))
    return u == c


def _question_payload(q: models.Question) -> dict:
    return {
        "id": q.id,
        "question_id": q.question_id,
        "chapter_id": q.chapter_id,
        "knowledge_point_id": q.knowledge_point_id,
        "question_type": q.question_type,
        "difficulty": q.difficulty,
        "question_content": q.question_content,
        "code_content": q.code_content,
        "options_json": q.options_json,
        "score": q.score,
        "tags_json": q.tags_json,
        "source_type": q.source_type,
    }


@router.post("/sessions", response_model=dict)
def create_session(
    payload: schemas.PracticeConfigIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.Question).filter(models.Question.status == "active")
    if payload.knowledge_point_ids:
        query = query.filter(models.Question.knowledge_point_id.in_(payload.knowledge_point_ids))
    if payload.chapter_ids:
        query = query.filter(models.Question.chapter_id.in_(payload.chapter_ids))
    if payload.difficulties:
        query = query.filter(models.Question.difficulty.in_(payload.difficulties))
    if payload.question_types:
        query = query.filter(models.Question.question_type.in_(payload.question_types))

    bank = payload.bank.strip() if payload.bank else ""
    valid_bank = bank if bank in question_banks.BANK_KEYS else ""

    def fetch_candidates():
        rows = query.all()
        if valid_bank:
            # 多标签题库：JSON 数组成员匹配（在 Python 侧过滤，避免不同数据库方言差异）
            rows = [q for q in rows if question_banks.in_bank(q.banks_json, valid_bank)]
        return rows

    candidates = fetch_candidates()
    auto_generated = 0

    if valid_bank == "ai":
        # AI 题库：完全按用户勾选的知识点/难度/题型实时生成，不等现有题库。
        qtype = payload.question_types[0] if payload.question_types else "单项选择题"
        difficulty = payload.difficulties[0] if payload.difficulties else "中等"
        generated, report = question_generator.generate_questions(
            db, payload.knowledge_point_ids, qtype, difficulty, payload.count
        )
        if not generated:
            raise HTTPException(status_code=422, detail=f"AI 未能生成有效题目：{report}")
        for q in generated:
            q["banks_json"] = json.dumps(["ai"], ensure_ascii=False)
        ids = question_generator.persist_questions(db, generated, user.id, "ai")
        candidates = [db.query(models.Question).filter(models.Question.question_id == qid).first()
                      for qid in ids]
        candidates = [q for q in candidates if q]
        auto_generated = len(candidates)
        if len(candidates) < payload.count:
            raise HTTPException(status_code=422, detail="AI 生成题目不足，请放宽条件后重试")
    else:
        shortage = payload.count - len(candidates)
        if shortage > 0:
            # 题量不足时，按用户选定的条件真实生成题目并写入题库，而不是虚构或报错。
            qtype = payload.question_types[0] if payload.question_types else "单项选择题"
            difficulty = payload.difficulties[0] if payload.difficulties else "入门"
            generated, report = question_generator.generate_questions(
                db, payload.knowledge_point_ids, qtype, difficulty, shortage
            )
            if generated:
                if valid_bank:
                    # 自动补充的题目也归入当前题库，确保按题库组卷能取到新题
                    for q in generated:
                        q["banks_json"] = json.dumps([valid_bank], ensure_ascii=False)
                question_generator.persist_questions(db, generated, user.id, "ai")
                auto_generated = len(generated)
                # 重新查询，把新题纳入候选
                candidates = fetch_candidates()
    if len(candidates) < payload.count:
        raise HTTPException(
            status_code=409,
            detail=(f"符合条件并成功生成的题目只有 {len(candidates)} 道，少于请求的 {payload.count} 道。"
                    "请放宽知识点、难度或题型条件后重试。系统不会虚构题目。"),
        )

    picked = random.sample(candidates, payload.count)
    time_limit = payload.time_limit_minutes * 60 if payload.time_limit_minutes else None
    session = models.PracticeSession(
        user_id=user.id,
        config_json=json.dumps(payload.model_dump(), ensure_ascii=False),
        time_limit_seconds=time_limit,
        total_count=payload.count,
    )
    db.add(session)
    db.flush()

    for q in picked:
        db.add(models.PracticeAnswer(session_id=session.id, question_id=q.id))

    db.commit()
    return {
        "session_id": session.id,
        "total_count": session.total_count,
        "time_limit_seconds": time_limit,
        "auto_generated": auto_generated,
        "questions": [_question_payload(q) for q in picked],
    }


@router.get("/sessions/{session_id}", response_model=dict)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="练习会话不存在")
    answers = (
        db.query(models.PracticeAnswer)
        .filter(models.PracticeAnswer.session_id == session_id)
        .all()
    )
    questions = []
    for ans in answers:
        q = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
        if q:
            item = _question_payload(q)
            item["user_answer"] = ans.user_answer
            item["hint_level_used"] = ans.hint_level_used
            item["viewed_answer"] = ans.viewed_answer
            questions.append(item)
    return {
        "session_id": session.id,
        "status": session.status,
        "started_at": session.started_at.isoformat(),
        "time_limit_seconds": session.time_limit_seconds,
        "total_count": session.total_count,
        "questions": questions,
    }


@router.post("/sessions/{session_id}/answers", response_model=dict)
def save_answer(
    session_id: str,
    payload: schemas.PracticeAnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session or session.status != "in_progress":
        raise HTTPException(status_code=404, detail="练习会话不可作答")

    ans = (
        db.query(models.PracticeAnswer)
        .filter(
            models.PracticeAnswer.session_id == session_id,
            models.PracticeAnswer.question_id == payload.question_id,
        )
        .first()
    )
    if not ans:
        raise HTTPException(status_code=404, detail="题目不属于本会话")
    q = db.query(models.Question).filter(models.Question.id == payload.question_id).first()

    ans.user_answer = payload.user_answer
    ans.time_spent_seconds = payload.time_spent_seconds
    ans.hint_level_used = payload.hint_level_used
    ans.viewed_answer = payload.viewed_answer
    ans.attempted_at = datetime.now(timezone.utc)
    correct = is_correct(payload.user_answer, q.correct_answer) if q else False
    ans.is_correct = correct
    db.commit()
    return {"saved": True, "is_correct": correct, "is_answered": bool(payload.user_answer.strip())}


@router.post("/sessions/{session_id}/hint", response_model=schemas.HintOut)
def get_hint(
    session_id: str,
    question_id: str,
    level: int = 1,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if level not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="提示层级只能是 1、2、3")
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="练习会话不存在")
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == q.knowledge_point_id).first()
    ans = (
        db.query(models.PracticeAnswer)
        .filter(
            models.PracticeAnswer.session_id == session_id,
            models.PracticeAnswer.question_id == question_id,
        )
        .first()
    )
    if ans:
        ans.hint_level_used = max(ans.hint_level_used, level)
        db.commit()

    name = kp.name if kp else "相关知识点"
    summary = kp.summary if kp and kp.summary else "回顾本章核心概念"
    type_hint = {
        "单项选择题": "先逐一排除与概念定义冲突的选项。",
        "多项选择题": "逐项独立判断，不要因为某个选项眼熟就勾选。",
        "判断题": "回到概念的精确定义，注意绝对化表述。",
        "填空题": "关注语法关键字与上下文类型是否匹配。",
        "程序阅读题": "按顺序跟踪变量取值，不要跳步。",
        "程序结果分析题": "在纸上列出每一轮循环的变量状态。",
        "找错题": "优先检查语法边界、分号、下标与类型。",
        "代码补全题": "根据前后文推断缺失部分承担的职责。",
        "编程题": "先写清输入输出，再拆解为顺序、分支或循环结构。",
    }.get(q.question_type, "从概念定义出发逐步推理。")

    hints = {
        1: f"相关知识点：{name}。{summary}",
        2: f"解题方向：这是一道{q.question_type}（{q.difficulty}）。{type_hint}",
        3: f"关键思路：{type_hint} 结合题干条件逐步推导；本题涉及「{name}」，不要凭第一直觉作答。",
    }
    return schemas.HintOut(level=level, content=hints[level], mode="内置分层提示")


@router.get("/sessions/{session_id}/answer", response_model=dict)
def reveal_answer(
    session_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="练习会话不存在")
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    ans = (
        db.query(models.PracticeAnswer)
        .filter(
            models.PracticeAnswer.session_id == session_id,
            models.PracticeAnswer.question_id == question_id,
        )
        .first()
    )
    if ans:
        ans.viewed_answer = True
        db.commit()
    return {
        "correct_answer": q.correct_answer,
        "explanation": q.explanation,
        "question_content": q.question_content,
        "code_content": q.code_content,
    }


@router.post("/sessions/{session_id}/favorite", response_model=schemas.MessageOut)
def favorite_question(
    session_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="练习会话不存在")
    fav = (
        db.query(models.Favorite)
        .filter(
            models.Favorite.user_id == user.id,
            models.Favorite.target_type == "question",
            models.Favorite.target_id == question_id,
        )
        .first()
    )
    if fav:
        db.delete(fav)
        message = "已取消收藏"
    else:
        db.add(models.Favorite(user_id=user.id, target_type="question", target_id=question_id))
        message = "已收藏"
    db.commit()
    return schemas.MessageOut(message=message)


@router.post("/sessions/{session_id}/submit", response_model=schemas.PracticeSubmitOut)
def submit_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="练习会话不存在")
    if session.status == "submitted":
        raise HTTPException(status_code=400, detail="本次练习已提交")

    answers = (
        db.query(models.PracticeAnswer)
        .filter(models.PracticeAnswer.session_id == session_id)
        .all()
    )
    correct_count = 0
    wrong_ids = []
    for ans in answers:
        q = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
        ans.is_correct = is_correct(ans.user_answer, q.correct_answer) if q else False
        if ans.is_correct:
            correct_count += 1
        else:
            wrong = (
                db.query(models.WrongQuestion)
                .filter(
                    models.WrongQuestion.user_id == user.id,
                    models.WrongQuestion.question_id == ans.question_id,
                )
                .first()
            )
            if wrong:
                wrong.wrong_count += 1
                wrong.last_wrong_at = datetime.now(timezone.utc)
                wrong.mastered = False
            else:
                db.add(models.WrongQuestion(
                    user_id=user.id, question_id=ans.question_id, source="practice"
                ))
            wrong_ids.append(ans.question_id)

    total = session.total_count or len(answers)
    accuracy = correct_count / total if total else 0.0
    exp_gained = correct_count * 5
    session.correct_count = correct_count
    session.accuracy = accuracy
    session.status = "submitted"
    session.submitted_at = datetime.now(timezone.utc)
    user.exp += exp_gained

    db.add(models.LearningRecord(
        user_id=user.id, record_type="practice", ref_id=session.id,
        duration_seconds=0,
        detail_json=json.dumps({
            "total": total, "correct": correct_count, "accuracy": round(accuracy, 4)
        }, ensure_ascii=False),
    ))
    unlocked = game_service.sync_after_practice(db, user, session)
    db.commit()
    return schemas.PracticeSubmitOut(
        session_id=session.id, total_count=total, correct_count=correct_count,
        accuracy=round(accuracy, 4), exp_gained=exp_gained, wrong_question_ids=wrong_ids,
        unlocked_achievements=unlocked,
    )


@router.get("/sessions/{session_id}/result", response_model=dict)
def get_result(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id, models.PracticeSession.user_id == user.id)
        .first()
    )
    if not session or session.status != "submitted":
        raise HTTPException(status_code=404, detail="结果尚未生成，请先提交练习")
    answers = (
        db.query(models.PracticeAnswer)
        .filter(models.PracticeAnswer.session_id == session_id)
        .all()
    )
    items = []
    for ans in answers:
        q = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
        if not q:
            continue
        kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == q.knowledge_point_id).first()
        items.append({
            **_question_payload(q),
            "user_answer": ans.user_answer,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
            "is_correct": ans.is_correct,
            "knowledge_point_name": kp.name if kp else "",
        })
    return {
        "session_id": session.id, "total_count": session.total_count,
        "correct_count": session.correct_count, "accuracy": session.accuracy,
        "submitted_at": session.submitted_at.isoformat(), "items": items,
    }


@router.get("/history", response_model=list[dict])
def history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sessions = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.user_id == user.id, models.PracticeSession.status == "submitted")
        .order_by(models.PracticeSession.submitted_at.desc())
        .all()
    )
    return [{
        "id": s.id, "total_count": s.total_count, "correct_count": s.correct_count,
        "accuracy": s.accuracy, "submitted_at": s.submitted_at.isoformat(),
        "config": s.config_json,
    } for s in sessions]


@router.delete("/history/{session_id}", response_model=dict)
def delete_history(session_id: str, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    """删除一条练习历史，级联清理答题明细与对应学习记录。"""
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="练习记录不存在")
    db.query(models.PracticeAnswer).filter(models.PracticeAnswer.session_id == session_id).delete(synchronize_session=False)
    db.query(models.LearningRecord).filter(
        models.LearningRecord.user_id == user.id,
        models.LearningRecord.record_type == "practice",
        models.LearningRecord.ref_id == session_id,
    ).delete(synchronize_session=False)
    db.delete(session)
    db.commit()
    return {"message": "练习记录已删除"}


@router.delete("/history", response_model=dict)
def clear_history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """清空当前用户的全部练习历史。"""
    sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.user_id == user.id
    ).all()
    ids = [s.id for s in sessions]
    if ids:
        db.query(models.PracticeAnswer).filter(models.PracticeAnswer.session_id.in_(ids)).delete(synchronize_session=False)
        db.query(models.LearningRecord).filter(
            models.LearningRecord.user_id == user.id,
            models.LearningRecord.record_type == "practice",
            models.LearningRecord.ref_id.in_(ids),
        ).delete(synchronize_session=False)
    for s in sessions:
        db.delete(s)
    db.commit()
    return {"message": f"已清空 {len(ids)} 条练习记录"}


@router.get("/wrong-questions", response_model=list[dict])
def wrong_questions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.WrongQuestion)
        .filter(models.WrongQuestion.user_id == user.id)
        .order_by(models.WrongQuestion.last_wrong_at.desc())
        .all()
    )
    result = []
    for row in rows:
        q = db.query(models.Question).filter(models.Question.id == row.question_id).first()
        if not q:
            continue
        result.append({
            "id": row.id, "question_id": q.id, "question_content": q.question_content,
            "code_content": q.code_content, "options_json": q.options_json,
            "question_type": q.question_type, "difficulty": q.difficulty,
            "correct_answer": q.correct_answer, "explanation": q.explanation,
            "wrong_count": row.wrong_count, "mastered": row.mastered,
            "last_wrong_at": row.last_wrong_at.isoformat(),
        })
    return result
