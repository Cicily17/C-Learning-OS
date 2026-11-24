import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout, ToastProvider } from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Learning from './pages/Learning'
import KnowledgeDetail from './pages/KnowledgeDetail'
import PracticeSetup from './pages/PracticeSetup'
import PracticeSession from './pages/PracticeSession'
import PracticeResult from './pages/PracticeResult'
import Archive from './pages/Archive'
import ExamSetup from './pages/ExamSetup'
import ExamSession from './pages/ExamSession'
import ExamReport from './pages/ExamReport'
import GameMap from './pages/GameMap'
import AiAssistant from './pages/AiAssistant'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('clo_token')) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/learning" element={<Learning />} />
                  <Route path="/learning/:chapterId/:kpId" element={<KnowledgeDetail />} />
                  <Route path="/practice/setup" element={<PracticeSetup />} />
                  <Route path="/practice/session/:id" element={<PracticeSession />} />
                  <Route path="/practice/result/:id" element={<PracticeResult />} />
                  <Route path="/archive" element={<Archive />} />
                  <Route path="/exams" element={<ExamSetup />} />
                  <Route path="/exams/session/:id" element={<ExamSession />} />
                  <Route path="/exams/result/:id" element={<ExamReport />} />
                  <Route path="/game/map" element={<GameMap />} />
                  <Route path="/ai" element={<AiAssistant />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </ToastProvider>
  )
}
