import { createContext, useContext, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Dumbbell, ClipboardList, Gamepad2,
  Archive, Settings, Terminal, LogOut, Radio, Star, Sparkles,
  Bell, Flame, Coins, ShieldCheck,
} from 'lucide-react'
import type { User } from '../types'
import type { ToastMessage } from '../types'

type ToastCtx = (text: string, kind?: ToastMessage['kind']) => void
const ToastContext = createContext<ToastCtx>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

// 每个模块拥有独立的功能色识别（Astryx 语义分色：颜色承担功能区分，不只是装饰）
const navItems = [
  { to: '/', label: '学习工作台', icon: LayoutDashboard, end: true,
    on: 'border-neon/40 bg-neon/10 text-neon shadow-glow-green', glow: 'bg-neon' },
  { to: '/learning', label: '知识课堂', icon: BookOpen,
    on: 'border-learn/40 bg-learn/10 text-learn shadow-glow-blue', glow: 'bg-learn' },
  { to: '/practice/setup', label: '编程练习', icon: Dumbbell,
    on: 'border-progress/40 bg-progress/10 text-progress', glow: 'bg-progress' },
  { to: '/exams', label: '模拟考试', icon: ClipboardList,
    on: 'border-challenge/40 bg-challenge/10 text-challenge shadow-glow-orange', glow: 'bg-challenge' },
  { to: '/game/map', label: '闯关地图', icon: Gamepad2,
    on: 'border-challenge/40 bg-challenge/10 text-challenge', glow: 'bg-challenge' },
  { to: '/ai', label: 'AI 助手', icon: Sparkles,
    on: 'border-ai/40 bg-ai/10 text-ai shadow-glow-purple', glow: 'bg-ai' },
  { to: '/archive', label: '学习档案', icon: Archive,
    on: 'border-progress/40 bg-progress/10 text-progress', glow: 'bg-progress' },
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
            className={`animate-fade-up rounded-lg border px-4 py-3 text-[13px] backdrop-blur-md ${
              t.kind === 'error' ? 'border-danger/50 bg-danger/10 text-danger'
              : t.kind === 'success' ? 'border-neon/50 bg-neon/10 text-neon'
              : 'border-learn/40 bg-ink-850/90 text-steel-300'
            }`}
            style={{ boxShadow: '0 12px 34px rgba(0,0,0,0.5)' }}
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
    <div className="relative min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      <div className="cyber-grid-overlay" />
      {/* 左侧固定导航 */}
      <aside className="relative z-10 hidden min-h-screen flex-col border-r border-ink-700/70 bg-ink-950/85 px-3 py-5 backdrop-blur-xl lg:flex">
        {/* 品牌 / 终端标识 */}
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-neon/50 bg-neon/10">
            <Terminal size={19} className="text-neon" />
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-neon shadow-glow-green animate-pulse-soft" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-wide text-text-primary">C Learning OS</div>
            <div className="mt-0.5 text-[9px] tracking-[0.22em] text-steel-500">LEARNING WORKSTATION</div>
          </div>
        </div>

        <div className="mb-3 px-3 text-[9px] font-medium tracking-[0.2em] text-steel-600">主控制台 / MAIN</div>
        <nav className="flex flex-1 flex-col gap-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-all duration-200 ${
                  isActive
                    ? item.on
                    : 'border-transparent text-steel-400 hover:border-ink-600/70 hover:bg-ink-800/60 hover:text-text-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity ${item.glow} ${isActive ? 'opacity-100 shadow-glow' : 'opacity-0'}`} />
                  <item.icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {isActive && <span className="ml-auto text-[9px] opacity-70">▸</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 space-y-3 border-t border-ink-700/70 pt-4">
          <div className="flex items-center gap-2 px-2 text-[10px] tracking-wide text-steel-500">
            <Radio size={12} className="text-neon animate-pulse-soft" />
            <span>SYSTEM ONLINE · C11</span>
          </div>
          <button onClick={logout} className="btn-ghost w-full justify-start border-danger/30 hover:border-danger/60 hover:text-danger">
            <LogOut size={15} /> 退出登录
          </button>
        </div>
      </aside>

      <div className="relative z-10 min-w-0">
        {/* 顶部状态栏 */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-ink-700/70 bg-ink-950/90 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3 lg:hidden">
            <Terminal size={18} className="text-neon" />
            <span className="text-[13px] font-medium text-neon">C Learning OS</span>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-steel-500 xl:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-neon shadow-glow-green animate-pulse-soft" />
            学习终端已连接
            <span className="mx-2 text-ink-600">/</span>
            <ShieldCheck size={12} className="text-progress" />
            <span>当前标准 C11 · 服务端判分</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* 等级 */}
            <div className="hidden items-center gap-1.5 rounded-full border border-challenge/30 bg-challenge/10 px-3 py-1 text-[11px] font-medium text-challenge sm:flex">
              <Star size={12} /> Lv.{user.level || 1}
            </div>
            {/* EXP 经验值 */}
            <div className="hidden items-center gap-1.5 rounded-full border border-learn/30 bg-learn/10 px-3 py-1 text-[11px] text-learn md:flex">
              <Sparkles size={12} /> {user.exp || 0} EXP
            </div>
            {/* 连续学习天数 */}
            <div className="hidden items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-[11px] text-danger md:flex">
              <Flame size={12} /> {user.streak_days || 0} 天
            </div>
            {/* 积分（以 EXP 为学习积分） */}
            <div className="hidden items-center gap-1.5 rounded-full border border-progress/30 bg-progress/10 px-3 py-1 text-[11px] text-progress lg:flex">
              <Coins size={12} /> {user.exp || 0}
            </div>
            {/* 通知 / 设置 */}
            <button aria-label="通知" title="通知中心" className="hidden h-8 w-8 items-center justify-center rounded-lg border border-ink-600/60 bg-ink-800/50 text-steel-400 transition hover:border-ai/50 hover:text-ai sm:flex">
              <Bell size={15} />
            </button>
            <button aria-label="设置" title="设置" onClick={() => navigate('/archive')} className="hidden h-8 w-8 items-center justify-center rounded-lg border border-ink-600/60 bg-ink-800/50 text-steel-400 transition hover:border-neon/50 hover:text-neon sm:flex">
              <Settings size={15} />
            </button>
            {/* 用户头像 */}
            <div className="flex items-center gap-2 border-l border-ink-700/70 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ai/40 bg-gradient-to-br from-ai/25 to-learn/20 text-[12px] font-semibold text-text-primary">
                {(user.username || 'U').slice(0, 1).toUpperCase()}
              </div>
              <span className="hidden text-[12px] text-text-primary sm:inline">{user.username || '学员'}</span>
            </div>
          </div>
        </header>

        {/* 移动端横向导航 */}
        <nav className="flex gap-1.5 overflow-x-auto border-b border-ink-700/60 bg-ink-950/70 px-4 py-2 lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md border px-3 py-1.5 text-[12px] transition ${
                  isActive ? item.on : 'border-transparent text-steel-400'
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
