export interface User {
  id: string
  username: string
  email?: string
  level: number
  exp: number
  total_study_seconds: number
  streak_days: number
}

export interface Chapter {
  id: string
  code: string
  name: string
  description: string
  order_index: number
  kp_count: number
}

export interface KnowledgePoint {
  id: string
  chapter_id: string
  code: string
  name: string
  difficulty: string
  summary: string
  core_concept_md: string
  explanation_md: string
  syntax_md: string
  examples_json: string
  line_explain_json: string
  common_errors_json: string
  confused_with_json: string
  applications_json: string
  related_kp_ids: string
  estimated_minutes: number
  order_index: number
  progress_status: string
  progress_pct: number
  mastered: boolean
  favorited: boolean
}

export interface Question {
  id: string
  question_id: string
  chapter_id: string
  knowledge_point_id: string
  question_type: string
  difficulty: string
  question_content: string
  code_content: string
  options_json: string
  score: number
  tags_json: string
  source_type: string
  user_answer?: string
  hint_level_used?: number
  viewed_answer?: boolean
  correct_answer?: string
  explanation?: string
  is_correct?: boolean
  knowledge_point_name?: string
}

export interface PracticeConfig {
  knowledge_point_ids: string[]
  chapter_ids: string[]
  difficulties: string[]
  question_types: string[]
  bank?: string
  count: number
  time_limit_minutes?: number | null
}

export interface QuestionBank {
  key: string
  name: string
  desc: string
}

export interface ExamConfig {
  name: string
  chapter_ids: string[]
  knowledge_point_ids: string[]
  difficulties: string[]
  question_types: string[]
  count: number
  type_counts: Record<string, number>
  type_scores: Record<string, number>
  duration_minutes: number
  total_score?: number | null
}

export interface ExamQuestion {
  id: string
  question_id: string
  question_type: string
  question_content: string
  code_content: string
  options_json: string
  user_answer?: string
  marked?: boolean
}

export interface ScoreBucket {
  key: string
  name: string
  earned: number
  max: number
  correct: number
  total: number
  rate: number
}

export interface ExamReport {
  session_id: string
  paper_name: string
  total_score: number
  obtained_score: number
  correct_count: number
  total_count: number
  accuracy: number
  time_used_seconds: number
  submitted_at: string
  knowledge_point_scores: ScoreBucket[]
  question_type_scores: ScoreBucket[]
  wrong_items: any[]
  weak_knowledge_point_ids: string[]
  suggestions: string[]
}

export interface GameLevel {
  kp_id: string
  code: string
  name: string
  difficulty: string
  status: string
  unlocked: boolean
  progress_pct: number
  best_score: number
  estimated_minutes: number
}

export interface GameChapter {
  id: string
  code: string
  name: string
  description: string
  order_index: number
  unlocked: boolean
  challenge_passed: boolean
  challenge_available: boolean
  total_kps: number
  completed_kps: number
  mastered_kps: number
  progress_pct: number
  levels: GameLevel[]
}

export interface ToastMessage {
  id: number
  text: string
  kind: 'success' | 'error' | 'info'
}
