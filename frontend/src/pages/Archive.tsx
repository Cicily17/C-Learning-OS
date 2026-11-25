import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { History, ClipboardList, AlertTriangle, Bookmark, Lightbulb, Sparkles, Trash2 } from 'lucide-react'
import { aiApi, examsApi, learningApi, practiceApi } from '../api/client'
import { EmptyState, Panel, useToast } from '../components/Layout'

type Tab = 'history' | 'exams' | 'wrong' | 'favorites'

export default function Archive() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('history')
  const [history, setHistory] = useState<any[]>([])
  const [examHistory, setExamHistory] = useState<any[]>([])
  const [wrong, setWrong] = useState<any[]>([])
  const [favorites, setFavorites] = useState<any[]>([])
  const [aiAdvice, setAiAdvice] = useState('')
  const [adviceBusy, setAdviceBusy] = useState(false)

  const load = () => {
    practiceApi.history().then((r) => setHistory(r.data)).catch(() => {})
    examsApi.history().then((r) => setExamHistory(r.data)).catch(() => {})
    practiceApi.wrongQuestions().then((r) => setWrong(r.data)).catch(() => {})
    learningApi.favorites().then((r) => setFavorites(r.data)).catch(() => {})
  }
  useEffect(load, [])

  const generateAdvice = async () => {
    setAdviceBusy(true)
    try {
      const summary = wrong.slice(0, 8).map((w) => `题目：${w.question_content.slice(0, 60)}｜知识点：${w.question_type}｜错误次数：${w.wrong_count}`).join('\n')
      const r = await aiApi.chat({
        mode: 'practice',
        question: `请根据以下错题记录，给出 C 语言复习建议，按优先级列出 3-5 条：\n${summary || '暂无错题记录，请给出通用复习建议。'}`,
      })
      setAiAdvice(r.data.answer)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setAdviceBusy(false) }
  }

  const deletePractice = async (id: string) => {
    if (!window.confirm('确定删除这条练习记录吗？此操作不可恢复。')) return
    try { await practiceApi.deleteHistory(id); toast('练习记录已删除', 'success'); load() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  const clearPractices = async () => {
    if (!history.length) return
    if (!window.confirm(`确定清空全部 ${history.length} 条练习记录吗？此操作不可恢复。`)) return
    try { await practiceApi.clearHistory(); toast('练习记录已清空', 'success'); load() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  const deleteExam = async (id: string) => {
    if (!window.confirm('确定删除这条考试记录吗？此操作不可恢复。')) return
    try { await examsApi.deleteHistory(id); toast('考试记录已删除', 'success'); load() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  const clearExams = async () => {
    if (!examHistory.length) return
    if (!window.confirm(`确定清空全部 ${examHistory.length} 条考试记录吗？此操作不可恢复。`)) return
    try { await examsApi.clearHistory(); toast('考试记录已清空', 'success'); load() }
    catch (e) { toast((e as Error).message, 'error') }
  }

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'history', label: '练习历史', icon: History, count: history.length },
    { key: 'exams', label: '考试记录', icon: ClipboardList, count: examHistory.length },
    { key: 'wrong', label: '错题本', icon: AlertTriangle, count: wrong.length },
    { key: 'favorites', label: '我的收藏', icon: Bookmark, count: favorites.length },
  ]

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">LEARNING ARCHIVE / 学习档案</div>
        <h1 className="text-[22px] text-[#F1F5F9]">学习档案</h1>
        <p className="mt-1 text-[12px] text-steel-400">练习记录、错题与收藏均保存到数据库，刷新页面不会丢失。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px] transition ${
              tab === t.key ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400 hover:border-ink-600'
            }`}>
            <t.icon size={14} /> {t.label} <span className="text-[11px] opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <Panel title="历史练习记录" action={
          history.length ? <button className="flex items-center gap-1 text-[11px] text-steel-500 hover:text-red-400" onClick={clearPractices}>
            <Trash2 size={12} /> 清空全部
          </button> : undefined
        }>
          {history.length ? (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 px-4 py-3 transition hover:border-neon/40">
                  <Link to={`/practice/result/${h.id}`} className="min-w-[160px] flex-1">
                    <div className="text-[13px] text-[#E8EDF4]">练习 · {h.total_count} 题</div>
                    <div className="mt-1 text-[11px] text-steel-500">
                      {new Date(h.submitted_at).toLocaleString('zh-CN')}
                    </div>
                  </Link>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-[11px] text-steel-500">答对</div>
                      <div className="text-[15px] text-neon">{h.correct_count}/{h.total_count}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-steel-500">正确率</div>
                      <div className="text-[15px] text-neon">{Math.round(h.accuracy * 100)}%</div>
                    </div>
                    <button className="rounded p-1.5 text-steel-500 transition hover:bg-red-500/10 hover:text-red-400"
                      title="删除记录" onClick={() => deletePractice(h.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="还没有已提交的练习记录" />}
        </Panel>
      )}

      {tab === 'exams' && (
        <Panel title="历史考试记录" action={
          examHistory.length ? <button className="flex items-center gap-1 text-[11px] text-steel-500 hover:text-red-400" onClick={clearExams}>
            <Trash2 size={12} /> 清空全部
          </button> : undefined
        }>
          {examHistory.length ? (
            <div className="space-y-2">
              {examHistory.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 px-4 py-3 transition hover:border-neon/40">
                  <Link to={`/exams/result/${h.id}`} className="min-w-[160px] flex-1">
                    <div className="text-[13px] text-[#E8EDF4]">{h.paper_name}</div>
                    <div className="mt-1 text-[11px] text-steel-500">
                      {new Date(h.submitted_at).toLocaleString('zh-CN')} · 答对 {h.correct_count} 题
                    </div>
                  </Link>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-[11px] text-steel-500">得分</div>
                      <div className="text-[15px] text-neon">{h.obtained_score}/{h.total_score}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-steel-500">正确率</div>
                      <div className="text-[15px] text-neon">{Math.round(h.accuracy * 100)}%</div>
                    </div>
                    <button className="rounded p-1.5 text-steel-500 transition hover:bg-red-500/10 hover:text-red-400"
                      title="删除记录" onClick={() => deleteExam(h.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="还没有已提交的考试记录" />}
        </Panel>
      )}

      {tab === 'wrong' && (
        <Panel title="待复习错题">
          {wrong.length ? (
            <div className="space-y-3">
              {wrong.map((w) => (
                <div key={w.id} className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <span className="tag">{w.question_type}</span>
                      <span className="tag">{w.difficulty}</span>
                      {w.mastered && <span className="tag-neon">已掌握</span>}
                    </div>
                    <span className="text-[11px] text-steel-500">错误 {w.wrong_count} 次</span>
                  </div>
                  <div className="mb-2 whitespace-pre-wrap text-[13px] leading-6 text-[#E8EDF4]">{w.question_content}</div>
                  {w.code_content && <pre className="code-block mb-2">{w.code_content}</pre>}
                  <div className="grid gap-2 text-[12px] sm:grid-cols-2">
                    <div className="rounded border border-ink-700/50 p-2"><span className="text-steel-500">正确答案：</span><span className="text-neon">{w.correct_answer}</span></div>
                    <div className="rounded border border-neon/20 bg-neon/5 p-2"><span className="text-steel-500">解析：</span><span className="text-[#94A3B8]">{w.explanation}</span></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="错题本为空，继续保持！" />}
        </Panel>
      )}

      {tab === 'favorites' && (
        <Panel title="收藏的题目与知识点">
          {favorites.length ? (
            <div className="space-y-2">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] text-steel-500">{f.target_type === 'question' ? '题目' : '知识点'}</div>
                    <div className="truncate text-[12px] text-[#E8EDF4]">{f.title}</div>
                  </div>
                  {f.target_type === 'knowledge_point' && (
                    <Link to={`/learning/${f.chapter_id || ''}/${f.target_id}`} className="text-[11px] text-neon hover:underline">查看</Link>
                  )}
                </div>
              ))}
            </div>
          ) : <EmptyState text="还没有收藏内容" />}
        </Panel>
      )}

      <Panel title="复习建议" action={
        <button className="btn-ghost text-[11px]" onClick={generateAdvice} disabled={adviceBusy}>
          <Sparkles size={12} /> {adviceBusy ? '生成中...' : '生成 AI 复习建议'}
        </button>
      }>
        <div className="flex gap-3 rounded-lg border border-neon/20 bg-neon/5 p-4">
          <Lightbulb size={17} className="mt-0.5 shrink-0 text-neon" />
          <div className="space-y-1.5 whitespace-pre-wrap text-[12px] leading-6 text-[#94A3B8]">
            {aiAdvice ? <p>{aiAdvice}</p> : (
              <>
                <p>优先复习错题本中出现次数较多的题目，重做时注意先独立推导再看解析。</p>
                <p>知识点掌握率偏低时，建议回到知识学习中心逐章学习，完成配套练习后再进行专项训练。</p>
                <p className="text-steel-500">点击右上角按钮，可基于当前错题记录生成个性化复习建议。</p>
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  )
}
