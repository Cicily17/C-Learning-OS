import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Bookmark, BookOpen, ClipboardList, History, Lightbulb,
  Sparkles, Trash2, TrendingUp, Trophy,
} from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { aiApi, examsApi, learningApi, practiceApi } from '../api/client'
import { AnswerText } from '../components/AnswerText'
import {
  ConfirmDialog, EmptyState, PageHeader, Panel, ProgressBar, useToast,
} from '../components/Layout'

type Tab = 'history' | 'exams' | 'wrong' | 'favorites'

type Pending =
  | { kind: 'practice' | 'exam'; scope: 'all'; count: number }
  | { kind: 'practice' | 'exam'; scope: 'one'; id: string; label: string; summary: string }

export default function Archive() {
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('history')
  const [history, setHistory] = useState<any[]>([])
  const [examHistory, setExamHistory] = useState<any[]>([])
  const [wrong, setWrong] = useState<any[]>([])
  const [favorites, setFavorites] = useState<any[]>([])
  const [aiAdvice, setAiAdvice] = useState('')
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    practiceApi.history().then((r) => setHistory(r.data)).catch(() => {})
    examsApi.history().then((r) => setExamHistory(r.data)).catch(() => {})
    practiceApi.wrongQuestions().then((r) => setWrong(r.data)).catch(() => {})
    learningApi.favorites().then((r) => setFavorites(r.data)).catch(() => {})
  }
  useEffect(load, [])

  const practiceStats = useMemo(() => {
    const totalQ = history.reduce((sum, h) => sum + (h.total_count || 0), 0)
    const totalC = history.reduce((sum, h) => sum + (h.correct_count || 0), 0)
    const avg = totalQ ? totalC / totalQ : 0
    const best = history.reduce((max, h) => Math.max(max, h.accuracy || 0), 0)
    return { totalQ, totalC, avg, best }
  }, [history])

  const examStats = useMemo(() => {
    const best = examHistory.reduce((max, e) => Math.max(max, e.accuracy || 0), 0)
    return { best }
  }, [examHistory])

  const refreshWrong = () => {
    practiceApi.wrongQuestions().then((r) => setWrong(r.data)).catch(() => {})
  }

  const generateAdvice = async () => {
    setAdviceBusy(true)
    try {
      const summary = wrong.slice(0, 8).map((w) => `题目：${w.question_content.slice(0, 60)}｜错误次数：${w.wrong_count}`).join('\n')
      const r = await aiApi.chat({
        mode: 'practice',
        question: `请根据以下错题记录，给出 C 语言复习建议，按优先级列出 3-5 条：\n${summary || '暂无错题记录，请给出通用复习建议。'}`,
      })
      setAiAdvice(r.data.answer)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setAdviceBusy(false) }
  }

  const confirmPending = async () => {
    if (!pending) return
    setDeleting(true)
    try {
      if (pending.scope === 'all') {
        if (pending.kind === 'practice') {
          await practiceApi.clearHistory()
          setHistory([])
        } else {
          await examsApi.clearHistory()
          setExamHistory([])
        }
      } else {
        if (pending.kind === 'practice') {
          await practiceApi.deleteHistory(pending.id)
          setHistory((prev) => prev.filter((h) => h.id !== pending.id))
        } else {
          await examsApi.deleteHistory(pending.id)
          setExamHistory((prev) => prev.filter((h) => h.id !== pending.id))
        }
      }
      refreshWrong()
      toast(
        pending.scope === 'all'
          ? `${pending.kind === 'practice' ? '练习' : '考试'}记录已清空，正确率面板已重算`
          : '记录已删除，正确率面板与错题统计已同步更新',
        'success',
      )
      setPending(null)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'history', label: '练习历史', icon: History, count: history.length },
    { key: 'exams', label: '考试记录', icon: ClipboardList, count: examHistory.length },
    { key: 'wrong', label: '错题本', icon: AlertTriangle, count: wrong.length },
    { key: 'favorites', label: '我的收藏', icon: Bookmark, count: favorites.length },
  ]

  const recentBars = history.slice(0, 12).reverse()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ARCHIVE // 学习档案"
        title="学习档案"
        description="练习、考试、错题与收藏都保存在数据库中。删除一次记录后，正确率、趋势与错题统计会立即重算，不留下幽灵数据。"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag-neon"><History size={12} className="mr-1" /> 练习 {history.length} 次</span>
            <span className="tag-challenge"><ClipboardList size={12} className="mr-1" /> 考试 {examHistory.length} 场</span>
            <span className="tag"><AlertTriangle size={12} className="mr-1" /> 错题 {wrong.length}</span>
          </div>
        }
        actions={<Button label="回到工作台" variant="ghost" icon={<ArrowRight size={15} className="rotate-180" />}
          onClick={() => navigate('/')} />}
      />

      {/* 练习正确率面板：随删除实时重算 */}
      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.05fr_1.6fr]">
          <div className="relative border-b border-ink-700/60 p-5 lg:border-b-0 lg:border-r">
            <div className="eyebrow"><span className="eyebrow-dot" />PRACTICE ACCURACY</div>
            <div className="mt-3 flex items-end gap-3">
              <div className="display-num text-neon">{Math.round(practiceStats.avg * 100)}<span className="text-2xl">%</span></div>
              <div className="pb-1.5 text-xs leading-5 text-steel-500">
                加权平均正确率<br />{practiceStats.totalC} / {practiceStats.totalQ} 题答对
              </div>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-5 text-steel-500">
              按每次练习的实际题量加权计算。删除任意一条练习历史后，这个数字会立刻按剩余记录重新计算。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5">
                <div className="text-[11px] text-steel-500">最佳单次</div>
                <div className="mt-1 font-mono text-lg font-semibold text-challenge">{Math.round(practiceStats.best * 100)}%</div>
              </div>
              <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5">
                <div className="text-[11px] text-steel-500">累计作答</div>
                <div className="mt-1 font-mono text-lg font-semibold text-text-primary">{practiceStats.totalQ} <span className="text-xs text-steel-500">题</span></div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <TrendingUp size={15} className="text-neon" /> 最近 {recentBars.length} 次正确率
              </div>
              <span className="text-[11px] text-steel-500">旧 → 新</span>
            </div>
            {recentBars.length ? (
              <>
                <div className="flex gap-3">
                  <div className="flex h-28 shrink-0 flex-col justify-between py-0 text-right font-mono text-[10px] leading-none text-steel-600">
                    <span>100%</span><span>50%</span><span>0%</span>
                  </div>
                  <div className="relative flex h-28 flex-1 items-end justify-center gap-2 border-b border-ink-700/60">
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-ink-700/35" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-ink-700/45" />
                    {recentBars.map((h) => {
                      const acc = Math.round((h.accuracy || 0) * 100)
                      return (
                        <div key={h.id} title={`${new Date(h.submitted_at).toLocaleDateString('zh-CN')} · ${acc}%`}
                          className="group relative flex h-full w-full max-w-[56px] items-end">
                          <div className={`relative w-full rounded-t transition-all ${acc >= 70 ? 'bg-gradient-to-t from-neon/35 to-neon' : 'bg-gradient-to-t from-danger/25 to-danger/80'}`}
                            style={{ height: `${Math.max(4, acc)}%`, animation: 'grow-bar .5s ease both' }}>
                            <span className={`absolute inset-x-0 -top-5 text-center font-mono text-[10px] transition ${recentBars.length <= 4 ? 'text-steel-300' : 'text-steel-500 opacity-0 group-hover:opacity-100'}`}>{acc}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-steel-500">
                  <span>绿色 ≥ 70% · 红色 &lt; 70%</span>
                  <span className="font-mono">{history.length} 条记录</span>
                </div>
              </>
            ) : (
              <EmptyState text="还没有练习记录" hint="完成并提交一次练习后，这里会出现正确率柱状图" icon={<TrendingUp size={18} />} />
            )}
          </div>
        </div>
      </section>

      <div className="seg-tabs overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} className="seg-tab shrink-0" data-active={tab === t.key}
            onClick={() => setTab(t.key)}>
            <t.icon size={14} /> {t.label}
            <span className="rounded bg-ink-800/80 px-1.5 font-mono text-[11px] text-steel-400">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <Panel title="练习历史" hint={`${history.length} 条 · 按提交时间倒序`}
          action={history.length ? (
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs text-danger-soft transition hover:bg-danger/15"
              onClick={() => setPending({ kind: 'practice', scope: 'all', count: history.length })}>
              <Trash2 size={13} /> 清空全部
            </button>
          ) : undefined}>
          {history.length ? (
            <div className="divide-y divide-ink-700/40">
              {history.map((h) => {
                const acc = Math.round((h.accuracy || 0) * 100)
                const date = new Date(h.submitted_at)
                const tone = acc >= 90 ? 'text-neon border-neon/30 bg-neon/10'
                  : acc >= 70 ? 'text-progress border-progress/30 bg-progress/10'
                  : 'text-danger-soft border-danger/30 bg-danger/10'
                return (
                  <div key={h.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="w-14 shrink-0">
                      <div className="font-mono text-xl font-semibold leading-none text-text-primary">{String(date.getDate()).padStart(2, '0')}</div>
                      <div className="mt-1.5 text-[11px] text-steel-500">{date.getMonth() + 1} 月 · {date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">练习 · {h.total_count} 题</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${tone}`}>
                          {acc >= 90 ? '优秀' : acc >= 70 ? '达标' : '需复习'}
                        </span>
                        <span className="text-xs text-steel-500">答对 {h.correct_count}/{h.total_count}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="max-w-[300px] flex-1"><ProgressBar value={acc} tone={acc >= 70 ? 'success' : 'warning'} /></div>
                        <span className="w-10 shrink-0 text-right font-mono text-xs text-steel-400">{acc}%</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link to={`/practice/result/${h.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2 text-xs text-steel-300 transition hover:border-neon/40 hover:text-neon">
                        查看解析 <ArrowRight size={12} />
                      </Link>
                      <button title="删除这条练习记录" aria-label="删除这条练习记录"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-xs text-steel-500 transition hover:border-danger/35 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setPending({
                          kind: 'practice', scope: 'one', id: h.id,
                          label: '删除这条练习记录？',
                          summary: `${date.toLocaleString('zh-CN')} · ${h.total_count} 题 · 正确率 ${acc}%`,
                        })}>
                        <Trash2 size={14} /> <span className="hidden sm:inline">删除</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState text="还没有已提交的练习记录" hint="完成一次练习并提交后，成绩会出现在这里" icon={<History size={18} />}
              action={<Link to="/practice/setup" className="btn-primary text-xs"><BookOpen size={13} /> 去练习</Link>} />
          )}
        </Panel>
      )}

      {tab === 'exams' && (
        <Panel title="考试记录" hint={`${examHistory.length} 场 · 最佳正确率 ${Math.round(examStats.best * 100)}%`}
          action={examHistory.length ? (
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs text-danger-soft transition hover:bg-danger/15"
              onClick={() => setPending({ kind: 'exam', scope: 'all', count: examHistory.length })}>
              <Trash2 size={13} /> 清空全部
            </button>
          ) : undefined}>
          {examHistory.length ? (
            <div className="divide-y divide-ink-700/40">
              {examHistory.map((h) => {
                const acc = Math.round((h.accuracy || 0) * 100)
                return (
                  <div key={h.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-challenge/30 bg-challenge/10 text-challenge">
                      <Trophy size={18} />
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">{h.paper_name}</div>
                      <div className="mt-1.5 text-xs text-steel-500">
                        {new Date(h.submitted_at).toLocaleString('zh-CN')} · 答对 {h.correct_count} 题 · 正确率 {acc}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-2xl font-semibold text-challenge">{h.obtained_score}<span className="text-xs text-steel-500">/{h.total_score}</span></div>
                      <div className="text-[11px] text-steel-500">得分</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link to={`/exams/result/${h.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2 text-xs text-steel-300 transition hover:border-neon/40 hover:text-neon">
                        查看报告 <ArrowRight size={12} />
                      </Link>
                      <button title="删除这条考试记录" aria-label="删除这条考试记录"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-xs text-steel-500 transition hover:border-danger/35 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setPending({
                          kind: 'exam', scope: 'one', id: h.id,
                          label: '删除这条考试记录？',
                          summary: `${h.paper_name} · ${h.obtained_score}/${h.total_score} 分 · 正确率 ${acc}%`,
                        })}>
                        <Trash2 size={14} /> <span className="hidden sm:inline">删除</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState text="还没有已提交的考试记录" hint="完成一次模拟考试后，报告会出现在这里" icon={<ClipboardList size={18} />} />}
        </Panel>
      )}

      {tab === 'wrong' && (
        <Panel title="待复习错题" hint={`${wrong.length} 道`}
          action={<Button label={adviceBusy ? '生成中...' : '生成 AI 复习建议'} variant="ghost" size="sm"
            icon={<Sparkles size={13} />} onClick={generateAdvice} isLoading={adviceBusy} />}>
          {(aiAdvice || adviceBusy) && (
            <div className="mb-4 flex gap-3 rounded-xl border border-ai/25 bg-ai/[0.06] p-4">
              <Lightbulb size={17} className="mt-0.5 shrink-0 text-ai" />
              <div className="whitespace-pre-wrap text-sm leading-6 text-steel-300">
                {aiAdvice || '正在根据错题记录生成复习建议...'}
              </div>
            </div>
          )}
          {wrong.length ? (
            <div className="space-y-3">
              {wrong.map((w) => (
                <div key={w.id} className="rounded-xl border border-ink-700/60 bg-ink-900/35 p-4 transition hover:border-ink-600/80">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="tag">{w.question_type}</span>
                      <span className="tag">{w.difficulty}</span>
                      {w.mastered && <span className="tag-neon">已掌握</span>}
                    </div>
                    <span className="text-xs text-danger-soft">错误 {w.wrong_count} 次</span>
                  </div>
                  <div className="mb-2 whitespace-pre-wrap text-sm leading-7 text-text-primary">{w.question_content}</div>
                  {w.code_content && <pre className="code-block mb-2">{w.code_content}</pre>}
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-neon/20 bg-neon/[0.04] p-3"><div className="mb-1 text-steel-500">正确答案</div><AnswerText answer={w.correct_answer} type={w.question_type} caption="参考答案 · C11" /></div>
                    <div className="rounded-lg border border-ink-700/50 p-3 text-steel-400"><span className="text-steel-500">解析：</span>{w.explanation}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="错题本为空，继续保持" hint="练习或考试中答错的题会自动进入这里" icon={<AlertTriangle size={18} />} />}
        </Panel>
      )}

      {tab === 'favorites' && (
        <Panel title="收藏的题目与知识点" hint={`${favorites.length} 条`}>
          {favorites.length ? (
            <div className="divide-y divide-ink-700/40">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-700/60 bg-ink-900/50 text-steel-400">
                      <Bookmark size={14} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] text-steel-500">{f.target_type === 'question' ? '题目' : '知识点'}</div>
                      <div className="truncate text-sm text-text-primary">{f.title}</div>
                    </div>
                  </div>
                  {f.target_type === 'knowledge_point' && (
                    <Link to={`/learning/${f.chapter_id || ''}/${f.target_id}`} className="inline-flex shrink-0 items-center gap-1 text-sm text-neon hover:text-neon-soft">
                      查看 <ArrowRight size={13} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : <EmptyState text="还没有收藏内容" hint="在知识点或题目旁点击收藏即可加入这里" icon={<Bookmark size={18} />} />}
        </Panel>
      )}

      <ConfirmDialog
        isOpen={!!pending}
        title={!pending ? '删除记录？' : pending.scope === 'all' ? '清空全部记录？' : pending.label}
        description={!pending ? ''
          : pending.scope === 'all'
            ? `将删除全部 ${pending.count} 条${pending.kind === 'practice' ? '练习' : '考试'}记录。正确率面板、趋势与错题统计会立即按剩余记录重算，此操作不可恢复。`
            : '这条记录将从档案中移除，正确率面板与错题统计会立即重算。此操作不可恢复。'}
        detail={pending?.scope === 'one' ? (
          <div className="flex items-center gap-2 rounded-lg border border-ink-700/60 bg-ink-900/50 px-3 py-2.5 text-xs leading-5">
            <span className="shrink-0 rounded border border-ink-600/70 px-1.5 py-0.5 font-mono text-[10px] text-steel-400">
              {pending.kind === 'practice' ? 'PRACTICE' : 'EXAM'}
            </span>
            <span className="font-mono text-steel-400">{pending.summary}</span>
          </div>
        ) : undefined}
        confirmLabel={pending?.scope === 'all' ? '确认清空' : '确认删除'}
        busy={deleting}
        onCancel={() => { if (!deleting) setPending(null) }}
        onConfirm={confirmPending}
      />
    </div>
  )
}
