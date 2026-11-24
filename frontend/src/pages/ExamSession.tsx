import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { Timer, Flag, Send, ChevronLeft, ChevronRight, ShieldCheck, LockKeyhole } from 'lucide-react'
import { examsApi } from '../api/client'
import { Panel, ProgressBar, useToast } from '../components/Layout'
import type { ExamQuestion } from '../types'

export default function ExamSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [paperName, setPaperName] = useState('')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [marked, setMarked] = useState<Record<string, boolean>>({})
  const [deadline, setDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [showSubmit, setShowSubmit] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!id) return
    examsApi.session(id).then((r) => {
      setQuestions(r.data.questions)
      setPaperName(r.data.paper_name)
      const a: Record<string, string> = {}
      const m: Record<string, boolean> = {}
      r.data.questions.forEach((q: ExamQuestion) => { a[q.id] = q.user_answer || ''; m[q.id] = !!q.marked })
      setAnswers(a); setMarked(m)
      if (r.data.deadline_at) {
        const ts = new Date(r.data.deadline_at).getTime()
        setDeadline(ts)
        setRemaining(Math.max(0, Math.floor((ts - Date.now()) / 1000)))
      }
    }).catch((e) => toast(e.message, 'error'))
  }, [id])

  const save = useCallback(async (targetId?: string, value?: string) => {
    if (!id || !targetId) return
    if (savingRef.current) return
    savingRef.current = true
    try {
      await examsApi.saveAnswer(id, { question_id: targetId, user_answer: value ?? answers[targetId] ?? '' })
    } catch (e) { toast((e as Error).message, 'error') }
    finally { savingRef.current = false }
  }, [id, answers, toast])

  const submit = useCallback(async () => {
    if (!id || submitting) return
    setSubmitting(true)
    try {
      await save()
      const result = await examsApi.submit(id)
      toast(`交卷成功：${result.data.obtained_score}/${result.data.total_score} 分，获得 ${result.data.exp_gained} EXP`, 'success')
      if (result.data.unlocked_achievements?.length) {
        toast(`解锁成就：${result.data.unlocked_achievements.join('、')}`, 'success')
      }
      navigate(`/exams/result/${id}`)
    } catch (e) { toast((e as Error).message, 'error'); setSubmitting(false) }
  }, [id, navigate, save, submitting, toast])

  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) { window.clearInterval(timer); toast('考试时间结束，系统自动交卷', 'info'); submit() }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [deadline, submit, toast])

  useEffect(() => {
    if (!id || !questions.length) return
    const timer = window.setInterval(() => {
      const q = questions[index]
      if (q) save(q.id)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [id, questions, index, save])

  const q = questions[index]
  const answeredCount = useMemo(() => Object.values(answers).filter((v) => v && v.trim()).length, [answers])
  const markedCount = Object.values(marked).filter(Boolean).length

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

  const go = async (next: number) => {
    if (q) await save(q.id)
    setIndex(Math.max(0, Math.min(questions.length - 1, next)))
  }

  const toggleMark = async () => {
    if (!id || !q) return
    const next = !marked[q.id]
    setMarked((p) => ({ ...p, [q.id]: next }))
    try { await examsApi.mark(id, { question_id: q.id, marked: next }) }
    catch (e) { toast((e as Error).message, 'error') }
  }

  if (!questions.length || !q) return <div className="panel p-8 text-[13px] text-steel-400">正在加载试卷...</div>
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] text-[#e4f3e9]">
            <ShieldCheck size={15} className="text-neon" /> {paperName}
          </div>
          <div className="mt-1 text-[11px] text-steel-500">考试进行中 · 答案已封存 · 交卷后方可查看成绩</div>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-[16px] ${
          remaining !== null && remaining < 300 ? 'border-red-500/50 bg-red-500/5 text-red-300' : 'border-neon/30 text-neon'
        }`}>
          <Timer size={16} /> {remaining === null ? '--:--' : fmt(remaining)}
        </div>
      </div>
      <ProgressBar value={(answeredCount / questions.length) * 100} />

      <div className="grid gap-4 xl:grid-cols-[240px_1fr_230px]">
        <Panel title="答题卡" className="h-fit">
          <div className="magnet-grid grid grid-cols-5 gap-1.5">
            {questions.map((item, i) => {
              const isMarked = marked[item.id]
              const done = !!(answers[item.id] || '').trim()
              return (
                <button key={item.id} onClick={() => go(i)}
                  className={`relative flex h-9 items-center justify-center rounded border text-[11px] transition ${
                    i === index ? 'border-neon bg-neon/15 text-neon'
                    : done ? 'border-neon/30 bg-neon/5 text-neon-dim'
                    : 'border-ink-700/60 text-steel-500 hover:border-ink-600'
                  }`}>
                  {i + 1}
                  {isMarked && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" />}
                </button>
              )
            })}
          </div>
          <div className="mt-4 space-y-2 border-t border-ink-700/50 pt-3 text-[11px] text-steel-500">
            <div className="flex justify-between"><span>已作答</span><span className="text-neon">{answeredCount} / {questions.length}</span></div>
            <div className="flex justify-between"><span>标记疑难</span><span className="text-amber-400">{markedCount}</span></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost flex-1 text-[11px]" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={13} /> 上一题</button>
            <button className="btn-ghost flex-1 text-[11px]" disabled={index === questions.length - 1} onClick={() => go(index + 1)}>下一题 <ChevronRight size={13} /></button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title={`第 ${index + 1} 题 / ${questions.length}`} action={<span className="tag">{q.question_type}</span>}>
            <div className="mb-4 whitespace-pre-wrap text-[14px] leading-7 text-[#dfece3]">{q.question_content}</div>
            {q.code_content && (
              <Highlight theme={themes.vsDark} code={q.code_content.trim()} language="c">
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={`${className} code-block mb-5`} style={{ ...style, background: 'transparent' }}>
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        <span className="mr-4 inline-block w-5 select-none text-right text-ink-600">{i + 1}</span>
                        {line.map((token, j) => <span key={j} {...getTokenProps({ token })} />)}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            )}
            <div className="space-y-2">
              {options.map((opt: any) => {
                const active = (answers[q.id] || '').split(',').includes(opt.key)
                return (
                  <button key={opt.key} onClick={() => choose(opt.key)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-[13px] transition active:scale-[0.995] ${
                      active ? 'border-neon/60 bg-neon/10 text-neon' : 'border-ink-700/60 bg-ink-900/40 text-[#c3d8cc] hover:border-ink-600'
                    }`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[11px] ${
                      active ? 'border-neon bg-neon text-ink-950' : 'border-ink-600 text-steel-400'
                    }`}>{opt.key}</span>
                    <span className="leading-6">{opt.text}</span>
                  </button>
                )
              })}
              {!options.length && (
                <textarea className="field min-h-[120px] font-mono" placeholder="在此输入答案..."
                  value={answers[q.id] || ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} />
              )}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-ink-700/50 pt-4">
              <button className={`btn-ghost text-[12px] ${marked[q.id] ? 'border-amber-400/50 text-amber-300' : ''}`} onClick={toggleMark}>
                <Flag size={14} /> {marked[q.id] ? '已标记疑难' : '标记疑难'}
              </button>
              <button className="btn-primary text-[12px]" onClick={() => setShowSubmit(true)}>
                <Send size={14} /> 交卷
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="考试规则">
            <div className="space-y-2 text-[11px] leading-6 text-[#a9c2b5]">
              <p className="flex items-start gap-2"><LockKeyhole size={13} className="mt-1 shrink-0 text-neon" />答案保存在服务端，交卷后统一判分。</p>
              <p>· 作答自动保存，可自由跳题。</p>
              <p>· 过程中不显示正误、分数与解析。</p>
              <p>· 时间耗尽将自动交卷。</p>
            </div>
          </Panel>
          <Panel title="进度概览">
            <div className="space-y-3">
              <div className="flex justify-between text-[12px]"><span className="text-steel-500">已作答</span><span className="text-neon">{answeredCount}/{questions.length}</span></div>
              <ProgressBar value={(answeredCount / questions.length) * 100} />
              <div className="flex justify-between text-[12px]"><span className="text-steel-500">疑难标记</span><span className="text-amber-400">{markedCount}</span></div>
            </div>
          </Panel>
        </div>
      </div>

      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <div className="mb-3 flex items-center gap-2 text-neon"><Send size={17} /> 确认交卷</div>
            <p className="mb-4 text-[12px] leading-6 text-[#a9c2b5]">
              还有 <span className="text-amber-400">{questions.length - answeredCount}</span> 题未作答。交卷后答案将锁定，无法修改。
            </p>
            <input className="field mb-4" placeholder="请输入「确认交卷」以完成提交" value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setShowSubmit(false); setConfirmText('') }}>继续考试</button>
              <button className="btn-primary" disabled={confirmText.trim() !== '确认交卷' || submitting} onClick={submit}>
                {submitting ? '正在提交...' : '确认交卷'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
