import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint,
)
from .database import Base


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=uid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=True)
    password_hash = Column(String(128), nullable=False)
    role = Column(String(16), default="student")
    level = Column(Integer, default=1)
    exp = Column(Integer, default=0)
    total_study_seconds = Column(Integer, default=0)
    streak_days = Column(Integer, default=0)
    last_active_date = Column(String(10), nullable=True)
    avatar_url = Column(String(256), nullable=True)
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


class Chapter(Base):
    __tablename__ = "chapters"
    id = Column(String(36), primary_key=True, default=uid)
    code = Column(String(16), unique=True, nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, default="")
    order_index = Column(Integer, default=0, index=True)
    unlock_condition = Column(Text, default="")
    is_active = Column(Boolean, default=True)


class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"
    id = Column(String(36), primary_key=True, default=uid)
    chapter_id = Column(String(36), ForeignKey("chapters.id"), nullable=False, index=True)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(128), nullable=False)
    difficulty = Column(String(16), default="简单")
    summary = Column(Text, default="")
    core_concept_md = Column(Text, default="")
    explanation_md = Column(Text, default="")
    syntax_md = Column(Text, default="")
    examples_json = Column(Text, default="[]")
    line_explain_json = Column(Text, default="[]")
    common_errors_json = Column(Text, default="[]")
    confused_with_json = Column(Text, default="[]")
    applications_json = Column(Text, default="[]")
    related_kp_ids = Column(Text, default="[]")
    estimated_minutes = Column(Integer, default=10)
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class KnowledgeDependency(Base):
    __tablename__ = "knowledge_dependencies"
    id = Column(String(36), primary_key=True, default=uid)
    from_kp_id = Column(String(36), ForeignKey("knowledge_points.id"), nullable=False)
    to_kp_id = Column(String(36), ForeignKey("knowledge_points.id"), nullable=False)


class Question(Base):
    __tablename__ = "questions"
    id = Column(String(36), primary_key=True, default=uid)
    question_id = Column(String(64), unique=True, nullable=False)
    chapter_id = Column(String(36), ForeignKey("chapters.id"), nullable=False, index=True)
    knowledge_point_id = Column(String(36), ForeignKey("knowledge_points.id"), nullable=False, index=True)
    question_type = Column(String(32), nullable=False)
    difficulty = Column(String(16), nullable=False)
    question_content = Column(Text, nullable=False)
    code_content = Column(Text, default="")
    options_json = Column(Text, default="[]")
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, default="")
    score = Column(Integer, default=1)
    tags_json = Column(Text, default="[]")
    banks_json = Column(Text, default="[]")
    source_type = Column(String(16), default="preset")
    created_by = Column(String(36), nullable=True)
    version = Column(Integer, default=1)
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=now)


Index("ix_question_filter", Question.knowledge_point_id, Question.difficulty,
      Question.question_type, Question.status)


class QuestionOption(Base):
    __tablename__ = "question_options"
    id = Column(String(36), primary_key=True, default=uid)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False, index=True)
    option_key = Column(String(4), nullable=False)
    option_content = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)


class QuestionDraft(Base):
    __tablename__ = "question_drafts"
    id = Column(String(36), primary_key=True, default=uid)
    provider = Column(String(32), default="")
    model_name = Column(String(64), default="")
    prompt_version = Column(String(32), default="")
    raw_payload_json = Column(Text, default="{}")
    validation_status = Column(String(16), default="pending")
    validation_report_json = Column(Text, default="{}")
    human_reviewed = Column(Boolean, default=False)
    promoted_question_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=now)


class PracticeSession(Base):
    __tablename__ = "practice_sessions"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    config_json = Column(Text, default="{}")
    status = Column(String(16), default="in_progress")
    started_at = Column(DateTime, default=now)
    submitted_at = Column(DateTime, nullable=True)
    time_limit_seconds = Column(Integer, nullable=True)
    total_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)


class PracticeAnswer(Base):
    __tablename__ = "practice_answers"
    id = Column(String(36), primary_key=True, default=uid)
    session_id = Column(String(36), ForeignKey("practice_sessions.id"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False)
    user_answer = Column(Text, default="")
    is_correct = Column(Boolean, nullable=True)
    time_spent_seconds = Column(Integer, default=0)
    hint_level_used = Column(Integer, default=0)
    viewed_answer = Column(Boolean, default=False)
    attempted_at = Column(DateTime, default=now)
    __table_args__ = (UniqueConstraint("session_id", "question_id", name="uq_practice_answer"),)


class ExamPaper(Base):
    __tablename__ = "exam_papers"
    id = Column(String(36), primary_key=True, default=uid)
    name = Column(String(128), nullable=False)
    config_json = Column(Text, default="{}")
    type_score_json = Column(Text, default="{}")
    total_score = Column(Integer, default=100)
    question_count = Column(Integer, default=0)
    created_by = Column(String(36), nullable=True)
    status = Column(String(16), default="published")
    created_at = Column(DateTime, default=now)


class ExamQuestion(Base):
    __tablename__ = "exam_questions"
    id = Column(String(36), primary_key=True, default=uid)
    paper_id = Column(String(36), ForeignKey("exam_papers.id"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False)
    score = Column(Integer, default=1)
    sort_order = Column(Integer, default=0)


class ExamAnswerKey(Base):
    __tablename__ = "exam_answer_keys"
    id = Column(String(36), primary_key=True, default=uid)
    paper_id = Column(String(36), ForeignKey("exam_papers.id"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, default="")


class ExamSession(Base):
    __tablename__ = "exam_sessions"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    paper_id = Column(String(36), ForeignKey("exam_papers.id"), nullable=False)
    status = Column(String(16), default="in_progress")
    started_at = Column(DateTime, default=now)
    deadline_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    total_score = Column(Integer, default=0)
    obtained_score = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)
    time_used_seconds = Column(Integer, default=0)


class ExamAnswer(Base):
    __tablename__ = "exam_answers"
    id = Column(String(36), primary_key=True, default=uid)
    session_id = Column(String(36), ForeignKey("exam_sessions.id"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False)
    user_answer = Column(Text, default="")
    marked = Column(Boolean, default=False)
    answered_at = Column(DateTime, default=now)
    is_correct = Column(Boolean, nullable=True)
    score_obtained = Column(Integer, default=0)
    __table_args__ = (UniqueConstraint("session_id", "question_id", name="uq_exam_answer"),)


class LearningRecord(Base):
    __tablename__ = "learning_records"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    record_type = Column(String(24), nullable=False)
    ref_id = Column(String(36), nullable=True)
    chapter_id = Column(String(36), nullable=True)
    kp_id = Column(String(36), nullable=True)
    duration_seconds = Column(Integer, default=0)
    detail_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=now, index=True)


class WrongQuestion(Base):
    __tablename__ = "wrong_questions"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("questions.id"), nullable=False)
    source = Column(String(16), default="practice")
    wrong_count = Column(Integer, default=1)
    last_wrong_at = Column(DateTime, default=now)
    mastered = Column(Boolean, default=False)
    mastered_at = Column(DateTime, nullable=True)
    note = Column(Text, default="")
    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_wrong_question"),)


class Favorite(Base):
    __tablename__ = "favorites"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String(24), nullable=False)
    target_id = Column(String(36), nullable=False)
    created_at = Column(DateTime, default=now)
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id", name="uq_favorite"),)


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(String(36), primary_key=True, default=uid)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(64), nullable=False)
    description = Column(Text, default="")
    icon = Column(String(64), default="")
    condition_json = Column(Text, default="{}")
    exp_reward = Column(Integer, default=0)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    achievement_id = Column(String(36), ForeignKey("achievements.id"), nullable=False)
    unlocked_at = Column(DateTime, default=now)


class UserProgress(Base):
    __tablename__ = "user_progress"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    chapter_id = Column(String(36), ForeignKey("chapters.id"), nullable=True)
    kp_id = Column(String(36), ForeignKey("knowledge_points.id"), nullable=True)
    status = Column(String(16), default="available")
    progress_pct = Column(Integer, default=0)
    completed_at = Column(DateTime, nullable=True)
    mastered_at = Column(DateTime, nullable=True)
    best_score = Column(Float, default=0.0)
    last_studied_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "kp_id", name="uq_user_progress_kp"),)


class DailyTask(Base):
    __tablename__ = "daily_tasks"
    id = Column(String(36), primary_key=True, default=uid)
    code = Column(String(32), unique=True, nullable=False)
    title = Column(String(128), nullable=False)
    description = Column(Text, default="")
    condition_json = Column(Text, default="{}")
    exp_reward = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class UserDailyTask(Base):
    __tablename__ = "user_daily_tasks"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("daily_tasks.id"), nullable=False)
    task_date = Column(String(10), nullable=False)
    progress = Column(Integer, default=0)
    target = Column(Integer, default=1)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    exp_claimed = Column(Boolean, default=False)


class AiConfig(Base):
    __tablename__ = "ai_configs"
    id = Column(String(36), primary_key=True, default=uid)
    provider = Column(String(32), nullable=False)
    model_name = Column(String(64), nullable=False)
    api_key_encrypted = Column(Text, default="")
    base_url = Column(String(256), default="")
    prompt_template_json = Column(Text, default="{}")
    version = Column(String(32), default="v1")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=now)
