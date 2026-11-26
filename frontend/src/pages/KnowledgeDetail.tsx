import { Heading } from '@astryxdesign/core/Heading'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bookmark, CheckCircle2, Lightbulb,
  AlertTriangle, Dumbbell, Terminal,
} from 'lucide-react'
import { learningApi } from '../api/client'
import { CatNote } from '../components/Brand'
import { CodeBreakdown } from '../components/CodeBreakdown'
import { Panel } from '../components/Layout'
import { useToast } from '../components/Layout'
import type { KnowledgePoint } from '../types'

function parseArr(json: string): any[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

export default function KnowledgeDetail() {
  const { kpId } = useParams()
  const toast = useToast()
  const [kp, setKp] = useState<KnowledgePoint | null>(null)

  const load = () => { if (kpId) learningApi.kp(kpId).then((r) => setKp(r.data)).catch((e) => toast(e.message, 'error')) }
  useEffect(load, [kpId])

  if (!kp) return <div className="panel p-8 text-xs text-steel-400">正在加载知识点...</div>

  const errors = parseArr(kp.common_errors_json)
  const samples = (parseArr(kp.examples_json) as any[])
    .map((ex, i) => ({
      title: (typeof ex === 'object' && ex?.title) || `示例 ${i + 1}`,
      code: typeof ex === 'string' ? ex : String(ex?.code || ''),
    }))
    .filter((s) => s.code.trim())

  const markMastered = async () => {
    try {
      await learningApi.updateProgress(kp.id, { status: 'mastered', progress_pct: 100 })
      toast('已标记为掌握，获得 10 EXP', 'success')
      load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const toggleFav = async () => {
    try {
      const r = await learningApi.toggleFavorite({ target_type: 'knowledge_point', target_id: kp.id })
      toast(r.data.message, 'success')
      load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/learning" className="mb-3 inline-flex items-center gap-1 text-xs text-steel-400 hover:text-neon">
            <ArrowLeft size={14} /> 返回知识目录
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-steel-500">{kp.code}</span>
            <span className="tag">{kp.difficulty}</span>
            <span className="tag">预计 {kp.estimated_minutes} 分钟</span>
            <span className="tag">进度 {kp.progress_pct}%</span>
            {kp.mastered && <span className="tag-neon">已掌握</span>}
          </div>
          <Heading level={1}>{kp.name}</Heading>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-steel-400">{kp.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={toggleFav}>
            <Bookmark size={15} fill={kp.favorited ? 'currentColor' : 'none'} />
            {kp.favorited ? '已收藏' : '收藏'}
          </button>
          <button className="btn-ghost" onClick={markMastered} disabled={kp.mastered}>
            <CheckCircle2 size={15} /> 标记掌握
          </button>
          <Link to="/practice/setup" className="btn-primary"><Dumbbell size={15} /> 去做配套练习</Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="核心概念">
            <div className="markdown-body whitespace-pre-wrap">{kp.core_concept_md}</div>
          </Panel>
          <Panel title="通俗解释">
            <div className="markdown-body whitespace-pre-wrap">{kp.explanation_md}</div>
          </Panel>
          <Panel title="语法结构" hint="可直接对照下方逐行拆解">
            <div className="code-block text-neon-soft">{kp.syntax_md}</div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="常见错误">
            {errors.length ? (
              <ul className="space-y-2">
                {errors.map((e, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-6 text-steel-400">
                    <AlertTriangle size={14} className="mt-1 shrink-0 text-amber-400" /> {e}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-steel-500">暂无记录</p>}
          </Panel>
          <Panel title="学习提示">
            <div className="space-y-3">
              <CatNote>
                先读核心概念，再往下看逐行拆解 —— 把「这一行在做什么」串成一条数据流，比死记语法快得多。
              </CatNote>
              <div className="flex gap-2 text-xs leading-6 text-steel-400">
                <Lightbulb size={14} className="mt-1 shrink-0 text-neon" />
                点击代码行或讲解卡片，代码与讲解会互相对照高亮。
              </div>
              <div className="flex gap-2 text-xs leading-6 text-steel-400">
                <Terminal size={14} className="mt-1 shrink-0 text-neon" />
                讲解由本地静态分析实时推演，不上传代码；想真跑一遍可去「AI 助手 · 代码实验室」。
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {samples.length > 0 && <CodeBreakdown samples={samples} name={kp.name} />}
    </div>
  )
}
