import { Heading } from '@astryxdesign/core/Heading'
import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Terminal, Play, CircleStop, ShieldAlert, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { aiApi } from '../api/client'
import { CatAvatar, MascotMark } from '../components/Brand'
import { Panel, useToast } from '../components/Layout'

const SAMPLE_CODE = `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main(void) {
    int n = 5;
    printf("%d! = %d\\n", n, factorial(n));
    return 0;
}`

type Msg = { role: 'user' | 'ai'; text: string; source?: string }

export default function AiAssistant() {
  const toast = useToast()
  const [mode, setMode] = useState<'practice' | 'exam'>('practice')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: '喵～我是 C//CAT，你的编译猫搭子。概念解释、代码分析、编译报错都可以丢给我，也能帮你在代码实验室里跑一段 C。' },
  ])
  const [chatting, setChatting] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [code, setCode] = useState(SAMPLE_CODE)
  const [stdin, setStdin] = useState('')
  const [runResult, setRunResult] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { aiApi.config().then((r) => setStatus(r.data)).catch(() => {}) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content) return
    if (mode === 'exam') { toast('考试模式下 AI 助手已被禁用', 'error'); return }
    setMessages((p) => [...p, { role: 'user', text: content }])
    setInput(''); setChatting(true)
    try {
      const r = await aiApi.chat({ mode, question: content })
      setMessages((p) => [...p, { role: 'ai', text: r.data.answer, source: r.data.source }])
    } catch (e) {
      setMessages((p) => [...p, { role: 'ai', text: (e as Error).message, source: 'error' }])
    } finally { setChatting(false) }
  }

  const run = async () => {
    setRunning(true); setRunResult(null)
    try {
      const r = await aiApi.run({ code, stdin })
      setRunResult(r.data)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setRunning(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="mt-1 hidden shrink-0 sm:block">
          <MascotMark size={62} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-neon-dim">
            AI ASSISTANT / 智能学习助手
            <span className="rounded border border-neon/25 bg-neon/[0.06] px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-neon">C//CAT</span>
          </div>
          <Heading level={1}>AI 学习助手与代码实验室</Heading>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-steel-400">
            编译猫在线：概念解释、代码分析、编译错误都能问它。代码运行采用受限 C 子集解释器，只执行白名单语法，不会运行任意二进制。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setMode('practice')}
          className={`rounded-lg border px-4 py-2 text-xs transition ${mode === 'practice' ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400'}`}>
          <Bot size={13} className="mr-1.5 inline" />练习模式
        </button>
        <button onClick={() => setMode('exam')}
          className={`rounded-lg border px-4 py-2 text-xs transition ${mode === 'exam' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-ink-700/60 text-steel-400'}`}>
          <ShieldAlert size={13} className="mr-1.5 inline" />考试模式（禁用）
        </button>
        <div className="ml-auto text-xs text-steel-500">
          {status?.configured ? `大模型已配置：${status.model || status.provider}` : '未配置大模型密钥，当前使用内置规则引擎'}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="对话助手" action={<span className="text-xs text-steel-500">{mode === 'exam' ? '已锁定' : status?.source === 'database' || status?.source === 'environment' ? 'AI 生成' : '内置规则'}</span>}>
          {mode === 'exam' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs leading-6 text-red-200">
              <ShieldAlert size={15} className="mt-1 shrink-0" />
              考试模式已禁用所有辅助解题功能。交卷后切回练习模式即可继续使用。
            </div>
          )}
          <div className="mb-3 h-[380px] space-y-3 overflow-y-auto rounded-lg border border-ink-700/60 bg-ink-950/50 p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'ai' && <CatAvatar size={26} className="mb-0.5" />}
                <div className={`max-w-[84%] whitespace-pre-wrap rounded-xl border px-3 py-2 text-xs leading-6 ${
                  m.role === 'user' ? 'rounded-br-sm border-neon/30 bg-neon/10 text-neon'
                  : m.source === 'error' ? 'rounded-bl-sm border-red-500/30 bg-red-500/5 text-red-200'
                  : 'rounded-bl-sm border-ink-700/60 bg-ink-900/60 text-steel-300'
                }`}>
                  {m.role === 'ai' && (
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] text-steel-500">
                      <span className="h-1 w-1 rounded-full bg-neon/70" />
                      {m.source === 'llm' ? '编译猫 · AI 生成' : '编译猫 · 内置规则'}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {chatting && (
              <div className="flex items-end gap-2">
                <CatAvatar size={26} className="mb-0.5" />
                <div className="rounded-xl rounded-bl-sm border border-ink-700/60 bg-ink-900/60 px-3 py-2 text-xs text-steel-500">
                  编译猫正在翻书<span className="animate-pulse-soft">…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] text-steel-500">试着这样问</span>
            {['解释指针与数组的区别', '这段代码有什么问题？', 'sizeof 和 strlen 的区别'].map((q) => (
              <button key={q} disabled={mode === 'exam'} onClick={() => send(q)}
                className="rounded border border-ink-700/60 px-2 py-1 text-xs text-steel-400 transition hover:border-neon/40 hover:text-neon disabled:opacity-40">{q}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="field" placeholder={mode === 'exam' ? '考试模式下不可输入' : '问问编译猫：这段指针为什么输出 9？'}
              value={input} disabled={mode === 'exam'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
            <button className="btn-primary shrink-0" disabled={mode === 'exam' || chatting || !input.trim()} onClick={() => send()}>
              <Send size={14} />
            </button>
          </div>
        </Panel>

        <Panel title="C 代码实验室" action={<span className="tag-neon">受限解释器 · C11 校验</span>}>
          <div className="mb-2 text-xs text-steel-500">源代码（支持变量、数组、指针、函数、分支、循环与 printf）</div>
          <textarea className="field min-h-[250px] font-mono text-xs leading-6" value={code}
            onChange={(e) => setCode(e.target.value)} spellCheck={false} />
          <div className="my-2 flex items-center gap-2">
            <span className="text-xs text-steel-500">标准输入</span>
            <input className="field flex-1" value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="可选" />
            <button className="btn-primary shrink-0 text-xs" onClick={run} disabled={running}>
              {running ? <CircleStop size={14} /> : <Play size={14} />} {running ? '运行中' : '运行代码'}
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-ink-700/60 bg-[#04100b] p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-steel-500">
              <span className="flex items-center gap-1.5"><Terminal size={12} className="text-neon" /> 运行输出</span>
              {runResult && (
                <button className="flex items-center gap-1 hover:text-neon" onClick={() => {
                  navigator.clipboard?.writeText(runResult.stdout || runResult.message || '')
                  toast('输出已复制', 'success')
                }}><Copy size={11} /> 复制</button>
              )}
            </div>
            {!runResult ? (
              <div className="flex flex-col items-center gap-1.5 py-3">
                <MascotMark size={44} />
                <div className="text-center text-xs text-steel-600">点击「运行代码」，编译猫帮你跑一遍</div>
              </div>
            ) : (
              <div className="space-y-2 text-xs leading-6">
                <div className={`flex items-center gap-1.5 ${runResult.ok ? 'text-neon' : 'text-amber-400'}`}>
                  {runResult.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {runResult.ok ? `执行成功 · 退出码 ${runResult.exit_code}` : `执行未完成 · ${runResult.message || '请检查代码'}`}
                </div>
                {runResult.stdout && <pre className="whitespace-pre-wrap font-mono text-steel-300">{runResult.stdout}</pre>}
                <div className="border-t border-ink-700/50 pt-2 text-xs text-steel-500">
                  编译检查：{typeof runResult.compile_check === 'string' ? runResult.compile_check.slice(0, 300) : '通过'}
                </div>
                <div className="text-xs leading-5 text-steel-600">{runResult.limitation}</div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
