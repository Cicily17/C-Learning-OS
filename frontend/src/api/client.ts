import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clo_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    config.headers['X-Auth-Token'] = token
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('clo_token')
      localStorage.removeItem('clo_user')
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    const detail = error.response?.data?.detail
    return Promise.reject(new Error(typeof detail === 'string' ? detail : '请求失败，请稍后重试'))
  },
)

export const authApi = {
  register: (data: { username: string; password: string; email?: string }) => api.post('/auth/register', data),
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

export const learningApi = {
  chapters: () => api.get('/learning/chapters'),
  kps: (params?: { chapter_id?: string; keyword?: string }) => api.get('/learning/knowledge-points', { params }),
  kp: (id: string) => api.get(`/learning/knowledge-points/${id}`),
  updateProgress: (id: string, data: Record<string, unknown>) => api.put(`/learning/knowledge-points/${id}/progress`, data),
  toggleFavorite: (data: { target_type: string; target_id: string }) => api.post('/learning/favorites', data),
  favorites: () => api.get('/learning/favorites'),
  dashboard: () => api.get('/learning/dashboard'),
}

export const practiceApi = {
  create: (data: Record<string, unknown>) => api.post('/practice/sessions', data),
  session: (id: string) => api.get(`/practice/sessions/${id}`),
  saveAnswer: (id: string, data: Record<string, unknown>) => api.post(`/practice/sessions/${id}/answers`, data),
  hint: (id: string, questionId: string, level: number) =>
    api.post(`/practice/sessions/${id}/hint`, null, { params: { question_id: questionId, level } }),
  answer: (id: string, questionId: string) =>
    api.get(`/practice/sessions/${id}/answer`, { params: { question_id: questionId } }),
  favorite: (id: string, questionId: string) =>
    api.post(`/practice/sessions/${id}/favorite`, null, { params: { question_id: questionId } }),
  submit: (id: string) => api.post(`/practice/sessions/${id}/submit`),
  result: (id: string) => api.get(`/practice/sessions/${id}/result`),
  history: () => api.get('/practice/history'),
  wrongQuestions: () => api.get('/practice/wrong-questions'),
  deleteHistory: (id: string) => api.delete(`/practice/history/${id}`),
  clearHistory: () => api.delete('/practice/history'),
}

export const examsApi = {
  createPaper: (data: Record<string, unknown>) => api.post('/exams/papers', data),
  papers: () => api.get('/exams/papers'),
  paper: (id: string) => api.get(`/exams/papers/${id}`),
  start: (paperId: string) => api.post('/exams/sessions', null, { params: { paper_id: paperId } }),
  session: (id: string) => api.get(`/exams/sessions/${id}`),
  saveAnswer: (id: string, data: Record<string, unknown>) => api.post(`/exams/sessions/${id}/answers`, data),
  mark: (id: string, data: Record<string, unknown>) => api.post(`/exams/sessions/${id}/mark`, data),
  submit: (id: string) => api.post(`/exams/sessions/${id}/submit`),
  result: (id: string) => api.get(`/exams/sessions/${id}/result`),
  history: () => api.get('/exams/history'),
  deleteHistory: (id: string) => api.delete(`/exams/history/${id}`),
  clearHistory: () => api.delete('/exams/history'),
}

export const questionsApi = {
  availability: (data: Record<string, unknown>) => api.post('/questions/availability', data),
  aiGenerate: (data: Record<string, unknown>) => api.post('/questions/ai-generate', data),
  custom: (data: Record<string, unknown>) => api.post('/questions/custom', data),
  mine: () => api.get('/questions/mine'),
  remove: (id: string) => api.delete(`/questions/${id}`),
}

export const gameApi = {
  map: () => api.get('/game/map'),
  profile: () => api.get('/game/profile'),
  startChallenge: (chapterId: string) => api.post(`/game/chapters/${chapterId}/challenge`),
}

export const aiApi = {
  chat: (data: Record<string, unknown>) => api.post('/ai/chat', data),
  config: () => api.get('/ai/config'),
  run: (data: { code: string; stdin?: string }) => api.post('/ai/run', data),
  codeHint: (data: { question: string; code: string; level: number; question_type: string; difficulty: string }) =>
    api.post('/ai/code-hint', data),
}

export default api
