import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Keyboard } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from './Layout'

export interface ReviewItem {
  id?: string
  question_id?: string
  question_code?: string
  question_content: string
  code_content?: string | null
  question_type?: string
  difficulty?: string
  options_json?: string | null
  knowledge_point_name?: string
  user_answer?: string | null
  correct_answer?: string
  explanation?: string
  is_correct?: boolean
  score?: number
  score_obtained?: number
}

interface Props {
  items: ReviewItem[]
  /** 默认筛选：考试订正一般只看错题 */
  defaultFilter?: 'all' | 'wrong'
  /** 是否显示「全部 / 只看错题」切换 */
  showFilter?: boolean
}

type Option = { key: string; text: string }

function parseOptions(raw?: string | null): Option[] {
  try {
    const value = JSON.parse(raw || '[]')
    if (!Array.isArray(value)) return []
    return value
      .map((o) => ({ key: String(o?.key ?? '').toUpperCase(), text: String(o?.text ?? '') }))
      .filter((o) => o.key)
  } catch { return [] }
}

function splitAnswer(raw?: string | null): string[] {
  return (raw || '')
    .toUpperCase()
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function AnswerReview({ items, defaultFilter = 'all', showFilter = true }: Props) {
  const [filter, setFilter] = useState<'all' | 'wrong'>(defaultFilter)
  const [pos, setPos] = useState(0)

  const list = useMemo(() => {
    const withIndex = items.map((item, idx) => ({ item, idx }))
    return filter === 'wrong' ? withIndex.filter((x) => !x.item.is_correct) : withIndex
  }, [items, filter])

  const wrongCount = useMemo(() => items.filter((x) => !x.is_correct).length, [items])

  useEffect(() => { setPos(0) }, [filter, items])

  const current = list[Math.min(pos, Math.max(0, list.length - 1))]
  const item = current?.item
  const options = useMemo(() => parseOptions(item?.options_json), [item?.options_json])
  const correctParts = useMemo(() => splitAnswer(item?.correct_answer), [item?.correct_answer])
  const userParts = useMemo(() => splitAnswer(item?.user_answer), [item?.user_answer])

  const go = (delta: number) => {
    setPos((p) => Math.max(0, Math.min(list.length - 1, p + delta)))
  }

  // 键盘左右切换（输入框聚焦时不拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName || ''
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || el?.isContentEditable) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPos((p) => Math.max(0, p - 1)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPos((p) => Math.min(list.length - 1, p + 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list.length])

  if (!items.length) return <EmptyState text="暂无作答记录" />
  if (!list.length) return <EmptyState text="本场没有错题，不需要订正" />

  const number = (current?.idx ?? 0) + 1

  return (
    <div className="space-y-3">
      {/* 工具条：筛选 + 题号导航 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-steel-400">
          <span className="tag">第 {pos + 1} / {list.length} 题</span>
          <span className="text-steel-500">（原卷第 {number} 题）</span>
        </div>
        {showFilter && (
          <div className="flex items-center gap-2">
            <button onClick={() => setFilter('all')}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                filter === 'all' ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400 hover:border-ink-600'
              }`}>全部 {items.length}</button>
            <button onClick={() => setFilter('wrong')}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                filter === 'wrong' ? 'border-danger/50 bg-danger/10 text-danger' : 'border-ink-700/60 text-steel-400 hover:border-ink-600'
              }`}>只看错题 {wrongCount}</button>
          </div>
        )}
      </div>

      {/* 答题卡 */}
      <div className="flex flex-wrap gap-1.5">
        {list.map((x, i) => {
          const active = i === pos
          const ok = x.item.is_correct
          return (
            <button
              key={x.idx}
              onClick={() => setPos(i)}
              title={`第 ${x.idx + 1} 题`}
              className={`h-7 w-7 rounded border font-mono text-xs transition ${
                ok ? 'border-neon/40 bg-neon/10 text-neon' : 'border-danger/40 bg-danger/10 text-danger'
              } ${active ? 'ring-2 ring-neon/60 ring-offset-1 ring-offset-ink-900' : 'hover:border-steel-500'}`}
            >
              {x.idx + 1}
            </button>
          )
        })}
      </div>

      {/* 左题目 / 右答案对照 */}
      <div className="grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {item?.is_correct
              ? <span className="flex items-center gap-1 text-xs text-neon"><CheckCircle2 size={15} /> 答对</span>
              : <span className="flex items-center gap-1 text-xs text-danger"><XCircle size={15} /> 答错</span>}
            {item?.question_type && <span className="tag">{item.question_type}</span>}
            {item?.knowledge_point_name && <span className="tag">{item.knowledge_point_name}</span>}
            {item?.difficulty && <span className="tag-challenge">{item.difficulty}</span>}
            <span className="ml-auto font-mono text-xs text-steel-500">{item?.question_code || item?.question_id}</span>
          </div>
          <div className="mb-3 whitespace-pre-wrap text-xs leading-6 text-text-primary">{item?.question_content}</div>
          {item?.code_content && <pre className="code-block mb-3">{item.code_content}</pre>}
          {options.length > 0 && (
            <div className="space-y-1.5">
              {options.map((o) => {
                const isCorrect = correctParts.includes(o.key)
                const isUser = userParts.includes(o.key)
                return (
                  <div key={o.key}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-6 ${
                      isCorrect ? 'border-neon/45 bg-neon/10 text-neon'
                        : isUser ? 'border-danger/45 bg-danger/10 text-danger'
                          : 'border-ink-700/60 bg-ink-950/40 text-steel-300'
                    }`}>
                    <span className="font-mono">{o.key}</span>
                    <span className="flex-1">{o.text}</span>
                    {isCorrect && <span className="text-xs text-neon">正确答案</span>}
                    {!isCorrect && isUser && <span className="text-xs text-danger">你的选择</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className={`rounded-lg border p-3 text-xs leading-6 ${
            item?.is_correct ? 'border-neon/30 bg-neon/5' : 'border-danger/35 bg-danger/5'
          }`}>
            <div className="mb-1 text-steel-500">你的答案</div>
            <div className={item?.is_correct ? 'text-neon' : 'text-danger'}>
              {item?.user_answer || <span className="text-steel-500">（未作答）</span>}
            </div>
          </div>
          <div className="rounded-lg border border-neon/30 bg-neon/5 p-3 text-xs leading-6">
            <div className="mb-1 text-steel-500">正确答案</div>
            <div className="text-neon">{item?.correct_answer || '—'}</div>
          </div>
          <div className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-3 text-xs leading-6 text-steel-400">
            <div className="mb-1 text-neon">解析</div>
            <div className="whitespace-pre-wrap">{item?.explanation || '暂无解析'}</div>
          </div>
          {typeof item?.score === 'number' && typeof item?.score_obtained === 'number' && item.score > 0 && (
            <div className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-3 text-xs text-steel-400">
              本题得分 <span className="ml-1 font-mono text-text-primary">{item.score_obtained ?? 0}</span>
              <span className="text-steel-500"> / {item.score}</span>
            </div>
          )}
        </div>
      </div>

      {/* 翻页 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/60 pt-3">
        <Button variant="ghost" size="sm" label="上一题" isDisabled={pos === 0} onClick={() => go(-1)} />
        <span className="flex items-center gap-1.5 text-xs text-steel-600">
          <Keyboard size={13} /> ← → 切换题目
        </span>
        <Button variant="ghost" size="sm" label="下一题" isDisabled={pos >= list.length - 1} onClick={() => go(1)} />
      </div>
    </div>
  )
}
