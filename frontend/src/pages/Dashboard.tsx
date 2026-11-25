import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as echarts from 'echarts'
import {
  Activity, Award, BookOpen, Clock3, Flame, Target, TrendingUp,
  AlertTriangle, ArrowRight, Dumbbell, CircleCheck, ClipboardList, Gamepad2,
} from 'lucide-react'
import { examsApi, gameApi, learningApi } from '../api/client'
import { EmptyState, Panel, ProgressBar } from '../components/Layout'

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastExam, setLastExam] = useState<any>(null)
  const [dailyTasks, setDailyTasks] = useState<any[]>([])
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    learningApi.dashboard().then((r) => setData(r.data)).finally(() => setLoading(false))
    examsApi.history().then((r) => setLastExam(r.data[0] || null)).catch(() => {})
    gameApi.profile().then((r) => setDailyTasks(r.data.daily_tasks || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || !chartRef.current) return
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 34, right: 16, top: 20, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#19212B',
        borderColor: '#2A3543',
        textStyle: { color: '#E8EDF4', fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: data.trend.map((t: any) => t.date),
        axisLine: { lineStyle: { color: '#2A3543' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
      },
      yAxis: {
        type: 'value', min: 0, max: 100,
        splitLine: { lineStyle: { color: 'rgba(42,53,67,0.55)' } },
        axisLabel: { color: '#64748B', fontSize: 11, formatter: '{value}%' },
      },
      series: [{
        name: '正确率', type: 'line', smooth: true, symbolSize: 7,
        data: data.trend.map((t: any) => t.value),
        lineStyle: { color: '#58EB04', width: 2.5, shadowColor: 'rgba(88,235,4,0.5)', shadowBlur: 10 },
        itemStyle: { color: '#2DD4BF', borderColor: '#58EB04', borderWidth: 1.5 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(88,235,4,0.28)' },
              { offset: 0.55, color: 'rgba(45,212,191,0.12)' },
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

  if (loading) return <div className="panel p-8 text-[13px] text-steel-400">正在读取学习数据...</div>
  if (!data) return <div className="panel p-8 text-[13px] text-red-300">数据加载失败，请刷新重试。</div>

  // 每张数据卡按功能语义分配独立强调色（Astryx 语义分色）
  const stats = [
    { label: '当前等级', value: `Lv.${data.user.level}`, sub: `${data.user.exp} EXP`, icon: Award, c: 'text-challenge', b: 'border-challenge/30', bg: 'bg-challenge/10', bar: 'bg-challenge' },
    { label: '累计学习时长', value: `${Math.round(data.user.total_study_seconds / 60)}`, sub: '分钟', icon: Clock3, c: 'text-learn', b: 'border-learn/30', bg: 'bg-learn/10', bar: 'bg-learn' },
    { label: '累计完成题目', value: data.total_practice, sub: '套练习', icon: Dumbbell, c: 'text-neon', b: 'border-neon/30', bg: 'bg-neon/10', bar: 'bg-neon' },
    { label: '连续学习天数', value: data.user.streak_days, sub: '天', icon: Flame, c: 'text-danger', b: 'border-danger/30', bg: 'bg-danger/10', bar: 'bg-danger' },
    { label: '知识点掌握率', value: `${data.mastery_rate}%`, sub: `${data.studied_kp_count}/${data.total_kp_count}`, icon: Target, c: 'text-progress', b: 'border-progress/30', bg: 'bg-progress/10', bar: 'bg-progress' },
    { label: '平均正确率', value: `${Math.round(data.avg_accuracy * 100)}%`, sub: '练习与考试', icon: Activity, c: 'text-learn', b: 'border-learn/30', bg: 'bg-learn/10', bar: 'bg-learn' },
    { label: '待复习错题', value: data.wrong_count, sub: '道', icon: AlertTriangle, c: 'text-danger', b: 'border-danger/30', bg: 'bg-danger/10', bar: 'bg-danger' },
    { label: '历史考试', value: data.total_exam, sub: '场', icon: BookOpen, c: 'text-ai', b: 'border-ai/30', bg: 'bg-ai/10', bar: 'bg-ai' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">DASHBOARD / 学习工作台</div>
          <h1 className="text-[22px] text-[#F1F5F9]">欢迎回来，{data.user.username}</h1>
          <p className="mt-1 text-[12px] text-steel-400">这里是你的学习状态总览，所有数据来自真实学习记录。</p>
        </div>
        <Link to="/practice/setup" className="btn-primary">
          开始今日练习 <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`panel overflow-hidden p-4 ${s.b}`}>
            <span className={`accent-bar ${s.bar}`} />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] text-steel-500">{s.label}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${s.b} ${s.bg}`}>
                <s.icon size={15} className={s.c} />
              </span>
            </div>
            <div className={`text-[23px] font-semibold leading-none tracking-tight ${s.c}`}>{s.value}</div>
            <div className="mt-1.5 text-[11px] text-steel-500">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="正确率趋势" action={<span className="text-[11px] text-steel-500">最近 {data.trend.length} 次记录</span>}>
          {data.trend.length ? (
            <div ref={chartRef} className="h-64 w-full" />
          ) : (
            <EmptyState text="完成第一次练习后，这里会显示正确率趋势" />
          )}
        </Panel>
        <Panel title="学习进度" action={<Link to="/learning" className="text-[11px] text-neon hover:underline">查看知识点</Link>}>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-[12px]">
                <span className="text-steel-400">知识点覆盖率</span>
                <span className="text-neon">{data.mastery_rate}%</span>
              </div>
              <ProgressBar value={data.mastery_rate} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3">
                <div className="text-[11px] text-steel-500">已完成练习</div>
                <div className="mt-1 text-[19px] text-[#E8EDF4]">{data.total_practice}</div>
              </div>
              <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3">
                <div className="text-[11px] text-steel-500">待复习错题</div>
                <div className="mt-1 text-[19px] text-[#E8EDF4]">{data.wrong_count}</div>
              </div>
            </div>
            <div className="border-t border-ink-700/50 pt-3">
              <div className="mb-2 text-[12px] text-steel-400">快捷入口</div>
              <div className="flex flex-wrap gap-2">
                <Link to="/learning" className="btn-ghost text-[12px]">知识学习</Link>
                <Link to="/exams" className="btn-ghost text-[12px]">模拟考试</Link>
                <Link to="/game/map" className="btn-ghost text-[12px]">闯关地图</Link>
                <Link to="/ai" className="btn-ghost text-[12px]">AI 助手</Link>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="最近一次考试成绩" action={<Link to="/archive" className="text-[11px] text-neon hover:underline">全部记录</Link>}>
          {lastExam ? (
            <div className="flex items-center justify-between rounded-lg border border-neon/20 bg-neon/5 p-4">
              <div>
                <div className="text-[13px] text-[#E8EDF4]">{lastExam.paper_name}</div>
                <div className="mt-1 text-[11px] text-steel-500">
                  {new Date(lastExam.submitted_at).toLocaleString('zh-CN')} · 答对 {lastExam.correct_count} 题
                </div>
              </div>
              <div className="text-right">
                <div className="text-[24px] text-neon">{lastExam.obtained_score}<span className="text-[12px] text-steel-500">/{lastExam.total_score}</span></div>
                <div className="text-[11px] text-steel-500">正确率 {Math.round(lastExam.accuracy * 100)}%</div>
              </div>
            </div>
          ) : (
            <EmptyState text="还没有考试记录，前往模拟考试中心开始第一场考试" />
          )}
          <Link to="/exams" className="btn-ghost mt-3 w-full text-[12px]"><ClipboardList size={13} /> 进入模拟考试</Link>
        </Panel>

        <Panel title="今日学习任务" action={<Link to="/game/map" className="text-[11px] text-neon hover:underline">闯关地图</Link>}>
          {dailyTasks.length ? (
            <div className="space-y-3">
              {dailyTasks.map((t) => (
                <div key={t.code}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={t.completed ? 'text-neon' : 'text-[#CBD5E1]'}>{t.title}</span>
                    <span className="text-steel-500">{t.progress}/{t.target} · +{t.exp_reward} EXP</span>
                  </div>
                  <ProgressBar value={(t.progress / t.target) * 100} />
                </div>
              ))}
            </div>
          ) : <EmptyState text="今日任务加载中或暂未配置" />}
          <Link to="/game/map" className="btn-ghost mt-3 w-full text-[12px]"><Gamepad2 size={13} /> 查看等级与成就</Link>
        </Panel>
      </div>

      <Panel title="最近学习记录">
        {data.recent_records.length ? (
          <div className="space-y-2">
            {data.recent_records.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-ink-700/50 bg-ink-900/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12px] text-[#CBD5E1]">
                  <CircleCheck size={14} className="text-neon-dim" />
                  {r.type === 'kp_study' ? '学习知识点' : r.type === 'practice' ? '完成一次练习' : '完成一次考试'}
                </div>
                <span className="text-[11px] text-steel-500">
                  {new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        ) : <EmptyState text="还没有学习记录，先从知识学习或练习开始吧" />}
      </Panel>

      <div className="text-center text-[11px] text-steel-600">
        <TrendingUp size={12} className="mr-1 inline" />
        全部核心模块已开放 · 数据持久化至 PostgreSQL · 考试答案由服务端封存与判分
      </div>
    </div>
  )
}
