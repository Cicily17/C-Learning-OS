import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import {
  ArrowLeft, ArrowRight, Flag, Bookmark, Lightbulb, Eye, Send,
  Timer, CheckCircle2, XCircle, ChevronLeft,
} from 'lucide-react'
import { aiApi, practiceApi } from '../api/client'
import { AnswerText } from '../components/AnswerText'
import { Panel, ProgressBar, useToast } from '../components/Layout'
import CodeAnswerWorkspace from '../components/CodeAnswerWorkspace'
import type { Question } from '../types'

const isCodeQuestion = (q: Question) => q.question_type === '编程题' || q.question_type === '代码补全题'

export default function PracticeSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [limit, setLimit] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [hint, setHint] = useState<{ level: number; title?: string; content: string } | null>(null)
  const [revealed, setRevealed] = useState<{ answer: string; explanation: string } | null>(null)
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!id) return
    practiceApi.session(id).then((r) => {
      setQuestions(r.data.questions)
      setLimit(r.data.time_limit_seconds)
      const a: Record<string, string> = {}
      r.data.questions.forEach((q: Question) => { a[q.id] = q.user_answer || '' })
      setAnswers(a)
    }).catch((e) => toast(e.message, 'error'))
  }, [id])

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const q = questions[index]
  const answeredCount = useMemo(() => Object.values(answers).filter((v) => v && v.trim()).length, [answers])
  const correctCount = Object.values(results).filter(Boolean).length
  const remaining = limit ? Math.max(0, limit - elapsed) : null

  useEffect(() => {
    if (remaining === 0 && questions.length) { toast('练习时间已到，系统自动提交', 'info'); submit() }
  }, [remaining])

  const options = useMemo(() => {
    if (!q) return []
    try { return JSON.parse(q.options_json || '[]') } catch { return [] }
  }, [q])

  const choose = (key: string) => {
    if (!q) return
    const multi = q.question_type === '多项选择题'
    let next = answers[q.id] || ''
    if (multi) {
      const parts = next.split(',').filter(Boolean)
      next = parts.includes(key) ? parts.filter((x) => x !== key).join(',') : [...parts, key].join(',')
    } else next = key
    setAnswers((p) => ({ ...p, [q.id]: next }))
  }

  const saveCurrent = async () => {
    if (!q || !id) return null
    try {
      const r = await practiceApi.saveAnswer(id, {
        question_id: q.id,
        user_answer: answers[q.id] || '',
        time_spent_seconds: elapsed,
        hint_level_used: hint?.level || q.hint_level_used || 0,
        viewed_answer: !!revealed,
      })
      setResults((p) => ({ ...p, [q.id]: r.data.is_correct }))
      return r.data
    } catch (e) { toast((e as Error).message, 'error'); return null }
  }

  const go = async (next: number) => {
    await saveCurrent()
    setHint(null); setRevealed(null)
    setIndex(next)
  }

  const askHint = async (level: number) => {
    if (!id || !q) return
    try {
      const r = await practiceApi.hint(id, q.id, level)
      setHint(r.data)
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const askCodeHint = async (level: number) => {
    if (!q) return { level, title: '思路提示', content: '' }
    const r = await aiApi.codeHint({
      question: q.question_content, code: answers[q.id] || '', level,
      question_type: q.question_type, difficulty: q.difficulty,
    })
    setHint(r.data)
    return r.data
  }

  const reveal = async () => {
    if (!id || !q) return
    try {
      const r = await practiceApi.answer(id, q.id)
      setRevealed({ answer: r.data.correct_answer, explanation: r.data.explanation })
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const toggleFav = async () => {
    if (!id || !q) return
    try {
      const r = await practiceApi.favorite(id, q.id)
      setFavoriteMap((p) => ({ ...p, [q.id]: !p[q.id] }))
      toast(r.data.message, 'success')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const submit = async () => {
    if (!id) return
    try {
      await saveCurrent()
      const r = await practiceApi.submit(id)
      toast(`提交成功：答对 ${r.data.correct_count}/${r.data.total_count} 题，获得 ${r.data.exp_gained} EXP`, 'success')
      if (r.data.unlocked_achievements?.length) {
        toast(`解锁成就：${r.data.unlocked_achievements.join('、')}`, 'success')
      }
      navigate(`/practice/result/${id}`)
    } catch (e) { toast((e as Error).message, 'error') }
  }

  if (!questions.length) return <div className="panel p-8 text-xs text-steel-400">正在加载题目...</div>
  if (!q) return null

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => navigate('/practice/setup')}>
          <ChevronLeft size={15} /> 退出练习
        </button>
        <div className="flex items-center gap-4">
          <div className="text-xs text-steel-400">已答 <span className="text-neon">{answeredCount}</span> / {questions.length}</div>
          <div className="text-xs text-steel-400">当前正确 <span className="text-neon">{correctCount}</span></div>
          <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs ${
            remaining !== null && remaining < 60 ? 'border-danger/60 text-danger' : 'border-neon/30 text-neon'
          }`}>
            <Timer size={14} /> {fmt(remaining === null ? elapsed : remaining)}
          </div>
        </div>
      </div>
      <ProgressBar value={(answeredCount / questions.length) * 100} />

      {isCodeQuestion(q) ? (
        <div className="space-y-4">
          <Panel title="题目导航">
            <div className="flex flex-wrap gap-1.5">
              {questions.map((item, i) => (
                <button key={item.id} onClick={() => go(i)}
                  className={`flex h-8 min-w-8 items-center justify-center rounded border px-2 text-xs transition ${
                    i === index ? 'border-neon bg-neon/15 text-neon'
                    : answers[item.id] ? 'border-neon/30 bg-neon/5 text-neon-dim'
                    : 'border-ink-700/60 text-steel-500 hover:border-ink-600'
                  }`}>
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/50 pt-3">
              <button className="btn-ghost text-xs" disabled={index === 0} onClick={() => go(index - 1)}>
                <ArrowLeft size={13} /> 上一题
              </button>
              <span className="text-xs text-steel-500">第 {index + 1} / {questions.length} 题 · 已答 {answeredCount}</span>
              <button className="btn-ghost text-xs" disabled={index === questions.length - 1} onClick={() => go(index + 1)}>
                下一题 <ArrowRight size={13} />
              </button>
            </div>
          </Panel>

          <CodeAnswerWorkspace
            question={q}
            code={answers[q.id] || q.code_content || ''}
            onCodeChange={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
            mode="practice"
            onHint={askCodeHint}
            hint={hint}
            meta={[
              { label: '提示层级', value: String(hint?.level || q.hint_level_used || 0) },
              { label: '本题状态', value: results[q.id] === undefined ? '待提交' : results[q.id] ? '正确' : '待改进' },
            ]}
            actions={
              <>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" onClick={toggleFav}>
                    <Bookmark size={14} fill={favoriteMap[q.id] ? 'currentColor' : 'none'} /> {favoriteMap[q.id] ? '已收藏' : '收藏'}
                  </button>
                  <button className="btn-ghost text-xs" onClick={reveal}><Eye size={14} /> 参考答案</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" onClick={() => go(Math.min(questions.length - 1, index + 1))}>
                    <Flag size={14} /> 跳过
                  </button>
                  <button className="btn-primary text-xs" onClick={submit}><Send size={14} /> 提交并查看结果</button>
                </div>
              </>
            }
          />

          {revealed && (
            <Panel title="参考答案（练习模式可见）">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-neon"><CheckCircle2 size={15} /> 正确答案</div>
                <AnswerText answer={revealed.answer} type={q?.question_type} caption="参考答案 · C11" />
                <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3 text-xs leading-6 text-steel-400">{revealed.explanation}</div>
              </div>
            </Panel>
          )}
        </div>
      ) : (
      <div className="grid gap-4 xl:grid-cols-[210px_1fr_260px]">
        <Panel title="题目导航" className="h-fit">
          <div className="magnet-grid grid grid-cols-5 gap-1.5">
            {questions.map((item, i) => (
              <button key={item.id} onClick={() => go(i)}
                className={`flex h-8 items-center justify-center rounded border text-xs transition ${
                  i === index ? 'border-neon bg-neon/15 text-neon'
                  : answers[item.id] ? 'border-neon/30 bg-neon/5 text-neon-dim'
                  : 'border-ink-700/60 text-steel-500 hover:border-ink-600'
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-ink-700/50 pt-3 text-xs text-steel-500">
            <div className="flex justify-between"><span>单选题 / 判断题</span><span className="text-steel-300">{options.length > 0 ? q.question_type : '—'}</span></div>
            <div className="flex justify-between"><span>难度</span><span className="text-steel-300">{q.difficulty}</span></div>
            <div className="flex justify-between"><span>题号</span><span className="font-mono text-steel-300">{q.question_id}</span></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost flex-1 text-xs" disabled={index === 0} onClick={() => go(index - 1)}>
              <ArrowLeft size={13} /> 上一题
            </button>
            <button className="btn-ghost flex-1 text-xs" disabled={index === questions.length - 1} onClick={() => go(index + 1)}>
              下一题 <ArrowRight size={13} />
            </button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title={`第 ${index + 1} 题 / ${questions.length}`}
            action={<div className="flex items-center gap-2"><span className="tag">{q.question_type}</span><span className="tag">{q.difficulty}</span></div>}>
            <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-text-primary">{q.question_content}</div>
            {q.code_content && (
              <div className="mb-5">
                <Highlight theme={themes.vsDark} code={q.code_content.trim()} language="c">
                  {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre className={`${className} code-block`} style={{ ...style, background: 'transparent' }}>
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })}>
                          <span className="mr-4 inline-block w-5 select-none text-right text-ink-600">{i + 1}</span>
                          {line.map((token, j) => <span key={j} {...getTokenProps({ token })} />)}
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              </div>
            )}
            <div className="space-y-2">
              {options.map((opt: any) => {
                const active = (answers[q.id] || '').split(',').includes(opt.key)
                return (
                  <button key={opt.key} onClick={() => choose(opt.key)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-xs transition active:scale-[0.995] ${
                      active ? 'border-neon/60 bg-neon/10 text-neon' : 'border-ink-700/60 bg-ink-900/40 text-steel-300 hover:border-ink-600'
                    }`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs ${
                      active ? 'border-neon bg-neon text-ink-950' : 'border-ink-600 text-steel-400'
                    }`}>{opt.key}</span>
                    <span className="leading-6">{opt.text}</span>
                  </button>
                )
              })}
              {!options.length && (
                <textarea className="field min-h-[120px] font-mono" placeholder="在此输入你的答案..."
                  value={answers[q.id] || ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} />
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/50 pt-4">
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={toggleFav}>
                  <Bookmark size={14} fill={favoriteMap[q.id] ? 'currentColor' : 'none'} /> {favoriteMap[q.id] ? '已收藏' : '收藏'}
                </button>
                <button className="btn-ghost text-xs" onClick={() => go(Math.min(questions.length - 1, index + 1))}>
                  <Flag size={14} /> 跳过
                </button>
              </div>
              <button className="btn-primary text-xs" onClick={submit}>
                <Send size={14} /> 提交并查看结果
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="AI 分层提示" action={<span className="text-xs text-ai">✦ 智能辅助</span>}>
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <button key={n} className="btn-ghost w-full justify-start border-ai/25 text-xs hover:border-ai/60 hover:text-ai" onClick={() => askHint(n)}>
                  <Lightbulb size={14} className="text-ai" /> {n} 级提示{hint?.level === n ? ' · 当前' : ''}
                </button>
              ))}
            </div>
            {hint && (
              <div className="mt-3 rounded-lg border border-ai/25 bg-ai/5 p-3 text-xs leading-6 text-steel-300">
                <div className="mb-1.5 text-xs text-ai">✦ 提示 · Level {hint.level}</div>
                {hint.content}
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-steel-500">
              提示不直接给出答案。配置大模型密钥后可切换为 AI 生成提示。
            </p>
          </Panel>

          <Panel title="参考答案">
            {revealed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-neon">
                  <CheckCircle2 size={15} /> 正确答案
                </div>
                <AnswerText answer={revealed.answer} type={q?.question_type} caption="参考答案 · C11" />
                <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3 text-xs leading-6 text-steel-400">
                  {revealed.explanation}
                </div>
              </div>
            ) : (
              <button className="btn-ghost w-full" onClick={reveal}><Eye size={15} /> 点击查看参考答案</button>
            )}
          </Panel>

          <Panel title="本题状态">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-steel-500">作答</span>
                <span className={answers[q.id] ? 'text-neon' : 'text-steel-500'}>{answers[q.id] ? '已作答' : '未作答'}</span></div>
              <div className="flex justify-between"><span className="text-steel-500">提示层级</span>
                <span className="text-steel-300">{hint?.level || q.hint_level_used || 0}</span></div>
              <div className="flex justify-between"><span className="text-steel-500">查看过答案</span>
                <span className={revealed ? 'text-challenge' : 'text-steel-500'}>{revealed ? '是' : '否'}</span></div>
            </div>
          </Panel>
        </div>
      </div>
      )}
    </div>
  )
}
