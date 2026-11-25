"""题库接口：可用量预览、AI 出题、自编题、题目管理。"""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, question_banks, question_generator
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/questions", tags=["questions"])


class AvailabilityIn(BaseModel):
    knowledge_point_ids: list[str] = Field(default_factory=list)
    chapter_ids: list[str] = Field(default_factory=list)
    difficulties: list[str] = Field(default_factory=list)
    question_types: list[str] = Field(default_factory=list)
    bank: str = ""


class AiGenerateIn(AvailabilityIn):
    count: int = Field(default=5, ge=1, le=50)
    qtype: str = "单项选择题"
    difficulty: str = "入门"


class CustomQuestionIn(BaseModel):
    chapter_id: str
    knowledge_point_id: str
    question_type: str
    difficulty: str
    bank: str = ""
    question_content: str = Field(min_length=6)
    code_content: str = ""
    options: list[dict] = Field(default_factory=list)
    correct_answer: str = Field(min_length=1)
    explanation: str = Field(min_length=8)
    score: int = 1


def _filtered_query(db, payload, user_id=None):
    q = db.query(models.Question).filter(models.Question.status == "active")
    if payload.knowledge_point_ids:
        q = q.filter(models.Question.knowledge_point_id.in_(payload.knowledge_point_ids))
    if payload.chapter_ids:
        q = q.filter(models.Question.chapter_id.in_(payload.chapter_ids))
    if payload.difficulties:
        q = q.filter(models.Question.difficulty.in_(payload.difficulties))
    if payload.question_types:
        q = q.filter(models.Question.question_type.in_(payload.question_types))
    if user_id is not None:
        q = q.filter(models.Question.created_by == user_id)
    bank = payload.bank.strip() if getattr(payload, "bank", "") else ""
    rows = q.all()
    if bank and bank in question_banks.BANK_KEYS:
        rows = [row for row in rows if question_banks.in_bank(row.banks_json, bank)]
    return rows


@router.post("/availability", response_model=dict)
def availability(payload: AvailabilityIn, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    """实时预览当前筛选条件的可用题量，供前端在组卷前提示。"""
    total = len(_filtered_query(db, payload))
    by_type = {}
    for r in db.query(models.Question.question_type, func.count(models.Question.id)) \
            .filter(models.Question.status == "active") \
            .group_by(models.Question.question_type).all():
        by_type[r[0]] = r[1]
    # 各题库题量（不受当前 bank 选择影响，供题库切换时展示）
    by_bank = {}
    for b in question_banks.BANK_KEYS:
        by_bank[b] = sum(1 for q in db.query(models.Question)
                         .filter(models.Question.status == "active").all()
                         if question_banks.in_bank(q.banks_json, b))
    return {"available": total, "bank_total": db.query(models.Question)
            .filter(models.Question.status == "active").count(),
            "by_type_all": by_type, "by_bank": by_bank,
            "banks": question_banks.BANKS,
            "ai_enabled": True}


@router.post("/ai-generate", response_model=dict)
def ai_generate(payload: AiGenerateIn, db: Session = Depends(get_db),
                user: models.User = Depends(get_current_user)):
    """按当前筛选条件生成题目，校验通过后写入题库，返回可供练习引用的题目。"""
    if payload.qtype not in question_generator.TYPES:
        raise HTTPException(status_code=400, detail="不支持的题型")
    if payload.difficulty not in question_generator.DIFFICULTIES:
        raise HTTPException(status_code=400, detail="不支持的难度")
    questions, report = question_generator.generate_questions(
        db, payload.knowledge_point_ids, payload.qtype, payload.difficulty, payload.count
    )
    if not questions:
        raise HTTPException(status_code=422, detail=f"生成失败，未产生有效题目：{report}")
    bank = payload.bank.strip() if payload.bank else ""
    if bank and bank in question_banks.BANK_KEYS:
        for q in questions:
            q["banks_json"] = json.dumps([bank], ensure_ascii=False)
        report["bank"] = bank
    ids = question_generator.persist_questions(db, questions, user.id, "ai")
    return {"generated": len(ids), "question_ids": ids, "report": report,
            "questions": [{
                "id": db.query(models.Question).filter(models.Question.question_id == qid).first().id,
                "question_id": qid,
            } for qid in ids]}


@router.post("/custom", response_model=dict)
def create_custom(payload: CustomQuestionIn, db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    """用户自编题：服务端校验后入正式题库。"""
    kp = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id == payload.knowledge_point_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")
    q = {
        "question_type": payload.question_type, "difficulty": payload.difficulty,
        "question_content": payload.question_content, "code_content": payload.code_content,
        "options": payload.options, "correct_answer": payload.correct_answer,
        "explanation": payload.explanation, "score": payload.score,
    }
    ok, reason = question_generator.validate_question(q)
    if not ok:
        raise HTTPException(status_code=422, detail=f"题目未通过校验：{reason}")
    q.update({"chapter_id": payload.chapter_id or kp.chapter_id,
              "knowledge_point_id": kp.id,
              "tags_json": '["自编题", "%s"]' % kp.name})
    bank = payload.bank.strip() if payload.bank else ""
    if bank and bank in question_banks.BANK_KEYS:
        q["banks_json"] = json.dumps([bank], ensure_ascii=False)
    qid = question_generator.persist_questions(db, [q], user.id, "custom")[0]
    row = db.query(models.Question).filter(models.Question.question_id == qid).first()
    return {"message": "题目已创建并加入题库", "question_id": qid, "id": row.id}


@router.get("/mine", response_model=list[dict])
def my_questions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = db.query(models.Question).filter(
        models.Question.created_by == user.id,
        models.Question.source_type.in_(["ai", "custom"]),
    ).order_by(models.Question.created_at.desc()).all()
    return [{
        "id": r.id, "question_id": r.question_id, "question_content": r.question_content,
        "question_type": r.question_type, "difficulty": r.difficulty,
        "source_type": r.source_type, "correct_answer": r.correct_answer,
        "explanation": r.explanation,
    } for r in rows]


@router.delete("/{question_id}", response_model=dict)
def delete_my_question(question_id: str, db: Session = Depends(get_db),
                       user: models.User = Depends(get_current_user)):
    row = db.query(models.Question).filter(
        models.Question.id == question_id,
        models.Question.created_by == user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="题目不存在或无权删除")
    # 被历史答题引用的题目改为下架而非硬删，避免破坏历史记录完整性
    referenced = (db.query(models.PracticeAnswer).filter(
        models.PracticeAnswer.question_id == question_id).count()
        + db.query(models.ExamQuestion).filter(
            models.ExamQuestion.question_id == question_id).count())
    if referenced:
        row.status = "archived"
        db.commit()
        return {"message": "题目已被历史记录引用，已下架（不再参与组卷）"}
    db.delete(row)
    db.commit()
    return {"message": "题目已删除"}
