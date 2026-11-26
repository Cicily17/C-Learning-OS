/**
 * 代码逐行拆解面板。
 *
 * 与旧的「把源码按行原样列出」不同，这里每一行都由 codeAnalysis 静态推演出：
 * 这行在做什么 / 为什么这样写 / 运行后产生什么结果，并配一条可对照的运行轨迹、真实输出与易错点。
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import {
  AlertTriangle, ArrowRight, Braces, Copy, CornerDownRight, Cpu, Gauge,
  ListTree, MousePointerClick, ScanLine, ShieldCheck, Sparkles, Terminal, Workflow,
} from 'lucide-react'
import { analyzeCode, type LineInsight, type InsightTone } from '../lib/codeAnalysis'
import { CatAvatar, MascotMark } from './Brand'
import { useToast } from './Layout'

const TONE: Record<InsightTone, { label: string; color: string; chip: string }> = {
  pre: { label: '预处理', color: '#a78bfa', chip: 'border-ai/30 bg-ai/10 text-ai' },
  entry: { label: '程序入口', color: '#58eb04', chip: 'border-neon/30 bg-neon/10 text-neon' },
  declare: { label: '变量声明', color: '#38bdf8', chip: 'border-learn/30 bg-learn/10 text-learn' },
  io: { label: '输入输出', color: '#ffaa36', chip: 'border-challenge/30 bg-challenge/10 text-challenge' },
  flow: { label: '流程控制', color: '#2dd4bf', chip: 'border-progress/30 bg-progress/10 text-progress' },
  return: { label: '函数返回', color: '#58eb04', chip: 'border-neon/30 bg-neon/10 text-neon' },
  memory: { label: '内存管理', color: '#ff5b64', chip: 'border-danger/30 bg-danger/10 text-danger' },
  type: { label: '类型定义', color: '#a78bfa', chip: 'border-ai/30 bg-ai/10 text-ai' },
  shell: { label: '终端命令', color: '#94a3b8', chip: 'border-ink-600/60 bg-ink-800/60 text-steel-400' },
  comment: { label: '注释', color: '#64748b', chip: 'border-ink-600/50 bg-ink-900/60 text-steel-500' },
  block: { label: '代码块', color: '#64748b', chip: 'border-ink-600/50 bg-ink-900/60 text-steel-500' },
  call: { label: '函数调用', color: '#38bdf8', chip: 'border-learn/30 bg-learn/10 text-learn' },
}

const TRIVIAL: InsightTone[] = ['pre', 'comment', 'block']

type View = 'lines' | 'flow' | 'pitfalls'

export type CodeSample = { title?: string; code: string }

export function CodeBreakdown({
  samples, name,
}: {
  samples: CodeSample[]
  name: string
}) {
  const toast = useToast()
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState<View>('lines')
  const [focusOnly, setFocusOnly] = useState(false)
  const [active, setActive] = useState<number | null>(null)

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const sample = samples[Math.min(idx, samples.length - 1)] || { code: '' }
  const code = sample.code || ''
  const analysis = useMemo(() => analyzeCode(code, { name }), [code, name])

  const byNo = useMemo(() => {
    const m = new Map<number, LineInsight>()
    analysis.lines.forEach((l) => m.set(l.no, l))
    return m
  }, [analysis])

  const isKey = (l: LineInsight) => !TRIVIAL.includes(l.tone)
  const shownLines = focusOnly ? analysis.lines.filter(isKey) : analysis.lines
  const usedTones = useMemo(() => {
    const set = new Set<InsightTone>()
    analysis.lines.forEach((l) => set.add(l.tone))
    return [...set]
  }, [analysis])

  const focusLine = (no: number) => {
    setActive(no)
    cardRefs.current.get(no)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const focusCard = (no: number) => {
    setActive(no)
    rowRefs.current.get(no)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const copyDigest = () => {
    const text = [
      `# ${name} · 代码逐行拆解`,
      analysis.purpose,
      '',
      ...analysis.lines.map((l) => [
        `L${l.no}  ${l.code.trim()}`,
        `   ▸ ${l.title}`,
        l.detail ? `   ${l.detail}` : '',
        ...l.notes.map((n) => `   · ${n}`),
      ].filter(Boolean).join('\n')),
      '',
      `预期输出：${analysis.output ?? '（无确定输出）'}`,
      `易错点：${analysis.pitfalls.length ? '' : '未检测到典型易错写法'}`,
      ...analysis.pitfalls.map((p) => `  - ${p}`),
    ].join('\n')
    navigator.clipboard?.writeText(text)
    toast('逐行讲解已复制为笔记', 'success')
  }

  const stats = [
    { label: '代码行', value: analysis.stats.codeLines, icon: Braces },
    { label: '语句', value: analysis.stats.statements, icon: Cpu },
    { label: '函数', value: analysis.stats.functions, icon: Workflow },
    { label: '讲解', value: analysis.lines.length, icon: ListTree },
  ]

  const tabs: { key: View; label: string; badge: number; icon: typeof ScanLine }[] = [
    { key: 'lines', label: '逐行讲解', badge: analysis.lines.length, icon: ScanLine },
    { key: 'flow', label: '运行轨迹', badge: analysis.flow.length, icon: Workflow },
    { key: 'pitfalls', label: '易错点', badge: analysis.pitfalls.length, icon: AlertTriangle },
  ]

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="panel-title">代码逐行拆解</h2>
          <span className="panel-hint">逐行讲解 · 运行推演 · 易错点</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-ink-700/70 bg-ink-950/60 p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition ${
                  view === t.key
                    ? 'bg-neon/10 text-neon'
                    : 'text-steel-400 hover:bg-ink-800/70 hover:text-text-primary'
                }`}
                style={view === t.key ? { boxShadow: 'inset 0 0 0 1px rgba(88,235,4,0.34)' } : undefined}
              >
                <t.icon size={12} />
                {t.label}
                <span className="font-mono text-[10px] opacity-60">{t.badge}</span>
              </button>
            ))}
          </div>
          <button
            onClick={copyDigest}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-600/70 bg-ink-800/40 px-2.5 py-1.5 text-xs text-steel-400 transition hover:border-neon/45 hover:text-neon"
            title="把逐行讲解复制为可保存的学习笔记"
          >
            <Copy size={12} /> 复制讲解
          </button>
        </div>
      </div>

      {/* 概览：一句话结论 + 结构统计 */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-700/60 px-5 py-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-steel-500">
            <ScanLine size={12} className="text-neon" /> STATIC ANALYSIS · 本地静态推演，不依赖大模型
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{analysis.purpose}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {analysis.constructs.length ? analysis.constructs.map((c) => (
              <span key={c} className="tag-neon">{c}</span>
            )) : <span className="tag-muted">基础语法</span>}
            <span className="tag"><Terminal size={11} className="mr-1" />{analysis.entry}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[58px] rounded-lg border border-ink-700/60 bg-ink-950/50 px-2.5 py-2 text-center">
              <div className="font-mono text-lg font-semibold leading-none text-text-primary">{s.value}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-steel-500">
                <s.icon size={9} className="text-steel-600" />{s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {samples.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-700/60 px-5 py-2.5">
          <span className="text-[11px] text-steel-500">分析对象</span>
          {samples.map((s, i) => (
            <button
              key={i}
              onClick={() => { setIdx(i); setActive(null) }}
              className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] transition ${
                i === idx ? 'border-learn/45 bg-learn/10 text-learn' : 'border-ink-700/60 text-steel-400 hover:border-learn/30 hover:text-learn'
              }`}
            >
              {s.title || `示例 ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {view === 'lines' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 bg-ink-950/30 px-4 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-steel-500">
              <MousePointerClick size={12} className="text-neon/70" />
              点击左侧任意一行代码，右侧会定位到对应讲解；点讲解卡片也能跳回代码。
            </span>
            <button
              onClick={() => setFocusOnly((v) => !v)}
              className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] transition ${
                focusOnly ? 'border-neon/45 bg-neon/10 text-neon' : 'border-ink-700/60 text-steel-400 hover:border-neon/40 hover:text-neon'
              }`}
            >
              只看关键行
            </button>
          </div>

          <div className="analyzer-shell m-4 grid lg:grid-cols-[minmax(0,45%)_minmax(0,1fr)]">
            {/* 代码区 */}
            <div className="flex min-h-0 flex-col border-b border-ink-700/60 p-3 lg:border-b-0 lg:border-r">
              <div className="code-pane max-h-[520px] rounded-xl border border-ink-700/70">
                <Highlight theme={themes.vsDark} code={code.replace(/\s+$/, '')} language="c">
                  {({ tokens, getTokenProps }) => (
                    <div className="py-2">
                      {tokens.map((line, i) => {
                        const no = i + 1
                        const ins = byNo.get(no)
                        const dim = focusOnly && (!ins || !isKey(ins))
                        return (
                          <div
                            key={i}
                            ref={(el) => { if (el) rowRefs.current.set(no, el); else rowRefs.current.delete(no) }}
                            className="code-row"
                            data-active={active === no}
                            data-dim={dim}
                            role={ins ? 'button' : undefined}
                            tabIndex={ins ? 0 : undefined}
                            onClick={() => ins && focusLine(no)}
                            onKeyDown={(e) => {
                              if (ins && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusLine(no) }
                            }}
                          >
                            <span className="code-no">{no}</span>
                            <span className="code-tone" style={{ background: ins ? TONE[ins.tone].color : 'transparent' }} />
                            <span className="code-text">
                              {line.length === 0
                                ? '\u00a0'
                                : line.map((token, j) => <span key={j} {...getTokenProps({ token })} />)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Highlight>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                <span className="font-mono text-[10px] tracking-[0.14em] text-steel-600">LEGEND</span>
                {usedTones.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] text-steel-500">
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TONE[t].color }} />
                    {TONE[t].label}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10px] text-steel-600">{analysis.lines.length} / {analysis.stats.codeLines} 行已解析</span>
              </div>

              {/* 左侧紧凑输出预览：看代码的同时就能看到它会打印什么 */}
              <div className="mt-3 flex min-h-[110px] flex-1 flex-col rounded-xl border border-ink-700/60 bg-[#04100b] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-steel-500">
                  <Terminal size={10} className="text-neon/70" /> 预期输出 · STDOUT
                </div>
                <pre className="mt-1 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-neon-soft/85">
                  {analysis.output ?? '（这段代码没有产生可静态确定的输出）'}
                </pre>
              </div>
            </div>

            {/* 讲解区 */}
            <div className="max-h-[620px] overflow-y-auto bg-[#0a1017]/60 p-3">
              {shownLines.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <CatAvatar size={40} />
                  <p className="text-xs text-steel-500">没有可提取的代码行</p>
                </div>
              )}
              <div className="space-y-2">
                {shownLines.map((l) => {
                  const meta = TONE[l.tone]
                  return (
                    <div
                      key={l.no}
                      ref={(el) => { if (el) cardRefs.current.set(l.no, el); else cardRefs.current.delete(l.no) }}
                      className="insight-card"
                      data-active={active === l.no}
                      onClick={() => focusCard(l.no)}
                    >
                      <span className="insight-bar" style={{ background: meta.color }} />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] ${meta.chip}`}>
                          {meta.label}
                        </span>
                        <span className="font-mono text-[10px] text-steel-500">L{l.no}</span>
                        <span className="min-w-0 flex-1 text-xs font-medium leading-5 text-text-primary">{l.title}</span>
                      </div>
                      {l.detail && (
                        <p className="mt-1.5 text-xs leading-6 text-steel-400">{l.detail}</p>
                      )}
                      {!!l.notes.length && (
                        <ul className="mt-1 space-y-0.5">
                          {l.notes.map((n, i) => (
                            <li key={i} className="flex gap-1.5 text-[11px] leading-5 text-steel-500">
                              <CornerDownRight size={10} className="mt-1 shrink-0 text-steel-600" />
                              <span className="min-w-0">{n}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'flow' && (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <SubHead icon={<Workflow size={12} />} title="执行轨迹" en="STEP TRACE" hint={`${analysis.flow.length} 步`} />
            {analysis.flow.length ? (
              <ol className="mt-3">
                {analysis.flow.map((f, i) => (
                  <li key={`${f.no}-${i}`} className="flow-node relative flex gap-3 pb-3">
                    <span className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border border-neon/40 bg-[#0b1319] font-mono text-[10px] text-neon">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs leading-5 text-steel-300">{f.text}</div>
                      <button
                        onClick={() => { setView('lines'); setActive(f.no); window.setTimeout(() => focusLine(f.no), 60) }}
                        className="font-mono text-[10px] text-steel-600 transition hover:text-neon"
                      >
                        L{f.no} · 查看讲解
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-xs leading-6 text-steel-500">这段代码没有可追踪的执行步骤，可能只是宏定义或类型声明。</p>
            )}

            <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-950/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-steel-500">
                <Gauge size={12} className="text-learn" /> 执行环境
              </div>
              <div className="mt-1.5 space-y-1 text-[11px] leading-5 text-steel-400">
                <div>入口：<span className="font-mono text-steel-300">{analysis.entry}</span></div>
                <div>标准：<span className="font-mono text-steel-300">C11 · gcc 13 · -Wall</span></div>
                <div>规模：<span className="font-mono text-steel-300">{analysis.stats.codeLines} 行 / {analysis.stats.statements} 条语句 / {analysis.stats.functions} 个函数</span></div>
              </div>
            </div>
          </div>

          <div>
            <SubHead icon={<Terminal size={12} />} title="实际输出" en="STDOUT" hint={analysis.output ? '可由静态推演确定' : '依赖运行时输入'} />
            <div className="term-window mt-3">
              <div className="term-head">
                <span className="term-dot" style={{ background: 'rgba(255,91,100,0.7)' }} />
                <span className="term-dot" style={{ background: 'rgba(255,170,54,0.7)' }} />
                <span className="term-dot" style={{ background: 'rgba(88,235,4,0.7)' }} />
                <span className="ml-2 truncate font-mono text-[10px] text-steel-500">bash — gcc main.c -std=c11 -o a.out &amp;&amp; ./a.out</span>
              </div>
              <div className="term-body">
                {analysis.output ? (
                  <>
                    {analysis.output}
                    <span className="term-cursor" />
                  </>
                ) : (
                  <span className="text-steel-500">
                    这段代码没有产生可静态确定的输出：可能依赖 <span className="font-mono text-challenge">scanf / fgets</span> 的输入，
                    或只做了计算与内存操作。可以在「AI 助手 · 代码实验室」里填标准输入实际跑一遍。
                  </span>
                )}
              </div>
            </div>

            {!!analysis.outputsPreview.length && (
              <div className="mt-3 space-y-1.5">
                {analysis.outputsPreview.map((o, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-ink-700/60 bg-ink-950/40 px-2.5 py-1.5">
                    <ArrowRight size={11} className="mt-1 shrink-0 text-neon/60" />
                    <span className="text-[11px] leading-5 text-steel-400">{o}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-neon/20 bg-neon/[0.04] px-3 py-2">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-neon/80" />
              <p className="text-[11px] leading-5 text-steel-400">
                输出由逐行求值推演得到，遇到无法确定的输入（如 <span className="font-mono">scanf</span>）时会明确标注，而不是编造结果。
              </p>
            </div>
          </div>
        </div>
      )}

      {view === 'pitfalls' && (
        <div className="p-5">
          <SubHead icon={<AlertTriangle size={12} />} title="易错点与改进建议" en="PITFALLS" hint={`${analysis.pitfalls.length} 条`} />
          {analysis.pitfalls.length ? (
            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              {analysis.pitfalls.map((p, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-challenge/25 bg-challenge/[0.05] p-3.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-challenge/35 bg-challenge/10 font-mono text-[11px] text-challenge">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-xs leading-6 text-steel-300">{p}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-4 rounded-xl border border-neon/20 bg-neon/[0.04] p-4">
              <MascotMark size={54} />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-neon">
                  <Sparkles size={13} /> 这段示例写法规范
                </div>
                <p className="mt-1 text-[11px] leading-6 text-steel-400">
                  没有检测到缓冲区溢出、未判空指针、格式串与参数不匹配等典型问题。重点看变量如何变化即可。
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-950/40 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-steel-500">
              <CatAvatar size={18} /> 编译猫的读码建议
            </div>
            <ul className="mt-2 space-y-1 text-[11px] leading-6 text-steel-400">
              <li>· 先只看 <span className="text-neon">入口 / 声明 / 输出</span> 三类行，把数据流串起来，再抠细节。</li>
              <li>· 遇到指针或数组，问自己三个问题：指向哪、多长、谁负责释放。</li>
              <li>· 能预判输出后再点开「实际输出」核对，比直接看答案记得牢。</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function SubHead({ icon, title, en, hint }: { icon: ReactNode; title: string; en: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span className="text-neon">{icon}</span>{title}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-600">{en}</span>
      {hint && <span className="ml-auto font-mono text-[10px] text-steel-500">{hint}</span>}
    </div>
  )
}
