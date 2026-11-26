import { Heading } from '@astryxdesign/core/Heading'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import {
  ArrowLeft, Bookmark, CheckCircle2, Copy, Terminal, Lightbulb,
  AlertTriangle, GitBranch, Target, Dumbbell,
} from 'lucide-react'
import { learningApi } from '../api/client'
import { Panel } from '../components/Layout'
import { useToast } from '../components/Layout'
import type { KnowledgePoint } from '../types'

function CodeView({ code }: { code: string }) {
  const toast = useToast()
  return (
    <div className="relative">
      <button
        className="absolute right-2 top-2 z-10 rounded border border-ink-600/70 bg-ink-900/90 p-1.5 text-steel-400 transition hover:border-neon/50 hover:text-neon"
        onClick={() => { navigator.clipboard.writeText(code); toast('代码已复制到剪贴板', 'success') }}
        title="复制代码"
      >
        <Copy size={14} />
      </button>
      <Highlight theme={themes.vsDark} code={code.trim()} language="c">
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} code-block !bg-[#04100b] !p-4 !pr-12`} style={{ ...style, background: 'transparent' }}>
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
  )
}

function parseArr(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

export default function KnowledgeDetail() {
  const { kpId } = useParams()
  const toast = useToast()
  const [kp, setKp] = useState<KnowledgePoint | null>(null)

  const load = () => { if (kpId) learningApi.kp(kpId).then((r) => setKp(r.data)).catch((e) => toast(e.message, 'error')) }
  useEffect(load, [kpId])

  if (!kp) return <div className="panel p-8 text-xs text-steel-400">正在加载知识点...</div>

  const examples = parseArr(kp.examples_json)
  const errors = parseArr(kp.common_errors_json)
  const lines = parseArr(kp.line_explain_json)

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
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-steel-500">{kp.code}</span>
            <span className="tag">{kp.difficulty}</span>
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
          <Panel title="语法结构">
            <div className="code-block text-neon-soft">{kp.syntax_md}</div>
          </Panel>
          <Panel title="基础代码示例" action={<span className="text-xs text-steel-500">标准 C11</span>}>
            <div className="space-y-4">
              {examples.length ? examples.map((ex: any, i: number) => (
                <div key={i}>
                  <div className="mb-2 text-xs text-steel-400">{ex.title || `示例 ${i + 1}`}</div>
                  <CodeView code={typeof ex === 'string' ? ex : ex.code} />
                </div>
              )) : <CodeView code={''} />}
            </div>
          </Panel>
          {!!lines.length && (
            <Panel title="代码逐行解释">
              <div className="space-y-1.5">
                {lines.map((l: any, i: number) => (
                  <div key={i} className="flex gap-3 rounded border border-ink-700/50 bg-ink-900/40 px-3 py-1.5 text-xs">
                    <span className="font-mono text-xs text-neon-dim">{typeof l === 'string' ? i + 1 : l.line}</span>
                    <span className="text-steel-400">{typeof l === 'string' ? l : l.text}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
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
            <div className="space-y-3 text-xs leading-6 text-steel-400">
              <div className="flex gap-2"><Lightbulb size={14} className="mt-1 shrink-0 text-neon" />建议先阅读核心概念，再对照代码逐行理解执行过程。</div>
              <div className="flex gap-2"><Terminal size={14} className="mt-1 shrink-0 text-neon" />在线运行代码将在 M6 阶段接入隔离沙箱后开放。</div>
            </div>
          </Panel>
          <Panel title="知识标签">
            <div className="flex flex-wrap gap-2">
              <span className="tag-neon">难度 {kp.difficulty}</span>
              <span className="tag">预计 {kp.estimated_minutes} 分钟</span>
              <span className="tag">进度 {kp.progress_pct}%</span>
            </div>
          </Panel>
          <div className="grid grid-cols-3 gap-2">
            <div className="panel p-3 text-center"><GitBranch size={14} className="mx-auto mb-1 text-steel-500" /><div className="text-xs text-steel-500">关联知识</div><div className="text-xs text-text-primary">{parseArr(kp.related_kp_ids).length}</div></div>
            <div className="panel p-3 text-center"><Target size={14} className="mx-auto mb-1 text-steel-500" /><div className="text-xs text-steel-500">配套练习</div><div className="text-xs text-text-primary">题库</div></div>
            <div className="panel p-3 text-center"><Bookmark size={14} className="mx-auto mb-1 text-steel-500" /><div className="text-xs text-steel-500">状态</div><div className="text-xs text-text-primary">{kp.mastered ? '已掌握' : '学习中'}</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
