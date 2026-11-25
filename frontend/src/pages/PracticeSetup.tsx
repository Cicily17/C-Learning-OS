import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Dumbbell, RotateCcw, CheckSquare, Sparkles, Plus, RefreshCw } from 'lucide-react'
import { learningApi, practiceApi, questionsApi } from '../api/client'
import { Panel, useToast } from '../components/Layout'
import type { Chapter, KnowledgePoint, PracticeConfig, QuestionBank } from '../types'

const BANKS_FALLBACK: QuestionBank[] = [
  { key: 'leetcode', name: 'LeetCode 题库', desc: '编程与算法实战题' },
  { key: '专升本', name: '专升本题库', desc: '基础概念与语法' },
  { key: '本科', name: '本科题库', desc: '课程同步练习' },
  { key: '考研', name: '考研题库', desc: '综合与拔高题' },
]
const DIFFICULTIES = ['入门', '简单', '中等', '困难']
const TYPES = ['单项选择题', '多项选择题', '判断题', '填空题', '程序阅读题', '程序结果分析题', '找错题', '代码补全题', '编程题']
const COUNTS = [5, 10, 20, 30, 50]
const TIMES = [10, 20, 30, 60]

export default function PracticeSetup() {
  const navigate = useNavigate()
  const toast = useToast()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [kps, setKps] = useState<KnowledgePoint[]>([])
  const [banks, setBanks] = useState<QuestionBank[]>(BANKS_FALLBACK)
  const [byBank, setByBank] = useState<Record<string, number>>({})
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedKps, setSelectedKps] = useState<string[]>([])
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [count, setCount] = useState(10)
  const [customCount, setCustomCount] = useState('')
  const [time, setTime] = useState<number | null>(null)
  const [customTime, setCustomTime] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState<number | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [genQtype, setGenQtype] = useState(TYPES[0])
  const [genDiff, setGenDiff] = useState(DIFFICULTIES[0])
  const [genCount, setGenCount] = useState(5)
  // 自编题表单
  const [cf, setCf] = useState({ chapter_id: '', knowledge_point_id: '', question_type: TYPES[0],
    difficulty: DIFFICULTIES[0], question_content: '', code_content: '', correct_answer: '', explanation: '' })
  const [cfOptions, setCfOptions] = useState([{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }])

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

  // 实时预览当前筛选条件下的可用题量
  const filterKey = JSON.stringify({ selectedKps, difficulties, types, selectedBank })
  useEffect(() => {
    const config = {
      knowledge_point_ids: selectedKps,
      difficulties,
      question_types: types,
      bank: selectedBank,
    }
    questionsApi.availability(config as Record<string, unknown>)
      .then((r) => {
        setAvailable(r.data.available)
        if (r.data.banks?.length) setBanks(r.data.banks)
        if (r.data.by_bank) setByBank(r.data.by_bank)
      })
      .catch(() => setAvailable(null))
  }, [filterKey])

  const refreshAvailable = () => questionsApi.availability({
    knowledge_point_ids: selectedKps, difficulties, question_types: types, bank: selectedBank,
  } as Record<string, unknown>).then((r) => {
    setAvailable(r.data.available)
    if (r.data.by_bank) setByBank(r.data.by_bank)
  }).catch(() => {})

  const aiGenerate = async () => {
    if (!selectedKps.length) { toast('请先选择知识点，AI 才能按知识点出题', 'error'); return }
    setGenBusy(true)
    try {
      const r = await questionsApi.aiGenerate({
        knowledge_point_ids: selectedKps, qtype: genQtype, difficulty: genDiff, count: genCount,
        bank: selectedBank,
      })
      toast(`AI 已生成并校验通过 ${r.data.generated} 道「${genDiff}·${genQtype}」题目，已加入题库`, 'success')
      await refreshAvailable()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setGenBusy(false) }
  }

  const submitCustom = async () => {
    if (!cf.knowledge_point_id) { toast('请选择知识点', 'error'); return }
    if (!cf.question_content.trim() || !cf.correct_answer.trim() || !cf.explanation.trim()) {
      toast('请填写题干、正确答案和解析', 'error'); return
    }
    const needsOptions = !['填空题', '编程题'].includes(cf.question_type)
    const payload: Record<string, unknown> = {
      chapter_id: cf.chapter_id, knowledge_point_id: cf.knowledge_point_id,
      question_type: cf.question_type, difficulty: cf.difficulty, bank: selectedBank,
      question_content: cf.question_content, code_content: cf.code_content,
      correct_answer: cf.correct_answer, explanation: cf.explanation, score: 1,
    }
    if (needsOptions) {
      const cleaned = cfOptions.filter((o) => o.text.trim())
      if (cleaned.length < 2) { toast('选择题至少填写 2 个选项', 'error'); return }
      payload.options = cleaned.map((o, i) => ({ key: 'ABCD'[i], text: o.text }))
    }
    setGenBusy(true)
    try {
      await questionsApi.custom(payload)
      toast('自编题已通过校验并加入题库', 'success')
      setShowCustom(false)
      setCf({ chapter_id: '', knowledge_point_id: '', question_type: TYPES[0], difficulty: DIFFICULTIES[0],
        question_content: '', code_content: '', correct_answer: '', explanation: '' })
      setCfOptions([{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }])
      await refreshAvailable()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setGenBusy(false) }
  }

  const start = async () => {
    if (!selectedKps.length) { toast('请至少选择一个知识点', 'error'); return }
    if (!finalCount || finalCount < 1) { toast('题量必须是正整数', 'error'); return }
    const config: PracticeConfig = {
      knowledge_point_ids: selectedKps,
      chapter_ids: [],
      difficulties,
      question_types: types,
      bank: selectedBank,
      count: finalCount,
      time_limit_minutes: finalTime,
    }
    setBusy(true)
    try {
      const res = await practiceApi.create(config as unknown as Record<string, unknown>)
      const extra = res.data.auto_generated ? `（其中 ${res.data.auto_generated} 道为自动补充生成）` : ''
      toast(`已生成 ${res.data.total_count} 道题目${extra}`, 'success')
      sessionStorage.setItem('clo_practice_start', String(Date.now()))
      navigate(`/practice/session/${res.data.session_id}`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">PRACTICE CENTER / 智能练习中心</div>
        <h1 className="text-[22px] text-[#F1F5F9]">配置你的练习</h1>
        <p className="mt-1 text-[12px] text-steel-400">先选择题库，再选知识点与条件，系统从该题库真实组卷；题目不足时自动补足。</p>
      </div>

      <Panel title="选择题库" action={
        <button className="text-[11px] text-steel-400 hover:text-neon" onClick={() => setSelectedBank('')}>
          {selectedBank ? '清除选择（不限题库）' : '当前：全部题库'}
        </button>
      }>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <button onClick={() => setSelectedBank('')}
            className={`rounded-lg border px-3 py-3 text-left transition ${selectedBank === '' ? 'border-neon/60 bg-neon/10' : 'border-ink-700/60 bg-ink-900/50 hover:border-ink-600'}`}>
            <div className={`text-[13px] ${selectedBank === '' ? 'text-neon' : 'text-[#E8EDF4]'}`}>全部题库</div>
            <div className="mt-1 text-[10px] text-steel-500">跨所有题库组卷</div>
          </button>
          {banks.map((b) => {
            const on = selectedBank === b.key
            const isAI = b.key === 'ai'
            return (
              <button key={b.key} onClick={() => setSelectedBank(b.key)}
                className={`rounded-lg border px-3 py-3 text-left transition ${on ? 'border-neon/60 bg-neon/10' : isAI ? 'border-neon/30 bg-neon/5 hover:border-neon/50' : 'border-ink-700/60 bg-ink-900/50 hover:border-ink-600'}`}>
                <div className={`flex items-center justify-between text-[13px] ${on || isAI ? 'text-neon' : 'text-[#E8EDF4]'}`}>
                  <span>{b.name}</span>
                  <span className={`font-mono text-[11px] ${on || isAI ? 'text-neon' : 'text-steel-500'}`}>
                    {isAI ? <><Sparkles size={12} className="inline" /> 实时</> : (byBank[b.key] ?? '·')}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-steel-500">{b.desc}</div>
              </button>
            )
          })}
        </div>
      </Panel>

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
                      <span className="text-[12px] text-[#E8EDF4]">{ch.name}</span>
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
            <div className="mb-2 flex items-center justify-between text-[11px] text-steel-500">
              <span>{banks.find((b) => b.key === selectedBank)?.name || '全部题库'} · {selectedKps.length} 个知识点 · {finalCount} 题 · {finalTime ? `${finalTime} 分钟` : '不限时'}</span>
              <button className="flex items-center gap-1 hover:text-neon" onClick={() => {
                setSelectedKps([]); setDifficulties([]); setTypes([]); setSelectedBank(''); setCount(10); setTime(null); setCustomCount(''); setCustomTime('')
              }}><RotateCcw size={12} /> 重置</button>
            </div>
            <div className="mb-3 flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/50 px-3 py-2 text-[11px]">
              <span className="text-steel-500">当前条件可用题目</span>
              <span className={`flex items-center gap-1 ${available === null ? 'text-steel-500' : available >= finalCount ? 'text-neon' : 'text-challenge'}`}>
                <RefreshCw size={11} /> {available === null ? '检测中...' : `${available} 道`}
              </span>
            </div>
            {selectedBank === 'ai' ? (
              <div className="mb-3 rounded-lg border border-neon/30 bg-neon/5 px-3 py-2 text-[11px] leading-5 text-neon/90">
                <Sparkles size={12} className="mr-1 inline" />AI 题库将按你选的知识点、难度与题型，用大模型实时生成 {finalCount} 道新题并组卷（需已配置大模型密钥）。
              </div>
            ) : available !== null && available < finalCount && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-challenge-soft/90">
                题库现有 {available} 道符合条件，不足 {finalCount} 道。开始练习时系统会按条件自动补充生成真实题目，
                也可用下方「AI 出题」提前补足。
              </div>
            )}
            <button className="btn-primary w-full" onClick={start} disabled={busy || !selectedKps.length}>
              <Dumbbell size={16} /> {busy ? (selectedBank === 'ai' ? 'AI 正在出题...' : '正在组卷...') : '开始练习'}
            </button>
          </div>

          <Panel title="题库补充" action={
            <button className="text-[11px] text-neon hover:underline" onClick={() => setShowCustom((v) => !v)}>
              {showCustom ? '收起自编题' : '+ 自编题'}
            </button>
          }>
            <p className="mb-3 text-[11px] leading-5 text-steel-500">
              勾选条件后若题目不足，可让 AI 按知识点即时出题，或自己编写题目。新题将归入当前选择题库（{banks.find((b) => b.key === selectedBank)?.name || '全部题库'}）。
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select className="field" value={genQtype} onChange={(e) => setGenQtype(e.target.value)}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="field" value={genDiff} onChange={(e) => setGenDiff(e.target.value)}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-steel-500">生成数量</span>
                <input className="field max-w-[90px]" type="number" min={1} max={50} value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))} />
              </div>
              <button className="btn-ghost w-full" onClick={aiGenerate} disabled={genBusy || !selectedKps.length}>
                <Sparkles size={13} /> {genBusy ? '生成中...' : `AI 生成 ${genCount} 道题`}
              </button>
            </div>

            {showCustom && (
              <div className="mt-4 space-y-2 border-t border-ink-700/60 pt-4">
                <div className="text-[11px] text-neon-dim">自编题表单</div>
                <select className="field w-full" value={cf.chapter_id} onChange={(e) => {
                  const ch = e.target.value
                  setCf((p) => ({ ...p, chapter_id: ch, knowledge_point_id: '' }))
                }}>
                  <option value="">选择章节</option>
                  {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="field w-full" value={cf.knowledge_point_id} onChange={(e) => {
                  const kp = kps.find((k) => k.id === e.target.value)
                  setCf((p) => ({ ...p, knowledge_point_id: e.target.value, chapter_id: kp?.chapter_id || p.chapter_id }))
                }}>
                  <option value="">选择知识点</option>
                  {(byChapter.get(cf.chapter_id) || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select className="field" value={cf.question_type} onChange={(e) => setCf((p) => ({ ...p, question_type: e.target.value }))}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="field" value={cf.difficulty} onChange={(e) => setCf((p) => ({ ...p, difficulty: e.target.value }))}>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <textarea className="field min-h-[60px] w-full" placeholder="题干（必填）" value={cf.question_content}
                  onChange={(e) => setCf((p) => ({ ...p, question_content: e.target.value }))} />
                <textarea className="field min-h-[50px] w-full font-mono" placeholder="C 代码（可选）" value={cf.code_content}
                  onChange={(e) => setCf((p) => ({ ...p, code_content: e.target.value }))} />
                {!['填空题', '编程题'].includes(cf.question_type) && (
                  <div className="space-y-1">
                    {cfOptions.map((o, i) => (
                      <div key={o.key} className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[11px] text-steel-500">{o.key}</span>
                        <input className="field flex-1" placeholder={`选项 ${o.key}`} value={o.text}
                          onChange={(e) => setCfOptions((prev) => prev.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} />
                      </div>
                    ))}
                  </div>
                )}
                <input className="field w-full" placeholder="正确答案（如 A 或 A,B 或文本）" value={cf.correct_answer}
                  onChange={(e) => setCf((p) => ({ ...p, correct_answer: e.target.value }))} />
                <textarea className="field min-h-[50px] w-full" placeholder="详细解析（必填，至少 8 字）" value={cf.explanation}
                  onChange={(e) => setCf((p) => ({ ...p, explanation: e.target.value }))} />
                <button className="btn-primary w-full" onClick={submitCustom} disabled={genBusy}>
                  <Plus size={13} /> {genBusy ? '提交中...' : '添加题目到题库'}
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
