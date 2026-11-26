import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Dumbbell, ClipboardList, Gamepad2,
  Archive, LogOut, Radio, Sparkles, Flame, Zap,
  AlertTriangle, X, ArrowRight, CircleAlert, Info,
} from 'lucide-react'
import { Text } from '@astryxdesign/core/Text'
import { Heading } from '@astryxdesign/core/Heading'
import { Button } from '@astryxdesign/core/Button'
import { gameApi } from '../api/client'
import { BrandLockup, CatAvatar, MascotMark } from './Brand'
import type { ToastMessage, User } from '../types'

type ToastCtx = (text: string, kind?: ToastMessage['kind']) => void
const ToastContext = createContext<ToastCtx>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

type NavItem = {
  to: string
  match: string
  label: string
  en: string
  no: string
  icon: typeof LayoutDashboard
  on: string
  bar: string
  iconColor: string
}

// 每个模块拥有独立的功能色识别（Astryx 语义分色：颜色承担功能区分，不只是装饰）
const navGroups: { label: string; en: string; items: NavItem[] }[] = [
  {
    label: '学习', en: 'LEARN',
    items: [
      { to: '/', match: '/', label: '学习工作台', en: 'Overview', no: '01', icon: LayoutDashboard,
        on: 'border-neon/25 bg-neon/10 text-neon', bar: 'bg-neon', iconColor: 'text-neon' },
      { to: '/learning', match: '/learning', label: '知识课堂', en: 'Knowledge', no: '02', icon: BookOpen,
        on: 'border-learn/25 bg-learn/10 text-learn', bar: 'bg-learn', iconColor: 'text-learn' },
    ],
  },
  {
    label: '训练', en: 'TRAIN',
    items: [
      { to: '/practice/setup', match: '/practice', label: '编程练习', en: 'Practice', no: '03', icon: Dumbbell,
        on: 'border-progress/25 bg-progress/10 text-progress', bar: 'bg-progress', iconColor: 'text-progress' },
      { to: '/exams', match: '/exams', label: '模拟考试', en: 'Exam', no: '04', icon: ClipboardList,
        on: 'border-challenge/25 bg-challenge/10 text-challenge', bar: 'bg-challenge', iconColor: 'text-challenge' },
      { to: '/game/map', match: '/game', label: '闯关地图', en: 'Sector Map', no: '05', icon: Gamepad2,
        on: 'border-ai/25 bg-ai/10 text-ai', bar: 'bg-ai', iconColor: 'text-ai' },
    ],
  },
  {
    label: '工具', en: 'TOOLS',
    items: [
      { to: '/ai', match: '/ai', label: 'AI 助手', en: 'Copilot', no: '06', icon: Sparkles,
        on: 'border-ai/25 bg-ai/10 text-ai', bar: 'bg-ai', iconColor: 'text-ai' },
      { to: '/archive', match: '/archive', label: '学习档案', en: 'Archive', no: '07', icon: Archive,
        on: 'border-progress/25 bg-progress/10 text-progress', bar: 'bg-progress', iconColor: 'text-progress' },
    ],
  },
]

const flatNav = navGroups.flatMap((g) => g.items)

function resolveCurrent(pathname: string): NavItem {
  const hit = [...flatNav]
    .filter((n) => n.match !== '/' && pathname.startsWith(n.match))
    .sort((a, b) => b.match.length - a.match.length)[0]
  return hit || flatNav[0]
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const push: ToastCtx = (text, kind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text, kind }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600)
  }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:right-6">
        {toasts.map((t) => {
          const Icon = t.kind === 'error' ? CircleAlert : t.kind === 'success' ? Zap : Info
          return (
            <div
              key={t.id}
              className={`animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm backdrop-blur-xl ${
                t.kind === 'error' ? 'border-danger/45 bg-[#2a1418]/95 text-danger-soft'
                : t.kind === 'success' ? 'border-neon/40 bg-[#131f14]/95 text-neon-soft'
                : 'border-learn/35 bg-ink-850/95 text-steel-300'
              }`}
              style={{ boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <Text>{t.text}</Text>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState<any>(null)
  const user = useMemo(() => JSON.parse(localStorage.getItem('clo_user') || '{}') as User, [])
  const current = resolveCurrent(location.pathname)

  useEffect(() => {
    let alive = true
    gameApi.profile()
      .then((r) => { if (alive) setProfile(r.data) })
      .catch(() => {})
    return () => { alive = false }
  }, [location.pathname])

  const logout = () => {
    localStorage.removeItem('clo_token')
    localStorage.removeItem('clo_user')
    navigate('/login')
  }

  const level = profile?.level
  const exp = level?.exp ?? user.exp ?? 0
  const lv = level?.level ?? (Math.floor((user.exp || 0) / 200) + 1)
  const streak = profile?.streak_days ?? user.streak_days ?? 0
  const lvPct = level?.progress_pct ?? ((exp % 200) / 200) * 100
  const toNext = 200 - (exp % 200)

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <div className="cyber-grid-overlay" />

      {/* 左侧固定导航 */}
      <aside className="relative z-10 hidden min-h-screen flex-col border-r border-ink-700/60 bg-[#0a0f15]/95 px-3 py-5 backdrop-blur-xl lg:flex">
        {/* 品牌：C//CAT 编译猫 */}
        <div className="mb-7 px-2">
          <BrandLockup />
        </div>

        <nav className="flex flex-1 flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2 px-3">
                <span className="font-mono text-[11px] tracking-[0.16em] text-steel-600">{group.en}</span>
                <span className="h-px flex-1 bg-ink-700/60" />
                <span className="text-xs text-steel-500">{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 ${
                        isActive
                          ? item.on
                          : 'border-transparent text-steel-400 hover:border-ink-700/70 hover:bg-ink-800/50 hover:text-text-primary'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity ${item.bar} ${isActive ? 'opacity-100 shadow-glow' : 'opacity-0'}`} />
                        <span className={`font-mono text-[10px] ${isActive ? 'opacity-70' : 'text-steel-600 group-hover:text-steel-500'}`}>{item.no}</span>
                        <item.icon size={17} strokeWidth={1.8} className={isActive ? '' : item.iconColor + ' opacity-80'} />
                        <Text type="label">{item.label}</Text>
                        {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-current" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-5 space-y-3 border-t border-ink-700/60 pt-4">
          <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-steel-300">Lv.{lv} · {level?.title || '见习学员'}</div>
              <div className="font-mono text-xs text-steel-500">{Math.round(lvPct)}%</div>
            </div>
            <div className="progress-track mt-2">
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, lvPct))}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-steel-500">
              <span>{exp} EXP</span>
              <span>距下一级 {toNext}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-2">
              <Radio size={12} className="text-neon animate-pulse-soft" />
              <Text type="supporting">SYSTEM ONLINE</Text>
            </div>
            <button onClick={logout} aria-label="退出登录" title="退出登录"
              className="rounded-lg border border-transparent p-1.5 text-steel-500 transition hover:border-danger/30 hover:bg-danger/10 hover:text-danger">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 min-w-0">
        {/* 顶部状态栏 */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-700/60 bg-[#080d12]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <MascotMark size={38} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-primary">{current.label}</div>
              <div className="mt-0.5 hidden items-center gap-2 text-xs text-steel-500 sm:flex">
                <span className="h-1 w-1 rounded-full bg-neon" />
                <span>学习终端已连接</span>
                <span className="text-steel-600">/</span>
                <span>标准 C11 · 服务端判分</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/[0.07] px-2.5 py-1.5 text-xs text-danger-soft sm:flex">
              <Flame size={13} /> <span className="font-mono">{streak}</span>
              <span className="text-xs text-steel-500">天</span>
            </div>
            <div className="hidden items-center gap-1.5 rounded-lg border border-neon/25 bg-neon/[0.07] px-2.5 py-1.5 text-xs text-neon md:flex">
              <Zap size={13} /> <span className="font-mono">{exp}</span>
              <span className="text-xs text-steel-500">EXP</span>
            </div>
            <div className="flex items-center gap-2.5 border-l border-ink-700/60 pl-2 sm:pl-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-ai/35 bg-gradient-to-br from-ai/20 to-learn/15">
                <span className="text-sm font-semibold text-text-primary">{(user.username || 'U').slice(0, 1).toUpperCase()}</span>
                <span className="absolute -bottom-1 -right-1 rounded border border-challenge/40 bg-[#151a20] px-1 font-mono text-[10px] text-challenge">Lv{lv}</span>
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-medium text-text-primary">{user.username || '学员'}</div>
                <div className="text-xs text-steel-500">{level?.title || '学习终端用户'}</div>
              </div>
            </div>
            <button onClick={logout} aria-label="退出登录" title="退出登录"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-ink-600/50 text-steel-500 transition hover:border-danger/40 hover:text-danger sm:flex lg:hidden">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* 移动端横向导航 */}
        <nav className="flex gap-1.5 overflow-x-auto border-b border-ink-700/50 bg-[#0a0f15]/80 px-3 py-2 lg:hidden">
          {flatNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition ${
                  isActive ? item.on : 'border-transparent text-steel-400'
                }`
              }
            >
              <item.icon size={13} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto max-w-[1560px] p-4 sm:p-6 xl:p-7">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({
  eyebrow, title, description, actions, aside,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</div>
        <Heading level={1} className="mt-2.5">{title}</Heading>
        {description && (
          <div className="mt-2 max-w-3xl text-sm leading-6 text-steel-400">{description}</div>
        )}
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({
  title, en, action, hint,
}: { title: string; en?: string; action?: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-wide text-text-primary">{title}</h2>
        {en && <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-600">{en}</span>}
        {hint && <span className="text-xs text-steel-500">{hint}</span>}
      </div>
      {action}
    </div>
  )
}

export function Panel({ title, hint, action, children, className = '' }: {
  title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading level={2} className="panel-title">{title}</Heading>
          {hint && <span className="panel-hint">{hint}</span>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function EmptyState({ text, hint, action, icon }: {
  text: string; hint?: string; action?: ReactNode; icon?: ReactNode
}) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-ink-600/80 bg-ink-900/40 text-steel-500">
        {icon || <CatAvatar size={26} />}
      </div>
      <div>
        <div className="text-sm text-steel-300">{text}</div>
        {hint && <div className="mt-1 text-xs text-steel-500">{hint}</div>}
      </div>
      {action}
    </div>
  )
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'bg-neon' : tone === 'warning' ? 'bg-challenge' : 'bg-progress'
  return (
    <div className="progress-track">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function ConfirmDialog({
  isOpen, title, description, detail, confirmLabel = '确认删除', busy = false,
  onCancel, onConfirm,
}: {
  isOpen: boolean
  title: string
  description: string
  detail?: ReactNode
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, busy, onCancel])

  if (!isOpen) return null
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) onCancel()
    }}>
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="flex items-start gap-3 border-b border-ink-700/60 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/35 bg-danger/10 text-danger">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div id="confirm-title" className="text-base font-semibold text-text-primary">{title}</div>
            <div className="mt-1 text-sm leading-6 text-steel-400">{description}</div>
          </div>
          <button className="rounded p-1 text-steel-500 hover:text-text-primary" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        {detail && <div className="border-b border-ink-700/50 px-5 py-4 text-sm text-steel-300">{detail}</div>}
        <div className="flex items-center justify-end gap-2 p-4">
          <Button label="取消" variant="ghost" onClick={onCancel} isDisabled={busy} />
          <Button label={busy ? '处理中...' : confirmLabel} variant="destructive"
            icon={<AlertTriangle size={14} />} onClick={onConfirm} isLoading={busy} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className="inline-flex items-center gap-1 text-sm text-neon transition hover:text-neon-soft">
      {children}<ArrowRight size={13} />
    </NavLink>
  )
}
