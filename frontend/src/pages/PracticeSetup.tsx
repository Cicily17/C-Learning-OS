import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Dumbbell, RotateCcw, CheckSquare } from 'lucide-react'
import { learningApi, practiceApi } from '../api/client'
import { Panel, useToast } from '../components/Layout'
import type { Chapter, KnowledgePoint, PracticeConfig } from '../types'

const DIFFICULTIES = ['入门', '简单', '中等', '困难']
const TYPES = ['单项选择题', '多项选择题', '判断题', '填空题', '程序阅读题', '程序结果分析题', '找错题', '代码补全题', '编程题']
const COUNTS = [5, 10, 20, 30, 50]
const TIMES = [10, 20, 30, 60]

export default function PracticeSetup() {
  const navigate = useNavigate()
  const toast = useToast()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [kps, setKps] = useState<KnowledgePoint[]>([])
  const [selectedKps, setSelectedKps] = useState<string[]>([])
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [count, setCount] = useState(10)
  const [customCount, setCustomCount] = useState('')
  const [time, setTime] = useState<number | null>(null)
  const [customTime, setCustomTime] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([learningApi.chapters(), learningApi.kps()])
      .then(([c, k]) => { setChapters(c.data); setKps(k.data) })
      .catch((e) => toast(e.message, 'error'))
  }, [])

  const byChapter = useMemo(() => {
    const map = new Map<string, KnowledgePoint[]>()
    kps.forEach((kp) => {
      if (!map.has(kp.chapter_id)) map.set(kp.chapter_id, [])
      map.get(kp.chapter_id)!.push(kp)
    })
    return map
  }, [kps])

  const toggleKp = (id: string) =>
    setSelectedKps((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleChapter = (chapterId: string) => {
    const ids = (byChapter.get(chapterId) || []).map((k) => k.id)
    const all = ids.every((id) => selectedKps.includes(id))
    setSelectedKps((prev) => all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])])
  }

  const finalCount = customCount ? Number(customCount) : count
  const finalTime = customTime ? Number(customTime) : time

  const start = async () => {
    if (!selectedKps.length) { toast('请至少选择一个知识点', 'error'); return }
    if (!finalCount || finalCount < 1) { toast('题量必须是正整数', 'error'); return }
    const config: PracticeConfig = {
      knowledge_point_ids: selectedKps,
      chapter_ids: [],
      difficulties,
      question_types: types,
      count: finalCount,
      time_limit_minutes: finalTime,
    }
    setBusy(true)
    try {
      const res = await practiceApi.create(config as unknown as Record<string, unknown>)
      toast(`已生成 ${res.data.total_count} 道题目`, 'success')
      sessionStorage.setItem('clo_practice_start', String(Date.now()))
      navigate(`/practice/session/${res.data.session_id}`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">PRACTICE CENTER / 智能练习中心</div>
        <h1 className="text-[22px] text-[#e4f3e9]">配置你的练习</h1>
        <p className="mt-1 text-[12px] text-steel-400">系统按你选择的条件从题库真实组卷；题目不足时会明确提示。</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="知识点选择"
          action={
            <div className="flex gap-2">
              <button className="text-[11px] text-neon hover:underline" onClick={() => setSelectedKps(kps.map((k) => k.id))}>全部全选</button>
              <span className="text-ink-600">|</span>
              <button className="text-[11px] text-steel-400 hover:text-neon" onClick={() => setSelectedKps([])}>取消全部</button>
            </div>
          }
        >
          <div className="mb-3 flex items-center justify-between rounded-lg border border-neon/20 bg-neon/5 px-3 py-2">
            <span className="flex items-center gap-2 text-[12px] text-neon"><CheckSquare size={14} /> 已选择知识点</span>
            <span className="text-[16px] text-neon">{selectedKps.length}</span>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {chapters.map((ch) => {
              const list = byChapter.get(ch.id) || []
              const isOpen = expanded.includes(ch.id)
              const selectedCount = list.filter((k) => selectedKps.includes(k.id)).length
              return (
                <div key={ch.id} className="rounded-lg border border-ink-700/60 bg-ink-900/40">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setExpanded((p) => isOpen ? p.filter((x) => x !== ch.id) : [...p, ch.id])}>
                      {isOpen ? <ChevronDown size={14} className="text-steel-500" /> : <ChevronRight size={14} className="text-steel-500" />}
                      <span className="font-mono text-[10px] text-steel-500">{ch.code}</span>
                      <span className="text-[12px] text-[#d7e6dd]">{ch.name}</span>
                      <span className="text-[10px] text-steel-500">({selectedCount}/{list.length})</span>
                    </button>
                    <button className="rounded border border-ink-600/60 px-2 py-1 text-[10px] text-steel-400 transition hover:border-neon/50 hover:text-neon"
                      onClick={() => toggleChapter(ch.id)}>
                      {selectedCount === list.length && list.length > 0 ? '取消整章' : '整章全选'}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="magnet-grid grid gap-1.5 border-t border-ink-700/50 p-2 sm:grid-cols-2">
                      {list.map((kp) => {
                        const on = selectedKps.includes(kp.id)
                        return (
                          <button key={kp.id} onClick={() => toggleKp(kp.id)}
                            className={`rounded-md border px-2.5 py-2 text-left text-[11px] transition active:scale-[0.98] ${
                              on ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/50 bg-ink-850/60 text-steel-400 hover:border-ink-600'
                            }`}>
                            <span className="mr-1 font-mono text-[9px] opacity-60">{kp.code}</span>
                            {kp.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="难度（可多选，留空为不限）">
            <div className="grid grid-cols-4 gap-2">
              {DIFFICULTIES.map((d) => {
                const on = difficulties.includes(d)
                return (
                  <button key={d} onClick={() => setDifficulties((p) => on ? p.filter((x) => x !== d) : [...p, d])}
                    className={`rounded-lg border py-2 text-[12px] transition active:scale-[0.97] ${
                      on ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 bg-ink-900/50 text-steel-400 hover:border-ink-600'
                    }`}>{d}</button>
                )
              })}
            </div>
          </Panel>

          <Panel title="题量">
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((n) => (
                <button key={n} onClick={() => { setCount(n); setCustomCount('') }}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] transition ${count === n && !customCount ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400 hover:border-ink-600'}`}>
                  {n} 题
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-steel-500">自定义</span>
              <input className="field max-w-[100px]" type="number" min="1" max="200" placeholder="数量"
                value={customCount} onChange={(e) => setCustomCount(e.target.value)} />
            </div>
          </Panel>

          <Panel title="练习时间">
            <div className="flex flex-wrap gap-2">
              {TIMES.map((m) => (
                <button key={m} onClick={() => { setTime(m); setCustomTime('') }}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] transition ${time === m && !customTime ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400 hover:border-ink-600'}`}>
                  {m} 分钟
                </button>
              ))}
              <button onClick={() => setTime(null)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] transition ${time === null && !customTime ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400'}`}>
                不限时
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-steel-500">自定义分钟</span>
              <input className="field max-w-[100px]" type="number" min="1" max="600" placeholder="分钟"
                value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
            </div>
          </Panel>

          <Panel title="题目类型（可多选，留空为不限）">
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => {
                const on = types.includes(t)
                return (
                  <button key={t} onClick={() => setTypes((p) => on ? p.filter((x) => x !== t) : [...p, t])}
                    className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition ${on ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/50 text-steel-400 hover:border-ink-600'}`}>
                    {on ? '✓ ' : ''}{t}
                  </button>
                )
              })}
            </div>
          </Panel>

          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] text-steel-500">
              <span>已选 {selectedKps.length} 个知识点 · {finalCount} 题 · {finalTime ? `${finalTime} 分钟` : '不限时'}</span>
              <button className="flex items-center gap-1 hover:text-neon" onClick={() => {
                setSelectedKps([]); setDifficulties([]); setTypes([]); setCount(10); setTime(null); setCustomCount(''); setCustomTime('')
              }}><RotateCcw size={12} /> 重置</button>
            </div>
            <button className="btn-primary w-full" onClick={start} disabled={busy}>
              <Dumbbell size={16} /> {busy ? '正在组卷...' : '开始练习'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
