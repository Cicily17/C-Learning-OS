import { Heading } from '@astryxdesign/core/Heading'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, ChevronLeft, Trophy, Target, Clock, Lightbulb, AlertTriangle, ListChecks } from 'lucide-react'
import { examsApi } from '../api/client'
import { AnswerText } from '../components/AnswerText'
import { EmptyState, Panel, ProgressBar, useToast } from '../components/Layout'
import AnswerReview from '../components/AnswerReview'
import type { ExamReport as Report, ScoreBucket } from '../types'

export default function ExamReport() {
  const { id } = useParams()
  const toast = useToast()
  const [report, setReport] = useState<Report | null>(null)
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    if (!id) return
    examsApi.result(id).then((r) => setReport(r.data)).catch((e) => toast(e.message, 'error'))
  }, [id])

  const exportReport = () => {
    if (!report) return
    const lines = [
      `C Learning OS 考试报告`,
      `考试：${report.paper_name}`,
      `分数：${report.obtained_score}/${report.total_score}`,
      `正确：${report.correct_count}/${report.total_count}`,
      `用时：${Math.floor(report.time_used_seconds / 60)} 分 ${report.time_used_seconds % 60} 秒`,
      '', '【知识点得分】',
      ...report.knowledge_point_scores.map((x) => `${x.name}: ${x.earned}/${x.max} (${Math.round(x.rate * 100)}%)`),
      '', '【题型得分】',
      ...report.question_type_scores.map((x) => `${x.name}: ${x.earned}/${x.max} (${Math.round(x.rate * 100)}%)`),
      '', '【复习建议】', ...report.suggestions.map((s, i) => `${i + 1}. ${s}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `C-Learning-OS-考试报告-${report.session_id.slice(0, 8)}.txt`; a.click()
    URL.revokeObjectURL(url)
    toast('报告已导出', 'success')
  }

  if (!report) return <div className="panel p-8 text-xs text-steel-400">正在加载考试报告...</div>

  const rate = report.total_score ? report.obtained_score / report.total_score : 0
  const ScoreBars = ({ items }: { items: ScoreBucket[] }) => (
    <div className="space-y-3">
      {items.map((x) => (
        <div key={x.key}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-steel-300">{x.name}</span>
            <span className={x.rate < 0.6 ? 'text-challenge' : 'text-neon'}>{x.earned}/{x.max} · {Math.round(x.rate * 100)}%</span>
          </div>
          <div className="progress-track">
            <div className={`h-full rounded-full transition-all duration-500 ${x.rate < 0.6 ? 'bg-challenge/70' : 'bg-gradient-to-r from-neon-dim to-neon'}`}
              style={{ width: `${Math.min(100, x.rate * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-xs tracking-[0.18em] text-neon-dim">EXAM REPORT / 考试报告</div>
          <Heading level={1}>{report.paper_name}</Heading>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportReport}><Download size={14} /> 导出报告</button>
          <Link className="btn-ghost" to="/archive"><ChevronLeft size={14} /> 返回档案</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-steel-500"><Trophy size={13} /> 最终分数</div>
          <div className="mt-2 text-2xl leading-none text-neon">{report.obtained_score}<span className="ml-1 text-xs text-steel-500">/ {report.total_score}</span></div>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-steel-500"><Target size={13} /> 正确率</div>
          <div className="mt-2 text-2xl leading-none text-neon">{Math.round((report.accuracy || rate) * 100)}<span className="text-sm">%</span></div>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-steel-500"><Clock size={13} /> 答题用时</div>
          <div className="mt-2 text-2xl leading-none text-text-primary">{Math.floor(report.time_used_seconds / 60)}<span className="ml-1 text-xs text-steel-500">分 {report.time_used_seconds % 60} 秒</span></div>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-xs text-steel-500"><AlertTriangle size={13} /> 待复习错题</div>
          <div className="mt-2 text-2xl leading-none text-challenge">{report.wrong_items.length}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="各知识点得分"><ScoreBars items={report.knowledge_point_scores} /></Panel>
        <Panel title="各题型得分"><ScoreBars items={report.question_type_scores} /></Panel>
      </div>

      <Panel title="复习建议" action={<Lightbulb size={14} className="text-neon" />}>
        <div className="space-y-2">
          {report.suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-neon/20 bg-neon/5 px-4 py-2.5 text-xs leading-6 text-steel-300">
              {i + 1}. {s}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="答案订正 · 一题一题对照" action={<span className="tag">默认只看错题</span>}>
        <AnswerReview
          items={report.items && report.items.length ? report.items : report.wrong_items}
          defaultFilter={report.items && report.items.length ? 'wrong' : 'all'}
          showFilter={!!(report.items && report.items.length)}
        />
      </Panel>

      <Panel title="错题与解析列表" action={
        <button className="text-xs text-steel-400 hover:text-neon" onClick={() => setShowList((v) => !v)}>
          <ListChecks size={13} className="mr-1 inline" />
          {showList ? '收起列表' : `展开全部 ${report.wrong_items.length} 道错题`}
        </button>
      }>
        {showList && (report.wrong_items.length ? (
          <div className="space-y-3">
            {report.wrong_items.map((w, i) => (
              <div key={i} className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="tag">{w.question_type}</span>
                  <span className="tag">{w.knowledge_point_name}</span>
                  <span className="tag">本题 {w.score} 分</span>
                </div>
                <div className="mb-2 whitespace-pre-wrap text-xs leading-6 text-text-primary">{w.question_content}</div>
                {w.code_content && <pre className="code-block mb-3">{w.code_content}</pre>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-red-500/25 bg-red-500/5 p-3 text-xs leading-6">
                    <div className="mb-1 text-xs text-red-300">你的答案</div>
                    <AnswerText answer={w.user_answer} type={w.question_type} tone="plain" caption="你的作答 · C11" />
                  </div>
                  <div className="rounded border border-neon/25 bg-neon/5 p-3 text-xs leading-6">
                    <div className="mb-1 text-xs text-neon">正确答案</div>
                    <AnswerText answer={w.correct_answer} type={w.question_type} caption="参考答案 · C11" />
                  </div>
                </div>
                <div className="mt-2 rounded border border-ink-700/50 p-3 text-xs leading-6 text-steel-400">
                  <span className="text-steel-500">解析：</span>{w.explanation}
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState text="本场考试没有错题，表现出色！" />)}
        {!showList && (
          <p className="text-xs leading-6 text-steel-500">
            列表默认收起。上方「答案订正」可按题翻看你的作答与正确答案；需要通读时可展开列表。
          </p>
        )}
      </Panel>
    </div>
  )
}
