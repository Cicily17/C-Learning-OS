import { createContext, useContext, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Dumbbell, ClipboardList, Gamepad2,
  Archive, Settings, Terminal, LogOut, Radio, Star, Sparkles,
} from 'lucide-react'
import type { User } from '../types'
import type { ToastMessage } from '../types'

type ToastCtx = (text: string, kind?: ToastMessage['kind']) => void
const ToastContext = createContext<ToastCtx>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const navItems = [
  { to: '/', label: '学习工作台', icon: LayoutDashboard, end: true },
  { to: '/learning', label: '知识学习', icon: BookOpen },
  { to: '/practice/setup', label: '智能练习', icon: Dumbbell },
  { to: '/exams', label: '模拟考试', icon: ClipboardList },
  { to: '/game/map', label: '闯关地图', icon: Gamepad2 },
  { to: '/ai', label: 'AI 助手', icon: Sparkles },
  { to: '/archive', label: '学习档案', icon: Archive },
]

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const push: ToastCtx = (text, kind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text, kind }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
  }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`panel px-4 py-3 text-[13px] ${
              t.kind === 'error' ? 'border-red-500/50 text-red-300'
              : t.kind === 'success' ? 'border-neon/50 text-neon'
              : 'border-steel-600/60 text-[#c3d8cc]'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('clo_user') || '{}') as User

  const logout = () => {
    localStorage.removeItem('clo_token')
    localStorage.removeItem('clo_user')
    navigate('/login')
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="hidden min-h-screen flex-col border-r border-ink-700/60 bg-ink-900/70 px-3 py-5 lg:flex">
        <div className="mb-7 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neon/40 bg-neon/10">
            <Terminal size={18} className="text-neon" />
          </div>
          <div>
            <div className="text-[14px] font-medium tracking-wide text-[#e4f3e9]">C Learning OS</div>
            <div className="text-[10px] tracking-[0.18em] text-steel-500">LEARNING WORKSTATION</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${
                  isActive
                    ? 'border border-neon/30 bg-neon/10 text-neon'
                    : 'border border-transparent text-steel-400 hover:border-ink-600/60 hover:bg-ink-800/50 hover:text-[#d7e6dd]'
                }`
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 space-y-2 border-t border-ink-700/60 pt-4">
          <div className="flex items-center gap-2 px-2 text-[11px] text-steel-500">
            <Radio size={12} className="text-neon-dim" />
            SYSTEM ONLINE · C11
          </div>
          <button onClick={logout} className="btn-ghost w-full justify-start">
            <LogOut size={15} /> 退出登录
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-700/60 bg-ink-950/90 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3 lg:hidden">
            <Terminal size={18} className="text-neon" />
            <span className="text-[13px] text-neon">C Learning OS</span>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-steel-500 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-glow" />
            学习终端已连接
            <span className="mx-2 text-ink-600">/</span>
            <span>当前标准 C11</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-neon/25 bg-neon/5 px-3 py-1 text-[11px] text-neon sm:flex">
              <Star size={12} /> Lv.{user.level || 1} · {user.exp || 0} EXP
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-steel-600/60 bg-ink-800 text-[12px] text-[#cfe3d6]">
              {(user.username || 'U').slice(0, 1).toUpperCase()}
            </div>
            <span className="text-[12px] text-[#c3d8cc]">{user.username || '学员'}</span>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-ink-700/50 px-4 py-2 lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded px-3 py-1.5 text-[12px] ${
                  isActive ? 'bg-neon/10 text-neon' : 'text-steel-400'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

export function Panel({ title, action, children, className = '' }: {
  title: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-center">
      <div className="h-8 w-8 rounded border border-dashed border-ink-600" />
      <p className="text-[12px] text-steel-500">{text}</p>
    </div>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
