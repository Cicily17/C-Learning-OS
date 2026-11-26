from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..ai import engine
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat", response_model=dict)
def chat(
    payload: schemas.AiChatIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if payload.mode == "exam":
        raise HTTPException(
            status_code=403,
            detail="考试模式下禁止使用 AI 助手。请交卷后再查看解析或进行咨询。",
        )
    result = engine.answer(db, payload)
    return {**result, "mode": "practice"}


@router.get("/config", response_model=dict)
def get_config(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """只返回配置状态，密钥永不回传前端。"""
    return engine.ai_status(db)


@router.put("/config", response_model=schemas.MessageOut)
def save_config(
    payload: schemas.AiConfigIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可配置大模型密钥")
    existing = db.query(models.AiConfig).filter(models.AiConfig.is_active.is_(True)).first()
    if existing:
        existing.provider = payload.provider
        existing.model_name = payload.model
        existing.base_url = payload.base_url
        if payload.api_key:
            existing.api_key_encrypted = payload.api_key
        existing.created_at = datetime.now(timezone.utc)
    else:
        db.add(models.AiConfig(
            provider=payload.provider, model_name=payload.model,
            api_key_encrypted=payload.api_key, base_url=payload.base_url,
        ))
    db.commit()
    return schemas.MessageOut(message="AI 配置已保存到服务端，密钥不会返回前端")


@router.post("/run", response_model=dict)
def run_code(
    payload: schemas.CodeRunIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return engine.run_c(payload.code, payload.stdin)


@router.post("/code-hint", response_model=dict)
def code_hint(
    payload: schemas.CodeHintIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """代码题三级思路提示。练习与考试均可使用，只给思路不给答案。"""
    return engine.code_hint(db, payload)
