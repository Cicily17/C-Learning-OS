import { Heading } from '@astryxdesign/core/Heading'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, RotateCcw, ArrowRight, ListChecks } from 'lucide-react'
import { practiceApi } from '../api/client'
import { AnswerText } from '../components/AnswerText'
import { Panel } from '../components/Layout'
import AnswerReview from '../components/AnswerReview'

export default function PracticeResult() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    if (id) practiceApi.result(id).then((r) => setData(r.data)).catch(() => {})
  }, [id])

  if (!data) return <div className="panel p-8 text-xs text-steel-400">正在生成练习结果...</div>

  const acc = Math.round(data.accuracy * 100)

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-xs tracking-[0.18em] text-neon-dim">PRACTICE RESULT / 练习结果</div>
        <Heading level={1}>本次练习已完成</Heading>
        <p className="mt-1 text-xs text-steel-400">提交于 {new Date(data.submitted_at).toLocaleString('zh-CN')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel p-4"><div className="text-xs text-steel-500">总题数</div><div className="mt-2 text-xl text-text-primary">{data.total_count}</div></div>
        <div className="panel p-4"><div className="text-xs text-steel-500">答对</div><div className="mt-2 text-xl text-neon">{data.correct_count}</div></div>
        <div className="panel p-4"><div className="text-xs text-steel-500">正确率</div><div className="mt-2 text-xl text-neon">{acc}%</div></div>
        <div className="panel p-4"><div className="text-xs text-steel-500">答错</div><div className="mt-2 text-xl text-red-300">{data.total_count - data.correct_count}</div></div>
      </div>

      <Panel title="答题订正 · 一题一题对照" action={
        <Link to="/practice/setup" className="btn-ghost text-xs"><RotateCcw size={13} /> 再练一次</Link>
      }>
        <AnswerReview items={data.items} />
      </Panel>

      <Panel title="逐题解析列表" action={
        <button className="text-xs text-steel-400 hover:text-neon" onClick={() => setShowList((v) => !v)}>
          <ListChecks size={13} className="mr-1 inline" />
          {showList ? '收起列表' : `展开全部 ${data.items.length} 题`}
        </button>
      }>
        {showList ? (
          <div className="space-y-3">
          {data.items.map((item: any, i: number) => (
            <div key={item.id} className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  {item.is_correct
                    ? <span className="flex items-center gap-1 text-neon"><CheckCircle2 size={15} /> 第 {i + 1} 题 · 正确</span>
                    : <span className="flex items-center gap-1 text-red-300"><XCircle size={15} /> 第 {i + 1} 题 · 错误</span>}
                  <span className="tag">{item.knowledge_point_name}</span>
                  <span className="tag">{item.question_type}</span>
                </div>
                <span className="font-mono text-xs text-steel-500">{item.question_id}</span>
              </div>
              <div className="mb-3 whitespace-pre-wrap text-xs leading-6 text-text-primary">{item.question_content}</div>
              {item.code_content && <pre className="code-block mb-3">{item.code_content}</pre>}
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded border border-ink-700/50 bg-ink-950/50 p-2.5">
                  <div className="mb-1 text-steel-500">你的答案</div>
                  <AnswerText answer={item.user_answer} type={item.question_type}
                    tone={item.is_correct ? 'neon' : 'danger'} caption="你的作答 · C11" />
                </div>
                <div className="rounded border border-neon/20 bg-neon/5 p-2.5">
                  <div className="mb-1 text-steel-500">正确答案</div>
                  <AnswerText answer={item.correct_answer} type={item.question_type} caption="参考答案 · C11" />
                </div>
              </div>
              <div className="mt-3 rounded border border-ink-700/50 bg-ink-950/40 p-3 text-xs leading-6 text-steel-400">
                <span className="mr-2 text-neon">解析：</span>{item.explanation}
              </div>
            </div>
          ))}
          </div>
        ) : (
          <p className="text-xs leading-6 text-steel-500">
            列表默认收起。上方「答题订正」可以一题一题对照答案与解析；需要通读全部解析时再展开。
          </p>
        )}
      </Panel>

      <div className="flex justify-center gap-3">
        <Link to="/archive" className="btn-ghost">查看学习档案 <ArrowRight size={14} /></Link>
        <Link to="/" className="btn-primary">返回工作台</Link>
      </div>
    </div>
  )
}
