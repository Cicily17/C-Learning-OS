import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Sparkles, Terminal, Loader2, Check, ChevronDown,
} from 'lucide-react'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { aiApi } from '../api/client'
import { Panel, useToast } from './Layout'
import { applyCompletion, getCompletions, type Completion } from '../lib/cCompletion'
import { caretCoordinates, type CaretMetrics } from '../lib/caret'

export interface CodeQuestionData {
  question_id: string
  question_content: string
  code_content: string
  question_type: string
  difficulty: string
  tags_json?: string
  knowledge_point_name?: string
  score?: number
}

interface Props {
  question: CodeQuestionData
  code: string
  onCodeChange: (value: string) => void
  mode: 'practice' | 'exam'
  /** 页面级提示处理：练习可调内置分层提示，考试调代码思路提示 */
  onHint?: (level: number) => Promise<{ level: number; title?: string; content: string }>
  hint?: { level: number; title?: string; content: string } | null
  /** 页面底部操作区（保存/标记/提交等按钮由页面注入） */
  actions?: React.ReactNode
  /** 额外状态信息展示在题目信息表 */
  meta?: { label: string; value: string }[]
}

/** 从题干中提取“输入/输出/示例”片段作为测试方法参考 */
function extractTestHint(content: string): string | null {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => /示例|输入格式|输出格式|Input|Output/i.test(l))
  if (start === -1) return null
  return lines.slice(start, start + 8).join('\n').trim()
}

export default function CodeAnswerWorkspace({
  question, code, onCodeChange, mode, onHint, hint, actions, meta,
}: Props) {
  const toast = useToast()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const [completions, setCompletions] = useState<Completion[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [caret, setCaret] = useState<CaretMetrics | null>(null)
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [stdin, setStdin] = useState('')
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null)
  const [running, setRunning] = useState(false)
  const [hintLoading, setHintLoading] = useState<number | null>(null)
  const [showTest, setShowTest] = useState(true)

  const lines = useMemo(() => code.split('\n').length, [code])
  const tags = useMemo(() => {
    try { return JSON.parse(question.tags_json || '[]') as string[] } catch { return [] }
  }, [question.tags_json])
  const testHint = useMemo(() => extractTestHint(question.question_content), [question.question_content])

  const refreshCompletions = (value: string, cursor: number) => {
    const ta = taRef.current
    const list = getCompletions(value, cursor)
    const nextChar = value[cursor] || ''
    // 光标后面紧跟单词字符时不出幽灵文字，避免盖住已有代码
    if (!ta || !list.length || /[A-Za-z0-9_]/.test(nextChar)) {
      setCompletions([])
      setCaret(null)
      return
    }
    setCompletions(list)
    setActiveIdx(0)
    setCaret(caretCoordinates(ta, cursor))
    setScroll({ top: ta.scrollTop, left: ta.scrollLeft })
  }

  const changeCode = (value: string, cursor: number) => {
    onCodeChange(value)
    refreshCompletions(value, cursor)
  }

  const chooseCompletion = (c: Completion | undefined) => {
    if (!c) return
    const { text, cursor } = applyCompletion(code, c)
    onCodeChange(text)
    setCompletions([])
    setCaret(null)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (ta) { ta.focus(); ta.setSelectionRange(cursor, cursor) }
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    if (e.key === 'Tab') {
      if (completions.length) {
        e.preventDefault()
        chooseCompletion(completions[Math.min(activeIdx, completions.length - 1)])
      } else {
        e.preventDefault()
        const start = ta.selectionStart
        const next = code.slice(0, start) + '    ' + code.slice(ta.selectionEnd)
        changeCode(next, start + 4)
        requestAnimationFrame(() => ta.setSelectionRange(start + 4, start + 4))
      }
      return
    }
    if (!completions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % completions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + completions.length) % completions.length) }
    else if (e.key === 'Enter') { e.preventDefault(); chooseCompletion(completions[Math.min(activeIdx, completions.length - 1)]) }
    else if (e.key === 'Escape') { e.preventDefault(); setCompletions([]); setCaret(null) }
  }

  const runCode = async () => {
    if (!code.trim()) { toast('请先编写代码', 'error'); return }
    setRunning(true)
    try {
      const r = await aiApi.run({ code, stdin })
      setRunResult(r.data)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setRunning(false) }
  }

  const askHint = async (level: number) => {
    if (!onHint) return
    setHintLoading(level)
    try { await onHint(level) }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setHintLoading(null) }
  }

  const resetCode = () => {
    onCodeChange(question.code_content || '#include <stdio.h>\n\nint main(void){\n    \n    return 0;\n}\n')
    setCompletions([])
    setCaret(null)
    setRunResult(null)
    toast('已恢复题目初始代码', 'info')
  }

  const syncScroll = () => {
    const ta = taRef.current
    if (!ta) return
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop
    setScroll({ top: ta.scrollTop, left: ta.scrollLeft })
  }

  const ghost = completions.length && caret ? completions[Math.min(activeIdx, completions.length - 1)] : null

  // 候选列表跟随光标：视口坐标 + 下方空间不足则向上翻
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta || !caret || completions.length < 2) { setPopup(null); return }
    const rect = ta.getBoundingClientRect()
    const rows = Math.min(completions.length, 7)
    const height = rows * 30 + 34
    const width = 300
    const caretX = rect.left + caret.left - scroll.left
    const caretY = rect.top + caret.top - scroll.top
    let x = caretX
    if (x + width > window.innerWidth - 10) x = Math.max(10, window.innerWidth - 10 - width)
    let y = caretY + caret.lineHeight + 4
    if (y + height > window.innerHeight - 10) y = Math.max(10, caretY - height - 4)
    setPopup({ x, y })
  }, [caret, completions, scroll])

  // 页面滚动/窗口尺寸变化时重新贴合光标
  useLayoutEffect(() => {
    if (completions.length < 2) return
    const onMove = () => {
      const ta = taRef.current
      if (!ta || !caret) return
      const rect = ta.getBoundingClientRect()
      const rows = Math.min(completions.length, 7)
      const height = rows * 30 + 34
      const width = 300
      const caretX = rect.left + caret.left - ta.scrollLeft
      const caretY = rect.top + caret.top - ta.scrollTop
      let x = caretX
      if (x + width > window.innerWidth - 10) x = Math.max(10, window.innerWidth - 10 - width)
      let y = caretY + caret.lineHeight + 4
      if (y + height > window.innerHeight - 10) y = Math.max(10, caretY - height - 4)
      setPopup({ x, y })
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [caret, completions])

  // 键盘切换候选时保证高亮项可见
  useLayoutEffect(() => {
    itemRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, completions])

  const out = runResult as {
    ok?: boolean; stage?: string; stdout?: string; message?: string
    compile_check?: string; engine?: string; limitation?: string
  } | null

  return (
    <div className="space-y-4">
      {/* 顶部标题栏 */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-neon">{question.question_id}</span>
          <Heading level={3}>{question.question_content.split('\n')[0].replace(/^【[^】]*】/, '') || '编程题'}</Heading>
          <span className="tag">{question.question_type}</span>
          <span className="tag-challenge">{question.difficulty}</span>
          {question.score ? <span className="tag-learn">{question.score} 分</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" label={running ? '运行中...' : '运行'} isLoading={running}
            onClick={runCode} />
          <Button variant="ghost" size="sm" label="AI 提示" onClick={() => askHint(hint ? (hint.level % 3) + 1 : 1)} />
          <Button variant="ghost" size="sm" label="重置" onClick={resetCode} />
        </div>
      </div>

      {/* 左右排列：题目 / 代码 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-4">
          <Panel title="题目详情">
            <table className="mb-4 w-full border-collapse text-xs">
              <tbody>
                <tr className="border-b border-ink-700/60">
                  <td className="w-24 bg-ink-800/50 px-3 py-2 text-steel-500">难度</td>
                  <td className="px-3 py-2 text-steel-300">{question.difficulty}</td>
                </tr>
                <tr className="border-b border-ink-700/60">
                  <td className="bg-ink-800/50 px-3 py-2 text-steel-500">考点</td>
                  <td className="px-3 py-2 text-steel-300">
                    {tags.length ? tags.join(' · ') : question.knowledge_point_name || 'C 语言基础'}
                  </td>
                </tr>
                <tr className="border-b border-ink-700/60">
                  <td className="bg-ink-800/50 px-3 py-2 text-steel-500">题号</td>
                  <td className="px-3 py-2 font-mono text-steel-300">{question.question_id}</td>
                </tr>
                {meta?.map((m) => (
                  <tr key={m.label} className="border-b border-ink-700/60">
                    <td className="bg-ink-800/50 px-3 py-2 text-steel-500">{m.label}</td>
                    <td className="px-3 py-2 text-steel-300">{m.value}</td>
                  </tr>
                ))}
                <tr>
                  <td className="bg-ink-800/50 px-3 py-2 text-steel-500">状态</td>
                  <td className="px-3 py-2 text-progress">{code.trim() && code !== question.code_content ? '已编写' : '未开始'}</td>
                </tr>
              </tbody>
            </table>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <div className="mb-2 text-xs font-medium text-learn">一、题目描述</div>
              <div className="whitespace-pre-wrap text-xs leading-6 text-text-primary">{question.question_content}</div>
            </div>
          </Panel>

          <Panel title="测试方法"
            action={<button className="text-xs text-neon hover:underline" onClick={() => setShowTest((v) => !v)}>
              {showTest ? '收起' : '展开'} <ChevronDown size={12} className="inline" />
            </button>}>
            {showTest && (
              <div className="space-y-2 text-xs leading-6 text-steel-400">
                <Text>服务端使用 gcc -std=c11 语法检查 + 受限 C 解释器执行；在下方运行区填写 stdin 可本地自测。</Text>
                {testHint && (
                  <div className="rounded-lg border border-learn/25 bg-learn/5 p-3 font-mono text-xs leading-6 text-steel-300">
                    <div className="mb-1 text-learn">输入 / 输出示例（来自题干）</div>
                    <pre className="whitespace-pre-wrap">{testHint}</pre>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="AI 思路提示" action={<span className="tag-ai">✦ 不含答案</span>}>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => (
                <Button key={n} variant={hint?.level === n ? 'primary' : 'ghost'} size="sm"
                  label={hintLoading === n ? '生成中' : ['方向', '步骤', '调试'][n - 1]}
                  isLoading={hintLoading === n} onClick={() => askHint(n)} />
              ))}
            </div>
            {hint ? (
              <div className="rounded-lg border border-ai/25 bg-ai/5 p-3 text-xs leading-6 text-steel-300">
                <div className="mb-1 flex items-center gap-1 text-ai"><Sparkles size={13} /> Level {hint.level} · {hint.title || '思路提示'}</div>
                <div className="whitespace-pre-wrap">{hint.content}</div>
              </div>
            ) : (
              <Text type="supporting">点击上方按钮获取分级思路提示，不会直接给出答案代码。</Text>
            )}
          </Panel>
        </div>

        {/* 代码区 */}
        <div className="space-y-3">
          <div className="panel overflow-hidden">
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neon shadow-glow-green" />
                <Text weight="semibold" className="font-mono">Answer_{question.question_id}.c</Text>
              </div>
              <Text type="supporting" className="font-mono">Ctrl+Enter 运行 · 输入 2 个字母联想 · ↑↓ 挑选 · Tab 接受</Text>
            </div>
            <div className="flex bg-[#0b1017]">
              <div ref={gutterRef}
                className="w-11 shrink-0 overflow-hidden border-r border-ink-800/70 py-3 text-right font-mono text-xs leading-6 text-ink-600">
                {Array.from({ length: lines }, (_, i) => <div key={i} className="px-2">{i + 1}</div>)}
              </div>
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <textarea
                  ref={taRef}
                  value={code}
                  spellCheck={false}
                  onChange={(e) => changeCode(e.target.value, e.target.selectionStart)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); return }
                    onKeyDown(e)
                  }}
                  onClick={(e) => refreshCompletions(e.currentTarget.value, e.currentTarget.selectionStart)}
                  onKeyUp={(e) => {
                    if (!['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
                      refreshCompletions(e.currentTarget.value, e.currentTarget.selectionStart)
                    }
                  }}
                  onScroll={syncScroll}
                  onBlur={() => { setCompletions([]); setCaret(null) }}
                  placeholder="在此编写 C 代码..."
                  className="h-[460px] w-full resize-none bg-transparent px-3 py-3 font-mono text-xs leading-6 text-steel-200 outline-none placeholder:text-steel-600"
                />
                {/* 内联补全：在光标后以淡色显示剩余字母，Tab/Enter 接受 */}
                {ghost && caret && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute select-none whitespace-pre font-mono text-xs text-neon/45"
                    style={{
                      left: caret.left - scroll.left,
                      top: caret.top - scroll.top,
                      lineHeight: `${caret.lineHeight}px`,
                    }}
                  >
                    {ghost.remaining}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 候选词选择列表：跟随光标，可点选/键盘选择 */}
          {popup && completions.length > 1 && createPortal(
            <div
              className="fixed z-[80] w-[300px] overflow-hidden rounded-lg border border-neon/30 bg-ink-900 shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
              style={{ left: popup.x, top: popup.y }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="max-h-[210px] overflow-y-auto py-1">
                {completions.map((c, i) => (
                  <button
                    key={c.word}
                    ref={(el) => { itemRefs.current[i] = el }}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => chooseCompletion(c)}
                    className={`flex w-full items-center px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                      i === activeIdx ? 'bg-neon/10 text-neon' : 'text-steel-300 hover:bg-ink-800/70'
                    }`}
                  >
                    <span className={i === activeIdx ? 'text-neon' : 'text-steel-500'}>{c.typed}</span>
                    <span className={i === activeIdx ? 'text-neon' : 'text-steel-400'}>{c.remaining}</span>
                    {i === activeIdx && <span className="ml-auto text-xs text-neon/70">Tab</span>}
                  </button>
                ))}
              </div>
              <div className="border-t border-ink-700/70 px-3 py-1 text-xs text-steel-600">
                ↑↓ 选择 · Tab/Enter 确认 · Esc 关闭
              </div>
            </div>,
            document.body,
          )}

          {/* 底部运行区 */}
          <Panel title="运行区" action={<span className="tag">{mode === 'exam' ? '自测输出不计入判分' : '自测输出'}</span>}>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs text-steel-500">标准输入 stdin（可选，每行一项）</div>
                <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2}
                  placeholder="例如：\n5"
                  className="field w-full resize-y font-mono" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" label={running ? '运行中...' : '运行代码'} isLoading={running}
                  onClick={runCode} />
                <Button variant="ghost" size="sm" label="清空输出" onClick={() => setRunResult(null)} />
                {running && <Loader2 size={14} className="animate-spin text-neon" />}
              </div>
              {out && (
                <div className={`rounded-lg border p-3 font-mono text-xs leading-6 ${
                  out.ok ? 'border-progress/30 bg-progress/5' : 'border-danger/40 bg-danger/5'
                }`}>
                  <div className={`mb-2 flex items-center gap-2 ${out.ok ? 'text-progress' : 'text-danger'}`}>
                    {out.ok ? <Check size={14} /> : <Terminal size={14} />}
                    {out.ok ? '运行成功' : `运行失败（${out.stage || 'runtime'}）`}
                  </div>
                  {out.stdout !== undefined && (
                    <pre className="whitespace-pre-wrap text-steel-200">输出：{out.stdout || '（无输出）'}</pre>
                  )}
                  {out.message && <pre className="whitespace-pre-wrap text-danger">{out.message}</pre>}
                  {out.compile_check && <div className="mt-1 text-xs text-steel-500">语法检查：{out.compile_check}</div>}
                  {out.limitation && <div className="mt-1 text-xs text-steel-600">限制：{out.limitation}</div>}
                </div>
              )}
            </div>
          </Panel>

          {actions && <div className="panel flex flex-wrap items-center justify-between gap-2 px-4 py-3">{actions}</div>}
        </div>
      </div>
    </div>
  )
}
