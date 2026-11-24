import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/learning", tags=["learning"])


def _kp_out(db: Session, kp: models.KnowledgePoint, user: models.User) -> schemas.KnowledgePointOut:
    progress = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_id == user.id, models.UserProgress.kp_id == kp.id)
        .first()
    )
    fav = (
        db.query(models.Favorite)
        .filter(
            models.Favorite.user_id == user.id,
            models.Favorite.target_type == "knowledge_point",
            models.Favorite.target_id == kp.id,
        )
        .first()
    )
    data = schemas.KnowledgePointOut.model_validate(kp)
    if progress:
        data.progress_status = progress.status
        data.progress_pct = progress.progress_pct or 0
        data.mastered = progress.status == "mastered"
    data.favorited = fav is not None
    return data


@router.get("/chapters", response_model=list[schemas.ChapterOut])
def list_chapters(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    chapters = db.query(models.Chapter).order_by(models.Chapter.order_index).all()
    result = []
    for ch in chapters:
        count = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.chapter_id == ch.id).count()
        item = schemas.ChapterOut.model_validate(ch)
        item.kp_count = count
        result.append(item)
    return result


@router.get("/knowledge-points", response_model=list[schemas.KnowledgePointOut])
def list_kps(
    chapter_id: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.is_active.is_(True))
    if chapter_id:
        query = query.filter(models.KnowledgePoint.chapter_id == chapter_id)
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            (models.KnowledgePoint.name.like(like))
            | (models.KnowledgePoint.summary.like(like))
            | (models.KnowledgePoint.code.like(like))
        )
    kps = query.order_by(models.KnowledgePoint.chapter_id, models.KnowledgePoint.order_index).all()
    return [_kp_out(db, kp, user) for kp in kps]


@router.get("/knowledge-points/{kp_id}", response_model=schemas.KnowledgePointOut)
def get_kp(kp_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")
    return _kp_out(db, kp, user)


@router.put("/knowledge-points/{kp_id}/progress", response_model=schemas.MessageOut)
def update_progress(
    kp_id: str,
    payload: schemas.KPProgressIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    progress = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_id == user.id, models.UserProgress.kp_id == kp_id)
        .first()
    )
    if not progress:
        progress = models.UserProgress(user_id=user.id, kp_id=kp_id, chapter_id=kp.chapter_id)
        db.add(progress)

    if payload.status is not None:
        if payload.status not in ("locked", "available", "in_progress", "completed", "mastered"):
            raise HTTPException(status_code=400, detail="无效的状态值")
        progress.status = payload.status
        if payload.status in ("completed", "mastered"):
            progress.completed_at = datetime.now(timezone.utc)
        if payload.status == "mastered":
            progress.mastered_at = datetime.now(timezone.utc)
            user.exp += 10
    if payload.progress_pct is not None:
        progress.progress_pct = max(0, min(100, payload.progress_pct))
    if payload.mastered is True:
        progress.status = "mastered"
        progress.mastered_at = datetime.now(timezone.utc)
        user.exp += 10

    progress.last_studied_at = datetime.now(timezone.utc)

    existing = (
        db.query(models.LearningRecord)
        .filter(
            models.LearningRecord.user_id == user.id,
            models.LearningRecord.record_type == "kp_study",
            models.LearningRecord.ref_id == kp_id,
        )
        .first()
    )
    if not existing:
        db.add(models.LearningRecord(
            user_id=user.id, record_type="kp_study", ref_id=kp_id,
            chapter_id=kp.chapter_id, kp_id=kp_id, duration_seconds=kp.estimated_minutes * 60,
            detail_json=json.dumps({"name": kp.name}, ensure_ascii=False),
        ))

    db.commit()
    return schemas.MessageOut(message="学习进度已保存")


@router.post("/favorites", response_model=schemas.MessageOut)
def toggle_favorite(
    payload: schemas.FavoriteIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    fav = (
        db.query(models.Favorite)
        .filter(
            models.Favorite.user_id == user.id,
            models.Favorite.target_type == payload.target_type,
            models.Favorite.target_id == payload.target_id,
        )
        .first()
    )
    if fav:
        db.delete(fav)
        message = "已取消收藏"
    else:
        db.add(models.Favorite(
            user_id=user.id, target_type=payload.target_type, target_id=payload.target_id
        ))
        message = "已收藏"
    db.commit()
    return schemas.MessageOut(message=message)


@router.get("/favorites", response_model=list[dict])
def list_favorites(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    rows = (
        db.query(models.Favorite)
        .filter(models.Favorite.user_id == user.id)
        .order_by(models.Favorite.created_at.desc())
        .all()
    )
    result = []
    for row in rows:
        title = ""
        if row.target_type == "knowledge_point":
            kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == row.target_id).first()
            title = kp.name if kp else "已删除的知识点"
        elif row.target_type == "question":
            q = db.query(models.Question).filter(models.Question.id == row.target_id).first()
            title = q.question_content[:60] if q else "已删除的题目"
        result.append({
            "id": row.id, "target_type": row.target_type, "target_id": row.target_id,
            "title": title, "created_at": row.created_at.isoformat(),
        })
    return result


@router.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    practice_sessions = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.user_id == user.id, models.PracticeSession.status == "submitted")
        .all()
    )
    exam_sessions = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.user_id == user.id, models.ExamSession.status == "submitted")
        .all()
    )
    total_practice = len(practice_sessions)
    total_exam = len(exam_sessions)
    all_acc = [s.accuracy for s in practice_sessions + exam_sessions if s.accuracy is not None]
    avg_accuracy = sum(all_acc) / len(all_acc) if all_acc else 0.0

    wrong_count = (
        db.query(models.WrongQuestion)
        .filter(models.WrongQuestion.user_id == user.id, models.WrongQuestion.mastered.is_(False))
        .count()
    )
    total_kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.is_active.is_(True)).count()
    studied_kp = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_id == user.id, models.UserProgress.kp_id.isnot(None))
        .count()
    )
    mastery_rate = (studied_kp / total_kp * 100) if total_kp else 0.0

    records = (
        db.query(models.LearningRecord)
        .filter(models.LearningRecord.user_id == user.id)
        .order_by(models.LearningRecord.created_at.desc())
        .limit(8)
        .all()
    )
    recent = [{
        "id": r.id, "type": r.record_type, "ref_id": r.ref_id,
        "detail": r.detail_json, "created_at": r.created_at.isoformat(),
    } for r in records]

    trend = []
    for s in sorted(practice_sessions, key=lambda x: x.submitted_at or x.started_at)[-10:]:
        trend.append({
            "date": (s.submitted_at or s.started_at).strftime("%m-%d"),
            "value": round(s.accuracy * 100, 1),
            "type": "practice",
        })
    for s in sorted(exam_sessions, key=lambda x: x.submitted_at or x.started_at)[-10:]:
        trend.append({
            "date": (s.submitted_at or s.started_at).strftime("%m-%d"),
            "value": round(s.accuracy * 100, 1),
            "type": "exam",
        })
    trend = sorted(trend, key=lambda x: x["date"])[-12:]

    return schemas.DashboardOut(
        user=user, total_practice=total_practice, total_exam=total_exam,
        avg_accuracy=round(avg_accuracy, 4), wrong_count=wrong_count,
        studied_kp_count=studied_kp, total_kp_count=total_kp,
        mastery_rate=round(mastery_rate, 1), recent_records=recent, trend=trend,
    )
