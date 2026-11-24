"""游戏化引擎：进度、等级、成就、每日任务。所有奖励均来自真实作答记录。"""
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import models

LEVEL_STEP = 200

ACHIEVEMENTS = [
    ("FIRST_PRACTICE", "初出茅庐", "完成第一次自主练习", "target", {"type": "practice_count", "value": 1}, 10),
    ("FIRST_MASTER", "一点即通", "掌握第一个知识点", "star", {"type": "mastered_count", "value": 1}, 15),
    ("CORRECT_50", "答题能手", "累计答对 50 道题", "zap", {"type": "total_correct", "value": 50}, 30),
    ("EXAM_90", "考场精英", "一次考试达到 90 分及以上", "award", {"type": "exam_90", "value": 1}, 40),
    ("PERFECT_3", "三连全对", "连续 3 套练习全部答对", "flame", {"type": "perfect_streak", "value": 3}, 35),
    ("CHAPTER_1", "初章通关", "通过第一章节挑战", "flag", {"type": "chapter_challenge", "value": 1}, 25),
]


def level_info(exp: int) -> dict:
    level = exp // LEVEL_STEP + 1
    current = exp % LEVEL_STEP
    return {
        "level": level,
        "exp": exp,
        "current_exp": current,
        "next_exp": LEVEL_STEP,
        "progress_pct": round(current / LEVEL_STEP * 100, 1),
        "title": ["见习学员", "初级程序员", "代码学徒", "调试高手", "C 语言工程师", "系统架构师"][min(level - 1, 5)],
    }


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def ensure_game_seed(db):
    for code, name, desc, icon, cond, reward in ACHIEVEMENTS:
        exists = db.query(models.Achievement).filter(models.Achievement.code == code).first()
        if not exists:
            db.add(models.Achievement(
                code=code, name=name, description=desc, icon=icon,
                condition_json=json.dumps(cond, ensure_ascii=False), exp_reward=reward,
            ))
    db.commit()


def bump_daily(db, user, task_code: str, amount: int = 1):
    task = db.query(models.DailyTask).filter(
        models.DailyTask.code == task_code, models.DailyTask.is_active.is_(True)
    ).first()
    if not task:
        return
    cond = json.loads(task.condition_json or "{}")
    target = max(1, int(cond.get("count", 1)))
    row = db.query(models.UserDailyTask).filter(
        models.UserDailyTask.user_id == user.id,
        models.UserDailyTask.task_id == task.id,
        models.UserDailyTask.task_date == _today(),
    ).first()
    if not row:
        row = models.UserDailyTask(
            user_id=user.id, task_id=task.id, task_date=_today(), target=target
        )
        db.add(row)
    if row.completed:
        return
    row.progress = min(target, (row.progress or 0) + amount)
    row.target = row.target or target
    if row.progress >= target:
        row.completed = True
        row.completed_at = datetime.now(timezone.utc)
        if not row.exp_claimed:
            row.exp_claimed = True
            user.exp += task.exp_reward


def _stats(db, user) -> dict:
    practice = db.query(models.PracticeSession).filter(
        models.PracticeSession.user_id == user.id,
        models.PracticeSession.status == "submitted",
    ).order_by(models.PracticeSession.submitted_at).all()
    exams = db.query(models.ExamSession).filter(
        models.ExamSession.user_id == user.id,
        models.ExamSession.status == "submitted",
    ).all()
    perfect_streak = 0
    for s in reversed(practice):
        if s.total_count and s.correct_count == s.total_count:
            perfect_streak += 1
        else:
            break
    mastered = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user.id,
        models.UserProgress.status == "mastered",
    ).count()
    challenges = db.query(models.LearningRecord).filter(
        models.LearningRecord.user_id == user.id,
        models.LearningRecord.record_type == "chapter_challenge",
    ).count()
    return {
        "practice_count": len(practice),
        "total_correct": sum(s.correct_count or 0 for s in practice),
        "mastered_count": mastered,
        "exam_90": sum(1 for e in exams if (e.obtained_score or 0) >= 0.9 * (e.total_score or 100)),
        "perfect_streak": perfect_streak,
        "chapter_challenge": challenges,
        "exam_count": len(exams),
    }


def grant_achievements(db, user) -> list[str]:
    ensure_game_seed(db)
    stats = _stats(db, user)
    all_achievements = db.query(models.Achievement).all()
    unlocked_now = []
    for ach in all_achievements:
        cond = json.loads(ach.condition_json or "{}")
        if stats.get(cond.get("type"), 0) < int(cond.get("value", 1)):
            continue
        exists = db.query(models.UserAchievement).filter(
            models.UserAchievement.user_id == user.id,
            models.UserAchievement.achievement_id == ach.id,
        ).first()
        if exists:
            continue
        db.add(models.UserAchievement(user_id=user.id, achievement_id=ach.id))
        user.exp += ach.exp_reward or 0
        unlocked_now.append(ach.name)
    return unlocked_now


def sync_after_practice(db, user, session: models.PracticeSession) -> list[str]:
    """练习提交后：更新每日任务、知识点掌握状态、成就。"""
    ensure_game_seed(db)
    bump_daily(db, user, "TASK01", 1)

    answers = db.query(models.PracticeAnswer).filter(
        models.PracticeAnswer.session_id == session.id
    ).all()
    correct_total = sum(1 for a in answers if a.is_correct)
    bump_daily(db, user, "TASK03", correct_total)

    grouped: dict[str, list[bool]] = defaultdict(list)
    for ans in answers:
        q = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
        if q:
            grouped[q.knowledge_point_id].append(bool(ans.is_correct))

    config = json.loads(session.config_json or "{}")
    challenge_chapter = config.get("challenge_chapter_id")
    for kp_id, results in grouped.items():
        progress = db.query(models.UserProgress).filter(
            models.UserProgress.user_id == user.id, models.UserProgress.kp_id == kp_id
        ).first()
        if not progress:
            kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == kp_id).first()
            progress = models.UserProgress(
                user_id=user.id, kp_id=kp_id, chapter_id=kp.chapter_id if kp else None
            )
            db.add(progress)
        rate = sum(results) / len(results)
        old = progress.status
        if rate >= 0.9:
            progress.status = "mastered"
            progress.progress_pct = 100
            progress.mastered_at = datetime.now(timezone.utc)
            progress.completed_at = progress.completed_at or datetime.now(timezone.utc)
        elif rate >= 0.6:
            progress.status = "completed"
            progress.progress_pct = max(progress.progress_pct or 0, 80)
            progress.completed_at = progress.completed_at or datetime.now(timezone.utc)
        else:
            progress.status = "in_progress"
            progress.progress_pct = max(progress.progress_pct or 0, 40)
        progress.best_score = max(progress.best_score or 0.0, round(rate, 4))
        progress.last_studied_at = datetime.now(timezone.utc)
        if old != "mastered" and progress.status == "mastered":
            user.exp += 10
            bump_daily(db, user, "TASK02", 1)

    if challenge_chapter and session.accuracy and session.accuracy >= 0.7:
        existing = db.query(models.LearningRecord).filter(
            models.LearningRecord.user_id == user.id,
            models.LearningRecord.record_type == "chapter_challenge",
            models.LearningRecord.ref_id == challenge_chapter,
        ).first()
        if not existing:
            db.add(models.LearningRecord(
                user_id=user.id, record_type="chapter_challenge", ref_id=challenge_chapter,
                detail_json=json.dumps({"accuracy": round(session.accuracy, 4)}, ensure_ascii=False),
            ))
            user.exp += 30

    return grant_achievements(db, user)


def sync_after_exam(db, user, session: models.ExamSession) -> list[str]:
    ensure_game_seed(db)
    return grant_achievements(db, user)


def chapter_passed(db, user, chapter_id: str) -> bool:
    return db.query(models.LearningRecord).filter(
        models.LearningRecord.user_id == user.id,
        models.LearningRecord.record_type == "chapter_challenge",
        models.LearningRecord.ref_id == chapter_id,
    ).first() is not None


def daily_tasks(db, user) -> list[dict]:
    today = _today()
    tasks = db.query(models.DailyTask).filter(models.DailyTask.is_active.is_(True)).all()
    result = []
    for task in tasks:
        row = db.query(models.UserDailyTask).filter(
            models.UserDailyTask.user_id == user.id,
            models.UserDailyTask.task_id == task.id,
            models.UserDailyTask.task_date == today,
        ).first()
        result.append({
            "code": task.code, "title": task.title, "description": task.description,
            "progress": row.progress if row else 0,
            "target": row.target if row else max(1, int(json.loads(task.condition_json or "{}").get("count", 1))),
            "completed": bool(row.completed) if row else False,
            "exp_reward": task.exp_reward,
        })
    return result
