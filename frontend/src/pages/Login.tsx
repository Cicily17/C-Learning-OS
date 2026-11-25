import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Terminal, ShieldCheck, BookOpen, Dumbbell } from 'lucide-react'
import { authApi } from '../api/client'
import { useToast } from '../components/Layout'

export default function Login() {
  const navigate = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  if (localStorage.getItem('clo_token')) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = mode === 'login'
        ? await authApi.login({ username, password })
        : await authApi.register({ username, password, email: email || undefined })
      localStorage.setItem('clo_token', res.data.access_token)
      localStorage.setItem('clo_user', JSON.stringify(res.data.user))
      toast(`欢迎回来，${res.data.user.username}`, 'success')
      navigate('/', { replace: true })
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/85 shadow-panel backdrop-blur-xl md:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-700/60 p-9 md:flex">
          <div className="absolute inset-0 opacity-50" style={{
            backgroundImage: 'linear-gradient(rgba(88,235,4,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(88,235,4,0.06) 1px,transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-learn/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-ai/15 blur-3xl" />
          <div className="relative">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10">
                <Terminal size={22} className="text-neon" />
              </div>
              <div>
                <div className="text-[17px] font-medium text-[#F1F5F9]">C Learning OS</div>
                <div className="text-[10px] tracking-[0.2em] text-steel-500">LEARNING WORKSTATION</div>
              </div>
            </div>
            <h1 className="mb-3 text-[22px] leading-snug text-[#F1F5F9]">把 C 语言<br />变成一张可探索的地图</h1>
            <p className="text-[13px] leading-6 text-steel-400">
              知识学习、自主练习、模拟考试与学习档案，形成完整的训练闭环。所有进度真实保存。
            </p>
          </div>
          <div className="relative space-y-4">
            <div className="flex items-center gap-3 text-[12px] text-steel-400">
              <BookOpen size={16} className="text-learn" /> 75 个知识点 · 12 个章节
            </div>
            <div className="flex items-center gap-3 text-[12px] text-steel-400">
              <Dumbbell size={16} className="text-challenge" /> 123 道种子题目 · C11 标准
            </div>
            <div className="flex items-center gap-3 text-[12px] text-steel-400">
              <ShieldCheck size={16} className="text-neon" /> 练习与考试权限隔离
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-7 flex border-b border-ink-700/60">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`mr-6 border-b-2 pb-3 text-[13px] transition ${
                  mode === m ? 'border-neon text-neon' : 'border-transparent text-steel-500 hover:text-steel-400'
                }`}
              >
                {m === 'login' ? '登录' : '注册新账号'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] text-steel-400">用户名</label>
              <input className="field" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="至少 3 个字符" required />
            </div>
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-[12px] text-steel-400">邮箱（可选）</label>
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="用于找回账号" />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[12px] text-steel-400">密码</label>
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 个字符" required />
            </div>
            <button className="btn-primary mt-2 w-full" disabled={busy}>
              {busy ? '处理中...' : mode === 'login' ? '进入工作台' : '创建账号并进入'}
            </button>
          </form>
          <p className="mt-6 text-center text-[11px] leading-5 text-steel-500">
            本地账号密码存储使用 bcrypt 加盐哈希，会话使用 JWT
          </p>
        </div>
      </div>
    </div>
  )
}
