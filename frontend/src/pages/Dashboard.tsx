import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as echarts from 'echarts'
import {
  Activity, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, ClipboardList,
  Clock3, Dumbbell, Flame, Gamepad2, Lock, Play, Sparkles, Target, TrendingUp, Zap,
} from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { examsApi, gameApi, learningApi } from '../api/client'
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading } from '../components/Layout'

function LevelRing({ level, pct, exp, title }: { level: number; pct: number; exp: number; title: string }) {
  const r = 58
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <div className="relative flex h-[156px] w-[156px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#58EB04" />
            <stop offset="70%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(42,53,67,0.65)" strokeWidth="9" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`}
          style={{ filter: 'drop-shadow(0 0 7px rgba(88,235,4,0.45))', transition: 'stroke-dasharray .7s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-steel-500">LEVEL</div>
        <div className="mt-0.5 text-4xl font-bold leading-none tracking-tight text-text-primary">{level}</div>
        <div className="mt-1.5 max-w-[92px] truncate text-xs text-neon">{title}</div>
        <div className="mt-1 font-mono text-[11px] text-steel-500">{exp} EXP</div>
      </div>
    </div>
  )
}

const QUICK = [
  {
    to: '/learning', icon: BookOpen, no: '01', title: '知识课堂', en: 'KNOWLEDGE',
    desc: '按章节读完核心概念、语法与示例，学完直接进入练习。',
    ring: 'group-hover:border-learn/45', iconCls: 'border-learn/30 bg-learn/10 text-learn',
    glow: 'from-learn/45', link: '浏览知识体系',
  },
  {
    to: '/practice/setup', icon: Dumbbell, no: '02', title: '编程练习', en: 'PRACTICE',
    desc: '自选题库、知识点与难度，代码题带补全、AI 提示与运行区。',
    ring: 'group-hover:border-progress/45', iconCls: 'border-progress/30 bg-progress/10 text-progress',
    glow: 'from-progress/45', link: '配置一次练习',
  },
  {
    to: '/exams', icon: ClipboardList, no: '03', title: '模拟考试', en: 'EXAM',
    desc: '服务端组卷与封存答案，交卷后逐题对照解析。',
    ring: 'group-hover:border-challenge/45', iconCls: 'border-challenge/30 bg-challenge/10 text-challenge',
    glow: 'from-challenge/45', link: '进入考试中心',
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastExam, setLastExam] = useState<any>(null)
  const [map, setMap] = useState<any>(null)
  const [dailyTasks, setDailyTasks] = useState<any[]>([])
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    learningApi.dashboard().then((r) => setData(r.data)).finally(() => setLoading(false))
    examsApi.history().then((r) => setLastExam(r.data[0] || null)).catch(() => {})
    gameApi.profile().then((r) => setDailyTasks(r.data.daily_tasks || [])).catch(() => {})
    gameApi.map().then((r) => setMap(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || !chartRef.current || !data.trend.length) return
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 38, right: 14, top: 24, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#141c25',
        borderColor: '#2A3543',
        textStyle: { color: '#E8EDF4', fontSize: 14 },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.axisValue}<br/><b style="color:#58EB04">${p.value}%</b> 正确率`
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.trend.map((t: any) => t.date),
        axisLine: { lineStyle: { color: '#2A3543' } },
        axisTick: { show: false },
        axisLabel: { color: '#7C8B9E', fontSize: 12 },
      },
      yAxis: {
        type: 'value', min: 0, max: 100,
        splitLine: { lineStyle: { color: 'rgba(42,53,67,0.5)', type: 'dashed' } },
        axisLabel: { color: '#7C8B9E', fontSize: 12, formatter: '{value}%' },
      },
      series: [{
        name: '正确率', type: 'line', smooth: true, symbol: 'circle', symbolSize: 7,
        data: data.trend.map((t: any) => t.value),
        lineStyle: { color: '#58EB04', width: 2.5, shadowColor: 'rgba(88,235,4,0.45)', shadowBlur: 12 },
        itemStyle: { color: '#0E141A', borderColor: '#58EB04', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(88,235,4,0.24)' },
              { offset: 0.6, color: 'rgba(45,212,191,0.08)' },
              { offset: 1, color: 'rgba(45,212,191,0)' },
            ],
          },
        },
      }],
    })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); chart.dispose() }
  }, [data])

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-ink-800/70" />
        <div className="h-[280px] animate-pulse rounded-2xl border border-ink-700/50 bg-ink-850/50" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-ink-700/50 bg-ink-850/40" />)}
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="panel p-8 text-sm text-danger-soft">数据加载失败，请确认后端服务已启动后刷新重试。</div>
  }

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
  const chapters: any[] = map?.chapters || []
  const currentChapter = chapters.find((c) => c.unlocked && !c.challenge_passed) || chapters[0]
  const passed = map?.total_passed_challenges ?? 0
  const level = map?.level || {
    level: Math.floor((data.user.exp || 0) / 200) + 1,
    title: '见习学员',
    exp: data.user.exp || 0,
    progress_pct: ((data.user.exp || 0) % 200) / 2,
  }
  const minutes = Math.round(data.user.total_study_seconds / 60)
  const nextChapterPct = currentChapter ? currentChapter.progress_pct : 0

  const metrics = [
    { label: '平均正确率', value: `${Math.round(data.avg_accuracy * 100)}%`, sub: '练习与考试综合', tone: 'text-neon' },
    { label: '知识点掌握', value: `${data.mastery_rate}%`, sub: `${data.studied_kp_count} / ${data.total_kp_count} 个知识点`, tone: 'text-learn' },
    { label: '累计完成练习', value: `${data.total_practice}`, sub: `${data.total_exam} 场模拟考试`, tone: 'text-progress' },
    { label: '待复习错题', value: `${data.wrong_count}`, sub: '来自真实作答记录', tone: data.wrong_count ? 'text-danger' : 'text-steel-300' },
  ]

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="DASHBOARD // 学习工作台"
        title={`${greeting}，${data.user.username}`}
        description="你的学习路径、正确率与下一步行动都在这里。数据来自每一次真实作答，不做虚构统计。"
        actions={
          <>
            <Button label="知识课堂" variant="secondary" icon={<BookOpen size={15} />} onClick={() => navigate('/learning')} />
            <Button label="开始练习" variant="primary" icon={<Play size={15} />} onClick={() => navigate('/practice/setup')} />
          </>
        }
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag-neon"><Flame size={12} className="mr-1" /> 连续 {data.user.streak_days} 天</span>
            <span className="tag"><Clock3 size={12} className="mr-1" /> {minutes} 分钟学习时长</span>
            <span className="tag"><Zap size={12} className="mr-1" /> {level.exp} EXP</span>
          </div>
        }
      />

      {/* 今日任务舱 */}
      <section className="hero-shell corner-frame">
        <div className="relative z-10 grid items-center gap-6 p-6 lg:grid-cols-[1.45fr_1fr] lg:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-neon/30 bg-neon/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-neon">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-neon" /> TODAY&apos;S MISSION
              </span>
              <span className="font-mono text-xs text-steel-500">
                {new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}
              </span>
            </div>

            <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-text-primary sm:text-3xl">
              {currentChapter && !currentChapter.challenge_passed ? (
                <>继续攻克 <span className="text-neon">{currentChapter.name}</span></>
              ) : chapters.length ? (
                <>全部章节已通关，<span className="text-neon">保持手感</span></>
              ) : (
                <>从第一个知识点，<span className="text-neon">建立你的学习地图</span></>
              )}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-steel-400">
              {currentChapter && !currentChapter.challenge_passed
                ? `本章已完成 ${currentChapter.completed_kps}/${currentChapter.total_kps} 个知识点，精通 ${currentChapter.mastered_kps} 个。完成学习后挑战正确率达到 70% 即可通关。`
                : '先读一个知识点，再做一组针对性练习。首页只保留下一步最需要做的事。'}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button label="开始今日练习" variant="primary" size="lg" icon={<Play size={16} />}
                onClick={() => navigate('/practice/setup')} />
              <Button label="继续学习" variant="ghost" size="lg" icon={<ArrowRight size={16} />}
                onClick={() => navigate(currentChapter ? `/learning?chapter=${currentChapter.id}` : '/learning')} />
              <Link to="/game/map" className="inline-flex items-center gap-1.5 px-2 text-sm text-steel-400 transition hover:text-ai">
                <Gamepad2 size={15} /> 打开闯关地图
              </Link>
            </div>

            {currentChapter && (
              <div className="mt-6 max-w-lg">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-steel-400">{currentChapter.code} · 章节进度</span>
                  <span className="font-mono text-neon">{Math.round(nextChapterPct)}%</span>
                </div>
                <ProgressBar value={nextChapterPct} />
                <div className="mt-2 flex items-center justify-between text-[11px] text-steel-500">
                  <span>已完成 {passed} / {chapters.length} 个章节挑战</span>
                  <span>{currentChapter.total_kps - currentChapter.completed_kps} 个知识点待完成</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-[330px] rounded-2xl border border-ink-700/60 bg-[#0a1016]/70 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <LevelRing level={level.level} pct={level.progress_pct} exp={level.exp} title={level.title} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="text-xs text-steel-500">距离下一级</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-text-primary">
                      {level.exp % 200}<span className="text-sm text-steel-500"> / 200</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-steel-500">
                      <span>章节通关</span><span>{passed}/{chapters.length || 12}</span>
                    </div>
                    <ProgressBar value={chapters.length ? (passed / chapters.length) * 100 : 0} tone="warning" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-steel-400">
                    <Flame size={13} className="text-danger" /> 连续学习 {data.user.streak_days} 天
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-700/50 pt-3 text-[11px] text-steel-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-neon" />学习终端在线</span>
                <span>EXP 由真实作答产生</span>
              </div>
            </div>
          </div>
        </div>

        {/* HUD 指标条 */}
        <div className="relative z-10 grid grid-cols-2 border-t border-ink-700/50 bg-[#070b0f]/45 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="metric">
              <span className="metric-label">{m.label}</span>
              <span className={`metric-value ${m.tone}`}>{m.value}</span>
              <span className="text-[11px] text-steel-500">{m.sub}</span>
            </div>
          ))}
        </div>
        <div className="hero-ghost">C//01</div>
      </section>

      {/* 三条主线 */}
      <section>
        <SectionHeading
          title="开始学习" en="STUDY MODES" hint="三条主线，互不打断"
          action={<span className="text-xs text-steel-500">先学 → 再练 → 后考</span>}
        />
        <div className="grid gap-3 md:grid-cols-3">
          {QUICK.map((q) => (
            <Link key={q.to} to={q.to}
              className={`group relative overflow-hidden rounded-2xl border border-ink-700/70 bg-gradient-to-b from-ink-850/90 to-ink-950/80 p-5 transition duration-300 hover:-translate-y-1 ${q.ring}`}>
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${q.glow} via-transparent to-transparent opacity-60`} />
              <div className="flex items-start justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${q.iconCls}`}>
                  <q.icon size={20} />
                </span>
                <span className="font-mono text-xs text-steel-600">{q.no} / {q.en}</span>
              </div>
              <div className="mt-4 text-lg font-semibold text-text-primary group-hover:text-white">{q.title}</div>
              <p className="mt-1.5 min-h-[44px] text-sm leading-6 text-steel-400">{q.desc}</p>
              <div className="mt-4 flex items-center justify-between border-t border-ink-700/50 pt-3 text-xs">
                <span className="text-steel-500">
                  {q.to === '/learning' ? `${data.studied_kp_count}/${data.total_kp_count} 已学习`
                    : q.to === '/practice/setup' ? `${data.total_practice} 次练习 · 正确率 ${Math.round(data.avg_accuracy * 100)}%`
                    : `${data.total_exam} 场考试`}
                </span>
                <span className="inline-flex items-center gap-1 text-steel-400 transition group-hover:text-neon">
                  {q.link} <ArrowUpRight size={13} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 学习路径 + 今日任务 */}
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section>
          <SectionHeading
            title="学习路径" en="LEARNING PATH" hint={`${chapters.length || 12} 个章节 · ${data.total_kp_count} 个知识点`}
            action={<Link to="/game/map" className="inline-flex items-center gap-1 text-sm text-neon hover:text-neon-soft">地图视图 <ChevronRight size={14} /></Link>}
          />
          <div className="panel overflow-hidden">
            {chapters.length ? chapters.slice(0, 5).map((ch: any, i: number) => {
              const isCurrent = currentChapter?.id === ch.id
              const status = ch.challenge_passed ? '已通关' : ch.unlocked ? (isCurrent ? '进行中' : '待挑战') : '未解锁'
              return (
                <Link key={ch.id} to={`/learning?chapter=${ch.id}`}
                  className={`group grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-ink-700/40 px-5 py-4 transition last:border-b-0 hover:bg-ink-800/40 ${isCurrent ? 'bg-neon/[0.035]' : ''}`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg border font-mono text-sm ${
                    ch.challenge_passed ? 'border-challenge/40 bg-challenge/10 text-challenge'
                    : ch.unlocked ? 'border-neon/40 bg-neon/10 text-neon' : 'border-ink-700 text-steel-600'
                  }`}>
                    {ch.challenge_passed ? <Check size={17} /> : ch.unlocked ? String(i + 1).padStart(2, '0') : <Lock size={15} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary group-hover:text-white">{ch.name}</span>
                      {isCurrent && <span className="rounded border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[10px] text-neon">当前</span>}
                      <span className="font-mono text-[11px] text-steel-600">{ch.code}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="max-w-[280px] flex-1"><ProgressBar value={ch.progress_pct} tone={ch.challenge_passed ? 'warning' : 'accent'} /></div>
                      <span className="shrink-0 text-xs text-steel-500">{ch.completed_kps}/{ch.total_kps} 知识点</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs ${ch.challenge_passed ? 'text-challenge' : ch.unlocked ? 'text-neon' : 'text-steel-600'}`}>{status}</div>
                    <div className="mt-1 font-mono text-[11px] text-steel-500">{ch.progress_pct}%</div>
                  </div>
                </Link>
              )
            }) : (
              <EmptyState text="还没有章节数据" hint="请确认题库种子数据已导入" />
            )}
          </div>
        </section>

        <div className="space-y-5">
          <Panel title="今日任务" hint="完成任务获得 EXP" action={<Link to="/game/map"><Flame size={15} className="text-challenge" /></Link>}>
            {dailyTasks.length ? (
              <div className="space-y-4">
                {dailyTasks.map((t) => (
                  <div key={t.code}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className={`flex items-center gap-1.5 ${t.completed ? 'text-neon' : 'text-steel-300'}`}>
                        {t.completed ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full border border-steel-500" />}
                        {t.title}
                      </span>
                      <span className="font-mono text-[11px] text-steel-500">{t.progress}/{t.target} · +{t.exp_reward}</span>
                    </div>
                    <ProgressBar value={(t.progress / t.target) * 100} tone={t.completed ? 'success' : 'accent'} />
                  </div>
                ))}
                <div className="rounded-lg border border-ink-700/50 bg-ink-900/40 px-3 py-2.5 text-xs leading-5 text-steel-500">
                  <Sparkles size={12} className="mr-1 inline text-ai" />
                  今日已完成 {dailyTasks.filter((t) => t.completed).length}/{dailyTasks.length} 项。任务进度每天 0 点重置。
                </div>
              </div>
            ) : <EmptyState text="今日任务加载中" hint="稍后刷新即可" />}
          </Panel>

          <Panel title="最近一次考试" action={<Link to="/archive" className="text-xs text-steel-500 hover:text-neon">全部记录</Link>}>
            {lastExam ? (
              <Link to={`/exams/result/${lastExam.id}`} className="group block">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary group-hover:text-white">{lastExam.paper_name}</div>
                    <div className="mt-1.5 text-xs text-steel-500">
                      {new Date(lastExam.submitted_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} · 答对 {lastExam.correct_count} 题
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-neon">
                      <Activity size={12} /> 正确率 {Math.round(lastExam.accuracy * 100)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-4xl font-bold leading-none text-challenge">{lastExam.obtained_score}</div>
                    <div className="mt-1 text-xs text-steel-500">/ {lastExam.total_score} 分</div>
                  </div>
                </div>
              </Link>
            ) : (
              <EmptyState text="还没有考试记录" hint="完成一次模拟考试后，这里会显示成绩" icon={<ClipboardList size={18} />}
                action={<Button label="进入考试中心" variant="secondary" size="sm" icon={<ArrowRight size={13} />} onClick={() => navigate('/exams')} />} />
            )}
          </Panel>
        </div>
      </div>

      {/* 趋势 + 最近记录 */}
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="正确率趋势" hint="最近 12 次练习与考试" action={<span className="inline-flex items-center gap-1.5 text-xs text-steel-500"><TrendingUp size={13} className="text-neon" /> 实时计算</span>}>
          {data.trend.length ? (
            <div ref={chartRef} className="h-[260px] w-full" />
          ) : (
            <EmptyState text="完成第一次练习后，这里会显示正确率趋势" hint="趋势只统计已提交的记录" icon={<Activity size={18} />} />
          )}
        </Panel>

        <Panel title="最近学习记录" action={<Link to="/archive" className="text-xs text-steel-500 hover:text-neon">学习档案</Link>}>
          {data.recent_records.length ? (
            <div className="space-y-1">
              {data.recent_records.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-ink-800/40">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      r.type === 'practice' ? 'border-progress/30 bg-progress/10 text-progress'
                      : r.type === 'exam' ? 'border-challenge/30 bg-challenge/10 text-challenge'
                      : r.type === 'chapter_challenge' ? 'border-ai/30 bg-ai/10 text-ai'
                      : 'border-learn/30 bg-learn/10 text-learn'
                    }`}>
                      {r.type === 'practice' ? <Dumbbell size={13} /> : r.type === 'exam' ? <ClipboardList size={13} /> : r.type === 'chapter_challenge' ? <Target size={13} /> : <BookOpen size={13} />}
                    </span>
                    <span className="truncate text-sm text-steel-300">
                      {r.type === 'kp_study' ? '学习知识点' : r.type === 'practice' ? '完成一次练习' : r.type === 'chapter_challenge' ? '通过章节挑战' : '完成一次考试'}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-steel-500">
                    {new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : <EmptyState text="还没有学习记录" hint="从知识课堂或一次练习开始" icon={<BookOpen size={18} />} />}
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/40 pt-4 text-xs text-steel-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-neon" /> 数据已同步至学习数据库</span>
        <span className="font-mono">C LEARNING OS · STANDARD C11</span>
      </div>
    </div>
  )
}
