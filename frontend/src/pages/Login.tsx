import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldCheck, BookOpen, Dumbbell } from 'lucide-react'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { authApi } from '../api/client'
import { BrandLockup, MascotSticker } from '../components/Brand'
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
            <div className="mb-6">
              <BrandLockup />
            </div>
            <div className="mb-3"><Heading level={1} type="display-2">把 C 语言<br />变成一张可探索的地图</Heading></div>
            <Text>
              知识学习、自主练习、模拟考试与学习档案，形成完整的训练闭环。所有进度真实保存。
            </Text>
          </div>
          <div className="relative space-y-4">
            <div className="flex items-center gap-3">
              <BookOpen size={16} className="text-learn" /> <Text type="supporting">75 个知识点 · 12 个章节</Text>
            </div>
            <div className="flex items-center gap-3">
              <Dumbbell size={16} className="text-challenge" /> <Text type="supporting">123 道种子题目 · C11 标准</Text>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck size={16} className="text-neon" /> <Text type="supporting">练习与考试权限隔离</Text>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-2 right-1 hidden lg:block">
            <MascotSticker size={122} />
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-7 flex gap-4 border-b border-ink-700/60">
            {(['login', 'register'] as const).map((m) => (
              <Button
                key={m}
                label={m === 'login' ? '登录' : '注册新账号'}
                variant={mode === m ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setMode(m)}
              />
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <TextInput label="用户名" value={username} onChange={(v) => setUsername(v)}
              placeholder="至少 3 个字符" isRequired width="100%" />
            {mode === 'register' && (
              <TextInput label="邮箱" value={email} onChange={(v) => setEmail(v)}
                type="email" placeholder="用于找回账号" isOptional width="100%" />
            )}
            <TextInput label="密码" value={password} onChange={(v) => setPassword(v)}
              type="password" placeholder="至少 6 个字符" isRequired width="100%" />
            <div className="mt-2">
              <Button type="submit" variant="primary" width="100%"
                label={busy ? '处理中...' : mode === 'login' ? '进入工作台' : '创建账号并进入'}
                isLoading={busy} />
            </div>
          </form>
          <div className="mt-6 text-center">
            <Text type="supporting">本地账号密码存储使用 bcrypt 加盐哈希，会话使用 JWT</Text>
          </div>
        </div>
      </div>
    </div>
  )
}
