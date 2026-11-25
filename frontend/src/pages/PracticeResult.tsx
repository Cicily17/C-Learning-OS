import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, RotateCcw, ArrowRight } from 'lucide-react'
import { practiceApi } from '../api/client'
import { Panel } from '../components/Layout'

export default function PracticeResult() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (id) practiceApi.result(id).then((r) => setData(r.data)).catch(() => {})
  }, [id])

  if (!data) return <div className="panel p-8 text-[13px] text-steel-400">正在生成练习结果...</div>

  const acc = Math.round(data.accuracy * 100)

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[11px] tracking-[0.18em] text-neon-dim">PRACTICE RESULT / 练习结果</div>
        <h1 className="text-[22px] text-[#F1F5F9]">本次练习已完成</h1>
        <p className="mt-1 text-[12px] text-steel-400">提交于 {new Date(data.submitted_at).toLocaleString('zh-CN')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel p-4"><div className="text-[11px] text-steel-500">总题数</div><div className="mt-2 text-[24px] text-[#F1F5F9]">{data.total_count}</div></div>
        <div className="panel p-4"><div className="text-[11px] text-steel-500">答对</div><div className="mt-2 text-[24px] text-neon">{data.correct_count}</div></div>
        <div className="panel p-4"><div className="text-[11px] text-steel-500">正确率</div><div className="mt-2 text-[24px] text-neon">{acc}%</div></div>
        <div className="panel p-4"><div className="text-[11px] text-steel-500">答错</div><div className="mt-2 text-[24px] text-red-300">{data.total_count - data.correct_count}</div></div>
      </div>

      <Panel title="逐题解析" action={<Link to="/practice/setup" className="btn-ghost text-[11px]"><RotateCcw size={13} /> 再练一次</Link>}>
        <div className="space-y-3">
          {data.items.map((item: any, i: number) => (
            <div key={item.id} className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                  {item.is_correct
                    ? <span className="flex items-center gap-1 text-neon"><CheckCircle2 size={15} /> 第 {i + 1} 题 · 正确</span>
                    : <span className="flex items-center gap-1 text-red-300"><XCircle size={15} /> 第 {i + 1} 题 · 错误</span>}
                  <span className="tag">{item.knowledge_point_name}</span>
                  <span className="tag">{item.question_type}</span>
                </div>
                <span className="font-mono text-[10px] text-steel-500">{item.question_id}</span>
              </div>
              <div className="mb-3 whitespace-pre-wrap text-[13px] leading-6 text-[#E8EDF4]">{item.question_content}</div>
              {item.code_content && <pre className="code-block mb-3">{item.code_content}</pre>}
              <div className="grid gap-2 text-[12px] sm:grid-cols-2">
                <div className="rounded border border-ink-700/50 bg-ink-950/50 p-2.5">
                  <span className="text-steel-500">你的答案：</span>
                  <span className={item.is_correct ? 'text-neon' : 'text-red-300'}>{item.user_answer || '（未作答）'}</span>
                </div>
                <div className="rounded border border-neon/20 bg-neon/5 p-2.5">
                  <span className="text-steel-500">正确答案：</span><span className="text-neon">{item.correct_answer}</span>
                </div>
              </div>
              <div className="mt-3 rounded border border-ink-700/50 bg-ink-950/40 p-3 text-[12px] leading-6 text-[#94A3B8]">
                <span className="mr-2 text-neon">解析：</span>{item.explanation}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex justify-center gap-3">
        <Link to="/archive" className="btn-ghost">查看学习档案 <ArrowRight size={14} /></Link>
        <Link to="/" className="btn-primary">返回工作台</Link>
      </div>
    </div>
  )
}
