import json
import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import game_service, history_service, models, schemas
from ..auth import get_current_user
from ..database import get_db
from .practice import is_correct

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _question_whitelist(q: models.Question) -> dict:
    """考试进行中唯一允许下发的题目字段：不含答案、解析、分值、知识点。"""
    return {
        "id": q.id,
        "question_id": q.question_id,
        "question_type": q.question_type,
        "question_content": q.question_content,
        "code_content": q.code_content,
        "options_json": q.options_json,
    }


def _naive(dt):
    """PostgreSQL 的 timestamp 列返回无时区 datetime，统一为 naive UTC 后再做时间差。"""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _paper_config(paper: models.ExamPaper) -> dict:
    config = json.loads(paper.config_json or "{}")
    return {
        "id": paper.id,
        "name": paper.name,
        "question_count": paper.question_count,
        "total_score": paper.total_score,
        "duration_minutes": config.get("duration_minutes", 60),
        "created_at": paper.created_at.isoformat(),
        "scope": {
            "chapter_ids": config.get("chapter_ids", []),
            "knowledge_point_ids": config.get("knowledge_point_ids", []),
            "difficulties": config.get("difficulties", []),
            "question_types": config.get("question_types", []),
        },
    }


@router.post("/papers", response_model=dict)
def create_paper(
    payload: schemas.ExamConfigIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """按配置自动组卷。答案写入独立表 exam_answer_keys，不随题目下发。"""
    query = db.query(models.Question).filter(models.Question.status == "active")
    if payload.chapter_ids:
        query = query.filter(models.Question.chapter_id.in_(payload.chapter_ids))
    if payload.knowledge_point_ids:
        query = query.filter(models.Question.knowledge_point_id.in_(payload.knowledge_point_ids))
    if payload.difficulties:
        query = query.filter(models.Question.difficulty.in_(payload.difficulties))
    if payload.question_types:
        query = query.filter(models.Question.question_type.in_(payload.question_types))
    candidates = query.all()

    picked: list[models.Question] = []
    used: set[str] = set()
    shortages: list[str] = []

    if payload.type_counts:
        total_requested = sum(payload.type_counts.values())
        if total_requested != payload.count:
            raise HTTPException(status_code=400, detail="各题型数量之和必须等于考试题量")
        for qtype, needed in payload.type_counts.items():
            if needed < 0:
                raise HTTPException(status_code=400, detail="题型数量不能为负数")
            pool = [q for q in candidates if q.question_type == qtype and q.id not in used]
            if len(pool) < needed:
                shortages.append(f"「{qtype}」需要 {needed} 题，题库仅能匹配 {len(pool)} 题")
                continue
            selected = random.sample(pool, needed)
            picked.extend(selected)
            used.update(q.id for q in selected)
    else:
        if len(candidates) < payload.count:
            shortages.append(f"符合范围的题目共 {len(candidates)} 道，少于请求的 {payload.count} 道")
        else:
            picked = random.sample(candidates, payload.count)

    if shortages:
        raise HTTPException(
            status_code=409,
            detail="组卷失败：" + "；".join(shortages) + "。请放宽范围或调整题型数量，系统不会虚构题目。",
        )

    by_type = defaultdict(list)
    for q in picked:
        by_type[q.question_type].append(q)
    score_map = {k: max(1, int(v)) for k, v in payload.type_scores.items() if int(v) > 0}
    total_score = 0
    scores: dict[str, int] = {}
    for q in picked:
        s = score_map.get(q.question_type, 1)
        scores[q.id] = s
        total_score += s
    if payload.total_score is not None and payload.total_score != total_score:
        raise HTTPException(
            status_code=400,
            detail=(f"按当前题型分值配置计算，总分为 {total_score}，与设置的 {payload.total_score} 不一致。"
                    "请调整各题型分值或总分设置后重试。"),
        )

    paper = models.ExamPaper(
        name=payload.name,
        config_json=json.dumps(payload.model_dump(), ensure_ascii=False),
        type_score_json=json.dumps(score_map, ensure_ascii=False),
        total_score=total_score,
        question_count=len(picked),
        created_by=user.id,
    )
    db.add(paper)
    db.flush()
    for order, q in enumerate(picked):
        db.add(models.ExamQuestion(
            paper_id=paper.id, question_id=q.id, score=scores[q.id], sort_order=order
        ))
        db.add(models.ExamAnswerKey(
            paper_id=paper.id,
            question_id=q.id,
            correct_answer=q.correct_answer,
            explanation=q.explanation,
        ))
    db.commit()
    return {**_paper_config(paper), "message": "试卷已生成，答案已封存于服务端"}


@router.get("/papers", response_model=list[dict])
def list_papers(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = db.query(models.ExamPaper).order_by(models.ExamPaper.created_at.desc()).limit(50).all()
    return [_paper_config(p) for p in rows]


@router.get("/papers/{paper_id}", response_model=dict)
def get_paper(paper_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    paper = db.query(models.ExamPaper).filter(models.ExamPaper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return _paper_config(paper)


@router.post("/sessions", response_model=dict)
def start_exam(paper_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    paper = db.query(models.ExamPaper).filter(models.ExamPaper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    config = json.loads(paper.config_json or "{}")
    duration = int(config.get("duration_minutes", 60))
    now = datetime.now(timezone.utc)
    session = models.ExamSession(
        user_id=user.id,
        paper_id=paper.id,
        deadline_at=now + timedelta(minutes=duration),
        total_score=paper.total_score,
    )
    db.add(session)
    db.flush()
    questions = (
        db.query(models.ExamQuestion, models.Question)
        .join(models.Question, models.ExamQuestion.question_id == models.Question.id)
        .filter(models.ExamQuestion.paper_id == paper.id)
        .order_by(models.ExamQuestion.sort_order)
        .all()
    )
    for eq, _ in questions:
        db.add(models.ExamAnswer(session_id=session.id, question_id=eq.question_id))
    db.commit()
    return {
        "session_id": session.id,
        "paper_name": paper.name,
        "question_count": paper.question_count,
        "total_score": paper.total_score,
        "duration_seconds": duration * 60,
        "started_at": now.isoformat(),
        "deadline_at": session.deadline_at.isoformat(),
    }


@router.get("/sessions/{session_id}", response_model=dict)
def get_exam_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """考试中接口：只返回白名单字段，不包含答案、解析、分值、正确率、分数。"""
    session = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.id == session_id, models.ExamSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="考试会话不存在")
    paper = db.query(models.ExamPaper).filter(models.ExamPaper.id == session.paper_id).first()
    rows = (
        db.query(models.ExamQuestion, models.Question, models.ExamAnswer)
        .join(models.Question, models.ExamQuestion.question_id == models.Question.id)
        .join(models.ExamAnswer, models.ExamAnswer.question_id == models.Question.id)
        .filter(
            models.ExamQuestion.paper_id == session.paper_id,
            models.ExamAnswer.session_id == session.id,
        )
        .order_by(models.ExamQuestion.sort_order)
        .all()
    )
    questions = []
    for _, q, ans in rows:
        item = _question_whitelist(q)
        item["user_answer"] = ans.user_answer
        item["marked"] = ans.marked
        questions.append(item)
    return {
        "session_id": session.id,
        "paper_name": paper.name if paper else "",
        "status": session.status,
        "question_count": len(questions),
        "deadline_at": (
            session.deadline_at.isoformat() + ("Z" if session.deadline_at.tzinfo is None else "")
            if session.deadline_at else None
        ),
        "questions": questions,
    }


@router.post("/sessions/{session_id}/answers", response_model=dict)
def save_exam_answer(
    session_id: str,
    payload: schemas.ExamAnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """只保存作答，不返回正误。判分提交时才在服务端执行。"""
    session = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.id == session_id, models.ExamSession.user_id == user.id)
        .first()
    )
    if not session or session.status != "in_progress":
        raise HTTPException(status_code=404, detail="考试会话不可作答")
    ans = (
        db.query(models.ExamAnswer)
        .filter(
            models.ExamAnswer.session_id == session_id,
            models.ExamAnswer.question_id == payload.question_id,
        )
        .first()
    )
    if not ans:
        raise HTTPException(status_code=404, detail="题目不属于本场考试")
    ans.user_answer = payload.user_answer
    ans.answered_at = datetime.now(timezone.utc)
    db.commit()
    return {"saved": True}


@router.post("/sessions/{session_id}/mark", response_model=dict)
def mark_question(
    session_id: str,
    payload: schemas.ExamMarkIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.id == session_id, models.ExamSession.user_id == user.id)
        .first()
    )
    if not session or session.status != "in_progress":
        raise HTTPException(status_code=404, detail="考试会话不可操作")
    ans = (
        db.query(models.ExamAnswer)
        .filter(
            models.ExamAnswer.session_id == session_id,
            models.ExamAnswer.question_id == payload.question_id,
        )
        .first()
    )
    if not ans:
        raise HTTPException(status_code=404, detail="题目不属于本场考试")
    ans.marked = payload.marked
    db.commit()
    return {"marked": ans.marked}


@router.post("/sessions/{session_id}/submit", response_model=schemas.ExamSubmitOut)
def submit_exam(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """服务端判分：答案只从 exam_answer_keys 读取，前端无法干预。"""
    session = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.id == session_id, models.ExamSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="考试会话不存在")
    if session.status == "submitted":
        raise HTTPException(status_code=400, detail="本场考试已交卷，记录已锁定")

    rows = (
        db.query(models.ExamAnswer, models.ExamQuestion, models.ExamAnswerKey)
        .join(models.ExamQuestion, models.ExamQuestion.question_id == models.ExamAnswer.question_id)
        .join(models.ExamAnswerKey, models.ExamAnswerKey.question_id == models.ExamAnswer.question_id)
        .filter(
            models.ExamAnswer.session_id == session.id,
            models.ExamQuestion.paper_id == session.paper_id,
            models.ExamAnswerKey.paper_id == session.paper_id,
        )
        .all()
    )
    obtained = 0
    correct = 0
    for ans, eq, key in rows:
        ok = is_correct(ans.user_answer or "", key.correct_answer)
        ans.is_correct = ok
        ans.score_obtained = eq.score if ok else 0
        if ok:
            correct += 1
            obtained += eq.score

    total = session.total_score or sum(eq.score for _, eq, _ in rows)
    accuracy = correct / len(rows) if rows else 0.0
    now = datetime.now(timezone.utc)
    started = _naive(session.started_at)
    deadline = _naive(session.deadline_at)
    duration_seconds = int((deadline - started).total_seconds()) if deadline and started else 0
    used = int((_naive(now) - started).total_seconds()) if started else 0
    if duration_seconds:
        used = min(used, duration_seconds)
    exp_gained = correct * 8

    session.obtained_score = obtained
    session.correct_count = correct
    session.accuracy = accuracy
    session.time_used_seconds = max(0, used)
    session.status = "submitted"
    session.submitted_at = now
    user.exp += exp_gained

    for ans in rows:
        q = db.query(models.Question).filter(models.Question.id == ans[0].question_id).first()
        if q and not ans[0].is_correct:
            wrong = (
                db.query(models.WrongQuestion)
                .filter(
                    models.WrongQuestion.user_id == user.id,
                    models.WrongQuestion.question_id == q.id,
                )
                .first()
            )
            if wrong:
                wrong.wrong_count += 1
                wrong.last_wrong_at = now
                wrong.mastered = False
            else:
                db.add(models.WrongQuestion(user_id=user.id, question_id=q.id, source="exam"))

    db.add(models.LearningRecord(
        user_id=user.id,
        record_type="exam",
        ref_id=session.id,
        duration_seconds=session.time_used_seconds,
        detail_json=json.dumps({
            "score": obtained, "total": total, "correct": correct,
            "accuracy": round(accuracy, 4),
        }, ensure_ascii=False),
    ))
    unlocked = game_service.sync_after_exam(db, user, session)
    db.commit()
    return schemas.ExamSubmitOut(
        session_id=session.id, total_score=total, obtained_score=obtained,
        correct_count=correct, total_count=len(rows), accuracy=round(accuracy, 4),
        time_used_seconds=session.time_used_seconds, exp_gained=exp_gained,
        unlocked_achievements=unlocked,
    )


def _build_report(db: Session, session: models.ExamSession) -> dict:
    rows = (
        db.query(models.ExamAnswer, models.Question, models.ExamAnswerKey, models.ExamQuestion, models.KnowledgePoint)
        .join(models.Question, models.ExamAnswer.question_id == models.Question.id)
        .join(models.ExamAnswerKey, models.ExamAnswerKey.question_id == models.Question.id)
        .join(models.ExamQuestion, models.ExamQuestion.question_id == models.Question.id)
        .outerjoin(models.KnowledgePoint, models.KnowledgePoint.id == models.Question.knowledge_point_id)
        .filter(
            models.ExamAnswer.session_id == session.id,
            models.ExamAnswerKey.paper_id == session.paper_id,
            models.ExamQuestion.paper_id == session.paper_id,
        )
        .order_by(models.ExamQuestion.sort_order)
        .all()
    )
    by_kp: dict[str, dict] = defaultdict(lambda: {"name": "", "earned": 0, "max": 0, "correct": 0, "total": 0})
    by_type: dict[str, dict] = defaultdict(lambda: {"name": "", "earned": 0, "max": 0, "correct": 0, "total": 0})
    wrong_items = []
    items = []
    for ans, q, key, eq, kp in rows:
        kp_name = kp.name if kp else "未分类"
        kp_key = kp.id if kp else "unknown"
        for bucket, name in ((by_kp[kp_key], kp_name), (by_type[q.question_type], q.question_type)):
            if name and not bucket["name"]:
                bucket["name"] = name
            bucket["max"] += eq.score
            bucket["earned"] += ans.score_obtained or 0
            bucket["total"] += 1
            bucket["correct"] += 1 if ans.is_correct else 0
        items.append({
            "id": q.id,
            "question_id": q.id,
            "question_code": q.question_id,
            "question_content": q.question_content,
            "code_content": q.code_content,
            "options_json": q.options_json,
            "question_type": q.question_type,
            "difficulty": q.difficulty,
            "knowledge_point_name": kp_name,
            "user_answer": ans.user_answer,
            "correct_answer": key.correct_answer,
            "explanation": key.explanation,
            "is_correct": bool(ans.is_correct),
            "score": eq.score,
            "score_obtained": ans.score_obtained or 0,
        })
        if not ans.is_correct:
            wrong_items.append({
                "question_id": q.id,
                "question_content": q.question_content,
                "code_content": q.code_content,
                "options_json": q.options_json,
                "user_answer": ans.user_answer,
                "correct_answer": key.correct_answer,
                "explanation": key.explanation,
                "question_type": q.question_type,
                "knowledge_point_name": kp_name,
                "knowledge_point_id": kp_key,
                "score": eq.score,
            })

    def pack(bucket: dict, key: str) -> list[dict]:
        return [{
            "key": k, "name": v["name"] or k, "earned": v["earned"], "max": v["max"],
            "correct": v["correct"], "total": v["total"],
            "rate": round(v["earned"] / v["max"], 4) if v["max"] else 0.0,
        } for k, v in sorted(bucket.items(), key=lambda x: x[1]["earned"] / x[1]["max"] if x[1]["max"] else 0)]

    kp_scores = pack(by_kp, "kp")
    type_scores = pack(by_type, "type")
    weak_kps = [x for x in kp_scores if x["rate"] < 0.6]
    weak_types = [x for x in type_scores if x["rate"] < 0.6]
    suggestions = []
    if weak_kps:
        suggestions.append("优先复习：" + "、".join(x["name"] for x in weak_kps[:5]) + "（得分率低于 60%）。")
    if weak_types:
        suggestions.append("题型薄弱：" + "、".join(x["name"] for x in weak_types) + "，建议回到练习中心做专项训练。")
    if not weak_kps and not weak_types:
        suggestions.append("各知识点表现稳定，建议提高难度进行综合训练。")
    if session.accuracy < 0.7:
        suggestions.append("正确率偏低，建议先完成对应知识点的知识学习再重考。")
    return {
        "session_id": session.id,
        "paper_name": db.query(models.ExamPaper).filter(models.ExamPaper.id == session.paper_id).first().name,
        "total_score": session.total_score,
        "obtained_score": session.obtained_score,
        "correct_count": session.correct_count,
        "total_count": len(rows),
        "accuracy": session.accuracy,
        "time_used_seconds": session.time_used_seconds,
        "submitted_at": session.submitted_at.isoformat() if session.submitted_at else None,
        "knowledge_point_scores": kp_scores,
        "question_type_scores": type_scores,
        "items": items,
        "wrong_items": wrong_items,
        "weak_knowledge_point_ids": [x["key"] for x in weak_kps if x["key"] != "unknown"],
        "suggestions": suggestions,
    }


@router.get("/sessions/{session_id}/result", response_model=dict)
def exam_result(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """交卷后才可访问；进行中访问一律拒绝。"""
    session = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.id == session_id, models.ExamSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="考试会话不存在")
    if session.status != "submitted":
        raise HTTPException(status_code=403, detail="考试尚未提交，成绩与解析处于封存状态")
    return _build_report(db, session)


@router.get("/history", response_model=list[dict])
def exam_history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.ExamSession, models.ExamPaper)
        .join(models.ExamPaper, models.ExamSession.paper_id == models.ExamPaper.id)
        .filter(models.ExamSession.user_id == user.id, models.ExamSession.status == "submitted")
        .order_by(models.ExamSession.submitted_at.desc())
        .all()
    )
    return [{
        "id": s.id, "paper_name": p.name, "obtained_score": s.obtained_score,
        "total_score": s.total_score, "accuracy": s.accuracy,
        "correct_count": s.correct_count,
        "time_used_seconds": s.time_used_seconds,
        "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
    } for s, p in rows]


@router.delete("/history/{session_id}", response_model=dict)
def delete_exam_history(session_id: str, db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    """删除一条考试记录，并回退这次作答对错题本的影响。"""
    session = db.query(models.ExamSession).filter(
        models.ExamSession.id == session_id,
        models.ExamSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="考试记录不存在")

    answers = (
        db.query(models.ExamAnswer)
        .filter(models.ExamAnswer.session_id == session_id)
        .all()
    )
    history_service.rollback_wrong_questions(db, user.id, answers)

    db.query(models.ExamAnswer).filter(
        models.ExamAnswer.session_id == session_id
    ).delete(synchronize_session=False)
    db.query(models.LearningRecord).filter(
        models.LearningRecord.user_id == user.id,
        models.LearningRecord.record_type == "exam",
        models.LearningRecord.ref_id == session_id,
    ).delete(synchronize_session=False)
    db.delete(session)
    db.commit()
    return {"message": "考试记录已删除，正确率与错题统计已同步更新"}


@router.delete("/history", response_model=dict)
def clear_exam_history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """清空当前用户已提交的考试记录（进行中的考试不会被动到）。"""
    sessions = db.query(models.ExamSession).filter(
        models.ExamSession.user_id == user.id,
        models.ExamSession.status == "submitted",
    ).all()
    ids = [s.id for s in sessions]
    if ids:
        answers = (
            db.query(models.ExamAnswer)
            .filter(models.ExamAnswer.session_id.in_(ids))
            .all()
        )
        history_service.rollback_wrong_questions(db, user.id, answers)
        db.query(models.ExamAnswer).filter(
            models.ExamAnswer.session_id.in_(ids)
        ).delete(synchronize_session=False)
        db.query(models.LearningRecord).filter(
            models.LearningRecord.user_id == user.id,
            models.LearningRecord.record_type == "exam",
            models.LearningRecord.ref_id.in_(ids),
        ).delete(synchronize_session=False)
    for s in sessions:
        db.delete(s)
    db.commit()
    return {"message": f"已清空 {len(ids)} 条考试记录，正确率与错题统计已同步更新"}
