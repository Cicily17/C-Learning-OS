import { Heading } from '@astryxdesign/core/Heading'
import { Construction, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ComingSoon({ module, phase }: { module: string; phase: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="panel max-w-lg p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-neon/30 bg-neon/5">
          <Construction size={24} className="text-neon" />
        </div>
        <div className="mb-2 text-xs tracking-[0.18em] text-neon-dim">{phase} / 后续里程碑</div>
        <Heading level={1}>{module}</Heading>
        <p className="mb-6 text-xs leading-7 text-steel-400">
          该模块属于后续开发阶段，当前交付范围为 M0 + M1 + M2：技术底座、知识学习中心与智能练习中心。
          这里不会用静态假数据伪装成已完成功能。
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/" className="btn-ghost">返回工作台</Link>
          <Link to="/practice/setup" className="btn-primary">先去练习 <ArrowRight size={14} /></Link>
        </div>
      </div>
    </div>
  )
}
