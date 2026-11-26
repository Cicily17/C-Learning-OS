/** 答案展示：编程题/含代码的答案渲染成代码块，其余仍是普通文本。 */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useToast } from './Layout'

export function looksLikeCode(text?: string | null, type?: string | null): boolean {
  const raw = (text || '').trim()
  if (!raw) return false
  if (/#include\s*[<"]/.test(raw)) return true
  if (/\bint\s+main\s*\(/.test(raw)) return true
  if (type === '编程题' && /[;{}]/.test(raw) && /\b(return|printf|scanf|for|while)\b/.test(raw)) return true
  return false
}

export function AnswerCode({ code, caption = '参考程序 · C11' }: { code: string; caption?: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    toast('参考代码已复制', 'success')
    window.setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="mt-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel-500">{caption}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded border border-ink-600/60 px-1.5 py-0.5 text-[10px] text-steel-400 transition hover:border-neon/45 hover:text-neon"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="code-block max-h-[420px] !bg-[#04100b] !p-3 !text-[11px] !leading-5">{code.trim()}</pre>
    </div>
  )
}

export function AnswerText({
  answer, type, tone = 'neon', caption,
}: {
  answer?: string | null
  type?: string | null
  tone?: 'neon' | 'danger' | 'plain'
  caption?: string
}) {
  if (!answer) return <span className="text-steel-500">（未作答）</span>
  if (looksLikeCode(answer, type)) return <AnswerCode code={answer} caption={caption} />
  const color = tone === 'danger' ? 'text-red-300' : tone === 'neon' ? 'text-neon' : 'text-text-primary'
  return <span className={`whitespace-pre-wrap ${color}`}>{answer}</span>
}
