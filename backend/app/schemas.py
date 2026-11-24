from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from .models import uid


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    level: int
    exp: int
    total_study_seconds: int
    streak_days: int

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChapterOut(BaseModel):
    id: str
    code: str
    name: str
    description: str
    order_index: int
    kp_count: int = 0

    class Config:
        from_attributes = True


class KnowledgePointOut(BaseModel):
    id: str
    chapter_id: str
    code: str
    name: str
    difficulty: str
    summary: str
    core_concept_md: str
    explanation_md: str
    syntax_md: str
    examples_json: str
    line_explain_json: str
    common_errors_json: str
    confused_with_json: str
    applications_json: str
    related_kp_ids: str
    estimated_minutes: int
    order_index: int
    progress_status: str = "available"
    progress_pct: int = 0
    mastered: bool = False
    favorited: bool = False

    class Config:
        from_attributes = True


class KPProgressIn(BaseModel):
    status: Optional[str] = None
    progress_pct: Optional[int] = None
    mastered: Optional[bool] = None


class FavoriteIn(BaseModel):
    target_type: str
    target_id: str


class QuestionOut(BaseModel):
    """题库题目输出。practice 接口可包含答案字段；exam 接口使用 ExamQuestionOut 白名单。"""
    id: str
    question_id: str
    chapter_id: str
    knowledge_point_id: str
    question_type: str
    difficulty: str
    question_content: str
    code_content: str
    options_json: str
    score: int
    tags_json: str
    source_type: str

    class Config:
        from_attributes = True


class ExamQuestionOut(BaseModel):
    """考试接口专用白名单：绝不暴露答案、解析、分值。"""
    id: str
    question_id: str
    question_type: str
    question_content: str
    code_content: str
    options_json: str

    class Config:
        from_attributes = True


class PracticeConfigIn(BaseModel):
    knowledge_point_ids: list[str] = Field(default_factory=list)
    chapter_ids: list[str] = Field(default_factory=list)
    difficulties: list[str] = Field(default_factory=list)
    question_types: list[str] = Field(default_factory=list)
    count: int = Field(default=10, ge=1, le=200)
    time_limit_minutes: Optional[int] = None


class PracticeAnswerIn(BaseModel):
    question_id: str
    user_answer: str = ""
    time_spent_seconds: int = 0
    hint_level_used: int = 0
    viewed_answer: bool = False


class PracticeSubmitOut(BaseModel):
    session_id: str
    total_count: int
    correct_count: int
    accuracy: float
    exp_gained: int
    wrong_question_ids: list[str]
    unlocked_achievements: list[str] = Field(default_factory=list)


class HintOut(BaseModel):
    level: int
    content: str
    mode: str


class DashboardOut(BaseModel):
    user: UserOut
    total_practice: int
    total_exam: int
    avg_accuracy: float
    wrong_count: int
    studied_kp_count: int
    total_kp_count: int
    mastery_rate: float
    recent_records: list[dict[str, Any]]
    trend: list[dict[str, Any]]


class MessageOut(BaseModel):
    message: str
    id: Optional[str] = None


class AiChatIn(BaseModel):
    mode: str = Field(default="practice", pattern="^(practice|exam)$")
    question: Optional[str] = None
    code: Optional[str] = None
    error: Optional[str] = None
    topic: Optional[str] = None


class AiConfigIn(BaseModel):
    provider: str = "openai"
    model: str = ""
    base_url: str = ""
    api_key: str = ""


class CodeRunIn(BaseModel):
    code: str = Field(min_length=1, max_length=8000)
    stdin: str = ""


class ExamConfigIn(BaseModel):
    """考试配置。答案由服务端独立保存，配置接口不接受任何答案字段。"""
    name: str = Field(min_length=1, max_length=128)
    chapter_ids: list[str] = Field(default_factory=list)
    knowledge_point_ids: list[str] = Field(default_factory=list)
    difficulties: list[str] = Field(default_factory=list)
    question_types: list[str] = Field(default_factory=list)
    count: int = Field(default=10, ge=1, le=200)
    type_counts: dict[str, int] = Field(default_factory=dict)
    type_scores: dict[str, int] = Field(default_factory=dict)
    duration_minutes: int = Field(default=60, ge=1, le=600)
    total_score: Optional[int] = None


class ExamAnswerIn(BaseModel):
    question_id: str
    user_answer: str = ""


class ExamMarkIn(BaseModel):
    question_id: str
    marked: bool = True


class ExamSubmitOut(BaseModel):
    session_id: str
    total_score: int
    obtained_score: int
    correct_count: int
    total_count: int
    accuracy: float
    time_used_seconds: int
    exp_gained: int
    unlocked_achievements: list[str] = Field(default_factory=list)
