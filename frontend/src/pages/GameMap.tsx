import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Lock, Check, Star, Trophy, Flame, Zap, Flag, Target, Sparkles, ChevronRight,
} from 'lucide-react'
import { gameApi } from '../api/client'
import { EmptyState, Panel, ProgressBar, useToast } from '../components/Layout'
import type { GameChapter, GameLevel } from '../types'

const STATUS_STYLE: Record<string, { cls: string; icon: any; label: string }> = {
  locked: { cls: 'border-ink-700/60 bg-ink-900/50 text-steel-600', icon: Lock, label: '未解锁' },
  available: { cls: 'border-steel-500/50 bg-ink-800/60 text-[#c3d8cc]', icon: ChevronRight, label: '可学习' },
  in_progress: { cls: 'border-blue-400/50 bg-blue-400/10 text-blue-300', icon: Target, label: '进行中' },
  completed: { cls: 'border-neon/40 bg-neon/10 text-neon', icon: Check, label: '已完成' },
  mastered: { cls: 'border-amber-400/60 bg-amber-400/10 text-amber-300', icon: Star, label: '已精通' },
}

export default function GameMap() {
  const navigate = useNavigate()
  const toast = useToast()
  const [map, setMap] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [busyChapter, setBusyChapter] = useState('')

  const load = () => {
    gameApi.map().then((r) => setMap(r.data)).catch((e) => toast(e.message, 'error'))
    gameApi.profile().then((r) => setProfile(r.data)).catch((e) => toast(e.message, 'error'))
  }
  useEffect(load, [])

  const startChallenge = async (chapter: GameChapter) => {
    setBusyChapter(chapter.id)
    try {
      const r = await gameApi.startChallenge(chapter.id)
      toast(`${chapter.name}挑战开始：${r.data.question_count} 题，${r.data.pass_line}`, 'success')
      navigate(`/practice/session/${r.data.session_id}`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusyChapter('') }
  }

  if (!map || !profile) return <div className="panel p-8 text-[13px] text-steel-400">正在加载闯关地图...</div>

  const level = map.level
  const unlocked = profile.achievements?.filter((a: any) => a.unlocked) || []

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">GAME MAP / 游戏化闯关</div>
        <h1 className="text-[22px] text-[#e4f3e9]">C 语言学习地图</h1>
        <p className="mt-1 text-[12px] text-steel-400">
          完成知识点学习与章节挑战可获得经验值并解锁下一区域。所有奖励均由真实答题结果计算。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {map.chapters.map((chapter: GameChapter, ci: number) => (
            <section key={chapter.id} className={`panel overflow-hidden ${chapter.unlocked ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-[12px] ${
                    chapter.challenge_passed ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                    : chapter.unlocked ? 'border-neon/40 bg-neon/10 text-neon'
                    : 'border-ink-700 text-steel-600'
                  }`}>{String(ci + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="flex items-center gap-2 text-[13px] text-[#e4f3e9]">
                      {chapter.name}
                      {chapter.challenge_passed && <span className="tag-neon">挑战已通过</span>}
                      {!chapter.unlocked && <span className="tag"><Lock size={10} className="mr-1" />未解锁</span>}
                    </div>
                    <div className="mt-1 text-[11px] text-steel-500">
                      {chapter.code} · 已完成 {chapter.completed_kps}/{chapter.total_kps} 知识点 · 精通 {chapter.mastered_kps}
                    </div>
                  </div>
                </div>
                {chapter.challenge_available && (
                  <button className="btn-primary text-[11px]" disabled={busyChapter === chapter.id}
                    onClick={() => startChallenge(chapter)}>
                    <Flag size={13} /> {busyChapter === chapter.id ? '生成中...' : '开始章节挑战'}
                  </button>
                )}
              </div>
              <div className="p-4">
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-[10px] text-steel-500">
                    <span>章节进度</span><span>{chapter.progress_pct}%</span>
                  </div>
                  <ProgressBar value={chapter.progress_pct} />
                </div>
                <div className="relative flex flex-wrap gap-3">
                  {chapter.levels.map((lv: GameLevel, i: number) => {
                    const style = STATUS_STYLE[lv.status] || STATUS_STYLE.available
                    const Icon = style.icon
                    const content = (
                      <div className={`group relative flex w-[124px] flex-col items-center rounded-xl border px-2 py-3 text-center transition duration-300 hover:-translate-y-1 ${style.cls}`}
                        style={{ transitionDelay: `${i * 40}ms` }}>
                        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-current opacity-80">
                          <Icon size={15} />
                        </div>
                        <div className="text-[11px] leading-4">{lv.name}</div>
                        <div className="mt-1 font-mono text-[9px] opacity-60">{lv.code}</div>
                        {lv.status !== 'locked' && (
                          <div className="mt-2 h-1 w-12 overflow-hidden rounded-full bg-ink-700">
                            <div className="h-full rounded-full bg-neon" style={{ width: `${lv.progress_pct}%` }} />
                          </div>
                        )}
                      </div>
                    )
                    return lv.unlocked ? (
                      <Link key={lv.kp_id} to={`/learning/${chapter.id}/${lv.kp_id}`}>{content}</Link>
                    ) : <div key={lv.kp_id} title="完成前置关卡后解锁">{content}</div>
                  })}
                </div>
              </div>
            </section>
          ))}
          {!map.chapters.length && <EmptyState text="暂无章节数据" />}
        </div>

        <div className="space-y-4">
          <Panel title="指挥官档案">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon">
                <Trophy size={22} />
              </div>
              <div>
                <div className="text-[15px] text-[#e4f3e9]">Lv.{level.level} · {level.title}</div>
                <div className="text-[11px] text-steel-500">{level.exp} EXP · 连续学习 {profile.streak_days} 天</div>
              </div>
            </div>
            <div className="mb-1 flex justify-between text-[10px] text-steel-500">
              <span>距离下一级</span><span>{level.current_exp} / {level.next_exp}</span>
            </div>
            <ProgressBar value={level.progress_pct} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-ink-700/60 p-2">
                <div className="text-[16px] text-neon">{profile.stats.practice_count}</div><div className="text-[10px] text-steel-500">练习场次</div>
              </div>
              <div className="rounded-lg border border-ink-700/60 p-2">
                <div className="text-[16px] text-neon">{profile.stats.total_correct}</div><div className="text-[10px] text-steel-500">累计答对</div>
              </div>
              <div className="rounded-lg border border-ink-700/60 p-2">
                <div className="text-[16px] text-neon">{map.total_passed_challenges}</div><div className="text-[10px] text-steel-500">通关章节</div>
              </div>
            </div>
          </Panel>

          <Panel title="成就徽章" action={<span className="text-[11px] text-neon">{unlocked.length}/{profile.achievements.length}</span>}>
            <div className="grid grid-cols-2 gap-2">
              {profile.achievements.map((a: any) => (
                <div key={a.code} className={`rounded-lg border p-2.5 ${a.unlocked ? 'border-neon/30 bg-neon/5' : 'border-ink-700/50 bg-ink-900/30 opacity-50'}`}>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#d7e6dd]">
                    {a.unlocked ? <Sparkles size={12} className="text-neon" /> : <Lock size={11} />}{a.name}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-steel-500">{a.description}</div>
                  <div className="mt-1 text-[10px] text-neon">+{a.exp_reward} EXP</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="每日任务" action={<Flame size={14} className="text-amber-400" />}>
            <div className="space-y-3">
              {profile.daily_tasks.map((t: any) => (
                <div key={t.code}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={t.completed ? 'text-neon' : 'text-[#c3d8cc]'}>
                      {t.completed ? <Check size={11} className="mr-1 inline" /> : null}{t.title}
                    </span>
                    <span className="text-steel-500">{t.progress}/{t.target} · +{t.exp_reward}</span>
                  </div>
                  <ProgressBar value={(t.progress / t.target) * 100} />
                </div>
              ))}
            </div>
          </Panel>

          <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-3 text-[10px] leading-5 text-steel-500">
            <div className="mb-1 flex items-center gap-1.5 text-neon"><Zap size={12} /> 奖励规则</div>
            知识点掌握 +10 EXP，挑战通过 +30 EXP，考试 90 分以上 +40 EXP。经验值只由真实作答与学习记录产生。
          </div>
        </div>
      </div>
    </div>
  )
}
