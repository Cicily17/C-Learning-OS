import json
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import game_service, models
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/game", tags=["game"])


@router.get("/map", response_model=dict)
def game_map(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    game_service.ensure_game_seed(db)
    chapters = db.query(models.Chapter).order_by(models.Chapter.order_index).all()
    result = []
    previous_passed = True
    for chapter in chapters:
        kps = (
            db.query(models.KnowledgePoint)
            .filter(models.KnowledgePoint.chapter_id == chapter.id)
            .order_by(models.KnowledgePoint.order_index)
            .all()
        )
        challenge_passed = game_service.chapter_passed(db, user, chapter.id)
        chapter_unlocked = previous_passed
        levels = []
        prev_done = True
        completed = 0
        mastered = 0
        for kp in kps:
            progress = db.query(models.UserProgress).filter(
                models.UserProgress.user_id == user.id,
                models.UserProgress.kp_id == kp.id,
            ).first()
            status = progress.status if progress else "available"
            if status in ("completed", "mastered"):
                completed += 1
            if status == "mastered":
                mastered += 1
            level_unlocked = chapter_unlocked and (prev_done or status in ("completed", "mastered"))
            if not level_unlocked:
                status = "locked"
            elif progress is None:
                status = "available"
            levels.append({
                "kp_id": kp.id,
                "code": kp.code,
                "name": kp.name,
                "difficulty": kp.difficulty,
                "status": status,
                "unlocked": level_unlocked,
                "progress_pct": (progress.progress_pct or 0) if progress else 0,
                "best_score": (progress.best_score or 0.0) if progress else 0.0,
                "estimated_minutes": kp.estimated_minutes,
            })
            if status not in ("completed", "mastered"):
                prev_done = False
        total = len(kps)
        result.append({
            "id": chapter.id,
            "code": chapter.code,
            "name": chapter.name,
            "description": chapter.description,
            "order_index": chapter.order_index,
            "unlocked": chapter_unlocked,
            "challenge_passed": challenge_passed,
            "challenge_available": chapter_unlocked and not challenge_passed,
            "total_kps": total,
            "completed_kps": completed,
            "mastered_kps": mastered,
            "progress_pct": round(completed / total * 100) if total else 0,
            "levels": levels,
        })
        previous_passed = challenge_passed

    return {
        "chapters": result,
        "level": game_service.level_info(user.exp),
        "total_unlocked_chapters": sum(1 for c in result if c["unlocked"]),
        "total_passed_challenges": sum(1 for c in result if c["challenge_passed"]),
    }


@router.get("/profile", response_model=dict)
def profile(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    game_service.ensure_game_seed(db)
    all_achievements = db.query(models.Achievement).all()
    unlocked_ids = {
        row.achievement_id
        for row in db.query(models.UserAchievement).filter(
            models.UserAchievement.user_id == user.id
        ).all()
    }
    achievements = [{
        "code": a.code, "name": a.name, "description": a.description,
        "icon": a.icon, "exp_reward": a.exp_reward,
        "unlocked": a.id in unlocked_ids,
        "condition": a.condition_json,
    } for a in all_achievements]
    return {
        "level": game_service.level_info(user.exp),
        "streak_days": user.streak_days,
        "stats": game_service._stats(db, user),
        "achievements": achievements,
        "daily_tasks": game_service.daily_tasks(db, user),
    }


@router.post("/chapters/{chapter_id}/challenge", response_model=dict)
def start_challenge(
    chapter_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """章节挑战：以真实题库组卷，通过后由服务端解锁下一章。"""
    game_service.ensure_game_seed(db)
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    chapters = db.query(models.Chapter).order_by(models.Chapter.order_index).all()
    idx = next((i for i, c in enumerate(chapters) if c.id == chapter_id), -1)
    if idx > 0 and not game_service.chapter_passed(db, user, chapters[idx - 1].id):
        raise HTTPException(status_code=403, detail=f"请先通过上一章「{chapters[idx - 1].name}」的挑战")
    if game_service.chapter_passed(db, user, chapter_id):
        raise HTTPException(status_code=400, detail="本章挑战已通过，无需重复挑战")

    candidates = db.query(models.Question).filter(
        models.Question.chapter_id == chapter_id,
        models.Question.status == "active",
    ).all()
    count = min(10, len(candidates))
    if count < 5:
        raise HTTPException(status_code=409, detail="本章题量不足 5 道，无法生成章节挑战")
    picked = random.sample(candidates, count)
    config = {
        "challenge_chapter_id": chapter_id,
        "knowledge_point_ids": [],
        "chapter_ids": [chapter_id],
        "difficulties": [],
        "question_types": [],
        "count": count,
    }
    session = models.PracticeSession(
        user_id=user.id,
        config_json=json.dumps(config, ensure_ascii=False),
        total_count=count,
    )
    db.add(session)
    db.flush()
    for q in picked:
        db.add(models.PracticeAnswer(session_id=session.id, question_id=q.id))
    db.commit()
    return {
        "session_id": session.id,
        "chapter_name": chapter.name,
        "question_count": count,
        "pass_line": "正确率 ≥ 70%",
    }
