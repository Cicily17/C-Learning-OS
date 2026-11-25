import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, ChevronRight, CircleCheck, Lock } from 'lucide-react'
import { learningApi } from '../api/client'
import { EmptyState, Panel, ProgressBar } from '../components/Layout'
import type { Chapter, KnowledgePoint } from '../types'

export default function Learning() {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [kps, setKps] = useState<KnowledgePoint[]>([])
  const [keyword, setKeyword] = useState('')
  const [chapterId, setChapterId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([learningApi.chapters(), learningApi.kps()])
      .then(([c, k]) => { setChapters(c.data); setKps(k.data) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => kps.filter((kp) => {
    if (chapterId && kp.chapter_id !== chapterId) return false
    if (keyword) {
      const q = keyword.toLowerCase()
      return kp.name.toLowerCase().includes(q) || kp.summary.toLowerCase().includes(q) || kp.code.toLowerCase().includes(q)
    }
    return true
  }), [kps, keyword, chapterId])

  if (loading) return <div className="panel p-8 text-[13px] text-steel-400">正在加载知识体系...</div>

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">KNOWLEDGE CENTER / 知识学习中心</div>
        <h1 className="text-[22px] text-[#F1F5F9]">C 语言知识体系</h1>
        <p className="mt-1 text-[12px] text-steel-400">共 {chapters.length} 个章节、{kps.length} 个知识点，按章节逐步推进。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="章节目录">
          <div className="space-y-1">
            <button
              onClick={() => setChapterId('')}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] transition ${
                !chapterId ? 'bg-neon/10 text-neon' : 'text-steel-400 hover:bg-ink-800/60'
              }`}
            >
              <span>全部章节</span>
              <span className="text-[11px] text-steel-500">{kps.length}</span>
            </button>
            {chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChapterId(ch.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] transition ${
                  chapterId === ch.id ? 'bg-neon/10 text-neon' : 'text-steel-400 hover:bg-ink-800/60'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-steel-500">{ch.code}</span>
                  <span className="truncate">{ch.name}</span>
                </span>
                <span className="text-[11px] text-steel-500">{ch.kp_count}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="知识点检索">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-steel-500" />
              <input
                className="field pl-9"
                placeholder="搜索知识点名称、编号或摘要..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-steel-500">
              <span>当前显示 {filtered.length} 个知识点</span>
              {chapterId && <button className="text-neon hover:underline" onClick={() => setChapterId('')}>清除章节筛选</button>}
            </div>
          </Panel>

          <Panel title="知识点列表">
            {filtered.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((kp) => {
                  const ch = chapters.find((c) => c.id === kp.chapter_id)
                  return (
                    <Link
                      key={kp.id}
                      to={`/learning/${kp.chapter_id}/${kp.id}`}
                      className="group rounded-lg border border-ink-700/60 bg-ink-900/50 p-3.5 transition hover:border-neon/40 hover:bg-ink-800/60"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-steel-500">{kp.code}</span>
                        <span className="tag">{kp.difficulty}</span>
                      </div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] text-[#E8EDF4] group-hover:text-neon">
                        {kp.mastered ? <CircleCheck size={14} className="text-neon" /> : <BookOpen size={14} className="text-steel-500" />}
                        {kp.name}
                      </div>
                      <p className="mb-3 line-clamp-2 text-[11px] leading-5 text-steel-500">{kp.summary}</p>
                      <div className="mb-1.5 flex justify-between text-[10px] text-steel-500">
                        <span className="truncate">{ch?.name}</span>
                        <span>{kp.progress_pct}%</span>
                      </div>
                      <ProgressBar value={kp.progress_pct} />
                      <div className="mt-2 flex items-center justify-between text-[10px] text-steel-500">
                        <span>{kp.mastered ? '已掌握' : kp.progress_status === 'in_progress' ? '学习中' : '未开始'}</span>
                        <ChevronRight size={12} className="text-steel-600 group-hover:text-neon" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : <EmptyState text="没有匹配的知识点，试试其他关键词" />}
          </Panel>
        </div>
      </div>
    </div>
  )
}
