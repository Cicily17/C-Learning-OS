import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Award, Check, ChevronRight, Flag, Flame, Lock, ShieldCheck, Sparkles, Star,
  Target, Trophy, Zap,
} from 'lucide-react'
import { Heading } from '@astryxdesign/core/Heading'
import { Button } from '@astryxdesign/core/Button'
import { gameApi } from '../api/client'
import { EmptyState, PageHeader, Panel, ProgressBar, useToast } from '../components/Layout'
import type { GameChapter, GameLevel } from '../types'

/* ---------- 地图几何 ---------- */

// 4 列 × 3 行蛇形路径：底部向右 → 右侧上行 → 中部向左 → 左侧上行 → 顶部向右
const NODES = [
  { x: 120, y: 470 }, { x: 360, y: 470 }, { x: 600, y: 470 }, { x: 840, y: 470 },
  { x: 840, y: 310 }, { x: 600, y: 310 }, { x: 360, y: 310 }, { x: 120, y: 310 },
  { x: 120, y: 150 }, { x: 360, y: 150 }, { x: 600, y: 150 }, { x: 840, y: 150 },
]

const NODE_STATE: Record<string, { stroke: string; fill: string; text: string; label: string; soft: string }> = {
  passed: { stroke: '#FFB340', fill: 'rgba(255,179,64,0.13)', text: '#FFD79A', label: '#D8B27A', soft: 'rgba(255,179,64,0.18)' },
  open: { stroke: '#58EB04', fill: 'rgba(88,235,4,0.11)', text: '#C6FF9B', label: '#D9FFC2', soft: 'rgba(88,235,4,0.18)' },
  locked: { stroke: '#33445A', fill: 'rgba(23,32,42,0.88)', text: '#7C8FA3', label: '#74879B', soft: 'rgba(51,68,90,0.12)' },
}

const hexPoints = (r: number) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30)
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
}).join(' ')

const ACH_ICON: Record<string, any> = { target: Target, star: Star, zap: Zap, award: Award, flame: Flame, flag: Flag }

const CITY = Array.from({ length: 32 }, (_, i) => {
  const w = 18 + ((i * 7) % 14)
  return { x: i * 30, w, h: 9 + ((i * 13) % 26), antenna: i % 5 === 0 }
})

/* ---------- 页面 ---------- */

export default function GameMap() {
  const navigate = useNavigate()
  const toast = useToast()
  const [map, setMap] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [selectedId, setSelectedId] = useState('')
  const [busyChapter, setBusyChapter] = useState('')

  const load = () => {
    gameApi.map().then((r) => setMap(r.data)).catch((e) => toast(e.message, 'error'))
    gameApi.profile().then((r) => setProfile(r.data)).catch((e) => toast(e.message, 'error'))
  }
  useEffect(load, [])

  const chapters: GameChapter[] = map?.chapters || []
  const currentChapter = useMemo(
    () => chapters.find((c) => c.unlocked && !c.challenge_passed) || chapters[0],
    [chapters],
  )
  const selected = chapters.find((c) => c.id === selectedId) || currentChapter
  const selectedIndex = selected ? chapters.findIndex((c) => c.id === selected.id) : -1
  const currentIndex = currentChapter ? chapters.findIndex((c) => c.id === currentChapter.id) : -1

  const startChallenge = async (chapter: GameChapter) => {
    setBusyChapter(chapter.id)
    try {
      const r = await gameApi.startChallenge(chapter.id)
      toast(`${chapter.name}挑战开始：${r.data.question_count} 题，${r.data.pass_line}`, 'success')
      navigate(`/practice/session/${r.data.session_id}`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusyChapter('') }
  }

  if (!map || !profile) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-ink-800/70" />
        <div className="h-[520px] animate-pulse rounded-2xl border border-ink-700/50 bg-ink-850/40" />
      </div>
    )
  }

  const level = map.level
  const unlockedAchievements = profile.achievements?.filter((a: any) => a.unlocked) || []
  const passed = map.total_passed_challenges || 0

  // 已走过路径（用于流光动画）
  const traveledD = chapters.slice(0, Math.max(0, currentIndex + 1)).map((_: any, i: number) => {
    const p = NODES[i]
    return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`
  }).join(' ')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="SECTOR MAP // 闯关地图"
        title="C 语言学习地图"
        description="每个六边形是一个章节关卡。完成章节内的知识点，再通过章节挑战，即可点亮下一座区域。所有解锁状态由真实作答与学习记录计算。"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag-challenge"><Trophy size={12} className="mr-1" /> 已通关 {passed}/{chapters.length}</span>
            <span className="tag-neon"><Zap size={12} className="mr-1" /> {level.exp} EXP</span>
            <span className="tag"><Flame size={12} className="mr-1" /> 连续 {profile.streak_days} 天</span>
          </div>
        }
        actions={
          <Button label="返回工作台" variant="ghost" icon={<ChevronRight size={15} className="rotate-180" />}
            onClick={() => navigate('/')} />
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="map-shell corner-frame">
            <div className="overflow-x-auto">
              <svg viewBox="0 0 960 590" className="map-canvas min-w-[760px]" role="img" aria-label="C 语言章节闯关地图">
                <defs>
                  <linearGradient id="mapBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0b141c" />
                    <stop offset="52%" stopColor="#0a1118" />
                    <stop offset="100%" stopColor="#070c11" />
                  </linearGradient>
                  <linearGradient id="amberGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFB340" />
                    <stop offset="100%" stopColor="#FF7A3C" />
                  </linearGradient>
                  <linearGradient id="limeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#58EB04" />
                    <stop offset="100%" stopColor="#2DD4BF" />
                  </linearGradient>
                  <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,170,54,0.20)" />
                    <stop offset="60%" stopColor="rgba(255,170,54,0.05)" />
                    <stop offset="100%" stopColor="rgba(255,170,54,0)" />
                  </radialGradient>
                  <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(88,235,4,0.12)" />
                    <stop offset="100%" stopColor="rgba(88,235,4,0)" />
                  </radialGradient>
                  <filter id="pathGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <pattern id="mapGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M32 0H0V32" fill="none" stroke="rgba(56,189,248,0.075)" strokeWidth="1" />
                  </pattern>
                  <pattern id="mapDot" width="8" height="8" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.7" fill="rgba(148,163,184,0.12)" />
                  </pattern>
                  <mask id="mapFade">
                    <rect width="960" height="590" fill="url(#fadeGrad)" />
                  </mask>
                  <radialGradient id="fadeGrad" cx="50%" cy="48%" r="66%">
                    <stop offset="0%" stopColor="white" />
                    <stop offset="72%" stopColor="rgba(255,255,255,0.55)" />
                    <stop offset="100%" stopColor="black" />
                  </radialGradient>
                </defs>

                {/* 底色与网格 */}
                <rect width="960" height="590" fill="url(#mapBg)" />
                <rect width="960" height="590" fill="url(#mapDot)" />
                <rect width="960" height="590" fill="url(#mapGrid)" mask="url(#mapFade)" opacity="0.9" />

                {/* 中央雷达光晕与 C 标识 */}
                <circle cx="480" cy="305" r="172" fill="url(#centerGlow)" />
                <circle cx="480" cy="305" r="128" fill="none" stroke="rgba(88,235,4,0.10)" strokeWidth="1" strokeDasharray="2 8" />
                <circle cx="480" cy="305" r="96" fill="none" stroke="rgba(56,189,248,0.09)" strokeWidth="1" />
                <g transform="translate(480,305)" opacity="0.75">
                  <polygon points={hexPoints(30)} fill="rgba(8,13,18,0.9)" stroke="rgba(88,235,4,0.22)" strokeWidth="1.2" />
                  <text textAnchor="middle" y="8" fontFamily="'JetBrains Mono', monospace" fontSize="24" fontWeight="700" fill="rgba(88,235,4,0.32)">C</text>
                  <text textAnchor="middle" y="49" fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="3" fill="rgba(148,163,184,0.4)">CORE</text>
                </g>

                {/* 顶部区域标识 */}
                <g fontFamily="'JetBrains Mono', monospace" fill="#4B5B6D">
                  <text x="42" y="44" fontSize="10" letterSpacing="3">SECTOR 01 // C LANGUAGE</text>
                  <text x="42" y="60" fontSize="9" letterSpacing="1.5" fill="#344455">NEON CAMPUS · 2026</text>
                  <text x="918" y="44" fontSize="10" letterSpacing="3" textAnchor="end">12 CHAPTERS</text>
                  <text x="918" y="60" fontSize="9" letterSpacing="1.5" textAnchor="end" fill="#344455">75 NODES / C11</text>
                </g>
                <path d="M42,72H170" stroke="rgba(88,235,4,0.28)" strokeWidth="1" />
                <path d="M790,72H918" stroke="rgba(56,189,248,0.22)" strokeWidth="1" />

                {/* 装饰电路 */}
                <g fill="none" stroke="rgba(56,189,248,0.16)" strokeWidth="1">
                  <path d="M60,110H180L210,140H300" />
                  <path d="M60,122H168L196,150" stroke="rgba(56,189,248,0.08)" />
                  <circle cx="300" cy="140" r="2.5" fill="rgba(56,189,248,0.35)" stroke="none" />
                  <path d="M900,420V360L870,330" />
                  <circle cx="900" cy="420" r="2.5" fill="rgba(56,189,248,0.35)" stroke="none" />
                  <path d="M700,520H820L850,490" />
                  <circle cx="850" cy="490" r="2.5" fill="rgba(56,189,248,0.3)" stroke="none" />
                </g>
                <g fill="rgba(88,235,4,0.22)">
                  <rect x="58" y="108" width="4" height="4" />
                  <rect x="296" y="136" width="4" height="4" />
                  <rect x="846" y="486" width="4" height="4" />
                </g>

                {/* 城市天际线 */}
                <g opacity="0.9">
                  <rect x="0" y="552" width="960" height="38" fill="url(#mapBg)" />
                  <path d="M0,566H960" stroke="rgba(88,235,4,0.10)" strokeWidth="1" />
                  {CITY.map((b, i) => (
                    <g key={i}>
                      <rect x={b.x} y={590 - b.h} width={b.w} height={b.h} fill="#0d1821" stroke="rgba(56,189,248,0.13)" strokeWidth="0.8" />
                      {b.antenna && <path d={`M${b.x + b.w / 2},${590 - b.h}V${590 - b.h - 8}`} stroke="rgba(255,170,54,0.22)" strokeWidth="1" />}
                      {b.h > 20 && (
                        <g fill="rgba(88,235,4,0.22)">
                          <rect x={b.x + 4} y={590 - b.h + 5} width="2" height="2" />
                          <rect x={b.x + 10} y={590 - b.h + 10} width="2" height="2" />
                        </g>
                      )}
                    </g>
                  ))}
                </g>

                {/* 路径底层 */}
                <path
                  d={NODES.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="#16212C" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round"
                />
                <path
                  d={NODES.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="rgba(56,189,248,0.10)" strokeWidth="1" strokeDasharray="2 10"
                />

                {/* 分段路径：已通关 / 当前 / 锁定 */}
                {NODES.slice(0, -1).map((p, i) => {
                  const ch = chapters[i]
                  if (!ch) return null
                  const next = NODES[i + 1]
                  const d = `M${p.x},${p.y} L${next.x},${next.y}`
                  const state = ch.challenge_passed ? 'passed' : ch.unlocked ? 'open' : 'locked'
                  const s = NODE_STATE[state]
                  return (
                    <g key={`seg-${i}`}>
                      {state === 'passed' && (
                        <path d={d} fill="none" stroke="url(#amberGrad)" strokeWidth="7" opacity="0.20" filter="url(#pathGlow)" strokeLinecap="round" />
                      )}
                      <path d={d} fill="none" stroke={state === 'locked' ? '#23313F' : s.stroke}
                        strokeWidth={state === 'locked' ? 2 : 3}
                        strokeDasharray={state === 'open' ? '4 9' : undefined}
                        strokeLinecap="round" opacity={state === 'locked' ? 0.9 : 0.95}
                        className={state === 'open' ? 'map-dash' : undefined} />
                    </g>
                  )
                })}

                {/* 已走过的路径：静态微光，避免滤镜动画在合成层留下拖影 */}
                {traveledD.includes('L') && (
                  <path d={traveledD} fill="none" stroke="rgba(88,235,4,0.30)" strokeWidth="9"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
                )}

                {/* 章节节点 */}
                {chapters.map((ch, i) => {
                  const p = NODES[i]
                  if (!p) return null
                  const state = ch.challenge_passed ? 'passed' : ch.unlocked ? 'open' : 'locked'
                  const s = NODE_STATE[state]
                  const isCurrent = currentChapter?.id === ch.id
                  const isSelected = selected?.id === ch.id
                  return (
                    <g key={ch.id}>
                      <g
                        className="map-node"
                        transform={`translate(${p.x},${p.y})`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${ch.name}，${state === 'passed' ? '已通关' : ch.unlocked ? '进行中' : '未解锁'}`}
                        onClick={() => setSelectedId(ch.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(ch.id) }
                        }}
                      >
                        {isCurrent && (
                          <polygon points={hexPoints(44)} fill="none" stroke="#58EB04" strokeWidth="1" opacity="0.5" className="map-pulse" />
                        )}
                        <polygon points={hexPoints(38)} fill="none" stroke={s.stroke} strokeWidth="1" opacity={isSelected ? 0.45 : 0.16} />
                        <g className="node-body">
                          <polygon points={hexPoints(31)} fill={s.fill} stroke={s.stroke} strokeWidth={isSelected ? 2.4 : 1.7}
                            filter={isCurrent ? 'url(#nodeGlow)' : undefined} />
                          <polygon points={hexPoints(24)} fill="rgba(8,13,18,0.72)" stroke={s.stroke} strokeWidth="0.8" opacity="0.7" />
                          <text textAnchor="middle" y="6" fontFamily="'JetBrains Mono', monospace"
                            fontSize="15" fontWeight="700" fill={s.text}>
                            {String(i + 1).padStart(2, '0')}
                          </text>
                        </g>
                        <polygon points={hexPoints(40)} fill="none" stroke="#E8EDF4" strokeWidth="1.2"
                          strokeDasharray="3 5" className="node-focus" />
                        {isSelected && (
                          <polygon points={hexPoints(40)} fill="none" stroke="#E8EDF4" strokeWidth="1"
                            strokeDasharray="3 6" opacity="0.55" />
                        )}
                        {state === 'passed' && (
                          <g transform="translate(22,-23)">
                            <circle r="7.5" fill="#0b1017" stroke="#FFB340" strokeWidth="1.2" />
                            <path d="M-3,0 L-0.6,2.6 L3.4,-2.4" fill="none" stroke="#FFB340" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                        )}
                        {state === 'locked' && (
                          <g transform="translate(22,-23)">
                            <circle r="7.5" fill="#0b1017" stroke="#3A4B5F" strokeWidth="1.2" />
                            <rect x="-3" y="-1" width="6" height="5" rx="1" fill="none" stroke="#5E7085" strokeWidth="1" />
                            <path d="M-1.8,-1V-2.6A1.8,1.8 0 0 1 1.8,-2.6V-1" fill="none" stroke="#5E7085" strokeWidth="1" />
                          </g>
                        )}
                        {isCurrent && (
                          <g transform="translate(0,-48)">
                            <rect x="-31" y="-10" width="62" height="19" rx="4" fill="#08110A" stroke="rgba(88,235,4,0.45)" strokeWidth="1" />
                            <text textAnchor="middle" y="3.5" fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.6" fill="#8CF05A">CURRENT</text>
                          </g>
                        )}
                      </g>

                      <text x={p.x} y={p.y + 57} textAnchor="middle"
                        className="node-label"
                        fontFamily="Inter, 'Microsoft YaHei', sans-serif" fontSize="15"
                        fontWeight={isSelected ? 700 : 500}
                        fill={isSelected ? '#F4F8FC' : s.label}>
                        {ch.name}
                      </text>
                      <text x={p.x} y={p.y + 76} textAnchor="middle"
                        fontFamily="'JetBrains Mono', monospace" fontSize="10" letterSpacing="0.8"
                        fill={state === 'passed' ? 'rgba(255,179,64,0.62)' : 'rgba(100,116,139,0.78)'}>
                        {ch.code} · {ch.completed_kps}/{ch.total_kps} KP
                      </text>
                    </g>
                  )
                })}

                {/* 边角定位标记 */}
                <g stroke="rgba(88,235,4,0.5)" strokeWidth="1" fill="none">
                  <path d="M18,36V18H36" />
                  <path d="M924,554V572H942" />
                </g>
              </svg>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-5 hidden font-mono text-[10px] tracking-[0.18em] text-steel-600 sm:block">
              CLICK A HEX NODE TO INSPECT
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div className="map-legend">
              <span><i style={{ background: '#FFB340' }} />已通关</span>
              <span><i style={{ background: '#58EB04' }} />当前 / 已解锁</span>
              <span><i style={{ background: '#33445A' }} />未解锁</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-neon" /> 解锁由上一章挑战结果决定</span>
              <span>章节挑战：10 题 · 正确率 ≥ 70% 通关</span>
            </div>
          </div>

          {/* 成就徽章：紧凑条带 */}
          <Panel title="成就徽章" hint={`${unlockedAchievements.length}/${profile.achievements.length} 已解锁`}
            action={<Sparkles size={15} className="text-ai" />} className="mt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {profile.achievements.map((a: any) => {
                const Icon = ACH_ICON[a.icon] || Award
                return (
                  <div key={a.code} title={a.description}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                      a.unlocked ? 'border-ai/25 bg-ai/[0.06]' : 'border-ink-700/50 bg-ink-900/30 opacity-55'
                    }`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                      a.unlocked ? 'border-ai/35 bg-ai/10 text-ai' : 'border-ink-600/60 text-steel-500'
                    }`}>
                      {a.unlocked ? <Icon size={15} /> : <Lock size={13} />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-text-primary">{a.name}</div>
                      <div className="truncate text-[11px] text-steel-500">{a.unlocked ? `已解锁 · +${a.exp_reward} EXP` : a.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>

        {/* 右侧章节简报 */}
        <aside className="space-y-4">
          {selected ? (
            <section className="panel overflow-hidden">
              <div className="relative border-b border-ink-700/60 p-5">
                <div className="pointer-events-none absolute right-4 top-3 font-mono text-5xl font-bold leading-none text-neon/[0.06]">
                  {String(selectedIndex + 1).padStart(2, '0')}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${
                    selected.challenge_passed ? 'border-challenge/35 bg-challenge/10 text-challenge'
                    : selected.unlocked ? 'border-neon/35 bg-neon/10 text-neon'
                    : 'border-ink-600/60 bg-ink-900/60 text-steel-500'
                  }`}>
                    {selected.challenge_passed ? <Check size={11} /> : selected.unlocked ? <Target size={11} /> : <Lock size={11} />}
                    {selected.challenge_passed ? '挑战已通过' : selected.unlocked ? '进行中' : '未解锁'}
                  </span>
                  <span className="font-mono text-[11px] text-steel-500">{selected.code}</span>
                </div>
                <Heading level={2} className="mt-3 text-xl">{selected.name}</Heading>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-steel-400">{selected.description || '本章围绕 C 语言核心概念展开，完成知识点后进行章节挑战。'}</p>
              </div>

              <div className="grid grid-cols-3 divide-x divide-ink-700/50 border-b border-ink-700/50">
                <div className="px-3 py-3 text-center">
                  <div className="font-mono text-xl font-semibold text-neon">{selected.completed_kps}<span className="text-sm text-steel-500">/{selected.total_kps}</span></div>
                  <div className="mt-1 text-[11px] text-steel-500">已完成知识点</div>
                </div>
                <div className="px-3 py-3 text-center">
                  <div className="font-mono text-xl font-semibold text-learn">{selected.mastered_kps}</div>
                  <div className="mt-1 text-[11px] text-steel-500">已精通</div>
                </div>
                <div className="px-3 py-3 text-center">
                  <div className="font-mono text-xl font-semibold text-challenge">{selected.progress_pct}%</div>
                  <div className="mt-1 text-[11px] text-steel-500">章节进度</div>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-steel-400">关卡节点</span>
                  <span className="font-mono text-steel-500">{selected.completed_kps}/{selected.total_kps}</span>
                </div>
                <ProgressBar value={selected.progress_pct} tone={selected.challenge_passed ? 'warning' : 'accent'} />

                <div className="mt-4 max-h-[268px] space-y-1 overflow-y-auto pr-1">
                  {selected.levels.map((lv: GameLevel, i: number) => {
                    const done = lv.status === 'completed' || lv.status === 'mastered'
                    const active = lv.status === 'in_progress'
                    return (
                      <button key={lv.kp_id}
                        disabled={!lv.unlocked}
                        onClick={() => navigate(`/learning/${selected.id}/${lv.kp_id}`)}
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
                          lv.unlocked
                            ? 'border-transparent hover:border-ink-600/70 hover:bg-ink-800/50'
                            : 'cursor-not-allowed border-transparent opacity-45'
                        }`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-mono ${
                          done ? 'border-challenge/40 bg-challenge/10 text-challenge'
                          : active ? 'border-neon/40 bg-neon/10 text-neon'
                          : lv.unlocked ? 'border-ink-600/70 text-steel-400' : 'border-ink-700 text-steel-600'
                        }`}>
                          {done ? <Check size={11} /> : lv.unlocked ? String(i + 1).padStart(2, '0') : <Lock size={10} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${done ? 'text-text-primary' : 'text-steel-300'}`}>{lv.name}</span>
                          <span className="font-mono text-[10px] text-steel-600">{lv.code} · {lv.progress_pct}%</span>
                        </span>
                        {lv.unlocked && <ChevronRight size={13} className="shrink-0 text-steel-600" />}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-5 border-t border-ink-700/50 pt-4">
                  {selected.challenge_available ? (
                    <Button label={busyChapter === selected.id ? '正在生成挑战...' : '开始章节挑战'}
                      variant="primary" width="100%" size="lg" icon={<Flag size={15} />}
                      isLoading={busyChapter === selected.id}
                      onClick={() => startChallenge(selected)} />
                  ) : selected.challenge_passed ? (
                    <Button label="复习本章知识点" variant="secondary" width="100%"
                      icon={<Check size={15} />}
                      onClick={() => selected.levels[0] && navigate(`/learning/${selected.id}/${selected.levels[0].kp_id}`)} />
                  ) : (
                    <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 px-3 py-3 text-center text-xs leading-5 text-steel-500">
                      <Lock size={13} className="mr-1 inline" />
                      先通过上一章挑战，才能进入本章
                    </div>
                  )}
                  {selected.challenge_available && (
                    <div className="mt-2 text-center text-[11px] text-steel-500">通关条件：10 题 · 正确率 ≥ 70%</div>
                  )}
                  {selected.challenge_passed && (
                    <div className="mt-2 text-center text-[11px] text-challenge/80">本章已通关，挑战成绩已计入档案</div>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <Panel title="章节简报"><EmptyState text="选择地图上的章节节点" hint="点击六边形查看详情" /></Panel>
          )}

          <div className="rounded-xl border border-ink-700/60 bg-ink-900/35 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-neon"><Zap size={12} /> 奖励规则</div>
            <div className="space-y-1.5 text-xs leading-5 text-steel-500">
              <p>知识点掌握 <span className="text-neon">+10 EXP</span>，章节挑战通过 <span className="text-challenge">+30 EXP</span>，考试 90 分以上 <span className="text-challenge">+40 EXP</span>。</p>
              <p>经验值与解锁状态只由真实作答和学习记录产生，删除练习记录不会重置已获得的地图进度。</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
