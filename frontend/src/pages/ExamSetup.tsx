import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ShieldAlert, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { examsApi, learningApi } from '../api/client'
import { Panel, useToast } from '../components/Layout'
import type { Chapter, ExamConfig, KnowledgePoint } from '../types'

const TYPES = ['单项选择题', '多项选择题', '判断题', '填空题', '程序阅读题', '程序结果分析题', '找错题', '代码补全题', '编程题']
const DIFFICULTIES = ['入门', '简单', '中等', '困难']
const TIMES = [30, 45, 60, 90, 120]

export default function ExamSetup() {
  const navigate = useNavigate()
  const toast = useToast()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [kps, setKps] = useState<KnowledgePoint[]>([])
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [selectedKps, setSelectedKps] = useState<string[]>([])
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({
    '单项选择题': 4, '判断题': 2, '程序结果分析题': 2,
  })
  const [typeScores, setTypeScores] = useState<Record<string, number>>({
    '单项选择题': 5, '判断题': 5, '程序结果分析题': 10,
  })
  const [name, setName] = useState('C 语言综合模拟考试')
  const [duration, setDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [showNotice, setShowNotice] = useState(false)
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

  const count = Object.values(typeCounts).reduce((a, b) => a + (b || 0), 0)
  const totalScore = Object.entries(typeCounts).reduce(
    (sum, [type, n]) => sum + (n || 0) * (typeScores[type] || 1), 0
  )
  const finalDuration = customDuration ? Number(customDuration) : duration

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const toggleChapterKps = (chapterId: string) => {
    const ids = (byChapter.get(chapterId) || []).map((k) => k.id)
    const all = ids.every((id) => selectedKps.includes(id))
    setSelectedKps(all ? selectedKps.filter((id) => !ids.includes(id)) : [...new Set([...selectedKps, ...ids])])
  }

  const start = async () => {
    if (!name.trim()) { toast('请填写考试名称', 'error'); return }
    if (!selectedChapters.length && !selectedKps.length) { toast('请至少选择一个考试范围', 'error'); return }
    if (count < 1) { toast('请至少配置一道题目', 'error'); return }
    if (!finalDuration || finalDuration < 1) { toast('考试时长必须是正整数', 'error'); return }
    setBusy(true)
    try {
      const config: ExamConfig = {
        name: name.trim(),
        chapter_ids: selectedChapters,
        knowledge_point_ids: selectedKps,
        difficulties,
        question_types: Object.keys(typeCounts).filter((t) => (typeCounts[t] || 0) > 0),
        count,
        type_counts: Object.fromEntries(Object.entries(typeCounts).filter(([, n]) => n > 0)),
        type_scores: Object.fromEntries(Object.entries(typeScores).filter(([, n]) => n > 0)),
        duration_minutes: finalDuration,
        total_score: totalScore,
      }
      const paper = await examsApi.createPaper(config as unknown as Record<string, unknown>)
      const session = await examsApi.start(paper.data.id)
      sessionStorage.setItem('clo_exam_start', String(Date.now()))
      navigate(`/exams/session/${session.data.session_id}`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false); setShowNotice(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">EXAM CENTER / 模拟考试中心</div>
        <h1 className="text-[22px] text-[#e4f3e9]">配置模拟考试</h1>
        <p className="mt-1 text-[12px] text-steel-400">
          试卷由服务端自动组卷，答案封存在服务端。考试期间不提供提示、答案、解析、正确率与分数。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Panel title="考试范围">
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {chapters.map((ch) => {
                const on = selectedChapters.includes(ch.id)
                return (
                  <button key={ch.id} onClick={() => toggle(selectedChapters, setSelectedChapters, ch.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[12px] transition ${
                      on ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 bg-ink-900/40 text-steel-400 hover:border-ink-600'
                    }`}>
                    <span><span className="mr-2 font-mono text-[10px] opacity-60">{ch.code}</span>{ch.name}</span>
                    <span className="text-[10px]">{on ? '已选' : ch.kp_count + ' 知识点'}</span>
                  </button>
                )
              })}
            </div>
            <div className="rounded-lg border border-ink-700/60 bg-ink-900/30">
              <div className="flex items-center justify-between border-b border-ink-700/50 px-3 py-2">
                <span className="text-[12px] text-[#c3d8cc]">细分到知识点（可选，留空表示按章节全范围）</span>
                <span className="text-[11px] text-neon">已选 {selectedKps.length}</span>
              </div>
              <div className="max-h-[280px] space-y-1 overflow-y-auto p-2">
                {chapters.map((ch) => {
                  const list = byChapter.get(ch.id) || []
                  const open = expanded.includes(ch.id)
                  const selected = list.filter((k) => selectedKps.includes(k.id)).length
                  return (
                    <div key={ch.id}>
                      <div className="flex items-center gap-2 px-1 py-1">
                        <button className="flex flex-1 items-center gap-2 text-left text-[11px] text-steel-400 hover:text-neon"
                          onClick={() => setExpanded(open ? expanded.filter((x) => x !== ch.id) : [...expanded, ch.id])}>
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{ch.name}
                          <span className="text-steel-500">({selected}/{list.length})</span>
                        </button>
                        <button className="text-[10px] text-steel-500 hover:text-neon" onClick={() => toggleChapterKps(ch.id)}>
                          {selected === list.length && list.length > 0 ? '取消' : '全选'}
                        </button>
                      </div>
                      {open && (
                        <div className="magnet-grid grid gap-1 pb-2 pl-6 sm:grid-cols-2">
                          {list.map((kp) => {
                            const on = selectedKps.includes(kp.id)
                            return (
                              <button key={kp.id} onClick={() => toggle(selectedKps, setSelectedKps, kp.id)}
                                className={`rounded border px-2 py-1 text-left text-[10px] transition ${
                                  on ? 'border-neon/40 bg-neon/10 text-neon' : 'border-ink-700/50 text-steel-500 hover:border-ink-600'
                                }`}>{kp.code} {kp.name}</button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </Panel>

          <Panel title="题型、数量与分值">
            <div className="space-y-1.5">
              {TYPES.map((type) => (
                <div key={type} className="grid grid-cols-[1fr_90px_90px] items-center gap-2 rounded-lg border border-ink-700/50 bg-ink-900/30 px-3 py-2">
                  <span className="text-[12px] text-[#c3d8cc]">{type}</span>
                  <label className="flex items-center gap-1 text-[10px] text-steel-500">
                    题数
                    <input type="number" min="0" max="50" className="field w-16 px-2 py-1 text-[12px]"
                      value={typeCounts[type] || 0}
                      onChange={(e) => setTypeCounts({ ...typeCounts, [type]: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-steel-500">
                    分值
                    <input type="number" min="1" max="100" className="field w-16 px-2 py-1 text-[12px]"
                      value={typeScores[type] || 1}
                      onChange={(e) => setTypeScores({ ...typeScores, [type]: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="考试基本信息">
            <label className="mb-3 block">
              <span className="mb-1 block text-[11px] text-steel-500">考试名称</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="mb-3">
              <div className="mb-2 text-[11px] text-steel-500">难度（可多选，留空为不限）</div>
              <div className="grid grid-cols-4 gap-1.5">
                {DIFFICULTIES.map((d) => {
                  const on = difficulties.includes(d)
                  return (
                    <button key={d} onClick={() => toggle(difficulties, setDifficulties, d)}
                      className={`rounded border py-1.5 text-[11px] transition ${on ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400'}`}>{d}</button>
                  )
                })}
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-2 text-[11px] text-steel-500">考试时长</div>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((m) => (
                  <button key={m} onClick={() => { setDuration(m); setCustomDuration('') }}
                    className={`rounded border px-2.5 py-1.5 text-[11px] transition ${duration === m && !customDuration ? 'border-neon/50 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400'}`}>
                    {m} 分钟
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-steel-500">自定义</span>
                <input className="field max-w-[100px]" type="number" min="1" max="600" placeholder="分钟"
                  value={customDuration} onChange={(e) => setCustomDuration(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-neon/20 bg-neon/5 p-3">
              <div><div className="text-[10px] text-steel-500">题目数</div><div className="text-[18px] text-neon">{count}</div></div>
              <div><div className="text-[10px] text-steel-500">总分</div><div className="text-[18px] text-neon">{totalScore}</div></div>
              <div><div className="text-[10px] text-steel-500">时长</div><div className="text-[18px] text-neon">{finalDuration || '—'}<span className="ml-1 text-[10px]">分</span></div></div>
            </div>
          </Panel>

          <Panel title="考试须知">
            <div className="space-y-2 text-[11px] leading-6 text-[#a9c2b5]">
              <p>· 考试过程中不会显示答案、解析、正确率与分数。</p>
              <p>· 所有作答自动保存，倒计时结束自动交卷。</p>
              <p>· 交卷后记录锁定，无法二次提交。</p>
              <p>· AI 助手在考试模式下被服务端禁用。</p>
            </div>
          </Panel>

          <div className="panel space-y-3 p-4">
            <button className="btn-ghost w-full text-[12px]" onClick={() => {
              setSelectedChapters([]); setSelectedKps([]); setDifficulties([])
              setTypeCounts({ '单项选择题': 4, '判断题': 2, '程序结果分析题': 2 })
              setTypeScores({ '单项选择题': 5, '判断题': 5, '程序结果分析题': 10 })
              setName('C 语言综合模拟考试'); setDuration(60); setCustomDuration('')
            }}><RotateCcw size={13} /> 恢复默认配置</button>
            <button className="btn-primary w-full" onClick={() => {
              if (!name.trim() || (!selectedChapters.length && !selectedKps.length) || count < 1) {
                toast('请先完善考试名称、范围与题型配置', 'error'); return
              }
              setShowNotice(true)
            }}><ClipboardList size={15} /> 生成试卷</button>
          </div>
        </div>
      </div>

      {showNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-lg p-6">
            <div className="mb-4 flex items-center gap-2 text-neon"><ShieldAlert size={18} /> 考试须知确认</div>
            <div className="space-y-2 text-[13px] leading-7 text-[#c3d8cc]">
              <p>本场考试共 <span className="text-neon">{count}</span> 题，总分 <span className="text-neon">{totalScore}</span>，时长 <span className="text-neon">{finalDuration}</span> 分钟。</p>
              <p>开始后计时立即启动。考试中不可查看提示、答案、解析、正确率和分数；交卷后方可查看考试报告。</p>
              <p className="text-[11px] text-amber-400">请确认已做好考试准备。</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setShowNotice(false)}>取消</button>
              <button className="btn-primary" onClick={start} disabled={busy}>
                <ClipboardList size={15} /> {busy ? '正在组卷...' : '确认并开始考试'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
